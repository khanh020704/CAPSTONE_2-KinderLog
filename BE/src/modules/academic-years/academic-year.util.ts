/**
 * The academic year a date falls in: Vietnamese preschools run September → May, so from August on a new year starts.
 * Used to give every new school its current year.
 */
export function academicYearOf(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 8 ? y : y - 1;
  return { name: `${start}-${start + 1}`, startDate: `${start}-09-01`, endDate: `${start + 1}-05-31` };
}

/**
 * The two semesters a new academic year starts with: Học kỳ 1 until 15 January, Học kỳ 2 from 16 January.
 * None when the year's dates do not span that split (the principal then adds them by hand).
 */
export function defaultSemesters(year: { name: string; startDate: string; endDate: string }) {
  const second = Number(year.name.split('-')[1]);
  const end1 = `${second}-01-15`;
  const start2 = `${second}-01-16`;
  if (!(year.startDate < end1 && start2 < year.endDate)) return [];
  return [
    { name: 'Học kỳ 1', startDate: year.startDate, endDate: end1 },
    { name: 'Học kỳ 2', startDate: start2, endDate: year.endDate },
  ];
}
