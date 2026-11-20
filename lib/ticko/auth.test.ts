
import { describe, expect, it } from "vitest";
import {
  canonicalize,
  canonicalJson,
  computeActionHash,
  signTypeA,
  TickoActionTag,
  TICKO_CHAIN_ID,
  TICKO_DOMAIN,
  TICKO_VERIFYING_CONTRACT,
} from "./auth";
import type { Address, Hex } from "viem";

const TEST_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;

const TEST_SIGNER =
  "0x0000000000000000000000000000000000000001" as Address;

const TEST_TARGET =
  "0x0000000000000000000000000000000000000002" as Address;

const TEST_FIELDS = {
  symbol_id: 20001,
  is_buy: true,
  order_type: "limit",
  quantity: "1",
  price: "100",
};

describe("Ticko auth configuration", () => {
  it("uses the Ticko Testnet chain ID", () => {
    expect(TICKO_CHAIN_ID).toBe(84257);
  });

  it("uses the expected EIP-712 domain", () => {
    expect(TICKO_DOMAIN).toEqual({
      name: "Ticko",
      version: "1",
      chainId: 84257,
      verifyingContract: TICKO_VERIFYING_CONTRACT,
    });
  });
});

describe("canonicalize", () => {
  it("sorts object keys alphabetically", () => {
    const result = canonicalize({
      z: 1,
      a: 2,
      m: 3,
    });

    expect(canonicalJson(result)).toBe('{"a":2,"m":3,"z":1}');
  });

  it("sorts nested object keys recursively", () => {
    const result = canonicalize({
      outer: {
        z: 1,
        a: 2,
      },
    });

    expect(result).toEqual({
      outer: {
        a: 2,
        z: 1,
      },
    });
  });

  it("removes null object properties", () => {
    const result = canonicalize({
      keep: "value",
      remove: null,
    });

    expect(result).toEqual({
      keep: "value",
    });
  });

  it("preserves array order", () => {
    const result = canonicalize([3, 1, 2]);

    expect(result).toEqual([3, 1, 2]);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => canonicalize(NaN)).toThrow(
      "Ticko canonical JSON cannot contain NaN or Infinity.",
    );

    expect(() => canonicalize(Infinity)).toThrow(
      "Ticko canonical JSON cannot contain NaN or Infinity.",
    );
  });
});

describe("canonicalJson", () => {
  it("produces compact JSON with sorted keys", () => {
    const result = canonicalJson({
      z: 1,
      a: 2,
    });

    expect(result).toBe('{"a":2,"z":1}');
  });

  it("removes null properties from serialized JSON", () => {
    const result = canonicalJson({
      symbol_id: 20001,
      optional_field: null,
    });

    expect(result).toBe('{"symbol_id":20001}');
  });
});

describe("computeActionHash", () => {
  it("returns a 32-byte hexadecimal hash", () => {
    const hash = computeActionHash(
      TickoActionTag.PlaceOrder,
      TEST_FIELDS,
    );

    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it("produces the same hash when object key order changes", () => {
    const first = computeActionHash(
      TickoActionTag.PlaceOrder,
      {
        symbol_id: 20001,
        is_buy: true,
        quantity: "1",
      },
    );

    const second = computeActionHash(
      TickoActionTag.PlaceOrder,
      {
        quantity: "1",
        symbol_id: 20001,
        is_buy: true,
      },
    );

    expect(first).toBe(second);
  });

  it("produces different hashes for different action tags", () => {
    const placeOrderHash = computeActionHash(
      TickoActionTag.PlaceOrder,
      TEST_FIELDS,
    );

    const cancelOrderHash = computeActionHash(
      TickoActionTag.CancelOrder,
      TEST_FIELDS,
    );

    expect(placeOrderHash).not.toBe(cancelOrderHash);
  });
});

describe("signTypeA", () => {
  const baseParams = {
    privateKey: TEST_PRIVATE_KEY,
    actionTag: TickoActionTag.PlaceOrder,
    businessFields: TEST_FIELDS,
    signerAddress: TEST_SIGNER,
    nonce: 1790000000000,
    expiresAfter: 1790000060000,
  };

  it("returns a valid signature without targetAddress", async () => {
    const signature = await signTypeA(baseParams);

    expect(signature.r).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(signature.s).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect([27, 28]).toContain(signature.v);
  });

  it("returns a valid signature with targetAddress", async () => {
    const signature = await signTypeA({
      ...baseParams,
      targetAddress: TEST_TARGET,
    });

    expect(signature.r).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(signature.s).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect([27, 28]).toContain(signature.v);
  });

  it("produces a deterministic signature for identical inputs", async () => {
    const first = await signTypeA(baseParams);
    const second = await signTypeA(baseParams);

    expect(first).toEqual(second);
  });

  it("produces different signatures when targetAddress is included", async () => {
    const withoutTarget = await signTypeA(baseParams);

    const withTarget = await signTypeA({
      ...baseParams,
      targetAddress: TEST_TARGET,
    });

    expect(withoutTarget).not.toEqual(withTarget);
  });
});
