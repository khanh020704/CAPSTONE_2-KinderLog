import { addDays, clock, isoDate, minutesToTime, timeToMinutes } from '../../common/utils/date.util';
import { CameraStream } from './entities/camera-stream.entity';

export type CameraState = 'LIVE' | 'SCHEDULED' | 'UNAVAILABLE';

export interface CameraAvailability {
  state: CameraState;
  /** Current window when LIVE, otherwise the next one (null when the camera never opens). */
  window: { date: string; start: string; end: string } | null;
}

export const weekdayAllowed = (mask: number, isoWeekday: number) => (mask & (1 << isoWeekday)) !== 0;

/** Pure function so the rule is easy to unit-test: is the feed open now, and if not, when next? */
export function availability(cam: CameraStream, tz: string, now = new Date()): CameraAvailability {
  if (!cam.isActive) return { state: 'UNAVAILABLE', window: null };
  const start = timeToMinutes(cam.allowedStartTime);
  const end = timeToMinutes(cam.allowedEndTime);
  const { weekday, minutes } = clock(tz, now);
  const today = isoDate(tz, now);
  const win = (date: string) => ({ date, start: minutesToTime(start), end: minutesToTime(end) });

  if (weekdayAllowed(cam.allowedWeekdays, weekday)) {
    if (start <= minutes && minutes < end) return { state: 'LIVE', window: win(today) };
    if (minutes < start) return { state: 'SCHEDULED', window: win(today) };
  }
  for (let i = 1; i <= 7; i++) {
    const wd = ((weekday - 1 + i) % 7) + 1;
    if (weekdayAllowed(cam.allowedWeekdays, wd))
      return { state: 'SCHEDULED', window: win(addDays(today, i)) };
  }
  return { state: 'UNAVAILABLE', window: null };
}
