import assert from "node:assert/strict";
import {
  recoverTypedDataAddress,
  serializeSignature,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { cancelOrder } from "../lib/ticko/client";

import {
  computeActionHash,
  TICKO_DOMAIN,
  TickoActionTag,
} from "../lib/ticko/auth";

const PRIVATE_KEY = `0x${"0".repeat(63)}1` as const;
const account = privateKeyToAccount(PRIVATE_KEY);

const TARGET_ADDRESS =
  "0x0000000000000000000000000000000000000002" as const;

type CapturedRequest = {
  url: string;
  body: Record<string, unknown>;
};

const capturedRequests: CapturedRequest[] = [];

const originalFetch = globalThis.fetch;

function mockResponse() {
  return new Response(
    JSON.stringify({
      code: "0",
      msg: "success",
      data: {
        tx_hash: "0xmock",
        order_id: "mock-order",
        client_order_id: null,
      },
      trace_code: "local-test",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function sendMockCancel(
  orderId: string,
  options: {
    nonce?: number;
    targetAddress?: `0x${string}`;
  } = {},
) {
  return cancelOrder({
    privateKey: PRIVATE_KEY,
    signerAddress: account.address,
    businessFields: {
      order_id: orderId,
    },
    ...(options.nonce !== undefined
      ? { nonce: options.nonce }
      : {}),
    ...(options.targetAddress
      ? { targetAddress: options.targetAddress }
      : {}),
  });
}

function getNumber(
  body: Record<string, unknown>,
  key: string,
): number {
  const value = body[key];

  assert.equal(typeof value, "number", `${key} must be a number`);

  return value as number;
}

function getString(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = body[key];

  assert.equal(typeof value, "string", `${key} must be a string`);

  return value as string;
}

async function main() {
  console.log("\nTicko nonce and target_address tests\n");

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = JSON.parse(
      String(init?.body),
    ) as Record<string, unknown>;

    capturedRequests.push({ url, body });

    return mockResponse();
  }) as typeof fetch;

  try {
    // 1. First generated nonce
    await sendMockCancel("local-test-1");

    const first = getNumber(capturedRequests[0].body, "nonce");

    console.log("PASS: First nonce generated");

    // 2. Second generated nonce must be greater
    await sendMockCancel("local-test-2");

    const second = getNumber(capturedRequests[1].body, "nonce");

    assert.ok(second > first);
    console.log("PASS: Generated nonce strictly increases");

    // 3. Target address must be included in the request
    await sendMockCancel("local-test-3", {
      targetAddress: TARGET_ADDRESS,
    });

    const targetRequest = capturedRequests[2].body;

    const targetAddress = getString(
      targetRequest,
      "target_address",
    );

    assert.equal(
      targetAddress.toLowerCase(),
      TARGET_ADDRESS.toLowerCase(),
    );

    console.log("PASS: target_address included in request");

    // 4. Verify the EIP-712 signature with targetAddress
    const fields = { order_id: "local-test-3" };

    const signature = targetRequest.signature as
      | {
          r: `0x${string}`;
          s: `0x${string}`;
          v: number;
        }
      | undefined;

    assert.ok(signature, "Signature must exist");

    const types = {
      Agent: [
        { name: "signerAddress", type: "address" },
        { name: "targetAddress", type: "address" },
        { name: "actionHash", type: "bytes32" },
        { name: "nonce", type: "uint64" },
        { name: "expiresAfter", type: "uint64" },
      ],
    } as const;

    const recovered = await recoverTypedDataAddress({
      domain: TICKO_DOMAIN,
      types,
      primaryType: "Agent",
      message: {
        signerAddress: account.address,
        targetAddress: TARGET_ADDRESS,
        actionHash: computeActionHash(
          TickoActionTag.CancelOrder,
          fields,
        ),
        nonce: BigInt(getNumber(targetRequest, "nonce")),
        expiresAfter: BigInt(
          getNumber(targetRequest, "expires_after"),
        ),
      },
      signature: serializeSignature({
        r: signature.r,
        s: signature.s,
        v: BigInt(signature.v),
      }),
    });

    assert.equal(
      recovered.toLowerCase(),
      account.address.toLowerCase(),
    );

    console.log("PASS: target_address EIP-712 signature verified");

    // 5. Explicit nonce must be stored
    const explicitNonce = Date.now() + 10_000;

    await sendMockCancel("local-test-4", {
      nonce: explicitNonce,
    });

    assert.equal(
      getNumber(capturedRequests[3].body, "nonce"),
      explicitNonce,
    );

    console.log("PASS: Explicit nonce is respected");

    // 6. Next generated nonce must exceed explicit nonce
    await sendMockCancel("local-test-5");

    const afterExplicit = getNumber(
      capturedRequests[4].body,
      "nonce",
    );

    assert.ok(afterExplicit > explicitNonce);

    console.log("PASS: Generated nonce exceeds explicit nonce");

    // 7. Verify TTL calculation
    for (const request of capturedRequests) {
      const nonce = getNumber(request.body, "nonce");
      const expiresAfter = getNumber(
        request.body,
        "expires_after",
      );

      assert.equal(expiresAfter, nonce + 60_000);
    }

    console.log("PASS: expires_after calculation");

    // 8. Verify every request stayed on the mocked endpoint
    for (const request of capturedRequests) {
      assert.ok(
        request.url.endsWith("/trade/orders/cancel"),
      );
    }

    console.log("PASS: All requests used the expected endpoint");

    console.log("\nAll nonce and target_address tests passed.");
    console.log("Verified mocked requests:", capturedRequests.length);
    console.log("Real Ticko API requests: 0");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error: unknown) => {
  console.error("\nTEST FAILED:");
  console.error(error);
  process.exitCode = 1;
});