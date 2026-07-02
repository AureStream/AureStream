import type { SingBoxTrafficTick } from "@/types/singbox"
import { getControllerAuth } from "./client"

/**
 * Stream GET /traffic (newline-delimited JSON) from sing-box clash_api.
 * @see https://sing-box.sagernet.org/configuration/experimental/clash-api/
 */
export async function subscribeTraffic(
  onTick: (tick: SingBoxTrafficTick) => void,
  signal?: AbortSignal
): Promise<void> {
  const { baseUrl, secret } = await getControllerAuth()
  const wsUrl = baseUrl.replace(/^http/, 'ws') + `/traffic?token=${encodeURIComponent(secret)}`;
  
  let ws: WebSocket | null = null;
  let retryTimer: any = null;
  let isClosed = false;

  const connect = () => {
    if (isClosed || (signal && signal.aborted)) return;

    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { up?: number; down?: number };
        onTick({
          up: data.up ?? 0,
          down: data.down ?? 0,
        });
      } catch (e) {
        // skip
      }
    };

    ws.onclose = () => {
      ws = null;
      if (!isClosed && !(signal && signal.aborted)) {
        retryTimer = setTimeout(connect, 1000);
      }
    };

    ws.onerror = () => {
      // Suppress noisy error logs when the core exits and the connection is reset
      ws?.close();
    };
  };

  if (signal) {
    if (signal.aborted) {
      isClosed = true;
      return;
    }
    signal.addEventListener("abort", () => {
      isClosed = true;
      if (ws) ws.close();
      if (retryTimer) clearTimeout(retryTimer);
    });
  }

  connect();
}
