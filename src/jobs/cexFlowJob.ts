import * as dotenv from 'dotenv';
dotenv.config();

import { fetchTokenTransfers } from '../data/etherscan';
import { ALL_CEX_ADDRESSES, ADDRESS_TO_CEX } from '../data/cexAddresses';
import { TOKENS_TO_SCAN } from '../tokens';
import db, { initDB } from '../db';

initDB();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID!;

// 触发 Telegram 警报的净流量阈值（USD 等值的代币数量，用 token 数量近似）
// 实际项目可接入价格 API 换算精确 USD；此处用代币数量和 threshold 比例近似
const CEX_ALERT_THRESHOLD_USD = 1_000_000; // $100 万

// 持久化 CEX 流向记录
const upsertFlow = db.prepare(`
    INSERT INTO cex_flows (token, period_start, inflow, outflow, net_flow, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(token, period_start) DO UPDATE SET
        inflow     = excluded.inflow,
        outflow    = excluded.outflow,
        net_flow   = excluded.net_flow,
        updated_at = CURRENT_TIMESTAMP
`);

async function sendTelegramMessage(text: string): Promise<void> {
    if (!BOT_TOKEN || !CHAT_ID) return;
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
        });
    } catch { /* ignore */ }
}

function formatAmount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
    return n.toFixed(2);
}

export async function runCexFlowScan(): Promise<void> {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const cutoff24h = Math.floor(Date.now() / 1000) - 24 * 3600;
    const periodStart = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`\n🏦 [${now}] 开始 CEX 资金流向扫描 (24h 净流量)`);

    const alerts: string[] = [];

    for (const token of TOKENS_TO_SCAN) {
        // 跳过稳定币（USDC/USDT 本身大量在交易所，意义不同）
        if (['USDC', 'USDT'].includes(token.symbol)) continue;

        try {
            const transfers = await fetchTokenTransfers(token.address, 1000, token.chain);
            const recent = transfers.filter(tx => parseInt(tx.timeStamp) >= cutoff24h);

            let inflow  = 0; // 代币流入交易所（看跌）
            let outflow = 0; // 代币从交易所流出（看涨）

            for (const tx of recent) {
                const decimals = parseInt(tx.tokenDecimal) || 18;
                let amount: number;
                try {
                    const big = BigInt(tx.value);
                    const shift = BigInt(10) ** BigInt(decimals);
                    amount = Number(big / shift) + Number(big % shift) / Number(shift);
                } catch {
                    amount = parseFloat(tx.value) / Math.pow(10, decimals);
                }

                const toIsCex   = ALL_CEX_ADDRESSES.has(tx.to.toLowerCase());
                const fromIsCex = ALL_CEX_ADDRESSES.has(tx.from.toLowerCase());

                if (toIsCex   && !fromIsCex) inflow  += amount;  // 流入 CEX
                if (fromIsCex && !toIsCex)   outflow += amount;  // 流出 CEX
            }

            const netFlow = outflow - inflow; // 正值=净流出(看涨)，负值=净流入(看跌)

            // 持久化到 DB（保留历史趋势）
            upsertFlow.run(token.symbol, periodStart, inflow, outflow, netFlow);

            // 用 whaleThreshold 近似换算：netFlow / threshold 相当于 USD 比例
            const threshold = token.whaleThreshold ?? 10_000;
            const approxUsd = Math.abs(netFlow / threshold) * CEX_ALERT_THRESHOLD_USD;

            if (approxUsd >= CEX_ALERT_THRESHOLD_USD) {
                const chainLabel = token.chain === 'base' ? '🔵Base' : '🔷ETH';
                if (netFlow > 0) {
                    // 净流出 → 看涨
                    alerts.push(
                        `🟢 <b>${token.symbol}</b> ${chainLabel}  <b>净流出 CEX</b>\n` +
                        `   24h 流出: <b>${formatAmount(outflow)}</b> | 流入: ${formatAmount(inflow)}\n` +
                        `   净流出: <b>+${formatAmount(netFlow)} ${token.symbol}</b>\n` +
                        `   📊 信号: 大户提现持有，看涨 ↑`
                    );
                } else {
                    // 净流入 → 看跌
                    alerts.push(
                        `🔴 <b>${token.symbol}</b> ${chainLabel}  <b>净流入 CEX</b>\n` +
                        `   24h 流入: <b>${formatAmount(inflow)}</b> | 流出: ${formatAmount(outflow)}\n` +
                        `   净流入: <b>${formatAmount(Math.abs(netFlow))} ${token.symbol}</b>\n` +
                        `   📊 信号: 大户充值准备抛售，看跌 ↓`
                    );
                }
            }

            const netStr = netFlow >= 0 ? `+${formatAmount(netFlow)}` : formatAmount(netFlow);
            console.log(`  📊 ${token.symbol}: 流入=${formatAmount(inflow)}, 流出=${formatAmount(outflow)}, 净=${netStr}`);
        } catch (err: any) {
            console.warn(`  ⚠️  ${token.symbol} CEX 扫描失败: ${err.message}`);
        }
    }

    // 推送 Telegram
    if (alerts.length > 0) {
        const header =
            `🏦 <b>交易所资金流向预警</b>\n` +
            `📅 ${now} (北京时间)\n` +
            `📏 统计周期: 过去 24 小时\n` +
            `${'━'.repeat(20)}\n\n`;
        const footer = `\n${'━'.repeat(20)}\n<i>净流出=看涨信号 | 净流入=看跌信号 | 仅供参考</i>`;

        // 分批发送，每批 8 条
        const batchSize = 8;
        for (let i = 0; i < alerts.length; i += batchSize) {
            const batch = alerts.slice(i, i + batchSize);
            const batchLabel = alerts.length > batchSize ? ` (${Math.floor(i/batchSize)+1}/${Math.ceil(alerts.length/batchSize)})` : '';
            await sendTelegramMessage(header.replace('预警', `预警${batchLabel}`) + batch.join('\n\n') + footer);
            if (i + batchSize < alerts.length) await new Promise(r => setTimeout(r, 500));
        }
        console.log(`🏦 推送 ${alerts.length} 条 CEX 流向预警`);
    } else {
        console.log('🏦 本轮无超阈值 CEX 流向异动');
    }

    console.log(`🏦 CEX 流向扫描完成\n`);
}

if (require.main === module) {
    runCexFlowScan().catch(console.error);
}
