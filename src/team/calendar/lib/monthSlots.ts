/** Most months `useTeamCalendarMonths` keeps open at once. */
export const MAX_OPEN_MONTHS = 12;

/**
 * Gives every wanted month a slot, keeping a month in the slot it had before
 * so moving the view does not reload months that stay visible. Unused slots
 * are "". Months past `MAX_OPEN_MONTHS` are dropped (callers keep under it).
 */
export function assignMonthSlots(
  previous: readonly string[],
  wanted: readonly string[],
): string[] {
  const want = [...new Set(wanted.filter(Boolean))].slice(0, MAX_OPEN_MONTHS);
  const slots = Array.from(
    { length: MAX_OPEN_MONTHS },
    (_, index) => previous[index] ?? "",
  ).map((month) => (want.includes(month) ? month : ""));
  for (const month of want) {
    if (slots.includes(month)) continue;
    const free = slots.indexOf("");
    if (free >= 0) slots[free] = month;
  }
  return slots;
}
