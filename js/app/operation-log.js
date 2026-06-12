import { escapeHtml } from '../escape.js';
import { LOGS_STORAGE_KEY } from '../storage-keys.js';
import { formatAppTime } from '../helpers.js';
import { state } from './state.js';
import { CalendarSync } from '../calendar.js';
import {
  persistChangeLog,
  refreshChangeLogDom,
  migrateChangeLog,
  recordPromotionIfNeeded,
  isPromotionGroup
} from '../change-log.js';

export function loadPersistedLogs() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function addLog(message, type = 'info', meta = null) {
  const time = formatAppTime();
  const entry = { time, message, type, timestamp: Date.now(), ...(meta || {}) };
  state.logs.push(entry);
  if (state.logs.length > 100) state.logs.shift();
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(state.logs));

  if (typeof document !== 'undefined') {
    const consoleBodies = document.querySelectorAll('#console-logs-body');
    consoleBodies.forEach(consoleBody => {
      const p = document.createElement('p');
      p.className = 'console-line';
      const color = type === 'error' ? 'var(--error)' : type === 'warning' ? 'var(--tertiary)' : 'inherit';
      p.innerHTML = `<span class="console-time">[${escapeHtml(time)}]</span> <span style="color: ${color};">${escapeHtml(message)}</span>`;
      consoleBody.appendChild(p);
      consoleBody.scrollTop = consoleBody.scrollHeight;
    });
  }
}

export function buildOperationSupportContext(context = {}) {
  return {
    user: state.currentUser?.name || 'User',
    syncMode: CalendarSync.mode || (state.isOffline ? 'offline' : 'unknown'),
    view: state.currentView,
    route: typeof window !== 'undefined' ? (window.location.hash || window.location.pathname) : '',
    ...context
  };
}

export function logOperationError(operation, err, context = {}) {
  const error = err instanceof Error ? err : new Error(String(err ?? 'Unknown error'));
  const support = buildOperationSupportContext(context);
  const detailParts = [`error=${error.message}`];

  if (error.name && error.name !== 'Error') {
    detailParts.push(`type=${error.name}`);
  }
  if (error.status) {
    detailParts.push(`httpStatus=${error.status}`);
  }
  if (error.code) {
    detailParts.push(`code=${error.code}`);
  }
  Object.entries(support).forEach(([key, value]) => {
    if (value == null || value === '') return;
    detailParts.push(`${key}=${String(value)}`);
  });
  if (error.stack) {
    detailParts.push(`stack=${error.stack.split('\n').slice(1, 4).map(line => line.trim()).join(' | ')}`);
  }

  const message = `${operation} failed · ${detailParts.join(' · ')}`;
  addLog(message, 'error', {
    operation,
    errorMessage: error.message,
    errorName: error.name,
    support,
    stack: error.stack || null
  });
  console.error(`[${operation}]`, error, support);
  return message;
}

export function logUserAction(message, type = 'info') {
  addLog(`${state.currentUser?.name || 'User'}: ${message}`, type);
}

export function initChangeLog() {
  if (!state.changeLog?.length) return;
  if (state.changeLog.some(isPromotionGroup)) return;
  state.changeLog = migrateChangeLog(state.changeLog);
  persistChangeLog(state.changeLog);
}

export async function syncPromotionChangeLog() {
  try {
    const [versionRes, notesRes] = await Promise.all([
      fetch('version.json'),
      fetch('release-notes.json')
    ]);
    if (!versionRes.ok) return;
    const versionInfo = await versionRes.json();
    const releaseNotes = notesRes.ok ? await notesRes.json() : {};
    if (recordPromotionIfNeeded(state.changeLog, versionInfo, releaseNotes)) {
      persistChangeLog(state.changeLog);
      refreshChangeLogDom(state.changeLog);
    }
  } catch (err) {
    console.warn('Could not sync promotion change log', err);
  }
}

