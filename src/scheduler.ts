import * as dotenv from 'dotenv';
dotenv.config();

import cron from 'node-cron';
import { runDailyScan } from './index';
import { sendTestMessage } from './services/notifier';
import { runWhaleScan } from './jobs/whaleJob';
import { runCexFlowScan } from './jobs/cexFlowJob';
import { runHyperliquidScan } from './jobs/hyperliquidJob';

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║       🚀 Crypto Alpha Radar — Scheduler Daemon       ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');
console.log('📅 Schedule:');
console.log('   • Daily Scan       : Every day at 08:00 UTC (16:00 Beijing)');
console.log('   • Whale Scan       : Every 30 minutes (ETH+Base, 20 tokens)');
console.log('   • CEX Flow Scan    : Every 4 hours (exchange inflow/outflow)');
console.log('   • Hyperliquid Scan : Every 1 hour (near-liquidation alerts)');
console.log('');

// ── Startup notification ──────────────────────────────────────────────────────
sendTestMessage().then(() => {
    console.log('✅ Startup Telegram notification sent.');
}).catch(e => {
    console.warn('⚠️  Could not send startup notification:', e.message);
});

// ── Cron 1: Daily Alpha Report at 08:00 UTC (16:00 Beijing) ──────────────────
cron.schedule('0 8 * * *', async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Cron triggered — Starting daily scan...\n`);
    try {
        await runDailyScan();
        console.log(`\n✅ [${new Date().toISOString()}] Daily scan completed.\n`);
    } catch (err: any) {
        console.error(`\n❌ [${new Date().toISOString()}] Daily scan FAILED: ${err.message}\n`);
    }
}, { timezone: 'UTC' });

// ── Cron 2: Whale Scan every 30 minutes ──────────────────────────────────────
cron.schedule('*/30 * * * *', async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Cron triggered — Starting whale scan...\n`);
    try {
        await runWhaleScan();
        console.log(`\n✅ [${new Date().toISOString()}] Whale scan completed.\n`);
    } catch (err: any) {
        console.error(`\n❌ [${new Date().toISOString()}] Whale scan FAILED: ${err.message}\n`);
    }
}, { timezone: 'UTC' });

// ── Cron 3: CEX Flow Scan every 4 hours ──────────────────────────────────────
cron.schedule('0 */4 * * *', async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Cron triggered — Starting CEX flow scan...\n`);
    try {
        await runCexFlowScan();
        console.log(`\n✅ [${new Date().toISOString()}] CEX flow scan completed.\n`);
    } catch (err: any) {
        console.error(`\n❌ [${new Date().toISOString()}] CEX flow scan FAILED: ${err.message}\n`);
    }
}, { timezone: 'UTC' });

// ── Cron 4: Hyperliquid Near-Liquidation Alert every 1 hour ──────────────────
cron.schedule('0 * * * *', async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Cron triggered — Starting Hyperliquid scan...\n`);
    try {
        await runHyperliquidScan();
        console.log(`\n✅ [${new Date().toISOString()}] Hyperliquid scan completed.\n`);
    } catch (err: any) {
        console.error(`\n❌ [${new Date().toISOString()}] Hyperliquid scan FAILED: ${err.message}\n`);
    }
}, { timezone: 'UTC' });

console.log('');
console.log('✅ Scheduler is running. Press Ctrl+C to stop.');
console.log('');
console.log('💡 Manual trigger commands:');
console.log('   npx ts-node src/index.ts              # Daily scan once');
console.log('   npx ts-node src/jobs/whaleJob.ts      # Whale scan once');
console.log('   npx ts-node src/jobs/cexFlowJob.ts    # CEX flow once');
console.log('   npx ts-node src/jobs/hyperliquidJob.ts # Hyperliquid once');
console.log('');

// Keep process alive
process.on('SIGINT', () => {
    console.log('\n\n👋 Scheduler shutting down gracefully...\n');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 Scheduler received SIGTERM, shutting down...\n');
    process.exit(0);
});
