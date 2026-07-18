import { useState, useEffect } from 'react'
import { getSession } from '../services/auth'
import { getChores, logChore, getLedger, getEarningsHistory, getPayments, getReaderProfile, getTotalEarnings } from '../services/rewards'

// ── Earnings Calendar ─────────────────────────────────────────────────────
function EarningsCalendar({ readerId, myPayments, tc }) {
  const now = new Date()
  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!readerId) return
    setLoading(true)
    getEarningsHistory(readerId, year, month)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [readerId, year, month])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    const n = new Date()
    if (year > n.getFullYear() || (year === n.getFullYear() && month >= n.getMonth() + 1)) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const sortedDays = data ? Object.entries(data.days).sort((a, b) => b[0].localeCompare(a[0])) : []
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const monthPayments = myPayments.filter(p => (p.month || p.createdAt?.slice(0, 7)) === monthStr)

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={prevMonth} className="lm-card" style={{ background: 'var(--bg-shelf)', border: '1px solid var(--bg-inner)', color: 'var(--text)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '1rem' }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{monthLabel}</span>
        <button onClick={nextMonth} disabled={isCurrentMonth} className="lm-card" style={{ background: isCurrentMonth ? 'var(--bg-inner)' : 'var(--bg-shelf)', border: '1px solid var(--bg-inner)', color: isCurrentMonth ? 'var(--text-muted)' : 'var(--text)', borderRadius: 8, padding: '6px 14px', cursor: isCurrentMonth ? 'default' : 'pointer', fontSize: '1rem' }}>›</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>Loading…</div>
      ) : !data ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>Could not load earnings.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <div style={{ background: '#0a1a0a', border: '1px solid #166534', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ color: '#4ade80', fontSize: '0.65rem', marginBottom: 4 }}>📚 BOOKS</div>
              <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '1rem' }}>${(data.totals.books || 0).toFixed(2)}</div>
              <div style={{ color: '#4b7a4b', fontSize: '0.65rem', marginTop: 2 }}>{data.totals.bookCount} book{data.totals.bookCount !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ background: '#0a0a1a', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ color: '#60a5fa', fontSize: '0.65rem', marginBottom: 4 }}>🧹 CHORES</div>
              <div style={{ color: '#93c5fd', fontWeight: 700, fontSize: '1rem' }}>${(data.totals.chores || 0).toFixed(2)}</div>
            </div>
            <div style={{ background: '#1a1a0a', border: '1px solid #854d0e', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ color: '#fbbf24', fontSize: '0.65rem', marginBottom: 4 }}>EARNED</div>
              <div style={{ color: '#fde68a', fontWeight: 700, fontSize: '1rem' }}>${(data.totals.total || 0).toFixed(2)}</div>
            </div>
          </div>

          {data.perBook > 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.73rem', marginBottom: 14, textAlign: 'center' }}>
              ${data.perBook.toFixed(2)} per book · {data.allTimeBooks} total finished all-time
            </div>
          )}

          {monthPayments.length > 0 && (
            <div style={{ background: '#0a1520', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ color: '#60a5fa', fontSize: '0.75rem', fontWeight: 600, marginBottom: 6 }}>💳 Payments Received This Month</div>
              {monthPayments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{p.note || 'Payment'} · {new Date(p.createdAt).toLocaleDateString()}</span>
                  <span style={{ color: '#60a5fa', fontWeight: 700 }}>+${(parseFloat(p.amount) || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {sortedDays.length === 0 ? (
            <div className="lm-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-shelf)', borderRadius: 10, padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>📅</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No earnings this month yet.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedDays.map(([day, info]) => {
                const d = new Date(day + 'T12:00:00')
                const label = d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })
                return (
                  <div key={day} className="lm-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-shelf)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: info.bookTitles.length || info.choreNames.length ? 6 : 0 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{label}</span>
                      <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.95rem' }}>+${info.total.toFixed(2)}</span>
                    </div>
                    {info.books > 0 && (
                      <div style={{ fontSize: '0.76rem', color: '#4ade80', marginBottom: info.chores > 0 ? 3 : 0 }}>
                        📚 ${info.books.toFixed(2)} · {info.bookTitles.join(', ')}
                      </div>
                    )}
                    {info.chores > 0 && (
                      <div style={{ fontSize: '0.76rem', color: '#60a5fa' }}>
                        🧹 ${info.chores.toFixed(2)} · {info.choreNames.join(', ')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main View ────────────────────────────────────────────────────────────────
export default function ChoresView() {
  const session = getSession()
  const [chores,     setChores]     = useState([])
  const [ledger,     setLedger]     = useState([])
  const [myPayments, setMyPayments] = useState([])
  const [profile,    setProfile]    = useState({ themeColor: '', avatarBase64: '', bannerBase64: '', balance: null })
  const [loading,    setLoading]    = useState(true)
  const [logging,    setLogging]    = useState(null)
  const [done,       setDone]       = useState(null)
  const [error,      setError]      = useState(null)
  const [tab,        setTab]        = useState('chores')

  useEffect(() => {
    if (!session?.familyId) return
    Promise.all([
      getChores(session.familyId),
      getLedger(session.readerId),
      getPayments(session.familyId),
      getReaderProfile(session.readerId),
      getTotalEarnings(session.readerId),
    ]).then(([c, l, pmts, prof, totals]) => {
      setChores(c)
      setLedger(l)
      setMyPayments(pmts.filter(p => p.readerId === session.readerId))
      setProfile({ ...(prof || {}), balance: totals?.total ?? null })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [session?.familyId])

  async function handleLog(chore) {
    if (!session) return
    setLogging(chore.id); setError(null); setDone(null)
    try {
      const result = await logChore({
        familyId:    session.familyId,
        readerId:    session.readerId,
        readerName:  session.name,
        readerEmoji: session.emoji || '📚',
        choreId:     chore.id,
        choreName:   chore.name,
        amount:      chore.amount,
      })
      const credited = result.amount || chore.amount
      setDone({ name: chore.name, amount: credited })
      setProfile(p => ({ ...p, balance: Math.round(((p.balance || 0) + (parseFloat(credited) || 0)) * 100) / 100 }))
      const fresh = await getLedger(session.readerId)
      setLedger(fresh)
    } catch (e) { setError(e.message) }
    finally { setLogging(null) }
  }

  const tc        = profile.themeColor || '#2563eb'
  // Use the authoritative balance from the reader doc (covers both books + chores).
  // Fall back to summing the ledger only if the profile hasn't loaded yet.
  const balance   = profile.balance != null
    ? profile.balance
    : ledger.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0)
  const totalPaid = myPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const owed      = Math.max(0, Math.round((balance - totalPaid) * 100) / 100)

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <p style={{ color: 'var(--text-muted)' }}>Please sign in first.</p>
      </div>
    )
  }

  const TABS = [
    { key: 'chores',   label: '🧹 Chores'   },
    { key: 'earnings', label: '📅 Earnings'  },
    { key: 'payments', label: '💳 Payments'  },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 40 }}>

      {/* ── Banner + Header ── */}
      <div style={{ position: 'relative' }}>
        {profile.bannerBase64 ? (
          <>
            <div style={{ width: '100%', height: 140, overflow: 'hidden' }}>
              <img src={profile.bannerBase64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,10,10,0.1) 30%, rgba(10,10,10,0.88) 100%)' }} />
          </>
        ) : (
          <div style={{ width: '100%', height: 6, background: `linear-gradient(90deg, ${tc}, ${tc}88)` }} />
        )}

        <div style={{
          position: profile.bannerBase64 ? 'absolute' : 'relative',
          bottom: 0, left: 0, right: 0,
          padding: profile.bannerBase64 ? '0 20px 16px' : '16px 20px',
          background: profile.bannerBase64 ? 'transparent' : 'var(--bg)',
          borderBottom: profile.bannerBase64 ? 'none' : `1px solid ${tc}44`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <a href="/" style={{ color: 'var(--text)', textDecoration: 'none', fontSize: '1.2rem', flexShrink: 0 }}>←</a>

          {profile.avatarBase64
            ? <img src={profile.avatarBase64} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${tc}`, flexShrink: 0 }} />
            : <div style={{ width: 46, height: 46, borderRadius: '50%', background: tc + '33', border: `2px solid ${tc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>{session.emoji || '📚'}</div>
          }

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>{session.name}'s Page</div>
            <div style={{ color: tc, fontSize: '0.75rem', marginTop: 1 }}>Chores &amp; Earnings</div>
          </div>
          <a href="/leaderboard" style={{ color: 'var(--text)', fontSize: '0.9rem', textDecoration: 'none', flexShrink: 0 }}>🏆</a>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Earned / Paid / Owed cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: tc + '15', border: `1px solid ${tc}55`, borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
            <div style={{ color: tc, fontSize: '0.65rem', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Earned</div>
            <div style={{ color: 'var(--text)', fontSize: '1.3rem', fontWeight: 800 }}>${balance.toFixed(2)}</div>
          </div>
          <div style={{ background: '#0a0a1a', border: '1px solid #1e3a5f', borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
            <div style={{ color: '#60a5fa', fontSize: '0.65rem', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Paid Out</div>
            <div style={{ color: '#93c5fd', fontSize: '1.3rem', fontWeight: 800 }}>${totalPaid.toFixed(2)}</div>
          </div>
          <div style={{ background: owed > 0 ? '#1a1200' : tc + '10', border: `1px solid ${owed > 0 ? '#854d0e' : tc + '44'}`, borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
            <div style={{ color: owed > 0 ? '#fbbf24' : tc, fontSize: '0.65rem', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owed</div>
            <div style={{ color: owed > 0 ? '#fde68a' : 'var(--text)', fontSize: '1.3rem', fontWeight: 800 }}>${owed.toFixed(2)}</div>
          </div>
        </div>

        {owed > 0 && (
          <div style={{ background: '#1a1200', border: '1px solid #854d0e', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>💰</span>
            <div style={{ fontSize: '0.82rem', color: '#fde68a' }}>You're owed <strong>${owed.toFixed(2)}</strong>! Ask a parent to pay you.</div>
          </div>
        )}
        {owed === 0 && balance > 0 && (
          <div style={{ background: tc + '12', border: `1px solid ${tc}44`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>✅</span>
            <div style={{ fontSize: '0.82rem', color: 'var(--text)' }}>All earnings paid out. Keep it up!</div>
          </div>
        )}

        {/* ── Tab switcher ── */}
        <div className="lm-inner" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 20, background: 'var(--bg-inner)', borderRadius: 10, padding: 4 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600,
                background: tab === t.key ? tc : 'transparent',
                color: tab === t.key ? '#fff' : 'var(--text-muted)',
                transition: 'background 0.2s, color 0.2s',
                lineHeight: 1.3,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Log Chores ── */}
        {tab === 'chores' && (
          <>
            {done && (
              <div style={{ background: tc + '18', border: `1px solid ${tc}66`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.4rem' }}>🎉</span>
                <div>
                  <div style={{ color: tc, fontWeight: 600, fontSize: '0.9rem' }}>+${(parseFloat(done?.amount) || 0).toFixed(2)} earned!</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>"{done?.name}" credited to your balance</div>
                </div>
              </div>
            )}
            {error && <div className="error-banner" style={{ marginBottom: 16 }}>❌ {error}</div>}

            <div style={{ marginBottom: 24 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Available Chores</div>
              {loading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '24px 0', textAlign: 'center' }}>Loading…</div>
              ) : chores.length === 0 ? (
                <div className="lm-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-shelf)', borderRadius: 10, padding: '24px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No chores set up yet. Ask a parent!</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {chores.map(c => (
                    <div key={c.id} className="lm-card" style={{ background: 'var(--bg-card)', border: `1px solid ${tc}33`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>{c.name}</div>
                        <div style={{ color: tc, fontSize: '0.8rem', marginTop: 2 }}>${(parseFloat(c.amount) || 0).toFixed(2)}</div>
                      </div>
                      <button
                        onClick={() => handleLog(c)}
                        disabled={logging === c.id}
                        style={{ background: tc, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', minWidth: 80, opacity: logging === c.id ? 0.6 : 1 }}
                      >
                        {logging === c.id ? '…' : 'Done ✓'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {ledger.length > 0 && (
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Recent Earnings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ledger.slice(0, 10).map((tx, i) => (
                    <div key={i} className="lm-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-shelf)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.1rem' }}>{tx.type === 'book' ? '📚' : '🧹'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{new Date(tx.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div style={{ color: tc, fontWeight: 600, fontSize: '0.88rem', flexShrink: 0 }}>+${(parseFloat(tx.amount) || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── My Earnings ── */}
        {tab === 'earnings' && (
          <EarningsCalendar readerId={session.readerId} myPayments={myPayments} tc={tc} />
        )}

        {/* ── Payments ── */}
        {tab === 'payments' && (
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Payment History</div>
            {myPayments.length === 0 ? (
              <div className="lm-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-shelf)', borderRadius: 10, padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>💳</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No payments received yet.</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 6 }}>Payments made by a parent will appear here.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {myPayments.map(p => (
                    <div key={p.id} className="lm-card" style={{ background: 'var(--bg-card)', border: `1px solid ${tc}33`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ background: tc + '22', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span>💳</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600 }}>{p.note || 'Payment received'}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 2 }}>{new Date(p.createdAt).toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                      </div>
                      <div style={{ color: tc, fontWeight: 800, fontSize: '1rem', flexShrink: 0 }}>+${(parseFloat(p.amount) || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, background: tc + '12', border: `1px solid ${tc}44`, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Total received</span>
                  <span style={{ color: tc, fontWeight: 700, fontSize: '1rem' }}>${totalPaid.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
