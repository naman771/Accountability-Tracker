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
let isRegisterMode = false;

// ===== Date Helpers =====
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return toDateStr(date);
}

function toDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
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
  // Reset to login mode
  setAuthMode(false);
}

function showDashboard() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('dashboard-view').style.display = 'block';
  document.getElementById('user-greeting').textContent = `Hey, ${currentUser.displayName} 👋`;
  loadWeekGoals();
  loadTeamProgress();
  loadCalendar();
  updateFriendRequestBadge();
}

// ===== Auth Mode Toggle =====
function setAuthMode(register) {
  isRegisterMode = register;
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const toggleText = document.getElementById('auth-toggle-text');
  const toggleBtn = document.getElementById('auth-toggle-btn');

  if (register) {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    toggleText.textContent = 'Already have an account?';
    toggleBtn.textContent = 'Sign in';
  } else {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    toggleText.textContent = "Don't have an account?";
    toggleBtn.textContent = 'Create one';
  }

  // Clear errors
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('register-error').style.display = 'none';
}

// ===== Event Bindings =====
function bindEvents() {
  // Login
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Register
  document.getElementById('register-form').addEventListener('submit', handleRegister);

  // Auth toggle
  document.getElementById('auth-toggle-btn').addEventListener('click', () => {
    setAuthMode(!isRegisterMode);
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Week nav
  document.getElementById('prev-week').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    loadWeekGoals();
    loadTeamProgress();
  });
  document.getElementById('next-week').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    loadWeekGoals();
    loadTeamProgress();
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

  // Goal type toggle
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      document.getElementById('goal-type').value = type;
      document.getElementById('target-label').textContent = type === 'daily' ? 'Daily Target' : 'Weekly Target';
      // Re-trigger preview
      document.getElementById('goal-target').dispatchEvent(new Event('input'));
    });
  });

  // Daily target preview
  document.getElementById('goal-target').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    const preview = document.getElementById('daily-preview');
    const previewVal = document.getElementById('daily-target-preview');
    const goalType = document.getElementById('goal-type').value;
    if (val > 0) {
      const unit = document.getElementById('goal-unit').value || 'tasks';
      if (goalType === 'daily') {
        previewVal.textContent = `${val} ${unit}/day × 7 days`;
      } else {
        const daily = Math.round((val / 7) * 100) / 100;
        previewVal.textContent = `${daily} ${unit}/day`;
      }
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

  // Friends nav button
  document.getElementById('friends-nav-btn').addEventListener('click', () => {
    openFriendsModal();
  });

  // Friends modal close
  document.getElementById('close-friends-modal').addEventListener('click', () => {
    document.getElementById('friends-modal').style.display = 'none';
  });
  document.getElementById('friends-modal').querySelector('.modal-overlay').addEventListener('click', () => {
    document.getElementById('friends-modal').style.display = 'none';
  });

  // Friends tabs
  document.querySelectorAll('.friends-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.friends-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.friends-tab-content').forEach(c => {
        c.style.display = 'none';
        c.classList.remove('active');
      });
      const content = document.getElementById(`friends-tab-${tabName}`);
      content.style.display = 'block';
      content.classList.add('active');

      if (tabName === 'requests') loadFriendRequests();
      if (tabName === 'list') loadFriendsList();
    });
  });

  // Friend search input
  let searchTimeout;
  document.getElementById('friend-search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchUsers(e.target.value.trim());
    }, 300);
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

async function handleRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.style.display = 'none';

  const displayName = document.getElementById('reg-display-name').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;

  try {
    currentUser = await api('/auth/register', {
      method: 'POST',
      body: { username, password, displayName },
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

    // Bind click on day cells for updating progress (all days, not just today)
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
          loadTeamProgress();
          loadCalendar();
        }
      });
    });

    // Bind privacy toggle buttons
    container.querySelectorAll('.btn-privacy').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const goalId = btn.dataset.goalId;
        const currentPrivate = btn.dataset.private === '1';
        try {
          await api(`/goals/${goalId}/privacy`, {
            method: 'PUT',
            body: { isPrivate: !currentPrivate },
          });
          loadWeekGoals();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:var(--red)">Failed to load goals: ${err.message}</div>`;
  }
}

function renderGoalCard(goal) {
  const isDaily = goal.goal_type === 'daily';
  const dailyTarget = isDaily ? goal.weekly_target : Math.round((goal.weekly_target / 7) * 100) / 100;
  const progress = goal.dailyProgress || [];
  const isPrivate = goal.is_private === 1;

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
    <div class="goal-card ${isPrivate ? 'goal-private' : ''}">
      <div class="goal-header">
        <div>
          <div class="goal-title">${isPrivate ? '🔒 ' : ''}${escapeHtml(goal.title)}</div>
          ${goal.description ? `<div class="goal-meta">${escapeHtml(goal.description)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span class="goal-target-badge">${isDaily ? goal.weekly_target + ' ' + goal.unit + '/day' : goal.weekly_target + ' ' + goal.unit + '/week'}</span>
          <button class="btn-privacy" data-goal-id="${goal.id}" data-private="${isPrivate ? 1 : 0}" title="${isPrivate ? 'Make visible to friends' : 'Hide from friends'}">${isPrivate ? '🔒' : '🔓'}</button>
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
  const today = toDateStr(new Date());
  const isPast = date < today;
  const dayLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  title.textContent = `Progress — ${dayLabel}${isPast ? ' (past)' : ''}`;

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
    loadTeamProgress();
    loadCalendar();
  });

  modal.style.display = 'flex';
}

// ===== Team / Friends Progress =====
async function loadTeamProgress() {
  const container = document.getElementById('team-progress');
  container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const team = await api(`/progress/team?weekStart=${currentWeekStart}`);
    if (team.length === 0) {
      container.innerHTML = '<div class="empty-state">Add friends to see their progress here! Click <strong>👥 Friends</strong> in the top bar.</div>';
      return;
    }

    // If only self and no goals
    if (team.length === 1 && team[0].id === currentUser.id && team[0].goalCount === 0) {
      container.innerHTML = '<div class="empty-state">Add friends to see their progress here! Click <strong>👥 Friends</strong> in the top bar.</div>';
      return;
    }

    container.innerHTML = team.map(member => renderTeamMember(member)).join('');

    // Bind expand toggles
    container.querySelectorAll('.team-member-header').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.team-member-card');
        card.classList.toggle('expanded');
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:var(--red)">Failed to load team data: ${err.message}</div>`;
  }
}

function renderTeamMember(member) {
  const isCurrentUser = member.id === currentUser.id;
  const avatarColors = ['#6c5ce7', '#00b894', '#e17055', '#0984e3', '#e84393', '#fdcb6e'];
  const colorIdx = member.id % avatarColors.length;
  const initial = member.displayName.charAt(0).toUpperCase();
  const ringColor = getColorClass(member.avgCompletion);

  const goalCards = member.goals.map(goal => {
    const isDaily = goal.goal_type === 'daily';
    const dailyTarget = isDaily ? goal.weekly_target : Math.round((goal.weekly_target / 7) * 100) / 100;
    const progress = goal.dailyProgress || [];
    const dayCells = DAY_NAMES.map((name, i) => {
      const entry = progress[i];
      if (!entry) return `<div class="team-day-cell"><span class="day-name">${name}</span><span class="day-percent">—</span></div>`;
      const pct = entry.completion_percent || 0;
      const color = pct > 0 ? getColorClass(pct) : '';
      return `
        <div class="team-day-cell ${color}">
          <span class="day-name">${name}</span>
          <span class="day-percent">${pct}%</span>
        </div>`;
    }).join('');

    return `
      <div class="team-goal">
        <div class="team-goal-header">
          <span class="team-goal-title">${escapeHtml(goal.title)}</span>
          <span class="team-goal-badge">${isDaily ? goal.weekly_target + ' ' + goal.unit + '/day' : goal.weekly_target + ' ' + goal.unit + '/wk'}</span>
        </div>
        <div class="team-daily-breakdown">${dayCells}</div>
      </div>`;
  }).join('');

  return `
    <div class="team-member-card ${isCurrentUser ? 'is-you' : ''}">
      <div class="team-member-header">
        <div class="team-member-info">
          <div class="team-avatar" style="background:${avatarColors[colorIdx]}">${initial}</div>
          <div>
            <span class="team-member-name">${escapeHtml(member.displayName)}${isCurrentUser ? ' <span class="you-badge">You</span>' : ''}</span>
            <span class="team-member-stats">${member.goalCount} goal${member.goalCount !== 1 ? 's' : ''} this week</span>
          </div>
        </div>
        <div class="team-completion-ring ${ringColor}">
          <span class="team-completion-value">${member.avgCompletion}%</span>
        </div>
      </div>
      <div class="team-member-goals">${goalCards || '<div class="empty-state" style="padding:0.75rem;font-size:0.85rem;">No goals set this week</div>'}</div>
    </div>`;
}

// ===== Friends Management =====
async function updateFriendRequestBadge() {
  try {
    const { count } = await api('/friends/requests/count');
    const badge = document.getElementById('friend-req-badge');
    const tabBadge = document.getElementById('tab-req-badge');
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
      tabBadge.textContent = count;
      tabBadge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
      tabBadge.style.display = 'none';
    }
  } catch {
    // Silently fail
  }
}

function openFriendsModal() {
  document.getElementById('friends-modal').style.display = 'flex';
  // Reset to search tab
  document.querySelectorAll('.friends-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.friends-tab[data-tab="search"]').classList.add('active');
  document.querySelectorAll('.friends-tab-content').forEach(c => {
    c.style.display = 'none';
    c.classList.remove('active');
  });
  const searchTab = document.getElementById('friends-tab-search');
  searchTab.style.display = 'block';
  searchTab.classList.add('active');
  document.getElementById('friend-search-input').value = '';
  document.getElementById('friend-search-results').innerHTML = '<div class="empty-state" style="padding:1rem;font-size:0.85rem;">Search for users by username or name</div>';
  updateFriendRequestBadge();
}

async function searchUsers(query) {
  const container = document.getElementById('friend-search-results');
  if (!query || query.length < 2) {
    container.innerHTML = '<div class="empty-state" style="padding:1rem;font-size:0.85rem;">Type at least 2 characters to search</div>';
    return;
  }

  container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const results = await api(`/friends/search?q=${encodeURIComponent(query)}`);
    if (results.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:1rem;font-size:0.85rem;">No users found</div>';
      return;
    }

    container.innerHTML = results.map(user => {
      let actionHtml = '';
      if (user.friendshipStatus === 'none') {
        actionHtml = `<button class="btn-friend-add" data-user-id="${user.id}">Add Friend</button>`;
      } else if (user.friendshipStatus === 'request_sent') {
        actionHtml = `<span class="friend-status sent">Request Sent</span>`;
      } else if (user.friendshipStatus === 'request_received') {
        actionHtml = `
          <button class="btn-friend-accept" data-friendship-id="${user.friendshipId}">Accept</button>
          <button class="btn-friend-reject" data-friendship-id="${user.friendshipId}">Reject</button>`;
      } else if (user.friendshipStatus === 'friends') {
        actionHtml = `<span class="friend-status accepted">✓ Friends</span>`;
      }

      return `
        <div class="friend-card">
          <div class="friend-info">
            <div class="friend-avatar">${user.displayName.charAt(0).toUpperCase()}</div>
            <div>
              <div class="friend-name">${escapeHtml(user.displayName)}</div>
              <div class="friend-username">@${escapeHtml(user.username)}</div>
            </div>
          </div>
          <div class="friend-actions">${actionHtml}</div>
        </div>`;
    }).join('');

    // Bind add buttons
    container.querySelectorAll('.btn-friend-add').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = parseInt(btn.dataset.userId);
        try {
          await api('/friends/request', { method: 'POST', body: { addresseeId: userId } });
          btn.outerHTML = '<span class="friend-status sent">Request Sent</span>';
        } catch (err) {
          alert(err.message);
        }
      });
    });

    // Bind accept/reject buttons in search results
    container.querySelectorAll('.btn-friend-accept').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fId = parseInt(btn.dataset.friendshipId);
        try {
          await api('/friends/respond', { method: 'POST', body: { friendshipId: fId, action: 'accept' } });
          searchUsers(document.getElementById('friend-search-input').value.trim());
          updateFriendRequestBadge();
          loadTeamProgress();
        } catch (err) { alert(err.message); }
      });
    });
    container.querySelectorAll('.btn-friend-reject').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fId = parseInt(btn.dataset.friendshipId);
        try {
          await api('/friends/respond', { method: 'POST', body: { friendshipId: fId, action: 'reject' } });
          searchUsers(document.getElementById('friend-search-input').value.trim());
          updateFriendRequestBadge();
        } catch (err) { alert(err.message); }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:var(--red)">${err.message}</div>`;
  }
}

async function loadFriendRequests() {
  const container = document.getElementById('friend-requests-list');
  container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const requests = await api('/friends/requests');
    if (requests.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:1rem;font-size:0.85rem;">No pending requests</div>';
      return;
    }

    container.innerHTML = requests.map(req => `
      <div class="friend-card">
        <div class="friend-info">
          <div class="friend-avatar">${req.displayName.charAt(0).toUpperCase()}</div>
          <div>
            <div class="friend-name">${escapeHtml(req.displayName)}</div>
            <div class="friend-username">@${escapeHtml(req.username)}</div>
          </div>
        </div>
        <div class="friend-actions">
          <button class="btn-friend-accept" data-friendship-id="${req.friendshipId}">Accept</button>
          <button class="btn-friend-reject" data-friendship-id="${req.friendshipId}">Reject</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-friend-accept').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fId = parseInt(btn.dataset.friendshipId);
        try {
          await api('/friends/respond', { method: 'POST', body: { friendshipId: fId, action: 'accept' } });
          loadFriendRequests();
          updateFriendRequestBadge();
          loadTeamProgress();
        } catch (err) { alert(err.message); }
      });
    });
    container.querySelectorAll('.btn-friend-reject').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fId = parseInt(btn.dataset.friendshipId);
        try {
          await api('/friends/respond', { method: 'POST', body: { friendshipId: fId, action: 'reject' } });
          loadFriendRequests();
          updateFriendRequestBadge();
        } catch (err) { alert(err.message); }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:var(--red)">${err.message}</div>`;
  }
}

async function loadFriendsList() {
  const container = document.getElementById('friends-list');
  container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const friends = await api('/friends');
    if (friends.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:1rem;font-size:0.85rem;">No friends yet. Search and add some!</div>';
      return;
    }

    container.innerHTML = friends.map(f => `
      <div class="friend-card">
        <div class="friend-info">
          <div class="friend-avatar">${f.displayName.charAt(0).toUpperCase()}</div>
          <div>
            <div class="friend-name">${escapeHtml(f.displayName)}</div>
            <div class="friend-username">@${escapeHtml(f.username)}</div>
          </div>
        </div>
        <div class="friend-actions">
          <button class="btn-friend-remove" data-friendship-id="${f.friendshipId}">Remove</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-friend-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fId = parseInt(btn.dataset.friendshipId);
        if (confirm('Remove this friend? They will no longer see your progress.')) {
          try {
            await api(`/friends/${fId}`, { method: 'DELETE' });
            loadFriendsList();
            loadTeamProgress();
          } catch (err) { alert(err.message); }
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:var(--red)">${err.message}</div>`;
  }
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
  const goalType = document.getElementById('goal-type').value;
  const isPrivate = document.getElementById('goal-private-check').checked;

  try {
    await api('/goals', {
      method: 'POST',
      body: { title, description, weeklyTarget, unit, weekStart: currentWeekStart, goalType, isPrivate },
    });

    document.getElementById('goal-modal').style.display = 'none';
    document.getElementById('goal-form').reset();
    document.getElementById('daily-preview').style.display = 'none';
    // Reset type toggle to weekly
    document.getElementById('goal-type').value = 'weekly';
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.type-btn[data-type="weekly"]').classList.add('active');
    document.getElementById('target-label').textContent = 'Weekly Target';
    loadWeekGoals();
    loadTeamProgress();
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
