
import type { TickoStreamStatus } from "./orderbook-stream";

const TICKO_WS_URL =
  "wss://ws.testnet.ticko.xyz/v1/public/market";

const MAX_TRADES = 50;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 15000;

export interface TickoPublicTrade {
  amount: string;
  tradeId: string;
  maker: boolean;
  price: string;
  quantity: string;
  time: number;
  txHash: string;
}

interface TickoWsTradeItem {
  a?: string;
  i?: string;
  m?: boolean;
  p?: string;
  q?: string;
  t?: number;
  x?: string;
}

interface TickoWsMessage {
  id?: string;
  op?: string;
  success?: boolean;
  arg?: {
    channel?: string;
    symbol_id?: number;
  };
  finality?: string;
  data?: TickoWsTradeItem[];
}

interface TickoTradesStreamOptions {
  onTrades: (trades: TickoPublicTrade[]) => void;
  onStatus?: (status: TickoStreamStatus) => void;
  onError?: (error: string) => void;
}

export class TickoTradesStream {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private symbolId: number;
  private options: TickoTradesStreamOptions;

  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private trades: TickoPublicTrade[] = [];

  private browserEventsAttached = false;

  private handleBrowserOffline = (): void => {
    if (!this.shouldReconnect) return;

    this.options.onStatus?.("reconnecting");

    if (this.socket) {
      const socket = this.socket;

      if (socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    } else {
      this.scheduleReconnect();
    }
  };

  private handleBrowserOnline = (): void => {
    if (!this.shouldReconnect) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (
      this.socket &&
      this.socket.readyState === WebSocket.CLOSING
    ) {
      this.socket = null;
    }

    this.connect();
  };

  constructor(
    symbolId: number,
    options: TickoTradesStreamOptions,
  ) {
    this.symbolId = symbolId;
    this.options = options;
  }

  start(): void {
    if (this.shouldReconnect) return;

    this.shouldReconnect = true;
    this.attachBrowserEvents();
    this.connect();
  }

  stop(): void {
    this.shouldReconnect = false;

    this.detachBrowserEvents();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.close();
    }

    this.trades = [];
    this.reconnectAttempts = 0;

    this.options.onStatus?.("disconnected");
  }

  private attachBrowserEvents(): void {
    if (
      typeof window === "undefined" ||
      this.browserEventsAttached
    ) {
      return;
    }

    window.addEventListener("offline", this.handleBrowserOffline);
    window.addEventListener("online", this.handleBrowserOnline);

    this.browserEventsAttached = true;
  }

  private detachBrowserEvents(): void {
    if (
      typeof window === "undefined" ||
      !this.browserEventsAttached
    ) {
      return;
    }

    window.removeEventListener("offline", this.handleBrowserOffline);
    window.removeEventListener("online", this.handleBrowserOnline);

    this.browserEventsAttached = false;
  }

  private connect(): void {
    if (!this.shouldReconnect) return;

    if (
      typeof navigator !== "undefined" &&
      !navigator.onLine
    ) {
      this.options.onStatus?.("reconnecting");
      this.scheduleReconnect();
      return;
    }

    if (
      this.socket &&
      (
        this.socket.readyState === WebSocket.CONNECTING ||
        this.socket.readyState === WebSocket.OPEN
      )
    ) {
      return;
    }

    this.options.onStatus?.(
      this.reconnectAttempts === 0
        ? "connecting"
        : "reconnecting",
    );

    try {
      const socket = new WebSocket(TICKO_WS_URL);
      this.socket = socket;

      socket.onopen = () => {
        if (this.socket !== socket || !this.shouldReconnect) {
          return;
        }

        socket.send(
          JSON.stringify({
            id: "subTrade",
            op: "subscribe",
            args: [
              {
                channel: "trade",
                symbol_id: this.symbolId,
              },
            ],
          }),
        );
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        if (this.socket !== socket) return;

        this.handleMessage(event.data);
      };

      socket.onerror = () => {
        if (this.socket !== socket) return;

        this.options.onError?.(
          "Ticko Live Trades WebSocket bağlantı hatası.",
        );

        this.options.onStatus?.("error");
        socket.close();
      };

      socket.onclose = () => {
        if (this.socket !== socket) return;

        this.socket = null;

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        } else {
          this.options.onStatus?.("disconnected");
        }
      };
    } catch (error) {
      this.options.onError?.(
        error instanceof Error
          ? error.message
          : "Live Trades bağlantısı kurulamadı.",
      );

      this.scheduleReconnect();
    }
  }

  private handleMessage(rawMessage: string): void {
    let message: TickoWsMessage;

    try {
      message = JSON.parse(rawMessage) as TickoWsMessage;
    } catch {
      this.options.onError?.(
        "Live Trades WebSocket mesajı çözümlenemedi.",
      );
      return;
    }

    if (message.op === "subscribe") {
      if (message.success === false) {
        this.options.onError?.(
          "Live Trades aboneliği başarısız oldu.",
        );

        this.socket?.close();
        return;
      }

      if (message.success === true) {
        this.reconnectAttempts = 0;
        this.options.onStatus?.("connected");
      }

      return;
    }

    if (
      message.arg?.channel !== "trade" ||
      message.arg.symbol_id !== this.symbolId ||
      !Array.isArray(message.data)
    ) {
      return;
    }

    if (
      message.finality &&
      message.finality !== "final"
    ) {
      return;
    }

    const newTrades = message.data
      .map((item) => this.parseTrade(item))
      .filter(
        (trade): trade is TickoPublicTrade =>
          trade !== null,
      );

    if (newTrades.length === 0) return;

    this.reconnectAttempts = 0;

    for (const trade of newTrades) {
      const alreadyExists = this.trades.some(
        (existing) => existing.tradeId === trade.tradeId,
      );

      if (!alreadyExists) {
        this.trades.unshift(trade);
      }
    }

    this.trades = this.trades.slice(0, MAX_TRADES);

    this.options.onTrades([...this.trades]);
    this.options.onStatus?.("connected");
  }

  private parseTrade(
    item: TickoWsTradeItem,
  ): TickoPublicTrade | null {
    if (
      typeof item.a !== "string" ||
      typeof item.i !== "string" ||
      typeof item.m !== "boolean" ||
      typeof item.p !== "string" ||
      typeof item.q !== "string" ||
      typeof item.t !== "number" ||
      typeof item.x !== "string"
    ) {
      this.options.onError?.(
        "Geçersiz Live Trades verisi alındı.",
      );

      return null;
    }

    if (
      !Number.isFinite(Number(item.a)) ||
      !Number.isFinite(Number(item.p)) ||
      !Number.isFinite(Number(item.q)) ||
      !Number.isFinite(item.t)
    ) {
      return null;
    }

    return {
      amount: item.a,
      tradeId: item.i,
      maker: item.m,
      price: item.p,
      quantity: item.q,
      time: item.t,
      txHash: item.x,
    };
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY *
        2 ** Math.min(this.reconnectAttempts - 1, 4),
      MAX_RECONNECT_DELAY,
    );

    this.options.onStatus?.("reconnecting");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
