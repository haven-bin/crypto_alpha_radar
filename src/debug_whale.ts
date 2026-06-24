import * as dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const API_KEY = process.env.ETHERSCAN_API_KEY || '';

// PEPE token - most active ETH meme token
const TOKEN = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
const PEPE_PRICE = 0.000013; // ~$0.000013 per PEPE
const DECIMALS = 18;

async function debug() {
    console.log('🔍 Fetching last 1000 PEPE transfers from Etherscan...\n');

    const res = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
            chainid: 1,
            module: 'account',
            action: 'tokentx',
            contractaddress: TOKEN,
            page: 1,
            offset: 1000,
            sort: 'desc',
            apikey: API_KEY,
        }
    });

    if (res.data.status !== '1') {
        console.error('❌ API Error:', res.data.message, res.data.result);
        return;
    }

    const transfers = res.data.result;
    console.log(`✅ Got ${transfers.length} transfers\n`);

    // Show first 3 raw values to understand format
    console.log('📋 Sample raw values (first 3):');
    transfers.slice(0, 3).forEach((tx: any) => {
        console.log(`  value="${tx.value}" decimal="${tx.tokenDecimal}"`);

        // OLD method (broken for large numbers)
        const oldMethod = parseFloat(tx.value) / Math.pow(10, DECIMALS);

        // NEW method (BigInt safe)
        const valueBig = BigInt(tx.value);
        const shift = BigInt(10) ** BigInt(DECIMALS); // ← key fix: BigInt(10) ** BigInt(18)
        const whole = valueBig / shift;
        const remainder = valueBig % shift;
        const newMethod = Number(whole) + Number(remainder) / Math.pow(10, DECIMALS);

        const oldUsd = oldMethod * PEPE_PRICE;
        const newUsd = newMethod * PEPE_PRICE;

        console.log(`  Old method: ${oldMethod.toFixed(0)} PEPE = $${oldUsd.toFixed(2)}`);
        console.log(`  New method: ${newMethod.toFixed(0)} PEPE = $${newUsd.toFixed(2)}`);
        console.log();
    });

    // Find all whale transfers using corrected BigInt
    const THRESHOLD = 20_000;
    let whaleCount = 0;
    let maxUsd = 0;
    const top10: { usd: number; tokens: string }[] = [];

    for (const tx of transfers) {
        const valueBig = BigInt(tx.value);
        const shift = BigInt(10) ** BigInt(DECIMALS);
        const whole = valueBig / shift;
        const tokenAmount = Number(whole);
        const usd = tokenAmount * PEPE_PRICE;

        top10.push({ usd, tokens: whole.toString() });
        if (usd > maxUsd) maxUsd = usd;
        if (usd >= THRESHOLD) whaleCount++;
    }

    top10.sort((a, b) => b.usd - a.usd);

    console.log(`\n📊 Results:`);
    console.log(`  Total transfers sampled: ${transfers.length}`);
    console.log(`  Whale transfers (>$${THRESHOLD.toLocaleString()}): ${whaleCount}`);
    console.log(`  Largest transfer: $${maxUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    console.log(`\n🐋 Top 10 transfers by USD value:`);
    top10.slice(0, 10).forEach((t, i) => {
        console.log(`  #${i+1}: ${parseInt(t.tokens).toLocaleString()} PEPE = $${t.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    });
}

debug().catch(console.error);
