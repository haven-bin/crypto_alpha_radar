export type Chain = 'ethereum' | 'base';

export interface TokenMetrics {
    symbol: string;
    address: string;
    chain: Chain;

    // Address growth
    yesterdayAddresses: number;
    todayAddresses: number;

    // Volume growth
    yesterdayVolume: number;
    todayVolume: number;

    // Whale buying
    whaleBuyVolume: number;  // in USD
    whaleSellVolume: number; // in USD (bearish: large sells to DEX)

    // Smart money
    smartMoneyBuyCount: number; // number of smart wallets buying

    // Market cap
    marketCap: number; // in USD

    // Liquidity
    liquidityUsd: number;        // current liquidity in USD
    liquidityChangePct?: number; // % change vs previous period (negative = drain)

    // Price
    priceChange24h?: number; // 24h price change %

    // Volume/Price Divergence
    divergenceScore?:  number; // score delta from divergence (-20 ~ +15)
    divergenceSignal?: string; // 'accumulation'|'fake_pump'|'distribution'|'trend_confirm'|'none'
    divergenceLabel?:  string; // human-readable description

    // Wash Trading
    washPenalty?:    number;  // score penalty (0 ~ -20)
    isWashTrading?:  boolean;
    washConfidence?: number;  // 0-100
}

export interface AlphaScoreResult {
    token: string;
    address: string;
    chain: Chain;
    totalScore: number; // Out of 100
    breakdown: {
        addressGrowthScore: number; // Max 30
        volumeGrowthScore: number;  // Max 20
        whaleBuyingScore: number;   // Max 20
        smartMoneyScore: number;    // Max 20
        marketCapScore: number;     // Max 10
        divergenceBonus: number;    // -20 ~ +15（量价背离）
        washPenalty: number;        // -20 ~ 0（洗量惩罚）
    };
}

export interface RiskScoreResult {
    token: string;
    address: string;
    chain: Chain;
    riskScore: number; // 0–100. >60 = high risk
    signals: string[]; // human-readable risk reasons
    breakdown: {
        liquidityDrainScore: number; // Max 40
        whaleDumpScore: number;      // Max 40
        priceCollapsScore: number;   // Max 20
    };
}

/** Unified signal sent via Telegram */
export interface SignalReport {
    bullish: {
        symbol: string;
        chain: Chain;
        score: number;
        description: string;
    }[];
    bearish: {
        symbol: string;
        chain: Chain;
        riskScore: number;
        signals: string[];
    }[];
    timestamp: string;
}
