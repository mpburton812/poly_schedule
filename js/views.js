/**
 * PolySchedule HTML Views Renderer
 * Generates dynamic template contents for all SPA screens.
 */

import { RulesEngine } from './rules.js';

export const Views = {
  /**
   * Renders the Weekly Schedule View
   */
  schedule(state) {
    const today = state.selectedDate ? new Date(state.selectedDate) : new Date();
    // Monday of current week
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(today.setDate(diff));
    
    const weekdays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekdays.push(d);
    }

    const monthName = startOfWeek.toLocaleString('default', { month: 'short' });
    const weekLabel = `Week of ${monthName} ${startOfWeek.getDate()}`;

    // Filter confirmed events for this week
    const weekEvents = state.events.filter(e => {
      const eDate = new Date(e.start);
      const mon = new Date(startOfWeek);
      mon.setHours(0,0,0,0);
      const sun = new Date(startOfWeek);
      sun.setDate(startOfWeek.getDate() + 7);
      sun.setHours(23,59,59,999);
      
      const isCorrectWeek = eDate >= mon && eDate < sun && e.status === 'confirmed';
      if (!isCorrectWeek) return false;

      // Filter by selected partner
      if (state.filterPartner && state.filterPartner !== 'all') {
        const hasPartner = e.participants && e.participants.some(p => 
          p.split(' ')[0].toLowerCase() === state.filterPartner.split(' ')[0].toLowerCase()
        );
        if (!hasPartner) return false;
      }

      // Filter by selected house/residence
      if (state.filterResidence && state.filterResidence !== 'all') {
        if (e.type === 'sleeping') {
          if (e.homeId !== state.filterResidence) return false;
        } else {
          const resObj = state.config?.residences?.find(r => r.id === state.filterResidence);
          if (!resObj || !e.location || !e.location.toLowerCase().includes(resObj.name.toLowerCase())) {
            return false;
          }
        }
      }

      return true;
    });

    // Extract pending proposals for summary
    const pendingProposals = state.events.filter(e => e.status === 'pending');

    let daysHtml = '';
    
    // Render Monday through Friday
    for (let i = 0; i < 5; i++) {
      const day = weekdays[i];
      const dayStr = day.toDateString();
      
      // Filter events for this day
      const dayEvents = weekEvents.filter(e => {
        const startD = new Date(e.start);
        return startD.toDateString() === dayStr;
      });

      // Sort: normal events first, then sleeping
      dayEvents.sort((a, b) => (a.type === 'sleeping' ? 1 : -1));

      let cardsHtml = '';
      if (dayEvents.length === 0) {
        cardsHtml = `
          <div style="height: 100px; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--outline-variant); border-radius: var(--radius-default); color: var(--on-surface-variant); font-size: 0.75rem;">
            No Events
          </div>
        `;
      } else {
        dayEvents.forEach(e => {
          if (e.type === 'sleeping') {
            cardsHtml += `
              <div class="card-sleeping" data-id="${e.id}">
                <div class="sleeping-header">
                  <span class="material-symbols-outlined" style="font-size: 16px;">bed</span>
                  <span class="font-label-md">SLEEPING</span>
                </div>
                <div class="sleeping-content">
                  ${e.roomName || 'Room'}: ${e.participants.join(' & ')}
                </div>
              </div>
            `;
          } else {
            // Avatars stack
            let avatarsHtml = '';
            e.participants.forEach(pName => {
              const p = state.config.partners.find(part => part.name === pName);
              const color = pName === 'Alex' ? 'var(--primary-fixed-dim)' : pName === 'Sam' ? 'var(--secondary-fixed-dim)' : 'var(--tertiary-fixed-dim)';
              if (p && p.avatar) {
                avatarsHtml += `<div class="avatar-stack-item" style="background-color: ${color};"><img src="${p.avatar}" alt="${pName}"/></div>`;
              } else {
                avatarsHtml += `<div class="avatar-stack-item" style="background-color: var(--outline-variant); font-size: 8px; color: var(--on-surface-variant); display: flex; align-items: center; justify-content: center; font-weight: bold;">${pName[0]}</div>`;
              }
            });

            const timeStr = new Date(e.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
            cardsHtml += `
              <div class="card-event" data-id="${e.id}">
                <div class="event-title">${e.title}</div>
                <div class="event-meta font-label-sm">${timeStr} • ${e.participants.length} Attendees</div>
                <div class="avatar-stack">${avatarsHtml}</div>
              </div>
            `;
          }
        });
      }

      daysHtml += `
        <div class="day-column">
          <div class="day-header">
            <span class="font-label-md day-name">${day.toLocaleString('default', { weekday: 'short' }).toUpperCase()} ${day.getDate()}</span>
            <span class="day-indicator ${dayEvents.length > 0 ? 'has-events' : ''}"></span>
          </div>
          ${cardsHtml}
        </div>
      `;
    }

    // Weekend Bento Layout (Saturday/Sunday)
    const sat = weekdays[5];
    const sun = weekdays[6];
    
    const satEvents = weekEvents.filter(e => new Date(e.start).toDateString() === sat.toDateString());
    const sunEvents = weekEvents.filter(e => new Date(e.start).toDateString() === sun.toDateString());
    
    // Find weekend retreat if group is together
    const weekendRetreat = weekEvents.find(e => e.title.toLowerCase().includes('retreat') || e.title.toLowerCase().includes('trip'));

    let retreatHtml = '';
    if (weekendRetreat) {
      retreatHtml = `
        <div class="bento-weekend">
          <div>
            <span class="font-label-md" style="opacity: 0.8; letter-spacing: 1.5px; text-transform: uppercase;">Full Group</span>
            <h3 class="font-headline-lg" style="margin-top: 4px; line-height: 1.1;">${weekendRetreat.title}</h3>
            <div class="bento-weekend-details font-body-md">
              <span class="material-symbols-outlined" style="font-size: 16px;">location_on</span>
              <span>${weekendRetreat.location || 'Retreat Location'}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      retreatHtml = `
        <div class="bento-weekend" style="background-color: var(--surface-container-high); color: var(--on-surface);">
          <div>
            <span class="font-label-md" style="opacity: 0.8; text-transform: uppercase;">Weekend Schedule</span>
            <h3 class="font-headline-lg" style="margin-top: 4px; line-height: 1.1;">No retreats scheduled</h3>
            <div class="bento-weekend-details font-body-md">
              <span class="material-symbols-outlined" style="font-size: 16px;">hotel</span>
              <span>Sleep logic operates locally</span>
            </div>
          </div>
        </div>
      `;
    }

    const satAct = satEvents.find(e => e.type !== 'sleeping') || { title: 'Hiking Loop', location: 'Parks' };
    const sunAct = sunEvents.find(e => e.type !== 'sleeping') || { title: 'Homebound', location: 'Home' };

    // Proposals Center mini summary
    let proposalsListHtml = '';
    if (pendingProposals.length === 0) {
      proposalsListHtml = `
        <div style="grid-column: span 3; text-align: center; padding: var(--space-lg) 0; border: 1px dashed var(--outline-variant); border-radius: var(--radius-md); color: var(--on-surface-variant); font-size: 0.85rem;">
          No pending proposals. You're all caught up!
        </div>
      `;
    } else {
      pendingProposals.slice(0, 3).forEach(p => {
        const countAccepted = Object.values(p.responses || {}).filter(r => r.status === 'accept').length;
        const totalVotes = Object.keys(p.responses || {}).length;
        const awaitName = Object.keys(p.responses || {}).find(k => p.responses[k].status === 'pending') || 'Others';
        const typeBadge = p.type === 'sleeping' ? 'bed' : 'forum';
        
        proposalsListHtml += `
          <div class="bento-card proposal-summary-card" data-id="${p.id}" style="cursor: pointer; flex-direction: row; gap: var(--space-md); align-items: center; border: 1px solid var(--outline-variant); background-color: var(--surface); transition: background-color 0.2s;">
            <div style="background-color: rgba(166,57,58,0.1); color: var(--primary); padding: 12px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined">${typeBadge}</span>
            </div>
            <div>
              <h4 class="font-title-lg" style="font-size: 1rem; font-weight: 700;">${p.title}</h4>
              <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 2px;">${countAccepted}/${totalVotes} voted. Awaiting ${awaitName}.</p>
            </div>
          </div>
        `;
      });
    }

    const partnerOptions = (state.config?.partners || []).map(p => 
      `<option value="${p.name}" ${state.filterPartner === p.name ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    const residenceOptions = (state.config?.residences || []).map(r => 
      `<option value="${r.id}" ${state.filterResidence === r.id ? 'selected' : ''}>${r.name}</option>`
    ).join('');

    return `
      <!-- Filter and Week Selector Header -->
      <section class="filter-bar">
        <div class="week-selector-container" style="position: relative; display: inline-block;">
          <button class="chip active" id="btn-week-selector">
            <span>${weekLabel}</span>
            <span class="material-symbols-outlined" style="font-size: 16px;">expand_more</span>
          </button>
          <input type="date" id="input-week-selector" value="${startOfWeek.toISOString().split('T')[0]}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;"/>
        </div>
        
        <div style="position: relative; display: inline-block;">
          <select class="chip" id="filter-partner-select" style="border: 1px solid var(--outline-variant); border-radius: var(--radius-full); padding: 4px 12px; font-family: var(--font-body); font-size: 0.875rem; background-color: var(--surface); color: var(--on-surface); cursor: pointer; outline: none; transition: background-color 0.2s, border-color 0.2s;">
            <option value="all" ${state.filterPartner === 'all' ? 'selected' : ''}>All Partners</option>
            ${partnerOptions}
          </select>
        </div>

        <div style="position: relative; display: inline-block;">
          <select class="chip" id="filter-residence-select" style="border: 1px solid var(--outline-variant); border-radius: var(--radius-full); padding: 4px 12px; font-family: var(--font-body); font-size: 0.875rem; background-color: var(--surface); color: var(--on-surface); cursor: pointer; outline: none; transition: background-color 0.2s, border-color 0.2s;">
            <option value="all" ${state.filterResidence === 'all' ? 'selected' : ''}>All Houses</option>
            ${residenceOptions}
          </select>
        </div>
      </section>

      <!-- Weekly Schedule Grid -->
      <section class="week-grid">
        ${daysHtml}
        
        <!-- Sat & Sun bento structure -->
        <div class="day-column" style="grid-column: span 2; display: flex; flex-direction: column; gap: var(--space-base); background: transparent; padding: 0;">
          ${retreatHtml}
          
          <div class="bento-split">
            <div class="bento-sub-card">
              <span class="font-label-sm" style="color: var(--on-surface-variant);">SAT ${sat.getDate()}</span>
              <span class="font-label-md" style="background-color: var(--secondary-container); color: var(--on-secondary-container); padding: 1px 8px; border-radius: var(--radius-full); width: fit-content; font-size: 10px;">Activity</span>
              <p class="font-body-md" style="font-weight: bold; margin-top: 4px;">${satAct.title}</p>
            </div>
            <div class="bento-sub-card">
              <span class="font-label-sm" style="color: var(--on-surface-variant);">SUN ${sun.getDate()}</span>
              <span class="font-label-md" style="background-color: var(--tertiary-container); color: var(--on-tertiary-container); padding: 1px 8px; border-radius: var(--radius-full); width: fit-content; font-size: 10px;">Travel</span>
              <p class="font-body-md" style="font-weight: bold; margin-top: 4px;">${sunAct.title}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Active Proposals Section -->
      <section style="margin-top: var(--space-xl);">
        <h3 class="font-headline-lg" style="margin-bottom: var(--space-md); font-size: 1.5rem; font-weight: 700; color: var(--on-surface);">Active Proposals</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-md);">
          ${proposalsListHtml}
        </div>
      </section>
    `;
  },

  /**
   * Renders the Proposals Center View
   */
  proposals(state, activeTab = 'pending') {
    // Filter proposals based on status
    let filtered = [];
    if (activeTab === 'pending') {
      filtered = state.events.filter(e => e.status === 'pending');
    } else if (activeTab === 'reviewed') {
      // User has voted, or proposal is waiting for others but user already accepted
      filtered = state.events.filter(e => e.status === 'pending' && e.responses[state.currentUser?.name]?.status !== 'pending');
    } else {
      // Completed / Confirmed
      filtered = state.events.filter(e => e.status === 'confirmed');
    }

    let listHtml = '';
    if (filtered.length === 0) {
      listHtml = `
        <div style="text-align: center; padding: 48px 0; color: var(--on-surface-variant);">
          <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.3;">checklist_rtl</span>
          <p class="font-title-lg" style="margin-top: var(--space-sm);">No proposals found in "${activeTab}"</p>
        </div>
      `;
    } else {
      filtered.forEach(p => {
        const isReceiver = p.proposer !== state.currentUser?.name;
        const userVote = p.responses?.[state.currentUser?.name]?.status || 'pending';
        
        // graphical schedule impact calculation
        const startH = new Date(p.start).getHours();
        const durationH = Math.round((new Date(p.end) - new Date(p.start)) / (1000 * 60 * 60));
        
        // Map to percentages for timeline 08:00 to 00:00 (16 hour span)
        const leftPercent = Math.max(0, Math.min(100, ((startH - 8) / 16) * 100));
        const widthPercent = Math.max(10, Math.min(100 - leftPercent, (durationH / 16) * 100));

        // Format Date / Duration String
        const startDate = new Date(p.start);
        const dateStr = startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = `${startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} - ${new Date(p.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

        // Build Response List details
        let responsesHtml = '';
        Object.keys(p.responses || {}).forEach(k => {
          const r = p.responses[k];
          const isPending = r.status === 'pending';
          const isReject = r.status === 'reject';
          const icon = isPending ? 'pending' : isReject ? 'cancel' : 'check_circle';
          const colorClass = isPending ? 'text-outline' : isReject ? 'var(--error)' : 'var(--secondary)';
          const nameLabel = k === state.currentUser?.name ? 'You' : k.split(' ')[0];
          
          responsesHtml += `
            <div style="margin-bottom: var(--space-xs);">
              <div class="review-user-row">
                <div class="review-user-info">
                  <span class="material-symbols-outlined" style="color: ${colorClass}; font-size: 18px;">${icon}</span>
                  <span>${nameLabel}</span>
                </div>
                <span class="font-label-sm" style="color: var(--on-surface-variant);">${isPending ? 'Awaiting' : r.status === 'accept' ? 'Approved' : 'Rejected'}</span>
              </div>
              ${r.comment ? `<p class="review-comment">"${r.comment}"</p>` : ''}
            </div>
          `;
        });

        // Proposer vs. Receiver actions
        let actionsHtml = '';
        if (p.status === 'pending') {
          if (isReceiver && userVote === 'pending') {
            actionsHtml = `
              <div style="display: flex; gap: var(--space-base); margin-top: var(--space-md);">
                <button class="btn btn-filled vote-btn" data-id="${p.id}" data-vote="accept" style="flex: 1;">Accept</button>
                <button class="btn btn-outline vote-btn" data-id="${p.id}" data-vote="reject" style="flex: 1;">Reject</button>
                <button class="btn-icon-only comment-trigger" data-id="${p.id}" style="border: 1px solid var(--outline); border-radius: var(--radius-full); width: 44px; height: 44px;">
                  <span class="material-symbols-outlined">chat_bubble</span>
                </button>
              </div>
            `;
          } else if (!isReceiver) {
            // Proposer Perspective
            actionsHtml = `
              <div style="display: flex; gap: var(--space-base); margin-top: var(--space-md);">
                <button class="btn btn-tonal modify-proposal-btn" data-id="${p.id}" style="flex: 1;">
                  <span class="material-symbols-outlined" style="font-size: 16px;">edit</span> Modify
                </button>
                <button class="btn btn-error cancel-proposal-btn" data-id="${p.id}" style="flex: 1;">
                  <span class="material-symbols-outlined" style="font-size: 16px;">delete</span> Cancel
                </button>
                <button class="btn btn-outline retract-proposal-btn" data-id="${p.id}" style="padding: var(--space-sm) var(--space-md);">Retract</button>
              </div>
            `;
          } else {
            actionsHtml = `
              <div style="margin-top: var(--space-md); padding: var(--space-sm); background-color: var(--surface-container-high); border-radius: var(--radius-default); text-align: center; color: var(--on-surface-variant); font-size: 0.85rem;">
                You voted: <strong style="color: ${userVote === 'accept' ? 'var(--secondary)' : 'var(--error)'};">${userVote.toUpperCase()}</strong>. Waiting on others.
              </div>
            `;
          }
        }

        listHtml += `
          <div class="proposal-card ${p.type === 'sleeping' ? 'sleeping' : ''}" id="prop-${p.id}">
            <div class="proposal-header">
              <div>
                <span class="proposal-badge ${p.type}">${p.type.toUpperCase()} PROPOSAL</span>
                <h3 class="font-title-lg" style="margin-top: 4px; font-weight: 700; color: var(--on-surface);">${p.title}</h3>
              </div>
              <div style="text-align: right;">
                <span class="font-label-sm" style="color: var(--on-surface-variant); display: block;">PROPOSED BY</span>
                <span class="font-body-md" style="font-weight: 600;">${p.proposer}</span>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr; gap: var(--space-md); margin-top: var(--space-xs);">
              <div class="proposal-meta-row">
                <div class="proposal-meta-item">
                  <span class="material-symbols-outlined" style="font-size: 18px;">schedule</span>
                  <span>${dateStr} • ${timeStr}</span>
                </div>
                <div class="proposal-meta-item">
                  <span class="material-symbols-outlined" style="font-size: 18px;">${p.type === 'sleeping' ? 'bed' : 'location_on'}</span>
                  <span>${p.type === 'sleeping' ? `${p.homeName || 'Home'}: ${p.roomName || 'Room'}` : p.location || 'No location set'}</span>
                </div>
              </div>

              <!-- Graphical impact bars -->
              <div class="impact-bar-container">
                <div class="impact-bar-title">${startDate.toLocaleString(undefined, { weekday: 'short' }).toUpperCase()} SCHEDULE IMPACT</div>
                <div class="impact-bar">
                  <!-- Mock existing blocks -->
                  <div class="impact-segment existing" style="width: 20%; left: 5%;"></div>
                  <div class="impact-segment existing" style="width: 15%; left: 45%;"></div>
                  <!-- Proposed block -->
                  <div class="impact-segment proposed" style="width: ${widthPercent}%; left: ${leftPercent}%;"></div>
                </div>
                <div class="impact-scale">
                  <span>08:00</span>
                  <span>16:00</span>
                  <span>00:00</span>
                </div>
              </div>
            </div>

            <!-- Approval / Review Status -->
            <div class="review-box" style="margin-top: var(--space-sm);">
              ${responsesHtml}
            </div>

            ${actionsHtml}
          </div>
        `;
      });
    }

    return `
      <!-- Tab Bar -->
      <nav class="tabs-nav">
        <button class="tab-button ${activeTab === 'pending' ? 'active' : ''}" id="btn-tab-pending">Pending</button>
        <button class="tab-button ${activeTab === 'reviewed' ? 'active' : ''}" id="btn-tab-reviewed">Reviewed</button>
        <button class="tab-button ${activeTab === 'completed' ? 'active' : ''}" id="btn-tab-completed">Completed</button>
      </nav>

      <!-- Proposals List -->
      <section style="display: flex; flex-direction: column; gap: var(--space-lg);">
        ${listHtml}
      </section>
    `;
  },

  /**
   * Renders the Create Proposal View
   */
  createProposal(state, type = 'event') {
    // Populate partner options (checkboxes or select)
    let circleHtml = '';
    state.config.partners.forEach(partner => {
      // Skip current user
      if (partner.name === state.currentUser?.name) return;
      
      circleHtml += `
        <div class="circle-partner-option" data-name="${partner.name}" style="display: flex; flex-direction: column; align-items: center; gap: var(--space-xs); cursor: pointer; transition: opacity var(--transition-speed); opacity: 0.6;">
          <div class="profile-avatar" style="width: 56px; height: 56px; border: 2px solid var(--outline-variant); border-radius: var(--radius-full); overflow: hidden;">
            <img src="${partner.avatar}" alt="${partner.name}"/>
          </div>
          <span class="font-label-md">${partner.name.split(' ')[0]}</span>
        </div>
      `;
    });

    // Generate location / residences dropdown
    let locationHtml = '';
    if (type === 'sleeping') {
      let residenceOptions = '';
      state.config.residences.forEach(home => {
        residenceOptions += `<option value="${home.id}">${home.name}</option>`;
      });

      locationHtml = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); margin-bottom: var(--space-lg);">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="sleep-home-select">Residence</label>
            <select class="form-input" id="sleep-home-select" style="border-radius: var(--radius-default); border: 1px solid var(--outline);">
              ${residenceOptions}
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="sleep-room-select">Bedroom</label>
            <select class="form-input" id="sleep-room-select" style="border-radius: var(--radius-default); border: 1px solid var(--outline);">
              <option value="r1">North Bedroom</option>
              <option value="r2">Loft</option>
              <option value="r3">Guest Suite</option>
            </select>
          </div>
        </div>
      `;
    } else {
      locationHtml = `
        <div class="form-group">
          <label class="form-label">Location</label>
          <div class="bg-surface-container" style="border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--outline-variant);">
            <div style="display: flex; align-items: center; padding: var(--space-sm) var(--space-md); gap: var(--space-md); background-color: var(--surface-container-lowest); border-bottom: 1px solid var(--outline-variant);">
              <span class="material-symbols-outlined text-primary">location_on</span>
              <input class="form-input" id="event-location" placeholder="Search for location or address..." type="text" style="border: none; padding: 0; background: transparent; border-radius: 0; flex-grow: 1;"/>
            </div>
            <div class="mock-map">
              <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBNYyFWbt4bipzEMxmhbDsYEY4hV9stPsQRHMtZalOqgTDKD2ntxtQktX6Nb-VLbj7dX99qnS40hkv6UFA3IHaPWBsLfP5lQUsodnFzpyCk1UuHUT4iBPkEYl_SG0HjzpKNrxFNqKHH-iiqYHSfXtjJSIrqX_YSbudmR_ITNEcKB2l-MGTbjFfQ-ZPS6le_l_XuIQFeov5kxfck7VLd9McmRwqkHnkEQGzVOJdPSVCcepeFS63j-NJt-Q-9xX1hnmm3Oz4k75AOUnk" alt="Map View"/>
              <span class="material-symbols-outlined mock-map-pin">location_on</span>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <!-- Back Header Row -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-create-back" aria-label="Cancel">
            <span class="material-symbols-outlined">close</span>
          </button>
          <h2 class="font-title-lg">New Proposal</h2>
        </div>
        <button class="btn btn-filled" id="btn-submit-proposal">Send Proposal</button>
      </div>

      <!-- Toggle Switch Event/Sleep -->
      <div class="switch-selector">
        <button class="switch-btn ${type === 'event' ? 'active' : ''}" id="btn-toggle-event">Event</button>
        <button class="switch-btn ${type === 'sleeping' ? 'active' : ''}" id="btn-toggle-sleeping">Sleeping Arrangement</button>
      </div>

      <!-- Live Logistics Rules Warning Banner -->
      <div class="banner-alert hidden" id="proposal-rules-banner">
        <span class="material-symbols-outlined banner-alert-icon">warning</span>
        <div style="flex-grow: 1;">
          <p class="banner-alert-title" id="banner-warning-title">Extended Stay Alert</p>
          <p class="banner-alert-desc" id="banner-warning-desc">Warning message goes here...</p>
        </div>
        <button class="btn-icon-only" id="banner-warning-close" style="width: 28px; height: 28px; color: inherit;">
          <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
        </button>
      </div>

      <!-- Form Inputs -->
      <section style="display: flex; flex-direction: column;">
        <!-- Title -->
        <div class="form-group">
          <label class="form-label" for="prop-title">Title / Description</label>
          <input class="form-input" id="prop-title" placeholder="${type === 'sleeping' ? 'e.g. Weekend at Lake Cabin' : 'e.g. Dinner & Game Night'}" type="text"/>
        </div>

        <!-- Poly Circle Selection -->
        <div class="form-group">
          <label class="form-label" style="margin-bottom: var(--space-sm);">The Poly Circle (Invitees)</label>
          <div style="display: flex; flex-wrap: wrap; gap: var(--space-lg); padding: var(--space-sm) 0;" id="circle-options-row">
            ${circleHtml}
          </div>
        </div>

        <!-- Date Inputs -->
        <div style="display: grid; grid-template-columns: 1fr; gap: var(--space-lg); margin-bottom: var(--space-lg);">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="prop-start-date">Start Date</label>
            <input class="form-input" id="prop-start-date" type="date" value="${new Date().toISOString().split('T')[0]}"/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="prop-duration">${type === 'sleeping' ? 'Number of Nights' : 'Duration / Time'}</label>
            <input class="form-input" id="prop-duration" placeholder="${type === 'sleeping' ? 'e.g. 2' : 'e.g. 19:00 - 22:00'}" type="text"/>
          </div>
        </div>

        <!-- Dynamic Location block -->
        ${locationHtml}

        <!-- Schedule Context Mini-Calendar -->
        <div class="form-group" style="margin-top: var(--space-md);">
          <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-sm);">
            <label class="form-label">Schedule Context</label>
            <span class="font-label-sm" style="color: var(--on-surface-variant);">Weekly conflict visualization</span>
          </div>
          <div class="impact-bar-container" style="background-color: var(--surface-container-lowest); border: 1px solid var(--outline-variant); padding: var(--space-md);">
            <div class="micro-calendar" id="micro-cal-grid">
              <div class="micro-calendar-header">S</div>
              <div class="micro-calendar-header">M</div>
              <div class="micro-calendar-header">T</div>
              <div class="micro-calendar-header">W</div>
              <div class="micro-calendar-header">T</div>
              <div class="micro-calendar-header">F</div>
              <div class="micro-calendar-header">S</div>
              
              <!-- Dummy cells representing week slots -->
              <div class="micro-calendar-cell"><span class="day-num">19</span></div>
              <div class="micro-calendar-cell active-cell">
                <span class="day-num">20</span>
                <div style="position: absolute; bottom: 8px; left: 8px; right: 8px; background-color: var(--primary); color: white; border-radius: var(--radius-sm); text-align: center; font-size: 8px; padding: 2px 0;">PROPOSED</div>
              </div>
              <div class="micro-calendar-cell"><span class="day-num">21</span><div style="position: absolute; bottom: 8px; left: 8px; right: 8px; background-color: var(--tertiary-container); opacity: 0.5; height: 8px; border-radius: 4px;"></div></div>
              <div class="micro-calendar-cell"><span class="day-num">22</span></div>
              <div class="micro-calendar-cell"><span class="day-num">23</span></div>
              <div class="micro-calendar-cell" style="background-color: rgba(186, 26, 26, 0.05); border-color: rgba(186, 26, 26, 0.2);"><span class="day-num" style="color: var(--error);">24</span><div style="position: absolute; bottom: 8px; left: 8px; right: 8px; background-color: var(--error); height: 4px; border-radius: 2px;"></div></div>
              <div class="micro-calendar-cell"><span class="day-num">25</span></div>
            </div>
            <p id="micro-cal-conflict-notice" class="font-label-sm" style="text-align: center; color: var(--error); margin-top: var(--space-md); display: none;">
              Potential conflict detected: Sam is travelling.
            </p>
          </div>
        </div>
      </section>
    `;
  },

  /**
   * Renders the Logistics & Configuration View
   */
  logistics(state) {
    let profilesHtml = '';
    state.config.partners.forEach(partner => {
      let badge = partner.role === 'Admin' ? `<span class="font-label-sm" style="background-color: var(--secondary-container); color: var(--on-secondary-container); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold;">ADMIN</span>` : '';
      let defaultHomeObj = state.config.residences.find(r => r.id === partner.defaultHome);
      let homeName = defaultHomeObj ? defaultHomeObj.name : 'None';
      
      profilesHtml += `
        <div class="bento-card" style="flex-direction: row; gap: var(--space-md); align-items: center; border: 1px solid var(--outline-variant); padding: var(--space-md);">
          <div class="profile-avatar" style="width: 56px; height: 56px; border-radius: var(--radius-full); overflow: hidden; flex-shrink: 0;">
            <img src="${partner.avatar}" alt="${partner.name}"/>
          </div>
          <div style="flex-grow: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h4 class="font-title-lg" style="font-size: 1.05rem; font-weight: 700;">${partner.name}</h4>
              ${badge}
            </div>
            <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 2px;">Default Home: <strong style="color: var(--secondary);">${homeName}</strong></p>
          </div>
        </div>
      `;
    });

    let homesHtml = '';
    state.config.residences.forEach(home => {
      homesHtml += `
        <div class="bento-card" style="padding: var(--space-md); background-color: var(--surface-container-high); border: none; cursor: pointer; transition: border 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="display: flex; gap: var(--space-md);">
              <div style="width: 44px; height: 44px; background-color: var(--primary-fixed); color: var(--on-primary-fixed); border-radius: var(--radius-default); display: flex; align-items: center; justify-content: center;">
                <span class="material-symbols-outlined">${home.name.includes('Loft') ? 'apartment' : 'bungalow'}</span>
              </div>
              <div>
                <h4 class="font-title-lg" style="font-size: 1.05rem; font-weight: 700;">${home.name}</h4>
                <p class="font-label-sm" style="color: var(--on-surface-variant);">${home.address}</p>
              </div>
            </div>
            <span class="font-label-sm" style="color: var(--secondary); font-weight: bold; display: flex; align-items: center; gap: 4px;">
              <span style="width: 6px; height: 6px; border-radius: var(--radius-full); background-color: var(--secondary); display: inline-block;"></span>
              ${home.bedrooms} Bedrooms
            </span>
          </div>
        </div>
      `;
    });

    // Generate simulated live logs
    let logsHtml = '';
    state.logs.forEach(log => {
      let colorClass = log.type === 'error' ? 'var(--error)' : log.type === 'warning' ? 'var(--tertiary)' : 'inherit';
      logsHtml += `
        <p class="console-line">
          <span class="console-time">[${log.time}]</span>
          <span style="color: ${colorClass};">${log.message}</span>
        </p>
      `;
    });

    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">Logistics & Configuration</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px; max-width: 650px;">
          Manage collective residences, sleeping quotas, partner preferences, and view operational developer logs.
        </p>
      </div>

      <div class="bento-grid">
        <!-- Collective Profiles -->
        <section class="bento-span-8" style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="font-title-lg" style="display: flex; align-items: center; gap: var(--space-base); font-weight: 700;">
              <span class="material-symbols-outlined text-primary">group</span> Collective Profiles
            </h3>
            <button class="btn btn-filled" id="btn-add-partner" style="padding: var(--space-xs) var(--space-md); font-size: 0.85rem;">
              <span class="material-symbols-outlined" style="font-size: 16px;">person_add</span> Add Partner
            </button>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-md);">
            ${profilesHtml}
          </div>
        </section>

        <!-- Sleep Rules -->
        <aside class="bento-span-4 bento-card rules-card">
          <div>
            <h3 class="font-title-lg" style="display: flex; align-items: center; gap: var(--space-base); font-weight: 700; color: var(--on-tertiary-fixed);">
              <span class="material-symbols-outlined">bedtime</span> Sleep Rules
            </h3>
            <ul style="list-style: none; margin-top: var(--space-md); display: flex; flex-direction: column; gap: var(--space-md);">
              <li style="display: flex; justify-content: space-between; align-items: center;">
                <span class="font-body-md" style="color: var(--on-tertiary-fixed-variant);">Max Solo Nights</span>
                <span class="font-label-md" style="background-color: rgba(255,255,255,0.4); padding: 4px 12px; border-radius: var(--radius-full); color: var(--on-tertiary-fixed);">2 / week</span>
              </li>
              <li style="display: flex; justify-content: space-between; align-items: center;">
                <span class="font-body-md" style="color: var(--on-tertiary-fixed-variant);">Partner Switch Interval</span>
                <span class="font-label-md" style="background-color: rgba(255,255,255,0.4); padding: 4px 12px; border-radius: var(--radius-full); color: var(--on-tertiary-fixed);">3 nights min</span>
              </li>
              <li style="display: flex; justify-content: space-between; align-items: center;">
                <span class="font-body-md" style="color: var(--on-tertiary-fixed-variant);">Morning Buffer</span>
                <span class="font-label-md" style="background-color: rgba(255,255,255,0.4); padding: 4px 12px; border-radius: var(--radius-full); color: var(--on-tertiary-fixed);">45 mins</span>
              </li>
            </ul>
          </div>
          <button class="btn btn-outline" id="btn-edit-rules" style="border-color: var(--tertiary-container); color: var(--tertiary); align-self: flex-start; margin-top: var(--space-md);">
            Edit Global Rules
          </button>
        </aside>

        <!-- Homes & Locations -->
        <section class="bento-span-6" style="display: flex; flex-direction: column; gap: var(--space-md);">
          <h3 class="font-title-lg" style="display: flex; align-items: center; gap: var(--space-base); font-weight: 700;">
            <span class="material-symbols-outlined text-primary">home_work</span> Homes & Spaces
          </h3>
          <div style="display: flex; flex-direction: column; gap: var(--space-base);">
            ${homesHtml}
          </div>
        </section>

        <!-- System Administration Panel -->
        <section class="bento-span-6" style="display: flex; flex-direction: column; gap: var(--space-md);">
          <h3 class="font-title-lg" style="display: flex; align-items: center; gap: var(--space-base); font-weight: 700;">
            <span class="material-symbols-outlined text-primary">admin_panel_settings</span> System Administration
          </h3>
          <div class="console-container">
            <div class="console-header">
              <span class="font-label-sm">Live System Logs</span>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 8px; height: 8px; border-radius: var(--radius-full); background-color: #4ade80; display: inline-block; animation: pulse-animation 1s infinite;"></span>
                <span class="font-label-sm" style="color: #4ade80;">Stable</span>
              </div>
            </div>
            <div class="console-body" id="console-logs-body">
              ${logsHtml}
            </div>
            <div class="console-action-row">
              <button class="btn-outline" id="btn-run-tests" style="background: transparent; border: none; font-family: var(--font-mono); font-size: 0.75rem; color: var(--primary-fixed-dim); cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">sync</span> Run System Test
              </button>
              <button class="btn-outline" id="btn-export-logs" style="background: transparent; border: none; font-family: var(--font-mono); font-size: 0.75rem; color: rgba(255,255,255,0.6); cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">download</span> Export Logs
              </button>
            </div>
          </div>
        </section>
      </div>
    `;
  },

  /**
   * Renders the Settings View
   */
  settings(state) {
    const isOffline = state.isOffline;
    const clientId = localStorage.getItem('polyschedule_client_id') || '';
    const apiKey = localStorage.getItem('polyschedule_api_key') || '';
    const calendarId = localStorage.getItem('polyschedule_calendar_id') || 'primary';
    
    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">Settings & Integrations</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px;">
          Configure API credentials, choose synchronization profiles, and verify local storage states.
        </p>
      </div>

      <section style="max-width: 600px; display: flex; flex-direction: column; gap: var(--space-xl);">
        <!-- Sync Mode Selection -->
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-xs);">Connection Mode</h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Choose whether to operate completely offline (caching configurations in local storage) or sync in real-time with your shared Google Calendar.
          </p>
          
          <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
            <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-sm); background-color: ${isOffline ? 'var(--surface-container-high)' : 'transparent'}; border-radius: var(--radius-default);">
              <input type="radio" name="mode-select" value="offline" ${isOffline ? 'checked' : ''} style="accent-color: var(--primary);"/>
              <div>
                <strong style="display: block; font-size: 0.95rem;">Offline / Local Storage Mode</strong>
                <span class="font-body-md" style="color: var(--on-surface-variant);">No external setup needed. Data persists locally inside your browser.</span>
              </div>
            </label>
            <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-sm); background-color: ${!isOffline ? 'var(--surface-container-high)' : 'transparent'}; border-radius: var(--radius-default);">
              <input type="radio" name="mode-select" value="sync" ${!isOffline ? 'checked' : ''} style="accent-color: var(--primary);"/>
              <div>
                <strong style="display: block; font-size: 0.95rem;">Google Calendar API Sync Mode</strong>
                <span class="font-body-md" style="color: var(--on-surface-variant);">Syncs schedule and proposals directly to a Google Calendar. Requires client API keys.</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Google Calendar API Setup (Conditional) -->
        <div class="bento-card" id="api-keys-section" style="padding: var(--space-lg); border: 1px solid var(--outline-variant); display: ${isOffline ? 'none' : 'flex'}; flex-direction: column; gap: var(--space-md);">
          <h3 class="font-title-lg" style="font-weight: 700;">Google API Credentials</h3>
          <p class="font-body-md" style="color: var(--on-surface-variant);">
            To connect, enter your Google OAuth 2.0 Client ID and API Key from the Google Cloud Console.
          </p>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-client-id">OAuth 2.0 Client ID</label>
            <input class="form-input" id="setting-client-id" placeholder="xxxxxx.apps.googleusercontent.com" type="text" value="${clientId}"/>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-api-key">API Key</label>
            <input class="form-input" id="setting-api-key" placeholder="AIzaSy..." type="password" value="${apiKey}"/>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-calendar-id">Calendar ID (Optional)</label>
            <input class="form-input" id="setting-calendar-id" placeholder="primary" type="text" value="${calendarId}"/>
            <span class="font-label-sm" style="color: var(--on-surface-variant); margin-top: 4px;">defaults to 'primary' (your main login calendar)</span>
          </div>

          <button class="btn btn-filled" id="btn-save-credentials" style="align-self: flex-start; margin-top: var(--space-sm);">Save Credentials</button>
        </div>

        <!-- App Reset Details -->
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--error-container); background-color: rgba(186, 26, 26, 0.02);">
          <h3 class="font-title-lg" style="font-weight: 700; color: var(--error);">Reset Data</h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Clears all local storage settings, cached events, profiles, and API credentials, resetting the app to default.
          </p>
          <button class="btn btn-error" id="btn-reset-app" style="align-self: flex-start;">Clear Local Data</button>
        </div>
      </section>
    `;
  }
};
