import * as dotenv from 'dotenv';
dotenv.config();

import db, { initDB } from '../db';
import { fetchTokenTransfers } from '../data/etherscan';
import { getPriceContext } from '../data/priceContext';
import { fetchTokenPairs, getBestPair } from '../data/dexscreener';
import { filterWhaleTransfer, clearWalletCache, formatFilterStats } from '../signals/whaleFilter';
import { TOKENS_TO_SCAN } from '../tokens';

initDB();

// INSERT OR IGNORE 防重复
const insertWhale = db.prepare(`
    INSERT OR IGNORE INTO whale_events (tx_hash, token, address, amount, side, price_signal, price_change24h)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID!;

const MAX_ALERTS_PER_MSG   = 10;
const SCAN_WINDOW_MINUTES  = 35;

// 是否启用钱包质量验证（会增加 Etherscan 请求量，建议仅在高价值鲸鱼时开启）
// 设为 false = 只过滤金额，不验证钱包历史
const CHECK_WALLET_QUALITY = false;

// Known DEX router addresses（用于判断买卖方向）
const DEX_ADDRS = new Set([
    // ── Uniswap ──────────────────────────────────────────────
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',  // Uniswap V2 Router
    '0xe592427a0aece92de3edee1f18e0157c05861564',  // Uniswap V3 Router
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',  // Uniswap V3 Router 2
    '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',  // Uniswap Universal Router
    '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',  // Uniswap Universal Router 2
    '0x0000000000007F150Bd6f54c40A34d7C3d5e9f56',  // Uniswap Permit2
    // ── SushiSwap ────────────────────────────────────────────
    '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',  // SushiSwap Router
    '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',  // SushiSwap Router (old)
    // ── 1inch ────────────────────────────────────────────────
    '0x1111111254EEB25477B68fb85Ed929f73A960582',  // 1inch V5
    '0x1111111254fb6c44bAC0beD2854e76F90643097d',  // 1inch V4
    '0x11111112542D85B3EF69AE05771c2dCCff34f26a',  // 1inch V3
    // ── Curve ────────────────────────────────────────────────
    '0x99a58482BD75cbab83b27EC03CA68Ff489b5788f',  // Curve Router
    '0x4c2Ae482cEfaD6e382bA5F3E5C0cE0fE7B3C7c5D',  // Curve Router V2
    // ── Balancer ─────────────────────────────────────────────
    '0xBA12222222228d8Ba445958a75a0704d566BF2C8',  // Balancer Vault
    // ── Matcha / 0x ──────────────────────────────────────────
    '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',  // 0x Exchange Proxy
    '0xDef4C0ded9bec7F1a1670819833240f027b25Eff',  // 0x Exchange Proxy (old)
    // ── ParaSwap ─────────────────────────────────────────────
    '0x216B4B4Ba9F3e719726886d34a177484278Bfcae',  // ParaSwap Augustus V6
    '0x6Cd3C9c1dE6e9E9F1CFf7Ee2b7fAFf8C7b9b9b9b',  // ParaSwap Augustus V5
    // ── Base 链 DEX ──────────────────────────────────────────
    '0x327df1e6de05895d2ab08513aadd9313fe505d86',  // Base Uniswap V3
    '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43',  // Base Uniswap V2
    '0x6BDED42c6DA8FBf0d2bA55B2fa120C87e1d8A8C1',  // Base SushiSwap
    '0x0389879e0156033202c44bf784a27b2c4f8c6b3b',  // Base Aerodrome
    '0xcF77a3bA9A5CA399B7c97c74d54e5b1BeB874e43',  // Base SwapRouter
    // ── 通用 / 聚合器 ─────────────────────────────────────────
    '0x00000000000009726632680FB29f3D8F7f7C0A7',  // Seaport 1.5
    '0x0000000000000aD24e80fd803C6ac37206a45f15',  // Seaport 1.4
    '0x3a23F943181408EAC424116Af7b7790c94Cb97a5',  // MetaMask Swaps
]);

// 小写版 DEX 地址集合（用于快速查找）
const DEX_ADDRS_LOWER = new Set([...DEX_ADDRS].map(a => a.toLowerCase()));

async function sendTelegramMessage(text: string): Promise<void> {
    if (!BOT_TOKEN || !CHAT_ID) return;
    try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
        });
        const data = await res.json() as { ok: boolean; description?: string };
        if (!data.ok) console.error('[WhaleJob] 推送失败:', data.description);
        else          console.log('[WhaleJob] ✅ Telegram 推送成功');
    } catch (err: any) {
        console.error('[WhaleJob] 网络错误:', err.message);
    }
}

async function sendWhaleAlerts(alerts: string[], now: string): Promise<void> {
    const totalBatches = Math.ceil(alerts.length / MAX_ALERTS_PER_MSG);
    for (let i = 0; i < totalBatches; i++) {
        const batch = alerts.slice(i * MAX_ALERTS_PER_MSG, (i + 1) * MAX_ALERTS_PER_MSG);
        const batchLabel = totalBatches > 1 ? ` (${i + 1}/${totalBatches})` : '';
        const header =
            `🐋 <b>鲸鱼异动预警${batchLabel}</b>\n` +
            `📅 ${now} (北京时间)\n` +
            `${'━'.repeat(20)}\n\n`;
        const footer = `\n${'━'.repeat(20)}\n<i>仅供参考，不构成投资建议</i>`;
        await sendTelegramMessage(header + batch.join('\n\n') + footer);
        if (i < totalBatches - 1) await new Promise(r => setTimeout(r, 500));
    }
}

export async function runWhaleScan(): Promise<void> {
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - SCAN_WINDOW_MINUTES * 60;

    console.log(`\n🐋 [${now}] 开始 Whale 监控扫描 (最近 ${SCAN_WINDOW_MINUTES} 分钟)`);

    // 每次扫描前清除钱包缓存
    clearWalletCache();

    const whaleAlerts: string[] = [];
    // 过滤统计
    let totalTx = 0, passedTx = 0, walletFilteredTx = 0;

    for (const token of TOKENS_TO_SCAN) {
        try {
            // ── 获取流通量（用于占比过滤）────────────────────────
            let circulatingSupply = token.circulatingSupply ?? 0;
            if (circulatingSupply === 0 && token.supplyPct) {
                // 通过 DexScreener 估算：circulatingSupply ≈ marketCap / priceUsd
                const pairs = await fetchTokenPairs(token.address, token.chain);
                const best  = getBestPair(pairs);
                if (best) {
                    const price = parseFloat(best.priceUsd ?? '0');
                    const mcap  = best.marketCap || best.fdv || 0;
                    if (price > 0 && mcap > 0) {
                        circulatingSupply = mcap / price;
                    }
                }
            }

            const transfers = await fetchTokenTransfers(token.address, 500, token.chain);
            const recentTransfers = transfers.filter(tx => parseInt(tx.timeStamp) >= cutoffTimestamp);

            let tokenAlerts = 0;
            let priceCtx    = null; // 懒加载

            for (const tx of recentTransfers) {
                // ── 解析数量 ──────────────────────────────────────
                const decimals = parseInt(tx.tokenDecimal) || 18;
                let tokenAmount: number;
                try {
                    const big   = BigInt(tx.value);
                    const shift = BigInt(10) ** BigInt(decimals);
                    tokenAmount = Number(big / shift) + Number(big % shift) / Number(shift);
                } catch {
                    tokenAmount = parseFloat(tx.value) / Math.pow(10, decimals);
                }

                totalTx++;

                // ── 三重过滤器 ────────────────────────────────────
                const filterResult = await filterWhaleTransfer(
                    tokenAmount,
                    token,
                    circulatingSupply,
                    tx.from,
                    CHECK_WALLET_QUALITY
                );

                if (!filterResult.passed) {
                    if (filterResult.walletQualified === false) walletFilteredTx++;
                    continue;
                }
                passedTx++;

                // ── 懒加载价格上下文 ──────────────────────────────
                if (!priceCtx) {
                    priceCtx = await getPriceContext(token.address, token.chain);
                }

                // ── 美金估值 & 小额过滤（低于 $50K 不推送）────────────
                let usdValue = 0;
                if (priceCtx && priceCtx.priceUsd > 0) {
                    usdValue = tokenAmount * priceCtx.priceUsd;
                    if (usdValue < 50_000) {
                        console.log(`  ⏭️  ${token.symbol}: 跳过小额交易 $${Math.round(usdValue).toLocaleString()} (低于 $50K)`);
                        continue;
                    }
                }

                // ── 买卖方向判断 ──────────────────────────────────
                // 规则：to 是 DEX → 卖出（代币进入 DEX 换回 ETH/USDC）
                //       from 是 DEX → 买入（从 DEX 买出代币）
                //       都不是 → 转账/归集（中性）
                const txToLower   = tx.to.toLowerCase();
                const txFromLower = tx.from.toLowerCase();
                let side: 'buy' | 'sell' | 'transfer';
                if (DEX_ADDRS_LOWER.has(txToLower)) {
                    side = 'sell';
                } else if (DEX_ADDRS_LOWER.has(txFromLower)) {
                    side = 'buy';
                } else {
                    side = 'transfer';
                }
                const sideEmoji = side === 'sell' ? '🔴' : side === 'buy' ? '🟢' : '⚪';
                const sideLabel = side === 'sell' ? '卖出' : side === 'buy' ? '买入' : '转账';

                // INSERT OR IGNORE：已存在则跳过
                const inserted = insertWhale.run(
                    tx.hash, token.symbol, token.address, tokenAmount, side,
                    priceCtx?.signal ?? null, priceCtx?.change24h ?? null
                );

                if (inserted.changes > 0) {
                    const amountStr = tokenAmount >= 1_000_000
                        ? `${(tokenAmount / 1_000_000).toFixed(2)}M`
                        : tokenAmount >= 1_000
                        ? `${(tokenAmount / 1_000).toFixed(1)}K`
                        : Math.round(tokenAmount).toLocaleString();
                    const chainLabel = token.chain === 'base' ? '🔵Base' : '🔷ETH';
                    const txUrl      = token.chain === 'base'
                        ? `https://basescan.org/tx/${tx.hash}`
                        : `https://etherscan.io/tx/${tx.hash}`;
                    const txTime = new Date(parseInt(tx.timeStamp) * 1000)
                        .toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

                    // ── 美金估值显示 ────────────────────────────────
                    let usdLine = '';
                    if (usdValue > 0) {
                        let usdStr: string;
                        if (usdValue >= 1_000_000) {
                            usdStr = `$${(usdValue / 1_000_000).toFixed(2)}M`;
                        } else if (usdValue >= 1_000) {
                            usdStr = `$${Math.round(usdValue / 1_000)}K`;
                        } else {
                            usdStr = `$${usdValue.toFixed(2)}`;
                        }
                        usdLine = ` ≈ <b>${usdStr}</b>`;
                    }

                    // ── 占比标注（小市值代币特别有价值）────────────
                    const supplyLine = filterResult.supplyPctPass && filterResult.supplyPct > 0
                        ? `   📐 占流通量: <b>${(filterResult.supplyPct * 100).toFixed(3)}%</b>\n`
                        : '';

                    // ── 价格上下文 ────────────────────────────────
                    let priceCtxLine = '';
                    if (priceCtx) {
                        const priceStr = priceCtx.priceUsd >= 1
                            ? `$${priceCtx.priceUsd.toFixed(4)}`
                            : priceCtx.priceUsd >= 0.0001
                            ? `$${priceCtx.priceUsd.toFixed(6)}`
                            : `$${priceCtx.priceUsd.toExponential(3)}`;
                        const c1h  = priceCtx.change1h  >= 0 ? `+${priceCtx.change1h.toFixed(1)}%`  : `${priceCtx.change1h.toFixed(1)}%`;
                        const c24h = priceCtx.change24h >= 0 ? `+${priceCtx.change24h.toFixed(1)}%` : `${priceCtx.change24h.toFixed(1)}%`;
                        const buyPct = (priceCtx.txBuyRatio1h * 100).toFixed(0);
                        priceCtxLine =
                            `   💰 单价: <b>${priceStr}</b> | 1h <b>${c1h}</b> | 24h <b>${c24h}</b> | 买单 ${buyPct}%\n` +
                            `   ${priceCtx.emoji} 研判: <b>${priceCtx.label}</b>\n`;
                    }

                    whaleAlerts.push(
                        `${sideEmoji} <b>${token.symbol}</b> ${chainLabel}  鲸鱼${sideLabel}\n` +
                        `   数量: <b>${amountStr} ${token.symbol}</b>${usdLine}\n` +
                        supplyLine +
                        `   时间: ${txTime}\n` +
                        priceCtxLine +
                        `   🔗 <a href="${txUrl}">查看交易</a>`
                    );
                    tokenAlerts++;
                }
            }

            if (tokenAlerts > 0) {
                console.log(`  🐋 ${token.symbol}(${token.chain}): ${tokenAlerts} 笔新鲸鱼异动`);
            } else {
                console.log(`  ✓ ${token.symbol}(${token.chain}): 无异动`);
            }
        } catch (err: any) {
            console.warn(`  ⚠️  ${token.symbol} 扫描失败: ${err.message}`);
        }
    }

    // ── 过滤统计 ──────────────────────────────────────────────
    const filterInfo = formatFilterStats(totalTx, passedTx, walletFilteredTx);
    console.log(`\n${filterInfo}`);

    // ── 推送 Telegram ─────────────────────────────────────────
    if (whaleAlerts.length > 0) {
        console.log(`🐋 共发现 ${whaleAlerts.length} 条新鲸鱼预警，分批推送...`);
        await sendWhaleAlerts(whaleAlerts, now);
    } else {
        console.log('🐋 本轮扫描无新鲸鱼异动');
    }

    console.log(`🐋 Whale 监控扫描完成\n`);
}

if (require.main === module) {
    runWhaleScan().catch(console.error);
}
