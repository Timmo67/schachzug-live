// Building and signing push messages for Firebase Cloud Messaging (Android) and APNs (iOS).
// Pure WebCrypto code: runs in the Edge Function (Deno) and in Vitest (Node).

export type PushRow = { id: number; title: string; body: string; url: string; collapse_key: string | null };

const enc = new TextEncoder();

export function base64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Signs a JWT. RS256 for Google service accounts, ES256 for Apple .p8 keys (both PKCS#8 PEM). */
export async function signJwt(alg: 'RS256' | 'ES256', pem: string, header: Record<string, string>, claims: Record<string, unknown>): Promise<string> {
  const params = alg === 'RS256'
    ? { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, sign: { name: 'RSASSA-PKCS1-v1_5' } }
    : { import: { name: 'ECDSA', namedCurve: 'P-256' }, sign: { name: 'ECDSA', hash: 'SHA-256' } };
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pem), params.import, false, ['sign']);
  const input = `${base64url(JSON.stringify({ alg, typ: 'JWT', ...header }))}.${base64url(JSON.stringify(claims))}`;
  // WebCrypto's ECDSA output is already the raw r||s form JWT expects.
  const sig = await crypto.subtle.sign(params.sign, key, enc.encode(input));
  return `${input}.${base64url(sig)}`;
}

/** Message body for the FCM HTTP v1 API. */
export function fcmMessage(row: PushRow, token: string) {
  return {
    message: {
      token,
      notification: { title: row.title, body: row.body },
      data: { url: row.url },
      android: {
        priority: 'high',
        ...(row.collapse_key ? { collapse_key: row.collapse_key } : {}),
        notification: { ...(row.collapse_key ? { tag: row.collapse_key } : {}), color: '#DBA24A' },
      },
    },
  };
}

/** Payload for APNs; the app reads `url` when the notification is tapped. */
export function apnsPayload(row: PushRow) {
  return {
    aps: { alert: { title: row.title, body: row.body }, sound: 'default', ...(row.collapse_key ? { 'thread-id': row.collapse_key } : {}) },
    url: row.url,
  };
}

/** Whether a push service answer means the device token is gone for good. */
export function tokenIsDead(platform: 'ios' | 'android', status: number, body: string): boolean {
  if (platform === 'android') return status === 404 || /UNREGISTERED|registration-token-not-registered/.test(body);
  return status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(body);
}
