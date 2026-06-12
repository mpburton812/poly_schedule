/** Single-household deployment: fixed internal id from Render env. */
export function getFixedHouseholdId() {
  return String(process.env.HOUSEHOLD_ID || '').trim();
}

export function isSingleHouseholdMode() {
  return !!getFixedHouseholdId();
}
