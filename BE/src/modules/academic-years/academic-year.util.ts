/**
 * The academic year a date falls in: Vietnamese preschools run September → May, so from August on a new year starts.
 * Used to give every new school its current year.
 */
export function academicYearOf(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 8 ? y : y - 1;
  return { name: `${start}-${start + 1}`, startDate: `${start}-09-01`, endDate: `${start + 1}-05-31` };
}
