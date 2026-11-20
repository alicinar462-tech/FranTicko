"use client";

import { useWallet } from "@/components/wallet-provider";

export default function WalletButton() {
  const {
    address,
    connected,
    isCorrectNetwork,
    connecting,
    error,
    connect,
    disconnect,
  } = useWallet();

  if (connected) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={disconnect}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
        >
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </button>

        <span
          className={`text-xs ${
            isCorrectNetwork ? "text-green-400" : "text-amber-400"
          }`}
        >
          {isCorrectNetwork
            ? "Ticko Testnet bağlı"
            : "Yanlış ağ — Ticko Testnet gerekli"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => void connect()}
        disabled={connecting}
        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-gray-200 disabled:opacity-50"
      >
        {connecting ? "Bağlanıyor..." : "Cüzdanı Bağla"}
      </button>

      {error && (
        <span className="max-w-xs text-right text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}