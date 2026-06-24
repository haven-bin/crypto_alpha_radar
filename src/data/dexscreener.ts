import axios from 'axios';

const BASE_URL = 'https://api.dexscreener.com';

export interface DexScreenerPair {
    chainId: string;
    dexId: string;
    pairAddress: string;
    baseToken: { address: string; name: string; symbol: string };
    quoteToken: { address: string; name: string; symbol: string };
    priceUsd: string;
    txns: {
        h24: { buys: number; sells: number };
        h6: { buys: number; sells: number };
        h1: { buys: number; sells: number };
        m5: { buys: number; sells: number };
    };
    volume: { h24: number; h6: number; h1: number; m5: number };
    priceChange: { h24: number; h6: number; h1: number; m5: number };
    liquidity: { usd: number; base: number; quote: number };
    fdv: number;
    marketCap: number;
    pairCreatedAt: number;
}

/**
 * Fetch all trading pairs for a specific token on a given chain.
 * chainId: 'ethereum' | 'base'
 */
export async function fetchTokenPairs(tokenAddress: string, chainId: 'ethereum' | 'base' = 'ethereum'): Promise<DexScreenerPair[]> {
    try {
        const res = await axios.get(`${BASE_URL}/latest/dex/tokens/${tokenAddress}`);
        const pairs = (res.data.pairs || []) as DexScreenerPair[];
        return pairs.filter(p => p.chainId === chainId);
    } catch (error: any) {
        console.error(`[DexScreener] Failed to fetch token ${tokenAddress}:`, error.message);
        return [];
    }
}

/**
 * Get the best (highest liquidity) pair for a token
 */
export function getBestPair(pairs: DexScreenerPair[]): DexScreenerPair | null {
    if (pairs.length === 0) return null;
    return pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
}

/**
 * Search for tokens by keyword on DexScreener
 */
export async function searchTokens(query: string): Promise<DexScreenerPair[]> {
    try {
        const res = await axios.get(`${BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}`);
        const pairs = (res.data.pairs || []) as DexScreenerPair[];
        return pairs.filter(p => p.chainId === 'ethereum');
    } catch (error: any) {
        console.error(`[DexScreener] Search failed:`, error.message);
        return [];
    }
}

/**
 * Fetch trending/boosted token profiles
 */
export async function fetchTrendingTokens(): Promise<any[]> {
    try {
        const res = await axios.get(`${BASE_URL}/token-profiles/latest/v1`);
        return (res.data || []).filter((t: any) => t.chainId === 'ethereum');
    } catch (error: any) {
        console.error(`[DexScreener] Failed to fetch trending:`, error.message);
        return [];
    }
}

/**
 * Convert DexScreener pair data into a rough "yesterday vs today" estimate.
 * Strategy: Use h24 as "today's full day", and extrapolate h6 * 4 as "yesterday" baseline.
 * This is an approximation — real implementation would store daily snapshots.
 */
export function estimateGrowthMetrics(pair: DexScreenerPair) {
    const todayTxns = pair.txns.h24.buys + pair.txns.h24.sells;
    // Estimate yesterday's txns: assume h6 represents 1/4 of the day, so yesterday ~ h6 * 4
    // But since h6 is PART of h24, we estimate yesterday as: h24_count * (1 / (1 + priceChange/100))
    // Simpler approach: use h6 rate extrapolated
    const h6Txns = pair.txns.h6.buys + pair.txns.h6.sells;
    const estimatedYesterdayTxns = Math.max(1, h6Txns * 4 * 0.7); // 0.7 decay factor

    const todayVolume = pair.volume.h24;
    const h6Volume = pair.volume.h6;
    const estimatedYesterdayVolume = Math.max(1, h6Volume * 4 * 0.7);

    return {
        todayAddresses: todayTxns,
        yesterdayAddresses: Math.round(estimatedYesterdayTxns),
        todayVolume,
        yesterdayVolume: estimatedYesterdayVolume,
        marketCap: pair.marketCap || pair.fdv || 0,
        liquidity: pair.liquidity?.usd || 0,
        priceUsd: parseFloat(pair.priceUsd) || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
    };
}
