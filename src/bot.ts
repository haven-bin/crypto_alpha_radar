/**
 * Crypto Alpha Radar — Telegram Bot Command Handler
 *
 * Supported commands:
 *   /scan    — Trigger an immediate full multi-chain scan and post results
 *   /top     — Show top 5 from the last scan (from DB, instant)
 *   /status  — Show system status and next scheduled scan time
 *   /help    — List all available commands
 */

import * as dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import db, { initDB } from './db';
import { runDailyScan } from './index';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID!;

if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
    process.exit(1);
}

initDB();

// Create bot in polling mode
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('');
console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║   🤖 Crypto Alpha Radar Bot — Command Mode Active     ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log('');
console.log('Listening for commands: /scan /top /status /help');
console.log('');

// ── Prevent concurrent scans ──────────────────────────────────────────────────
let isScanning = false;

// ── Helper: send message to the configured group/chat ────────────────────────
async function reply(chatId: number | string, text: string) {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

// ─────────────────────────────────────────────────────────────────────────────
// /help
// ─────────────────────────────────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await reply(chatId, `
🤖 <b>Crypto Alpha Radar Bot 命令列表</b>

/scan — 🔍 立即触发全链扫描（需 1-2 分钟）
/top  — 💎 查看上次扫描的 Top 5 信号（即时）
/status — 📡 查看系统状态和下次扫描时间
/help — 📖 显示此帮助信息

<i>每天 16:00 北京时间自动推送日报</i>
    `.trim());
});

// ─────────────────────────────────────────────────────────────────────────────
// /status
// ─────────────────────────────────────────────────────────────────────────────
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;

    // Count signals in DB
    const total  = (db.prepare('SELECT COUNT(*) as n FROM signal_table').get() as any).n;
    const today  = (db.prepare("SELECT COUNT(*) as n FROM signal_table WHERE date(timestamp) = date('now')").get() as any).n;
    const lastSignal = db.prepare("SELECT token, score_initial, timestamp FROM signal_table ORDER BY id DESC LIMIT 1").get() as any;

    // Next 08:00 UTC
    const now = new Date();
    const nextScan = new Date();
    nextScan.setUTCHours(8, 0, 0, 0);
    if (nextScan <= now) nextScan.setUTCDate(nextScan.getUTCDate() + 1);
    const hoursLeft = Math.round((nextScan.getTime() - now.getTime()) / 3600000);
    const minsLeft  = Math.round(((nextScan.getTime() - now.getTime()) % 3600000) / 60000);

    await reply(chatId, `
📡 <b>Crypto Alpha Radar — 系统状态</b>

✅ Bot 运行中
🗄️ 数据库信号总数: <b>${total}</b> 条
📅 今日新信号: <b>${today}</b> 条
🏆 最新信号: <b>${lastSignal?.token ?? '无'}</b> (Score: ${lastSignal?.score_initial?.toFixed(1) ?? '-'})
   <code>${lastSignal?.timestamp ?? '-'}</code>

⏰ 下次自动扫描: <b>今天/明天 16:00 北京时间</b>
   (约 ${hoursLeft}h ${minsLeft}m 后)

🔗 覆盖链: 🔷 ETH Mainnet + 🔵 Base Chain
🎯 监控代币: 15 个
    `.trim());
});

// ─────────────────────────────────────────────────────────────────────────────
// /top
// ─────────────────────────────────────────────────────────────────────────────
bot.onText(/\/top/, async (msg) => {
    const chatId = msg.chat.id;

    const signals = db.prepare(`
        SELECT token, type, description, score_initial, timestamp
        FROM signal_table
        ORDER BY id DESC
        LIMIT 10
    `).all() as any[];

    if (signals.length === 0) {
        await reply(chatId, '⚠️ 数据库中还没有信号，请先运行 /scan');
        return;
    }

    const bullish = signals.filter(s => s.type === 'bullish').slice(0, 5);
    const bearish = signals.filter(s => s.type === 'bearish').slice(0, 3);

    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];

    const bullishText = bullish.map((s, i) =>
        `${medals[i]} <b>${s.token}</b>  Score: <b>${s.score_initial.toFixed(1)}</b>/100\n   <code>${s.description}</code>`
    ).join('\n\n');

    const bearishText = bearish.length > 0
        ? bearish.map(s =>
            `🔴 <b>${s.token}</b>  Risk: <b>${s.score_initial.toFixed(0)}</b>/100\n   <code>${s.description}</code>`
          ).join('\n\n')
        : '   暂无风险警报';

    const scanTime = signals[0]?.timestamp ?? '-';

    await reply(chatId, `
💎 <b>最新扫描 Top 5 机会</b>
📅 <code>${scanTime}</code>

${bullishText}

━━━━━━━━━━━━━━━━━━
🚨 <b>风险警报</b>
${bearishText}

<i>发送 /scan 触发新一轮扫描</i>
    `.trim());
});

// ─────────────────────────────────────────────────────────────────────────────
// /scan  — triggers a full scan (takes 1-2 min)
// ─────────────────────────────────────────────────────────────────────────────
bot.onText(/\/scan/, async (msg) => {
    const chatId = msg.chat.id;

    if (isScanning) {
        await reply(chatId, '⏳ 扫描正在进行中，请稍候...');
        return;
    }

    isScanning = true;
    await reply(chatId, `
🔍 <b>开始全链扫描...</b>

正在扫描 15 个代币 (🔷 ETH × 10 + 🔵 Base × 5)
预计需要 1-2 分钟，完成后自动推送结果 📊
    `.trim());

    try {
        await runDailyScan();
        // runDailyScan already calls sendDailyReport → pushes to group
        console.log(`[Bot] /scan completed, results pushed to chat ${chatId}`);
    } catch (err: any) {
        console.error('[Bot] /scan failed:', err.message);
        await reply(chatId, `❌ 扫描出错: <code>${err.message}</code>`);
    } finally {
        isScanning = false;
    }
});

// ── Handle unknown commands ───────────────────────────────────────────────────
bot.on('polling_error', (err) => {
    console.error('[Bot] Polling error:', err.message);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
    console.log('\n👋 Bot shutting down...');
    await bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 Bot received SIGTERM...');
    await bot.stopPolling();
    process.exit(0);
});

console.log('✅ Bot is polling for commands. Send /help in the group to test.\n');
