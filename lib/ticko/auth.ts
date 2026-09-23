/**
 * Type A agent signing for the Ticko REST API.
 *
 * Signed write requests use EIP-712. Signing Type A is used by order and
 * trading-setting endpoints: the endpoint business fields are canonicalized
 * into an `actionHash`, then that hash is signed inside an `Agent` struct.
 *
 * Only Signing Type A is implemented here (Type B and API-key management are
 * out of scope). Testnet chainId and the full EIP-712 domain are fixed per the
 * official docs (https://docs.ticko.xyz/api-documentation/authentication/signing).
 */
import { concat, keccak256, parseSignature, toHex, type Hex } from "viem";
import type { Address } from "viem";
import { signTypedData } from "viem/accounts";
import type { TickoSignature } from "./types";

/**
 * Ticko Testnet EIP-712 domain chain id. Mainnet is 84256; Testnet is 84257.
 */
export const TICKO_CHAIN_ID = 84257;

/** EIP-712 domain name for every Ticko signing type. */
export const TICKO_DOMAIN_NAME = "Ticko";

/** EIP-712 domain version for every Ticko signing type. */
export const TICKO_DOMAIN_VERSION = "1";

/** EIP-712 `verifyingContract` used by Ticko (a zero address). */
export const TICKO_VERIFYING_CONTRACT =
  "0x0000000000000000000000000000000000000000" as const;

/** EIP-712 domain shared by all Type A `Agent` signatures. */
export const TICKO_DOMAIN = {
  name: TICKO_DOMAIN_NAME,
  version: TICKO_DOMAIN_VERSION,
  chainId: TICKO_CHAIN_ID,
  verifyingContract: TICKO_VERIFYING_CONTRACT,
} as const;

/**
 * Signing Type A action tags. The tag is a single byte prepended to the
 * canonical business JSON when computing the `actionHash`. Only the documents
 * covered by this module are declared.
 */
export enum TickoActionTag {
  /** `POST /trade/orders` */
  PlaceOrder = 7,
  /** `POST /trade/cancel_order` */
  CancelOrder = 8,
  /** `POST /trade/modify_order` */
  ModifyOrder = 12,
}
/** JSON-compatible values that can be canonicalized for the `actionHash`. */
export type CanonicalValue =
  | null
  | string
  | number
  | boolean
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively canonicalize a value for `actionHash` computation:
 *
 * - drops object properties that are `null`, `undefined`, or omitted;
 * - recursively sorts object keys alphabetically at every object level;
 * - preserves array order;
 * - leaves primitives unchanged.
 */
export function canonicalize(value: CanonicalValue): CanonicalValue {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item as CanonicalValue));
  }

  if (isPlainObject(value)) {
    const out: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value).sort()) {
      const item = canonicalize(value[key] as CanonicalValue);
      if (item !== null && item !== undefined) {
        out[key] = item;
      }
    }
    return out;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Ticko canonical JSON cannot contain NaN or Infinity.");
  }

  return value as CanonicalValue;
}

/**
 * Serialize a value into the compact canonical JSON consumed by `actionHash`:
 * null/omitted optional fields removed, object keys sorted alphabetically at
 * every level, arrays in original order, no whitespace or newlines.
 */
export function canonicalJson(value: CanonicalValue): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Compute a Type A `actionHash`.
 *
 * `keccak256(uint8(actionTag) || utf8(canonical_json))` per the Signing Type A
 * specification.
 */
export function computeActionHash(
  actionTag: TickoActionTag | number,
  businessFields: CanonicalValue,
): Hex {
  const json = canonicalJson(businessFields);
  const tagByte = toHex(actionTag, { size: 1 });
  return keccak256(concat([tagByte, toHex(json)]));
}
/** Inputs required to build and sign a Type A `Agent` request. */
export interface SignTypeAParams {
  /** Hex private key of `signer_address`. */
  privateKey: Hex;
  /** Type A action tag for the endpoint being signed. */
  actionTag: TickoActionTag;
  /**
   * Endpoint business fields only (the documented operation parameters).
   * Envelope fields such as `signer_address`, `nonce` and `expires_after`
   * are NOT included here; pass them via their dedicated options.
   */
  businessFields: CanonicalValue;
  /** Signer address used as `signerAddress` in the `Agent` struct. */
  signerAddress: Address;
  /**
   * Millisecond timestamp nonce (`uint64`). Must be unused per signer and
   * within `(block_time - 2 days, block_time + 1 day)`.
   */
  nonce: bigint | number;
  /**
   * Millisecond timestamp after which the request expires (`uint64`). Must be
   * greater than the block time when the request is checked.
   */
  expiresAfter: bigint | number;
  /**
   * Account the request operates on. If omitted the target account is taken
   * to be `signerAddress`, and `targetAddress` is excluded from the `Agent`
   * struct.
   */
  targetAddress?: Address;
}

/**
 * Build and sign a Signing Type A request, returning the ECDSA signature.
 *
 * Produces the exact `Agent` struct described by the Ticko docs for the
 * `target_address` present/omitted cases, signs it with the signer's private
 * key via EIP-712 (`viem.signTypedData`), and returns `{ r, s, v }`:
 *
 * - `r`, `s` are 32-byte `0x`-prefixed hex strings;
 * - `v` is the recovery identifier, either `27` or `28`.
 *
 * @param params Signing inputs (see {@link SignTypeAParams}).
 * @returns The ECDSA signature as `{ r, s, v }`, ready for the `signature`
 *          field of the request body.
 */
export async function signTypeA(
  params: SignTypeAParams,
): Promise<TickoSignature> {
  const { privateKey, actionTag, businessFields, signerAddress, targetAddress } =
    params;

  const nonce = BigInt(params.nonce);
  const expiresAfter = BigInt(params.expiresAfter);
  const actionHash = computeActionHash(actionTag, businessFields);

  const domain = TICKO_DOMAIN;

  let signatureHex: Hex;
  if (targetAddress !== undefined) {
    signatureHex = await signTypedData({
      privateKey,
      domain,
      primaryType: "Agent",
      types: {
        Agent: [
          { name: "signerAddress", type: "address" },
          { name: "targetAddress", type: "address" },
          { name: "actionHash", type: "bytes32" },
          { name: "nonce", type: "uint64" },
          { name: "expiresAfter", type: "uint64" },
        ],
      },
      message: { signerAddress, targetAddress, actionHash, nonce, expiresAfter },
    });
  } else {
    signatureHex = await signTypedData({
      privateKey,
      domain,
      primaryType: "Agent",
      types: {
        Agent: [
          { name: "signerAddress", type: "address" },
          { name: "actionHash", type: "bytes32" },
          { name: "nonce", type: "uint64" },
          { name: "expiresAfter", type: "uint64" },
        ],
      },
      message: { signerAddress, actionHash, nonce, expiresAfter },
    });
  }

  // viem returns `v` as a bigint (27n/28n) and always provides `yParity`
  // (0/1). The Ticko signature object expects `v` as the numeric ECDSA
  // recovery id (27 or 28), so recover it from `yParity` — this keeps the
  // result stable regardless of which form the parser emits.
  const parsed = parseSignature(signatureHex);
  const v = 27 + parsed.yParity;

  return { r: parsed.r, s: parsed.s, v };
}