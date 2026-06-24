import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'https://api.etherscan.io/v2/api';
const API_KEY = process.env.ETHERSCAN_API_KEY || '';

// Chain ID mapping for Etherscan V2 multi-chain support
const CHAIN_IDS: Record<string, number> = {
    ethereum: 1,
    base: 8453,
};

// Delay helper to respect 5 req/sec rate limit
function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe token amount parsing using BigInt to avoid float64 precision loss.
 * For tokens like PEPE (18 decimals), raw values can be > 10^27.
 * parseFloat() loses precision at this scale, causing whale detection to fail.
 */
function parseTokenAmountSafe(value: string, decimals: number): number {
    try {
        const valueBig = BigInt(value);
        // CRITICAL: use BigInt(10) ** BigInt(decimals), NOT BigInt(10 ** decimals)
        // 10 ** 18 = 1e18 which overflows float64 (max safe int is ~9e15)
        const shift = BigInt(10) ** BigInt(decimals);
        const whole = valueBig / shift;
        const remainder = valueBig % shift;
        return Number(whole) + Number(remainder) / Number(shift);
    } catch {
        return parseFloat(value) / Math.pow(10, decimals);
    }
}

export interface TokenTransfer {
    blockNumber: string;
    timeStamp: string;
    hash: string;
    from: string;
    to: string;
    contractAddress: string;
    value: string;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimal: string;
    gasUsed: string;
}

/**
 * Fetch recent ERC-20 transfers for a token contract.
 * Returns the latest `limit` transfers sorted by newest first.
 */
export async function fetchTokenTransfers(
    tokenAddress: string,
    limit: number = 1000,
    chain: 'ethereum' | 'base' = 'ethereum'
): Promise<TokenTransfer[]> {
    try {
        const res = await axios.get(BASE_URL, {
            params: {
                chainid: CHAIN_IDS[chain],
                module: 'account',
                action: 'tokentx',
                contractaddress: tokenAddress,
                page: 1,
                offset: limit,
                sort: 'desc',
                apikey: API_KEY,
            }
        });

        if (res.data.status !== '1') return [];
        return res.data.result as TokenTransfer[];
    } catch (error: any) {
        console.error(`[Etherscan/${chain}] Failed to fetch transfers for ${tokenAddress}:`, error.message);
        return [];
    }
}

// Known DEX router / pair factory addresses (heuristic for sell detection)
const DEX_ADDRESSES = new Set([
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2 Router
    '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3 Router
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap V3 Router 2
    '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24', // Uniswap V3 (Base)
    '0x327df1e6de05895d2ab08513aadd9313fe505d86', // BaseSwap Router
    '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43', // Aerodrome Router
]);

/**
 * Detect whale transactions: transfers with USD value > threshold.
 * Also detects whale SELLS (large transfers TO known DEX routers).
 * Requires current token price to convert transfer value to USD.
 */
export function detectWhaleTransfers(
    transfers: TokenTransfer[],
    priceUsd: number,
    minUsdThreshold: number = 50_000
): { whaleBuys: TokenTransfer[]; totalWhaleBuyVolumeUsd: number; totalWhaleSellVolumeUsd: number } {
    const whaleBuys: TokenTransfer[] = [];
    let totalWhaleBuyVolumeUsd  = 0;
    let totalWhaleSellVolumeUsd = 0;

    for (const tx of transfers) {
        const decimals = parseInt(tx.tokenDecimal) || 18;
        // Use BigInt-safe parsing to avoid precision loss for tokens like PEPE
        const tokenAmount = parseTokenAmountSafe(tx.value, decimals);
        const usdValue = tokenAmount * priceUsd;

        if (usdValue >= minUsdThreshold) {
            const toAddr = tx.to.toLowerCase();
            const isDexSell = DEX_ADDRESSES.has(toAddr);

            if (isDexSell) {
                // Large transfer INTO a DEX router = likely whale sell
                totalWhaleSellVolumeUsd += usdValue;
            } else {
                whaleBuys.push(tx);
                totalWhaleBuyVolumeUsd += usdValue;
            }
        }
    }

    return { whaleBuys, totalWhaleBuyVolumeUsd, totalWhaleSellVolumeUsd };
}

/**
 * Fetch all ERC-20 token transactions for a specific wallet address.
 * Used to track smart money wallets.
 */
export async function fetchWalletTokenTxs(
    walletAddress: string,
    limit: number = 50,
    chain: 'ethereum' | 'base' = 'ethereum'
): Promise<TokenTransfer[]> {
    try {
        await delay(250);
        const res = await axios.get(BASE_URL, {
            params: {
                chainid: CHAIN_IDS[chain],
                module: 'account',
                action: 'tokentx',
                address: walletAddress,
                page: 1,
                offset: limit,
                sort: 'desc',
                apikey: API_KEY,
            }
        });

        if (res.data.status !== '1') return [];
        return res.data.result as TokenTransfer[];
    } catch (error: any) {
        console.error(`[Etherscan/${chain}] Failed to fetch wallet txs for ${walletAddress}:`, error.message);
        return [];
    }
}

/**
 * Check how many smart money wallets have bought a specific token
 * in the last `hoursBack` hours.
 */
export async function checkSmartMoneyBuys(
    tokenAddress: string,
    smartWallets: string[],
    hoursBack: number = 24,
    chain: 'ethereum' | 'base' = 'ethereum'
): Promise<{ walletsBought: string[]; count: number }> {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - hoursBack * 3600;
    const walletsBought: string[] = [];

    for (const wallet of smartWallets) {
        const txs = await fetchWalletTokenTxs(wallet, 50, chain);
        const recentBuys = txs.filter(tx =>
            tx.contractAddress.toLowerCase() === tokenAddress.toLowerCase() &&
            parseInt(tx.timeStamp) >= cutoffTimestamp &&
            tx.to.toLowerCase() === wallet.toLowerCase()
        );

        if (recentBuys.length > 0) {
            walletsBought.push(wallet);
        }
        await delay(250);
    }

    return { walletsBought, count: walletsBought.length };
}
