import { useState, useEffect } from 'react'
import { subscribeToBooks, deleteBook, updateBook, getBook, getGoal, setGoal, saveNotificationSettings, addChatMessage, setCanResubmit } from '../services/books'
import { getReaders, deleteReader, createFamilyReader } from '../services/readers'
import { getSession } from '../services/auth'
import { requestPushPermission, subscribeToPush, notifyGraded, notifyChatToReader } from '../services/push'
import { getBuddyChatsForAdmin } from '../services/buddy'
import { getTestsForFamily } from '../services/tests'
import { getChores, setChores, getChoreLog, getChoreMonthly, setReaderGoal, getReaderGoal, getLeaderboard, backfillBookRewards, backfillReaderNames, getPayments, makePayment, recalculateBalance, setBalance, updateReaderProfile } from '../services/rewards'
import Pagination, { PAGE_SIZE } from '../components/Pagination'

const READER_EMOJIS = ['😊', '🦁', '🐯', '🦊', '🐼', '🦋', '🐸', '🦄', '🐙', '🦕', '🚀', '⭐']

// ── Inline correction highlighting ────────────────────────────────────────
const CORR_COLOR = { spelling: '#ff6b6b', grammar: '#f59e0b', structure: '#60a5fa' }
function HighlightedSummary({ text, correctionsJson }) {
  const corrections = (() => { try { return JSON.parse(correctionsJson || '[]') } catch { return [] } })()
  if (!corrections.length) return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>

  const found = []
  let searchFrom = 0
  for (const c of corrections.filter(c => c.quote)) {
    const pos = text.indexOf(c.quote, searchFrom)
    if (pos !== -1) { found.push({ ...c, pos, end: pos + c.quote.length }); searchFrom = pos + c.quote.length }
  }
  found.sort((a, b) => a.pos - b.pos)

  const segments = []
  let offset = 0
  found.forEach((c, i) => {
    if (c.pos < offset) return
    if (c.pos > offset) segments.push(<span key={`t${i}`}>{text.slice(offset, c.pos)}</span>)
    const col = CORR_COLOR[c.type] || '#e5e5e5'
    segments.push(
      <span key={`c${i}`} title={`${c.issue} → ${c.fix}`}
        style={{ background: col + '22', borderBottom: `2px solid ${col}`, borderRadius: 2, cursor: 'help' }}>
        {c.quote}
      </span>
    )
    offset = c.end
  })
  if (offset < text.length) segments.push(<span key="tail">{text.slice(offset)}</span>)

  const usedTypes = [...new Set(found.map(c => c.type))]
  return (
    <>
      <span style={{ whiteSpace: 'pre-wrap' }}>{segments}</span>
      {usedTypes.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {usedTypes.map(t => <span key={t} style={{ fontSize: '0.68rem', color: CORR_COLOR[t], display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 3, background: CORR_COLOR[t], display: 'inline-block', borderRadius: 2 }} />
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </span>)}
        </div>
      )}
      {found.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
          {found.map((c, i) => (
            <div key={i} style={{ background: '#0a0a0a', borderLeft: `3px solid ${CORR_COLOR[c.type] || '#e5e5e5'}`, padding: '4px 10px', borderRadius: '0 4px 4px 0', fontSize: '0.73rem' }}>
              <span style={{ color: '#6b7280' }}>"{c.quote}"</span>
              <span style={{ color: '#e5e5e5', margin: '0 6px' }}>→</span>
              <span style={{ color: '#e5e5e5' }}>{c.fix}</span>
              <span style={{ color: CORR_COLOR[c.type] || '#e5e5e5', marginLeft: 6, textTransform: 'capitalize', fontSize: '0.66rem' }}>({c.type})</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Add Reader modal ───────────────────────────────────────────────────────
const GRADE_OPTIONS = ['K','1','2','3','4','5','6','7','8','9','10','11','12']

function AddReaderModal({ onDone, onClose }) {
  const session = getSession()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('😊')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [grade, setGrade] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!email.trim()) { setError('Email is required'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setSaving(true)
    setError(null)
    try {
      await createFamilyReader({ name: name.trim(), emoji, email: email.trim(), password, grade })
      onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400 }}>
        <h3 style={{ color: '#e5e5e5', marginBottom: 16, fontSize: '1.1rem' }}>➕ Add Reader</h3>

        <label className="text-sm text-muted">Display Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Emma" style={{ marginBottom: 14 }} autoFocus />

        <label className="text-sm text-muted" style={{ display: 'block', marginBottom: 8 }}>Pick an emoji</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {READER_EMOJIS.map(e => (
            <span key={e} onClick={() => setEmoji(e)} style={{
              fontSize: '1.4rem', cursor: 'pointer', padding: '4px 6px', borderRadius: 6,
              border: emoji === e ? '2px solid #ffffff' : '2px solid transparent',
              background: emoji === e ? '#1e1e1e' : 'transparent',
            }}>{e}</span>
          ))}
        </div>

        <label className="text-sm text-muted">Email (they'll use this to sign in)</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="reader@email.com" style={{ marginBottom: 14 }}
          autoCapitalize="none" autoCorrect="off" />

        <label className="text-sm text-muted">Password <span style={{ color: '#666' }}>(min 6 characters)</span></label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Set a password for them" style={{ marginBottom: 14 }} />

        <label className="text-sm text-muted" style={{ display: 'block', marginBottom: 6 }}>Grade (for Math Tutor)</label>
        <select value={grade} onChange={e => setGrade(e.target.value)} style={{ marginBottom: 16, width: '100%', background: '#141414', color: '#e5e5e5', border: '1px solid #1e1e1e', borderRadius: 6, padding: '8px 12px' }}>
          <option value="">— Select grade —</option>
          {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g === 'K' ? 'Kindergarten' : `Grade ${g}`}</option>)}
        </select>

        {error && <div className="error-banner" style={{ marginBottom: 12 }}>❌ {error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary w-full" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : '✅ Create Reader'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Book summary + grade + chat modal ─────────────────────────────────────
function BookSummaryModal({ book, onClose, initialTab }) {
  const session = getSession()
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(null)
  const [liveBook, setLiveBook] = useState(book)
  const [activeTab, setActiveTab] = useState(initialTab || 'grade')
  const [chatMsg, setChatMsg] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [localMsgs, setLocalMsgs] = useState(null)
  const [localCanResubmit, setLocalCanResubmit] = useState(null)

  // Keep synced if parent re-renders with updated grade
  useEffect(() => { setLiveBook(book) }, [book])

  // Near-real-time chat: poll this book every 3 s while Chat tab is open
  useEffect(() => {
    if (activeTab !== 'chat') return
    const bookId = liveBook.id
    let cancelled = false
    const poll = async () => {
      try {
        const fresh = await getBook(bookId)
        if (!cancelled) {
          setLiveBook(fresh)
          setLocalMsgs(null)        // let authoritative data drive
          setLocalCanResubmit(null) // same for resubmit toggle
        }
      } catch {}
    }
    poll()
    const timer = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [activeTab, liveBook.id])

  const b = liveBook
  const score = b.gradeScore
  const hasGrade = score != null
  const hasAccuracy = b.gradeAccuracy != null && b.gradeAccuracy >= 0
  const isNewGrade = b.gradeGrammar != null
  const baseMax = isNewGrade ? 50 : 30
  const maxScore = hasAccuracy ? baseMax + 10 : baseMax
  const fullScore = hasAccuracy ? (score + b.gradeAccuracy) : score
  const pct = hasGrade ? Math.round((fullScore / maxScore) * 100) : null

  const barColor = pct == null ? '#666' : pct >= 80 ? '#52c87e' : pct >= 60 ? '#f59e0b' : '#ff6b6b'

  const msgs = localMsgs ?? JSON.parse(b.chatMessages || '[]')
  const history = JSON.parse(b.reviewHistory || '[]')
  const canResubmit = localCanResubmit !== null ? localCanResubmit : (b.canResubmit === true)

  async function retryGrade() {
    setRetrying(true)
    setRetryError(null)
    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn: b.isbn, title: b.title, author: b.author, summary: b.review, description: b.description || '' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Grade API error ${res.status}`)
      }
      const g = await res.json()
      await updateBook(b.id, {
        gradeScore: g.score, gradeFeedback: g.feedback,
        gradeComprehension: g.comprehension, gradeDetail: g.detail,
        gradeReflection: g.reflection, gradeGrammar: g.grammar ?? 0,
        gradeStructure: g.structure ?? 0, gradeSuggestions: g.suggestions || '',
        gradeAccuracy: g.accuracy ?? -1, gradeAccuracyNote: g.accuracyNote || '',
        gradeBookFound: g.bookFound ? 1 : 0,
        bookDescriptionPreview: g.bookDescriptionPreview || '',
        aiDetection: g.aiDetection ?? 0, aiWarning: g.aiWarning || '',
        gradeCorrections: JSON.stringify(g.corrections || []),
      })
      setLiveBook(prev => ({
        ...prev, gradeScore: g.score, gradeFeedback: g.feedback,
        gradeComprehension: g.comprehension, gradeDetail: g.detail,
        gradeReflection: g.reflection, gradeGrammar: g.grammar ?? 0,
        gradeStructure: g.structure ?? 0, gradeSuggestions: g.suggestions || '',
        gradeAccuracy: g.accuracy ?? -1, gradeAccuracyNote: g.accuracyNote || '',
        gradeBookFound: g.bookFound ? 1 : 0,
        bookDescriptionPreview: g.bookDescriptionPreview || '',
        aiDetection: g.aiDetection ?? 0, aiWarning: g.aiWarning || '',
        gradeCorrections: JSON.stringify(g.corrections || []),
      }))
      // Notify the reader that their summary has been graded
      if (b.readerId && b.familyId) notifyGraded({ readerId: b.readerId, familyId: b.familyId, bookTitle: b.title, bookId: b.id })
    } catch (e) { setRetryError(e.message) }
    finally { setRetrying(false) }
  }

  async function handleSendMessage() {
    if (!chatMsg.trim()) return
    setChatSending(true)
    const newMsg = { from: 'admin', name: session?.name || 'Admin', msg: chatMsg.trim(), at: new Date().toISOString() }
    const updated = [...msgs, newMsg]
    setLocalMsgs(updated)
    const text = chatMsg.trim()
    setChatMsg('')
    try {
      await addChatMessage(b.id, b.chatMessages, 'admin', session?.name || 'Admin', text)
      // Notify the reader about the admin's message
      if (b.readerId && b.familyId) notifyChatToReader({ readerId: b.readerId, familyId: b.familyId, bookTitle: b.title, bookId: b.id })
    } catch (e) { setLocalMsgs(msgs); console.error('[chat]', e.message) }
    finally { setChatSending(false) }
  }

  async function handleToggleResubmit() {
    const next = !canResubmit
    setLocalCanResubmit(next)
    try { await setCanResubmit(b.id, next) }
    catch (e) { setLocalCanResubmit(canResubmit); console.error('[resubmit]', e.message) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          {b.coverUrl
            ? <img src={b.coverUrl} alt="" style={{ width: 56, height: 84, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
            : <div style={{ width: 56, height: 84, background: '#1e1e1e', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.6rem' }}>📚</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '1.1rem', color: '#e5e5e5', fontWeight: 700, lineHeight: 1.3 }}>{b.title}</div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 3 }}>{b.author}{b.year ? ` · ${b.year}` : ''}</div>
            {b.readerName && (
              <div style={{ fontSize: '0.8rem', color: '#ffffff', marginTop: 4 }}>
                {b.readerEmoji || '📚'} {b.readerName}
              </div>
            )}
            {b.addedAt && (
              <div style={{ fontSize: '0.72rem', color: '#666', marginTop: 3 }}>
                Submitted {new Date(b.addedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #1e1e1e', marginBottom: 12 }} />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[
            { key: 'grade',   label: '📊 Grade' },
            { key: 'chat',    label: `💬 Chat${msgs.length > 0 ? ` (${msgs.length})` : ''}` },
            { key: 'history', label: `📋 History (${history.length})`, disabled: history.length === 0 },
          ].map(t => (
            <button key={t.key} className="btn btn-secondary"
              style={{ padding: '5px 12px', fontSize: '0.78rem', background: activeTab === t.key ? '#ffffff' : undefined, color: activeTab === t.key ? '#000' : undefined, opacity: t.disabled ? 0.35 : 1, cursor: t.disabled ? 'not-allowed' : 'pointer' }}
              onClick={() => !t.disabled && setActiveTab(t.key)}
            >{t.label}</button>
          ))}
        </div>

        {/* ── GRADE TAB ── */}
        {activeTab === 'grade' && (<>
          {hasGrade ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Grade</div>
                {b.gradeBookFound === 1
                  ? <span style={{ fontSize: '0.68rem', color: '#52c87e', background: '#0a1a0a', padding: '2px 8px', borderRadius: 8 }}>✅ Compared to real book</span>
                  : <span style={{ fontSize: '0.68rem', color: '#e5e5e5', background: '#141414', padding: '2px 8px', borderRadius: 8 }}>⚠️ Book not found — no accuracy check</span>
                }
              </div>
              {b.gradeBookFound !== 1 && (
                <div style={{ background: '#141414', border: '1px solid #ffffff', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e5e5e5', marginBottom: 4 }}>⚠️ Accuracy could not be verified</div>
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
                    This book was not found in Google Books or Open Library. The grade reflects <strong>writing quality only</strong>.
                  </p>
                </div>
              )}
              {b.gradeBookFound === 1 && b.bookDescriptionPreview && (
                <div style={{ background: '#040d04', border: '1px solid #166534', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                  <div style={{ fontSize: '0.68rem', color: '#52c87e', marginBottom: 4 }}>📖 Book description used for comparison:</div>
                  <p style={{ fontSize: '0.75rem', color: '#6a9a6a', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>"{b.bookDescriptionPreview}…"</p>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 10, background: '#1e1e1e', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 5, transition: 'width 0.8s ease' }} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: barColor, minWidth: 50, textAlign: 'right' }}>{pct}%</div>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#666', marginBottom: 14 }}>{fullScore} / {maxScore} points</div>
              {[
                ['Comprehension', b.gradeComprehension], ['Detail', b.gradeDetail], ['Reflection', b.gradeReflection],
                ...(isNewGrade ? [['Grammar', b.gradeGrammar], ['Structure', b.gradeStructure]] : []),
                ...(hasAccuracy ? [['Accuracy vs Book', b.gradeAccuracy]] : []),
              ].map(([label, val]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</span>
                    <span style={{ fontSize: '0.75rem', color: '#e5e5e5', fontWeight: 600 }}>{val ?? '—'}/10</span>
                  </div>
                  <div style={{ height: 5, background: '#1e1e1e', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${((val ?? 0) / 10) * 100}%`, background: label === 'Accuracy vs Book' ? '#52c87e' : '#ffffff', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
              {b.gradeAccuracyNote && (
                <div style={{ background: '#0a1a0a', border: '1px solid #166534', borderRadius: 8, padding: '10px 12px', marginTop: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: '0.7rem', color: '#52c87e', fontWeight: 700, marginBottom: 4 }}>📖 Accuracy Note</div>
                  <p style={{ color: '#b0d4b0', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>{b.gradeAccuracyNote}</p>
                </div>
              )}
              {b.gradeFeedback && (
                <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 8, padding: '10px 14px', fontStyle: 'italic', color: '#6b7280', fontSize: '0.83rem', lineHeight: 1.55 }}>
                  "{b.gradeFeedback}"
                </div>
              )}
              {b.gradeSuggestions && (
                <div style={{ background: '#111111', border: '1px solid #1a2a4a', borderRadius: 8, padding: '12px 14px', marginTop: 12 }}>
                  <div style={{ fontSize: '0.72rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 8 }}>💡 Suggestions for improvement</div>
                  {b.gradeSuggestions.split('\n').filter(s => s.trim()).map((tip, i) => (
                    <p key={i} style={{ color: '#93c5fd', fontSize: '0.82rem', lineHeight: 1.6, margin: '0 0 6px' }}>{tip}</p>
                  ))}
                </div>
              )}
              {(() => {
                const ai = b.aiDetection ?? 0
                if (ai <= 55) return <div style={{ marginTop: 12, fontSize: '0.75rem', color: '#52c87e' }}>✅ AI check: Looks like original writing ({ai}%)</div>
                const isHigh = ai > 75
                return (
                  <div style={{ marginTop: 12, background: isHigh ? '#1e0929' : '#141414', border: `1px solid ${isHigh ? '#ff4444' : '#ffffff'}`, borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isHigh ? '#ff6b6b' : '#e5e5e5', marginBottom: 4 }}>
                      {isHigh ? '🚨 Likely AI-generated' : '⚠️ Possible AI assistance'} — {ai}%
                    </div>
                    {b.aiWarning && <p style={{ fontSize: '0.8rem', color: '#c8a870', margin: 0, lineHeight: 1.5 }}>{b.aiWarning}</p>}
                  </div>
                )
              })()}
              {b.review && b.review.trim().length > 0 && (
                <div style={{ marginTop: 14 }}>
                  {retryError && <div style={{ color: '#ff6b6b', fontSize: '0.8rem', marginBottom: 8, textAlign: 'center' }}>❌ {retryError}</div>}
                  <button className="btn btn-secondary" style={{ width: '100%', padding: '9px', fontSize: '0.82rem' }} onClick={retryGrade} disabled={retrying}>
                    {retrying ? '⏳ Grading…' : '🔄 Re-grade'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#666', fontSize: '0.85rem', textAlign: 'center', marginBottom: 12 }}>⏳ AI grade not yet available</div>
              {retryError && <div style={{ color: '#ff6b6b', fontSize: '0.8rem', marginBottom: 8, textAlign: 'center' }}>❌ {retryError}</div>}
              {b.review && b.review.trim().length > 0 && (
                <button className="btn btn-secondary" style={{ width: '100%', padding: '10px' }} onClick={retryGrade} disabled={retrying}>
                  {retrying ? '⏳ Grading…' : '🤖 Grade Now'}
                </button>
              )}
            </div>
          )}
          {b.review ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Reader's Summary <span style={{ color: '#555', textTransform: 'none' }}>({b.review.trim().split(/\s+/).length} words)</span>
              </div>
              <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 8, padding: '12px 14px', fontSize: '0.85rem', color: '#c8a870', lineHeight: 1.65, maxHeight: 320, overflowY: 'auto' }}>
                {/* Only show corrections for the active grade — not stale marks from a previous grade */}
                {b.gradeScore != null && b.gradeCorrections
                  ? <HighlightedSummary text={b.review} correctionsJson={b.gradeCorrections} />
                  : <span style={{ whiteSpace: 'pre-wrap' }}>{b.review}</span>
                }
              </div>
            </div>
          ) : (
            <div style={{ color: '#666', fontSize: '0.85rem', textAlign: 'center', marginBottom: 16 }}>No summary submitted for this book.</div>
          )}
        </>)}

        {/* ── CHAT TAB ── */}
        {activeTab === 'chat' && (
          <div>
            {/* Allow Resubmission toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '12px 14px', background: '#0a0a0a', borderRadius: 8, border: canResubmit ? '1px solid #52c87e' : '1px solid #1e1e1e' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600 }}>Allow Resubmission</div>
                <div style={{ fontSize: '0.72rem', color: canResubmit ? '#52c87e' : '#6b7280', marginTop: 2 }}>
                  {canResubmit ? '✅ Reader can now rewrite and resubmit' : 'Toggle to let the reader submit a new summary'}
                </div>
              </div>
              <div onClick={handleToggleResubmit} style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', flexShrink: 0, marginLeft: 12, background: canResubmit ? '#52c87e' : '#2a2a2a', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: canResubmit ? '#0a0a0a' : '#555', position: 'absolute', top: 3, left: canResubmit ? 21 : 3, transition: 'left 0.2s' }} />
              </div>
            </div>

            {/* Messages */}
            <div style={{ minHeight: 100, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {msgs.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0' }}>
                  No messages yet — write the reader some feedback below ↓
                </div>
              ) : msgs.map((m, i) => (
                <div key={i} style={{ alignSelf: m.from === 'admin' ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                  <div style={{ background: m.from === 'admin' ? '#ffffff' : '#1e1e1e', color: m.from === 'admin' ? '#0a0a0a' : '#e5e5e5', borderRadius: m.from === 'admin' ? '12px 12px 0 12px' : '12px 12px 12px 0', padding: '8px 12px', fontSize: '0.85rem', lineHeight: 1.5 }}>
                    {m.msg}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#555', marginTop: 3, textAlign: m.from === 'admin' ? 'right' : 'left' }}>
                    {m.name} · {new Date(m.at).toLocaleDateString()} {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>

            {/* Admin input */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea rows={2} value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                placeholder="Write feedback to the reader… (Enter to send, Shift+Enter for newline)"
                style={{ flex: 1, resize: 'none', fontSize: '0.85rem', marginBottom: 0 }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }}
              />
              <button className="btn btn-primary" style={{ padding: '0 16px', height: 56, fontSize: '0.82rem', flexShrink: 0 }}
                onClick={handleSendMessage} disabled={chatSending || !chatMsg.trim()}>
                {chatSending ? '…' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>Previous submissions — oldest first. Current submission is in the Grade tab.</p>
            {history.map((h, i) => {
              const hIsNew = h.gradeGrammar != null
              const hBase  = hIsNew ? 50 : 30
              const hHasAcc = h.gradeAccuracy != null && h.gradeAccuracy >= 0
              const hTotal  = hHasAcc ? hBase + 10 : hBase
              const hFull   = hHasAcc ? (h.gradeScore + h.gradeAccuracy) : h.gradeScore
              const hPct    = h.gradeScore != null ? Math.round((hFull / hTotal) * 100) : null
              const hColor  = hPct == null ? '#666' : hPct >= 80 ? '#52c87e' : hPct >= 60 ? '#f59e0b' : '#ff6b6b'
              return (
                <div key={i} style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Submission {i + 1}</span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {hPct != null && <span style={{ fontWeight: 700, color: hColor, fontSize: '0.9rem' }}>{hPct}%</span>}
                      <span style={{ fontSize: '0.7rem', color: '#555' }}>{h.submittedAt ? new Date(h.submittedAt).toLocaleDateString() : '—'}</span>
                    </div>
                  </div>
                  {h.gradeFeedback && (
                    <p style={{ color: '#6b7280', fontSize: '0.78rem', lineHeight: 1.5, fontStyle: 'italic', margin: '0 0 8px', borderLeft: '2px solid #333', paddingLeft: 8 }}>"{h.gradeFeedback}"</p>
                  )}
                  <div style={{ fontSize: '0.78rem', color: '#555', lineHeight: 1.65, maxHeight: 140, overflowY: 'auto', borderTop: '1px solid #1e1e1e', paddingTop: 8, whiteSpace: 'pre-wrap' }}>
                    {h.review || '(no text saved)'}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button className="btn btn-secondary" style={{ width: '100%', padding: '10px', marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

// ── Book row ───────────────────────────────────────────────────────────────
function BookRow({ book, onDelete, onEdit, onView }) {
  const [imgErr, setImgErr] = useState(false)
  const date = book.addedAt ? new Date(book.addedAt).toLocaleDateString() : '—'
  const hasGrade = book.gradeScore != null
  const isNewGradeRow = book.gradeGrammar != null
  const baseRowMax = isNewGradeRow ? 50 : 30
  const hasAccRow = book.gradeAccuracy != null && book.gradeAccuracy >= 0
  const rowTotal = hasAccRow ? baseRowMax + 10 : baseRowMax
  const rowFull = hasAccRow ? (book.gradeScore + book.gradeAccuracy) : book.gradeScore
  const pct = hasGrade ? Math.round((rowFull / rowTotal) * 100) : null
  const hasSummary = book.status === 'finished' && book.review && book.review.trim().length > 0

  return (
    <div className="book-list-item">
      {book.coverUrl && !imgErr
        ? <img src={book.coverUrl} alt="" onError={() => setImgErr(true)} />
        : <div className="cover-placeholder">📚</div>
      }
      <div className="info">
        <h3>{book.title}</h3>
        <p>{book.author} {book.year ? `(${book.year})` : ''}</p>
        <p style={{ marginTop: 4, fontSize: '0.75rem' }}>
          <span style={{
            background: book.status === 'finished' ? '#052e16' : '#1a2a3a',
            color: book.status === 'finished' ? '#80ff80' : '#80c0ff',
            padding: '2px 8px', borderRadius: 10, marginRight: 8,
          }}>
            {book.status === 'finished' ? '✅ Finished' : book.status === 'reading' ? '📖 Reading' : '🔖 Want to Read'}
          </span>
          {book.rating > 0 && <span style={{ color: '#e5e5e5' }}>{'★'.repeat(book.rating)}</span>}
          {book.readerName && <span style={{ color: '#ffffff', marginLeft: 8 }}>{book.readerEmoji || ''} {book.readerName}</span>}
          <span style={{ color: '#666', marginLeft: 8 }}>{date}</span>
          {hasSummary && !hasGrade && <span style={{ color: '#6b7280', marginLeft: 8 }}>· ⏳ grade pending</span>}
          {hasGrade && <span style={{ color: pct >= 80 ? '#52c87e' : pct >= 60 ? '#f59e0b' : '#ff6b6b', marginLeft: 8, fontWeight: 600 }}>· 🎯 {pct}%</span>}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {hasSummary && (
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => onView(book)} title="View summary & grade">📋</button>
        )}
        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => onEdit(book)}>✏️</button>
        <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => onDelete(book.id)}>🗑️</button>
      </div>
    </div>
  )
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function EditModal({ book, readers, onSave, onClose }) {
  const [rating, setRating] = useState(book.rating || 0)
  const [review, setReview] = useState(book.review || '')
  const [status, setStatus] = useState(book.status || 'finished')
  const [readerId, setReaderId] = useState(book.readerId || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const updates = { rating, review, status }
    if (status === 'finished' && book.status !== 'finished') {
      updates.finishedAt = new Date().toISOString()
    }
    if (readerId !== (book.readerId || '')) {
      const r = readers.find(r => r.id === readerId)
      updates.readerId = readerId
      updates.readerName = r?.name || ''
      updates.readerEmoji = r?.emoji || ''
    }
    await updateBook(book.id, updates)
    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: '#141414', borderRadius: 10, padding: 24, width: '100%', maxWidth: 420, border: '1px solid #1e1e1e' }}>
        <h2 style={{ color: '#e5e5e5', marginBottom: 4, fontSize: '1.1rem' }}>{book.title}</h2>
        {book.readerName && <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: 12 }}>{book.readerEmoji} {book.readerName}</p>}

        <label className="text-sm text-muted">Status</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {['finished', 'reading', 'want-to-read'].map(s => (
            <button key={s} className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', background: status === s ? '#ffffff' : undefined, color: status === s ? '#000' : undefined }}
              onClick={() => setStatus(s)}>
              {s === 'finished' ? '✅ Finished' : s === 'reading' ? '📖 Reading' : '🔖 Want to Read'}
            </button>
          ))}
        </div>

        <label className="text-sm text-muted">Rating</label>
        <div className="stars" style={{ marginBottom: 12 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <span key={n} className={`star ${n <= rating ? 'lit' : ''}`} onClick={() => setRating(n)}>★</span>
          ))}
        </div>

        <textarea rows={3} value={review} onChange={e => setReview(e.target.value)} placeholder="Review…" style={{ marginBottom: 16 }} />

        {readers.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label className="text-sm text-muted">Reader</label>
            <select
              value={readerId}
              onChange={e => setReaderId(e.target.value)}
              style={{ width: '100%', marginTop: 6, background: '#141414', color: '#e5e5e5', border: '1px solid #1e1e1e', borderRadius: 6, padding: '8px 12px' }}
            >
              <option value="">— Unassigned —</option>
              {readers.map(r => (
                <option key={r.id} value={r.id}>{r.emoji || '📚'} {r.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Admin view ─────────────────────────────────────────────────────────────
export default function AdminView() {
  const session = getSession()

  const [books, setBooks] = useState([])
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [readerFilter, setReaderFilter] = useState('all')
  const [goal, setGoalState] = useState(20)
  const [goalInput, setGoalInput] = useState(20)
  const [goalSaved, setGoalSaved] = useState(false)
  const [editBook, setEditBook] = useState(null)
  const [viewBook, setViewBook] = useState(null)
  const [readers, setReaders] = useState([])
  const [addReaderOpen, setAddReaderOpen] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState(null)
  const [page, setPage] = useState(1)
  const [emailAddr, setEmailAddr]             = useState('')
  const [notifyWeekly, setNotifyWeekly]       = useState(true)
  const [notifyInactivity, setNotifyInactivity] = useState(true)
  const [notifyMilestones, setNotifyMilestones] = useState(true)
  const [emailSaving, setEmailSaving]         = useState(false)
  const [emailSaved, setEmailSaved]           = useState(false)
  const [emailError, setEmailError]           = useState(null)
  const [inviteLink, setInviteLink]           = useState('')
  const [inviteLoading, setInviteLoading]     = useState(false)
  const [inviteError, setInviteError]         = useState(null)
  const [inviteCopied, setInviteCopied]       = useState(false)
  const [notifPerm, setNotifPerm]             = useState(() =>
    ('Notification' in window ? Notification.permission : 'unsupported')
  )
  const [notifDismissed, setNotifDismissed]   = useState(
    () => localStorage.getItem('adminNotifCardDismissed') === '1'
  )
  const [viewBookTab, setViewBookTab]         = useState('grade')
  const [navSection, setNavSection]           = useState('books')
  const [menuOpen, setMenuOpen]               = useState(false)

  // Auto-subscribe admin silently when permission is already granted
  useEffect(() => {
    if (session?.readerId && notifPerm === 'granted') {
      subscribeToPush(session.readerId)
    }
  }, [session?.readerId])

  // Deep-link: open a book on the right tab when the SW posts a message (app already open)
  useEffect(() => {
    function onSwMessage(event) {
      if (event.data?.type !== 'OPEN_BOOK_CHAT') return
      const book = books.find(b => b.id === event.data.bookId)
      if (book) { setViewBook(book); setViewBookTab(event.data.tab || 'grade') }
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage)
  }, [books])

  // Deep-link: open a book from URL params ?book=ID&tab=TAB (app launched from notification)
  useEffect(() => {
    if (!books.length) return
    const params = new URLSearchParams(window.location.search)
    const bookId = params.get('book')
    if (!bookId) return
    const book = books.find(b => b.id === bookId)
    if (book) { setViewBook(book); setViewBookTab(params.get('tab') || 'grade') }
    // Clean URL so refresh doesn't re-open
    window.history.replaceState({}, '', window.location.pathname)
  }, [books])

  useEffect(() => {
    const unsub = subscribeToBooks(data => {
      setBooks(data)
      setViewBook(prev => prev ? (data.find(b => b.id === prev.id) || prev) : null)
    })
    getGoal().then(g => {
      setGoalState(g.yearly)
      setGoalInput(g.yearly)
      // Use saved adminEmail from Firestore, or fall back to the account's login email
      setEmailAddr(g.adminEmail || session?.email || '')
      if (g.notifyWeekly      !== undefined) setNotifyWeekly(g.notifyWeekly)
      if (g.notifyInactivity  !== undefined) setNotifyInactivity(g.notifyInactivity)
      if (g.notifyMilestones  !== undefined) setNotifyMilestones(g.notifyMilestones)
    })
    getReaders().then(setReaders).catch(() => {})
    return unsub
  }, [])

  async function handleSaveEmail() {
    setEmailError(null)
    if (emailAddr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)) {
      setEmailError('Please enter a valid email address'); return
    }
    setEmailSaving(true)
    try {
      await saveNotificationSettings({ adminEmail: emailAddr, notifyWeekly, notifyInactivity, notifyMilestones })
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 3000)
    } catch (e) { setEmailError(e.message) }
    finally { setEmailSaving(false) }
  }

  // Require admin login
  if (!session || !session.isAdmin) {
    return (
      <div className="admin-view" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
        <div style={{ fontSize: '3rem' }}>🔒</div>
        <h2 style={{ color: '#e5e5e5' }}>Admin Access Required</h2>
        <p style={{ color: '#6b7280', textAlign: 'center' }}>
          {session ? 'Your account does not have admin privileges.' : 'Please sign in with an admin account.'}
        </p>
        <a href="/" className="btn btn-primary" style={{ padding: '10px 24px', textDecoration: 'none' }}>
          🔑 Sign In
        </a>
        <a href="/kiosk" style={{ color: '#6b7280', fontSize: '0.8rem' }}>📺 View Kiosk</a>
      </div>
    )
  }

  async function handleDelete(id) {
    if (!confirm('Remove this book?')) return
    await deleteBook(id)
    setBooks(prev => prev.filter(b => b.id !== id))
  }

  async function handleDeleteReader(id) {
    if (!confirm('Remove this reader profile? Their books will remain.')) return
    await deleteReader(id)
    setReaders(prev => prev.filter(r => r.id !== id))
  }

  async function handleMigrate() {
    if (!session.familyId) return
    setMigrating(true)
    setMigrateResult(null)
    try {
      const res = await fetch('/api/family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'migrate', familyId: session.familyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Migration failed')
      // Clear needsMigration flag from session
      const stored = JSON.parse(localStorage.getItem('readerSession') || '{}')
      localStorage.setItem('readerSession', JSON.stringify({ ...stored, needsMigration: false }))
      setMigrateResult(data)
    } catch (e) {
      setMigrateResult({ error: e.message })
    } finally {
      setMigrating(false)
    }
  }

  async function handleGoalSave() {
    await setGoal(Number(goalInput))
    setGoalState(Number(goalInput))
    setGoalSaved(true)
    setTimeout(() => setGoalSaved(false), 2000)
  }

  async function handleGenerateInvite() {
    setInviteLoading(true)
    setInviteError(null)
    setInviteLink('')
    setInviteCopied(false)
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familyId: session.familyId, adminName: session.name || '' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate invite')
      setInviteLink(`${window.location.origin}/setup?invite=${data.code}`)
    } catch (e) {
      setInviteError(e.message)
    } finally {
      setInviteLoading(false)
    }
  }

  // Unique reader names from books (for filter)
  const readerNames = [...new Set(books.filter(b => b.readerName).map(b => b.readerName))]

  const filtered = books
    .filter(b => readerFilter === 'all' || b.readerName === readerFilter)
    .filter(b => tab === 'all' || b.status === tab)
    .filter(b => !search || b.title?.toLowerCase().includes(search.toLowerCase()) || b.author?.toLowerCase().includes(search.toLowerCase()))

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setPage(1) }, [tab, search, readerFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Base for tab counts — respect the active reader filter
  const readerFiltered = books.filter(b => readerFilter === 'all' || b.readerName === readerFilter)

  const tabs = [
    { key: 'all',          label: `All (${readerFiltered.length})` },
    { key: 'finished',     label: `Finished (${readerFiltered.filter(b => b.status === 'finished').length})` },
    { key: 'reading',      label: `Reading (${readerFiltered.filter(b => b.status === 'reading').length})` },
    { key: 'want-to-read', label: `Want to Read (${readerFiltered.filter(b => b.status === 'want-to-read').length})` },
  ]

  return (
    <div className="admin-view">
      {viewBook && (
        <BookSummaryModal book={viewBook} initialTab={viewBookTab} onClose={() => { setViewBook(null); setViewBookTab('grade') }} />
      )}
      {editBook && (
        <EditModal book={editBook} readers={readers} onSave={() => setEditBook(null)} onClose={() => setEditBook(null)} />
      )}
      {addReaderOpen && (
        <AddReaderModal
          onDone={() => { setAddReaderOpen(false); getReaders().then(setReaders).catch(() => {}) }}
          onClose={() => setAddReaderOpen(false)}
        />
      )}

      {/* Migration banner — shown if user logged in before multi-family update */}
      {session.needsMigration && !migrateResult && (
        <div style={{ background: '#141414', border: '2px solid #f59e0b', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ color: '#e5e5e5', fontWeight: 700, marginBottom: 6 }}>🔄 One-time setup required</div>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '0 0 12px' }}>
            Your existing books and readers need to be linked to your family. This takes a few seconds and only happens once.
          </p>
          {migrateResult?.error && <div className="error-banner" style={{ marginBottom: 10 }}>❌ {migrateResult.error}</div>}
          <button className="btn btn-primary" style={{ padding: '9px 20px' }} onClick={handleMigrate} disabled={migrating}>
            {migrating ? '⏳ Migrating…' : '✅ Link my data to this family'}
          </button>
        </div>
      )}
      {migrateResult && !migrateResult.error && (
        <div className="success-banner" style={{ marginBottom: 16 }}>
          ✅ Migration complete — {migrateResult.booksUpdated} books and {migrateResult.readersUpdated} readers linked to your family.
        </div>
      )}

      {/* ── Hamburger drawer overlay ── */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 260, background: '#0f0f0f', borderRight: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', padding: '16px 0' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 16px', borderBottom: '1px solid #1e1e1e', marginBottom: 8 }}>
              <span style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '1rem' }}>⚙️ Admin</span>
              <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            {[
              { key: 'books',    icon: '📚', label: 'Books' },
              { key: 'readers',  icon: '👥', label: 'Readers' },
              { key: 'rewards',  icon: '🧹', label: 'Chores & Rewards' },
              { key: 'insights', icon: '📊', label: 'Tests & Insights' },
              { key: 'settings', icon: '⚙️', label: 'Settings' },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => { setNavSection(item.key); setMenuOpen(false) }}
                style={{
                  background: navSection === item.key ? '#1a1a1a' : 'none',
                  border: 'none',
                  borderLeft: navSection === item.key ? '3px solid #2563eb' : '3px solid transparent',
                  color: navSection === item.key ? '#e5e5e5' : '#9ca3af',
                  textAlign: 'left',
                  padding: '12px 18px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: navSection === item.key ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                }}
              >
                <span>{item.icon}</span>{item.label}
              </button>
            ))}
            <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a href="/leaderboard" style={{ color: '#6b7280', fontSize: '0.8rem', textDecoration: 'none' }}>🏆 Leaderboard</a>
              <a href="/analytics" style={{ color: '#6b7280', fontSize: '0.8rem', textDecoration: 'none' }}>📊 Analytics</a>
              <a href={`/kiosk?family=${encodeURIComponent(session.familyId || '')}`} style={{ color: '#6b7280', fontSize: '0.8rem', textDecoration: 'none' }}>📺 TV Kiosk</a>
              <a href="/" style={{ color: '#6b7280', fontSize: '0.8rem', textDecoration: 'none' }}>📱 My Shelf</a>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky top header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16, position: 'sticky', top: 0, background: 'var(--bg, #0a0a0a)', zIndex: 100, padding: '12px 0', borderBottom: '1px solid #1e1e1e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setMenuOpen(true)}
            style={{ background: 'none', border: '1px solid #2e2e2e', borderRadius: 8, color: '#e5e5e5', cursor: 'pointer', padding: '7px 10px', lineHeight: 1, fontSize: '1.1rem' }}
            aria-label="Open menu"
          >☰</button>
          <h1 style={{ margin: 0, fontSize: '1.1rem', color: '#e5e5e5' }}>
            {{ books: '📚 Books', readers: '👥 Readers', rewards: '🧹 Chores & Rewards', insights: '📊 Tests & Insights', settings: '⚙️ Settings' }[navSection]}
          </h1>
        </div>
        <a href="/" style={{ color: '#6b7280', fontSize: '0.8rem', textDecoration: 'none' }}>📱 My Shelf</a>
      </div>

      {/* ── SETTINGS SECTION ── */}
      {navSection === 'settings' && <>

      {/* Notification permission card — shown until dismissed or granted */}
      {!notifDismissed && notifPerm !== 'granted' && (() => {
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
        const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches

        if (notifPerm === 'unsupported' && isIOS && !isStandalone) {
          return (
            <div style={{ background: '#141414', border: '1px solid #2563eb', borderRadius: 10, padding: '14px 18px', marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>📲</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#e5e5e5', fontWeight: 700, marginBottom: 4 }}>Install for admin notifications</div>
                <div style={{ color: '#6b7280', fontSize: '0.82rem' }}>
                  Get notified when a reader submits a summary or replies in chat.<br />
                  Tap the <strong style={{ color: '#e5e5e5' }}>Share</strong> button in Safari, then <strong style={{ color: '#e5e5e5' }}>Add to Home Screen</strong>.
                </div>
              </div>
              <button onClick={() => { localStorage.setItem('adminNotifCardDismissed', '1'); setNotifDismissed(true) }}
                style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
            </div>
          )
        }

        if (notifPerm === 'denied') {
          return (
            <div style={{ background: '#141414', border: '1px solid #374151', borderRadius: 10, padding: '14px 18px', marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🔕</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#e5e5e5', fontWeight: 700, marginBottom: 4 }}>Notifications are blocked</div>
                <div style={{ color: '#6b7280', fontSize: '0.82rem' }}>
                  To get admin alerts, open your browser settings and allow notifications for this site, then reload.
                </div>
              </div>
              <button onClick={() => { localStorage.setItem('adminNotifCardDismissed', '1'); setNotifDismissed(true) }}
                style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
            </div>
          )
        }

        if (notifPerm === 'default') {
          return (
            <div style={{ background: '#141414', border: '2px solid #2563eb', borderRadius: 10, padding: '14px 18px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🔔</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ color: '#e5e5e5', fontWeight: 700, marginBottom: 2 }}>Enable admin notifications</div>
                <div style={{ color: '#6b7280', fontSize: '0.82rem' }}>Get instant alerts when a reader submits a summary or replies in chat.</div>
              </div>
              <button onClick={async () => {
                const perm = await requestPushPermission(session.readerId)
                setNotifPerm(perm)
                if (perm === 'granted') { localStorage.setItem('adminNotifCardDismissed', '1'); setNotifDismissed(true) }
              }} className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '0.85rem', flexShrink: 0 }}>
                Enable
              </button>
              <button onClick={() => { localStorage.setItem('adminNotifCardDismissed', '1'); setNotifDismissed(true) }}
                style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
            </div>
          )
        }

        return null
      })()}

      {/* Goal */}
      <div style={{ background: '#141414', borderRadius: 8, padding: 16, marginTop: 20, border: '1px solid #1e1e1e' }}>
        <div style={{ fontSize: '0.9rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 10 }}>🎯 Yearly Reading Goal</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)} min={1} max={500} style={{ width: 100 }} />
          <span className="text-muted">books per year</span>
          <button className="btn btn-primary" style={{ padding: '8px 20px' }} onClick={handleGoalSave}>
            {goalSaved ? '✅ Saved!' : 'Set Goal'}
          </button>
        </div>
      </div>

      {/* Family info */}
      {session.familyId && (
        <div style={{ background: '#141414', borderRadius: 8, padding: 16, marginTop: 16, border: '1px solid #1e1e1e' }}>
          <div style={{ fontSize: '0.9rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 10 }}>🏠 Your Family</div>
          <div style={{ fontSize: '0.78rem', color: '#666', marginBottom: 4 }}>Kiosk URL (share this for the TV display):</div>
          <div style={{ background: '#0a0a0a', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem', color: '#6b7280', wordBreak: 'break-all', marginBottom: 8 }}>
            {window.location.origin}/kiosk?family={session.familyId}
          </div>
          <button
            className="btn btn-secondary"
            style={{ padding: '5px 14px', fontSize: '0.75rem' }}
            onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/kiosk?family=${session.familyId}`)}
          >
            📋 Copy Kiosk URL
          </button>
        </div>
      )}

      {/* ── Co-Admins ── */}
      {session.familyId && (
        <div style={{ background: '#141414', borderRadius: 8, padding: 16, marginTop: 16, border: '1px solid #1e1e1e' }}>
          <div style={{ fontSize: '0.9rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 4 }}>👥 Co-Admins</div>
          <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 14 }}>
            Invite another parent or grandparent to your family. They'll get full admin access — reviewing summaries, chatting with readers, and seeing all books.
          </p>

          {/* List of existing co-admins */}
          {readers.filter(r => r.isAdmin && r.id !== session.readerId).map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 12px', background: '#0a0a0a', borderRadius: 8 }}>
              <span style={{ fontSize: '1.3rem' }}>{r.emoji || '📚'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e5e5e5', fontSize: '0.85rem' }}>{r.name}</div>
                {r.email && <div style={{ color: '#6b7280', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</div>}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#52c87e', background: '#0a1a0a', padding: '2px 8px', borderRadius: 8, flexShrink: 0 }}>Co-admin</span>
            </div>
          ))}

          <button
            className="btn btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.82rem' }}
            onClick={handleGenerateInvite}
            disabled={inviteLoading}
          >
            {inviteLoading ? '⏳ Generating…' : '🔗 Generate Invite Link'}
          </button>

          {inviteError && <div className="error-banner" style={{ marginTop: 10 }}>❌ {inviteError}</div>}

          {inviteLink && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 4 }}>
                Share this link (expires in 48 hours, single use):
              </div>
              <div style={{ background: '#0a0a0a', borderRadius: 6, padding: '8px 12px', fontSize: '0.75rem', color: '#6b7280', wordBreak: 'break-all', marginBottom: 8 }}>
                {inviteLink}
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: '6px 16px', fontSize: '0.78rem' }}
                onClick={() => {
                  navigator.clipboard?.writeText(inviteLink)
                  setInviteCopied(true)
                  setTimeout(() => setInviteCopied(false), 2500)
                }}
              >
                {inviteCopied ? '✅ Copied!' : '📋 Copy Link'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Email Notifications ── */}
      <div style={{ background: '#141414', borderRadius: 8, padding: 16, marginTop: 16, border: '1px solid #1e1e1e' }}>
        <div style={{ fontSize: '0.9rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 4 }}>📧 Email Notifications</div>
        <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 14 }}>
          Enter your email to receive weekly digests, inactivity nudges, and milestone alerts.
          Powered by <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ color: '#e5e5e5' }}>Resend</a> — requires <code style={{ fontSize: '0.75rem', color: '#9ca3af' }}>RESEND_API_KEY</code> in Vercel env vars.
        </p>

        <label className="text-sm text-muted">Admin email</label>
        <input
          type="email" value={emailAddr} placeholder="your@email.com"
          onChange={e => setEmailAddr(e.target.value)}
          style={{ marginBottom: 14 }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {[
            { key: 'weekly',     label: '📅 Weekly digest',     desc: 'Every Sunday — each reader\'s activity for the week',     val: notifyWeekly,     set: setNotifyWeekly },
            { key: 'inactivity', label: '💤 Inactivity nudge',   desc: 'Every Monday — alert if any reader hasn\'t read in 14 days', val: notifyInactivity, set: setNotifyInactivity },
            { key: 'milestones', label: '🏆 Milestone alerts',   desc: 'Instant — when a reader earns a badge (1, 5, 10, 20… books)', val: notifyMilestones, set: setNotifyMilestones },
          ].map(({ key, label, desc, val, set }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div
                onClick={() => set(v => !v)}
                style={{
                  width: 36, height: 20, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                  background: val ? '#ffffff' : '#2a2a2a',
                  position: 'relative', transition: 'background 0.2s', marginTop: 2,
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', background: val ? '#0a0a0a' : '#555',
                  position: 'absolute', top: 3, left: val ? 19 : 3, transition: 'left 0.2s',
                }} />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {emailError && <div className="error-banner" style={{ marginBottom: 10 }}>❌ {emailError}</div>}
        {emailSaved  && <div className="success-banner" style={{ marginBottom: 10 }}>✅ Notification settings saved!</div>}

        <button className="btn btn-primary" style={{ padding: '8px 20px' }} onClick={handleSaveEmail} disabled={emailSaving}>
          {emailSaving ? 'Saving…' : 'Save Notification Settings'}
        </button>
      </div>

      </> /* end settings */}

      {/* ── READERS SECTION ── */}
      {navSection === 'readers' && <>
      <div style={{ background: '#141414', borderRadius: 8, padding: 16, marginTop: 0, border: '1px solid #1e1e1e' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: '0.9rem', color: '#e5e5e5', fontWeight: 600 }}>👥 Reader Accounts</div>
          <button className="btn btn-primary" style={{ padding: '5px 14px', fontSize: '0.8rem' }} onClick={() => setAddReaderOpen(true)}>
            ➕ Add Reader
          </button>
        </div>
        {readers.length === 0 ? (
          <div className="text-muted" style={{ fontSize: '0.85rem' }}>
            No readers yet. Use the <strong>Add Reader</strong> button above to create accounts for your children.
          </div>
        ) : (
          readers.map(r => (
            <div key={r.id} style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>{r.emoji || '📚'}</span>
                <span style={{ color: '#e5e5e5', flex: 1, fontWeight: 600 }}>{r.name}</span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => setReaderFilter(readerFilter === r.name ? 'all' : r.name)}
                >
                  {readerFilter === r.name ? 'Clear filter' : '📚 View books'}
                </button>
                <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleDeleteReader(r.id)}>🗑️</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>📐 Grade:</span>
                <select
                  value={r.grade || ''}
                  onChange={async e => {
                    const g = e.target.value
                    try { await updateReaderProfile(r.id, { grade: g }); getReaders().then(setReaders).catch(() => {}) }
                    catch {}
                  }}
                  style={{ background: '#141414', color: '#e5e5e5', border: '1px solid #2e2e2e', borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  <option value="">— Not set —</option>
                  {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g === 'K' ? 'Kindergarten' : `Grade ${g}`}</option>)}
                </select>
              </div>
            </div>
          ))
        )}
      </div>

      </> /* end readers */}

      {/* ── BOOKS SECTION ── */}
      {navSection === 'books' && <>
      {/* Search + Reader filter */}
      <div style={{ display: 'flex', gap: 10, marginTop: 0, flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="Search books or authors…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }}
        />
        {readerNames.length > 0 && (
          <select
            value={readerFilter}
            onChange={e => setReaderFilter(e.target.value)}
            style={{ background: '#141414', color: '#e5e5e5', border: '1px solid #1e1e1e', borderRadius: 6, padding: '8px 12px' }}
          >
            <option value="all">All readers</option>
            {readerNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      {readerFilter !== 'all' && (
        <div style={{ background: '#141414', border: '1px solid #ffffff', borderRadius: 6, padding: '8px 14px', marginTop: 10, fontSize: '0.85rem', color: '#e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Showing books for: <strong>{readerFilter}</strong></span>
          <button onClick={() => setReaderFilter('all')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.85rem' }}>✕ Clear</button>
        </div>
      )}

      {/* Tabs */}
      <div className="admin-nav">
        {tabs.map(t => (
          <button key={t.key} className={`nav-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Book list */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div>
          <p>{search ? 'No books match your search.' : readerFilter !== 'all' ? `${readerFilter} has no books in this category.` : 'No books in this category yet.'}</p>
        </div>
      ) : (
        <div className="book-list">
          {paginated.map(b => (
            <BookRow key={b.id} book={b} onDelete={handleDelete} onEdit={setEditBook} onView={setViewBook} />
          ))}
          <Pagination
            page={page} totalPages={totalPages} totalItems={filtered.length}
            onPrev={() => setPage(p => p - 1)}
            onNext={() => setPage(p => p + 1)}
          />
        </div>
      )}

      </> /* end books */}

      {/* ── REWARDS SECTION ── */}
      {navSection === 'rewards' && (
        <ChoresAdminSection familyId={session.familyId} readers={readers.filter(r => !r.isAdmin)} defaultOpen />
      )}

      {/* ── INSIGHTS SECTION ── */}
      {navSection === 'insights' && <>
        <TestResultsAdminSection familyId={session.familyId} />
        <ReaderRecommendationsSection books={books} readers={readers} />
        <BuddyChatsAdminSection familyId={session.familyId} />
      </>}

    </div>
  )
}

// ── Chores, Reading Goals & Alexa admin panel ─────────────────────────────
function ChoresAdminSection({ familyId, readers, defaultOpen = false }) {
  const [chores, setChoresList]     = useState([])
  const [newName, setNewName]       = useState('')
  const [newAmt, setNewAmt]         = useState('')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [choreLog, setChoreLog]     = useState([])
  const [monthly, setMonthly]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [goals, setGoals]           = useState({})
  const [goalSaving, setGoalSaving] = useState({})
  const [goalSaved, setGoalSaved]   = useState({})
  const [leaderboard, setLeaderboard] = useState([])
  const [open, setOpen]             = useState(defaultOpen)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState(null)
  const [nameSyncing, setNameSyncing] = useState(false)
  const [nameSyncResult, setNameSyncResult] = useState(null)
  const [payments, setPayments] = useState([])
  const [payingFor, setPayingFor] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState(null)
  const [recalculating, setRecalculating] = useState(null)
  const [editingBalance, setEditingBalance] = useState(null) // { readerId, value }

  useEffect(() => {
    if (!familyId || !open) return
    load()
  }, [familyId, open])

  async function load() {
    setLoading(true)
    try {
      const [c, log, mon, lb, pmts] = await Promise.all([
        getChores(familyId),
        getChoreLog(familyId),
        getChoreMonthly(familyId),
        getLeaderboard(familyId),
        getPayments(familyId),
      ])
      setChoresList(c)
      setChoreLog(log)
      setMonthly(mon)
      setLeaderboard(lb)
      setPayments(pmts)
      const goalData = {}
      await Promise.all(readers.map(async r => {
        try {
          const g = await getReaderGoal(r.id)
          if (g) goalData[r.id] = { yearlyBooks: g.yearlyBooks || '', yearlyAmount: g.yearlyAmount || '' }
        } catch {}
      }))
      setGoals(goalData)
    } catch {} finally { setLoading(false) }
  }

  async function handleSaveChores() {
    setSaving(true); setSaved(false)
    try {
      await setChores(familyId, chores)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch {} finally { setSaving(false) }
  }

  function addChore() {
    if (!newName.trim()) return
    setChoresList(prev => [...prev, { id: Math.random().toString(36).slice(2), name: newName.trim(), amount: parseFloat(newAmt) || 0 }])
    setNewName(''); setNewAmt('')
  }

  function removeChore(id) {
    setChoresList(prev => prev.filter(c => c.id !== id))
  }

  async function handleSaveGoal(reader) {
    const g = goals[reader.id] || {}
    setGoalSaving(prev => ({ ...prev, [reader.id]: true }))
    try {
      await setReaderGoal({ readerId: reader.id, familyId, yearlyBooks: parseInt(g.yearlyBooks) || 0, yearlyAmount: parseFloat(g.yearlyAmount) || 0, year: new Date().getFullYear() })
      setGoalSaved(prev => ({ ...prev, [reader.id]: true }))
      setTimeout(() => setGoalSaved(prev => ({ ...prev, [reader.id]: false })), 2500)
    } catch {} finally { setGoalSaving(prev => ({ ...prev, [reader.id]: false })) }
  }

  return (
    <div style={{ marginTop: defaultOpen ? 0 : 20 }}>
      {/* Section header / toggle — hidden when opened from the hamburger nav */}
      {!defaultOpen && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{ width: '100%', background: '#141414', border: '1px solid #1e1e1e', borderRadius: 8, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span style={{ color: '#e5e5e5', fontWeight: 600, fontSize: '0.9rem' }}>🧹 Chores, Rewards &amp; Alexa</span>
          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{open ? '▲ collapse' : '▼ expand'}</span>
        </button>
      )}

      {!open ? null : (
        <div style={{ background: defaultOpen ? 'transparent' : '#141414', border: defaultOpen ? 'none' : '1px solid #1e1e1e', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: defaultOpen ? 0 : 16 }}>

          {/* ── Pay Kids ── */}
          {leaderboard.length > 0 && (() => {
            const paidMap = {}
            for (const p of payments) paidMap[p.readerId] = Math.round(((paidMap[p.readerId] || 0) + (parseFloat(p.amount) || 0)) * 100) / 100

            async function handlePay(r) {
              const amt = parseFloat(payAmount)
              if (!amt || amt <= 0) { setPayError('Enter a valid amount'); return }
              setPaying(true); setPayError(null)
              try {
                const now = new Date()
                const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                await makePayment({ familyId, readerId: r.id, readerName: r.name, readerEmoji: r.emoji, amount: amt, note: payNote || `${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} payment`, month })
                setPayingFor(null); setPayAmount(''); setPayNote('')
                const fresh = await getPayments(familyId); setPayments(fresh)
              } catch (e) { setPayError(e.message) }
              finally { setPaying(false) }
            }

            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 10 }}>💰 Pay Kids</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {leaderboard.map(r => {
                    const earned = Math.round((r.balance || 0) * 100) / 100
                    const paid   = Math.round((paidMap[r.id] || 0) * 100) / 100
                    const owed   = Math.max(0, Math.round((earned - paid) * 100) / 100)
                    const isOpen = payingFor === r.id
                    return (
                      <div key={r.id} style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 10, padding: '12px 14px' }}>
                        {/* Reader row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ fontSize: '1.2rem' }}>{r.emoji}</span>
                          <span style={{ flex: 1, color: '#e5e5e5', fontWeight: 600, fontSize: '0.9rem' }}>{r.name}</span>
                          {!isOpen && (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <button
                                onClick={async () => {
                                  setRecalculating(r.id)
                                  try { await recalculateBalance(r.id, familyId); load() }
                                  catch {}
                                  finally { setRecalculating(null) }
                                }}
                                disabled={recalculating === r.id}
                                title="Recalculate balance from actual finished books + chores"
                                style={{ background: '#1e1e1e', color: '#6b7280', border: '1px solid #2e2e2e', borderRadius: 7, padding: '5px 8px', fontSize: '0.78rem', cursor: 'pointer' }}
                              >
                                {recalculating === r.id ? '⏳' : '↺'}
                              </button>
                              <button
                                onClick={() => { setPayingFor(r.id); setPayAmount(''); setPayNote(''); setPayError(null) }}
                                disabled={owed === 0}
                                style={{ background: owed > 0 ? '#166534' : '#1e1e1e', color: owed > 0 ? '#22c55e' : '#3a3a3a', border: `1px solid ${owed > 0 ? '#22c55e' : '#2e2e2e'}`, borderRadius: 7, padding: '5px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: owed > 0 ? 'pointer' : 'default' }}
                              >
                                {owed > 0 ? '💳 Make Payment' : 'Paid up ✓'}
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Earned / Paid / Owed breakdown */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: isOpen ? 10 : 0 }}>
                          <div style={{ background: '#141414', borderRadius: 6, padding: '6px 8px', textAlign: 'center', cursor: 'pointer' }}
                            title="Click to edit earned balance"
                            onClick={() => !editingBalance && setEditingBalance({ readerId: r.id, value: String(earned) })}>
                            <div style={{ color: '#6b7280', fontSize: '0.62rem', marginBottom: 2 }}>EARNED ✎</div>
                            {editingBalance?.readerId === r.id ? (
                              <form onSubmit={async e => {
                                e.preventDefault()
                                const val = parseFloat(editingBalance.value)
                                if (isNaN(val) || val < 0) return
                                try { await setBalance(r.id, familyId, val); setEditingBalance(null); load() }
                                catch {}
                              }} style={{ display: 'flex', gap: 4, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                                <input autoFocus type="number" min="0" step="0.01"
                                  value={editingBalance.value}
                                  onChange={e => setEditingBalance(b => ({ ...b, value: e.target.value }))}
                                  style={{ width: 64, fontSize: '0.8rem', padding: '2px 4px', textAlign: 'center' }} />
                                <button type="submit" style={{ background: '#166534', color: '#22c55e', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: '0.75rem', cursor: 'pointer' }}>✓</button>
                                <button type="button" onClick={() => setEditingBalance(null)} style={{ background: 'none', color: '#6b7280', border: 'none', borderRadius: 4, padding: '2px 4px', fontSize: '0.75rem', cursor: 'pointer' }}>✕</button>
                              </form>
                            ) : (
                              <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.88rem' }}>${earned.toFixed(2)}</div>
                            )}
                          </div>
                          <div style={{ background: '#141414', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                            <div style={{ color: '#6b7280', fontSize: '0.62rem', marginBottom: 2 }}>PAID OUT</div>
                            <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.88rem' }}>${paid.toFixed(2)}</div>
                          </div>
                          <div style={{ background: '#141414', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                            <div style={{ color: '#6b7280', fontSize: '0.62rem', marginBottom: 2 }}>STILL OWED</div>
                            <div style={{ color: owed > 0 ? '#f59e0b' : '#22c55e', fontWeight: 700, fontSize: '0.88rem' }}>${owed.toFixed(2)}</div>
                          </div>
                        </div>
                        {/* Pay form */}
                        {isOpen && (
                          <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 10 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <input
                                  type="number" min="0.01" step="0.01" max={owed}
                                  value={payAmount} onChange={e => setPayAmount(e.target.value)}
                                  placeholder="0.00"
                                  autoFocus
                                  style={{ width: 100, fontSize: '0.85rem' }}
                                />
                                <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>Owed: ${owed.toFixed(2)}</span>
                              </div>
                              <input
                                value={payNote} onChange={e => setPayNote(e.target.value)}
                                placeholder="Note (e.g. July payment)"
                                style={{ flex: 1, minWidth: 140, fontSize: '0.85rem' }}
                              />
                            </div>
                            {payError && <div style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: 6 }}>⚠ {payError}</div>}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => handlePay(r)} disabled={paying} style={{ background: '#166534', color: '#22c55e', border: '1px solid #22c55e', borderRadius: 7, padding: '6px 16px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                                {paying ? 'Saving…' : '✅ Confirm Payment'}
                              </button>
                              <button onClick={() => { setPayingFor(null); setPayError(null) }} style={{ background: 'none', border: '1px solid #2e2e2e', color: '#6b7280', borderRadius: 7, padding: '6px 12px', fontSize: '0.82rem', cursor: 'pointer' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Payment history */}
                {payments.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Payment History</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {payments.slice(0, 20).map(p => (
                        <div key={p.id} style={{ background: '#0a0a0a', borderRadius: 7, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '1rem' }}>{p.readerEmoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', color: '#e5e5e5' }}>{p.readerName}</div>
                            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{p.note} · {new Date(p.createdAt).toLocaleDateString()}</div>
                          </div>
                          <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>−${(parseFloat(p.amount) || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Today's chore log ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600 }}>📋 Today's Activity</div>
              <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.78rem' }}>
                {loading ? '⏳' : '↺ Refresh'}
              </button>
            </div>
            {choreLog.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: '0.82rem' }}>No chores logged today yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {choreLog.map(entry => (
                  <div key={entry.id} style={{ background: '#0a0a0a', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.1rem' }}>{entry.readerEmoji || '📚'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#e5e5e5', fontSize: '0.83rem', fontWeight: 600 }}>{entry.readerName}</div>
                      <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{entry.choreName} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.85rem' }}>${(parseFloat(entry.amount) || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Monthly totals ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 10 }}>
              📅 {new Date().toLocaleString('default', { month: 'long' })} Totals
            </div>
            {monthly.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: '0.82rem' }}>No earnings recorded this month yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {monthly.map(m => (
                  <div key={m.readerId} style={{ background: '#0a0a0a', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.1rem' }}>{m.readerEmoji}</span>
                    <span style={{ flex: 1, color: '#e5e5e5', fontSize: '0.83rem' }}>{m.readerName}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ color: '#22c55e', fontWeight: 700 }}>${m.total.toFixed(2)}</span>
                      <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>
                        {m.books > 0 && `📚 ${m.books} bk ($${(m.booksTotal || 0).toFixed(2)})`}
                        {m.books > 0 && m.chores > 0 && ' · '}
                        {m.chores > 0 && `🧹 ${m.chores} ($${(m.choresTotal || 0).toFixed(2)})`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Fix historical book rewards ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 6 }}>🔧 Fix Book Rewards</div>
            <div style={{ color: '#6b7280', fontSize: '0.78rem', marginBottom: 10 }}>
              Credits all finished books that were never rewarded (safe to run multiple times).
            </div>
            {backfillResult && (
              <div style={{ background: backfillResult.credited > 0 ? '#0a1a0a' : '#0a0a0a', border: `1px solid ${backfillResult.credited > 0 ? '#22c55e' : '#2e2e2e'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: '0.8rem', color: backfillResult.credited > 0 ? '#22c55e' : '#6b7280' }}>
                {backfillResult.credited > 0
                  ? `✅ Credited ${backfillResult.credited} book${backfillResult.credited !== 1 ? 's' : ''} — balances updated!`
                  : '✓ All books are already credited.'}
              </div>
            )}
            <button
              onClick={async () => {
                setBackfilling(true); setBackfillResult(null)
                try { const r = await backfillBookRewards(familyId); setBackfillResult(r); load() }
                catch (e) { setBackfillResult({ error: e.message }) }
                finally { setBackfilling(false) }
              }}
              disabled={backfilling}
              style={{ background: '#1a1a0a', border: '1px solid #854d0e', color: '#fbbf24', borderRadius: 8, padding: '8px 18px', fontSize: '0.82rem', fontWeight: 600, cursor: backfilling ? 'wait' : 'pointer' }}
            >
              {backfilling ? 'Running…' : '📚 Run Book Rewards Backfill'}
            </button>
          </div>

          {/* ── Fix reader names on old books ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 6 }}>✏️ Sync Reader Names</div>
            <div style={{ color: '#6b7280', fontSize: '0.78rem', marginBottom: 10 }}>
              Updates old books and chore entries with each reader's current name (safe to run multiple times).
            </div>
            {nameSyncResult && (
              <div style={{ background: '#0a1a0a', border: '1px solid #22c55e', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: '0.8rem', color: '#22c55e' }}>
                {nameSyncResult.error
                  ? `❌ ${nameSyncResult.error}`
                  : `✅ Updated ${nameSyncResult.updated} record${nameSyncResult.updated !== 1 ? 's' : ''} across ${nameSyncResult.readers} reader${nameSyncResult.readers !== 1 ? 's' : ''}`}
              </div>
            )}
            <button
              onClick={async () => {
                setNameSyncing(true); setNameSyncResult(null)
                try { const r = await backfillReaderNames(familyId); setNameSyncResult(r); load() }
                catch (e) { setNameSyncResult({ error: e.message }) }
                finally { setNameSyncing(false) }
              }}
              disabled={nameSyncing}
              style={{ background: '#0a1a1a', border: '1px solid #0e7490', color: '#67e8f9', borderRadius: 8, padding: '8px 18px', fontSize: '0.82rem', fontWeight: 600, cursor: nameSyncing ? 'wait' : 'pointer' }}
            >
              {nameSyncing ? 'Syncing…' : '✏️ Sync All Reader Names'}
            </button>
          </div>

          {/* ── Chore list editor ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 10 }}>📋 Family Chores</div>
            {chores.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, color: '#e5e5e5', fontSize: '0.85rem' }}>{c.name}</div>
                <div style={{ color: '#22c55e', fontSize: '0.82rem', fontWeight: 600 }}>${(parseFloat(c.amount) || 0).toFixed(2)}</div>
                <button onClick={() => removeChore(c.id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Chore name" style={{ flex: 2, minWidth: 120 }} onKeyDown={e => e.key === 'Enter' && addChore()} />
              <input value={newAmt} onChange={e => setNewAmt(e.target.value)} placeholder="$" type="number" min="0" step="0.50" style={{ width: 70 }} onKeyDown={e => e.key === 'Enter' && addChore()} />
              <button className="btn btn-secondary" onClick={addChore} style={{ padding: '7px 14px' }}>+ Add</button>
            </div>
            <button className="btn btn-primary" onClick={handleSaveChores} disabled={saving} style={{ marginTop: 12, padding: '8px 20px' }}>
              {saving ? 'Saving…' : saved ? '✅ Saved!' : 'Save Chores'}
            </button>
          </div>

          {/* ── Per-reader reading reward goals ── */}
          {readers.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 4 }}>📚 Reading Reward Goals</div>
              <div style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: 12 }}>
                Each time a reader finishes a book they automatically earn a portion of their yearly goal.
              </div>
              {readers.map(r => {
                const g = goals[r.id] || { yearlyBooks: '', yearlyAmount: '' }
                const perBook = g.yearlyBooks && g.yearlyAmount ? (parseFloat(g.yearlyAmount) / parseInt(g.yearlyBooks)).toFixed(2) : null
                return (
                  <div key={r.id} style={{ background: '#0a0a0a', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: '1.2rem' }}>{r.emoji || '📚'}</span>
                      <span style={{ color: '#e5e5e5', fontWeight: 600, fontSize: '0.88rem' }}>{r.name}</span>
                      {perBook && <span style={{ color: '#22c55e', fontSize: '0.75rem', marginLeft: 'auto' }}>${perBook} / book</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="number" min="1" placeholder="Books / year" value={g.yearlyBooks}
                        onChange={e => setGoals(prev => ({ ...prev, [r.id]: { ...prev[r.id], yearlyBooks: e.target.value } }))}
                        style={{ width: 120, fontSize: '0.82rem' }}
                      />
                      <input
                        type="number" min="0" step="10" placeholder="Total $ reward" value={g.yearlyAmount}
                        onChange={e => setGoals(prev => ({ ...prev, [r.id]: { ...prev[r.id], yearlyAmount: e.target.value } }))}
                        style={{ width: 130, fontSize: '0.82rem' }}
                      />
                      <button className="btn btn-primary" onClick={() => handleSaveGoal(r)} disabled={goalSaving[r.id]} style={{ padding: '6px 14px', fontSize: '0.78rem' }}>
                        {goalSaving[r.id] ? '…' : goalSaved[r.id] ? '✅' : 'Save'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Alexa info ── */}
          <div style={{ background: '#0a0a0a', borderRadius: 8, padding: '12px 14px', fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.7 }}>
            <div style={{ color: '#e5e5e5', fontWeight: 600, marginBottom: 4 }}>🔵 Alexa — Family Rewards Skill</div>
            <div>Kids just say their name to sign in — no PIN needed.</div>
            <div style={{ marginTop: 6 }}>Say: <em style={{ color: '#e5e5e5' }}>"Alexa, open Family Rewards"</em> → <em style={{ color: '#e5e5e5' }}>"I am Foluso"</em> → <em style={{ color: '#e5e5e5' }}>"I did the dishes"</em></div>
          </div>

        </div>
      )}
    </div>
  )
}

// ── Admin: per-reader AI book recommendations ──────────────────────────────
const ADMIN_REC_TTL = 24 * 60 * 60 * 1000

function ReaderRecCard({ reader, finishedBooks }) {
  const [recs,    setRecs]    = useState(null)   // null = not yet loaded
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [covers,  setCovers]  = useState({})

  const cacheKey = `adminRec_${reader.id}`

  async function fetchRecs() {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
      if (cached && Date.now() - cached.ts < ADMIN_REC_TTL) { setRecs(cached.data); return }
    } catch {}
    setLoading(true)
    try {
      const booksParam = encodeURIComponent(JSON.stringify(
        finishedBooks.map(b => ({ title: b.title, author: b.author || '', genre: b.genre || '' }))
      ))
      const res = await fetch(`/api/grade?recommend=1&books=${booksParam}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setRecs(data)
      try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })) } catch {}
    } catch { setRecs([]) } finally { setLoading(false) }
  }

  async function fetchCovers(recsData) {
    const newCovers = {}
    await Promise.allSettled(recsData.map(async (rec, i) => {
      try {
        const q = encodeURIComponent(`${rec.title} ${rec.author}`)
        const r = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i`)
        if (!r.ok) return
        const d = await r.json()
        const coverId = d.docs?.[0]?.cover_i
        if (coverId) newCovers[i] = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
      } catch {}
    }))
    setCovers(newCovers)
  }

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next && recs === null) fetchRecs()
  }

  useEffect(() => { if (recs && recs.length > 0) fetchCovers(recs) }, [recs])

  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={handleToggle}
        style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: '1.3rem' }}>{reader.emoji || '📚'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#e5e5e5', fontSize: '0.85rem', fontWeight: 600 }}>{reader.name}</div>
          <div style={{ color: '#6b7280', fontSize: '0.73rem' }}>
            {finishedBooks.length} book{finishedBooks.length !== 1 ? 's' : ''} finished
          </div>
        </div>
        <div style={{ color: '#6b7280', fontSize: '0.75rem', flexShrink: 0 }}>
          {loading ? '⏳' : open ? '▲' : '▼'}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #1e1e1e', padding: '12px 14px' }}>
          {loading && (
            <div style={{ color: '#6b7280', fontSize: '0.82rem', textAlign: 'center', padding: '16px 0' }}>
              🔮 Fetching personalised picks…
            </div>
          )}
          {!loading && recs && recs.length === 0 && (
            <div style={{ color: '#6b7280', fontSize: '0.82rem' }}>No recommendations available.</div>
          )}
          {!loading && recs && recs.length > 0 && (
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
              {recs.map((rec, i) => (
                <div key={i} style={{ flexShrink: 0, width: 120, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ width: 120, height: 160, borderRadius: 6, overflow: 'hidden', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {covers[i]
                      ? <img src={covers[i]} alt={rec.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                      : <span style={{ fontSize: '2.5rem' }}>📖</span>
                    }
                  </div>
                  <div style={{ color: '#e5e5e5', fontSize: '0.75rem', fontWeight: 600, lineHeight: 1.3 }}>{rec.title}</div>
                  <div style={{ color: '#6b7280', fontSize: '0.68rem' }}>{rec.author}</div>
                  <div style={{ color: '#93c5fd', fontSize: '0.68rem', lineHeight: 1.3, fontStyle: 'italic' }}>{rec.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReaderRecommendationsSection({ books, readers }) {
  // Group finished books by reader name
  const finishedByReader = {}
  for (const b of books) {
    if (b.status === 'finished') {
      const key = b.reader || ''
      if (!key) continue
      if (!finishedByReader[key]) finishedByReader[key] = []
      finishedByReader[key].push(b)
    }
  }

  const eligible = readers.filter(r => (finishedByReader[r.name] || []).length >= 2)
  if (!eligible.length) return null

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.95rem', marginBottom: 12 }}>
        ✨ AI Book Recommendations
        <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem', marginLeft: 8 }}>
          — personalised picks for each reader
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {eligible.map(r => (
          <ReaderRecCard key={r.id} reader={r} finishedBooks={finishedByReader[r.name] || []} />
        ))}
      </div>
    </div>
  )
}

// ── Admin: test results for all family readers ────────────────────────────
const SUBJECT_EMOJI = { math: '➕', science: '🔬', geo: '🌍', history: '📜', general: '🧠' }

function TestResultsAdminSection({ familyId }) {
  const [tests,  setTests]  = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!familyId) return
    getTestsForFamily(familyId)
      .then(data => setTests(data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [familyId])

  if (!loaded || !tests.length) return null

  // Group by reader
  const byReader = {}
  for (const t of tests) {
    const key = t.readerName || t.readerId || 'Unknown'
    if (!byReader[key]) byReader[key] = { emoji: t.readerEmoji || '📚', tests: [] }
    byReader[key].tests.push(t)
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.95rem', marginBottom: 12 }}>
        🧠 Test Results
        <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem', marginLeft: 8 }}>
          — all subjects
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Object.entries(byReader).map(([name, { emoji, tests: rt }]) => {
          const avg = Math.round(rt.reduce((s, t) => s + (t.total ? (t.score / t.total) * 100 : 0), 0) / rt.length)
          return (
            <div key={name} style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>{emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e5e5e5', fontSize: '0.85rem', fontWeight: 600 }}>{name}</div>
                  <div style={{ color: '#6b7280', fontSize: '0.72rem' }}>{rt.length} test{rt.length !== 1 ? 's' : ''} · avg {avg}%</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rt.slice(0, 5).map((t, i) => {
                  const pct = t.total ? Math.round((t.score / t.total) * 100) : 0
                  const barColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#dc2626'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.9rem', width: 20 }}>{SUBJECT_EMOJI[t.subject] || '📝'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                            {t.subjectLabel || t.subject} · {t.difficulty}
                          </span>
                          <span style={{ color: '#e5e5e5', fontSize: '0.72rem', fontWeight: 700 }}>
                            {t.score}/{t.total} ({pct}%)
                          </span>
                        </div>
                        <div style={{ height: 4, background: '#0a0a0a', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: barColor, borderRadius: 2, width: `${pct}%` }} />
                        </div>
                      </div>
                      <span style={{ color: '#4b5563', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                        {new Date(t.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )
                })}
                {rt.length > 5 && (
                  <div style={{ color: '#4b5563', fontSize: '0.72rem', textAlign: 'right' }}>
                    +{rt.length - 5} more test{rt.length - 5 !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Admin: read-only view of buddy chats involving family readers ───────────
function BuddyChatsAdminSection({ familyId }) {
  const [chats,    setChats]    = useState([])
  const [expanded, setExpanded] = useState(null)
  const [loaded,   setLoaded]   = useState(false)

  useEffect(() => {
    if (!familyId) return
    getBuddyChatsForAdmin(familyId).then(setChats).catch(() => {}).finally(() => setLoaded(true))
  }, [familyId])

  if (!loaded || !chats.length) return null

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.95rem', marginBottom: 12 }}>
        👥 Reading Buddy Chats
        <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem', marginLeft: 8 }}>— visible to you as admin</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {chats.map(chat => {
          const msgs = JSON.parse(chat.messages || '[]')
          const isOpen = expanded === chat.id
          return (
            <div key={chat.id} style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, overflow: 'hidden' }}>
              <button onClick={() => setExpanded(isOpen ? null : chat.id)}
                style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: '1.3rem' }}>{chat.reader1Emoji}</span>
                <span style={{ color: '#6b7280', fontSize: '1rem' }}>↔</span>
                <span style={{ fontSize: '1.3rem' }}>{chat.reader2Emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#e5e5e5', fontSize: '0.85rem', fontWeight: 600 }}>
                    {chat.reader1Name} &amp; {chat.reader2Name}
                  </div>
                  {chat.bookTitle && <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>📖 {chat.bookTitle}</div>}
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', flexShrink: 0 }}>
                  {msgs.length} msg{msgs.length !== 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
                </div>
              </button>
              {isOpen && (
                <div style={{ borderTop: '1px solid #1e1e1e', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                  {msgs.length === 0
                    ? <div style={{ color: '#4b5563', fontSize: '0.82rem' }}>No messages yet.</div>
                    : msgs.map((m, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '0.72rem', color: '#4b5563', whiteSpace: 'nowrap', paddingTop: 2 }}>
                          {new Date(m.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                        <div>
                          <span style={{ color: '#93c5fd', fontWeight: 600, fontSize: '0.78rem' }}>{m.name}: </span>
                          <span style={{ color: '#e5e5e5', fontSize: '0.82rem' }}>{m.msg}</span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
