/**
 * Partner pronoun presets, normalization, and sentence helpers.
 */

import { findPartnerByRef, partnerDisplayFirstName } from './helpers.js';

export const DEFAULT_PRONOUN_PRESET = 'they/them';

export const PRONOUN_PRESETS = {
  'she/her': { subject: 'she', object: 'her', possessive: 'her' },
  'he/him': { subject: 'he', object: 'him', possessive: 'his' },
  'they/them': { subject: 'they', object: 'them', possessive: 'their' },
  'ze/zir': { subject: 'ze', object: 'zir', possessive: 'zir' },
  'xe/xem': { subject: 'xe', object: 'xem', possessive: 'xyr' },
  'fae/faer': { subject: 'fae', object: 'faer', possessive: 'faer' },
  'ey/em': { subject: 'ey', object: 'em', possessive: 'eir' }
};

export function normalizePronouns(pronouns) {
  if (!pronouns) {
    return { preset: DEFAULT_PRONOUN_PRESET, ...PRONOUN_PRESETS[DEFAULT_PRONOUN_PRESET] };
  }

  if (typeof pronouns === 'string' && PRONOUN_PRESETS[pronouns]) {
    return { preset: pronouns, ...PRONOUN_PRESETS[pronouns] };
  }

  const preset = pronouns.preset || DEFAULT_PRONOUN_PRESET;
  if (preset !== 'custom' && PRONOUN_PRESETS[preset]) {
    return { preset, ...PRONOUN_PRESETS[preset] };
  }

  return {
    preset: 'custom',
    subject: (pronouns.subject || 'they').trim(),
    object: (pronouns.object || 'them').trim(),
    possessive: (pronouns.possessive || 'their').trim()
  };
}

export function getPartnerPronouns(config, partnerRef) {
  const partner = findPartnerByRef(config, partnerRef);
  return normalizePronouns(partner?.pronouns);
}

export function partnerSubject(config, partnerRef) {
  return getPartnerPronouns(config, partnerRef).subject;
}

export function partnerObject(config, partnerRef) {
  return getPartnerPronouns(config, partnerRef).object;
}

export function partnerPossessive(config, partnerRef) {
  return getPartnerPronouns(config, partnerRef).possessive;
}

export function capitalizePronoun(word = '') {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Present-tense "is" / "are" for subject pronoun (they → are). */
export function pronounVerbBe(subject = '') {
  return String(subject).trim().toLowerCase() === 'they' ? 'are' : 'is';
}

export function partnerSubjectCap(config, partnerRef) {
  return capitalizePronoun(partnerSubject(config, partnerRef));
}

export function partnerVerbBe(config, partnerRef) {
  return pronounVerbBe(partnerSubject(config, partnerRef));
}

export function partnerFirstName(config, partnerRef) {
  const partner = findPartnerByRef(config, partnerRef);
  return partnerDisplayFirstName(partner?.name || partnerRef);
}

export function partnerSleepingWithMessage(config, pA, pB, nightsTogether, limit, kind) {
  const firstA = partnerFirstName(config, pA);
  const firstB = partnerFirstName(config, pB);
  const verb = 'is';
  const objB = partnerObject(config, pB);
  const posA = partnerPossessive(config, pA);
  if (kind === 'max') {
    return `${firstA} ${verb} sleeping with ${firstB} for ${nightsTogether} nights, which exceeds ${posA} preferred limit of ${limit.max} nights/week with ${objB}.`;
  }
  return `${firstA} ${verb} sleeping with ${firstB} for ${nightsTogether} nights, which is below ${posA} preferred limit of ${limit.min} nights/week with ${objB}.`;
}

export function partnerSoloNightsMessage(config, pA, soloNights, minSoloNights) {
  const firstA = partnerFirstName(config, pA);
  const verb = 'is';
  const posA = partnerPossessive(config, pA);
  return `${firstA} ${verb} sleeping alone for ${soloNights} nights, which is below ${posA} preferred minimum of ${minSoloNights} solo nights/week.`;
}

export function renderPronounPickerHtml(partner) {
  const normalized = normalizePronouns(partner?.pronouns);
  const isCustom = normalized.preset === 'custom';
  const options = Object.keys(PRONOUN_PRESETS).map((key) =>
    `<option value="${key}" ${normalized.preset === key ? 'selected' : ''}>${key}</option>`
  ).join('');

  return `
    <div class="pronoun-picker" id="profile-pronoun-picker">
      <div class="form-group" style="margin-bottom: 0;">
        <label class="form-label" for="setting-pronouns-preset" style="font-size: 0.8rem;">Pronouns</label>
        <select class="form-input" id="setting-pronouns-preset" style="padding: 6px 12px; font-size: 0.85rem;">
          ${options}
          <option value="custom" ${isCustom ? 'selected' : ''}>Custom…</option>
        </select>
      </div>
      <div id="pronouns-custom-fields" class="pronouns-custom-fields" ${isCustom ? '' : 'hidden'}>
        <div class="grid grid-cols-3 gap-md" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-sm); margin-top: var(--space-sm);">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="pronoun-subject" style="font-size: 0.75rem;">Subject</label>
            <input class="form-input" id="pronoun-subject" type="text" placeholder="they" value="${isCustom ? normalized.subject : ''}" style="padding: 6px 10px; font-size: 0.85rem;"/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="pronoun-object" style="font-size: 0.75rem;">Object</label>
            <input class="form-input" id="pronoun-object" type="text" placeholder="them" value="${isCustom ? normalized.object : ''}" style="padding: 6px 10px; font-size: 0.85rem;"/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="pronoun-possessive" style="font-size: 0.75rem;">Possessive</label>
            <input class="form-input" id="pronoun-possessive" type="text" placeholder="their" value="${isCustom ? normalized.possessive : ''}" style="padding: 6px 10px; font-size: 0.85rem;"/>
          </div>
        </div>
      </div>
      <p class="pronouns-preview font-label-sm" id="pronouns-preview" style="color: var(--on-surface-variant); margin: var(--space-xs) 0 0;"></p>
    </div>
  `;
}

export function readPronounsFromForm(container = document) {
  const preset = container.querySelector('#setting-pronouns-preset')?.value || DEFAULT_PRONOUN_PRESET;
  if (preset !== 'custom') {
    return normalizePronouns({ preset });
  }

  const subject = container.querySelector('#pronoun-subject')?.value.trim();
  const object = container.querySelector('#pronoun-object')?.value.trim();
  const possessive = container.querySelector('#pronoun-possessive')?.value.trim();

  if (!subject || !object || !possessive) {
    return null;
  }

  return normalizePronouns({ preset: 'custom', subject, object, possessive });
}

export function bindPronounPicker(container, { displayNameInput } = {}) {
  const presetSelect = container.querySelector('#setting-pronouns-preset');
  const customFields = container.querySelector('#pronouns-custom-fields');
  const preview = container.querySelector('#pronouns-preview');
  const customInputs = ['#pronoun-subject', '#pronoun-object', '#pronoun-possessive']
    .map((sel) => container.querySelector(sel))
    .filter(Boolean);

  const refreshPreview = () => {
    if (!preview) return;
    const name = displayNameInput?.value.trim() || 'Alex';
    const first = name.split(' ')[0];
    const pronouns = readPronounsFromForm(container);
    if (!pronouns) {
      preview.textContent = 'Enter subject, object, and possessive forms for custom pronouns.';
      return;
    }
    const sub = capitalizePronoun(pronouns.subject);
    const verb = pronounVerbBe(pronouns.subject);
    preview.textContent = `Example: ${first} updated ${pronouns.possessive} schedule. ${sub} ${verb} ready to review it.`;
  };

  const toggleCustom = () => {
    const isCustom = presetSelect?.value === 'custom';
    if (customFields) customFields.hidden = !isCustom;
    if (isCustom && customInputs.length) {
      const fallback = normalizePronouns({ preset: DEFAULT_PRONOUN_PRESET });
      if (!container.querySelector('#pronoun-subject')?.value) {
        container.querySelector('#pronoun-subject').value = fallback.subject;
        container.querySelector('#pronoun-object').value = fallback.object;
        container.querySelector('#pronoun-possessive').value = fallback.possessive;
      }
    }
    refreshPreview();
  };

  presetSelect?.addEventListener('change', toggleCustom);
  customInputs.forEach((input) => input.addEventListener('input', refreshPreview));
  displayNameInput?.addEventListener('input', refreshPreview);
  toggleCustom();

  return () => readPronounsFromForm(container);
}
