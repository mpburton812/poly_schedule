import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  migrateChangeLog,
  appendChangeEntry,
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
    expect(groups[0].entries[0].action).toBe('Saved');
  });

  it('appends changes under the active promotion', () => {
    const log = [];
    appendChangeEntry(log, {
      time: '2:00 PM',
      actor: 'Michael Burton',
      action: 'Updated profile',
      detail: '',
      timestamp: Date.now()
    });
    expect(log[0].entries[0].actor).toBe('Michael Burton');
  });

  it('records a new promotion from version info', () => {
    const log = [];
    const added = recordPromotionIfNeeded(log, { branch: 'dev', commit: 'abc1234' }, {
      latest: {
        summary: 'Test promotion',
        changes: ['First change', 'Second change']
      }
    });
    expect(added).toBe(true);
    expect(log[0].summary).toBe('Test promotion');
    expect(log[0].entries).toHaveLength(2);
  });

  it('renders grouped HTML with readable structure', () => {
    const html = renderChangeLogHtml(migrateChangeLog([
      { time: '3:00 PM', actor: 'Katie', action: 'Saved group name', detail: 'Circle', timestamp: 1 }
    ]));
    expect(html).toContain('change-log-promotion');
    expect(html).toContain('Saved group name');
  });
});
