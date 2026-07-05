# Bunny & Elliott

AI 恋人聊天应用。清冷黑白极简风 · 零成本云部署。

## 技术栈

| 层 | 技术 | 部署 |
|---|------|------|
| 前端 | React + Vite (PWA) | Vercel |
| 后端 | Node.js + Express | Render |
| 数据库 | PostgreSQL | Supabase |
| AI | Claude / DeepSeek | API |

## 本地开发

```bash
# 后端
cd server
cp .env.example .env   # 编辑 .env 填入 API Key
npm install
npm run dev

# 前端（新终端）
cd client
npm install
npm run dev
```

访问 http://localhost:5173

## 环境变量 (server/.env)

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
ANTHROPIC_API_KEY=sk-ant-xxx
DEEPSEEK_API_KEY=sk-xxx
PORT=3000
```

## 数据库

在 Supabase SQL Editor 中运行 `database/init.sql`

## 部署

1. 推送代码到 GitHub
2. Vercel → 连接仓库 → 部署 client 目录 (Vite)
3. Render → 连接仓库 → 部署 server 目录 (Node.js)
4. Supabase → 创建项目 → 运行 init.sql
5. Render 设置环境变量 → 填入 Supabase 和 API Key
6. UptimeRobot 监控 Render URL（防休眠）

## 功能

- 💬 实时 AI 聊天 (SSE 流式)
- 🧠 Extended Thinking 深度思考
- 📝 记忆系统（自动压缩）
- 🔄 多模型切换 (Claude / DeepSeek)
- ⚙️ 可调参数 (temperature, context 等)
- 📱 PWA 可安装到手机桌面
- 🌙 清冷黑白极简 UI
