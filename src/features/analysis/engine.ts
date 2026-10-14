import { parseInfo, toWhite, type Eval } from './analysisLogic';

/**
 * Stockfish 18 (lite, single-threaded WASM, GPLv3) in a web worker. The files are copied to
 * /engine by scripts/copy-engine.mjs; licence and source links are shown in the app (/lizenzen).
 */
export class Engine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void>;

  constructor(url = '/engine/stockfish.js') {
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') for (const l of [...this.listeners]) l(e.data);
    };
    this.ready = this.until('uciok', 'uci').then(() => this.until('readyok', 'isready')).then(() => undefined);
  }

  private until(token: string, command: string): Promise<string[]> {
    return new Promise((resolve) => {
      const lines: string[] = [];
      const on = (line: string) => {
        lines.push(line);
        if (line.startsWith(token)) { this.listeners.delete(on); resolve(lines); }
      };
      this.listeners.add(on);
      this.worker.postMessage(command);
    });
  }

  /** Evaluates one position (FEN). The score comes back from White's point of view. */
  async evaluate(fen: string, depth = 12, maxMs = 1500): Promise<Eval> {
    await this.ready;
    this.worker.postMessage(`position fen ${fen}`);
    const lines = await this.until('bestmove', `go depth ${depth} movetime ${maxMs}`);
    const side = fen.split(' ')[1] === 'b' ? 'b' : 'w';
    let last: ReturnType<typeof parseInfo> = null;
    for (const l of lines) { const p = parseInfo(l); if (p) last = p; }
    const best = /^bestmove (\S+)/.exec(lines.at(-1) ?? '')?.[1];
    const score = last ? toWhite(last, side) : { cp: 0 };
    const move = best && best !== '(none)' ? best : undefined;
    const pv = move && last?.line?.[0] === move ? last.line : undefined;
    return { ...score, best: move, ...(pv ? { pv } : {}) };
  }

  /** Tells the engine a new game starts (clears its hash). */
  async newGame() {
    await this.ready;
    this.worker.postMessage('ucinewgame');
    await this.until('readyok', 'isready');
  }

  stop() {
    this.worker.postMessage('quit');
    this.worker.terminate();
    this.listeners.clear();
  }
}
