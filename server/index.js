const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.get('/api/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
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
      meeting_point, route_points
    } = req.body;

    if (!creator_id || !title || !theme || !city || !start_time) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const stmt = db.prepare(`
      INSERT INTO citywalk_plans 
      (creator_id, title, theme, city, description, start_time, 
       duration_hours, max_participants, meeting_point, route_points)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      creator_id, title, theme, city, description || '',
      start_time, duration_hours || 3, max_participants || 6,
      meeting_point || '', route_points || ''
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
    const { city, theme, status, keyword, page = 1, limit = 20 } = req.query;
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
    if (keyword) {
      sql += ' AND (p.title LIKE ? OR p.description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const plans = db.prepare(sql).all(...params);

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
      plan.participants = participants;
      delete plan.creator_name;
      delete plan.creator_avatar;
    });

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
    const { user_id, city, theme } = req.query;
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
    if (user_id) {
      sql += ' AND p.creator_id != ? AND p.id NOT IN (SELECT plan_id FROM plan_participants WHERE user_id = ?)';
      params.push(user_id, user_id);
    }

    sql += ' ORDER BY spots_left DESC, p.created_at DESC LIMIT 10';

    const suggestions = db.prepare(sql).all(...params);
    suggestions.forEach(s => {
      s.creator = { id: s.creator_id, username: s.creator_name || s.u_username, avatar: s.creator_avatar || s.u_avatar };
      delete s.creator_name;
      delete s.creator_avatar;
    });

    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/routes/popular', (req, res) => {
  try {
    const { city, theme, limit = 10 } = req.query;
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

    sql += ' GROUP BY p.id';

    const routes = db.prepare(sql).all(...params);

    for (const r of routes) {
      const ratings = db.prepare('SELECT overall FROM plan_ratings WHERE plan_id = ?').all(r.id);
      const ratingCount = ratings.length;
      const avgRating = ratingCount > 0 ? ratings.reduce((sum, x) => sum + Number(x.overall || 0), 0) / ratingCount : 0;

      r.rating_count = ratingCount;
      r.avg_rating = parseFloat(avgRating.toFixed(2));

      const score = r.popularity * 2 + (r.total_likes || 0) + (r.notes_count || 0) * 3 + avgRating * 10 * ratingCount;
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

app.listen(PORT, () => {
  console.log(`🚀 Citywalk Server running on http://localhost:${PORT}`);
  console.log(`📁 Static files served from: ${path.join(__dirname, '..', 'public')}`);
});
