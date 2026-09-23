"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  type Address,
  type EIP1193Provider,
} from "viem";

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

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const BTC_USDT_SYMBOL_ID = 20001;
const USDT_COIN_ID = 1001;

const tickoTestnet = defineChain({
  id: 84257,
  name: "Ticko Testnet",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.ticko.xyz"],
    },
  },
});

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

export default function Home() {
  const [symbol, setSymbol] = useState<TickoSymbol | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);

  const [walletAddress, setWalletAddress] =
    useState<Address | null>(null);

  const [walletChainId, setWalletChainId] =
    useState<number | null>(null);

  const [walletError, setWalletError] = useState("");
  const [connectingWallet, setConnectingWallet] =
    useState(false);
  const [switchingNetwork, setSwitchingNetwork] =
    useState(false);

  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const [marketError, setMarketError] = useState("");
  const [balanceError, setBalanceError] = useState("");

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

      const btcUsdt = result.data.list.find(
        (item) => item.symbol_id === BTC_USDT_SYMBOL_ID,
      );

      if (!btcUsdt) {
        throw new Error(
          "BTC-USDT symbol (20001) was not found.",
        );
      }

      setSymbol(btcUsdt);
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

  const refreshAll = useCallback(() => {
    void loadMarket();
    void loadBalance();
  }, [loadBalance, loadMarket]);

  const connectWallet = useCallback(async () => {
    setWalletError("");

    if (!window.ethereum) {
      setWalletError(
        "No EVM wallet detected. Install MetaMask or another compatible wallet.",
      );
      return;
    }

    setConnectingWallet(true);

    try {
      const walletClient = createWalletClient({
        chain: tickoTestnet,
        transport: custom(window.ethereum),
      });

      const [address] = await walletClient.requestAddresses();

      if (!address) {
        throw new Error("No wallet address was returned.");
      }

      setWalletAddress(address);

      const publicClient = createPublicClient({
        chain: tickoTestnet,
        transport: custom(window.ethereum),
      });

      const chainId = await publicClient.getChainId();
      setWalletChainId(chainId);
    } catch (error) {
      setWalletError(
        error instanceof Error
          ? error.message
          : "Wallet connection failed.",
      );
    } finally {
      setConnectingWallet(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    setWalletChainId(null);
    setWalletError("");
  }, []);

  const switchToTickoTestnet = useCallback(async () => {
    setWalletError("");

    if (!window.ethereum) {
      setWalletError(
        "No EVM wallet detected. Install MetaMask or another compatible wallet.",
      );
      return;
    }

    setSwitchingNetwork(true);

    try {
      const walletClient = createWalletClient({
        chain: tickoTestnet,
        transport: custom(window.ethereum),
      });

      await walletClient.switchChain({
        id: tickoTestnet.id,
      });

      const publicClient = createPublicClient({
        chain: tickoTestnet,
        transport: custom(window.ethereum),
      });

      const chainId = await publicClient.getChainId();
      setWalletChainId(chainId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to switch wallet network.";

      setWalletError(
        message.toLowerCase().includes("4902") ||
          message.toLowerCase().includes("chain not found") ||
          message.toLowerCase().includes("unrecognized chain")
          ? "Ticko Testnet is not configured in your wallet. Please add the network manually."
          : message,
      );
    } finally {
      setSwitchingNetwork(false);
    }
  }, []);

  const refreshWalletState = useCallback(async () => {
    if (!window.ethereum) {
      setWalletAddress(null);
      setWalletChainId(null);
      return;
    }

    try {
      const walletClient = createWalletClient({
        chain: tickoTestnet,
        transport: custom(window.ethereum),
      });

      const accounts = await walletClient.getAddresses();

      setWalletAddress(accounts[0] ?? null);

      const publicClient = createPublicClient({
        chain: tickoTestnet,
        transport: custom(window.ethereum),
      });

      const chainId = await publicClient.getChainId();
      setWalletChainId(chainId);
    } catch {
      setWalletAddress(null);
      setWalletChainId(null);
    }
  }, []);

  useEffect(() => {
    refreshAll();
    void refreshWalletState();
  }, [refreshAll, refreshWalletState]);

  useEffect(() => {
    if (!window.ethereum) {
      return;
    }

    const handleAccountsChanged = (
      accounts: readonly Address[],
    ) => {
      setWalletAddress(accounts[0] ?? null);
    };

    const handleChainChanged = (chainId: string) => {
      setWalletChainId(Number.parseInt(chainId, 16));
    };

    window.ethereum.on(
      "accountsChanged",
      handleAccountsChanged,
    );

    window.ethereum.on(
      "chainChanged",
      handleChainChanged,
    );

    return () => {
      window.ethereum?.removeListener?.(
        "accountsChanged",
        handleAccountsChanged,
      );

      window.ethereum?.removeListener?.(
        "chainChanged",
        handleChainChanged,
      );
    };
  }, []);

  const usdtBalance = useMemo(() => {
    return (
      balance?.coins.find(
        (coin) => coin.coin_id === USDT_COIN_ID,
      )?.balance ?? null
    );
  }, [balance]);

  const connectionReady =
    !loadingMarket &&
    !loadingBalance &&
    !marketError &&
    !balanceError &&
    Boolean(symbol) &&
    Boolean(balance);

  const walletOnTickoTestnet =
    walletChainId === tickoTestnet.id;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
        <header className="mb-8 flex flex-col gap-5 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-zinc-950">
              FT
            </div>

            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                FranTicko
              </h1>

              <p className="text-xs text-zinc-500">
                Ticko API Integration Demo
              </p>
            </div>
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

            {walletAddress ? (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    walletOnTickoTestnet
                      ? "bg-emerald-400"
                      : "bg-amber-400"
                  }`}
                />

                <span className="font-mono text-sm text-zinc-200">
                  {shortenAddress(walletAddress)}
                </span>

                <button
                  type="button"
                  onClick={disconnectWallet}
                  className="ml-1 rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={connectWallet}
                disabled={connectingWallet}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connectingWallet
                  ? "Connecting..."
                  : "Connect Wallet"}
              </button>
            )}

            <button
              type="button"
              onClick={refreshAll}
              disabled={loadingMarket || loadingBalance}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMarket || loadingBalance
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>
        </header>

        {walletError && (
          <div className="mb-6 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {walletError}
          </div>
        )}

        {walletAddress && !walletOnTickoTestnet && (
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-amber-300">
                Wallet connected, but it is not currently on
                Ticko Testnet.
              </p>

              {walletChainId !== null && (
                <p className="mt-1 text-xs text-amber-400/70">
                  Current chain ID: {walletChainId} · Ticko
                  Testnet: {tickoTestnet.id}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={switchToTickoTestnet}
              disabled={switchingNetwork}
              className="shrink-0 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {switchingNetwork
                ? "Switching..."
                : "Switch to Ticko Testnet"}
            </button>
          </div>
        )}

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <p className="text-sm text-zinc-500">
              Connected Wallet
            </p>

            <div className="mt-3">
              {walletAddress ? (
                <p className="font-mono text-sm text-zinc-200">
                  {shortenAddress(walletAddress)}
                </p>
              ) : (
                <p className="text-sm text-zinc-600">
                  No wallet connected
                </p>
              )}
            </div>

            <p className="mt-2 text-xs text-zinc-600">
              Browser wallet
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <p className="text-sm text-zinc-500">
              Ticko Account
            </p>

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

        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Market
                </p>

                <h2 className="mt-1 text-lg font-semibold">
                  BTC-USDT
                </h2>
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
              <div className="bg-zinc-900/90 p-6">
                <p className="text-sm text-zinc-500">
                  Best Bid
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  —
                </p>

                <p className="mt-1 text-xs text-zinc-600">
                  Order book data not yet connected
                </p>
              </div>

              <div className="bg-zinc-900/90 p-6">
                <p className="text-sm text-zinc-500">
                  Best Ask
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  —
                </p>

                <p className="mt-1 text-xs text-zinc-600">
                  Order book data not yet connected
                </p>
              </div>
            </div>

            {marketError && (
              <div className="border-t border-zinc-800 px-5 py-4">
                <p className="text-sm text-red-400">
                  {marketError}
                </p>
              </div>
            )}
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
            </div>

            <div className="divide-y divide-zinc-800">
              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-sm text-zinc-500">
                  Trading mode
                </span>

                <span className="text-sm font-medium">
                  {symbol?.trading_mode ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-sm text-zinc-500">
                  Price step
                </span>

                <span className="font-mono text-sm">
                  {symbol?.price_step ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-sm text-zinc-500">
                  Quantity step
                </span>

                <span className="font-mono text-sm">
                  {symbol?.qty_step ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-sm text-zinc-500">
                  Minimum size
                </span>

                <span className="font-mono text-sm">
                  {symbol?.min_size ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-sm text-zinc-500">
                  Max leverage
                </span>

                <span className="font-mono text-sm">
                  {symbol?.max_leverage
                    ? `${symbol.max_leverage}x`
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-sm text-zinc-500">
                  Default leverage
                </span>

                <span className="font-mono text-sm">
                  {symbol?.default_leverage
                    ? `${symbol.default_leverage}x`
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-sm text-zinc-500">
                  Price limit
                </span>

                <span className="font-mono text-sm">
                  {symbol?.price_limit_pct ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-8 border-t border-zinc-800 pt-5 text-xs text-zinc-600">
          FranTicko · Ticko Testnet · Server-side API integration
        </footer>
      </div>
    </main>
  );
}