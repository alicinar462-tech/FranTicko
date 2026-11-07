
import type {
  TickoOrderBookData,
  TickoOrderBookLevel,
} from "./types";

const TICKO_WS_URL = "wss://ws.testnet.ticko.xyz/v1/public/market";
const BOOK_DEPTH = 20;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 15000;

export type TickoStreamStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

interface TickoWsBookData {
  a?: TickoOrderBookLevel[];
  b?: TickoOrderBookLevel[];
  p?: number;
  q?: number;
  s?: number;
  t?: number;
}

interface TickoWsMessage {
  id?: string;
  op?: string;
  success?: boolean;
  arg?: {
    channel?: string;
    symbol_id?: number;
  };
  type?: "snapshot" | "delta";
  finality?: string;
  data?: TickoWsBookData;
}

interface TickoOrderBookStreamOptions {
  onBook: (book: TickoOrderBookData) => void;
  onStatus?: (status: TickoStreamStatus) => void;
  onError?: (error: string) => void;
}

export class TickoOrderBookStream {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private symbolId: number;
  private options: TickoOrderBookStreamOptions;

  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private lastSequence: number | null = null;
  private currentBook: TickoOrderBookData | null = null;

  private browserEventsAttached = false;

  private handleBrowserOffline = (): void => {
    if (!this.shouldReconnect) return;

    this.currentBook = null;
    this.lastSequence = null;

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

    // Eski bağlantı kapanma aşamasındaysa yeni bağlantı kur.
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
    options: TickoOrderBookStreamOptions,
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

    this.currentBook = null;
    this.lastSequence = null;
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
      (this.socket.readyState === WebSocket.CONNECTING ||
        this.socket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    this.options.onStatus?.(
      this.reconnectAttempts === 0 ? "connecting" : "reconnecting",
    );

    try {
      const socket = new WebSocket(TICKO_WS_URL);
      this.socket = socket;

      socket.onopen = () => {
        if (this.socket !== socket || !this.shouldReconnect) return;

        this.options.onStatus?.("connecting");

        socket.send(
          JSON.stringify({
            id: "subL2",
            op: "subscribe",
            args: [
              {
                channel: "l2_book",
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

        this.options.onError?.("Ticko WebSocket bağlantı hatası.");
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
          : "WebSocket bağlantısı kurulamadı.",
      );

      this.scheduleReconnect();
    }
  }

  private handleMessage(rawMessage: string): void {
    let message: TickoWsMessage;

    try {
      message = JSON.parse(rawMessage) as TickoWsMessage;
    } catch {
      this.options.onError?.("WebSocket mesajı çözümlenemedi.");
      return;
    }

    // Subscription yanıtı.
    if (message.op === "subscribe") {
      if (message.success === false) {
        this.options.onError?.(
          "Order Book aboneliği başarısız oldu.",
        );

        this.socket?.close();
      }

      return;
    }

    if (
      message.arg?.channel !== "l2_book" ||
      message.arg.symbol_id !== this.symbolId ||
      !message.type ||
      !message.data
    ) {
      return;
    }

    if (message.finality && message.finality !== "final") {
      return;
    }

    if (message.type === "snapshot") {
      this.applySnapshot(message.data);
      return;
    }

    if (message.type === "delta") {
      this.applyDelta(message.data);
    }
  }

  private applySnapshot(data: TickoWsBookData): void {
    if (
      !Array.isArray(data.a) ||
      !Array.isArray(data.b) ||
      typeof data.q !== "number" ||
      typeof data.t !== "number"
    ) {
      this.options.onError?.(
        "Geçersiz Order Book snapshot verisi.",
      );
      return;
    }

    this.currentBook = {
      asks: this.sortAsks(data.a),
      bids: this.sortBids(data.b),
      seq: data.q,
      time: data.t,
    };

    this.lastSequence = data.q;

    this.reconnectAttempts = 0;

    this.options.onBook(this.getDisplayBook());
    this.options.onStatus?.("connected");
  }

  private applyDelta(data: TickoWsBookData): void {
    if (
      !this.currentBook ||
      this.lastSequence === null ||
      typeof data.p !== "number" ||
      typeof data.q !== "number" ||
      typeof data.t !== "number"
    ) {
      this.requestFreshSnapshot();
      return;
    }

    if (data.p !== this.lastSequence) {
      this.options.onError?.(
        "Order Book veri zincirinde kopukluk tespit edildi. Yeni snapshot bekleniyor.",
      );

      this.requestFreshSnapshot();
      return;
    }

    if (
      (data.a !== undefined && !Array.isArray(data.a)) ||
      (data.b !== undefined && !Array.isArray(data.b))
    ) {
      this.options.onError?.(
        "Geçersiz Order Book delta verisi.",
      );

      this.requestFreshSnapshot();
      return;
    }

    this.currentBook = {
      asks: this.applyLevels(
        this.currentBook.asks,
        data.a ?? [],
        "asks",
      ),
      bids: this.applyLevels(
        this.currentBook.bids,
        data.b ?? [],
        "bids",
      ),
      seq: data.q,
      time: data.t,
    };

    this.lastSequence = data.q;

    this.options.onBook(this.getDisplayBook());
  }

  private getDisplayBook(): TickoOrderBookData {
    if (!this.currentBook) {
      throw new Error("Order Book henüz hazır değil.");
    }

    return {
      asks: this.currentBook.asks.slice(0, BOOK_DEPTH),
      bids: this.currentBook.bids.slice(0, BOOK_DEPTH),
      seq: this.currentBook.seq,
      time: this.currentBook.time,
    };
  }

  private applyLevels(
    currentLevels: TickoOrderBookLevel[],
    updates: TickoOrderBookLevel[],
    side: "asks" | "bids",
  ): TickoOrderBookLevel[] {
    const levels = new Map<string, string>();

    for (const [price, quantity] of currentLevels) {
      levels.set(price, quantity);
    }

    for (const level of updates) {
      if (
        !Array.isArray(level) ||
        level.length !== 2 ||
        !Number.isFinite(Number(level[0])) ||
        !Number.isFinite(Number(level[1]))
      ) {
        continue;
      }

      const [price, quantity] = level;

      if (Number(quantity) === 0) {
        levels.delete(price);
      } else {
        levels.set(price, quantity);
      }
    }

    const result: TickoOrderBookLevel[] = Array.from(
      levels.entries(),
      ([price, quantity]) => [price, quantity],
    );

    return side === "asks"
      ? this.sortAsks(result)
      : this.sortBids(result);
  }

  private sortAsks(
    levels: TickoOrderBookLevel[],
  ): TickoOrderBookLevel[] {
    return [...levels].sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    );
  }

  private sortBids(
    levels: TickoOrderBookLevel[],
  ): TickoOrderBookLevel[] {
    return [...levels].sort(
      (a, b) => Number(b[0]) - Number(a[0]),
    );
  }

  private requestFreshSnapshot(): void {
    this.currentBook = null;
    this.lastSequence = null;

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) return;

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
