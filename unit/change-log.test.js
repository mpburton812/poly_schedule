import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  migrateChangeLog,
  recordPromotionIfNeeded,
  renderChangeLogHtml,
  isPromotionGroup
} from '../js/change-log.js';

describe('change-log', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key)
    });
  });

  it('migrates legacy flat entries into a promotion group', () => {
    const raw = [{ time: '1:00 PM', actor: 'Alex', action: 'Saved', detail: 'x', timestamp: 1 }];
    const groups = migrateChangeLog(raw);
    expect(groups).toHaveLength(1);
    expect(isPromotionGroup(groups[0])).toBe(true);
    expect(groups[0].changes[0]).toContain('Saved');
  });

  it('records a new promotion from version info and release notes', () => {
    const log = [];
    const added = recordPromotionIfNeeded(log, { branch: 'dev', commit: 'abc1234' }, {
      latest: {
        summary: 'Test promotion',
        changes: ['First change', 'Second change']
      }
    });
    expect(added).toBe(true);
    expect(log[0].summary).toBe('Test promotion');
    expect(log[0].changes).toEqual(['First change', 'Second change']);
  });

  it('renders grouped HTML with release note bullets', () => {
    const html = renderChangeLogHtml([{
      type: 'promotion',
      id: 'dev#abc1234',
      branch: 'dev',
      commit: 'abc1234',
      summary: 'Test release',
      promotedAt: new Date().toISOString(),
      changes: ['Saved group name']
    }]);
    expect(html).toContain('change-log-promotion');
    expect(html).toContain('change-log-notes');
    expect(html).toContain('Saved group name');
  });
});
