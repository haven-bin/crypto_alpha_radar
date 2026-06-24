import * as dotenv from 'dotenv';
dotenv.config();

import { SignalReport } from '../types';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID!;

if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[Notifier] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — notifications disabled.');
}

async function sendTelegramMessage(text: string): Promise<boolean> {
    if (!BOT_TOKEN || !CHAT_ID) return false;

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id:    CHAT_ID,
                text,
                parse_mode: 'HTML',
            }),
        });
        const data = await res.json() as { ok: boolean; description?: string };
        if (!data.ok) {
            console.error('[Notifier] Telegram API error:', data.description);
            return false;
        }
        console.log('[Notifier] ✅ Telegram message sent.');
        return true;
    } catch (err: any) {
        console.error('[Notifier] Network error:', err.message);
        return false;
    }
}

/** Format and send the daily scan report */
export async function sendDailyReport(report: SignalReport): Promise<void> {
    const dateStr = new Date(report.timestamp).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
    });

    const chainBadge = (chain: string) => chain === 'base' ? '🔵 Base' : '🔷 ETH';

    // ── Bullish block ──────────────────────────────────────────────────────────
    const bullishLines = report.bullish.length > 0
        ? report.bullish.map((s, i) => {
            const medal = ['🥇','🥈','🥉','4️⃣','5️⃣'][i] ?? `#${i + 1}`;
            return `${medal} <b>${s.symbol}</b> ${chainBadge(s.chain)}  Score: <b>${s.score.toFixed(1)}</b>/100\n   <code>${s.description}</code>`;
          }).join('\n\n')
        : '   暂无看涨信号';

    // ── Bearish block ──────────────────────────────────────────────────────────
    const bearishLines = report.bearish.length > 0
        ? report.bearish.map(r => {
            const level = r.riskScore >= 80 ? '🔴 极高风险'
                        : r.riskScore >= 60 ? '🟠 高风险'
                        : '🟡 中等风险';
            return `${level} <b>${r.symbol}</b> ${chainBadge(r.chain)}  Risk: <b>${r.riskScore.toFixed(0)}</b>/100\n   ${r.signals.join('\n   ')}`;
          }).join('\n\n')
        : '   暂无风险警报';

    const message = `
🚀 <b>Crypto Alpha Radar 日报</b>
📅 ${dateStr} (北京时间)
━━━━━━━━━━━━━━━━━━━━

💎 <b>今日看涨 TOP ${report.bullish.length}</b>
${bullishLines}

━━━━━━━━━━━━━━━━━━━━
🚨 <b>今日风险警报 (${report.bearish.length}个)</b>
${bearishLines}

━━━━━━━━━━━━━━━━━━━━
<i>由 Crypto Alpha Radar 自动生成 | 仅供参考，不构成投资建议</i>
`.trim();

    await sendTelegramMessage(message);
}

/** Quick test: sends a hello message to verify setup */
export async function sendTestMessage(): Promise<void> {
    await sendTelegramMessage(`
🤖 <b>Crypto Alpha Radar Bot 启动成功！</b>

✅ Telegram 推送已连接
🕐 每天 08:00 UTC (北京时间 16:00) 自动推送日报
🔴 风险发现引擎已激活

系统正常运行中 🚀
    `.trim());
}
