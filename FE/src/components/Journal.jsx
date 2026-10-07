import { DoorOpen, HeartPulse, Lock, Moon, Palette, Smile, StickyNote, UserRound, Utensils } from 'lucide-react'
import { JOURNAL_SECTIONS } from '../lib/utils'
import { PhotoTile } from './ui'

export const SECTION_ICON = { meal: Utensils, learning: Palette, sleep: Moon, health: HeartPulse, emotion: Smile, note: StickyNote }
export const SECTION_TINT = { meal: 'cream', learning: 'peach', sleep: 'lav', health: 'mint', emotion: 'sky', note: 'cream' }

const filled = (journal, s) => journal.sections[s.key]?.trim()

// A journal has two layers: `sections` are shared with the whole class, `personal[studentId]` only with that child's parents.
export const personalNote = (journal, studentId) => journal?.personal?.[studentId]?.trim() || ''

// What a parent sees: timed moments first, then the untimed observations, then the note about their own child.
// `attendance` and `child` belong to the viewing parent; `students` (teacher preview) lists every individual note instead.
export function JournalTimeline({ journal, attendance, child, students }) {
  const timed = JOURNAL_SECTIONS.filter((s) => s.time && filled(journal, s)).sort((a, b) => a.time.localeCompare(b.time))
  const rest = JOURNAL_SECTIONS.filter((s) => !s.time && filled(journal, s))
  const own = child && personalNote(journal, child.id)
  const individual = (students || []).filter((s) => personalNote(journal, s.id))
  const items = [
    attendance?.status === 'present' && { key: 'arrival', time: '07:45', title: 'Arrival', text: 'Arrived safely.', icon: DoorOpen, tint: 'mint' },
    attendance?.status === 'absent' && {
      key: 'absent',
      title: 'Attendance',
      text: `Absent today.${attendance.note ? ` ${attendance.note}` : ''}`,
      icon: DoorOpen,
      tint: 'peach',
    },
    ...[...timed, ...rest].map((s) => ({
      key: s.key,
      time: s.time,
      title: s.timeline,
      text: journal.sections[s.key],
      icon: SECTION_ICON[s.key],
      tint: SECTION_TINT[s.key],
    })),
    own && { key: 'own', title: `About ${child.name}`, text: own, icon: UserRound, tint: 'lav', private: 'Only you can see this note' },
    ...individual.map((s) => ({ key: s.id, title: `About ${s.name}`, text: personalNote(journal, s.id), icon: UserRound, tint: 'lav', private: `Only ${s.name}'s parents see this` })),
  ].filter(Boolean)

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
