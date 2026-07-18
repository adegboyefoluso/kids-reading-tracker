import { useState, useEffect, useRef } from 'react'
import { getReaderProfile, updateReaderProfile } from '../services/rewards'
import { CURRICULUM, GRADES } from '../data/curriculum'

// ── Text renderer ─────────────────────────────────────────────────────────────
function TextBlock({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const out = []
  let listItems = []
  let numItems = []

  const flushBullets = () => {
    if (listItems.length) {
      out.push(
        <ul key={`ul-${out.length}`} style={{ margin: '6px 0 8px 18px', padding: 0, listStyleType: 'disc' }}>
          {listItems}
        </ul>
      )
      listItems = []
    }
  }
  const flushNums = () => {
    if (numItems.length) {
      out.push(
        <ol key={`ol-${out.length}`} style={{ margin: '6px 0 8px 22px', padding: 0 }}>
          {numItems}
        </ol>
      )
      numItems = []
    }
  }
  const flush = () => { flushBullets(); flushNums() }

  const parseInline = (s) =>
    s.replace(/\*\*(.+?)\*\*/g, (_, t) => `<strong style="color:#e5e5e5">${t}</strong>`)
     .replace(/`(.+?)`/g, (_, t) => `<code style="background:#1e1e1e;padding:1px 5px;border-radius:3px;font-size:0.85em">${t}</code>`)

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (/^##\s/.test(trimmed)) return  // section headings handled by card header
    if (/^###\s/.test(trimmed)) {
      flush()
      out.push(<div key={i} style={{ color: '#93c5fd', fontWeight: 700, fontSize: '0.83rem', margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{trimmed.slice(4)}</div>)
      return
    }
    if (!trimmed) { flush(); out.push(<div key={i} style={{ height: 6 }} />); return }

    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/)
    if (numMatch) {
      flushBullets()
      numItems.push(<li key={i} style={{ marginBottom: 5, lineHeight: 1.65, fontSize: '0.88rem', color: '#d4d4d4' }} dangerouslySetInnerHTML={{ __html: parseInline(numMatch[2]) }} />)
      return
    }
    if (/^[-*•]\s/.test(trimmed)) {
      flushNums()
      listItems.push(<li key={i} style={{ marginBottom: 4, lineHeight: 1.65, fontSize: '0.88rem', color: '#d4d4d4' }} dangerouslySetInnerHTML={{ __html: parseInline(trimmed.replace(/^[-*•]\s/, '')) }} />)
      return
    }
    flush()
    out.push(<p key={i} style={{ margin: '5px 0', lineHeight: 1.7, fontSize: '0.88rem', color: '#d4d4d4' }} dangerouslySetInnerHTML={{ __html: parseInline(trimmed) }} />)
  })
  flush()
  return <div>{out}</div>
}

function AIText({ text }) {
  return <TextBlock text={text} />
}

// ── Parse textbook sections by ## headings ────────────────────────────────────
function parseSections(text) {
  const lines = text.split('\n')
  const sections = []
  let current = null

  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (current) sections.push(current)
      current = { title: line.replace(/^##\s+/, '').trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    } else {
      if (!sections.length) sections.push({ title: null, lines: [] })
      sections[sections.length - 1].lines.push(line)
    }
  }
  if (current) sections.push(current)
  return sections
    .map(s => ({ title: s.title, content: s.lines.join('\n').trim() }))
    .filter(s => s.content || s.title)
}

const SECTION_COLORS = [
  { border: '#2563eb', header: '#1d3a6e', icon: '📘' },
  { border: '#7c3aed', header: '#2e1a5e', icon: '🔑' },
  { border: '#0891b2', header: '#0a2e3a', icon: '⚙️'  },
  { border: '#059669', header: '#0a2e1e', icon: '✏️'  },
  { border: '#d97706', header: '#3a2000', icon: '⚠️'  },
  { border: '#db2777', header: '#3a0a1e', icon: '📝'  },
]

// ── Main component ────────────────────────────────────────────────────────────
export default function LearnView({ readerId }) {
  const [grade, setGrade]         = useState(null)
  const [loadingGrade, setLoading] = useState(true)
  const [topic, setTopic]         = useState(null)

  const [explanation, setExplanation] = useState('')
  const [explaining, setExplaining]   = useState(false)
  const [sections, setSections]       = useState([])

  const [messages, setMessages]     = useState([])
  const [followUp, setFollowUp]     = useState('')
  const [chatting, setChatting]     = useState(false)

  const [practiceQ, setPracticeQ]       = useState('')
  const [loadingPractice, setLoadingPractice] = useState(false)
  const [answer, setAnswer]             = useState('')
  const [feedback, setFeedback]         = useState(null)
  const [checking, setChecking]         = useState(false)

  const [error, setError] = useState(null)
  const chatInputRef      = useRef(null)
  const chatAreaRef       = useRef(null)
  const bottomRef         = useRef(null)

  useEffect(() => {
    if (!readerId) return
    getReaderProfile(readerId)
      .then(p => { setGrade(p.grade || null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [readerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, feedback, practiceQ])

  async function selectTopic(t) {
    setTopic(t)
    setExplanation('')
    setSections([])
    setMessages([])
    setFollowUp('')
    setPracticeQ('')
    setAnswer('')
    setFeedback(null)
    setError(null)
    setExplaining(true)
    try {
      const r = await fetch('/api/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, topic: t, learnAction: 'explain' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setExplanation(d.text)
      setSections(parseSections(d.text))
      setMessages([
        { role: 'user', content: `Explain "${t}" in detail.` },
        { role: 'assistant', content: d.text },
      ])
    } catch (e) { setError(e.message) }
    finally { setExplaining(false) }
  }

  function askAboutSection(sectionTitle) {
    setFollowUp(`About the "${sectionTitle}" section: `)
    setTimeout(() => {
      chatInputRef.current?.focus()
      chatAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  async function sendFollowUp() {
    const q = followUp.trim()
    if (!q || chatting) return
    const updated = [...messages, { role: 'user', content: q }]
    setMessages(updated)
    setFollowUp('')
    setChatting(true)
    try {
      const r = await fetch('/api/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, topic, learnAction: 'chat', messages: updated }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMessages(m => [...m, { role: 'assistant', content: d.text }])
    } catch (e) { setError(e.message) }
    finally { setChatting(false) }
  }

  async function getPractice() {
    setPracticeQ('')
    setAnswer('')
    setFeedback(null)
    setLoadingPractice(true)
    try {
      const r = await fetch('/api/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, topic, learnAction: 'practice' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPracticeQ(d.text)
    } catch (e) { setError(e.message) }
    finally { setLoadingPractice(false) }
  }

  async function checkAnswer() {
    if (!answer.trim() || !practiceQ || checking) return
    setChecking(true)
    setFeedback(null)
    try {
      const r = await fetch('/api/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade, topic, learnAction: 'check', userAnswer: answer.trim(),
          messages: [{ role: 'assistant', content: practiceQ }],
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setFeedback(d)
    } catch (e) { setError(e.message) }
    finally { setChecking(false) }
  }

  const gradeData = grade ? CURRICULUM[String(grade)] : null
  const qaMessages = messages.slice(2) // skip the initial explain exchange

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loadingGrade) return (
    <div style={{ padding: '40px 16px', textAlign: 'center', color: '#6b7280' }}>Loading…</div>
  )

  // ── No grade set ─────────────────────────────────────────────────────────
  if (!grade) return (
    <div style={{ padding: '24px 16px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📐</div>
        <h2 style={{ color: '#e5e5e5', fontSize: '1.1rem', marginBottom: 6 }}>Math Tutor</h2>
        <p style={{ color: '#6b7280', fontSize: '0.82rem' }}>
          Pick your grade to get started — or ask a parent/admin to set it for you.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {GRADES.map(g => (
          <button key={g} onClick={async () => {
            setGrade(g)
            try { await updateReaderProfile(readerId, { grade: g }) } catch {}
          }} style={{ background: '#141414', border: '1px solid #2e2e2e', borderRadius: 10, padding: '12px 4px', cursor: 'pointer', color: '#e5e5e5', fontWeight: 700, fontSize: '0.85rem' }}>
            {g === 'K' ? 'K' : `Gr ${g}`}
          </button>
        ))}
      </div>
    </div>
  )

  // ── Main layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 120 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: '1.5rem' }}>📐</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '1rem' }}>Math Tutor</div>
          <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{gradeData?.label} · Common Core</div>
        </div>
        <button onClick={() => { setGrade(null); setTopic(null) }}
          style={{ background: 'none', border: '1px solid #2e2e2e', borderRadius: 6, padding: '4px 8px', color: '#6b7280', fontSize: '0.72rem', cursor: 'pointer' }}>
          Change grade
        </button>
      </div>

      {/* Topic list */}
      {!topic && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
            Select a topic to study
          </div>
          {gradeData.topics.map(t => (
            <button key={t} onClick={() => selectTopic(t)}
              style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '13px 14px', textAlign: 'left', color: '#e5e5e5', fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>📖</span>
              <span style={{ flex: 1 }}>{t}</span>
              <span style={{ color: '#4b5563', fontSize: '0.75rem' }}>→</span>
            </button>
          ))}
        </div>
      )}

      {/* Lesson area */}
      {topic && (
        <div>
          {/* Back + topic title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <button onClick={() => { setTopic(null); setExplanation(''); setSections([]); setPracticeQ(''); setFeedback(null) }}
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 4px', lineHeight: 1 }}>←</button>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.95rem' }}>{topic}</div>
              <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>Textbook lesson · {gradeData?.label}</div>
            </div>
          </div>

          {/* Loading skeleton */}
          {explaining && (
            <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ color: '#60a5fa', fontSize: '1.5rem', marginBottom: 8 }}>✨</div>
              <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Building your lesson…</div>
              <div style={{ color: '#4b5563', fontSize: '0.75rem', marginTop: 4 }}>This may take a moment</div>
            </div>
          )}

          {/* Section cards */}
          {!explaining && sections.map((sec, idx) => {
            const color = SECTION_COLORS[idx % SECTION_COLORS.length]
            return (
              <div key={idx} style={{ border: `1px solid ${color.border}44`, borderLeft: `3px solid ${color.border}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
                {sec.title && (
                  <div style={{ background: color.header, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1rem' }}>{color.icon}</span>
                    <span style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.88rem' }}>{sec.title}</span>
                  </div>
                )}
                <div style={{ padding: '12px 14px', background: '#0d0d0d' }}>
                  <AIText text={sec.content} />
                  {sec.title && (
                    <button onClick={() => askAboutSection(sec.title)}
                      style={{ marginTop: 10, background: 'none', border: `1px solid ${color.border}66`, borderRadius: 7, padding: '5px 11px', color: color.border === '#2563eb' ? '#60a5fa' : '#a78bfa', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      ❓ Ask about this section
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {error && <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: 12 }}>⚠ {error}</div>}

          {/* Q&A thread */}
          {!explaining && explanation && (
            <div ref={chatAreaRef} style={{ marginTop: 4, marginBottom: 14 }}>
              <div style={{ color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                💬 Questions & Answers
              </div>

              {qaMessages.length > 0 && (
                <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                  {qaMessages.map((m, i) => (
                    <div key={i} style={{ marginBottom: i < qaMessages.length - 1 ? 12 : 0 }}>
                      <div style={{ color: m.role === 'user' ? '#60a5fa' : '#a3e635', fontSize: '0.72rem', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {m.role === 'user' ? '🙋 You' : '🤖 Tutor'}
                      </div>
                      <AIText text={m.content} />
                    </div>
                  ))}
                  {chatting && (
                    <div style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: 8, fontStyle: 'italic' }}>Thinking… ✨</div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={chatInputRef}
                  value={followUp}
                  onChange={e => setFollowUp(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendFollowUp()}
                  placeholder="Ask a question about any section…"
                  style={{ flex: 1, fontSize: '0.85rem', background: '#0d0d0d', border: '1px solid #2e2e2e', borderRadius: 8, padding: '9px 12px', color: '#e5e5e5', outline: 'none' }}
                  disabled={chatting}
                />
                <button onClick={sendFollowUp} disabled={!followUp.trim() || chatting}
                  style={{ background: followUp.trim() && !chatting ? '#2563eb' : '#1e1e1e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600, cursor: followUp.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'background 0.2s' }}>
                  {chatting ? '…' : 'Ask'}
                </button>
              </div>
            </div>
          )}

          {/* Practice problem */}
          {!explaining && explanation && (
            <div style={{ background: '#0a100a', border: '1px solid #14532d', borderRadius: 12, padding: '14px 14px' }}>
              <div style={{ color: '#22c55e', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>✏️ Practice Problem</div>

              {!practiceQ && !loadingPractice && (
                <button onClick={getPractice}
                  style={{ background: '#166534', color: '#22c55e', border: '1px solid #22c55e44', borderRadius: 8, padding: '9px 18px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  Try a practice problem →
                </button>
              )}

              {loadingPractice && <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Generating… ✨</div>}

              {practiceQ && !loadingPractice && (
                <>
                  <div style={{ background: '#141414', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                    <AIText text={practiceQ} />
                  </div>

                  {!feedback && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={answer}
                        onChange={e => setAnswer(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && checkAnswer()}
                        placeholder="Your answer…"
                        style={{ flex: 1, fontSize: '0.85rem', background: '#0d0d0d', border: '1px solid #2e2e2e', borderRadius: 8, padding: '9px 12px', color: '#e5e5e5', outline: 'none' }}
                        disabled={checking}
                      />
                      <button onClick={checkAnswer} disabled={!answer.trim() || checking}
                        style={{ background: '#166534', color: '#22c55e', border: '1px solid #22c55e44', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {checking ? '…' : 'Check ✓'}
                      </button>
                    </div>
                  )}

                  {feedback && (
                    <>
                      <div style={{ background: feedback.correct ? '#0a1a0a' : '#1a0a0a', border: `1px solid ${feedback.correct ? '#22c55e' : '#f87171'}`, borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
                        <AIText text={feedback.text} />
                      </div>
                      <button onClick={() => { setFeedback(null); setAnswer(''); getPractice() }}
                        style={{ marginTop: 10, background: 'none', border: '1px solid #22c55e', color: '#22c55e', borderRadius: 8, padding: '7px 14px', fontSize: '0.82rem', cursor: 'pointer' }}>
                        Try another problem →
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
