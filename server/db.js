const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'citywalk.json');

const defaultData = {
  users: [],
  plans: [],
  participants: [],
  notes: [],
  favorites: [],
  comments: [],
  notifications: [],
  counters: {
    users: 0,
    plans: 0,
    participants: 0,
    notes: 0,
    favorites: 0,
    comments: 0,
    notifications: 0
  }
};

function loadDB() {
  try {
    if (fs.existsSync(dbPath)) {
      const content = fs.readFileSync(dbPath, 'utf8');
      const data = JSON.parse(content);
      return { ...defaultData, ...data };
    }
  } catch (e) {
    console.error('读取数据库文件失败:', e.message);
  }
  return JSON.parse(JSON.stringify(defaultData));
}

function saveDB(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('保存数据库文件失败:', e.message);
    return false;
  }
}

let db = loadDB();

function nextId(table) {
  db.counters[table] = (db.counters[table] || 0) + 1;
  saveDB(db);
  return db.counters[table];
}

function prepare(query) {
  return {
    get(...args) {
      const result = this.all(...args);
      return result[0] || undefined;
    },
    all(...args) {
      return executeQuery(query, args, 'all');
    },
    run(...args) {
      const result = executeQuery(query, args, 'run');
      return { lastInsertRowid: result, changes: 1 };
    }
  };
}

function executeQuery(query, args, mode) {
  const normalized = query.trim().replace(/\s+/g, ' ');
  const upper = normalized.toUpperCase();

  if (upper.startsWith('SELECT')) {
    return handleSelect(normalized, args);
  } else if (upper.startsWith('INSERT')) {
    return handleInsert(normalized, args);
  } else if (upper.startsWith('UPDATE')) {
    return handleUpdate(normalized, args);
  } else if (upper.startsWith('DELETE')) {
    return handleDelete(normalized, args);
  }
  return [];
}

function parseWhere(whereClause, args) {
  const conditions = [];
  const parts = whereClause.split(/\s+AND\s+/i);
  let argIndex = 0;
  
  for (const part of parts) {
    const match = part.match(/([\w.]+)\s*(!=|=|>|<|>=|<=|LIKE|IN)\s*(\?|\([^)]+\))/i);
    if (match) {
      const field = match[1].split('.').pop();
      const op = match[2].toUpperCase();
      const val = match[3];
      
      let value;
      if (val === '?') {
        value = args[argIndex++];
      } else if (val.startsWith('(')) {
        const inner = val.slice(1, -1);
        const placeholders = inner.split(',').map(s => s.trim()).filter(s => s === '?');
        value = placeholders.map(() => args[argIndex++]);
      }
      conditions.push({ field, op, value });
    }
  }
  return conditions;
}

function matchConditions(item, conditions) {
  for (const { field, op, value } of conditions) {
    const itemVal = item[field];
    switch (op) {
      case '=':
        if (itemVal != value) return false;
        break;
      case '!=':
        if (itemVal == value) return false;
        break;
      case '>':
        if (!(itemVal > value)) return false;
        break;
      case '<':
        if (!(itemVal < value)) return false;
        break;
      case '>=':
        if (!(itemVal >= value)) return false;
        break;
      case '<=':
        if (!(itemVal <= value)) return false;
        break;
      case 'LIKE':
        const pattern = value.replace(/%/g, '.*');
        const regex = new RegExp(pattern, 'i');
        if (!regex.test(String(itemVal || ''))) return false;
        break;
      case 'IN':
        if (!Array.isArray(value) || !value.includes(itemVal)) return false;
        break;
    }
  }
  return true;
}

function resolveTableName(fromPart) {
  const tables = {
    'users': 'users',
    'citywalk_plans': 'plans',
    'plan_participants': 'participants',
    'route_notes': 'notes',
    'favorite_routes': 'favorites',
    'note_comments': 'comments',
    'user_notifications': 'notifications',
    'u': 'users',
    'p': 'plans',
    'pp': 'participants',
    'n': 'notes',
    'f': 'favorites',
    'c': 'comments',
    'nt': 'notifications'
  };
  
  const primaryMatch = fromPart.match(/^(citywalk_plans|plan_participants|route_notes|favorite_routes|note_comments|user_notifications|users)\s+(\w+)/i);
  if (primaryMatch) {
    return { mainTable: tables[primaryMatch[1].toLowerCase()], mainAlias: primaryMatch[2].toLowerCase() };
  }
  const simpleMatch = fromPart.match(/^\w+/);
  if (simpleMatch) {
    return { mainTable: tables[simpleMatch[0].toLowerCase()] || simpleMatch[0].toLowerCase(), mainAlias: null };
  }
  return { mainTable: 'plans', mainAlias: null };
}

function handleSelect(query, args) {
  let result = [];
  
  const whereMatch = query.match(/WHERE\s+(.+?)(?:ORDER\s+BY|LIMIT|$)/i);
  const orderMatch = query.match(/ORDER\s+BY\s+(.+?)(?:LIMIT|$)/i);
  const limitMatch = query.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
  const fromMatch = query.match(/FROM\s+(.+?)(?:WHERE|ORDER\s+BY|LIMIT|$)/i);
  
  const { mainTable, mainAlias } = fromMatch ? resolveTableName(fromMatch[1].trim()) : { mainTable: 'plans', mainAlias: null };
  let mainData = db[mainTable] || [];
  
  const joinMatches = [...query.matchAll(/LEFT\s+JOIN\s+(citywalk_plans|plan_participants|route_notes|favorite_routes|note_comments|user_notifications|users)\s+(\w+)\s+ON\s+([\w.]+)\s*=\s*([\w.]+)/gi)];
  const joins = joinMatches.map(m => ({
    table: ({ citywalk_plans: 'plans', plan_participants: 'participants', route_notes: 'notes', favorite_routes: 'favorites', note_comments: 'comments', user_notifications: 'notifications', users: 'users' })[m[1].toLowerCase()],
    alias: m[2].toLowerCase(),
    leftField: m[3].split('.').pop(),
    rightField: m[4].split('.').pop()
  }));
  
  if (whereMatch) {
    const conditions = parseWhere(whereMatch[1], args);
    mainData = mainData.filter(item => matchConditions(item, conditions));
  }
  
  if (joins.length > 0) {
    result = mainData.map(item => {
      let row = { ...item };
      for (const join of joins) {
        const joinData = db[join.table] || [];
        const joinItem = joinData.find(j => String(j[join.rightField]) === String(item[join.leftField]));
        if (joinItem) {
          for (const [k, v] of Object.entries(joinItem)) {
            row[`${join.alias}_${k}`] = v;
          }
        }
      }
      return row;
    });
  } else {
    result = [...mainData];
  }
  
  const groupMatch = query.match(/GROUP\s+BY\s+([\w.]+)/i);
  if (groupMatch) {
    const groupField = groupMatch[1].split('.').pop();
    const groups = {};
    for (const row of result) {
      const key = row[groupField];
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
    result = Object.values(groups).map(rows => {
      const first = rows[0];
      const aggregated = { ...first };
      if (query.includes('COUNT(')) {
        aggregated['notes_count'] = rows.filter(r => {
          const noteIdField = Object.keys(r).find(k => k.endsWith('_id') && k.startsWith('n_'));
          return noteIdField && r[noteIdField] != null;
        }).length;
      }
      if (query.includes('SUM(')) {
        aggregated['total_likes'] = rows.reduce((sum, r) => sum + (r['n_likes'] || r.likes || 0), 0);
      }
      if (query.includes('popularity') || query.includes('current_participants')) {
        aggregated['popularity'] = first.current_participants;
      }
      return aggregated;
    });
  }
  
  if (orderMatch) {
    const orderClauses = orderMatch[1].split(',').map(s => s.trim());
    result.sort((a, b) => {
      for (const clause of orderClauses) {
        const parts = clause.split(/\s+/);
        let field = parts[0].split('.').pop();
        const dir = parts[1]?.toUpperCase() === 'DESC' ? -1 : 1;
        
        if (field.includes('+')) {
          const fields = field.split('+').map(f => f.trim().split('.').pop().replace(/[()]/g, ''));
          let aVal = 0, bVal = 0;
          for (const f of fields) {
            aVal += Number(a[f] || 0);
            bVal += Number(b[f] || 0);
          }
          if (aVal !== bVal) return (aVal - bVal) * dir;
        } else {
          field = field.replace(/[()]/g, '');
          if (field.includes('*')) {
            const fields = field.split('*').map(f => f.trim().split('.').pop());
            let aVal = 1, bVal = 1;
            for (const f of fields) {
              aVal *= Number(a[f] || 0);
              bVal *= Number(b[f] || 0);
            }
            if (aVal !== bVal) return (aVal - bVal) * dir;
          } else {
            const aVal = a[field];
            const bVal = b[field];
            if (aVal !== bVal) {
              if (typeof aVal === 'string') return aVal.localeCompare(bVal) * dir;
              return (aVal - bVal) * dir;
            }
          }
        }
      }
      return 0;
    });
  }
  
  if (limitMatch) {
    const limit = parseInt(limitMatch[1]);
    const offset = parseInt(limitMatch[2] || 0);
    result = result.slice(offset, offset + limit);
  }
  
  return result;
}

function handleInsert(query, args) {
  const tableMatch = query.match(/INSERT\s+INTO\s+(citywalk_plans|plan_participants|route_notes|favorite_routes|note_comments|user_notifications|users)/i);
  if (!tableMatch) return null;
  
  const tableName = tableMatch[1].toLowerCase();
  const table = ({ citywalk_plans: 'plans', plan_participants: 'participants', route_notes: 'notes', favorite_routes: 'favorites', note_comments: 'comments', user_notifications: 'notifications', users: 'users' })[tableName];
  
  const fieldsMatch = query.match(/\(([^)]+)\)\s*VALUES/i);
  if (!fieldsMatch) return null;
  
  const fields = fieldsMatch[1].split(',').map(s => s.trim());
  const valuesMatch = query.match(/VALUES\s*\(([^)]+)\)/i);
  if (!valuesMatch) return null;
  
  const newItem = {};
  let argIndex = 0;
  const placeholders = valuesMatch[1].split(',').map(s => s.trim());
  
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const ph = placeholders[i];
    if (ph === '?' || ph === "''" || ph === 'NULL') {
      newItem[field] = ph === '?' ? args[argIndex++] : (ph === "''" ? '' : null);
    } else {
      const stripped = ph.replace(/^'|'$/g, '');
      if (stripped === 'CURRENT_TIMESTAMP') {
        newItem[field] = new Date().toISOString().replace('T', ' ').slice(0, 19);
      } else {
        newItem[field] = stripped;
      }
    }
  }
  
  if (table === 'participants' || table === 'favorites') {
    const existing = db[table].find(item => {
      const keys = Object.keys(newItem).filter(k => k !== 'role' && k !== 'joined_at' && k !== 'favorited_at');
      return keys.every(k => String(item[k]) === String(newItem[k]));
    });
    if (query.includes('OR IGNORE') && existing) {
      return existing.id;
    }
  }
  
  const id = nextId(table);
  newItem.id = id;
  if (!newItem.created_at && table !== 'participants' && table !== 'favorites') {
    newItem.created_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  }
  
  db[table].push(newItem);
  saveDB(db);
  return id;
}

function handleUpdate(query, args) {
  const tableMatch = query.match(/UPDATE\s+(citywalk_plans|plan_participants|route_notes|favorite_routes|note_comments|user_notifications|users)/i);
  if (!tableMatch) return null;
  
  const tableName = tableMatch[1].toLowerCase();
  const table = ({ citywalk_plans: 'plans', plan_participants: 'participants', route_notes: 'notes', favorite_routes: 'favorites', note_comments: 'comments', user_notifications: 'notifications', users: 'users' })[tableName];
  
  const setMatch = query.match(/SET\s+(.+?)(?:WHERE|$)/i);
  if (!setMatch) return null;
  
  const whereMatch = query.match(/WHERE\s+(.+)$/i);
  
  const setClauses = setMatch[1].split(',').map(s => {
    const [field, expr] = s.split('=').map(x => x.trim());
    return { field, expr };
  });
  
  let argIndex = 0;
  let items = db[table];
  let conditions = [];
  
  if (whereMatch) {
    const whereStr = whereMatch[1];
    const whereParts = [];
    let temp = '';
    let inQuotes = false;
    
    for (let i = 0; i < whereStr.length; i++) {
      const char = whereStr[i];
      if (char === "'") inQuotes = !inQuotes;
      if (!inQuotes && char === '?') {
        whereParts.push({ isPlaceholder: true, value: args[argIndex++] });
      } else {
        temp += char;
      }
    }
    
    const conditionsArr = [];
    const parts = whereStr.split(/\s+AND\s+/i);
    let placeIdx = 0;
    
    for (const part of parts) {
      const match = part.match(/([\w.]+)\s*(!=|=|>|<|>=|<=)\s*\?/i);
      if (match) {
        conditionsArr.push({ field: match[1].split('.').pop(), op: match[2].toUpperCase(), value: args[placeIdx++] });
      } else {
        const eqMatch = part.match(/([\w.]+)\s*=\s*(\d+)/i);
        if (eqMatch) {
          conditionsArr.push({ field: eqMatch[1].split('.').pop(), op: '=', value: Number(eqMatch[2]) });
        }
      }
    }
    conditions = conditionsArr;
    items = items.filter(item => matchConditions(item, conditions));
  }
  
  let updatedCount = 0;
  for (const item of items) {
    for (const { field, expr } of setClauses) {
      if (expr.includes('+') && expr.includes('?')) {
        const parts = expr.split('+').map(s => s.trim());
        let sum = 0;
        let pIdx = 0;
        for (const p of parts) {
          if (p === '?') {
            sum += args[setClauses.length + pIdx++] || 0;
          } else if (!isNaN(p)) {
            sum += Number(p);
          } else {
            sum += Number(item[p] || 0);
          }
        }
        item[field] = sum;
      } else if (expr === '?') {
        item[field] = args[updatedCount * setClauses.length];
      } else if (expr.startsWith("'") && expr.endsWith("'")) {
        item[field] = expr.slice(1, -1);
      } else if (!isNaN(expr)) {
        item[field] = Number(expr);
      }
    }
    updatedCount++;
  }
  
  saveDB(db);
  return updatedCount;
}

function handleDelete(query, args) {
  const tableMatch = query.match(/DELETE\s+FROM\s+(citywalk_plans|plan_participants|route_notes|favorite_routes|note_comments|user_notifications|users)/i);
  if (!tableMatch) return 0;
  
  const tableName = tableMatch[1].toLowerCase();
  const table = ({ citywalk_plans: 'plans', plan_participants: 'participants', route_notes: 'notes', favorite_routes: 'favorites', note_comments: 'comments', user_notifications: 'notifications', users: 'users' })[tableName];
  
  const whereMatch = query.match(/WHERE\s+(.+)$/i);
  let argIndex = 0;
  
  if (whereMatch) {
    const parts = whereMatch[1].split(/\s+AND\s+/i);
    const conditions = [];
    for (const part of parts) {
      const match = part.match(/([\w.]+)\s*(!=|=)\s*\?/i);
      if (match) {
        conditions.push({ field: match[1].split('.').pop(), op: match[2].toUpperCase(), value: args[argIndex++] });
      } else {
        const eqMatch = part.match(/([\w.]+)\s*=\s*(\d+)/i);
        if (eqMatch) {
          conditions.push({ field: eqMatch[1].split('.').pop(), op: '=', value: Number(eqMatch[2]) });
        }
      }
    }
    const beforeLen = db[table].length;
    db[table] = db[table].filter(item => !matchConditions(item, conditions));
    saveDB(db);
    return beforeLen - db[table].length;
  }
  
  return 0;
}

function transaction(fn) {
  const snapshot = JSON.parse(JSON.stringify(db));
  try {
    const result = fn();
    saveDB(db);
    return result;
  } catch (e) {
    db = snapshot;
    saveDB(db);
    throw e;
  }
}

function exec(sql) {
  const statements = sql.split(';').map(s => s.trim()).filter(s => s);
  for (const stmt of statements) {
    try {
      executeQuery(stmt, [], 'run');
    } catch (e) {
    }
  }
}

module.exports = {
  prepare,
  exec,
  transaction,
  pragma: () => {}
};
