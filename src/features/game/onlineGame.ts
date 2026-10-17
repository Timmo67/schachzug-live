import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { isNativeApp } from '../../lib/native';
import type { GameState } from '../../../supabase/functions/_shared/gameLogic';
import { fromUci } from './chessRules';

export type GameRow = GameState & {
  id: string;
  created_by: string | null;
  time_control: string;
  fen: string;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  termination: string | null;
  draw_offer_by: string | null;
  version: number;
  created_at: string;
  finished_at: string | null;
  kind: 'friend' | 'random';
  white_rating: number | null;
  black_rating: number | null;
  white_rating_diff: number | null;
  black_rating_diff: number | null;
};

export const GAME_COLS =
  'id, status, white_id, black_id, created_by, time_control, fen, moves_uci, base_ms, increment_ms, white_ms_left, black_ms_left, last_move_at, result, termination, draw_offer_by, version, created_at, finished_at, kind, white_rating, black_rating, white_rating_diff, black_rating_diff';

export const TIME_CONTROLS = [
  { id: '3+2', label: '3 + 2' },
  { id: '5+0', label: '5 Min.' },
  { id: '10+0', label: '10 Min.' },
  { id: '15+10', label: '15 + 10' },
  { id: 'none', label: 'Ohne Uhr' },
] as const;

export function timeControlLabel(id: string): string {
  return TIME_CONTROLS.find((t) => t.id === id)?.label ?? id;
}

const ERRORS: Record<string, string> = {
  not_friends: 'Ihr müsst befreundet sein, um zu spielen.',
  not_your_turn: 'Du bist nicht am Zug.',
  illegal_move: 'Dieser Zug ist nicht erlaubt.',
  game_not_active: 'Die Partie läuft nicht mehr.',
  game_not_waiting: 'Diese Herausforderung ist nicht mehr offen.',
  draw_already_offered: 'Es gibt schon ein Remisangebot.',
  no_draw_offer: 'Es gibt kein Remisangebot.',
  conflict: 'Gleichzeitige Änderung – bitte noch einmal versuchen.',
  chat_phrases_only: 'Mit Spielern, die nicht deine Freunde sind, gehen nur die festen Kurzsätze.',
  not_possible: 'Eine Revanche ist hier nicht möglich.',
  already_reported: 'Du hast diesen Spieler schon gemeldet. Wir schauen es uns an.',
};

export function gameErrorText(code: string): string {
  for (const k of Object.keys(ERRORS)) if (code.includes(k)) return ERRORS[k];
  return 'Das hat nicht geklappt. Bitte erneut versuchen.';
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<string | null> {
  if (!supabase) return 'offline';
  const { error } = await supabase.rpc(fn, args);
  return error ? error.message : null;
}

export async function createGame(opponent: string, timeControl: string, color: 'w' | 'b' | 'random') {
  if (!supabase) return { error: 'offline' };
  const { data, error } = await supabase.rpc('create_game', { p_opponent: opponent, p_time_control: timeControl, p_color: color });
  return error ? { error: error.message } : { id: data as string };
}

export const respondGame = (id: string, action: 'accept' | 'decline' | 'cancel') =>
  rpc('respond_game', { p_game: id, p_action: action });

export const gameAction = (id: string, action: 'resign' | 'offer_draw' | 'accept_draw' | 'decline_draw' | 'claim_timeout') =>
  rpc('game_action', { p_game: id, p_action: action });

export async function sendMove(gameId: string, uci: string): Promise<{ game?: GameRow; error?: string }> {
  if (!supabase) return { error: 'offline' };
  const { data, error } = await supabase.functions.invoke('make-move', { body: { gameId, uci } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => ({}));
      return { error: String(body.error ?? 'server_error') };
    }
    return { error: 'network' };
  }
  return { game: data.game as GameRow };
}

export async function fetchGame(id: string): Promise<GameRow | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('games').select(GAME_COLS).eq('id', id).maybeSingle();
  return (data as GameRow) ?? null;
}

const TERMINATION: Record<string, string> = {
  checkmate: 'Schachmatt',
  resign: 'Aufgabe',
  timeout: 'Zeit abgelaufen',
  draw_agreed: 'Remis vereinbart',
  stalemate: 'Patt',
  insufficient: 'zu wenig Material',
  threefold: 'dreifache Wiederholung',
  fifty_moves: '50-Züge-Regel',
  declined: 'abgelehnt',
  cancelled: 'zurückgezogen',
  no_first_move: 'abgebrochen – kein erster Zug',
};

/** Result line from the viewer's perspective, e.g. "Du gewinnst – Schachmatt". */
export function resultText(g: GameRow, me: string | undefined): string {
  const why = g.termination ? TERMINATION[g.termination] ?? g.termination : '';
  if (g.status === 'aborted') return g.termination === 'no_first_move' ? `Partie ${why}` : `Herausforderung ${why}`;
  if (!g.result) return '';
  if (g.result === '1/2-1/2') return `Remis – ${why}`;
  const winner = g.result === '1-0' ? g.white_id : g.black_id;
  const who = me && (me === g.white_id || me === g.black_id) ? (winner === me ? 'Du gewinnst' : 'Du verlierst')
    : `${g.result === '1-0' ? 'Weiß' : 'Schwarz'} gewinnt`;
  return `${who} – ${why}`;
}

export function formatClock(ms: number | null): string {
  if (ms === null) return '∞';
  if (ms < 10_000) return `0:0${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** PGN with standard headers; names are the players' display names. */
export function toPgn(g: GameRow, white: string, black: string): string {
  const chess = fromUci(g.moves_uci);
  if (!chess) return '';
  const date = new Date(g.created_at);
  const d = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  chess.setHeader('Event', 'Knightcall');
  chess.setHeader('Site', 'schachzug-live');
  chess.setHeader('Date', d);
  chess.setHeader('White', white);
  chess.setHeader('Black', black);
  chess.setHeader('Result', g.result ?? '*');
  chess.setHeader('TimeControl', g.base_ms === null ? '-' : `${g.base_ms / 1000}+${g.increment_ms / 1000}`);
  if (g.termination) chess.setHeader('Termination', TERMINATION[g.termination] ?? g.termination);
  return chess.pgn() + '\n';
}

export function downloadPgn(g: GameRow, white: string, black: string) {
  // The app's WebView cannot save downloads; the PGN goes to the clipboard instead.
  if (isNativeApp) {
    void navigator.clipboard.writeText(toPgn(g, white, black)).then(
      () => window.alert('PGN in die Zwischenablage kopiert.'),
      () => window.alert('Kopieren hat nicht geklappt.'),
    );
    return;
  }
  const blob = new Blob([toPgn(g, white, black)], { type: 'application/x-chess-pgn' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `schachzug-${g.created_at.slice(0, 10)}-${white}-vs-${black}.pgn`.replace(/[^\w.-]+/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
