import * as dotenv from 'dotenv';
dotenv.config();

import { scanHlWhales, HlWhaleSummary, HlPosition } from '../data/hyperliquid';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID!;

async function sendTelegramMessage(text: string): Promise<void> {
    if (!BOT_TOKEN || !CHAT_ID) return;
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
        });
        console.log('[HyperliquidJob] ✅ Telegram 推送成功');
    } catch (err: any) {
        console.error('[HyperliquidJob] 推送失败:', err.message);
    }
}

function formatPosition(pos: HlPosition): string {
    const sideEmoji = pos.side === 'long' ? '📈 多单' : '📉 空单';
    const pnlEmoji  = pos.pnlUsd >= 0 ? '💚' : '🔴';
    const riskLevel = pos.distanceToLiqPct < 3  ? '🔴 极危险'
                    : pos.distanceToLiqPct < 5  ? '🟠 危险'
                    : '🟡 警戒';

    return (
        `   ${sideEmoji} <b>${pos.coin}</b>  仓位: $${Math.round(pos.sizeUsd).toLocaleString()}  杠杆: ${pos.leverage.toFixed(0)}x\n` +
        `   入场价: $${pos.entryPrice.toFixed(4)}  |  清算价: $${pos.liquidationPrice.toFixed(4)}\n` +
        `   距清算: <b>${pos.distanceToLiqPct.toFixed(1)}%</b>  ${riskLevel}\n` +
        `   浮盈亏: ${pnlEmoji} $${Math.round(pos.pnlUsd).toLocaleString()}`
    );
}

export async function runHyperliquidScan(): Promise<void> {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    console.log(`\n⚡ [${now}] 开始 Hyperliquid 鲸鱼仓位扫描`);

    let summaries: HlWhaleSummary[] = [];
    try {
        summaries = await scanHlWhales();
    } catch (err: any) {
        console.warn(`⚡ Hyperliquid 扫描失败: ${err.message}`);
        return;
    }

    const atRiskWhales = summaries.filter(s => s.atRiskPositions.length > 0);

    if (atRiskWhales.length === 0) {
        console.log('⚡ 本轮无危险仓位（距清算 > 8%）');
        console.log('⚡ Hyperliquid 扫描完成\n');
        return;
    }

    // 构建告警消息
    const lines: string[] = [];
    for (const whale of atRiskWhales) {
        const shortAddr = `${whale.address.slice(0, 6)}...${whale.address.slice(-4)}`;
        lines.push(`⚡ <b>${whale.label}</b>  (<code>${shortAddr}</code>)`);
        for (const pos of whale.atRiskPositions) {
            lines.push(formatPosition(pos));
        }
    }

    const header =
        `⚡ <b>Hyperliquid 鲸鱼清算风险预警</b>\n` +
        `📅 ${now} (北京时间)\n` +
        `${'━'.repeat(20)}\n\n` +
        `⚠️ 以下大仓位距清算价 &lt;8%，可能引发连锁清算：\n\n`;
    const footer =
        `\n${'━'.repeat(20)}\n` +
        `💡 价格触及清算线 → 可能引发连锁爆仓，是可交易的短期信号\n` +
        `<i>仅供参考，不构成投资建议</i>`;

    await sendTelegramMessage(header + lines.join('\n') + footer);
    console.log(`⚡ 推送 ${atRiskWhales.length} 个大户仓位预警`);
    console.log('⚡ Hyperliquid 扫描完成\n');
}

if (require.main === module) {
    runHyperliquidScan().catch(console.error);
}
