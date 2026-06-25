import * as dotenv from 'dotenv';
dotenv.config();

import { OpportunityEngine } from './engine';
import { TokenMetrics, Chain, SignalReport } from './types';
import db, { initDB } from './db';
import { fetchTokenPairs, getBestPair, estimateGrowthMetrics } from './data/dexscreener';
import { fetchTokenTransfers, detectWhaleTransfers, checkSmartMoneyBuys } from './data/etherscan';
import { getSmartWalletAddresses } from './data/smartmoney';
import { sendDailyReport } from './services/notifier';

initDB();

const engine = new OpportunityEngine();

// -------------------------------------------------------
// Multi-chain token registry.
// ETH Mainnet + Base Chain meme tokens.
// -------------------------------------------------------
interface ScanToken {
    symbol: string;
    address: string;
    chain: Chain;
    whaleThreshold?: number; // Min USD value to count as "whale" buy
}

export const TOKENS_TO_SCAN: ScanToken[] = [
    // ── Ethereum Mainnet ──────────────────────────────────
    { symbol: 'PEPE',   chain: 'ethereum', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', whaleThreshold: 20_000 },
    { symbol: 'SHIB',   chain: 'ethereum', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', whaleThreshold: 30_000 },
    { symbol: 'FLOKI',  chain: 'ethereum', address: '0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E', whaleThreshold: 10_000 },
    { symbol: 'TURBO',  chain: 'ethereum', address: '0xA35923162C49cF95e6BF26623385eb431ad920D3', whaleThreshold: 5_000  },
    { symbol: 'MOG',    chain: 'ethereum', address: '0xaaeE1A9723aaDB7afA2810263653A34bA2C21C7a', whaleThreshold: 10_000 },
    { symbol: 'MEME',   chain: 'ethereum', address: '0xb131f4A55907B10d1F0A50d8ab8FA09EC342cd74', whaleThreshold: 10_000 },
    { symbol: 'CULT',   chain: 'ethereum', address: '0xf0f9D895aCa5c8678f706FB8216fa22957685A13', whaleThreshold: 5_000  },
    { symbol: 'WOJAK',  chain: 'ethereum', address: '0x5026F006B85729a8b14553FAE6af249aD16c9aaB', whaleThreshold: 5_000  },
    { symbol: 'ELON',   chain: 'ethereum', address: '0x761D38e5ddf6ccf6Cf7c55759d5210750B5D60F3', whaleThreshold: 5_000  },
    { symbol: 'KISHU',  chain: 'ethereum', address: '0xA2b4C0Af19cC16a6CfAcCe81F192B024d625817D', whaleThreshold: 5_000  },

    // ── Base Chain ────────────────────────────────────────
    { symbol: 'BRETT',  chain: 'base', address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', whaleThreshold: 10_000 },
    { symbol: 'DEGEN',  chain: 'base', address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', whaleThreshold: 5_000  },
    { symbol: 'TOSHI',  chain: 'base', address: '0xD769d56f479E9E72a77bB1523e866A33098Feec5', whaleThreshold: 3_000  },
    { symbol: 'AERO',   chain: 'base', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', whaleThreshold: 20_000 },
    { symbol: 'PEPE.b', chain: 'base', address: '0x52b492a33E447Cdb854c7FC19F1e57E8BfA1777D', whaleThreshold: 5_000  },
];

async function scanToken(token: ScanToken): Promise<TokenMetrics | null> {
    const chainLabel = token.chain === 'base' ? '🔵Base' : '🔷ETH';
    console.log(`  🔍 [${chainLabel}] Scanning ${token.symbol} (${token.address.slice(0, 8)}...)...`);

    // 1. Fetch DEX data from DexScreener (chain-aware)
    const pairs = await fetchTokenPairs(token.address, token.chain);
    const bestPair = getBestPair(pairs);

    if (!bestPair) {
        console.log(`  ⚠️   No ${token.chain} pairs found for ${token.symbol}, skipping.`);
        return null;
    }

    const growth = estimateGrowthMetrics(bestPair);

    // 2. Whale detection via Etherscan V2 (chain-aware, same API key)
    let whaleBuyVolumeUsd  = 0;
    let whaleSellVolumeUsd = 0;
    if (growth.priceUsd > 0) {
        const transfers = await fetchTokenTransfers(token.address, 1000, token.chain);
        const whaleData = detectWhaleTransfers(transfers, growth.priceUsd, token.whaleThreshold ?? 10_000);
        whaleBuyVolumeUsd  = whaleData.totalWhaleBuyVolumeUsd;
        // Estimate sell volume: large transfers OUT of wallets (incoming to DEX)
        whaleSellVolumeUsd = whaleData.totalWhaleSellVolumeUsd ?? 0;
    }

    // 3. Smart money tracking (chain-aware, check 3 wallets to save rate limits)
    const smartWallets = getSmartWalletAddresses().slice(0, 3);
    const { count: smartMoneyCount } = await checkSmartMoneyBuys(
        token.address, smartWallets, 24, token.chain
    );

    // 4. Liquidity & price info from DexScreener pair
    const liquidityUsd     = bestPair.liquidity?.usd ?? 0;
    const priceChange24h   = bestPair.priceChange?.h24 ?? 0;

    return {
        symbol:             token.symbol,
        address:            token.address,
        chain:              token.chain,
        yesterdayAddresses: growth.yesterdayAddresses,
        todayAddresses:     growth.todayAddresses,
        yesterdayVolume:    growth.yesterdayVolume,
        todayVolume:        growth.todayVolume,
        whaleBuyVolume:     whaleBuyVolumeUsd,
        whaleSellVolume:    whaleSellVolumeUsd,
        smartMoneyBuyCount: smartMoneyCount,
        marketCap:          growth.marketCap,
        liquidityUsd,
        priceChange24h,
        // We don't have historical liquidity to compute change yet — risk engine uses sell volume + price
        liquidityChangePct: priceChange24h < -20 ? priceChange24h * 0.5 : undefined,
    };
}

export async function runDailyScan() {
    const ethTokens  = TOKENS_TO_SCAN.filter(t => t.chain === 'ethereum').length;
    const baseTokens = TOKENS_TO_SCAN.filter(t => t.chain === 'base').length;

    console.log('\n🚀 Crypto Alpha Radar — Multi-Chain Daily Scan\n');
    console.log(`📅 ${new Date().toISOString()}`);
    console.log(`🔷 ETH Mainnet: ${ethTokens} tokens`);
    console.log(`🔵 Base Chain:  ${baseTokens} tokens`);
    console.log(`🎯 Total:       ${TOKENS_TO_SCAN.length} tokens\n`);

    const insertStmt = db.prepare(`
        INSERT INTO signal_table (type, token, address, description, score_initial)
        VALUES (?, ?, ?, ?, ?)
    `);

    // ── Scan all tokens ──────────────────────────────────────────────────────
    const bullishResults: {
        symbol: string; address: string; chain: Chain; score: number; description: string;
    }[] = [];

    const bearishResults: {
        symbol: string; chain: Chain; riskScore: number; signals: string[];
    }[] = [];

    for (const token of TOKENS_TO_SCAN) {
        try {
            const metrics = await scanToken(token);
            if (!metrics) continue;

            // ── Alpha (bullish) evaluation ───────────────────────────────────
            const alphaResult = engine.evaluateToken(metrics);
            const score       = alphaResult.totalScore;
            const chainBadge  = token.chain === 'base' ? '[Base]' : '[ETH]';

            const description = [
                `${chainBadge}`,
                `Addr: ${metrics.todayAddresses}tx vs ${metrics.yesterdayAddresses}tx`,
                `Vol: $${(metrics.todayVolume / 1000).toFixed(0)}K`,
                `Whale: $${(metrics.whaleBuyVolume / 1000).toFixed(0)}K`,
                `Smart: ${metrics.smartMoneyBuyCount}w`,
                `MCap: $${(metrics.marketCap / 1_000_000).toFixed(1)}M`,
                `Liq: $${(metrics.liquidityUsd / 1000).toFixed(0)}K`,
            ].join(' | ');

            console.log(`  ✅ ${token.symbol}: Alpha Score = ${score.toFixed(1)}/100`);
            console.log(`     ${description}`);

            bullishResults.push({ symbol: token.symbol, address: token.address, chain: token.chain, score, description });

            // ── Risk (bearish) evaluation ────────────────────────────────────
            const riskResult = engine.evaluateRisk(metrics);
            if (riskResult.riskScore > 0) {
                console.log(`  ⚠️  ${token.symbol}: Risk Score = ${riskResult.riskScore.toFixed(1)}/100  ${riskResult.signals[0] ?? ''}`);
            }
            if (riskResult.riskScore >= 30) {
                bearishResults.push({
                    symbol:    token.symbol,
                    chain:     token.chain,
                    riskScore: riskResult.riskScore,
                    signals:   riskResult.signals,
                });
            }
        } catch (err: any) {
            console.error(`  ❌ Error scanning ${token.symbol}: ${err.message}`);
        }
    }

    // ── Sort and persist ─────────────────────────────────────────────────────
    bullishResults.sort((a, b) => b.score - a.score);
    bearishResults.sort((a, b) => b.riskScore - a.riskScore);

    const top5Bullish = bullishResults.slice(0, 5);
    const top3Bearish = bearishResults.slice(0, 3);

    console.log('\n\n💎 TOP 5 ALPHA OPPORTUNITIES (Multi-Chain):\n');
    console.log('─'.repeat(65));

    db.transaction(() => {
        top5Bullish.forEach((r, i) => {
            const chainBadge = r.chain === 'base' ? '🔵 Base' : '🔷 ETH';
            console.log(`#${i + 1} ${r.symbol} ${chainBadge} — Score: ${r.score.toFixed(1)}/100`);
            console.log(`   ${r.description}`);
            console.log();
            insertStmt.run('bullish', r.symbol, r.address, r.description, r.score);
        });

        top3Bearish.forEach(r => {
            const chainBadge = r.chain === 'base' ? '🔵 Base' : '🔷 ETH';
            console.log(`🔴 RISK: ${r.symbol} ${chainBadge} — Risk: ${r.riskScore.toFixed(1)}/100`);
            console.log(`   ${r.signals.join(', ')}`);
            console.log();
            insertStmt.run('bearish', r.symbol, '', r.signals.join(' | '), r.riskScore);
        });
    })();

    console.log('─'.repeat(65));
    console.log(`\n✅ ${top5Bullish.length} bullish + ${top3Bearish.length} bearish signals stored.`);

    // Chain breakdown
    const ethTop  = bullishResults.find(r => r.chain === 'ethereum');
    const baseTop = bullishResults.find(r => r.chain === 'base');
    console.log(`\n📊 Chain breakdown:`);
    console.log(`   🔷 ETH top:  ${ethTop?.symbol ?? '-'} (${ethTop?.score.toFixed(1) ?? 0})`);
    console.log(`   🔵 Base top: ${baseTop?.symbol ?? '-'} (${baseTop?.score.toFixed(1) ?? 0})`);

    // ── Telegram report ──────────────────────────────────────────────────────
    const report: SignalReport = {
        bullish: top5Bullish,
        bearish: top3Bearish,
        timestamp: new Date().toISOString(),
    };

    await sendDailyReport(report);

    return report;
}

if (require.main === module) {
    runDailyScan().catch(console.error);
}
