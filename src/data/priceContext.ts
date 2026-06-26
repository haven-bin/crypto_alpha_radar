import axios from 'axios';
import { DexScreenerPair } from './dexscreener';

const BASE_URL = 'https://api.dexscreener.com';

/**
 * 获取代币价格上下文（用于鲸鱼异动推送时附加价格位置分析）
 */
export interface PriceContext {
    priceUsd: number;
    change1h: number;
    change6h: number;
    change24h: number;
    signal: 'accumulation' | 'caution' | 'neutral'; // 吸筹/高位谨慎/正常
    label: string;        // 中文描述
    emoji: string;        // 表情符号
    txBuyRatio1h: number; // 最近1小时买单占比（>0.6 说明买盘强势）
}

export async function getPriceContext(
    tokenAddress: string,
    chain: 'ethereum' | 'base' = 'ethereum'
): Promise<PriceContext | null> {
    try {
        const res = await axios.get(`${BASE_URL}/latest/dex/tokens/${tokenAddress}`);
        const pairs = ((res.data.pairs || []) as DexScreenerPair[])
            .filter(p => p.chainId === chain)
            .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

        if (pairs.length === 0) return null;

        const pair = pairs[0];
        const change24h = pair.priceChange?.h24 ?? 0;
        const change6h  = pair.priceChange?.h6  ?? 0;
        const change1h  = pair.priceChange?.h1  ?? 0;

        const h1Buys  = pair.txns?.h1?.buys  ?? 0;
        const h1Sells = pair.txns?.h1?.sells ?? 1;
        const txBuyRatio1h = h1Buys / (h1Buys + h1Sells);

        // ── 信号判断逻辑 ─────────────────────────────────────────
        // 吸筹信号：价格在低位（24h 跌幅大）且有鲸鱼买入
        // 高位谨慎：近期大涨后出现鲸鱼买入（可能是诱多）
        // 正常区间：波动较小

        let signal: PriceContext['signal'];
        let label: string;
        let emoji: string;

        if (change24h <= -15) {
            // 24h 大跌后鲸鱼买入 → 强烈吸筹信号
            signal = 'accumulation';
            label  = '低位吸筹 ⬇️价格深跌中买入';
            emoji  = '🟢';
        } else if (change24h <= -5) {
            // 小幅回调后买入 → 温和吸筹
            signal = 'accumulation';
            label  = '回调吸筹 价格小幅调整中买入';
            emoji  = '🟢';
        } else if (change24h >= 30 && change6h >= 15) {
            // 短期暴涨后买入 → 高度警惕，可能诱多
            signal = 'caution';
            label  = '高位追入 ⚠️近期已大涨，追多风险高';
            emoji  = '🟡';
        } else if (change24h >= 15) {
            // 中等涨幅后买入 → 谨慎
            signal = 'caution';
            label  = '高位谨慎 价格已上涨，注意风险';
            emoji  = '🟡';
        } else {
            // 正常区间
            signal = 'neutral';
            label  = '正常区间 价格波动平稳';
            emoji  = '⚪';
        }

        return {
            priceUsd: parseFloat(pair.priceUsd) || 0,
            change1h,
            change6h,
            change24h,
            signal,
            label,
            emoji,
            txBuyRatio1h,
        };
    } catch {
        return null;
    }
}
