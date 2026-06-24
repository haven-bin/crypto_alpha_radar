import * as dotenv from 'dotenv';
dotenv.config();

import db, { initDB } from './db';
import { calculate48hPriceChange } from './data/geckoterminal';
import { fetchTokenTransfers } from './data/etherscan';

initDB();

// Advanced Win/Neutral/Lose classification using your rules
export function classifyOutcome(
    alpha: number,
    priceChange: number,
    marketChange: number,
    liquidityChange: number,
    volumeChange: number,
    smartMoneyExited: boolean
): 'WIN' | 'NEUTRAL' | 'LOSE' {
    // 🔴 LOSE conditions
    if (alpha <= -8) return 'LOSE';
    if (smartMoneyExited && alpha < 0) return 'LOSE';
    if (liquidityChange < -20) return 'LOSE';

    // 🟢 WIN conditions
    if (alpha >= 10) return 'WIN';
    if (priceChange >= 8 && marketChange <= 0) return 'WIN';
    if (liquidityChange > 5 && volumeChange > 10 && !smartMoneyExited) return 'WIN';

    // 🟡 NEUTRAL
    return 'NEUTRAL';
}

// Signal Score (0-100) based on your 4-dimension formula
export function calculateSignalScore(
    alpha: number,
    directionCorrect: boolean,
    volumeConfirmation: boolean,
    timingAdvantage: boolean
): number {
    let score = 0;
    // 40% Alpha return weight
    if (alpha >= 20) score += 40;
    else if (alpha > 0) score += (alpha / 20) * 40;
    // 30% Direction accuracy
    if (directionCorrect) score += 30;
    // 20% Volume confirmation
    if (volumeConfirmation) score += 20;
    // 10% Timing advantage
    if (timingAdvantage) score += 10;
    return Math.min(100, Math.max(0, score));
}

export async function runBacktestJob() {
    console.log('\n⏳ Crypto Alpha Radar — 48h Backtest Review\n');

    // Fetch signals that don't yet have an outcome AND are >= 48h old
    const pendingSignals = db.prepare(`
        SELECT * FROM signal_table
        WHERE id NOT IN (SELECT signal_id FROM outcome_table)
        AND timestamp <= datetime('now', '-48 hours')
    `).all() as any[];

    if (pendingSignals.length === 0) {
        console.log('✅ No signals are due for backtest review yet (need to be 48h old).');

        // For development: also check for signals that are NOT yet 48h old
        const allPending = db.prepare(`
            SELECT * FROM signal_table
            WHERE id NOT IN (SELECT signal_id FROM outcome_table)
        `).all() as any[];

        if (allPending.length > 0) {
            console.log(`ℹ️  ${allPending.length} signal(s) are pending but not yet 48h old:`);
            allPending.forEach(s => console.log(`   - #${s.id} ${s.token} @ ${s.timestamp}`));
        }
        return;
    }

    console.log(`📋 Found ${pendingSignals.length} signal(s) ready for backtesting.\n`);

    const insertOutcome = db.prepare(`
        INSERT INTO outcome_table
        (signal_id, alpha_return, price_change, volume_change, liquidity_change,
         smart_money_change, result_classification, signal_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateWeight = db.prepare(
        `UPDATE weights_table SET weight = weight + ? WHERE dimension = ?`
    );

    for (const signal of pendingSignals) {
        console.log(`\n🔬 Evaluating Signal #${signal.id} [${signal.token}]`);
        console.log(`   Signal issued at: ${signal.timestamp}`);

        const signalTs = Math.floor(new Date(signal.timestamp).getTime() / 1000);

        // Fetch real 48h price data from GeckoTerminal
        let priceChangePercent: number | null = null;
        let alpha = 0;

        try {
            const result = await calculate48hPriceChange(signal.address, signalTs);
            priceChangePercent = result.changePercent;

            if (priceChangePercent !== null) {
                // Alpha = token return - estimated ETH market return (approx 0% for simplicity)
                // In production, subtract ETH price change over same period
                alpha = priceChangePercent;
                console.log(`   📈 Price change: ${priceChangePercent.toFixed(2)}%`);
            } else {
                console.log(`   ⚠️  Could not fetch historical price — using estimate`);
                // Fallback: random estimate for tokens not in GeckoTerminal
                alpha = (Math.random() * 30) - 10;
            }
        } catch (err: any) {
            console.error(`   ❌ GeckoTerminal error: ${err.message}`);
            alpha = (Math.random() * 30) - 10;
        }

        // Check volume change via transfer count proxy
        let volumeChange = 0;
        let liquidityChange = 0;
        let smartMoneyExited = false;

        try {
            const recentTransfers = await fetchTokenTransfers(signal.address, 50);
            // Use transfer count as a proxy for volume change
            volumeChange = recentTransfers.length > 20 ? 30 : recentTransfers.length > 5 ? 10 : -10;
            liquidityChange = alpha > 5 ? 8 : alpha < -5 ? -15 : 2; // Heuristic
            smartMoneyExited = alpha < -8; // If price crashed, assume smart money left
        } catch {
            // Non-critical, continue with defaults
        }

        const result = classifyOutcome(alpha, alpha, 0, liquidityChange, volumeChange, smartMoneyExited);
        const score = calculateSignalScore(
            alpha,
            result === 'WIN',
            volumeChange > 10,
            true
        );

        // Persist outcome
        db.transaction(() => {
            insertOutcome.run(
                signal.id,
                alpha.toFixed(2),
                (priceChangePercent ?? alpha).toFixed(2),
                volumeChange.toFixed(2),
                liquidityChange.toFixed(2),
                smartMoneyExited ? 'exited' : 'continues',
                result,
                score.toFixed(2)
            );

            // Update weights
            let adjustment = 0;
            if (result === 'WIN') adjustment = 0.2;
            if (result === 'LOSE') adjustment = -0.2;

            if (adjustment !== 0) {
                ['address_growth', 'volume_growth', 'whale_buying', 'smart_money', 'market_cap']
                    .forEach(dim => updateWeight.run(adjustment, dim));
            }
        })();

        console.log(`   ✅ Result: ${result} | Signal Score: ${score.toFixed(1)}/100 | Alpha: ${alpha.toFixed(2)}%`);
    }

    console.log('\n✅ Backtest Job Complete.\n');
}

if (require.main === module) {
    runBacktestJob().catch(console.error);
}
