import express from 'express';
import db from '../db.js';

const router = express.Router();

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// Get Monday of the week for a given date
function toDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return toDateStr(d);
}

// Create weekly goal + auto-generate daily progress entries
router.post('/', requireAuth, (req, res) => {
  const { title, description, weeklyTarget, unit, weekStart, goalType, isPrivate } = req.body;
  const userId = req.session.userId;
  const type = goalType === 'daily' ? 'daily' : 'weekly';
  const privacyFlag = isPrivate ? 1 : 0;

  if (!title || !weeklyTarget || !weekStart) {
    return res.status(400).json({ error: 'Title, target, and weekStart are required' });
  }

  const monday = getWeekStart(weekStart);
  // For daily goals, the entered target IS the daily target
  // For weekly goals, divide by 7
  const dailyTarget = type === 'daily'
    ? Math.round(weeklyTarget * 100) / 100
    : Math.round((weeklyTarget / 7) * 100) / 100;

  try {
    const result = db.prepare(
      'INSERT INTO weekly_goals (user_id, week_start, title, description, weekly_target, unit, goal_type, is_private) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, monday, title, description || '', weeklyTarget, unit || 'tasks', type, privacyFlag);

    const goalId = result.lastInsertRowid;

    // Auto-create 7 daily progress entries
    const insertProgress = db.prepare(
      'INSERT OR IGNORE INTO daily_progress (user_id, goal_id, date, daily_target) VALUES (?, ?, ?, ?)'
    );

    const createDailyEntries = db.transaction(() => {
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday + 'T00:00:00');
        date.setDate(date.getDate() + i);
        const dateStr = toDateStr(date);
        insertProgress.run(userId, goalId, dateStr, dailyTarget);
      }
    });
    createDailyEntries();

    res.json({ id: goalId, title, weeklyTarget, dailyTarget, weekStart: monday, goalType: type, isPrivate: privacyFlag });
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

// Toggle privacy on a goal
router.put('/:id/privacy', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const goalId = req.params.id;
  const { isPrivate } = req.body;

  const goal = db.prepare('SELECT * FROM weekly_goals WHERE id = ? AND user_id = ?').get(goalId, userId);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  const privacyFlag = isPrivate ? 1 : 0;
  db.prepare('UPDATE weekly_goals SET is_private = ? WHERE id = ?').run(privacyFlag, goalId);
  res.json({ ok: true, isPrivate: privacyFlag });
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
