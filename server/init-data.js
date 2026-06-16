const db = require('./db');

const themes = {
  old_building: '老洋房',
  market: '菜市场巡礼',
  bridge: '天桥秘境',
  alley: '弄堂探索',
  coffee: '咖啡馆漫游',
  street_art: '街头艺术',
  river: '滨江步道',
  park: '公园秘境',
  night: '夜色漫步',
  food: '小吃寻味'
};

function seedData() {
  console.log('🌱 开始初始化数据...');

  const userResult = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const userCount = userResult ? Object.values(userResult)[0] : 0;
  if (userCount > 0) {
    console.log('⚠️  数据库已有数据，跳过初始化');
    return;
  }

  const users = [
    { username: '漫步达人', avatar: '🧑‍🎨', bio: '热爱探索城市的每一个角落', city: '上海' },
    { username: '老上海', avatar: '👴', bio: '土生土长上海人，带你看真正的弄堂', city: '上海' },
    { username: '咖啡控', avatar: '☕', bio: '为了一杯好咖啡可以走五条街', city: '上海' },
    { username: '吃货小明', avatar: '🍜', bio: '用脚步丈量城市，用味蕾记录生活', city: '上海' },
    { username: '摄影师阿杰', avatar: '📷', bio: '用镜头捕捉城市的光影', city: '北京' },
    { username: '胡同串子', avatar: '🏮', bio: '北京胡同活地图', city: '北京' },
    { username: '文艺青年', avatar: '🎭', bio: '在城市中寻找诗意', city: '成都' },
    { username: '川菜爱好者', avatar: '🌶️', bio: '走一路吃一路', city: '成都' },
    { username: '西子湖畔', avatar: '🌸', bio: '杭州土著，最爱西湖边散步', city: '杭州' },
    { username: '城墙根儿', avatar: '🏯', bio: '西安的历史就是我的故事', city: '西安' }
  ];

  const insertUser = db.prepare('INSERT INTO users (username, avatar, bio, city) VALUES (?, ?, ?, ?)');
  const userIds = [];
  users.forEach(u => {
    const result = insertUser.run(u.username, u.avatar, u.bio, u.city);
    userIds.push(result.lastInsertRowid);
  });
  console.log(`✅ 已创建 ${users.length} 个用户`);

  const now = new Date();
  const plans = [
    {
      creator_id: userIds[0], title: '法租界老洋房深度游', theme: 'old_building', city: '上海',
      description: '漫步武康路、衡山路，探访百年老洋房的前世今生，感受民国风情。',
      start_time: new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 4, max_participants: 8, meeting_point: '武康大楼门口', status: 'recruiting'
    },
    {
      creator_id: userIds[1], title: '静安寺菜市场寻宝之旅', theme: 'market', city: '上海',
      description: '深入地道的上海菜市场，认识本地食材，顺便尝尝路边的老字号小吃。',
      start_time: new Date(now.getTime() + 1 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 3, max_participants: 6, meeting_point: '静安寺地铁站2号口', status: 'recruiting'
    },
    {
      creator_id: userIds[2], title: '苏州河上的天桥秘境', theme: 'bridge', city: '上海',
      description: '横跨苏州河的各式桥梁，每一座都有自己的故事，黄昏时分最美。',
      start_time: new Date(now.getTime() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 3, max_participants: 5, meeting_point: '外滩源', status: 'recruiting'
    },
    {
      creator_id: userIds[3], title: '田子坊弄堂美食巡礼', theme: 'alley', city: '上海',
      description: '穿梭田子坊的石库门弄堂，发掘藏在深巷里的美食小店和手作工作室。',
      start_time: new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 3.5, max_participants: 6, meeting_point: '打浦桥地铁站1号口', status: 'recruiting'
    },
    {
      creator_id: userIds[0], title: '永康路咖啡一条街漫游', theme: 'coffee', city: '上海',
      description: '精选5家各具特色的独立咖啡馆，从永康路到嘉善路，品味城市的咖啡文化。',
      start_time: new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 4, max_participants: 4, meeting_point: '陕西南路地铁站', status: 'completed'
    },
    {
      creator_id: userIds[4], title: '798艺术区街头艺术探索', theme: 'street_art', city: '北京',
      description: '在798艺术区寻找最酷的涂鸦和装置艺术，感受当代艺术的脉搏。',
      start_time: new Date(now.getTime() + 4 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 5, max_participants: 8, meeting_point: '798艺术区正门', status: 'recruiting'
    },
    {
      creator_id: userIds[5], title: '南锣鼓巷胡同深度游', theme: 'alley', city: '北京',
      description: '避开主街的人流，钻进南锣鼓巷旁边的支胡同，看真正的老北京生活。',
      start_time: new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 4, max_participants: 6, meeting_point: '南锣鼓巷地铁站', status: 'completed'
    },
    {
      creator_id: userIds[6], title: '宽窄巷子文艺漫步', theme: 'old_building', city: '成都',
      description: '从宽巷子到窄巷子，再到井巷子，体验老成都的慢生活节奏。',
      start_time: new Date(now.getTime() + 6 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 3, max_participants: 10, meeting_point: '宽窄巷子东广场', status: 'recruiting'
    },
    {
      creator_id: userIds[7], title: '建设路小吃一条街扫荡', theme: 'food', city: '成都',
      description: '传说中的建设路小吃街，从头吃到尾，挑战你的味蕾极限！',
      start_time: new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 3, max_participants: 6, meeting_point: '建设路电子科大门口', status: 'completed'
    },
    {
      creator_id: userIds[8], title: '西湖断桥至苏堤春晓', theme: 'park', city: '杭州',
      description: '经典西湖步行路线，断桥残雪→白堤→苏堤，感受诗意江南。',
      start_time: new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 5, max_participants: 12, meeting_point: '断桥入口', status: 'recruiting'
    },
    {
      creator_id: userIds[9], title: '西安城墙夜跑徒步', theme: 'night', city: '西安',
      description: '夜幕下的西安城墙，灯火阑珊，徒步一圈感受十三朝古都的魅力。',
      start_time: new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 4, max_participants: 8, meeting_point: '南门（永宁门）登城口', status: 'recruiting'
    },
    {
      creator_id: userIds[1], title: '城隍庙夜市美食探索', theme: 'night', city: '上海',
      description: '华灯初上的城隍庙，九曲桥畔的灯火，还有藏在角落的地道上海小吃。',
      start_time: new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 16),
      duration_hours: 3, max_participants: 6, meeting_point: '豫园地铁站', status: 'completed'
    }
  ];

  const insertPlan = db.prepare(`
    INSERT INTO citywalk_plans 
    (creator_id, title, theme, city, description, start_time, duration_hours, 
     max_participants, current_participants, meeting_point, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO plan_participants (plan_id, user_id, role) VALUES (?, ?, ?)
  `);

  const planIds = [];
  plans.forEach((p, idx) => {
    const result = insertPlan.run(
      p.creator_id, p.title, p.theme, p.city, p.description, p.start_time,
      p.duration_hours, p.max_participants, 1, p.meeting_point, p.status
    );
    const planId = result.lastInsertRowid;
    p.id = planId;
    planIds.push(planId);
    insertParticipant.run(planId, p.creator_id, 'creator');

    if (p.status === 'recruiting') {
      const extraCount = Math.min(Math.floor(Math.random() * (p.max_participants - 1)), 3);
      const shuffled = userIds.filter(id => id !== p.creator_id).sort(() => 0.5 - Math.random());
      for (let i = 0; i < extraCount; i++) {
        try {
          insertParticipant.run(planId, shuffled[i], 'member');
          db.prepare('UPDATE citywalk_plans SET current_participants = current_participants + 1 WHERE id = ?').run(planId);
        } catch(e) {}
      }
    } else if (p.status === 'completed') {
      const extraCount = Math.min(Math.floor(Math.random() * (p.max_participants - 1)) + 2, p.max_participants - 1);
      const shuffled = userIds.filter(id => id !== p.creator_id).sort(() => 0.5 - Math.random());
      for (let i = 0; i < extraCount; i++) {
        try {
          insertParticipant.run(planId, shuffled[i], 'member');
          db.prepare('UPDATE citywalk_plans SET current_participants = current_participants + 1 WHERE id = ?').run(planId);
        } catch(e) {}
      }
    }
  });
  console.log(`✅ 已创建 ${plans.length} 个Citywalk计划`);

  const notes = [
    {
      plan_id: planIds[4], author_id: userIds[0], title: '第一站：Hidden Cafe',
      content: '藏在老式里弄里的咖啡馆，推开门是另一个世界。手冲耶加雪菲花香明显，老板很健谈。',
      location: '永康路某弄堂内', likes: 15
    },
    {
      plan_id: planIds[4], author_id: userIds[2], title: '绝美落地窗cafe',
      content: '嘉善路上的这家店有一整面落地玻璃窗，梧桐树叶在阳光照射下光影婆娑，拍照绝美！',
      location: '嘉善路', likes: 23
    },
    {
      plan_id: planIds[4], author_id: userIds[3], title: '附赠的小店',
      content: '咖啡馆旁边的手作面包店一定要试试，可颂层次分明，配咖啡正好。',
      location: '永康路', likes: 8
    },
    {
      plan_id: planIds[6], author_id: userIds[5], title: '菊儿胡同偶遇',
      content: '钻进菊儿胡同居然看到了作家茅盾的故居，门口的石狮子已经几百年了。',
      location: '菊儿胡同', likes: 31
    },
    {
      plan_id: planIds[6], author_id: userIds[4], title: '胡同里的光影',
      content: '下午3点的阳光斜斜地洒在灰墙上，拍出来的照片自带复古滤镜。',
      location: '帽儿胡同', likes: 42
    },
    {
      plan_id: planIds[8], author_id: userIds[7], title: '傅强排骨太绝了',
      content: '外酥里嫩，排骨入味，排队20分钟绝对值得！一定要加辣椒粉。',
      location: '建设巷', likes: 56
    },
    {
      plan_id: planIds[8], author_id: userIds[6], title: '老麻抄手',
      content: '麻味正宗，皮薄馅大，吃完嘴唇都是麻的，太上头了！',
      location: '建设巷', likes: 38
    },
    {
      plan_id: planIds[8], author_id: userIds[7], title: '徐亮烤蹄',
      content: '软糯Q弹，胶原蛋白满满的，一只根本不够吃！',
      location: '建设巷', likes: 47
    },
    {
      plan_id: planIds[11], author_id: userIds[3], title: '九曲桥夜景',
      content: '夜晚的九曲桥真的太美了，灯光映在湖面上，仿佛穿越回古代。',
      location: '豫园九曲桥', likes: 28
    },
    {
      plan_id: planIds[11], author_id: userIds[1], title: '南翔小笼包',
      content: '虽然要排队，但正宗的南翔小笼包皮薄汤多，味道还是那个味。',
      location: '南翔馒头店', likes: 19
    }
  ];

  const insertNote = db.prepare(`
    INSERT INTO route_notes (plan_id, author_id, title, content, location, likes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  notes.forEach(n => {
    insertNote.run(n.plan_id, n.author_id, n.title, n.content, n.location, n.likes);
  });
  console.log(`✅ 已创建 ${notes.length} 条路线笔记`);

  const favorites = [
    { user_id: userIds[0], plan_id: planIds[6] },
    { user_id: userIds[0], plan_id: planIds[8] },
    { user_id: userIds[2], plan_id: planIds[4] },
    { user_id: userIds[2], plan_id: planIds[6] },
    { user_id: userIds[3], plan_id: planIds[8] },
    { user_id: userIds[3], plan_id: planIds[11] },
    { user_id: userIds[4], plan_id: planIds[4] },
    { user_id: userIds[5], plan_id: planIds[8] },
    { user_id: userIds[7], plan_id: planIds[6] },
    { user_id: userIds[8], plan_id: planIds[4] },
    { user_id: userIds[9], plan_id: planIds[11] }
  ];

  const insertFav = db.prepare('INSERT INTO favorite_routes (user_id, plan_id) VALUES (?, ?)');
  favorites.forEach(f => insertFav.run(f.user_id, f.plan_id));
  console.log(`✅ 已创建 ${favorites.length} 条收藏记录`);

  const noteIds = db.prepare('SELECT id, author_id, plan_id FROM route_notes').all();
  
  const comments = [];
  for (let i = 0; i < noteIds.length; i++) {
    const note = noteIds[i];
    const commenterIds = userIds.filter(id => id !== note.author_id);
    const shuffled = commenterIds.sort(() => 0.5 - Math.random());
    
    const commentCount = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < commentCount; j++) {
      const commenterId = shuffled[j % shuffled.length];
      const commentContents = [
        '这个地方真的很有特色，下次一定要去看看！',
        '写得太棒了，仿佛身临其境～',
        '请问这家店的具体位置在哪里呀？',
        '上次去没找到，原来藏在这里！',
        '楼主拍照技术也太好了吧',
        '这个角度很有感觉，收藏了！',
        '周末就去打卡，感谢分享～'
      ];
      
      comments.push({
        note_id: note.id,
        author_id: commenterId,
        content: commentContents[Math.floor(Math.random() * commentContents.length)],
        parent_id: null,
        root_id: null,
        reply_to_user_id: null
      });
    }
  }

  const insertComment = db.prepare(`
    INSERT INTO note_comments (note_id, author_id, content, parent_id, root_id, reply_to_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  comments.forEach(c => {
    const result = insertComment.run(
      c.note_id, c.author_id, c.content, c.parent_id, c.root_id, c.reply_to_user_id
    );
    const commentId = result.lastInsertRowid;
    db.prepare('UPDATE note_comments SET root_id = ? WHERE id = ?').run(commentId, commentId);
  });

  const allComments = db.prepare('SELECT * FROM note_comments').all();
  for (let i = 0; i < 3; i++) {
    const parentComment = allComments[Math.floor(Math.random() * allComments.length)];
    const replyContents = [
      '同意！我也这么觉得',
      '同问同问，有人知道吗？',
      '哈哈哈哈上次我也遇到了',
      '这个回复太精辟了'
    ];
    const replierId = userIds.filter(id => id !== parentComment.author_id)[Math.floor(Math.random() * (userIds.length - 1))];
    
    const stmt = db.prepare(`
      INSERT INTO note_comments (note_id, author_id, content, parent_id, root_id, reply_to_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      parentComment.note_id, replierId,
      replyContents[Math.floor(Math.random() * replyContents.length)],
      parentComment.id, parentComment.root_id, parentComment.author_id
    );
  }

  console.log(`✅ 已创建 ${comments.length + 3} 条评论`);

  const notifications = [];
  for (let i = 0; i < noteIds.length; i++) {
    const note = noteIds[i];
    const noteComments = db.prepare('SELECT * FROM note_comments WHERE note_id = ?').all(note.id);
    noteComments.forEach(c => {
      if (c.author_id !== note.author_id) {
        notifications.push({
          user_id: note.author_id,
          type: 'note_comment',
          content: c.content,
          related_id: note.id,
          related_type: 'note',
          from_user_id: c.author_id,
          is_read: Math.random() > 0.5 ? 1 : 0
        });
      }
      if (c.reply_to_user_id && c.reply_to_user_id !== note.author_id) {
        notifications.push({
          user_id: c.reply_to_user_id,
          type: 'comment_reply',
          content: c.content,
          related_id: c.id,
          related_type: 'comment',
          from_user_id: c.author_id,
          is_read: Math.random() > 0.5 ? 1 : 0
        });
      }
    });
  }

  const insertNotif = db.prepare(`
    INSERT INTO user_notifications (user_id, type, content, related_id, related_type, from_user_id, is_read)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  notifications.forEach(n => {
    insertNotif.run(n.user_id, n.type, n.content, n.related_id, n.related_type, n.from_user_id, n.is_read);
  });
  console.log(`✅ 已创建 ${notifications.length} 条通知`);

  const follows = [
    { follower_id: userIds[0], following_id: userIds[1] },
    { follower_id: userIds[0], following_id: userIds[2] },
    { follower_id: userIds[0], following_id: userIds[5] },
    { follower_id: userIds[1], following_id: userIds[0] },
    { follower_id: userIds[1], following_id: userIds[3] },
    { follower_id: userIds[2], following_id: userIds[0] },
    { follower_id: userIds[2], following_id: userIds[4] },
    { follower_id: userIds[3], following_id: userIds[5] },
    { follower_id: userIds[3], following_id: userIds[6] },
    { follower_id: userIds[4], following_id: userIds[1] },
    { follower_id: userIds[4], following_id: userIds[2] },
    { follower_id: userIds[5], following_id: userIds[0] },
    { follower_id: userIds[5], following_id: userIds[7] },
    { follower_id: userIds[6], following_id: userIds[3] },
    { follower_id: userIds[7], following_id: userIds[4] },
    { follower_id: userIds[7], following_id: userIds[8] }
  ];

  const insertFollow = db.prepare(`
    INSERT OR IGNORE INTO user_follows (follower_id, following_id)
    VALUES (?, ?)
  `);
  follows.forEach(f => insertFollow.run(f.follower_id, f.following_id));
  console.log(`✅ 已创建 ${follows.length} 条关注关系`);

  const feeds = [];
  
  plans.forEach((p, idx) => {
    const hoursAgo = (plans.length - idx) * 2;
    feeds.push({
      user_id: p.creator_id,
      type: 'create_plan',
      related_id: p.id,
      related_type: 'plan',
      extra_data: JSON.stringify({ title: p.title, theme: p.theme, city: p.city }),
      created_at: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
    });
  });

  noteIds.forEach((n, idx) => {
    const hoursAgo = (noteIds.length - idx) * 1.5 + 1;
    feeds.push({
      user_id: n.author_id,
      type: 'create_note',
      related_id: n.id,
      related_type: 'note',
      extra_data: JSON.stringify({ plan_id: n.plan_id }),
      created_at: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
    });
  });

  const joinRecords = db.prepare(`
    SELECT pp.plan_id, pp.user_id, cp.status, cp.title, cp.theme, cp.city
    FROM plan_participants pp
    JOIN citywalk_plans cp ON pp.plan_id = cp.id
    WHERE pp.role = 'member'
    ORDER BY pp.id
  `).all();
  
  joinRecords.slice(0, 8).forEach((r, idx) => {
    const hoursAgo = (8 - idx) * 1 + 0.5;
    feeds.push({
      user_id: r.user_id,
      type: 'join_plan',
      related_id: r.plan_id,
      related_type: 'plan',
      extra_data: JSON.stringify({ title: r.title, theme: r.theme, city: r.city }),
      created_at: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
    });
  });

  plans.filter(p => p.status === 'completed').slice(0, 3).forEach((p, idx) => {
    const hoursAgo = (3 - idx) * 3 + 2;
    feeds.push({
      user_id: p.creator_id,
      type: 'complete_citywalk',
      related_id: p.id,
      related_type: 'plan',
      extra_data: JSON.stringify({ title: p.title, theme: p.theme, city: p.city }),
      created_at: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
    });
  });

  feeds.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const insertFeed = db.prepare(`
    INSERT INTO activity_feeds (user_id, type, related_id, related_type, extra_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  feeds.forEach(f => {
    insertFeed.run(f.user_id, f.type, f.related_id, f.related_type, f.extra_data, f.created_at);
  });
  console.log(`✅ 已创建 ${feeds.length} 条动态`);

  const completedPlans = plans.filter(p => p.status === 'completed');
  const photos = [];
  const photoThemes = {
    old_building: ['老洋房外观', '精致铁门', '复古阳台', '花园小径', '欧式建筑细节'],
    market: ['热闹的菜市场', '新鲜蔬果', '老字号店铺', '街边小吃', '烟火气'],
    bridge: ['苏州河风景', '夕阳下的桥', '城市天际线', '桥下风光', '河水波光'],
    alley: ['弄堂入口', '石库门建筑', '晾晒的衣服', '街边小店', '邻里生活'],
    coffee: ['精致咖啡', '店内装修', '拉花艺术', '窗边座位', '咖啡器具'],
    street_art: ['涂鸦墙', '艺术装置', '彩色壁画', '创意雕塑', '街头表演'],
    river: ['滨江步道', '江景夜色', '对岸风景', '亲水平台', '跑步道'],
    park: ['公园小径', '湖泊风景', '古树名木', '草坪绿地', '亭台楼阁'],
    night: ['城市夜景', '霓虹灯光', '夜市灯火', '月光下的路', '温馨小店'],
    food: ['美味小吃', '街头美食', '丰盛餐桌', '特色菜品', '美食制作']
  };

  const photoLocations = {
    4: ['永康路', '嘉善路', '建国西路', '岳阳路', '衡山路'],
    6: ['南锣鼓巷', '菊儿胡同', '帽儿胡同', '烟袋斜街', '什刹海'],
    8: ['建设巷', '电子科大', '建设路', '第五大道', '小吃街入口'],
    11: ['豫园', '九曲桥', '城隍庙', '豫园商城', '老上海小吃街']
  };

  const completedPlanIds = completedPlans.map(p => p.id);
  
  completedPlans.forEach(plan => {
    const participantIds = db.prepare('SELECT user_id FROM plan_participants WHERE plan_id = ?').all(plan.id).map(p => p.user_id);
    const themePhotos = photoThemes[plan.theme] || ['城市风景', '街边随拍', '活动合影', '美食记录', '风景照'];
    const locations = photoLocations[plan.id] || [plan.city + '街头', plan.meeting_point, '沿途风景'];
    
    const photoCount = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < photoCount; i++) {
      const uploaderId = participantIds[Math.floor(Math.random() * participantIds.length)];
      const photoIdx = i % themePhotos.length;
      photos.push({
        plan_id: plan.id,
        user_id: uploaderId,
        image_url: `https://picsum.photos/seed/${plan.id}-${i}/600/450`,
        caption: themePhotos[photoIdx] + ' - ' + ['太好看了！', '随手拍的', '分享一下', '这个角度绝了', '打卡成功'][i % 5],
        location: locations[i % locations.length],
        created_at: new Date(Date.now() - Math.floor(Math.random() * 7 * 24) * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
      });
    }
  });

  const insertPhoto = db.prepare(`
    INSERT INTO activity_photos (plan_id, user_id, image_url, caption, location, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const photoIds = [];
  photos.forEach(p => {
    const result = insertPhoto.run(p.plan_id, p.user_id, p.image_url, p.caption, p.location, p.created_at);
    photoIds.push(result.lastInsertRowid);
  });
  console.log(`✅ 已创建 ${photos.length} 张活动照片`);

  const photoLikes = [];
  photoIds.forEach(photoId => {
    const photo = photos.find(p => p.id === photoId) || photos[photoIds.indexOf(photoId)];
    const planId = photo ? photo.plan_id : completedPlanIds[Math.floor(Math.random() * completedPlanIds.length)];
    const participantIds = db.prepare('SELECT user_id FROM plan_participants WHERE plan_id = ?').all(planId).map(p => p.user_id);
    const likeCount = Math.floor(Math.random() * 5);
    
    const shuffled = participantIds.sort(() => 0.5 - Math.random());
    for (let i = 0; i < Math.min(likeCount, shuffled.length); i++) {
      if (shuffled[i] !== photo.user_id) {
        photoLikes.push({
          photo_id: photoId,
          user_id: shuffled[i]
        });
      }
    }
  });

  const insertPhotoLike = db.prepare('INSERT INTO photo_likes (photo_id, user_id) VALUES (?, ?)');
  photoLikes.forEach(pl => {
    try {
      insertPhotoLike.run(pl.photo_id, pl.user_id);
    } catch(e) {}
  });
  console.log(`✅ 已创建 ${photoLikes.length} 条照片点赞`);

  console.log('\n🎉 数据初始化完成！');
  console.log('\n📋 默认用户账号：');
  users.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.username} (${u.city})`);
  });
  console.log('\n💡 提示：使用任意用户名登录即可，系统会自动创建新用户或登录已有用户');
}

try {
  seedData();
} catch (err) {
  console.error('❌ 初始化失败:', err.message);
  process.exit(1);
}
