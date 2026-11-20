
  import type { Address, Hex } from "viem";
  import { signTypeA, TickoActionTag, type CanonicalValue } from "./auth";
  import type {
    TickoBalanceData,
    TickoEnvelope,
    TickoOrderBookData,
    TickoPlaceOrderData,
    TickoPlaceOrderFields,
    TickoModifyOrderFields,
    TickoCancelOrderFields,
    TickoChaseOrderFields,
    TickoOrderActionData,
    TickoRefDataData,
    TickoSymbolsData,
  } from "./types";

  const DEFAULT_TICKO_BASE_URL = "https://api.testnet.ticko.xyz/v1";

  function getBaseUrl(): string {
    return (process.env.TICKO_BASE_URL ?? DEFAULT_TICKO_BASE_URL).replace(
      /\/+$/,
      "",
    );
  }

  async function getPublicData<T>(
    endpoint: string,
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }

    const query = searchParams.toString();
    const url = `${getBaseUrl()}${endpoint}${query ? `?${query}` : ""}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
        cache: "no-store",
      });
    } catch (error) {
      throw new Error(
        `Ticko GET ${endpoint} network error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `Ticko GET ${endpoint} failed with HTTP ${response.status}${
          bodyText ? `: ${bodyText}` : ""
        }`,
      );
    }

    let envelope: TickoEnvelope<T>;

    try {
      envelope = (await response.json()) as TickoEnvelope<T>;
    } catch {
      throw new Error(`Ticko GET ${endpoint} returned a non-JSON response.`);
    }

    if (envelope.code !== "0") {
      throw new Error(
        `Ticko GET ${endpoint} failed (code=${envelope.code}, msg=${envelope.msg}, trace_code=${envelope.trace_code})`,
      );
    }

    return envelope.data;
  }

  export interface GetSymbolsOptions {
    signal?: AbortSignal;
  }

  export async function getSymbols(
    options: GetSymbolsOptions = {},
  ): Promise<TickoSymbolsData> {
    return getPublicData<TickoSymbolsData>(
      "/market/symbols",
      {},
      options.signal,
    );
  }

  /** Options for GET /market/ref-data. */
  export interface GetRefDataOptions {
    signal?: AbortSignal;
  }

  export async function getRefData(
    options: GetRefDataOptions = {},
  ): Promise<TickoRefDataData> {
    return getPublicData<TickoRefDataData>(
      "/market/ref-data",
      {},
      options.signal,
    );
  }

  export interface GetBalanceOptions {
    signal?: AbortSignal;
  }

  export async function getBalance(
    address: string,
    options: GetBalanceOptions = {},
  ): Promise<TickoBalanceData> {
    if (!address.trim()) {
      throw new Error("Ticko Balance requires a valid address.");
    }

    return getPublicData<TickoBalanceData>(
      "/account/balance",
      { address },
      options.signal,
    );
  }

  /**
   * Fetch the Level 2 order book for a Ticko Testnet trading pair.
   * GET /market/l2_book — public read endpoint.
   */
  export interface GetOrderBookOptions {
    level?: number;
    signal?: AbortSignal;
  }

  export async function getOrderBook(
    symbolId: number,
    options: GetOrderBookOptions = {},
  ): Promise<TickoOrderBookData> {
    const level = options.level ?? 1;

    if (!Number.isInteger(symbolId) || symbolId <= 0) {
      throw new Error("Ticko Order Book requires a valid symbol ID.");
    }

    if (!Number.isInteger(level) || level <= 0) {
      throw new Error("Ticko Order Book level must be a positive integer.");
    }

    return getPublicData<TickoOrderBookData>(
      "/market/l2_book",
      { symbol_id: symbolId, level },
      options.signal,
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Trade read endpoints                                                       */
  /* -------------------------------------------------------------------------- */

  export interface TickoTradeOrderData {
    [key: string]: unknown;
  }

  export interface TickoTradeOrdersData {
    [key: string]: unknown;
  }

  export interface TickoTradeExecutionsData {
    [key: string]: unknown;
  }

  export interface GetOrderOptions {
    address: string;
    order_id?: string;
    client_order_id?: string;
    signal?: AbortSignal;
  }

  /**
   * Fetch one order by order_id or client_order_id.
   * GET /trade/order — public read endpoint.
   */
  export async function getOrder(
    options: GetOrderOptions,
  ): Promise<TickoTradeOrderData> {
    const { address, order_id, client_order_id, signal } = options;

    if (!address.trim()) {
      throw new Error("Ticko Order requires a valid address.");
    }

    if (!order_id && !client_order_id) {
      throw new Error(
        "Ticko Order requires order_id or client_order_id.",
      );
    }

    return getPublicData<TickoTradeOrderData>(
      "/trade/order",
      {
        address,
        order_id,
        client_order_id,
      },
      signal,
    );
  }

  export interface GetOrdersOptions {
    address: string;
    symbol_id?: number;
    order_filter?: string;
    limit?: number;
    cursor?: string;
    signal?: AbortSignal;
  }

  /**
   * Fetch active orders.
   * GET /trade/orders — public read endpoint.
   */
  export async function getOrders(
    options: GetOrdersOptions,
  ): Promise<TickoTradeOrdersData> {
    const {
      address,
      symbol_id,
      order_filter,
      limit,
      cursor,
      signal,
    } = options;

    if (!address.trim()) {
      throw new Error("Ticko Orders requires a valid address.");
    }

    if (
      symbol_id !== undefined &&
      (!Number.isInteger(symbol_id) || symbol_id <= 0)
    ) {
      throw new Error("Ticko Orders requires a valid symbol ID.");
    }

    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit <= 0)
    ) {
      throw new Error("Ticko Orders limit must be a positive integer.");
    }

    return getPublicData<TickoTradeOrdersData>(
      "/trade/orders",
      {
        address,
        symbol_id,
        order_filter,
        limit,
        cursor,
      },
      signal,
    );
  }

  export interface GetExecutionsOptions {
    address: string;
    symbol_id?: number;
    order_id?: string;
    start_time?: number;
    end_time?: number;
    limit?: number;
    cursor?: string;
    signal?: AbortSignal;
  }

  /**
   * Fetch execution history.
   * GET /trade/executions — public read endpoint.
   */
  export async function getExecutions(
    options: GetExecutionsOptions,
  ): Promise<TickoTradeExecutionsData> {
    const {
      address,
      symbol_id,
      order_id,
      start_time,
      end_time,
      limit,
      cursor,
      signal,
    } = options;

    if (!address.trim()) {
      throw new Error("Ticko Executions requires a valid address.");
    }

    if (
      symbol_id !== undefined &&
      (!Number.isInteger(symbol_id) || symbol_id <= 0)
    ) {
      throw new Error("Ticko Executions requires a valid symbol ID.");
    }

    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit <= 0)
    ) {
      throw new Error("Ticko Executions limit must be a positive integer.");
    }

    if (
      start_time !== undefined &&
      end_time !== undefined &&
      start_time > end_time
    ) {
      throw new Error("Ticko Executions start_time cannot exceed end_time.");
    }

    return getPublicData<TickoTradeExecutionsData>(
      "/trade/executions",
      {
        address,
        symbol_id,
        order_id,
        start_time,
        end_time,
        limit,
        cursor,
      },
      signal,
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Signed order placement                                                     */
  /* -------------------------------------------------------------------------- */

  /**
   * Default TTL applied to expires_after when no explicit TTL is supplied.
   */
  const DEFAULT_EXPIRES_TTL_MS = 60_000;

  /**
   * In-memory nonce state keyed by signer address.
   */
  const lastNonceBySigner = new Map<string, number>();

  function resolveNonce(
    signerKey: string,
    explicitNonce: number | undefined,
  ): number {
    const previous = lastNonceBySigner.get(signerKey);

    if (explicitNonce !== undefined) {
      lastNonceBySigner.set(signerKey, explicitNonce);
      return explicitNonce;
    }

    const generated =
      previous === undefined ? Date.now() : Math.max(Date.now(), previous + 1);

    lastNonceBySigner.set(signerKey, generated);

    return generated;
  }

  export interface PlaceOrderParams {
    privateKey: Hex;
    signerAddress: Address;
    businessFields: TickoPlaceOrderFields;
    targetAddress?: Address;
    nonce?: number;
    expiresTtl?: number;
  }

  export interface PlaceOrderOptions {
    signal?: AbortSignal;
  }

  /**
   * Place an order on the Ticko trade API.
   * POST /trade/orders — authenticated, signed write endpoint.
   */
  export async function placeOrder(
    params: PlaceOrderParams,
    options: PlaceOrderOptions = {},
  ): Promise<TickoPlaceOrderData> {
    const { privateKey, signerAddress, businessFields, targetAddress } = params;

    const expiresTtl = params.expiresTtl ?? DEFAULT_EXPIRES_TTL_MS;
    const signerKey = signerAddress.toLowerCase();
    const nonce = resolveNonce(signerKey, params.nonce);
    const expiresAfter = nonce + expiresTtl;

    const signature = await signTypeA({
      privateKey,
      actionTag: TickoActionTag.PlaceOrder,
      businessFields: businessFields as unknown as CanonicalValue,
      signerAddress,
      nonce,
      expiresAfter,
      ...(targetAddress !== undefined ? { targetAddress } : {}),
    });

    const body: object = {
      ...businessFields,
      signer_address: signerAddress,
      nonce,
      expires_after: expiresAfter,
      ...(targetAddress !== undefined ? { target_address: targetAddress } : {}),
      signature,
    };

    const url = `${getBaseUrl()}/trade/orders`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (error) {
      throw new Error(
        `Ticko POST /trade/orders network error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Ticko POST /trade/orders failed with HTTP ${response.status}${
          errorText ? `: ${errorText}` : ""
        }`,
      );
    }

    let envelope: TickoEnvelope<TickoPlaceOrderData>;

    try {
      envelope = (await response.json()) as TickoEnvelope<TickoPlaceOrderData>;
    } catch {
      throw new Error("Ticko POST /trade/orders returned a non-JSON response.");
    }

    if (envelope.code !== "0") {
      throw new Error(
        `Ticko POST /trade/orders failed (code=${envelope.code}, msg=${envelope.msg}, trace_code=${envelope.trace_code})`,
      );
    }

    return envelope.data;
  }

  /* -------------------------------------------------------------------------- */
  /* Signed order actions: Modify, Cancel and Chase                             */
  /* -------------------------------------------------------------------------- */

  export interface OrderActionParams<TFields> {
    privateKey: Hex;
    signerAddress: Address;
    businessFields: TFields;
    targetAddress?: Address;
    nonce?: number;
    expiresTtl?: number;
  }

  export interface OrderActionOptions {
    signal?: AbortSignal;
  }

  /**
   * Shared Type A signed POST helper for order actions.
   * The business fields are signed exactly as sent in the request body.
   */
  async function postSignedOrderAction<TFields extends object>(
    endpoint: string,
    actionTag: TickoActionTag,
    params: OrderActionParams<TFields>,
    options: OrderActionOptions = {},
  ): Promise<TickoOrderActionData> {
    const { privateKey, signerAddress, businessFields, targetAddress } = params;
    const expiresTtl = params.expiresTtl ?? DEFAULT_EXPIRES_TTL_MS;

    if (!signerAddress.trim()) {
      throw new Error(`Ticko ${endpoint} requires a signer address.`);
    }

    if (!Number.isInteger(expiresTtl) || expiresTtl <= 0) {
      throw new Error("Ticko expiresTtl must be a positive integer.");
    }

    const signerKey = signerAddress.toLowerCase();
    const nonce = resolveNonce(signerKey, params.nonce);
    const expiresAfter = nonce + expiresTtl;

    const signature = await signTypeA({
      privateKey,
      actionTag,
      businessFields: businessFields as unknown as CanonicalValue,
      signerAddress,
      nonce,
      expiresAfter,
      ...(targetAddress !== undefined ? { targetAddress } : {}),
    });

    const body = {
      ...businessFields,
      signer_address: signerAddress,
      nonce,
      expires_after: expiresAfter,
      ...(targetAddress !== undefined ? { target_address: targetAddress } : {}),
      signature,
    };

    const url = `${getBaseUrl()}${endpoint}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (error) {
      throw new Error(
        `Ticko POST ${endpoint} network error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Ticko POST ${endpoint} failed with HTTP ${response.status}${
          errorText ? `: ${errorText}` : ""
        }`,
      );
    }

    let envelope: TickoEnvelope<TickoOrderActionData>;

    try {
      envelope = (await response.json()) as TickoEnvelope<TickoOrderActionData>;
    } catch {
      throw new Error(`Ticko POST ${endpoint} returned a non-JSON response.`);
    }

    if (envelope.code !== "0") {
      throw new Error(
        `Ticko POST ${endpoint} failed (code=${envelope.code}, msg=${envelope.msg}, trace_code=${envelope.trace_code})`,
      );
    }

    return envelope.data;
  }

  /** Modify an existing order. Verified business fields: order_id and price. */
  export async function modifyOrder(
    params: OrderActionParams<TickoModifyOrderFields>,
    options: OrderActionOptions = {},
  ): Promise<TickoOrderActionData> {
    const { order_id, price } = params.businessFields;

    if (!order_id.trim()) {
      throw new Error("Ticko Modify Order requires a valid order_id.");
    }

    if (!price.trim()) {
      throw new Error("Ticko Modify Order requires a valid price.");
    }

    return postSignedOrderAction(
      "/trade/orders/modify",
      TickoActionTag.ModifyOrder,
      params,
      options,
    );
  }

  /** Cancel an existing order. */
  export async function cancelOrder(
    params: OrderActionParams<TickoCancelOrderFields>,
    options: OrderActionOptions = {},
  ): Promise<TickoOrderActionData> {
    if (!params.businessFields.order_id.trim()) {
      throw new Error("Ticko Cancel Order requires a valid order_id.");
    }

    return postSignedOrderAction(
      "/trade/orders/cancel",
      TickoActionTag.CancelOrder,
      params,
      options,
    );
  }

  /** Chase an existing order. Action tag 13 is confirmed by Ticko's UI bundle. */
  export async function chaseOrder(
    params: OrderActionParams<TickoChaseOrderFields>,
    options: OrderActionOptions = {},
  ): Promise<TickoOrderActionData> {
    if (!params.businessFields.order_id.trim()) {
      throw new Error("Ticko Chase Order requires a valid order_id.");
    }

    // auth.ts is intentionally unchanged; Ticko's ChaseOrder tag is 13.
    const chaseOrderActionTag = 13 as TickoActionTag;

    return postSignedOrderAction(
      "/trade/orders/chase",
      chaseOrderActionTag,
      params,
      options,
    );
  }
