/**
 * Smart Money Wallet Registry — ETH Mainnet
 *
 * A curated list of known "smart money" wallets that have demonstrated
 * consistent alpha in Ethereum DeFi and meme token trading.
 *
 * Categories:
 * - 'degen': High-frequency meme/micro-cap early movers
 * - 'vc': Verified fund/VC on-chain wallets
 * - 'whale': Large holders with market-moving positions
 * - 'defi_god': DeFi protocol insiders / known expert traders
 *
 * Sources: Nansen, DeBank leaderboards, public on-chain research
 * NOTE: Update this list regularly as new wallets are identified.
 */

export interface SmartWallet {
    address: string;
    label: string;
    category: 'degen' | 'vc' | 'whale' | 'defi_god';
    notes: string;
}

export const SMART_MONEY_WALLETS: SmartWallet[] = [
    // ---- Top ETH DeFi / Meme Traders (publicly researched) ----
    {
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        label: 'Vitalik Buterin',
        category: 'defi_god',
        notes: 'Ethereum co-founder — receives and sometimes redistributes meme airdrops',
    },
    {
        address: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
        label: 'Binance: Hot Wallet 20',
        category: 'whale',
        notes: 'High-frequency transfer wallet — tracks large institutional flows',
    },
    {
        address: '0x28C6c06298d514Db089934071355E5743bf21d60',
        label: 'Binance: Hot Wallet 14',
        category: 'whale',
        notes: 'Binance hot wallet for retail withdrawals — large flows signal accumulation',
    },
    {
        address: '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549',
        label: 'Binance: Hot Wallet 6',
        category: 'whale',
        notes: 'Another Binance flow wallet',
    },
    {
        address: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
        label: 'Binance: Binance 8',
        category: 'whale',
        notes: 'Binance custody hot wallet',
    },
    {
        address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
        label: 'Binance: Binance 4',
        category: 'whale',
        notes: 'Binance hot wallet cluster',
    },
    {
        address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d',
        label: 'Coinbase: Hot Wallet',
        category: 'whale',
        notes: 'Coinbase withdrawal wallet — tracks retail buying pressure',
    },
    {
        address: '0xb5d85CBf7cB3EE0D56b3bB207D5Fc4B82f43F511',
        label: 'Coinbase: Hot Wallet 2',
        category: 'whale',
        notes: 'Coinbase primary hot wallet',
    },
    {
        address: '0xC098B2a3Aa256D2140208C3de6543aAEf5cd3A94',
        label: 'Cumberland DRW',
        category: 'vc',
        notes: 'Cumberland — institutional market maker, early token positions are a strong signal',
    },
    {
        address: '0x1B3cB81E51011b549d78bf720b0d924ac763A7C2',
        label: 'Paradigm Fund',
        category: 'vc',
        notes: 'Paradigm — top crypto VC, on-chain positions often precede major moves',
    },
];

/**
 * Get just the wallet addresses (for Etherscan API calls)
 */
export function getSmartWalletAddresses(): string[] {
    return SMART_MONEY_WALLETS.map(w => w.address);
}

/**
 * Get label for a wallet address
 */
export function getWalletLabel(address: string): string {
    const wallet = SMART_MONEY_WALLETS.find(
        w => w.address.toLowerCase() === address.toLowerCase()
    );
    return wallet?.label || 'Unknown Smart Wallet';
}
