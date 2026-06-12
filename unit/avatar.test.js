import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATARS,
  LEGACY_PRESET_AVATARS,
  isCustomAvatar,
  migrateAvatarUrl,
  resolveSelectedAvatar,
  createInitialCropState,
  clampCropOffsets
} from '../js/avatar.js';

describe('DEFAULT_AVATARS', () => {
  it('points at local 128px bird icons', () => {
    expect(DEFAULT_AVATARS).toHaveLength(6);
    expect(DEFAULT_AVATARS[0]).toContain('assets/images/icons/128/bird_blue.png');
    expect(DEFAULT_AVATARS[3]).toContain('bird_purple.png');
  });
});

describe('isCustomAvatar', () => {
  it('detects data URLs', () => {
    expect(isCustomAvatar('data:image/jpeg;base64,abc')).toBe(true);
    expect(isCustomAvatar('assets/images/icons/128/bird_blue.png')).toBe(false);
  });
});

describe('migrateAvatarUrl', () => {
  it('maps legacy Unsplash presets to local bird icons by index', () => {
    expect(migrateAvatarUrl(LEGACY_PRESET_AVATARS[1], 0)).toBe(DEFAULT_AVATARS[1]);
    expect(migrateAvatarUrl(LEGACY_PRESET_AVATARS[3], 0)).toBe(DEFAULT_AVATARS[3]);
  });

  it('preserves custom uploads and current presets', () => {
    const custom = 'data:image/jpeg;base64,abc';
    expect(migrateAvatarUrl(custom, 0)).toBe(custom);
    expect(migrateAvatarUrl(DEFAULT_AVATARS[2], 0)).toBe(DEFAULT_AVATARS[2]);
  });
});

describe('resolveSelectedAvatar', () => {
  it('resolves preset and custom selections', () => {
    const preset = resolveSelectedAvatar(DEFAULT_AVATARS[1]);
    expect(preset.kind).toBe('preset');
    expect(preset.presetIndex).toBe(1);

    const custom = resolveSelectedAvatar('data:image/jpeg;base64,x');
    expect(custom.kind).toBe('custom');
  });

  it('defaults to first preset when empty', () => {
    const fallback = resolveSelectedAvatar('');
    expect(fallback.kind).toBe('preset');
    expect(fallback.presetIndex).toBe(0);
  });
});

describe('createInitialCropState', () => {
  it('computes cover scale for crop viewport', () => {
    const state = createInitialCropState({ width: 800, height: 600 }, 220);
    expect(state.baseScale).toBeCloseTo(220 / 600, 5);
    expect(state.zoom).toBe(1);
  });

  it('clamps pan offsets within image bounds', () => {
    const image = { width: 800, height: 600 };
    const state = createInitialCropState(image, 220);
    state.offsetX = 500;
    state.offsetY = -500;
    clampCropOffsets(state, image);
    expect(Math.abs(state.offsetX)).toBeLessThan(500);
    expect(Math.abs(state.offsetY)).toBeLessThan(500);
  });
});
