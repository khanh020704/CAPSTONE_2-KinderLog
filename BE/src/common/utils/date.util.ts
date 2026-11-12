/** Date helpers that work in the school's timezone, not the server's. */

const pad = (n: number) => String(n).padStart(2, '0');

function parts(tz: string, at: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'weekday', string>;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** 'YYYY-MM-DD' of `at` in `tz`. */
export function isoDate(tz: string, at = new Date()): string {
  const p = parts(tz, at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** ISO weekday (1 = Monday … 7 = Sunday) and minutes since midnight of `at` in `tz`. */
export function clock(tz: string, at = new Date()) {
  const p = parts(tz, at);
  return { weekday: WEEKDAY[p.weekday], minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every date from `from` to `to`, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ISO weekday of a 'YYYY-MM-DD' date. */
export const weekdayOf = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** 'HH:mm' or 'HH:mm:ss' → minutes since midnight. */
export const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToTime = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
