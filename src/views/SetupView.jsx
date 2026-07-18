import { useState, useEffect } from 'react'
import { signup, joinFamily } from '../services/auth'
import { saveNotificationSettings } from '../services/books'

const READER_EMOJIS = ['😊', '🦁', '🐯', '🦊', '🐼', '🦋', '🐸', '🦄', '🐙', '🦕', '🚀', '⭐']

export default function SetupView() {
  // Detect invite code from URL
  const params = new URLSearchParams(window.location.search)
  const inviteCode = params.get('invite') || ''

  const [invite, setInvite]             = useState(null)        // { valid, familyId, adminName }
  const [inviteLoading, setInviteLoading] = useState(!!inviteCode)
  const [inviteError, setInviteError]   = useState(null)

  // Form state
  const [name, setName]                   = useState('')
  const [emoji, setEmoji]                 = useState('😊')
  const [email, setEmail]                 = useState('')
  const [password, setPassword]           = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)
  const [done, setDone]                   = useState(false)

  // Validate invite code on mount
  useEffect(() => {
    if (!inviteCode) return
    fetch(`/api/invite?code=${encodeURIComponent(inviteCode)}`)
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setInviteError(data.error || 'Invalid invite code'); return }
        setInvite(data)
      })
      .catch(() => setInviteError('Could not validate invite code'))
      .finally(() => setInviteLoading(false))
  }, [inviteCode])

  async function handleCreate() {
    setError(null)
    if (!name.trim())                     { setError('Enter your name'); return }
    if (!email.trim())                    { setError('Enter your email'); return }
    if (password.length < 6)              { setError('Password must be at least 6 characters'); return }
    if (password !== confirmPassword)     { setError('Passwords do not match'); return }

    setLoading(true)
    try {
      if (inviteCode && invite) {
        // Join an existing family as co-admin
        const session = await joinFamily({ email: email.trim(), password, name: name.trim(), emoji, inviteCode })
        localStorage.setItem('readerSession', JSON.stringify(session))
      } else {
        // Create a brand-new family
        const session = await signup({ email: email.trim(), password, name: name.trim(), emoji })
        localStorage.setItem('readerSession', JSON.stringify(session))
        try { await saveNotificationSettings({ adminEmail: email.trim() }) } catch {}
      }
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Validating invite ──────────────────────────────────────────────────────
  if (inviteLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>⏳ Validating invite…</div>
      </div>
    )
  }

  // ── Invalid invite ─────────────────────────────────────────────────────────
  if (inviteCode && inviteError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>❌</div>
          <h2 style={{ color: '#e5e5e5', marginBottom: 10 }}>Invite Not Valid</h2>
          <p style={{ color: '#6b7280', marginBottom: 20 }}>{inviteError}</p>
          <a href="/setup" style={{ color: '#e5e5e5', fontSize: '0.85rem' }}>Create your own family instead →</a>
        </div>
      </div>
    )
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
          <h2 style={{ color: '#e5e5e5', marginBottom: 10 }}>
            {inviteCode ? "You've joined the family!" : 'Family created!'}
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.6 }}>
            {inviteCode
              ? 'Your co-admin account is ready. Head to the Admin Panel to review summaries and chat with your readers.'
              : 'Your family account is ready. Head to the Admin Panel to add readers and set up your kiosk.'
            }
          </p>
          <a href="/admin" className="btn btn-primary" style={{ display: 'inline-block', padding: '12px 28px', textDecoration: 'none', marginBottom: 12 }}>
            ⚙️ Go to Admin Panel
          </a>
          <br />
          <a href="/" style={{ color: '#6b7280', fontSize: '0.8rem' }}>Or go to My Shelf →</a>
        </div>
      </div>
    )
  }

  const isJoining = !!(inviteCode && invite)

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>{isJoining ? '👥' : '📚'}</div>
          <h1 style={{ color: '#e5e5e5', fontSize: '1.4rem', margin: 0 }}>
            {isJoining
              ? `Join ${invite.adminName ? invite.adminName + "'s" : 'the'} Family`
              : 'Set Up Your Family'}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 8, lineHeight: 1.5 }}>
            {isJoining
              ? "Create your co-admin account to review your readers' books and chat with them."
              : "Create the admin account for your family. You'll add your children from the Admin Panel afterwards."
            }
          </p>
        </div>

        {/* Form */}
        <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 14, padding: 24 }}>

          <label className="text-sm text-muted">Your Name</label>
          <input
            type="text"
            placeholder={isJoining ? 'e.g. Grandma Rose' : 'e.g. Sarah Smith'}
            value={name} onChange={e => setName(e.target.value)}
            style={{ marginBottom: 16 }} autoFocus
          />

          <label className="text-sm text-muted" style={{ display: 'block', marginBottom: 8 }}>Pick your emoji</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {READER_EMOJIS.map(e => (
              <span key={e} onClick={() => setEmoji(e)} style={{
                fontSize: '1.4rem', cursor: 'pointer', padding: '4px 6px', borderRadius: 6,
                border: emoji === e ? '2px solid #ffffff' : '2px solid transparent',
                background: emoji === e ? '#1e1e1e' : 'transparent',
              }}>{e}</span>
            ))}
          </div>

          <label className="text-sm text-muted">Email</label>
          <input
            type="email" placeholder="your@email.com" value={email}
            onChange={e => setEmail(e.target.value)} style={{ marginBottom: 16 }}
            autoCapitalize="none" autoCorrect="off"
          />

          <label className="text-sm text-muted">Password <span style={{ color: '#666' }}>(min 6 characters)</span></label>
          <input
            type="password" placeholder="Create a password" value={password}
            onChange={e => setPassword(e.target.value)} style={{ marginBottom: 16 }}
          />

          <label className="text-sm text-muted">Confirm Password</label>
          <input
            type="password" placeholder="Repeat password" value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{ marginBottom: 20 }}
          />

          {error && <div className="error-banner" style={{ marginBottom: 14 }}>❌ {error}</div>}

          <button
            className="btn btn-primary w-full"
            onClick={handleCreate} disabled={loading}
            style={{ padding: '13px', fontSize: '1rem' }}
          >
            {loading
              ? (isJoining ? 'Joining family…' : 'Creating your family…')
              : (isJoining ? '👥 Join Family' : '🏠 Create Family Account')
            }
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: '0.8rem', color: '#555' }}>
          Already have an account?{' '}
          <a href="/" style={{ color: '#ffffff', textDecoration: 'none' }}>Sign in →</a>
        </p>
      </div>
    </div>
  )
}
