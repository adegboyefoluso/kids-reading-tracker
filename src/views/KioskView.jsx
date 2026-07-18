import { useState, useEffect, useRef } from 'react'
import { subscribeToBooks, getGoal } from '../services/books'
import { isConfigured } from '../firebase'
import BookCard from '../components/BookCard'

const KID_NAME = import.meta.env.VITE_KID_NAME || "Our Reader"
const PANEL_DURATION = 30000 // 30s per panel

const BADGES = [
  { id: 'first',    icon: '🌟', name: 'First Book!',     desc: '1 book read',       req: 1 },
  { id: 'five',     icon: '📖', name: 'Bookworm',        desc: '5 books read',      req: 5 },
  { id: 'ten',      icon: '🏆', name: 'Champion Reader', desc: '10 books read',     req: 10 },
  { id: 'twenty',   icon: '🚀', name: 'Reading Rocket',  desc: '20 books read',     req: 20 },
  { id: 'fifty',    icon: '👑', name: 'Library King',    desc: '50 books read',     req: 50 },
  { id: 'hundred',  icon: '🌈', name: 'Legend',          desc: '100 books read',    req: 100 },
]

function GoalRing({ done, total }) {
  const pct = Math.min(done / Math.max(total, 1), 1)
  const r = 80
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct)

  return (
    <div className="goal-ring-wrap">
      <svg width="220" height="220" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r={r} fill="none" stroke="#1e1e1e" strokeWidth="18" />
        <circle
          cx="110" cy="110" r={r} fill="none"
          stroke="#ffffff" strokeWidth="18"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 110 110)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="110" y="100" textAnchor="middle" fill="#e5e5e5" fontSize="42" fontWeight="700">{done}</text>
        <text x="110" y="128" textAnchor="middle" fill="#6b7280" fontSize="16">of {total} books</text>
        <text x="110" y="148" textAnchor="middle" fill="#6b7280" fontSize="13">this year</text>
      </svg>
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <div style={{ fontSize: '1.1rem', color: '#e5e5e5', fontWeight: 600 }}>
          {pct >= 1 ? '🎉 Goal Reached!' : `${Math.round(pct * 100)}% complete`}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 4 }}>
          {total - done > 0 ? `${total - done} more to go!` : 'Amazing job!'}
        </div>
      </div>
    </div>
  )
}

function StatsPanel({ books, goal }) {
  const finished = books.filter(b => b.status === 'finished')
  const year = new Date().getFullYear()
  const thisYear = finished.filter(b => {
    const d = b.finishedAt ? new Date(b.finishedAt) : b.addedAt ? new Date(b.addedAt) : null
    return d && d.getFullYear() === year
  })

  const authorCounts = {}
  finished.forEach(b => { authorCounts[b.author] = (authorCounts[b.author] || 0) + 1 })
  const favAuthor = Object.entries(authorCounts).sort((a, b) => b[1] - a[1])[0]

  // Per-reader stats
  const readerMap = {}
  books.forEach(b => {
    if (!b.readerName) return
    if (!readerMap[b.readerName]) readerMap[b.readerName] = { name: b.readerName, emoji: b.readerEmoji || '📚', finished: 0 }
    if (b.status === 'finished') readerMap[b.readerName].finished++
  })
  const readerStats = Object.values(readerMap).sort((a, b) => b.finished - a.finished)

  return (
    <div className="panel" style={{ overflowY: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="stat-card">
            <div className="number">{finished.length}</div>
            <div className="label">Books Read Total</div>
          </div>
          <div className="stat-card">
            <div className="number">{thisYear.length}</div>
            <div className="label">Books This Year</div>
          </div>
          {favAuthor && (
            <div className="stat-card">
              <div style={{ fontSize: '1rem', color: '#e5e5e5', fontWeight: 600 }}>{favAuthor[0]}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>Favourite Author ({favAuthor[1]} books)</div>
            </div>
          )}
        </div>
        <GoalRing done={thisYear.length} total={goal} />
      </div>

      {readerStats.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            👥 Reader Progress
          </div>
          {readerStats.map(r => {
            const pct = Math.min(Math.round((r.finished / Math.max(goal, 1)) * 100), 100)
            return (
              <div key={r.name} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                  <span style={{ fontSize: '1.3rem' }}>{r.emoji}</span>
                  <span style={{ fontSize: '1rem', color: '#e5e5e5', fontWeight: 600, flex: 1 }}>{r.name}</span>
                  <span style={{ fontSize: '1rem', color: '#ffffff', fontWeight: 700 }}>{r.finished}</span>
                  <span style={{ fontSize: '0.8rem', color: pct >= 100 ? '#52c87e' : '#6b7280', minWidth: 42, textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
                <div style={{ height: 7, background: '#1e1e1e', borderRadius: 4 }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: pct >= 100 ? '#52c87e' : '#ffffff', transition: 'width 1s ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BadgesPanel({ books }) {
  const finished = books.filter(b => b.status === 'finished').length
  return (
    <div className="panel" style={{ overflowY: 'auto' }}>
      <div className="badges-grid">
        {BADGES.map(b => {
          const earned = finished >= b.req
          return (
            <div key={b.id} className={`badge ${earned ? 'earned' : 'locked'}`}>
              <div className="badge-icon">{b.icon}</div>
              <div className="badge-name">{b.name}</div>
              <div className="badge-desc">{b.desc}</div>
              {earned && <div style={{ fontSize: '0.65rem', color: '#ffffff', marginTop: 4 }}>EARNED</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReadersPanel({ books, goal }) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const map = {}
  books.forEach(b => {
    if (!b.readerName) return
    if (!map[b.readerName]) map[b.readerName] = { name: b.readerName, emoji: b.readerEmoji || '📚', finished: 0, thisWeek: 0 }
    if (b.status === 'finished') {
      map[b.readerName].finished++
      const d = b.finishedAt ? new Date(b.finishedAt).getTime() : 0
      if (d > weekAgo) map[b.readerName].thisWeek++
    }
  })
  const readers = Object.values(map).sort((a, b) => b.finished - a.finished)

  if (readers.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="icon">👥</div>
          <p>No readers yet! Sign in on your phone to get started.</p>
        </div>
      </div>
    )
  }

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="panel" style={{ overflowY: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '0 12px' }}>
        {/* Leaderboard with goal % */}
        <div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            📚 All Time — Goal: {goal} books
          </div>
          {readers.map((r, i) => {
            const pct = Math.min(Math.round((r.finished / Math.max(goal, 1)) * 100), 100)
            return (
              <div key={r.name} style={{
                padding: '12px 0', borderBottom: i < readers.length - 1 ? '1px solid #1e1e1e' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                  <div style={{ fontSize: '1.5rem', minWidth: 32, textAlign: 'center' }}>{medals[i] || `#${i + 1}`}</div>
                  <div style={{ fontSize: '1.5rem' }}>{r.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1rem', color: '#e5e5e5', fontWeight: 700 }}>{r.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.6rem', color: '#ffffff', fontWeight: 700, lineHeight: 1 }}>{r.finished}</div>
                    <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>books</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: '#1e1e1e', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${pct}%`,
                      background: pct >= 100 ? '#52c87e' : '#ffffff',
                      transition: 'width 1s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: pct >= 100 ? '#52c87e' : '#6b7280', minWidth: 36, textAlign: 'right' }}>
                    {pct}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Weekly performance */}
        <div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            📅 This Week
          </div>
          {[...readers].sort((a, b) => b.thisWeek - a.thisWeek).map((r, i) => (
            <div key={r.name} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 0', borderBottom: i < readers.length - 1 ? '1px solid #1e1e1e' : 'none',
            }}>
              <div style={{ fontSize: '1.6rem' }}>{r.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.1rem', color: '#e5e5e5', fontWeight: 700 }}>{r.name}</div>
                <div style={{ marginTop: 4 }}>
                  {[...Array(Math.min(r.thisWeek, 7))].map((_, j) => (
                    <span key={j} style={{ fontSize: '0.9rem' }}>📖</span>
                  ))}
                  {r.thisWeek === 0 && <span style={{ fontSize: '0.75rem', color: '#666' }}>No books this week</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '2rem', color: r.thisWeek > 0 ? '#52c87e' : '#666', fontWeight: 700, lineHeight: 1 }}>{r.thisWeek}</div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>this week</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ShelfPanel({ books }) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const statusIcon = s => s === 'finished' ? '✅' : s === 'reading' ? '📖' : '🔖'

  if (books.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="icon">📚</div>
          <p>No books yet! Sign in on your phone to get started.</p>
        </div>
      </div>
    )
  }

  // Group ALL books by reader, sorted by most recently added
  const readerMap = {}
  books.forEach(b => {
    const key = b.readerName || '__unknown__'
    if (!readerMap[key]) readerMap[key] = { name: b.readerName || 'Unknown', emoji: b.readerEmoji || '📚', books: [] }
    readerMap[key].books.push(b)
  })
  const readers = Object.values(readerMap)

  return (
    <div className="panel" style={{ overflowY: 'auto' }}>
      {readers.map(r => {
        const recent = r.books.filter(b => {
          const ts = b.addedAt ? new Date(b.addedAt).getTime() : 0
          return ts >= weekAgo
        })
        return (
          <div key={r.name} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: '1.6rem' }}>{r.emoji}</span>
              <span style={{ fontSize: '1.1rem', color: '#e5e5e5', fontWeight: 700 }}>{r.name}</span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {r.books.length} total
              </span>
              {recent.length > 0 && (
                <span style={{ fontSize: '0.7rem', color: '#52c87e', background: '#0a1a0a', padding: '2px 8px', borderRadius: 8 }}>
                  +{recent.length} this week
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8 }}>
              {r.books.slice(0, 6).map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {b.coverUrl
                    ? <img src={b.coverUrl} alt="" style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                    : <div style={{ width: 36, height: 54, background: '#1e1e1e', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📚</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.95rem', color: '#e5e5e5', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{b.author}</div>
                  </div>
                  <div style={{ fontSize: '1.1rem', flexShrink: 0 }}>{statusIcon(b.status)}</div>
                </div>
              ))}
              {r.books.length > 6 && (
                <div style={{ fontSize: '0.75rem', color: '#666', paddingLeft: 4 }}>
                  +{r.books.length - 6} more books…
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const PANELS = ['shelf', 'readers', 'stats', 'badges']
const PANEL_LABELS = { shelf: '📚 Bookshelf', readers: '👥 Readers', stats: '📊 Stats', badges: '🏆 Badges' }

export default function KioskView() {
  const [books, setBooks] = useState([])
  const [goal, setGoal] = useState(20)
  const [panel, setPanel] = useState(0)
  const intervalRef = useRef(null)

  // Read familyId from URL — shared as /kiosk?family=<id>
  // Fall back to session familyId if admin opens kiosk while logged in
  const urlFamilyId = new URLSearchParams(window.location.search).get('family')
  const sessionObj = (() => { try { return JSON.parse(localStorage.getItem('readerSession') || '{}') } catch { return {} } })()
  const sessionFamilyId = sessionObj.familyId || null
  const isAdminSession = !!sessionObj.isAdmin
  const kioskFamilyId = urlFamilyId || sessionFamilyId || null

  useEffect(() => {
    if (!kioskFamilyId) return
    const unsub = subscribeToBooks(setBooks, kioskFamilyId)
    getGoal(kioskFamilyId).then(g => setGoal(g.yearly))
    return unsub
  }, [kioskFamilyId])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setPanel(p => (p + 1) % PANELS.length)
    }, PANEL_DURATION)
    return () => clearInterval(intervalRef.current)
  }, [])

  function switchPanel(i) {
    clearInterval(intervalRef.current)
    setPanel(i)
    intervalRef.current = setInterval(() => {
      setPanel(p => (p + 1) % PANELS.length)
    }, PANEL_DURATION)
  }

  // ── No family linked ──
  if (!kioskFamilyId) {
    return (
      <div className="kiosk" style={{ alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <div style={{ fontSize: '4rem' }}>📺</div>
        <h1 style={{ color: '#e5e5e5', fontSize: 'clamp(1.4rem, 3vw, 2rem)', textAlign: 'center' }}>
          Family Kiosk
        </h1>
        <p style={{ color: '#6b7280', fontSize: '1rem', textAlign: 'center', maxWidth: 480, lineHeight: 1.6 }}>
          This kiosk needs a family link to display books.<br />
          Sign in at <a href="/" style={{ color: '#e5e5e5' }}>the app</a> and use the
          📺 <strong>View Kiosk</strong> link — it will include your family's code automatically.
        </p>
        <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: '16px 24px', maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 8 }}>Or ask your admin for the kiosk URL:</div>
          <code style={{ color: '#e5e5e5', fontSize: '0.9rem' }}>/kiosk?family=YOUR_FAMILY_ID</code>
        </div>
        <a href="/" style={{ color: '#374151', fontSize: '0.85rem', textDecoration: 'none', marginTop: 8 }}>← Go to sign in</a>
      </div>
    )
  }

  const recentBook = books[0]
  const currentPanel = PANELS[panel]

  return (
    <div className="kiosk">
      <div className="kiosk-header">
        <div>
          <h1>📚 {KID_NAME}'s Reading Adventure</h1>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
            {books.filter(b => b.status === 'finished').length} books read
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <div className="nav-tabs">
            {PANELS.map((p, i) => (
              <button
                key={p} className={`nav-tab ${panel === i ? 'active' : ''}`}
                onClick={() => switchPanel(i)}
              >
                {PANEL_LABELS[p]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="kiosk-qr-hint">
              Add books: sign in at <a href="/">/</a> on your phone
            </div>
            {isAdminSession && (
              <a href="/admin" style={{ color: '#6b7280', fontSize: '0.78rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>⚙️ Admin</a>
            )}
          </div>
        </div>
      </div>

      {!isConfigured && (
        <div style={{
          background: '#2a2a2a', borderTop: '2px solid #ffffff',
          padding: '10px 40px', fontSize: '0.85rem', color: '#e5e5e5',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span>⚙️</span>
          <span>
            <strong>Setup needed:</strong> Add your Firebase credentials to the <code>.env</code> file, then restart the server.
            See <a href="/admin" style={{ color: '#e5e5e5' }}>Admin</a> → README for instructions.
          </span>
        </div>
      )}

      <div className="kiosk-body">
        {currentPanel === 'shelf' && <ShelfPanel books={books} />}
        {currentPanel === 'readers' && <ReadersPanel books={books} goal={goal} />}
        {currentPanel === 'stats' && <StatsPanel books={books} goal={goal} />}
        {currentPanel === 'badges' && <BadgesPanel books={books} />}
      </div>

      {recentBook && (
        <div className="ticker">
          Latest: <span>"{recentBook.title}"</span> by {recentBook.author}
          {books.length > 1 && <> &nbsp;·&nbsp; Previously: <span>"{books[1].title}"</span></>}
        </div>
      )}
    </div>
  )
}
