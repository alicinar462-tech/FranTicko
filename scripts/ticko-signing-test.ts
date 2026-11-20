import assert from "node:assert/strict";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  modifyOrder,
  cancelOrder,
  chaseOrder,
} from "../lib/ticko/client";

import type { TickoEnvelope } from "../lib/ticko/types";

const TEST_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;

const account = privateKeyToAccount(TEST_PRIVATE_KEY);

const originalFetch = globalThis.fetch;

let requestCount = 0;

function mockSuccessResponse(): Response {
  const envelope: TickoEnvelope = {
    code: "0",
    msg: "success",
    trace_code: "local-test",
    data: {
      tx_hash: `0x${"1".repeat(64)}`,
      order_id: "local-test-order",
      client_order_id: "local-test-client",
    },
  };

  return new Response(JSON.stringify(envelope), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function mockErrorResponse(
  code: string,
  msg: string,
): Response {
  const envelope: TickoEnvelope = {
    code,
    msg,
    trace_code: "local-error-test",
    data: null,
  };

  return new Response(JSON.stringify(envelope), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function setMockFetch(
  handler: () => Promise<Response>,
): void {
  globalThis.fetch = (async () => {
    requestCount++;
    return handler();
  }) as typeof fetch;
}

async function expectError(
  name: string,
  action: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  let caughtError: unknown;

  try {
    await action();
  } catch (error) {
    caughtError = error;
  }

  assert.ok(caughtError instanceof Error, `${name}: expected an Error`);

  assert.ok(
    caughtError.message.includes(expectedMessage),
    `${name}: unexpected error message: ${caughtError.message}`,
  );

  console.log(`PASS: ${name}`);
}

async function main(): Promise<void> {
  try {
    console.log("\nTicko error handling tests\n");

    // ---------------------------------------------------------
    // 1. Invalid parameter tests
    // ---------------------------------------------------------

    requestCount = 0;

    setMockFetch(async () => mockSuccessResponse());

    await expectError(
      "Modify rejects empty order_id",
      () =>
        modifyOrder({
          privateKey: TEST_PRIVATE_KEY,
          signerAddress: account.address,
          businessFields: {
            order_id: "",
            price: "64000",
          },
        }),
      "valid order_id",
    );

    await expectError(
      "Modify rejects empty price",
      () =>
        modifyOrder({
          privateKey: TEST_PRIVATE_KEY,
          signerAddress: account.address,
          businessFields: {
            order_id: "test-order",
            price: "",
          },
        }),
      "valid price",
    );

    await expectError(
      "Cancel rejects empty order_id",
      () =>
        cancelOrder({
          privateKey: TEST_PRIVATE_KEY,
          signerAddress: account.address,
          businessFields: {
            order_id: "",
          },
        }),
      "valid order_id",
    );

    await expectError(
      "Chase rejects empty order_id",
      () =>
        chaseOrder({
          privateKey: TEST_PRIVATE_KEY,
          signerAddress: account.address,
          businessFields: {
            order_id: "",
          },
        }),
      "valid order_id",
    );

    await expectError(
      "Invalid expiresTtl is rejected",
      () =>
        cancelOrder({
          privateKey: TEST_PRIVATE_KEY,
          signerAddress: account.address,
          businessFields: {
            order_id: "test-order",
          },
          expiresTtl: 0,
        }),
      "expiresTtl must be a positive integer",
    );

    assert.equal(
      requestCount,
      0,
      "Invalid parameters must not send HTTP requests",
    );

    console.log("PASS: Invalid parameters sent zero requests");

    // ---------------------------------------------------------
    // 2. HTTP error test
    // ---------------------------------------------------------

    setMockFetch(
      async () =>
        new Response("Server error", {
          status: 500,
        }),
    );

    await expectError(
      "HTTP 500 is handled",
      () =>
        cancelOrder({
          privateKey: TEST_PRIVATE_KEY,
          signerAddress: account.address,
          businessFields: {
            order_id: "test-order",
          },
        }),
      "HTTP 500",
    );

    // ---------------------------------------------------------
    // 3. API envelope error test
    // ---------------------------------------------------------

    setMockFetch(async () =>
      mockErrorResponse("1001", "Invalid order"),
    );

    await expectError(
      "API error code is handled",
      () =>
        cancelOrder({
          privateKey: TEST_PRIVATE_KEY,
          signerAddress: account.address,
          businessFields: {
            order_id: "test-order",
          },
        }),
      "code=1001",
    );

    // ---------------------------------------------------------
    // 4. Non-JSON response test
    // ---------------------------------------------------------

    setMockFetch(
      async () =>
        new Response("This is not JSON", {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
          },
        }),
    );

    await expectError(
      "Non-JSON response is handled",
      () =>
        cancelOrder({
          privateKey: TEST_PRIVATE_KEY,
          signerAddress: account.address,
          businessFields: {
            order_id: "test-order",
          },
        }),
      "non-JSON response",
    );

    // ---------------------------------------------------------
    // 5. Network error test
    // ---------------------------------------------------------

    setMockFetch(async () => {
      throw new Error("Simulated network failure");
    });

    await expectError(
      "Network failure is handled",
      () =>
        cancelOrder({
          privateKey: TEST_PRIVATE_KEY,
          signerAddress: account.address,
          businessFields: {
            order_id: "test-order",
          },
        }),
      "network error",
    );

    // ---------------------------------------------------------
    // 6. Successful response regression test
    // ---------------------------------------------------------

    setMockFetch(async () => mockSuccessResponse());

    const result = await cancelOrder({
      privateKey: TEST_PRIVATE_KEY,
      signerAddress: account.address,
      businessFields: {
        order_id: "test-order",
      },
    });

    assert.equal(result.order_id, "local-test-order");

    console.log("PASS: Successful response still works");

    console.log("\nAll error handling tests passed.");
    console.log("Real Ticko API requests: 0\n");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error: unknown) => {
  console.error("\nTEST FAILED:");
  console.error(error);
  process.exitCode = 1;
});