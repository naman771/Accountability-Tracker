// ===== API Helpers =====
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ===== State =====
let currentUser = null;
let currentWeekStart = getMonday(new Date());
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-indexed

// ===== Date Helpers =====
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return toDateStr(date);
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function formatDateRange(mondayStr) {
  const mon = new Date(mondayStr + 'T00:00:00');
  const sun = new Date(mondayStr + 'T00:00:00');
  sun.setDate(sun.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${mon.toLocaleDateString('en-US', opts)} — ${sun.toLocaleDateString('en-US', opts)}, ${sun.getFullYear()}`;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function getColorClass(pct) {
  if (pct >= 75) return 'green';
  if (pct >= 40) return 'yellow';
  return 'red';
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentUser = await api('/auth/me');
    showDashboard();
  } catch {
    showLogin();
  }
  bindEvents();
});

// ===== View Toggle =====
function showLogin() {
  document.getElementById('login-view').style.display = 'flex';
  document.getElementById('dashboard-view').style.display = 'none';
}

function showDashboard() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('dashboard-view').style.display = 'block';
  document.getElementById('user-greeting').textContent = `Hey, ${currentUser.displayName} 👋`;
  loadWeekGoals();
  loadCalendar();
}

// ===== Event Bindings =====
function bindEvents() {
  // Login
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Logout
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Week nav
  document.getElementById('prev-week').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    loadWeekGoals();
  });
  document.getElementById('next-week').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    loadWeekGoals();
  });

  // Month nav
  document.getElementById('prev-month').addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    loadCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    loadCalendar();
  });

  // Goal modal
  document.getElementById('add-goal-btn').addEventListener('click', () => {
    document.getElementById('goal-modal').style.display = 'flex';
  });
  document.getElementById('close-goal-modal').addEventListener('click', () => {
    document.getElementById('goal-modal').style.display = 'none';
  });
  document.getElementById('goal-modal').querySelector('.modal-overlay').addEventListener('click', () => {
    document.getElementById('goal-modal').style.display = 'none';
  });

  // Goal form
  document.getElementById('goal-form').addEventListener('submit', handleCreateGoal);

  // Daily target preview
  document.getElementById('goal-target').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    const preview = document.getElementById('daily-preview');
    const previewVal = document.getElementById('daily-target-preview');
    if (val > 0) {
      const daily = Math.round((val / 7) * 100) / 100;
      const unit = document.getElementById('goal-unit').value || 'tasks';
      previewVal.textContent = `${daily} ${unit}/day`;
      preview.style.display = 'flex';
    } else {
      preview.style.display = 'none';
    }
  });

  // Progress modal close
  document.getElementById('close-progress-modal').addEventListener('click', () => {
    document.getElementById('progress-modal').style.display = 'none';
  });
  document.getElementById('progress-modal').querySelector('.modal-overlay').addEventListener('click', () => {
    document.getElementById('progress-modal').style.display = 'none';
  });
}

// ===== Auth Handlers =====
async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    currentUser = await api('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

async function handleLogout() {
  await api('/auth/logout', { method: 'POST' });
  currentUser = null;
  showLogin();
}

// ===== Goals =====
async function loadWeekGoals() {
  document.getElementById('week-label').textContent = formatDateRange(currentWeekStart);
  const container = document.getElementById('goals-list');
  container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const goals = await api(`/goals?weekStart=${currentWeekStart}`);
    if (goals.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📝</span>
          No goals for this week yet. Click <strong>+ New Goal</strong> to get started!
        </div>`;
      return;
    }

    container.innerHTML = goals.map(goal => renderGoalCard(goal)).join('');

    // Bind click on day cells for updating progress
    container.querySelectorAll('.day-cell[data-progress-id]').forEach(cell => {
      cell.addEventListener('click', () => {
        const date = cell.dataset.date;
        openProgressModal(date, goals);
      });
    });

    // Bind delete buttons
    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const goalId = btn.dataset.goalId;
        if (confirm('Delete this goal and all its progress?')) {
          await api(`/goals/${goalId}`, { method: 'DELETE' });
          loadWeekGoals();
          loadCalendar();
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:var(--red)">Failed to load goals: ${err.message}</div>`;
  }
}

function renderGoalCard(goal) {
  const dailyTarget = Math.round((goal.weekly_target / 7) * 100) / 100;
  const progress = goal.dailyProgress || [];

  const dayCells = DAY_NAMES.map((name, i) => {
    const entry = progress[i];
    if (!entry) return `<div class="day-cell"><span class="day-name">${name}</span><span class="day-percent">—</span></div>`;
    const pct = entry.completion_percent || 0;
    const color = pct > 0 ? getColorClass(pct) : '';
    return `
      <div class="day-cell ${color}" data-progress-id="${entry.id}" data-date="${entry.date}">
        <span class="day-name">${name}</span>
        <span class="day-percent">${pct}%</span>
        <span class="day-target">${dailyTarget} ${goal.unit}</span>
      </div>`;
  }).join('');

  return `
    <div class="goal-card">
      <div class="goal-header">
        <div>
          <div class="goal-title">${escapeHtml(goal.title)}</div>
          ${goal.description ? `<div class="goal-meta">${escapeHtml(goal.description)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span class="goal-target-badge">${goal.weekly_target} ${goal.unit}/week</span>
          <button class="btn-delete" data-goal-id="${goal.id}">✕</button>
        </div>
      </div>
      <div class="daily-breakdown">${dayCells}</div>
    </div>`;
}

// ===== Progress Modal =====
function openProgressModal(date, goals) {
  const modal = document.getElementById('progress-modal');
  const title = document.getElementById('progress-modal-title');
  const container = document.getElementById('progress-entries');

  const d = new Date(date + 'T00:00:00');
  title.textContent = `Progress — ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;

  // Find all progress entries for this date across all goals
  const entries = [];
  for (const goal of goals) {
    for (const p of goal.dailyProgress || []) {
      if (p.date === date) {
        entries.push({ ...p, goalTitle: goal.title, unit: goal.unit });
      }
    }
  }

  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-state">No goals tracked for this day.</div>';
    modal.style.display = 'flex';
    return;
  }

  container.innerHTML = entries.map(entry => {
    const pct = entry.completion_percent || 0;
    const color = pct > 0 ? getColorClass(pct) : 'red';
    return `
      <div class="progress-entry" data-progress-id="${entry.id}">
        <div class="progress-entry-header">
          <span class="progress-entry-title">${escapeHtml(entry.goalTitle)}</span>
          <span class="progress-entry-target">Target: ${entry.daily_target} ${entry.unit}</span>
        </div>
        <div class="progress-slider-row">
          <input type="range" class="progress-slider" min="0" max="100" value="${pct}" data-id="${entry.id}" />
          <span class="progress-value ${color}" data-value-for="${entry.id}">${pct}%</span>
        </div>
        <div class="progress-notes">
          <textarea placeholder="Notes (optional)..." data-notes-for="${entry.id}">${entry.notes || ''}</textarea>
        </div>
      </div>`;
  }).join('') + `
    <div class="progress-modal-actions">
      <button class="btn-ghost" id="cancel-progress">Cancel</button>
      <button class="btn-save" id="save-progress">Save Progress</button>
    </div>`;

  // Bind slider events
  container.querySelectorAll('.progress-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      const label = container.querySelector(`[data-value-for="${e.target.dataset.id}"]`);
      label.textContent = `${val}%`;
      label.className = `progress-value ${getColorClass(val)}`;
    });
  });

  // Cancel
  container.querySelector('#cancel-progress').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Save
  container.querySelector('#save-progress').addEventListener('click', async () => {
    const sliders = container.querySelectorAll('.progress-slider');
    for (const slider of sliders) {
      const id = slider.dataset.id;
      const pct = parseInt(slider.value);
      const notes = container.querySelector(`[data-notes-for="${id}"]`).value;
      await api(`/progress/${id}`, {
        method: 'PUT',
        body: { completionPercent: pct, notes },
      });
    }
    modal.style.display = 'none';
    loadWeekGoals();
    loadCalendar();
  });

  modal.style.display = 'flex';
}

// ===== Calendar =====
async function loadCalendar() {
  document.getElementById('month-label').textContent = `${MONTH_NAMES[calendarMonth]} ${calendarYear}`;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // Day headers
  const headers = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  headers.forEach(h => {
    const el = document.createElement('div');
    el.className = 'cal-header';
    el.textContent = h;
    grid.appendChild(el);
  });

  // Get first day of month
  const firstDay = new Date(calendarYear, calendarMonth, 1);
  let startDay = firstDay.getDay() - 1; // Monday = 0
  if (startDay < 0) startDay = 6;

  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const today = toDateStr(new Date());

  // Fetch progress for this month
  let progressByDate = {};
  try {
    const monthStr = String(calendarMonth + 1);
    const progressData = await api(`/progress/month?year=${calendarYear}&month=${monthStr}`);
    for (const entry of progressData) {
      progressByDate[entry.date] = entry.avgCompletion;
    }
  } catch {
    // Ignore errors - just show empty calendar
  }

  // Empty cells for offset
  for (let i = 0; i < startDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const el = document.createElement('div');

    const pct = progressByDate[dateStr];
    let colorClass = 'no-data';
    let pctText = '';
    if (pct !== undefined && pct !== null) {
      colorClass = getColorClass(pct);
      pctText = `${pct}%`;
    }

    el.className = `cal-day ${colorClass}${dateStr === today ? ' today' : ''}`;
    el.innerHTML = `
      <span class="cal-date">${d}</span>
      ${pctText ? `<span class="cal-pct">${pctText}</span>` : ''}`;

    el.addEventListener('click', () => {
      // Navigate to the week containing this date and open progress for it
      currentWeekStart = getMonday(new Date(dateStr + 'T00:00:00'));
      loadWeekGoals().then(() => {
        // Small delay to let goals render, then find and click the day cell
        setTimeout(() => {
          const dayCell = document.querySelector(`.day-cell[data-date="${dateStr}"]`);
          if (dayCell) dayCell.click();
        }, 300);
      });
    });

    grid.appendChild(el);
  }
}

// ===== Create Goal Handler =====
async function handleCreateGoal(e) {
  e.preventDefault();
  const title = document.getElementById('goal-title').value.trim();
  const description = document.getElementById('goal-desc').value.trim();
  const weeklyTarget = parseFloat(document.getElementById('goal-target').value);
  const unit = document.getElementById('goal-unit').value.trim() || 'tasks';

  try {
    await api('/goals', {
      method: 'POST',
      body: { title, description, weeklyTarget, unit, weekStart: currentWeekStart },
    });

    document.getElementById('goal-modal').style.display = 'none';
    document.getElementById('goal-form').reset();
    document.getElementById('daily-preview').style.display = 'none';
    loadWeekGoals();
    loadCalendar();
  } catch (err) {
    alert(err.message);
  }
}

// ===== Utility =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
