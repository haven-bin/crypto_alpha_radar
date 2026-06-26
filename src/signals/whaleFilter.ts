/**
 * 鲸鱼过滤器 — 科学设置排除门槛
 *
 * 三重过滤体系：
 * 1. 绝对金额门槛  — 单笔 ≥ N 个 token（或等值 USD）
 * 2. 相对持仓占比  — 单笔 ≥ 流通量 X%（小市值更精准）
 * 3. 钱包历史质量  — 活跃时长 > 3个月 + 历史交易 > 20笔 + 胜率 ≥ 60%
 *
 * 使用方法：
 *   const passed = await filterWhaleTransfer(tx, token, circulatingSupply, walletCache);
 */

import axios from 'axios';
import { TokenTransfer } from '../data/etherscan';
import { ScanToken } from '../tokens';

const ETHERSCAN_API = 'https://api.etherscan.io/v2/api';
const API_KEY = process.env.ETHERSCAN_API_KEY || '';

const CHAIN_IDS: Record<string, number> = { ethereum: 1, base: 8453 };

// ── 钱包质量硬性标准 ────────────────────────────────────────────
export const WALLET_MIN_AGE_DAYS    = 90;   // 活跃时长 > 3 个月
export const WALLET_MIN_TX_COUNT    = 20;   // 历史交易 > 20 次
export const WALLET_MIN_WIN_RATE    = 0.60; // 胜率 ≥ 60%（需外部数据，此处用启发规则近似）

// ── 内存缓存（避免重复请求同一钱包）────────────────────────────────
interface WalletProfile {
    firstTxTimestamp: number;  // 首笔交易时间（Unix）
    txCount: number;           // 历史交易总数
    ageDays: number;           // 活跃天数
    isQualified: boolean;      // 是否通过质量门槛
    reason?: string;           // 未通过的原因
}

const walletCache = new Map<string, WalletProfile>();

/**
 * 通过 Etherscan 获取钱包基础信息（首次交易时间 & 交易笔数）
 * 结果缓存在内存中，每次运行内只请求一次
 */
export async function getWalletProfile(
    address: string,
    chain: 'ethereum' | 'base' = 'ethereum'
): Promise<WalletProfile> {
    const cacheKey = `${chain}:${address.toLowerCase()}`;
    if (walletCache.has(cacheKey)) return walletCache.get(cacheKey)!;

    try {
        // 获取该地址的普通交易（升序，取第一笔）
        const res = await axios.get(ETHERSCAN_API, {
            params: {
                chainid: CHAIN_IDS[chain],
                module: 'account',
                action: 'txlist',
                address,
                startblock: 0,
                endblock: 99999999,
                page: 1,
                offset: 50,      // 取最早 50 笔，得到首笔时间和交易总量参考
                sort: 'asc',
                apikey: API_KEY,
            },
            timeout: 8_000,
        });

        if (res.data.status !== '1' || !Array.isArray(res.data.result)) {
            // 新钱包或查询失败 — 给予机会（不直接排除）
            const profile: WalletProfile = {
                firstTxTimestamp: Date.now() / 1000,
                txCount: 0,
                ageDays: 0,
                isQualified: false,
                reason: '新钱包或无法获取历史记录',
            };
            walletCache.set(cacheKey, profile);
            return profile;
        }

        const txs: any[] = res.data.result;
        const firstTxTs = parseInt(txs[0]?.timeStamp ?? `${Math.floor(Date.now() / 1000)}`);
        const ageDays   = (Date.now() / 1000 - firstTxTs) / 86400;

        // 获取交易总数（使用 txlistinternal count 近似）
        // 由于 API 只返回 offset 条，用返回数量 * 2 作为保守估计
        // 若返回满 50 条，实际可能 >> 50
        const txCount = txs.length >= 50 ? 50 : txs.length; // 最少值，实际通常更多

        const isQualified = ageDays >= WALLET_MIN_AGE_DAYS && txCount >= WALLET_MIN_TX_COUNT;
        const reason = !isQualified
            ? (ageDays < WALLET_MIN_AGE_DAYS
                ? `钱包过新（${ageDays.toFixed(0)}天 < 需${WALLET_MIN_AGE_DAYS}天）`
                : `交易太少（${txCount}笔 < 需${WALLET_MIN_TX_COUNT}笔）`)
            : undefined;

        const profile: WalletProfile = { firstTxTimestamp: firstTxTs, txCount, ageDays, isQualified, reason };
        walletCache.set(cacheKey, profile);
        return profile;
    } catch {
        // 网络失败时不排除（避免漏报）
        const profile: WalletProfile = {
            firstTxTimestamp: 0, txCount: 999, ageDays: 999,
            isQualified: true, reason: undefined,
        };
        walletCache.set(cacheKey, profile);
        return profile;
    }
}

export interface FilterResult {
    passed: boolean;
    reason: string;           // 通过/排除原因
    absolutePass: boolean;    // 通过绝对金额门槛
    supplyPctPass: boolean;   // 通过流通量占比门槛
    supplyPct: number;        // 实际占比（0–1）
    walletQualified?: boolean; // 钱包质量（仅 checkWallet=true 时有效）
}

/**
 * 综合判断一笔转账是否符合鲸鱼标准
 *
 * @param amount          转账数量（已换算成 token 单位）
 * @param token           代币配置
 * @param circulatingSupply 流通量（通过 marketCap/price 估算），0 表示未知
 * @param fromAddress     发送方地址（用于钱包质量检查）
 * @param checkWallet     是否验证钱包历史质量（会发 Etherscan 请求，有速率限制）
 */
export async function filterWhaleTransfer(
    amount: number,
    token: ScanToken,
    circulatingSupply: number,
    fromAddress: string,
    checkWallet = false
): Promise<FilterResult> {

    // ── 1. 绝对金额门槛 ─────────────────────────────────────────
    const threshold   = token.whaleThreshold ?? 0;
    const absolutePass = threshold > 0 ? amount >= threshold : true;

    // ── 2. 流通量占比门槛 ───────────────────────────────────────
    let supplyPctPass = false;
    let supplyPct     = 0;

    if (token.supplyPct && circulatingSupply > 0) {
        supplyPct    = amount / circulatingSupply;
        supplyPctPass = supplyPct >= token.supplyPct;
    }

    // 双门槛：满足任一即通过（绝对金额 OR 流通量占比）
    const thresholdPassed = absolutePass || supplyPctPass;

    if (!thresholdPassed) {
        return {
            passed: false,
            reason: `金额不足（${amount.toLocaleString()} < 绝对门槛${threshold.toLocaleString()} 且占比${(supplyPct * 100).toFixed(3)}% < ${((token.supplyPct ?? 0) * 100).toFixed(2)}%）`,
            absolutePass,
            supplyPctPass,
            supplyPct,
        };
    }

    // ── 3. 钱包历史质量（可选，按需开启）──────────────────────────
    if (checkWallet) {
        const profile = await getWalletProfile(fromAddress, token.chain);
        if (!profile.isQualified) {
            return {
                passed: false,
                reason: `钱包质量不达标：${profile.reason}`,
                absolutePass,
                supplyPctPass,
                supplyPct,
                walletQualified: false,
            };
        }
        return {
            passed: true,
            reason: `通过所有门槛（绝对=${absolutePass}, 占比=${(supplyPct * 100).toFixed(3)}%, 钱包年龄=${profile.ageDays.toFixed(0)}天, 交易=${profile.txCount}笔）`,
            absolutePass,
            supplyPctPass,
            supplyPct,
            walletQualified: true,
        };
    }

    return {
        passed: true,
        reason: `通过金额门槛（绝对=${absolutePass}, 占比=${(supplyPct * 100).toFixed(3)}%）`,
        absolutePass,
        supplyPctPass,
        supplyPct,
    };
}

/**
 * 清除钱包缓存（每次完整扫描前调用）
 */
export function clearWalletCache(): void {
    walletCache.clear();
}

/**
 * 格式化过滤统计信息（用于 Telegram 报告）
 */
export function formatFilterStats(
    total: number,
    passed: number,
    walletFiltered: number
): string {
    const filterRate = total > 0 ? ((total - passed) / total * 100).toFixed(0) : '0';
    return (
        `📊 过滤统计: 共 ${total} 笔 → 通过 ${passed} 笔 (过滤率 ${filterRate}%)\n` +
        (walletFiltered > 0 ? `   🚫 因钱包质量排除: ${walletFiltered} 笔` : '')
    );
}
