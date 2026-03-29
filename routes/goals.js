import express from 'express';
import db from '../db.js';

const router = express.Router();

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// Get Monday of the week for a given date
function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Create weekly goal + auto-generate daily progress entries
router.post('/', requireAuth, (req, res) => {
  const { title, description, weeklyTarget, unit, weekStart } = req.body;
  const userId = req.session.userId;

  if (!title || !weeklyTarget || !weekStart) {
    return res.status(400).json({ error: 'Title, weeklyTarget, and weekStart are required' });
  }

  const monday = getWeekStart(weekStart);
  const dailyTarget = Math.round((weeklyTarget / 7) * 100) / 100;

  try {
    const result = db.prepare(
      'INSERT INTO weekly_goals (user_id, week_start, title, description, weekly_target, unit) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, monday, title, description || '', weeklyTarget, unit || 'tasks');

    const goalId = result.lastInsertRowid;

    // Auto-create 7 daily progress entries
    const insertProgress = db.prepare(
      'INSERT OR IGNORE INTO daily_progress (user_id, goal_id, date, daily_target) VALUES (?, ?, ?, ?)'
    );

    const createDailyEntries = db.transaction(() => {
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        insertProgress.run(userId, goalId, dateStr, dailyTarget);
      }
    });
    createDailyEntries();

    res.json({ id: goalId, title, weeklyTarget, dailyTarget, weekStart: monday });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A goal with this title already exists for this week' });
    }
    throw err;
  }
});

// Get goals for a specific week
router.get('/', requireAuth, (req, res) => {
  const { weekStart } = req.query;
  const userId = req.session.userId;

  if (!weekStart) {
    return res.status(400).json({ error: 'weekStart query param required' });
  }

  const monday = getWeekStart(weekStart);
  const goals = db.prepare(
    'SELECT * FROM weekly_goals WHERE user_id = ? AND week_start = ?'
  ).all(userId, monday);

  // Attach daily progress to each goal
  const goalsWithProgress = goals.map((goal) => {
    const progress = db.prepare(
      'SELECT * FROM daily_progress WHERE goal_id = ? ORDER BY date'
    ).all(goal.id);
    return { ...goal, dailyProgress: progress };
  });

  res.json(goalsWithProgress);
});

// Delete a goal
router.delete('/:id', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const goalId = req.params.id;
  const goal = db.prepare('SELECT * FROM weekly_goals WHERE id = ? AND user_id = ?').get(goalId, userId);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  db.prepare('DELETE FROM weekly_goals WHERE id = ?').run(goalId);
  res.json({ ok: true });
});

export default router;
