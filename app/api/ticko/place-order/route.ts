
import { isAddress, type Address, type Hex } from "viem";
import { getSymbols, placeOrder } from "@/lib/ticko/client";
import type {
  TickoPlaceOrderFields,
  TickoOrderType,
  TickoTimeInForce,
  TickoPositionSide,
  TickoMarginMode,
  TickoOrderFlag,
} from "@/lib/ticko/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRICE_MATCH_VALUES = [
  "queue_1",
  "queue_5",
  "counter_party_1",
  "counter_party_5",
] as const;

const MARKET_ORDER_TYPES = ["base", "quote"] as const;

function jsonError(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

function isPositiveDecimal(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d+(\.\d+)?$/.test(value)) return false;

  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function decimalPlaces(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

function toScaledInteger(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = fraction.padEnd(scale, "0");

  return BigInt(`${whole}${normalizedFraction}`);
}

function isMultipleOfStep(value: string, step: string): boolean {
  const scale = Math.max(
    decimalPlaces(value),
    decimalPlaces(step),
  );

  const valueInteger = toScaledInteger(value, scale);
  const stepInteger = toScaledInteger(step, scale);

  if (stepInteger <= BigInt(0)) return false;

  return valueInteger % stepInteger === BigInt(0);
}

function isOneOf<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) return false;

  const configuredOrigin = process.env.APP_ORIGIN?.trim();

  if (configuredOrigin) {
    try {
      return new URL(origin).origin === new URL(configuredOrigin).origin;
    } catch {
      return false;
    }
  }

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return (
    origin === "http://localhost:3000" ||
    origin === "http://127.0.0.1:3000"
  );
}

function isTestnetConfigured(): boolean {
  const baseUrl =
    process.env.TICKO_BASE_URL?.trim() ??
    "https://api.testnet.ticko.xyz/v1";

  try {
    const url = new URL(baseUrl);

    return (
      url.protocol === "https:" &&
      url.hostname === "api.testnet.ticko.xyz" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.replace(/\/+$/, "") === "/v1"
    );
  } catch {
    return false;
  }
}

function getSafeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const details = error as Error & {
      shortMessage?: string;
      details?: string;
      cause?: unknown;
      status?: number;
      code?: string | number;
    };

    const cause =
      details.cause instanceof Error
        ? details.cause.message
        : typeof details.cause === "string"
          ? details.cause
          : undefined;

    return {
      name: details.name,
      message: details.message,
      shortMessage: details.shortMessage,
      details: details.details,
      cause,
      status: details.status,
      code: details.code,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return {
    message: "Unknown error",
    type: typeof error,
  };
}

export async function POST(request: Request) {
  // 1. Origin protection
  if (!isAllowedOrigin(request)) {
    return jsonError("Request origin is not allowed.", 403);
  }

  // 2. Testnet-only protection
  if (!isTestnetConfigured()) {
    return jsonError("Only Ticko Testnet is allowed.", 403);
  }

  // 3. Content type
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonError("Content-Type must be application/json.", 415);
  }

  // 4. Server credentials
  const privateKey = process.env.TICKO_AGENT_PRIVATE_KEY?.trim();
  const signerAddress = process.env.TICKO_AGENT_ADDRESS?.trim();
  const targetAddress = process.env.TICKO_ACCOUNT_ADDRESS?.trim();

  if (!privateKey || !signerAddress || !targetAddress) {
    return jsonError(
      "Ticko Agent credentials are not fully configured.",
      500,
    );
  }

  if (
    !/^0x[0-9a-fA-F]{64}$/.test(privateKey) ||
    !isAddress(signerAddress) ||
    !isAddress(targetAddress)
  ) {
    return jsonError("Ticko Agent configuration is invalid.", 500);
  }

  // 5. Request body
  let body: Record<string, unknown>;

  try {
    const parsed: unknown = await request.json();

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return jsonError("Invalid request body.", 400);
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  const {
    symbol_id,
    is_buy,
    order_type,
    time_in_force,
    quantity,
    price,
    position_side,
    margin_mode,
    client_order_id,
    slippage,
    market_order_type,
    price_match,
    flags,
  } = body;

  // 6. Common order validation
  if (
    typeof symbol_id !== "number" ||
    !Number.isInteger(symbol_id) ||
    symbol_id <= 0 ||
    typeof is_buy !== "boolean" ||
    !isOneOf<TickoOrderType>(
      order_type,
      ["limit", "market"],
    ) ||
    !isOneOf<TickoTimeInForce>(
      time_in_force,
      ["gtc", "ioc", "fok"],
    ) ||
    !isPositiveDecimal(quantity) ||
    !isOneOf<TickoPositionSide>(
      position_side,
      ["both", "long", "short"],
    ) ||
    !isOneOf<TickoMarginMode>(
      margin_mode,
      ["cross", "isolated"],
    )
  ) {
    return jsonError(
      "Order parameters are invalid or incomplete.",
      400,
    );
  }

  // 7. Optional field validation
  if (
    client_order_id !== undefined &&
    (
      typeof client_order_id !== "string" ||
      client_order_id.length === 0 ||
      client_order_id.length > 64
    )
  ) {
    return jsonError("Invalid client_order_id.", 400);
  }

  if (
    slippage !== undefined &&
    (
      typeof slippage !== "string" ||
      !isPositiveDecimal(slippage)
    )
  ) {
    return jsonError("Invalid slippage value.", 400);
  }

  if (
    market_order_type !== undefined &&
    !isOneOf(market_order_type, MARKET_ORDER_TYPES)
  ) {
    return jsonError("Invalid market_order_type.", 400);
  }

  if (
    price_match !== undefined &&
    !isOneOf(price_match, PRICE_MATCH_VALUES)
  ) {
    return jsonError("Invalid price_match value.", 400);
  }

  const allowedFlags: readonly TickoOrderFlag[] = [
    "post_only",
    "reduce_only",
  ];

  if (
    flags !== undefined &&
    (
      !Array.isArray(flags) ||
      !flags.every((flag) =>
        isOneOf<TickoOrderFlag>(flag, allowedFlags),
      ) ||
      new Set(flags).size !== flags.length
    )
  ) {
    return jsonError("Invalid order flags.", 400);
  }

  const orderFlags = Array.isArray(flags)
    ? (flags as TickoOrderFlag[])
    : [];

  // 8. Order-type-specific validation
  if (order_type === "limit") {
    const hasManualPrice = price !== undefined;
    const hasPriceMatch = price_match !== undefined;

    if (hasManualPrice === hasPriceMatch) {
      return jsonError(
        "A limit order requires exactly one of price or price_match.",
        400,
      );
    }

    if (hasManualPrice && !isPositiveDecimal(price)) {
      return jsonError("Invalid limit order price.", 400);
    }

    if (
      market_order_type !== undefined ||
      slippage !== undefined
    ) {
      return jsonError(
        "Market order options cannot be used with limit orders.",
        400,
      );
    }
  }

  if (order_type === "market") {
    if (
      price !== undefined ||
      price_match !== undefined
    ) {
      return jsonError(
        "Market orders cannot include price or price_match.",
        400,
      );
    }

    if (orderFlags.includes("post_only")) {
      return jsonError(
        "post_only cannot be used with market orders.",
        400,
      );
    }
  }

  // 9. post_only validation
  if (orderFlags.includes("post_only")) {
    if (
      order_type !== "limit" ||
      time_in_force !== "gtc" ||
      price === undefined ||
      price_match !== undefined
    ) {
      return jsonError(
        "post_only requires a limit order with manual price and gtc time_in_force.",
        400,
      );
    }
  }

  // 10. Fetch current market rules
  let symbol;

  try {
    const symbolsData = await getSymbols();

    symbol = symbolsData.list.find(
      (item) => item.symbol_id === symbol_id,
    );
  } catch (error) {
    console.error(
      "[Ticko] Failed to retrieve market rules:",
      getSafeErrorDetails(error),
    );

    return jsonError(
      "Could not retrieve Ticko market rules.",
      502,
    );
  }

  if (!symbol) {
    return jsonError("Trading symbol was not found.", 400);
  }

  if (symbol.status !== "trading") {
    return jsonError(
      "This trading symbol is not currently available.",
      400,
    );
  }

  // 11. Trading mode validation
  if (symbol.trading_mode === "cancel_only") {
    return jsonError(
      "This symbol currently only allows order cancellation.",
      400,
    );
  }

  if (
    symbol.trading_mode === "limit_only" &&
    order_type !== "limit"
  ) {
    return jsonError(
      "This symbol currently only allows limit orders.",
      400,
    );
  }

  if (
    symbol.trading_mode === "post_only" &&
    !orderFlags.includes("post_only")
  ) {
    return jsonError(
      "This symbol requires a post_only order.",
      400,
    );
  }

  if (
    symbol.trading_mode === "reduce_only" &&
    !orderFlags.includes("reduce_only")
  ) {
    return jsonError(
      "This symbol requires a reduce_only order.",
      400,
    );
  }

  // 12. Validate market rule configuration
  const minimumSize = Number(symbol.min_size);
  const maximumSize = Number(symbol.max_size);

  if (
    !Number.isFinite(minimumSize) ||
    !Number.isFinite(maximumSize) ||
    minimumSize <= 0 ||
    maximumSize < minimumSize ||
    !isPositiveDecimal(symbol.qty_step) ||
    !isPositiveDecimal(symbol.price_step)
  ) {
    return jsonError(
      "Ticko returned invalid market rules.",
      502,
    );
  }

  // 13. Quantity validation
  // For quote-based market orders, quantity is not the base-asset size.
  // Therefore base-asset min/max and qty-step rules are not applied here.
  const isQuoteMarketOrder =
    order_type === "market" &&
    market_order_type === "quote";

  if (!isQuoteMarketOrder) {
    const quantityNumber = Number(quantity);

    if (
      quantityNumber < minimumSize ||
      quantityNumber > maximumSize
    ) {
      return jsonError(
        `Quantity must be between ${symbol.min_size} and ${symbol.max_size}.`,
        400,
      );
    }

    if (
      decimalPlaces(quantity) > symbol.qty_precision ||
      !isMultipleOfStep(quantity, symbol.qty_step)
    ) {
      return jsonError(
        `Quantity must follow the ${symbol.qty_step} step and ${symbol.qty_precision} decimal precision.`,
        400,
      );
    }
  }

  // 14. Manual limit price validation
  if (order_type === "limit" && typeof price === "string") {
    if (
      decimalPlaces(price) > symbol.price_precision ||
      !isMultipleOfStep(price, symbol.price_step)
    ) {
      return jsonError(
        `Price must follow the ${symbol.price_step} step and ${symbol.price_precision} decimal precision.`,
        400,
      );
    }
  }

  // 15. Build signed business fields
  const businessFields: TickoPlaceOrderFields = {
    symbol_id,
    is_buy,
    order_type,
    time_in_force,
    quantity,
    position_side,
    margin_mode,
    ...(typeof price === "string" ? { price } : {}),
    ...(typeof client_order_id === "string"
      ? { client_order_id }
      : {}),
    ...(typeof slippage === "string"
      ? { slippage }
      : {}),
    ...(typeof market_order_type === "string"
      ? { market_order_type }
      : {}),
    ...(typeof price_match === "string"
      ? { price_match }
      : {}),
    ...(orderFlags.length > 0
      ? { flags: orderFlags }
      : {}),
  };

  // 16. Submit order
  try {
    const result = await placeOrder({
      privateKey: privateKey as Hex,
      signerAddress: signerAddress as Address,
      targetAddress: targetAddress as Address,
      businessFields,
    });

    console.info("[Ticko] Order submission response:", {
      order_id: result.order_id,
      state: result.state,
      tx_hash: result.tx_hash,
    });

    return Response.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "[Ticko] Order submission failed:",
      getSafeErrorDetails(error),
    );

    return jsonError(
      "Ticko order submission failed. Check server logs.",
      502,
    );
  }
}
  