import { useState, useEffect } from 'react'
import { getSession } from '../services/auth'
import { getBuddyInvite, acceptBuddyInvite } from '../services/buddy'

export default function BuddyView() {
  const params  = new URLSearchParams(window.location.search)
  const code    = params.get('c')
  const session = getSession()

  const [invite,   setInvite]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [accepting, setAccepting] = useState(false)
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    if (!code) { setError('No invite code in this link.'); setLoading(false); return }
    getBuddyInvite(code)
      .then(setInvite)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [code])

  async function handleAccept() {
    if (!session) { window.location.href = '/'; return }
    setAccepting(true); setError(null)
    try {
      const { chatId } = await acceptBuddyInvite(code)
      // Redirect to reader shelf with the new buddy chat open
      window.location.href = `/?buddyChat=${chatId}`
    } catch (e) {
      setError(e.message)
      setAccepting(false)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div style={{ color: '#6b7280' }}>Loading invite…</div>
    </div>
  )

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error && !invite) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', gap: 16, padding: 24 }}>
      <div style={{ fontSize: '3rem' }}>😕</div>
      <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '1.1rem' }}>Invite not available</div>
      <div style={{ color: '#6b7280', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>
      <a href="/" style={{ marginTop: 8, padding: '10px 24px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
        Go to my shelf
      </a>
    </div>
  )

  // ── Already accepted (own invite or re-opened link) ───────────────────────
  if (invite?.status === 'accepted') return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', gap: 16, padding: 24 }}>
      <div style={{ fontSize: '3rem' }}>✅</div>
      <div style={{ color: '#e5e5e5', fontWeight: 700 }}>This invite was already accepted!</div>
      <a href={invite.chatId ? `/?buddyChat=${invite.chatId}` : '/'} style={{ marginTop: 8, padding: '10px 24px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
        Open the chat
      </a>
    </div>
  )

  // ── Main invite card ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#141414', border: '1px solid #1e1e1e', borderRadius: 16, padding: 28, textAlign: 'center' }}>

        {/* Header */}
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>{invite?.reader1Emoji || '📚'}</div>
        <h2 style={{ color: '#e5e5e5', margin: '0 0 6px', fontSize: '1.3rem' }}>
          Reading Buddy Invite
        </h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px', fontSize: '0.9rem' }}>
          <strong style={{ color: '#e5e5e5' }}>{invite?.reader1Name}</strong> wants to be your reading buddy!
        </p>

        {/* Book */}
        {invite?.bookTitle && (
          <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>Reading</div>
            <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '1rem' }}>📖 {invite.bookTitle}</div>
          </div>
        )}

        {/* Not logged in */}
        {!session && (
          <div style={{ background: '#1a1a2e', border: '1px solid #2563eb', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ color: '#93c5fd', fontSize: '0.85rem', marginBottom: 8 }}>
              You need to be logged in to accept this invite.
            </div>
            <a href={`/?next=${encodeURIComponent(window.location.href)}`}
              style={{ display: 'inline-block', padding: '8px 20px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
              Log in first
            </a>
          </div>
        )}

        {/* Wrong reader (initiator) */}
        {session && session.readerId === invite?.reader1Id && (
          <div style={{ background: '#141414', border: '1px solid #374151', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#6b7280', fontSize: '0.85rem' }}>
            This is your own invite link — share it with another reader!
          </div>
        )}

        {/* Accept button */}
        {session && session.readerId !== invite?.reader1Id && (
          <>
            {error && <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}
            <button
              onClick={handleAccept}
              disabled={accepting}
              style={{ width: '100%', padding: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem', cursor: accepting ? 'not-allowed' : 'pointer', opacity: accepting ? 0.6 : 1 }}>
              {accepting ? '⏳ Setting up chat…' : '🤝 Accept & Start Chatting'}
            </button>
          </>
        )}

        <div style={{ marginTop: 20 }}>
          <a href="/" style={{ color: '#4b5563', fontSize: '0.8rem', textDecoration: 'none' }}>← Back to my shelf</a>
        </div>
      </div>
    </div>
  )
}
