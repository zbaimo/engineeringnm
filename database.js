const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * 简单的文件数据库模块
 * 解决内存数据存储的持久化问题
 */
class FileDatabase {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.backupDir = path.join(dataDir, 'backups');
    this.lockFile = path.join(dataDir, '.lock');
    this.isInitialized = false;
  }

  /**
   * 初始化数据库
   */
  async initialize() {
    try {
      // 创建数据目录
      await this.ensureDirectory(this.dataDir);
      await this.ensureDirectory(this.backupDir);
      
      // 初始化数据文件
      await this.initializeDataFiles();
      
      this.isInitialized = true;
      console.log('✅ 文件数据库初始化成功');
    } catch (error) {
      console.error('❌ 文件数据库初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 确保目录存在
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * 初始化数据文件
   */
  async initializeDataFiles() {
    const files = [
      'users.json',
      'userRecords.json',
      'userHistory.json',
      'adminAccount.json',
      'systemSettings.json'
    ];

    for (const file of files) {
      const filePath = path.join(this.dataDir, file);
      try {
        await fs.access(filePath);
      } catch {
        // 文件不存在，创建默认数据
        const defaultData = this.getDefaultData(file);
        await this.writeFile(filePath, defaultData);
      }
    }
  }

  /**
   * 获取默认数据
   */
  getDefaultData(filename) {
    switch (filename) {
      case 'users.json':
        return [];
      case 'userRecords.json':
        return {};
      case 'userHistory.json':
        return {};
      case 'adminAccount.json':
        return {
          username: 'admin',
          password: this.hashPassword('admin'),
          createdAt: new Date().toISOString()
        };
      case 'systemSettings.json':
        return {
          allowRegistration: false,
          maxRecordsPerUser: 1000,
          maxHistoryPerUser: 100,
          updatedAt: new Date().toISOString()
        };
      default:
        return {};
    }
  }

  /**
   * 密码哈希
   */
  hashPassword(password) {
    const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
    return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
  }

  /**
   * 安全地写入文件
   */
  async writeFile(filePath, data) {
    try {
      // 创建临时文件
      const tempPath = filePath + '.tmp';
      const jsonData = JSON.stringify(data, null, 2);
      
      // 写入临时文件
      await fs.writeFile(tempPath, jsonData, 'utf8');
      
      // 原子性地重命名文件
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // 清理临时文件
      try {
        await fs.unlink(filePath + '.tmp');
      } catch {}
      throw error;
    }
  }

  /**
   * 安全地读取文件
   */
  async readFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回默认数据
        const filename = path.basename(filePath);
        return this.getDefaultData(filename);
      }
      throw error;
    }
  }

  /**
   * 创建备份
   */
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `backup_${timestamp}`);
      
      await this.ensureDirectory(backupPath);
      
      const files = await fs.readdir(this.dataDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sourcePath = path.join(this.dataDir, file);
          const destPath = path.join(backupPath, file);
          await fs.copyFile(sourcePath, destPath);
        }
      }
      
      console.log(`✅ 备份创建成功: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('❌ 备份创建失败:', error.message);
      throw error;
    }
  }

  /**
   * 恢复备份
   */
  async restoreBackup(backupPath) {
    try {
      const files = await fs.readdir(backupPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sourcePath = path.join(backupPath, file);
          const destPath = path.join(this.dataDir, file);
          await fs.copyFile(sourcePath, destPath);
        }
      }
      
      console.log(`✅ 备份恢复成功: ${backupPath}`);
    } catch (error) {
      console.error('❌ 备份恢复失败:', error.message);
      throw error;
    }
  }

  /**
   * 用户数据操作
   */
  async getUsers() {
    const filePath = path.join(this.dataDir, 'users.json');
    return await this.readFile(filePath);
  }

  async saveUsers(users) {
    const filePath = path.join(this.dataDir, 'users.json');
    await this.writeFile(filePath, users);
  }

  async addUser(user) {
    const users = await this.getUsers();
    users.push(user);
    await this.saveUsers(users);
  }

  async updateUser(username, updates) {
    const users = await this.getUsers();
    const index = users.findIndex(u => u.username === username);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      await this.saveUsers(users);
    }
  }

  async deleteUser(username) {
    const users = await this.getUsers();
    const filteredUsers = users.filter(u => u.username !== username);
    await this.saveUsers(filteredUsers);
  }

  /**
   * 用户记录数据操作
   */
  async getUserRecords() {
    const filePath = path.join(this.dataDir, 'userRecords.json');
    return await this.readFile(filePath);
  }

  async saveUserRecords(userRecords) {
    const filePath = path.join(this.dataDir, 'userRecords.json');
    await this.writeFile(filePath, userRecords);
  }

  async getUserRecordsByUsername(username) {
    const userRecords = await this.getUserRecords();
    return userRecords[username] || [];
  }

  async saveUserRecordsByUsername(username, records) {
    const userRecords = await this.getUserRecords();
    userRecords[username] = records;
    await this.saveUserRecords(userRecords);
  }

  /**
   * 用户历史数据操作
   */
  async getUserHistory() {
    const filePath = path.join(this.dataDir, 'userHistory.json');
    return await this.readFile(filePath);
  }

  async saveUserHistory(userHistory) {
    const filePath = path.join(this.dataDir, 'userHistory.json');
    await this.writeFile(filePath, userHistory);
  }

  async getUserHistoryByUsername(username) {
    const userHistory = await this.getUserHistory();
    return userHistory[username] || [];
  }

  async saveUserHistoryByUsername(username, history) {
    const userHistory = await this.getUserHistory();
    userHistory[username] = history;
    await this.saveUserHistory(userHistory);
  }

  /**
   * 管理员账户数据操作
   */
  async getAdminAccount() {
    const filePath = path.join(this.dataDir, 'adminAccount.json');
    return await this.readFile(filePath);
  }

  async saveAdminAccount(adminAccount) {
    const filePath = path.join(this.dataDir, 'adminAccount.json');
    await this.writeFile(filePath, adminAccount);
  }

  /**
   * 系统设置数据操作
   */
  async getSystemSettings() {
    const filePath = path.join(this.dataDir, 'systemSettings.json');
    return await this.readFile(filePath);
  }

  async saveSystemSettings(settings) {
    const filePath = path.join(this.dataDir, 'systemSettings.json');
    await this.writeFile(filePath, settings);
  }

  /**
   * 数据迁移 (从内存数据到文件)
   */
  async migrateFromMemory(memoryData) {
    try {
      console.log('🔄 开始数据迁移...');
      
      // 迁移用户数据
      if (memoryData.users) {
        await this.saveUsers(memoryData.users);
        console.log(`✅ 迁移 ${memoryData.users.length} 个用户`);
      }
      
      // 迁移用户记录
      if (memoryData.userRecords) {
        await this.saveUserRecords(memoryData.userRecords);
        console.log(`✅ 迁移用户记录数据`);
      }
      
      // 迁移用户历史
      if (memoryData.userHistory) {
        await this.saveUserHistory(memoryData.userHistory);
        console.log(`✅ 迁移用户历史数据`);
      }
      
      // 迁移管理员账户
      if (memoryData.adminAccount) {
        await this.saveAdminAccount(memoryData.adminAccount);
        console.log('✅ 迁移管理员账户');
      }
      
      // 迁移系统设置
      if (memoryData.systemSettings) {
        await this.saveSystemSettings(memoryData.systemSettings);
        console.log('✅ 迁移系统设置');
      }
      
      console.log('✅ 数据迁移完成');
    } catch (error) {
      console.error('❌ 数据迁移失败:', error.message);
      throw error;
    }
  }

  /**
   * 数据统计
   */
  async getDataStats() {
    try {
      const users = await this.getUsers();
      const userRecords = await this.getUserRecords();
      const userHistory = await this.getUserHistory();
      
      const stats = {
        totalUsers: users.length,
        totalRecords: 0,
        totalHistoryEntries: 0,
        userStats: []
      };
      
      for (const user of users) {
        const records = userRecords[user.username] || [];
        const history = userHistory[user.username] || [];
        
        stats.totalRecords += records.length;
        stats.totalHistoryEntries += history.length;
        
        stats.userStats.push({
          username: user.username,
          recordsCount: records.length,
          historyCount: history.length,
          createdAt: user.createdAt
        });
      }
      
      return stats;
    } catch (error) {
      console.error('❌ 获取数据统计失败:', error.message);
      throw error;
    }
  }

  /**
   * 数据清理
   */
  async cleanupOldBackups(maxBackups = 10) {
    try {
      const backups = await fs.readdir(this.backupDir);
      const backupPaths = backups
        .filter(name => name.startsWith('backup_'))
        .map(name => ({
          name,
          path: path.join(this.backupDir, name),
          time: name.replace('backup_', '').replace(/\.json$/, '')
        }))
        .sort((a, b) => new Date(b.time) - new Date(a.time));
      
      // 删除旧的备份
      if (backupPaths.length > maxBackups) {
        const toDelete = backupPaths.slice(maxBackups);
        for (const backup of toDelete) {
          await fs.rm(backup.path, { recursive: true, force: true });
          console.log(`🗑️ 删除旧备份: ${backup.name}`);
        }
      }
    } catch (error) {
      console.error('❌ 清理旧备份失败:', error.message);
    }
  }
}

module.exports = FileDatabase; 