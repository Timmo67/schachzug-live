// Board and piece designs. Keep the ids in sync with supabase/migrations/0007_appearance.sql.

export type BoardTheme = { id: string; name: string; light: string | null; dark: string | null; plus: boolean };
export type PieceSet = { id: string; name: string; plus: boolean };

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'slate', name: 'Blaugrau', light: null, dark: null, plus: false }, // design tokens, follow light/dark mode
  { id: 'wood', name: 'Holz', light: '#f0d9b5', dark: '#b58863', plus: false },
  { id: 'green', name: 'Turnier', light: '#eeeed2', dark: '#769656', plus: true },
  { id: 'blue', name: 'Eis', light: '#dee3e6', dark: '#8ca2ad', plus: true },
  { id: 'marble', name: 'Marmor', light: '#ebe7df', dark: '#a39a8c', plus: true },
  { id: 'purple', name: 'Lavendel', light: '#ece4f3', dark: '#9677b8', plus: true },
  { id: 'night', name: 'Nacht', light: '#a7b1bc', dark: '#4f5d6c', plus: true },
  { id: 'coral', name: 'Koralle', light: '#f6e3d8', dark: '#d2846a', plus: true },
];

export const PIECE_SETS: PieceSet[] = [
  { id: 'chessnut', name: 'Klassisch', plus: false },
  { id: 'celtic', name: 'Keltisch', plus: false },
  { id: 'symbols', name: 'Schlicht', plus: false },
  { id: 'fantasy', name: 'Fantasy', plus: true },
  { id: 'spatial', name: 'Modern', plus: true },
  { id: 'rhosgfx', name: 'Rhos', plus: true },
  { id: 'papercut', name: 'Scherenschnitt', plus: true },
];

export const DEFAULT_BOARD = 'slate';
export const DEFAULT_PIECES = 'chessnut';

/** The design actually shown: unknown ids or Plus designs without Plus fall back to the defaults. */
export function effectiveDesign(board: string | undefined, pieces: string | undefined, hasPlus: boolean) {
  const b = BOARD_THEMES.find((t) => t.id === board);
  const p = PIECE_SETS.find((s) => s.id === pieces);
  return {
    board: b && (!b.plus || hasPlus) ? b : BOARD_THEMES.find((t) => t.id === DEFAULT_BOARD)!,
    pieces: p && (!p.plus || hasPlus) ? p : PIECE_SETS.find((s) => s.id === DEFAULT_PIECES)!,
  };
}

export function pieceUrl(set: string, color: 'w' | 'b', type: string): string {
  return `/pieces/${set}/${color}${type.toUpperCase()}.svg`;
}
