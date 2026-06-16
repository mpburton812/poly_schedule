import { COLOR_THEME_KEY } from './storage-keys.js';

export const COLOR_THEME_IDS = ['cinnamon', 'mint', 'blueberry', 'sunflower'];

export const COLOR_THEME_LABELS = {
  cinnamon: 'Cinnamon',
  mint: 'Mint',
  blueberry: 'Blueberry',
  sunflower: 'Sunflower'
};

const DEFAULT_THEME = 'cinnamon';

export function normalizeColorThemeId(themeId) {
  return COLOR_THEME_IDS.includes(themeId) ? themeId : DEFAULT_THEME;
}

export function loadStoredColorTheme() {
  try {
    return normalizeColorThemeId(localStorage.getItem(COLOR_THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyColorTheme(themeId = loadStoredColorTheme()) {
  const normalized = normalizeColorThemeId(themeId);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.colorTheme = normalized;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors = {
        cinnamon: '#a6393a',
        mint: '#006a62',
        blueberry: '#4a5fc1',
        sunflower: '#8a6900'
      };
      meta.setAttribute('content', colors[normalized] || colors.cinnamon);
    }
  }

  return normalized;
}

export function saveColorTheme(themeId) {
  const normalized = normalizeColorThemeId(themeId);
  localStorage.setItem(COLOR_THEME_KEY, normalized);
  applyColorTheme(normalized);
  return normalized;
}

export function renderColorThemePickerHtml(activeTheme = loadStoredColorTheme()) {
  const theme = normalizeColorThemeId(activeTheme);
  return COLOR_THEME_IDS.map((themeId) => `
    <button type="button" class="theme-swatch${theme === themeId ? ' active' : ''}" data-color-theme="${themeId}" aria-pressed="${theme === themeId}">
      <span class="theme-swatch-color theme-swatch-color--${themeId}" aria-hidden="true"></span>
      <span>
        <strong class="font-label-md" style="display: block;">${COLOR_THEME_LABELS[themeId]}</strong>
      </span>
    </button>
  `).join('');
}
