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
    plan.notes = notes;

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

    const tx = db.transaction(() => {
      db.prepare('INSERT INTO plan_participants (plan_id, user_id, role) VALUES (?, ?, ?)')
        .run(planId, user_id, 'member');
      db.prepare('UPDATE citywalk_plans SET current_participants = current_participants + 1 WHERE id = ?')
        .run(planId);
    });
    tx();

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

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM plan_participants WHERE plan_id = ? AND user_id = ?').run(planId, user_id);
      db.prepare('UPDATE citywalk_plans SET current_participants = current_participants - 1 WHERE id = ?')
        .run(planId);
    });
    tx();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/:id/complete', (req, res) => {
  try {
    db.prepare("UPDATE citywalk_plans SET status = 'completed' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
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

    sql += ' GROUP BY p.id ORDER BY (popularity + total_likes + notes_count * 2) DESC LIMIT ?';
    params.push(parseInt(limit));

    const routes = db.prepare(sql).all(...params);
    routes.forEach(r => {
      r.creator = { id: r.creator_id, username: r.creator_name || r.u_username, avatar: r.creator_avatar || r.u_avatar };
      delete r.creator_name;
      delete r.creator_avatar;
    });

    res.json({ success: true, routes });
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
      p.creator = { id: p.creator_id, username: p.creator_name || p.u_username, avatar: p.creator_avatar || p.u_avatar };
      const participants = db.prepare(`
        SELECT u.id, u.username, u.avatar, pp.role 
        FROM plan_participants pp 
        LEFT JOIN users u ON pp.user_id = u.id 
        WHERE pp.plan_id = ?
      `).all(p.id).map(x => ({
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
