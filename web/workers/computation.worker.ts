import {
  generateBoardLayouts,
  type ConfigInput,
  type PartToCut,
  type StockMatrix,
} from '../lib';

// ─── Message types ───────────────────────────────────────────────────────────

interface LayoutRequest {
  type: 'layout';
  id: number;
  parts: PartToCut[];
  stocks: StockMatrix[];
  config: ConfigInput;
}

interface LayoutResponse {
  type: 'layout';
  id: number;
  result?: ReturnType<typeof generateBoardLayouts>;
  error?: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const msg = e.data;

  if (msg.type === 'layout') {
    try {
      const result = generateBoardLayouts(msg.parts, msg.stocks, msg.config);
      post({ type: 'layout', id: msg.id, result });
    } catch (err) {
      post({ type: 'layout', id: msg.id, error: String(err) });
    }
    return;
  }
};

function post(msg: LayoutResponse) {
  (self as unknown as Worker).postMessage(msg);
}
