// Edge Function: delivers queued push notifications (table push_queue) to the users' devices.
// Woken by the database (pg_net) whenever a message is queued; the request body is ignored, so calling it
// from outside only sends what is already queued. Secrets (set in the Supabase dashboard):
//   FCM_SERVICE_ACCOUNT  – JSON key of a Firebase service account (Android)
//   APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID – Apple .p8 key (iOS); APNS_SANDBOX=1 for development builds
import { createClient } from '@supabase/supabase-js';
import { apnsPayload, fcmMessage, signJwt, tokenIsDead, type PushRow } from '../_shared/push.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const BUNDLE_ID = 'app.knightcall';

type Token = { token: string; platform: 'ios' | 'android' };
type Sender = (row: PushRow, token: string) => Promise<{ ok: boolean; dead: boolean; info: string }>;

// Google OAuth token for FCM, cached for 50 minutes.
let fcmAuth: { token: string; until: number } | null = null;
async function fcmSender(): Promise<Sender | null> {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };
  if (!fcmAuth || fcmAuth.until < Date.now()) {
    const now = Math.floor(Date.now() / 1000);
    const assertion = await signJwt('RS256', sa.private_key, {}, {
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!r.ok) throw new Error(`fcm_auth ${r.status} ${await r.text()}`);
    fcmAuth = { token: (await r.json()).access_token, until: Date.now() + 50 * 60_000 };
  }
  return async (row, token) => {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${fcmAuth!.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fcmMessage(row, token)),
    });
    const text = r.ok ? '' : await r.text();
    return { ok: r.ok, dead: !r.ok && tokenIsDead('android', r.status, text), info: r.ok ? 'fcm ok' : `fcm ${r.status} ${text.slice(0, 200)}` };
  };
}

// Apple provider token, renewed every 40 minutes (Apple accepts 20–60).
let apnsAuth: { token: string; until: number } | null = null;
async function apnsSender(): Promise<Sender | null> {
  const key = Deno.env.get('APNS_KEY'), keyId = Deno.env.get('APNS_KEY_ID'), team = Deno.env.get('APNS_TEAM_ID');
  if (!key || !keyId || !team) return null;
  if (!apnsAuth || apnsAuth.until < Date.now()) {
    apnsAuth = { token: await signJwt('ES256', key, { kid: keyId }, { iss: team, iat: Math.floor(Date.now() / 1000) }), until: Date.now() + 40 * 60_000 };
  }
  const host = Deno.env.get('APNS_SANDBOX') === '1' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  return async (row, token) => {
    const r = await fetch(`https://${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${apnsAuth!.token}`, 'apns-topic': BUNDLE_ID, 'apns-push-type': 'alert', 'apns-priority': '10',
        ...(row.collapse_key ? { 'apns-collapse-id': row.collapse_key.slice(0, 64) } : {}),
      },
      body: JSON.stringify(apnsPayload(row)),
    });
    const text = r.ok ? '' : await r.text();
    return { ok: r.ok, dead: !r.ok && tokenIsDead('ios', r.status, text), info: r.ok ? 'apns ok' : `apns ${r.status} ${text.slice(0, 200)}` };
  };
}

Deno.serve(async () => {
  const { data: rows, error } = await admin.rpc('claim_push_batch', { p_limit: 50 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const batch = (rows ?? []) as Array<PushRow & { user_id: string }>;
  if (!batch.length) return new Response(JSON.stringify({ sent: 0 }));

  const senders: Record<Token['platform'], Sender | null> = { android: null, ios: null };
  const setupErrors: string[] = [];
  try { senders.android = await fcmSender(); } catch (e) { setupErrors.push(String(e)); }
  try { senders.ios = await apnsSender(); } catch (e) { setupErrors.push(String(e)); }

  let sent = 0;
  for (const row of batch) {
    const { data: tokens } = await admin.from('push_tokens').select('token, platform').eq('user_id', row.user_id);
    const infos: string[] = [];
    let delivered = false, tried = false;
    for (const t of (tokens ?? []) as Token[]) {
      const send = senders[t.platform];
      if (!send) { infos.push(`${t.platform} not configured`); continue; }
      tried = true;
      try {
        const r = await send(row, t.token);
        infos.push(r.info);
        if (r.ok) delivered = true;
        if (r.dead) await admin.rpc('forget_push_token', { p_token: t.token, p_user: null });
      } catch (e) { infos.push(String(e).slice(0, 200)); }
    }
    const status = delivered ? 'sent' : tried ? 'failed' : 'skipped';
    if (delivered) sent++;
    await admin.from('push_queue').update({ status, sent_at: new Date().toISOString(), info: [...setupErrors, ...infos].join('; ').slice(0, 500) }).eq('id', row.id);
  }
  return new Response(JSON.stringify({ sent, processed: batch.length }), { headers: { 'Content-Type': 'application/json' } });
});
