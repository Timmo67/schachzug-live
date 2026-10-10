// Pure game logic shared by the Edge Function `make-move` (Deno) and the web client (Vite).
// Keep this file free of runtime-specific APIs.
import { Chess } from 'chess.js';

export type GameState = {
  status: 'waiting' | 'active' | 'finished' | 'aborted';
  white_id: string | null;
  black_id: string | null;
  moves_uci: string[];
  base_ms: number | null;
  increment_ms: number;
  white_ms_left: number | null;
  black_ms_left: number | null;
  last_move_at: string | null;
};

export type GameUpdate = {
  fen: string;
  moves_uci: string[];
  white_ms_left: number | null;
  black_ms_left: number | null;
  last_move_at: string;
  status: 'active' | 'finished';
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  termination: string | null;
  finished_at: string | null;
  draw_offer_by: null;
};

export type MoveError =
  | 'game_not_active'
  | 'not_a_player'
  | 'not_your_turn'
  | 'illegal_move'
  | 'corrupt_game';

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Clocks run only after each side has made its first move. */
export function clockRunning(s: Pick<GameState, 'status' | 'base_ms' | 'moves_uci' | 'last_move_at'>): boolean {
  return s.status === 'active' && s.base_ms !== null && s.moves_uci.length >= 2 && !!s.last_move_at;
}

/** Remaining time of both sides at `nowMs` (null when the game has no clock). */
export function clocksAt(s: GameState, nowMs: number): { w: number | null; b: number | null } {
  if (s.base_ms === null) return { w: null, b: null };
  let w = s.white_ms_left ?? s.base_ms;
  let b = s.black_ms_left ?? s.base_ms;
  if (clockRunning(s)) {
    const elapsed = Math.max(0, nowMs - Date.parse(s.last_move_at!));
    if (s.moves_uci.length % 2 === 0) w -= elapsed;
    else b -= elapsed;
  }
  return { w: Math.max(0, w), b: Math.max(0, b) };
}

/**
 * Validates and applies one move for `userId`. Returns the columns to write, or an error code.
 * A move arriving after the mover's flag fell ends the game on time instead.
 */
export function applyMove(s: GameState, userId: string, uci: string, nowMs: number): GameUpdate | { error: MoveError } {
  if (s.status !== 'active') return { error: 'game_not_active' };
  if (userId !== s.white_id && userId !== s.black_id) return { error: 'not_a_player' };
  const whiteToMove = s.moves_uci.length % 2 === 0;
  if (userId !== (whiteToMove ? s.white_id : s.black_id)) return { error: 'not_your_turn' };
  if (!UCI.test(uci)) return { error: 'illegal_move' };

  const g = new Chess();
  for (const m of s.moves_uci) {
    try { g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }); } catch { return { error: 'corrupt_game' }; }
  }

  const now = new Date(nowMs).toISOString();
  let { w, b } = clocksAt(s, nowMs);
  const base = { draw_offer_by: null, last_move_at: now } as const;

  if (s.base_ms !== null && (whiteToMove ? w : b)! <= 0) {
    return {
      ...base,
      fen: g.fen(),
      moves_uci: s.moves_uci,
      white_ms_left: whiteToMove ? 0 : w,
      black_ms_left: whiteToMove ? b : 0,
      status: 'finished',
      result: whiteToMove ? '0-1' : '1-0',
      termination: 'timeout',
      finished_at: now,
    };
  }

  let played: string;
  try {
    const r = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    played = r.from + r.to + (r.promotion ?? '');
  } catch {
    return { error: 'illegal_move' };
  }

  if (s.base_ms !== null) {
    if (whiteToMove) w = w! + s.increment_ms;
    else b = b! + s.increment_ms;
  }

  let result: GameUpdate['result'] = null;
  let termination: string | null = null;
  if (g.isCheckmate()) { result = whiteToMove ? '1-0' : '0-1'; termination = 'checkmate'; }
  else if (g.isStalemate()) { result = '1/2-1/2'; termination = 'stalemate'; }
  else if (g.isInsufficientMaterial()) { result = '1/2-1/2'; termination = 'insufficient'; }
  else if (g.isThreefoldRepetition()) { result = '1/2-1/2'; termination = 'threefold'; }
  else if (g.isDraw()) { result = '1/2-1/2'; termination = 'fifty_moves'; }

  return {
    ...base,
    fen: g.fen(),
    moves_uci: [...s.moves_uci, played],
    white_ms_left: w,
    black_ms_left: b,
    status: result ? 'finished' : 'active',
    result,
    termination,
    finished_at: result ? now : null,
  };
}
