const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function createUser(username, avatar, bio, city) {
  const stmt = db.prepare('INSERT INTO users (username, avatar, bio, city) VALUES (?, ?, ?, ?)');
  const result = stmt.run(username, avatar || null, bio || '', city || '');
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

function getOrCreateUser(username, avatar, bio, city) {
  let user = getUserByUsername(username);
  if (!user) {
    user = createUser(username, avatar, bio, city);
  }
  return user;
}

app.post('/api/users/login', (req, res) => {
  try {
    const { username, avatar, bio, city } = req.body;
    if (!username) {
      return res.status(400).json({ error: '用户名不能为空' });
    }
    const user = getOrCreateUser(username, avatar, bio, city);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/difficulty-levels', (req, res) => {
  try {
    const levels = db.prepare('SELECT * FROM difficulty_levels').all();
    res.json({ success: true, levels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const followingCount = db.prepare('SELECT * FROM user_follows WHERE follower_id = ?').all(req.params.id).length;
    const followersCount = db.prepare('SELECT * FROM user_follows WHERE following_id = ?').all(req.params.id).length;
    user.following_count = followingCount;
    user.followers_count = followersCount;
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans', (req, res) => {
  try {
    const {
      creator_id, title, theme, city, description,
      start_time, duration_hours, max_participants,
      meeting_point, route_points, difficulty_level
    } = req.body;

    if (!creator_id || !title || !theme || !city || !start_time) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const validLevels = ['easy', 'medium', 'hard'];
    const difficulty = validLevels.includes(difficulty_level) ? difficulty_level : 'medium';

    const stmt = db.prepare(`
      INSERT INTO citywalk_plans 
      (creator_id, title, theme, city, description, start_time, 
       duration_hours, max_participants, meeting_point, route_points, difficulty_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      creator_id, title, theme, city, description || '',
      start_time, duration_hours || 3, max_participants || 6,
      meeting_point || '', route_points || '', difficulty
    );

    const participantStmt = db.prepare(`
      INSERT INTO plan_participants (plan_id, user_id, role) VALUES (?, ?, 'creator')
    `);
    participantStmt.run(result.lastInsertRowid, creator_id);

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(result.lastInsertRowid);
    const creator = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(creator_id);
    plan.creator = creator;
    plan.participants = [creator];

    createFeed(creator_id, 'create_plan', plan.id, 'plan', {
      title: plan.title,
      city: plan.city,
      theme: plan.theme
    });

    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/plans', (req, res) => {
  try {
    const { city, theme, status, keyword, user_id, difficulty, page = 1, limit = 20 } = req.query;
    let sql = `SELECT p.*, u.username as creator_name, u.avatar as creator_avatar 
               FROM citywalk_plans p 
               LEFT JOIN users u ON p.creator_id = u.id 
               WHERE 1=1`;
    const params = [];

    if (city) {
      sql += ' AND p.city = ?';
      params.push(city);
    }
    if (theme) {
      sql += ' AND p.theme = ?';
      params.push(theme);
    }
    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }
    if (difficulty) {
      sql += ' AND p.difficulty_level = ?';
      params.push(difficulty);
    }
    if (keyword) {
      sql += ' AND (p.title LIKE ? OR p.description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const plans = db.prepare(sql).all(...params);

    let followedIds = new Set();
    if (user_id) {
      const follows = db.prepare('SELECT following_id FROM user_follows WHERE follower_id = ?').all(user_id);
      followedIds = new Set(follows.map(f => f.following_id));
    }

    plans.forEach(plan => {
      plan.creator = {
        id: plan.creator_id,
        username: plan.creator_name || plan.u_username,
        avatar: plan.creator_avatar || plan.u_avatar
      };
      const participants = db.prepare(`
        SELECT u.id, u.username, u.avatar, pp.role 
        FROM plan_participants pp 
        LEFT JOIN users u ON pp.user_id = u.id 
        WHERE pp.plan_id = ?
      `).all(plan.id).map(p => ({
        id: p.id,
        username: p.username || p.u_username,
        avatar: p.avatar || p.u_avatar,
        role: p.role
      }));

      const checkins = db.prepare('SELECT user_id FROM plan_checkins WHERE plan_id = ?').all(plan.id);
      const checkinIds = new Set(checkins.map(c => c.user_id));
      participants.forEach(p => {
        p.is_checked_in = checkinIds.has(p.id);
      });

      plan.participants = participants;

      const isFollowedCreator = followedIds.has(String(plan.creator_id)) || followedIds.has(Number(plan.creator_id));
      const hasFollowedParticipant = participants.some(p => 
        (followedIds.has(String(p.id)) || followedIds.has(Number(p.id))) && String(p.id) !== String(user_id)
      );
      plan.is_from_followed = isFollowedCreator || hasFollowedParticipant;

      delete plan.creator_name;
      delete plan.creator_avatar;
    });

    if (user_id && followedIds.size > 0) {
      plans.sort((a, b) => {
        if (a.is_from_followed && !b.is_from_followed) return -1;
        if (!a.is_from_followed && b.is_from_followed) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    }

    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/plans/:id', (req, res) => {
  try {
    const plan = db.prepare(`
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar 
      FROM citywalk_plans p 
      LEFT JOIN users u ON p.creator_id = u.id 
      WHERE p.id = ?
    `).get(req.params.id);

    if (!plan) {
      return res.status(404).json({ error: '计划不存在' });
    }

    plan.creator = {
      id: plan.creator_id,
      username: plan.creator_name || plan.u_username,
      avatar: plan.creator_avatar || plan.u_avatar
    };

    const participants = db.prepare(`
      SELECT u.id, u.username, u.avatar, pp.role, pp.joined_at
      FROM plan_participants pp 
      LEFT JOIN users u ON pp.user_id = u.id 
      WHERE pp.plan_id = ?
    `).all(plan.id).map(p => ({
      id: p.id,
      username: p.username || p.u_username,
      avatar: p.avatar || p.u_avatar,
      role: p.role,
      joined_at: p.joined_at
    }));

    const checkins = db.prepare('SELECT user_id, checkin_time FROM plan_checkins WHERE plan_id = ?').all(plan.id);
    const checkinMap = new Map(checkins.map(c => [c.user_id, c.checkin_time]));
    participants.forEach(p => {
      p.is_checked_in = checkinMap.has(p.id);
      p.checkin_time = checkinMap.get(p.id) || null;
    });

    plan.participants = participants;

    const notes = db.prepare(`
      SELECT n.*, u.username as author_name, u.avatar as author_avatar
      FROM route_notes n
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.plan_id = ?
      ORDER BY n.created_at DESC
    `).all(plan.id).map(n => ({
      ...n,
      author_name: n.author_name || n.u_username,
      author_avatar: n.author_avatar || n.u_avatar
    }));

    for (const note of notes) {
      const countResult = db.prepare('SELECT COUNT(*) as count FROM note_comments WHERE note_id = ?').get(note.id);
      note.comments_count = countResult ? Object.values(countResult)[0] : 0;
      
      const latestComments = db.prepare(`
        SELECT c.*, u.username as author_name
        FROM note_comments c
        LEFT JOIN users u ON c.author_id = u.id
        WHERE c.note_id = ?
        ORDER BY c.created_at DESC
        LIMIT 3
      `).all(note.id);
      
      note.latest_comments = latestComments.map(c => ({
        id: c.id,
        content: c.content,
        author_name: c.author_name || c.u_username,
        created_at: c.created_at
      }));
    }
    plan.notes = notes;

    const updates = db.prepare(`
      SELECT pu.*, u.username as updater_name, u.avatar as updater_avatar
      FROM plan_updates pu
      LEFT JOIN users u ON pu.updated_by = u.id
      WHERE pu.plan_id = ?
      ORDER BY pu.created_at DESC
    `).all(plan.id).map(u => {
      let changes = [];
      let oldValues = {};
      let newValues = {};
      try { changes = JSON.parse(u.changes || '[]'); } catch(e) {}
      try { oldValues = JSON.parse(u.old_values || '{}'); } catch(e) {}
      try { newValues = JSON.parse(u.new_values || '{}'); } catch(e) {}
      return {
        ...u,
        changes,
        old_values: oldValues,
        new_values: newValues,
        updater_name: u.updater_name || u.u_username,
        updater_avatar: u.updater_avatar || u.u_avatar
      };
    });
    plan.updates = updates;
    plan.latest_update = updates[0] || null;

    delete plan.creator_name;
    delete plan.creator_avatar;

    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/:id/join', (req, res) => {
  try {
    const { user_id } = req.body;
    const planId = req.params.id;

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: '计划不存在' });
    }
    if (plan.current_participants >= plan.max_participants) {
      return res.status(400).json({ error: '人数已满' });
    }
    if (plan.status !== 'recruiting') {
      return res.status(400).json({ error: '该计划已结束招募' });
    }

    const existing = db.prepare('SELECT * FROM plan_participants WHERE plan_id = ? AND user_id = ?')
      .get(planId, user_id);
    if (existing) {
      return res.status(400).json({ error: '已加入该计划' });
    }

    db.transaction(() => {
      db.prepare('INSERT INTO plan_participants (plan_id, user_id, role) VALUES (?, ?, ?)')
        .run(planId, user_id, 'member');
      db.prepare('UPDATE citywalk_plans SET current_participants = current_participants + 1 WHERE id = ?')
        .run(planId);
    });

    const updated = db.prepare(`
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar 
      FROM citywalk_plans p 
      LEFT JOIN users u ON p.creator_id = u.id 
      WHERE p.id = ?
    `).get(planId);
    updated.creator = { id: updated.creator_id, username: updated.creator_name, avatar: updated.creator_avatar };
    const participants = db.prepare(`
      SELECT u.id, u.username, u.avatar, pp.role 
      FROM plan_participants pp 
      LEFT JOIN users u ON pp.user_id = u.id 
      WHERE pp.plan_id = ?
    `).all(planId);
    updated.participants = participants;
    delete updated.creator_name;
    delete updated.creator_avatar;

    createFeed(user_id, 'join_plan', planId, 'plan', {
      title: updated.title,
      city: updated.city,
      theme: updated.theme
    });

    res.json({ success: true, plan: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/:id/leave', (req, res) => {
  try {
    const { user_id } = req.body;
    const planId = req.params.id;

    const participation = db.prepare('SELECT * FROM plan_participants WHERE plan_id = ? AND user_id = ?')
      .get(planId, user_id);
    if (!participation) {
      return res.status(400).json({ error: '未加入该计划' });
    }
    if (participation.role === 'creator') {
      return res.status(400).json({ error: '创建者不能退出计划' });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM plan_participants WHERE plan_id = ? AND user_id = ?').run(planId, user_id);
      db.prepare('UPDATE citywalk_plans SET current_participants = current_participants - 1 WHERE id = ?')
        .run(planId);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/:id/complete', (req, res) => {
  try {
    db.prepare("UPDATE citywalk_plans SET status = 'completed' WHERE id = ?").run(req.params.id);
    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(req.params.id);
    if (plan) {
      createFeed(plan.creator_id, 'complete_citywalk', plan.id, 'plan', {
        title: plan.title,
        city: plan.city,
        theme: plan.theme
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/plans/:id', (req, res) => {
  try {
    const planId = req.params.id;
    const { user_id, title, description, meeting_point, duration_hours } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: '计划不存在' });
    }

    if (plan.creator_id !== user_id) {
      return res.status(403).json({ error: '只有创建者才能编辑计划' });
    }

    if (plan.status !== 'recruiting') {
      return res.status(400).json({ error: '只能编辑招募中的计划' });
    }

    const startTime = new Date(plan.start_time);
    if (startTime <= new Date()) {
      return res.status(400).json({ error: '活动已开始，无法编辑' });
    }

    const changes = [];
    const oldValues = {};
    const newValues = {};

    if (title !== undefined && title !== plan.title) {
      changes.push('title');
      oldValues.title = plan.title;
      newValues.title = title;
    }
    if (description !== undefined && description !== plan.description) {
      changes.push('description');
      oldValues.description = plan.description;
      newValues.description = description;
    }
    if (meeting_point !== undefined && meeting_point !== plan.meeting_point) {
      changes.push('meeting_point');
      oldValues.meeting_point = plan.meeting_point;
      newValues.meeting_point = meeting_point;
    }
    if (duration_hours !== undefined && Number(duration_hours) !== Number(plan.duration_hours)) {
      changes.push('duration_hours');
      oldValues.duration_hours = plan.duration_hours;
      newValues.duration_hours = duration_hours;
    }

    if (changes.length === 0) {
      return res.json({ success: true, plan, changes: [] });
    }

    db.transaction(() => {
      const setClauses = [];
      const params = [];

      if (title !== undefined) {
        setClauses.push('title = ?');
        params.push(title);
      }
      if (description !== undefined) {
        setClauses.push('description = ?');
        params.push(description);
      }
      if (meeting_point !== undefined) {
        setClauses.push('meeting_point = ?');
        params.push(meeting_point);
      }
      if (duration_hours !== undefined) {
        setClauses.push('duration_hours = ?');
        params.push(duration_hours);
      }

      params.push(planId);

      const sql = `UPDATE citywalk_plans SET ${setClauses.join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...params);

      const updateStmt = db.prepare(`
        INSERT INTO plan_updates (plan_id, updated_by, changes, old_values, new_values)
        VALUES (?, ?, ?, ?, ?)
      `);
      updateStmt.run(
        planId,
        user_id,
        JSON.stringify(changes),
        JSON.stringify(oldValues),
        JSON.stringify(newValues)
      );

      const participants = db.prepare('SELECT user_id FROM plan_participants WHERE plan_id = ? AND user_id != ?').all(planId, user_id);
      const notifStmt = db.prepare(`
        INSERT INTO user_notifications (user_id, type, content, related_id, related_type, from_user_id, is_read)
        VALUES (?, 'plan_update', ?, ?, 'plan', ?, 0)
      `);
      participants.forEach(p => {
        notifStmt.run(p.user_id, `计划"${newValues.title || plan.title}"已更新`, planId, user_id);
      });
    });

    const updatedPlan = db.prepare(`
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar 
      FROM citywalk_plans p 
      LEFT JOIN users u ON p.creator_id = u.id 
      WHERE p.id = ?
    `).get(planId);

    updatedPlan.creator = {
      id: updatedPlan.creator_id,
      username: updatedPlan.creator_name,
      avatar: updatedPlan.creator_avatar
    };
    delete updatedPlan.creator_name;
    delete updatedPlan.creator_avatar;

    const latestUpdate = db.prepare(`
      SELECT pu.*, u.username as updater_name, u.avatar as updater_avatar
      FROM plan_updates pu
      LEFT JOIN users u ON pu.updated_by = u.id
      WHERE pu.plan_id = ?
      ORDER BY pu.created_at DESC
      LIMIT 1
    `).get(planId);

    res.json({ 
      success: true, 
      plan: updatedPlan, 
      changes,
      latest_update: latestUpdate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/:id/cancel', (req, res) => {
  try {
    const planId = req.params.id;
    const { user_id, reason } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: '请填写取消原因' });
    }

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: '计划不存在' });
    }

    if (plan.creator_id !== user_id) {
      return res.status(403).json({ error: '只有创建者才能取消计划' });
    }

    if (plan.status === 'completed') {
      return res.status(400).json({ error: '已完成的活动不能取消' });
    }
    if (plan.status === 'cancelled') {
      return res.status(400).json({ error: '该计划已取消' });
    }

    const startTime = new Date(plan.start_time);
    if (startTime <= new Date()) {
      return res.status(400).json({ error: '活动已开始，无法取消' });
    }

    db.transaction(() => {
      db.prepare("UPDATE citywalk_plans SET status = 'cancelled', cancel_reason = ? WHERE id = ?").run(reason.trim(), planId);

      const participants = db.prepare('SELECT user_id FROM plan_participants WHERE plan_id = ? AND user_id != ?').all(planId, user_id);
      const notifStmt = db.prepare(`
        INSERT INTO user_notifications (user_id, type, content, related_id, related_type, from_user_id, is_read)
        VALUES (?, 'plan_cancel', ?, ?, 'plan', ?, 0)
      `);
      participants.forEach(p => {
        notifStmt.run(p.user_id, `计划"${plan.title}"已取消：${reason.trim()}`, planId, user_id);
      });
    });

    const updatedPlan = db.prepare(`
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar 
      FROM citywalk_plans p 
      LEFT JOIN users u ON p.creator_id = u.id 
      WHERE p.id = ?
    `).get(planId);

    updatedPlan.creator = {
      id: updatedPlan.creator_id,
      username: updatedPlan.creator_name,
      avatar: updatedPlan.creator_avatar
    };
    delete updatedPlan.creator_name;
    delete updatedPlan.creator_avatar;

    res.json({ success: true, plan: updatedPlan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/plans/:id/updates', (req, res) => {
  try {
    const planId = req.params.id;
    
    const updates = db.prepare(`
      SELECT pu.*, u.username as updater_name, u.avatar as updater_avatar
      FROM plan_updates pu
      LEFT JOIN users u ON pu.updated_by = u.id
      WHERE pu.plan_id = ?
      ORDER BY pu.created_at DESC
    `).all(planId).map(u => {
      let changes = [];
      let oldValues = {};
      let newValues = {};
      try { changes = JSON.parse(u.changes || '[]'); } catch(e) {}
      try { oldValues = JSON.parse(u.old_values || '{}'); } catch(e) {}
      try { newValues = JSON.parse(u.new_values || '{}'); } catch(e) {}
      return {
        ...u,
        changes,
        old_values: oldValues,
        new_values: newValues,
        updater_name: u.updater_name || u.u_username,
        updater_avatar: u.updater_avatar || u.u_avatar
      };
    });

    res.json({ success: true, updates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/:id/rate', (req, res) => {
  try {
    const { user_id, route_design, organization, partner_fit, comment } = req.body;
    const planId = req.params.id;

    if (!user_id || !route_design || !organization || !partner_fit) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    if (route_design < 1 || route_design > 5 || organization < 1 || organization > 5 || partner_fit < 1 || partner_fit > 5) {
      return res.status(400).json({ error: '评分必须在1-5星之间' });
    }

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: '计划不存在' });
    }
    if (plan.status !== 'completed') {
      return res.status(400).json({ error: '只有已完成的活动才能评分' });
    }

    const participant = db.prepare('SELECT * FROM plan_participants WHERE plan_id = ? AND user_id = ?').get(planId, user_id);
    if (!participant) {
      return res.status(400).json({ error: '只有参与活动的用户才能评分' });
    }

    const existing = db.prepare('SELECT * FROM plan_ratings WHERE plan_id = ? AND user_id = ?').get(planId, user_id);
    if (existing) {
      return res.status(400).json({ error: '您已经评过分了' });
    }

    const overall = (route_design + organization + partner_fit) / 3;

    const stmt = db.prepare(`
      INSERT INTO plan_ratings (plan_id, user_id, route_design, organization, partner_fit, overall, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(planId, user_id, route_design, organization, partner_fit, overall.toFixed(2), comment || '');

    const rating = db.prepare('SELECT * FROM plan_ratings WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, rating });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/plans/:id/ratings', (req, res) => {
  try {
    const planId = req.params.id;

    const ratings = db.prepare(`
      SELECT r.*, u.username, u.avatar
      FROM plan_ratings r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.plan_id = ?
      ORDER BY r.created_at DESC
    `).all(planId).map(r => ({
      ...r,
      user: { id: r.user_id, username: r.username || r.u_username, avatar: r.avatar || r.u_avatar }
    }));

    let avg_route_design = 0, avg_organization = 0, avg_partner_fit = 0, avg_overall = 0;
    if (ratings.length > 0) {
      avg_route_design = ratings.reduce((sum, r) => sum + r.route_design, 0) / ratings.length;
      avg_organization = ratings.reduce((sum, r) => sum + r.organization, 0) / ratings.length;
      avg_partner_fit = ratings.reduce((sum, r) => sum + r.partner_fit, 0) / ratings.length;
      avg_overall = ratings.reduce((sum, r) => sum + r.overall, 0) / ratings.length;
    }

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings.forEach(r => {
      const star = Math.round(r.overall);
      if (star >= 1 && star <= 5) distribution[star]++;
    });

    res.json({
      success: true,
      ratings,
      stats: {
        count: ratings.length,
        avg_route_design: parseFloat(avg_route_design.toFixed(2)),
        avg_organization: parseFloat(avg_organization.toFixed(2)),
        avg_partner_fit: parseFloat(avg_partner_fit.toFixed(2)),
        avg_overall: parseFloat(avg_overall.toFixed(2)),
        distribution
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/pending-ratings', (req, res) => {
  try {
    const userId = req.params.id;

    const plans = db.prepare(`
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar
      FROM plan_participants pp
      LEFT JOIN citywalk_plans p ON pp.plan_id = p.id
      LEFT JOIN users u ON p.creator_id = u.id
      WHERE pp.user_id = ? AND p.status = 'completed'
      ORDER BY p.start_time DESC
    `).all(userId);

    const pending = [];
    for (const plan of plans) {
      const planId = plan.p_id || plan.plan_id || plan.id;
      for (const key of Object.keys(plan)) {
        if (key.startsWith('p_')) {
          plan[key.slice(2)] = plan[key];
        }
      }
      plan.id = planId;
      
      const rated = db.prepare('SELECT id FROM plan_ratings WHERE plan_id = ? AND user_id = ?').get(planId, userId);
      if (!rated) {
        plan.creator = { id: plan.creator_id, username: plan.creator_name || plan.u_username, avatar: plan.creator_avatar || plan.u_avatar };
        delete plan.creator_name;
        delete plan.creator_avatar;
        pending.push(plan);
      }
    }

    res.json({ success: true, plans: pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/match/suggestions', (req, res) => {
  try {
    const { user_id, city, theme, difficulty } = req.query;
    let sql = `
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar,
             (p.max_participants - p.current_participants) as spots_left
      FROM citywalk_plans p
      LEFT JOIN users u ON p.creator_id = u.id
      WHERE p.status = 'recruiting' AND p.current_participants < p.max_participants
    `;
    const params = [];

    if (city) {
      sql += ' AND p.city = ?';
      params.push(city);
    }
    if (theme) {
      sql += ' AND p.theme = ?';
      params.push(theme);
    }
    if (difficulty) {
      sql += ' AND p.difficulty_level = ?';
      params.push(difficulty);
    }
    if (user_id) {
      sql += ' AND p.creator_id != ? AND p.id NOT IN (SELECT plan_id FROM plan_participants WHERE user_id = ?)';
      params.push(user_id, user_id);
    }

    sql += ' ORDER BY spots_left DESC, p.created_at DESC LIMIT 10';

    const suggestions = db.prepare(sql).all(...params);

    let followedIds = new Set();
    if (user_id) {
      const follows = db.prepare('SELECT following_id FROM user_follows WHERE follower_id = ?').all(user_id);
      followedIds = new Set(follows.map(f => f.following_id));
    }

    suggestions.forEach(s => {
      s.creator = { id: s.creator_id, username: s.creator_name || s.u_username, avatar: s.creator_avatar || s.u_avatar };
      
      const participants = db.prepare(`
        SELECT u.id, u.username, u.avatar, pp.role 
        FROM plan_participants pp 
        LEFT JOIN users u ON pp.user_id = u.id 
        WHERE pp.plan_id = ?
      `).all(s.id).map(p => ({
        id: p.id,
        username: p.username || p.u_username,
        avatar: p.avatar || p.u_avatar,
        role: p.role
      }));

      const checkins = db.prepare('SELECT user_id FROM plan_checkins WHERE plan_id = ?').all(s.id);
      const checkinIds = new Set(checkins.map(c => c.user_id));
      participants.forEach(p => {
        p.is_checked_in = checkinIds.has(p.id);
      });

      s.participants = participants;

      const isFollowedCreator = followedIds.has(String(s.creator_id)) || followedIds.has(Number(s.creator_id));
      const hasFollowedParticipant = participants.some(p => 
        (followedIds.has(String(p.id)) || followedIds.has(Number(p.id))) && String(p.id) !== String(user_id)
      );
      s.is_from_followed = isFollowedCreator || hasFollowedParticipant;

      delete s.creator_name;
      delete s.creator_avatar;
    });

    if (user_id && followedIds.size > 0) {
      suggestions.sort((a, b) => {
        if (a.is_from_followed && !b.is_from_followed) return -1;
        if (!a.is_from_followed && b.is_from_followed) return 1;
        return (b.spots_left || 0) - (a.spots_left || 0);
      });
    }

    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/routes/popular', (req, res) => {
  try {
    const { city, theme, difficulty, limit = 10, user_id } = req.query;
    let sql = `
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar,
             p.current_participants as popularity,
             COUNT(n.id) as notes_count,
             IFNULL(SUM(n.likes), 0) as total_likes
      FROM citywalk_plans p
      LEFT JOIN users u ON p.creator_id = u.id
      LEFT JOIN route_notes n ON n.plan_id = p.id
      WHERE p.status = 'completed'
    `;
    const params = [];

    if (city) {
      sql += ' AND p.city = ?';
      params.push(city);
    }
    if (theme) {
      sql += ' AND p.theme = ?';
      params.push(theme);
    }
    if (difficulty) {
      sql += ' AND p.difficulty_level = ?';
      params.push(difficulty);
    }

    sql += ' GROUP BY p.id';

    const routes = db.prepare(sql).all(...params);

    let userCity = '';
    let userThemeCount = {};
    if (user_id) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
      if (user) {
        userCity = user.city || '';
        const browsedPlans = db.prepare('SELECT bp.*, p.theme, p.city FROM browsed_plans bp LEFT JOIN citywalk_plans p ON bp.plan_id = p.id WHERE bp.user_id = ?').all(user_id);
        browsedPlans.forEach(bp => {
          if (bp.theme) {
            userThemeCount[bp.theme] = (userThemeCount[bp.theme] || 0) + (bp.browse_count || 1);
          }
        });
      }
    }

    for (const r of routes) {
      const ratings = db.prepare('SELECT overall FROM plan_ratings WHERE plan_id = ?').all(r.id);
      const ratingCount = ratings.length;
      const avgRating = ratingCount > 0 ? ratings.reduce((sum, x) => sum + Number(x.overall || 0), 0) / ratingCount : 0;

      r.rating_count = ratingCount;
      r.avg_rating = parseFloat(avgRating.toFixed(2));

      const photos = db.prepare('SELECT * FROM activity_photos WHERE plan_id = ?').all(r.id);
      const photoCount = photos.length;
      r.photos_count = photoCount;

      let photoLikes = 0;
      for (const ph of photos) {
        const likeCount = db.prepare('SELECT COUNT(*) as count FROM photo_likes WHERE photo_id = ?').get(ph.id);
        photoLikes += likeCount ? Object.values(likeCount)[0] : 0;
      }
      r.photo_likes = photoLikes;

      let score = r.popularity * 2 + (r.total_likes || 0) + (r.notes_count || 0) * 3 
        + avgRating * 10 * ratingCount + photoCount * 5 + photoLikes * 2;

      if (user_id) {
        if (userCity && r.city === userCity) {
          score += 30;
          r.personalized_city_bonus = true;
        }
        if (userThemeCount[r.theme]) {
          score += Math.min(userThemeCount[r.theme] * 5, 40);
          r.personalized_theme_bonus = true;
        }
      }

      r.hot_score = parseFloat(score.toFixed(2));
    }

    routes.sort((a, b) => b.hot_score - a.hot_score);

    const limitedRoutes = routes.slice(0, parseInt(limit));

    limitedRoutes.forEach(r => {
      r.creator = { id: r.creator_id, username: r.creator_name || r.u_username, avatar: r.creator_avatar || r.u_avatar };
      delete r.creator_name;
      delete r.creator_avatar;
    });

    res.json({ success: true, routes: limitedRoutes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notes', (req, res) => {
  try {
    const { plan_id, author_id, title, content, photos, location } = req.body;
    if (!plan_id || !author_id || !title) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const stmt = db.prepare(`
      INSERT INTO route_notes (plan_id, author_id, title, content, photos, location)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      plan_id, author_id, title, content || '',
      photos ? JSON.stringify(photos) : '',
      location || ''
    );

    const note = db.prepare(`
      SELECT n.*, u.username as author_name, u.avatar as author_avatar
      FROM route_notes n
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.id = ?
    `).get(result.lastInsertRowid);
    
    if (note) {
      note.author_name = note.author_name || note.u_username;
      note.author_avatar = note.author_avatar || note.u_avatar;
    }

    createFeed(author_id, 'create_note', result.lastInsertRowid, 'note', {
      title: title,
      plan_id: plan_id
    });

    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notes/:id', (req, res) => {
  try {
    const note = db.prepare(`
      SELECT n.*, u.username as author_name, u.avatar as author_avatar
      FROM route_notes n
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.id = ?
    `).get(req.params.id);
    if (!note) {
      return res.status(404).json({ error: '笔记不存在' });
    }
    note.author_name = note.author_name || note.u_username;
    note.author_avatar = note.author_avatar || note.u_avatar;
    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notes/:id', (req, res) => {
  try {
    const { title, content, photos, location } = req.body;
    const stmt = db.prepare(`
      UPDATE route_notes SET title = ?, content = ?, photos = ?, location = ? WHERE id = ?
    `);
    stmt.run(
      title, content || '',
      photos ? JSON.stringify(photos) : '',
      location || '',
      req.params.id
    );
    const note = db.prepare('SELECT * FROM route_notes WHERE id = ?').get(req.params.id);
    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notes/:id/like', (req, res) => {
  try {
    db.prepare('UPDATE route_notes SET likes = likes + 1 WHERE id = ?').run(req.params.id);
    const note = db.prepare('SELECT * FROM route_notes WHERE id = ?').get(req.params.id);
    res.json({ success: true, likes: note.likes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notes/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM route_notes WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM note_comments WHERE note_id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notes/:id/comments', (req, res) => {
  try {
    const { author_id, content, parent_id } = req.body;
    const noteId = req.params.id;
    
    if (!author_id || !content) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const note = db.prepare('SELECT * FROM route_notes WHERE id = ?').get(noteId);
    if (!note) {
      return res.status(404).json({ error: '笔记不存在' });
    }

    let root_id = null;
    let reply_to_user_id = null;
    
    if (parent_id) {
      const parentComment = db.prepare('SELECT * FROM note_comments WHERE id = ?').get(parent_id);
      if (!parentComment) {
        return res.status(404).json({ error: '父评论不存在' });
      }
      root_id = parentComment.root_id || parent_id;
      reply_to_user_id = parentComment.author_id;
    }

    const stmt = db.prepare(`
      INSERT INTO note_comments (note_id, author_id, content, parent_id, root_id, reply_to_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      noteId, author_id, content, 
      parent_id || null, 
      root_id, 
      reply_to_user_id
    );

    const commentId = result.lastInsertRowid;

    if (!root_id) {
      db.prepare('UPDATE note_comments SET root_id = ? WHERE id = ?').run(commentId, commentId);
    }

    db.transaction(() => {
      if (note.author_id !== author_id) {
        db.prepare(`
          INSERT INTO user_notifications (user_id, type, content, related_id, related_type, from_user_id, is_read)
          VALUES (?, 'note_comment', ?, ?, 'note', ?, 0)
        `).run(note.author_id, content, noteId, author_id);
      }
      
      if (reply_to_user_id && reply_to_user_id !== author_id && reply_to_user_id !== note.author_id) {
        db.prepare(`
          INSERT INTO user_notifications (user_id, type, content, related_id, related_type, from_user_id, is_read)
          VALUES (?, 'comment_reply', ?, ?, 'comment', ?, 0)
        `).run(reply_to_user_id, content, commentId, author_id);
      }
    });

    const comment = db.prepare(`
      SELECT c.*, u.username as author_name, u.avatar as author_avatar,
             ru.username as reply_to_name, ra.avatar as reply_to_avatar
      FROM note_comments c
      LEFT JOIN users u ON c.author_id = u.id
      LEFT JOIN users ru ON c.reply_to_user_id = ru.id
      WHERE c.id = ?
    `).get(commentId);

    if (comment) {
      comment.author_name = comment.author_name || comment.u_username;
      comment.author_avatar = comment.author_avatar || comment.u_avatar;
      comment.reply_to_name = comment.reply_to_name || comment.ru_username;
      comment.reply_to_avatar = comment.reply_to_avatar || comment.ru_avatar;
    }

    res.json({ success: true, comment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notes/:id/comments', (req, res) => {
  try {
    const noteId = req.params.id;
    
    const comments = db.prepare(`
      SELECT c.*, u.username as author_name, u.avatar as author_avatar,
             ru.username as reply_to_name, ra.avatar as reply_to_avatar
      FROM note_comments c
      LEFT JOIN users u ON c.author_id = u.id
      LEFT JOIN users ru ON c.reply_to_user_id = ru.id
      WHERE c.note_id = ?
      ORDER BY c.created_at ASC
    `).all(noteId).map(c => ({
      ...c,
      author_name: c.author_name || c.u_username,
      author_avatar: c.author_avatar || c.u_avatar,
      reply_to_name: c.reply_to_name || c.ru_username,
      reply_to_avatar: c.reply_to_avatar || c.ru_avatar
    }));

    const commentMap = new Map();
    const rootComments = [];
    
    comments.forEach(c => {
      c.replies = [];
      commentMap.set(c.id, c);
      if (!c.parent_id) {
        rootComments.push(c);
      } else {
        const parent = commentMap.get(c.parent_id);
        if (parent) {
          parent.replies.push(c);
        } else {
          rootComments.push(c);
        }
      }
    });

    function countReplies(comment) {
      let count = comment.replies.length;
      comment.replies.forEach(r => count += countReplies(r));
      return count;
    }

    res.json({ 
      success: true, 
      comments: rootComments,
      total_count: comments.length,
      root_count: rootComments.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/comments/:id', (req, res) => {
  try {
    const { user_id } = req.body;
    const comment = db.prepare('SELECT * FROM note_comments WHERE id = ?').get(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ error: '评论不存在' });
    }
    if (comment.author_id !== user_id) {
      return res.status(403).json({ error: '无权删除此评论' });
    }

    db.transaction(() => {
      function deleteReplies(parentId) {
        const replies = db.prepare('SELECT id FROM note_comments WHERE parent_id = ?').all(parentId);
        replies.forEach(r => {
          deleteReplies(r.id);
          db.prepare('DELETE FROM note_comments WHERE id = ?').run(r.id);
        });
      }
      deleteReplies(req.params.id);
      db.prepare('DELETE FROM note_comments WHERE id = ?').run(req.params.id);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/notifications', (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.params.id;
    
    const notifications = db.prepare(`
      SELECT nt.*, u.username as from_user_name, u.avatar as from_user_avatar,
             n.title as note_title, p.title as plan_title
      FROM user_notifications nt
      LEFT JOIN users u ON nt.from_user_id = u.id
      LEFT JOIN route_notes n ON nt.related_type = 'note' AND nt.related_id = n.id
      LEFT JOIN citywalk_plans p ON nt.related_type = 'plan' AND nt.related_id = p.id
      WHERE nt.user_id = ?
      ORDER BY nt.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)).map(n => ({
      ...n,
      from_user_name: n.from_user_name || n.u_username,
      from_user_avatar: n.from_user_avatar || n.u_avatar,
      note_title: n.note_title || n.n_title,
      plan_title: n.plan_title || n.p_title
    }));

    const unreadCount = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND is_read = 0').get(userId);

    res.json({ 
      success: true, 
      notifications,
      unread_count: unreadCount ? Object.values(unreadCount)[0] : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/notifications/unread', (req, res) => {
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND is_read = 0').get(req.params.id);
    const count = result ? Object.values(result)[0] : 0;
    res.json({ success: true, unread_count: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', (req, res) => {
  try {
    db.prepare('UPDATE user_notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id/notifications/read-all', (req, res) => {
  try {
    db.prepare('UPDATE user_notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notifications/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM user_notifications WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/favorites', (req, res) => {
  try {
    const { user_id, plan_id } = req.body;
    if (!user_id || !plan_id) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    const stmt = db.prepare('INSERT OR IGNORE INTO favorite_routes (user_id, plan_id) VALUES (?, ?)');
    stmt.run(user_id, plan_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/favorites', (req, res) => {
  try {
    const { user_id, plan_id } = req.body;
    db.prepare('DELETE FROM favorite_routes WHERE user_id = ? AND plan_id = ?').run(user_id, plan_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/favorites', (req, res) => {
  try {
    const routes = db.prepare(`
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar, f.favorited_at
      FROM favorite_routes f
      LEFT JOIN citywalk_plans p ON f.plan_id = p.id
      LEFT JOIN users u ON p.creator_id = u.id
      WHERE f.user_id = ?
      ORDER BY f.favorited_at DESC
    `).all(req.params.id);
    routes.forEach(r => {
      r.creator = { id: r.creator_id, username: r.creator_name || r.u_username, avatar: r.creator_avatar || r.u_avatar };
      delete r.creator_name;
      delete r.creator_avatar;
    });
    res.json({ success: true, favorites: routes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/plans', (req, res) => {
  try {
    const plans = db.prepare(`
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar
      FROM plan_participants pp
      LEFT JOIN citywalk_plans p ON pp.plan_id = p.id
      LEFT JOIN users u ON p.creator_id = u.id
      WHERE pp.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.params.id);
    plans.forEach(p => {
      const planId = p.p_id || p.plan_id || p.id;
      for (const key of Object.keys(p)) {
        if (key.startsWith('p_')) {
          p[key.slice(2)] = p[key];
        }
      }
      p.id = planId;
      p.creator = { id: p.creator_id, username: p.creator_name || p.u_username, avatar: p.creator_avatar || p.u_avatar };
      const participants = db.prepare(`
        SELECT u.id, u.username, u.avatar, pp.role 
        FROM plan_participants pp 
        LEFT JOIN users u ON pp.user_id = u.id 
        WHERE pp.plan_id = ?
      `).all(planId).map(x => ({
        id: x.id,
        username: x.username || x.u_username,
        avatar: x.avatar || x.u_avatar,
        role: x.role
      }));

      const checkins = db.prepare('SELECT user_id FROM plan_checkins WHERE plan_id = ?').all(planId);
      const checkinIds = new Set(checkins.map(c => c.user_id));
      participants.forEach(x => {
        x.is_checked_in = checkinIds.has(x.id);
      });

      p.participants = participants;
      delete p.creator_name;
      delete p.creator_avatar;
    });
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/ratings-stats', (req, res) => {
  try {
    const userId = req.params.id;

    const createdPlans = db.prepare('SELECT id FROM citywalk_plans WHERE creator_id = ?').all(userId);
    const createdPlanIds = createdPlans.map(p => p.id);

    let allRatings = [];
    for (const planId of createdPlanIds) {
      const ratings = db.prepare('SELECT * FROM plan_ratings WHERE plan_id = ?').all(planId);
      allRatings = allRatings.concat(ratings);
    }

    const ratingCount = allRatings.length;
    let avgOverall = 0, avgRouteDesign = 0, avgOrganization = 0, avgPartnerFit = 0;

    if (ratingCount > 0) {
      avgOverall = allRatings.reduce((sum, r) => sum + Number(r.overall || 0), 0) / ratingCount;
      avgRouteDesign = allRatings.reduce((sum, r) => sum + Number(r.route_design || 0), 0) / ratingCount;
      avgOrganization = allRatings.reduce((sum, r) => sum + Number(r.organization || 0), 0) / ratingCount;
      avgPartnerFit = allRatings.reduce((sum, r) => sum + Number(r.partner_fit || 0), 0) / ratingCount;
    }

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    allRatings.forEach(r => {
      const star = Math.round(r.overall);
      if (star >= 1 && star <= 5) distribution[star]++;
    });

    res.json({
      success: true,
      stats: {
        created_plans_count: createdPlanIds.length,
        rating_count: ratingCount,
        avg_overall: parseFloat(avgOverall.toFixed(2)),
        avg_route_design: parseFloat(avgRouteDesign.toFixed(2)),
        avg_organization: parseFloat(avgOrganization.toFixed(2)),
        avg_partner_fit: parseFloat(avgPartnerFit.toFixed(2)),
        distribution
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function createFeed(user_id, type, related_id, related_type, extra_data = {}) {
  try {
    const stmt = db.prepare(`
      INSERT INTO activity_feeds (user_id, type, related_id, related_type, extra_data)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(user_id, type, related_id, related_type, JSON.stringify(extra_data));
    return true;
  } catch (e) {
    console.error('创建动态失败:', e.message);
    return false;
  }
}

app.post('/api/follows', (req, res) => {
  try {
    const { follower_id, following_id } = req.body;
    if (!follower_id || !following_id) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    if (Number(follower_id) === Number(following_id)) {
      return res.status(400).json({ error: '不能关注自己' });
    }
    const stmt = db.prepare('INSERT OR IGNORE INTO user_follows (follower_id, following_id) VALUES (?, ?)');
    stmt.run(follower_id, following_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/follows', (req, res) => {
  try {
    const { follower_id, following_id } = req.body;
    db.prepare('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?').run(follower_id, following_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/following', (req, res) => {
  try {
    const userId = req.params.id;
    const users = db.prepare(`
      SELECT u.*, fl.created_at as followed_at
      FROM user_follows fl
      LEFT JOIN users u ON fl.following_id = u.id
      WHERE fl.follower_id = ?
      ORDER BY fl.created_at DESC
    `).all(userId).map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      bio: u.bio,
      city: u.city,
      followed_at: u.followed_at
    }));
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/followers', (req, res) => {
  try {
    const userId = req.params.id;
    const users = db.prepare(`
      SELECT u.*, fl.created_at as followed_at
      FROM user_follows fl
      LEFT JOIN users u ON fl.follower_id = u.id
      WHERE fl.following_id = ?
      ORDER BY fl.created_at DESC
    `).all(userId).map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      bio: u.bio,
      city: u.city,
      followed_at: u.followed_at
    }));
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/follows-status', (req, res) => {
  try {
    const userId = req.params.id;
    const { target_id } = req.query;
    if (!target_id) {
      return res.status(400).json({ error: '缺少 target_id' });
    }
    const result = db.prepare('SELECT * FROM user_follows WHERE follower_id = ? AND following_id = ?').get(userId, target_id);
    res.json({ success: true, is_following: !!result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/feeds', (req, res) => {
  try {
    const userId = req.params.id;
    const { type = 'all', page = 1, limit = 30 } = req.query;

    const followings = db.prepare('SELECT following_id FROM user_follows WHERE follower_id = ?').all(userId);
    const followingIds = followings.map(f => f.following_id);
    
    if (followingIds.length === 0) {
      return res.json({ success: true, feeds: [], has_more: false });
    }

    const placeholders = followingIds.map(() => '?').join(',');
    
    let sql = `
      SELECT fd.*
      FROM activity_feeds fd
      LEFT JOIN users u ON fd.user_id = u.id
      LEFT JOIN citywalk_plans p ON fd.related_id = p.id
      LEFT JOIN route_notes n ON fd.related_id = n.id
      WHERE fd.user_id IN (${placeholders})
    `;
    const params = [...followingIds];

    if (type === 'new_plan') {
      sql += ' AND fd.type = ?';
      params.push('create_plan');
    }

    sql += ' ORDER BY fd.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const feeds = db.prepare(sql).all(...params).map(f => {
      let extra = {};
      try {
        extra = f.extra_data ? JSON.parse(f.extra_data) : {};
      } catch (e) {}
      
      return {
        id: f.id,
        type: f.type,
        created_at: f.created_at,
        user: {
          id: f.user_id,
          username: f.u_username,
          avatar: f.u_avatar
        },
        related: {
          id: f.related_id || (f.related_type === 'plan' ? f.p_id : f.n_id),
          type: f.related_type,
          title: f.related_type === 'plan' ? (f.p_title || extra.title) : (f.n_title || extra.title),
          theme: f.p_theme || extra.theme,
          city: f.p_city || extra.city,
          status: f.p_status,
          content: f.n_content
        },
        extra
      };
    });

    res.json({ success: true, feeds, has_more: feeds.length >= parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/templates', (req, res) => {
  try {
    const { creator_id, name, theme, city, description, meeting_point, is_public } = req.body;
    if (!creator_id || !name || !theme) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    const stmt = db.prepare(`
      INSERT INTO route_templates (creator_id, name, theme, city, description, meeting_point, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      creator_id, name, theme, city || '', description || '',
      meeting_point || '', is_public ? 1 : 0
    );
    const tmpl = db.prepare('SELECT * FROM route_templates WHERE id = ?').get(result.lastInsertRowid);
    const creator = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(creator_id);
    tmpl.creator = creator;
    res.json({ success: true, template: tmpl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/templates/:id', (req, res) => {
  try {
    const tmpl = db.prepare(`
      SELECT rt.*, u.username as creator_name, u.avatar as creator_avatar
      FROM route_templates rt
      LEFT JOIN users u ON rt.creator_id = u.id
      WHERE rt.id = ?
    `).get(req.params.id);
    if (!tmpl) {
      return res.status(404).json({ error: '模板不存在' });
    }
    tmpl.creator = { id: tmpl.creator_id, username: tmpl.creator_name || tmpl.u_username, avatar: tmpl.creator_avatar || tmpl.u_avatar };
    delete tmpl.creator_name;
    delete tmpl.creator_avatar;
    Object.keys(tmpl).filter(k => k.startsWith('u_')).forEach(k => delete tmpl[k]);
    res.json({ success: true, template: tmpl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/templates', (req, res) => {
  try {
    const templates = db.prepare(`
      SELECT rt.*, u.username as creator_name, u.avatar as creator_avatar
      FROM route_templates rt
      LEFT JOIN users u ON rt.creator_id = u.id
      WHERE rt.creator_id = ?
      ORDER BY rt.created_at DESC
    `).all(req.params.id);
    templates.forEach(t => {
      t.creator = { id: t.creator_id, username: t.creator_name || t.u_username, avatar: t.creator_avatar || t.u_avatar };
      delete t.creator_name;
      delete t.creator_avatar;
      Object.keys(t).filter(k => k.startsWith('u_')).forEach(k => delete t[k]);
    });
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/templates/public', (req, res) => {
  try {
    const { city, theme, keyword } = req.query;
    let sql = `
      SELECT rt.*, u.username as creator_name, u.avatar as creator_avatar
      FROM route_templates rt
      LEFT JOIN users u ON rt.creator_id = u.id
      WHERE rt.is_public = 1
    `;
    const params = [];
    if (city) {
      sql += ' AND rt.city = ?';
      params.push(city);
    }
    if (theme) {
      sql += ' AND rt.theme = ?';
      params.push(theme);
    }
    if (keyword) {
      sql += ' AND (rt.name LIKE ? OR rt.description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    sql += ' ORDER BY rt.created_at DESC LIMIT 50';
    const templates = db.prepare(sql).all(...params);
    templates.forEach(t => {
      t.creator = { id: t.creator_id, username: t.creator_name || t.u_username, avatar: t.creator_avatar || t.u_avatar };
      delete t.creator_name;
      delete t.creator_avatar;
      Object.keys(t).filter(k => k.startsWith('u_')).forEach(k => delete t[k]);
    });
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/templates/:id', (req, res) => {
  try {
    const templateId = req.params.id;
    const { user_id, name, theme, city, description, meeting_point, is_public } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }
    const tmpl = db.prepare('SELECT * FROM route_templates WHERE id = ?').get(templateId);
    if (!tmpl) {
      return res.status(404).json({ error: '模板不存在' });
    }
    if (tmpl.creator_id !== user_id) {
      return res.status(403).json({ error: '只有创建者才能编辑模板' });
    }
    db.prepare(`
      UPDATE route_templates SET name = ?, theme = ?, city = ?, description = ?, meeting_point = ?, is_public = ? WHERE id = ?
    `).run(name || tmpl.name, theme || tmpl.theme, city !== undefined ? city : tmpl.city, description !== undefined ? description : tmpl.description, meeting_point !== undefined ? meeting_point : tmpl.meeting_point, is_public !== undefined ? (is_public ? 1 : 0) : tmpl.is_public, templateId);
    const updated = db.prepare('SELECT * FROM route_templates WHERE id = ?').get(templateId);
    const creator = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(user_id);
    updated.creator = creator;
    res.json({ success: true, template: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', (req, res) => {
  try {
    const templateId = req.params.id;
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }
    const tmpl = db.prepare('SELECT * FROM route_templates WHERE id = ?').get(templateId);
    if (!tmpl) {
      return res.status(404).json({ error: '模板不存在' });
    }
    if (tmpl.creator_id !== user_id) {
      return res.status(403).json({ error: '只有创建者才能删除模板' });
    }
    db.prepare('DELETE FROM route_templates WHERE id = ?').run(templateId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/:id/search-history', (req, res) => {
  try {
    const userId = req.params.id;
    const { keyword } = req.body;
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ error: '搜索关键词不能为空' });
    }
    const trimmed = keyword.trim();
    const existing = db.prepare('SELECT * FROM search_history WHERE user_id = ? AND keyword = ?').get(userId, trimmed);
    if (existing) {
      db.prepare('UPDATE search_history SET searched_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    } else {
      const countResult = db.prepare('SELECT COUNT(*) as count FROM search_history WHERE user_id = ?').get(userId);
      const count = countResult ? Object.values(countResult)[0] : 0;
      if (count >= 20) {
        const oldest = db.prepare('SELECT * FROM search_history WHERE user_id = ? ORDER BY searched_at ASC LIMIT 1').get(userId);
        if (oldest) {
          db.prepare('DELETE FROM search_history WHERE id = ?').run(oldest.id);
        }
      }
      db.prepare('INSERT INTO search_history (user_id, keyword) VALUES (?, ?)').run(userId, trimmed);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/search-history', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const records = db.prepare('SELECT * FROM search_history WHERE user_id = ? ORDER BY searched_at DESC LIMIT ?').all(req.params.id, parseInt(limit));
    res.json({ success: true, history: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id/search-history', (req, res) => {
  try {
    db.prepare('DELETE FROM search_history WHERE user_id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/:id/browsed-plans', (req, res) => {
  try {
    const userId = req.params.id;
    const { plan_id } = req.body;
    if (!plan_id) {
      return res.status(400).json({ error: '缺少计划ID' });
    }
    const existing = db.prepare('SELECT * FROM browsed_plans WHERE user_id = ? AND plan_id = ?').get(userId, plan_id);
    if (existing) {
      db.prepare('UPDATE browsed_plans SET browsed_at = CURRENT_TIMESTAMP, browse_count = browse_count + 1 WHERE id = ?').run(existing.id);
    } else {
      const countResult = db.prepare('SELECT COUNT(*) as count FROM browsed_plans WHERE user_id = ?').get(userId);
      const count = countResult ? Object.values(countResult)[0] : 0;
      if (count >= 50) {
        const oldest = db.prepare('SELECT * FROM browsed_plans WHERE user_id = ? ORDER BY browsed_at ASC LIMIT 1').get(userId);
        if (oldest) {
          db.prepare('DELETE FROM browsed_plans WHERE id = ?').run(oldest.id);
        }
      }
      db.prepare('INSERT INTO browsed_plans (user_id, plan_id) VALUES (?, ?)').run(userId, plan_id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/recommendations', (req, res) => {
  try {
    const userId = req.params.id;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const browsedPlans = db.prepare('SELECT bp.*, p.theme, p.city FROM browsed_plans bp LEFT JOIN citywalk_plans p ON bp.plan_id = p.id WHERE bp.user_id = ? ORDER BY bp.browsed_at DESC LIMIT 50').all(userId);

    const themeCount = {};
    const cityCount = {};
    browsedPlans.forEach(bp => {
      if (bp.theme) {
        themeCount[bp.theme] = (themeCount[bp.theme] || 0) + (bp.browse_count || 1);
      }
      if (bp.city) {
        cityCount[bp.city] = (cityCount[bp.city] || 0) + (bp.browse_count || 1);
      }
    });

    const searchHistory = db.prepare('SELECT keyword FROM search_history WHERE user_id = ? ORDER BY searched_at DESC LIMIT 10').all(userId);

    const browsedPlanIds = browsedPlans.map(bp => bp.plan_id);
    const joinedPlanIds = db.prepare('SELECT plan_id FROM plan_participants WHERE user_id = ?').all(userId).map(p => p.plan_id);
    const excludeIds = [...new Set([...browsedPlanIds, ...joinedPlanIds])];

    let recruitingPlans = db.prepare(`
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar
      FROM citywalk_plans p
      LEFT JOIN users u ON p.creator_id = u.id
      WHERE p.status = 'recruiting' AND p.creator_id != ?
    `).all(userId);

    if (excludeIds.length > 0) {
      recruitingPlans = recruitingPlans.filter(p => !excludeIds.includes(p.id));
    }

    recruitingPlans.forEach(plan => {
      let score = 0;

      if (user.city && plan.city === user.city) {
        score += 30;
      }

      if (themeCount[plan.theme]) {
        score += Math.min(themeCount[plan.theme] * 10, 50);
      }

      if (cityCount[plan.city]) {
        score += Math.min(cityCount[plan.city] * 5, 30);
      }

      if (searchHistory.length > 0) {
        const keywords = searchHistory.map(s => s.keyword.toLowerCase());
        const titleLower = (plan.title || '').toLowerCase();
        const descLower = (plan.description || '').toLowerCase();
        for (const kw of keywords) {
          if (titleLower.includes(kw) || descLower.includes(kw)) {
            score += 15;
            break;
          }
        }
      }

      const spotsLeft = plan.max_participants - plan.current_participants;
      score += Math.max(spotsLeft * 2, 0);

      const createdAt = new Date(plan.created_at);
      const now = new Date();
      const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
      if (hoursDiff < 24) score += 20;
      else if (hoursDiff < 72) score += 10;

      plan.recommendation_score = score;
    });

    recruitingPlans.sort((a, b) => b.recommendation_score - a.recommendation_score);

    const recommendations = recruitingPlans.slice(0, 5);

    recommendations.forEach(r => {
      r.creator = { id: r.creator_id, username: r.creator_name || r.u_username, avatar: r.creator_avatar || r.u_avatar };
      const participants = db.prepare(`
        SELECT u.id, u.username, u.avatar, pp.role
        FROM plan_participants pp
        LEFT JOIN users u ON pp.user_id = u.id
        WHERE pp.plan_id = ?
      `).all(r.id).map(p => ({
        id: p.id,
        username: p.username || p.u_username,
        avatar: p.avatar || p.u_avatar,
        role: p.role
      }));

      const checkins = db.prepare('SELECT user_id FROM plan_checkins WHERE plan_id = ?').all(r.id);
      const checkinIds = new Set(checkins.map(c => c.user_id));
      participants.forEach(p => {
        p.is_checked_in = checkinIds.has(p.id);
      });

      r.participants = participants;
      delete r.creator_name;
      delete r.creator_avatar;
    });

    res.json({ success: true, recommendations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/themes', (req, res) => {
  const themes = [
    { id: 'old_building', name: '老洋房', icon: '🏛️', color: '#8B4513' },
    { id: 'market', name: '菜市场巡礼', icon: '🥬', color: '#228B22' },
    { id: 'bridge', name: '天桥秘境', icon: '🌉', color: '#4682B4' },
    { id: 'alley', name: '弄堂探索', icon: '🏮', color: '#DC143C' },
    { id: 'coffee', name: '咖啡馆漫游', icon: '☕', color: '#6F4E37' },
    { id: 'street_art', name: '街头艺术', icon: '🎨', color: '#9932CC' },
    { id: 'river', name: '滨江步道', icon: '🌊', color: '#1E90FF' },
    { id: 'park', name: '公园秘境', icon: '🌳', color: '#32CD32' },
    { id: 'night', name: '夜色漫步', icon: '🌙', color: '#483D8B' },
    { id: 'food', name: '小吃寻味', icon: '🍜', color: '#FF6347' }
  ];
  res.json({ success: true, themes });
});

app.get('/api/cities', (req, res) => {
  const cities = db.prepare('SELECT DISTINCT city FROM citywalk_plans WHERE city IS NOT NULL AND city != "" ORDER BY city').all();
  const citySet = new Set(cities.map(c => c.city));
  let cityList = Array.from(citySet).sort();
  if (cityList.length === 0) {
    cityList = ['上海', '北京', '广州', '成都', '杭州', '南京', '武汉', '西安'];
  }
  const defaultCities = ['上海', '北京', '广州', '成都', '杭州', '南京', '武汉', '西安'];
  for (const c of defaultCities) {
    if (!cityList.includes(c)) cityList.push(c);
  }
  res.json({ success: true, cities: Array.from(new Set(cityList)).sort() });
});

app.post('/api/photos', (req, res) => {
  try {
    const { plan_id, user_id, image_url, caption, location } = req.body;
    if (!plan_id || !user_id || !image_url) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(plan_id);
    if (!plan) {
      return res.status(404).json({ error: '活动不存在' });
    }

    const participant = db.prepare('SELECT * FROM plan_participants WHERE plan_id = ? AND user_id = ?').get(plan_id, user_id);
    if (!participant) {
      return res.status(403).json({ error: '只有活动参与者才能上传照片' });
    }

    const stmt = db.prepare(`
      INSERT INTO activity_photos (plan_id, user_id, image_url, caption, location)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      plan_id, user_id, image_url,
      caption || '', location || ''
    );

    const photo = db.prepare(`
      SELECT ph.*, u.username as author_name, u.avatar as author_avatar
      FROM activity_photos ph
      LEFT JOIN users u ON ph.user_id = u.id
      WHERE ph.id = ?
    `).get(result.lastInsertRowid);

    if (photo) {
      photo.author_name = photo.author_name || photo.u_username;
      photo.author_avatar = photo.author_avatar || photo.u_avatar;
      photo.likes = 0;
      photo.is_liked = false;
    }

    createFeed(user_id, 'upload_photo', result.lastInsertRowid, 'photo', {
      plan_id: plan_id,
      plan_title: plan.title
    });

    res.json({ success: true, photo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/plans/:id/photos', (req, res) => {
  try {
    const planId = req.params.id;
    const { user_id, page = 1, limit = 30 } = req.query;

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: '活动不存在' });
    }

    const photos = db.prepare(`
      SELECT ph.*, u.username as author_name, u.avatar as author_avatar
      FROM activity_photos ph
      LEFT JOIN users u ON ph.user_id = u.id
      WHERE ph.plan_id = ?
      ORDER BY ph.created_at DESC
      LIMIT ? OFFSET ?
    `).all(planId, parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const processedPhotos = photos.map(ph => {
      const photo = { ...ph };
      photo.author_name = photo.author_name || photo.u_username;
      photo.author_avatar = photo.author_avatar || photo.u_avatar;
      
      const likeCount = db.prepare('SELECT COUNT(*) as count FROM photo_likes WHERE photo_id = ?').get(photo.id);
      photo.likes = likeCount ? Object.values(likeCount)[0] : 0;
      
      if (user_id) {
        const liked = db.prepare('SELECT * FROM photo_likes WHERE photo_id = ? AND user_id = ?').get(photo.id, user_id);
        photo.is_liked = !!liked;
      } else {
        photo.is_liked = false;
      }
      
      return photo;
    });

    const totalResult = db.prepare('SELECT COUNT(*) as count FROM activity_photos WHERE plan_id = ?').get(planId);
    const total = totalResult ? Object.values(totalResult)[0] : 0;

    res.json({
      success: true,
      photos: processedPhotos,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      has_more: total > parseInt(page) * parseInt(limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/photos/:id/like', (req, res) => {
  try {
    const photoId = req.params.id;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const photo = db.prepare('SELECT * FROM activity_photos WHERE id = ?').get(photoId);
    if (!photo) {
      return res.status(404).json({ error: '照片不存在' });
    }

    const existing = db.prepare('SELECT * FROM photo_likes WHERE photo_id = ? AND user_id = ?').get(photoId, user_id);
    if (existing) {
      db.prepare('DELETE FROM photo_likes WHERE photo_id = ? AND user_id = ?').run(photoId, user_id);
    } else {
      db.prepare('INSERT INTO photo_likes (photo_id, user_id) VALUES (?, ?)').run(photoId, user_id);
      if (photo.user_id !== user_id) {
        db.prepare(`
          INSERT INTO user_notifications (user_id, type, content, related_id, related_type, from_user_id, is_read)
          VALUES (?, 'photo_like', '赞了你的照片', ?, 'photo', ?, 0)
        `).run(photo.user_id, photoId, user_id);
      }
    }

    const likeCount = db.prepare('SELECT COUNT(*) as count FROM photo_likes WHERE photo_id = ?').get(photoId);
    const likes = likeCount ? Object.values(likeCount)[0] : 0;
    const isLiked = !existing;

    res.json({ success: true, likes, is_liked: isLiked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/photos/:id', (req, res) => {
  try {
    const photoId = req.params.id;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const photo = db.prepare('SELECT * FROM activity_photos WHERE id = ?').get(photoId);
    if (!photo) {
      return res.status(404).json({ error: '照片不存在' });
    }

    if (photo.user_id !== user_id) {
      return res.status(403).json({ error: '只能删除自己上传的照片' });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM photo_likes WHERE photo_id = ?').run(photoId);
      db.prepare('DELETE FROM activity_photos WHERE id = ?').run(photoId);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/photos-stats', (req, res) => {
  try {
    const userId = req.params.id;

    const photoCountResult = db.prepare('SELECT COUNT(*) as count FROM activity_photos WHERE user_id = ?').get(userId);
    const photoCount = photoCountResult ? Object.values(photoCountResult)[0] : 0;

    const likeCountResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM photo_likes pl 
      JOIN activity_photos ph ON pl.photo_id = ph.id 
      WHERE ph.user_id = ?
    `).get(userId);
    const totalLikes = likeCountResult ? Object.values(likeCountResult)[0] : 0;

    res.json({
      success: true,
      stats: {
        photos_count: photoCount,
        total_likes: totalLikes
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generateToken() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function isPlanParticipant(planId, userId) {
  const participant = db.prepare('SELECT * FROM plan_participants WHERE plan_id = ? AND user_id = ?').get(planId, userId);
  return !!participant;
}

app.get('/api/plans/:id/guide', (req, res) => {
  try {
    const planId = req.params.id;
    const { user_id } = req.query;

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: '计划不存在' });
    }

    let guide = db.prepare('SELECT * FROM route_guides WHERE plan_id = ?').get(planId);
    
    if (!guide) {
      const stmt = db.prepare(`
        INSERT INTO route_guides (plan_id, title, description, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        planId,
        plan.title + ' - 路线攻略',
        plan.description || '',
        plan.creator_id,
        plan.creator_id
      );
      guide = db.prepare('SELECT * FROM route_guides WHERE id = ?').get(result.lastInsertRowid);
    }

    const checkinPoints = db.prepare(`
      SELECT * FROM checkin_points 
      WHERE guide_id = ? 
      ORDER BY order_index ASC, id ASC
    `).all(guide.id).map(p => {
      let photos = [];
      try { photos = p.photos ? JSON.parse(p.photos) : []; } catch(e) {}
      return { ...p, photos };
    });

    const versions = db.prepare(`
      SELECT gv.*, u.username as creator_name, u.avatar as creator_avatar
      FROM guide_versions gv
      LEFT JOIN users u ON gv.created_by = u.id
      WHERE gv.guide_id = ?
      ORDER BY gv.version_number DESC
    `).all(guide.id).map(v => {
      let snapshot = {};
      try { snapshot = v.snapshot ? JSON.parse(v.snapshot) : {}; } catch(e) {}
      return {
        ...v,
        snapshot,
        creator_name: v.creator_name || v.u_username,
        creator_avatar: v.creator_avatar || v.u_avatar
      };
    });

    const canEdit = user_id ? isPlanParticipant(planId, user_id) : false;

    const sharePage = db.prepare('SELECT share_token FROM share_pages WHERE guide_id = ? ORDER BY id DESC LIMIT 1').get(guide.id);

    guide.checkin_points = checkinPoints;
    guide.versions = versions;
    guide.can_edit = canEdit;
    guide.participants_count = plan.current_participants;
    guide.share_token = sharePage ? sharePage.share_token : null;

    res.json({ success: true, guide, points: checkinPoints });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/plans/:id/guide', (req, res) => {
  try {
    const planId = req.params.id;
    const { user_id, title, description } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    if (!isPlanParticipant(planId, user_id)) {
      return res.status(403).json({ error: '只有活动参与者才能编辑攻略' });
    }

    let guide = db.prepare('SELECT * FROM route_guides WHERE plan_id = ?').get(planId);
    if (!guide) {
      return res.status(404).json({ error: '攻略不存在' });
    }

    db.prepare(`
      UPDATE route_guides 
      SET title = ?, description = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title !== undefined ? title : guide.title,
      description !== undefined ? description : guide.description,
      user_id,
      guide.id
    );

    guide = db.prepare('SELECT * FROM route_guides WHERE id = ?').get(guide.id);
    
    const checkinPoints = db.prepare(`
      SELECT * FROM checkin_points 
      WHERE guide_id = ? 
      ORDER BY order_index ASC, id ASC
    `).all(guide.id).map(p => {
      let photos = [];
      try { photos = p.photos ? JSON.parse(p.photos) : []; } catch(e) {}
      return { ...p, photos };
    });
    guide.checkin_points = checkinPoints;

    res.json({ success: true, guide });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/:id/guide/version', (req, res) => {
  try {
    const planId = req.params.id;
    const { user_id, version_name, description } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    if (!isPlanParticipant(planId, user_id)) {
      return res.status(403).json({ error: '只有活动参与者才能保存版本' });
    }

    let guide = db.prepare('SELECT * FROM route_guides WHERE plan_id = ?').get(planId);
    if (!guide) {
      return res.status(404).json({ error: '攻略不存在' });
    }

    const checkinPoints = db.prepare(`
      SELECT * FROM checkin_points 
      WHERE guide_id = ? 
      ORDER BY order_index ASC, id ASC
    `).all(guide.id).map(p => {
      let photos = [];
      try { photos = p.photos ? JSON.parse(p.photos) : []; } catch(e) {}
      return { ...p, photos };
    });

    const snapshot = {
      title: guide.title,
      description: guide.description,
      checkin_points: checkinPoints
    };

    const versionCount = db.prepare('SELECT COUNT(*) as count FROM guide_versions WHERE guide_id = ?').get(guide.id);
    const count = versionCount ? Object.values(versionCount)[0] : 0;

    const stmt = db.prepare(`
      INSERT INTO guide_versions (guide_id, version_number, version_name, snapshot, created_by, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      guide.id,
      count + 1,
      version_name || `版本 ${count + 1}`,
      JSON.stringify(snapshot),
      user_id,
      description || '保存版本'
    );

    const version = db.prepare(`
      SELECT gv.*, u.username as creator_name, u.avatar as creator_avatar
      FROM guide_versions gv
      LEFT JOIN users u ON gv.created_by = u.id
      WHERE gv.id = ?
    `).get(result.lastInsertRowid);

    if (version) {
      version.snapshot = snapshot;
      version.creator_name = version.creator_name || version.u_username;
      version.creator_avatar = version.creator_avatar || version.u_avatar;
    }

    res.json({ success: true, version });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/plans/:id/guide/versions', (req, res) => {
  try {
    const planId = req.params.id;

    let guide = db.prepare('SELECT * FROM route_guides WHERE plan_id = ?').get(planId);
    if (!guide) {
      return res.json({ success: true, versions: [] });
    }

    const versions = db.prepare(`
      SELECT gv.*, u.username as creator_name, u.avatar as creator_avatar
      FROM guide_versions gv
      LEFT JOIN users u ON gv.created_by = u.id
      WHERE gv.guide_id = ?
      ORDER BY gv.version_number DESC
    `).all(guide.id);

    const result = versions.map(v => ({
      ...v,
      version_name: v.version_name || `版本 ${v.version_number}`,
      created_by_name: v.creator_name || '匿名用户'
    }));

    res.json({ success: true, versions: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/:id/guide/rollback', (req, res) => {
  try {
    const planId = req.params.id;
    const { user_id, version_id } = req.body;

    if (!user_id || !version_id) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    if (!isPlanParticipant(planId, user_id)) {
      return res.status(403).json({ error: '只有活动参与者才能回退版本' });
    }

    let guide = db.prepare('SELECT * FROM route_guides WHERE plan_id = ?').get(planId);
    if (!guide) {
      return res.status(404).json({ error: '攻略不存在' });
    }

    const version = db.prepare('SELECT * FROM guide_versions WHERE id = ? AND guide_id = ?').get(version_id, guide.id);
    if (!version) {
      return res.status(404).json({ error: '版本不存在' });
    }

    let snapshot = {};
    try { snapshot = version.snapshot ? JSON.parse(version.snapshot) : {}; } catch(e) {}

    db.transaction(() => {
      db.prepare('UPDATE route_guides SET title = ?, description = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        snapshot.title || guide.title,
        snapshot.description || guide.description,
        user_id,
        guide.id
      );

      db.prepare('DELETE FROM checkin_points WHERE guide_id = ?').run(guide.id);

      if (snapshot.checkin_points && snapshot.checkin_points.length > 0) {
        const insertStmt = db.prepare(`
          INSERT INTO checkin_points (guide_id, name, description, location, order_index, collective_review, travel_tips, photos)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        snapshot.checkin_points.forEach((p, idx) => {
          insertStmt.run(
            guide.id,
            p.name || '',
            p.description || '',
            p.location || '',
            p.order_index !== undefined ? p.order_index : idx,
            p.collective_review || '',
            p.travel_tips || '',
            p.photos ? JSON.stringify(p.photos) : ''
          );
        });
      }
    });

    guide = db.prepare('SELECT * FROM route_guides WHERE id = ?').get(guide.id);
    const checkinPoints = db.prepare(`
      SELECT * FROM checkin_points 
      WHERE guide_id = ? 
      ORDER BY order_index ASC, id ASC
    `).all(guide.id).map(p => {
      let photos = [];
      try { photos = p.photos ? JSON.parse(p.photos) : []; } catch(e) {}
      return { ...p, photos };
    });
    guide.checkin_points = checkinPoints;

    res.json({ success: true, guide });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/guides/:guideId/points', (req, res) => {
  try {
    const guideId = req.params.guideId;
    const { user_id, name, description, location, collective_review, travel_tips, photos } = req.body;

    if (!user_id || !name) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const guide = db.prepare('SELECT * FROM route_guides WHERE id = ?').get(guideId);
    if (!guide) {
      return res.status(404).json({ error: '攻略不存在' });
    }

    if (!isPlanParticipant(guide.plan_id, user_id)) {
      return res.status(403).json({ error: '只有活动参与者才能编辑攻略' });
    }

    const maxOrder = db.prepare('SELECT MAX(order_index) as max_order FROM checkin_points WHERE guide_id = ?').get(guideId);
    const nextOrder = (maxOrder && maxOrder.max_order != null) ? maxOrder.max_order + 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO checkin_points (guide_id, name, description, location, order_index, collective_review, travel_tips, photos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      guideId,
      name,
      description || '',
      location || '',
      nextOrder,
      collective_review || '',
      travel_tips || '',
      photos ? JSON.stringify(photos) : ''
    );

    const point = db.prepare('SELECT * FROM checkin_points WHERE id = ?').get(result.lastInsertRowid);
    if (point) {
      let pointPhotos = [];
      try { pointPhotos = point.photos ? JSON.parse(point.photos) : []; } catch(e) {}
      point.photos = pointPhotos;
    }

    db.prepare('UPDATE route_guides SET updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user_id, guideId);

    res.json({ success: true, point });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/guides/points/:pointId', (req, res) => {
  try {
    const pointId = req.params.pointId;
    const { user_id, name, description, location, collective_review, travel_tips, photos } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const point = db.prepare('SELECT * FROM checkin_points WHERE id = ?').get(pointId);
    if (!point) {
      return res.status(404).json({ error: '打卡点不存在' });
    }

    const guide = db.prepare('SELECT * FROM route_guides WHERE id = ?').get(point.guide_id);
    if (!guide) {
      return res.status(404).json({ error: '攻略不存在' });
    }

    if (!isPlanParticipant(guide.plan_id, user_id)) {
      return res.status(403).json({ error: '只有活动参与者才能编辑攻略' });
    }

    db.prepare(`
      UPDATE checkin_points 
      SET name = ?, description = ?, location = ?, collective_review = ?, travel_tips = ?, photos = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name : point.name,
      description !== undefined ? description : point.description,
      location !== undefined ? location : point.location,
      collective_review !== undefined ? collective_review : point.collective_review,
      travel_tips !== undefined ? travel_tips : point.travel_tips,
      photos !== undefined ? JSON.stringify(photos) : point.photos,
      pointId
    );

    const updatedPoint = db.prepare('SELECT * FROM checkin_points WHERE id = ?').get(pointId);
    if (updatedPoint) {
      let pointPhotos = [];
      try { pointPhotos = updatedPoint.photos ? JSON.parse(updatedPoint.photos) : []; } catch(e) {}
      updatedPoint.photos = pointPhotos;
    }

    db.prepare('UPDATE route_guides SET updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user_id, guide.id);

    res.json({ success: true, point: updatedPoint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/guides/points/:pointId', (req, res) => {
  try {
    const pointId = req.params.pointId;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const point = db.prepare('SELECT * FROM checkin_points WHERE id = ?').get(pointId);
    if (!point) {
      return res.status(404).json({ error: '打卡点不存在' });
    }

    const guide = db.prepare('SELECT * FROM route_guides WHERE id = ?').get(point.guide_id);
    if (!guide) {
      return res.status(404).json({ error: '攻略不存在' });
    }

    if (!isPlanParticipant(guide.plan_id, user_id)) {
      return res.status(403).json({ error: '只有活动参与者才能编辑攻略' });
    }

    db.prepare('DELETE FROM checkin_points WHERE id = ?').run(pointId);
    db.prepare('UPDATE route_guides SET updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user_id, guide.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/guides/:guideId/reorder', (req, res) => {
  try {
    const guideId = req.params.guideId;
    const { user_id, point_ids } = req.body;

    if (!user_id || !point_ids || !Array.isArray(point_ids)) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const guide = db.prepare('SELECT * FROM route_guides WHERE id = ?').get(guideId);
    if (!guide) {
      return res.status(404).json({ error: '攻略不存在' });
    }

    if (!isPlanParticipant(guide.plan_id, user_id)) {
      return res.status(403).json({ error: '只有活动参与者才能编辑攻略' });
    }

    db.transaction(() => {
      const updateStmt = db.prepare('UPDATE checkin_points SET order_index = ? WHERE id = ?');
      point_ids.forEach((id, index) => {
        updateStmt.run(index, id);
      });
    });

    db.prepare('UPDATE route_guides SET updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user_id, guideId);

    const checkinPoints = db.prepare(`
      SELECT * FROM checkin_points 
      WHERE guide_id = ? 
      ORDER BY order_index ASC, id ASC
    `).all(guideId).map(p => {
      let photos = [];
      try { photos = p.photos ? JSON.parse(p.photos) : []; } catch(e) {}
      return { ...p, photos };
    });

    res.json({ success: true, points: checkinPoints });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/:id/share', (req, res) => {
  try {
    const planId = req.params.id;
    const { user_id, title, description, summary, photo_ids, selected_photos } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    if (!isPlanParticipant(planId, user_id)) {
      return res.status(403).json({ error: '只有活动参与者才能生成分享页面' });
    }

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: '计划不存在' });
    }

    let guide = db.prepare('SELECT * FROM route_guides WHERE plan_id = ?').get(planId);
    if (!guide) {
      return res.status(400).json({ error: '请先创建路线攻略' });
    }

    const shareToken = generateToken();
    const photos = photo_ids || selected_photos || [];
    const desc = summary || description || '';

    const stmt = db.prepare(`
      INSERT INTO share_pages (guide_id, plan_id, share_token, title, summary, selected_photos, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      guide.id,
      planId,
      shareToken,
      title || plan.title + ' - 路线攻略',
      desc,
      photos.length > 0 ? JSON.stringify(photos) : '',
      user_id
    );

    const sharePage = db.prepare('SELECT * FROM share_pages WHERE id = ?').get(result.lastInsertRowid);
    if (sharePage) {
      let photosList = [];
      try { photosList = sharePage.selected_photos ? JSON.parse(sharePage.selected_photos) : []; } catch(e) {}
      sharePage.selected_photos = photosList;
      sharePage.share_url = `/share/${shareToken}`;
      sharePage.share_token = shareToken;
    }

    res.json({ success: true, share: sharePage, share_page: sharePage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/share/:token', (req, res) => {
  try {
    const token = req.params.token;

    const sharePage = db.prepare('SELECT * FROM share_pages WHERE share_token = ?').get(token);
    if (!sharePage) {
      return res.status(404).json({ error: '分享页面不存在' });
    }

    let selectedPhotos = [];
    try { selectedPhotos = sharePage.selected_photos ? JSON.parse(sharePage.selected_photos) : []; } catch(e) {}
    sharePage.selected_photos = selectedPhotos;

    const plan = db.prepare(`
      SELECT p.*, u.username as creator_name, u.avatar as creator_avatar
      FROM citywalk_plans p
      LEFT JOIN users u ON p.creator_id = u.id
      WHERE p.id = ?
    `).get(sharePage.plan_id);

    if (plan) {
      plan.creator = {
        id: plan.creator_id,
        username: plan.creator_name || plan.u_username,
        avatar: plan.creator_avatar || plan.u_avatar
      };
      delete plan.creator_name;
      delete plan.creator_avatar;
    }

    const participants = db.prepare(`
      SELECT u.id, u.username, u.avatar, pp.role
      FROM plan_participants pp
      LEFT JOIN users u ON pp.user_id = u.id
      WHERE pp.plan_id = ?
    `).all(sharePage.plan_id);

    const guide = db.prepare('SELECT * FROM route_guides WHERE id = ?').get(sharePage.guide_id);
    let checkinPoints = [];
    if (guide) {
      checkinPoints = db.prepare(`
        SELECT * FROM checkin_points 
        WHERE guide_id = ? 
        ORDER BY order_index ASC, id ASC
      `).all(guide.id).map(p => {
        let photos = [];
        try { photos = p.photos ? JSON.parse(p.photos) : []; } catch(e) {}
        return { ...p, photos };
      });
    }

    const photos = db.prepare(`
      SELECT ph.*, u.username as author_name, u.avatar as author_avatar
      FROM activity_photos ph
      LEFT JOIN users u ON ph.user_id = u.id
      WHERE ph.plan_id = ?
      ORDER BY ph.created_at DESC
      LIMIT 30
    `).all(sharePage.plan_id).map(ph => ({
      ...ph,
      author_name: ph.author_name || ph.u_username,
      author_avatar: ph.author_avatar || ph.u_avatar
    }));

    res.json({
      success: true,
      share_page: sharePage,
      plan,
      participants,
      guide: guide ? { ...guide, checkin_points: checkinPoints } : null,
      photos
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/share', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'share.html'));
});

const https = require('https');

const weatherDescZh = {
  'Sunny': '晴', 'Clear': '晴', 'Partly cloudy': '多云', 'Partly Cloudy': '多云',
  'Cloudy': '阴', 'Overcast': '阴', 'Mist': '薄雾', 'Fog': '雾',
  'Light rain': '小雨', 'Light rain shower': '阵雨', 'Patchy rain nearby': '零星小雨',
  'Moderate rain': '中雨', 'Moderate rain at times': '间歇中雨',
  'Heavy rain': '大雨', 'Heavy rain at times': '间歇大雨',
  'Light drizzle': '毛毛雨', 'Patchy light drizzle': '零星毛毛雨',
  'Torrential rain shower': '暴雨', 'Moderate or heavy rain shower': '中到大阵雨',
  'Light rain shower': '小阵雨', 'Patchy light rain': '零星小雨',
  'Patchy light rain with thunder': '雷阵雨', 'Moderate or heavy rain with thunder': '雷暴雨',
  'Thundery outbreaks in nearby': '局部雷暴',
  'Light snow': '小雪', 'Patchy light snow': '零星小雪',
  'Moderate snow': '中雪', 'Heavy snow': '大雪',
  'Patchy moderate snow': '零星中雪', 'Patchy heavy snow': '零星大雪',
  'Light snow showers': '小阵雪', 'Moderate or heavy snow showers': '中到大阵雪',
  'Blizzard': '暴风雪', 'Patchy sleet nearby': '零星雨夹雪',
  'Light sleet': '小雨夹雪', 'Moderate or heavy sleet': '中到大雨夹雪',
  'Light freezing rain': '小雨凇', 'Moderate or heavy freezing rain': '中到大雨凇',
  'Ice pellets': '冰粒', 'Light showers of ice pellets': '小冰粒阵雨',
  'Blowing snow': '风吹雪', 'Blizzard': '暴风雪'
};

function translateWeatherDesc(desc) {
  if (!desc) return '';
  return weatherDescZh[desc.trim()] || desc.trim();
}

app.get('/api/weather', (req, res) => {
  const { city, date } = req.query;
  if (!city) {
    return res.status(400).json({ error: '缺少城市参数' });
  }

  const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`;
  https.get(url, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        const current = json.current_condition?.[0];
        const todayForecast = json.weather?.[0];
        const result = {
          city,
          current: current ? {
            temp: current.temp_C,
            feelsLike: current.FeelsLikeC,
            humidity: current.humidity,
            desc: translateWeatherDesc(current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || ''),
            icon: current.weatherCode
          } : null,
          forecast: (json.weather || []).map((day, idx) => ({
            date: day.date,
            maxTemp: day.maxtempC,
            minTemp: day.mintempC,
            avgTemp: day.avgtempC,
            desc: translateWeatherDesc(day.hourly?.[4]?.lang_zh?.[0]?.value || day.hourly?.[4]?.weatherDesc?.[0]?.value || ''),
            icon: day.hourly?.[4]?.weatherCode || '',
            chanceOfRain: Math.max(...(day.hourly || []).map(h => parseInt(h.chanceofrain || '0')))
          }))
        };
        res.json({ success: true, weather: result });
      } catch (e) {
        res.json({ success: false, error: '天气数据解析失败' });
      }
    });
  }).on('error', () => {
    res.json({ success: false, error: '天气服务暂不可用' });
  });
});

app.post('/api/plans/:id/checkin', (req, res) => {
  try {
    const planId = req.params.id;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: '计划不存在' });
    }

    const participant = db.prepare('SELECT * FROM plan_participants WHERE plan_id = ? AND user_id = ?').get(planId, user_id);
    if (!participant) {
      return res.status(403).json({ error: '只有已加入的参与者才能签到' });
    }

    const existingCheckin = db.prepare('SELECT * FROM plan_checkins WHERE plan_id = ? AND user_id = ?').get(planId, user_id);
    if (existingCheckin) {
      return res.status(400).json({ error: '您已经签到过了' });
    }

    const now = new Date();
    const startTime = new Date(plan.start_time);
    const diffMinutes = (now - startTime) / (1000 * 60);

    if (diffMinutes < -30) {
      return res.status(400).json({ error: '签到尚未开始，请在活动开始前30分钟内签到' });
    }
    if (diffMinutes > 30) {
      return res.status(400).json({ error: '签到已结束，只能在活动开始后30分钟内签到' });
    }

    const stmt = db.prepare(`
      INSERT INTO plan_checkins (plan_id, user_id, checkin_time)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(planId, user_id);

    const checkin = db.prepare(`
      SELECT ck.*, u.username, u.avatar
      FROM plan_checkins ck
      LEFT JOIN users u ON ck.user_id = u.id
      WHERE ck.id = ?
    `).get(result.lastInsertRowid);

    createFeed(user_id, 'checkin', planId, 'plan', {
      title: plan.title,
      city: plan.city,
      theme: plan.theme
    });

    res.json({ 
      success: true, 
      checkin: {
        id: checkin.id,
        plan_id: checkin.plan_id,
        user_id: checkin.user_id,
        checkin_time: checkin.checkin_time,
        user: {
          id: checkin.user_id,
          username: checkin.username || checkin.u_username,
          avatar: checkin.avatar || checkin.u_avatar
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/plans/:id/checkins', (req, res) => {
  try {
    const planId = req.params.id;

    const plan = db.prepare('SELECT * FROM citywalk_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: '计划不存在' });
    }

    const checkins = db.prepare(`
      SELECT ck.*, u.username, u.avatar
      FROM plan_checkins ck
      LEFT JOIN users u ON ck.user_id = u.id
      WHERE ck.plan_id = ?
      ORDER BY ck.checkin_time ASC
    `).all(planId).map(c => ({
      id: c.id,
      plan_id: c.plan_id,
      user_id: c.user_id,
      checkin_time: c.checkin_time,
      user: {
        id: c.user_id,
        username: c.username || c.u_username,
        avatar: c.avatar || c.u_avatar
      }
    }));

    const checkedInUserIds = new Set(checkins.map(c => c.user_id));

    const allParticipants = db.prepare(`
      SELECT pp.user_id, pp.role, pp.joined_at, u.username, u.avatar
      FROM plan_participants pp
      LEFT JOIN users u ON pp.user_id = u.id
      WHERE pp.plan_id = ?
    `).all(planId);

    const checkedIn = allParticipants
      .filter(p => checkedInUserIds.has(p.user_id))
      .map(p => ({
        id: p.user_id,
        username: p.username || p.u_username,
        avatar: p.avatar || p.u_avatar,
        role: p.role,
        joined_at: p.joined_at,
        checkin_time: checkins.find(c => c.user_id === p.user_id)?.checkin_time
      }));

    const notCheckedIn = allParticipants
      .filter(p => !checkedInUserIds.has(p.user_id))
      .map(p => ({
        id: p.user_id,
        username: p.username || p.u_username,
        avatar: p.avatar || p.u_avatar,
        role: p.role,
        joined_at: p.joined_at
      }));

    const now = new Date();
    const startTime = new Date(plan.start_time);
    const diffMinutes = (now - startTime) / (1000 * 60);
    const canCheckin = diffMinutes >= -30 && diffMinutes <= 30;

    res.json({
      success: true,
      checkins,
      checked_in: checkedIn,
      not_checked_in: notCheckedIn,
      can_checkin: canCheckin,
      stats: {
        total: allParticipants.length,
        checked_in_count: checkedIn.length,
        not_checked_in_count: notCheckedIn.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id/checkin-stats', (req, res) => {
  try {
    const userId = req.params.id;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const checkins = db.prepare(`
      SELECT ck.*, p.start_time, p.title, p.city
      FROM plan_checkins ck
      LEFT JOIN citywalk_plans p ON ck.plan_id = p.id
      WHERE ck.user_id = ?
      ORDER BY ck.checkin_time DESC
    `).all(userId);

    const totalCheckins = checkins.length;

    let consecutiveDays = 0;
    if (totalCheckins > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const checkinDates = new Set();
      checkins.forEach(c => {
        const date = new Date(c.checkin_time);
        date.setHours(0, 0, 0, 0);
        checkinDates.add(date.getTime());
      });

      let currentDate = new Date(today);
      while (checkinDates.has(currentDate.getTime())) {
        consecutiveDays++;
        currentDate.setDate(currentDate.getDate() - 1);
      }

      if (consecutiveDays === 0) {
        currentDate = new Date(today);
        currentDate.setDate(currentDate.getDate() - 1);
        while (checkinDates.has(currentDate.getTime())) {
          consecutiveDays++;
          currentDate.setDate(currentDate.getDate() - 1);
        }
      }
    }

    const recentCheckins = checkins.slice(0, 10).map(c => ({
      id: c.id,
      plan_id: c.plan_id,
      checkin_time: c.checkin_time,
      plan_title: c.title,
      plan_city: c.city,
      plan_start_time: c.start_time
    }));

    res.json({
      success: true,
      stats: {
        total_checkins: totalCheckins,
        consecutive_days: consecutiveDays
      },
      recent_checkins: recentCheckins
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Citywalk Server running on http://localhost:${PORT}`);
  console.log(`📁 Static files served from: ${path.join(__dirname, '..', 'public')}`);
});
