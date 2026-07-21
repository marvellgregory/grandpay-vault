# GrandPay Vault

**Secure today's gift. Delivered exactly when it matters.**

GrandPay Vault is a programmable USDC gifting application built on [Arc](https://www.arc.io), Circle's open Layer-1 blockchain. It lets users create time-locked vaults that hold USDC until a specified unlock date — birthdays, graduations, weddings, holidays — then the recipient claims the funds onchain.

🔗 **Live demo:** [marvellgregory.github.io/grandpay-vault](https://marvellgregory.github.io/grandpay-vault/)

---

## What It Does

- **Gift Vaults** — Lock USDC with a personal e-card (text, image, voice, or video). Set an unlock date. Share via WhatsApp, Telegram, SMS, or email. The recipient withdraws after the date passes.
- **ChainSplit** — Split any bill in USDC across multiple wallets. Equal or custom amounts. One transaction, settled in under a second on Arc.
- **Five vault types** — Birthday, Milestone, Family Allowance, Memory, and Holiday. Each comes with themed greeting templates.
- **Corporate gifting** — Bulk upload recipients via CSV/XLSX, custom branding, campaign scheduling, budget controls, and approval workflows (planned).

## How It Works

1. Connect a Web3 wallet (MetaMask or any EVM-compatible wallet).
2. Choose a gift type and customize the e-card.
3. Enter the USDC amount and unlock date. Confirm the transaction.
4. USDC is locked in a smart contract onchain. No intermediary holds the funds.
5. Share the gift link. The recipient connects their wallet and withdraws after the unlock date.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Arc Testnet (Circle's L1) |
| Smart Contracts | Solidity (deployed via Hardhat) |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Web3 | ethers.js v6 |
| Token | USDC (ERC-20 interface on Arc) |
| Hosting | GitHub Pages |

## Smart Contracts

Deployed on Arc Testnet:

| Contract | Address |
|----------|---------|
| GrandPay Vault | `0x9e97f978F2954483E60D11D2B67eef3E348cFF6d` |
| ChainSplit | `0xc91c154FEc0B75fBD99c4E459103b3D89B027Bdb` |
| USDC (Arc) | `0x3600000000000000000000000000000000000000` |

**Vault ABI:**
- `createVault(address token, address recipient, uint256 amount, uint256 unlockDate, string message)` → `uint256 vaultId`
- `withdraw(address token, uint256 vaultId)`
- `getVault(uint256 vaultId)` → `(creator, recipient, amount, unlockDate, message, withdrawn)`
- `getUserVaults(address user)` → `uint256[]`

**Splitter ABI:**
- `splitPayment(address[] recipients, uint256[] amounts, address token)`
- `splitEqual(address[] recipients, uint256 totalAmount, address token)`

## Arc Testnet Configuration

| Parameter | Value |
|-----------|-------|
| Chain ID | `5042002` (`0x4CFED2`) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Gas Token | USDC |
| Finality | Sub-second |

The app auto-adds Arc Testnet to MetaMask on first connect. Get testnet USDC from the [Arc faucet](https://docs.arc.io).

## Why Arc

GrandPay Vault is built on Arc because:

- **USDC is the gas token.** Users pay fees in the same stablecoin they're gifting. No volatile native token needed.
- **Sub-second finality.** Gifts settle in under a second. No waiting for block confirmations.
- **EVM compatible.** Standard Solidity contracts deployed with familiar tooling (Hardhat, ethers.js).
- **Circle integration.** Arc is integrated with Circle's full-stack platform including CCTP, Gateway, and developer services.

## Project Status

This is a **testnet application**. Do not use real funds.

| Milestone | Status |
|-----------|--------|
| MVP Gift Vault | ✅ Complete |
| Wallet Connect (6 chains) | ✅ Complete |
| ChainSplit (equal + custom) | ✅ Complete |
| Arc Testnet deployment | ✅ Complete |
| GrandGuide FAQ assistant | ✅ Complete |
| Mobile experience | 🔲 Planned |
| Recurring gifts | 🔲 Planned |
| Family accounts | 🔲 Planned |
| Arc Mainnet launch | 🔲 Planned |

## Security

- **Non-custodial.** GrandPay Vault never holds user funds. USDC is locked in the smart contract. Only the designated recipient can withdraw after the unlock date.
- **Open source.** All code is publicly available in this repository.
- **Not audited.** The smart contracts have not been formally audited by a third-party security firm. Use at your own risk.
- **Testnet only.** Currently deployed on Arc Testnet. Not a production application.

## Local Development

```bash
# Clone the repository
git clone https://github.com/marvellgregory/grandpay-vault.git
cd grandpay-vault

# Open in browser (no build step required)
open index.html
# or use a local server
npx serve .
```

The frontend is pure HTML/CSS/JS with no build dependencies. `app.js` handles all wallet interactions via ethers.js loaded from CDN.

## File Structure

```
grandpay-vault/
├── index.html    # Complete frontend (HTML + CSS + inline JS)
├── app.js        # Web3 logic: wallet, contracts, chain switching
└── README.md     # This file
```

## Disclaimer

GrandPay Vault is a testnet application deployed on Arc Testnet. It has not been audited by a third-party security firm. Do not use real funds. The smart contracts are provided as-is without warranty. GrandPay Vault is not affiliated with, endorsed by, or officially partnered with Circle or Arc. "Built on Arc" indicates the application is deployed on Arc's public testnet infrastructure. USDC is issued by regulated affiliates of Circle. This is not financial advice. Use at your own risk.

## Contact

- **Builder:** Marvell Darlyn Gregory
- **X:** [@YoungestGrandad](https://x.com/YoungestGrandad)
- **Telegram:** [@Minerbtc1985](https://t.me/Minerbtc1985)
- **Email:** marvellgregory85@gmail.com

## License

MIT
