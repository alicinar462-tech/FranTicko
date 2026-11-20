# FranTicko

**A Ticko Testnet API integration project built with Next.js, TypeScript, and the App Router.**

FranTicko is the project workspace for the **Ticko API Integration Challenge**. It provides a typed client for Ticko's REST API and implements authenticated trading operations using **Type A EIP-712 signing**.

The project currently targets Ticko Testnet.

## Features

### Ticko API Integration
- Typed API client implemented in `lib/ticko/`.
- Public REST API integration for market and account data.
- Server-side handling of authenticated trading requests.

### Authentication & Signing
- **Type A EIP-712 signing** for authenticated write operations.
- Per-signer, strictly increasing request nonces.
- Agent Wallet signing through the configured Agent private key.
- Support for a separate `target_address`, allowing the Agent wallet to sign requests on behalf of the main account.

### Market & Account Data
- Market symbols — `GET /market/symbols`
- Account balance — `GET /account/balance`
- Order book data
- Order details — `GET /trade/order`
- Order history
- Trade executions — `GET /trade/executions`

### Trading Operations
- **Place Order** — `POST /trade/orders`
  - Limit and market orders
  - Buy and sell sides
  - Cross and isolated margin modes
  - GTC, IOC, and FOK time-in-force options
  - Post-only orders
  - Position-side support
- **Modify Order** — `POST /trade/orders/modify`
- **Cancel Order** — `POST /trade/orders/cancel`
- **Price Match** support:
  - `queue_1`
  - `queue_5`
  - `counter_party_1`
  - `counter_party_5`

### Server-Side Security
- Agent private keys are read exclusively from server environment variables.
- Private keys are never exposed to browser-side code.
- Sensitive configuration is stored locally in `.env.local`, which is excluded from Git.

A minimal verification endpoint is also available:

`GET /api/ticko/symbols`

This route proxies the Ticko `getSymbols()` request.

## Tech Stack

- Next.js 16
- React
- TypeScript
- Ticko REST API
- Viem
- EIP-712 Typed Data Signing

## Prerequisites

- Node.js (LTS)
- npm

## Getting Started

Clone the repository and install dependencies:

```bash
npm install
```

Create your local environment file from the example:

```bash
cp .env.example .env.local
```

Configure the required environment variables in `.env.local`.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

See `.env.example` for the available configuration variables.

| Variable | Description |
|---|---|
| `TICKO_BASE_URL` | Ticko REST API base URL. Defaults to Testnet. |
| `TICKO_AGENT_PRIVATE_KEY` | Agent/API signer private key. **Secret.** |
| `TICKO_AGENT_ADDRESS` | Agent wallet address used as `signer_address`. |
| `TICKO_ACCOUNT_ADDRESS` | Main account address used as `target_address`. |

**Security notice:** Never commit real credentials or private keys. Keep them in your local `.env.local` file and ensure they are never exposed to client-side code.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |

## Testnet Verification

The following trading operations were tested against Ticko Testnet using **BTC-USDT (symbol ID: 20001)** and a quantity of **0.001 per order**.

| Operation | Verification |
|---|---|
| Maker Order | A post-only limit buy was placed and filled at the best bid. The execution was confirmed as a maker trade (`is_maker = true`). |
| Modify Order | The price of a resting order was successfully updated. |
| Cancel Order | A resting order was successfully cancelled and reached the terminal `cancelled` state with zero executions. |
| Price Match | A buy order using `price_match = "queue_1"` was accepted, rested, and subsequently filled as a maker at the resolving best-bid price. |

These results reflect the operations verified on Ticko Testnet.

## Roadmap & Remaining Challenge Items

The following items have not yet been completed or independently verified:

- Full **10M API trading volume** requirement. Its definition is external to the Ticko API documentation and has not been verified.
- Verification of all four `price_match` values. Only `queue_1` has been tested successfully.
- Confirmation or receipt of a challenge reward.
- Production/mainnet support. The current implementation targets Ticko Testnet.

## Project Status

FranTicko currently provides a working Ticko Testnet API integration and trading-operation workflow.

Wallet connection and the public live-demo experience are planned for a later stage, following the availability of the required RPC infrastructure.

---

**Built for the Ticko API Integration Challenge.**