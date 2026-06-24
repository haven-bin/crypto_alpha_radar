import { TokenMetrics, AlphaScoreResult, RiskScoreResult } from './types';
import db from './db';

export class OpportunityEngine {
    private getWeights() {
        const rows = db.prepare('SELECT dimension, weight FROM weights_table').all() as {dimension: string, weight: number}[];
        const weights: Record<string, number> = {};
        rows.forEach(r => {
            weights[r.dimension] = r.weight;
        });
        return weights;
    }

    private calculateAddressGrowthScore(yesterday: number, today: number, maxWeight: number): number {
        if (yesterday === 0) return 0;
        const growth = (today - yesterday) / yesterday;
        const normalized = Math.min(growth / 5.0, 1.0);
        return Math.max(0, normalized * maxWeight);
    }

    private calculateVolumeGrowthScore(yesterday: number, today: number, maxWeight: number): number {
        if (yesterday === 0) return 0;
        const growth = (today - yesterday) / yesterday;
        const normalized = Math.min(growth / 10.0, 1.0);
        return Math.max(0, normalized * maxWeight);
    }

    private calculateWhaleScore(whaleVolumeUsd: number, maxWeight: number): number {
        const normalized = Math.min(whaleVolumeUsd / 1_000_000, 1.0);
        return Math.max(0, normalized * maxWeight);
    }

    private calculateSmartMoneyScore(smartWalletCount: number, maxWeight: number): number {
        const normalized = Math.min(smartWalletCount / 5, 1.0);
        return Math.max(0, normalized * maxWeight);
    }

    private calculateMarketCapScore(marketCapUsd: number, maxWeight: number): number {
        const minCap = 5_000_000;
        const maxCap = 500_000_000;

        if (marketCapUsd <= minCap) return maxWeight;
        if (marketCapUsd >= maxCap) return 0;

        const range = maxCap - minCap;
        const position = marketCapUsd - minCap;
        const penalty = (position / range) * maxWeight;
        return maxWeight - penalty;
    }

    public evaluateToken(metrics: TokenMetrics): AlphaScoreResult {
        const weights = this.getWeights();

        const addressScore   = this.calculateAddressGrowthScore(metrics.yesterdayAddresses, metrics.todayAddresses, weights['address_growth'] || 30);
        const volumeScore    = this.calculateVolumeGrowthScore(metrics.yesterdayVolume, metrics.todayVolume, weights['volume_growth'] || 20);
        const whaleScore     = this.calculateWhaleScore(metrics.whaleBuyVolume, weights['whale_buying'] || 20);
        const smartMoneyScore = this.calculateSmartMoneyScore(metrics.smartMoneyBuyCount, weights['smart_money'] || 20);
        const mcScore        = this.calculateMarketCapScore(metrics.marketCap, weights['market_cap'] || 10);

        const totalScore = addressScore + volumeScore + whaleScore + smartMoneyScore + mcScore;

        return {
            token: metrics.symbol,
            address: metrics.address,
            chain: metrics.chain,
            totalScore: parseFloat(totalScore.toFixed(2)),
            breakdown: {
                addressGrowthScore: parseFloat(addressScore.toFixed(2)),
                volumeGrowthScore:  parseFloat(volumeScore.toFixed(2)),
                whaleBuyingScore:   parseFloat(whaleScore.toFixed(2)),
                smartMoneyScore:    parseFloat(smartMoneyScore.toFixed(2)),
                marketCapScore:     parseFloat(mcScore.toFixed(2))
            }
        };
    }

    /**
     * Risk Discovery Engine — identifies "rug pulls", "whale dumps", and "liquidity drains".
     * Returns a RiskScoreResult (0–100). Score > 60 = HIGH RISK ⚠️
     */
    public evaluateRisk(metrics: TokenMetrics): RiskScoreResult {
        const signals: string[] = [];

        // ── 1. Liquidity Drain (Max 40 points) ────────────────────────────────
        let liquidityDrainScore = 0;
        const liqChange = metrics.liquidityChangePct ?? 0;

        if (liqChange < -30) {
            liquidityDrainScore = 40;
            signals.push(`🚨 Liquidity drained ${Math.abs(liqChange).toFixed(1)}% — possible rug pull`);
        } else if (liqChange < -15) {
            liquidityDrainScore = 25;
            signals.push(`⚠️ Liquidity dropped ${Math.abs(liqChange).toFixed(1)}% — LP removing`);
        } else if (liqChange < -5) {
            liquidityDrainScore = 10;
            signals.push(`📉 Liquidity -${Math.abs(liqChange).toFixed(1)}%`);
        }

        // ── 2. Whale Dump (Max 40 points) ─────────────────────────────────────
        let whaleDumpScore = 0;
        const whaleSell = metrics.whaleSellVolume || 0;

        if (whaleSell > 1_000_000) {
            whaleDumpScore = 40;
            signals.push(`🐋 WHALE DUMP: $${(whaleSell / 1_000_000).toFixed(1)}M sell detected`);
        } else if (whaleSell > 500_000) {
            whaleDumpScore = 25;
            signals.push(`🐋 Large whale sell: $${(whaleSell / 1000).toFixed(0)}K`);
        } else if (whaleSell > 100_000) {
            whaleDumpScore = 10;
            signals.push(`🐋 Whale sell: $${(whaleSell / 1000).toFixed(0)}K`);
        }

        // Amplify if simultaneously liquidity is also draining
        if (liquidityDrainScore > 10 && whaleDumpScore > 10) {
            whaleDumpScore = Math.min(40, whaleDumpScore * 1.5);
            signals.push(`🔴 Combined signal: whale dump + liquidity removal`);
        }

        // ── 3. Price Collapse (Max 20 points) ─────────────────────────────────
        let priceCollapsScore = 0;
        const priceChange = metrics.priceChange24h ?? 0;

        if (priceChange < -40) {
            priceCollapsScore = 20;
            signals.push(`💀 Price -${Math.abs(priceChange).toFixed(1)}% in 24h`);
        } else if (priceChange < -20) {
            priceCollapsScore = 12;
            signals.push(`📉 Price -${Math.abs(priceChange).toFixed(1)}% in 24h`);
        } else if (priceChange < -10) {
            priceCollapsScore = 5;
            signals.push(`📉 Price -${Math.abs(priceChange).toFixed(1)}% in 24h`);
        }

        const riskScore = Math.min(100, liquidityDrainScore + whaleDumpScore + priceCollapsScore);

        return {
            token:   metrics.symbol,
            address: metrics.address,
            chain:   metrics.chain,
            riskScore: parseFloat(riskScore.toFixed(2)),
            signals,
            breakdown: {
                liquidityDrainScore: parseFloat(liquidityDrainScore.toFixed(2)),
                whaleDumpScore:      parseFloat(Math.min(40, whaleDumpScore).toFixed(2)),
                priceCollapsScore:   parseFloat(priceCollapsScore.toFixed(2))
            }
        };
    }
}
