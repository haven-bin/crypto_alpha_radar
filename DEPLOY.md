# Crypto Alpha Radar — 服务器部署指南

> **架构概览**
> ```
> 用户浏览器 / Telegram
>       │
>       ▼
>    Nginx (80/443)
>       ├── / ──────────────▶  前端静态文件  (React + Vite build)
>       └── /api ───────────▶  后端 API     (Express :3001)
>
> 后台进程 (PM2)
>       ├── radar-api     ──▶  Express API Server  (src/server.ts)
>       └── radar-bot     ──▶  Bot + Cron Daemon   (src/main.ts)
> ```

---

## 目录

1. [服务器环境要求](#1-服务器环境要求)
2. [服务器初始化](#2-服务器初始化)
3. [上传项目代码](#3-上传项目代码)
4. [后端部署](#4-后端部署)
5. [前端构建与部署](#5-前端构建与部署)
6. [Nginx 配置](#6-nginx-配置)
7. [PM2 进程管理](#7-pm2-进程管理)
8. [HTTPS 证书（可选）](#8-https-证书可选)
9. [日常运维命令](#9-日常运维命令)
10. [更新部署流程](#10-更新部署流程)

---

## 1. 服务器环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Ubuntu 22.04 LTS（推荐）/ Debian 12 |
| CPU | 1 核以上 |
| 内存 | **2 GB+**（SQLite + Node.js） |
| 磁盘 | 20 GB+ |
| 网络 | 能访问 Etherscan、DexScreener API |
| 开放端口 | 22 (SSH)、80 (HTTP)、443 (HTTPS 可选) |

---

## 2. 服务器初始化

SSH 连接服务器后，依次执行：

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 20 LTS（通过 NodeSource）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证版本
node -v   # 应显示 v20.x.x
npm -v    # 应显示 10.x.x

# 安装 PM2（全局进程管理器）
sudo npm install -g pm2

# 安装 Nginx
sudo apt install -y nginx

# 安装 Git
sudo apt install -y git

# 安装构建工具（better-sqlite3 需要原生编译）
sudo apt install -y build-essential python3

# 创建应用目录
sudo mkdir -p /var/www/crypto_alpha_radar
sudo chown $USER:$USER /var/www/crypto_alpha_radar
```

---

## 3. 上传项目代码

### 方式 A：Git（推荐）

```bash
# 在服务器上拉取代码
cd /var/www/crypto_alpha_radar
git clone https://github.com/你的用户名/crypto_alpha_radar.git .
```

### 方式 B：rsync 从本地上传（Windows 用 Git Bash 或 WSL）

```bash
# 在本地 Windows 的 Git Bash / WSL 中执行
rsync -avz --progress \
  --exclude='node_modules' \
  --exclude='frontend/node_modules' \
  --exclude='dist' \
  --exclude='frontend/dist' \
  --exclude='radar.db' \
  --exclude='radar.db-shm' \
  --exclude='radar.db-wal' \
  --exclude='.env' \
  /d/workspace/crypto_alpha_radar/ \
  root@你的服务器IP:/var/www/crypto_alpha_radar/
```

### 方式 C：SCP 压缩上传（Windows PowerShell + WSL）

```powershell
# 在本地 PowerShell 中，借助 WSL 打包（排除 node_modules）
wsl tar -czf /tmp/radar.tar.gz \
  --exclude='crypto_alpha_radar/node_modules' \
  --exclude='crypto_alpha_radar/frontend/node_modules' \
  --exclude='crypto_alpha_radar/radar.db*' \
  --exclude='crypto_alpha_radar/.env' \
  -C /mnt/d/workspace crypto_alpha_radar

# 上传压缩包
scp /tmp/radar.tar.gz root@你的服务器IP:/tmp/

# 在服务器上解压
ssh root@你的服务器IP "tar -xzf /tmp/radar.tar.gz -C /var/www/crypto_alpha_radar --strip-components=1"
```

---

## 4. 后端部署

```bash
cd /var/www/crypto_alpha_radar

# 1. 安装后端依赖（含 better-sqlite3 原生编译）
npm install

# 2. 创建 .env 配置文件（机密信息，绝不上传 Git）
cat > .env << 'EOF'
ETHERSCAN_API_KEY=XKBGGZNJ9PUS2C6X8MDBSJNGZ4QI9VH3NQ
TELEGRAM_BOT_TOKEN=8915377586:AAHrHGyFk-flELsuV-dJuZ7sQE98kjLWDDk
TELEGRAM_CHAT_ID=-5321805427
EOF

# 3. 编译 TypeScript → JavaScript（生产用编译后的 JS）
npx tsc

# 验证编译输出
ls dist/
# 应看到: index.js  engine.js  server.js  main.js  scheduler.js  types.js  db/  data/  services/

# 4. 测试 API 是否正常启动（Ctrl+C 退出）
node dist/server.js
# 应看到: 📡 Alpha Radar API running on http://localhost:3001

# 5. 添加生产启动脚本到 package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts['start:api']  = 'node dist/server.js';
pkg.scripts['start:bot']  = 'node dist/main.js';
pkg.scripts['build:ts']   = 'npx tsc';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('package.json updated.');
"
```

---

## 5. 前端构建与部署

```bash
cd /var/www/crypto_alpha_radar/frontend

# 1. 安装前端依赖
npm install

# 2. 配置生产环境 API 地址
#    （Nginx 会把 /api 代理到后端，所以用相对路径或域名）
cat > .env.production << 'EOF'
VITE_API_BASE_URL=/api
EOF
# 如果有域名和 HTTPS，改为：
# VITE_API_BASE_URL=https://your-domain.com/api

# 3. 构建前端静态文件
npm run build

# 4. 验证构建产物
ls dist/
# 应看到: index.html  assets/  (其中 assets/ 含 JS/CSS bundle)

echo "✅ 前端构建完成，产物位于 /var/www/crypto_alpha_radar/frontend/dist/"
```

> [!NOTE]
> Nginx 将直接从 `frontend/dist/` 目录提供静态文件，无需再复制到其他地方。

---

## 6. Nginx 配置

```bash
# 创建站点配置文件
sudo tee /etc/nginx/sites-available/crypto_radar > /dev/null << 'EOF'
server {
    listen 80;
    server_name 你的服务器IP;
    # 如有域名，改为: server_name your-domain.com www.your-domain.com;

    # ── 前端静态文件 ────────────────────────────────────────────
    root /var/www/crypto_alpha_radar/frontend/dist;
    index index.html;

    # React SPA：所有路由回退到 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ── 后端 API 反向代理 ───────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }

    # 日志
    access_log /var/log/nginx/crypto_radar_access.log;
    error_log  /var/log/nginx/crypto_radar_error.log warn;
}
EOF

# 启用站点
sudo ln -sf /etc/nginx/sites-available/crypto_radar /etc/nginx/sites-enabled/

# 禁用默认站点（避免端口冲突）
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置语法
sudo nginx -t
# 应看到: configuration file ... syntax is ok

# 重载 Nginx
sudo systemctl reload nginx

# 设置开机自启
sudo systemctl enable nginx

echo "✅ Nginx 配置完成"
```

---

## 7. PM2 进程管理

### 创建 PM2 ecosystem 配置

```bash
cat > /var/www/crypto_alpha_radar/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      // Express API Server（前端数据来源）
      name: 'radar-api',
      script: 'dist/server.js',
      cwd: '/var/www/crypto_alpha_radar',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/var/log/pm2/radar-api-out.log',
      error_file: '/var/log/pm2/radar-api-err.log',
    },
    {
      // Telegram Bot + Cron 定时扫描（每天 16:00 北京时间）
      name: 'radar-bot',
      script: 'dist/main.js',
      cwd: '/var/www/crypto_alpha_radar',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/var/log/pm2/radar-bot-out.log',
      error_file: '/var/log/pm2/radar-bot-err.log',
    },
  ],
};
EOF

# 创建日志目录
sudo mkdir -p /var/log/pm2
sudo chown $USER:$USER /var/log/pm2
```

### 启动所有服务

```bash
cd /var/www/crypto_alpha_radar

# 启动
pm2 start ecosystem.config.js

# 查看状态（两个进程都应是 online）
pm2 status

# 查看实时日志
pm2 logs --lines 30

# 保存进程列表（服务器重启后自动恢复）
pm2 save

# 生成并执行开机自启脚本
pm2 startup
# 复制输出的那行 sudo env PATH=... 命令并执行
```

---

## 8. HTTPS 证书（可选）

> 需要有指向服务器的域名，才能申请免费 SSL 证书。

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（替换域名）
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 测试自动续期
sudo certbot renew --dry-run

# 证书每 90 天自动续期，无需手动干预
echo "✅ HTTPS 配置完成"
```

---

## 9. 日常运维命令

```bash
# ── 查看状态 ──────────────────────────────────────────────────────────
pm2 status                         # 进程状态一览表
pm2 monit                          # 实时监控面板（CPU / 内存 / 日志）

# ── 查看日志 ──────────────────────────────────────────────────────────
pm2 logs                           # 所有进程实时日志
pm2 logs radar-bot --lines 50      # Bot + Cron 最近 50 行
pm2 logs radar-api --lines 50      # API 最近 50 行

# ── 重启 ──────────────────────────────────────────────────────────────
pm2 restart radar-api              # 重启 API 服务器
pm2 restart radar-bot              # 重启 Bot + 调度器
pm2 restart all                    # 重启所有进程

# ── 手动触发扫描 ──────────────────────────────────────────────────────
cd /var/www/crypto_alpha_radar
node dist/index.js                 # 立即全链扫描并推送 Telegram

# ── SQLite 数据库查看 ─────────────────────────────────────────────────
sqlite3 /var/www/crypto_alpha_radar/radar.db << 'SQL'
.headers on
.mode column
SELECT id, type, token, score_initial, timestamp FROM signal_table ORDER BY id DESC LIMIT 10;
.quit
SQL

# ── API 健康检查 ──────────────────────────────────────────────────────
curl -s http://localhost:3001/api/signals | python3 -m json.tool | head -30

# ── Nginx 操作 ────────────────────────────────────────────────────────
sudo nginx -t                      # 检查配置语法
sudo systemctl reload nginx        # 热重载配置（不中断连接）
sudo systemctl restart nginx       # 完全重启
sudo tail -100f /var/log/nginx/crypto_radar_error.log  # 错误日志

# ── 数据库备份 ────────────────────────────────────────────────────────
cp /var/www/crypto_alpha_radar/radar.db \
   /var/www/crypto_alpha_radar/radar.db.bak.$(date +%Y%m%d)
```

---

## 10. 更新部署流程

每次代码更新后，在服务器执行：

```bash
cd /var/www/crypto_alpha_radar

# 1. 拉取最新代码
git pull origin main

# 2. 安装新增依赖（如有）
npm install

# 3. 重新编译 TypeScript
npx tsc

# 4. 重启后端进程（零停机热重启）
pm2 restart all

# 5. 如果前端代码有更新
cd frontend && npm install && npm run build && cd ..

# 6. 验证一切正常
pm2 status
curl -s http://localhost:3001/api/signals | python3 -m json.tool | head -10
echo "✅ 更新完成"
```

---

## 部署验证清单

```bash
# 一键验证所有服务
echo "=== PM2 进程状态 ===" && pm2 status
echo ""
echo "=== API 健康检查 ===" && curl -s http://localhost:3001/api/signals | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'✅ API 正常，共 {len(d)} 条信号')"
echo ""
echo "=== Nginx 状态 ===" && sudo systemctl is-active nginx
echo ""
echo "=== 数据库记录 ===" && sqlite3 /var/www/crypto_alpha_radar/radar.db "SELECT COUNT(*) || ' 条信号' FROM signal_table;"
echo ""
echo "=== 前端文件 ===" && ls /var/www/crypto_alpha_radar/frontend/dist/index.html && echo "✅ 前端已构建"
```

访问 `http://你的服务器IP` 即可看到前端页面 🚀

---

> [!CAUTION]
> **安全提醒**
> - `.env` 含 API Key 和 Bot Token，**绝对不要提交到 Git**
> - 在 `.gitignore` 中确认 `.env` 已被排除
> - 建议服务器防火墙只开放 22、80、443 端口

> [!TIP]
> **长期运维提示**
> - SQLite 适合单机部署；数据量大时可迁移 PostgreSQL
> - `radar-bot` 已包含每日扫描，不需要再单独运行 `radar-scheduler`
> - PM2 的 `max_memory_restart` 设为 512M，防止内存泄漏导致进程挂死
