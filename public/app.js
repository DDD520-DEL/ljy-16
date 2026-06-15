const API = '/api';
let currentUser = null;
let themes = [];
let currentThemeFilter = '';
let currentCityFilter = '';
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
      loadDiscoverPlans();
    });
  });
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

  return `
    <div class="plan-card" data-plan-id="${plan.id}">
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
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span class="status-badge ${status.cls}">${status.text}</span>
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
          <div class="plan-creator">
            <div class="creator-avatar">${plan.creator?.avatar || '🧑'}</div>
            <span class="creator-name">${plan.creator?.username || '创建者'}</span>
          </div>
          <div class="plan-participants">
            <div class="participants-avatars">
              ${(plan.participants || []).slice(0, 4).map(p => `
                <div class="participant-avatar" title="${p.username}">${p.avatar || '👤'}</div>
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
  if (currentKeyword) params.set('keyword', currentKeyword);
  
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
  
  const res = await api(`${API}/routes/popular?${params}`);
  const list = document.getElementById('popularList');
  
  if (res.success && res.routes.length > 0) {
    list.innerHTML = res.routes.map((r, idx) => {
      const theme = getThemeInfo(r.theme);
      const hasRating = r.avg_rating && r.rating_count > 0;
      return `
        <div class="popular-item" data-plan-id="${r.id}">
          <div class="popular-rank rank-${idx < 3 ? idx + 1 : ''}">${idx < 3 ? ['🥇', '🥈', '🥉'][idx] : idx + 1}</div>
          <div class="popular-info">
            <h3>${r.title}</h3>
            <div class="popular-meta">
              <span style="color: ${theme.color}">${theme.icon} ${theme.name}</span>
              <span>📍 ${r.city}</span>
              <span>📝 ${r.notes_count || 0}篇笔记</span>
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
  
  const res = await api(`${API}/users/${currentUser.id}/plans`);
  const grid = document.getElementById('myPlansGrid');
  
  document.getElementById('profileName').textContent = currentUser.username;
  document.getElementById('profileAvatar').textContent = currentUser.avatar || '🧑';
  document.getElementById('profileBio').textContent = currentUser.bio || '这个人很懒，没有留下签名';
  document.getElementById('profileCity').textContent = '📍 ' + (currentUser.city || '未知城市');
  document.getElementById('statPlans').textContent = res.success ? res.plans.length : 0;
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

  loadMyTemplatesPreview();
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
    await api(`${API}/favorites`, {
      method: 'POST',
      body: JSON.stringify({ user_id: currentUser.id, plan_id: planId })
    });
    btn.classList.add('active');
    btn.textContent = '⭐';
    favoriteIds.add(planId);
    showToast('收藏成功！', 'success');
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
  const theme = getThemeInfo(plan.theme);
  const status = getStatusLabel(plan.status);
  const isJoined = plan.participants?.some(p => p.id === currentUser?.id);
  const isCreator = plan.creator_id === currentUser?.id;
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

  const participantsHtml = (plan.participants || []).map(p => {
    const isMe = currentUser && Number(p.id) === Number(currentUser.id);
    return `
    <div class="participant-item" data-user-id="${p.id}">
      <div class="participant-item-avatar">${p.avatar || '👤'}</div>
      <div class="participant-item-info">
        <span class="participant-item-name">${p.username}</span>
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
            <div class="detail-meta-label">创建者</div>
            <div class="detail-meta-value">${plan.creator?.avatar || ''} ${plan.creator?.username}</div>
          </div>
        </div>
      </div>

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

      <div class="detail-section">
        <h3>👥 参与搭子 (${plan.participants?.length || 0})</h3>
        <div class="participants-list">${participantsHtml}</div>
      </div>

      <div class="detail-section">
        <h3>✨ 路线笔记 (${plan.notes?.length || 0})
          ${canAddNote ? `<button class="btn btn-primary" style="margin-left:auto;font-size:12px;padding:6px 14px;" 
                  onclick="openNoteModal(${plan.id})">＋ 添加笔记</button>` : ''}
        </h3>
        <div class="notes-list">${notesHtml}</div>
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
            ${!isCreator ? `<button class="btn btn-outline" onclick="leavePlan(${plan.id})">🚪 退出计划</button>` : ''}
            ${isCreator ? `
              <button class="btn btn-outline" onclick="openEditPlanModal(${plan.id})">✏️ 编辑计划</button>
              <button class="btn btn-outline" style="color: var(--danger); border-color: var(--danger);" onclick="openCancelPlanModal(${plan.id})">🚫 取消活动</button>
              <button class="btn btn-primary" onclick="completePlan(${plan.id})">✅ 标记完成</button>
            ` : 
              `<button class="btn btn-outline" disabled>✓ 已加入</button>`}
          ` : (
            isFull ? 
              `<button class="btn btn-outline" disabled>👥 人数已满</button>` :
              `<button class="btn btn-primary" onclick="joinPlan(${plan.id})">🤝 加入计划</button>`
          )
        ) : ''}
        ${isCancelled ? `<button class="btn btn-outline" disabled>🚫 已取消</button>` : ''}
        <button class="btn btn-outline" onclick="closeDetailModal()">关闭</button>
      </div>
    </div>
  `;

  document.getElementById('planDetailContent').innerHTML = content;
  document.getElementById('planDetailModal').classList.remove('hidden');
  
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

function closeDetailModal() {
  document.getElementById('planDetailModal').classList.add('hidden');
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
    create_note: { text: '写了笔记', icon: '📝', cls: 'create_note' }
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
      loadDiscoverPlans(); 
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
      description: document.getElementById('planDescription').value
    };
    
    const res = await api(`${API}/plans`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (res.success) {
      showToast('计划发布成功！等待搭子加入吧 🎉', 'success');
      document.getElementById('createPlanModal').classList.add('hidden');
      e.target.reset();
      refreshCurrentTab();
    } else {
      showToast(res.error || '发布失败', 'error');
    }
  });
}

async function initAppContent() {
  const themesRes = await api(`${API}/themes`);
  if (themesRes.success) themes = themesRes.themes;
  
  await populateCitySelects();
  await populateThemeSelects();
  renderThemeFilter();
  initTimelineFilter();
  
  if (currentUser) {
    const favRes = await api(`${API}/users/${currentUser.id}/favorites`);
    if (favRes.success) favoriteIds = new Set(favRes.favorites.map(f => f.id));
    loadTimeline();
  }
  
  loadDiscoverPlans();
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
  });
  document.getElementById('cancelCreateBtn').addEventListener('click', () => {
    document.getElementById('createPlanModal').classList.add('hidden');
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
    loadDiscoverPlans();
  });

  let searchTimer;
  document.getElementById('searchKeyword').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentKeyword = e.target.value;
      loadDiscoverPlans();
    }, 300);
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

async function init() {
  // 确保所有模态框初始隐藏
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
  document.getElementById('toast').classList.add('hidden');
  
  initEventListeners();
  initLoginForm();
  initCreatePlanForm();
  initRatingModalEvents();
  
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

document.addEventListener('DOMContentLoaded', init);
