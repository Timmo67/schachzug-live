import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD_THEMES, PIECE_SETS, effectiveDesign, pieceUrl } from './designs';

describe('designs', () => {
  it('falls back to the free defaults without Plus', () => {
    expect(effectiveDesign('green', 'fantasy', false)).toMatchObject({ board: { id: 'slate' }, pieces: { id: 'chessnut' } });
    expect(effectiveDesign('green', 'fantasy', true)).toMatchObject({ board: { id: 'green' }, pieces: { id: 'fantasy' } });
    expect(effectiveDesign('wood', 'celtic', false)).toMatchObject({ board: { id: 'wood' }, pieces: { id: 'celtic' } });
    expect(effectiveDesign('nope', undefined, true)).toMatchObject({ board: { id: 'slate' }, pieces: { id: 'chessnut' } });
  });

  it('builds piece URLs', () => {
    expect(pieceUrl('celtic', 'b', 'n')).toBe('/pieces/celtic/bN.svg');
  });

  it('matches the ids and Plus flags enforced by the database', () => {
    const sql = readFileSync('supabase/migrations/0007_appearance.sql', 'utf8');
    const list = (name: string) => [...sql.match(new RegExp(`${name}\\s+text\\[\\] := array\\[([^\\]]*)\\]`))![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(list('free_boards')).toEqual(BOARD_THEMES.filter((t) => !t.plus).map((t) => t.id));
    expect(list('plus_boards')).toEqual(BOARD_THEMES.filter((t) => t.plus).map((t) => t.id));
    expect(list('free_pieces')).toEqual(PIECE_SETS.filter((t) => !t.plus).map((t) => t.id));
    expect(list('plus_pieces')).toEqual(PIECE_SETS.filter((t) => t.plus).map((t) => t.id));
  });
});
