// Edge Function: ICE servers for a video call. Body: { gameId: string }.
// Only players of the game with video allowance get them. With the secrets CLOUDFLARE_TURN_KEY_ID and
// CLOUDFLARE_TURN_API_TOKEN set, short-lived Cloudflare TURN credentials are returned; without them,
// only the public STUN server (works for most home networks, not behind strict firewalls).
import { createClient } from '@supabase/supabase-js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }];
const TTL_SECONDS = 4 * 60 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { gameId?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (typeof body.gameId !== 'string') return json({ error: 'bad_request' }, 400);

  // Ask the database as the calling user: it checks that they play this game and may use video.
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: status, error } = await asUser.rpc('video_status', { p_game: body.gameId });
  if (error) return json({ error: error.message.includes('game_not_found') ? 'game_not_found' : 'not_authenticated' }, 403);
  if (!status?.allowed) return json({ error: 'video_quota_exhausted' }, 403);

  const keyId = Deno.env.get('CLOUDFLARE_TURN_KEY_ID');
  const token = Deno.env.get('CLOUDFLARE_TURN_API_TOKEN');
  if (!keyId || !token) return json({ iceServers: STUN, turn: false });

  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TTL_SECONDS }),
  });
  if (!res.ok) return json({ iceServers: STUN, turn: false });
  const cf = await res.json() as { iceServers: unknown };
  return json({ iceServers: cf.iceServers, turn: true });
});
