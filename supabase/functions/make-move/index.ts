// Edge Function: validates a move with chess.js and writes it with the service role.
// Body: { gameId: string, uci: string }. Realtime then delivers the updated row to both players.
import { createClient } from '@supabase/supabase-js';
import { applyMove, type GameState } from '../_shared/gameLogic.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const COLS = 'id, status, white_id, black_id, moves_uci, base_ms, increment_ms, white_ms_left, black_ms_left, last_move_at, version';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !auth.user) return json({ error: 'not_authenticated' }, 401);

  let body: { gameId?: unknown; uci?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (typeof body.gameId !== 'string' || typeof body.uci !== 'string') return json({ error: 'bad_request' }, 400);

  // Two attempts: a concurrent write (e.g. a draw offer) bumps `version` and we retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row, error } = await admin.from('games').select(COLS).eq('id', body.gameId).maybeSingle();
    if (error) return json({ error: 'server_error' }, 500);
    if (!row || (auth.user.id !== row.white_id && auth.user.id !== row.black_id)) return json({ error: 'game_not_found' }, 404);

    const res = applyMove(row as GameState, auth.user.id, body.uci, Date.now());
    if ('error' in res) return json({ error: res.error }, 409);

    const { data: updated, error: upErr } = await admin
      .from('games')
      .update({ ...res, version: row.version + 1, updated_at: res.last_move_at })
      .eq('id', row.id)
      .eq('version', row.version)
      .select()
      .maybeSingle();
    if (upErr) return json({ error: 'server_error' }, 500);
    if (updated) return json({ game: updated });
  }
  return json({ error: 'conflict' }, 409);
});
