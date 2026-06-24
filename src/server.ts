import express from 'express';
import cors from 'cors';
import path from 'path';
import db, { initDB } from './db';

// Initialize the database and ensure tables exist
initDB();

const app = express();
app.use(cors());
app.use(express.json());

// Port: 默认 80（服务器直接对外），本地开发用 3001
const PORT = parseInt(process.env.PORT || '8000', 10);

// ── 前端静态文件托管 ─────────────────────────────────────────────────────────
// Express 直接托管 Vite 构建产物，无需 Nginx
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(FRONTEND_DIST));

// ── API 路由 ─────────────────────────────────────────────────────────────────

// 获取所有信号
app.get('/api/signals', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM signal_table ORDER BY timestamp DESC LIMIT 50');
        const signals = stmt.all();
        res.json(signals);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch signals' });
    }
});

// 获取回测结果
app.get('/api/outcomes', (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT o.*, s.token, s.address 
            FROM outcome_table o
            JOIN signal_table s ON o.signal_id = s.id
            ORDER BY o.timestamp DESC LIMIT 50
        `);
        const outcomes = stmt.all();
        res.json(outcomes);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch outcomes' });
    }
});

// 获取权重配置
app.get('/api/weights', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM weights_table');
        const weights = stmt.all();
        res.json(weights);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch weights' });
    }
});

// ── React SPA 回退路由 ───────────────────────────────────────────────────────
// 所有非 /api 路由都返回 index.html，由 React Router 处理
app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

// ── 启动 ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Crypto Alpha Radar`);
    console.log(`   前端页面: http://0.0.0.0:${PORT}`);
    console.log(`   API 接口: http://0.0.0.0:${PORT}/api/signals`);
});
