
/**
 * Shared types for the Ticko public REST API.
 *
 * Decimal values are strings, timestamps are Unix milliseconds,
 * and field naming follows Ticko's snake_case API convention.
 */

/** Standard Ticko REST response envelope. */
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

/** Trading-pair configuration returned by GET /market/symbols. */
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

/** Payload of GET /market/symbols. */
export interface TickoSymbolsData {
  list: TickoSymbol[];
}

/** Coin reference returned by GET /market/ref-data. */
export interface TickoRefDataCoin {
  coin: string;
  coin_id: number;
}

/** Trading-pair reference returned by GET /market/ref-data. */
export interface TickoRefDataSymbol {
  symbol: string;
  symbol_id: number;
}

/** Payload of GET /market/ref-data. */
export interface TickoRefDataData {
  coins: Record<string, TickoRefDataCoin>;
  symbols: Record<string, TickoRefDataSymbol>;
}

/** A single coin balance returned by GET /account/balance. */
export interface TickoBalanceCoin {
  coin_id: number;
  balance: string;
  isolated_balance: string;
  created_time: number;
  updated_time: number;
}

/** Payload of GET /account/balance. */
export interface TickoBalanceData {
  address: string;
  coins: TickoBalanceCoin[];
}

/**
 * One Order Book price level.
 * Index 0: price
 * Index 1: quantity
 */
export type TickoOrderBookLevel = [price: string, quantity: string];

/** Payload of GET /market/l2_book. */
export interface TickoOrderBookData {
  bids: TickoOrderBookLevel[];
  asks: TickoOrderBookLevel[];
  seq: number;
  time: number;
}

/** ECDSA signature carried by signed Ticko requests. */
export interface TickoSignature {
  r: string;
  s: string;
  v: number;
}

/** Order type accepted by the Ticko trade API. */
export type TickoOrderType = "limit" | "market";

/** Time-in-force policy. */
export type TickoTimeInForce = "gtc" | "fok" | "ioc";

/** Position side. */
export type TickoPositionSide = "both" | "long" | "short";

/** Margin mode. */
export type TickoMarginMode = "cross" | "isolated";

/** Order behaviour flags. */
export type TickoOrderFlag = "post_only" | "reduce_only";

/** Business fields for POST /trade/orders. */
export interface TickoPlaceOrderFields {
  symbol_id: number;
  is_buy: boolean;
  order_type: TickoOrderType;
  time_in_force: TickoTimeInForce;
  quantity: string;

  /** Required for limit orders; omitted for market orders. */
  price?: string;

  position_side: TickoPositionSide;
  margin_mode: TickoMarginMode;
  client_order_id?: string;
  slippage?: string;
  market_order_type?: string;
  price_match?: string;
  flags?: TickoOrderFlag[];
}

/** Full signed request body for POST /trade/orders. */
export interface TickoPlaceOrderRequest extends TickoPlaceOrderFields {
  signer_address: string;
  nonce: number;
  expires_after: number;
  target_address?: string;
  signature: TickoSignature;
}

/** Payload of POST /trade/orders. */
export interface TickoPlaceOrderData {
  tx_hash: string;
  order_id: string;
  client_order_id: string | null;
  state: string;
}

/** Business fields for POST /trade/orders/modify. */
export interface TickoModifyOrderFields {
  order_id: string;
  price: string;
}

/** Full signed request body for POST /trade/orders/modify. */
export interface TickoModifyOrderRequest extends TickoModifyOrderFields {
  signer_address: string;
  nonce: number;
  expires_after: number;
  target_address?: string;
  signature: TickoSignature;
}

/** Business fields for POST /trade/orders/cancel. */
export interface TickoCancelOrderFields {
  order_id: string;
}

/** Full signed request body for POST /trade/orders/cancel. */
export interface TickoCancelOrderRequest extends TickoCancelOrderFields {
  signer_address: string;
  nonce: number;
  expires_after: number;
  target_address?: string;
  signature: TickoSignature;
}

/** Business fields for POST /trade/orders/chase. */
export interface TickoChaseOrderFields {
  order_id: string;
}

/** Full signed request body for POST /trade/orders/chase. */
export interface TickoChaseOrderRequest extends TickoChaseOrderFields {
  signer_address: string;
  nonce: number;
  expires_after: number;
  target_address?: string;
  signature: TickoSignature;
}

/** Shared response payload for Modify, Cancel and Chase actions. */
export interface TickoOrderActionData {
  tx_hash: string;
  order_id: string;
  client_order_id: string | null;
}

/**
 * Order detail returned by GET /trade/order.
 *
 * Nullable fields reflect the observed API response.
 */
export interface TickoOrder {
  address: string;
  algo_order_type: string | null;
  client_order_id: string | null;
  conditional: unknown | null;
  created_time: number;
  cum_fee: string;
  cum_filled_amount: string;
  cum_filled_quantity: string;
  flags: TickoOrderFlag[];
  is_buy: boolean;
  leverage: number | null;
  margin_mode: TickoMarginMode;
  market_order_type: string | null;
  order_id: string;
  order_source: string;
  order_type: TickoOrderType;
  original_quantity: string;
  parent_order_id: string | null;
  position_side: TickoPositionSide;
  price: string | null;
  price_match: string | null;
  quantity: string;
  remaining_quantity: string;
  slippage: string | null;
  state: string;
  stp_mode: string | null;
  symbol_id: number;
  time_in_force: TickoTimeInForce;
  tpsl: unknown | null;
  tx_hash: string;
  updated_time: number;
}

/** Query parameters for GET /trade/order. */
export interface TickoGetOrderParams {
  address: string;
  order_id?: string;
  client_order_id?: string;
}

/** Payload of GET /trade/order. */
export type TickoOrderDetailData = TickoOrder;

/** Query parameters for GET /trade/orders. */
export interface TickoGetOrdersParams {
  address: string;
  symbol_id?: number;
  order_filter?: string;
  limit?: number;
  cursor?: string;
}

/** Payload of GET /trade/orders. */
export interface TickoOrdersData {
  has_more: boolean;
  list: TickoOrder[];
  next_cursor: string | null;
}

/** A single execution returned by GET /trade/executions. */
export interface TickoExecution {
  amount: string;
  closed_pnl: string | null;
  fee: string;
  fee_coin_id: number;
  is_buy: boolean;
  is_maker: boolean;
  order_id: string;
  price: string;
  quantity: string;
  symbol_id: number;
  time: number;
  trade_id: string;
  tx_hash: string;
}

/** Query parameters for GET /trade/executions. */
export interface TickoGetExecutionsParams {
  address: string;
  symbol_id?: number;
  order_id?: string;
  start_time?: number;
  end_time?: number;
  limit?: number;
  cursor?: string;
}

/** Payload of GET /trade/executions. */
export interface TickoExecutionsData {
  has_more: boolean;
  list: TickoExecution[];
  next_cursor: string | null;
}
