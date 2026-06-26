/**
 * Crypto Alpha Radar — 一键启动入口 (Bot + Cron)
 *
 * 使用原生 fetch 实现 Telegram Long Polling，无需第三方 SDK。
 *
 * 命令:
 *   /scan    — 立即触发全链扫描
 *   /top     — 查看上次 Top5 信号
 *   /status  — 系统状态
 *   /help    — 帮助信息
 */

import * as dotenv from 'dotenv';
dotenv.config();

import cron from 'node-cron';
import db, { initDB } from './db';
import { runDailyScan } from './index';
import { runWhaleScan } from './jobs/whaleJob';
import { sendTestMessage } from './services/notifier';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID!;

if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
    process.exit(1);
}

initDB();

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║   🚀 Crypto Alpha Radar — Bot + Scheduler (All-in-One)  ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

// ── Telegram API helpers ──────────────────────────────────────────────────────
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tgPost(method: string, body: object): Promise<any> {
    const res = await fetch(`${TG}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function sendMsg(chatId: number | string, text: string) {
    await tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

// ── State ─────────────────────────────────────────────────────────────────────
let isScanning  = false;
let offset      = 0;
let running     = true;

// ── Command handlers ──────────────────────────────────────────────────────────
async function handleHelp(chatId: number) {
    await sendMsg(chatId, `
🤖 <b>Crypto Alpha Radar Bot 命令列表</b>

/scan — 🔍 立即触发全链扫描（需 1-2 分钟）
/top  — 💎 查看上次扫描的 Top 5 信号（即时）
/status — 📡 系统状态和下次扫描时间
/help — 📖 显示此帮助信息

<i>每天 16:00 北京时间自动推送日报 📬</i>
    `.trim());
}

async function handleStatus(chatId: number) {
    const total      = (db.prepare('SELECT COUNT(*) as n FROM signal_table').get() as any).n;
    const today      = (db.prepare("SELECT COUNT(*) as n FROM signal_table WHERE date(timestamp) = date('now')").get() as any).n;
    const lastSignal = db.prepare('SELECT token, score_initial, timestamp FROM signal_table ORDER BY id DESC LIMIT 1').get() as any;

    const now = new Date();
    const nextScan = new Date();
    nextScan.setUTCHours(8, 0, 0, 0);
    if (nextScan <= now) nextScan.setUTCDate(nextScan.getUTCDate() + 1);
    const hoursLeft = Math.floor((nextScan.getTime() - now.getTime()) / 3600000);
    const minsLeft  = Math.floor(((nextScan.getTime() - now.getTime()) % 3600000) / 60000);

    await sendMsg(chatId, `
📡 <b>Crypto Alpha Radar — 系统状态</b>

✅ Bot 运行中  |  ⏰ Cron 定时任务运行中
🗄️ 历史信号总数: <b>${total}</b> 条
📅 今日新信号: <b>${today}</b> 条
🏆 最新信号: <b>${lastSignal?.token ?? '无'}</b>  Score: ${lastSignal?.score_initial?.toFixed(1) ?? '-'}
   <code>${lastSignal?.timestamp ?? '-'}</code>

⏰ 下次自动扫描: <b>北京时间 16:00</b>
   (约 ${hoursLeft}h ${minsLeft}m 后)

🔗 监控链: 🔷 ETH Mainnet + 🔵 Base Chain
🎯 监控代币: 15 个 (ETH ×10 + Base ×5)
    `.trim());
}

async function handleTop(chatId: number) {
    const signals = db.prepare(`
        SELECT token, type, description, score_initial, timestamp
        FROM signal_table ORDER BY id DESC LIMIT 10
    `).all() as any[];

    if (signals.length === 0) {
        await sendMsg(chatId, '⚠️ 数据库中还没有信号，请先运行 /scan');
        return;
    }

    const bullish = signals.filter(s => s.type === 'bullish').slice(0, 5);
    const bearish = signals.filter(s => s.type === 'bearish').slice(0, 3);
    const medals  = ['🥇','🥈','🥉','4️⃣','5️⃣'];

    const bullishText = bullish.map((s, i) =>
        `${medals[i]} <b>${s.token}</b>  Score: <b>${s.score_initial.toFixed(1)}</b>/100\n   <code>${s.description}</code>`
    ).join('\n\n');

    const bearishText = bearish.length > 0
        ? bearish.map((s: any) => `🔴 <b>${s.token}</b>  Risk: <b>${s.score_initial.toFixed(0)}</b>/100\n   <code>${s.description}</code>`).join('\n\n')
        : '   暂无风险警报';

    await sendMsg(chatId, `
💎 <b>最新 Top 5 Alpha 机会</b>
📅 <code>${signals[0]?.timestamp ?? '-'}</code>

${bullishText}

━━━━━━━━━━━━━━━━
🚨 <b>风险警报</b>
${bearishText}

<i>发 /scan 触发新一轮实时扫描</i>
    `.trim());
}

async function handleScan(chatId: number) {
    if (isScanning) {
        await sendMsg(chatId, '⏳ 扫描正在进行中，请稍候...');
        return;
    }
    isScanning = true;
    await sendMsg(chatId, `
🔍 <b>开始全链扫描...</b>
正在扫描 15 个代币 (🔷 ETH ×10 + 🔵 Base ×5)
预计 1-2 分钟，完成后自动推送结果 📊
    `.trim());

    try {
        await runDailyScan();
    } catch (err: any) {
        console.error('[Bot] /scan failed:', err.message);
        await sendMsg(chatId, `❌ 扫描出错: <code>${err.message}</code>`);
    } finally {
        isScanning = false;
    }
}

// ── Long Polling loop ─────────────────────────────────────────────────────────
async function pollUpdates() {
    console.log('✅ Long polling started...');
    while (running) {
        try {
            const data = await tgPost('getUpdates', {
                offset,
                timeout: 30,
                allowed_updates: ['message'],
            }) as any;

            if (!data.ok || !data.result?.length) continue;

            for (const update of data.result) {
                offset = update.update_id + 1;

                const msg = update.message;
                if (!msg?.text) continue;

                const chatId  = msg.chat.id;
                // Strip bot mention suffix (e.g. /scan@MyBot → /scan)
                const text    = msg.text.replace(/@\w+/, '').trim().toLowerCase();

                console.log(`[Bot] ${msg.chat.type} | ${msg.from?.username ?? '?'}: ${msg.text}`);

                if (text === '/help')   await handleHelp(chatId);
                else if (text === '/status') await handleStatus(chatId);
                else if (text === '/top')    await handleTop(chatId);
                else if (text === '/scan')   await handleScan(chatId);
            }
        } catch (err: any) {
            if (running) {
                console.error('[Bot] Polling error:', err.message, '— retrying in 5s');
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
}

// ── Cron: 08:00 UTC = 16:00 Beijing ──────────────────────────────────────────
cron.schedule('0 8 * * *', async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Cron triggered — Starting daily scan...`);
    if (isScanning) { console.log('   Already scanning, skipping.'); return; }
    isScanning = true;
    try {
        await runDailyScan();
        console.log(`✅ Cron scan completed.\n`);
    } catch (err: any) {
        console.error(`❌ Cron scan failed: ${err.message}\n`);
    } finally {
        isScanning = false;
    }
}, { timezone: 'UTC' });

// ── Cron: Whale scan every 30 minutes ────────────────────────────────────────
cron.schedule('*/30 * * * *', async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Cron triggered — Starting whale scan...`);
    try {
        await runWhaleScan();
        console.log(`✅ [${new Date().toISOString()}] Whale scan completed.\n`);
    } catch (err: any) {
        console.error(`❌ [${new Date().toISOString()}] Whale scan FAILED: ${err.message}\n`);
    }
}, { timezone: 'UTC' });

// ── Startup ───────────────────────────────────────────────────────────────────
sendTestMessage().then(() => {
    console.log('✅ Startup notification sent to group.');
}).catch(e => console.warn('⚠️  Could not send startup notification:', e.message));

console.log('✅ Cron scheduler active:');
console.log('   • Daily scan  — 08:00 UTC (16:00 Beijing)');
console.log('   • Whale scan  — Every 30 minutes');
console.log('   Commands: /scan  /top  /status  /help');
console.log('   Press Ctrl+C to stop.\n');

// Start polling in background (non-blocking)
pollUpdates();

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal: string) {
    console.log(`\n👋 Received ${signal}, shutting down...`);
    running = false;
    process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
