/**
 * CEX（中心化交易所）热钱包地址库
 * 用于计算代币在 24h 内的净流入/流出交易所情况
 *
 * 数据来源：Etherscan 标签、Arkham Intelligence、社区整理
 */

export const CEX_ADDRESSES: Record<string, string[]> = {
    Binance: [
        '0x28C6c06298d514Db089934071355E5743bf21d60', // Binance Hot Wallet 14
        '0xDFd5293D8e347dFe59E90eFd55b2956a1343963D', // Binance Hot Wallet 20
        '0x56Eddb7aa87536c09CCc2793473599fD21A8b17F', // Binance Hot Wallet
        '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', // Binance Hot Wallet 2
        '0x0681d8db095565fe8a346fa0277bffde9c0edbbf', // Binance Hot Wallet 3
        '0xbe0eb53f46cd790cd13851d5ef9d827d4cd35a77', // Binance Cold Wallet
        '0xF977814e90dA44bFA03b6295A0616a897441aceC', // Binance 8
        '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3', // Binance 9
    ],
    Coinbase: [
        '0xa090e606e30bD747d4E6245a1517EbE430F0057e', // Coinbase 1
        '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3', // Coinbase 2
        '0x503828976D22510aad0201ac7EC88293211D23Da', // Coinbase 3
        '0xddfAbCdc4D8FfC6d5beaf154f18B778f892A0740', // Coinbase 4
        '0x3cd751e6b0078be393132286c442345e5dc49699', // Coinbase 5
    ],
    OKX: [
        '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b', // OKX 1
        '0x236F9F97e0E62388479bf9E5BA4889e46B0273C3', // OKX 2
        '0x461249076b88189f8AC9418De28B365859E46BFd', // OKX 3
        '0xa7EFae728D2936e78BDA97dc267687568dD593f3', // OKX 4
    ],
    Kraken: [
        '0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2', // Kraken 1
        '0x0A869d79a7052C7f1b55a8EbabbEa3420F0D1E13', // Kraken 2
        '0xE853c56864A2ebe4576a807D26Fdc4A0adA51919', // Kraken 3
    ],
    Bybit: [
        '0xf89d7b9c864f589bbF53a82105107622B35EaA40', // Bybit Hot
        '0x1Db92e2EeBC8E0c075a02BeA49a2935BcD2dFCF4', // Bybit 2
    ],
    Bitfinex: [
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', // Bitfinex Hot
        '0x876EabF441B2EE5B5b0554Fd502a8E0600950cFa', // Bitfinex 2
    ],
};

// 扁平化的地址集合（用于快速 lookup）
export const ALL_CEX_ADDRESSES = new Set(
    Object.values(CEX_ADDRESSES).flat().map(a => a.toLowerCase())
);

// 地址 → 交易所名称映射
export const ADDRESS_TO_CEX: Record<string, string> = {};
for (const [cex, addrs] of Object.entries(CEX_ADDRESSES)) {
    for (const addr of addrs) {
        ADDRESS_TO_CEX[addr.toLowerCase()] = cex;
    }
}
