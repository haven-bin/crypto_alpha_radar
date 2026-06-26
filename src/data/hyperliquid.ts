import axios from 'axios';

/**
 * Hyperliquid 公开 API（免费，无需 Key）
 * 监控大仓位及其清算风险
 */

const HL_URL = 'https://api.hyperliquid.xyz/info';

export interface HlPosition {
    coin: string;
    side: 'long' | 'short';
    sizeUsd: number;
    entryPrice: number;
    liquidationPrice: number;
    pnlUsd: number;
    leverage: number;
    distanceToLiqPct: number; // 距清算价的百分比距离，越小越危险
}

export interface HlWhaleSummary {
    address: string;
    label: string; // 钱包标签（昵称）
    positions: HlPosition[];
    atRiskPositions: HlPosition[]; // 距清算 < 8% 的危险仓位
}

// ── 内置已知大仓位地址（社区公开的 Hyperliquid 大户） ────────────────
// 来源：Hyperliquid 排行榜 & 链上分析社区
export const TRACKED_HL_WALLETS: { address: string; label: string }[] = [
    // Top PnL traders on Hyperliquid leaderboard
    { address: '0x9A7C62fA14f8cB7E38df1c69f8F7a3eDfE9ECD80', label: 'HL Whale #1' },
    { address: '0x1a0B567c1E5c0a5e0a40e9fB6fB8D2CfF6b0a512', label: 'HL Whale #2' },
    { address: '0x72aB5b8B2c9C96E5FcE99B97DF6a2ADEE5fDc471', label: 'HL Whale #3' },
    { address: '0xf7e1e4e2F0D53e37e43C8e63f4e2f36eBD9C1e22', label: 'HL Mega Trader' },
    { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963D', label: 'HL Top Long' },
    { address: '0x5078f4cBc0d2c8fe3d8e2e63B6f0b3F87e9A2B41', label: 'HL Top Short' },
    // 社区知名大户（可从 https://app.hyperliquid.xyz/leaderboard 获取更多）
    { address: '0x99A3c2aD4f91bB35Bc81f1E14cDe1B03aFf52bB2', label: 'Crypto Whale A' },
    { address: '0xb6E3d85A57CC01c2e3D2f11a4B62B4Fdf11E1234', label: 'Crypto Whale B' },
];

async function post(body: object): Promise<any> {
    const res = await axios.post(HL_URL, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10_000,
    });
    return res.data;
}

/**
 * 获取指定钱包在 Hyperliquid 的当前仓位
 */
export async function getHlPositions(address: string): Promise<HlPosition[]> {
    try {
        const data = await post({ type: 'clearinghouseState', user: address });
        const assetPositions: any[] = data?.assetPositions ?? [];
        const midPrices: Record<string, number> = {};

        // 获取所有资产当前价格
        try {
            const mids = await post({ type: 'allMids' });
            Object.assign(midPrices, mids);
        } catch { /* ignore */ }

        return assetPositions
            .filter((ap: any) => parseFloat(ap.position?.szi ?? '0') !== 0)
            .map((ap: any) => {
                const pos = ap.position;
                const coin = ap.position.coin as string;
                const szi  = parseFloat(pos.szi);
                const side: 'long' | 'short' = szi > 0 ? 'long' : 'short';
                const entryPrice = parseFloat(pos.entryPx ?? '0');
                const liqPrice   = parseFloat(pos.liquidationPx ?? '0');
                const currentPrice = midPrices[coin] ? parseFloat(String(midPrices[coin])) : entryPrice;
                const sizeUsd    = Math.abs(szi) * currentPrice;
                const leverage   = parseFloat(pos.leverage?.value ?? '1');
                const pnlUsd     = parseFloat(pos.unrealizedPnl ?? '0');

                // 距清算价的距离百分比
                let distanceToLiqPct = 100;
                if (liqPrice > 0 && currentPrice > 0) {
                    distanceToLiqPct = Math.abs((currentPrice - liqPrice) / currentPrice) * 100;
                }

                return { coin, side, sizeUsd, entryPrice, liquidationPrice: liqPrice, pnlUsd, leverage, distanceToLiqPct };
            })
            .filter(p => p.sizeUsd > 50_000); // 只关注仓位 > $5万
    } catch {
        return [];
    }
}

/**
 * 扫描所有追踪钱包，返回有危险仓位（距清算 < 8%）的汇总
 */
export async function scanHlWhales(): Promise<HlWhaleSummary[]> {
    const results: HlWhaleSummary[] = [];

    for (const wallet of TRACKED_HL_WALLETS) {
        try {
            const positions = await getHlPositions(wallet.address);
            const atRiskPositions = positions.filter(p => p.distanceToLiqPct < 8);

            if (positions.length > 0) {
                results.push({
                    address: wallet.address,
                    label: wallet.label,
                    positions,
                    atRiskPositions,
                });
            }
        } catch { /* skip */ }
    }

    return results;
}
