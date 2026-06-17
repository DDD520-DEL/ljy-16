const API = '/api';
let currentUser = null;
let themes = [];
let difficultyLevels = [];
let currentThemeFilter = '';
let currentCityFilter = '';
let currentDifficultyFilter = '';
let currentKeyword = '';
let favoriteIds = new Set();
let currentNoteComments = [];
let currentDiscussionNoteId = null;
let currentCommentCount = 0;
let replyingToCommentId = null;
let replyingToUserName = '';
let currentRatingPlanId = null;
let currentRatings = { route_design: 0, organization: 0, partner_fit: 0 };
let currentTimelineFilter = 'all';
let currentView = 'list';
let currentCalendarDate = new Date();
let calendarPlans = [];
let currentDateTab = 'recruiting';
let selectedDatePlans = [];
let currentDetailTab = 'notes';
let currentDetailPlanId = null;
let currentDetailPlan = null;
let searchHistoryVisible = false;
let searchHistoryItems = [];
let currentPlanPhotos = [];
let currentPlanMessages = [];
let messagePollingTimer = null;
let lastMessageTimestamp = null;

const avatarPool = ['🧑', '👩', '👨', '👧', '👦', '🧔', '👵', '👴', '🧑‍🎨', '👨‍🍳', '👩‍💻', '🧑‍🚀', '🎨', '📷', '🎭', '🎵'];

function getRandomAvatar() {
  return avatarPool[Math.floor(Math.random() * avatarPool.length)];
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return res.json();
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = (type === 'success' ? '✅ ' : type === 'error' ? '❌ ' : 'ℹ️ ') + message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

function formatDateTime(str) {
  if (!str) return '';
  const d = new Date(str);
  const now = new Date();
  const diff = d - now;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  let timeStr = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  
  if (days > 0) timeStr += `（${days}天后）`;
  else if (days === 0 && hours > 0) timeStr += `（${hours}小时后）`;
  else if (diff < 0) timeStr = `✅ 已结束 · ${timeStr}`;
  
  return timeStr;
}

function getThemeInfo(themeId) {
  const t = themes.find(t => t.id === themeId);
  return t || { name: themeId, icon: '📍', color: '#999' };
}

function getDifficultyInfo(levelId) {
  const d = difficultyLevels.find(d => d.id === levelId);
  return d || { name: '中等强度', icon: '🚶', color: '#0984E3' };
}

function renderDifficultyBadge(levelId, options = {}) {
  const d = getDifficultyInfo(levelId);
  const size = options.size || 'normal';
  const sizeClass = size === 'small' ? 'difficulty-badge-sm' : '';
  return `<span class="difficulty-badge ${sizeClass}" style="background: ${d.color}15; color: ${d.color}; border-color: ${d.color}30">
    <span>${d.icon}</span>
    <span>${d.name}</span>
  </span>`;
}

function getStatusLabel(status) {
  if (status === 'recruiting') return { text: '招募中', cls: 'status-recruiting' };
  if (status === 'completed') return { text: '已完成', cls: 'status-completed' };
  if (status === 'cancelled') return { text: '已取消', cls: 'status-cancelled' };
  return { text: status, cls: '' };
}

function saveUser(user) {
  currentUser = user;
  localStorage.setItem('citywalk_user', JSON.stringify(user));
}

function loadUser() {
  const saved = localStorage.getItem('citywalk_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      return currentUser;
    } catch (e) {
      return null;
    }
  }
  return null;
}

function logout() {
  localStorage.removeItem('citywalk_user');
  currentUser = null;
  stopNotificationCheck();
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('loginUsername').value = '';
  updateNotificationBadge(0);
}

function showMainApp() {
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('userName').textContent = currentUser.username;
  document.getElementById('userAvatar').textContent = currentUser.avatar || getRandomAvatar();
}

function renderThemeFilter() {
  const container = document.getElementById('themeFilter');
  container.innerHTML = `<div class="theme-chip ${currentThemeFilter === '' ? 'active' : ''}" data-theme="">全部</div>` +
    themes.map(t => `
      <div class="theme-chip ${currentThemeFilter === t.id ? 'active' : ''}" 
           data-theme="${t.id}" 
           style="color: ${t.color}; background: ${currentThemeFilter === t.id ? t.color + '15' : 'var(--bg)'}">
        <span>${t.icon}</span>
        <span>${t.name}</span>
      </div>
    `).join('');
  
  container.querySelectorAll('.theme-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentThemeFilter = chip.dataset.theme;
      renderThemeFilter();
      refreshDiscoverView();
    });
  });
}

function renderDifficultyFilter() {
  const container = document.getElementById('difficultyFilter');
  if (!container) return;
  
  container.innerHTML = `<div class="difficulty-chip ${currentDifficultyFilter === '' ? 'active' : ''}" data-difficulty="">
      <span>🎯</span>
      <span>全部难度</span>
    </div>` +
    difficultyLevels.map(d => `
      <div class="difficulty-chip ${currentDifficultyFilter === d.id ? 'active' : ''}" 
           data-difficulty="${d.id}" 
           style="color: ${d.color}; background: ${currentDifficultyFilter === d.id ? d.color + '15' : 'var(--bg)'}; border-color: ${currentDifficultyFilter === d.id ? d.color + '50' : 'var(--border)'}">
        <span>${d.icon}</span>
        <span>${d.name}</span>
      </div>
    `).join('');
  
  container.querySelectorAll('.difficulty-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentDifficultyFilter = chip.dataset.difficulty;
      renderDifficultyFilter();
      refreshDiscoverView();
    });
  });
}

function initDifficultySelector() {
  const container = document.getElementById('planDifficulty');
  if (!container) return;
  
  const updateSelection = (level) => {
    container.querySelectorAll('.difficulty-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.level === level);
    });
    document.getElementById('planDifficultyLevel').value = level;
  };
  
  container.querySelectorAll('.difficulty-option').forEach(opt => {
    opt.addEventListener('click', () => {
      updateSelection(opt.dataset.level);
    });
  });
  
  updateSelection('medium');
}

async function populateCitySelects() {
  const res = await api(`${API}/cities`);
  if (res.success) {
    const cities = res.cities;
    ['filterCity', 'matchCity', 'popularCity', 'planCity', 'editTemplateCity', 'publicTemplateCity'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const firstOption = sel.querySelector('option');
      sel.innerHTML = '';
      sel.appendChild(firstOption);
      cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
      });
    });
  }
}

async function populateThemeSelects() {
  ['matchTheme', 'planTheme', 'editTemplateTheme', 'publicTemplateTheme'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const firstOption = sel.querySelector('option');
    sel.innerHTML = '';
    sel.appendChild(firstOption);
    themes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.icon} ${t.name}`;
      sel.appendChild(opt);
    });
  });
}

function renderPlanCard(plan, options = {}) {
  const theme = getThemeInfo(plan.theme);
  const status = getStatusLabel(plan.status);
  const isFull = plan.current_participants >= plan.max_participants;
  const isFav = favoriteIds.has(plan.id);
  const spots = plan.max_participants - plan.current_participants;

  const followedBadge = plan.is_from_followed ? '<span class="followed-user-badge">👀 关注的人</span>' : '';

  return `
    <div class="plan-card ${plan.is_from_followed ? 'plan-card-followed' : ''}" data-plan-id="${plan.id}">
      <div class="plan-card-header">
        <button class="plan-favorite ${isFav ? 'active' : ''}" 
                data-plan-id="${plan.id}" 
                onclick="event.stopPropagation(); toggleFavorite(${plan.id}, this)">
          ${isFav ? '⭐' : '☆'}
        </button>
        <div class="plan-theme-badge" style="background: ${theme.color}15; color: ${theme.color}">
          <span>${theme.icon}</span>
          <span>${theme.name}</span>
        </div>
        ${followedBadge}
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <span class="status-badge ${status.cls}">${status.text}</span>
          ${renderDifficultyBadge(plan.difficulty_level, { size: 'small' })}
          ${options.showSpots && plan.status === 'recruiting' && spots > 0 ? 
            `<span class="match-spots">剩 ${spots} 个名额</span>` : ''}
        </div>
        <h3 class="plan-title">${plan.title}</h3>
        <span class="plan-city">📍 ${plan.city}</span>
      </div>
      <div class="plan-card-body">
        <div class="plan-meta">
          <div class="plan-meta-item">
            <span class="meta-icon">⏰</span>
            <span>${formatDateTime(plan.start_time)}</span>
          </div>
          <div class="plan-meta-item">
            <span class="meta-icon">⏱️</span>
            <span>${plan.duration_hours}小时</span>
          </div>
          <div class="plan-meta-item">
            <span class="meta-icon">📍</span>
            <span>${plan.meeting_point || '待定'}</span>
          </div>
          <div class="plan-meta-item">
            <span class="meta-icon">👥</span>
            <span>${plan.current_participants}/${plan.max_participants}人</span>
          </div>
        </div>
        <p class="plan-description">${plan.description || '暂无描述'}</p>
        <div class="plan-card-footer">
          <div class="plan-creator" onclick="event.stopPropagation(); openUserProfile(${plan.creator?.id || plan.creator_id})">
            <div class="creator-avatar">${plan.creator?.avatar || '🧑'}</div>
            <span class="creator-name">${plan.creator?.username || '创建者'}</span>
          </div>
          <div class="plan-participants">
            <div class="participants-avatars">
              ${(plan.participants || []).slice(0, 4).map(p => `
                <div class="participant-avatar" title="${p.username}" onclick="event.stopPropagation(); openUserProfile(${p.id})">${p.avatar || '👤'}</div>
              `).join('')}
            </div>
            <span class="participants-count ${isFull ? 'full' : ''}">
              ${isFull ? '已满' : `+${plan.current_participants - 1}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadDiscoverPlans() {
  const params = new URLSearchParams();
  if (currentCityFilter) params.set('city', currentCityFilter);
  if (currentThemeFilter) params.set('theme', currentThemeFilter);
  if (currentDifficultyFilter) params.set('difficulty', currentDifficultyFilter);
  if (currentKeyword) params.set('keyword', currentKeyword);
  if (currentUser) params.set('user_id', currentUser.id);
  
  const res = await api(`${API}/plans?${params}`);
  const grid = document.getElementById('discoverPlans');
  
  if (res.success && res.plans.length > 0) {
    grid.innerHTML = res.plans.map(p => renderPlanCard(p)).join('');
    bindPlanCardClicks(grid);
  } else {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-state-icon">🔍</div>
        <h3>暂无匹配的Citywalk计划</h3>
        <p>试试调整筛选条件，或者发布一个自己的计划吧！</p>
      </div>
    `;
  }
}

function refreshDiscoverView() {
  if (currentView === 'calendar') {
    loadCalendarData();
  } else {
    loadDiscoverPlans();
  }
}

function switchView(view) {
  currentView = view;
  
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  
  const plansGrid = document.getElementById('discoverPlans');
  const calendarView = document.getElementById('calendarView');
  
  if (view === 'list') {
    plansGrid.classList.remove('hidden');
    calendarView.classList.add('hidden');
  } else {
    plansGrid.classList.add('hidden');
    calendarView.classList.remove('hidden');
    loadCalendarData();
  }
}

async function loadCalendarData() {
  const params = new URLSearchParams();
  if (currentCityFilter) params.set('city', currentCityFilter);
  if (currentThemeFilter) params.set('theme', currentThemeFilter);
  if (currentDifficultyFilter) params.set('difficulty', currentDifficultyFilter);
  if (currentKeyword) params.set('keyword', currentKeyword);
  if (currentUser) params.set('user_id', currentUser.id);
  params.set('limit', '100');
  
  const res = await api(`${API}/plans?${params}`);
  calendarPlans = res.success ? res.plans : [];
  renderCalendar();
}

function renderCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  
  document.getElementById('calendarTitle').textContent = `${year}年${month + 1}月`;
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  
  const grid = document.getElementById('calendarGrid');
  let html = '';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < 42; i++) {
    let dayNum;
    let isOtherMonth = false;
    let dateObj;
    
    if (i < startDay) {
      dayNum = prevMonthLastDay - startDay + i + 1;
      isOtherMonth = true;
      dateObj = new Date(year, month - 1, dayNum);
    } else if (i >= startDay + daysInMonth) {
      dayNum = i - startDay - daysInMonth + 1;
      isOtherMonth = true;
      dateObj = new Date(year, month + 1, dayNum);
    } else {
      dayNum = i - startDay + 1;
      dateObj = new Date(year, month, dayNum);
    }
    
    const dateStr = formatDateKey(dateObj);
    const dayPlans = getPlansForDate(dateObj);
    const hasActivity = dayPlans.length > 0;
    const hasJoined = dayPlans.some(p => isUserJoinedPlan(p));
    const isToday = dateObj.getTime() === today.getTime();
    
    let dayClass = 'calendar-day';
    if (isOtherMonth) dayClass += ' other-month';
    if (isToday) dayClass += ' today';
    if (hasActivity) dayClass += ' has-activity';
    if (hasJoined) dayClass += ' joined-activity';
    
    let dotsHtml = '';
    if (hasActivity) {
      const joinedCount = dayPlans.filter(p => isUserJoinedPlan(p)).length;
      const otherCount = dayPlans.length - joinedCount;
      dotsHtml = '<div class="day-dots">';
      if (joinedCount > 0) {
        dotsHtml += `<span class="day-dot joined" title="已加入${joinedCount}个活动"></span>`;
      }
      if (otherCount > 0) {
        dotsHtml += `<span class="day-dot" title="${otherCount}个可参加活动"></span>`;
      }
      dotsHtml += '</div>';
    }
    
    html += `
      <div class="${dayClass}" data-date="${dateStr}" onclick="handleDateClick('${dateStr}')">
        <span class="day-number">${dayNum}</span>
        ${dotsHtml}
      </div>
    `;
  }
  
  grid.innerHTML = html;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPlansForDate(date) {
  const dateStr = formatDateKey(date);
  return calendarPlans.filter(plan => {
    const planDate = formatDateKey(new Date(plan.start_time));
    return planDate === dateStr;
  });
}

function isUserJoinedPlan(plan) {
  if (!currentUser) return false;
  return plan.participants?.some(p => p.id === currentUser.id);
}

function prevMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderCalendar();
}

function goToToday() {
  currentCalendarDate = new Date();
  renderCalendar();
}

function handleDateClick(dateStr) {
  const date = new Date(dateStr);
  selectedDatePlans = getPlansForDate(date);
  
  const title = document.getElementById('dateActivityTitle');
  title.textContent = `${date.getMonth() + 1}月${date.getDate()}日 活动`;
  
  currentDateTab = 'recruiting';
  updateDateTabs();
  renderDateActivityList();
  
  openModal('dateActivityModal');
}

function updateDateTabs() {
  document.querySelectorAll('.date-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === currentDateTab);
  });
}

function renderDateActivityList() {
  const list = document.getElementById('dateActivityList');
  let plans = [];
  
  const now = new Date();
  
  if (currentDateTab === 'recruiting') {
    plans = selectedDatePlans.filter(p => p.status === 'recruiting');
  } else {
    plans = selectedDatePlans.filter(p => {
      const startTime = new Date(p.start_time);
      const diffHours = (startTime - now) / (1000 * 60 * 60);
      return diffHours > 0 && diffHours <= 48 && p.status === 'recruiting';
    });
  }
  
  plans.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  
  if (plans.length === 0) {
    list.innerHTML = `
      <div class="date-empty-state">
        <div class="empty-icon">📅</div>
        <p>${currentDateTab === 'recruiting' ? '当天暂无招募中的活动' : '当天暂无即将开始的活动'}</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = plans.map(plan => {
    const theme = getThemeInfo(plan.theme);
    const status = getStatusLabel(plan.status);
    const startTime = new Date(plan.start_time);
    const timeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
    const isJoined = isUserJoinedPlan(plan);
    const isFull = plan.current_participants >= plan.max_participants;
    
    return `
      <div class="date-activity-item" data-plan-id="${plan.id}" onclick="openPlanDetail(${plan.id})">
        <div class="date-activity-time">
          <div class="time">${timeStr}</div>
          <div class="duration">${plan.duration_hours}小时</div>
        </div>
        <div class="date-activity-info">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
            <div class="date-activity-theme" style="background: ${theme.color}15; color: ${theme.color}">
              <span>${theme.icon}</span>
              <span>${theme.name}</span>
            </div>
            ${renderDifficultyBadge(plan.difficulty_level, { size: 'small' })}
          </div>
          <div class="date-activity-title">${plan.title}</div>
          <div class="date-activity-meta">
            <span>📍 ${plan.city}</span>
            <span>👥 ${plan.current_participants}/${plan.max_participants}人</span>
            ${isJoined ? '<span style="color: var(--success);">✓ 已加入</span>' : ''}
            ${isFull && !isJoined ? '<span style="color: var(--danger);">已满</span>' : ''}
          </div>
        </div>
        <div class="date-activity-status">
          <span class="status-badge ${status.cls}">${status.text}</span>
        </div>
      </div>
    `;
  }).join('');
}

function initCalendarEvents() {
  document.getElementById('prevMonthBtn').addEventListener('click', prevMonth);
  document.getElementById('nextMonthBtn').addEventListener('click', nextMonth);
  document.getElementById('todayBtn').addEventListener('click', goToToday);
  
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  
  document.getElementById('closeDateActivityBtn').addEventListener('click', () => {
    closeModal('dateActivityModal');
  });
  
  document.getElementById('dateActivityModal').addEventListener('click', (e) => {
    if (e.target.id === 'dateActivityModal') closeModal('dateActivityModal');
  });
  
  document.querySelectorAll('.date-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentDateTab = btn.dataset.tab;
      updateDateTabs();
      renderDateActivityList();
    });
  });
}

async function loadMatchSuggestions() {
  const city = document.getElementById('matchCity').value;
  const theme = document.getElementById('matchTheme').value;
  const params = new URLSearchParams();
  if (currentUser) params.set('user_id', currentUser.id);
  if (city) params.set('city', city);
  if (theme) params.set('theme', theme);
  
  const res = await api(`${API}/match/suggestions?${params}`);
  const grid = document.getElementById('matchGrid');
  
  if (res.success && res.suggestions.length > 0) {
    grid.innerHTML = res.suggestions.map(p => renderPlanCard(p, { showSpots: true })).join('');
    bindPlanCardClicks(grid);
  } else {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-state-icon">🤝</div>
        <h3>暂无匹配的搭子</h3>
        <p>换个城市或主题试试，或者先去发现页面看看！</p>
      </div>
    `;
  }
}

async function loadPopularRoutes() {
  const city = document.getElementById('popularCity').value;
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  
  if (currentUser) params.set('user_id', currentUser.id);
  const res = await api(`${API}/routes/popular?${params}`);
  const list = document.getElementById('popularList');
  
  if (res.success && res.routes.length > 0) {
    list.innerHTML = res.routes.map((r, idx) => {
      const theme = getThemeInfo(r.theme);
      const hasRating = r.avg_rating && r.rating_count > 0;
      const personalBadge = (r.personalized_city_bonus || r.personalized_theme_bonus) ? '<span class="personalized-badge">🎯 为你推荐</span>' : '';
      return `
        <div class="popular-item" data-plan-id="${r.id}">
          <div class="popular-rank rank-${idx < 3 ? idx + 1 : ''}">${idx < 3 ? ['🥇', '🥈', '🥉'][idx] : idx + 1}</div>
          <div class="popular-info">
            <h3>${r.title}</h3>${personalBadge}
            <div class="popular-meta">
              <span style="color: ${theme.color}">${theme.icon} ${theme.name}</span>
              <span>📍 ${r.city}</span>
              <span>📝 ${r.notes_count || 0}篇笔记</span>
              <span>📸 ${r.photos_count || 0}张照片</span>
              <span>👤 ${r.creator?.username}</span>
            </div>
            ${hasRating ? `
              <div class="plan-rating-badge" style="margin-top:8px;">
                <span class="plan-rating-score">${r.avg_rating.toFixed(1)}</span>
                <span class="plan-rating-stars">${renderStars(r.avg_rating)}</span>
                <span class="plan-rating-count">${r.rating_count} 评</span>
              </div>
            ` : ''}
          </div>
          <div class="popular-stats">
            <div class="popular-stat">
              <div class="popular-stat-num">${r.popularity}</div>
              <div class="popular-stat-label">参与人数</div>
            </div>
            <div class="popular-stat">
              <div class="popular-stat-num">${r.total_likes || 0}</div>
              <div class="popular-stat-label">总点赞</div>
            </div>
            ${hasRating ? `
              <div class="popular-stat">
                <div class="popular-stat-num" style="color:#f59e0b;">${r.avg_rating.toFixed(1)}</div>
                <div class="popular-stat-label">评分</div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    list.querySelectorAll('.popular-item').forEach(item => {
      item.addEventListener('click', () => openPlanDetail(item.dataset.planId));
    });
  } else {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔥</div>
        <h3>暂无热门路线</h3>
        <p>快去完成你的第一次Citywalk吧！</p>
      </div>
    `;
  }
}

async function loadFavorites() {
  if (!currentUser) return;
  const res = await api(`${API}/users/${currentUser.id}/favorites`);
  const grid = document.getElementById('favoritesGrid');
  
  if (res.success && res.favorites.length > 0) {
    favoriteIds = new Set(res.favorites.map(f => f.id));
    grid.innerHTML = res.favorites.map(p => renderPlanCard(p)).join('');
    bindPlanCardClicks(grid);
  } else {
    favoriteIds = new Set();
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-state-icon">⭐</div>
        <h3>还没有收藏路线</h3>
        <p>在发现或热门页面，点击卡片右上角的星星收藏喜欢的路线吧！</p>
      </div>
    `;
  }
}

async function loadMyPlans() {
  if (!currentUser) return;
  
  const favRes = await api(`${API}/users/${currentUser.id}/favorites`);
  if (favRes.success) {
    favoriteIds = new Set(favRes.favorites.map(f => f.id));
  }
  
  const pendingRes = await api(`${API}/users/${currentUser.id}/pending-ratings`);
  const pendingRatings = pendingRes.success ? pendingRes.plans : [];
  
  const ratingsStatsRes = await api(`${API}/users/${currentUser.id}/ratings-stats`);
  const ratingsStats = ratingsStatsRes.success ? ratingsStatsRes.stats : null;
  
  const photosStatsRes = await api(`${API}/users/${currentUser.id}/photos-stats`);
  const photosStats = photosStatsRes.success ? photosStatsRes.stats : null;
  
  const checkinStatsRes = await api(`${API}/users/${currentUser.id}/checkin-stats`);
  const checkinStats = checkinStatsRes.success ? checkinStatsRes : null;
  
  const res = await api(`${API}/users/${currentUser.id}/plans`);
  const grid = document.getElementById('myPlansGrid');
  
  document.getElementById('profileName').textContent = currentUser.username;
  document.getElementById('profileAvatar').textContent = currentUser.avatar || '🧑';
  document.getElementById('profileBio').textContent = currentUser.bio || '这个人很懒，没有留下签名';
  document.getElementById('profileCity').textContent = '📍 ' + (currentUser.city || '未知城市');
  document.getElementById('statPlans').textContent = res.success ? res.plans.length : 0;
  document.getElementById('statCheckins').textContent = checkinStats ? checkinStats.stats.total_checkins : 0;
  document.getElementById('statConsecutive').textContent = checkinStats ? checkinStats.stats.consecutive_days : 0;
  document.getElementById('statPhotos').textContent = photosStats ? photosStats.photos_count : 0;
  document.getElementById('statFavorites').textContent = favRes.success ? favRes.favorites.length : 0;
  
  const followingRes = await api(`${API}/users/${currentUser.id}/following`);
  const followersRes = await api(`${API}/users/${currentUser.id}/followers`);
  document.getElementById('statFollowing').textContent = followingRes.success ? followingRes.users.length : 0;
  document.getElementById('statFollowers').textContent = followersRes.success ? followersRes.users.length : 0;
  
  let totalNotes = 0;
  if (res.success && res.plans.length > 0) {
    for (const p of res.plans) {
      const detail = await api(`${API}/plans/${p.id}`);
      if (detail.success) totalNotes += (detail.plan.notes || []).length;
    }
  }
  document.getElementById('statNotes').textContent = totalNotes;
  
  let pendingHtml = '';
  if (pendingRatings.length > 0) {
    pendingHtml = `
      <div class="pending-ratings-banner">
        <div class="pending-ratings-icon">⭐</div>
        <div class="pending-ratings-info">
          <strong>你有 ${pendingRatings.length} 场活动待评分</strong>
          <p>为刚结束的 Citywalk 打分，帮助其他小伙伴找到优质路线~</p>
        </div>
        <button class="pending-ratings-btn" onclick="showPendingRatingsList()">去评分</button>
      </div>
    `;
  }
  
  let userProfileRatingHtml = '';
  if (ratingsStats && ratingsStats.rating_count > 0) {
    const dist = ratingsStats.distribution || {};
    userProfileRatingHtml = `
      <div class="user-profile-rating">
        <h4>⭐ 活动评分</h4>
        <div class="profile-rating-score">
          <span class="profile-rating-num">${ratingsStats.avg_overall.toFixed(1)}</span>
          <span class="profile-rating-stars">${renderStars(ratingsStats.avg_overall)}</span>
          <span class="profile-rating-count">${ratingsStats.rating_count} 条评价</span>
        </div>
        <div class="profile-rating-bars">
          <div class="profile-rating-bar-item">
            <span class="profile-rating-bar-label">路线设计</span>
            <div class="profile-rating-bar-track">
              <div class="profile-rating-bar-fill" style="width: ${(ratingsStats.avg_route_design / 5) * 100}%"></div>
            </div>
            <span class="profile-rating-bar-value">${ratingsStats.avg_route_design.toFixed(1)}</span>
          </div>
          <div class="profile-rating-bar-item">
            <span class="profile-rating-bar-label">组织体验</span>
            <div class="profile-rating-bar-track">
              <div class="profile-rating-bar-fill" style="width: ${(ratingsStats.avg_organization / 5) * 100}%"></div>
            </div>
            <span class="profile-rating-bar-value">${ratingsStats.avg_organization.toFixed(1)}</span>
          </div>
          <div class="profile-rating-bar-item">
            <span class="profile-rating-bar-label">搭子契合</span>
            <div class="profile-rating-bar-track">
              <div class="profile-rating-bar-fill" style="width: ${(ratingsStats.avg_partner_fit / 5) * 100}%"></div>
            </div>
            <span class="profile-rating-bar-value">${ratingsStats.avg_partner_fit.toFixed(1)}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  const profileCard = document.querySelector('.profile-card');
  const mineTab = document.getElementById('mineTab');
  const existingBanner = document.querySelector('.pending-ratings-banner');
  const existingProfileRating = document.querySelector('.user-profile-rating');
  if (existingBanner) existingBanner.remove();
  if (existingProfileRating) existingProfileRating.remove();
  
  if (pendingHtml && profileCard) {
    profileCard.insertAdjacentHTML('beforebegin', pendingHtml);
  }
  if (userProfileRatingHtml && profileCard) {
    profileCard.insertAdjacentHTML('afterend', userProfileRatingHtml);
  }
  
  if (res.success && res.plans.length > 0) {
    grid.innerHTML = res.plans.map(p => renderPlanCard(p)).join('');
    bindPlanCardClicks(grid);
  } else {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-state-icon">📅</div>
        <h3>还没有参与任何Citywalk</h3>
        <p>去发现页面找找感兴趣的路线，或者发布自己的计划吧！</p>
      </div>
    `;
  }

  loadUserBadges();
  loadMyTemplatesPreview();
}

async function loadUserBadges() {
  if (!currentUser) return;

  try {
    const res = await api(`${API}/users/${currentUser.id}/badges`);
    if (res.success) {
      const badgesGrid = document.getElementById('badgesGrid');
      const badgesProgress = document.getElementById('badgesProgress');

      if (badgesProgress) {
        badgesProgress.textContent = `${res.stats.unlocked_count}/${res.stats.total_count}`;
      }

      if (badgesGrid) {
        badgesGrid.innerHTML = res.badges.map(badge => renderBadgeCard(badge)).join('');
      }
    }
  } catch (e) {
    console.error('加载徽章失败:', e);
  }
}

function renderBadgeCard(badge) {
  const isUnlocked = badge.unlocked;
  const progressPercent = badge.progress || 0;

  return `
    <div class="badge-card ${isUnlocked ? 'unlocked' : 'locked'}" data-badge-id="${badge.id}" title="${badge.description}">
      <div class="badge-icon" style="${isUnlocked ? `color: ${badge.color};` : ''}">
        ${badge.icon}
      </div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.description}</div>
      ${!isUnlocked ? `
        <div class="badge-progress-bar">
          <div class="badge-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
        <div class="badge-progress-text">${badge.current_value || 0}/${badge.condition_value}</div>
      ` : `
        <div class="badge-unlocked-date">获得于 ${formatDate(badge.unlocked_at)}</div>
      `}
    </div>
  `;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function showBadgeUnlockToast(badges) {
  if (!badges || badges.length === 0) return;

  badges.forEach((badge, index) => {
    setTimeout(() => {
      const toast = document.createElement('div');
      toast.className = 'badge-unlock-toast';
      toast.innerHTML = `
        <div class="badge-unlock-icon" style="color: ${badge.color};">${badge.icon}</div>
        <div class="badge-unlock-info">
          <div class="badge-unlock-title">🎉 获得新成就！</div>
          <div class="badge-unlock-name">${badge.name}</div>
          <div class="badge-unlock-desc">${badge.description}</div>
        </div>
      `;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('show');
      }, 100);

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }, 3500);
    }, index * 500);
  });
}

function showPendingRatingsList() {
  openModal('pendingRatingsModal');
  loadPendingRatingsModal();
}

async function loadPendingRatingsModal() {
  const container = document.getElementById('pendingRatingsList');
  if (!container) return;
  
  const pending = await loadPendingRatings();
  
  if (pending.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✨</div>
        <h3>暂无待评分活动</h3>
        <p>你已经为所有已结束的活动评分啦，真棒！</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = pending.map(p => `
    <div class="pending-rating-card">
      <div class="pending-rating-card-info">
        <h4>${p.title}</h4>
        <p>${formatDateTime(p.start_time)} · ${p.city}</p>
      </div>
      <button class="rate-now-btn" onclick="ratePendingPlan(${p.id}, '${p.title.replace(/'/g, "\\'")}', '${formatDateTime(p.start_time)}')">
        去评分
      </button>
    </div>
  `).join('');
}

function ratePendingPlan(planId, title, meta) {
  closeModal('pendingRatingsModal');
  openRatingModal(planId, title, meta);
}

function bindPlanCardClicks(container) {
  container.querySelectorAll('.plan-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.plan-favorite')) return;
      openPlanDetail(card.dataset.planId);
    });
  });
}

async function toggleFavorite(planId, btn) {
  if (!currentUser) {
    showToast('请先登录', 'error');
    return;
  }
  const isActive = btn.classList.contains('active');
  
  if (isActive) {
    await api(`${API}/favorites`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: currentUser.id, plan_id: planId })
    });
    btn.classList.remove('active');
    btn.textContent = '☆';
    favoriteIds.delete(planId);
    showToast('已取消收藏', 'info');
  } else {
    const res = await api(`${API}/favorites`, {
      method: 'POST',
      body: JSON.stringify({ user_id: currentUser.id, plan_id: planId })
    });
    btn.classList.add('active');
    btn.textContent = '⭐';
    favoriteIds.add(planId);
    showToast('收藏成功！', 'success');

    if (res && res.new_badges && res.new_badges.length > 0) {
      showBadgeUnlockToast(res.new_badges);
    }
  }
  
  const activeTab = document.querySelector('.nav-btn.active')?.dataset.tab;
  if (activeTab === 'favorites') loadFavorites();
}

async function openPlanDetail(planId) {
  const res = await api(`${API}/plans/${planId}`);
  if (!res.success) {
    showToast('加载计划详情失败', 'error');
    return;
  }
  
  const plan = res.plan;
  currentDetailPlan = plan;
  const theme = getThemeInfo(plan.theme);
  const status = getStatusLabel(plan.status);
  const isJoined = plan.participants?.some(p => Number(p.id) === Number(currentUser?.id));
  const isCreator = Number(plan.creator_id) === Number(currentUser?.id);
  const isFull = plan.current_participants >= plan.max_participants;
  const isFav = favoriteIds.has(plan.id);
  const canAddNote = (plan.status === 'completed' || isJoined) && currentUser;
  
  const ratingsRes = await loadPlanRatings(planId);
  const ratingsStats = ratingsRes?.stats || null;
  const ratingsList = ratingsRes?.ratings || [];
  const hasMyRating = currentUser && ratingsList.some(r => r.user_id === currentUser.id);
  const canRate = plan.status === 'completed' && isJoined && !isCreator && currentUser && !hasMyRating;
  
  const hasUpdates = plan.updates && plan.updates.length > 0;
  const latestUpdate = plan.latest_update;
  const isCancelled = plan.status === 'cancelled';
  const canEdit = isCreator && plan.status === 'recruiting' && new Date(plan.start_time) > new Date();
  const canCancel = isCreator && plan.status === 'recruiting' && new Date(plan.start_time) > new Date();

  const now = new Date();
  const startTime = new Date(plan.start_time);
  const diffMinutes = (now - startTime) / (1000 * 60);
  const canCheckin = isJoined && diffMinutes >= -30 && diffMinutes <= 30 && plan.status !== 'cancelled';
  const myParticipant = plan.participants?.find(p => Number(p.id) === Number(currentUser?.id));
  const hasCheckedIn = myParticipant?.is_checked_in || false;
  const checkinTimeBefore = new Date(startTime.getTime() - 30 * 60 * 1000);
  const checkinTimeAfter = new Date(startTime.getTime() + 30 * 60 * 1000);
  const formatCheckinTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const checkinWindowText = `${formatCheckinTime(checkinTimeBefore)} - ${formatCheckinTime(checkinTimeAfter)}`;

  const participantsHtml = (plan.participants || []).map(p => {
    const isMe = currentUser && Number(p.id) === Number(currentUser.id);
    const checkedInBadge = p.is_checked_in ? '<span class="checked-in-badge" title="已签到">✓</span>' : '';
    return `
    <div class="participant-item" data-user-id="${p.id}">
      <div class="participant-item-avatar ${p.is_checked_in ? 'avatar-checked-in' : ''}">
        ${p.avatar || '👤'}
        ${checkedInBadge}
      </div>
      <div class="participant-item-info">
        <span class="participant-item-name">
          ${p.username}
          ${p.is_checked_in ? '<span class="checked-in-label">已签到</span>' : ''}
        </span>
        <span class="participant-item-role ${p.role === 'creator' ? 'creator' : ''}">
          ${p.role === 'creator' ? '🌟 创建者' : '成员'}
        </span>
      </div>
      ${!isMe ? `
        <button class="participant-follow-btn" 
                data-user-id="${p.id}"
                data-follow-text="+ 关注"
                data-following-text="已关注">
          加载中...
        </button>
      ` : ''}
    </div>
  `}).join('');

  const notesHtml = (plan.notes && plan.notes.length > 0) ? plan.notes.map(n => {
    const isMyNote = n.author_id === currentUser?.id;
    const commentsCount = n.comments_count || 0;
    const latestComments = n.latest_comments || [];
    
    return `
      <div class="note-card" data-note-id="${n.id}">
        <div class="note-header">
          <div class="note-author">
            <div class="note-author-avatar">${n.author_avatar || '👤'}</div>
            <span class="note-author-name">${n.author_name}</span>
          </div>
          <div class="note-actions">
            ${isMyNote ? `
              <button class="note-action-btn" onclick="event.stopPropagation(); editNote(${n.id}, '${n.title.replace(/'/g, "\\'")}', '${(n.content || '').replace(/'/g, "\\'")}', '${(n.location || '').replace(/'/g, "\\'")}')">✏️ 编辑</button>
              <button class="note-action-btn" onclick="event.stopPropagation(); deleteNote(${n.id})">🗑️ 删除</button>
            ` : ''}
          </div>
        </div>
        <h4 class="note-title">${n.title}</h4>
        <p class="note-content">${n.content || '暂无内容'}</p>
        
        ${latestComments.length > 0 ? `
          <div class="note-comments-preview">
            ${latestComments.slice(0, 2).map(c => `
              <div class="comment-preview">
                <span class="comment-preview-user">${c.author_name}:</span>
                <span class="comment-preview-content">${c.content.length > 30 ? c.content.slice(0, 30) + '...' : c.content}</span>
              </div>
            `).join('')}
            ${commentsCount > 2 ? `<div class="more-comments">还有 ${commentsCount - 2} 条评论...</div>` : ''}
          </div>
        ` : ''}
        
        <div class="note-footer">
          ${n.location ? `<span class="note-location">📍 ${n.location}</span>` : '<span></span>'}
          <div class="note-stats">
            <span class="note-likes" onclick="event.stopPropagation(); likeNote(${n.id}, this)">
              ❤️ <span class="likes-num">${n.likes || 0}</span>
            </span>
            <span class="note-comments-btn" onclick="event.stopPropagation(); openCommentDiscussion(${n.id})">
              💬 <span>${commentsCount}</span>
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('') : `
    <div class="empty-state" style="padding: 30px;">
      <div class="empty-state-icon" style="font-size:48px;">📝</div>
      <h3>还没有路线笔记</h3>
      <p>完成Citywalk后，和伙伴们一起共创笔记吧！</p>
    </div>
  `;

  const content = `
    <div class="detail-body">
      <div class="detail-header">
        <div class="detail-title-row">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
              <span class="plan-theme-badge" style="background: ${theme.color}15; color: ${theme.color}">
                ${theme.icon} ${theme.name}
              </span>
              ${renderDifficultyBadge(plan.difficulty_level)}
              <span class="status-badge ${status.cls}">${status.text}</span>
              <button class="plan-favorite ${isFav ? 'active' : ''}" 
                      style="position:static;"
                      onclick="toggleFavorite(${plan.id}, this)">
                ${isFav ? '⭐' : '☆'}
              </button>
            </div>
            <h2 class="detail-title">${plan.title}</h2>
            ${hasUpdates ? `
              <div class="plan-update-badge" onclick="toggleUpdateSummary()">
                <span class="update-icon">📝</span>
                <span class="update-text">计划已更新</span>
                <span class="update-time">${formatCommentTime(latestUpdate.created_at)}</span>
                <span class="update-toggle">▼</span>
              </div>
            ` : ''}
            ${isCancelled && plan.cancel_reason ? `
              <div class="plan-cancel-reason">
                <span class="cancel-icon">🚫</span>
                <span class="cancel-label">取消原因：</span>
                <span class="cancel-text">${plan.cancel_reason}</span>
              </div>
            ` : ''}
            ${ratingsStats && ratingsStats.count > 0 ? `
              <div class="plan-rating-badge">
                <span class="plan-rating-score">${ratingsStats.avg_overall.toFixed(1)}</span>
                <span class="plan-rating-stars">${renderStars(ratingsStats.avg_overall)}</span>
                <span class="plan-rating-count">${ratingsStats.count} 评</span>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="detail-meta-grid">
          <div class="detail-meta-card">
            <div class="detail-meta-label">城市</div>
            <div class="detail-meta-value">📍 ${plan.city}</div>
          </div>
          <div class="detail-meta-card">
            <div class="detail-meta-label">开始时间</div>
            <div class="detail-meta-value">⏰ ${formatDateTime(plan.start_time)}</div>
          </div>
          <div class="detail-meta-card">
            <div class="detail-meta-label">时长</div>
            <div class="detail-meta-value">⏱️ ${plan.duration_hours}小时</div>
          </div>
          <div class="detail-meta-card">
            <div class="detail-meta-label">人数</div>
            <div class="detail-meta-value">👥 ${plan.current_participants}/${plan.max_participants}</div>
          </div>
          <div class="detail-meta-card">
            <div class="detail-meta-label">集合点</div>
            <div class="detail-meta-value">📍 ${plan.meeting_point || '待定'}</div>
          </div>
          <div class="detail-meta-card">
            <div class="detail-meta-label">难度等级</div>
            <div class="detail-meta-value">${renderDifficultyBadge(plan.difficulty_level)}</div>
          </div>
          <div class="detail-meta-card">
            <div class="detail-meta-label">创建者</div>
            <div class="detail-meta-value">${plan.creator?.avatar || ''} ${plan.creator?.username}</div>
          </div>
        </div>
      </div>

      ${buildWeatherPanelHtml(plan)}

      <div class="detail-description">
        <h3>📖 路线描述</h3>
        <p>${plan.description || '暂无详细描述'}</p>
      </div>

      ${hasUpdates ? `
        <div class="detail-section" id="updateSummarySection" style="display: none;">
          <h3>📝 更新历史 (${plan.updates.length})</h3>
          <div class="updates-list">
            ${plan.updates.map(u => `
              <div class="update-item">
                <div class="update-item-header">
                  <div class="update-item-user">
                    <span class="update-item-avatar">${u.updater_avatar || '👤'}</span>
                    <span class="update-item-name">${u.updater_name || '创建者'}</span>
                  </div>
                  <span class="update-item-time">${formatCommentTime(u.created_at)}</span>
                </div>
                <div class="update-item-changes">
                  ${renderChangesSummary(u)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${isCreator || isJoined ? `
        <div class="detail-section checkin-section">
          <h3>✅ 活动签到</h3>
          <div class="checkin-info">
            <div class="checkin-window">
              <span class="checkin-icon">⏰</span>
              <span>签到时间：${checkinWindowText}（活动开始前后30分钟内）</span>
            </div>
            <div class="checkin-stats">
              <span class="checkin-stat-item">
                <span class="checkin-stat-num checked">${plan.participants?.filter(p => p.is_checked_in).length || 0}</span>
                <span class="checkin-stat-label">已签到</span>
              </span>
              <span class="checkin-stat-item">
                <span class="checkin-stat-num pending">${plan.participants?.filter(p => !p.is_checked_in).length || 0}</span>
                <span class="checkin-stat-label">未签到</span>
              </span>
            </div>
          </div>
          ${isCreator ? `
            <button class="btn btn-outline" onclick="openCheckinManager(${plan.id})">
              👥 查看签到详情
            </button>
          ` : ''}
        </div>
      ` : ''}

      <div class="detail-section">
        <h3>👥 参与搭子 (${plan.participants?.length || 0})</h3>
        <div class="participants-list">${participantsHtml}</div>
      </div>

      <div class="detail-section">
        <div class="detail-tabs">
          <div class="detail-tab ${currentDetailTab === 'notes' ? 'active' : ''}" data-tab="notes" onclick="switchDetailTab('notes')">
            ✨ 路线笔记 (${plan.notes?.length || 0})
          </div>
          <div class="detail-tab ${currentDetailTab === 'messages' ? 'active' : ''}" data-tab="messages" onclick="switchDetailTab('messages')">
            💬 群组留言 (<span id="messageCount">0</span>)
          </div>
          <div class="detail-tab ${currentDetailTab === 'photos' ? 'active' : ''}" data-tab="photos" onclick="switchDetailTab('photos')">
            📸 照片墙 (<span id="photoCount">0</span>)
          </div>
          <div class="detail-tab ${currentDetailTab === 'guide' ? 'active' : ''}" data-tab="guide" onclick="switchDetailTab('guide')">
            🗺️ 路线攻略
          </div>
        </div>
        
        <div id="notesTabContent" class="tab-content ${currentDetailTab === 'notes' ? 'active' : ''}" style="display: ${currentDetailTab === 'notes' ? 'block' : 'none'};">
          <div style="display:flex;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;">路线笔记</h3>
            ${canAddNote ? `<button class="btn btn-primary" style="margin-left:auto;font-size:12px;padding:6px 14px;" 
                    onclick="openNoteModal(${plan.id})">＋ 添加笔记</button>` : ''}
          </div>
          <div class="notes-list">${notesHtml}</div>
        </div>
        
        <div id="messagesTabContent" class="tab-content" style="display: ${currentDetailTab === 'messages' ? 'block' : 'none'};">
          <div class="messages-container">
            <div id="messagesList" class="messages-list">
              <div class="empty-state" style="padding: 30px;">
                <div class="empty-state-icon" style="font-size:48px;">💬</div>
                <h3>暂无留言</h3>
                <p>${isJoined || isCreator ? '快来发送第一条消息，和搭子们聊聊吧！' : '加入计划后即可参与讨论'}</p>
              </div>
            </div>
            ${(isJoined || isCreator) && currentUser ? `
              <div class="message-input-wrapper">
                <div class="message-input-area">
                  <textarea id="messageInput" class="message-input" 
                            placeholder="说点什么吧，最多500字..." 
                            maxlength="500"
                            onkeydown="handleMessageKeydown(event)"></textarea>
                  <div class="message-input-actions">
                    <span id="messageCharCount" class="message-char-count">0/500</span>
                    <button id="sendMessageBtn" class="btn btn-primary message-send-btn" onclick="sendPlanMessage()">
                      📨 发送
                    </button>
                  </div>
                </div>
              </div>
            ` : `
              <div class="messages-join-hint">
                <span>🔒 加入计划后即可参与群组讨论</span>
              </div>
            `}
          </div>
        </div>
        
        <div id="photosTabContent" class="tab-content ${currentDetailTab === 'photos' ? 'active' : ''}" style="display: ${currentDetailTab === 'photos' ? 'block' : 'none'};">
          <div style="display:flex;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;">照片墙</h3>
            ${isJoined && currentUser ? `<button class="btn btn-primary" style="margin-left:auto;font-size:12px;padding:6px 14px;" 
                    onclick="openUploadPhotoModal(${plan.id})">📷 上传照片</button>` : ''}
          </div>
          <div id="photosWallContainer">
            <div class="empty-state" style="padding: 30px;">
              <div class="empty-state-icon" style="font-size:48px;">📸</div>
              <h3>暂无照片</h3>
              <p>${isJoined ? '点击上方按钮上传你的Citywalk精彩瞬间吧！' : '加入活动后即可上传照片'}</p>
            </div>
          </div>
        </div>
        
        <div id="guideTabContent" class="tab-content" style="display: ${currentDetailTab === 'guide' ? 'block' : 'none'};">
          <div id="guideTabInner">
            <div class="empty-state" style="padding: 30px;">
              <div class="empty-state-icon" style="font-size:48px;">🗺️</div>
              <h3>加载中...</h3>
            </div>
          </div>
        </div>
      </div>
      
      <div class="detail-section">
        <h3>⭐ 活动评分 (${ratingsStats?.count || 0})
          ${canRate ? `<button class="btn btn-primary" style="margin-left:auto;font-size:12px;padding:6px 14px;" 
                  onclick="ratePlanFromDetail(${plan.id}, '${plan.title.replace(/'/g, "\\'")}')">📝 去评分</button>` : ''}
          ${hasMyRating ? '<span style="margin-left:auto;font-size:12px;color:#10b981;">✓ 你已评分</span>' : ''}
        </h3>
        ${renderRatingInfoCard(ratingsStats)}
        ${ratingsStats && ratingsStats.distribution ? renderRatingDistribution(ratingsStats.distribution, ratingsStats.count) : ''}
        ${renderRatingList(ratingsList)}
      </div>

      <div class="detail-actions">
        ${plan.status === 'recruiting' ? (
          isJoined ? `
            ${canCheckin && !hasCheckedIn ? `<button class="btn btn-primary btn-checkin" onclick="checkinPlan(${plan.id})">✅ 立即签到</button>` : ''}
            ${hasCheckedIn ? `<button class="btn btn-outline" disabled>✓ 已签到</button>` : ''}
            ${!canCheckin && isJoined && !hasCheckedIn && plan.status !== 'completed' ? `<button class="btn btn-outline" disabled title="签到时间：${checkinWindowText}">⏰ ${diffMinutes < -30 ? '签到未开始' : '签到已结束'}</button>` : ''}
            ${!isCreator ? `<button class="btn btn-outline" onclick="leavePlan(${plan.id})">🚪 退出计划</button>` : ''}
            ${isCreator ? `
              <button class="btn btn-outline" onclick="openEditPlanModal(${plan.id})">✏️ 编辑计划</button>
              <button class="btn btn-outline" style="color: var(--danger); border-color: var(--danger);" onclick="openCancelPlanModal(${plan.id})">🚫 取消活动</button>
              <button class="btn btn-primary" onclick="completePlan(${plan.id})">✅ 标记完成</button>
            ` : ''}
          ` : (
            isFull ? 
              `<button class="btn btn-outline" disabled>👥 人数已满</button>` :
              `<button class="btn btn-primary" onclick="joinPlan(${plan.id})">🤝 加入计划</button>`
          )
        ) : ''}
        ${plan.status === 'completed' && hasCheckedIn ? `<button class="btn btn-outline" disabled>✓ 已签到</button>` : ''}
        ${isCancelled ? `<button class="btn btn-outline" disabled>🚫 已取消</button>` : ''}
        <button class="btn btn-outline" onclick="closeDetailModal()">关闭</button>
      </div>
    </div>
  `;

  document.getElementById('planDetailContent').innerHTML = content;
  document.getElementById('planDetailModal').classList.remove('hidden');

  loadWeatherForPlan();
  
  const followBtns = document.querySelectorAll('#planDetailModal .participant-follow-btn');
  followBtns.forEach(async (btn) => {
    const userId = btn.dataset.userId;
    const isFollowing = await checkFollowStatus(userId);
    if (isFollowing) {
      btn.classList.add('following');
      btn.textContent = btn.dataset.followingText || '已关注';
    } else {
      btn.textContent = btn.dataset.followText || '+ 关注';
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFollow(userId, btn);
    });
  });

  currentDetailPlanId = planId;
  if (currentUser) {
    api(`${API}/users/${currentUser.id}/browsed-plans`, {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId })
    });
  }
  if (currentDetailTab === 'photos') {
    loadPlanPhotos(planId);
  }
  if (currentDetailTab === 'messages') {
    loadPlanMessages(planId);
  }
  startMessagePolling(planId);
  initMessageInput();
}

async function joinPlan(planId) {
  if (!currentUser) return;
  const res = await api(`${API}/plans/${planId}/join`, {
    method: 'POST',
    body: JSON.stringify({ user_id: currentUser.id })
  });
  if (res.success) {
    showToast('成功加入！快去认识你的搭子吧 🎉', 'success');
    closeDetailModal();
    refreshCurrentTab();

    if (res.plan && res.plan.new_badges && res.plan.new_badges.length > 0) {
      showBadgeUnlockToast(res.plan.new_badges);
    }
  } else {
    showToast(res.error || '加入失败', 'error');
  }
}

async function leavePlan(planId) {
  if (!confirm('确定要退出这个计划吗？')) return;
  const res = await api(`${API}/plans/${planId}/leave`, {
    method: 'POST',
    body: JSON.stringify({ user_id: currentUser.id })
  });
  if (res.success) {
    showToast('已退出计划', 'info');
    closeDetailModal();
    refreshCurrentTab();
  } else {
    showToast(res.error || '退出失败', 'error');
  }
}

async function completePlan(planId) {
  if (!confirm('确定要标记这个Citywalk为已完成吗？完成后大家就可以添加路线笔记了！')) return;
  const res = await api(`${API}/plans/${planId}/complete`, { method: 'POST' });
  if (res.success) {
    showToast('已标记为完成，开始和搭子们共创笔记吧！✨', 'success');
    closeDetailModal();
    refreshCurrentTab();
  } else {
    showToast(res.error || '操作失败', 'error');
  }
}

async function checkinPlan(planId) {
  if (!currentUser) return;
  const res = await api(`${API}/plans/${planId}/checkin`, {
    method: 'POST',
    body: JSON.stringify({ user_id: currentUser.id })
  });
  if (res.success) {
    showToast('签到成功！🎉 祝你Citywalk愉快~', 'success');
    if (currentDetailPlanId === planId) {
      openPlanDetail(planId);
    }

    if (res.new_badges && res.new_badges.length > 0) {
      showBadgeUnlockToast(res.new_badges);
    }
  } else {
    showToast(res.error || '签到失败', 'error');
  }
}

let currentCheckinTab = 'checked_in';

async function openCheckinManager(planId) {
  const res = await api(`${API}/plans/${planId}/checkins`);
  if (!res.success) {
    showToast('加载签到信息失败', 'error');
    return;
  }

  const data = res;
  const plan = currentDetailPlan;

  const renderList = (list, checkedIn) => {
    if (list.length === 0) {
      return `
        <div class="empty-state" style="padding: 30px;">
          <div class="empty-state-icon" style="font-size: 48px;">${checkedIn ? '✅' : '⏳'}</div>
          <h3>${checkedIn ? '暂无已签到人员' : '所有人都已签到'}</h3>
        </div>
      `;
    }
    return list.map(p => `
      <div class="checkin-list-item">
        <div class="checkin-item-avatar ${p.checkin_time ? 'avatar-checked-in' : ''}">
          ${p.avatar || '👤'}
          ${p.checkin_time ? '<span class="checked-in-badge" title="已签到">✓</span>' : ''}
        </div>
        <div class="checkin-item-info">
          <span class="checkin-item-name">
            ${p.username}
            ${p.role === 'creator' ? '<span class="participant-item-role creator">🌟 创建者</span>' : ''}
          </span>
          ${p.checkin_time ? `
            <span class="checkin-item-time">
              🕐 ${new Date(p.checkin_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ` : `
            <span class="checkin-item-time pending">
              ⏳ 待签到
            </span>
          `}
        </div>
      </div>
    `).join('');
  };

  const content = `
    <div class="checkin-manager">
      <div class="checkin-manager-header">
        <h3>✅ 签到管理 - ${plan?.title || '活动'}</h3>
        <div class="checkin-manager-stats">
          <span>已签到: <strong>${data.stats.checked_in_count}</strong></span>
          <span>未签到: <strong>${data.stats.not_checked_in_count}</strong></span>
          <span>总计: <strong>${data.stats.total}</strong></span>
        </div>
      </div>
      <div class="checkin-manager-tabs">
        <div class="checkin-tab ${currentCheckinTab === 'checked_in' ? 'active' : ''}" onclick="switchCheckinTab('checked_in', ${planId})">
          ✅ 已签到 (${data.stats.checked_in_count})
        </div>
        <div class="checkin-tab ${currentCheckinTab === 'not_checked_in' ? 'active' : ''}" onclick="switchCheckinTab('not_checked_in', ${planId})">
          ⏳ 未签到 (${data.stats.not_checked_in_count})
        </div>
      </div>
      <div class="checkin-manager-content">
        ${currentCheckinTab === 'checked_in' ? renderList(data.checked_in, true) : renderList(data.not_checked_in, false)}
      </div>
      <div class="checkin-manager-footer">
        <button class="btn btn-outline" onclick="closeCheckinManager()">关闭</button>
      </div>
    </div>
  `;

  document.getElementById('checkinManagerContent').innerHTML = content;
  document.getElementById('checkinManagerModal').classList.remove('hidden');
}

function switchCheckinTab(tab, planId) {
  currentCheckinTab = tab;
  openCheckinManager(planId);
}

function closeCheckinManager() {
  document.getElementById('checkinManagerModal').classList.add('hidden');
}

function closeDetailModal() {
  document.getElementById('planDetailModal').classList.add('hidden');
  currentDetailPlanId = null;
  currentDetailPlan = null;
  currentPlanPhotos = [];
  currentPlanMessages = [];
  stopMessagePolling();
  lastMessageTimestamp = null;
}

function switchDetailTab(tab) {
  currentDetailTab = tab;
  document.querySelectorAll('.detail-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.getElementById('notesTabContent').style.display = tab === 'notes' ? 'block' : 'none';
  document.getElementById('messagesTabContent').style.display = tab === 'messages' ? 'block' : 'none';
  document.getElementById('photosTabContent').style.display = tab === 'photos' ? 'block' : 'none';
  document.getElementById('guideTabContent').style.display = tab === 'guide' ? 'block' : 'none';
  
  if (tab === 'photos' && currentDetailPlanId) {
    loadPlanPhotos(currentDetailPlanId);
  }
  if (tab === 'guide' && currentDetailPlanId) {
    loadGuideTab(currentDetailPlanId);
  }
  if (tab === 'messages' && currentDetailPlanId) {
    loadPlanMessages(currentDetailPlanId);
  }
}

async function loadPlanPhotos(planId) {
  const params = new URLSearchParams();
  if (currentUser) params.set('user_id', currentUser.id);
  
  const res = await api(`${API}/plans/${planId}/photos?${params}`);
  if (res.success) {
    currentPlanPhotos = res.photos;
    document.getElementById('photoCount').textContent = res.total || 0;
    renderPhotoWall(res.photos);
  }
}

function renderPhotoWall(photos) {
  const container = document.getElementById('photosWallContainer');
  if (!photos || photos.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px;">
        <div class="empty-state-icon" style="font-size:48px;">📸</div>
        <h3>暂无照片</h3>
        <p>上传你的Citywalk精彩瞬间吧！</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="photo-wall-grid">
      ${photos.map(ph => {
        const isMyPhoto = currentUser && ph.user_id === currentUser.id;
        return `
          <div class="photo-wall-item" data-photo-id="${ph.id}">
            <div class="photo-wall-image">
              <img src="${ph.image_url}" alt="活动照片" onerror="this.src='https://picsum.photos/400/300?random=${ph.id}'">
            </div>
            ${ph.caption ? `<div class="photo-wall-caption">${ph.caption}</div>` : ''}
            <div class="photo-wall-footer">
              <div class="photo-wall-author">
                <span class="photo-wall-avatar">${ph.author_avatar || '👤'}</span>
                <span class="photo-wall-name">${ph.author_name}</span>
                ${ph.location ? `<span class="photo-wall-location">📍 ${ph.location}</span>` : ''}
              </div>
              <div class="photo-wall-actions">
                <span class="photo-like-btn ${ph.is_liked ? 'liked' : ''}" 
                      onclick="event.stopPropagation(); likePhoto(${ph.id}, this)">
                  ${ph.is_liked ? '❤️' : '🤍'} <span class="likes-count">${ph.likes || 0}</span>
                </span>
                ${isMyPhoto ? `
                  <span class="photo-delete-btn" onclick="event.stopPropagation(); deletePhoto(${ph.id})">
                    🗑️
                  </span>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function loadPlanMessages(planId) {
  const res = await api(`${API}/plans/${planId}/messages`);
  if (res.success) {
    currentPlanMessages = res.messages;
    const countEl = document.getElementById('messageCount');
    if (countEl) countEl.textContent = res.messages.length;
    renderPlanMessages(res.messages);
    if (res.messages.length > 0) {
      lastMessageTimestamp = res.messages[res.messages.length - 1].created_at;
    }
  }
}

function renderPlanMessages(messages) {
  const container = document.getElementById('messagesList');
  if (!container) return;

  if (!messages || messages.length === 0) {
    const isJoined = currentDetailPlan?.participants?.some(p => Number(p.id) === Number(currentUser?.id));
    const isCreator = Number(currentDetailPlan?.creator_id) === Number(currentUser?.id);
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px;">
        <div class="empty-state-icon" style="font-size:48px;">💬</div>
        <h3>暂无留言</h3>
        <p>${isJoined || isCreator ? '快来发送第一条消息，和搭子们聊聊吧！' : '加入计划后即可参与讨论'}</p>
      </div>
    `;
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let lastDateStr = '';
  let html = '';

  messages.forEach(msg => {
    const msgDate = new Date(msg.created_at);
    const msgDateOnly = new Date(msgDate);
    msgDateOnly.setHours(0, 0, 0, 0);
    let dateStr = '';
    if (msgDateOnly.getTime() === today.getTime()) {
      dateStr = '今天';
    } else if (msgDateOnly.getTime() === yesterday.getTime()) {
      dateStr = '昨天';
    } else {
      dateStr = `${msgDate.getMonth() + 1}月${msgDate.getDate()}日`;
    }

    if (dateStr !== lastDateStr) {
      html += `
        <div class="message-date-divider">
          <span>${dateStr}</span>
        </div>
      `;
      lastDateStr = dateStr;
    }

    const isMine = currentUser && Number(msg.sender_id) === Number(currentUser.id);
    const timeStr = `${String(msgDate.getHours()).padStart(2, '0')}:${String(msgDate.getMinutes()).padStart(2, '0')}`;

    html += `
      <div class="message-item ${isMine ? 'mine' : ''}" data-message-id="${msg.id}">
        <div class="message-avatar">${msg.sender_avatar || '👤'}</div>
        <div class="message-body">
          <div class="message-header">
            <span class="message-sender-name">${msg.sender_name}</span>
            <span class="message-time">${timeStr}</span>
          </div>
          <div class="message-content">${escapeHtml(msg.content)}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  scrollMessagesToBottom();
}

function scrollMessagesToBottom() {
  const container = document.getElementById('messagesList');
  if (container) {
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 50);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatCommentTime(str) {
  if (!str) return '';
  const d = new Date(str);
  const now = new Date();
  const diff = now - d;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function initMessageInput() {
  const input = document.getElementById('messageInput');
  const charCount = document.getElementById('messageCharCount');
  if (input && charCount) {
    input.addEventListener('input', () => {
      const len = input.value.length;
      charCount.textContent = `${len}/500`;
      charCount.style.color = len > 450 ? 'var(--danger)' : len > 400 ? 'var(--warning)' : 'var(--text-light)';
    });
  }
}

function handleMessageKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendPlanMessage();
  }
}

async function sendPlanMessage() {
  if (!currentUser || !currentDetailPlanId) return;

  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendMessageBtn');
  if (!input) return;

  const content = input.value.trim();
  if (!content) {
    showToast('消息内容不能为空', 'error');
    return;
  }
  if (content.length > 500) {
    showToast('消息内容不能超过500字', 'error');
    return;
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = '发送中...';
  }

  try {
    const res = await api(`${API}/plans/${currentDetailPlanId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: currentUser.id,
        content: content
      })
    });

    if (res.success) {
      input.value = '';
      const charCount = document.getElementById('messageCharCount');
      if (charCount) {
        charCount.textContent = '0/500';
        charCount.style.color = 'var(--text-light)';
      }
      await loadPlanMessages(currentDetailPlanId);
    } else {
      showToast(res.error || '发送失败', 'error');
    }
  } catch (e) {
    showToast('发送失败，请重试', 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = '📨 发送';
    }
  }
}

function startMessagePolling(planId) {
  stopMessagePolling();
  messagePollingTimer = setInterval(async () => {
    if (!currentDetailPlanId || currentDetailTab !== 'messages') return;
    try {
      const res = await api(`${API}/plans/${planId}/messages`);
      if (res.success) {
        const countEl = document.getElementById('messageCount');
        if (countEl) countEl.textContent = res.messages.length;

        const newMessages = res.messages;
        const oldLen = currentPlanMessages.length;
        
        if (newMessages.length !== oldLen) {
          currentPlanMessages = newMessages;
          renderPlanMessages(newMessages);
          if (newMessages.length > 0) {
            lastMessageTimestamp = newMessages[newMessages.length - 1].created_at;
          }
        } else {
          let hasChange = false;
          for (let i = 0; i < oldLen; i++) {
            if (currentPlanMessages[i]?.id !== newMessages[i]?.id) {
              hasChange = true;
              break;
            }
          }
          if (hasChange) {
            currentPlanMessages = newMessages;
            renderPlanMessages(newMessages);
          }
        }
      }
    } catch (e) {
    }
  }, 3000);
}

function stopMessagePolling() {
  if (messagePollingTimer) {
    clearInterval(messagePollingTimer);
    messagePollingTimer = null;
  }
}

function openUploadPhotoModal(planId) {
  document.getElementById('uploadPhotoPlanId').value = planId;
  document.getElementById('uploadPhotoUrl').value = '';
  document.getElementById('uploadPhotoCaption').value = '';
  document.getElementById('uploadPhotoLocation').value = '';
  document.getElementById('uploadPhotoModal').classList.remove('hidden');
}

function closeUploadPhotoModal() {
  document.getElementById('uploadPhotoModal').classList.add('hidden');
}

async function uploadPhoto() {
  const planId = document.getElementById('uploadPhotoPlanId').value;
  const imageUrl = document.getElementById('uploadPhotoUrl').value.trim();
  const caption = document.getElementById('uploadPhotoCaption').value.trim();
  const location = document.getElementById('uploadPhotoLocation').value.trim();

  if (!imageUrl) {
    showToast('请输入照片链接', 'error');
    return;
  }

  const res = await api(`${API}/photos`, {
    method: 'POST',
    body: JSON.stringify({
      plan_id: planId,
      user_id: currentUser.id,
      image_url: imageUrl,
      caption: caption,
      location: location
    })
  });

  if (res.success) {
    showToast('照片上传成功！✨', 'success');
    closeUploadPhotoModal();
    loadPlanPhotos(planId);

    if (res.photo && res.photo.new_badges && res.photo.new_badges.length > 0) {
      showBadgeUnlockToast(res.photo.new_badges);
    }
  } else {
    showToast(res.error || '上传失败', 'error');
  }
}

async function likePhoto(photoId, btn) {
  if (!currentUser) {
    showToast('请先登录', 'error');
    return;
  }

  const res = await api(`${API}/photos/${photoId}/like`, {
    method: 'POST',
    body: JSON.stringify({ user_id: currentUser.id })
  });

  if (res.success) {
    const countSpan = btn.querySelector('.likes-count');
    if (countSpan) countSpan.textContent = res.likes;
    if (res.is_liked) {
      btn.classList.add('liked');
      btn.innerHTML = `❤️ <span class="likes-count">${res.likes}</span>`;
    } else {
      btn.classList.remove('liked');
      btn.innerHTML = `🤍 <span class="likes-count">${res.likes}</span>`;
    }
  }
}

async function deletePhoto(photoId) {
  if (!confirm('确定要删除这张照片吗？')) return;

  const res = await api(`${API}/photos/${photoId}`, {
    method: 'DELETE',
    body: JSON.stringify({ user_id: currentUser.id })
  });

  if (res.success) {
    showToast('照片已删除', 'info');
    if (currentDetailPlanId) {
      loadPlanPhotos(currentDetailPlanId);
    }
  } else {
    showToast(res.error || '删除失败', 'error');
  }
}

function renderChangesSummary(update) {
  if (!update.changes || update.changes.length === 0) return '';
  
  const fieldLabels = {
    title: '标题',
    description: '路线描述',
    meeting_point: '集合地点',
    duration_hours: '活动时长'
  };
  
  const changes = update.changes.map(field => {
    const label = fieldLabels[field] || field;
    const oldVal = update.old_values[field];
    const newVal = update.new_values[field];
    
    if (field === 'duration_hours') {
      return `
        <div class="change-item">
          <span class="change-label">${label}</span>
          <span class="change-old">${oldVal}小时</span>
          <span class="change-arrow">→</span>
          <span class="change-new">${newVal}小时</span>
        </div>
      `;
    }
    
    return `
      <div class="change-item">
        <span class="change-label">${label}</span>
        <span class="change-old">${oldVal || '未设置'}</span>
        <span class="change-arrow">→</span>
        <span class="change-new">${newVal || '未设置'}</span>
      </div>
    `;
  }).join('');
  
  return changes;
}

function toggleUpdateSummary() {
  const section = document.getElementById('updateSummarySection');
  if (section) {
    if (section.style.display === 'none') {
      section.style.display = 'block';
      section.style.animation = 'fadeIn 0.3s ease';
    } else {
      section.style.display = 'none';
    }
  }
}

let currentEditPlanId = null;

async function openEditPlanModal(planId) {
  const res = await api(`${API}/plans/${planId}`);
  if (!res.success) {
    showToast('加载计划详情失败', 'error');
    return;
  }
  
  const plan = res.plan;
  currentEditPlanId = planId;
  
  document.getElementById('editPlanId').value = planId;
  document.getElementById('editPlanTitle').value = plan.title;
  document.getElementById('editPlanDuration').value = plan.duration_hours;
  document.getElementById('editPlanMeeting').value = plan.meeting_point || '';
  document.getElementById('editPlanDescription').value = plan.description || '';
  
  document.getElementById('editPlanModal').classList.remove('hidden');
}

function closeEditPlanModal() {
  document.getElementById('editPlanModal').classList.add('hidden');
  currentEditPlanId = null;
}

async function submitEditPlan(e) {
  e.preventDefault();
  if (!currentUser || !currentEditPlanId) return;
  
  const data = {
    user_id: currentUser.id,
    title: document.getElementById('editPlanTitle').value,
    duration_hours: parseFloat(document.getElementById('editPlanDuration').value),
    meeting_point: document.getElementById('editPlanMeeting').value,
    description: document.getElementById('editPlanDescription').value
  };
  
  const res = await api(`${API}/plans/${currentEditPlanId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  
  if (res.success) {
    showToast('计划已更新！✨', 'success');
    closeEditPlanModal();
    openPlanDetail(currentEditPlanId);
    refreshCurrentTab();
  } else {
    showToast(res.error || '更新失败', 'error');
  }
}

let currentCancelPlanId = null;

function openCancelPlanModal(planId) {
  currentCancelPlanId = planId;
  document.getElementById('cancelPlanReason').value = '';
  document.getElementById('cancelPlanModal').classList.remove('hidden');
}

function closeCancelPlanModal() {
  document.getElementById('cancelPlanModal').classList.add('hidden');
  currentCancelPlanId = null;
}

async function submitCancelPlan() {
  if (!currentUser || !currentCancelPlanId) return;
  
  const reason = document.getElementById('cancelPlanReason').value.trim();
  if (!reason) {
    showToast('请填写取消原因', 'error');
    return;
  }
  
  if (!confirm('确定要取消这个活动吗？取消后将通知所有参与者，且无法恢复。')) return;
  
  const res = await api(`${API}/plans/${currentCancelPlanId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: currentUser.id,
      reason: reason
    })
  });
  
  if (res.success) {
    showToast('活动已取消，已通知所有参与者', 'success');
    closeCancelPlanModal();
    closeDetailModal();
    refreshCurrentTab();
  } else {
    showToast(res.error || '取消失败', 'error');
  }
}

async function likeNote(noteId, el) {
  await api(`${API}/notes/${noteId}/like`, { method: 'POST' });
  const numEl = el.querySelector('.likes-num');
  numEl.textContent = parseInt(numEl.textContent) + 1;
  el.classList.add('liked');
}

function formatCommentTime(str) {
  if (!str) return '';
  const d = new Date(str);
  const now = new Date();
  const diff = now - d;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderComment(comment, depth = 0) {
  const isMyComment = comment.author_id === currentUser?.id;
  const hasReplies = comment.replies && comment.replies.length > 0;
  
  return `
    <div class="comment-item" data-comment-id="${comment.id}" style="margin-left: ${depth > 0 ? '24px' : '0'}">
      <div class="comment-header">
        <div class="comment-author">
          <div class="comment-avatar">${comment.author_avatar || '👤'}</div>
          <div class="comment-author-info">
            <span class="comment-author-name">${comment.author_name}</span>
            ${comment.reply_to_name ? `<span class="comment-reply-to">回复 <span class="reply-username">@${comment.reply_to_name}</span></span>` : ''}
            <span class="comment-time">${formatCommentTime(comment.created_at)}</span>
          </div>
        </div>
        <div class="comment-actions">
          <button class="comment-reply-btn" onclick="startReply(${comment.id}, '${comment.author_name.replace(/'/g, "\\'")}')">回复</button>
          ${isMyComment ? `<button class="comment-delete-btn" onclick="deleteComment(${comment.id})">删除</button>` : ''}
        </div>
      </div>
      <div class="comment-content">${comment.content}</div>
      ${hasReplies ? `
        <div class="comment-replies">
          ${comment.replies.map(r => renderComment(r, depth + 1)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderCommentsList(comments) {
  if (!comments || comments.length === 0) {
    return `
      <div class="empty-state" style="padding: 30px;">
        <div class="empty-state-icon" style="font-size:48px;">💬</div>
        <h3>还没有评论</h3>
        <p>快来发表第一条评论吧！</p>
      </div>
    `;
  }
  return comments.map(c => renderComment(c)).join('');
}

async function loadNoteComments(noteId) {
  const res = await api(`${API}/notes/${noteId}/comments`);
  if (res.success) {
    currentNoteComments = res.comments;
    return res;
  }
  return null;
}

async function submitComment(noteId, content, parentId = null) {
  if (!currentUser || !content.trim()) return null;
  
  const res = await api(`${API}/notes/${noteId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      author_id: currentUser.id,
      content: content.trim(),
      parent_id: parentId
    })
  });
  
  if (res.success) {
    showToast('评论发布成功！', 'success');

    if (res.comment && res.comment.new_badges && res.comment.new_badges.length > 0) {
      showBadgeUnlockToast(res.comment.new_badges);
    }

    return res.comment;
  } else {
    showToast(res.error || '评论失败', 'error');
    return null;
  }
}

async function deleteComment(commentId) {
  if (!confirm('确定要删除这条评论吗？') || !currentUser) return;
  
  const res = await api(`${API}/comments/${commentId}`, {
    method: 'DELETE',
    body: JSON.stringify({ user_id: currentUser.id })
  });
  
  if (res.success) {
    showToast('评论已删除', 'info');
    
    const removedCount = removeFromTree(currentNoteComments, commentId);
    if (removedCount > 0) {
      updateCommentCount(-removedCount);
    }
    
    const commentEl = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (commentEl) {
      const parentEl = commentEl.parentElement;
      commentEl.style.transition = 'opacity 0.2s ease-out, height 0.2s ease-out';
      commentEl.style.opacity = '0';
      commentEl.style.height = commentEl.offsetHeight + 'px';
      requestAnimationFrame(() => {
        commentEl.style.height = '0px';
        commentEl.style.margin = '0';
        commentEl.style.overflow = 'hidden';
      });
      setTimeout(() => {
        commentEl.remove();
        if (parentEl && parentEl.classList.contains('comment-replies') && parentEl.children.length === 0) {
          parentEl.remove();
        }
        const listContainer = document.getElementById('commentsListContainer');
        if (listContainer && listContainer.children.length === 0) {
          listContainer.innerHTML = `
            <div class="empty-state" style="padding: 30px;">
              <div class="empty-state-icon" style="font-size:48px;">💬</div>
              <h3>还没有评论</h3>
              <p>快来发表第一条评论吧！</p>
            </div>
          `;
        }
      }, 200);
    }
  } else {
    showToast(res.error || '删除失败', 'error');
  }
}

function startReply(commentId, userName) {
  if (!currentUser) {
    showToast('请先登录', 'error');
    return;
  }
  replyingToCommentId = commentId;
  replyingToUserName = userName;
  
  const replyIndicator = document.getElementById('replyIndicator');
  const replyInput = document.getElementById('replyCommentInput');
  if (replyIndicator) {
    replyIndicator.textContent = `回复 @${userName}:`;
    replyIndicator.classList.remove('hidden');
  }
  if (replyInput) {
    replyInput.focus();
    replyInput.placeholder = `回复 @${userName}...`;
  }
  
  const cancelReplyBtn = document.getElementById('cancelReplyBtn');
  if (cancelReplyBtn) {
    cancelReplyBtn.classList.remove('hidden');
  }
}

function cancelReply() {
  replyingToCommentId = null;
  replyingToUserName = '';
  
  const replyIndicator = document.getElementById('replyIndicator');
  const replyInput = document.getElementById('replyCommentInput');
  const cancelReplyBtn = document.getElementById('cancelReplyBtn');
  
  if (replyIndicator) replyIndicator.classList.add('hidden');
  if (replyInput) {
    replyInput.placeholder = '写下你的评论...';
    replyInput.value = '';
  }
  if (cancelReplyBtn) cancelReplyBtn.classList.add('hidden');
}

async function openCommentDiscussion(noteId) {
  if (!currentUser) {
    showToast('请先登录', 'error');
    return;
  }
  
  currentDiscussionNoteId = noteId;
  
  const noteRes = await api(`${API}/notes/${noteId}`);
  if (!noteRes.success) {
    showToast('加载笔记失败', 'error');
    return;
  }
  
  const note = noteRes.note;
  const commentsRes = await loadNoteComments(noteId);
  
  if (!commentsRes) return;
  
  currentCommentCount = commentsRes.total_count;
  
  const content = `
    <div class="comment-modal-body">
      <div class="discussion-note">
        <div class="note-header">
          <div class="note-author">
            <div class="note-author-avatar">${note.author_avatar || '👤'}</div>
            <div>
              <span class="note-author-name">${note.author_name}</span>
              <span class="note-time">${formatCommentTime(note.created_at)}</span>
            </div>
          </div>
        </div>
        <h4 class="note-title">${note.title}</h4>
        ${note.content ? `<p class="note-content-discussion">${note.content}</p>` : ''}
        <div class="note-footer">
          ${note.location ? `<span class="note-location">📍 ${note.location}</span>` : '<span></span>'}
          <span class="note-likes">❤️ ${note.likes || 0}</span>
        </div>
      </div>
      
      <div class="comments-section">
        <div class="comments-header">
          <h4>💬 评论 (<span id="commentCount">${currentCommentCount}</span>)</h4>
        </div>
        
        <div class="comment-input-section">
          <div class="reply-indicator hidden" id="replyIndicator"></div>
          <textarea id="replyCommentInput" placeholder="写下你的评论..." rows="3"></textarea>
          <div class="comment-input-actions">
            <button class="btn btn-outline hidden" id="cancelReplyBtn" onclick="cancelReply()">取消回复</button>
            <button class="btn btn-primary" onclick="handleCommentSubmit()">发表评论</button>
          </div>
        </div>
        
        <div class="comments-list" id="commentsListContainer">
          ${renderCommentsList(commentsRes.comments)}
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('commentModalContent').innerHTML = content;
  document.getElementById('commentModal').classList.remove('hidden');
  
  cancelReply();
}

function updateCommentCount(delta) {
  currentCommentCount += delta;
  const countEl = document.getElementById('commentCount');
  if (countEl) {
    countEl.textContent = currentCommentCount;
  }
}

function findCommentAndParent(comments, commentId, parent = null) {
  for (const c of comments) {
    if (c.id === commentId) return { comment: c, parent, list: comments };
    if (c.replies && c.replies.length > 0) {
      const found = findCommentAndParent(c.replies, commentId, c);
      if (found) return found;
    }
  }
  return null;
}

function getCommentDepth(comments, commentId, depth = 0) {
  for (const c of comments) {
    if (c.id === commentId) return depth;
    if (c.replies && c.replies.length > 0) {
      const found = getCommentDepth(c.replies, commentId, depth + 1);
      if (found !== -1) return found;
    }
  }
  return -1;
}

function insertCommentIntoTree(comment) {
  const newComment = { ...comment, replies: [] };
  
  if (!comment.parent_id) {
    currentNoteComments.push(newComment);
    return { isRoot: true, parentId: null, depth: 0 };
  }
  
  const found = findCommentAndParent(currentNoteComments, comment.parent_id);
  if (found) {
    if (!found.comment.replies) found.comment.replies = [];
    found.comment.replies.push(newComment);
    const depth = getCommentDepth(currentNoteComments, comment.id, 0);
    return { isRoot: false, parentId: comment.parent_id, depth };
  }
  
  currentNoteComments.push(newComment);
  return { isRoot: true, parentId: null, depth: 0 };
}

async function handleCommentSubmit() {
  const input = document.getElementById('replyCommentInput');
  const content = input.value;
  
  if (!content.trim()) {
    showToast('请输入评论内容', 'error');
    return;
  }
  
  const comment = await submitComment(currentDiscussionNoteId, content, replyingToCommentId);
  if (comment) {
    input.value = '';
    cancelReply();
    
    const result = insertCommentIntoTree(comment);
    updateCommentCount(1);
    
    const listContainer = document.getElementById('commentsListContainer');
    if (!listContainer) return;
    
    const emptyState = listContainer.querySelector('.empty-state');
    if (emptyState) {
      listContainer.innerHTML = '';
    }
    
    const newCommentHtml = renderComment(comment, result.depth);
    
    if (result.isRoot) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newCommentHtml.trim();
      const newEl = tempDiv.firstElementChild;
      newEl.style.animation = 'fadeIn 0.3s ease-out';
      listContainer.appendChild(newEl);
    } else {
      const parentEl = listContainer.querySelector(`.comment-item[data-comment-id="${result.parentId}"]`);
      if (parentEl) {
        let repliesContainer = parentEl.querySelector(':scope > .comment-replies');
        if (!repliesContainer) {
          repliesContainer = document.createElement('div');
          repliesContainer.className = 'comment-replies';
          parentEl.appendChild(repliesContainer);
        }
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newCommentHtml.trim();
        const newEl = tempDiv.firstElementChild;
        newEl.style.animation = 'fadeIn 0.3s ease-out';
        repliesContainer.appendChild(newEl);
      }
    }
  }
}

function countTreeComments(comments) {
  let count = 0;
  for (const c of comments) {
    count++;
    if (c.replies && c.replies.length > 0) {
      count += countTreeComments(c.replies);
    }
  }
  return count;
}

function removeFromTree(comments, commentId) {
  for (let i = 0; i < comments.length; i++) {
    if (comments[i].id === commentId) {
      const removed = countTreeComments([comments[i]]);
      comments.splice(i, 1);
      return removed;
    }
    if (comments[i].replies && comments[i].replies.length > 0) {
      const removed = removeFromTree(comments[i].replies, commentId);
      if (removed > 0) return removed;
    }
  }
  return 0;
}

function closeCommentModal() {
  document.getElementById('commentModal').classList.add('hidden');
  currentDiscussionNoteId = null;
  currentNoteComments = [];
  cancelReply();
}

async function loadNotifications() {
  if (!currentUser) return;
  
  const res = await api(`${API}/users/${currentUser.id}/notifications`);
  if (res.success) {
    renderNotifications(res.notifications);
    updateNotificationBadge(res.unread_count);
  }
}

async function loadUnreadNotificationCount() {
  if (!currentUser) return;
  
  const res = await api(`${API}/users/${currentUser.id}/notifications/unread`);
  if (res.success) {
    updateNotificationBadge(res.unread_count);
  }
}

function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderNotifications(notifications) {
  const list = document.getElementById('notificationList');
  if (!notifications || notifications.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <div style="font-size: 32px; opacity: 0.5;">🔔</div>
        <p style="color: var(--text-light);">暂无通知</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = notifications.map(n => {
    let typeText = '回复了你的评论';
    let icon = '📅';
    
    if (n.type === 'note_comment') {
      typeText = '评论了你的笔记';
      icon = '📝';
    } else if (n.type === 'plan_update') {
      typeText = '更新了计划';
      icon = '📝';
    } else if (n.type === 'plan_cancel') {
      typeText = '取消了计划';
      icon = '🚫';
    } else if (n.type === 'join_plan') {
      typeText = '加入了你的计划';
      icon = '🤝';
    }
    
    const relatedTitle = n.note_title || n.plan_title || '';
    
    return `
      <div class="notification-item ${n.is_read ? 'read' : 'unread'}" data-notification-id="${n.id}">
        <div class="notification-avatar">${n.from_user_avatar || '👤'}</div>
        <div class="notification-content">
          <div class="notification-text">
            <span class="notification-username">${n.from_user_name || '用户'}</span>
            <span>${typeText}</span>
          </div>
          <div class="notification-preview">${n.content}</div>
          ${relatedTitle ? `<div class="notification-related">${icon} ${relatedTitle}</div>` : ''}
          <div class="notification-time">${formatCommentTime(n.created_at)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  list.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', async () => {
      const notifId = item.dataset.notificationId;
      await api(`${API}/notifications/${notifId}/read`, { method: 'PUT' });
      item.classList.remove('unread');
      item.classList.add('read');
      loadUnreadNotificationCount();
    });
  });
}

async function markAllNotificationsRead() {
  if (!currentUser) return;
  await api(`${API}/users/${currentUser.id}/notifications/read-all`, { method: 'PUT' });
  loadNotifications();
}

function openNoteModal(planId, editId = null) {
  document.getElementById('notePlanId').value = planId;
  document.getElementById('noteEditId').value = editId || '';
  document.getElementById('noteModalTitle').textContent = editId ? '✏️ 编辑路线笔记' : '📝 添加路线笔记';
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteContent').value = '';
  document.getElementById('noteLocation').value = '';
  document.getElementById('noteModal').classList.remove('hidden');
}

function editNote(id, title, content, location) {
  openNoteModal(null, id);
  document.getElementById('noteTitle').value = title;
  document.getElementById('noteContent').value = content;
  document.getElementById('noteLocation').value = location;
}

async function deleteNote(noteId) {
  if (!confirm('确定要删除这条笔记吗？')) return;
  const res = await api(`${API}/notes/${noteId}`, { method: 'DELETE' });
  if (res.success) {
    showToast('笔记已删除', 'info');
    if (currentDiscussionNoteId === noteId) {
      closeCommentModal();
    }
    const planId = document.getElementById('notePlanId').value;
    if (planId) {
      openPlanDetail(planId);
    } else {
      refreshCurrentTab();
    }
  }
}

async function submitNote(e) {
  e.preventDefault();
  if (!currentUser) return;
  
  const editId = document.getElementById('noteEditId').value;
  const data = {
    title: document.getElementById('noteTitle').value,
    content: document.getElementById('noteContent').value,
    location: document.getElementById('noteLocation').value
  };
  
  let res;
  if (editId) {
    res = await api(`${API}/notes/${editId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  } else {
    res = await api(`${API}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        plan_id: document.getElementById('notePlanId').value,
        author_id: currentUser.id
      })
    });
  }
  
  if (res.success) {
    showToast(editId ? '笔记已更新！' : '笔记添加成功！✨', 'success');
    document.getElementById('noteModal').classList.add('hidden');
    const planId = document.getElementById('notePlanId').value;
    openPlanDetail(planId);

    if (!editId && res.note && res.note.new_badges && res.note.new_badges.length > 0) {
      showBadgeUnlockToast(res.note.new_badges);
    }
  } else {
    showToast(res.error || '保存失败', 'error');
  }
}

function renderStars(rating, size = 'normal') {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  let stars = '';
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars += '★';
    } else if (i === fullStars && hasHalf) {
      stars += '☆';
    } else {
      stars += '☆';
    }
  }
  return stars;
}

function initStarRatings() {
  document.querySelectorAll('.star-rating').forEach(container => {
    const type = container.dataset.ratingType;
    const stars = container.querySelectorAll('.star');
    
    stars.forEach((star, index) => {
      star.addEventListener('click', () => {
        const value = index + 1;
        currentRatings[type] = value;
        updateStarDisplay(container, value);
        updateRatingSummary();
      });
      
      star.addEventListener('mouseenter', () => {
        updateStarDisplay(container, index + 1, true);
      });
      
      star.addEventListener('mouseleave', () => {
        updateStarDisplay(container, currentRatings[type]);
      });
    });
  });
}

function updateStarDisplay(container, value, isHover = false) {
  const stars = container.querySelectorAll('.star');
  stars.forEach((star, index) => {
    if (index < value) {
      star.classList.add('active');
      star.textContent = '★';
    } else {
      star.classList.remove('active');
      star.textContent = '☆';
    }
  });
}

function updateRatingSummary() {
  const { route_design, organization, partner_fit } = currentRatings;
  const overall = (route_design + organization + partner_fit) / 3;
  
  const scoreEl = document.getElementById('ratingSummaryScore');
  const starsEl = document.getElementById('ratingSummaryStars');
  
  if (scoreEl && starsEl) {
    scoreEl.textContent = overall > 0 ? overall.toFixed(1) : '0.0';
    starsEl.textContent = renderStars(overall);
  }
}

function openRatingModal(planId, planTitle, planMeta) {
  if (!currentUser) {
    showToast('请先登录', 'error');
    return;
  }
  
  currentRatingPlanId = planId;
  currentRatings = { route_design: 0, organization: 0, partner_fit: 0 };
  
  document.getElementById('ratingPlanTitle').textContent = planTitle || '活动';
  document.getElementById('ratingPlanMeta').textContent = planMeta || '';
  document.getElementById('ratingComment').value = '';
  
  document.querySelectorAll('.star-rating').forEach(container => {
    updateStarDisplay(container, 0);
  });
  updateRatingSummary();
  
  document.getElementById('ratingModal').classList.remove('hidden');
  initStarRatings();
}

function closeRatingModal() {
  document.getElementById('ratingModal').classList.add('hidden');
  currentRatingPlanId = null;
  currentRatings = { route_design: 0, organization: 0, partner_fit: 0 };
}

function ratePlanFromDetail(planId, planTitle) {
  openRatingModal(planId, planTitle, '');
}

async function submitRating() {
  const { route_design, organization, partner_fit } = currentRatings;
  
  if (route_design === 0 || organization === 0 || partner_fit === 0) {
    showToast('请为所有维度评分', 'error');
    return;
  }
  
  const comment = document.getElementById('ratingComment').value;
  
  const res = await api(`${API}/plans/${currentRatingPlanId}/rate`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: currentUser.id,
      route_design,
      organization,
      partner_fit,
      comment
    })
  });
  
  if (res.success) {
    showToast('评分成功！感谢你的反馈 ✨', 'success');
    closeRatingModal();
    refreshCurrentTab();
  } else {
    showToast(res.error || '评分失败', 'error');
  }
}

async function loadPendingRatings() {
  if (!currentUser) return [];
  const res = await api(`${API}/users/${currentUser.id}/pending-ratings`);
  return res.success ? res.plans : [];
}

async function loadPlanRatings(planId) {
  const res = await api(`${API}/plans/${planId}/ratings`);
  return res.success ? res : null;
}

function renderRatingInfoCard(stats) {
  if (!stats || stats.count === 0) {
    return `
      <div class="rating-info-card">
        <div class="rating-info-main">
          <div class="rating-info-score">--</div>
          <div class="rating-info-stars">☆☆☆☆☆</div>
          <div class="rating-info-count">暂无评分</div>
        </div>
        <div class="rating-info-details">
          <div class="rating-detail-item">
            <span class="rating-detail-label">路线设计</span>
            <span class="rating-detail-stars">☆☆☆☆☆</span>
            <span class="rating-detail-value">--</span>
          </div>
          <div class="rating-detail-item">
            <span class="rating-detail-label">组织体验</span>
            <span class="rating-detail-stars">☆☆☆☆☆</span>
            <span class="rating-detail-value">--</span>
          </div>
          <div class="rating-detail-item">
            <span class="rating-detail-label">搭子契合</span>
            <span class="rating-detail-stars">☆☆☆☆☆</span>
            <span class="rating-detail-value">--</span>
          </div>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="rating-info-card">
      <div class="rating-info-main">
        <div class="rating-info-score">${stats.avg_overall.toFixed(1)}</div>
        <div class="rating-info-stars">${renderStars(stats.avg_overall)}</div>
        <div class="rating-info-count">${stats.count} 条评价</div>
      </div>
      <div class="rating-info-details">
        <div class="rating-detail-item">
          <span class="rating-detail-label">路线设计</span>
          <span class="rating-detail-stars">${renderStars(stats.avg_route_design)}</span>
          <span class="rating-detail-value">${stats.avg_route_design.toFixed(1)}</span>
        </div>
        <div class="rating-detail-item">
          <span class="rating-detail-label">组织体验</span>
          <span class="rating-detail-stars">${renderStars(stats.avg_organization)}</span>
          <span class="rating-detail-value">${stats.avg_organization.toFixed(1)}</span>
        </div>
        <div class="rating-detail-item">
          <span class="rating-detail-label">搭子契合</span>
          <span class="rating-detail-stars">${renderStars(stats.avg_partner_fit)}</span>
          <span class="rating-detail-value">${stats.avg_partner_fit.toFixed(1)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderRatingDistribution(distribution, totalCount) {
  const maxCount = Math.max(...Object.values(distribution), 1);
  
  let html = '<div class="rating-distribution"><h4>评分分布</h4>';
  for (let i = 5; i >= 1; i--) {
    const count = distribution[i] || 0;
    const percentage = totalCount > 0 ? (count / totalCount) * 100 : 0;
    html += `
      <div class="distribution-bar">
        <span class="distribution-star">${i}星</span>
        <div class="distribution-track">
          <div class="distribution-fill" style="width: ${percentage}%"></div>
        </div>
        <span class="distribution-count">${count}</span>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function renderRatingList(ratings) {
  if (!ratings || ratings.length === 0) {
    return '';
  }
  
  return `
    <div class="ratings-list-section">
      <h3>💬 大家的评价 (${ratings.length})</h3>
      ${ratings.map(r => `
        <div class="rating-card">
          <div class="rating-card-header">
            <div class="rating-card-avatar">${r.user?.avatar || '👤'}</div>
            <div class="rating-card-user-info">
              <div class="rating-card-username">${r.user?.username || '用户'}</div>
              <div class="rating-card-time">${formatCommentTime(r.created_at)}</div>
            </div>
            <div class="rating-card-stars">${renderStars(r.overall)}</div>
          </div>
          <div class="rating-card-scores">
            <div class="rating-card-score-item">
              <div class="rating-card-score-label">路线设计</div>
              <div class="rating-card-score-value">${r.route_design}分</div>
            </div>
            <div class="rating-card-score-item">
              <div class="rating-card-score-label">组织体验</div>
              <div class="rating-card-score-value">${r.organization}分</div>
            </div>
            <div class="rating-card-score-item">
              <div class="rating-card-score-label">搭子契合</div>
              <div class="rating-card-score-value">${r.partner_fit}分</div>
            </div>
          </div>
          ${r.comment ? `<div class="rating-card-comment">${r.comment}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function getFeedTypeLabel(type) {
  const labels = {
    create_plan: { text: '发布了新计划', icon: '📅', cls: 'create_plan' },
    join_plan: { text: '加入了活动', icon: '🤝', cls: 'join_plan' },
    complete_citywalk: { text: '完成了Citywalk', icon: '✅', cls: 'complete_citywalk' },
    create_note: { text: '写了笔记', icon: '📝', cls: 'create_note' },
    checkin: { text: '完成了签到', icon: '✓', cls: 'checkin' }
  };
  return labels[type] || { text: type, icon: '📌', cls: '' };
}

function renderFeedCard(feed) {
  const typeInfo = getFeedTypeLabel(feed.type);
  const theme = feed.related.theme ? getThemeInfo(feed.related.theme) : null;
  
  let title = '';
  let meta = '';
  let notePreview = '';
  
  if (feed.related.type === 'plan') {
    title = feed.related.title || '未命名计划';
    if (theme) {
      meta += `<span style="color:${theme.color}">${theme.icon} ${theme.name}</span>`;
    }
    if (feed.related.city) {
      meta += `<span>📍 ${feed.related.city}</span>`;
    }
  } else if (feed.related.type === 'note') {
    title = feed.related.title || '未命名笔记';
    if (feed.extra && feed.extra.plan_id) {
      meta += `<span>📅 关联的路线笔记</span>`;
    }
    if (feed.related.content) {
      notePreview = `<div class="feed-note-preview">${feed.related.content}</div>`;
    }
  }
  
  const planId = feed.related.type === 'plan' ? feed.related.id : (feed.extra && feed.extra.plan_id);
  return `
    <div class="feed-card" 
         data-related-type="${feed.related.type}" 
         data-related-id="${feed.related.id}"
         data-plan-id="${planId || ''}">
      <div class="feed-avatar">${feed.user?.avatar || '👤'}</div>
      <div class="feed-content">
        <div class="feed-header">
          <span class="feed-username">${feed.user?.username || '用户'}</span>
          <span class="feed-type-badge ${typeInfo.cls}">
            <span>${typeInfo.icon}</span>
            <span>${typeInfo.text}</span>
          </span>
          <span class="feed-time">${formatCommentTime(feed.created_at)}</span>
        </div>
        <div class="feed-title">${title}</div>
        ${meta ? `<div class="feed-meta">${meta}</div>` : ''}
        ${notePreview}
      </div>
    </div>
  `;
}

async function loadTimeline() {
  if (!currentUser) return;
  
  const timelineList = document.getElementById('timelineList');
  if (!timelineList) return;
  
  const params = new URLSearchParams();
  if (currentTimelineFilter !== 'all') {
    params.set('type', currentTimelineFilter);
  }
  
  const res = await api(`${API}/users/${currentUser.id}/feeds?${params}`);
  
  if (!res.success || !res.feeds || res.feeds.length === 0) {
    timelineList.innerHTML = `
      <div class="timeline-empty">
        <div class="timeline-empty-icon">👥</div>
        <h3>还没有动态</h3>
        <p>去关注一些搭子，就能看到他们的最新动态啦~</p>
      </div>
    `;
    return;
  }
  
  timelineList.innerHTML = res.feeds.map(f => renderFeedCard(f)).join('');
  
  timelineList.querySelectorAll('.feed-card').forEach(card => {
    card.addEventListener('click', () => {
      const relatedType = card.dataset.relatedType;
      const relatedId = card.dataset.relatedId;
      const planId = card.dataset.planId;
      
      if (relatedType === 'plan' && relatedId) {
        openPlanDetail(relatedId);
      } else if (relatedType === 'note') {
        if (planId) {
          openPlanDetail(planId);
        } else {
          showToast('笔记详情即将上线', 'info');
        }
      }
    });
  });
}

function initTimelineFilter() {
  document.querySelectorAll('.timeline-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.timeline-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimelineFilter = btn.dataset.filter;
      loadTimeline();
    });
  });
}

async function toggleFollow(targetUserId, btn) {
  if (!currentUser) {
    showToast('请先登录', 'error');
    return;
  }
  if (Number(targetUserId) === Number(currentUser.id)) return;
  
  const isFollowing = btn.classList.contains('following');
  const method = isFollowing ? 'DELETE' : 'POST';
  
  const res = await api(`${API}/follows`, {
    method,
    body: JSON.stringify({
      follower_id: currentUser.id,
      following_id: targetUserId
    })
  });
  
  if (res.success) {
    if (isFollowing) {
      btn.classList.remove('following');
      btn.textContent = btn.dataset.followText || '+ 关注';
      showToast('已取消关注', 'info');
    } else {
      btn.classList.add('following');
      btn.textContent = btn.dataset.followingText || '已关注';
      showToast('关注成功！', 'success');

      if (res.new_badges && res.new_badges.follower && res.new_badges.follower.length > 0) {
        showBadgeUnlockToast(res.new_badges.follower);
      }
    }
    loadTimeline();
  } else {
    showToast(res.error || '操作失败', 'error');
  }
}

async function checkFollowStatus(targetUserId) {
  if (!currentUser) return false;
  const res = await api(`${API}/users/${currentUser.id}/follows-status?target_id=${targetUserId}`);
  return res.success ? res.is_following : false;
}

function refreshCurrentTab() {
  const activeTab = document.querySelector('.nav-btn.active')?.dataset.tab;
  switch (activeTab) {
    case 'discover': 
      loadTimeline();
      refreshDiscoverView(); 
      break;
    case 'match': loadMatchSuggestions(); break;
    case 'popular': loadPopularRoutes(); break;
    case 'favorites': loadFavorites(); break;
    case 'mine': loadMyPlans(); break;
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.toggle('active', tab.id === tabName + 'Tab');
  });
  refreshCurrentTab();
}

async function initLoginForm() {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const city = document.getElementById('loginCity').value;
    const bio = document.getElementById('loginBio').value.trim();
    
    if (!username) return;
    
    const avatar = getRandomAvatar();
    const res = await api(`${API}/users/login`, {
      method: 'POST',
      body: JSON.stringify({ username, avatar, bio, city })
    });
    
    if (res.success) {
      saveUser(res.user);
      showToast(`欢迎，${res.user.username}！`, 'success');
      showMainApp();
      await initAppContent();
      startNotificationCheck();
    } else {
      showToast(res.error || '登录失败', 'error');
    }
  });
}

async function initCreatePlanForm() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('planStartTime').min = now.toISOString().slice(0, 16);
  
  document.getElementById('createPlanForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    
    const data = {
      creator_id: currentUser.id,
      title: document.getElementById('planTitle').value,
      city: document.getElementById('planCity').value,
      theme: document.getElementById('planTheme').value,
      start_time: document.getElementById('planStartTime').value,
      duration_hours: parseFloat(document.getElementById('planDuration').value),
      max_participants: parseInt(document.getElementById('planMax').value),
      meeting_point: document.getElementById('planMeeting').value,
      description: document.getElementById('planDescription').value,
      difficulty_level: document.getElementById('planDifficultyLevel').value
    };
    
    const res = await api(`${API}/plans`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (res.success) {
      showToast('计划发布成功！等待搭子加入吧 🎉', 'success');
      document.getElementById('createPlanModal').classList.add('hidden');
      e.target.reset();
      initDifficultySelector();
      refreshCurrentTab();

      if (res.plan && res.plan.new_badges && res.plan.new_badges.length > 0) {
        showBadgeUnlockToast(res.plan.new_badges);
      }
    } else {
      showToast(res.error || '发布失败', 'error');
    }
  });
}

async function initAppContent() {
  const themesRes = await api(`${API}/themes`);
  if (themesRes.success) themes = themesRes.themes;
  
  const difficultyRes = await api(`${API}/difficulty-levels`);
  if (difficultyRes.success) difficultyLevels = difficultyRes.levels;
  
  await populateCitySelects();
  await populateThemeSelects();
  renderThemeFilter();
  renderDifficultyFilter();
  initDifficultySelector();
  initTimelineFilter();
  
  if (currentUser) {
    const favRes = await api(`${API}/users/${currentUser.id}/favorites`);
    if (favRes.success) favoriteIds = new Set(favRes.favorites.map(f => f.id));
    loadTimeline();
  }
  
  refreshDiscoverView();
  loadRecommendations();
  if (currentUser) loadSearchHistory();
}

function openModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function initRatingModalEvents() {
  document.getElementById('closeRatingBtn').addEventListener('click', closeRatingModal);
  document.getElementById('cancelRatingBtn').addEventListener('click', closeRatingModal);
  
  document.getElementById('ratingModal').addEventListener('click', (e) => {
    if (e.target.id === 'ratingModal') closeRatingModal();
  });
}

function initEventListeners() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.getElementById('createPlanBtn').addEventListener('click', () => {
    document.getElementById('createPlanModal').classList.remove('hidden');
  });

  document.getElementById('closeCreateBtn').addEventListener('click', () => {
    document.getElementById('createPlanModal').classList.add('hidden');
    document.getElementById('createPlanForm').reset();
    initDifficultySelector();
  });
  document.getElementById('cancelCreateBtn').addEventListener('click', () => {
    document.getElementById('createPlanModal').classList.add('hidden');
    document.getElementById('createPlanForm').reset();
    initDifficultySelector();
  });

  document.getElementById('closeDetailBtn').addEventListener('click', closeDetailModal);
  document.getElementById('planDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'planDetailModal') closeDetailModal();
  });

  document.getElementById('closeNoteBtn').addEventListener('click', () => {
    document.getElementById('noteModal').classList.add('hidden');
  });
  document.getElementById('cancelNoteBtn').addEventListener('click', () => {
    document.getElementById('noteModal').classList.add('hidden');
  });
  document.getElementById('noteForm').addEventListener('submit', submitNote);
  document.getElementById('noteModal').addEventListener('click', (e) => {
    if (e.target.id === 'noteModal') document.getElementById('noteModal').classList.add('hidden');
  });
  document.getElementById('createPlanModal').addEventListener('click', (e) => {
    if (e.target.id === 'createPlanModal') document.getElementById('createPlanModal').classList.add('hidden');
  });

  document.getElementById('closeEditPlanBtn').addEventListener('click', closeEditPlanModal);
  document.getElementById('cancelEditPlanBtn').addEventListener('click', closeEditPlanModal);
  document.getElementById('editPlanForm').addEventListener('submit', submitEditPlan);
  document.getElementById('editPlanModal').addEventListener('click', (e) => {
    if (e.target.id === 'editPlanModal') closeEditPlanModal();
  });

  document.getElementById('closeCancelPlanBtn').addEventListener('click', closeCancelPlanModal);
  document.getElementById('cancelPlanCancelBtn').addEventListener('click', closeCancelPlanModal);
  document.getElementById('confirmCancelPlanBtn').addEventListener('click', submitCancelPlan);
  document.getElementById('cancelPlanModal').addEventListener('click', (e) => {
    if (e.target.id === 'cancelPlanModal') closeCancelPlanModal();
  });

  document.getElementById('closeCommentBtn').addEventListener('click', closeCommentModal);
  document.getElementById('commentModal').addEventListener('click', (e) => {
    if (e.target.id === 'commentModal') closeCommentModal();
  });

  document.getElementById('notificationBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown.classList.contains('hidden')) {
      loadNotifications();
      dropdown.classList.remove('hidden');
    } else {
      dropdown.classList.add('hidden');
    }
  });

  document.getElementById('notificationReadAll').addEventListener('click', (e) => {
    e.stopPropagation();
    markAllNotificationsRead();
  });

  document.addEventListener('click', () => {
    document.getElementById('notificationDropdown').classList.add('hidden');
  });

  document.getElementById('notificationDropdown').addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.getElementById('filterCity').addEventListener('change', (e) => {
    currentCityFilter = e.target.value;
    refreshDiscoverView();
  });

  let searchTimer;
  document.getElementById('searchKeyword').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentKeyword = e.target.value;
      if (currentUser && currentKeyword.trim()) {
        api(`${API}/users/${currentUser.id}/search-history`, {
          method: 'POST',
          body: JSON.stringify({ keyword: currentKeyword })
        });
      }
      refreshDiscoverView();
    }, 300);
  });
  document.getElementById('searchKeyword').addEventListener('focus', () => {
    if (currentUser && searchHistoryItems.length > 0 && !currentKeyword) {
      showSearchHistory();
    }
  });
  document.getElementById('searchKeyword').addEventListener('blur', () => {
    setTimeout(() => hideSearchHistory(), 200);
  });

  document.getElementById('refreshMatchBtn').addEventListener('click', loadMatchSuggestions);
  document.getElementById('matchCity').addEventListener('change', loadMatchSuggestions);
  document.getElementById('matchTheme').addEventListener('change', loadMatchSuggestions);
  document.getElementById('popularCity').addEventListener('change', loadPopularRoutes);

  document.getElementById('loadFromTemplateBtn').addEventListener('click', () => {
    openMyTemplatesModal('select');
  });
  document.getElementById('browsePublicTemplatesBtn').addEventListener('click', () => {
    openPublicTemplatesModal();
  });
  document.getElementById('saveAsTemplateBtn').addEventListener('click', () => {
    openSaveTemplateModal();
  });
  document.getElementById('manageTemplatesBtn').addEventListener('click', () => {
    openMyTemplatesModal('manage');
  });
  document.getElementById('closeMyTemplatesBtn').addEventListener('click', () => {
    closeModal('myTemplatesModal');
  });
  document.getElementById('myTemplatesModal').addEventListener('click', (e) => {
    if (e.target.id === 'myTemplatesModal') closeModal('myTemplatesModal');
  });
  document.getElementById('closePublicTemplatesBtn').addEventListener('click', () => {
    closeModal('publicTemplatesModal');
  });
  document.getElementById('publicTemplatesModal').addEventListener('click', (e) => {
    if (e.target.id === 'publicTemplatesModal') closeModal('publicTemplatesModal');
  });
  document.getElementById('closeSaveTemplateBtn').addEventListener('click', () => {
    closeModal('saveTemplateModal');
  });
  document.getElementById('cancelSaveTemplateBtn').addEventListener('click', () => {
    closeModal('saveTemplateModal');
  });
  document.getElementById('saveTemplateModal').addEventListener('click', (e) => {
    if (e.target.id === 'saveTemplateModal') closeModal('saveTemplateModal');
  });
  document.getElementById('saveTemplateForm').addEventListener('submit', submitSaveTemplate);
  document.getElementById('closeEditTemplateBtn').addEventListener('click', () => {
    closeModal('editTemplateModal');
  });
  document.getElementById('cancelEditTemplateBtn').addEventListener('click', () => {
    closeModal('editTemplateModal');
  });
  document.getElementById('editTemplateModal').addEventListener('click', (e) => {
    if (e.target.id === 'editTemplateModal') closeModal('editTemplateModal');
  });
  document.getElementById('editTemplateForm').addEventListener('submit', submitEditTemplate);

  document.getElementById('publicTemplateCity').addEventListener('change', loadPublicTemplates);
  document.getElementById('publicTemplateTheme').addEventListener('change', loadPublicTemplates);
  let publicTemplateSearchTimer;
  document.getElementById('publicTemplateKeyword').addEventListener('input', () => {
    clearTimeout(publicTemplateSearchTimer);
    publicTemplateSearchTimer = setTimeout(loadPublicTemplates, 300);
  });

  document.getElementById('followingStat').addEventListener('click', () => {
    if (currentUser) openFollowList(currentUser.id, 'following');
  });
  document.getElementById('followersStat').addEventListener('click', () => {
    if (currentUser) openFollowList(currentUser.id, 'followers');
  });
}

function initFollowModalEvents() {
  document.getElementById('closeUserProfileBtn').addEventListener('click', closeUserProfileModal);
  document.getElementById('userProfileModal').addEventListener('click', (e) => {
    if (e.target.id === 'userProfileModal') closeUserProfileModal();
  });
  document.getElementById('closeFollowListBtn').addEventListener('click', () => {
    closeModal('followListModal');
  });
  document.getElementById('followListModal').addEventListener('click', (e) => {
    if (e.target.id === 'followListModal') closeModal('followListModal');
  });
}

let notificationCheckInterval = null;

let myTemplatesMode = 'manage';

async function loadMyTemplatesPreview() {
  if (!currentUser) return;
  const grid = document.getElementById('myTemplatesGrid');
  if (!grid) return;
  const res = await api(`${API}/users/${currentUser.id}/templates`);
  if (res.success && res.templates.length > 0) {
    const preview = res.templates.slice(0, 4);
    grid.innerHTML = preview.map(t => {
      const theme = getThemeInfo(t.theme);
      const badge = t.is_public ? '<span class="template-public-badge">🌐 公开</span>' : '<span class="template-private-badge">🔒 私有</span>';
      return `
        <div class="my-template-card" onclick="useTemplate(${t.id})">
          <div class="my-template-card-badge">${badge}</div>
          <div class="my-template-card-title">
            <span>${theme.icon}</span>
            <span>${t.name}</span>
          </div>
          <div class="my-template-card-desc">${t.description || '暂无描述'}</div>
          <div class="my-template-card-meta">
            ${t.city ? `<span>📍 ${t.city}</span>` : ''}
            ${t.meeting_point ? `<span>🚩 ${t.meeting_point}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-state-icon">📋</div>
        <h3>还没有路线模板</h3>
        <p>创建计划时可保存为模板，下次一键复用！</p>
      </div>
    `;
  }
}

async function openMyTemplatesModal(mode) {
  myTemplatesMode = mode || 'manage';
  openModal('myTemplatesModal');
  await loadMyTemplatesList();
}

async function loadMyTemplatesList() {
  if (!currentUser) return;
  const container = document.getElementById('myTemplatesList');
  const res = await api(`${API}/users/${currentUser.id}/templates`);
  if (res.success && res.templates.length > 0) {
    container.innerHTML = res.templates.map(t => renderTemplateCard(t, true)).join('');
  } else {
    container.innerHTML = `
      <div class="template-empty">
        <div class="template-empty-icon">📋</div>
        <h3>还没有路线模板</h3>
        <p>发布计划时可以保存为模板，方便下次快速创建</p>
      </div>
    `;
  }
}

function renderTemplateCard(t, isOwner) {
  const theme = getThemeInfo(t.theme);
  const badge = t.is_public ? '<span class="template-public-badge">🌐 公开</span>' : '<span class="template-private-badge">🔒 私有</span>';
  let actions = '';
  if (myTemplatesMode === 'select') {
    actions = `
      <button class="template-action-btn use-btn" onclick="event.stopPropagation(); useTemplate(${t.id})">使用模板</button>
      <button class="template-action-btn" onclick="event.stopPropagation(); openEditTemplateModal(${t.id})">编辑</button>
      <button class="template-action-btn delete-btn" onclick="event.stopPropagation(); deleteTemplate(${t.id})">删除</button>
    `;
  } else if (isOwner) {
    actions = `
      <button class="template-action-btn use-btn" onclick="event.stopPropagation(); useTemplate(${t.id})">使用</button>
      <button class="template-action-btn" onclick="event.stopPropagation(); openEditTemplateModal(${t.id})">编辑</button>
      <button class="template-action-btn delete-btn" onclick="event.stopPropagation(); deleteTemplate(${t.id})">删除</button>
    `;
  } else {
    actions = `
      <button class="template-action-btn use-btn" onclick="event.stopPropagation(); useTemplate(${t.id})">使用模板</button>
    `;
  }
  const creatorHtml = !isOwner ? `
    <div class="template-card-creator">
      <div class="template-card-creator-avatar">${t.creator?.avatar || '🧑'}</div>
      <span>${t.creator?.username || '未知'}</span>
    </div>
  ` : '';
  return `
    <div class="template-card">
      <div class="template-card-header">
        <div>
          <div class="template-card-title">${t.name}</div>
          <div class="template-card-meta">
            <span>${theme.icon} ${theme.name}</span>
            ${t.city ? `<span>📍 ${t.city}</span>` : ''}
            ${badge}
          </div>
        </div>
      </div>
      ${t.description ? `<div class="template-card-desc">${t.description}</div>` : ''}
      ${t.meeting_point ? `<div class="template-card-meta" style="margin-bottom:12px;"><span>🚩 集合：${t.meeting_point}</span></div>` : ''}
      <div class="template-card-footer">
        ${creatorHtml}
        <div class="template-card-actions">${actions}</div>
      </div>
    </div>
  `;
}

async function openPublicTemplatesModal() {
  openModal('publicTemplatesModal');
  await loadPublicTemplates();
}

async function loadPublicTemplates() {
  const container = document.getElementById('publicTemplatesList');
  const city = document.getElementById('publicTemplateCity').value;
  const theme = document.getElementById('publicTemplateTheme').value;
  const keyword = document.getElementById('publicTemplateKeyword').value;
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  if (theme) params.set('theme', theme);
  if (keyword) params.set('keyword', keyword);
  const res = await api(`${API}/templates/public?${params.toString()}`);
  if (res.success && res.templates.length > 0) {
    container.innerHTML = res.templates.map(t => renderTemplateCard(t, false)).join('');
  } else {
    container.innerHTML = `
      <div class="template-empty">
        <div class="template-empty-icon">🌐</div>
        <h3>暂无公共模板</h3>
        <p>成为第一个分享路线模板的人吧！</p>
      </div>
    `;
  }
}

function openSaveTemplateModal() {
  const theme = document.getElementById('planTheme').value;
  const city = document.getElementById('planCity').value;
  const description = document.getElementById('planDescription').value;
  const meetingPoint = document.getElementById('planMeeting').value;
  if (!theme) {
    showToast('请先选择主题再保存模板', 'error');
    return;
  }
  document.getElementById('templateTheme').value = theme;
  document.getElementById('templateCity').value = city;
  document.getElementById('templateDescription').value = description;
  document.getElementById('templateMeetingPoint').value = meetingPoint;
  document.getElementById('templateName').value = '';
  document.getElementById('templateIsPublic').checked = false;
  openModal('saveTemplateModal');
}

async function submitSaveTemplate(e) {
  e.preventDefault();
  if (!currentUser) return;
  const data = {
    creator_id: currentUser.id,
    name: document.getElementById('templateName').value,
    theme: document.getElementById('templateTheme').value,
    city: document.getElementById('templateCity').value,
    description: document.getElementById('templateDescription').value,
    meeting_point: document.getElementById('templateMeetingPoint').value,
    is_public: document.getElementById('templateIsPublic').checked
  };
  const res = await api(`${API}/templates`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (res.success) {
    showToast('模板保存成功！', 'success');
    closeModal('saveTemplateModal');
    loadMyTemplatesPreview();
  } else {
    showToast(res.error || '保存失败', 'error');
  }
}

async function openEditTemplateModal(templateId) {
  if (!currentUser) return;
  const res = await api(`${API}/templates/${templateId}`);
  if (!res.success) {
    showToast(res.error || '模板不存在', 'error');
    return;
  }
  const tmpl = res.template;
  if (tmpl.creator_id !== currentUser.id) {
    showToast('只有创建者才能编辑该模板', 'error');
    return;
  }
  document.getElementById('editTemplateId').value = tmpl.id;
  document.getElementById('editTemplateName').value = tmpl.name;
  document.getElementById('editTemplateTheme').value = tmpl.theme;
  document.getElementById('editTemplateCity').value = tmpl.city || '';
  document.getElementById('editTemplateMeeting').value = tmpl.meeting_point || '';
  document.getElementById('editTemplateDescription').value = tmpl.description || '';
  document.getElementById('editTemplateIsPublic').checked = !!tmpl.is_public;
  closeModal('myTemplatesModal');
  openModal('editTemplateModal');
}

async function submitEditTemplate(e) {
  e.preventDefault();
  if (!currentUser) return;
  const templateId = document.getElementById('editTemplateId').value;
  const data = {
    user_id: currentUser.id,
    name: document.getElementById('editTemplateName').value,
    theme: document.getElementById('editTemplateTheme').value,
    city: document.getElementById('editTemplateCity').value,
    meeting_point: document.getElementById('editTemplateMeeting').value,
    description: document.getElementById('editTemplateDescription').value,
    is_public: document.getElementById('editTemplateIsPublic').checked
  };
  const res = await api(`${API}/templates/${templateId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (res.success) {
    showToast('模板更新成功！', 'success');
    closeModal('editTemplateModal');
    loadMyTemplatesPreview();
  } else {
    showToast(res.error || '更新失败', 'error');
  }
}

async function deleteTemplate(templateId) {
  if (!currentUser) return;
  if (!confirm('确定要删除此模板吗？')) return;
  const res = await api(`${API}/templates/${templateId}`, {
    method: 'DELETE',
    body: JSON.stringify({ user_id: currentUser.id })
  });
  if (res.success) {
    showToast('模板已删除', 'success');
    loadMyTemplatesList();
    loadMyTemplatesPreview();
  } else {
    showToast(res.error || '删除失败', 'error');
  }
}

async function useTemplate(templateId) {
  if (!currentUser) return;
  const res = await api(`${API}/templates/${templateId}`);
  if (!res.success) {
    showToast(res.error || '模板不存在', 'error');
    return;
  }
  if (!res.template.is_public && res.template.creator_id !== currentUser.id) {
    showToast('该模板为私有模板，无法使用', 'error');
    return;
  }
  applyTemplateToForm(res.template);
}

function applyTemplateToForm(tmpl) {
  closeModal('myTemplatesModal');
  closeModal('publicTemplatesModal');
  document.getElementById('createPlanModal').classList.remove('hidden');
  if (tmpl.theme) document.getElementById('planTheme').value = tmpl.theme;
  if (tmpl.city) document.getElementById('planCity').value = tmpl.city;
  if (tmpl.description) document.getElementById('planDescription').value = tmpl.description;
  if (tmpl.meeting_point) document.getElementById('planMeeting').value = tmpl.meeting_point;
  if (tmpl.name) document.getElementById('planTitle').value = tmpl.name;
  showToast('模板已加载，请补充时间和人数后发布', 'success');
}

async function openUserProfile(userId) {
  if (!currentUser) {
    showToast('请先登录', 'error');
    return;
  }
  
  const res = await api(`${API}/users/${userId}`);
  if (!res.success) {
    showToast('用户不存在', 'error');
    return;
  }
  
  const user = res.user;
  const isMe = Number(userId) === Number(currentUser.id);
  const isFollowing = await checkFollowStatus(userId);
  
  const planRes = await api(`${API}/users/${userId}/plans`);
  const planCount = planRes.success ? planRes.plans.length : 0;
  
  let actionBtnHtml = '';
  if (!isMe) {
    actionBtnHtml = `
      <button class="user-profile-follow-btn ${isFollowing ? 'following' : ''}" 
              id="profileFollowBtn"
              onclick="toggleProfileFollow(${userId}, this)">
        ${isFollowing ? '已关注' : '+ 关注'}
      </button>
    `;
  }
  
  const content = `
    <div class="user-profile-body">
      <div class="user-profile-header">
        <div class="user-profile-avatar">${user.avatar || '🧑'}</div>
        <div class="user-profile-info">
          <h2 class="user-profile-name">${user.username}</h2>
          <p class="user-profile-bio">${user.bio || '这个人很懒，没有留下签名'}</p>
          <span class="user-profile-city">📍 ${user.city || '未知城市'}</span>
        </div>
        ${actionBtnHtml}
      </div>
      <div class="user-profile-stats">
        <div class="user-profile-stat" onclick="openFollowList(${userId}, 'following')">
          <div class="user-profile-stat-num">${user.following_count || 0}</div>
          <div class="user-profile-stat-label">关注</div>
        </div>
        <div class="user-profile-stat" onclick="openFollowList(${userId}, 'followers')">
          <div class="user-profile-stat-num">${user.followers_count || 0}</div>
          <div class="user-profile-stat-label">粉丝</div>
        </div>
        <div class="user-profile-stat">
          <div class="user-profile-stat-num">${planCount}</div>
          <div class="user-profile-stat-label">参与计划</div>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('userProfileContent').innerHTML = content;
  document.getElementById('userProfileModal').classList.remove('hidden');
}

function closeUserProfileModal() {
  document.getElementById('userProfileModal').classList.add('hidden');
}

async function toggleProfileFollow(userId, btn) {
  await toggleFollow(userId, btn);
  const res = await api(`${API}/users/${userId}`);
  if (res.success) {
    const followingCountEl = btn.closest('.user-profile-body').querySelector('.user-profile-stat:nth-child(1) .user-profile-stat-num');
    const followersCountEl = btn.closest('.user-profile-body').querySelector('.user-profile-stat:nth-child(2) .user-profile-stat-num');
    if (followingCountEl) followingCountEl.textContent = res.user.following_count || 0;
    if (followersCountEl) followersCountEl.textContent = res.user.followers_count || 0;
  }
  const activeTab = document.querySelector('.nav-btn.active')?.dataset.tab;
  if (activeTab === 'mine') loadMyPlans();
  if (activeTab === 'discover' || activeTab === 'match') refreshCurrentTab();
}

async function openFollowList(userId, type) {
  const modal = document.getElementById('followListModal');
  const title = type === 'following' ? '关注列表' : '粉丝列表';
  document.getElementById('followListTitle').textContent = title;
  
  const endpoint = type === 'following' 
    ? `${API}/users/${userId}/following` 
    : `${API}/users/${userId}/followers`;
  
  const res = await api(endpoint);
  const container = document.getElementById('followListContent');
  
  if (res.success && res.users.length > 0) {
    container.innerHTML = res.users.map(u => {
      const isMe = currentUser && Number(u.id) === Number(currentUser.id);
      return `
        <div class="follow-list-item" onclick="closeModal('followListModal'); openUserProfile(${u.id})">
          <div class="follow-list-avatar">${u.avatar || '🧑'}</div>
          <div class="follow-list-info">
            <span class="follow-list-name">${u.username}</span>
            <span class="follow-list-bio">${u.bio || ''}</span>
          </div>
          ${!isMe ? `
            <button class="follow-list-btn" 
                    data-user-id="${u.id}"
                    onclick="event.stopPropagation(); toggleFollowFromList(${u.id}, this)">
              加载中...
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
    
    container.querySelectorAll('.follow-list-btn').forEach(async (btn) => {
      const uid = btn.dataset.userId;
      const following = await checkFollowStatus(uid);
      btn.textContent = following ? '已关注' : '+ 关注';
      if (following) btn.classList.add('following');
    });
  } else {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px;">
        <div class="empty-state-icon" style="font-size: 40px;">👤</div>
        <h3>${type === 'following' ? '还没有关注任何人' : '还没有粉丝'}</h3>
        <p>${type === 'following' ? '去发现有趣的搭子吧！' : '多发布计划吸引更多搭子关注你！'}</p>
      </div>
    `;
  }
  
  openModal('followListModal');
}

async function toggleFollowFromList(userId, btn) {
  await toggleFollow(userId, btn);
  const activeTab = document.querySelector('.nav-btn.active')?.dataset.tab;
  if (activeTab === 'mine') loadMyPlans();
}

async function init() {
  document.getElementById('planDetailModal').classList.add('hidden');
  document.getElementById('createPlanModal').classList.add('hidden');
  document.getElementById('editPlanModal').classList.add('hidden');
  document.getElementById('cancelPlanModal').classList.add('hidden');
  document.getElementById('noteModal').classList.add('hidden');
  document.getElementById('commentModal').classList.add('hidden');
  document.getElementById('ratingModal').classList.add('hidden');
  document.getElementById('pendingRatingsModal').classList.add('hidden');
  document.getElementById('myTemplatesModal').classList.add('hidden');
  document.getElementById('publicTemplatesModal').classList.add('hidden');
  document.getElementById('saveTemplateModal').classList.add('hidden');
  document.getElementById('editTemplateModal').classList.add('hidden');
  document.getElementById('userProfileModal').classList.add('hidden');
  document.getElementById('followListModal').classList.add('hidden');
  document.getElementById('dateActivityModal').classList.add('hidden');
  document.getElementById('guideEditorModal').classList.add('hidden');
  document.getElementById('checkinPointModal').classList.add('hidden');
  document.getElementById('versionHistoryModal').classList.add('hidden');
  document.getElementById('shareGeneratorModal').classList.add('hidden');
  document.getElementById('shareResultModal').classList.add('hidden');
  document.getElementById('toast').classList.add('hidden');
  
  initEventListeners();
  initLoginForm();
  initCreatePlanForm();
  initRatingModalEvents();
  initFollowModalEvents();
  initCalendarEvents();
  initGuideEditor();
  
  const savedUser = loadUser();
  if (savedUser) {
    currentUser = savedUser;
    showMainApp();
    await initAppContent();
    startNotificationCheck();
  }
}

function startNotificationCheck() {
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
  }
  loadUnreadNotificationCount();
  notificationCheckInterval = setInterval(() => {
    if (currentUser) {
      loadUnreadNotificationCount();
    }
  }, 30000);
}

function stopNotificationCheck() {
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
    notificationCheckInterval = null;
  }
}

async function loadSearchHistory() {
  if (!currentUser) return;
  const res = await api(`${API}/users/${currentUser.id}/search-history`);
  if (res.success) {
    searchHistoryItems = res.history;
  }
}

function showSearchHistory() {
  if (!currentUser || searchHistoryItems.length === 0) return;
  searchHistoryVisible = true;
  let dropdown = document.getElementById('searchHistoryDropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'searchHistoryDropdown';
    dropdown.className = 'search-history-dropdown';
    const searchInput = document.getElementById('searchKeyword');
    searchInput.parentElement.style.position = 'relative';
    searchInput.parentElement.appendChild(dropdown);
  }

  dropdown.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'search-history-header';

  const title = document.createElement('span');
  title.className = 'search-history-title';
  title.textContent = '🔍 搜索历史';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'search-history-clear';
  clearBtn.textContent = '清除';
  clearBtn.addEventListener('click', clearSearchHistory);

  header.appendChild(title);
  header.appendChild(clearBtn);
  dropdown.appendChild(header);

  const list = document.createElement('div');
  list.className = 'search-history-list';

  for (const item of searchHistoryItems) {
    const itemEl = document.createElement('div');
    itemEl.className = 'search-history-item';
    itemEl.dataset.keyword = item.keyword;
    itemEl.addEventListener('click', () => {
      useSearchHistory(itemEl.dataset.keyword);
    });

    const keywordEl = document.createElement('span');
    keywordEl.className = 'search-history-keyword';
    keywordEl.textContent = item.keyword;

    const timeEl = document.createElement('span');
    timeEl.className = 'search-history-time';
    timeEl.textContent = formatCommentTime(item.searched_at);

    itemEl.appendChild(keywordEl);
    itemEl.appendChild(timeEl);
    list.appendChild(itemEl);
  }

  dropdown.appendChild(list);
  dropdown.classList.remove('hidden');
}

function hideSearchHistory() {
  searchHistoryVisible = false;
  const dropdown = document.getElementById('searchHistoryDropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
}

async function clearSearchHistory() {
  if (!currentUser) return;
  await api(`${API}/users/${currentUser.id}/search-history`, { method: 'DELETE' });
  searchHistoryItems = [];
  hideSearchHistory();
  showToast('搜索历史已清除', 'info');
}

function useSearchHistory(keyword) {
  document.getElementById('searchKeyword').value = keyword;
  currentKeyword = keyword;
  hideSearchHistory();
  refreshDiscoverView();
}

async function loadRecommendations() {
  if (!currentUser) return;
  const res = await api(`${API}/users/${currentUser.id}/recommendations`);
  const container = document.getElementById('recommendationsSection');
  if (!container) return;
  
  if (res.success && res.recommendations.length > 0) {
    container.classList.remove('hidden');
    const grid = document.getElementById('recommendationsGrid');
    grid.innerHTML = res.recommendations.map(p => renderPlanCard(p)).join('');
    bindPlanCardClicks(grid);
  } else {
    container.classList.add('hidden');
  }
}

let currentGuide = null;
let currentGuidePlanId = null;
let currentCheckinPoints = [];
let editingPointId = null;
let draggedPointId = null;
let selectedSharePhotos = [];

function initGuideEditor() {
  const closeGuideBtn = document.getElementById('closeGuideEditorBtn');
  if (closeGuideBtn) {
    closeGuideBtn.addEventListener('click', closeGuideEditor);
  }
  
  const addCheckinBtn = document.getElementById('addCheckinPointBtn');
  if (addCheckinBtn) {
    addCheckinBtn.addEventListener('click', openCheckinPointModal);
  }
  
  const saveVersionBtn = document.getElementById('saveVersionBtn');
  if (saveVersionBtn) {
    saveVersionBtn.addEventListener('click', saveVersion);
  }
  
  const viewHistoryBtn = document.getElementById('viewHistoryBtn');
  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', openVersionHistory);
  }
  
  const generateShareBtn = document.getElementById('generateShareBtn');
  if (generateShareBtn) {
    generateShareBtn.addEventListener('click', openShareGenerator);
  }
  
  const saveGuideBasicBtn = document.getElementById('saveGuideBasicBtn');
  if (saveGuideBasicBtn) {
    saveGuideBasicBtn.addEventListener('click', saveGuideBasic);
  }
  
  const closeCheckinBtn = document.getElementById('closeCheckinPointBtn');
  if (closeCheckinBtn) {
    closeCheckinBtn.addEventListener('click', closeCheckinPointModal);
  }
  
  const cancelCheckinBtn = document.getElementById('cancelCheckinPointBtn');
  if (cancelCheckinBtn) {
    cancelCheckinBtn.addEventListener('click', closeCheckinPointModal);
  }
  
  const checkinForm = document.getElementById('checkinPointForm');
  if (checkinForm) {
    checkinForm.addEventListener('submit', handleCheckinPointSubmit);
  }
  
  const closeVersionBtn = document.getElementById('closeVersionHistoryBtn');
  if (closeVersionBtn) {
    closeVersionBtn.addEventListener('click', closeVersionHistoryModal);
  }
  
  const closeShareGenBtn = document.getElementById('closeShareGeneratorBtn');
  if (closeShareGenBtn) {
    closeShareGenBtn.addEventListener('click', closeShareGeneratorModal);
  }
  
  const cancelShareBtn = document.getElementById('cancelShareBtn');
  if (cancelShareBtn) {
    cancelShareBtn.addEventListener('click', closeShareGeneratorModal);
  }
  
  const confirmShareBtn = document.getElementById('confirmShareBtn');
  if (confirmShareBtn) {
    confirmShareBtn.addEventListener('click', handleShareGenerateClick);
  }
  
  const closeShareResultBtn = document.getElementById('closeShareResultBtn');
  if (closeShareResultBtn) {
    closeShareResultBtn.addEventListener('click', closeShareResultModal);
  }
  
  const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');
  if (copyShareLinkBtn) {
    copyShareLinkBtn.addEventListener('click', copyShareLink);
  }
  
  const openSharePageBtn = document.getElementById('openSharePageBtn');
  if (openSharePageBtn) {
    openSharePageBtn.addEventListener('click', openSharePageFromResult);
  }
}

async function loadGuideTab(planId) {
  const container = document.getElementById('guideTabInner');
  if (!container) return;
  
  try {
    const params = new URLSearchParams();
    if (currentUser) params.set('user_id', currentUser.id);
    
    const res = await api(`${API}/plans/${planId}/guide?${params}`);
    if (res.success && res.guide) {
      currentGuide = res.guide;
      currentCheckinPoints = res.points || [];
      renderGuideTab(planId, res.guide, res.points || []);
    } else {
      renderGuideTabEmpty(planId);
    }
  } catch (e) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px;">
        <div class="empty-state-icon" style="font-size:48px;">❌</div>
        <h3>加载失败</h3>
        <p>${e.message || '请稍后重试'}</p>
      </div>
    `;
  }
}

function renderGuideTab(planId, guide, points) {
  const container = document.getElementById('guideTabInner');
  const canEdit = guide.can_edit;
  
  let pointsHtml = '';
  if (points.length > 0) {
    pointsHtml = `
      <div class="checkin-points-preview">
        ${points.map((p, i) => `
          <div class="checkin-point-preview">
            <div class="checkin-point-num">${i + 1}</div>
            <div class="checkin-point-info">
              <div class="checkin-point-name">${p.name}</div>
              ${p.collective_review || p.review ? `<div class="checkin-point-review">${(p.collective_review || p.review).substring(0, 50)}${(p.collective_review || p.review).length > 50 ? '...' : ''}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    pointsHtml = `
      <div class="empty-state" style="padding: 20px;">
        <div class="empty-state-icon" style="font-size:36px;">📍</div>
        <h4 style="margin:8px 0;">还没有打卡点</h4>
      </div>
    `;
  }
  
  container.innerHTML = `
    <div style="display:flex;align-items:center;margin-bottom:16px;">
      <h3 style="margin:0;">🗺️ 路线攻略</h3>
      ${canEdit ? `
        <button class="btn btn-primary" style="margin-left:auto;font-size:12px;padding:6px 14px;" 
                onclick="openGuideEditor(${planId})">✏️ 编辑攻略</button>
      ` : ''}
    </div>
    
    ${guide.title ? `<h4 style="margin:0 0 8px 0;">${guide.title}</h4>` : ''}
    ${guide.description ? `<p style="color:var(--text-secondary);margin:0 0 16px 0;">${guide.description}</p>` : ''}
    
    ${pointsHtml}
    
    ${guide.share_token ? `
      <div style="margin-top:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span>🔗 已生成分享页面</span>
          <button class="btn btn-outline" style="font-size:12px;padding:4px 10px;margin-left:auto;"
                  onclick="viewSharePage('${guide.share_token}')">查看分享</button>
        </div>
      </div>
    ` : ''}
  `;
}

function renderGuideTabEmpty(planId) {
  const container = document.getElementById('guideTabInner');
  const canEdit = currentUser && isPlanParticipantLocal(planId);
  
  container.innerHTML = `
    <div class="empty-state" style="padding: 30px;">
      <div class="empty-state-icon" style="font-size:48px;">🗺️</div>
      <h3>还没有路线攻略</h3>
      <p>记录你们的Citywalk精彩路线吧</p>
      ${canEdit ? `
        <button class="btn btn-primary" style="margin-top:16px;" onclick="openGuideEditor(${planId})">
          📝 创建攻略
        </button>
      ` : ''}
    </div>
  `;
}

function isPlanParticipantLocal(planId) {
  if (!currentUser || !currentDetailPlan || Number(currentDetailPlan.id) !== Number(planId)) {
    return false;
  }
  const participants = currentDetailPlan.participants || [];
  return participants.some(p => Number(p.id) === Number(currentUser.id));
}

async function openGuideEditor(planId) {
  currentGuidePlanId = planId;
  
  try {
    const params = new URLSearchParams();
    if (currentUser) params.set('user_id', currentUser.id);
    
    const res = await api(`${API}/plans/${planId}/guide?${params}`);
    if (res.success && res.guide) {
      currentGuide = res.guide;
      currentCheckinPoints = res.points || [];
    } else {
      currentGuide = { id: null, title: '', description: '' };
      currentCheckinPoints = [];
    }
    
    renderGuideEditor();
    document.getElementById('guideEditorModal').classList.remove('hidden');
  } catch (e) {
    showToast('加载攻略失败', 'error');
  }
}

function closeGuideEditor() {
  document.getElementById('guideEditorModal').classList.add('hidden');
  currentGuide = null;
  currentGuidePlanId = null;
  currentCheckinPoints = [];
  
  if (currentDetailTab === 'guide' && currentDetailPlanId) {
    loadGuideTab(currentDetailPlanId);
  }
}

function renderGuideEditor() {
  const titleInput = document.getElementById('guideTitleInput');
  const descInput = document.getElementById('guideDescInput');
  const pointsList = document.getElementById('checkinPointsList');
  const participantsCount = document.getElementById('guideParticipantsCount');
  const updatedTime = document.getElementById('guideUpdatedTime');
  
  if (titleInput) titleInput.value = currentGuide?.title || '';
  if (descInput) descInput.value = currentGuide?.description || '';
  if (participantsCount) participantsCount.textContent = currentGuide?.participants_count || 0;
  if (updatedTime && currentGuide?.updated_at) {
    updatedTime.textContent = `更新于 ${formatCommentTime(currentGuide.updated_at)}`;
  }
  
  if (pointsList) {
    if (currentCheckinPoints.length === 0) {
      pointsList.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px;">
          <div class="empty-state-icon">📍</div>
          <h3>还没有打卡点</h3>
          <p>点击上方按钮添加第一个打卡点</p>
        </div>
      `;
    } else {
      pointsList.innerHTML = currentCheckinPoints.map((p, i) => `
        <div class="checkin-point-card" draggable="true" data-point-id="${p.id}" data-index="${i}">
          <div class="drag-handle">⋮⋮</div>
          <div class="checkin-point-num">${i + 1}</div>
          <div class="checkin-point-content">
            <div class="checkin-point-name">${p.name}</div>
            ${p.location ? `<div class="checkin-point-location">📍 ${p.location}</div>` : ''}
            ${p.description ? `<div class="checkin-point-desc">${p.description}</div>` : ''}
            ${p.collective_review || p.review ? `<div class="checkin-point-review">⭐ ${p.collective_review || p.review}</div>` : ''}
            ${p.travel_tips || p.tips ? `<div class="checkin-point-tips">💡 ${p.travel_tips || p.tips}</div>` : ''}
          </div>
          <div class="checkin-point-actions">
            <button class="btn btn-outline" style="padding:4px 10px;font-size:12px;"
                    onclick="editCheckinPoint(${p.id})">编辑</button>
            <button class="btn btn-outline" style="padding:4px 10px;font-size:12px;color:var(--danger);border-color:var(--danger);"
                    onclick="deleteCheckinPoint(${p.id})">删除</button>
          </div>
        </div>
      `).join('');
      
      initDragAndDrop();
    }
  }
}

function initDragAndDrop() {
  const cards = document.querySelectorAll('.checkin-point-card');
  
  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragleave', handleDragLeave);
  });
}

function handleDragStart(e) {
  draggedPointId = Number(e.target.closest('.checkin-point-card').dataset.pointId);
  e.target.closest('.checkin-point-card').classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  e.target.closest('.checkin-point-card').classList.remove('dragging');
  document.querySelectorAll('.checkin-point-card').forEach(c => c.classList.remove('drag-over'));
  draggedPointId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = e.target.closest('.checkin-point-card');
  if (card && Number(card.dataset.pointId) !== draggedPointId) {
    card.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const card = e.target.closest('.checkin-point-card');
  if (card) {
    card.classList.remove('drag-over');
  }
}

async function handleDrop(e) {
  e.preventDefault();
  const targetCard = e.target.closest('.checkin-point-card');
  if (!targetCard || !draggedPointId) return;
  
  const targetId = Number(targetCard.dataset.pointId);
  if (targetId === draggedPointId) return;
  
  targetCard.classList.remove('drag-over');
  
  const draggedIndex = currentCheckinPoints.findIndex(p => p.id === draggedPointId);
  const targetIndex = currentCheckinPoints.findIndex(p => p.id === targetId);
  
  if (draggedIndex === -1 || targetIndex === -1) return;
  
  const [removed] = currentCheckinPoints.splice(draggedIndex, 1);
  currentCheckinPoints.splice(targetIndex, 0, removed);
  
  renderGuideEditor();
  
  if (currentGuide?.id) {
    const pointIds = currentCheckinPoints.map(p => p.id);
    try {
      await api(`${API}/guides/${currentGuide.id}/reorder`, {
        method: 'POST',
        body: JSON.stringify({ point_ids: pointIds, user_id: currentUser.id })
      });
    } catch (e) {
      showToast('排序保存失败', 'error');
    }
  }
}

function openCheckinPointModal() {
  editingPointId = null;
  document.getElementById('checkinPointModalTitle').textContent = '📍 添加打卡点';
  document.getElementById('checkinPointName').value = '';
  document.getElementById('checkinPointLocation').value = '';
  document.getElementById('checkinPointDescription').value = '';
  document.getElementById('checkinPointReview').value = '';
  document.getElementById('checkinPointTips').value = '';
  document.getElementById('checkinPointModal').classList.remove('hidden');
}

function editCheckinPoint(pointId) {
  const point = currentCheckinPoints.find(p => p.id === pointId);
  if (!point) return;
  
  editingPointId = pointId;
  document.getElementById('checkinPointModalTitle').textContent = '✏️ 编辑打卡点';
  document.getElementById('checkinPointName').value = point.name || '';
  document.getElementById('checkinPointLocation').value = point.location || '';
  document.getElementById('checkinPointDescription').value = point.description || '';
  document.getElementById('checkinPointReview').value = point.collective_review || point.review || '';
  document.getElementById('checkinPointTips').value = point.travel_tips || point.tips || '';
  document.getElementById('checkinPointModal').classList.remove('hidden');
}

function closeCheckinPointModal() {
  document.getElementById('checkinPointModal').classList.add('hidden');
  editingPointId = null;
}

async function handleCheckinPointSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('checkinPointName').value.trim();
  const location = document.getElementById('checkinPointLocation').value.trim();
  const description = document.getElementById('checkinPointDescription').value.trim();
  const collective_review = document.getElementById('checkinPointReview').value.trim();
  const travel_tips = document.getElementById('checkinPointTips').value.trim();
  
  if (!name) {
    showToast('请输入打卡点名称', 'warning');
    return;
  }
  
  if (!currentGuide?.id) {
    await ensureGuideExists();
  }
  
  if (editingPointId) {
    try {
      const res = await api(`${API}/guides/points/${editingPointId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, location, description, collective_review, travel_tips, user_id: currentUser.id })
      });
      if (res.success) {
        const idx = currentCheckinPoints.findIndex(p => p.id === editingPointId);
        if (idx !== -1) {
          currentCheckinPoints[idx] = { ...currentCheckinPoints[idx], name, location, description, collective_review, travel_tips };
        }
        showToast('更新成功', 'success');
      }
    } catch (e) {
      showToast('更新失败', 'error');
      return;
    }
  } else {
    try {
      const res = await api(`${API}/guides/${currentGuide.id}/points`, {
        method: 'POST',
        body: JSON.stringify({ name, location, description, collective_review, travel_tips, user_id: currentUser.id })
      });
      if (res.success) {
        currentCheckinPoints.push(res.point);
        showToast('添加成功', 'success');
      }
    } catch (e) {
      showToast('添加失败', 'error');
      return;
    }
  }
  
  closeCheckinPointModal();
  renderGuideEditor();
}

async function deleteCheckinPoint(pointId) {
  if (!confirm('确定删除这个打卡点吗？')) return;
  
  try {
    await api(`${API}/guides/points/${pointId}`, { 
      method: 'DELETE',
      body: JSON.stringify({ user_id: currentUser.id })
    });
    currentCheckinPoints = currentCheckinPoints.filter(p => p.id !== pointId);
    renderGuideEditor();
    showToast('删除成功', 'success');
  } catch (e) {
    showToast('删除失败', 'error');
  }
}

async function ensureGuideExists() {
  if (currentGuide?.id) return;
  
  try {
    const res = await api(`${API}/plans/${currentGuidePlanId}/guide`, {
      method: 'PUT',
      body: JSON.stringify({
        title: '我的Citywalk路线攻略',
        description: '',
        user_id: currentUser.id
      })
    });
    if (res.success) {
      currentGuide = res.guide;
    }
  } catch (e) {
    showToast('创建攻略失败', 'error');
  }
}

async function saveGuideBasic() {
  const title = document.getElementById('guideTitleInput').value.trim();
  const description = document.getElementById('guideDescInput').value.trim();
  
  try {
    const res = await api(`${API}/plans/${currentGuidePlanId}/guide`, {
      method: 'PUT',
      body: JSON.stringify({ title, description, user_id: currentUser.id })
    });
    if (res.success) {
      currentGuide = res.guide;
      showToast('保存成功', 'success');
    }
  } catch (e) {
    showToast('保存失败', 'error');
  }
}

async function openVersionHistory() {
  if (!currentGuide?.id) {
    showToast('请先创建攻略', 'warning');
    return;
  }
  
  try {
    const res = await api(`${API}/plans/${currentGuidePlanId}/guide/versions`);
    if (res.success) {
      renderVersionHistory(res.versions || []);
      document.getElementById('versionHistoryModal').classList.remove('hidden');
    }
  } catch (e) {
    showToast('加载版本历史失败', 'error');
  }
}

function renderVersionHistory(versions) {
  const list = document.getElementById('versionHistoryList');
  if (!list) return;
  
  if (versions.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <div class="empty-state-icon">📜</div>
        <h3>暂无历史版本</h3>
        <p>保存版本后会在这里显示</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = versions.map(v => `
    <div class="version-item">
      <div class="version-info">
        <div class="version-title">${v.version_name || `版本 ${v.version_number}`}</div>
        <div class="version-meta">
          <span>${v.created_by_name || '匿名用户'}</span>
          <span>·</span>
          <span>${formatCommentTime(v.created_at)}</span>
        </div>
        ${v.description ? `<div class="version-desc">${v.description}</div>` : ''}
      </div>
      <button class="btn btn-outline" style="font-size:12px;padding:6px 12px;"
              onclick="rollbackVersion(${v.id})">回退到此版本</button>
    </div>
  `).join('');
}

async function saveVersion() {
  if (!currentGuide?.id) {
    showToast('请先创建攻略', 'warning');
    return;
  }
  
  const versionName = prompt('请输入版本名称：', `版本 ${new Date().toLocaleString('zh-CN')}`);
  if (!versionName) return;
  
  const versionDesc = prompt('请输入版本描述（可选）：', '');
  
  try {
    const res = await api(`${API}/plans/${currentGuidePlanId}/guide/version`, {
      method: 'POST',
      body: JSON.stringify({
        version_name: versionName,
        description: versionDesc,
        user_id: currentUser.id
      })
    });
    if (res.success) {
      showToast('版本保存成功', 'success');
    }
  } catch (e) {
    showToast('保存失败', 'error');
  }
}

async function rollbackVersion(versionId) {
  if (!confirm('确定要回退到此版本吗？当前内容将被覆盖。')) return;
  
  try {
    const res = await api(`${API}/plans/${currentGuidePlanId}/guide/rollback`, {
      method: 'POST',
      body: JSON.stringify({ version_id: versionId, user_id: currentUser.id })
    });
    if (res.success) {
      currentGuide = res.guide;
      currentCheckinPoints = res.points || [];
      renderGuideEditor();
      document.getElementById('versionHistoryModal').classList.add('hidden');
      showToast('回退成功', 'success');
    }
  } catch (e) {
    showToast('回退失败', 'error');
  }
}

function closeVersionHistoryModal() {
  document.getElementById('versionHistoryModal').classList.add('hidden');
}

async function openShareGenerator() {
  if (!currentGuide?.id) {
    showToast('请先创建攻略', 'warning');
    return;
  }
  
  selectedSharePhotos = [];
  document.getElementById('shareTitleInput').value = currentGuide?.title || '';
  document.getElementById('shareSummaryInput').value = currentGuide?.description || '';
  
  await loadSharePhotos();
  document.getElementById('shareGeneratorModal').classList.remove('hidden');
}

async function loadSharePhotos() {
  const container = document.getElementById('sharePhotosSelector');
  if (!container || !currentGuidePlanId) return;
  
  try {
    const params = new URLSearchParams();
    if (currentUser) params.set('user_id', currentUser.id);
    
    const res = await api(`${API}/plans/${currentGuidePlanId}/photos?${params}`);
    if (res.success && res.photos.length > 0) {
      container.innerHTML = res.photos.map(photo => `
        <div class="share-photo-item ${selectedSharePhotos.includes(photo.id) ? 'selected' : ''}"
             data-photo-id="${photo.id}"
             onclick="toggleSharePhoto(${photo.id}, this)">
          ${photo.image_url ? 
            `<img src="${photo.image_url}" alt="照片">` : 
            `<div class="share-photo-placeholder">📷</div>`
          }
          <div class="share-photo-check">✓</div>
        </div>
      `).join('');
    } else {
      container.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
          <div class="empty-state-icon" style="font-size:32px;">📷</div>
          <p style="font-size:14px;">暂无照片</p>
        </div>
      `;
    }
  } catch (e) {
    container.innerHTML = '<p>加载照片失败</p>';
  }
}

function toggleSharePhoto(photoId, el) {
  const idx = selectedSharePhotos.indexOf(photoId);
  if (idx === -1) {
    selectedSharePhotos.push(photoId);
    el.classList.add('selected');
  } else {
    selectedSharePhotos.splice(idx, 1);
    el.classList.remove('selected');
  }
}

function handleShareGenerateClick() {
  const title = document.getElementById('shareTitleInput').value.trim();
  const summary = document.getElementById('shareSummaryInput').value.trim();
  
  if (!title) {
    showToast('请输入分享标题', 'warning');
    return;
  }
  
  handleShareGenerate({ title, summary, photo_ids: selectedSharePhotos });
}

async function handleShareGenerate(data) {
  try {
    const res = await api(`${API}/plans/${currentGuidePlanId}/share`, {
      method: 'POST',
      body: JSON.stringify({
        title: data.title,
        summary: data.summary,
        photo_ids: data.photo_ids,
        user_id: currentUser.id
      })
    });
    
    if (res.success) {
      showShareResult(res.share || res.share_page);
    }
  } catch (e) {
    showToast('生成分享页面失败', 'error');
  }
}

function showShareResult(share) {
  document.getElementById('shareGeneratorModal').classList.add('hidden');
  
  const shareUrl = `${window.location.origin}/share.html?token=${share.share_token}`;
  document.getElementById('shareLinkInput').value = shareUrl;
  document.getElementById('shareResultModal').classList.remove('hidden');
}

function copyShareLink() {
  const input = document.getElementById('shareLinkInput');
  input.select();
  document.execCommand('copy');
  showToast('链接已复制到剪贴板', 'success');
}

function viewSharePage(token) {
  window.open(`/share.html?token=${token}`, '_blank');
}

function openSharePageFromResult() {
  const url = document.getElementById('shareLinkInput').value;
  window.open(url, '_blank');
}

function closeShareGeneratorModal() {
  document.getElementById('shareGeneratorModal').classList.add('hidden');
  selectedSharePhotos = [];
}

function closeShareResultModal() {
  document.getElementById('shareResultModal').classList.add('hidden');
}

const weatherIconMap = {
  '113': '☀️', '116': '⛅', '119': '☁️', '122': '☁️',
  '143': '🌫️', '176': '🌦️', '179': '🌨️', '182': '🌨️',
  '185': '🌨️', '200': '⛈️', '227': '🌨️', '230': '❄️',
  '248': '🌫️', '260': '🌫️', '263': '🌦️', '266': '🌧️',
  '281': '🌧️', '284': '🌧️', '293': '🌦️', '296': '🌧️',
  '299': '🌧️', '302': '🌧️', '305': '🌧️', '308': '🌧️',
  '311': '🌧️', '314': '🌧️', '317': '🌨️', '320': '🌨️',
  '323': '🌨️', '326': '🌨️', '329': '❄️', '332': '❄️',
  '335': '❄️', '338': '❄️', '350': '🌧️', '353': '🌦️',
  '356': '🌧️', '359': '🌧️', '362': '🌨️', '365': '🌨️',
  '368': '🌨️', '371': '❄️', '374': '🌨️', '377': '🌨️',
  '386': '⛈️', '389': '⛈️', '392': '⛈️', '395': '❄️'
};

function getWeatherIcon(code) {
  return weatherIconMap[String(code)] || '🌤️';
}

function isDateWithinForecast(targetDate) {
  const target = new Date(targetDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffMs = targetDay - today;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 2;
}

function formatDateStr(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchWeatherData(city, dateStr) {
  try {
    const res = await api(`${API}/weather?city=${encodeURIComponent(city)}&date=${dateStr}`);
    if (!res.success) return null;
    return res.weather;
  } catch (e) {
    return null;
  }
}

function buildWeatherPanelHtml(plan) {
  const dateStr = formatDateStr(plan.start_time);
  const withinForecast = isDateWithinForecast(plan.start_time);
  const planDate = new Date(plan.start_time);
  const now = new Date();
  const isPast = planDate < now;

  return `
    <div class="detail-section weather-panel" id="weatherPanel" data-city="${plan.city}" data-date="${dateStr}">
      <div class="weather-panel-header">
        <h3>🌤️ 活动天气</h3>
        <button class="weather-refresh-btn" onclick="refreshWeather()" title="刷新天气">
          <span class="weather-refresh-icon" id="weatherRefreshIcon">🔄</span>
        </button>
      </div>
      <div class="weather-panel-content" id="weatherContent">
        <div class="weather-loading">
          <span class="weather-loading-spinner"></span>
          <span>正在获取天气数据...</span>
        </div>
      </div>
    </div>
  `;
}

async function loadWeatherForPlan() {
  const panel = document.getElementById('weatherPanel');
  if (!panel) return;
  const city = panel.dataset.city;
  const dateStr = panel.dataset.date;
  const contentEl = document.getElementById('weatherContent');

  const weather = await fetchWeatherData(city, dateStr);
  if (!weather) {
    contentEl.innerHTML = `
      <div class="weather-error">
        <span>❌ 天气数据获取失败</span>
        <button class="weather-retry-btn" onclick="refreshWeather()">重试</button>
      </div>
    `;
    return;
  }

  const planDate = dateStr;
  const withinForecast = isDateWithinForecast(panel.dataset.date + 'T00:00:00');
  const forecastDay = (weather.forecast || []).find(f => f.date === planDate);

  let currentHtml = '';
  if (weather.current) {
    const icon = getWeatherIcon(weather.current.icon);
    currentHtml = `
      <div class="weather-current">
        <div class="weather-current-icon">${icon}</div>
        <div class="weather-current-info">
          <div class="weather-current-temp">${weather.current.temp}°C</div>
          <div class="weather-current-desc">${weather.current.desc}</div>
          <div class="weather-current-detail">体感 ${weather.current.feelsLike}°C · 湿度 ${weather.current.humidity}%</div>
        </div>
      </div>
    `;
  }

  let forecastHtml = '';
  if (!withinForecast) {
    forecastHtml = `
      <div class="weather-forecast weather-pending">
        <div class="weather-pending-icon">📅</div>
        <div class="weather-pending-text">活动日期超出预报范围</div>
        <div class="weather-pending-hint">临近活动日时将显示天气预报</div>
      </div>
    `;
  } else if (forecastDay) {
    const icon = getWeatherIcon(forecastDay.icon);
    const rainChance = forecastDay.chanceOfRain;
    const rainLevel = rainChance > 60 ? 'high' : rainChance > 30 ? 'mid' : 'low';
    forecastHtml = `
      <div class="weather-forecast">
        <div class="weather-forecast-icon">${icon}</div>
        <div class="weather-forecast-body">
          <div class="weather-forecast-desc">${forecastDay.desc}</div>
          <div class="weather-forecast-temps">
            <span class="weather-temp-high">${forecastDay.maxTemp}°</span>
            <span class="weather-temp-sep">/</span>
            <span class="weather-temp-low">${forecastDay.minTemp}°</span>
          </div>
          <div class="weather-forecast-rain">
            <span class="weather-rain-icon">💧</span>
            <span class="weather-rain-label">降水概率</span>
            <div class="weather-rain-bar">
              <div class="weather-rain-fill weather-rain-${rainLevel}" style="width: ${rainChance}%"></div>
            </div>
            <span class="weather-rain-value">${rainChance}%</span>
          </div>
        </div>
      </div>
    `;
  } else {
    forecastHtml = `
      <div class="weather-forecast weather-pending">
        <div class="weather-pending-icon">🔍</div>
        <div class="weather-pending-text">暂无该日期的预报数据</div>
      </div>
    `;
  }

  let extraForecastHtml = '';
  if (withinForecast && weather.forecast && weather.forecast.length > 0) {
    const otherDays = weather.forecast.filter(f => f.date !== planDate);
    if (otherDays.length > 0) {
      extraForecastHtml = `
        <div class="weather-extra-forecast">
          ${otherDays.map(f => {
            const icon = getWeatherIcon(f.icon);
            const d = new Date(f.date);
            const label = `${d.getMonth() + 1}/${d.getDate()}`;
            return `
              <div class="weather-extra-day">
                <span class="weather-extra-icon">${icon}</span>
                <span class="weather-extra-date">${label}</span>
                <span class="weather-extra-temps">${f.maxTemp}°/${f.minTemp}°</span>
                <span class="weather-extra-rain">💧${f.chanceOfRain}%</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  }

  contentEl.innerHTML = `
    <div class="weather-body">
      ${currentHtml}
      ${forecastHtml}
      ${extraForecastHtml}
      <div class="weather-footer">
        <span class="weather-update-time">更新于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        <span class="weather-source">数据来源: wttr.in</span>
      </div>
    </div>
  `;
}

async function refreshWeather() {
  const refreshIcon = document.getElementById('weatherRefreshIcon');
  const contentEl = document.getElementById('weatherContent');
  if (refreshIcon) refreshIcon.classList.add('spinning');
  contentEl.innerHTML = `
    <div class="weather-loading">
      <span class="weather-loading-spinner"></span>
      <span>正在刷新天气数据...</span>
    </div>
  `;
  await loadWeatherForPlan();
  const icon = document.getElementById('weatherRefreshIcon');
  if (icon) icon.classList.remove('spinning');
}

document.addEventListener('DOMContentLoaded', init);
