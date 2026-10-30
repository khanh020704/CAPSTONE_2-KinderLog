import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MessageCircle, Send } from 'lucide-react'
import { useStore } from '../store/store'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { RELATIONSHIP, errorText, label } from '../lib/labels'
import { roleLabel, toMessage } from '../lib/mappers'
import { dayLabel, fmtTime, norm, relTime, toISO } from '../lib/utils'
import { Avatar, EmptyState, PageHeader, SearchInput, Skeleton, useToast } from './ui'

// Conversations and the open thread are re-read on these intervals, so messages sent from another device show up.
const CONTACTS_REFRESH_MS = 10000
const THREAD_REFRESH_MS = 5000
const THREAD_SIZE = 100
// Messaging is for teachers and parents only.
const CHAT_SUBTITLE = {
  teacher: 'Conversations with parents of your class',
  parent: "Chat with your child's teacher",
}

/** Second line under each contact: who they are to the signed-in user. */
function useContactContext(user) {
  const students = useApi(() => (user.role === 'teacher' ? api.students.list() : Promise.resolve([])), [user.role])
  return useMemo(() => {
    const ctx = {}
    if (user.role === 'teacher') {
      for (const st of students.data || []) for (const l of st.parentLinks || []) if (l.parent) ctx[l.parent.id] = `${label(RELATIONSHIP, l.relationship)} of ${st.fullName}`
    } else if (user.role === 'parent') {
      for (const child of user.api.children || []) if (child.class?.homeroomTeacherId) ctx[child.class.homeroomTeacherId] = `Teacher · ${child.class.name}`
    }
    return ctx
  }, [students.data, user])
}

// One conversation per person the backend allows (teacher ↔ parents of the class, staff of the school…). Text only.
function useConversations(user) {
  const contacts = useApi(() => api.messages.contacts(), [])
  const context = useContactContext(user)
  useEffect(() => {
    const timer = setInterval(contacts.reload, CONTACTS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [contacts.reload])
  const convs = useMemo(
    () =>
      (contacts.data || []).map((c) => ({
        id: c.user.id,
        name: c.user.fullName,
        sub: context[c.user.id] || roleLabel(c.user.role),
        unread: c.unread,
        canReply: c.canReply,
        last: c.lastMessage && { text: c.lastMessage.content, at: new Date(c.lastMessage.createdAt).getTime(), mine: c.lastMessage.senderId === user.apiId },
      })),
    [contacts.data, context, user.apiId],
  )
  return { convs, loading: contacts.initial, reload: contacts.reload }
}

export default function ChatPage() {
  const { user, refreshCounts } = useStore()
  const toast = useToast()
  const { convs, loading, reload } = useConversations(user)
  const [activeId, setActiveId] = useState(null)
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 860px)').matches
  const active = convs.find((c) => c.id === activeId) || (wide ? convs[0] : null)

  const thread = useApi(() => (active ? api.messages.thread(active.id, { limit: THREAD_SIZE }) : Promise.resolve(undefined)), [active?.id])
  const msgs = useMemo(() => (thread.data?.items || []).map((m) => toMessage(m, user.apiId)).reverse(), [thread.data, user.apiId])

  useEffect(() => {
    if (!active) return
    const timer = setInterval(thread.reload, THREAD_REFRESH_MS)
    return () => clearInterval(timer)
  }, [active, thread.reload])

  // Opening a conversation marks what the other person sent as read (for the badges on every device).
  const activeUnread = active?.unread || 0
  const activeKey = active?.id
  useEffect(() => {
    if (!activeKey || activeUnread === 0) return
    api.messages
      .markRead(activeKey)
      .then(() => {
        reload()
        refreshCounts()
      })
      .catch(() => {})
  }, [activeKey, activeUnread, reload, refreshCounts])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [active?.id, msgs.length])

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    if (!navigator.onLine) return toast('Unable to send the message. Please try again.', 'error')
    setSending(true)
    try {
      await api.messages.send(active.id, body)
      setText('')
      thread.reload()
      reload()
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setSending(false)
    }
  }

  const list = convs.filter((c) => norm(`${c.name} ${c.sub}`).includes(norm(q)))
  let lastDay = ''

  return (
    <div className={`chat-page ${active ? 'in-conv' : ''}`}>
      <div className="chat-page-head">
        <PageHeader title="Messages" subtitle={CHAT_SUBTITLE[user.role] || CHAT_SUBTITLE.parent} />
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
                  <span className={`chat-conv-last ${c.unread ? 'unread' : ''}`}>{c.last ? `${c.last.mine ? 'You: ' : ''}${c.last.text}` : 'No messages yet'}</span>
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
                {msgs.length === 0 && <div className="chat-hint">Say hello to start the conversation.</div>}
                {msgs.map((m) => {
                  const day = toISO(new Date(m.at))
                  const sep = day !== lastDay
                  lastDay = day
                  return (
                    <div key={m.id}>
                      {sep && <div className="chat-sep">{dayLabel(day)}</div>}
                      <div className={`bubble-row ${m.mine ? 'me' : ''}`}>
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
                <button className="btn btn-primary" disabled={!text.trim() || sending} aria-label="Send message">
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
