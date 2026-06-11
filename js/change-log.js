import {
  PROMOTION_KEY_STORAGE
} from './storage-keys.js';
/**
 * Build promotion audit trail (version.json + release-notes.json).
 */

import { CHANGE_LOG_STORAGE_KEY, formatAppDateTime } from './helpers.js';

export const PROMOTION_KEY_STORAGE = PROMOTION_KEY_STORAGE;

function getStorage() {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch {
    // unavailable in some test runtimes
  }
  return null;
}

export function isPromotionGroup(entry) {
  return entry?.type === 'promotion';
}

function normalizeChanges(group) {
  if (Array.isArray(group.changes) && group.changes.length) return group.changes;
  if (!Array.isArray(group.entries)) return [];
  return group.entries.map((entry) => {
    const detail = entry.detail ? ` — ${entry.detail}` : '';
    return `${entry.action || ''}${detail}`.trim();
  }).filter(Boolean);
}

/** Normalize legacy flat entries and user-action logs into promotion groups. */
export function migrateChangeLog(raw) {
  if (!Array.isArray(raw) || !raw.length) return [];
  if (raw.some(isPromotionGroup)) {
    return raw.map((group) => ({
      ...group,
      changes: normalizeChanges(group)
    }));
  }

  return [{
    type: 'promotion',
    id: 'legacy',
    branch: 'legacy',
    commit: '—',
    summary: 'Earlier releases',
    promotedAt: raw[raw.length - 1]?.timestamp || Date.now(),
    changes: raw.map((entry) => {
      const detail = entry.detail ? ` — ${entry.detail}` : '';
      return `${entry.action || ''}${detail}`.trim();
    }).filter(Boolean)
  }];
}

export function getActivePromotionKey() {
  return getStorage()?.getItem(PROMOTION_KEY_STORAGE) || 'legacy';
}

export function setActivePromotionKey(key) {
  getStorage()?.setItem(PROMOTION_KEY_STORAGE, key);
}

export function findPromotionGroup(changeLog, promotionId) {
  return (changeLog || []).find((g) => isPromotionGroup(g) && g.id === promotionId);
}

export function ensurePromotionGroup(changeLog, promotionId, meta = {}) {
  let group = findPromotionGroup(changeLog, promotionId);
  if (group) return group;

  group = {
    type: 'promotion',
    id: promotionId,
    branch: meta.branch || 'dev',
    commit: meta.commit || '—',
    summary: meta.summary || `Build ${meta.commit || promotionId}`,
    promotedAt: meta.promotedAt || new Date().toISOString(),
    changes: Array.isArray(meta.changes) ? meta.changes : []
  };
  changeLog.unshift(group);
  return group;
}

function resolveReleaseNote(releaseNotes, versionInfo) {
  if (!releaseNotes || !versionInfo?.commit) return null;
  return releaseNotes[versionInfo.commit] || releaseNotes.latest || null;
}

/**
 * Register a new build promotion when version.json commit changes.
 * @returns {boolean} true when a new promotion was recorded
 */
export function recordPromotionIfNeeded(changeLog, versionInfo, releaseNotes = null) {
  if (!versionInfo?.commit) return false;

  const promotionId = `${versionInfo.branch || 'dev'}#${versionInfo.commit}`;
  const lastKey = getStorage()?.getItem(PROMOTION_KEY_STORAGE);

  if (lastKey === promotionId && findPromotionGroup(changeLog, promotionId)) {
    return false;
  }

  if (findPromotionGroup(changeLog, promotionId)) {
    setActivePromotionKey(promotionId);
    return false;
  }

  const releaseNote = resolveReleaseNote(releaseNotes, versionInfo);

  ensurePromotionGroup(changeLog, promotionId, {
    branch: versionInfo.branch,
    commit: versionInfo.commit,
    summary: releaseNote?.summary || `Build ${versionInfo.commit} on ${versionInfo.branch}`,
    promotedAt: new Date().toISOString(),
    changes: releaseNote?.changes || []
  });

  setActivePromotionKey(promotionId);
  return true;
}

export function persistChangeLog(changeLog) {
  getStorage()?.setItem(CHANGE_LOG_STORAGE_KEY, JSON.stringify(changeLog));
}

export function refreshChangeLogDom(changeLog) {
  if (typeof document === 'undefined') return;
  const html = renderChangeLogHtml(changeLog);
  document.querySelectorAll('#change-log-body').forEach((body) => {
    body.innerHTML = html;
  });
}

export function renderChangeLogHtml(changeLog) {
  const groups = migrateChangeLog(changeLog);
  if (!groups.length) {
    return '<p class="change-log-line change-log-empty">No releases recorded yet.</p>';
  }

  return groups.map((group) => {
    const promoted = formatAppDateTime(group.promotedAt);
    const changes = normalizeChanges(group);
    const notesHtml = changes.length
      ? `<ul class="change-log-notes">${changes.map((line) => `<li>${line}</li>`).join('')}</ul>`
      : '<p class="change-log-line change-log-empty">No release notes for this build.</p>';

    return `
      <section class="change-log-promotion">
        <h4 class="change-log-promotion-title">${group.summary}</h4>
        <p class="change-log-promotion-meta">Build ${group.commit} · ${group.branch} · ${promoted}</p>
        <div class="change-log-promotion-entries">${notesHtml}</div>
      </section>
    `;
  }).join('');
}
