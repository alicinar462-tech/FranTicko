
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSymbols: vi.fn(),
  placeOrder: vi.fn(),
}));

vi.mock("@/lib/ticko/client", () => ({
  getSymbols: mocks.getSymbols,
  placeOrder: mocks.placeOrder,
}));

import { POST } from "./route";

const validOrder = {
  symbol_id: 20001,
  is_buy: true,
  order_type: "limit",
  time_in_force: "gtc",
  quantity: "0.001",
  price: "80000.0",
  position_side: "both",
  margin_mode: "cross",
};

const mockSymbol = {
  symbol_id: 20001,
  status: "trading",
  trading_mode: "normal",
  min_size: "0.001",
  max_size: "100",
  qty_step: "0.001",
  price_step: "0.1",
  qty_precision: 3,
  price_precision: 1,
};

const makeRequest = (
  body: Record<string, unknown>,
  options?: {
    origin?: string;
    contentType?: string;
  },
) =>
  new Request("http://localhost:3000/api/ticko/place-order", {
    method: "POST",
    headers: {
      origin: options?.origin ?? "http://localhost:3000",
      "content-type": options?.contentType ?? "application/json",
    },
    body: JSON.stringify(body),
  });

const sendOrder = (body: Record<string, unknown>) =>
  POST(makeRequest(body));

describe("Ticko place-order API", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv(
      "TICKO_BASE_URL",
      "https://api.testnet.ticko.xyz/v1",
    );
    vi.stubEnv(
      "TICKO_AGENT_PRIVATE_KEY",
      `0x${"1".repeat(64)}`,
    );
    vi.stubEnv(
      "TICKO_AGENT_ADDRESS",
      "0x0000000000000000000000000000000000000001",
    );
    vi.stubEnv(
      "TICKO_ACCOUNT_ADDRESS",
      "0x0000000000000000000000000000000000000002",
    );

    mocks.getSymbols.mockResolvedValue({
      list: [mockSymbol],
    });

    mocks.placeOrder.mockResolvedValue({
      order_id: "test-order-123",
      state: "open",
      tx_hash: "0xtest",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // VALID ORDERS

  it("accepts a valid limit order", async () => {
    const response = await sendOrder(validOrder);

    expect(response.status).toBe(200);
    expect(mocks.placeOrder).toHaveBeenCalledTimes(1);
  });

  it("accepts a valid market order", async () => {
    const response = await sendOrder({
      ...validOrder,
      order_type: "market",
      time_in_force: "ioc",
      price: undefined,
    });

    expect(response.status).toBe(200);
    expect(mocks.placeOrder).toHaveBeenCalledTimes(1);
  });

  it.each([
    "queue_1",
    "queue_5",
    "counter_party_1",
    "counter_party_5",
  ])("accepts limit order with price_match: %s", async (price_match) => {
    const { price, ...order } = validOrder;

    const response = await sendOrder({
      ...order,
      price_match,
    });

    expect(response.status).toBe(200);
    expect(mocks.placeOrder).toHaveBeenCalledTimes(1);
  });

  // ORIGIN AND TESTNET SECURITY

  it("rejects requests from an unauthorized origin", async () => {
    const response = await POST(
      makeRequest(validOrder, {
        origin: "https://unauthorized.example",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.getSymbols).not.toHaveBeenCalled();
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects requests without an origin", async () => {
    const request = new Request(
      "http://localhost:3000/api/ticko/place-order",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(validOrder),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects a non-Testnet API URL", async () => {
    vi.stubEnv("TICKO_BASE_URL", "https://api.ticko.xyz/v1");

    const response = await sendOrder(validOrder);

    expect(response.status).toBe(403);
    expect(mocks.getSymbols).not.toHaveBeenCalled();
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  // AGENT CONFIGURATION

  it("rejects missing Agent credentials", async () => {
    vi.stubEnv("TICKO_AGENT_PRIVATE_KEY", "");

    const response = await sendOrder(validOrder);

    expect(response.status).toBe(500);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects an invalid Agent private key", async () => {
    vi.stubEnv("TICKO_AGENT_PRIVATE_KEY", "invalid-key");

    const response = await sendOrder(validOrder);

    expect(response.status).toBe(500);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  // ORDER PARAMETER VALIDATION

  it("rejects a limit order without price or price_match", async () => {
    const { price, ...order } = validOrder;

    const response = await sendOrder(order);

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects a limit order containing both price and price_match", async () => {
    const response = await sendOrder({
      ...validOrder,
      price_match: "queue_1",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects an invalid price_match value", async () => {
    const { price, ...order } = validOrder;

    const response = await sendOrder({
      ...order,
      price_match: "invalid_value",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects a market order containing price", async () => {
    const response = await sendOrder({
      ...validOrder,
      order_type: "market",
      time_in_force: "ioc",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects a market order containing price_match", async () => {
    const { price, ...order } = validOrder;

    const response = await sendOrder({
      ...order,
      order_type: "market",
      time_in_force: "ioc",
      price_match: "queue_1",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects post_only on a market order", async () => {
    const { price, ...order } = validOrder;

    const response = await sendOrder({
      ...order,
      order_type: "market",
      time_in_force: "ioc",
      flags: ["post_only"],
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects duplicate order flags", async () => {
    const response = await sendOrder({
      ...validOrder,
      flags: ["reduce_only", "reduce_only"],
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects post_only without GTC", async () => {
    const response = await sendOrder({
      ...validOrder,
      time_in_force: "ioc",
      flags: ["post_only"],
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  // QUANTITY VALIDATION

  it.each(["0", "-1"])(
    "rejects an invalid quantity: %s",
    async (quantity) => {
      const response = await sendOrder({
        ...validOrder,
        quantity,
      });

      expect(response.status).toBe(400);
      expect(mocks.placeOrder).not.toHaveBeenCalled();
    },
  );

  it("rejects quantity below minimum size", async () => {
    const response = await sendOrder({
      ...validOrder,
      quantity: "0.0009",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects quantity above maximum size", async () => {
    const response = await sendOrder({
      ...validOrder,
      quantity: "100.001",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects quantity that does not follow qty_step", async () => {
    const response = await sendOrder({
      ...validOrder,
      quantity: "0.0015",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects quantity exceeding decimal precision", async () => {
    const response = await sendOrder({
      ...validOrder,
      quantity: "0.0001",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  // PRICE VALIDATION

  it("rejects price that does not follow price_step", async () => {
    const response = await sendOrder({
      ...validOrder,
      price: "80000.05",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects price exceeding decimal precision", async () => {
    const response = await sendOrder({
      ...validOrder,
      price: "80000.01",
    });

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  // SYMBOL VALIDATION

  it("rejects an unknown trading symbol", async () => {
    mocks.getSymbols.mockResolvedValue({
      list: [],
    });

    const response = await sendOrder(validOrder);

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects a symbol that is not trading", async () => {
    mocks.getSymbols.mockResolvedValue({
      list: [
        {
          ...mockSymbol,
          status: "halted",
        },
      ],
    });

    const response = await sendOrder(validOrder);

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("rejects a cancel_only symbol", async () => {
    mocks.getSymbols.mockResolvedValue({
      list: [
        {
          ...mockSymbol,
          trading_mode: "cancel_only",
        },
      ],
    });

    const response = await sendOrder(validOrder);

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("requires post_only for a post_only symbol", async () => {
    mocks.getSymbols.mockResolvedValue({
      list: [
        {
          ...mockSymbol,
          trading_mode: "post_only",
        },
      ],
    });

    const response = await sendOrder(validOrder);

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("requires reduce_only for a reduce_only symbol", async () => {
    mocks.getSymbols.mockResolvedValue({
      list: [
        {
          ...mockSymbol,
          trading_mode: "reduce_only",
        },
      ],
    });

    const response = await sendOrder(validOrder);

    expect(response.status).toBe(400);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });
});
