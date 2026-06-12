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

const SYSTEM_LOG_PREFIXES = ['Sync:', 'Admin settings', 'Application initialized'];

export function loadPersistedLogs() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function isUserLogEntry(log) {
  if (!log) return false;
  if (log.userEvent) return true;
  if (log.user) return true;
  const msg = log.message || '';
  if (!msg.includes(': ') || msg.includes(' failed · ')) return false;
  if (SYSTEM_LOG_PREFIXES.some((prefix) => msg.startsWith(prefix))) return false;
  const prefix = msg.split(': ')[0];
  return prefix.length > 0 && prefix.length < 80;
}

export function renderSystemLogLine(log) {
  const time = escapeHtml(log.time);
  const message = escapeHtml(log.message);
  const isUser = isUserLogEntry(log);
  const userClass = isUser ? ' console-line--user' : '';
  let styleAttr = '';
  if (!isUser) {
    const color = log.type === 'error' ? 'var(--error)' : log.type === 'warning' ? 'var(--tertiary)' : 'inherit';
    if (color !== 'inherit') {
      styleAttr = ` style="color: ${color};"`;
    }
  }
  return `<p class="console-line${userClass}"><span class="console-time">[${time}]</span> <span class="system-log-message"${styleAttr}>${message}</span></p>`;
}

export function renderSystemLogHtml(logs = []) {
  if (!logs.length) {
    return '<p class="console-line system-log-empty">No system events logged yet.</p>';
  }
  return logs.map(renderSystemLogLine).join('');
}

export function addLog(message, type = 'info', meta = null) {
  const time = formatAppTime();
  const entry = { time, message, type, timestamp: Date.now(), ...(meta || {}) };
  state.logs.push(entry);
  if (state.logs.length > 100) state.logs.shift();
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(state.logs));

  if (typeof document !== 'undefined') {
    const lineHtml = renderSystemLogLine(entry);
    document.querySelectorAll('#console-logs-body').forEach((consoleBody) => {
      consoleBody.insertAdjacentHTML('beforeend', lineHtml);
      consoleBody.scrollTop = consoleBody.scrollHeight;
    });
  }
}

export function buildOperationSupportContext(context = {}) {
  return {
    user: state.currentUser?.name || 'User',
    syncMode: CalendarSync.mode || state.calendarStatus || 'unknown',
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

export function logUserAction(message, type = 'info', userName = null) {
  const user = userName || state.currentUser?.name || 'User';
  addLog(`${user}: ${message}`, type, { userEvent: true, user });
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

