import { describe, expect, it } from 'vitest';
import {
  formatScheduleRangeLabel,
  getScheduleNavigationDays,
  getScheduleWeekCount,
  normalizeScheduleViewMode,
  SCHEDULE_VIEW_COMPACT,
  SCHEDULE_VIEW_NORMAL
} from '../js/schedule-view.js';
import { getMondayOfWeek } from '../js/helpers.js';

describe('schedule view helpers', () => {
  it('normalizes schedule view modes', () => {
    expect(normalizeScheduleViewMode('compact')).toBe(SCHEDULE_VIEW_COMPACT);
    expect(normalizeScheduleViewMode('normal')).toBe(SCHEDULE_VIEW_NORMAL);
    expect(normalizeScheduleViewMode('invalid')).toBe(SCHEDULE_VIEW_NORMAL);
  });

  it('uses one week for normal view and two for compact view', () => {
    expect(getScheduleWeekCount(SCHEDULE_VIEW_NORMAL)).toBe(1);
    expect(getScheduleWeekCount(SCHEDULE_VIEW_COMPACT)).toBe(2);
    expect(getScheduleNavigationDays(SCHEDULE_VIEW_NORMAL)).toBe(7);
    expect(getScheduleNavigationDays(SCHEDULE_VIEW_COMPACT)).toBe(14);
  });

  it('formats single-week and two-week labels', () => {
    const monday = getMondayOfWeek(new Date(2026, 5, 11));
    const reference = new Date(2026, 5, 15);
    expect(formatScheduleRangeLabel(monday, 1, reference)).toBe('Week of Jun 8');
    expect(formatScheduleRangeLabel(monday, 2, reference)).toBe('Weeks of Jun 8 – 21');
  });
});
