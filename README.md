# 混凝土量计算器

一个基于Node.js的工程计算工具，用于计算和管理混凝土工程量。

## 🚀 功能特性

- **混凝土量计算**: 支持墙、柱、梁等构件的体积计算
- **数据管理**: 用户数据隔离，支持历史记录管理
- **Excel导出**: 支持将计算结果导出为Excel文件
- **管理员界面**: 提供管理员后台管理功能
- **数据备份**: 自动备份和恢复功能

## 📋 系统要求

- Node.js 18+
- npm 或 yarn

## 🛠️ 安装和运行

### 1. 克隆项目
```bash
git clone https://github.com/zbaimo/engineeringnm.git
cd engineeringnm
```

### 2. 安装依赖
```bash
npm install
```

### 3. 启动服务
```bash
# 设置环境变量
$env:JWT_SECRET="fixed_jwt_secret_for_admin_login"

# 启动服务器
node server.js
```

### 4. 访问应用
- **主页**: http://localhost:3000
- **管理员界面**: http://localhost:3000/admin

## 🔐 默认登录信息

- **管理员账号**: admin
- **管理员密码**: admin

## 📁 项目结构

```
engineeringnm/
├── server.js              # 主服务器文件
├── database.js            # 数据库处理
├── xlsx-security-fix.js   # Excel处理模块
├── package.json           # 项目配置
├── public/                # 前端文件
│   ├── index.html         # 主页
│   └── admin.html         # 管理员界面
└── data/                  # 数据存储
    ├── users.json         # 用户数据
    ├── adminAccount.json  # 管理员账户
    └── backups/           # 备份文件
```

## 🔧 技术栈

- **后端**: Node.js, Express.js
- **前端**: HTML, CSS, JavaScript
- **数据库**: JSON文件存储
- **Excel处理**: xlsx库
- **安全**: JWT认证, 密码哈希

## 🛡️ 安全特性

- 用户数据隔离
- 密码SHA-256哈希加密
- JWT令牌认证
- 输入验证和清理
- 速率限制防护
- CORS安全配置

## 📊 API接口

### 用户相关
- `POST /register` - 用户注册
- `POST /login` - 用户登录
- `GET /records` - 获取用户记录
- `POST /records` - 添加记录
- `DELETE /records/:id` - 删除记录

### 管理员相关
- `POST /admin/login` - 管理员登录
- `GET /admin/users` - 获取所有用户
- `GET /admin/stats` - 获取系统统计

### 数据导出
- `GET /export` - 导出当前记录
- `GET /export/history/:id` - 导出历史数据

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

ISC License

## 👨‍💻 作者

ZBaimo 