import { describe, expect, it } from 'vitest';
import {
  coerceProposalVisibility,
  getDefaultProposalVisibility,
  isPrivacyLevelAvailable,
  normalizePrivacySchedulingPolicies,
  PRIVACY_SCHEDULING_MODE
} from '../js/privacy-scheduling-policy.js';
import { VISIBILITY } from '../js/event-privacy.js';

describe('privacy scheduling policy', () => {
  it('defaults both levels to available when unset', () => {
    expect(normalizePrivacySchedulingPolicies({})).toEqual({
      private: PRIVACY_SCHEDULING_MODE.ENABLED,
      superPrivate: PRIVACY_SCHEDULING_MODE.ENABLED
    });
  });

  it('honors default mode for new proposals', () => {
    const config = {
      privacyScheduling: {
        private: PRIVACY_SCHEDULING_MODE.DEFAULT,
        superPrivate: PRIVACY_SCHEDULING_MODE.ENABLED
      }
    };
    expect(getDefaultProposalVisibility(config)).toBe(VISIBILITY.PRIVATE);
  });

  it('blocks disabled levels on new proposals without changing stored event visibility', () => {
    const config = {
      privacyScheduling: {
        private: PRIVACY_SCHEDULING_MODE.DISABLED,
        superPrivate: PRIVACY_SCHEDULING_MODE.DISABLED
      }
    };
    expect(isPrivacyLevelAvailable(config, VISIBILITY.PRIVATE)).toBe(false);
    expect(coerceProposalVisibility(config, VISIBILITY.SUPER_PRIVATE)).toBe(VISIBILITY.STANDARD);
  });
});
