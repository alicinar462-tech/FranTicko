import type { Address, Hex } from "viem";
import { signTypeA, TickoActionTag, type CanonicalValue } from "./auth";
import type {
  TickoBalanceData,
  TickoEnvelope,
  TickoPlaceOrderData,
  TickoPlaceOrderFields,
  TickoSymbolsData,
} from "./types";

/**
 * Public Testnet REST base URL, used unless overridden by `TICKO_BASE_URL`.
 * See https://docs.ticko.xyz/api-documentation/overview/rest-conventions
 */
const DEFAULT_TICKO_BASE_URL = "https://api.testnet.ticko.xyz/v1";

/**
 * Returns the configured Ticko base URL, trimming trailing slashes.
 *
 * Read inside a function so the value is resolved at request time rather
 * than inlined at build time, keeping the server-side client configurable.
 */
function getBaseUrl(): string {
  return (process.env.TICKO_BASE_URL ?? DEFAULT_TICKO_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

export interface GetSymbolsOptions {
  /** Optional signal to cancel the underlying request. */
  signal?: AbortSignal;
}

/**
 * Fetch the trading-pair configuration from the public market API.
 *
 * `GET /market/symbols` — public read endpoint, no authentication required.
 * Returns the raw `data` payload of the Ticko response envelope.
 *
 * @throws Error with a descriptive message if the request fails at the
 *         transport level, returns a non-2xx status, or carries a
 *         non-success response envelope (`code !== "0"`).
 */
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

  // `code === "0"` signals success per the Ticko response envelope.
  if (envelope.code !== "0") {
    throw new Error(
      `Ticko GET /market/symbols failed (code=${envelope.code}, msg=${envelope.msg}, trace_code=${envelope.trace_code})`,
    );
  }

  return envelope.data;
}

export interface GetBalanceOptions {
  /** Optional signal to cancel the underlying request. */
  signal?: AbortSignal;
}

/**
 * Fetch the account asset balances for a given address.
 *
 * `GET /account/balance` — public read endpoint, no authentication required.
 * Returns the raw `data` payload of the Ticko response envelope.
 *
 * @param address The account address to query.
 * @param options Optional request options.
 * @throws Error with a descriptive message if the request fails at the
 *         transport level, returns a non-2xx status, or carries a
 *         non-success response envelope (`code !== "0"`).
 */
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

  // `code === "0"` signals success per the Ticko response envelope.
  if (envelope.code !== "0") {
    throw new Error(
      `Ticko GET /account/balance failed (code=${envelope.code}, msg=${envelope.msg}, trace_code=${envelope.trace_code})`,
    );
  }

  return envelope.data;
}

/**
 * Default TTL (in ms) applied to the `expires_after` field when no explicit
 * TTL is supplied: `expires_after = nonce + expiresTtl`.
 */
const DEFAULT_EXPIRES_TTL_MS = 60_000;

/**
 * In-memory nonce state keyed by signer address (lower-cased).
 *
 * Nonces must be strictly increasing per signer and additionally unique, so
 * when a nonce is generated it is always at least `Date.now()` and strictly
 * greater than the previously generated/used nonce for that signer. This map
 * is process-local, so a fresh process starts from `Date.now()` again.
 */
const lastNonceBySigner = new Map<string, number>();

/**
 * Resolve the nonce for a signer.
 *
 * - If `explicitNonce` is supplied, use it and store it for that signer.
 * - Otherwise generate one as `Math.max(Date.now(), previousNonce + 1)` and
 *   store it, guaranteeing a strictly increasing sequence per signer.
 *
 * Accepts an already normalized (lower-cased) signer key.
 */
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
  /** Hex private key of `signer_address`, passed to `signTypeA`. */
  privateKey: Hex;
  /** Signer address used in both the `Agent` struct and request body. */
  signerAddress: Address;
  /** Business fields to sign and submit (envelope fields excluded). */
  businessFields: TickoPlaceOrderFields;
  /** Optional account the order operates on (maps to `target_address`). */
  targetAddress?: Address;
  /**
   * Optional explicit nonce. If omitted, a strictly-increasing millisecond
   * timestamp nonce is generated for the signer.
   */
  nonce?: number;
  /**
   * Milliseconds added to the nonce to derive `expires_after`. Defaults to
   * `60_000`.
   */
  expiresTtl?: number;
}

export interface PlaceOrderOptions {
  /** Optional signal to cancel the underlying request. */
  signal?: AbortSignal;
}

/**
 * Place an order on the Ticko trade API.
 *
 * `POST /trade/orders` — an authenticated, signed write endpoint. This uses
 * Signing Type A (see {@link signTypeA}) with action tag
 * {@link TickoActionTag.PlaceOrder}, signing only the `businessFields`
 * (never the envelope fields). The final flattened request body combines the
 * business fields with `signer_address`, `nonce`, `expires_after`, an optional
 * `target_address`, and the computed `signature`.
 *
 * Nonce handling:
 * - No explicit nonce: generated as `Math.max(Date.now(), previousNonce + 1)`
 *   and strictly increasing per signer.
 * - Explicit nonce: used as-is and stored for the signer.
 * - `expires_after = nonce + expiresTtl` (default TTL `60_000` ms).
 *
 * @throws Error with a descriptive message if the request fails at the
 *         transport level, returns a non-2xx status, or carries a non-success
 *         response envelope (`code !== "0"`).
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

  // Sign ONLY the business fields. Envelope fields (`signer_address`, `nonce`,
  // `expires_after`, `target_address`, `signature`) are deliberately excluded
  // from the signed payload.
  const signature = await signTypeA({
    privateKey,
    actionTag: TickoActionTag.PlaceOrder,
    // `TickoPlaceOrderFields` is a plain-object interface and is therefore
    // runtime-compatible with `canonicalize()`, but TypeScript cannot
    // auto-assign an interface to `CanonicalValue` (no index signature). The
    // cast is a type-only bridge; the exact `businessFields` object is signed
    // unchanged.
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

  // `code === "0"` signals success per the Ticko response envelope.
  if (envelope.code !== "0") {
    throw new Error(
      `Ticko POST /trade/orders failed (code=${envelope.code}, msg=${envelope.msg}, trace_code=${envelope.trace_code})`,
    );
  }

  return envelope.data;
}