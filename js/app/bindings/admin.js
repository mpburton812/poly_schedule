import {
  CALENDAR_ID_KEY,
  CLIENT_ID_KEY,
  API_KEY_KEY
} from '../../storage-keys.js';
import { CalendarSync } from '../../calendar.js';
import { AuthManager } from '../../auth.js';
import { hashPassword } from '../../crypto.js';
import { normalizePronouns } from '../../pronouns.js';
import { assertUsernameAvailable, claimUsernameAfterPersist, releaseUsernameGlobally } from '../../username-registry.js';
import { createPartnerViaNotify, fetchUserHealthReport } from '../../household-partners.js';
import { isPartnerPassive, partnerRefsMatch, normalizeEmail } from '../../helpers.js';
import { escapeHtml } from '../../escape.js';
import {
  setAutoArchiveDays,
  getAutoArchiveDays,
  getWorkflowState,
  WORKFLOW
} from '../../proposal-workflow.js';
import {
  ensurePrivacySchedulingPolicies,
  PRIVACY_SCHEDULING_MODE
} from '../../privacy-scheduling-policy.js';
import {
  resolvePartnerLimitEntry,
  isPendingPartnerConnection,
  isApprovedPartnerConnection,
  isActivePartnerConnection,
  findPartnerConnectionProposal,
  clearPartnerConnectionEntry,
  createAndSubmitPartnerConnectionProposal,
  removeBidirectionalApprovedConnection,
  applyPassivePartnerConnection
} from '../../partner-connection.js';
import { getCurrentUserName, hasAdminSessionAccess } from '../session.js';
import {
  state,
  flowState
} from '../state.js';
import {
  addLog,
  logUserAction,
  showToast,
  persistHouseholdConfig,
  attemptLogin,
  restoreAddPartnerDraft,
  bindAvatarPicker,
  bindSleepingPartnerCheckboxes,
  updatePartnerProfile,
  grantPartnerCalendarAccess,
  refreshOperationLogDom,
  filterLogsByCategory
} from '../context.js';
import { renderView } from '../router.js';
import { bindLogisticsEvents, bindGoogleCredentialsEvents, bindHouseholdSyncEvents, bindNotifyCredentialsEvents, bindAdminDevicesEvents } from './logistics.js';

async function notifyPartnerCalendarShare(partnerName, googleEmail, { action = 'added' } = {}) {
  if (!googleEmail) {
    showToast(
      action === 'activated'
        ? `"${partnerName}" is now an active user!`
        : `Partner "${partnerName}" added successfully!`,
      'success'
    );
    return;
  }

  const share = await grantPartnerCalendarAccess(googleEmail);
  if (!share.ok) {
    showToast(`Partner "${partnerName}" saved, but calendar sharing failed: ${share.message}`, 'warning');
    return;
  }

  if (share.alreadyShared) {
    showToast(`Partner "${partnerName}" saved. ${googleEmail} already has calendar access.`, 'success');
  } else {
    showToast(`Partner "${partnerName}" saved and calendar shared with ${googleEmail}.`, 'success');
  }
}

export function bindAdminEvents() {
  const btnSave = document.getElementById('btn-save-group-name');
  const familyInput = document.getElementById('admin-poly-family-name');
  if (btnSave && familyInput) {
    btnSave.addEventListener('click', () => {
      void (async () => {
        const name = familyInput.value.trim() || 'The Poly Circle';
        if (!state.config) {
          showToast('Household config is not loaded yet.', 'error');
          return;
        }
        state.config.groupName = name;
        try {
          await persistHouseholdConfig(`Group name updated to "${name}"`);
          logUserAction(`Group name updated to "${name}".`, 'info');
          showToast('Group name saved to cloud config.', 'success');
        } catch {
          /* persistHouseholdConfig already toasts */
        }
      })();
    });
  }

  const btnArchiveSave = document.getElementById('btn-save-auto-archive');
  const archiveInput = document.getElementById('admin-auto-archive-days');
  if (btnArchiveSave && archiveInput) {
    btnArchiveSave.addEventListener('click', () => {
      const days = parseInt(archiveInput.value, 10);
      setAutoArchiveDays(Number.isFinite(days) ? days : 7);
      logUserAction(`Auto-archive set to ${getAutoArchiveDays()} day(s).`, 'info');
      showToast('Archive setting saved.', 'success');
    });
  }

  const btnPrivacySave = document.getElementById('btn-save-privacy-scheduling');
  const privateModeSelect = document.getElementById('admin-privacy-private-mode');
  const superPrivateModeSelect = document.getElementById('admin-privacy-super-private-mode');
  if (btnPrivacySave && privateModeSelect && superPrivateModeSelect) {
    btnPrivacySave.addEventListener('click', () => {
      void (async () => {
        if (!state.config) {
          showToast('Household config is not loaded yet.', 'error');
          return;
        }
        const privateMode = privateModeSelect.value;
        const superPrivateMode = superPrivateModeSelect.value;
        if (
          privateMode === PRIVACY_SCHEDULING_MODE.DEFAULT
          && superPrivateMode === PRIVACY_SCHEDULING_MODE.DEFAULT
        ) {
          showToast('Only one privacy level can be the default. Set the other to Available or Disabled.', 'warning');
          return;
        }
        ensurePrivacySchedulingPolicies(state.config);
        state.config.privacyScheduling.private = privateMode;
        state.config.privacyScheduling.superPrivate = superPrivateMode;
        try {
          await persistHouseholdConfig('Updated private scheduling policy');
          logUserAction('Private scheduling policy updated.', 'info');
          showToast('Privacy settings saved.', 'success');
        } catch {
          /* persistHouseholdConfig already toasts */
        }
      })();
    });
  }

  bindLogisticsEvents(document);
  bindGoogleCredentialsEvents(document);
  bindHouseholdSyncEvents(document);
  bindNotifyCredentialsEvents(document);
  bindAdminDevicesEvents(document);
  bindAdminLogFilterEvents();
  bindUserHealthEvents();
  focusAdminSectionIfRequested();
}

function renderUserHealthPanel(report) {
  const panel = document.getElementById('user-health-panel');
  if (!panel || !report) return;

  const rows = (report.partners || []).map((row) => {
    const issues = (row.issues || []).join(', ') || 'ok';
    const status = row.canLogin ? 'ready' : 'blocked';
    return `<tr>
      <td>${escapeHtml(row.name || '—')}</td>
      <td><code>${escapeHtml(row.username || '')}</code></td>
      <td>${row.inRegistry ? 'yes' : 'no'}</td>
      <td>${status}</td>
      <td>${escapeHtml(issues)}</td>
    </tr>`;
  }).join('');

  panel.innerHTML = `
    <p style="margin-bottom: var(--space-sm);">
      Storage: <strong>${escapeHtml(report.storageBackend || 'json')}</strong>
      · Active partners: <strong>${report.summary?.activePartners ?? 0}</strong>
      · Registry entries: <strong>${report.summary?.registryEntries ?? 0}</strong>
      · Orphans: <strong>${report.summary?.registryOrphans ?? 0}</strong>
      · Login-ready: <strong>${report.summary?.loginReady ?? 0}</strong>
    </p>
    <div style="overflow-x: auto;">
      <table class="font-body-sm" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 6px 8px;">Name</th>
            <th style="text-align: left; padding: 6px 8px;">Username</th>
            <th style="text-align: left; padding: 6px 8px;">Registry</th>
            <th style="text-align: left; padding: 6px 8px;">Login</th>
            <th style="text-align: left; padding: 6px 8px;">Issues</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5">No active partners found.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function bindUserHealthEvents() {
  const btn = document.getElementById('btn-refresh-user-health');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const householdId = state.config?.householdId;
    if (!householdId) {
      showToast('Household id is not assigned yet.', 'warning');
      return;
    }
    btn.disabled = true;
    const result = await fetchUserHealthReport(householdId);
    btn.disabled = false;
    if (!result.ok) {
      showToast(result.message, 'error');
      return;
    }
    renderUserHealthPanel(result.report);
  });
}

function bindAdminLogFilterEvents() {
  document.querySelectorAll('[data-log-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.logFilter;
      flowState.adminLogFilter = flowState.adminLogFilter === filter ? 'all' : filter;
      refreshOperationLogDom();
      document.querySelectorAll('[data-log-filter]').forEach((b) => {
        const active = b.dataset.logFilter === flowState.adminLogFilter;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const allLogs = state.logs || [];
      const filtered = filterLogsByCategory(allLogs, flowState.adminLogFilter);
      const label = document.querySelector('.console-header .font-label-sm');
      if (label) {
        label.textContent = flowState.adminLogFilter === 'all'
          ? `Operational Log (${allLogs.length} entries)`
          : `Operational Log (${filtered.length} of ${allLogs.length} entries)`;
      }
    });
  });
}

function focusAdminSectionIfRequested() {
  if (flowState.adminFocusSection !== 'google') return;
  flowState.adminFocusSection = null;
  requestAnimationFrame(() => {
    const el = document.getElementById('admin-google-calendar-settings');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('admin-section-highlight');
    setTimeout(() => el.classList.remove('admin-section-highlight'), 2400);
  });
}

export function bindLoginEvents() {
  const btnLogin = document.getElementById('btn-login');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');

  const submit = async () => {
    if (!usernameInput?.value || !passwordInput?.value) {
      showToast('Please enter username and password.', 'warning');
      return;
    }
    await attemptLogin(usernameInput.value, passwordInput.value);
  };

  if (btnLogin) btnLogin.addEventListener('click', submit);
  if (passwordInput) {
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }
}

export function bindAddPartnerEvents() {
  restoreAddPartnerDraft();

  const btnBack = document.getElementById('btn-add-partner-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.hash = '#logistics';
    });
  }

  const btnActive = document.getElementById('btn-partner-type-active');
  const btnPassive = document.getElementById('btn-partner-type-passive');
  if (btnActive) {
    btnActive.addEventListener('click', () => {
      flowState.activePartnerType = 'active';
      renderView();
    });
  }
  if (btnPassive) {
    btnPassive.addEventListener('click', () => {
      flowState.activePartnerType = 'passive';
      renderView();
    });
  }

  bindSleepingPartnerCheckboxes();
  const getSelectedAvatar = bindAvatarPicker('#new-partner-avatar-options', {
    onError: (msg) => showToast(msg, 'warning')
  });

  const btnSubmit = document.getElementById('btn-submit-partner');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const name = document.getElementById('new-partner-name').value.trim();
      const partnerType = document.getElementById('new-partner-type')?.value || flowState.activePartnerType;
      const isPassive = partnerType === 'passive';

      if (!name) {
        showToast('Display Name is required.', 'warning');
        return;
      }

      let username, password, role, googleEmail;
      if (!isPassive) {
        username = document.getElementById('new-partner-username').value.trim();
        password = document.getElementById('new-partner-password').value.trim();
        role = document.getElementById('new-partner-role').value;
        googleEmail = normalizeEmail(document.getElementById('new-partner-google-email')?.value);
        if (!username || !password) {
          showToast('Username and password are required for active users.', 'warning');
          return;
        }
        const exists = state.config.partners.some(p => p.username === username || p.name === name);
        if (exists) {
          showToast('A partner with this Display Name or Username already exists.', 'warning');
          return;
        }
        const usernameCheck = await assertUsernameAvailable(username, {
          config: state.config,
          partnerId: null,
          householdId: state.config.householdId
        });
        if (!usernameCheck.ok) {
          showToast(usernameCheck.message, 'warning');
          return;
        }
      } else if (state.config.partners.some(p => p.name === name)) {
        showToast('A partner with this Display Name already exists.', 'warning');
        return;
      }

      const selectedAvatar = getSelectedAvatar();
      const rules = {};
      if (!isPassive) {
        const checkboxes = document.querySelectorAll('.sleeping-partner-checkbox');
        const anyChecked = Array.from(checkboxes).some(c => c.checked);
        if (anyChecked) {
          rules.minSoloNights = parseInt(document.getElementById('new-partner-solo-nights').value, 10) || 2;
          delete rules.maxSoloNights;
          rules.partnerLimits = {};
          checkboxes.forEach(cb => {
            if (cb.checked) {
              const partnerName = cb.dataset.partnerName;
              const minNights = parseInt(cb.closest('div').querySelector('.partner-min-nights').value) || 0;
              const maxNights = parseInt(cb.closest('div').querySelector('.partner-max-nights').value) || 7;
              rules.partnerLimits[partnerName] = { min: minNights, max: maxNights };
              const otherPartner = state.config.partners.find(p => p.name === partnerName);
              if (otherPartner) {
                if (!otherPartner.rules) otherPartner.rules = {};
                if (!otherPartner.rules.partnerLimits) otherPartner.rules.partnerLimits = {};
                otherPartner.rules.partnerLimits[name] = { min: minNights, max: maxNights };
              }
            }
          });
        }
      }

      const defaultPronouns = normalizePronouns(null);
      let newPartner = state.config.partners.find(p => isPartnerPassive(p) && partnerRefsMatch(state.config, p.name, name));
      let pushedNewPartner = false;

      if (newPartner) {
        if (isPassive) {
          showToast('A passive partner with this name already exists.', 'warning');
          return;
        } else {
          const passwordHash = await hashPassword(password, newPartner.id);
          newPartner.username = username;
          newPartner.passwordHash = passwordHash;
          newPartner.role = role;
          newPartner.avatar = selectedAvatar || newPartner.avatar;
          newPartner.pronouns = newPartner.pronouns || defaultPronouns;
          newPartner.rules = rules;
          if (googleEmail) newPartner.googleEmail = googleEmail;
          delete newPartner.passive;
        }
      } else {
        const newId = `p${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        if (isPassive) {
          newPartner = { id: newId, name, passive: true, avatar: selectedAvatar, pronouns: defaultPronouns, rules: {} };
        } else {
          const passwordHash = await hashPassword(password, newId);
          newPartner = { id: newId, name, username, passwordHash, role, avatar: selectedAvatar, pronouns: defaultPronouns, rules };
          if (googleEmail) newPartner.googleEmail = googleEmail;
        }
        state.config.partners.push(newPartner);
        pushedNewPartner = true;
      }

      if (!isPassive) {
        const btnSubmit = document.getElementById('btn-submit-partner');
        if (btnSubmit) btnSubmit.disabled = true;
        try {
          let claimedViaNotify = false;
          if (pushedNewPartner) {
            const notifyResult = await createPartnerViaNotify(state.config.householdId, newPartner, {
              actorPartnerId: state.currentUser?.id || null
            });
            if (notifyResult.ok) {
              state.config = notifyResult.config;
              CalendarSync.config = notifyResult.config;
              claimedViaNotify = true;
            }
          }

          await persistHouseholdConfig(`Added partner: ${name}`);
          if (!claimedViaNotify) {
            const claim = await claimUsernameAfterPersist(username, state.config.householdId, newPartner.id);
            if (!claim.ok) {
              if (pushedNewPartner) state.config.partners.pop();
              showToast(claim.message, 'warning');
              return;
            }
          }

          await notifyPartnerCalendarShare(name, googleEmail);
          window.location.hash = '#logistics';
        } catch {
          if (pushedNewPartner) state.config.partners.pop();
          if (!isPassive) {
            await releaseUsernameGlobally(username, state.config.householdId, newPartner.id);
          }
          showToast('Failed to save partner. Please try again.', 'error');
        } finally {
          if (btnSubmit) btnSubmit.disabled = false;
        }
        return;
      }

      const btnSubmitPassive = document.getElementById('btn-submit-partner');
      if (btnSubmitPassive) btnSubmitPassive.disabled = true;
      try {
        await persistHouseholdConfig(`Added passive partner: ${name}`);
        showToast(`Partner "${name}" added successfully!`, 'success');
        window.location.hash = '#logistics';
      } catch {
        if (pushedNewPartner) state.config.partners.pop();
        showToast('Failed to save partner. Please try again.', 'error');
      } finally {
        if (btnSubmitPassive) btnSubmitPassive.disabled = false;
      }
    });
  }
}

export function bindAddHomeEvents() {
  const btnBack = document.getElementById('btn-add-home-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.hash = '#logistics';
    });
  }

  const bedroomsInput = document.getElementById('new-home-bedrooms-count');
  const bedroomContainer = document.getElementById('bedroom-names-container');

  if (bedroomsInput && bedroomContainer) {
    bedroomsInput.addEventListener('input', () => {
      const count = Math.max(1, parseInt(bedroomsInput.value) || 1);
      let inputsHtml = '<h4 class="font-label-md" style="font-weight: bold;">Bedroom Names (Optional)</h4>';
      for (let i = 0; i < count; i++) {
        inputsHtml += `
          <div class="form-group" style="margin-bottom: var(--space-xs);">
            <input class="form-input bedroom-name-input" placeholder="Bedroom ${i + 1} Name (e.g. Bedroom ${i + 1})" type="text" data-index="${i}"/>
          </div>
        `;
      }
      bedroomContainer.innerHTML = inputsHtml;
    });
  }

  const btnSubmit = document.getElementById('btn-submit-home');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => {
      const name = document.getElementById('new-home-name').value.trim();
      const address = document.getElementById('new-home-address').value.trim();

      if (!name) {
        showToast('Please fill in Home Name.', 'warning');
        return;
      }

      const bedroomsCount = Math.max(1, parseInt(bedroomsInput.value) || 1);

      const bedroomInputs = document.querySelectorAll('.bedroom-name-input');
      const bedroomsList = [];
      for (let i = 0; i < bedroomsCount; i++) {
        const input = Array.from(bedroomInputs).find(inp => parseInt(inp.dataset.index) === i);
        const bedName = (input && input.value.trim()) ? input.value.trim() : `Bedroom ${i + 1}`;
        bedroomsList.push({ id: `r${i + 1}`, name: bedName });
      }

      const associatedCheckboxes = document.querySelectorAll('.home-associated-partner');
      const associatedPeople = [];
      associatedCheckboxes.forEach(cb => {
        if (cb.checked) {
          associatedPeople.push(cb.dataset.partnerName);
        }
      });

      state.config.residences = state.config.residences || [];
      const newHomeId = 'h' + (state.config.residences.length + 1);
      const newHome = {
        id: newHomeId,
        name,
        address: address || '',
        bedrooms: bedroomsCount,
        bedroomDetails: bedroomsList,
        associatedPeople
      };

      state.config.residences.push(newHome);
      void persistHouseholdConfig(`Added home: ${name}`)
        .then(() => {
          showToast(`Home "${name}" added successfully!`, 'success');
          window.location.hash = '#logistics';
        })
        .catch(() => {
          state.config.residences.pop();
        });
    });
  }
}

function bindEditPartnerSleepingConnections(editPartner) {
  if (!editPartner || isPartnerPassive(editPartner)) return;

  document.querySelectorAll('.sleeping-partner-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      void (async () => {
        const targetName = cb.dataset.partnerName;
        const targetPartner = state.config.partners.find(p => p.id === cb.dataset.partnerId || p.name === targetName);
        if (!targetPartner) return;

        if (cb.checked) {
          if (cb.dataset.approved === '1') {
            cb.checked = true;
            return;
          }
          const existing = resolvePartnerLimitEntry(editPartner, targetName);
          if (isPendingPartnerConnection(existing) || isApprovedPartnerConnection(existing)) {
            cb.checked = true;
            return;
          }

          if (isPartnerPassive(targetPartner)) {
            cb.disabled = true;
            try {
              await applyPassivePartnerConnection(state.config, editPartner, targetPartner);
              CalendarSync.config = state.config;
              showToast('Sleeping partner request is auto-approved with passive partners.', 'success');
              renderView();
            } catch (err) {
              cb.checked = false;
              showToast(err?.message || 'Failed to connect passive partner.', 'error');
            } finally {
              cb.disabled = false;
            }
            return;
          }

          const ok = window.confirm(
            `${targetPartner.name} will receive a sleeping partner connection request and must approve before you can schedule together. Continue?`
          );
          if (!ok) {
            cb.checked = false;
            return;
          }

          cb.disabled = true;
          try {
            await createAndSubmitPartnerConnectionProposal({
              CalendarSync,
              state,
              initiatorPartner: editPartner,
              targetPartner,
              actingUserName: getCurrentUserName()
            });
            CalendarSync.config = state.config;
            showToast(`Connection request sent to ${targetPartner.name}.`, 'success');
            renderView();
          } catch (err) {
            cb.checked = false;
            showToast(err?.message || 'Failed to send connection request.', 'error');
          } finally {
            cb.disabled = false;
          }
          return;
        }

        const existing = resolvePartnerLimitEntry(editPartner, targetName);
        if (isApprovedPartnerConnection(existing)) {
          cb.disabled = true;
          try {
            removeBidirectionalApprovedConnection(state.config, editPartner, targetPartner);
            CalendarSync.config = state.config;
            await persistHouseholdConfig(`Removed sleeping partner connection with ${targetName}`);
            showToast('Sleeping partner connection removed.', 'info');
            renderView();
          } catch (err) {
            cb.checked = true;
            showToast(err?.message || 'Failed to remove connection.', 'error');
          } finally {
            cb.disabled = false;
          }
          return;
        }

        if (!isPendingPartnerConnection(existing)) return;

        const proposal = findPartnerConnectionProposal(state.events, existing.proposalId);
        cb.disabled = true;
        try {
          if (proposal && getWorkflowState(proposal) === WORKFLOW.PROPOSED) {
            await CalendarSync.retractProposal(proposal.id);
          } else if (proposal) {
            await CalendarSync.deleteEvent(proposal.id);
          } else {
            clearPartnerConnectionEntry(state.config, editPartner.id, targetName);
            CalendarSync.config = state.config;
            await persistHouseholdConfig('Sleeping partner request cleared');
          }
          state.events = CalendarSync.events;
          showToast('Connection request withdrawn.', 'info');
          renderView();
        } catch (err) {
          cb.checked = true;
          showToast(err?.message || 'Failed to withdraw connection request.', 'error');
        } finally {
          cb.disabled = false;
        }
      })();
    });
  });
}

export function bindEditPartnerEvents() {
  document.getElementById('btn-edit-partner-back')?.addEventListener('click', () => {
    window.location.hash = '#logistics';
  });

  const editPartnerId = document.getElementById('edit-partner-id')?.value;
  const editPartner = state.config.partners.find(p => p.id === editPartnerId);
  const getSelectedAvatar = bindAvatarPicker('#edit-partner-avatar-options', {
    initialUrl: editPartner?.avatar,
    onError: (msg) => showToast(msg, 'warning')
  });
  bindEditPartnerSleepingConnections(editPartner);

  document.getElementById('btn-save-edit-partner')?.addEventListener('click', async () => {
    const partnerId = document.getElementById('edit-partner-id').value;
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner) return;

    const name = document.getElementById('edit-partner-name').value.trim();
    if (!name) {
      showToast('Display Name is required.', 'warning');
      return;
    }

    const profileUpdates = {
      name,
      avatar: getSelectedAvatar(),
      notificationEmail: document.getElementById('edit-partner-notification-email')?.value.trim() || '',
      googleEmail: document.getElementById('edit-partner-google-email')?.value.trim() || ''
    };

      if (!isPartnerPassive(partner)) {
      profileUpdates.username = document.getElementById('edit-partner-username')?.value.trim();
      profileUpdates.password = document.getElementById('edit-partner-password')?.value.trim();
      const roleEl = document.getElementById('edit-partner-role');
      if (hasAdminSessionAccess() && roleEl) {
        partner.role = roleEl.value;
      }
      partner.rules = partner.rules || {};
      partner.rules.minSoloNights = parseInt(document.getElementById('edit-partner-solo-nights')?.value, 10) || 2;
      delete partner.rules.maxSoloNights;
    }

    void updatePartnerProfile(partnerId, profileUpdates)
      .then(() => {
        showToast(`Partner "${name}" updated.`, 'success');
        window.location.hash = '#logistics';
      })
      .catch(() => {});
  });

  document.getElementById('btn-delete-edit-partner')?.addEventListener('click', async () => {
    const partnerId = document.getElementById('edit-partner-id').value;
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner) return;

    if (state.currentUser?.id === partnerId) {
      showToast('You cannot delete your own account.', 'warning');
      return;
    }

    const adminCount = state.config.partners.filter(p => p.role === 'Admin' && !isPartnerPassive(p)).length;
    if (partner.role === 'Admin' && adminCount <= 1) {
      showToast('Cannot delete the only admin account.', 'warning');
      return;
    }

    if (!confirm(`Delete partner "${partner.name}"? This cannot be undone.`)) return;

    const removedUsername = partner.username || null;
    const btnDelete = document.getElementById('btn-delete-edit-partner');
    if (btnDelete) btnDelete.disabled = true;
    try {
      CalendarSync.removePartner(partnerId);
      state.config = CalendarSync.config;
      state.events = CalendarSync.events;
      await persistHouseholdConfig(`Deleted partner: ${partner.name}`);
      if (removedUsername) {
        await releaseUsernameGlobally(removedUsername, state.config.householdId, partnerId);
      }
      logUserAction(`Partner "${partner.name}" deleted.`, 'warning');
      showToast(`Partner "${partner.name}" deleted.`, 'success');
      window.location.hash = '#logistics';
    } catch {
      showToast('Failed to delete partner. Please try again.', 'error');
    } finally {
      if (btnDelete) btnDelete.disabled = false;
    }
  });
}

export function bindEditHomeEvents() {
  document.getElementById('btn-edit-home-back')?.addEventListener('click', () => {
    window.location.hash = '#logistics';
  });

  const bedroomsInput = document.getElementById('edit-home-bedrooms-count');
  const bedroomContainer = document.getElementById('bedroom-names-container');

  if (bedroomsInput && bedroomContainer) {
    bedroomsInput.addEventListener('input', () => {
      const homeId = document.getElementById('edit-home-id').value;
      const home = state.config.residences.find(h => h.id === homeId);
      const count = Math.max(1, parseInt(bedroomsInput.value) || 1);
      let inputsHtml = '<h4 class="font-label-md" style="font-weight: bold;">Bedroom Names</h4>';
      for (let i = 0; i < count; i++) {
        const existing = home?.bedroomDetails?.[i]?.name || '';
        inputsHtml += `<div class="form-group" style="margin-bottom: var(--space-xs);"><input class="form-input bedroom-name-input" type="text" data-index="${i}" value="${existing}"/></div>`;
      }
      bedroomContainer.innerHTML = inputsHtml;
    });
  }

  document.getElementById('btn-save-edit-home')?.addEventListener('click', () => {
    const homeId = document.getElementById('edit-home-id').value;
    const home = state.config.residences.find(h => h.id === homeId);
    if (!home) return;

    const name = document.getElementById('edit-home-name').value.trim();
    const address = document.getElementById('edit-home-address').value.trim();
    const bedroomsCount = Math.max(1, parseInt(bedroomsInput.value) || 1);

    if (!name) {
      showToast('Home Name is required.', 'warning');
      return;
    }

    const bedroomInputs = document.querySelectorAll('.bedroom-name-input');
    const bedroomsList = [];
    for (let i = 0; i < bedroomsCount; i++) {
      const input = Array.from(bedroomInputs).find(inp => parseInt(inp.dataset.index) === i);
      const existing = home.bedroomDetails?.[i];
      const bedId = existing?.id || `r_${Date.now()}_${i}`;
      bedroomsList.push({ id: bedId, name: (input?.value.trim()) || `Bedroom ${i + 1}` });
    }

    const associatedPeople = [];
    document.querySelectorAll('.home-associated-partner').forEach(cb => {
      if (cb.checked) associatedPeople.push(cb.dataset.partnerName);
    });

    home.name = name;
    home.address = address;
    home.bedrooms = bedroomsCount;
    home.bedroomDetails = bedroomsList;
    home.associatedPeople = associatedPeople;

    void persistHouseholdConfig(`Updated home: ${name}`)
      .then(() => {
        showToast(`Home "${name}" updated.`, 'success');
        window.location.hash = '#logistics';
      })
      .catch(() => {});
  });

  document.getElementById('btn-delete-edit-home')?.addEventListener('click', () => {
    const homeId = document.getElementById('edit-home-id').value;
    const home = state.config.residences.find(h => h.id === homeId);
    if (!home) return;

    if (!confirm(`Delete home "${home.name}"? This cannot be undone.`)) return;

    CalendarSync.removeHome(homeId);
    state.config = CalendarSync.config;
    state.events = CalendarSync.events;
    logUserAction(`Home "${home.name}" deleted.`, 'warning');
    showToast(`Home "${home.name}" deleted.`, 'success');
    window.location.hash = '#logistics';
  });
}

export function bindActivatePartnerEvents() {
  document.getElementById('btn-activate-partner-back')?.addEventListener('click', () => {
    window.location.hash = '#logistics';
  });

  bindSleepingPartnerCheckboxes();

  document.getElementById('btn-submit-activate')?.addEventListener('click', async () => {
    const partnerId = document.getElementById('activate-partner-select').value;
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner || !isPartnerPassive(partner)) {
      showToast('Select a passive partner to activate.', 'warning');
      return;
    }

    const username = document.getElementById('activate-username').value.trim();
    const password = document.getElementById('activate-password').value.trim();
    const role = document.getElementById('activate-role').value;
    const googleEmail = normalizeEmail(document.getElementById('activate-google-email')?.value);

    if (!username || !password) {
      showToast('Username and password are required.', 'warning');
      return;
    }

    if (state.config.partners.some(p => p.username === username && p.id !== partnerId)) {
      showToast('Username already in use.', 'warning');
      return;
    }

    const usernameCheck = await assertUsernameAvailable(username, {
      config: state.config,
      partnerId,
      householdId: state.config.householdId
    });
    if (!usernameCheck.ok) {
      showToast(usernameCheck.message, 'warning');
      return;
    }

    const claim = await claimUsernameGlobally(username, state.config.householdId, partnerId);
    if (!claim.ok) {
      showToast(claim.message, 'warning');
      return;
    }

    partner.username = username;
    partner.passwordHash = await hashPassword(password, partnerId);
    delete partner.password;
    partner.role = role;
    if (googleEmail) partner.googleEmail = googleEmail;
    delete partner.passive;

    const rules = {};
    const checkboxes = document.querySelectorAll('.sleeping-partner-checkbox');
    const anyChecked = Array.from(checkboxes).some(c => c.checked);
    if (anyChecked) {
      rules.minSoloNights = parseInt(document.getElementById('activate-solo-nights').value, 10) || 2;
      delete rules.maxSoloNights;
      rules.partnerLimits = {};
      checkboxes.forEach(cb => {
        if (cb.checked) {
          const pName = cb.dataset.partnerName;
          rules.partnerLimits[pName] = {
            min: parseInt(cb.closest('div').querySelector('.partner-min-nights').value) || 0,
            max: parseInt(cb.closest('div').querySelector('.partner-max-nights').value) || 7
          };
        }
      });
    }
    partner.rules = rules;

    const btnSubmit = document.getElementById('btn-submit-activate');
    if (btnSubmit) btnSubmit.disabled = true;
    try {
      await persistHouseholdConfig(`Activated partner: ${partner.name}`);
      const claim = await claimUsernameAfterPersist(username, state.config.householdId, partnerId);
      if (!claim.ok) {
        showToast(claim.message, 'warning');
        return;
      }
      await notifyPartnerCalendarShare(partner.name, googleEmail, { action: 'activated' });
      window.location.hash = '#logistics';
    } catch {
      showToast('Failed to activate partner. Please try again.', 'error');
    } finally {
      if (btnSubmit) btnSubmit.disabled = false;
    }
  });
}
