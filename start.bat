@echo off
echo 🚀 启动工程管理系统服务器...
echo.

REM 设置JWT_SECRET环境变量
set JWT_SECRET=fixed-secret-key-for-testing-12345

echo 📊 使用固定JWT_SECRET确保数据持久化
echo 🔒 数据将保存到 ./data/ 目录
echo.

REM 启动服务器
node server.js

pause
