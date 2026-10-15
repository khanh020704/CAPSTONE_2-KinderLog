import { AttendanceStatus, HealthStatus, MealLevel, Mood, SleepQuality } from '../../common/enums';
import { DailyJournal } from './entities/daily-journal.entity';

/** Vietnamese labels shown to parents. */
export const LABELS = {
  meal: {
    [MealLevel.ALL]: 'Ăn hết suất',
    [MealLevel.MOST]: 'Ăn gần hết suất',
    [MealLevel.HALF]: 'Ăn một nửa suất',
    [MealLevel.LITTLE]: 'Ăn ít',
    [MealLevel.NONE]: 'Không ăn',
  },
  sleep: {
    [SleepQuality.GOOD]: 'Ngủ ngon',
    [SleepQuality.FAIR]: 'Ngủ khá',
    [SleepQuality.POOR]: 'Ngủ không sâu giấc',
    [SleepQuality.NONE]: 'Không ngủ',
  },
  health: {
    [HealthStatus.NORMAL]: 'Bình thường',
    [HealthStatus.MONITOR]: 'Cần theo dõi',
    [HealthStatus.SICK]: 'Không khỏe',
  },
  mood: {
    [Mood.HAPPY]: 'Vui vẻ',
    [Mood.CALM]: 'Bình thường, ngoan',
    [Mood.TIRED]: 'Hơi mệt',
    [Mood.SAD]: 'Buồn, hay khóc',
  },
};

export interface TimelineEvent {
  key: 'attendance' | 'learning' | 'meal' | 'sleep' | 'health' | 'emotion' | 'note';
  time: string | null;
  title: string;
  text: string;
}

const join = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join('. ');

/** Same section order and times as the FE (JOURNAL_SECTIONS in FE/src/lib/utils.js). */
export function buildTimeline(e: DailyJournal): TimelineEvent[] {
  if (e.attendance === AttendanceStatus.ABSENT) {
    return [
      { key: 'attendance', time: null, title: 'Vắng mặt', text: e.absenceReason || 'Bé nghỉ học hôm nay' },
    ];
  }
  const events: TimelineEvent[] = [];
  const push = (ev: TimelineEvent) => ev.text && events.push(ev);

  push({ key: 'learning', time: '09:30', title: 'Hoạt động học', text: e.learningNote ?? '' });
  push({
    key: 'meal',
    time: '11:30',
    title: 'Bữa trưa',
    text: join(e.mealLevel && LABELS.meal[e.mealLevel], e.mealNote),
  });
  push({
    key: 'sleep',
    time: '13:00',
    title: 'Ngủ trưa',
    text: join(
      e.sleepMinutes != null ? `Ngủ khoảng ${e.sleepMinutes} phút` : null,
      e.sleepQuality && LABELS.sleep[e.sleepQuality],
    ),
  });
  push({
    key: 'health',
    time: null,
    title: 'Sức khỏe',
    text: join(
      e.healthStatus && LABELS.health[e.healthStatus],
      e.temperature != null ? `Nhiệt độ ${e.temperature}°C` : null,
      e.healthNote,
    ),
  });
  push({ key: 'emotion', time: null, title: 'Cảm xúc', text: e.mood ? LABELS.mood[e.mood] : '' });
  push({ key: 'note', time: null, title: 'Lời nhắn của cô', text: e.teacherNote ?? '' });
  return events;
}
