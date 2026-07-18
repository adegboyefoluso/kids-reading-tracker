import { useState, useEffect } from 'react'
import { subscribeToBooks } from '../services/books'
import { getReaders } from '../services/readers'
import { getSession } from '../services/auth'
import { getXP, getLevel } from '../utils/gamification'

// ── Helpers ────────────────────────────────────────────────────────────────
function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function gradePercent(book) {
  if (book.gradeScore == null) return null
  const isNew = book.gradeGrammar != null
  const base = isNew ? 50 : 30
  const hasAcc = book.gradeAccuracy != null && book.gradeAccuracy >= 0
  const maxPts = hasAcc ? base + 10 : base
  const full = hasAcc ? book.gradeScore + book.gradeAccuracy : book.gradeScore
  return Math.round((full / maxPts) * 100)
}

function getLast12Months() {
  const months = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString('default', { month: 'short' }) })
  }
  return months
}

// ── Mini components ────────────────────────────────────────────────────────
function SummaryCard({ icon, value, label, sub, color = '#e5e5e5' }) {
  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '16px 18px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: '#555', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function HBar({ label, value, max, color = '#ffffff', suffix = '' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
        <span style={{ color: '#6b7280' }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}{suffix}</span>
      </div>
      <div style={{ height: 8, background: '#1e1e1e', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

// Reader colour palette — up to 8 distinct readers
const READER_COLORS = ['#ffffff', '#52c87e', '#60a5fa', '#f06b6b', '#e5e5e5', '#fb923c', '#f472b6', '#34d399']

// Y-axis tick values for a given max
function yTicks(maxVal) {
  if (maxVal === 0) return [0]
  if (maxVal <= 5)  return [...Array(maxVal + 1)].map((_, i) => i)
  if (maxVal <= 10) return [0, 2, 4, 6, 8, 10].filter(v => v <= maxVal)
  const step = maxVal <= 20 ? 5 : 10
  const t = []
  for (let i = 0; i <= maxVal; i += step) t.push(i)
  if (t[t.length - 1] < maxVal) t.push(maxVal)
  return t
}

// ── Monthly grouped bar chart ──────────────────────────────────────────────
function MonthlyChart({ books }) {
  const months   = getLast12Months()
  const nowMonth = new Date().getMonth()
  const nowYear  = new Date().getFullYear()

  // Chart geometry — all derived from these two constants
  const BAR_ZONE_H = 150   // height of drawable bar area
  const TOP_PAD    = 18    // space above bars reserved for total-count label
  const BAR_MAX_H  = BAR_ZONE_H - TOP_PAD   // tallest possible bar = 132 px

  // Build ordered reader list (most finished books first, capped at 8)
  const readerCounts = {}
  books.forEach(b => {
    if (b.readerName && b.status === 'finished')
      readerCounts[b.readerName] = (readerCounts[b.readerName] || 0) + 1
  })
  const readers = Object.entries(readerCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name]) => {
      const s = books.find(b => b.readerName === name)
      return { name, emoji: s?.readerEmoji || '📚' }
    })

  // Per-month counts (readers or total)
  const useGrouped = readers.length > 0
  const data = months.map(m => {
    const isCurrent = m.month === nowMonth && m.year === nowYear
    if (useGrouped) {
      const counts = readers.map(r =>
        books.filter(b => {
          if (b.status !== 'finished' || b.readerName !== r.name) return false
          const d = b.finishedAt ? new Date(b.finishedAt) : b.addedAt ? new Date(b.addedAt) : null
          return d && d.getFullYear() === m.year && d.getMonth() === m.month
        }).length
      )
      return { ...m, isCurrent, counts, total: counts.reduce((s, c) => s + c, 0) }
    }
    const total = books.filter(b => {
      if (b.status !== 'finished') return false
      const d = b.finishedAt ? new Date(b.finishedAt) : b.addedAt ? new Date(b.addedAt) : null
      return d && d.getFullYear() === m.year && d.getMonth() === m.month
    }).length
    return { ...m, isCurrent, counts: [total], total }
  })

  const maxCount = Math.max(...data.flatMap(m => m.counts), 1)
  const ticks    = yTicks(maxCount)

  // Convert a count or tick value → pixel height (bottom-anchored)
  const toH    = v => v === 0 ? 2 : Math.max(4, Math.round((v / maxCount) * BAR_MAX_H))
  // Convert a tick value → distance from top of BAR_ZONE_H container
  const toTopY = v => TOP_PAD + (1 - v / maxCount) * BAR_MAX_H

  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 14 }}>
        📅 Books Finished Per Month {useGrouped ? '— by Reader' : ''}
      </div>

      {/* Y-axis + chart side by side */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>

        {/* ── Y-axis labels ── */}
        <div style={{ width: 20, flexShrink: 0, position: 'relative', height: BAR_ZONE_H }}>
          {ticks.map(t => (
            <div key={t} style={{
              position: 'absolute',
              right: 2,
              top: toTopY(t),
              transform: 'translateY(-50%)',
              fontSize: '0.6rem',
              color: '#666',
              lineHeight: 1,
              textAlign: 'right',
            }}>
              {t}
            </div>
          ))}
        </div>

        {/* ── Chart area + month labels ── */}
        <div style={{ flex: 1 }}>

          {/* Bar zone with grid lines */}
          <div style={{ position: 'relative', height: BAR_ZONE_H }}>

            {/* Horizontal grid lines — precisely at each tick */}
            {ticks.map(t => (
              <div key={t} style={{
                position: 'absolute', left: 0, right: 0,
                top: toTopY(t), height: 1,
                background: t === 0 ? '#3a2d72' : '#1e1e1e',
                zIndex: 0,
              }} />
            ))}

            {/* Month bar groups */}
            <div style={{ display: 'flex', gap: 3, height: '100%', position: 'relative', zIndex: 1 }}>
              {data.map((m, mi) => {
                const groupMaxH = Math.max(...m.counts.map(toH))
                return (
                  <div key={mi} style={{ flex: 1, position: 'relative', height: BAR_ZONE_H }}>

                    {/* Total label — floats just above the tallest bar */}
                    {m.total > 0 && (
                      <div style={{
                        position: 'absolute',
                        bottom: groupMaxH + 3,
                        left: 0, right: 0,
                        textAlign: 'center',
                        fontSize: '0.58rem',
                        color: '#6b7280',
                        fontWeight: 600,
                        lineHeight: 1,
                      }}>
                        {m.total}
                      </div>
                    )}

                    {/* Bars — absolute, pinned to bottom */}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      display: 'flex', alignItems: 'flex-end', gap: 1,
                      background: m.isCurrent ? '#1e1200' : 'transparent',
                      borderRadius: '3px 3px 0 0',
                    }}>
                      {m.counts.map((count, ri) => (
                        <div
                          key={ri}
                          title={useGrouped
                            ? `${readers[ri].emoji} ${readers[ri].name} · ${m.label}: ${count} book${count !== 1 ? 's' : ''}`
                            : `${m.label}: ${count} book${count !== 1 ? 's' : ''}`}
                          style={{
                            flex: 1,
                            height: toH(count),
                            borderRadius: '2px 2px 0 0',
                            background: READER_COLORS[ri % READER_COLORS.length],
                            opacity: count === 0 ? 0.1 : 1,
                            transition: 'height 0.8s ease',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Month labels row — outside the bar zone so they don't affect heights */}
          <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
            {data.map((m, mi) => (
              <div key={mi} style={{
                flex: 1, textAlign: 'center',
                fontSize: '0.56rem',
                color: m.isCurrent ? '#e5e5e5' : '#555',
                fontWeight: m.isCurrent ? 700 : 400,
              }}>
                {m.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend (grouped only) */}
      {useGrouped && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 14, paddingTop: 12, borderTop: '1px solid #1e1e1e' }}>
          {readers.map((r, ri) => (
            <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#6b7280' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: READER_COLORS[ri % READER_COLORS.length], flexShrink: 0 }} />
              <span>{r.emoji} {r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Grade trend line ───────────────────────────────────────────────────────
function GradeTrend({ books }) {
  const months = getLast12Months()
  const points = months.map(m => {
    const mb = books.filter(b => {
      if (b.status !== 'finished' || b.gradeScore == null) return false
      const d = b.finishedAt ? new Date(b.finishedAt) : b.addedAt ? new Date(b.addedAt) : null
      return d && d.getFullYear() === m.year && d.getMonth() === m.month
    })
    const pcts = mb.map(gradePercent).filter(p => p != null)
    return pcts.length ? Math.round(avg(pcts)) : null
  })

  const hasData = points.some(p => p != null)
  if (!hasData) return null

  const W = 600, H = 100, PAD = 20
  const innerW = W - PAD * 2
  const innerH = H - PAD * 2

  // Build SVG polyline — skip null months
  const validPts = points.map((v, i) => v != null ? { x: PAD + (i / 11) * innerW, y: PAD + (1 - v / 100) * innerH, v } : null)
  const linePoints = validPts.filter(Boolean).map(p => `${p.x},${p.y}`).join(' ')

  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 12 }}>📈 Average Grade Trend</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* Grid lines */}
        {[25, 50, 75, 100].map(g => (
          <g key={g}>
            <line x1={PAD} y1={PAD + (1 - g / 100) * innerH} x2={W - PAD} y2={PAD + (1 - g / 100) * innerH}
              stroke="#1e1e1e" strokeWidth="1" strokeDasharray="4 4" />
            <text x={PAD - 4} y={PAD + (1 - g / 100) * innerH + 4} textAnchor="end" fill="#555" fontSize="10">{g}%</text>
          </g>
        ))}
        {/* Area fill */}
        {linePoints && (
          <polygon
            points={`${validPts.filter(Boolean)[0]?.x},${PAD + innerH} ${linePoints} ${validPts.filter(Boolean).slice(-1)[0]?.x},${PAD + innerH}`}
            fill="#ffffff22"
          />
        )}
        {/* Line */}
        {linePoints && <polyline points={linePoints} fill="none" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {/* Dots */}
        {validPts.filter(Boolean).map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke="#141414" strokeWidth="2" />
            <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#e5e5e5" fontSize="10" fontWeight="700">{p.v}%</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Criteria breakdown ─────────────────────────────────────────────────────
function CriteriaBreakdown({ books }) {
  const graded = books.filter(b => b.gradeScore != null && b.gradeGrammar != null)
  if (graded.length === 0) return null

  const criteria = [
    { key: 'gradeComprehension', label: 'Comprehension', color: '#ffffff' },
    { key: 'gradeDetail',        label: 'Detail',        color: '#ffffff' },
    { key: 'gradeReflection',    label: 'Reflection',    color: '#ffffff' },
    { key: 'gradeGrammar',       label: 'Grammar',       color: '#60a5fa' },
    { key: 'gradeStructure',     label: 'Structure',     color: '#60a5fa' },
    { key: 'gradeAccuracy',      label: 'Accuracy vs Book', color: '#52c87e' },
  ]

  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 4 }}>🎯 Average Score by Criteria</div>
      <div style={{ fontSize: '0.72rem', color: '#555', marginBottom: 16 }}>Based on {graded.length} graded book{graded.length !== 1 ? 's' : ''}</div>
      {criteria.map(({ key, label, color }) => {
        const vals = graded.map(b => b[key]).filter(v => v != null && v >= 0)
        if (!vals.length) return null
        const mean = avg(vals)
        return <HBar key={key} label={label} value={mean} max={10} color={color} />
      })}
    </div>
  )
}

// ── Per-reader cards ───────────────────────────────────────────────────────
function ReaderCards({ books, readers }) {
  const map = {}
  books.forEach(b => {
    const id = b.readerId || b.readerName || '__unknown__'
    if (!map[id]) map[id] = {
      id, name: b.readerName || 'Unknown', emoji: b.readerEmoji || '📚',
      books: [],
    }
    map[id].books.push(b)
  })

  // Merge with readers list for completeness (catch readers with no books)
  readers.forEach(r => {
    if (!map[r.id]) map[r.id] = { id: r.id, name: r.name, emoji: r.emoji || '📚', books: [] }
  })

  const cards = Object.values(map).map(r => {
    const finished = r.books.filter(b => b.status === 'finished')
    const grades = finished.map(gradePercent).filter(p => p != null)
    const genreCounts = {}
    finished.forEach(b => { if (b.genre) genreCounts[b.genre] = (genreCounts[b.genre] || 0) + 1 })
    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    const xp = getXP(r.books)
    const lvl = getLevel(xp)
    return { ...r, finished: finished.length, avgGrade: grades.length ? Math.round(avg(grades)) : null, topGenre, xp, lvl }
  }).sort((a, b) => b.xp - a.xp)

  if (cards.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 12 }}>👥 Reader Breakdown</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {cards.map(r => {
          const pct = r.lvl.isMax ? 100 : Math.round((r.lvl.progressXP / r.lvl.rangeXP) * 100)
          const gradeColor = r.avgGrade == null ? '#666' : r.avgGrade >= 80 ? '#52c87e' : r.avgGrade >= 60 ? '#e5e5e5' : '#ff6b6b'
          return (
            <div key={r.id} style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: '1.8rem' }}>{r.emoji}</span>
                <div>
                  <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.95rem' }}>{r.name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{r.lvl.emoji} {r.lvl.title} · Lv {r.lvl.level}</div>
                </div>
              </div>

              {/* XP bar */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#555', marginBottom: 3 }}>
                  <span>{r.xp.toLocaleString()} XP</span>
                  {!r.lvl.isMax && <span>{r.lvl.nextXP - r.xp} to {r.lvl.nextTitle}</span>}
                </div>
                <div style={{ height: 5, background: '#1e1e1e', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #ffffff99, #ffffff)', borderRadius: 3 }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: '#0a0a0a', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ffffff' }}>{r.finished}</div>
                  <div style={{ fontSize: '0.65rem', color: '#666' }}>books read</div>
                </div>
                <div style={{ background: '#0a0a0a', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: gradeColor }}>{r.avgGrade != null ? `${r.avgGrade}%` : '—'}</div>
                  <div style={{ fontSize: '0.65rem', color: '#666' }}>avg grade</div>
                </div>
              </div>

              {r.topGenre && (
                <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#555', textAlign: 'center' }}>
                  Favourite genre: <span style={{ color: '#6b7280' }}>{r.topGenre}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Top genres ─────────────────────────────────────────────────────────────
function TopGenres({ books }) {
  const counts = {}
  books.filter(b => b.status === 'finished' && b.genre).forEach(b => {
    counts[b.genre] = (counts[b.genre] || 0) + 1
  })
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (sorted.length === 0) return null
  const max = sorted[0][1]

  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 16 }}>📚 Top Genres</div>
      {sorted.map(([genre, count]) => (
        <HBar key={genre} label={genre} value={count} max={max} suffix={` book${count !== 1 ? 's' : ''}`} color="#e5e5e5" />
      ))}
    </div>
  )
}

// ── AI flag summary ────────────────────────────────────────────────────────
function AIFlagSummary({ books }) {
  const graded = books.filter(b => b.gradeScore != null)
  if (graded.length === 0) return null
  const flagged = graded.filter(b => (b.aiDetection ?? 0) > 55)
  const highRisk = flagged.filter(b => (b.aiDetection ?? 0) > 75)
  if (flagged.length === 0) return null

  return (
    <div style={{ background: '#141414', border: '1px solid #ffffff', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ fontSize: '0.85rem', color: '#e5e5e5', fontWeight: 600, marginBottom: 8 }}>🤖 AI Detection Summary</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#e5e5e5' }}>{flagged.length}</span>
          <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 6 }}>possible AI assistance</span>
        </div>
        {highRisk.length > 0 && (
          <div>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ff6b6b' }}>{highRisk.length}</span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 6 }}>high-risk flags</span>
          </div>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        {flagged.map(b => {
          const isHigh = (b.aiDetection ?? 0) > 75
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '0.78rem' }}>
              <span style={{ color: isHigh ? '#ff6b6b' : '#e5e5e5' }}>{isHigh ? '🚨' : '⚠️'}</span>
              <span style={{ color: '#d4b483' }}>{b.readerEmoji || ''} {b.readerName || 'Unknown'}</span>
              <span style={{ color: '#6b7280' }}>—</span>
              <span style={{ color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
              <span style={{ color: isHigh ? '#ff6b6b' : '#e5e5e5', fontWeight: 600, flexShrink: 0 }}>{b.aiDetection}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────
export default function AnalyticsView() {
  const session = getSession()
  const [books, setBooks] = useState([])
  const [readers, setReaders] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const unsub = subscribeToBooks(data => { setBooks(data); setLoaded(true) })
    getReaders().then(setReaders).catch(() => {})
    return unsub
  }, [])

  if (!session || !session.isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 20 }}>
        <div style={{ fontSize: '3rem' }}>🔒</div>
        <h2 style={{ color: '#e5e5e5' }}>Admin Access Required</h2>
        <a href="/" className="btn btn-primary" style={{ padding: '10px 24px', textDecoration: 'none' }}>🔑 Sign In</a>
      </div>
    )
  }

  const finished = books.filter(b => b.status === 'finished')
  const graded = books.filter(b => b.gradeScore != null)
  const grades = graded.map(gradePercent).filter(p => p != null)
  const avgGrade = grades.length ? Math.round(avg(grades)) : null
  const year = new Date().getFullYear()
  const thisYear = finished.filter(b => {
    const d = b.finishedAt ? new Date(b.finishedAt) : b.addedAt ? new Date(b.addedAt) : null
    return d && d.getFullYear() === year
  })

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px 48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, color: '#e5e5e5', fontSize: '1.4rem' }}>📊 Analytics</h1>
        <div style={{ display: 'flex', gap: 14 }}>
          <a href="/admin" style={{ color: '#6b7280', fontSize: '0.82rem', textDecoration: 'none' }}>⚙️ Admin</a>
          <a href="/" style={{ color: '#6b7280', fontSize: '0.82rem', textDecoration: 'none' }}>📱 My Shelf</a>
        </div>
      </div>

      {!loaded && <div style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>Loading…</div>}

      {loaded && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <SummaryCard icon="📚" value={finished.length} label="Books Finished" sub="all time" />
            <SummaryCard icon="📅" value={thisYear.length} label="This Year" sub={`${year}`} color="#52c87e" />
            <SummaryCard icon="🎯" value={avgGrade != null ? `${avgGrade}%` : '—'} label="Avg Grade" sub={`${graded.length} graded`} color={avgGrade == null ? '#666' : avgGrade >= 80 ? '#52c87e' : avgGrade >= 60 ? '#e5e5e5' : '#ff6b6b'} />
            <SummaryCard icon="👥" value={readers.length || new Set(books.filter(b => b.readerName).map(b => b.readerName)).size} label="Readers" sub="in this family" color="#e5e5e5" />
          </div>

          <MonthlyChart books={books} />
          <GradeTrend books={books} />
          <ReaderCards books={books} readers={readers} />
          <CriteriaBreakdown books={books} />
          <TopGenres books={books} />
          <AIFlagSummary books={books} />

          {books.length === 0 && (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
              <p>No books yet — analytics will appear once readers start adding books.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
