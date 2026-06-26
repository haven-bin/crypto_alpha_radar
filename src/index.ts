import * as dotenv from 'dotenv';
dotenv.config();

import { OpportunityEngine } from './engine';
import { TokenMetrics, Chain, SignalReport } from './types';
import db, { initDB } from './db';
import { fetchTokenPairs, getBestPair, estimateGrowthMetrics } from './data/dexscreener';
import { fetchTokenTransfers, detectWhaleTransfers, checkSmartMoneyBuys } from './data/etherscan';
import { getSmartWalletAddresses } from './data/smartmoney';
import { sendDailyReport } from './services/notifier';
import { TOKENS_TO_SCAN, ScanToken } from './tokens';
import { detectDivergence } from './signals/divergence';
import { detectWashTrading } from './signals/washDetector';
export { TOKENS_TO_SCAN } from './tokens'; // re-export for backward compat

initDB();

const engine = new OpportunityEngine();

// -------------------------------------------------------
// Token registry is now in src/tokens.ts
// -------------------------------------------------------

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

    // 2. Whale detection via Etherscan V2 (chain-aware)
    let whaleBuyVolumeUsd  = 0;
    let whaleSellVolumeUsd = 0;
    let transfers: any[]   = [];
    if (growth.priceUsd > 0) {
        transfers = await fetchTokenTransfers(token.address, 1000, token.chain);
        const whaleData = detectWhaleTransfers(transfers, growth.priceUsd, token.whaleThreshold ?? 10_000);
        whaleBuyVolumeUsd  = whaleData.totalWhaleBuyVolumeUsd;
        whaleSellVolumeUsd = whaleData.totalWhaleSellVolumeUsd ?? 0;
    }

    // 2b. Volume/Price Divergence signal
    const divergence = detectDivergence(bestPair);

    // 2c. Wash trading detection (uses same transfers from Etherscan)
    const washResult = transfers.length > 0
        ? detectWashTrading(transfers, 2)
        : null;

    // 3. Smart money tracking (only qualified wallets ≥60% win rate)
    const smartWallets = getSmartWalletAddresses(true).slice(0, 3);
    const { count: smartMoneyCount } = await checkSmartMoneyBuys(
        token.address, smartWallets, 24, token.chain
    );

    // 4. Liquidity & price info from DexScreener pair
    const liquidityUsd     = bestPair.liquidity?.usd ?? 0;
    const priceChange24h   = bestPair.priceChange?.h24 ?? 0;

    if (divergence.signal !== 'none') {
        console.log(`     📊 量价背离: ${divergence.emoji} ${divergence.label}`);
    }
    if (washResult?.isWashTrading) {
        console.log(`     ⚠️  疑似洗量: 可疑比例=${(washResult.washRatio*100).toFixed(0)}%，置信度=${washResult.confidence}%`);
    }

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
        liquidityChangePct: priceChange24h < -20 ? priceChange24h * 0.5 : undefined,
        divergenceScore:    divergence.score,
        divergenceSignal:   divergence.signal,
        divergenceLabel:    divergence.label,
        washPenalty:        washResult?.penalty ?? 0,
        isWashTrading:      washResult?.isWashTrading ?? false,
        washConfidence:     washResult?.confidence ?? 0,
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
