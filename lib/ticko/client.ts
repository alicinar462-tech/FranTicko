
import type { Address, Hex } from "viem";

import { signTypeA, TickoActionTag, type CanonicalValue } from "./auth";

import type {
  TickoBalanceData,
  TickoEnvelope,
  TickoOrderBookData,
  TickoPlaceOrderData,
  TickoPlaceOrderFields,
  TickoSymbolsData,
} from "./types";

const DEFAULT_TICKO_BASE_URL = "https://api.testnet.ticko.xyz/v1";

function getBaseUrl(): string {
  return (process.env.TICKO_BASE_URL ?? DEFAULT_TICKO_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

export interface GetSymbolsOptions {
  signal?: AbortSignal;
}

export async function getSymbols(
  options: GetSymbolsOptions = {},
): Promise<TickoSymbolsData> {
  const url = `${getBaseUrl()}/market/symbols`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    throw new Error(
      `Ticko GET /market/symbols network error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `Ticko GET /market/symbols failed with HTTP ${response.status}${
        bodyText ? `: ${bodyText}` : ""
      }`,
    );
  }

  let envelope: TickoEnvelope<TickoSymbolsData>;

  try {
    envelope = (await response.json()) as TickoEnvelope<TickoSymbolsData>;
  } catch {
    throw new Error(
      "Ticko GET /market/symbols returned a non-JSON response.",
    );
  }

  if (envelope.code !== "0") {
    throw new Error(
      `Ticko GET /market/symbols failed (code=${envelope.code}, msg=${envelope.msg}, trace_code=${envelope.trace_code})`,
    );
  }

  return envelope.data;
}

export interface GetBalanceOptions {
  signal?: AbortSignal;
}

export async function getBalance(
  address: string,
  options: GetBalanceOptions = {},
): Promise<TickoBalanceData> {
  const url = `${getBaseUrl()}/account/balance?address=${encodeURIComponent(
    address,
  )}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    throw new Error(
      `Ticko GET /account/balance network error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `Ticko GET /account/balance failed with HTTP ${response.status}${
        bodyText ? `: ${bodyText}` : ""
      }`,
    );
  }

  let envelope: TickoEnvelope<TickoBalanceData>;

  try {
    envelope = (await response.json()) as TickoEnvelope<TickoBalanceData>;
  } catch {
    throw new Error(
      "Ticko GET /account/balance returned a non-JSON response.",
    );
  }

  if (envelope.code !== "0") {
    throw new Error(
      `Ticko GET /account/balance failed (code=${envelope.code}, msg=${envelope.msg}, trace_code=${envelope.trace_code})`,
    );
  }

  return envelope.data;
}

/**
 * Fetch the Level 2 order book for a Ticko Testnet trading pair.
 *
 * GET /market/l2_book — public read endpoint.
 * No authentication or signing is required.
 */
export interface GetOrderBookOptions {
  /** Number of order book levels requested by the API. */
  level?: number;
  /** Optional signal to cancel the underlying request. */
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

  const url = `${getBaseUrl()}/market/l2_book?symbol_id=${encodeURIComponent(
    String(symbolId),
  )}&level=${encodeURIComponent(String(level))}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `Ticko GET /market/l2_book network error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `Ticko GET /market/l2_book failed with HTTP ${response.status}${
        bodyText ? `: ${bodyText}` : ""
      }`,
    );
  }

  let envelope: TickoEnvelope<TickoOrderBookData>;

  try {
    envelope = (await response.json()) as TickoEnvelope<TickoOrderBookData>;
  } catch {
    throw new Error(
      "Ticko GET /market/l2_book returned a non-JSON response.",
    );
  }

  if (envelope.code !== "0") {
    throw new Error(
      `Ticko GET /market/l2_book failed (code=${envelope.code}, msg=${envelope.msg}, trace_code=${envelope.trace_code})`,
    );
  }

  return envelope.data;
}

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
 *
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
