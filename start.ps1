Write-Host "🚀 启动工程管理系统服务器..." -ForegroundColor Green
Write-Host ""

# 设置JWT_SECRET环境变量
$env:JWT_SECRET = "fixed-secret-key-for-testing-12345"

Write-Host "📊 使用固定JWT_SECRET确保数据持久化" -ForegroundColor Yellow
Write-Host "🔒 数据将保存到 ./data/ 目录" -ForegroundColor Yellow
Write-Host ""

# 启动服务器
node server.js
