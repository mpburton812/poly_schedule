/**
 * PolySchedule Rules Engine
 * Evaluates scheduling proposals against capacity constraints and partner sleeping limits.
 */

import { batchProposalToSleepingEvents, findPartnerByRef } from './helpers.js';

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  mon.setHours(0, 0, 0, 0);
  return mon;
};

const eventCoversDay = (event, day) => {
  const startD = new Date(event.start);
  const endD = new Date(event.end);
  const startMid = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
  const endMid = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate());
  return day >= startMid && day < endMid;
};

const hasParticipant = (participants, targetName) => {
  if (!participants || !targetName) return false;
  const targetFirst = targetName.split(' ')[0].toLowerCase();
  return participants.some(p => p.split(' ')[0].toLowerCase() === targetFirst);
};

const getWeekStartsInRange = (startDate, endDate) => {
  const weekKeys = new Set();
  const curr = new Date(startDate);
  curr.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  while (curr <= end) {
    weekKeys.add(getStartOfWeek(curr).getTime());
    curr.setDate(curr.getDate() + 1);
  }
  return Array.from(weekKeys).map(t => new Date(t));
};

const evaluatePartnerAndSoloRules = (eventsToCheck, daysOfWeek, partners, proposalParticipants) => {
  const warnings = [];

  for (const pA of proposalParticipants) {
    const partnerConfig = findPartnerByRef({ partners }, pA);
    if (!partnerConfig || !partnerConfig.rules) continue;

    const rules = partnerConfig.rules;

    if (rules.partnerLimits) {
      for (const pB of proposalParticipants) {
        if (pA === pB) continue;

        let limit = null;
        if (rules.partnerLimits[pB]) {
          limit = rules.partnerLimits[pB];
        } else {
          const firstB = pB.split(' ')[0];
          for (const key of Object.keys(rules.partnerLimits)) {
            if (key === firstB || key.split(' ')[0] === firstB) {
              limit = rules.partnerLimits[key];
              break;
            }
          }
        }

        if (limit) {
          let nightsTogether = 0;
          for (const day of daysOfWeek) {
            const sleepsTogether = eventsToCheck.some(e => {
              if (e.type !== 'sleeping') return false;
              if (e.status === 'rejected' || e.status === 'cancelled') return false;
              const parts = e.participants || [];
              return hasParticipant(parts, pA) && hasParticipant(parts, pB) && eventCoversDay(e, day);
            });
            if (sleepsTogether) nightsTogether++;
          }

          if (limit.max !== undefined && nightsTogether > limit.max) {
            warnings.push({
              type: 'PARTNER_MAX_LIMIT',
              message: `${pA} sleeping with ${pB} for ${nightsTogether} nights exceeds ${pA}'s preferred limit of ${limit.max} nights/week with ${pB}.`
            });
          }
          if (limit.min !== undefined && nightsTogether < limit.min) {
            warnings.push({
              type: 'PARTNER_MIN_LIMIT',
              message: `${pA} sleeping with ${pB} for ${nightsTogether} nights is below ${pA}'s preferred limit of ${limit.min} nights/week with ${pB}.`
            });
          }
        }
      }
    }

    const minSoloNights = rules.minSoloNights ?? rules.maxSoloNights;
    if (minSoloNights !== undefined) {
      let soloNights = 0;
      for (const day of daysOfWeek) {
        const isSolo = eventsToCheck.some(e => {
          if (e.type !== 'sleeping') return false;
          if (e.status === 'rejected' || e.status === 'cancelled') return false;
          const parts = e.participants || [];
          if (parts.length !== 1) return false;
          return hasParticipant(parts, pA) && eventCoversDay(e, day);
        });
        if (isSolo) soloNights++;
      }
      if (soloNights < minSoloNights) {
        warnings.push({
          type: 'SOLO_MIN_LIMIT',
          message: `${pA} sleeping alone for ${soloNights} nights is below preferred minimum of ${minSoloNights} solo nights/week.`
        });
      }
    }
  }

  return warnings;
};

export const RulesEngine = {
  /**
   * Evaluates a sleeping proposal against existing events and logistics rules.
   * @param {Object} proposal - The proposal being created/modified.
   * @param {Array} existingEvents - Existing schedule events.
   * @param {Object} config - Configuration options containing residences, etc.
   * @param {Array} partners - List of partner profiles containing rules.
   * @returns {Array} List of warning objects { type, message }
   */
  evaluateSleepingProposal(proposal, existingEvents = [], config = {}, partners = []) {
    const warnings = [];

    if (!proposal || proposal.type !== 'sleeping') {
      return warnings;
    }

    const proposalStart = new Date(proposal.start);
    const proposalEnd = new Date(proposal.end);

    if (isNaN(proposalStart.getTime()) || isNaN(proposalEnd.getTime())) {
      return warnings;
    }

    // Helper: calculate Monday-Sunday week boundaries for a given date
    const getStartOfWeek = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      // Adjust so Monday is first day (1), Sunday is last (0)
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(d.setDate(diff));
      mon.setHours(0, 0, 0, 0);
      return mon;
    };

    const getEndOfWeek = (date) => {
      const mon = getStartOfWeek(date);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      sun.setHours(23, 59, 59, 999);
      return sun;
    };

    const mon = getStartOfWeek(proposalStart);
    const sun = getEndOfWeek(proposalStart);

    // Get all days in the week of the proposal
    const daysOfWeek = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      daysOfWeek.push(d);
    }

    // Helper: check if a midnight-based day is covered by an event's start/end dates
    const eventCoversDay = (event, day) => {
      const startD = new Date(event.start);
      const endD = new Date(event.end);
      const startMid = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
      const endMid = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate());
      return day >= startMid && day < endMid;
    };

    // Helper: check if name list has a participant matching targetName (by first name)
    const hasParticipant = (participants, targetName) => {
      if (!participants || !targetName) return false;
      const targetFirst = targetName.split(' ')[0].toLowerCase();
      return participants.some(p => p.split(' ')[0].toLowerCase() === targetFirst);
    };

    // Get nights of the proposal
    const proposalNights = [];
    let curr = new Date(proposalStart);
    const endMidnight = new Date(proposalEnd.getFullYear(), proposalEnd.getMonth(), proposalEnd.getDate());
    curr = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate());
    while (curr < endMidnight) {
      proposalNights.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    // Build the list of events to evaluate, overriding matching IDs with proposal
    const eventsToCheck = [proposal];
    for (const e of existingEvents) {
      if (e.id !== proposal.id) {
        eventsToCheck.push(e);
      }
    }

    // --- Rule 1: Capacity Conflict (Room Conflict) ---
    // Check if the same room (homeId & roomId) is already booked on any night of the proposal
    for (const nightDate of proposalNights) {
      const conflictingEvent = existingEvents.find(e => {
        if (e.id === proposal.id) return false;
        if (e.type !== 'sleeping') return false;
        if (e.status === 'rejected' || e.status === 'cancelled') return false;
        if (e.homeId !== proposal.homeId || e.roomId !== proposal.roomId) return false;
        if (!eventCoversDay(e, nightDate)) return false;

        // Check if there is a participant in e who is NOT in proposal.participants
        const hasOtherPerson = (e.participants || []).some(name => !hasParticipant(proposal.participants, name));
        return hasOtherPerson;
      });

      if (conflictingEvent) {
        const roomDisp = proposal.roomName || proposal.roomId || 'Room';
        const homeDisp = proposal.homeName || proposal.homeId || 'Residence';
        warnings.push({
          type: 'CAPACITY_CONFLICT',
          message: `Room conflict: ${roomDisp} at ${homeDisp} is already booked on ${nightDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.`
        });
        // Break early to avoid duplicate CAPACITY_CONFLICT warnings for the same proposal
        break;
      }
    }

    // --- Rule 2: Partner Sleeping Limits (Max/Min Nights) ---
    const proposalParticipants = proposal.participants || [];
    
    for (const pA of proposalParticipants) {
      const partnerConfig = findPartnerByRef({ partners }, pA);
      if (!partnerConfig || !partnerConfig.rules) continue;

      const rules = partnerConfig.rules;

      // 2a. Partner Limits
      if (rules.partnerLimits) {
        for (const pB of proposalParticipants) {
          if (pA === pB) continue;

          // Find if there is a limit configured for pB
          let limit = null;
          let limitKey = null;

          // Check direct key match
          if (rules.partnerLimits[pB]) {
            limit = rules.partnerLimits[pB];
            limitKey = pB;
          } else {
            // Check first name key match
            const firstB = pB.split(' ')[0];
            for (const key of Object.keys(rules.partnerLimits)) {
              if (key === firstB || key.split(' ')[0] === firstB) {
                limit = rules.partnerLimits[key];
                limitKey = key;
                break;
              }
            }
          }

          if (limit) {
            // Count total nights pA and pB sleep together in the week of the proposal
            let nightsTogether = 0;

            for (const day of daysOfWeek) {
              const sleepsTogether = eventsToCheck.some(e => {
                if (e.type !== 'sleeping') return false;
                if (e.status === 'rejected' || e.status === 'cancelled') return false;
                
                const parts = e.participants || [];
                return hasParticipant(parts, pA) && hasParticipant(parts, pB) && eventCoversDay(e, day);
              });

              if (sleepsTogether) {
                nightsTogether++;
              }
            }

            if (limit.max !== undefined && nightsTogether > limit.max) {
              warnings.push({
                type: 'PARTNER_MAX_LIMIT',
                message: `${pA} sleeping with ${pB} for ${nightsTogether} nights exceeds ${pA}'s preferred limit of ${limit.max} nights/week with ${pB}.`
              });
            }

            if (limit.min !== undefined && nightsTogether < limit.min) {
              warnings.push({
                type: 'PARTNER_MIN_LIMIT',
                message: `${pA} sleeping with ${pB} for ${nightsTogether} nights is below ${pA}'s preferred limit of ${limit.min} nights/week with ${pB}.`
              });
            }
          }
        }
      }

      // 2b. Min Solo Nights preference
      const minSoloNights = rules.minSoloNights ?? rules.maxSoloNights;
      if (minSoloNights !== undefined) {
        let soloNights = 0;

        for (const day of daysOfWeek) {
          const isSolo = eventsToCheck.some(e => {
            if (e.type !== 'sleeping') return false;
            if (e.status === 'rejected' || e.status === 'cancelled') return false;

            const parts = e.participants || [];
            if (parts.length !== 1) return false;

            return hasParticipant(parts, pA) && eventCoversDay(e, day);
          });

          if (isSolo) {
            soloNights++;
          }
        }

        if (soloNights < minSoloNights) {
          warnings.push({
            type: 'SOLO_MIN_LIMIT',
            message: `${pA} sleeping alone for ${soloNights} nights is below preferred minimum of ${minSoloNights} solo nights/week.`
          });
        }
      }
    }

    return warnings;
  },

  /**
   * Evaluates a multi-night batch sleeping proposal.
   */
  evaluateBatchSleepingProposal(batchProposal, existingEvents = [], config = {}, partners = []) {
    const warnings = [];
    if (!batchProposal || batchProposal.type !== 'batch_sleeping') return warnings;
    if (!batchProposal.batchNights?.length) return warnings;

    const syntheticEvents = batchProposalToSleepingEvents(batchProposal);
    const existingSleeping = existingEvents.filter(e =>
      e.id !== batchProposal.id &&
      e.type === 'sleeping' &&
      e.status !== 'rejected' &&
      e.status !== 'cancelled'
    );
    const eventsToCheck = [...syntheticEvents, ...existingSleeping];

    // Duplicate room assignments within the batch on the same night
    const roomKeys = new Set();
    batchProposal.batchNights.forEach((night, nightIndex) => {
      (night.assignments || []).forEach((assign, assignIndex) => {
        const key = `${night.date}|${assign.homeId}|${assign.roomId}`;
        if (roomKeys.has(key)) {
          warnings.push({
            type: 'CAPACITY_CONFLICT',
            nightIndex,
            assignIndex,
            message: `Duplicate assignment: ${assign.roomName || assign.roomId} at ${assign.homeName || assign.homeId} on ${new Date(night.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.`
          });
        }
        roomKeys.add(key);
      });
    });

    // Room conflicts with existing schedule and within batch (different occupants)
    let nightIdx = 0;
    let assignIdx = 0;
    for (const night of batchProposal.batchNights) {
      for (const assign of night.assignments || []) {
        const synthetic = batchProposalToSleepingEvents({
          ...batchProposal,
          batchNights: [{ date: night.date, assignments: [assign] }]
        })[0];
        if (!synthetic) continue;

        const nightDate = new Date(night.date);
        nightDate.setHours(0, 0, 0, 0);

        const conflict = eventsToCheck.find(e => {
          if (e.id === synthetic.id) return false;
          if (e.type !== 'sleeping') return false;
          if (e.status === 'rejected' || e.status === 'cancelled') return false;
          if (e.homeId !== synthetic.homeId || e.roomId !== synthetic.roomId) return false;
          if (!eventCoversDay(e, nightDate)) return false;
          return (e.participants || []).some(name => !hasParticipant(synthetic.participants, name));
        });

        if (conflict) {
          warnings.push({
            type: 'CAPACITY_CONFLICT',
            nightIndex: nightIdx,
            assignIndex: assignIdx,
            message: `Room conflict: ${synthetic.roomName || synthetic.roomId} at ${synthetic.homeName || synthetic.homeId} is already booked on ${nightDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.`
          });
        }
        assignIdx++;
      }
      nightIdx++;
      assignIdx = 0;
    }

    const allParticipants = new Set();
    syntheticEvents.forEach(e => (e.participants || []).forEach(p => allParticipants.add(p)));
    const proposalParticipants = Array.from(allParticipants);

    const rangeStart = new Date(batchProposal.batchNights[0].date);
    const rangeEnd = new Date(batchProposal.batchNights[batchProposal.batchNights.length - 1].date);
    const weekStarts = getWeekStartsInRange(rangeStart, rangeEnd);

    for (const weekStart of weekStarts) {
      const daysOfWeek = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        daysOfWeek.push(d);
      }
      warnings.push(...evaluatePartnerAndSoloRules(eventsToCheck, daysOfWeek, partners, proposalParticipants));
    }

    return warnings;
  }
};