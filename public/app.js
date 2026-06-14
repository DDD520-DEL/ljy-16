const API = '/api';
let currentUser = null;
let themes = [];
let currentThemeFilter = '';
let currentCityFilter = '';
let currentKeyword = '';
let favoriteIds = new Set();

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
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('loginUsername').value = '';
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
    ['filterCity', 'matchCity', 'popularCity', 'planCity'].forEach(id => {
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
  ['matchTheme', 'planTheme'].forEach(id => {
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
  
  const res = await api(`${API}/users/${currentUser.id}/plans`);
  const grid = document.getElementById('myPlansGrid');
  
  document.getElementById('profileName').textContent = currentUser.username;
  document.getElementById('profileAvatar').textContent = currentUser.avatar || '🧑';
  document.getElementById('profileBio').textContent = currentUser.bio || '这个人很懒，没有留下签名';
  document.getElementById('profileCity').textContent = '📍 ' + (currentUser.city || '未知城市');
  document.getElementById('statPlans').textContent = res.success ? res.plans.length : 0;
  document.getElementById('statFavorites').textContent = favRes.success ? favRes.favorites.length : 0;
  
  let totalNotes = 0;
  if (res.success && res.plans.length > 0) {
    for (const p of res.plans) {
      const detail = await api(`${API}/plans/${p.id}`);
      if (detail.success) totalNotes += (detail.plan.notes || []).length;
    }
  }
  document.getElementById('statNotes').textContent = totalNotes;
  
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

  const participantsHtml = (plan.participants || []).map(p => `
    <div class="participant-item">
      <div class="participant-item-avatar">${p.avatar || '👤'}</div>
      <div class="participant-item-info">
        <span class="participant-item-name">${p.username}</span>
        <span class="participant-item-role ${p.role === 'creator' ? 'creator' : ''}">
          ${p.role === 'creator' ? '🌟 创建者' : '成员'}
        </span>
      </div>
    </div>
  `).join('');

  const notesHtml = (plan.notes && plan.notes.length > 0) ? plan.notes.map(n => {
    const isMyNote = n.author_id === currentUser?.id;
    return `
      <div class="note-card" data-note-id="${n.id}">
        <div class="note-header">
          <div class="note-author">
            <div class="note-author-avatar">${n.author_avatar || '👤'}</div>
            <span class="note-author-name">${n.author_name}</span>
          </div>
          <div class="note-actions">
            ${isMyNote ? `
              <button class="note-action-btn" onclick="editNote(${n.id}, '${n.title.replace(/'/g, "\\'")}', '${(n.content || '').replace(/'/g, "\\'")}', '${(n.location || '').replace(/'/g, "\\'")}')">✏️ 编辑</button>
              <button class="note-action-btn" onclick="deleteNote(${n.id})">🗑️ 删除</button>
            ` : ''}
          </div>
        </div>
        <h4 class="note-title">${n.title}</h4>
        <p class="note-content">${n.content || '暂无内容'}</p>
        <div class="note-footer">
          ${n.location ? `<span class="note-location">📍 ${n.location}</span>` : '<span></span>'}
          <span class="note-likes" onclick="likeNote(${n.id}, this)">
            ❤️ <span class="likes-num">${n.likes || 0}</span>
          </span>
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

      <div class="detail-actions">
        ${plan.status === 'recruiting' ? (
          isJoined ? `
            ${!isCreator ? `<button class="btn btn-outline" onclick="leavePlan(${plan.id})">🚪 退出计划</button>` : ''}
            ${isCreator ? `<button class="btn btn-primary" onclick="completePlan(${plan.id})">✅ 标记完成</button>` : 
              `<button class="btn btn-outline" disabled>✓ 已加入</button>`}
          ` : (
            isFull ? 
              `<button class="btn btn-outline" disabled>👥 人数已满</button>` :
              `<button class="btn btn-primary" onclick="joinPlan(${plan.id})">🤝 加入计划</button>`
          )
        ) : ''}
        <button class="btn btn-outline" onclick="closeDetailModal()">关闭</button>
      </div>
    </div>
  `;

  document.getElementById('planDetailContent').innerHTML = content;
  document.getElementById('planDetailModal').classList.remove('hidden');
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

async function likeNote(noteId, el) {
  await api(`${API}/notes/${noteId}/like`, { method: 'POST' });
  const numEl = el.querySelector('.likes-num');
  numEl.textContent = parseInt(numEl.textContent) + 1;
  el.classList.add('liked');
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
    const planId = document.getElementById('notePlanId').value;
    openPlanDetail(planId);
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

function refreshCurrentTab() {
  const activeTab = document.querySelector('.nav-btn.active')?.dataset.tab;
  switch (activeTab) {
    case 'discover': loadDiscoverPlans(); break;
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
  
  if (currentUser) {
    const favRes = await api(`${API}/users/${currentUser.id}/favorites`);
    if (favRes.success) favoriteIds = new Set(favRes.favorites.map(f => f.id));
  }
  
  loadDiscoverPlans();
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
}

async function init() {
  // 确保所有模态框初始隐藏
  document.getElementById('planDetailModal').classList.add('hidden');
  document.getElementById('createPlanModal').classList.add('hidden');
  document.getElementById('noteModal').classList.add('hidden');
  document.getElementById('toast').classList.add('hidden');
  
  initEventListeners();
  initLoginForm();
  initCreatePlanForm();
  
  const savedUser = loadUser();
  if (savedUser) {
    currentUser = savedUser;
    showMainApp();
    await initAppContent();
  }
}

document.addEventListener('DOMContentLoaded', init);
