import type { C2S, S2C } from "@werk/shared";

type Handler<T extends S2C["t"]> = (msg: Extract<S2C, { t: T }>) => void;

/** WebSocket to the werk server with auto-reconnect and typed events. */
export class Connection {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<(m: S2C) => void>>();
  private queue: string[] = [];
  private closed = false;
  private retry = 0;
  private pingTimer: number | undefined;

  constructor(private token: string) {}

  connect(): void {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      for (const m of this.queue.splice(0)) ws.send(m);
      this.pingTimer = window.setInterval(() => this.send({ t: "ping" }), 25_000);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as S2C;
      this.handlers.get(msg.t)?.forEach((h) => h(msg));
      this.handlers.get("*")?.forEach((h) => h(msg));
    };
    ws.onclose = (e) => {
      clearInterval(this.pingTimer);
      this.emitLocal({ t: "error", msg: "disconnected" });
      if (this.closed) return;
      if (e.code === 4001) {
        this.emitLocal({ t: "error", msg: "unauthorized" });
        return;
      }
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
      this.reconnecting = true;
    };
  }

  /** set when the socket dropped; the game re-joins its map on the next welcome */
  reconnecting = false;

  send(msg: C2S): void {
    const data = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    else if (msg.t !== "move" && msg.t !== "ping") this.queue.push(data);
  }

  on<T extends S2C["t"]>(t: T | "*", h: Handler<T>): () => void {
    let set = this.handlers.get(t);
    if (!set) this.handlers.set(t, (set = new Set()));
    set.add(h as (m: S2C) => void);
    return () => set!.delete(h as (m: S2C) => void);
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  private emitLocal(msg: S2C): void {
    this.handlers.get(msg.t)?.forEach((h) => h(msg));
  }
}
