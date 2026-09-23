# FranTicko

A [Next.js](https://nextjs.org) project built with TypeScript and the App
Router. This repository is the project workspace for the **Ticko API
Integration Challenge** and contains a working Ticko **Testnet** API
integration.

## What's implemented

- **Ticko Testnet API integration** via `lib/ticko/*` (a small typed client that
  wraps the public REST endpoints).
- **Type A EIP-712 signing** (`lib/ticko/auth.ts`) for authenticated write
  operations, including strictly-increasing, per-signer request nonces.
- **Agent Wallet signing** — write requests are signed by an Agent/API key
  (`signer_address`) using the configured agent private key.
- **target_address support** — orders operate on a main account
  (`target_address`) separate from the signing Agent wallet.
- **Market symbols** — `GET /market/symbols` via the client.
- **Account balance** — `GET /account/balance`.
- **Place Order** — `POST /trade/orders` (limit/market, buy/sell, cross/isolated,
  GTC/IOC/FOK, `post_only`, position side).
- **Modify Order** — `POST /trade/orders/modify` (price changes).
- **Cancel Order** — `POST /trade/orders/cancel`.
- **Order Detail** — `GET /trade/order`.
- **Executions** — `GET /trade/executions`.
- **Price Match** — supported via the `price_match` field (`queue_1`, `queue_5`,
  `counter_party_1`, `counter_party_5`).
- **Server-side secret handling** — the private key is read only from the
  server environment and is never sent to the browser.

A minimal verification route is available at
`GET /api/ticko/symbols` (proxies `getSymbols()`).

## Security

**`TICKO_AGENT_PRIVATE_KEY` is server-side only and must never be exposed to
the browser or committed to source control.** It is read from `.env.local`,
which is git-ignored. Keep it out of client components and out of any committed
files.

## Testnet default

**`TICKO_BASE_URL` defaults to the Ticko Testnet**
(`https://api.testnet.ticko.xyz/v1`). Set it explicitly if you intend to target
any other environment. Testnet is the supported default.

## Prerequisites

- Node.js (LTS)
- npm

## Getting Started

Install dependencies:

```bash
npm install
```

Copy the environment template and fill in your values:

```bash
cp .env.example .env.local
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the
result.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — start the production server
- `npm run lint` — run ESLint

## Environment Variables

See the `.env.example` file for the available configuration variables:

- `TICKO_BASE_URL` — Ticko REST base URL (defaults to Testnet).
- `TICKO_AGENT_PRIVATE_KEY` — **secret.** Agent/API signer private key.
- `TICKO_ACCOUNT_ADDRESS` — main account operated on (`target_address`).
- `TICKO_AGENT_ADDRESS` — Agent wallet used as `signer_address`.

Never commit real values. Use a local `.env.local` (git-ignored).

## Tested on Ticko Testnet

Concise verification performed against Ticko Testnet (BTC-USDT, symbol 20001,
quantity 0.001 per order):

- **Maker order placed and filled** via a post-only limit buy (resolved at
  best bid; `is_maker = true`, maker fee).
- **Modify** — a resting order's price was updated successfully.
- **Cancel** — a resting order was cancelled to a terminal `cancelled` state
  with zero executions.
- **Price Match** — a `price_match = "queue_1"` buy was accepted and rested,
  then filled as a maker at the resolving best-bid price.

## Roadmap

The following items have **not** been completed and are not claimed here:

- The full 10M API-trading-volume requirement (definition is external to the
  Ticko API docs and has not been verified).
- Demonstrating all four `price_match` values (only `queue_1` was verified).
- Earning or confirming a challenge reward.
- Production/mainnet support (this project targets the Ticko **Testnet** by
  default).
