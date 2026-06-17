import {
  CLIENT_ID_KEY,
  API_KEY_KEY,
  CALENDAR_ID_KEY
} from '../storage-keys.js';
/**
 * Shared modal dialogs.
 */

import { AuthManager } from '../auth.js';
import { CalendarSync } from '../calendar.js';
import { renderAvatarPickerHtml } from '../avatar.js';
import { state, flowState } from './state.js';
import { LOCAL_SESSION_KEY } from '../storage-keys.js';
import { logUserAction, logOperationError, showToast, updateNotificationsBadge, logoutUser, getCurrentUserName, updatePartnerProfile, persistCurrentUserNotifications, pushAppNotification } from './context.js';
import { getCurrentUserPartner, formatAppDateTime, normalizeEmail } from '../helpers.js';
import { renderPronounPickerHtml, bindPronounPicker } from '../pronouns.js';
import { escapeHtml } from '../escape.js';
import { loadStoredColorTheme, renderColorThemePickerHtml } from '../color-themes.js';
import { getEventDisplayPolicy } from '../event-privacy.js';
import { normalizeEventComments } from '../event-comments.js';
import { getWorkflowState, WORKFLOW, canUserRedraftEvent } from '../proposal-workflow.js';
import { isRecurrenceInstance, askRecurrenceScope } from '../recurrence.js';
import { formatCalendarDisplayLabel, shouldShowCalendarIdDetail } from '../google-integration.js';
import { loadDraftIntoForm } from './bindings/create.js';

function openModalOverlay(box, ariaLabel) {
  const modal = document.getElementById('app-modal');
  if (!modal || !box) return null;
  if (ariaLabel) box.setAttribute('aria-label', ariaLabel);
  modal.classList.add('open');
  return modal;
}
import { bindSettingsEvents, bindLogisticsEvents, bindColorThemeEvents } from './bindings/logistics.js';
import { bindAvatarPicker } from '../avatar.js';

export function handleBookingDeletion(event, reason) {
  const cancelledBy = getCurrentUserName();
  const cancelledTime = formatAppDateTime();

  pushAppNotification({
    title: 'Booking Cancelled',
    description: `"${event.title}" was cancelled by ${cancelledBy} on ${cancelledTime}.${reason ? ` Reason: ${reason}` : ''}`
  });

  showToast('Booking cancelled successfully.', 'success');
  logUserAction(`Deleted event "${event.title}": ${reason || 'no reason'}`);
}

export function openNotificationsModal() {
  const modal = document.getElementById('app-modal');
  const box = document.getElementById('app-modal-content');
  if (!modal || !box) return;

  state.notifications.forEach(n => { n.read = true; });
  updateNotificationsBadge();
  persistCurrentUserNotifications();

  let listHtml = '';
  if (state.notifications.length === 0) {
    listHtml = '<p style="text-align: center; color: var(--on-surface-variant); padding: var(--space-md);">No new notifications.</p>';
  } else {
    listHtml = state.notifications.map(n => `
      <div style="padding: var(--space-sm) 0; border-bottom: 1px solid var(--outline-variant);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <strong class="font-title-lg" style="font-size: 0.95rem; color: var(--primary);">${escapeHtml(n.title)}</strong>
          <span class="font-label-sm" style="color: var(--on-surface-variant);">${escapeHtml(n.timestamp)}</span>
        </div>
        <p class="font-body-md" style="color: var(--on-surface); font-size: 0.875rem; line-height: 1.4;">${escapeHtml(n.description)}</p>
      </div>
    `).reverse().join('');
  }

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-md);">
      <h3 class="font-headline-lg" style="font-size: 1.5rem; font-weight: 700;">Notifications</h3>
      <button class="btn-icon-only" id="modal-close-btn">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div style="max-height: 350px; overflow-y: auto; margin-bottom: var(--space-md);">
      ${listHtml}
    </div>
    <button class="btn btn-outline" id="btn-clear-notifications" style="width: 100%;">Clear All Notifications</button>
  `;

  openModalOverlay(box, 'Notifications');

  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  document.getElementById('btn-clear-notifications').addEventListener('click', () => {
    state.notifications = [];
    persistCurrentUserNotifications();
    updateNotificationsBadge();
    modal.classList.remove('open');
    showToast('Notifications cleared.', 'success');
  });
}

export function openUserProfileModal() {
  const modal = document.getElementById('app-modal');
  const box = document.getElementById('app-modal-content');
  if (!modal || !box) return;

  const calendarConnected = state.calendarStatus === 'connected';
  const credentialsConfigured = !!(localStorage.getItem(CLIENT_ID_KEY) && localStorage.getItem(API_KEY_KEY));

  const profilePartner = getCurrentUserPartner(state.config, state.currentUser);
  const connectedGoogleEmail = AuthManager.userProfile?.email || '';
  const configuredGoogleEmail = profilePartner?.googleEmail || '';
  const googleEmailMismatch = configuredGoogleEmail
    && connectedGoogleEmail
    && normalizeEmail(configuredGoogleEmail) !== normalizeEmail(connectedGoogleEmail);
  const calendarId = state.config?.googleIntegration?.calendarId
    || localStorage.getItem(CALENDAR_ID_KEY)
    || 'primary';
  const calendarLabel = formatCalendarDisplayLabel(calendarId);
  const calendarDetailHtml = shouldShowCalendarIdDetail(calendarId)
    ? `<span class="calendar-id-detail">${escapeHtml(calendarId)}</span>`
    : '';

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-md); border-bottom: 1px solid var(--outline-variant); padding-bottom: var(--space-sm);">
      <div style="display: flex; gap: var(--space-md); align-items: center;">
        <div class="profile-avatar" style="width: 48px; height: 48px; border: 2px solid var(--primary);">
          <img src="${state.currentUser?.picture || 'https://lh3.googleusercontent.com/a/default-user'}" alt="Profile Image" style="width: 100%; height: 100%; object-fit: cover;"/>
        </div>
        <div>
          <h3 class="font-title-lg" style="font-weight: 700; line-height: 1.2;">${escapeHtml(getCurrentUserName())}</h3>
        </div>
      </div>
      <button class="btn-icon-only" id="modal-close-btn" style="margin-top: -6px;">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div style="max-height: 55vh; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-lg); padding-right: 4px;">
      <div style="display: flex; gap: var(--space-sm);">
        <button class="btn btn-outline" id="modal-btn-logout" style="flex: 1; padding: 8px 16px; font-size: 0.85rem;">
          <span class="material-symbols-outlined" style="font-size: 18px;">logout</span> Log Out
        </button>
        <button class="btn btn-error" id="modal-btn-delete-account" style="flex: 1; padding: 8px 16px; font-size: 0.85rem; border-color: var(--error); color: var(--error);">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete_forever</span> Delete Account
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--space-md);">
        <h4 class="font-title-lg" style="font-weight: 700; font-size: 1.1rem; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Edit Profile</h4>
        
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="setting-display-name" style="font-size: 0.8rem;">Display Name</label>
          <input class="form-input" id="setting-display-name" type="text" value="${state.currentUser?.name || ''}" style="padding: 6px 12px; font-size: 0.85rem;"/>
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="setting-notification-email" style="font-size: 0.8rem;">Notification email (optional)</label>
          <input class="form-input" id="setting-notification-email" type="email" placeholder="you@example.com" value="${escapeHtml(profilePartner?.notificationEmail || '')}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: 4px;">Used for email backup when push cannot reach your devices.</p>
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="setting-google-email" style="font-size: 0.8rem;">Google Calendar account email</label>
          <input class="form-input" id="setting-google-email" type="email" placeholder="you@gmail.com" value="${escapeHtml(configuredGoogleEmail)}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: 4px;">
            Identifies you when events are added or removed directly in Google Calendar.
            ${calendarConnected && connectedGoogleEmail ? ` Connected as ${escapeHtml(connectedGoogleEmail)}.` : ''}
            ${googleEmailMismatch ? ` <strong style="color: var(--error);">This browser is signed in to a different Google account. Use the OFFLINE banner to connect as ${escapeHtml(configuredGoogleEmail)}.</strong>` : ''}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-username" style="font-size: 0.8rem;">Username</label>
            <input class="form-input" id="setting-username" type="text" value="${state.currentUser?.username || ''}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-password" style="font-size: 0.8rem;">Password</label>
            <input class="form-input" id="setting-password" type="password" value="" placeholder="Leave blank to keep unchanged" style="padding: 6px 12px; font-size: 0.85rem;"/>
          </div>
        </div>

        ${renderPronounPickerHtml(profilePartner)}

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 0.8rem;">Select Avatar</label>
          <div style="margin-top: var(--space-xs);">
            ${renderAvatarPickerHtml(state.currentUser?.picture, 'setting-avatar-options', { size: 44 })}
          </div>
        </div>

        <button class="btn btn-filled" id="btn-save-profile" style="align-self: flex-start; padding: 6px 16px; font-size: 0.8rem; margin-top: var(--space-xs);">Save Profile</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--space-md);">
        <h4 class="font-title-lg" style="font-weight: 700; font-size: 1.1rem; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs); display: flex; align-items: center; gap: var(--space-sm);">
          <span class="material-symbols-outlined text-primary" style="font-size: 20px;">palette</span> Color Theme
        </h4>
        <p class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.8rem; margin: 0;">
          Personal accent colors for this device.
        </p>
        <div class="theme-swatch-grid" role="group" aria-label="Color theme">
          ${renderColorThemePickerHtml(loadStoredColorTheme())}
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--space-md);">
        <h4 class="font-title-lg" style="font-weight: 700; font-size: 1.1rem; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Google Calendar</h4>
        <p class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.8rem; margin: 0;">
          Status: <strong>${calendarConnected ? 'Connected' : 'Offline'}</strong>.
          ${calendarConnected
            ? ' Your schedule is syncing with Google Calendar.'
            : ' Use the OFFLINE banner at the top of the app to re-authenticate.'}
        </p>
        ${credentialsConfigured
          ? `<p class="font-label-sm calendar-connected-status" style="color: var(--secondary); margin: 0;">Household calendar: <strong>${escapeHtml(calendarLabel)}</strong>${calendarDetailHtml}</p>`
          : ''}
        <p class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.8rem; margin: 0;">
          ${credentialsConfigured
            ? 'Household Google credentials are configured by an administrator.'
            : 'Ask an administrator to configure Google Calendar credentials on the Admin page.'}
        </p>

        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-xs); flex-wrap: wrap;">
          <a href="#settings" class="btn btn-outline" id="modal-link-device-settings" style="padding: 6px 16px; font-size: 0.8rem; flex: 1; text-align: center; text-decoration: none;">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">notifications_active</span> Notifications &amp; Settings
          </a>
          <button class="btn btn-outline" id="btn-force-update" style="border-color: var(--primary); color: var(--primary); padding: 6px 16px; font-size: 0.8rem; flex: 1;">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">system_update_alt</span> Force Update Software
          </button>
        </div>
      </div>
    </div>
  `;

  openModalOverlay(box, 'User profile');

  bindColorThemeEvents(box);

  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  box.querySelector('#modal-link-device-settings')?.addEventListener('click', () => {
    modal.classList.remove('open');
    import('./router.js').then(({ router }) => {
      window.location.hash = '#settings';
      router();
    });
  });

  document.getElementById('modal-btn-logout').addEventListener('click', () => {
    modal.classList.remove('open');
    showToast('Logged out successfully.', 'success');
    logoutUser();
  });

  document.getElementById('modal-btn-delete-account').addEventListener('click', () => {
    if (confirm('Are you sure you want to permanently delete your account and clear all local data? This action cannot be undone.')) {
      AuthManager.clearCredentials();
      localStorage.clear();
      modal.classList.remove('open');
      showToast('Account deleted. Reloading...', 'warning');
      setTimeout(() => window.location.reload(), 1500);
    }
  });

  const displayNameInput = box.querySelector('#setting-display-name');
  const getPronouns = bindPronounPicker(box, { displayNameInput });

  const getSelectedAvatar = bindAvatarPicker('#setting-avatar-options', {
    initialUrl: state.currentUser?.picture,
    size: 44,
    onError: (msg) => showToast(msg, 'warning')
  });

  const btnSaveProfile = box.querySelector('#btn-save-profile');
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', async () => {
      const dispName = displayNameInput.value.trim();
      const userName = box.querySelector('#setting-username').value.trim();
      const pwd = box.querySelector('#setting-password').value.trim();
      const selectedAvatar = getSelectedAvatar();
      const pronouns = getPronouns();

      if (!dispName || !userName) {
        showToast('Display Name and User Name are required.', 'warning');
        return;
      }

      if (!pronouns) {
        showToast('Please complete custom pronoun fields (subject, object, possessive).', 'warning');
        return;
      }

      if (!state.currentUser?.id) return;

      updatePartnerProfile(state.currentUser.id, {
        name: dispName,
        username: userName,
        password: pwd,
        avatar: selectedAvatar,
        pronouns,
        notificationEmail: box.querySelector('#setting-notification-email')?.value.trim() || '',
        googleEmail: box.querySelector('#setting-google-email')?.value.trim() || ''
      });

      const modalHeading = box.querySelector('h3.font-title-lg');
      if (modalHeading) modalHeading.textContent = dispName;
      const modalAvatarImg = box.querySelector('.profile-avatar img');
      if (modalAvatarImg) modalAvatarImg.src = selectedAvatar;

      logUserAction(`Profile updated for "${dispName}".`, 'info');
      showToast('Profile updated successfully.', 'success');
      modal.classList.remove('open');
    });
  }

  bindSettingsEvents(box);
  bindLogisticsEvents(box);
}

export function openEventDetailsModal(event) {
  const modal = document.getElementById('app-modal');
  const box = document.getElementById('app-modal-content');
  if (!modal || !box) return;

  const viewerRef = state.currentUser?.id || state.currentUser?.name;
  const display = getEventDisplayPolicy(event, viewerRef, state.config);
  const comments = normalizeEventComments(event.comments);

  const dateStr = new Date(event.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeOpts = { hour: 'numeric', minute: '2-digit', hour12: true };
  const timeRangeStr = event.type === 'sleeping'
    ? 'All night'
    : `${new Date(event.start).toLocaleTimeString(undefined, timeOpts)} - ${new Date(event.end).toLocaleTimeString(undefined, timeOpts)}`;

  let locationOrRoom = '';
  if (event.type === 'sleeping' && display.showSleepingArrangement) {
    locationOrRoom = `
      <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-md);">
        <span class="material-symbols-outlined">bed</span>
        <span>${escapeHtml(event.homeName || '')}: ${escapeHtml(event.roomName || 'Room')}</span>
      </div>
    `;
  } else if (event.type !== 'sleeping' && display.showLocation) {
    locationOrRoom = `
      <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-md);">
        <span class="material-symbols-outlined">location_on</span>
        <span>${escapeHtml(event.location || 'No location set')}</span>
      </div>
    `;
  }

  const notesHtml = display.showNotes && event.notes?.trim()
    ? `<div style="margin-bottom: var(--space-md);">
        <h4 class="font-title-lg" style="font-size: 0.95rem; font-weight: 700; margin-bottom: var(--space-xs);">Notes</h4>
        <p class="font-body-md" style="color: var(--on-surface-variant); white-space: pre-wrap;">${escapeHtml(event.notes.trim())}</p>
      </div>`
    : '';

  const commentsHtml = display.showComments && comments.length
    ? `<div style="margin-bottom: var(--space-md);">
        <h4 class="font-title-lg" style="font-size: 0.95rem; font-weight: 700; margin-bottom: var(--space-xs);">Comments</h4>
        <div style="display: flex; flex-direction: column; gap: var(--space-sm); max-height: 180px; overflow-y: auto;">
          ${comments.map((c) => {
            const when = c.createdAt
              ? new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : '';
            return `<div style="padding: var(--space-xs) var(--space-sm); background: var(--surface-container-high); border-radius: var(--radius-default);">
              <div class="font-label-sm" style="color: var(--on-surface-variant); margin-bottom: 2px;">${escapeHtml(c.author)}${when ? ` · ${escapeHtml(when)}` : ''}</div>
              <div class="font-body-md" style="white-space: pre-wrap;">${escapeHtml(c.text)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`
    : '';

  const commentFormHtml = display.showComments
    ? `<div style="margin-bottom: var(--space-lg);">
        <label class="form-label" for="event-comment-input">Add a comment</label>
        <textarea class="form-input" id="event-comment-input" rows="2" placeholder="Updates, logistics, follow-ups…" style="resize: vertical; min-height: 56px;"></textarea>
        <button class="btn btn-outline" id="btn-add-event-comment" style="margin-top: var(--space-xs);">Post Comment</button>
      </div>`
    : '';

  const participantsHtml = display.showParticipants
    ? `<h4 class="font-title-lg" style="font-size: 0.95rem; font-weight: 700; margin-bottom: var(--space-xs);">Participants</h4>
    <div style="display: flex; flex-wrap: wrap; gap: var(--space-base); margin-bottom: var(--space-lg);">
      ${event.participants.map(p => `<span class="chip active" style="font-size: 11px; padding: 2px 12px; pointer-events: none;">${escapeHtml(p)}</span>`).join('')}
    </div>`
    : '';

  const deleteHtml = display.redacted
    ? ''
    : `<button class="btn btn-error" id="modal-delete-btn" style="width: 100%;">Cancel / Delete Booking</button>`;

  const userRef = state.currentUser?.id || state.currentUser?.name;
  const ws = getWorkflowState(event);
  const canRedraft = !display.redacted
    && (ws === WORKFLOW.APPROVED || ws === WORKFLOW.ARCHIVED)
    && canUserRedraftEvent(event, userRef, state.config);
  const redraftHtml = canRedraft
    ? `<button class="btn btn-outline" id="modal-redraft-btn" style="width: 100%; margin-bottom: var(--space-sm);">Re-Draft</button>`
    : '';

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-md);">
      <div>
        <span class="proposal-badge ${event.type}" style="margin-bottom: var(--space-xs); display: inline-block;">${event.type.toUpperCase()}</span>
        <h3 class="font-headline-lg" style="font-size: 1.5rem; font-weight: 700; line-height: 1.2;">${escapeHtml(display.title)}</h3>
      </div>
      <button class="btn-icon-only" id="modal-close-btn" style="margin-top: -6px;">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-xs);">
      <span class="material-symbols-outlined">calendar_month</span>
      <span>${dateStr}</span>
    </div>
    <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-sm);">
      <span class="material-symbols-outlined">schedule</span>
      <span>${timeRangeStr}</span>
    </div>

    ${locationOrRoom}
    ${notesHtml}
    ${commentsHtml}
    ${commentFormHtml}
    ${participantsHtml}
    ${redraftHtml}
    ${deleteHtml}
  `;

  openModalOverlay(box, `Booking: ${display.title}`);

  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  const btnComment = document.getElementById('btn-add-event-comment');
  if (btnComment) {
    btnComment.addEventListener('click', async () => {
      const text = document.getElementById('event-comment-input')?.value || '';
      if (!text.trim()) {
        showToast('Enter a comment first.', 'warning');
        return;
      }
      try {
        await CalendarSync.addEventComment(event.id, text.trim(), getCurrentUserName());
        state.events = CalendarSync.events;
        modal.classList.remove('open');
        showToast('Comment posted.', 'success');
        import('./router.js').then(({ renderView }) => renderView());
      } catch (err) {
        logOperationError('Event comment', err, { eventId: event.id });
        showToast('Failed to post comment.', 'error');
      }
    });
  }

  const btnDelete = document.getElementById('modal-delete-btn');
  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete "${event.title}"?`)) {
        const reason = prompt('Optional: Enter a reason for cancelling this booking:');
        if (reason === null) return;

        let deleteOptions = {};
        if (isRecurrenceInstance(event)) {
          const scope = askRecurrenceScope('delete');
          if (!scope) return;
          deleteOptions = { scope };
        }

        try {
          await CalendarSync.deleteEvent(event.id, deleteOptions);
          state.events = CalendarSync.events;
          modal.classList.remove('open');
          handleBookingDeletion(event, reason);
          import('./router.js').then(({ renderView }) => renderView());
        } catch (err) {
          logOperationError('Booking delete', err, {
            eventId: event.id,
            eventTitle: event.title
          });
          showToast('Failed to delete booking.', 'error');
        }
      }
    });
  }

  const btnRedraft = document.getElementById('modal-redraft-btn');
  if (btnRedraft) {
    btnRedraft.addEventListener('click', async () => {
      if (!confirm('Move this booking back to draft so it can be edited and re-submitted?')) return;

      let redraftOptions = {};
      if (isRecurrenceInstance(event)) {
        const scope = askRecurrenceScope('redraft');
        if (!scope) return;
        redraftOptions = { scope };
      }

      try {
        const draft = await CalendarSync.redraftApprovedEvent(
          event.id,
          getCurrentUserName(),
          redraftOptions
        );
        state.events = CalendarSync.events;
        modal.classList.remove('open');
        showToast('Moved to draft.', 'success');
        logUserAction(`Re-drafted "${event.title}"`);
        if (draft?.id) {
          loadDraftIntoForm(draft.id);
          window.location.hash = `#create?draft=${draft.id}`;
        } else {
          flowState.activeProposalsTab = 'drafts';
          window.location.hash = '#proposals';
        }
      } catch (err) {
        logOperationError('Re-draft', err, { eventId: event.id });
        showToast(err?.message || 'Failed to re-draft.', 'error');
      }
    });
  }
}
