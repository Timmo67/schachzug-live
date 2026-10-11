import { describe, expect, it } from 'vitest';
import { allowanceText, classifyQuality, formatMinutes, lossBetween } from './videoLogic';

describe('video helpers', () => {
  it('classifies connection quality', () => {
    expect(classifyQuality(null, null)).toBe('unknown');
    expect(classifyQuality(0.05, 0)).toBe('good');
    expect(classifyQuality(0.25, 0)).toBe('ok');
    expect(classifyQuality(0.05, 0.05)).toBe('ok');
    expect(classifyQuality(0.5, 0)).toBe('poor');
    expect(classifyQuality(null, 0.2)).toBe('poor');
  });

  it('computes loss between samples', () => {
    expect(lossBetween(null, { lost: 5, received: 100 })).toBeNull();
    expect(lossBetween({ lost: 5, received: 100 }, { lost: 5, received: 100 })).toBeNull();
    expect(lossBetween({ lost: 0, received: 0 }, { lost: 10, received: 90 })).toBeCloseTo(0.1);
  });

  it('describes the allowance', () => {
    expect(formatMinutes(600)).toBe('10:00');
    expect(formatMinutes(65)).toBe('1:05');
    expect(allowanceText({ allowed: true, unlimited: false, remaining_seconds: 125 })).toBe('Gratis-Video: noch 2:05 Min. diese Woche');
    expect(allowanceText({ allowed: false, unlimited: false, remaining_seconds: 0 })).toContain('aufgebraucht');
    expect(allowanceText({ allowed: true, unlimited: true, remaining_seconds: null })).toContain('unbegrenzt');
  });
});
