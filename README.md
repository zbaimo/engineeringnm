# 混凝土量计算器

一个基于Node.js的工程计算工具，用于计算和管理混凝土工程量。

## 🚀 功能特性

- **混凝土量计算**: 支持墙、柱、梁等构件的体积计算
- **数据管理**: 用户数据隔离，支持历史记录管理
- **Excel导出**: 支持将计算结果导出为Excel文件
- **管理员界面**: 提供管理员后台管理功能
- **数据备份**: 自动备份和恢复功能
- **Docker支持**: 支持Docker容器化部署
- **多架构支持**: 支持AMD64和ARM64架构

## 📋 系统要求

- Node.js 18+
- npm 或 yarn
- Docker (可选)

## 🛠️ 安装和运行

### 方法1: 本地运行

#### 1. 克隆项目
```bash
git clone https://github.com/zbaimo/engineeringnm.git
cd engineeringnm
```

#### 2. 安装依赖
```bash
npm install
```

#### 3. 启动服务

**Windows (推荐)**:
```bash
# 使用批处理文件启动
start.bat

# 或使用PowerShell脚本
.\start.ps1
```

**手动启动**:
```bash
# 设置环境变量
$env:JWT_SECRET="fixed-secret-key-for-testing-12345"

# 启动服务器
node server.js
```

#### 4. 访问应用
- **主页**: http://localhost:3000
- **管理员界面**: http://localhost:3000/admin

### 方法2: Docker运行

#### 1. 拉取镜像
```bash
docker pull zbaimo/engineeringnm:latest
```

#### 2. 运行容器
```bash
docker run -d \
  --name engineeringnm \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  zbaimo/engineeringnm:latest
```

#### 3. 使用Docker Compose
```bash
# 创建docker-compose.yml
version: '3.8'
services:
  engineeringnm:
    image: zbaimo/engineeringnm:latest
    container_name: engineeringnm
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=fixed_jwt_secret_for_admin_login

# 启动服务
docker-compose up -d
```

## 🔐 默认登录信息

- **管理员账号**: admin
- **管理员密码**: admin

> **重要**: 请使用提供的启动脚本 (`start.bat` 或 `start.ps1`) 来确保数据持久化正常工作。

## 📁 项目结构

```
engineeringnm/
├── server.js              # 主服务器文件
├── database.js            # 数据库处理
├── xlsx-security-fix.js   # Excel处理模块
├── package.json           # 项目配置
├── Dockerfile             # Docker构建文件
├── .github/workflows/     # GitHub Actions
│   └── docker-build.yml   # 自动构建工作流
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
- **容器化**: Docker
- **CI/CD**: GitHub Actions

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

## 🐳 Docker镜像

### 可用镜像
- `zbaimo/engineeringnm:latest` - 最新版本
- `zbaimo/engineeringnm:main` - 主分支版本
- `zbaimo/engineeringnm:v1.0.0` - 特定版本

### 支持的架构
- `linux/amd64` - x86_64架构
- `linux/arm64` - ARM64架构

## 🔄 GitHub Actions

项目配置了自动构建工作流：

- **触发条件**: 推送到main分支或创建版本标签
- **构建架构**: AMD64 + ARM64
- **推送目标**: Docker Hub
- **缓存优化**: 使用GitHub Actions缓存加速构建

### 手动触发构建
```bash
# 创建版本标签
git tag v1.0.0
git push origin v1.0.0
```

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

ISC License

## 👨‍💻 作者

ZBaimo 