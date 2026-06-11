/**
 * Shared JSDoc domain types for PolySchedule.
 * @module types
 */

/**
 * @typedef {Object} PartnerRules
 * @property {number} [minSoloNights]
 * @property {Record<string, { min: number, max: number }>} [partnerLimits]
 */

/**
 * @typedef {Object} PartnerPronouns
 * @property {string} preset Preset key (e.g. `she/her`) or `custom`.
 * @property {string} subject Subject form (e.g. she, they).
 * @property {string} object Object form (e.g. her, them).
 * @property {string} possessive Possessive form (e.g. her, their).
 */

/**
 * @typedef {Object} Partner
 * @property {string} id Stable partner identifier (preferred for references).
 * @property {string} name Display name shown in the UI.
 * @property {string} [username] Login username; absent for passive partners.
 * @property {string} [passwordHash] Hashed password.
 * @property {boolean} [passive] Passive partners do not vote on proposals.
 * @property {string} [avatar] Avatar image URL.
 * @property {PartnerPronouns} [pronouns] Subject/object/possessive forms for generated text.
 * @property {string} [defaultHome] Default residence id.
 * @property {PartnerRules} [rules] Sleeping and partner limit rules.
 * @property {string[]} [sleepingPartners] Legacy sleeping connection names.
 */

/**
 * @typedef {Object} Residence
 * @property {string} id
 * @property {string} name
 * @property {string} [address]
 * @property {number} [bedrooms]
 * @property {Array<{ id: string, name: string }>} [bedroomDetails]
 * @property {string[]} [associatedPeople]
 */

/**
 * @typedef {Object} AppConfig
 * @property {string} [groupName]
 * @property {Partner[]} partners
 * @property {Residence[]} residences
 */

/**
 * @typedef {'draft'|'proposed'|'approved'|'archived'|'declined'} WorkflowState
 */

/**
 * @typedef {Object} ParticipantRole
 * @property {string} name Participant display name or partner id reference.
 * @property {'required'|'optional'} role
 */

/**
 * @typedef {Object} VoteResponse
 * @property {'pending'|'accept'|'reject'|'abstain'} status
 * @property {string} [comment]
 */

/**
 * @typedef {Object} ScheduleEvent
 * @property {string} id
 * @property {string} title
 * @property {'event'|'sleeping'|'batch_sleeping'} type
 * @property {string} start ISO datetime
 * @property {string} end ISO datetime
 * @property {string} [proposer]
 * @property {string[]} [participants]
 * @property {ParticipantRole[]} [participantRoles]
 * @property {Record<string, VoteResponse>} [responses]
 * @property {WorkflowState} [workflowState]
 * @property {string} [status] Legacy status field.
 * @property {string} [homeId]
 * @property {string} [roomId]
 * @property {string} [archivedAt]
 */

export {};
