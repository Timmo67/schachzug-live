// Pure helpers for the video call (unit-tested, no browser APIs).

export type Quality = 'good' | 'ok' | 'poor' | 'unknown';

export const QUALITY_LABEL: Record<Quality, string> = {
  good: 'Verbindung gut',
  ok: 'Verbindung mittel',
  poor: 'Verbindung schwach',
  unknown: 'Verbindung wird geprüft',
};

/** Classifies a connection from round-trip time (s) and packet loss since the last sample (0..1). */
export function classifyQuality(rttSeconds: number | null, lossRatio: number | null): Quality {
  if (rttSeconds === null && lossRatio === null) return 'unknown';
  const rtt = rttSeconds ?? 0;
  const loss = lossRatio ?? 0;
  if (rtt > 0.4 || loss > 0.08) return 'poor';
  if (rtt > 0.2 || loss > 0.02) return 'ok';
  return 'good';
}

/** Loss ratio between two samples of cumulative counters; null when nothing was received in between. */
export function lossBetween(
  prev: { lost: number; received: number } | null,
  cur: { lost: number; received: number },
): number | null {
  if (!prev) return null;
  const lost = Math.max(0, cur.lost - prev.lost);
  const received = Math.max(0, cur.received - prev.received);
  return lost + received === 0 ? null : lost / (lost + received);
}

export function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export type VideoStatus = { allowed: boolean; unlimited: boolean; remaining_seconds: number | null };

export function allowanceText(s: VideoStatus | null): string {
  if (!s) return '';
  if (s.unlimited) return 'Video unbegrenzt (Plus in dieser Partie)';
  if (!s.allowed) return 'Dein Gratis-Video für diese Woche ist aufgebraucht. Mit Plus ist Video unbegrenzt.';
  return `Gratis-Video: noch ${formatMinutes(s.remaining_seconds ?? 0)} Min. diese Woche`;
}

/** Signalling messages sent over the private broadcast channel. */
export type Signal =
  | { type: 'hello' }
  | { type: 'bye' }
  | { type: 'description'; description: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };
