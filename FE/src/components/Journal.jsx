import { DoorOpen, HeartPulse, Lock, Moon, Palette, Smile, StickyNote, UserRound, Utensils } from 'lucide-react'
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
