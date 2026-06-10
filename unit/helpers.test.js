import { describe, expect, it } from 'vitest';
import { normalizeConfigPartners } from '../js/helpers.js';

describe('normalizeConfigPartners', () => {
  it('restores empty sleeping rules from defaults', () => {
    const config = {
      partners: [{
        id: 'p1',
        name: 'Alex Rivera',
        rules: { minSoloNights: 2, partnerLimits: {} }
      }]
    };
    const defaults = {
      partners: [{
        id: 'p1',
        name: 'Alex Rivera',
        rules: { minSoloNights: 2, partnerLimits: { Sam: { min: 3, max: 3 } } }
      }]
    };
    const changed = normalizeConfigPartners(config, defaults);
    expect(changed).toBe(true);
    expect(config.partners[0].rules.partnerLimits.Sam).toEqual({ min: 3, max: 3 });
  });
});
