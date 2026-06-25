import * as dotenv from 'dotenv';
dotenv.config();

import db from '../db';
import { fetchTokenTransfers, detectWhaleTransfers } from '../data/etherscan';
import { TOKENS_TO_SCAN } from '../index'; // reuse token list; can be extended later

// Prepare insert statement (tx_hash unique)
const insertWhale = db.prepare(`
    INSERT OR IGNORE INTO whale_events (tx_hash, token, address, amount, side)
    VALUES (?, ?, ?, ?, ?)
`);

export async function runWhaleScan() {
    console.log('\n🐋 开始 Whale 监控扫描 (每 30 分钟)');
    for (const token of TOKENS_TO_SCAN) {
        try {
            const transfers = await fetchTokenTransfers(token.address, 1000, token.chain);
            const whaleData = detectWhaleTransfers(transfers, 0, token.whaleThreshold ?? 100000);
            // Record each whale buy as a buy event.
            for (const tx of whaleData.whaleBuys) {
                const amount = parseFloat(tx.value);
                const side = 'buy';
                insertWhale.run(tx.hash, token.symbol, token.address, amount, side);
            }
        } catch (err: any) {
            console.warn(`🐋 Whale scan error for ${token.symbol}: ${err.message}`);
        }
    }
    console.log('🐋 Whale 监控扫描完成');
}
