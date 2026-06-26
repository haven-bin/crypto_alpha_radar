/**
 * 洗量交易识别（Wash Trading Detector）
 *
 * 判断逻辑：
 * 1. 同一 from 地址在短时间内（10分钟窗口）发出 ≥ 5 笔转账 → 标记为可疑地址
 * 2. 可疑地址笔数占总活跃地址笔数 > 30% → 触发洗量警告
 * 3. 单地址自我交易（from == to）直接计入洗量
 * 4. 额外检查：多笔交易金额极度接近（方差 < 1%）→ 机器人刷量特征
 *
 * 数据来源：Etherscan TokenTransfer 数组（已有，无需额外 API）
 */

import { TokenTransfer } from '../data/etherscan';

export interface WashTradingResult {
    isWashTrading: boolean;
    confidence: number;         // 0–100，越高越可疑
    suspiciousAddresses: string[];
    suspiciousTxCount: number;
    totalTxCount: number;
    washRatio: number;           // 可疑交易占比（0–1）
    penalty: number;             // Alpha 评分惩罚（0 ~ -20）
    reasons: string[];           // 可读原因列表
}

const WINDOW_SECONDS  = 600;  // 10 分钟时间窗口
const MIN_TX_BURST    = 5;    // 同一地址在窗口内发出几笔算可疑
const WASH_RATIO_WARN = 0.30; // 30% 可疑笔数触发警告

/**
 * 检测洗量交易
 * @param transfers - 最近的代币转账列表（已按时间倒序排列）
 * @param windowHours - 分析时间窗口（小时，默认 2 小时）
 */
export function detectWashTrading(
    transfers: TokenTransfer[],
    windowHours: number = 2
): WashTradingResult {
    const cutoff = Math.floor(Date.now() / 1000) - windowHours * 3600;
    const recent = transfers.filter(tx => parseInt(tx.timeStamp) >= cutoff);

    if (recent.length < 10) {
        return {
            isWashTrading: false,
            confidence: 0,
            suspiciousAddresses: [],
            suspiciousTxCount: 0,
            totalTxCount: recent.length,
            washRatio: 0,
            penalty: 0,
            reasons: [],
        };
    }

    const reasons: string[] = [];
    const suspiciousAddresses = new Set<string>();
    let suspiciousTxCount = 0;

    // ── 检测1：自我交易（from == to）─────────────────────────────
    const selfTrades = recent.filter(tx => tx.from.toLowerCase() === tx.to.toLowerCase());
    if (selfTrades.length > 0) {
        selfTrades.forEach(tx => suspiciousAddresses.add(tx.from.toLowerCase()));
        suspiciousTxCount += selfTrades.length;
        reasons.push(`🔴 发现 ${selfTrades.length} 笔自我交易（from==to）`);
    }

    // ── 检测2：同一地址短时间内高频转账（爆发式行为）──────────────
    // 按 from 地址分组
    const fromGroups: Record<string, TokenTransfer[]> = {};
    for (const tx of recent) {
        const from = tx.from.toLowerCase();
        if (!fromGroups[from]) fromGroups[from] = [];
        fromGroups[from].push(tx);
    }

    for (const [from, txs] of Object.entries(fromGroups)) {
        if (txs.length < MIN_TX_BURST) continue;

        // 在 WINDOW_SECONDS 内检测爆发
        const sortedTs = txs.map(tx => parseInt(tx.timeStamp)).sort((a, b) => a - b);
        for (let i = 0; i <= sortedTs.length - MIN_TX_BURST; i++) {
            const windowEnd = sortedTs[i] + WINDOW_SECONDS;
            const burstCount = sortedTs.filter(ts => ts >= sortedTs[i] && ts <= windowEnd).length;
            if (burstCount >= MIN_TX_BURST) {
                suspiciousAddresses.add(from);
                suspiciousTxCount += txs.length;
                reasons.push(`🟠 地址 ${from.slice(0, 8)}… 在10分钟内发出 ${burstCount} 笔转账`);
                break;
            }
        }
    }

    // ── 检测3：金额极度相似（机器人特征）─────────────────────────
    // 取可疑地址的转账，检查金额方差
    for (const addr of suspiciousAddresses) {
        const addrTxs = fromGroups[addr] ?? [];
        if (addrTxs.length < 3) continue;

        const amounts = addrTxs.map(tx => {
            const dec = parseInt(tx.tokenDecimal) || 18;
            try {
                const big = BigInt(tx.value);
                const shift = BigInt(10) ** BigInt(dec);
                return Number(big / shift);
            } catch {
                return parseFloat(tx.value) / Math.pow(10, dec);
            }
        });

        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        if (mean === 0) continue;
        const variance = amounts.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / amounts.length;
        const cv = Math.sqrt(variance) / mean; // 变异系数

        if (cv < 0.02) {
            // 变异系数 < 2% → 金额几乎相同，机器人特征
            reasons.push(`🤖 地址 ${addr.slice(0, 8)}… 转账金额高度一致（变异系数=${(cv*100).toFixed(2)}%）`);
        }
    }

    const washRatio = recent.length > 0 ? suspiciousTxCount / recent.length : 0;

    // ── 评分 ──────────────────────────────────────────────────────
    let confidence = 0;
    let penalty    = 0;

    if (selfTrades.length > 0) confidence += 30;
    if (suspiciousAddresses.size > 0) {
        confidence += Math.min(50, suspiciousAddresses.size * 10);
    }
    confidence += Math.min(20, washRatio * 100);
    confidence = Math.min(100, confidence);

    if (washRatio >= 0.5 || confidence >= 80) {
        penalty = -20;
    } else if (washRatio >= WASH_RATIO_WARN || confidence >= 50) {
        penalty = -10;
    } else if (confidence >= 30) {
        penalty = -5;
    }

    const isWashTrading = washRatio >= WASH_RATIO_WARN || confidence >= 50;

    return {
        isWashTrading,
        confidence,
        suspiciousAddresses: [...suspiciousAddresses],
        suspiciousTxCount,
        totalTxCount: recent.length,
        washRatio,
        penalty,
        reasons,
    };
}

/**
 * 格式化洗量结果用于 Telegram 推送
 */
export function formatWashResult(result: WashTradingResult, symbol: string): string {
    if (!result.isWashTrading) return '';
    const pct = (result.washRatio * 100).toFixed(0);
    return (
        `⚠️ <b>${symbol}</b> 疑似洗量\n` +
        `   可疑交易占比: <b>${pct}%</b> (${result.suspiciousTxCount}/${result.totalTxCount} 笔)\n` +
        `   置信度: ${result.confidence}%\n` +
        `   ${result.reasons.slice(0, 2).join('\n   ')}`
    );
}
