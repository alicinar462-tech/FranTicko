
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const TICKO_TESTNET_CHAIN_ID = 84257;

interface EthereumProvider {
  request(args: {
    method: string;
    params?: unknown[];
  }): Promise<unknown>;

  on(
    event: string,
    listener: (...args: unknown[]) => void,
  ): void;

  removeListener(
    event: string,
    listener: (...args: unknown[]) => void,
  ): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider & {
      isMetaMask?: boolean;
      isRabby?: boolean;
      providers?: EthereumProvider[];
    };
  }
}

interface WalletContextValue {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  isCorrectNetwork: boolean;
  connecting: boolean;
  error: string;
  provider: EthereumProvider | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [provider, setProvider] = useState<EthereumProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const updateChain = useCallback(async (wallet: EthereumProvider) => {
    const result = await wallet.request({
      method: "eth_chainId",
    });

    const parsed = Number.parseInt(String(result), 16);

    setChainId(Number.isFinite(parsed) ? parsed : null);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    const wallet = window.ethereum;
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (!cancelled) {
        setProvider(wallet);
      }
    });

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0];

      if (Array.isArray(accounts) && typeof accounts[0] === "string") {
        setAddress(accounts[0]);
      } else {
        setAddress(null);
      }
    };

    const handleChainChanged = (...args: unknown[]) => {
      const value = args[0];
      const parsed = Number.parseInt(String(value), 16);

      setChainId(Number.isFinite(parsed) ? parsed : null);
    };

    wallet.on("accountsChanged", handleAccountsChanged);
    wallet.on("chainChanged", handleChainChanged);

    void wallet
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (Array.isArray(accounts) && typeof accounts[0] === "string") {
          setAddress(accounts[0]);
        }
      })
      .catch(() => {});

    void Promise.resolve()
  .then(() => updateChain(wallet))
  .catch(() => {});

    return () => {
      cancelled = true;
      wallet.removeListener("accountsChanged", handleAccountsChanged);
      wallet.removeListener("chainChanged", handleChainChanged);
    };
  }, [updateChain]);

  const connect = useCallback(async () => {
    if (!provider) {
      setError("MetaMask or Rabby wallet was not detected.");
      return;
    }

    setConnecting(true);
    setError("");

    try {
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });

      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
        throw new Error("No wallet account was returned.");
      }

      setAddress(accounts[0]);
      await updateChain(provider);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Wallet connection failed.",
      );
    } finally {
      setConnecting(false);
    }
  }, [provider, updateChain]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError("");
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      chainId,
      connected: Boolean(address),
      isCorrectNetwork: chainId === TICKO_TESTNET_CHAIN_ID,
      connecting,
      error,
      provider,
      connect,
      disconnect,
    }),
    [
      address,
      chainId,
      connecting,
      error,
      provider,
      connect,
      disconnect,
    ],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet must be used inside WalletProvider.");
  }

  return context;
}
