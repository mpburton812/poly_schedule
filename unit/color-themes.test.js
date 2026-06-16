import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
  return { local };
});

describe('color themes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizes unknown theme ids to cinnamon', async () => {
    const { normalizeColorThemeId } = await import('../js/color-themes.js');
    expect(normalizeColorThemeId('mint')).toBe('mint');
    expect(normalizeColorThemeId('invalid')).toBe('cinnamon');
  });

  it('persists and applies a selected theme', async () => {
    const { saveColorTheme, loadStoredColorTheme } = await import('../js/color-themes.js');
    saveColorTheme('blueberry');
    expect(loadStoredColorTheme()).toBe('blueberry');
    if (typeof document !== 'undefined') {
      expect(document.documentElement.dataset.colorTheme).toBe('blueberry');
    }
  });
});
