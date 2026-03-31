import express from 'express';
import db from '../db.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// Search users by username or display name (exclude self and existing friends)
router.get('/search', requireAuth, (req, res) => {
  const { q } = req.query;
  const userId = req.session.userId;

  if (!q || q.trim().length < 2) {
    return res.json([]);
  }

  const query = `%${q.trim()}%`;
  const users = db.prepare(`
    SELECT id, username, display_name FROM users
    WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)
    LIMIT 20
  `).all(userId, query, query);

  // Attach friendship status for each result
  const results = users.map(user => {
    const friendship = db.prepare(`
      SELECT id, status, requester_id FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `).get(userId, user.id, user.id, userId);

    let friendshipStatus = 'none';
    let friendshipId = null;
    if (friendship) {
      friendshipId = friendship.id;
      if (friendship.status === 'accepted') {
        friendshipStatus = 'friends';
      } else if (friendship.status === 'pending') {
        friendshipStatus = friendship.requester_id === userId ? 'request_sent' : 'request_received';
      }
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      friendshipStatus,
      friendshipId,
    };
  });

  res.json(results);
});

// List accepted friends
router.get('/', requireAuth, (req, res) => {
  const userId = req.session.userId;

  const friends = db.prepare(`
    SELECT u.id, u.username, u.display_name, f.id as friendship_id, f.created_at as friends_since
    FROM friendships f
    JOIN users u ON (
      CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END = u.id
    )
    WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
  `).all(userId, userId, userId);

  res.json(friends.map(f => ({
    id: f.id,
    username: f.username,
    displayName: f.display_name,
    friendshipId: f.friendship_id,
    friendsSince: f.friends_since,
  })));
});

// List pending incoming friend requests
router.get('/requests', requireAuth, (req, res) => {
  const userId = req.session.userId;

  const requests = db.prepare(`
    SELECT f.id as friendship_id, u.id as user_id, u.username, u.display_name, f.created_at
    FROM friendships f
    JOIN users u ON f.requester_id = u.id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId);

  res.json(requests.map(r => ({
    friendshipId: r.friendship_id,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    createdAt: r.created_at,
  })));
});

// Get count of pending incoming requests (for badge)
router.get('/requests/count', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM friendships
    WHERE addressee_id = ? AND status = 'pending'
  `).get(userId);
  res.json({ count: row.count });
});

// Send a friend request
router.post('/request', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { addresseeId } = req.body;

  if (!addresseeId || addresseeId === userId) {
    return res.status(400).json({ error: 'Invalid user' });
  }

  // Check target user exists
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(addresseeId);
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check for existing friendship in either direction
  const existing = db.prepare(`
    SELECT id, status FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(userId, addresseeId, addresseeId, userId);

  if (existing) {
    if (existing.status === 'accepted') {
      return res.status(409).json({ error: 'Already friends' });
    }
    if (existing.status === 'pending') {
      return res.status(409).json({ error: 'Friend request already pending' });
    }
    // If rejected, allow re-sending by updating the existing row
    db.prepare('UPDATE friendships SET requester_id = ?, addressee_id = ?, status = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(userId, addresseeId, 'pending', existing.id);
    return res.json({ ok: true, friendshipId: existing.id });
  }

  const result = db.prepare('INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)')
    .run(userId, addresseeId, 'pending');

  res.json({ ok: true, friendshipId: result.lastInsertRowid });
});

// Respond to a friend request (accept / reject)
router.post('/respond', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { friendshipId, action } = req.body;

  if (!friendshipId || !['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'friendshipId and action (accept/reject) required' });
  }

  const friendship = db.prepare('SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = ?')
    .get(friendshipId, userId, 'pending');

  if (!friendship) {
    return res.status(404).json({ error: 'Friend request not found' });
  }

  const newStatus = action === 'accept' ? 'accepted' : 'rejected';
  db.prepare('UPDATE friendships SET status = ? WHERE id = ?').run(newStatus, friendshipId);

  res.json({ ok: true, status: newStatus });
});

// Remove a friend
router.delete('/:friendshipId', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { friendshipId } = req.params;

  const friendship = db.prepare(`
    SELECT * FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)
  `).get(friendshipId, userId, userId);

  if (!friendship) {
    return res.status(404).json({ error: 'Friendship not found' });
  }

  db.prepare('DELETE FROM friendships WHERE id = ?').run(friendshipId);
  res.json({ ok: true });
});

export default router;
