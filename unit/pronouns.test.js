import { describe, expect, it } from 'vitest';
import {
  normalizePronouns,
  partnerSleepingWithMessage,
  partnerSoloNightsMessage,
  pronounVerbBe
} from '../js/pronouns.js';

describe('pronounVerbBe', () => {
  it('uses are for they and is for he/she', () => {
    expect(pronounVerbBe('they')).toBe('are');
    expect(pronounVerbBe('she')).toBe('is');
    expect(pronounVerbBe('he')).toBe('is');
  });
});

describe('normalizePronouns', () => {
  it('defaults to they/them when missing', () => {
    const p = normalizePronouns(null);
    expect(p.preset).toBe('they/them');
    expect(p.subject).toBe('they');
    expect(p.possessive).toBe('their');
  });

  it('expands preset keys', () => {
    const p = normalizePronouns({ preset: 'she/her' });
    expect(p.subject).toBe('she');
    expect(p.object).toBe('her');
    expect(p.possessive).toBe('her');
  });

  it('keeps custom forms', () => {
    const p = normalizePronouns({
      preset: 'custom',
      subject: 'xe',
      object: 'xem',
      possessive: 'xyr'
    });
    expect(p.preset).toBe('custom');
    expect(p.possessive).toBe('xyr');
  });

  it('accepts preset string shorthand', () => {
    const p = normalizePronouns('ze/zir');
    expect(p.subject).toBe('ze');
    expect(p.object).toBe('zir');
  });
});

describe('partner message helpers', () => {
  const config = {
    partners: [
      { id: 'p1', name: 'Alex', pronouns: { preset: 'she/her' } },
      { id: 'p2', name: 'Sam', pronouns: { preset: 'they/them' } }
    ]
  };

  it('uses first names then pronouns in sleeping-with warnings', () => {
    const msg = partnerSleepingWithMessage(config, 'Alex', 'Sam', 4, { max: 3 }, 'max');
    expect(msg).toContain('Alex is sleeping with Sam');
    expect(msg).toContain('her preferred limit');
    expect(msg).toContain('with them');
  });

  it('uses first name then pronouns for solo warnings', () => {
    const soloConfig = {
      partners: [{ id: 'p1', name: 'Sam', pronouns: { preset: 'they/them' } }]
    };
    const msg = partnerSoloNightsMessage(soloConfig, 'Sam', 1, 2);
    expect(msg).toContain('Sam is sleeping alone');
    expect(msg).toContain('their preferred minimum');
  });
});
