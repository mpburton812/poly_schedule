import { escapeHtml } from '../escape.js';
import { LOGS_STORAGE_KEY } from '../storage-keys.js';
import { formatAppTime } from '../helpers.js';
import { state, flowState } from './state.js';
import { CalendarSync } from '../calendar.js';
import {
  persistChangeLog,
  refreshChangeLogDom,
  migrateChangeLog,
  recordPromotionIfNeeded,
  isPromotionGroup
} from '../change-log.js';

const SYSTEM_LOG_PREFIXES = ['Sync:', 'Admin settings', 'Application initialized'];
const MAX_LOCAL_LOGS = 200;
const MAX_HOUSEHOLD_LOGS = 200;
let householdLogSyncTimer = null;

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

export function isAlertLogEntry(log) {
  return log?.type === 'error' || log?.type === 'warning';
}

export function classifyLogEntry(log) {
  if (isAlertLogEntry(log)) return 'alerts';
  if (isUserLogEntry(log)) return 'user';
  return 'system';
}

export function filterLogsByCategory(logs = [], filter = 'all') {
  if (!filter || filter === 'all') return logs;
  return logs.filter((log) => classifyLogEntry(log) === filter);
}

function logEntryKey(log) {
  return `${log.timestamp || 0}:${log.message || ''}`;
}

function mergeOperationLogLists(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const entry of list || []) {
      if (!entry?.message) continue;
      merged.set(logEntryKey(entry), entry);
    }
  }
  return Array.from(merged.values())
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .slice(-MAX_HOUSEHOLD_LOGS);
}

export function appendOperationLogToConfig(config, entry) {
  if (!config || !entry) return;
  if (!Array.isArray(config.operationLogs)) config.operationLogs = [];
  config.operationLogs.push(entry);
  if (config.operationLogs.length > MAX_HOUSEHOLD_LOGS) {
    config.operationLogs = config.operationLogs.slice(-MAX_HOUSEHOLD_LOGS);
  }
}

export function hydrateOperationLogsFromConfig(config) {
  const householdLogs = Array.isArray(config?.operationLogs) ? config.operationLogs : [];
  const localLogs = loadPersistedLogs();
  state.logs = mergeOperationLogLists(householdLogs, localLogs);
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(state.logs));
  if (config) {
    config.operationLogs = [...state.logs];
  }
  refreshOperationLogDom();
}

function scheduleHouseholdOperationLogSync() {
  if (!state.config) return;
  if (householdLogSyncTimer) clearTimeout(householdLogSyncTimer);
  householdLogSyncTimer = setTimeout(() => {
    householdLogSyncTimer = null;
    void persistHouseholdOperationLogs();
  }, 1500);
}

async function persistHouseholdOperationLogs() {
  if (!state.config) return;
  try {
    const { bumpSyncRevision } = await import('../household-sync.js');
    const { CalendarSync } = await import('../calendar.js');
    bumpSyncRevision(state.config);
    await CalendarSync.saveConfig(state.config);
    state.config = CalendarSync.config;
  } catch (err) {
    console.warn('[logs] Failed to sync operational log to household config', err);
  }
}

export function refreshOperationLogDom() {
  if (typeof document === 'undefined') return;
  const filter = flowState.adminLogFilter || 'all';
  const html = renderSystemLogHtml(filterLogsByCategory(state.logs, filter));
  document.querySelectorAll('#console-logs-body').forEach((consoleBody) => {
    consoleBody.innerHTML = html;
    consoleBody.scrollTop = consoleBody.scrollHeight;
  });
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
  if (state.logs.length > MAX_LOCAL_LOGS) state.logs.shift();
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(state.logs));

  if (state.config) {
    appendOperationLogToConfig(state.config, entry);
    scheduleHouseholdOperationLogSync();
  }

  if (typeof document !== 'undefined') {
    const filter = flowState.adminLogFilter || 'all';
    if (filter === 'all' || classifyLogEntry(entry) === filter) {
      const lineHtml = renderSystemLogLine(entry);
      document.querySelectorAll('#console-logs-body').forEach((consoleBody) => {
        const empty = consoleBody.querySelector('.system-log-empty');
        if (empty) empty.remove();
        consoleBody.insertAdjacentHTML('beforeend', lineHtml);
        consoleBody.scrollTop = consoleBody.scrollHeight;
      });
    }
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
