const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// 导入安全模块
const SecureExcelProcessor = require('./xlsx-security-fix');
const FileDatabase = require('./database');

// 初始化安全模块
const secureExcel = new SecureExcelProcessor();
const db = new FileDatabase();

// 环境变量配置
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const NODE_ENV = process.env.NODE_ENV || 'development';

// 安全配置
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  credentials: true
}));

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 200, // 限制每个IP 15分钟内最多200个请求
  message: { message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 20, // 限制每个IP 5分钟内最多20次登录尝试
  message: { message: '登录尝试过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

app.use(limiter);
app.use(express.json({ limit: '10mb' })); // 限制请求体大小
app.use(express.static('public')); // 提供前端静态文件

// 管理员页面路由（必须在API端点之前）
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

// 数据隔离：为每个用户创建独立的数据存储
let users = []; // 存储注册用户
let userRecords = {}; // 用户数据隔离：{ username: [records] }
let userHistory = {}; // 用户历史数据：{ username: [{ id, name, records, createdAt, updatedAt }] }

// 管理员相关数据
let adminAccount = null; // 将从数据库加载
let systemSettings = { allowRegistration: false }; // 系统设置

// 数据库初始化标志
let dbInitialized = false;

// 密码哈希函数
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
}

// 输入验证函数
function validateUsername(username) {
  if (!username || typeof username !== 'string') return false;
  if (username.length < 3 || username.length > 20) return false;
  // 更严格的用户名验证，防止XSS
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) return false;
  // 检查是否包含危险字符
  if (/[<>\"'&]/.test(username)) return false;
  return true;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 3 || password.length > 50) return false;
  return true;
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (!record.part || typeof record.part !== 'string' || record.part.length > 100) return false;
  if (!record.type || typeof record.type !== 'string' || record.type.length > 50) return false;
  if (!record.number || typeof record.number !== 'string' || record.number.length > 50) return false;
  if (typeof record.height !== 'number' || record.height <= 0 || record.height > 1000) return false;
  if (typeof record.thick !== 'number' || record.thick <= 0 || record.thick > 100) return false;
  if (typeof record.length !== 'number' || record.length <= 0 || record.length > 10000) return false;
  if (typeof record.count !== 'number' || record.count <= 0 || record.count > 10000) return false;
  
  // 检查字符串字段是否包含危险字符
  if (/[<>\"'&]/.test(record.part) || /[<>\"'&]/.test(record.type) || /[<>\"'&]/.test(record.number)) {
    return false;
  }
  
  return true;
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim();
}

// 中间件：验证用户是否登录
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ message: '未授权访问' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: '无效的Token' });
    }
    req.user = user;
    next();
  });
}

// 中间件：验证管理员是否登录
function verifyAdminToken(req, res, next) {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ message: '未授权访问' });
  }

  jwt.verify(token, JWT_SECRET, (err, admin) => {
    if (err) {
      return res.status(403).json({ message: '无效的Token' });
    }
    if (admin.role !== 'admin') {
      return res.status(403).json({ message: '需要管理员权限' });
    }
    req.admin = admin;
    next();
  });
}

// 获取用户记录（数据隔离）
function getUserRecords(username) {
  if (!userRecords[username]) {
    userRecords[username] = [];
  }
  return userRecords[username];
}

// 获取用户历史数据（数据隔离）
function getUserHistory(username) {
  if (!userHistory[username]) {
    userHistory[username] = [];
  }
  return userHistory[username];
}

// 用户注册
app.post('/register', authLimiter, (req, res) => {
  try {
    // 检查是否允许注册
    if (!systemSettings.allowRegistration) {
      return res.status(403).json({ message: '系统当前不允许注册新用户' });
    }
    
    const { username, password } = req.body;
    
    // 输入验证
    if (!validateUsername(username)) {
      return res.status(400).json({ message: '用户名格式不正确（3-20个字符，只能包含字母、数字、下划线）' });
    }
    
    if (!validatePassword(password)) {
      return res.status(400).json({ message: '密码格式不正确（6-50个字符）' });
    }
    
    const sanitizedUsername = sanitizeString(username);
    
    if (users.find(u => u.username === sanitizedUsername)) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    
    const hashedPassword = hashPassword(password);
    const user = { 
      username: sanitizedUsername, 
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    
    users.push(user);
    
    // 为新用户初始化数据存储
    userRecords[sanitizedUsername] = [];
    userHistory[sanitizedUsername] = [];
    
    console.log(`新用户注册: ${sanitizedUsername}`);
    res.status(201).json({ message: '注册成功' });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 用户登录
app.post('/login', authLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!validateUsername(username) || !validatePassword(password)) {
      return res.status(400).json({ message: '用户名或密码格式不正确' });
    }
    
    const sanitizedUsername = sanitizeString(username);
    const hashedPassword = hashPassword(password);
    
    const user = users.find(u => u.username === sanitizedUsername && u.password === hashedPassword);
    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    
    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    console.log(`用户登录: ${sanitizedUsername}`);
    res.json({ message: '登录成功', token });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取用户记录（数据隔离）
app.get('/records', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const records = getUserRecords(username);
    res.json(records);
  } catch (error) {
    console.error('获取记录错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 添加记录（数据隔离）
app.post('/records', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const records = getUserRecords(username);
    
    const r = req.body;
    
    // 数据验证
    if (!validateRecord(r)) {
      return res.status(400).json({ message: '数据格式不正确' });
    }
    
    // 数据验证
    if (r.height <= 0 || r.thick <= 0 || r.length <= 0 || r.count <= 0) {
      return res.status(400).json({ message: '所有数值必须大于0' });
    }
    
    // 限制记录数量防止内存泄漏
    if (records.length >= 1000) {
      return res.status(400).json({ message: '记录数量已达上限' });
    }
    
    const sanitizedRecord = {
      part: sanitizeString(r.part),
      type: sanitizeString(r.type),
      number: sanitizeString(r.number),
      height: Number(r.height),
      thick: Number(r.thick),
      length: Number(r.length),
      count: Number(r.count),
      volume: +(r.height * r.thick * r.length * r.count).toFixed(3),
      createdAt: new Date().toISOString(),
      createdBy: username,
      id: Date.now() + Math.random()
    };
    
    records.push(sanitizedRecord);
    res.status(201).json({ message: '添加成功' });
  } catch (error) {
    console.error('添加记录错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除记录（数据隔离）
app.delete('/records/:index', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const records = getUserRecords(username);
    
    const i = Number(req.params.index);
    if (isNaN(i) || i < 0 || i >= records.length) {
      return res.status(400).json({ message: '索引错误' });
    }
    
    // 验证记录是否属于当前用户
    const record = records[i];
    if (record.createdBy !== username) {
      return res.status(403).json({ message: '无权删除此记录' });
    }
    
    records.splice(i, 1);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除记录错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新记录（数据隔离）
app.put('/records/:index', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const records = getUserRecords(username);
    
    const i = Number(req.params.index);
    if (isNaN(i) || i < 0 || i >= records.length) {
      return res.status(400).json({ message: '索引错误' });
    }
    
    // 验证记录是否属于当前用户
    const record = records[i];
    if (record.createdBy !== username) {
      return res.status(403).json({ message: '无权修改此记录' });
    }
    
    const r = req.body;
    
    // 数据验证
    if (!validateRecord(r)) {
      return res.status(400).json({ message: '数据格式不正确' });
    }
    
    // 数据验证
    if (r.height <= 0 || r.thick <= 0 || r.length <= 0 || r.count <= 0) {
      return res.status(400).json({ message: '所有数值必须大于0' });
    }
    
    // 更新记录
    records[i] = {
      ...record,
      part: sanitizeString(r.part),
      type: sanitizeString(r.type),
      number: sanitizeString(r.number),
      height: Number(r.height),
      thick: Number(r.thick),
      length: Number(r.length),
      count: Number(r.count),
      volume: +(r.height * r.thick * r.length * r.count).toFixed(3),
      updatedAt: new Date().toISOString()
    };
    
    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('更新记录错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 清空所有记录（数据隔离）
app.delete('/records', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const records = getUserRecords(username);
    
    // 清空用户的所有记录
    records.length = 0;
    
    res.json({ message: '所有记录已清空' });
  } catch (error) {
    console.error('清空记录错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 导出 Excel（数据隔离）- 使用安全的 Excel 处理器
app.get('/export', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const records = getUserRecords(username);
    
    if (records.length === 0) {
      return res.status(400).send('无数据导出');
    }
    
    const wsData = records.map((r, idx) => ({
      序号: idx + 1,
      部位: r.part,
      构件: r.type,
      编号: r.number,
      高度: r.height,
      厚度: r.thick,
      长度: r.length,
      数量: r.count,
      体积: r.volume,
      创建时间: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
      创建人: r.createdBy || username
    }));

    // 使用安全的 Excel 处理器
    const excelData = {
      '混凝土量': wsData
    };
    
    const buf = secureExcel.generateExcelSafely(excelData);
    const filename = secureExcel.generateSafeFilename(`混凝土量_${username}`);
    const encodedFilename = encodeURIComponent(filename);
    
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('导出错误:', error);
    res.status(500).json({ message: '导出失败' });
  }
});

// 导出历史数据 Excel（数据隔离）- 使用安全的 Excel 处理器
app.get('/export/history/:id', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const historyId = Number(req.params.id);
    
    if (isNaN(historyId)) {
      return res.status(400).json({ message: '无效的历史ID' });
    }
    
    const userHistory = getUserHistory(username);
    const historyItem = userHistory.find(h => h.id === historyId);
    
    if (!historyItem) {
      return res.status(404).json({ message: '未找到历史数据' });
    }
    
    if (historyItem.records.length === 0) {
      return res.status(400).send('无数据导出');
    }
    
    const wsData = historyItem.records.map((r, idx) => ({
      序号: idx + 1,
      部位: r.part,
      构件: r.type,
      编号: r.number,
      高度: r.height,
      厚度: r.thick,
      长度: r.length,
      数量: r.count,
      体积: r.volume,
      创建时间: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
      创建人: r.createdBy || username
    }));

    // 使用安全的 Excel 处理器
    const excelData = {
      '混凝土量': wsData
    };
    
    const buf = secureExcel.generateExcelSafely(excelData);
    const filename = secureExcel.generateSafeFilename(`混凝土量_${username}_${historyItem.name}`);
    const encodedFilename = encodeURIComponent(filename);
    
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('导出历史数据错误:', error);
    res.status(500).json({ message: '导出失败' });
  }
});

// 获取用户统计信息（数据隔离）
app.get('/stats', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const records = getUserRecords(username);
    
    const stats = {
      totalRecords: records.length,
      totalVolume: records.reduce((sum, r) => sum + r.volume, 0),
      parts: [...new Set(records.map(r => r.part))],
      types: [...new Set(records.map(r => r.type))],
      lastUpdated: records.length > 0 ? Math.max(...records.map(r => new Date(r.createdAt).getTime())) : null
    };
    
    res.json(stats);
  } catch (error) {
    console.error('获取统计信息错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取用户历史数据（数据隔离）
app.get('/history', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const history = getUserHistory(username);
    res.json(history);
  } catch (error) {
    console.error('获取历史数据错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 保存数据（数据隔离）
app.post('/save', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const { name, records } = req.body;

    if (!name || typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({ message: '名称格式不正确' });
    }

    if (!Array.isArray(records) || records.length === 0 || records.length > 1000) {
      return res.status(400).json({ message: '记录格式不正确或数量过多' });
    }

    // 验证所有记录
    for (const record of records) {
      if (!validateRecord(record)) {
        return res.status(400).json({ message: '记录数据格式不正确' });
      }
    }

    const sanitizedName = sanitizeString(name);
    
    // 限制历史数据数量
    const userHistory = getUserHistory(username);
    if (userHistory.length >= 100) {
      return res.status(400).json({ message: '历史数据数量已达上限' });
    }

    const historyEntry = {
      id: Date.now(),
      name: sanitizedName,
      records: records.map(r => ({
        ...r,
        part: sanitizeString(r.part),
        type: sanitizeString(r.type),
        number: sanitizeString(r.number),
        height: Number(r.height),
        thick: Number(r.thick),
        length: Number(r.length),
        count: Number(r.count),
        volume: +(r.height * r.thick * r.length * r.count).toFixed(3)
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    userHistory.push(historyEntry);

    res.status(201).json({ message: '数据保存成功', historyEntry });
  } catch (error) {
    console.error('保存数据错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新历史数据（数据隔离）
app.put('/history/:id', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const historyId = Number(req.params.id);
    const { name, records } = req.body;

    if (isNaN(historyId)) {
      return res.status(400).json({ message: '无效的历史ID' });
    }

    if (!name || typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({ message: '名称格式不正确' });
    }

    if (!Array.isArray(records) || records.length === 0 || records.length > 1000) {
      return res.status(400).json({ message: '记录格式不正确或数量过多' });
    }

    // 验证所有记录
    for (const record of records) {
      if (!validateRecord(record)) {
        return res.status(400).json({ message: '记录数据格式不正确' });
      }
    }

    const sanitizedName = sanitizeString(name);
    const userHistory = getUserHistory(username);
    const index = userHistory.findIndex(h => h.id === historyId);

    if (index === -1) {
      return res.status(404).json({ message: '未找到历史数据' });
    }

    userHistory[index] = {
      ...userHistory[index],
      name: sanitizedName,
      records: records.map(r => ({
        ...r,
        part: sanitizeString(r.part),
        type: sanitizeString(r.type),
        number: sanitizeString(r.number),
        height: Number(r.height),
        thick: Number(r.thick),
        length: Number(r.length),
        count: Number(r.count),
        volume: +(r.height * r.thick * r.length * r.count).toFixed(3)
      })),
      updatedAt: new Date().toISOString()
    };

    res.json({ message: '历史数据更新成功', historyEntry: userHistory[index] });
  } catch (error) {
    console.error('更新历史数据错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除历史数据（数据隔离）
app.delete('/history/:id', verifyToken, (req, res) => {
  try {
    const username = req.user.username;
    const historyId = Number(req.params.id);

    if (isNaN(historyId)) {
      return res.status(400).json({ message: '无效的历史ID' });
    }

    const userHistory = getUserHistory(username);
    const initialLength = userHistory.length;
    const filteredHistory = userHistory.filter(h => h.id !== historyId);
    userHistory.length = 0;
    userHistory.push(...filteredHistory);

    if (userHistory.length === initialLength) {
      return res.status(404).json({ message: '未找到历史数据' });
    }

    res.json({ message: '历史数据删除成功' });
  } catch (error) {
    console.error('删除历史数据错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    totalUsers: users.length,
    totalUserRecords: Object.keys(userRecords).length,
    totalUserHistory: Object.keys(userHistory).reduce((sum, username) => sum + userHistory[username].length, 0)
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('未处理的错误:', err);
  res.status(500).json({ message: '服务器内部错误' });
});

// 管理员登录
app.post('/admin/login', authLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!validateUsername(username) || !validatePassword(password)) {
      return res.status(400).json({ message: '管理员账号或密码格式不正确' });
    }
    
    // 检查管理员账户是否已加载
    if (!adminAccount) {
      console.error('管理员账户未加载');
      return res.status(500).json({ message: '管理员账户未初始化' });
    }
    
    const sanitizedUsername = sanitizeString(username);
    const hashedPassword = hashPassword(password);
    
    if (sanitizedUsername !== adminAccount.username || hashedPassword !== adminAccount.password) {
      return res.status(401).json({ message: '管理员账号或密码错误' });
    }
    
    const token = jwt.sign({ username: adminAccount.username, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    console.log(`管理员登录: ${sanitizedUsername}`);
    res.json({ message: '管理员登录成功', token });
  } catch (error) {
    console.error('管理员登录错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取管理员设置
app.get('/admin/settings', verifyAdminToken, (req, res) => {
  try {
    res.json({
      adminUsername: adminAccount.username,
      allowRegistration: systemSettings.allowRegistration
    });
  } catch (error) {
    console.error('获取管理员设置错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新管理员设置
app.put('/admin/settings', verifyAdminToken, (req, res) => {
  try {
    const { allowRegistration } = req.body;
    
    if (typeof allowRegistration === 'boolean') {
      systemSettings.allowRegistration = allowRegistration;
      res.json({ message: '系统设置更新成功' });
    } else {
      res.status(400).json({ message: '参数错误' });
    }
  } catch (error) {
    console.error('更新管理员设置错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新管理员账号
app.put('/admin/account', verifyAdminToken, (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!validateUsername(username) || !validatePassword(password)) {
      return res.status(400).json({ message: '管理员账号或密码格式不正确' });
    }
    
    const sanitizedUsername = sanitizeString(username);
    const hashedPassword = hashPassword(password);
    
    adminAccount.username = sanitizedUsername;
    adminAccount.password = hashedPassword;
    
    console.log(`管理员账号更新: ${sanitizedUsername}`);
    res.json({ message: '管理员账号更新成功' });
  } catch (error) {
    console.error('更新管理员账号错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取用户列表
app.get('/admin/users', verifyAdminToken, (req, res) => {
  try {
    const userList = users.map(user => {
      const historyCount = userHistory[user.username] ? userHistory[user.username].length : 0;
      return {
        username: user.username,
        historyCount,
        createdAt: user.createdAt || null
      };
    });
    
    res.json(userList);
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新用户密码
app.put('/admin/users/:username/password', verifyAdminToken, (req, res) => {
  try {
    const { username } = req.params;
    const { password } = req.body;
    
    if (!validatePassword(password)) {
      return res.status(400).json({ message: '密码格式不正确' });
    }
    
    const sanitizedUsername = sanitizeString(username);
    const user = users.find(u => u.username === sanitizedUsername);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    user.password = hashPassword(password);
    console.log(`用户密码更新: ${sanitizedUsername}`);
    res.json({ message: '用户密码更新成功' });
  } catch (error) {
    console.error('更新用户密码错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除用户
app.delete('/admin/users/:username', verifyAdminToken, (req, res) => {
  try {
    const { username } = req.params;
    const sanitizedUsername = sanitizeString(username);
    
    const userIndex = users.findIndex(u => u.username === sanitizedUsername);
    if (userIndex === -1) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    // 删除用户相关数据
    users.splice(userIndex, 1);
    delete userRecords[sanitizedUsername];
    delete userHistory[sanitizedUsername];
    
    console.log(`用户删除: ${sanitizedUsername}`);
    res.json({ message: '用户删除成功' });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 数据库初始化函数
async function initializeDatabase() {
  try {
    if (!dbInitialized) {
      await db.initialize();
      
      // 从内存数据迁移到文件数据库
      const memoryData = {
        users,
        userRecords,
        userHistory,
        adminAccount,
        systemSettings
      };
      
      await db.migrateFromMemory(memoryData);
      
      // 从数据库加载数据到内存
      users = await db.getUsers();
      userRecords = await db.getUserRecords();
      userHistory = await db.getUserHistory();
      adminAccount = await db.getAdminAccount();
      systemSettings = await db.getSystemSettings();
      
      // 创建初始备份
      await db.createBackup();
      
      dbInitialized = true;
      console.log('✅ 数据库初始化完成');
    }
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    // 即使数据库初始化失败，服务器仍然可以启动（使用内存存储）
  }
}

// 启动服务器
app.listen(port, '0.0.0.0', async () => {
  console.log(`🚀 服务器启动成功！`);
  console.log(`📍 监听端口: ${port}`);
  console.log(`🌍 环境: ${NODE_ENV}`);
  console.log(`🔗 访问地址: http://localhost:${port}`);
  console.log(`🔒 数据隔离: 已启用`);
  console.log(`🛡️  安全措施: 已启用`);
  console.log(`📊 文件数据库: 已启用`);
  
  // 初始化数据库
  await initializeDatabase();
});
