import * as dotenv from 'dotenv';
dotenv.config();

import cron from 'node-cron';
import { runDailyScan } from './index';
import { sendTestMessage } from './services/notifier';
import { runWhaleScan } from './jobs/whaleJob';

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║       🚀 Crypto Alpha Radar — Scheduler Daemon       ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');
console.log('📅 Schedule:');
console.log('   • Daily Scan: Every day at 08:00 UTC (16:00 Beijing)');
console.log('   • The process will stay alive and run the scan daily.');
console.log('');

// ── Send startup test message ─────────────────────────────────────────────────
sendTestMessage().then(() => {
    console.log('✅ Startup Telegram notification sent.');
}).catch(e => {
    console.warn('⚠️  Could not send startup notification:', e.message);
});

// ── Cron Job: Daily scan at 08:00 UTC ────────────────────────────────────────
// Cron format: minute hour day-of-month month day-of-week
//              0      8    *              *     *
cron.schedule('0 8 * * *', async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Cron triggered — Starting daily scan...\n`);
    try {
        await runDailyScan();
        console.log(`\n✅ [${new Date().toISOString()}] Daily scan completed.\n`);
    } catch (err: any) {
        console.error(`\n❌ [${new Date().toISOString()}] Daily scan FAILED: ${err.message}\n`);
    }
}, {
    timezone: 'UTC',
});

// ── Cron Job: Whale scan every 30 minutes ───────────────────────────────────────
cron.schedule('*/30 * * * *', async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Cron triggered — Starting whale scan...\n`);
    try {
        await runWhaleScan();
        console.log(`\n✅ [${new Date().toISOString()}] Whale scan completed.\n`);
    } catch (err: any) {
        console.error(`\n❌ [${new Date().toISOString()}] Whale scan FAILED: ${err.message}\n`);
    }
}, { timezone: 'UTC' });

console.log('');
console.log('✅ Scheduler is running. Press Ctrl+C to stop.');
console.log('   Next scan: Tomorrow at 08:00 UTC (16:00 Beijing)');
console.log('');
console.log('💡 Tip: To trigger a scan immediately, run:');
console.log('   npx ts-node src/index.ts');
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
