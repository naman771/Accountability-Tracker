import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const router = express.Router();

// Security question labels
const SECURITY_QUESTIONS = {
  pet: 'What was the name of your first pet?',
  city: 'What city were you born in?',
  school: 'What was the name of your first school?',
  friend: 'What is the name of your childhood best friend?',
  food: 'What is your favourite food?',
  movie: 'What is your all-time favourite movie?',
};

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username, displayName: user.display_name });
});

// Register
router.post('/register', (req, res) => {
  const { username, password, displayName, securityQuestion, securityAnswer } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Username, password, and display name are required' });
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  }

  if (password.length < 3) {
    return res.status(400).json({ error: 'Password must be at least 3 characters' });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
  }

  if (!securityQuestion || !securityAnswer) {
    return res.status(400).json({ error: 'Security question and answer are required' });
  }

  if (!SECURITY_QUESTIONS[securityQuestion]) {
    return res.status(400).json({ error: 'Invalid security question' });
  }

  // Validate answer is lowercase
  const normalizedAnswer = securityAnswer.trim().toLowerCase();
  if (normalizedAnswer !== securityAnswer.trim()) {
    return res.status(400).json({ error: 'Security answer must be in lowercase letters only' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const answerHash = bcrypt.hashSync(normalizedAnswer, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password, display_name, security_question, security_answer) VALUES (?, ?, ?, ?, ?)'
  ).run(username, hash, displayName.trim(), securityQuestion, answerHash);

  req.session.userId = result.lastInsertRowid;
  console.log(`New user registered: ${username}`);
  res.json({ id: result.lastInsertRowid, username, displayName: displayName.trim() });
});

// Get security question for a username (for forgot password flow)
router.get('/security-question', (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const user = db.prepare('SELECT security_question FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).json({ error: 'Username not found' });
  }

  if (!user.security_question) {
    return res.status(400).json({ error: 'No security question set for this account. Contact an admin to reset your password.' });
  }

  const questionText = SECURITY_QUESTIONS[user.security_question] || 'Unknown question';
  res.json({ question: questionText, questionKey: user.security_question });
});

// Reset password using security question
router.post('/reset-password', (req, res) => {
  const { username, securityAnswer, newPassword } = req.body;
  if (!username || !securityAnswer || !newPassword) {
    return res.status(400).json({ error: 'Username, security answer, and new password are required' });
  }

  if (newPassword.length < 3) {
    return res.status(400).json({ error: 'New password must be at least 3 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).json({ error: 'Username not found' });
  }

  if (!user.security_answer) {
    return res.status(400).json({ error: 'No security question set for this account' });
  }

  const normalizedAnswer = securityAnswer.trim().toLowerCase();
  if (!bcrypt.compareSync(normalizedAnswer, user.security_answer)) {
    return res.status(401).json({ error: 'Incorrect security answer' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newHash, user.id);

  console.log(`Password reset for user: ${username}`);
  res.json({ ok: true, message: 'Password reset successfully. You can now sign in.' });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, displayName: user.display_name });
});

export default router;
