import axios from 'axios';

const BASE_URL = 'https://api.geckoterminal.com/api/v2';

export interface OHLCVCandle {
    timestamp: number; // Unix seconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * Fetch token info and its top pool address on Ethereum
 */
export async function fetchTokenPools(tokenAddress: string): Promise<any[]> {
    try {
        const res = await axios.get(
            `${BASE_URL}/networks/eth/tokens/${tokenAddress}/pools`,
            { headers: { Accept: 'application/json;version=20230302' } }
        );
        return res.data?.data || [];
    } catch (error: any) {
        console.error(`[GeckoTerminal] Failed to fetch pools for ${tokenAddress}:`, error.message);
        return [];
    }
}

/**
 * Fetch OHLCV candles for a pool
 * timeframe: 'day', 'hour', 'minute'
 * aggregate: 1 (1-day candles), 4 (4h candles), etc.
 * limit: number of candles (max 1000)
 */
export async function fetchOHLCV(
    poolAddress: string,
    timeframe: 'day' | 'hour' | 'minute' = 'hour',
    aggregate: number = 1,
    limit: number = 72
): Promise<OHLCVCandle[]> {
    try {
        const res = await axios.get(
            `${BASE_URL}/networks/eth/pools/${poolAddress}/ohlcv/${timeframe}`,
            {
                params: { aggregate, limit, currency: 'usd' },
                headers: { Accept: 'application/json;version=20230302' }
            }
        );

        const raw = res.data?.data?.attributes?.ohlcv_list || [];
        // GeckoTerminal returns [timestamp, open, high, low, close, volume]
        return raw.map((c: number[]) => ({
            timestamp: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5],
        }));
    } catch (error: any) {
        console.error(`[GeckoTerminal] Failed to fetch OHLCV for pool ${poolAddress}:`, error.message);
        return [];
    }
}

/**
 * Get the price of a token at a specific timestamp using OHLCV data.
 * Used for 48h backtesting: find price at signal time and price 48h later.
 */
export async function getPriceAtTimestamp(
    tokenAddress: string,
    targetTimestamp: number // Unix seconds
): Promise<number | null> {
    const pools = await fetchTokenPools(tokenAddress);
    if (pools.length === 0) return null;

    // Use the top pool by volume
    const topPool = pools[0];
    const poolAddress = topPool.attributes?.address || topPool.id?.split('_')[1];
    if (!poolAddress) return null;

    // Fetch hourly candles for the last 7 days
    const candles = await fetchOHLCV(poolAddress, 'hour', 1, 168);
    if (candles.length === 0) return null;

    // Find the closest candle to targetTimestamp
    let closest = candles[0];
    let minDiff = Math.abs(candles[0].timestamp - targetTimestamp);

    for (const candle of candles) {
        const diff = Math.abs(candle.timestamp - targetTimestamp);
        if (diff < minDiff) {
            minDiff = diff;
            closest = candle;
        }
    }

    return closest.close;
}

/**
 * Calculate price change % between two timestamps for backtesting.
 * signalTimestamp: when the signal was generated (Unix seconds)
 * reviewTimestamp: 48h later (Unix seconds)
 */
export async function calculate48hPriceChange(
    tokenAddress: string,
    signalTimestamp: number
): Promise<{ priceAtSignal: number | null; priceAt48h: number | null; changePercent: number | null }> {
    const reviewTimestamp = signalTimestamp + 48 * 3600;
    const [priceAtSignal, priceAt48h] = await Promise.all([
        getPriceAtTimestamp(tokenAddress, signalTimestamp),
        getPriceAtTimestamp(tokenAddress, reviewTimestamp),
    ]);

    if (!priceAtSignal || !priceAt48h) {
        return { priceAtSignal, priceAt48h, changePercent: null };
    }

    const changePercent = ((priceAt48h - priceAtSignal) / priceAtSignal) * 100;
    return { priceAtSignal, priceAt48h, changePercent };
}
