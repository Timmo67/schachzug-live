import { Chess, type Color } from 'chess.js';
import { reviewMoves, type Eval } from '../analysis/analysisLogic';

// Pure rules for the personal training (unit-tested): find a player's typical mistakes in their analysed
// games and puzzle results, and turn the biggest ones into lessons (explanation + puzzles of a motif).

export type AnalysedGame = { moves: string[]; color: Color; evals: Eval[] };
export type ThemeStat = { theme: string; attempts: number; solved: number };
export type Phase = 'opening' | 'middlegame' | 'endgame';
export type MistakeKind = 'hanging' | 'missedTactic' | 'missedMate' | 'other';

export type Lesson = { id: string; title: string; text: string; themes: string[]; reason: string };

export type Profile = {
  games: number;
  moves: number;
  accuracy: number;
  phases: Record<Phase, { moves: number; accuracy: number }>;
  mistakes: Record<MistakeKind, number>;
  lessons: Lesson[];
};

const VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3 };

/** Phase of a position: first 10 moves each = opening; little material left = endgame. */
export function phaseOf(g: Chess, ply: number): Phase {
  if (ply < 20) return 'opening';
  let material = 0;
  for (const row of g.board()) for (const sq of row) if (sq) material += VALUE[sq.type] ?? 0;
  return material <= 26 ? 'endgame' : 'middlegame';
}

function isCaptureOrCheck(g: Chess, uci: string | undefined): { capture: boolean; check: boolean } {
  if (!uci) return { capture: false, check: false };
  try {
    const m = new Chess(g.fen()).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
    return { capture: !!m.captured, check: m.san.includes('+') || m.san.includes('#') };
  } catch { return { capture: false, check: false }; }
}

/** What kind of mistake a bad move was (only called for mistakes and blunders). */
export function classify(before: Chess, after: Chess, evalBefore: Eval, evalAfter: Eval, color: Color): MistakeKind {
  const mine = (m: number | undefined) => m !== undefined && m !== 0 && (color === 'w' ? m > 0 : m < 0);
  if (mine(evalBefore.mate) && !mine(evalAfter.mate)) return 'missedMate';
  if (isCaptureOrCheck(after, evalAfter.best).capture) return 'hanging';
  const best = isCaptureOrCheck(before, evalBefore.best);
  if (best.capture || best.check) return 'missedTactic';
  return 'other';
}

type LessonDef = { id: string; title: string; text: string; themes: string[] };

const LESSONS: Record<string, LessonDef> = {
  hanging: {
    id: 'hanging', title: 'Ungedeckte Figuren', themes: ['hangingPiece', 'trappedPiece'],
    text: 'Bevor du ziehst: Welche deiner Figuren sind nicht gedeckt, und was greift der Gegner an? Und nach seinem Zug: Was hat sich geändert? Diese kurze Prüfung verhindert die meisten Figurenverluste.',
  },
  tactics: {
    id: 'tactics', title: 'Taktik sehen', themes: ['fork', 'pin', 'skewer', 'discoveredAttack'],
    text: 'Gute Chancen gehen oft verloren, weil man sie nicht sucht. Prüfe in jeder Stellung zuerst Schachs, dann Schlagzüge, dann Angriffe – oft steckt eine Gabel, Fesselung oder ein Spieß dahinter.',
  },
  mate: {
    id: 'mate', title: 'Matt erkennen', themes: ['mateIn1', 'mateIn2', 'backRankMate'],
    text: 'Matts werden oft übersehen – auf beiden Seiten. Achte auf den gegnerischen König: Wie viele freie Felder hat er? Welche Schachs gibt es? Ein enger König ist oft schon fast matt.',
  },
  opening: {
    id: 'opening', title: 'Gut aus der Eröffnung kommen', themes: ['opening'],
    text: 'Die ersten Züge entscheiden viel: Zentrum besetzen, Springer und Läufer früh entwickeln, früh rochieren, die Dame nicht zu früh herausbringen und keine Figur zweimal ziehen ohne Grund.',
  },
  endgame: {
    id: 'endgame', title: 'Endspiele sicher spielen', themes: ['endgame', 'rookEndgame', 'pawnEndgame'],
    text: 'Im Endspiel wird der König zur starken Figur – bring ihn nach vorn. Freibauern sind Gold wert, Türme gehören hinter Freibauern. Rechne lieber einen Zug mehr.',
  },
  fork: { id: 'fork', title: 'Gabeln', themes: ['fork'], text: 'Eine Figur greift zwei gegnerische gleichzeitig an – nur eine kann gerettet werden. Springer und Damen sind die Meister der Gabel.' },
  pin: { id: 'pin', title: 'Fesselungen', themes: ['pin'], text: 'Eine Figur darf nicht ziehen, weil dahinter etwas Wertvolleres steht. Gefesselte Figuren sind schwach – greif sie an.' },
  skewer: { id: 'skewer', title: 'Spieße', themes: ['skewer'], text: 'Wie eine Fesselung, nur umgekehrt: Die wertvolle Figur steht vorn, muss weichen, und die dahinter fällt.' },
  discoveredAttack: { id: 'discoveredAttack', title: 'Abzugsangriffe', themes: ['discoveredAttack'], text: 'Eine Figur zieht weg und gibt die Linie für eine andere frei – plötzlich gibt es zwei Angriffe auf einmal.' },
  deflection: { id: 'deflection', title: 'Ablenkung', themes: ['deflection'], text: 'Lenke einen Verteidiger von seiner Aufgabe ab – dann fällt, was er schützen sollte.' },
  sacrifice: { id: 'sacrifice', title: 'Opfer', themes: ['sacrifice'], text: 'Manchmal lohnt es sich, Material zu geben, um den König zu erreichen oder mehr zurückzugewinnen. Rechne die Folge bis zum Ende.' },
  defensiveMove: { id: 'defensiveMove', title: 'Verteidigen', themes: ['defensiveMove'], text: 'Nicht jede Stellung braucht einen Angriff. Erkenne die Drohung des Gegners und finde den Zug, der sie ruhig entschärft.' },
};

/** Lessons for weak puzzle motifs map onto these entries. */
const THEME_LESSON: Record<string, string> = {
  fork: 'fork', pin: 'pin', skewer: 'skewer', discoveredAttack: 'discoveredAttack', deflection: 'deflection',
  sacrifice: 'sacrifice', defensiveMove: 'defensiveMove', hangingPiece: 'hanging', mateIn1: 'mate', mateIn2: 'mate',
  backRankMate: 'mate', endgame: 'endgame', opening: 'opening',
};

/** Lessons offered when a player has no clear weakness yet. */
const DEFAULT_LESSONS = ['tactics', 'mate', 'hanging'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildProfile(games: AnalysedGame[], themeStats: ThemeStat[]): Profile {
  const phases: Record<Phase, { moves: number; sum: number }> = { opening: { moves: 0, sum: 0 }, middlegame: { moves: 0, sum: 0 }, endgame: { moves: 0, sum: 0 } };
  const mistakes: Record<MistakeKind, number> = { hanging: 0, missedTactic: 0, missedMate: 0, other: 0 };
  let moves = 0, sum = 0;

  for (const game of games) {
    if (game.evals.length !== game.moves.length + 1) continue;
    const reviews = reviewMoves(game.evals, game.moves);
    const g = new Chess();
    for (let i = 0; i < game.moves.length; i++) {
      const before = new Chess(g.fen());
      const m = game.moves[i];
      g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      const r = reviews[i];
      if (r.color !== game.color) continue;
      moves++; sum += r.accuracy;
      const ph = phaseOf(before, i);
      phases[ph].moves++; phases[ph].sum += r.accuracy;
      if (r.judgement === 'mistake' || r.judgement === 'blunder') {
        mistakes[classify(before, g, game.evals[i], game.evals[i + 1], game.color)]++;
      }
    }
  }

  const avg = (s: number, n: number) => (n ? Math.round(s / n) : 0);
  const accuracy = avg(sum, moves);
  const phaseOut = Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, { moves: v.moves, accuracy: avg(v.sum, v.moves) }])) as Profile['phases'];
  const n = Math.max(1, games.length);

  // Candidate lessons with a score (how much this weakness costs per game) and a reason in plain words.
  const candidates: Array<{ id: string; score: number; reason: string }> = [];
  if (mistakes.hanging) candidates.push({ id: 'hanging', score: (mistakes.hanging / n) * 1.2, reason: `In deinen letzten ${plural(games.length, 'Partie', 'Partien')} hast du ${plural(mistakes.hanging, 'Mal', 'Mal')} eine Figur ungedeckt stehen lassen.` });
  if (mistakes.missedTactic) candidates.push({ id: 'tactics', score: mistakes.missedTactic / n, reason: `${plural(mistakes.missedTactic, 'Mal', 'Mal')} gab es einen starken Schlag- oder Schachzug, den du nicht gefunden hast.` });
  if (mistakes.missedMate) candidates.push({ id: 'mate', score: (mistakes.missedMate / n) * 1.5, reason: `${plural(mistakes.missedMate, 'Mal', 'Mal')} hattest du ein Matt auf dem Brett und hast es übersehen.` });
  for (const ph of ['opening', 'endgame'] as const) {
    const p = phaseOut[ph];
    if (p.moves >= 15 && p.accuracy < accuracy - 5) {
      candidates.push({ id: ph, score: (accuracy - p.accuracy) / 10, reason: `Deine Genauigkeit im ${ph === 'opening' ? 'Eröffnungsteil' : 'Endspiel'} liegt bei ${p.accuracy} % – insgesamt spielst du ${accuracy} %.` });
    }
  }
  for (const t of themeStats) {
    const id = THEME_LESSON[t.theme];
    const rate = t.attempts ? t.solved / t.attempts : 1;
    if (id && t.attempts >= 3 && rate < 0.6) {
      candidates.push({ id, score: (0.6 - rate) * 3, reason: `Bei Rätseln zum Thema „${LESSONS[id].title}“ hast du ${t.solved} von ${t.attempts} gelöst.` });
    }
  }

  // Best score per lesson, highest first; fill up to three with general lessons.
  const best = new Map<string, { score: number; reason: string }>();
  for (const c of candidates) if (!best.has(c.id) || best.get(c.id)!.score < c.score) best.set(c.id, c);
  const ordered = [...best.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 3);
  for (const id of DEFAULT_LESSONS) {
    if (ordered.length >= 3) break;
    if (!best.has(id)) ordered.push([id, { score: 0, reason: 'Ein Grundlagen-Thema, das jede Partie besser macht.' }]);
  }
  const lessons = ordered.map(([id, c]) => ({ ...LESSONS[id], reason: c.reason }));

  return { games: games.length, moves, accuracy, phases: phaseOut, mistakes, lessons };
}

/** A lesson by id (for links like /raetsel?lektion=fork). */
export function lessonById(id: string | null): LessonDef | null {
  return id && Object.hasOwn(LESSONS, id) ? LESSONS[id] : null;
}
