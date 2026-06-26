import { Chain } from './types';

export interface ScanToken {
    symbol:   string;
    address:  string;
    chain:    Chain;

    /**
     * 绝对数量门槛（token 数量，非 USD）
     * 用于过滤低于此数量的转账，不触发鲸鱼警报
     * 例：WETH = 50（即 ≥50 ETH ≈ $17.5万 触发）
     */
    whaleThreshold?: number;

    /**
     * 相对流通量占比门槛（0–1）
     * 当转账量 > 流通量 × supplyPct 时才触发，适合小市值山寨币
     * 例：supplyPct = 0.005 表示 "单笔 ≥ 流通量 0.5%"
     * 若同时设置 whaleThreshold 和 supplyPct，满足其中一个即触发
     */
    supplyPct?: number;

    /**
     * 预估流通量（token 数量）
     * 若未设置，系统会通过 marketCap / priceUsd 自动估算
     */
    circulatingSupply?: number;
}

export const TOKENS_TO_SCAN: ScanToken[] = [
    // ── ETH 蓝筹 ──────────────────────────────────────────────
    // 规则: 单笔 ≥ 50 ETH（≈$17.5万，符合「≥50 ETH 硬标准」）
    { symbol: 'WETH',   chain: 'ethereum', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      whaleThreshold: 50 },
    // Base 链 ETH：Gas 低，门槛适当降低至 20 ETH
    { symbol: 'WETH.b', chain: 'base',     address: '0x4200000000000000000000000000000000000006',
      whaleThreshold: 20 },
    // WBTC: ≥ 2 BTC（≈$18万）
    { symbol: 'WBTC',   chain: 'ethereum', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      whaleThreshold: 2 },
    // USDC / USDT：稳定币 ≥ $10万
    { symbol: 'USDC',   chain: 'ethereum', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      whaleThreshold: 100_000 },
    { symbol: 'USDT',   chain: 'ethereum', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      whaleThreshold: 100_000 },

    // ── ETH Meme（中市值，用流通量占比 + 绝对金额双重门槛）────────
    // PEPE：大市值，单笔 ≥ 流通量 0.1% 或 绝对 ≥ 1亿 PEPE
    { symbol: 'PEPE',   chain: 'ethereum', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
      whaleThreshold: 100_000_000, supplyPct: 0.001 },
    // SHIB：大市值，≥ 5亿 SHIB 或 0.1%
    { symbol: 'SHIB',   chain: 'ethereum', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
      whaleThreshold: 500_000_000, supplyPct: 0.001 },
    // FLOKI：中市值，≥ 流通量 0.5%（小市值标准）
    { symbol: 'FLOKI',  chain: 'ethereum', address: '0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E',
      whaleThreshold: 10_000_000, supplyPct: 0.005 },
    // TURBO：小市值，0.5% 占比即视为巨鲸
    { symbol: 'TURBO',  chain: 'ethereum', address: '0xA35923162C49cF95e6BF26623385eb431ad920D3',
      whaleThreshold: 5_000_000,  supplyPct: 0.005 },
    { symbol: 'MOG',    chain: 'ethereum', address: '0xaaeE1A9723aaDB7afA2810263653A34bA2C21C7a',
      whaleThreshold: 10_000_000, supplyPct: 0.005 },
    { symbol: 'MEME',   chain: 'ethereum', address: '0xb131f4A55907B10d1F0A50d8ab8FA09EC342cd74',
      whaleThreshold: 10_000_000, supplyPct: 0.005 },
    // CULT / WOJAK / ELON / KISHU：微市值，0.1% 已是大单
    { symbol: 'CULT',   chain: 'ethereum', address: '0xf0f9D895aCa5c8678f706FB8216fa22957685A13',
      whaleThreshold: 5_000_000,  supplyPct: 0.001 },
    { symbol: 'WOJAK',  chain: 'ethereum', address: '0x5026F006B85729a8b14553FAE6af249aD16c9aaB',
      whaleThreshold: 1_000_000,  supplyPct: 0.001 },
    { symbol: 'ELON',   chain: 'ethereum', address: '0x761D38e5ddf6ccf6Cf7c55759d5210750B5D60F3',
      whaleThreshold: 1_000_000,  supplyPct: 0.001 },
    { symbol: 'KISHU',  chain: 'ethereum', address: '0xA2b4C0Af19cC16a6CfAcCe81F192B024d625817D',
      whaleThreshold: 5_000_000,  supplyPct: 0.001 },

    // ── Base Chain Meme（低 Gas 链，绝对门槛适当降低）────────────
    { symbol: 'BRETT',  chain: 'base', address: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
      whaleThreshold: 5_000,   supplyPct: 0.005 },
    { symbol: 'DEGEN',  chain: 'base', address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
      whaleThreshold: 50_000,  supplyPct: 0.005 },
    { symbol: 'TOSHI',  chain: 'base', address: '0xD769d56f479E9E72a77bB1523e866A33098Feec5',
      whaleThreshold: 10_000,  supplyPct: 0.001 },
    { symbol: 'AERO',   chain: 'base', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
      whaleThreshold: 5_000,   supplyPct: 0.005 },
    { symbol: 'PEPE.b', chain: 'base', address: '0x52b492a33E447Cdb854c7FC19F1e57E8BfA1777D',
      whaleThreshold: 1_000_000, supplyPct: 0.001 },
];
