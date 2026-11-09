"use client";

import Image from "next/image";
import {
  TickoOrderBookStream,
  type TickoStreamStatus,
} from "../lib/ticko/orderbook-stream";
import {
  TickoTradesStream,
  type TickoPublicTrade,
} from "../lib/ticko/trades-stream";
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

type TickoOrderBookLevel = [price: string, quantity: string];

interface OrderBookData {
  asks: TickoOrderBookLevel[];
  bids: TickoOrderBookLevel[];
  seq: number;
  symbol_id: number;
  time: number;
}

interface OrderBookResponse {
  ok: boolean;
  data?: OrderBookData;
  error?: string;
}

interface SymbolsResponse {
  ok: boolean;
  data?: {
    list: TickoSymbol[];
  };
  error?: string;
}

interface BalanceResponse {
  ok: boolean;
  data?: BalanceData;
  error?: string;
}

interface DisplayOrderBookLevel {
  price: string;
  quantity: string;
  cumulative: number;
  depthPercent: number;
}

const DEFAULT_SYMBOL_ID = 20001;
const USDT_COIN_ID = 1001;

const PRICE_MATCH_OPTIONS = [
  "queue_1",
  "queue_5",
  "counter_party_1",
  "counter_party_5",
] as const;

type OrderSide = "buy" | "sell";
type OrderMode = "maker" | "taker";
type PriceMatch = (typeof PRICE_MATCH_OPTIONS)[number] | "";

function shortenAddress(address: string) {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatNumber(
  value: string | number | undefined,
  decimals = 4,
) {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(number);
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
    };
  });

  const maxCumulative = Math.max(
    ...parsed.map((level) => level.cumulative),
    0,
  );

  return parsed.map((level) => ({
    ...level,
    depthPercent:
      maxCumulative > 0
        ? (level.cumulative / maxCumulative) * 100
        : 0,
  }));
}

export default function Home() {
  const [symbols, setSymbols] = useState<TickoSymbol[]>([]);
  const [symbol, setSymbol] = useState<TickoSymbol | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);

  const [streamStatus, setStreamStatus] =
    useState<TickoStreamStatus>("disconnected");

  const [trades, setTrades] = useState<TickoPublicTrade[]>([]);
  const [tradesStreamStatus, setTradesStreamStatus] =
    useState<TickoStreamStatus>("disconnected");
  const [tradesError, setTradesError] = useState("");

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
  const [orderQuantity, setOrderQuantity] =
    useState("0.001");

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

      const tradingSymbols = result.data.list.filter(
        (item) => item.status === "trading",
      );

      if (tradingSymbols.length === 0) {
        throw new Error("No trading symbols are currently available.");
      }

      setSymbols(tradingSymbols);

      setSymbol((currentSymbol) =>
        tradingSymbols.find(
          (item) => item.symbol_id === currentSymbol?.symbol_id,
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
      const response = await fetch("/api/ticko/balance", {
        cache: "no-store",
      });

      const result = (await response.json()) as BalanceResponse;

      if (!response.ok || !result.ok || !result.data) {
        throw new Error(
          result.error ?? "Unable to load account balance.",
        );
      }

      setBalance(result.data);
    } catch (error) {
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
      setLoadingOrderBook(true);
      setOrderBookError("");

      try {
        const response = await fetch(
          `/api/ticko/orderbook?symbol_id=${symbolId}&level=1`,
          { cache: "no-store", signal },
        );

        const result = (await response.json()) as OrderBookResponse;

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

  const refreshAll = useCallback(() => {
    void loadMarket();
    void loadBalance();
  }, [loadBalance, loadMarket]);

  useEffect(() => {
    void Promise.resolve().then(refreshAll);
  }, [refreshAll]);

  // Load a REST snapshot for the currently selected symbol.
  useEffect(() => {
    if (!symbol) return;

    const controller = new AbortController();

    void loadOrderBook(symbol.symbol_id, controller.signal);

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
          asks: book.asks,
          bids: book.bids,
          seq: book.seq,
          symbol_id: symbol.symbol_id,
          time: book.time,
        });

        setLoadingOrderBook(false);
        setOrderBookError("");
      },
      onStatus: (status) => {
        setStreamStatus(status);

        // Never keep displaying an old order book while the stream is
        // connecting, reconnecting, offline, or in an error state.
        // The stream reports "connected" only after a fresh snapshot arrives.
        if (status !== "connected") {
          setOrderBook(null);
          setLoadingOrderBook(true);
        }
      },
      onError: (error) => {
        setOrderBookError(error);
      },
    });

    stream.start();

    return () => {
      stream.stop();
    };
  }, [symbol]);

  // Start the independent public Ticko trade stream.
  useEffect(() => {
    if (!symbol) return;

    setTrades([]);
    setTradesError("");

    const stream = new TickoTradesStream(symbol.symbol_id, {
      onTrades: (nextTrades) => {
        setTrades(nextTrades);
        setTradesError("");
      },
      onStatus: (status) => {
        setTradesStreamStatus(status);
      },
      onError: (error) => {
        setTradesError(error);
      },
    });

    stream.start();

    return () => {
      stream.stop();
    };
  }, [symbol]);

  const usdtBalance = useMemo(() => {
    return (
      balance?.coins.find(
        (coin) => coin.coin_id === USDT_COIN_ID,
      )?.balance ?? null
    );
  }, [balance]);

  const bestBid = orderBook?.bids[0] ?? null;
  const bestAsk = orderBook?.asks[0] ?? null;

  const spread = useMemo(() => {
    if (!bestBid || !bestAsk) return null;

    const difference = Number(bestAsk[0]) - Number(bestBid[0]);

    return Number.isFinite(difference) ? difference : null;
  }, [bestAsk, bestBid]);

  const askLevels = useMemo(() => {
    if (!orderBook) return [];

    // API asks are best-to-worst. Reverse for the conventional display:
    // highest ask at the top, best ask nearest the spread.
    return buildDepthLevels([...orderBook.asks].reverse());
  }, [orderBook]);

  const bidLevels = useMemo(() => {
    if (!orderBook) return [];

    // API bids are already best-to-worst.
    return buildDepthLevels(orderBook.bids);
  }, [orderBook]);

  const connectionReady =
    !loadingMarket &&
    !loadingBalance &&
    !marketError &&
    !balanceError &&
    Boolean(symbol) &&
    Boolean(balance);

  const priceMatchSelected = priceMatch !== "";

  const selectedSymbolLabel = symbol
    ? `Symbol #${symbol.symbol_id}`
    : "No symbol selected";

  const baseCoinLabel = symbol
    ? `Base Coin #${symbol.base_coin_id}`
    : "Base Coin —";

  const quoteCoinLabel = symbol
    ? `Quote Coin #${symbol.quote_coin_id}`
    : "Quote Coin —";

  const priceUnitLabel = symbol
    ? `Quote #${symbol.quote_coin_id}`
    : "Quote —";

  const quantityUnitLabel = symbol
    ? `Base #${symbol.base_coin_id}`
    : "Base —";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
        <header className="mb-8 flex flex-col gap-5 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center">
            <Image
              src="/franticko-logo.png"
              alt="FranTicko"
              width={120}
              height={75}
              priority
              className="h-[72px] w-[120px] object-contain"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionReady
                    ? "bg-emerald-400"
                    : "bg-amber-400"
                }`}
              />

              <span className="text-zinc-300">
                Ticko Testnet
              </span>
            </div>

            <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 px-3 py-2 text-xs font-medium text-cyan-300">
              Agent Pioneer
            </div>

            <button
              type="button"
              onClick={refreshAll}
              disabled={
                loadingMarket ||
                loadingBalance ||
                loadingOrderBook
              }
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMarket || loadingBalance || loadingOrderBook
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Ticko Trading Account
              </p>

              <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-cyan-400">
                API
              </span>
            </div>

            <div className="mt-3">
              <span className="font-mono text-sm text-zinc-200">
                {balance?.address
                  ? shortenAddress(balance.address)
                  : loadingBalance
                    ? "Loading..."
                    : "Unavailable"}
              </span>
            </div>

            <p className="mt-2 text-xs text-zinc-600">
              Server-side trading account
            </p>

            {balanceError && (
              <p className="mt-3 text-xs text-red-400">
                {balanceError}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Order Integration
              </p>

              <span className="h-2 w-2 rounded-full bg-amber-400" />
            </div>

            <p className="mt-3 text-lg font-semibold">
              Read-only API
            </p>

            <p className="mt-2 text-xs text-zinc-600">
              Account data is available. Order submission is not connected.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <p className="text-sm text-zinc-500">
              USDT Balance
            </p>

            <div className="mt-2">
              {loadingBalance ? (
                <div className="h-9 w-40 animate-pulse rounded bg-zinc-800" />
              ) : (
                <p className="text-3xl font-semibold tracking-tight">
                  {formatNumber(
                    usdtBalance ?? undefined,
                    2,
                  )}

                  <span className="ml-2 text-base font-medium text-zinc-500">
                    USDT
                  </span>
                </p>
              )}
            </div>

            <p className="mt-2 text-xs text-zinc-600">
              Coin ID {USDT_COIN_ID}
            </p>
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Market
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold">
                    {symbol ? `Symbol #${symbol.symbol_id}` : "Loading symbol..."}
                  </h2>

                  <select
                    aria-label="Select trading symbol"
                    value={symbol ? String(symbol.symbol_id) : ""}
                    onChange={(event) => {
                      const selectedSymbol = symbols.find(
                        (item) => item.symbol_id === Number(event.target.value),
                      );

                      if (selectedSymbol) {
                        setSymbol(selectedSymbol);
                      }
                    }}
                    disabled={loadingMarket || symbols.length === 0}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {symbols.map((item) => (
                      <option key={item.symbol_id} value={item.symbol_id}>
                        {`Symbol #${item.symbol_id} · Base ${item.base_coin_id} / Quote ${item.quote_coin_id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-md border border-cyan-900/60 bg-cyan-950/30 px-2 py-1 text-cyan-300">
                    {baseCoinLabel}
                  </span>
                  <span className="rounded-md border border-violet-900/60 bg-violet-950/30 px-2 py-1 text-violet-300">
                    {quoteCoinLabel}
                  </span>
                </div>
              </div>

              {symbol && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    symbol.status === "trading"
                      ? "bg-emerald-400/10 text-emerald-400"
                      : "bg-amber-400/10 text-amber-400"
                  }`}
                >
                  {symbol.status}
                </span>
              )}
            </div>

            <div className="grid gap-px bg-zinc-800 sm:grid-cols-2">
              <div className="bg-zinc-900/90 p-5">
                <p className="text-sm text-zinc-500">
                  Best Bid
                </p>

                <p className="mt-2 text-2xl font-semibold text-emerald-400">
                  {loadingOrderBook
                    ? "Loading..."
                    : bestBid
                      ? formatNumber(bestBid[0], symbol?.price_precision ?? 4)
                      : "—"}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  Price in {priceUnitLabel}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  {bestBid
                    ? `Quantity: ${formatNumber(bestBid[1], symbol?.qty_precision ?? 4)} ${quantityUnitLabel}`
                    : "Best available buy price"}
                </p>
              </div>

              <div className="bg-zinc-900/90 p-5">
                <p className="text-sm text-zinc-500">
                  Best Ask
                </p>

                <p className="mt-2 text-2xl font-semibold text-red-400">
                  {loadingOrderBook
                    ? "Loading..."
                    : bestAsk
                      ? formatNumber(bestAsk[0], symbol?.price_precision ?? 4)
                      : "—"}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  Price in {priceUnitLabel}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  {bestAsk
                    ? `Quantity: ${formatNumber(bestAsk[1], symbol?.qty_precision ?? 4)} ${quantityUnitLabel}`
                    : "Best available sell price"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-5 py-3">
              <span className="text-xs text-zinc-500">
                Spread: {spread === null ? "—" : `${formatNumber(spread, symbol?.price_precision ?? 4)} ${priceUnitLabel}`}
              </span>

              <span className="text-xs text-zinc-600">
                {orderBook
                  ? `Updated ${new Date(orderBook.time).toLocaleTimeString()}`
                  : loadingOrderBook
                    ? "Fetching order book..."
                    : "Order book unavailable"}
              </span>
            </div>

            {orderBookError && (
              <div className="border-t border-zinc-800 px-5 py-3">
                <p className="text-sm text-red-400">
                  {orderBookError}
                </p>
              </div>
            )}

            {marketError && (
              <div className="border-t border-zinc-800 px-5 py-4">
                <p className="text-sm text-red-400">
                  {marketError}
                </p>
              </div>
            )}

            <div className="border-t border-zinc-800 px-5 py-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Market Depth
                  </h3>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {selectedSymbolLabel} · Price: {priceUnitLabel} · Quantity: {quantityUnitLabel}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ${
                    streamStatus === "connected"
                      ? "bg-emerald-400/10 text-emerald-400"
                      : streamStatus === "connecting" ||
                          streamStatus === "reconnecting"
                        ? "bg-amber-400/10 text-amber-400"
                        : streamStatus === "error"
                          ? "bg-red-400/10 text-red-400"
                          : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      streamStatus === "connected"
                        ? "bg-emerald-400"
                        : streamStatus === "connecting" ||
                            streamStatus === "reconnecting"
                          ? "bg-amber-400"
                          : streamStatus === "error"
                            ? "bg-red-400"
                            : "bg-zinc-500"
                    }`}
                  />

                  {streamStatus === "connected"
                    ? "Live"
                    : streamStatus === "connecting"
                      ? "Connecting"
                      : streamStatus === "reconnecting"
                        ? "Reconnecting"
                        : streamStatus === "error"
                          ? "Stream error"
                          : "Offline"}
                </span>
              </div>

              <div className="grid grid-cols-[1fr_1fr] gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
                      Asks
                    </span>

                    <span className="text-[10px] text-zinc-600">
                      Sell
                    </span>
                  </div>

                  <div className="mb-2 grid grid-cols-3 gap-1 text-[10px] text-zinc-600">
                    <span>Price ({priceUnitLabel})</span>
                    <span className="text-right">Amount ({quantityUnitLabel})</span>
                    <span className="text-right">Total ({quantityUnitLabel})</span>
                  </div>

                  <div className="space-y-1">
                    {loadingOrderBook && !orderBook ? (
                      <p className="py-6 text-center text-xs text-zinc-600">
                        Loading asks...
                      </p>
                    ) : askLevels.length > 0 ? (
                      askLevels.map((level, index) => (
                        <div
                          key={`ask-${level.price}-${index}`}
                          className="relative grid grid-cols-3 gap-1 overflow-hidden rounded px-1 py-1.5 font-mono text-[11px] sm:text-xs"
                        >
                          <div
                            className="absolute inset-y-0 right-0 bg-red-500/10"
                            style={{
                              width: `${level.depthPercent}%`,
                            }}
                          />

                          <span className="relative z-10 text-red-400">
                            {formatNumber(level.price, symbol?.price_precision ?? 4)}
                          </span>

                          <span className="relative z-10 text-right text-zinc-300">
                            {formatNumber(level.quantity, symbol?.qty_precision ?? 4)}
                          </span>

                          <span className="relative z-10 text-right text-zinc-500">
                            {formatNumber(level.cumulative, symbol?.qty_precision ?? 4)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="py-6 text-center text-xs text-zinc-600">
                        No ask levels available
                      </p>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      Bids
                    </span>

                    <span className="text-[10px] text-zinc-600">
                      Buy
                    </span>
                  </div>

                  <div className="mb-2 grid grid-cols-3 gap-1 text-[10px] text-zinc-600">
                    <span>Price ({priceUnitLabel})</span>
                    <span className="text-right">Amount ({quantityUnitLabel})</span>
                    <span className="text-right">Total ({quantityUnitLabel})</span>
                  </div>

                  <div className="space-y-1">
                    {loadingOrderBook && !orderBook ? (
                      <p className="py-6 text-center text-xs text-zinc-600">
                        Loading bids...
                      </p>
                    ) : bidLevels.length > 0 ? (
                      bidLevels.map((level, index) => (
                        <div
                          key={`bid-${level.price}-${index}`}
                          className="relative grid grid-cols-3 gap-1 overflow-hidden rounded px-1 py-1.5 font-mono text-[11px] sm:text-xs"
                        >
                          <div
                            className="absolute inset-y-0 right-0 bg-emerald-500/10"
                            style={{
                              width: `${level.depthPercent}%`,
                            }}
                          />

                          <span className="relative z-10 text-emerald-400">
                            {formatNumber(level.price, symbol?.price_precision ?? 4)}
                          </span>

                          <span className="relative z-10 text-right text-zinc-300">
                            {formatNumber(level.quantity, symbol?.qty_precision ?? 4)}
                          </span>

                          <span className="relative z-10 text-right text-zinc-500">
                            {formatNumber(level.cumulative, symbol?.qty_precision ?? 4)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="py-6 text-center text-xs text-zinc-600">
                        No bid levels available
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {orderBook && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3 text-[10px] text-zinc-600">
                  <span>
                    Sequence: {orderBook.seq}
                  </span>

                  <span>
                    Symbol ID: {orderBook.symbol_id}
                  </span>

                  <span>
                    Data time: {new Date(orderBook.time).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Symbol Configuration
              </p>

              <h2 className="mt-1 text-lg font-semibold">
                {symbol
                  ? `Symbol #${symbol.symbol_id}`
                  : "Loading..."}
              </h2>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-md border border-cyan-900/60 bg-cyan-950/30 px-2 py-1 text-cyan-300">
                  {baseCoinLabel}
                </span>
                <span className="rounded-md border border-violet-900/60 bg-violet-950/30 px-2 py-1 text-violet-300">
                  {quoteCoinLabel}
                </span>
              </div>
            </div>

            <div className="divide-y divide-zinc-800">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Symbol ID
                </span>

                <span className="font-mono text-sm">
                  {symbol?.symbol_id ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Base Coin ID
                </span>

                <span className="font-mono text-sm">
                  {symbol?.base_coin_id ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Quote Coin ID
                </span>

                <span className="font-mono text-sm">
                  {symbol?.quote_coin_id ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Trading status
                </span>

                <span className="text-sm font-medium">
                  {symbol?.status ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Trading mode
                </span>

                <span className="text-sm font-medium">
                  {symbol?.trading_mode ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Price precision
                </span>

                <span className="font-mono text-sm">
                  {symbol?.price_precision ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Quantity precision
                </span>

                <span className="font-mono text-sm">
                  {symbol?.qty_precision ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Price step
                </span>

                <span className="font-mono text-sm">
                  {symbol?.price_step ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Quantity step
                </span>

                <span className="font-mono text-sm">
                  {symbol?.qty_step ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Minimum size
                </span>

                <span className="font-mono text-sm">
                  {symbol?.min_size ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Maximum size
                </span>

                <span className="font-mono text-sm">
                  {symbol?.max_size ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Max leverage
                </span>

                <span className="font-mono text-sm">
                  {symbol?.max_leverage
                    ? `${symbol.max_leverage}x`
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Default leverage
                </span>

                <span className="font-mono text-sm">
                  {symbol?.default_leverage
                    ? `${symbol.default_leverage}x`
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-zinc-500">
                  Price limit (%)
                </span>

                <span className="font-mono text-sm">
                  {symbol?.price_limit_pct ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Live Trades */}
        <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Market Activity
              </p>

              <h2 className="mt-1 text-lg font-semibold">
                Live Trades
              </h2>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-300">
                  {selectedSymbolLabel}
                </span>
                <span className="rounded-md border border-cyan-900/60 bg-cyan-950/30 px-2 py-1 text-cyan-300">
                  Price: {priceUnitLabel}
                </span>
                <span className="rounded-md border border-violet-900/60 bg-violet-950/30 px-2 py-1 text-violet-300">
                  Quantity: {quantityUnitLabel}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  tradesStreamStatus === "connected"
                    ? "bg-emerald-400"
                    : tradesStreamStatus === "connecting" ||
                        tradesStreamStatus === "reconnecting"
                      ? "bg-amber-400"
                      : tradesStreamStatus === "error"
                        ? "bg-red-400"
                        : "bg-zinc-500"
                }`}
              />

              <span className="text-zinc-300">
                {tradesStreamStatus === "connected"
                  ? "Live"
                  : tradesStreamStatus === "connecting"
                    ? "Connecting"
                    : tradesStreamStatus === "reconnecting"
                      ? "Reconnecting"
                      : tradesStreamStatus === "error"
                        ? "Stream error"
                        : "Offline"}
              </span>
            </div>
          </div>

          {tradesError && (
            <div className="border-b border-zinc-800 px-5 py-3">
              <p className="text-xs text-red-400">
                {tradesError}
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr] gap-3 border-b border-zinc-800 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <span>Price (Quote #{symbol?.quote_coin_id ?? "—"})</span>
                <span className="text-right">Quantity (Base #{symbol?.base_coin_id ?? "—"})</span>
                <span className="text-right">Amount (Quote #{symbol?.quote_coin_id ?? "—"})</span>
                <span className="text-right">Time</span>
                <span className="text-right">Trade ID</span>
              </div>

              {trades.length > 0 ? (
                <div className="divide-y divide-zinc-800/70">
                  {trades.map((trade, index) => (
                    <div
                      key={`${trade.tradeId}-${index}`}
                      className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr] items-center gap-3 px-5 py-3 font-mono text-xs"
                    >
                      <span className="font-semibold text-zinc-100">
                        {formatNumber(trade.price, symbol?.price_precision ?? 4)}
                      </span>

                      <span className="text-right text-zinc-300">
                        {formatNumber(trade.quantity, symbol?.qty_precision ?? 4)}
                      </span>

                      <span className="text-right text-zinc-300">
                        {formatNumber(trade.amount, 2)}
                      </span>

                      <span className="text-right text-zinc-400">
                        {new Date(trade.time).toLocaleTimeString()}
                      </span>

                      <span
                        className="text-right text-zinc-500"
                        title={trade.tradeId}
                      >
                        {trade.tradeId.length > 12
                          ? `${trade.tradeId.slice(0, 8)}…`
                          : trade.tradeId}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-10 text-center text-sm text-zinc-600">
                  {tradesStreamStatus === "connecting" ||
                  tradesStreamStatus === "reconnecting"
                    ? "Waiting for live trades..."
                    : tradesStreamStatus === "error"
                      ? "Live trades are currently unavailable."
                      : "No trades received yet."}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-5 py-3 text-[10px] text-zinc-600">
            <span>
              {selectedSymbolLabel} · Base #{symbol?.base_coin_id ?? "—"} / Quote #{symbol?.quote_coin_id ?? "—"}
            </span>

            <span>
              {trades.length} / 50 recent trades
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
          <div className="border-b border-zinc-800 px-5 py-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  TESTNET PREVIEW
                </p>

                <h2 className="mt-1 text-xl font-semibold">
                  Order Preview
                </h2>
              </div>

              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                {selectedSymbolLabel} · Base #{symbol?.base_coin_id ?? "—"} / Quote #{symbol?.quote_coin_id ?? "—"}
              </span>
            </div>
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="mb-3 text-sm font-medium text-zinc-300">
                Order side
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderSide("buy")}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    orderSide === "buy"
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
                  }`}
                >
                  Buy
                </button>

                <button
                  type="button"
                  onClick={() => setOrderSide("sell")}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    orderSide === "sell"
                      ? "border-red-500/50 bg-red-500/10 text-red-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
                  }`}
                >
                  Sell
                </button>
              </div>

              <p className="mb-3 mt-6 text-sm font-medium text-zinc-300">
                Execution mode
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOrderMode("maker");
                    setPriceMatch("");
                  }}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    orderMode === "maker"
                      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
                  }`}
                >
                  Maker
                </button>

                <button
                  type="button"
                  onClick={() => setOrderMode("taker")}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    orderMode === "taker"
                      ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
                  }`}
                >
                  Taker
                </button>
              </div>

              <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-600">
                  Integration status
                </p>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  This is a local preview only. No order is sent to
                  Ticko Testnet.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label
                  htmlFor="price-match"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Price Match
                </label>

                <select
                  id="price-match"
                  value={priceMatch}
                  onChange={(event) =>
                    setPriceMatch(
                      event.target.value as PriceMatch,
                    )
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-200 outline-none transition focus:border-cyan-500"
                >
                  <option value="">
                    No Price Match
                  </option>

                  {PRICE_MATCH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-xs text-zinc-600">
                  {priceMatchSelected
                    ? "Preview only. This Price Match rule is not sent to Ticko."
                    : "Preview only. The limit price is not submitted to Ticko."}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="order-price"
                    className="mb-2 block text-sm font-medium text-zinc-300"
                  >
                    Price ({priceUnitLabel})
                  </label>

                  <input
                    id="order-price"
                    type="text"
                    inputMode="decimal"
                    value={orderPrice}
                    onChange={(event) =>
                      setOrderPrice(event.target.value)
                    }
                    disabled={priceMatchSelected}
                    placeholder={
                      priceMatchSelected
                        ? "Price Match preview only"
                        : "Enter price"
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="order-quantity"
                    className="mb-2 block text-sm font-medium text-zinc-300"
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
                    placeholder="0.001"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    Selected market
                  </span>

                  <span className="text-sm font-semibold text-zinc-200">
                    {selectedSymbolLabel}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    Base / Quote
                  </span>

                  <span className="text-sm font-medium text-zinc-300">
                    #{symbol?.base_coin_id ?? "—"} / #{symbol?.quote_coin_id ?? "—"}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    Side
                  </span>

                  <span
                    className={`text-sm font-semibold ${
                      orderSide === "buy"
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {orderSide.toUpperCase()}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    Mode
                  </span>

                  <span className="text-sm font-medium text-zinc-300">
                    {orderMode.toUpperCase()}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    Price Match
                  </span>

                  <span className="font-mono text-sm text-zinc-300">
                    {priceMatch || "—"}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    Price
                  </span>

                  <span className="font-mono text-sm text-zinc-300">
                    {orderPrice || "—"} {priceUnitLabel}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    Quantity
                  </span>

                  <span className="font-mono text-sm text-zinc-300">
                    {orderQuantity || "—"} {quantityUnitLabel}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled
                className="w-full rounded-lg bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 opacity-50"
              >
                Order submission unavailable
              </button>

              <p className="text-center text-xs text-zinc-600">
                Order submission is disabled. No transaction or order
                will be created from this screen.
              </p>
            </div>
          </div>
        </section>

        <footer className="mt-8 border-t border-zinc-800 pt-5 text-xs text-zinc-600">
          FranTicko · Ticko Testnet · Agent Pioneer Dashboard
        </footer>
      </div>
    </main>
  );
}