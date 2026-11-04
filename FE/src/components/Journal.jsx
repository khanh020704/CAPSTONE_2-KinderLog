import { DoorOpen, HeartPulse, Lock, Moon, Palette, Smile, StickyNote, UserRound, Utensils } from 'lucide-react'
import { JOURNAL_SECTIONS } from '../lib/utils'
import { PhotoTile } from './ui'

export const SECTION_ICON = { meal: Utensils, learning: Palette, sleep: Moon, health: HeartPulse, emotion: Smile, note: StickyNote }
export const SECTION_TINT = { meal: 'cream', learning: 'peach', sleep: 'lav', health: 'mint', emotion: 'sky', note: 'cream' }

const EVENT_META = {
  attendance: { icon: DoorOpen, tint: 'peach', title: 'Attendance' },
  learning: { icon: Palette, tint: SECTION_TINT.learning, title: 'Learning Activity' },
  meal: { icon: Utensils, tint: SECTION_TINT.meal, title: 'Lunch' },
  sleep: { icon: Moon, tint: SECTION_TINT.sleep, title: 'Nap' },
  health: { icon: HeartPulse, tint: SECTION_TINT.health, title: 'Health' },
  emotion: { icon: Smile, tint: SECTION_TINT.emotion, title: 'Emotion' },
  note: { icon: UserRound, tint: 'lav', title: 'Note from the teacher' },
  classNote: { icon: StickyNote, tint: SECTION_TINT.note, title: 'Note for the whole class' },
}

// One day of a child's journal as returned by GET /daily-journals/timeline: `day.events` are already in order.
export function DayTimeline({ day, private: privateNote = true }) {
  return (
    <>
      <ol className="timeline">
        {day.events.map((ev) => {
          const meta = EVENT_META[ev.key] || EVENT_META.note
          return (
            <li key={ev.key} className="tl-item">
              <span className={`tl-icon tint-${meta.tint}`}>
                <meta.icon size={18} />
              </span>
              <div>
                {ev.time && <div className="tl-time">{ev.time}</div>}
                <div className="tl-title">{meta.title}</div>
                <div>{ev.text}</div>
                {privateNote && ev.key === 'note' && (
                  <span className="chip private-chip">
                    <Lock size={12} /> Only this child's family can see this
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {day.photos.length > 0 && (
        <div className="photos">
          {day.photos.map((p) => (
            <PhotoTile key={p.id} src={p.url} />
          ))}
        </div>
      )}
    </>
  )
}

const filled = (journal, s) => journal.sections[s.key]?.trim()

// A journal has two layers: `sections` are shared with the whole class, `personal[studentId]` only with that child's parents.
const personalNote = (journal, studentId) => journal?.personal?.[studentId]?.trim() || ''

// The teacher's preview of what parents will see: timed moments first, then the untimed observations, then every
// child's own note (each shown only to that child's parents).
export function JournalTimeline({ journal, students }) {
  const timed = JOURNAL_SECTIONS.filter((s) => s.time && filled(journal, s)).sort((a, b) => a.time.localeCompare(b.time))
  const rest = JOURNAL_SECTIONS.filter((s) => !s.time && filled(journal, s))
  const individual = (students || []).filter((s) => personalNote(journal, s.id))
  const items = [
    ...[...timed, ...rest].map((s) => ({
      key: s.key,
      time: s.time,
      title: s.timeline,
      text: journal.sections[s.key],
      icon: SECTION_ICON[s.key],
      tint: SECTION_TINT[s.key],
    })),
    ...individual.map((s) => ({
      key: s.id,
      title: `About ${s.name}`,
      text: personalNote(journal, s.id),
      icon: UserRound,
      tint: 'lav',
      private: `Only ${s.name}'s parents see this`,
    })),
  ]

  return (
    <>
      <ol className="timeline">
        {items.map((it) => (
          <li key={it.key} className="tl-item">
            <span className={`tl-icon tint-${it.tint}`}>
              <it.icon size={18} />
            </span>
            <div>
              {it.time && <div className="tl-time">{it.time}</div>}
              <div className="tl-title">{it.title}</div>
              <div>{it.text}</div>
              {it.private && (
                <span className="chip private-chip">
                  <Lock size={12} /> {it.private}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {journal.photos.length > 0 && (
        <div className="photos">
          {journal.photos.map((p, i) => (
            <PhotoTile key={i} src={p} />
          ))}
        </div>
      )}
    </>
  )
}
