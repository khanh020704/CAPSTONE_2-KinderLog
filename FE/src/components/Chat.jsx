import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MessageCircle, Send } from 'lucide-react'
import { byId, classOfTeacher, childrenOf, studentsOfClass, useStore } from '../store/store'
import { dayLabel, fmtTime, norm, relTime, toISO, uid } from '../lib/utils'
import { Avatar, EmptyState, PageHeader, SearchInput, Skeleton, useFakeLoad, useToast } from './ui'

// One conversation per parent–teacher pair. Text only by design: no voice, no AI replies.
function useConversations() {
  const { db, user } = useStore()
  return useMemo(() => {
    let pairs = []
    if (user.role === 'teacher') {
      const cls = classOfTeacher(db, user.id)
      const seen = new Set()
      for (const st of cls ? studentsOfClass(db, cls.id) : []) {
        for (const l of db.links.filter((x) => x.studentId === st.id && x.status === 'Active')) {
          const p = byId(db.parents, l.parentId)
          if (!p || seen.has(p.id)) continue
          seen.add(p.id)
          pairs.push({ id: p.id, parentId: p.id, teacherId: user.id, name: p.name, sub: `${l.relationship} of ${st.name}` })
        }
      }
    } else {
      const seen = new Set()
      for (const child of childrenOf(db, user.id)) {
        const cls = byId(db.classes, child.classId)
        const t = cls && byId(db.teachers, cls.teacherId)
        if (!t || seen.has(t.id)) continue
        seen.add(t.id)
        pairs.push({ id: t.id, parentId: user.id, teacherId: t.id, name: t.name, sub: `Teacher · ${cls.name}` })
      }
    }
    const mine = user.role === 'teacher' ? 'teacher' : 'parent'
    return pairs
      .map((c) => {
        const msgs = db.messages.filter((m) => m.parentId === c.parentId && m.teacherId === c.teacherId).sort((a, b) => a.at - b.at)
        return { ...c, msgs, last: msgs[msgs.length - 1], unread: msgs.filter((m) => m.from !== mine && !m.read).length }
      })
      .sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0))
  }, [db, user])
}

export default function ChatPage() {
  const { user, mutate, notify } = useStore()
  const toast = useToast()
  const loading = useFakeLoad(400)
  const convs = useConversations()
  const [activeId, setActiveId] = useState(null)
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const endRef = useRef(null)
  const mine = user.role === 'teacher' ? 'teacher' : 'parent'
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 860px)').matches
  const active = convs.find((c) => c.id === activeId) || (wide ? convs[0] : null)

  useEffect(() => {
    if (!active || active.unread === 0) return
    mutate((prev) => ({
      messages: prev.messages.map((m) => (m.parentId === active.parentId && m.teacherId === active.teacherId && m.from !== mine ? { ...m, read: true } : m)),
    }))
  }, [active, mine, mutate])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [active?.id, active?.msgs.length])

  const send = (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    if (!navigator.onLine) return toast('Unable to send the message. Please try again.', 'error')
    mutate((prev) => ({
      messages: [...prev.messages, { id: uid('m'), parentId: active.parentId, teacherId: active.teacherId, from: mine, text: body, at: Date.now(), read: false }],
    }))
    notify({
      role: mine === 'teacher' ? 'parent' : 'teacher',
      userId: mine === 'teacher' ? active.parentId : active.teacherId,
      type: 'message',
      title: `Message from ${user.name}`,
      body: body.length > 70 ? `${body.slice(0, 70)}…` : body,
    })
    setText('')
  }

  const list = convs.filter((c) => norm(`${c.name} ${c.sub}`).includes(norm(q)))
  let lastDay = ''

  return (
    <div className={`chat-page ${active ? 'in-conv' : ''}`}>
      <div className="chat-page-head">
        <PageHeader title="Messages" subtitle={user.role === 'teacher' ? 'Conversations with parents of your class' : "Chat with your child's teacher"} />
      </div>
      <div className="chat card">
        <aside className="chat-list">
          {user.role === 'teacher' && (
            <div className="chat-search">
              <SearchInput value={q} onChange={setQ} placeholder="Search parent or child" />
            </div>
          )}
          {loading ? (
            <div className="chat-skeleton">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton-row">
                  <Skeleton h={44} w={44} r={22} />
                  <Skeleton w="60%" />
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={MessageCircle} title="No conversations yet." soft={user.role === 'parent'} />
          ) : (
            list.map((c) => (
              <button key={c.id} className={`chat-conv ${active?.id === c.id ? 'active' : ''}`} onClick={() => setActiveId(c.id)}>
                <Avatar name={c.name} size={44} />
                <span className="chat-conv-main">
                  <span className="chat-conv-top">
                    <strong>{c.name}</strong>
                    {c.last && <span className="chat-time">{relTime(c.last.at)}</span>}
                  </span>
                  <span className="chat-conv-sub">{c.sub}</span>
                  <span className={`chat-conv-last ${c.unread ? 'unread' : ''}`}>
                    {c.last ? `${c.last.from === mine ? 'You: ' : ''}${c.last.text}` : 'No messages yet'}
                  </span>
                </span>
                {c.unread > 0 && <span className="count">{c.unread}</span>}
              </button>
            ))
          )}
        </aside>

        <section className="chat-window">
          {!active ? (
            <EmptyState icon={MessageCircle} title="Select a conversation" text="Choose a conversation to start messaging." />
          ) : (
            <>
              <header className="chat-head">
                <button className="icon-btn chat-back" onClick={() => setActiveId('none')} aria-label="Back to conversations">
                  <ArrowLeft size={20} />
                </button>
                <Avatar name={active.name} size={40} />
                <div>
                  <strong>{active.name}</strong>
                  <div className="muted small">{active.sub}</div>
                </div>
              </header>
              <div className="chat-body">
                {active.msgs.length === 0 && <div className="chat-hint">Say hello to start the conversation.</div>}
                {active.msgs.map((m) => {
                  const day = toISO(new Date(m.at))
                  const sep = day !== lastDay
                  lastDay = day
                  return (
                    <div key={m.id}>
                      {sep && <div className="chat-sep">{dayLabel(day)}</div>}
                      <div className={`bubble-row ${m.from === mine ? 'me' : ''}`}>
                        <div className="bubble">
                          {m.text}
                          <span className="bubble-time">{fmtTime(m.at)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={endRef} />
              </div>
              <form className="chat-input" onSubmit={send}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" aria-label="Type a message" />
                <button className="btn btn-primary" disabled={!text.trim()} aria-label="Send message">
                  <Send size={18} /> <span className="hide-sm">Send</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
