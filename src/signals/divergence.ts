/**
 * 量价背离检测（Volume/Price Divergence）
 *
 * 核心逻辑：
 *   - 量涨价未涨 → 聪明钱悄悄吸筹（看涨信号）
 *   - 价涨量缩   → 虚假拉盘，无人跟进（谨慎信号）
 *   - 量价双涨   → 趋势确认（正常强势）
 *
 * 数据来源：DexScreener（免费，无需 Key）
 */

import { DexScreenerPair } from '../data/dexscreener';

export type DivergenceSignal =
    | 'accumulation'    // 量涨价未涨 → 吸筹
    | 'fake_pump'       // 价涨量缩   → 虚假拉盘
    | 'trend_confirm'   // 量价双涨   → 趋势确认
    | 'distribution'    // 量涨价跌   → 可能出货
    | 'none';           // 无明显信号

export interface DivergenceResult {
    signal: DivergenceSignal;
    score: number;           // -20 ~ +15，集成到引擎评分
    volumeChangePct: number; // h24 成交量变化 %（用 h6*4 估算昨天）
    priceChangePct: number;  // 24h 价格变化 %
    divergenceIndex: number; // volumeChange - priceChange（越大越背离）
    label: string;           // 中文描述
    emoji: string;
}

/**
 * 计算量价背离指数
 * @param pair - DexScreener pair 数据
 */
export function detectDivergence(pair: DexScreenerPair): DivergenceResult {
    const priceChange = pair.priceChange?.h24 ?? 0;    // 24h 价格变化 %
    const volH24      = pair.volume?.h24 ?? 0;
    const volH6       = pair.volume?.h6  ?? 0;

    // 用 h6 * 4 * 0.7 估算昨天成交量基线（0.7 衰减系数减少误差）
    const volYesterday = Math.max(1, volH6 * 4 * 0.7);
    const volumeChangePct = ((volH24 - volYesterday) / volYesterday) * 100;

    // 背离指数：成交量涨幅 - 价格涨幅
    // 正值越大 = 量涨价未跟 = 潜在吸筹
    // 负值越大 = 价涨量缩   = 虚假拉盘
    const divergenceIndex = volumeChangePct - priceChange;

    let signal: DivergenceSignal;
    let score: number;
    let label: string;
    let emoji: string;

    // ── 判断逻辑 ──────────────────────────────────────────────
    if (volumeChangePct >= 150 && priceChange >= -5 && priceChange <= 15) {
        // 量大涨（+150%），价格平稳 → 强烈吸筹信号
        signal = 'accumulation';
        score  = 15;
        label  = `吸筹信号 量涨${volumeChangePct.toFixed(0)}%但价格仅${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}%`;
        emoji  = '🟢';
    } else if (volumeChangePct >= 80 && priceChange >= -3 && priceChange <= 10) {
        // 量中等上涨，价格基本平稳 → 温和吸筹
        signal = 'accumulation';
        score  = 8;
        label  = `温和吸筹 量涨${volumeChangePct.toFixed(0)}%，价格相对平稳`;
        emoji  = '🟢';
    } else if (volumeChangePct >= 100 && priceChange >= 20) {
        // 量价双涨 → 趋势确认
        signal = 'trend_confirm';
        score  = 5;
        label  = `趋势确认 量价双涨，上涨动能充足`;
        emoji  = '💪';
    } else if (volumeChangePct >= 60 && priceChange <= -10) {
        // 量涨价跌 → 大户可能出货
        signal = 'distribution';
        score  = -15;
        label  = `出货风险 量涨${volumeChangePct.toFixed(0)}%但价格跌${Math.abs(priceChange).toFixed(1)}%，疑似出货`;
        emoji  = '🔴';
    } else if (priceChange >= 20 && volumeChangePct <= -20) {
        // 价涨量缩 → 虚假拉盘
        signal = 'fake_pump';
        score  = -20;
        label  = `虚假拉盘 价格涨${priceChange.toFixed(1)}%但量缩${Math.abs(volumeChangePct).toFixed(0)}%，无人跟进`;
        emoji  = '⚠️';
    } else {
        signal = 'none';
        score  = 0;
        label  = '无明显量价背离';
        emoji  = '⚪';
    }

    return {
        signal,
        score,
        volumeChangePct,
        priceChangePct: priceChange,
        divergenceIndex,
        label,
        emoji,
    };
}

/**
 * 格式化背离结果用于 Telegram 推送
 */
export function formatDivergence(result: DivergenceResult, symbol: string): string {
    if (result.signal === 'none') return '';
    const volStr = result.volumeChangePct >= 0
        ? `+${result.volumeChangePct.toFixed(0)}%`
        : `${result.volumeChangePct.toFixed(0)}%`;
    const priceStr = result.priceChangePct >= 0
        ? `+${result.priceChangePct.toFixed(1)}%`
        : `${result.priceChangePct.toFixed(1)}%`;
    return (
        `${result.emoji} <b>${symbol}</b> 量价背离\n` +
        `   成交量变化: <b>${volStr}</b>  |  价格变化: <b>${priceStr}</b>\n` +
        `   📊 研判: ${result.label}`
    );
}
