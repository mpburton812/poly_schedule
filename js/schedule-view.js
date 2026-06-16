export const SCHEDULE_VIEW_NORMAL = 'normal';
export const SCHEDULE_VIEW_COMPACT = 'compact';

export function normalizeScheduleViewMode(mode) {
  return mode === SCHEDULE_VIEW_COMPACT ? SCHEDULE_VIEW_COMPACT : SCHEDULE_VIEW_NORMAL;
}

export function getScheduleWeekCount(viewMode) {
  return normalizeScheduleViewMode(viewMode) === SCHEDULE_VIEW_COMPACT ? 2 : 1;
}

export function getScheduleNavigationDays(viewMode) {
  return getScheduleWeekCount(viewMode) * 7;
}

export function formatScheduleRangeLabel(startOfWeek, weekCount, referenceDate = new Date()) {
  const start = new Date(startOfWeek);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + (weekCount * 7) - 1);

  const startMonth = start.toLocaleString('default', { month: 'short' });
  const endMonth = end.toLocaleString('default', { month: 'short' });
  const startYearSuffix = start.getFullYear() !== referenceDate.getFullYear()
    ? `, ${start.getFullYear()}`
    : '';
  const endYearSuffix = end.getFullYear() !== referenceDate.getFullYear()
    ? `, ${end.getFullYear()}`
    : '';

  if (weekCount <= 1) {
    return `Week of ${startMonth} ${start.getDate()}${startYearSuffix}`;
  }

  if (startMonth === endMonth && start.getFullYear() === end.getFullYear()) {
    return `Weeks of ${startMonth} ${start.getDate()} – ${end.getDate()}${startYearSuffix}`;
  }

  return `Weeks of ${startMonth} ${start.getDate()}${startYearSuffix} – ${endMonth} ${end.getDate()}${endYearSuffix}`;
}
