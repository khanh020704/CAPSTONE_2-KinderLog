import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  ClipboardCheck,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Megaphone,
  MessageCircle,
  Mic,
  PenLine,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from 'lucide-react'
import { ROLES, useStore } from '../store/store'
import { Logo } from '../components/ui'
import { SchoolIllustration } from './auth'

// The landing page presents the KinderLog product, never one school: a school's name only appears after sign-in.

const STEPS = [
  { icon: Mic, tint: 'peach', title: 'Teacher speaks', text: 'At the end of the day the teacher describes it out loud, in Vietnamese.' },
  { icon: PenLine, tint: 'sky', title: 'Voice becomes text', text: 'Speech-to-Text turns the recording into words in seconds.' },
  { icon: Sparkles, tint: 'lav', title: 'AI drafts the journal', text: 'The text is sorted into meal, learning, sleep, health and mood.' },
  { icon: Send, tint: 'mint', title: 'Teacher reviews & sends', text: 'The teacher edits, approves and publishes. Parents see it right away.' },
]

const FEATURES = [
  { icon: BookOpen, tint: 'peach', title: 'Daily journal', text: 'A clear timeline of each day with photos, written by the teacher with help from AI.' },
  { icon: ClipboardCheck, tint: 'mint', title: 'Attendance', text: 'Mark the whole class present in one tap, then note only the exceptions.' },
  { icon: MessageCircle, tint: 'sky', title: 'Teacher–parent chat', text: 'Simple, familiar text messages between a family and their teacher.' },
  { icon: Video, tint: 'lav', title: 'Classroom camera', text: 'Parents watch the classroom only during the times the school opens it.' },
  { icon: Megaphone, tint: 'cream', title: 'School announcements', text: 'Holidays, events and reminders reach every teacher and parent at once.' },
  { icon: BarChart3, tint: 'peach', title: 'Reports', text: 'Attendance and journal records by class and date, ready to export.' },
]

const AUDIENCES = [
  { icon: Building2, tint: 'sky', title: 'For schools', points: ['One place for classes, teachers, students and parents', 'See attendance and journals for the whole school', 'Control when classroom cameras are open'] },
  { icon: GraduationCap, tint: 'cream', title: 'For teachers', points: ['Finish the daily journal in minutes, by voice', 'Take attendance quickly on a phone', 'Keep parent conversations in one place'] },
  { icon: Users, tint: 'mint', title: 'For parents', points: ["Know how your child's day went", 'Message the teacher directly', 'Get school news without missing anything'] },
]

const SAFETY = [
  { icon: KeyRound, title: 'Accounts come from the school', text: 'There is no public sign-up. Every account is created by the school for people it knows.' },
  { icon: HeartHandshake, title: 'Parents see only their child', text: "Journals, messages and photos are visible to that child's family and teacher only." },
  { icon: CalendarClock, title: 'Cameras follow a schedule', text: 'Classroom video is never always-on. The principal decides when it opens.' },
]

const Wave = ({ fill }) => (
  <svg className="lp-wave" viewBox="0 0 1440 56" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 30c180-34 360-34 540-8s360 34 540 8 240-30 360-18v44H0z" fill={fill} />
  </svg>
)

export function LandingPage() {
  const { user } = useStore()
  const cta = user ? { to: ROLES[user.role].home, label: 'Open my dashboard' } : { to: '/login', label: 'Login' }

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <Link to="/" aria-label="KinderLog home">
            <Logo size={34} />
          </Link>
          <nav className="lp-links" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#who">Who it's for</a>
            <a href="#safety">Safety</a>
          </nav>
          <Link className="btn btn-primary" to={cta.to}>
            {cta.label}
          </Link>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap">
            <div>
              <span className="lp-eyebrow">
                <Sparkles size={16} /> Preschool daily journal, with a little help from AI
              </span>
              <h1>
                Every school day, <mark>gently recorded</mark> and shared with families.
              </h1>
              <p className="lp-lead">KinderLog helps preschools record each child's day, keep attendance and stay close to parents, all in one friendly place.</p>
              <div className="lp-cta">
                <Link className="btn btn-sun btn-lg" to={cta.to}>
                  {cta.label} <ArrowRight size={18} />
                </Link>
                <a className="btn btn-lg" href="#how">
                  See how it works
                </a>
              </div>
              <p className="muted small">Accounts are provided by your school. No sign-up needed.</p>
            </div>

            <div className="lp-art">
              <span className="lp-dot d1" />
              <span className="lp-dot d2" />
              <span className="lp-dot d3" />
              <div className="lp-blob">
                <SchoolIllustration />
              </div>
              <div className="lp-float f1">
                <span className="summary-icon tint-mint">
                  <Check size={18} />
                </span>
                <span>
                  Present today
                  <small>Arrived safely at 07:45</small>
                </span>
              </div>
              <div className="lp-float f2">
                <span className="summary-icon tint-peach">
                  <BookOpen size={18} />
                </span>
                <span>
                  New journal published
                  <small>Ate well · slept 90 minutes</small>
                </span>
              </div>
            </div>
          </div>
          <Wave fill="#ffffff" />
        </section>

        <section className="lp-section" id="how">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2>
                From a teacher's voice to a parent's phone in <mark>four steps</mark>
              </h2>
              <p>Writing a journal for every class used to take the whole evening. Now it starts with simply talking.</p>
            </div>
            <div className="lp-steps">
              {STEPS.map((s, i) => (
                <div key={s.title} className={`lp-step tint-${s.tint}`}>
                  <span className="lp-step-num">{i + 1}</span>
                  <span className="lp-icon">
                    <s.icon size={26} />
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
            <p className="lp-note">
              <ShieldCheck size={18} /> AI only suggests. The teacher always reviews and decides — nothing is published automatically.
            </p>
          </div>
        </section>

        <section className="lp-section lp-soft" id="features">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2>Everything a preschool day needs</h2>
              <p>Built for the daily routine of a class, not for paperwork.</p>
            </div>
            <div className="lp-cards">
              {FEATURES.map((f) => (
                <div key={f.title} className="lp-card">
                  <span className={`lp-icon tint-${f.tint}`}>
                    <f.icon size={26} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="who">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2>Made for everyone around the child</h2>
              <p>Each person signs in to a space designed for what they do every day.</p>
            </div>
            <div className="lp-cards">
              {AUDIENCES.map((a) => (
                <div key={a.title} className={`lp-card lp-who tint-${a.tint}`}>
                  <span className="lp-icon">
                    <a.icon size={26} />
                  </span>
                  <h3>{a.title}</h3>
                  <ul>
                    {a.points.map((p) => (
                      <li key={p}>
                        <Check size={18} /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-band" id="safety">
          <Wave fill="#ffffff" />
          <div className="lp-wrap">
            <div className="lp-head">
              <h2>Safe by design, because it is about children</h2>
              <p>Privacy is part of how KinderLog works, not an extra setting.</p>
            </div>
            <div className="lp-cards">
              {SAFETY.map((s) => (
                <div key={s.title} className="lp-card">
                  <span className="lp-icon">
                    <s.icon size={26} />
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-final">
          <div className="lp-wrap">
            <div className="lp-final-box">
              <span className="lp-dot d1" />
              <span className="lp-dot d2" />
              <h2>Does your school use KinderLog?</h2>
              <p>Sign in with the phone number and password your school gave you. If you do not have an account yet, please ask the school office.</p>
              <Link className="btn btn-primary btn-lg" to={cta.to}>
                {cta.label} <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <Logo size={26} />
          <span>Preschool Daily Journal & Reporting System · Capstone project</span>
          <a href="mailto:hotro@kinderlog.vn">hotro@kinderlog.vn</a>
        </div>
      </footer>
    </div>
  )
}
