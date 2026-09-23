/**
 * Shared types for the Ticko public REST API.
 *
 * Field names, shapes, and enums mirror the official Ticko Testnet API
 * documentation (https://docs.ticko.xyz). Decimal values are strings,
 * timestamps are integer Unix milliseconds, and field naming is snake_case.
 */

/**
 * Standard Ticko response envelope returned by every REST endpoint.
 *
 * - `code`: `"0"` means success; any non-zero value is an error code.
 * - `msg`: empty on success, human-readable error message on failure.
 * - `data`: endpoint-specific payload on success; usually `null` on failure.
 * - `trace_code`: backend trace identifier; empty on success.
 */
export interface TickoEnvelope<TData = unknown> {
  code: string;
  msg: string;
  data: TData;
  trace_code: string;
}

/** Trading-pair lifecycle status. */
export type TickoSymbolStatus =
  | "pre_launch"
  | "trading"
  | "suspended"
  | "delisted";

/** Active trading restrictions for a symbol. */
export type TickoMode =
  | "normal"
  | "limit_only"
  | "post_only"
  | "reduce_only"
  | "cancel_only";

/**
 * A single trading pair configuration returned by `GET /market/symbols`.
 *
 * Only the fields documented in the official spec are declared.
 */
export interface TickoSymbol {
  symbol_id: number;
  status: TickoSymbolStatus;
  trading_mode: TickoMode | null;
  base_coin_id: number;
  quote_coin_id: number;
  settle_coin_id: number | null;
  price_precision: number;
  qty_precision: number;
  price_step: string;
  qty_step: string;
  min_size: string;
  max_size: string;
  max_leverage: number | null;
  default_leverage: number | null;
  taker_fee_rate: string;
  maker_fee_rate: string;
  price_limit_pct: string | null;
  funding_interval: number | null;
  funding_interest_rate: string | null;
  funding_rate_coef: string | null;
  funding_rate_cap: string | null;
  funding_rate_floor: string | null;
  funding_clamp_deviation: string | null;
  impact_margin_notional: string | null;
  global_oi_cap: string | null;
  price_step_merge_multiplier: number[];
}

/** Payload of `GET /market/symbols` (`data` field of the envelope). */
export interface TickoSymbolsData {
  list: TickoSymbol[];
}

/**
 * A single coin balance returned by `GET /account/balance`.
 *
 * Decimal values are strings; timestamps are integer Unix milliseconds.
 */
export interface TickoBalanceCoin {
  coin_id: number;
  balance: string;
  isolated_balance: string;
  created_time: number;
  updated_time: number;
}

/** Payload of `GET /account/balance` (`data` field of the envelope). */
export interface TickoBalanceData {
  address: string;
  coins: TickoBalanceCoin[];
}

/**
 * ECDSA signature carried by every signed Ticko request body.
 *
 * `r`/`s` are 32-byte `0x`-prefixed hex strings; `v` is the recovery
 * identifier, either `27` or `28`. See `lib/ticko/auth.ts`.
 */
export interface TickoSignature {
  r: string;
  s: string;
  v: number;
}

/** Order type accepted by the Ticko trade API. */
export type TickoOrderType = "limit" | "market";

/** Time-in-force policy for an order. */
export type TickoTimeInForce = "gtc" | "fok" | "ioc";

/** Position side an order opens or closes. */
export type TickoPositionSide = "both" | "long" | "short";

/** Margin mode the order is placed under. */
export type TickoMarginMode = "cross" | "isolated";

/** Order behaviour flags. */
export type TickoOrderFlag = "post_only" | "reduce_only";

/**
 * Business fields for `POST /trade/orders`, sent to {@link placeOrder} as the
 * signed payload. Envelope fields such as `signer_address`, `nonce`,
 * `expires_after`, `target_address` and `signature` are NOT part of this
 * interface; they are supplied separately when placing an order and added to
 * the final request body by the client.
 */
export interface TickoPlaceOrderFields {
  symbol_id: number;
  is_buy: boolean;
  order_type: TickoOrderType;
  time_in_force: TickoTimeInForce;
  quantity: string;
  price: string;
  position_side: TickoPositionSide;
  margin_mode: TickoMarginMode;

  client_order_id?: string;
  slippage?: string;
  market_order_type?: string;
  price_match?: string;
  flags?: TickoOrderFlag[];
}

/**
 * The full, flattened request body for `POST /trade/orders`, including the
 * signing envelope fields and the ECDSA signature.
 */
export interface TickoPlaceOrderRequest extends TickoPlaceOrderFields {
  signer_address: string;
  nonce: number;
  expires_after: number;
  target_address?: string;
  signature: TickoSignature;
}

/** Payload of `POST /trade/orders` (`data` field of the envelope). */
export interface TickoPlaceOrderData {
  tx_hash: string;
  order_id: string;
  client_order_id: string | null;
  state: string;
}