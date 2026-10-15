import { describe, expect, it } from 'vitest';
import { apnsPayload, base64url, fcmMessage, signJwt, tokenIsDead } from './push';

const row = { id: 1, title: 'Du bist am Zug', body: 'Ben hat gezogen.', url: '/partie/abc', collapse_key: 'move:abc' };

async function pkcs8Pem(alg: 'RS256' | 'ES256') {
  const pair = alg === 'RS256'
    ? await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
    : await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}

describe('push messages', () => {
  it('builds FCM and APNs messages with the link to open', () => {
    const f = fcmMessage(row, 'tok');
    expect(f.message.token).toBe('tok');
    expect(f.message.data.url).toBe('/partie/abc');
    expect(f.message.android.notification.tag).toBe('move:abc');
    const a = apnsPayload(row);
    expect(a.aps.alert.title).toBe('Du bist am Zug');
    expect(a.url).toBe('/partie/abc');
  });

  it('recognises dead device tokens', () => {
    expect(tokenIsDead('android', 404, '')).toBe(true);
    expect(tokenIsDead('android', 400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}')).toBe(true);
    expect(tokenIsDead('android', 500, 'internal')).toBe(false);
    expect(tokenIsDead('ios', 410, '')).toBe(true);
    expect(tokenIsDead('ios', 400, '{"reason":"BadDeviceToken"}')).toBe(true);
    expect(tokenIsDead('ios', 429, '{"reason":"TooManyRequests"}')).toBe(false);
  });

  for (const alg of ['RS256', 'ES256'] as const) {
    it(`signs ${alg} JWTs that verify`, async () => {
      const { pem, publicKey } = await pkcs8Pem(alg);
      const jwt = await signJwt(alg, pem, { kid: 'K1' }, { iss: 'me', iat: 1 });
      const [h, c, s] = jwt.split('.');
      expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg, typ: 'JWT', kid: 'K1' });
      expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({ iss: 'me', iat: 1 });
      const algo = alg === 'RS256' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' };
      const ok = await crypto.subtle.verify(algo, publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${c}`));
      expect(ok).toBe(true);
      expect(base64url('a?b')).toBe('YT9i');
    });
  }
});
