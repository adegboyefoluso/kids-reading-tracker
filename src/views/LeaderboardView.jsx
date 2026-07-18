import { useState, useEffect } from 'react'
import { getSession } from '../services/auth'
import { getLeaderboard, getLedger } from '../services/rewards'

const MEDALS = ['🥇', '🥈', '🥉']

export default function LeaderboardView() {
  const session = getSession()
  const [board, setBoard]     = useState([])
  const [ledger, setLedger]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.familyId) return
    Promise.all([
      getLeaderboard(session.familyId),
      getLedger(session.readerId),
    ]).then(([b, l]) => { setBoard(b); setLedger(l) }).catch(() => {}).finally(() => setLoading(false))
  }, [session?.familyId])

  const myBalance = board.find(r => r.id === session?.readerId)?.balance || 0

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: '#0a0a0a', borderBottom: '1px solid #1e1e1e', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href="/" style={{ color: '#6b7280', textDecoration: 'none', fontSize: '1.2rem' }}>←</a>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>🏆 Family Leaderboard</div>
          <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>Who's earning the most?</div>
        </div>
        <a href="/chores" style={{ color: '#86efac', fontSize: '0.8rem', textDecoration: 'none' }}>🧹 Chores</a>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>

        {loading ? (
          <div style={{ color: '#6b7280', textAlign: 'center', padding: '48px 0' }}>Loading…</div>
        ) : board.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏆</div>
            <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No earners yet — start completing chores and reading books!</div>
          </div>
        ) : (
          <>
            {/* Top 3 podium */}
            {board.length >= 2 && (
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 28, height: 140 }}>
                {[board[1], board[0], board[2]].filter(Boolean).map((r, i) => {
                  const rank   = i === 0 ? 1 : i === 1 ? 0 : 2
                  const heights = [100, 140, 80]
                  const colors  = ['#c0c0c0', '#fbbf24', '#cd7f32']
                  const isMe   = r.id === session?.readerId
                  return (
                    <div key={r.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <div style={{ fontSize: '1.8rem' }}>{r.emoji}</div>
                      <div style={{ color: '#e5e5e5', fontSize: '0.8rem', fontWeight: 600, marginTop: 4, textAlign: 'center', lineHeight: 1.2 }}>
                        {r.name}{isMe ? ' (you)' : ''}
                      </div>
                      <div style={{ color: '#22c55e', fontSize: '0.8rem', fontWeight: 700 }}>${(r.balance || 0).toFixed(2)}</div>
                      <div style={{ background: colors[rank], width: '100%', height: heights[rank], borderRadius: '6px 6px 0 0', marginTop: 6, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8, fontSize: '1.4rem' }}>
                        {MEDALS[rank]}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Full list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {board.map((r, i) => {
                const isMe = r.id === session?.readerId
                return (
                  <div key={r.id} style={{ background: isMe ? '#0a1a0a' : '#141414', border: `1px solid ${isMe ? '#166534' : '#1e1e1e'}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ color: '#6b7280', fontSize: '0.85rem', fontWeight: 700, width: 24, textAlign: 'center', flexShrink: 0 }}>
                      {MEDALS[i] || `#${i + 1}`}
                    </div>
                    <span style={{ fontSize: '1.4rem' }}>{r.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{r.name}{isMe ? <span style={{ color: '#22c55e', fontSize: '0.73rem' }}> (you)</span> : ''}</div>
                    </div>
                    <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
                      ${(r.balance || 0).toFixed(2)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* My recent history */}
            {ledger.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  My Recent Earnings
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ledger.slice(0, 8).map((tx, i) => (
                    <div key={i} style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 8, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1rem' }}>{tx.type === 'book' ? '📚' : '🧹'}</span>
                      <div style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                      <div style={{ color: '#22c55e', fontSize: '0.82rem', fontWeight: 600, flexShrink: 0 }}>+${(parseFloat(tx.amount) || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
