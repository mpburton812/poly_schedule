/**
 * Avatar presets, custom photo crop, and picker UI bindings.
 */

export const DEFAULT_AVATARS = [
  'assets/images/icons/128/bird_blue.png',
  'assets/images/icons/128/bird_green.png',
  'assets/images/icons/128/bird_orange.png',
  'assets/images/icons/128/bird_purple.png',
  'assets/images/icons/128/bird_red.png',
  'assets/images/icons/128/bird_yellow.png'
];

/** Legacy Unsplash preset URLs replaced by local bird icons in v2 avatars. */
export const LEGACY_PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1552728080-b9153f7f9f9?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1501704778740-628eb39a9257?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1522926193345-9a711b0863f6?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1545249390-6bdfa286032f?w=150&auto=format&fit=crop&q=80'
];

export const AVATAR_OUTPUT_SIZE = 256;
export const AVATAR_JPEG_QUALITY = 0.85;
export const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const AVATAR_CROP_VIEWPORT = 220;

const BIRD_LABELS = ['Blue bird', 'Green bird', 'Orange bird', 'Purple bird', 'Red bird', 'Yellow bird'];

export function isCustomAvatar(url) {
  return typeof url === 'string' && url.startsWith('data:image/');
}

function legacyAvatarIndex(url) {
  if (!url || typeof url !== 'string') return -1;
  const exact = LEGACY_PRESET_AVATARS.indexOf(url);
  if (exact >= 0) return exact;
  const match = url.match(/photo-([\d]+-[a-f0-9]+)/i);
  if (!match) return -1;
  return LEGACY_PRESET_AVATARS.findIndex((legacy) => legacy.includes(match[1]));
}

/** Map legacy remote presets to local bird icons; preserve custom uploads. */
export function migrateAvatarUrl(avatar, fallbackIndex = 0) {
  if (isCustomAvatar(avatar)) return avatar;
  if (DEFAULT_AVATARS.includes(avatar)) return avatar;

  const legacyIndex = legacyAvatarIndex(avatar);
  if (legacyIndex >= 0) return DEFAULT_AVATARS[legacyIndex];

  if (typeof avatar === 'string' && avatar.includes('images.unsplash.com')) {
    return DEFAULT_AVATARS[fallbackIndex % DEFAULT_AVATARS.length];
  }

  if (!avatar) {
    return DEFAULT_AVATARS[fallbackIndex % DEFAULT_AVATARS.length];
  }

  return avatar;
}

export function resolveSelectedAvatar(url) {
  if (isCustomAvatar(url)) return { kind: 'custom', url };
  const presetIndex = DEFAULT_AVATARS.indexOf(url);
  if (presetIndex >= 0) return { kind: 'preset', url, presetIndex };
  if (url) return { kind: 'custom', url };
  return { kind: 'preset', url: DEFAULT_AVATARS[0], presetIndex: 0 };
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Please choose an image file (JPEG, PNG, etc.).'));
      return;
    }
    if (file.size > AVATAR_MAX_INPUT_BYTES) {
      reject(new Error('Image is too large. Please choose a file under 10 MB.'));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load that image. Try a different file.'));
    };
    image.src = objectUrl;
  });
}

export function createInitialCropState(image, viewportSize = AVATAR_CROP_VIEWPORT) {
  const baseScale = Math.max(viewportSize / image.width, viewportSize / image.height);
  return {
    viewportSize,
    baseScale,
    zoom: 1,
    offsetX: 0,
    offsetY: 0
  };
}

export function clampCropOffsets(state, image) {
  const scale = state.baseScale * state.zoom;
  const w = image.width * scale;
  const h = image.height * scale;
  const maxX = Math.max(0, (w - state.viewportSize) / 2);
  const maxY = Math.max(0, (h - state.viewportSize) / 2);
  state.offsetX = Math.min(maxX, Math.max(-maxX, state.offsetX));
  state.offsetY = Math.min(maxY, Math.max(-maxY, state.offsetY));
}

export function drawAvatarCropPreview(canvas, image, state) {
  const ctx = canvas.getContext('2d');
  const { viewportSize, baseScale, zoom, offsetX, offsetY } = state;
  const scale = baseScale * zoom;
  const w = image.width * scale;
  const h = image.height * scale;
  const cx = viewportSize / 2 + offsetX;
  const cy = viewportSize / 2 + offsetY;

  ctx.clearRect(0, 0, viewportSize, viewportSize);
  ctx.save();
  ctx.beginPath();
  ctx.arc(viewportSize / 2, viewportSize / 2, viewportSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

export function cropImageToCircle(image, state, outputSize = AVATAR_OUTPUT_SIZE) {
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = state.viewportSize;
  previewCanvas.height = state.viewportSize;
  drawAvatarCropPreview(previewCanvas, image, state);

  const out = document.createElement('canvas');
  out.width = outputSize;
  out.height = outputSize;
  const ctx = out.getContext('2d');
  ctx.drawImage(previewCanvas, 0, 0, outputSize, outputSize);
  return out.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);
}

export function renderCropPanelHtml(panelId) {
  return `
    <div id="${panelId}" class="avatar-crop-panel" hidden>
      <p class="avatar-crop-hint font-label-sm">Drag to position your photo in the circle. Use the slider to zoom in or out.</p>
      <div class="avatar-crop-stage">
        <canvas class="avatar-crop-canvas" width="${AVATAR_CROP_VIEWPORT}" height="${AVATAR_CROP_VIEWPORT}" aria-label="Photo crop preview"></canvas>
      </div>
      <label class="avatar-crop-zoom-label font-label-sm">
        Zoom
        <input type="range" class="avatar-crop-zoom" min="100" max="300" value="100" aria-label="Zoom photo"/>
      </label>
      <div class="avatar-crop-actions">
        <button type="button" class="btn btn-outline avatar-crop-cancel">Cancel</button>
        <button type="button" class="btn btn-filled avatar-crop-confirm">Use Photo</button>
      </div>
    </div>
  `;
}

function avatarOptionStyle(size, selected) {
  return `width: ${size}px; height: ${size}px; border-radius: var(--radius-full); overflow: hidden; border: 3px solid ${selected ? 'var(--primary)' : 'transparent'}; cursor: pointer; transition: all 0.2s;`;
}

export function renderAvatarPickerHtml(selectedUrl, containerId, options = {}) {
  const size = options.size || 56;
  const cropPanelId = options.cropPanelId || `${containerId}-crop`;
  const fileInputId = options.fileInputId || `${containerId}-file`;
  const selection = resolveSelectedAvatar(selectedUrl);

  const presetHtml = DEFAULT_AVATARS.map((av, idx) => {
    const isSelected = selection.kind === 'preset' && selection.presetIndex === idx;
    return `
      <button type="button" class="avatar-option ${isSelected ? 'selected' : ''}" data-url="${av}" style="${avatarOptionStyle(size, isSelected)}" aria-label="${BIRD_LABELS[idx]}">
        <img src="${av}" alt="${BIRD_LABELS[idx]}" style="width: 100%; height: 100%; object-fit: cover;"/>
      </button>
    `;
  }).join('');

  const customHtml = selection.kind === 'custom'
    ? `
      <button type="button" class="avatar-option avatar-custom-option selected" data-url="" style="${avatarOptionStyle(size, true)}" aria-label="Your photo">
        <img src="${selection.url}" alt="Your photo" style="width: 100%; height: 100%; object-fit: cover;"/>
      </button>
    `
    : '';

  return `
    <div class="avatar-picker-block">
      <div class="avatar-picker-row" id="${containerId}" data-crop-panel="${cropPanelId}" data-file-input="${fileInputId}">
        ${presetHtml}
        ${customHtml}
        <button type="button" class="avatar-option avatar-upload-tile" style="${avatarOptionStyle(size, false)}" aria-label="Upload photo from device">
          <span class="material-symbols-outlined" aria-hidden="true">add_a_photo</span>
        </button>
        <input type="file" id="${fileInputId}" accept="image/*" hidden/>
      </div>
      ${renderCropPanelHtml(cropPanelId)}
    </div>
  `;
}

function hideCropPanel(panel) {
  if (!panel) return;
  panel.hidden = true;
}

function showCropPanel(panel) {
  if (!panel) return;
  panel.hidden = false;
}

function clearPresetSelection(container) {
  container.querySelectorAll('.avatar-option[data-url]').forEach((opt) => {
    opt.classList.remove('selected');
    opt.style.borderColor = 'transparent';
  });
}

function ensureCustomOption(container, size) {
  let custom = container.querySelector('.avatar-custom-option');
  if (!custom) {
    custom = document.createElement('button');
    custom.type = 'button';
    custom.className = 'avatar-option avatar-custom-option';
    custom.setAttribute('aria-label', 'Your photo');
    custom.style.cssText = avatarOptionStyle(size, false);
    const img = document.createElement('img');
    img.alt = 'Your photo';
    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
    custom.appendChild(img);
    const upload = container.querySelector('.avatar-upload-tile');
    container.insertBefore(custom, upload);
  }
  return custom;
}

function bindCropPanel(panel, image, { onConfirm, onCancel }) {
  const canvas = panel.querySelector('.avatar-crop-canvas');
  const zoomInput = panel.querySelector('.avatar-crop-zoom');
  const btnConfirm = panel.querySelector('.avatar-crop-confirm');
  const btnCancel = panel.querySelector('.avatar-crop-cancel');
  const state = createInitialCropState(image);

  const redraw = () => drawAvatarCropPreview(canvas, image, state);

  const onZoom = () => {
    state.zoom = parseInt(zoomInput.value, 10) / 100;
    clampCropOffsets(state, image);
    redraw();
  };

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    state.offsetX += e.clientX - lastX;
    state.offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    clampCropOffsets(state, image);
    redraw();
  };

  const onPointerUp = (e) => {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  zoomInput.addEventListener('input', onZoom);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  const cleanup = () => {
    zoomInput.removeEventListener('input', onZoom);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
  };

  btnConfirm.addEventListener('click', () => {
    cleanup();
    onConfirm(cropImageToCircle(image, state));
  }, { once: true });

  btnCancel.addEventListener('click', () => {
    cleanup();
    onCancel();
  }, { once: true });

  zoomInput.value = '100';
  state.zoom = 1;
  state.offsetX = 0;
  state.offsetY = 0;
  redraw();
}

/**
 * Bind preset, upload, and inline crop UI for an avatar picker row.
 * @returns {() => string} getter for the selected avatar URL
 */
export function bindAvatarPicker(containerSelector, options = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) return () => options.initialUrl || DEFAULT_AVATARS[0];

  const block = container.closest('.avatar-picker-block');
  const cropPanelId = container.dataset.cropPanel;
  const fileInputId = container.dataset.fileInput;
  const cropPanel = block?.querySelector(`#${cropPanelId}`) || document.getElementById(cropPanelId);
  const fileInput = block?.querySelector(`#${fileInputId}`) || document.getElementById(fileInputId);
  const size = options.size || parseInt(container.querySelector('.avatar-option')?.style.width, 10) || 56;

  const initial = resolveSelectedAvatar(options.initialUrl || container.querySelector('.avatar-option.selected')?.dataset.url);
  let selected = initial.kind === 'custom' ? initial.url : (initial.url || DEFAULT_AVATARS[0]);

  const selectPreset = (opt) => {
    clearPresetSelection(container);
    const custom = container.querySelector('.avatar-custom-option');
    if (custom) {
      custom.classList.remove('selected');
      custom.style.borderColor = 'transparent';
    }
    opt.classList.add('selected');
    opt.style.borderColor = 'var(--primary)';
    selected = opt.dataset.url;
    hideCropPanel(cropPanel);
    options.onSelect?.(selected);
  };

  const selectCustom = (opt, dataUrl) => {
    clearPresetSelection(container);
    opt.classList.add('selected');
    opt.style.borderColor = 'var(--primary)';
    opt.dataset.url = dataUrl;
    opt.querySelector('img').src = dataUrl;
    selected = dataUrl;
    hideCropPanel(cropPanel);
    options.onSelect?.(selected);
  };

  container.querySelectorAll('.avatar-option[data-url]').forEach((opt) => {
    opt.addEventListener('click', () => selectPreset(opt));
  });

  const existingCustom = container.querySelector('.avatar-custom-option');
  if (existingCustom) {
    existingCustom.addEventListener('click', () => {
      if (existingCustom.dataset.url) selectCustom(existingCustom, existingCustom.dataset.url);
    });
    if (initial.kind === 'custom') existingCustom.dataset.url = initial.url;
  }

  container.querySelector('.avatar-upload-tile')?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const image = await loadImageFromFile(file);
      showCropPanel(cropPanel);
      bindCropPanel(cropPanel, image, {
        onConfirm: (dataUrl) => {
          hideCropPanel(cropPanel);
          const custom = ensureCustomOption(container, size);
          selectCustom(custom, dataUrl);
        },
        onCancel: () => hideCropPanel(cropPanel)
      });
    } catch (err) {
      options.onError?.(err.message || 'Could not load image.');
    }
  });

  return () => selected;
}
