import express from 'express';
import db from '../db.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// Update daily progress for a specific goal on a specific date
router.put('/:progressId', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { progressId } = req.params;
  const { completed, completionPercent, notes } = req.body;

  const progress = db.prepare(
    'SELECT * FROM daily_progress WHERE id = ? AND user_id = ?'
  ).get(progressId, userId);
  if (!progress) return res.status(404).json({ error: 'Progress entry not found' });

  db.prepare(
    'UPDATE daily_progress SET completed = ?, completion_percent = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(
    completed !== undefined ? completed : progress.completed,
    completionPercent !== undefined ? completionPercent : progress.completion_percent,
    notes !== undefined ? notes : progress.notes,
    progressId
  );

  const updated = db.prepare('SELECT * FROM daily_progress WHERE id = ?').get(progressId);
  res.json(updated);
});

// Get all progress for a month (for calendar view)
router.get('/month', requireAuth, (req, res) => {
  const { year, month } = req.query;
  const userId = req.session.userId;

  if (!year || !month) {
    return res.status(400).json({ error: 'year and month query params required' });
  }

  const startDate = `${year}-${month.padStart(2, '0')}-01`;
  const endDate = `${year}-${month.padStart(2, '0')}-31`;

  const rows = db.prepare(`
    SELECT dp.*, wg.title as goal_title, wg.unit, wg.weekly_target
    FROM daily_progress dp
    JOIN weekly_goals wg ON dp.goal_id = wg.id
    WHERE dp.user_id = ? AND dp.date >= ? AND dp.date <= ?
    ORDER BY dp.date
  `).all(userId, startDate, endDate);

  // Group by date and compute average completion per day
  const byDate = {};
  for (const row of rows) {
    if (!byDate[row.date]) {
      byDate[row.date] = { date: row.date, entries: [], avgCompletion: 0 };
    }
    byDate[row.date].entries.push(row);
  }

  // Calculate average completion for each day
  for (const date of Object.keys(byDate)) {
    const entries = byDate[date].entries;
    const sum = entries.reduce((s, e) => s + (e.completion_percent || 0), 0);
    byDate[date].avgCompletion = Math.round(sum / entries.length);
  }

  res.json(Object.values(byDate));
});

export default router;
