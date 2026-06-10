/**
 * Change control log grouped by dev promotion (version.json commit).
 */

import { CHANGE_LOG_STORAGE_KEY, formatAppDateTime } from './helpers.js';

export const PROMOTION_KEY_STORAGE = 'polyschedule_active_promotion_key';

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

/** Normalize legacy flat entries into promotion groups. */
export function migrateChangeLog(raw) {
  if (!Array.isArray(raw) || !raw.length) return [];
  if (raw.some(isPromotionGroup)) return raw;

  return [{
    type: 'promotion',
    id: 'legacy',
    branch: 'legacy',
    commit: '—',
    summary: 'Earlier changes (before promotion grouping)',
    promotedAt: raw[raw.length - 1]?.timestamp || Date.now(),
    entries: raw.map((e) => ({
      time: e.time,
      actor: e.actor || 'System',
      action: e.action,
      detail: e.detail || '',
      timestamp: e.timestamp || Date.now()
    }))
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
    summary: meta.summary || `Promotion ${meta.commit || promotionId}`,
    promotedAt: meta.promotedAt || new Date().toISOString(),
    entries: Array.isArray(meta.seedChanges) ? meta.seedChanges : []
  };
  changeLog.unshift(group);
  return group;
}

/**
 * Register a new dev promotion when version.json commit changes.
 * @returns {boolean} true when a new promotion was recorded
 */
function resolveReleaseNote(releaseNotes, versionInfo) {
  if (!releaseNotes || !versionInfo?.commit) return null;
  return releaseNotes[versionInfo.commit] || releaseNotes.latest || null;
}

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
  const seedChanges = (releaseNote?.changes || []).map((text) => ({
    time: formatAppDateTime(new Date()),
    actor: 'Release',
    action: text,
    detail: '',
    timestamp: Date.now()
  }));

  ensurePromotionGroup(changeLog, promotionId, {
    branch: versionInfo.branch,
    commit: versionInfo.commit,
    summary: releaseNote?.summary || `Build ${versionInfo.commit} on ${versionInfo.branch}`,
    promotedAt: new Date().toISOString(),
    seedChanges
  });

  setActivePromotionKey(promotionId);
  return true;
}

export function appendChangeEntry(changeLog, entry) {
  const promotionId = getActivePromotionKey();
  const group = ensurePromotionGroup(changeLog, promotionId, {
    branch: promotionId.split('#')[0] || 'dev',
    commit: promotionId.split('#')[1] || '—',
    summary: promotionId === 'legacy' ? 'Earlier changes' : `Promotion ${promotionId.split('#')[1]}`
  });
  group.entries.unshift(entry);
  if (group.entries.length > 100) group.entries.pop();
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
    return '<p class="change-log-line change-log-empty">No configuration changes recorded yet.</p>';
  }

  return groups.map((group) => {
    const promoted = formatAppDateTime(group.promotedAt);
    const entries = (group.entries || []).map((entry) => `
      <p class="change-log-line change-log-entry">
        <span class="change-log-time">[${entry.time}]</span>
        <strong>${entry.actor}</strong>: ${entry.action}${entry.detail ? ` — ${entry.detail}` : ''}
      </p>
    `).join('') || '<p class="change-log-line change-log-empty">No changes recorded for this promotion yet.</p>';

    return `
      <section class="change-log-promotion">
        <h4 class="change-log-promotion-title">${group.summary}</h4>
        <p class="change-log-promotion-meta">${group.branch} · ${group.commit} · promoted ${promoted}</p>
        <div class="change-log-promotion-entries">${entries}</div>
      </section>
    `;
  }).join('');
}
