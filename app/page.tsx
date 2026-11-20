"use client";

import Image from "next/image";
import {
  TickoOrderBookStream,
  type TickoStreamStatus,
} from "../lib/ticko/orderbook-stream";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

interface TickoSymbol {
  symbol_id: number;
  status: string;
  trading_mode: string | null;
  base_coin_id: number;
  quote_coin_id: number;
  price_precision: number;
  qty_precision: number;
  price_step: string;
  qty_step: string;
  min_size: string;
  max_size: string;
  max_leverage: number | null;
  default_leverage: number | null;
  price_limit_pct: string | null;
}

interface RefDataCoin {
  coin: string;
  coin_id: number;
}

interface RefDataSymbol {
  symbol: string;
  symbol_id: number;
}

interface RefDataData {
  coins: Record<string, RefDataCoin>;
  symbols: Record<string, RefDataSymbol>;
}

interface RefDataResponse {
  ok: boolean;
  data?: RefDataData;
  error?: string;
}

interface BalanceCoin {
  coin_id: number;
  balance: string;
  isolated_balance: string;
  updated_time: number;
}

interface BalanceData {
  address: string;
  coins: BalanceCoin[];
}

interface BalanceResponse {
  ok: boolean;
  data?: BalanceData;
  error?: string;
}

type TickoOrderBookLevel = [price: string, quantity: string];

interface OrderBookData {
  symbol_id: number;
  asks: TickoOrderBookLevel[];
  bids: TickoOrderBookLevel[];
  seq?: number;
  time?: number;
}

interface OrderBookResponse {
  ok: boolean;
  data?: OrderBookData;
  error?: string;
}

interface SymbolsResponse {
  ok: boolean;
  data: {
    list: TickoSymbol[];
  };
  error?: string;
}

interface AccountActivityRecord {
  [key: string]: unknown;
}

interface AccountActivityResponse {
  ok: boolean;
  data?: {
    list?: AccountActivityRecord[];
    [key: string]: unknown;
  };
  error?: string;
}

interface PlaceOrderResponse {
  ok: boolean;
  data?: {
    order_id: string;
    tx_hash: string;
    state: string;
  };
  error?: string;
}

interface DisplayOrderBookLevel {
  price: string;
  quantity: string;
  cumulative: number;
  depthPercent: number;
}

type OrderMode = "maker" | "taker";
type OrderSide = "buy" | "sell";
type PriceMatch = "" | "opponent" | "queue";

const DEFAULT_SYMBOL_ID = 20001;
const USDT_COIN_ID = 1001;

function formatNumber(
  value: string | number | null | undefined,
  precision = 4,
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

function buildDepthLevels(
  levels: TickoOrderBookLevel[],
): DisplayOrderBookLevel[] {
  let cumulative = 0;

  const parsed = levels.map(([price, quantity]) => {
    const numericQuantity = Number(quantity);

    cumulative += Number.isFinite(numericQuantity)
      ? numericQuantity
      : 0;

    return {
      price,
      quantity,
      cumulative,
      depthPercent: 0,
    };
  });

  const maximum = Math.max(
    ...parsed.map((level) => level.cumulative),
    0,
  );

  return parsed.map((level) => ({
    ...level,
    depthPercent:
      maximum > 0 ? (level.cumulative / maximum) * 100 : 0,
  }));
}

function getRecordValue(
  record: AccountActivityRecord,
  keys: string[],
): string {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined && value !== null) {
      return String(value);
    }
  }

  return "—";
}

function formatExecutionTime(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numericValue = Number(value);
  const date = Number.isFinite(numericValue)
    ? new Date(numericValue)
    : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatExecutionSide(value: unknown): string {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return "Buy";
  }

  if (value === false || value === "false" || value === 0 || value === "0") {
    return "Sell";
  }

  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

export default function Home() {
  const [symbols, setSymbols] = useState<TickoSymbol[]>([]);
  const [symbol, setSymbol] = useState<TickoSymbol | null>(null);
  const [refData, setRefData] = useState<RefDataData | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);

  const [accountOrders, setAccountOrders] = useState<
    AccountActivityRecord[]
  >([]);

  const [accountExecutions, setAccountExecutions] = useState<
    AccountActivityRecord[]
  >([]);

  const [loadingAccountActivity, setLoadingAccountActivity] =
    useState(false);

  const [accountActivityError, setAccountActivityError] = useState("");

  const [streamStatus, setStreamStatus] =
    useState<TickoStreamStatus>("disconnected");

  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingOrderBook, setLoadingOrderBook] = useState(true);

  const [marketError, setMarketError] = useState("");
  const [balanceError, setBalanceError] = useState("");
  const [orderBookError, setOrderBookError] = useState("");

  const [orderMode, setOrderMode] =
    useState<OrderMode>("maker");

  const [orderSide, setOrderSide] =
    useState<OrderSide>("buy");

  const [priceMatch, setPriceMatch] =
    useState<PriceMatch>("");

  const [orderPrice, setOrderPrice] = useState("");
  const [orderQuantity, setOrderQuantity] = useState("0.001");

  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSubmitError, setOrderSubmitError] = useState("");

  const [orderSubmitResult, setOrderSubmitResult] = useState<{
    orderId: string;
    txHash: string;
    state: string;
  } | null>(null);

  const loadMarket = useCallback(async () => {
    setLoadingMarket(true);
    setMarketError("");

    try {
      const response = await fetch("/api/ticko/symbols", {
        cache: "no-store",
      });

      const result = (await response.json()) as SymbolsResponse;

      if (!response.ok || !result.ok || !result.data) {
        throw new Error(
          result.error ?? "Unable to load market data.",
        );
      }

      try {
        const refResponse = await fetch("/api/ticko/ref-data", {
          cache: "no-store",
        });

        const refResult =
          (await refResponse.json()) as RefDataResponse;

        if (
          refResponse.ok &&
          refResult.ok &&
          refResult.data
        ) {
          setRefData(refResult.data);
        } else {
          setRefData(null);
        }
      } catch {
        setRefData(null);
      }

      const tradingSymbols = result.data.list.filter(
        (item) => item.status === "trading",
      );

      if (tradingSymbols.length === 0) {
        throw new Error(
          "No trading symbols are currently available.",
        );
      }

      setSymbols(tradingSymbols);

      setSymbol((currentSymbol) =>
        tradingSymbols.find(
          (item) =>
            item.symbol_id === currentSymbol?.symbol_id,
        ) ??
          tradingSymbols.find(
            (item) => item.symbol_id === DEFAULT_SYMBOL_ID,
          ) ??
          tradingSymbols[0],
      );
    } catch (error) {
      setMarketError(
        error instanceof Error
          ? error.message
          : "Unable to load market data.",
      );
    } finally {
      setLoadingMarket(false);
    }
  }, []);

  const loadBalance = useCallback(async () => {
    setLoadingBalance(true);
    setBalanceError("");

    try {
      const response = await fetch(
        "/api/ticko/balance",
        {
          cache: "no-store",
        },
      );

      const result = (await response.json()) as BalanceResponse;

      if (!response.ok || !result.ok || !result.data) {
        throw new Error(
          result.error ?? "Unable to load account balance.",
        );
      }

      setBalance(result.data);
    } catch (error) {
      setBalance(null);
      setBalanceError(
        error instanceof Error
          ? error.message
          : "Unable to load account balance.",
      );
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const loadOrderBook = useCallback(
    async (symbolId: number, signal: AbortSignal) => {
      try {
        const response = await fetch(
          `/api/ticko/orderbook?symbol_id=${symbolId}&level=1`,
          {
            cache: "no-store",
            signal,
          },
        );

        const result =
          (await response.json()) as OrderBookResponse;

        if (!response.ok || !result.ok || !result.data) {
          throw new Error(
            result.error ?? "Unable to load order book data.",
          );
        }

        if (result.data.symbol_id === symbolId) {
          setOrderBook(result.data);
        }
      } catch (error) {
        if (signal.aborted) return;

        setOrderBookError(
          error instanceof Error
            ? error.message
            : "Unable to load order book data.",
        );
      } finally {
        if (!signal.aborted) {
          setLoadingOrderBook(false);
        }
      }
    },
    [],
  );

  const loadAccountActivity = useCallback(
    async (symbolId: number) => {
      setLoadingAccountActivity(true);
      setAccountActivityError("");

      try {
        const query = new URLSearchParams({
          symbol_id: String(symbolId),
          limit: "20",
        });

        const [ordersResponse, executionsResponse] =
          await Promise.all([
            fetch(
              `/api/ticko/orders?${query.toString()}`,
              {
                cache: "no-store",
              },
            ),
            fetch(
              `/api/ticko/executions?${query.toString()}`,
              {
                cache: "no-store",
              },
            ),
          ]);

        const [ordersResult, executionsResult] =
          (await Promise.all([
            ordersResponse.json(),
            executionsResponse.json(),
          ])) as [
            AccountActivityResponse,
            AccountActivityResponse,
          ];

        if (
          !ordersResponse.ok ||
          !ordersResult.ok
        ) {
          throw new Error(
            ordersResult.error ?? "Unable to load open orders.",
          );
        }

        if (
          !executionsResponse.ok ||
          !executionsResult.ok
        ) {
          throw new Error(
            executionsResult.error ?? "Unable to load executions.",
          );
        }

        setAccountOrders(ordersResult.data?.list ?? []);
        setAccountExecutions(executionsResult.data?.list ?? []);
      } catch (error) {
        setAccountOrders([]);
        setAccountExecutions([]);

        setAccountActivityError(
          error instanceof Error
            ? error.message
            : "Unable to load account activity.",
        );
      } finally {
        setLoadingAccountActivity(false);
      }
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadMarket(),
      loadBalance(),
    ]);
  }, [loadMarket, loadBalance]);

  useEffect(() => {
    void Promise.resolve().then(refreshAll);
  }, [refreshAll]);

  // Load the server-configured Ticko account's order and execution history.
  useEffect(() => {
    if (!symbol) return;

    void Promise.resolve().then(() =>
      loadAccountActivity(symbol.symbol_id),
    );
  }, [symbol, loadAccountActivity]);

  // Load a REST snapshot for the currently selected symbol.
  useEffect(() => {
    if (!symbol) return;

    const controller = new AbortController();

    void Promise.resolve().then(() =>
      loadOrderBook(symbol.symbol_id, controller.signal),
    );

    return () => {
      controller.abort();
    };
  }, [symbol, loadOrderBook]);

  // Start the public Ticko Order Book stream after the market is loaded.
  useEffect(() => {
    if (!symbol) return;

    const stream = new TickoOrderBookStream(symbol.symbol_id, {
      onBook: (book) => {
        setOrderBook({
          ...book,
          symbol_id: symbol.symbol_id,
        });

        setLoadingOrderBook(false);
        setOrderBookError("");
      },

      onStatus: (status) => {
        setStreamStatus(status);
      },

      onError: (message) => {
        setOrderBookError(message);
      },
    });

    stream.start();

    return () => {
      stream.stop();
    };
  }, [symbol]);

  const askLevels = useMemo(
    () => buildDepthLevels(orderBook?.asks ?? []),
    [orderBook],
  );

  const bidLevels = useMemo(
    () => buildDepthLevels(orderBook?.bids ?? []),
    [orderBook],
  );

  // Derive the best prices from the current order book snapshot/stream.
  // Do not rely on API array ordering: choose the numeric maximum bid
  // and numeric minimum ask while preserving the original price string.
  const bestBid = useMemo(() => {
    const levels = orderBook?.bids ?? [];
    let best: TickoOrderBookLevel | null = null;

    for (const level of levels) {
      if (!best || Number(level[0]) > Number(best[0])) {
        best = level;
      }
    }

    return best?.[0] ?? null;
  }, [orderBook]);

  const bestAsk = useMemo(() => {
    const levels = orderBook?.asks ?? [];
    let best: TickoOrderBookLevel | null = null;

    for (const level of levels) {
      if (!best || Number(level[0]) < Number(best[0])) {
        best = level;
      }
    }

    return best?.[0] ?? null;
  }, [orderBook]);

  const selectedSymbolLabel = useMemo(() => {
    if (!symbol || !refData) return "Market";

    const entry = Object.values(refData.symbols).find(
      (item) => item.symbol_id === symbol.symbol_id,
    );

    return entry?.symbol ?? "Market";
  }, [symbol, refData]);

  const baseCoinLabel = useMemo(() => {
    if (!symbol || !refData) return "Base";

    const entry = Object.values(refData.coins).find(
      (item) => item.coin_id === symbol.base_coin_id,
    );

    return entry?.coin ?? "Base";
  }, [symbol, refData]);

  const quoteCoinLabel = useMemo(() => {
    if (!symbol || !refData) return "Quote";

    const entry = Object.values(refData.coins).find(
      (item) => item.coin_id === symbol.quote_coin_id,
    );

    return entry?.coin ?? "Quote";
  }, [symbol, refData]);

  const priceUnitLabel = quoteCoinLabel;
  const quantityUnitLabel = baseCoinLabel;

  const handlePriceMatch = useCallback(
    (match: PriceMatch) => {
      setPriceMatch(match);

      if (match === "opponent") {
        const opponentPrice =
          orderSide === "buy" ? bestAsk : bestBid;

        if (opponentPrice) {
          setOrderPrice(opponentPrice);
        }
      }

      if (match === "queue") {
        const queuePrice =
          orderSide === "buy" ? bestBid : bestAsk;

        if (queuePrice) {
          setOrderPrice(queuePrice);
        }
      }
    },
    [orderSide, bestAsk, bestBid],
  );

  const submitOrder = useCallback(async () => {
    if (!symbol) return;

    setSubmittingOrder(true);
    setOrderSubmitError("");
    setOrderSubmitResult(null);

    try {
      const response = await fetch("/api/ticko/place-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol_id: symbol.symbol_id,
          is_buy: orderSide === "buy",
          order_type: orderMode === "maker" ? "limit" : "market",
          time_in_force: orderMode === "maker" ? "gtc" : "ioc",
          quantity: orderQuantity,
          ...(orderMode === "maker"
            ? priceMatch
              ? {
                  price_match:
                    priceMatch === "queue" ? "queue_1" : "counter_party_1",
                }
              : { price: orderPrice }
            : {}),
          position_side: "both",
          margin_mode: "cross",
        }),
      });

      const result =
        (await response.json()) as PlaceOrderResponse;

      if (!response.ok || !result.ok || !result.data) {
        throw new Error(
          result.error ?? "Unable to submit order.",
        );
      }

      setOrderSubmitResult({
        orderId: result.data.order_id,
        txHash: result.data.tx_hash,
        state: result.data.state,
      });

      await Promise.all([
        loadBalance(),
        loadAccountActivity(symbol.symbol_id),
      ]);
    } catch (error) {
      setOrderSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to submit order.",
      );
    } finally {
      setSubmittingOrder(false);
    }
  }, [
    symbol,
    orderSide,
    orderMode,
    priceMatch,
    orderPrice,
    orderQuantity,
    loadBalance,
    loadAccountActivity,
  ]);

  if (loadingMarket) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
            <p className="text-sm text-zinc-400">
              Loading FranTicko...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (marketError) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <div className="max-w-md rounded-2xl border border-red-900/60 bg-red-950/20 p-6 text-center">
            <h1 className="text-lg font-semibold text-red-300">
              Unable to load FranTicko
            </h1>
            <p className="mt-3 text-sm text-zinc-400">
              {marketError}
            </p>
            <button
              type="button"
              onClick={refreshAll}
              className="mt-5 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <Image
                src="/partio-logo.png"
                alt="FranTicko"
                fill
                className="object-contain p-1"
                priority
              />
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight">
                FranTicko
              </h1>
              <p className="text-xs text-zinc-500">
                Ticko Testnet Trading Dashboard
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  streamStatus === "connected"
                    ? "bg-emerald-400"
                    : streamStatus === "connecting"
                      ? "bg-amber-400"
                      : "bg-zinc-500"
                }`}
              />
              <span className="text-xs text-zinc-400">
                Order Book{" "}
                {streamStatus === "connected"
                  ? "Live"
                  : streamStatus}
              </span>
            </div>

            <button
              type="button"
              onClick={refreshAll}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-800"
            >
              Refresh
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Account
            </p>
            <p className="mt-2 text-lg font-semibold">
              Agent Wallet
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Server-configured Ticko account
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Available Balance
            </p>

            {loadingBalance ? (
              <p className="mt-2 text-sm text-zinc-500">
                Loading balance...
              </p>
            ) : balanceError ? (
              <p className="mt-2 text-sm text-red-400">
                {balanceError}
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {balance?.coins
                  .filter(
                    (coin) =>
                      Number(coin.balance) > 0 ||
                      Number(coin.isolated_balance) > 0,
                  )
                  .map((coin) => {
                    const coinName =
                      Object.values(refData?.coins ?? {}).find(
                        (item) => item.coin_id === coin.coin_id,
                      )?.coin ?? `Coin ${coin.coin_id}`;

                    return (
                      <div
                        key={coin.coin_id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-sm font-medium text-zinc-300">
                          {coinName}
                        </span>
                        <span className="font-mono text-sm text-zinc-100">
                          {formatNumber(coin.balance, 8)}
                        </span>
                      </div>
                    );
                  })}

                {(!balance?.coins ||
                  balance.coins.filter(
                    (coin) =>
                      Number(coin.balance) > 0 ||
                      Number(coin.isolated_balance) > 0,
                  ).length === 0) && (
                  <p className="text-sm text-zinc-500">
                    No available balance.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Selected Market
            </p>

            <div className="mt-2 flex items-center justify-between gap-3">
              <select
                value={symbol?.symbol_id ?? ""}
                onChange={(event) => {
                  const nextSymbol = symbols.find(
                    (item) =>
                      item.symbol_id === Number(event.target.value),
                  );

                  if (nextSymbol) {
                    setSymbol(nextSymbol);
                    setOrderBook(null);
                    setLoadingOrderBook(true);
                    setOrderBookError("");
                    setPriceMatch("");
                    setOrderPrice("");
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
              >
                {symbols.map((item) => {
                  const label =
                    Object.values(refData?.symbols ?? {}).find(
                      (entry) => entry.symbol_id === item.symbol_id,
                    )?.symbol ?? `Symbol ${item.symbol_id}`;

                  return (
                    <option
                      key={item.symbol_id}
                      value={item.symbol_id}
                    >
                      {label}
                    </option>
                  );
                })}
              </select>

              <span className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
                ID {symbol?.symbol_id}
              </span>
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              {symbol?.trading_mode ?? "—"} ·{" "}
              {symbol?.status ?? "—"}
            </p>
          </div>
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Market
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  Order Book
                </h2>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                  streamStatus === "connected"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {streamStatus}
              </span>
            </div>

            {orderBookError ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-red-400">
                  {orderBookError}
                </p>
              </div>
            ) : loadingOrderBook && !orderBook ? (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
                <p className="text-sm text-zinc-500">
                  Loading order book...
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-0">
                <div className="border-r border-zinc-800">
                  <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                    <span className="text-xs font-semibold text-red-400">
                      Asks
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      Price / Quantity
                    </span>
                  </div>

                  <div className="space-y-1 p-3">
                    {askLevels.slice(0, 10).map((level, index) => (
                      <div
                        key={`${level.price}-${index}`}
                        className="relative grid grid-cols-2 gap-2 overflow-hidden rounded px-2 py-1.5 font-mono text-xs"
                      >
                        <div
                          className="absolute inset-y-0 right-0 bg-red-500/10"
                          style={{
                            width: `${level.depthPercent}%`,
                          }}
                        />
                        <span className="relative text-red-400">
                          {formatNumber(
                            level.price,
                            symbol?.price_precision ?? 4,
                          )}
                        </span>
                        <span className="relative text-right text-zinc-400">
                          {formatNumber(
                            level.quantity,
                            symbol?.qty_precision ?? 4,
                          )}
                        </span>
                      </div>
                    ))}

                    {askLevels.length === 0 && (
                      <p className="py-8 text-center text-xs text-zinc-600">
                        No ask levels.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                    <span className="text-xs font-semibold text-emerald-400">
                      Bids
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      Price / Quantity
                    </span>
                  </div>

                  <div className="space-y-1 p-3">
                    {bidLevels.slice(0, 10).map((level, index) => (
                      <div
                        key={`${level.price}-${index}`}
                        className="relative grid grid-cols-2 gap-2 overflow-hidden rounded px-2 py-1.5 font-mono text-xs"
                      >
                        <div
                          className="absolute inset-y-0 right-0 bg-emerald-500/10"
                          style={{
                            width: `${level.depthPercent}%`,
                          }}
                        />
                        <span className="relative text-emerald-400">
                          {formatNumber(
                            level.price,
                            symbol?.price_precision ?? 4,
                          )}
                        </span>
                        <span className="relative text-right text-zinc-400">
                          {formatNumber(
                            level.quantity,
                            symbol?.qty_precision ?? 4,
                          )}
                        </span>
                      </div>
                    ))}

                    {bidLevels.length === 0 && (
                      <p className="py-8 text-center text-xs text-zinc-600">
                        No bid levels.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 border-t border-zinc-800">
              <div className="border-r border-zinc-800 px-5 py-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Best Bid
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">
                  {bestBid
                    ? formatNumber(
                        bestBid,
                        symbol?.price_precision ?? 4,
                      )
                    : "—"}
                </p>
              </div>

              <div className="px-5 py-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Best Ask
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-red-400">
                  {bestAsk
                    ? formatNumber(
                        bestAsk,
                        symbol?.price_precision ?? 4,
                      )
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Trading
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Place Order
              </h2>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderSide("buy")}
                  className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${
                    orderSide === "buy"
                      ? "bg-emerald-500 text-zinc-950"
                      : "border border-zinc-700 bg-zinc-950 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  Buy
                </button>

                <button
                  type="button"
                  onClick={() => setOrderSide("sell")}
                  className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${
                    orderSide === "sell"
                      ? "bg-red-500 text-white"
                      : "border border-zinc-700 bg-zinc-950 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  Sell
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderMode("maker")}
                  className={`rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                    orderMode === "maker"
                      ? "border border-amber-500/50 bg-amber-500/10 text-amber-300"
                      : "border border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-800"
                  }`}
                >
                  Limit
                </button>

                <button
                  type="button"
                  onClick={() => setOrderMode("taker")}
                  className={`rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                    orderMode === "taker"
                      ? "border border-amber-500/50 bg-amber-500/10 text-amber-300"
                      : "border border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-800"
                  }`}
                >
                  Market
                </button>
              </div>

              <div>
                <label
                  htmlFor="order-price"
                  className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500"
                >
                  Price ({priceUnitLabel})
                </label>

                <input
                  id="order-price"
                  type="text"
                  inputMode="decimal"
                  value={orderPrice}
                  onChange={(event) => {
                    setOrderPrice(event.target.value);
                    setPriceMatch("");
                  }}
                  placeholder="Enter price"
                  disabled={orderMode === "taker"}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 font-mono text-sm text-zinc-100 outline-none transition focus:border-amber-500 disabled:opacity-50"
                />

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePriceMatch("queue")}
                    disabled={orderMode === "taker" || (!bestBid && !bestAsk)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                      priceMatch === "queue"
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    <span className="shrink-0 font-semibold">
                      Queue
                    </span>
                    <span className="truncate font-mono">
                      {orderSide === "buy"
                        ? bestBid
                          ? formatNumber(
                              bestBid,
                              symbol?.price_precision ?? 4,
                            )
                          : "—"
                        : bestAsk
                          ? formatNumber(
                              bestAsk,
                              symbol?.price_precision ?? 4,
                            )
                          : "—"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePriceMatch("opponent")}
                    disabled={orderMode === "taker" || (!bestBid && !bestAsk)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                      priceMatch === "opponent"
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    <span className="shrink-0 font-semibold">
                      Opponent
                    </span>
                    <span className="truncate font-mono">
                      {orderSide === "buy"
                        ? bestAsk
                          ? formatNumber(
                              bestAsk,
                              symbol?.price_precision ?? 4,
                            )
                          : "—"
                        : bestBid
                          ? formatNumber(
                              bestBid,
                              symbol?.price_precision ?? 4,
                            )
                          : "—"}
                    </span>
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (bestBid) setOrderPrice(bestBid);
                      setPriceMatch("queue");
                    }}
                    disabled={orderMode === "taker" || !bestBid}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400 transition hover:bg-zinc-800 disabled:opacity-40"
                  >
                    <span className="shrink-0 font-semibold text-emerald-400">
                      Best Bid
                    </span>
                    <span className="truncate font-mono text-zinc-200">
                      {bestBid
                        ? formatNumber(
                            bestBid,
                            symbol?.price_precision ?? 4,
                          )
                        : "—"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (bestAsk) setOrderPrice(bestAsk);
                      setPriceMatch("opponent");
                    }}
                    disabled={orderMode === "taker" || !bestAsk}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400 transition hover:bg-zinc-800 disabled:opacity-40"
                  >
                    <span className="shrink-0 font-semibold text-red-400">
                      Best Ask
                    </span>
                    <span className="truncate font-mono text-zinc-200">
                      {bestAsk
                        ? formatNumber(
                            bestAsk,
                            symbol?.price_precision ?? 4,
                          )
                        : "—"}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="order-quantity"
                  className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500"
                >
                  Quantity ({quantityUnitLabel})
                </label>

                <input
                  id="order-quantity"
                  type="text"
                  inputMode="decimal"
                  value={orderQuantity}
                  onChange={(event) =>
                    setOrderQuantity(event.target.value)
                  }
                  placeholder="Enter quantity"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 font-mono text-sm text-zinc-100 outline-none transition focus:border-amber-500"
                />
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">
                    Estimated Order Value
                  </span>

                  <span className="font-mono text-zinc-200">
                    {orderPrice && orderQuantity
                      ? formatNumber(
                          Number(orderPrice) * Number(orderQuantity),
                          4,
                        )
                      : "—"}{" "}
                    {priceUnitLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 p-5">
            <button
              type="button"
              onClick={submitOrder}
              disabled={
                submittingOrder ||
                !symbol ||
                loadingMarket
              }
              className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                orderSide === "buy"
                  ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                  : "bg-red-500 text-white hover:bg-red-400"
              }`}
            >
              {submittingOrder
                ? "Submitting..."
                : `${orderSide === "buy" ? "Buy" : "Sell"} ${selectedSymbolLabel}`}
            </button>

            <p className="mt-3 text-center text-[10px] text-zinc-500">
              Ticko Testnet · Signed order submission · No live trading
            </p>

            {orderSubmitError && (
              <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3">
                <p className="text-sm text-red-300">
                  {orderSubmitError}
                </p>
              </div>
            )}

            {orderSubmitResult && (
              <div className="mt-4 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-300">
                  Order submitted successfully
                </p>

                <p className="mt-2 break-all text-xs text-zinc-400">
                  Order ID: {orderSubmitResult.orderId}
                </p>

                <p className="mt-1 break-all text-xs text-zinc-400">
                  Transaction: {orderSubmitResult.txHash}
                </p>

                <p className="mt-1 text-xs text-zinc-400">
                  State: {orderSubmitResult.state}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Account
              </p>

              <h2 className="mt-1 text-lg font-semibold">
                Open Orders
              </h2>
            </div>

            {loadingAccountActivity ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">
                Loading orders...
              </p>
            ) : accountActivityError ? (
              <p className="px-5 py-8 text-center text-sm text-red-400">
                {accountActivityError}
              </p>
            ) : accountOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-800 text-zinc-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Order ID</th>
                      <th className="px-5 py-3 font-medium">Side</th>
                      <th className="px-5 py-3 font-medium">Price</th>
                      <th className="px-5 py-3 font-medium">Quantity</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-800/60">
                    {accountOrders.map((record, index) => (
                      <tr key={getRecordValue(record, ["order_id", "id"]) + index}>
                        <td className="px-5 py-3 font-mono text-zinc-400">
                          {getRecordValue(record, ["order_id", "id"])}
                        </td>
                        <td className="px-5 py-3 text-zinc-300">
                          {getRecordValue(record, ["side", "is_buy"])}
                        </td>
                        <td className="px-5 py-3 font-mono text-zinc-300">
                          {getRecordValue(record, ["price", "limit_price"])}
                        </td>
                        <td className="px-5 py-3 font-mono text-zinc-300">
                          {getRecordValue(record, ["quantity", "qty", "size"])}
                        </td>
                        <td className="px-5 py-3 text-zinc-400">
                          {getRecordValue(record, ["state", "status"])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-zinc-600">
                No open orders.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Account
              </p>

              <h2 className="mt-1 text-lg font-semibold">
                Recent Executions
              </h2>
            </div>

            {loadingAccountActivity ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">
                Loading executions...
              </p>
            ) : accountActivityError ? (
              <p className="px-5 py-8 text-center text-sm text-red-400">
                {accountActivityError}
              </p>
            ) : accountExecutions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-800 text-zinc-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Execution</th>
                      <th className="px-5 py-3 font-medium">Side</th>
                      <th className="px-5 py-3 font-medium">Price</th>
                      <th className="px-5 py-3 font-medium">Quantity</th>
                      <th className="px-5 py-3 font-medium">Time</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-800/60">
                    {accountExecutions.map((record, index) => (
                      <tr key={getRecordValue(record, ["trade_id", "execution_id", "id"]) + index}>
                        <td className="px-5 py-3 font-mono text-zinc-400">
                          {getRecordValue(record, ["trade_id", "execution_id", "id"])}
                        </td>
                        <td className="px-5 py-3 text-zinc-300">
                          {formatExecutionSide(record.is_buy ?? record.side)}
                        </td>
                        <td className="px-5 py-3 font-mono text-zinc-300">
                          {getRecordValue(record, ["price", "fill_price"])}
                        </td>
                        <td className="px-5 py-3 font-mono text-zinc-300">
                          {getRecordValue(record, ["quantity", "qty", "size"])}
                        </td>
                        <td className="px-5 py-3 text-zinc-400">
                          {formatExecutionTime(record.time ?? record.created_at ?? record.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-zinc-600">
                No recent executions.
              </p>
            )}
          </div>
        </section>

        <footer className="pb-8 text-center text-xs text-zinc-600">
          FranTicko · Ticko Testnet · Agent Pioneer Dashboard
        </footer>
      </div>
    </main>
  );
}