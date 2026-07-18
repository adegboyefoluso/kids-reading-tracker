import { useState, useEffect, useRef } from 'react'
import LearnView from './LearnView'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { lookupByISBN, searchBooks } from '../services/openLibrary'
import { addBook, updateBook, subscribeToBooksForReader, addChatMessage, resubmitSummary, getBook } from '../services/books'
import { getSession, login, signup, logout, resetPassword, changePassword } from '../services/auth'
import { requestPushPermission, subscribeToPush, notifySubmitted, notifyChatToAdmins } from '../services/push'
import { createBuddyInvite, getBuddyChats, getBuddyChatById, sendBuddyMessage } from '../services/buddy'
import { creditBook, getLeaderboard, getPayments, getReaderProfile, updateReaderProfile } from '../services/rewards'
import { getXP, getLevel } from '../utils/gamification'
import Pagination, { PAGE_SIZE } from '../components/Pagination'

const READER_EMOJIS = ['😊', '🦁', '🐯', '🦊', '🐼', '🦋', '🐸', '🦄', '🐙', '🦕', '🚀', '⭐']

// ── Balance badge (links to /chores) — shows amount OWED (earned minus paid) ──
function BalanceBadge({ readerId, familyId, refreshKey }) {
  const [owed, setOwed] = useState(null)
  useEffect(() => {
    if (!readerId || !familyId) return
    Promise.all([getLeaderboard(familyId), getPayments(familyId)])
      .then(([lb, payments]) => {
        const me = lb.find(r => r.id === readerId)
        const earned = me?.balance || 0
        const totalPaid = payments
          .filter(p => p.readerId === readerId)
          .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        setOwed(Math.max(0, Math.round((earned - totalPaid) * 100) / 100))
      })
      .catch(() => {})
  }, [readerId, familyId, refreshKey])
  if (owed === null) return null
  return (
    <a href="/chores" style={{ textDecoration: 'none', background: '#0a1a0a', border: '1px solid #166534', borderRadius: 6, padding: '4px 8px', fontSize: '0.75rem', color: '#22c55e', fontWeight: 700, whiteSpace: 'nowrap' }}>
      💰 ${owed.toFixed(2)}
    </a>
  )
}

// ── Style modal helpers ───────────────────────────────────────────────────
const THEME_COLORS = [
  { name: 'Ocean',   hex: '#2563eb' },
  { name: 'Purple',  hex: '#7c3aed' },
  { name: 'Pink',    hex: '#db2777' },
  { name: 'Rose',    hex: '#e11d48' },
  { name: 'Teal',    hex: '#0891b2' },
  { name: 'Green',   hex: '#16a34a' },
  { name: 'Lime',    hex: '#65a30d' },
  { name: 'Orange',  hex: '#ea580c' },
  { name: 'Gold',    hex: '#ca8a04' },
  { name: 'Red',     hex: '#dc2626' },
  { name: 'Indigo',  hex: '#4338ca' },
  { name: 'Cyan',    hex: '#0e7490' },
]

function compressImage(file, maxW, maxH, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = reject
    fr.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1)
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target.result
    }
    fr.readAsDataURL(file)
  })
}

function StyleModal({ session, profile, onSaved, onClose }) {
  const [themeColor,   setThemeColor]   = useState(profile.themeColor   || THEME_COLORS[0].hex)
  const [avatar,       setAvatar]       = useState(profile.avatarBase64  || '')
  const [banner,       setBanner]       = useState(profile.bannerBase64  || '')
  const [displayName,  setDisplayName]  = useState(session.name          || '')
  const [colorMode,    setColorMode]    = useState(profile.colorMode     || 'dark')
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState(null)
  const avatarRef = useRef()
  const bannerRef = useRef()

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try { setAvatar(await compressImage(file, 200, 200, 0.8)) }
    catch { setError('Could not process that image.') }
  }

  async function handleBannerFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try { setBanner(await compressImage(file, 900, 220, 0.7)) }
    catch { setError('Could not process that image.') }
  }

  async function handleSave() {
    if (!displayName.trim()) { setError('Name cannot be empty'); return }
    setSaving(true); setError(null); setSaved(false)
    try {
      await updateReaderProfile(session.readerId, {
        themeColor, avatarBase64: avatar, bannerBase64: banner, name: displayName.trim(), colorMode,
      })
      // Persist name + colorMode so they survive page navigation
      const stored = JSON.parse(localStorage.getItem('readerSession') || '{}')
      localStorage.setItem('readerSession', JSON.stringify({ ...stored, name: displayName.trim() }))
      localStorage.setItem('colorMode', colorMode)
      document.documentElement.classList.toggle('light-mode', colorMode === 'light')
      setSaved(true)
      onSaved({ themeColor, avatarBase64: avatar, bannerBase64: banner, name: displayName.trim(), colorMode })
      setTimeout(() => { setSaved(false); onClose() }, 1000)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: '18px 18px 0 0', padding: '20px 20px 36px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#e5e5e5' }}>✏️ Edit Profile</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Live preview */}
        <div style={{ background: themeColor + '15', border: `1px solid ${themeColor}55`, borderRadius: 12, padding: '12px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          {avatar
            ? <img src={avatar} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${themeColor}` }} />
            : <div style={{ width: 44, height: 44, borderRadius: '50%', background: themeColor + '33', border: `2px solid ${themeColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>{session.emoji || '📚'}</div>
          }
          <div>
            <div style={{ color: themeColor, fontWeight: 700, fontSize: '0.95rem' }}>{displayName || session.name}'s Shelf</div>
            <div style={{ color: '#6b7280', fontSize: '0.73rem' }}>Live preview</div>
          </div>
        </div>

        {/* Display name */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#9ca3af', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>👤 Display Name</div>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name"
            style={{ width: '100%', boxSizing: 'border-box', background: '#0a0a0a', border: `1px solid ${themeColor}55`, borderRadius: 8, color: '#e5e5e5', padding: '10px 12px', fontSize: '0.95rem' }}
          />
        </div>

        {/* Banner */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#9ca3af', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>🖼️ Banner Image</div>
          <div
            onClick={() => bannerRef.current?.click()}
            style={{ width: '100%', height: 100, borderRadius: 10, cursor: 'pointer', overflow: 'hidden', position: 'relative', background: banner ? 'transparent' : '#0a0a0a', border: `2px dashed ${banner ? 'transparent' : '#2e2e2e'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {banner
              ? <img src={banner} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: 4 }}>🌄</div>
                  <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>Tap to pick a banner photo</div>
                </div>
            }
            <div style={{ position: 'absolute', bottom: 6, right: 8, background: 'rgba(0,0,0,0.65)', borderRadius: 5, padding: '2px 7px', fontSize: '0.7rem', color: '#e5e5e5' }}>
              {banner ? '✏️ Change' : '+ Add'}
            </div>
          </div>
          <input ref={bannerRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBannerFile} />
          {banner && <button onClick={() => setBanner('')} style={{ marginTop: 5, background: 'none', border: 'none', color: '#6b7280', fontSize: '0.73rem', cursor: 'pointer' }}>✕ Remove banner</button>}
        </div>

        {/* Avatar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#9ca3af', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>🧑 Profile Picture</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div onClick={() => avatarRef.current?.click()} style={{ width: 70, height: 70, borderRadius: '50%', cursor: 'pointer', overflow: 'hidden', flexShrink: 0, background: '#0a0a0a', border: `2px dashed ${avatar ? themeColor : '#2e2e2e'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {avatar ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.8rem' }}>{session.emoji || '📚'}</span>}
            </div>
            <div>
              <button onClick={() => avatarRef.current?.click()} style={{ background: '#1e1e1e', border: `1px solid ${themeColor}55`, color: '#e5e5e5', borderRadius: 8, padding: '7px 14px', fontSize: '0.82rem', cursor: 'pointer', display: 'block', marginBottom: 5 }}>
                📷 {avatar ? 'Change photo' : 'Add a photo'}
              </button>
              {avatar && <button onClick={() => setAvatar('')} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.73rem', cursor: 'pointer' }}>✕ Remove</button>}
            </div>
          </div>
          <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
        </div>

        {/* Light / Dark mode */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ color: '#9ca3af', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>🌓 Page Mode</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[{ value: 'dark', label: '🌙 Dark', desc: 'Easy on the eyes at night' }, { value: 'light', label: '☀️ Light', desc: 'Bright and cheerful' }].map(opt => (
              <button key={opt.value} onClick={() => setColorMode(opt.value)}
                style={{ flex: 1, background: colorMode === opt.value ? themeColor : '#1e1e1e', border: `2px solid ${colorMode === opt.value ? themeColor : '#2e2e2e'}`, borderRadius: 10, padding: '10px 8px', cursor: 'pointer', transition: 'all 0.2s' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: 3 }}>{opt.label.split(' ')[0]}</div>
                <div style={{ color: colorMode === opt.value ? '#fff' : '#e5e5e5', fontSize: '0.8rem', fontWeight: 700 }}>{opt.label.split(' ')[1]}</div>
                <div style={{ color: colorMode === opt.value ? '#ffffff99' : '#6b7280', fontSize: '0.68rem', marginTop: 2 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Theme colour */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ color: '#9ca3af', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>🎨 Theme Colour</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {THEME_COLORS.map(c => (
              <button key={c.hex} title={c.name} onClick={() => setThemeColor(c.hex)} style={{ width: 38, height: 38, borderRadius: '50%', background: c.hex, border: 'none', cursor: 'pointer', outline: themeColor === c.hex ? `3px solid ${c.hex}` : '3px solid transparent', outlineOffset: 3, transform: themeColor === c.hex ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.15s', position: 'relative' }}>
                {themeColor === c.hex && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.9rem', fontWeight: 700 }}>✓</span>}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#6b7280' }}>
            Selected: <span style={{ color: themeColor, fontWeight: 700 }}>{THEME_COLORS.find(c => c.hex === themeColor)?.name || 'Custom'}</span>
          </div>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: 10 }}>❌ {error}</div>}

        <button onClick={handleSave} disabled={saving} style={{ width: '100%', background: themeColor, color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: '0.92rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? '⏳ Saving…' : saved ? '✅ Saved!' : '💾 Save Profile'}
        </button>
      </div>
    </div>
  )
}

// ── Auth form ──────────────────────────────────────────────────────────────
function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login') // 'login' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [resetSent, setResetSent] = useState(false)

  function switchMode(m) { setMode(m); setError(null); setResetSent(false) }

  async function handleSubmit() {
    setError(null)
    if (mode === 'forgot') {
      if (!email.trim()) { setError('Enter your email address'); return }
      setLoading(true)
      try {
        await resetPassword(email.trim())
        setResetSent(true)
      } catch (e) { setError(e.message) }
      finally { setLoading(false) }
      return
    }
    if (!email.trim() || !password) { setError('Enter your email and password'); return }
    setLoading(true)
    try {
      const session = await login(email.trim(), password)
      onAuth(session)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (mode === 'forgot') {
    return (
      <div style={{ width: '100%', maxWidth: 380 }}>
        <h2 style={{ color: '#e5e5e5', fontSize: '1.1rem', marginBottom: 4 }}>🔐 Reset Password</h2>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: 16 }}>
          Enter your email and we'll send a reset link.
        </p>
        {resetSent ? (
          <div className="success-banner">
            ✅ Check your inbox! A reset link has been sent to <strong>{email}</strong>.
          </div>
        ) : (
          <>
            <label className="text-sm text-muted">Email</label>
            <input type="email" placeholder="your@email.com" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ marginBottom: 16 }} autoFocus />
            {error && <div className="error-banner" style={{ marginBottom: 12 }}>❌ {error}</div>}
            <button className="btn btn-primary w-full" onClick={handleSubmit} disabled={loading} style={{ padding: '12px' }}>
              {loading ? 'Sending…' : '📧 Send Reset Link'}
            </button>
          </>
        )}
        <button onClick={() => switchMode('login')} style={{
          background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer',
          marginTop: 14, fontSize: '0.85rem', width: '100%',
        }}>
          ← Back to Sign In
        </button>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 380 }}>
      <h2 style={{ color: '#e5e5e5', fontSize: '1.2rem', marginBottom: 20, textAlign: 'center' }}>
        🔑 Sign In
      </h2>

      <label className="text-sm text-muted">Email</label>
      <input type="email" placeholder="your@email.com" value={email}
        onChange={e => setEmail(e.target.value)} style={{ marginBottom: 12 }}
        autoCapitalize="none" autoCorrect="off" autoFocus />

      <label className="text-sm text-muted">Password</label>
      <input type="password" placeholder="Password" value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        style={{ marginBottom: 8 }} />

      <button onClick={() => switchMode('forgot')} style={{
        background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer',
        fontSize: '0.8rem', padding: 0, marginBottom: 14, display: 'block',
      }}>
        Forgot password?
      </button>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>❌ {error}</div>}

      <button className="btn btn-primary w-full" onClick={handleSubmit} disabled={loading} style={{ padding: '12px' }}>
        {loading ? 'Signing in…' : '🔑 Sign In'}
      </button>

      <p style={{ fontSize: '0.75rem', color: '#555', textAlign: 'center', marginTop: 20, lineHeight: 1.5 }}>
        Setting up a new family account?{' '}
        <a href="/setup" style={{ color: '#ffffff', textDecoration: 'none' }}>Go to /setup →</a>
      </p>
    </div>
  )
}

// ── Profile setup modal (shown when profile data was lost) ─────────────────
function ProfileSetupModal({ session, onDone }) {
  const [name, setName] = useState(session.name || '')
  const [emoji, setEmoji] = useState(session.emoji || '😊')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    if (!name.trim()) { setError('Please enter your name'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/readers?id=${session.readerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), emoji }),
      })
      if (!res.ok) throw new Error('Could not save profile')
      // Update session in localStorage
      const updated = { ...session, name: name.trim(), emoji, needsProfileSetup: false }
      localStorage.setItem('readerSession', JSON.stringify(updated))
      onDone(updated)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}>
        <h2 style={{ color: '#e5e5e5', marginBottom: 6, fontSize: '1.2rem' }}>👋 Welcome back!</h2>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: 20 }}>
          Your account is restored. Please confirm your name and pick an emoji.
        </p>

        <label className="text-sm text-muted">Your name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" style={{ marginBottom: 16 }} autoFocus />

        <label className="text-sm text-muted">Pick your emoji</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {['😊','🦁','🐯','🦊','🐼','🦋','🐸','🦄','🐙','🦕','🚀','⭐'].map(e => (
            <button key={e} onClick={() => setEmoji(e)} style={{
              fontSize: '1.5rem', background: emoji === e ? '#2a2a2a' : 'transparent',
              border: emoji === e ? '2px solid #ffffff' : '2px solid transparent',
              borderRadius: 8, padding: 4, cursor: 'pointer',
            }}>{e}</button>
          ))}
        </div>

        {session.isAdmin && (
          <div style={{ background: '#141414', border: '1px solid #ffffff', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.8rem', color: '#e5e5e5' }}>
            ✅ Your admin access has been restored.
          </div>
        )}

        {error && <div className="error-banner" style={{ marginBottom: 12 }}>❌ {error}</div>}

        <button className="btn btn-primary w-full" onClick={handleSave} disabled={saving} style={{ padding: '12px' }}>
          {saving ? 'Saving…' : '✅ Confirm & Continue'}
        </button>
      </div>
    </div>
  )
}

// ── Change password modal ──────────────────────────────────────────────────
function ChangePasswordModal({ session, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  async function handleSave() {
    setError(null)
    if (!currentPassword) { setError('Enter your current password'); return }
    if (newPassword.length < 6) { setError('New password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return }
    setSaving(true)
    try {
      await login(session.email, currentPassword) // re-auth for fresh token
      await changePassword(newPassword)
      setSuccess(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
      <div style={{ background: '#141414', borderRadius: 10, padding: 24, width: '100%', maxWidth: 380, border: '1px solid #1e1e1e' }}>
        <h3 style={{ color: '#e5e5e5', marginBottom: 16 }}>🔐 Change Password</h3>
        {success ? (
          <>
            <div className="success-banner">✅ Password changed successfully!</div>
            <button className="btn btn-secondary w-full" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <label className="text-sm text-muted">Current Password</label>
            <input type="password" placeholder="Current password" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)} style={{ marginBottom: 12 }} autoFocus />
            <label className="text-sm text-muted">New Password <span style={{ color: '#666' }}>(min 6 characters)</span></label>
            <input type="password" placeholder="New password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} style={{ marginBottom: 12 }} />
            <label className="text-sm text-muted">Confirm New Password</label>
            <input type="password" placeholder="Repeat new password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} style={{ marginBottom: 16 }} />
            {error && <div className="error-banner" style={{ marginBottom: 12 }}>❌ {error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary w-full" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Change Password'}
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Stars ──────────────────────────────────────────────────────────────────
function Stars({ value, onChange }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} className={`star ${n <= value ? 'lit' : ''}`} onClick={() => onChange && onChange(n)}>★</span>
      ))}
    </div>
  )
}

// ── Word count helper ──────────────────────────────────────────────────────
function wc(text) { return text.trim() ? text.trim().split(/\s+/).length : 0 }

// ── Inline correction highlighting ────────────────────────────────────────
const CORR_COLOR = { spelling: '#ff6b6b', grammar: '#f59e0b', structure: '#60a5fa' }
function HighlightedSummary({ text, correctionsJson, style = {} }) {
  const corrections = (() => { try { return JSON.parse(correctionsJson || '[]') } catch { return [] } })()
  if (!corrections.length) return <span style={{ whiteSpace: 'pre-wrap', ...style }}>{text}</span>

  // Find each correction's position (non-overlapping, in order)
  const found = []
  let searchFrom = 0
  const sorted = [...corrections].filter(c => c.quote)
  for (const c of sorted) {
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
      <span style={{ whiteSpace: 'pre-wrap', ...style }}>{segments}</span>
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

// ── Book summary modal (view summary + AI grade) ───────────────────────────
function BookSummaryModal({ book, onClose, onEdit, onResubmit }) {
  const [imgErr, setImgErr] = useState(false)
  const [replyMsg, setReplyMsg] = useState('')
  const [replySending, setReplySending] = useState(false)
  // Real-time chat state — polled every 3 s while modal is open
  const [liveChat, setLiveChat] = useState(null)      // { msgs, canResubmit } once loaded
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const fresh = await getBook(book.id)
        if (!cancelled) setLiveChat({
          msgs: JSON.parse(fresh.chatMessages || '[]'),
          canResubmit: fresh.canResubmit === true,
        })
      } catch {}
    }
    poll()
    const timer = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [book.id])

  const words = wc(book.review || '')
  const score = book.gradeScore
  // Detect new (5-criteria, max 50) vs old (3-criteria, max 30) grade by presence of grammar field
  const isNewGrade = book.gradeGrammar != null
  const baseMax = isNewGrade ? 50 : 30
  const hasAccuracyTop = book.gradeAccuracy != null && book.gradeAccuracy >= 0
  const topMax = hasAccuracyTop ? baseMax + 10 : baseMax
  const topFull = hasAccuracyTop ? (score + book.gradeAccuracy) : score
  const pct = score != null ? Math.round((topFull / topMax) * 100) : null
  const scoreColor = pct == null ? '#666' : pct >= 80 ? '#52c87e' : pct >= 60 ? '#f59e0b' : '#ff6b6b'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, padding: 16, overflowY: 'auto' }}>
      <div style={{ background: '#141414', borderRadius: 10, padding: 20, width: '100%', maxWidth: 480, border: '1px solid #1e1e1e', marginTop: 16, marginBottom: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          {book.coverUrl && !imgErr
            ? <img src={book.coverUrl} alt="" onError={() => setImgErr(true)} style={{ width: 60, height: 90, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
            : <div style={{ width: 60, height: 90, background: '#1e1e1e', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.5rem' }}>📚</div>
          }
          <div>
            <h2 style={{ color: '#e5e5e5', fontSize: '1.1rem', margin: 0 }}>{book.title}</h2>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '4px 0' }}>{book.author}</p>
            {book.year ? <p style={{ color: '#666', fontSize: '0.75rem', margin: 0 }}>{book.year}</p> : null}
            {book.rating > 0 && <div style={{ color: '#ffffff', marginTop: 6 }}>{'★'.repeat(book.rating)}</div>}
          </div>
        </div>

        {/* Summary */}
        <div style={{ background: '#111111', borderRadius: 6, padding: 14, marginBottom: 16, border: '1px solid #1e1e1e' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Book Summary <span style={{ color: '#555' }}>({words} words)</span>
          </div>
          {book.review
            ? <p style={{ color: '#c4b5fd', fontSize: '0.88rem', lineHeight: 1.65, margin: 0 }}>
                {/* Only show corrections when this grade is still active (not pending regrading) */}
                {book.gradeScore != null && book.gradeCorrections
                  ? <HighlightedSummary text={book.review} correctionsJson={book.gradeCorrections} style={{ color: '#c4b5fd' }} />
                  : <span style={{ whiteSpace: 'pre-wrap' }}>{book.review}</span>
                }
              </p>
            : <p style={{ color: '#555', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>No summary written yet.</p>
          }
        </div>

        {/* AI Grade */}
        {pct != null ? (() => {
          const hasAccuracy = book.gradeAccuracy != null && book.gradeAccuracy >= 0
          const isNew = book.gradeGrammar != null
          const base = isNew ? 50 : 30
          const total = hasAccuracy ? base + 10 : base
          const fullScore = hasAccuracy ? (score + book.gradeAccuracy) : score
          const fullPct = Math.round((fullScore / total) * 100)
          const fullColor = fullPct >= 80 ? '#52c87e' : fullPct >= 60 ? '#e5e5e5' : '#ff6b6b'
          const bars = [
            ['Comprehension', book.gradeComprehension],
            ['Detail', book.gradeDetail],
            ['Reflection', book.gradeReflection],
            ...(isNew ? [['Grammar', book.gradeGrammar], ['Structure', book.gradeStructure]] : []),
            ...(hasAccuracy ? [['Accuracy vs Book', book.gradeAccuracy]] : []),
          ]
          return (
            <div style={{ background: '#111111', borderRadius: 6, padding: 14, border: '1px solid #1e1e1e', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Grade</div>
                {book.gradeBookFound === 1
                  ? <span style={{ fontSize: '0.68rem', color: '#52c87e', background: '#0a1a0a', padding: '2px 8px', borderRadius: 8 }}>✅ Compared to real book</span>
                  : <span style={{ fontSize: '0.68rem', color: '#666', background: '#0a0a0a', padding: '2px 8px', borderRadius: 8 }}>📖 General assessment</span>
                }
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <div style={{ textAlign: 'center', minWidth: 64 }}>
                  <div style={{ fontSize: '2.4rem', fontWeight: 700, color: fullColor, lineHeight: 1 }}>{fullPct}%</div>
                  <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: 2 }}>{fullScore}/{total} pts</div>
                </div>
                <div style={{ flex: 1 }}>
                  {bars.map(([label, val]) => val != null && (
                    <div key={label} style={{ marginBottom: 7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 2 }}>
                        <span style={{ color: label === 'Accuracy vs Book' ? '#52c87e' : '#6b7280', fontWeight: label === 'Accuracy vs Book' ? 600 : 400 }}>{label}</span>
                        <span style={{ color: '#6b7280' }}>{val}/10</span>
                      </div>
                      <div style={{ height: 5, background: '#1e1e1e', borderRadius: 3 }}>
                        <div style={{ height: '100%', borderRadius: 3, width: `${val * 10}%`, background: label === 'Accuracy vs Book' ? '#52c87e' : '#ffffff' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {book.gradeAccuracyNote && (
                <div style={{ background: '#0a1005', borderRadius: 4, padding: '8px 10px', marginBottom: 10, border: '1px solid #1a3a0a' }}>
                  <div style={{ fontSize: '0.68rem', color: '#52c87e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>📖 Accuracy Note</div>
                  <p style={{ color: '#b0d4b0', fontSize: '0.83rem', lineHeight: 1.5, margin: 0 }}>{book.gradeAccuracyNote}</p>
                </div>
              )}

              {book.gradeFeedback && (
                <p style={{ color: '#c4b5fd', fontSize: '0.85rem', lineHeight: 1.5, margin: 0, fontStyle: 'italic', borderTop: '1px solid #1e1e1e', paddingTop: 10, marginBottom: book.gradeSuggestions ? 10 : 0 }}>
                  "{book.gradeFeedback}"
                </p>
              )}

              {book.gradeSuggestions && (
                <div style={{ background: '#111111', borderRadius: 6, padding: '10px 12px', border: '1px solid #1a2a4a', marginTop: 10 }}>
                  <div style={{ fontSize: '0.68rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>💡 How to improve</div>
                  {book.gradeSuggestions.split('\n').filter(s => s.trim()).map((tip, i) => (
                    <p key={i} style={{ color: '#93c5fd', fontSize: '0.82rem', lineHeight: 1.55, margin: '0 0 4px' }}>{tip}</p>
                  ))}
                </div>
              )}
            </div>
          )
        })() : book.status === 'finished' && book.review ? (
          <div style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center', marginBottom: 16 }}>⏳ AI grade pending — check back in a moment</div>
        ) : null}

        {/* If not graded yet, offer to edit */}
        {book.status === 'finished' && book.gradeScore == null && onEdit && (
          <button className="btn btn-secondary w-full" style={{ marginBottom: 8 }} onClick={onEdit}>
            ✏️ Edit Summary
          </button>
        )}
        {/* AI Detection badge */}
        {book.gradeScore != null && (() => {
          const ai = book.aiDetection ?? 0
          if (ai <= 55) return null
          const isHigh = ai > 75
          return (
            <div style={{
              background: isHigh ? '#1e0929' : '#141414',
              border: `1px solid ${isHigh ? '#ff4444' : '#ffffff'}`,
              borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isHigh ? '#ff6b6b' : '#e5e5e5', marginBottom: 4 }}>
                {isHigh ? '🚨 Possible AI-generated content' : '⚠️ Possible AI assistance'}
              </div>
              {book.aiWarning && <p style={{ fontSize: '0.8rem', color: '#c4b5fd', margin: 0, lineHeight: 1.5 }}>{book.aiWarning}</p>}
            </div>
          )
        })()}

        {/* If not graded yet, offer to edit */}
        {book.status === 'finished' && book.gradeScore == null && onEdit && (
          <button className="btn btn-secondary w-full" style={{ marginBottom: 8 }} onClick={onEdit}>
            ✏️ Edit Summary
          </button>
        )}

        {/* ── Share with a Reading Buddy ── */}
        {(book.status === 'reading' || book.status === 'finished') && (
          <ShareBuddyButton bookTitle={book.title} />
        )}

        {/* ── Feedback / Chat section ── */}
        {(() => {
          const session = getSession()
          // Use live-polled data; fall back to prop while first poll is in-flight
          const msgs = liveChat?.msgs ?? JSON.parse(book.chatMessages || '[]')
          const canResubmit = liveChat ? liveChat.canResubmit : (book.canResubmit === true)
          if (msgs.length === 0 && !canResubmit) return null

          async function handleReply() {
            if (!replyMsg.trim()) return
            setReplySending(true)
            const text = replyMsg.trim()
            // Optimistic: show message immediately
            const optimistic = [...msgs, { from: 'reader', name: session?.name || 'You', msg: text, at: new Date().toISOString() }]
            setLiveChat(prev => ({ ...(prev || { canResubmit }), msgs: optimistic }))
            setReplyMsg('')
            try {
              await addChatMessage(book.id, book.chatMessages, 'reader', session?.name || 'Reader', text)
              if (session?.familyId) notifyChatToAdmins({ familyId: session.familyId, bookTitle: book.title, readerName: session.name, bookId: book.id })
              // Next poll will sync authoritative data from Firestore
            } catch (e) {
              // Revert optimistic update on failure
              setLiveChat(prev => ({ ...(prev || { canResubmit }), msgs }))
              console.error('[chat]', e.message)
            } finally { setReplySending(false) }
          }

          return (
            <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 16, marginBottom: 12 }}>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>💬 Admin Feedback</div>

              {/* Message thread */}
              {msgs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 260, overflowY: 'auto' }}>
                  {msgs.map((m, i) => (
                    <div key={i} style={{ alignSelf: m.from === 'reader' ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                      <div style={{
                        background: m.from === 'reader' ? '#ffffff' : '#1e1e1e',
                        color: m.from === 'reader' ? '#0a0a0a' : '#e5e5e5',
                        borderRadius: m.from === 'reader' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                        padding: '8px 12px', fontSize: '0.83rem', lineHeight: 1.5,
                      }}>{m.msg}</div>
                      <div style={{ fontSize: '0.65rem', color: '#555', marginTop: 2, textAlign: m.from === 'reader' ? 'right' : 'left' }}>
                        {m.name || (m.from === 'admin' ? 'Admin' : 'You')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply box */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: canResubmit ? 12 : 0 }}>
                <textarea rows={2} value={replyMsg} onChange={e => setReplyMsg(e.target.value)}
                  placeholder="Reply to admin… (Enter to send)"
                  style={{ flex: 1, resize: 'none', fontSize: '0.83rem', marginBottom: 0 }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply() } }}
                />
                <button className="btn btn-primary" style={{ padding: '0 14px', height: 52, fontSize: '0.8rem', flexShrink: 0 }}
                  onClick={handleReply} disabled={replySending || !replyMsg.trim()}>
                  {replySending ? '…' : 'Send'}
                </button>
              </div>

              {/* Resubmit banner */}
              {canResubmit && (
                <div style={{ background: '#0a1a0a', border: '1px solid #52c87e', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#52c87e', fontWeight: 700, marginBottom: 4 }}>✏️ Resubmission unlocked!</div>
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 10px', lineHeight: 1.5 }}>
                    Your admin has allowed you to rewrite your summary. Your old summary and grade will be saved as history.
                  </p>
                  <button className="btn btn-primary" style={{ width: '100%', padding: '9px', fontSize: '0.85rem' }}
                    onClick={() => { onClose(); onResubmit(book) }}>
                    ✏️ Rewrite My Summary
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        <button className="btn btn-secondary w-full" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

// ── Resubmit modal (reader rewrites summary after admin unlocks it) ─────────
function ResubmitModal({ book, onDone, onClose }) {
  const [newReview, setNewReview] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function wc(t) { return t.trim() ? t.trim().split(/\s+/).length : 0 }
  const words = wc(newReview)
  const wcOk = words >= 350 && words <= 500

  async function handleSubmit() {
    if (!wcOk) { setError(words < 350 ? `Need ${350 - words} more words` : `${words - 500} words over the 500-word limit`); return }
    setSaving(true); setError(null)
    try {
      await resubmitSummary(book.id, book, newReview.trim())
      // Notify admins of resubmission
      const rsess = getSession()
      if (rsess?.familyId) notifySubmitted({ familyId: rsess.familyId, bookTitle: book.title, readerName: rsess.name, bookId: book.id })
      // Trigger regrading in background
      fetch('/api/grade', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn: book.isbn, title: book.title, author: book.author, summary: newReview.trim(), description: book.description || '' }) })
        .then(r => r.ok ? r.json() : null)
        .then(g => g && updateBook(book.id, { gradeScore: g.score, gradeFeedback: g.feedback, gradeComprehension: g.comprehension, gradeDetail: g.detail, gradeReflection: g.reflection, gradeGrammar: g.grammar ?? 0, gradeStructure: g.structure ?? 0, gradeSuggestions: g.suggestions || '', gradeAccuracy: g.accuracy ?? -1, gradeAccuracyNote: g.accuracyNote || '', gradeBookFound: g.bookFound ? 1 : 0, bookDescriptionPreview: g.bookDescriptionPreview || '', aiDetection: g.aiDetection ?? 0, aiWarning: g.aiWarning || '', gradeCorrections: JSON.stringify(g.corrections || []) }))
        .catch(() => {})
      onDone()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 400, padding: 16, overflowY: 'auto' }}>
      <div style={{ background: '#141414', borderRadius: 10, padding: 20, width: '100%', maxWidth: 480, border: '1px solid #1e1e1e', marginTop: 16, marginBottom: 16 }}>
        <h3 style={{ color: '#e5e5e5', marginBottom: 4, fontSize: '1rem' }}>✏️ Resubmit Summary</h3>
        <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: 4 }}>{book.title}</p>

        {/* Show old summary for reference */}
        {book.review && (
          <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: '0.68rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Your previous summary (kept as history)</div>
            <div style={{ fontSize: '0.78rem', color: '#555', lineHeight: 1.6, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{book.review}</div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <label className="text-sm text-muted">New Summary (350–500 words)</label>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: words === 0 ? '#666' : words < 350 ? '#ff6b6b' : words <= 500 ? '#52c87e' : '#ff6b6b' }}>
            {words} / 350–500
          </span>
        </div>
        <textarea rows={10} value={newReview} onChange={e => setNewReview(e.target.value)}
          placeholder="Write your new 350–500 word summary here…"
          style={{ marginBottom: 6 }} autoFocus />
        {words > 0 && (
          <div style={{ fontSize: '0.75rem', marginBottom: 12, color: words < 350 ? '#ff6b6b' : words <= 500 ? '#52c87e' : '#ff6b6b' }}>
            {words < 350 ? `✏️ ${350 - words} more words needed` : words <= 500 ? '✅ Perfect length!' : `✂️ ${words - 500} words over the limit`}
          </div>
        )}

        {error && <div className="error-banner" style={{ marginBottom: 10 }}>❌ {error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary w-full" onClick={handleSubmit} disabled={saving || !wcOk}>
            {saving ? '⏳ Submitting…' : '📤 Submit for Regrading'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit book modal ────────────────────────────────────────────────────────
function EditBookModal({ book, onSave, onBookCredited, onClose }) {
  const [status, setStatus] = useState(book.status === 'finished' ? 'finished' : (book.status || 'reading'))
  const [rating, setRating] = useState(book.rating || 0)
  const hasDraft = !!(book.draftReview && !book.gradeScore)
  const [review, setReview] = useState(hasDraft ? book.draftReview : (book.review || ''))
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [autoSaved, setAutoSaved] = useState(false)
  const [pagesRead,  setPagesRead]  = useState(book.pagesRead  != null ? String(book.pagesRead)  : '')
  const [totalPages, setTotalPages] = useState(book.totalPages != null ? String(book.totalPages) : '')

  const wasFinished = book.status === 'finished'
  const isGraded = book.gradeScore != null
  // Summary section is shown whenever the book still needs a proper submission
  const needsSummary = !wasFinished || !isGraded || hasDraft
  const words = wc(review)
  const wcOk = words >= 350 && words <= 500

  // Auto-save draft 3 seconds after the reader stops typing
  useEffect(() => {
    if (!needsSummary || isGraded || !review.trim()) return
    setAutoSaved(false)
    const t = setTimeout(async () => {
      try {
        await updateBook(book.id, { draftReview: review.trim() })
        setAutoSaved(true)
      } catch {}
    }, 3000)
    return () => clearTimeout(t)
  }, [review]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveDraft() {
    setSaving(true); setError(null)
    try {
      await updateBook(book.id, { draftReview: review.trim(), rating })
      onSave({ status, rating, draftReview: review.trim() })
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // Save rating/status/pages without marking as finished
  async function handleSaveOnly() {
    setSaving(true); setError(null)
    const updates = { status, rating }
    if (pagesRead  !== '') updates.pagesRead  = Number(pagesRead)
    if (totalPages !== '') updates.totalPages = Number(totalPages)
    try {
      await updateBook(book.id, updates)
      onSave(updates)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // Submit summary → marks as Finished, credits reader, triggers grading
  async function handleSubmitFinish() {
    if (!wcOk) { setError(words < 350 ? `Need ${350 - words} more words` : `${words - 500} words over the 500 limit`); return }
    setSaving(true); setError(null)
    const updates = { status: 'finished', rating, review, draftReview: '' }
    if (!wasFinished) updates.finishedAt = new Date().toISOString()
    if (pagesRead  !== '') updates.pagesRead  = Number(pagesRead)
    if (totalPages !== '') updates.totalPages = Number(totalPages)
    if (wasFinished && isGraded) {
      updates.gradeScore = null; updates.gradeFeedback = ''; updates.gradeComprehension = null
      updates.gradeDetail = null; updates.gradeReflection = null; updates.gradeGrammar = null
      updates.gradeStructure = null; updates.gradeSuggestions = ''
      updates.gradeAccuracy = null; updates.gradeAccuracyNote = ''; updates.gradeBookFound = 0
      updates.gradeCorrections = ''
    }
    try {
      await updateBook(book.id, updates)
      if (!wasFinished) {
        const esess = getSession()
        if (esess?.readerId && esess?.familyId) {
          creditBook({ readerId: esess.readerId, familyId: esess.familyId, bookId: book.id, bookTitle: book.title })
            .then(() => onBookCredited?.())
            .catch(() => {})
        }
      }
      if (review.trim()) {
        const esess = getSession()
        if (esess?.familyId) notifySubmitted({ familyId: esess.familyId, bookTitle: book.title, readerName: esess.name, bookId: book.id })
        fetch('/api/grade', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isbn: book.isbn, title: book.title, author: book.author, summary: review, description: book.description || '' }) })
          .then(r => r.ok ? r.json() : null)
          .then(g => g && updateBook(book.id, { gradeScore: g.score, gradeFeedback: g.feedback, gradeComprehension: g.comprehension, gradeDetail: g.detail, gradeReflection: g.reflection, gradeGrammar: g.grammar ?? 0, gradeStructure: g.structure ?? 0, gradeSuggestions: g.suggestions || '', gradeAccuracy: g.accuracy ?? -1, gradeAccuracyNote: g.accuracyNote || '', gradeBookFound: g.bookFound ? 1 : 0, bookDescriptionPreview: g.bookDescriptionPreview || '', aiDetection: g.aiDetection ?? 0, aiWarning: g.aiWarning || '', gradeCorrections: JSON.stringify(g.corrections || []) }))
          .catch(() => {})
      }
      onSave(updates)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: '#141414', borderRadius: 10, padding: 20, width: '100%', maxWidth: 400, border: '1px solid #1e1e1e', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ color: '#e5e5e5', marginBottom: 4, fontSize: '1rem' }}>{book.title}</h3>
        <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: 8 }}>{book.author}</p>

        {hasDraft && (
          <div style={{ background: '#141414', border: '1px solid #f59e0b', borderRadius: 6, padding: '7px 12px', marginBottom: 14, fontSize: '0.78rem', color: '#f59e0b' }}>
            📝 Draft saved — finish your summary and hit <strong>Submit &amp; Mark Finished</strong> when ready.
          </div>
        )}
        {wasFinished && !isGraded && !hasDraft && (
          <div style={{ background: '#141414', border: '1px solid #ffffff', borderRadius: 6, padding: '7px 12px', marginBottom: 14, fontSize: '0.78rem', color: '#e5e5e5' }}>
            ✏️ Your summary hasn't been graded yet — you can still update it.
          </div>
        )}
        {isGraded && (
          <div style={{ background: '#0a1a0a', border: '1px solid #52c87e', borderRadius: 6, padding: '7px 12px', marginBottom: 14, fontSize: '0.78rem', color: '#52c87e' }}>
            🔒 Summary is locked — it has already been graded.
          </div>
        )}

        {/* Status — Finished is read-only, earned by submitting a summary */}
        <label className="text-sm text-muted">Status</label>
        {wasFinished ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 14, background: '#0a1a0a', border: '1px solid #22c55e', borderRadius: 7, padding: '5px 14px', fontSize: '0.82rem', color: '#22c55e', fontWeight: 600 }}>
            ✅ Finished
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {[{ val: 'reading', label: '📖 Reading' }, { val: 'want-to-read', label: '🔖 Want to Read' }].map(opt => (
              <button key={opt.val} className="btn btn-secondary"
                style={{ padding: '6px 10px', fontSize: '0.8rem', background: status === opt.val ? '#ffffff' : undefined, color: status === opt.val ? '#000' : undefined }}
                onClick={() => { setError(null); setStatus(opt.val) }}>{opt.label}</button>
            ))}
          </div>
        )}

        {status === 'reading' && (
          <div style={{ marginBottom: 14 }}>
            <label className="text-sm text-muted" style={{ display: 'block', marginBottom: 6 }}>📖 Reading Progress (optional)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min="0" value={pagesRead} onChange={e => setPagesRead(e.target.value)}
                placeholder="Page I'm on" style={{ flex: 1 }} />
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>of</span>
              <input type="number" min="1" value={totalPages} onChange={e => setTotalPages(e.target.value)}
                placeholder="Total pages" style={{ flex: 1 }} />
            </div>
            {pagesRead && totalPages && Number(totalPages) > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Progress</span>
                  <span style={{ fontSize: '0.72rem', color: '#60a5fa', fontWeight: 600 }}>
                    {Math.min(100, Math.round((Number(pagesRead) / Number(totalPages)) * 100))}%
                  </span>
                </div>
                <div style={{ height: 6, background: '#1e1e1e', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.round((Number(pagesRead) / Number(totalPages)) * 100))}%`, background: '#60a5fa', borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}
          </div>
        )}

        <label className="text-sm text-muted">Rating</label>
        <Stars value={rating} onChange={setRating} />

        {needsSummary && (
          <>
            {!wasFinished && (
              <div style={{ background: '#0a0f1a', border: '1px solid #2563eb', borderRadius: 6, padding: '7px 12px', marginTop: 12, marginBottom: 8, fontSize: '0.78rem', color: '#93c5fd' }}>
                📖 Write a 350–500 word summary to mark this book as <strong>Finished</strong> and earn your reward!
              </div>
            )}
            <div style={{ marginTop: wasFinished ? 10 : 0, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label className="text-sm text-muted">Book Summary (required)</label>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: words === 0 ? '#666' : words < 350 ? '#ff6b6b' : words <= 500 ? '#52c87e' : '#ff6b6b' }}>
                {words} / 350–500 words
              </span>
            </div>
            <textarea rows={8} value={review}
              onChange={e => !isGraded && setReview(e.target.value)}
              readOnly={isGraded}
              placeholder="Write a 350–500 word summary…"
              style={{ marginBottom: 6, opacity: isGraded ? 0.6 : 1, cursor: isGraded ? 'not-allowed' : undefined }} />
            {words > 0 && (
              <div style={{ fontSize: '0.75rem', marginBottom: 4, color: words < 350 ? '#ff6b6b' : words <= 500 ? '#52c87e' : '#ff6b6b' }}>
                {words < 350 ? `✏️ ${350 - words} more words needed` : words <= 500 ? '✅ Perfect length!' : `✂️ ${words - 500} words over limit`}
              </div>
            )}
            {!isGraded && (
              <div style={{ fontSize: '0.7rem', color: autoSaved ? '#52c87e' : '#4b5563', marginBottom: 10, minHeight: 16 }}>
                {autoSaved ? '💾 Draft auto-saved' : review.trim() ? '⏳ Auto-saving draft…' : ''}
              </div>
            )}
          </>
        )}

        {!needsSummary && (
          <>
            <div style={{ marginTop: 10, marginBottom: 4 }}>
              <label className="text-sm text-muted">Notes / Review</label>
            </div>
            <textarea rows={3} value={review} onChange={e => setReview(e.target.value)}
              placeholder="Notes or review (optional)…" style={{ marginBottom: 6 }} />
          </>
        )}

        {error && <div className="error-banner" style={{ marginBottom: 10 }}>❌ {error}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {needsSummary ? (<>
            <button className="btn btn-primary w-full" onClick={handleSubmitFinish} disabled={saving || !wcOk}>
              {saving ? '⏳ Submitting…' : wasFinished ? '📤 Submit for Grading' : '📤 Submit & Mark Finished'}
            </button>
            <button className="btn btn-secondary w-full" onClick={handleSaveDraft} disabled={saving}>
              {saving ? '💾 Saving…' : '💾 Save Draft — finish later'}
            </button>
            {!wasFinished && (
              <button className="btn btn-secondary w-full" onClick={handleSaveOnly} disabled={saving}>
                {saving ? 'Saving…' : '💾 Save Changes'}
              </button>
            )}
          </>) : (
            <button className="btn btn-primary w-full" onClick={handleSaveOnly} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Share a book with a Reading Buddy ─────────────────────────────────────
function ShareBuddyButton({ bookTitle }) {
  const [open,    setOpen]    = useState(false)
  const [link,    setLink]    = useState('')
  const [loading, setLoading] = useState(false)
  const [copied,  setCopied]  = useState(false)

  async function handleShare() {
    setOpen(true)
    if (link) return  // already generated
    setLoading(true)
    try {
      const { code } = await createBuddyInvite(bookTitle)
      setLink(`${window.location.origin}/buddy?c=${code}`)
    } catch (e) {
      console.error('[buddy]', e)
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard?.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return (
    <button className="btn btn-secondary w-full" style={{ marginBottom: 8 }} onClick={handleShare}>
      👥 Share with a Reading Buddy
    </button>
  )

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #2563eb', borderRadius: 10, padding: 14, marginBottom: 8 }}>
      <div style={{ color: '#e5e5e5', fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>
        👥 Reading Buddy Invite
      </div>
      <div style={{ color: '#6b7280', fontSize: '0.78rem', marginBottom: 10 }}>
        Share this link with a friend. They can open it to chat with you about <em>{bookTitle}</em>.
      </div>
      {loading
        ? <div style={{ color: '#6b7280', fontSize: '0.82rem' }}>Generating link…</div>
        : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input readOnly value={link} style={{ flex: 1, minWidth: 0, fontSize: '0.72rem', padding: '6px 8px', background: '#141414', border: '1px solid #374151', borderRadius: 6, color: '#e5e5e5' }} onClick={e => e.target.select()} />
            <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.78rem', flexShrink: 0 }} onClick={handleCopy}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
        )
      }
      <button onClick={() => setOpen(false)} style={{ marginTop: 10, background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: '0.78rem', padding: 0 }}>
        Close
      </button>
    </div>
  )
}

// ── Buddy Chat modal ───────────────────────────────────────────────────────
function BuddyChatModal({ chat: initialChat, onClose }) {
  const session = getSession()
  const [chat,      setChat]      = useState(initialChat)
  const [msg,       setMsg]       = useState('')
  const [sending,   setSending]   = useState(false)
  const [sendError, setSendError] = useState(null)
  const bottomRef    = useRef(null)
  const errorTimer   = useRef(null)

  const isReader1 = session?.readerId === chat.reader1Id
  const partner   = isReader1
    ? { name: chat.reader2Name, emoji: chat.reader2Emoji }
    : { name: chat.reader1Name, emoji: chat.reader1Emoji }

  // Clean up auto-dismiss timer on unmount
  useEffect(() => () => clearTimeout(errorTimer.current), [])

  // Poll for new messages every 3 s
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const fresh = await getBuddyChatById(chat.id)
        if (!cancelled && fresh) setChat(fresh)
      } catch {}
    }
    poll()
    const timer = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [chat.id])

  // Scroll to bottom when messages update
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.messages])

  const msgs = JSON.parse(chat.messages || '[]')

  function showError(msg) {
    setSendError(msg)
    clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setSendError(null), 5000)
  }

  async function handleSend() {
    if (!msg.trim()) return
    setSending(true)
    setSendError(null)
    clearTimeout(errorTimer.current)
    const text = msg.trim()
    setMsg('')
    try {
      await sendBuddyMessage(chat.id, text)
      const fresh = await getBuddyChatById(chat.id)
      if (fresh) setChat(fresh)
    } catch (e) {
      // Restore message so the child can edit rather than retype
      setMsg(text)
      showError(e.message || 'Could not send — please try again.')
      console.error('[buddy]', e)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#141414', borderRadius: '16px 16px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
          <span style={{ fontSize: '1.5rem' }}>{partner.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.95rem' }}>{partner.name}</div>
            {chat.bookTitle && <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>📖 {chat.bookTitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.4rem', padding: 0 }}>✕</button>
        </div>

        {/* Admin-visibility notice */}
        <div style={{ background: '#0a0a0a', borderBottom: '1px solid #1e1e1e', padding: '6px 16px', flexShrink: 0 }}>
          <span style={{ color: '#4b5563', fontSize: '0.72rem' }}>🔍 Messages are visible to both your admins · No deletions allowed · Keep it friendly! 😊</span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msgs.length === 0 && (
            <div style={{ color: '#4b5563', fontSize: '0.85rem', textAlign: 'center', marginTop: 20 }}>
              No messages yet — say hi! 👋
            </div>
          )}
          {msgs.map((m, i) => {
            const mine = m.from === session?.readerId
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%', background: mine ? '#2563eb' : '#1e1e1e', color: '#e5e5e5', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px', fontSize: '0.88rem' }}>
                  {!mine && <div style={{ color: '#93c5fd', fontSize: '0.72rem', marginBottom: 2 }}>{m.name}</div>}
                  {m.msg}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#4b5563', marginTop: 2 }}>
                  {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Blocked-message warning — sits just above the keyboard/input so kids always see it */}
        {sendError && (
          <div style={{ background: '#7f1d1d', borderTop: '2px solid #ef4444', padding: '10px 14px', flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🚫</span>
            <span style={{ color: '#ffffff', fontSize: '0.88rem', fontWeight: 600, flex: 1, lineHeight: 1.4 }}>{sendError}</span>
            <button onClick={() => { setSendError(null); clearTimeout(errorTimer.current) }} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '1.1rem', padding: 0, lineHeight: 1 }}>✕</button>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #1e1e1e', display: 'flex', gap: 8, flexShrink: 0 }}>
          <input
            value={msg}
            onChange={e => { setMsg(e.target.value); if (sendError) setSendError(null) }}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message…"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#0a0a0a', border: `1px solid ${sendError ? '#ef4444' : '#374151'}`, color: '#e5e5e5', fontSize: '0.88rem' }}
          />
          <button onClick={handleSend} disabled={sending || !msg.trim()} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Buddy Chats list (shown on the reader's shelf) ─────────────────────────
function BuddyChatsSection() {
  const session = getSession()
  const [chats,      setChats]      = useState([])
  const [openChat,   setOpenChat]   = useState(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    getBuddyChats().then(setChats).catch(() => {}).finally(() => setLoading(false))
    // Open a specific chat if URL param ?buddyChat=ID is present
    const params = new URLSearchParams(window.location.search)
    const chatId = params.get('buddyChat')
    if (chatId) {
      getBuddyChatById(chatId).then(c => { if (c) setOpenChat(c) }).catch(() => {})
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  if (loading || (!chats.length && !openChat)) return null

  return (
    <>
      {openChat && <BuddyChatModal chat={openChat} onClose={() => setOpenChat(null)} />}

      <div style={{ width: '100%', maxWidth: 480, marginTop: 24 }}>
        <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.95rem', marginBottom: 10 }}>👥 Reading Buddy Chats</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chats.map(chat => {
            const isReader1 = session?.readerId === chat.reader1Id
            const partner   = isReader1 ? { name: chat.reader2Name, emoji: chat.reader2Emoji } : { name: chat.reader1Name, emoji: chat.reader1Emoji }
            const msgs      = JSON.parse(chat.messages || '[]')
            const last      = msgs[msgs.length - 1]
            return (
              <button key={chat.id} onClick={() => setOpenChat(chat)}
                style={{ width: '100%', background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>{partner.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#e5e5e5', fontWeight: 600, fontSize: '0.88rem' }}>{partner.name}</div>
                  {chat.bookTitle && <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>📖 {chat.bookTitle}</div>}
                  {last && <div style={{ color: '#4b5563', fontSize: '0.75rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {last.from === session?.readerId ? 'You' : last.name}: {last.msg}
                  </div>}
                </div>
                <span style={{ color: '#6b7280', fontSize: '0.75rem', flexShrink: 0 }}>💬</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Genre color coding ────────────────────────────────────────────────────
const GENRE_COLOR_MAP = {
  fantasy: '#7c3aed', fiction: '#2563eb', mystery: '#d97706',
  'science fiction': '#0891b2', 'sci-fi': '#0891b2', science: '#16a34a',
  history: '#92400e', biography: '#065f46', adventure: '#dc2626',
  horror: '#374151', romance: '#db2777', 'non-fiction': '#047857',
  comics: '#ea580c', poetry: '#6d28d9', thriller: '#b45309',
  humor: '#0d9488', sports: '#3b82f6', animals: '#16a34a', magic: '#7c3aed',
}
function getGenreColor(genre) {
  if (!genre) return null
  const g = genre.toLowerCase()
  for (const [key, color] of Object.entries(GENRE_COLOR_MAP)) {
    if (g.includes(key)) return color
  }
  return null
}

// ── Coin / reward pop animation ────────────────────────────────────────────
function CoinAnimation({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{
      position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
      animation: 'coinPop 2.8s ease forwards', pointerEvents: 'none', zIndex: 9999,
      background: 'rgba(0,0,0,0.95)', border: '2px solid #22c55e', borderRadius: 16,
      padding: '14px 28px', textAlign: 'center', whiteSpace: 'nowrap',
      boxShadow: '0 4px 32px rgba(34,197,94,0.4)',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: 6 }}>💰</div>
      <div style={{ color: '#22c55e', fontWeight: 800, fontSize: '1.1rem' }}>Reading reward earned!</div>
      <div style={{ color: '#86efac', fontSize: '0.75rem', marginTop: 3 }}>+50 XP · coin added to balance</div>
    </div>
  )
}

// ── Reading streak calendar ────────────────────────────────────────────────
function StreakCalendar({ books }) {
  const finished = books.filter(b => b.status === 'finished' && b.finishedAt)
  if (finished.length === 0) return null

  const dateSet = new Set(finished.map(b => new Date(b.finishedAt).toISOString().slice(0, 10)))
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const weeks = []
  for (let w = 12; w >= 0; w--) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(today)
      date.setDate(today.getDate() - (w * 7 + (6 - d)))
      week.push(date.toISOString().slice(0, 10))
    }
    weeks.push(week)
  }

  // Current streak (consecutive days going backward from today)
  let streak = 0
  const check = new Date(today)
  while (true) {
    const k = check.toISOString().slice(0, 10)
    if (dateSet.has(k)) { streak++; check.setDate(check.getDate() - 1) }
    else if (k === todayStr) { check.setDate(check.getDate() - 1) }
    else break
  }

  return (
    <div style={{ marginBottom: 20, padding: '14px 16px', background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: '1rem' }}>📅</span>
        <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.9rem', flex: 1 }}>Reading Streak</div>
        {streak > 0 && (
          <span style={{ fontSize: '0.72rem', color: '#f59e0b', background: '#1a1000', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>
            🔥 {streak} day{streak !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 4 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map(date => {
              const active = dateSet.has(date)
              return (
                <div key={date} title={`${date}${active ? ' — book finished' : ''}`} style={{
                  width: 13, height: 13, borderRadius: 3,
                  background: active ? '#22c55e' : '#1e1e1e',
                  flexShrink: 0,
                }} />
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: '#1e1e1e' }} />
        <span style={{ fontSize: '0.62rem', color: '#6b7280' }}>No book</span>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e', marginLeft: 8 }} />
        <span style={{ fontSize: '0.62rem', color: '#6b7280' }}>Finished a book</span>
        <span style={{ fontSize: '0.62rem', color: '#555', marginLeft: 'auto' }}>Last 13 weeks</span>
      </div>
    </div>
  )
}

// ── Badges in reader view ─────────────────────────────────────────────────
const READER_BADGES = [
  { req: 1,   icon: '🌟', name: 'First Book!' },
  { req: 5,   icon: '📖', name: 'Bookworm' },
  { req: 10,  icon: '🏆', name: 'Champion' },
  { req: 20,  icon: '🚀', name: 'Rocket' },
  { req: 50,  icon: '👑', name: 'Library King' },
  { req: 100, icon: '🌈', name: 'Legend' },
]
function BadgesSection({ books }) {
  const count = books.filter(b => b.status === 'finished').length
  if (count === 0) return null
  const earned = READER_BADGES.filter(b => count >= b.req)
  const next = READER_BADGES.find(b => count < b.req)
  return (
    <div style={{ marginBottom: 20, padding: '14px 16px', background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: '1rem' }}>🏅</span>
        <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.9rem', flex: 1 }}>Badges</div>
        <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>{earned.length}/{READER_BADGES.length} earned</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {earned.map(b => (
          <div key={b.req} style={{ textAlign: 'center', minWidth: 50 }}>
            <div style={{ fontSize: '2rem', lineHeight: 1 }}>{b.icon}</div>
            <div style={{ fontSize: '0.58rem', color: '#22c55e', fontWeight: 700, marginTop: 4 }}>{b.name}</div>
          </div>
        ))}
        {next && (
          <div style={{ textAlign: 'center', minWidth: 50, opacity: 0.35 }}>
            <div style={{ fontSize: '2rem', lineHeight: 1, filter: 'grayscale(1)' }}>{next.icon}</div>
            <div style={{ fontSize: '0.58rem', color: '#6b7280', marginTop: 4 }}>{next.req - count} more</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Reader's personal bookshelf ────────────────────────────────────────────
function BookRow({ book, onEdit, onView }) {
  const [imgErr, setImgErr] = useState(false)
  const statusColor = book.status === 'finished' ? '#80ff80' : book.status === 'reading' ? '#80c0ff' : '#e5e5e5'
  const statusLabel = book.status === 'finished' ? '✅ Finished' : book.status === 'reading' ? '📖 Reading' : '🔖 Want to Read'
  // Show badge if admin has sent the last message (unread feedback)
  const msgs = JSON.parse(book.chatMessages || '[]')
  const hasAdminMsg = msgs.length > 0 && msgs[msgs.length - 1].from === 'admin'
  const canResubmit = book.canResubmit === true
  const hasDraft = !!(book.draftReview && !book.gradeScore)
  const isNewGradeRow = book.gradeGrammar != null
  const baseMaxRow = isNewGradeRow ? 50 : 30
  const hasAccRow = book.gradeAccuracy != null && book.gradeAccuracy >= 0
  const rowTotal = hasAccRow ? baseMaxRow + 10 : baseMaxRow
  const rowFull = hasAccRow ? (book.gradeScore + book.gradeAccuracy) : book.gradeScore
  const pct = book.gradeScore != null ? Math.round((rowFull / rowTotal) * 100) : null
  const pctColor = pct == null ? '#666' : pct >= 80 ? '#52c87e' : pct >= 60 ? '#f59e0b' : '#ff6b6b'

  const gc = getGenreColor(book.genre)
  return (
    <div className="lm-card" style={{ display: 'flex', gap: 12, padding: '10px 12px', background: '#141414', borderRadius: 8, marginBottom: 8, border: '1px solid #1e1e1e', borderLeft: gc ? `4px solid ${gc}` : '1px solid #1e1e1e', alignItems: 'center' }}>
      {book.coverUrl && !imgErr
        ? <img src={book.coverUrl} alt="" onError={() => setImgErr(true)} style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
        : <div style={{ width: 40, height: 60, background: '#1e1e1e', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📚</div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', color: '#e5e5e5', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
        <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{book.author}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: statusColor }}>{statusLabel}</span>
          {book.status === 'reading' && book.pagesRead != null && book.totalPages > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.68rem', color: '#60a5fa' }}>
                {Math.min(100, Math.round((book.pagesRead / book.totalPages) * 100))}%
              </span>
              <span style={{ display: 'inline-block', width: 40, height: 4, background: '#1e1e1e', borderRadius: 2, overflow: 'hidden', verticalAlign: 'middle' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.min(100, Math.round((book.pagesRead / book.totalPages) * 100))}%`, background: '#60a5fa', borderRadius: 2 }} />
              </span>
            </span>
          )}
          {book.rating > 0 && <span style={{ color: '#ffffff', fontSize: '0.75rem' }}>{'★'.repeat(book.rating)}</span>}
          {pct != null && <span style={{ fontSize: '0.7rem', color: pctColor, background: '#0a0a0a', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>🎯 {pct}%</span>}
          {hasDraft && <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: '#1a1000', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>📝 Draft</span>}
          {hasAdminMsg && <span style={{ fontSize: '0.7rem', color: '#fbbf24', background: '#1a1200', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>💬 Feedback</span>}
          {canResubmit && <span style={{ fontSize: '0.7rem', color: '#52c87e', background: '#0a1a0a', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>✏️ Resubmit</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        {book.status === 'finished' && (
          <button className="btn btn-secondary" style={{ padding: '5px 9px', fontSize: '0.75rem' }} onClick={onView} title="View summary & grade">📋</button>
        )}
        <button className="btn btn-secondary" style={{ padding: '5px 9px', fontSize: '0.75rem' }} onClick={onEdit}>✏️</button>
      </div>
    </div>
  )
}

// ── Personalised recommendation banner ────────────────────────────────────
const REC_CACHE_KEY  = 'bookRecommendations'
const REC_CACHE_TTL  = 24 * 60 * 60 * 1000   // 24 hours

function RecommendationBanner({ books }) {
  const [recs,    setRecs]    = useState([])
  const [loading, setLoading] = useState(false)
  const [covers,  setCovers]  = useState({})   // title → coverUrl

  const finished = books.filter(b => b.status === 'finished')

  useEffect(() => {
    if (finished.length < 2) return

    // Return cached recommendations if still fresh
    try {
      const cached = JSON.parse(localStorage.getItem(REC_CACHE_KEY) || 'null')
      if (cached && Date.now() - cached.ts < REC_CACHE_TTL && cached.recs?.length) {
        setRecs(cached.recs)
        return
      }
    } catch {}

    // Fetch fresh recommendations from Groq via /api/grade
    setLoading(true)
    const payload = finished.slice(0, 15).map(b => ({
      title: b.title, author: b.author || '', genre: b.genre || '',
    }))
    fetch(`/api/grade?recommend=1&books=${encodeURIComponent(JSON.stringify(payload))}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setRecs(list)
        try {
          localStorage.setItem(REC_CACHE_KEY, JSON.stringify({ ts: Date.now(), recs: list }))
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [finished.length])

  // Fetch covers from Open Library for each recommendation
  useEffect(() => {
    if (!recs.length) return
    recs.forEach(async rec => {
      if (covers[rec.title]) return
      try {
        const r = await fetch(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(rec.title + ' ' + rec.author)}&limit=1&fields=cover_i`,
          { cache: 'force-cache' }
        )
        if (r.ok) {
          const d = await r.json()
          const coverId = d.docs?.[0]?.cover_i
          if (coverId) {
            setCovers(prev => ({ ...prev, [rec.title]: `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` }))
          }
        }
      } catch {}
    })
  }, [recs])

  if (finished.length < 2) return null
  if (!loading && !recs.length) return null

  return (
    <div style={{ width: '100%', maxWidth: 480, marginTop: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingLeft: 4 }}>
        <span style={{ fontSize: '1.2rem' }}>✨</span>
        <div>
          <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.95rem' }}>You might enjoy next…</div>
          <div style={{ color: '#6b7280', fontSize: '0.72rem' }}>Based on your reading history</div>
        </div>
      </div>

      {/* Horizontal scroll strip */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
        {loading && !recs.length && [1,2,3,4,5].map(i => (
          <div key={i} style={{ flexShrink: 0, width: 100, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ width: 100, height: 140, background: '#1e1e1e', borderRadius: 8 }} />
            <div style={{ height: 10, background: '#1e1e1e', borderRadius: 4, width: '80%' }} />
            <div style={{ height: 9,  background: '#1e1e1e', borderRadius: 4, width: '60%' }} />
          </div>
        ))}

        {recs.map((rec, i) => (
          <div key={i} style={{ flexShrink: 0, width: 100, cursor: 'pointer' }}
            onClick={() => {
              // Pre-fill the manual search with this book title
              const evt = new CustomEvent('rec-search', { detail: rec.title + ' ' + rec.author })
              window.dispatchEvent(evt)
            }}
            title={rec.reason}
          >
            {/* Cover */}
            <div style={{ width: 100, height: 140, borderRadius: 8, overflow: 'hidden', background: '#1e1e1e', marginBottom: 6, position: 'relative' }}>
              {covers[rec.title]
                ? <img src={covers[rec.title]} alt={rec.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>📚</div>
              }
              {/* Shimmer overlay while cover loading */}
              {!covers[rec.title] && (
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1e1e1e 0%,#2a2a2a 50%,#1e1e1e 100%)' }} />
              )}
            </div>
            <div style={{ color: '#e5e5e5', fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.3,
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {rec.title}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.7rem', marginTop: 2,
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
              {rec.author}
            </div>
            <div style={{ color: '#60a5fa', fontSize: '0.68rem', marginTop: 4, lineHeight: 1.3,
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {rec.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BookGridItem({ book, onClick }) {
  const [imgErr, setImgErr] = useState(false)
  const gc = getGenreColor(book.genre)
  return (
    <div style={{ cursor: 'pointer', position: 'relative', borderRadius: 8, overflow: 'hidden' }} onClick={onClick}>
      {book.coverUrl && !imgErr
        ? <img src={book.coverUrl} alt={book.title} onError={() => setImgErr(true)} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', aspectRatio: '2/3', background: gc ? `${gc}22` : '#1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', border: gc ? `2px solid ${gc}55` : 'none', borderRadius: 8 }}>📚</div>
      }
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.9))', padding: '18px 6px 6px' }}>
        <div style={{ color: '#e5e5e5', fontSize: '0.62rem', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{book.title}</div>
      </div>
      <div style={{ position: 'absolute', top: 4, right: 4 }}>
        <span style={{ fontSize: '0.7rem', background: 'rgba(0,0,0,0.8)', borderRadius: 4, padding: '1px 4px' }}>
          {book.status === 'finished' ? '✅' : book.status === 'reading' ? '📖' : '🔖'}
        </span>
      </div>
    </div>
  )
}

function MyBooks({ readerId, onBookCredited }) {
  const [books, setBooks] = useState([])
  const [editBook, setEditBook] = useState(null)
  const [viewBook, setViewBook] = useState(null)
  const [resubmitBook, setResubmitBook] = useState(null)
  const [search,      setSearch]      = useState('')
  const [tab,         setTab]         = useState('all')
  const [loaded,      setLoaded]      = useState(false)
  const [page,        setPage]        = useState(1)
  const [recSearch,   setRecSearch]   = useState(null)   // prefilled from recommendation tap
  const [gridView,    setGridView]    = useState(false)

  useEffect(() => {
    const unsub = subscribeToBooksForReader(readerId, b => { setBooks(b); setLoaded(true) })
    return unsub
  }, [readerId])

  // Deep-link: open a book when the SW posts a message (app already open)
  useEffect(() => {
    function onSwMessage(event) {
      if (event.data?.type !== 'OPEN_BOOK_CHAT') return
      const book = books.find(b => b.id === event.data.bookId)
      if (book) setViewBook(book)
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage)
  }, [books])

  // Deep-link: open a book from URL param ?book=ID (app launched from notification)
  useEffect(() => {
    if (!books.length) return
    const params = new URLSearchParams(window.location.search)
    const bookId = params.get('book')
    if (!bookId) return
    const book = books.find(b => b.id === bookId)
    if (book) setViewBook(book)
    window.history.replaceState({}, '', window.location.pathname)
  }, [books])

  // Listen for recommendation taps → open manual search pre-filled
  useEffect(() => {
    const handler = e => setRecSearch(e.detail)
    window.addEventListener('rec-search', handler)
    return () => window.removeEventListener('rec-search', handler)
  }, [])

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [tab, search])

  const byStatus = s => books.filter(b => b.status === s)
  const tabs = [
    { key: 'all',          label: `All (${books.length})` },
    { key: 'reading',      label: `📖 Reading (${byStatus('reading').length})` },
    { key: 'finished',     label: `✅ Finished (${byStatus('finished').length})` },
    { key: 'want-to-read', label: `🔖 Want to Read (${byStatus('want-to-read').length})` },
  ]

  const inTab = tab === 'all' ? books : byStatus(tab)
  const filtered = search
    ? inTab.filter(b => b.title?.toLowerCase().includes(search.toLowerCase()) || b.author?.toLowerCase().includes(search.toLowerCase()))
    : inTab

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Keep viewBook in sync with latest data (grade might arrive after opening)
  const liveViewBook = viewBook ? (books.find(b => b.id === viewBook.id) || viewBook) : null

  const finishedBooks = books.filter(b => b.status === 'finished')
  const xp = getXP(books)
  const lvl = getLevel(xp)
  const pct = lvl.isMax ? 100 : Math.round((lvl.progressXP / lvl.rangeXP) * 100)
  const barColor = lvl.level >= 7 ? '#fbbf24' : lvl.level >= 5 ? '#f59e0b' : '#fbbf24'

  return (
    <div style={{ width: '100%', maxWidth: 480, marginTop: 20 }}>
      {editBook && <EditBookModal
        book={editBook}
        onSave={(updatedFields) => {
          if (updatedFields) setBooks(prev => prev.map(b => b.id === editBook.id ? { ...b, ...updatedFields } : b))
          setEditBook(null)
        }}
        onBookCredited={onBookCredited}
        onClose={() => setEditBook(null)}
      />}
      {resubmitBook && (
        <ResubmitModal
          book={resubmitBook}
          onDone={() => { setResubmitBook(null) }}
          onClose={() => setResubmitBook(null)}
        />
      )}
      {liveViewBook && (
        <BookSummaryModal
          book={liveViewBook}
          onClose={() => setViewBook(null)}
          onEdit={() => { setEditBook(liveViewBook); setViewBook(null) }}
          onResubmit={b => { setViewBook(null); setResubmitBook(b) }}
        />
      )}

      {/* ── Recommendation banner ── */}
      <RecommendationBanner books={books} />

      {/* ── Manual search pre-filled from recommendation tap ── */}
      {recSearch && (
        <ManualSearch
          initialQuery={recSearch}
          onFound={b => {
            setRecSearch(null)
            setEditBook({ ...b, readerId, readerName: '', readerEmoji: '' })
          }}
          onCancel={() => setRecSearch(null)}
        />
      )}

      {/* ── XP / Level card ── */}
      {finishedBooks.length > 0 && (
        <div className="lm-card" style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{lvl.emoji}</span>
              <div>
                <div style={{ color: '#e5e5e5', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>{lvl.title}</div>
                <div style={{ color: '#666', fontSize: '0.7rem' }}>Level {lvl.level}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.95rem' }}>{xp.toLocaleString()} XP</div>
              {!lvl.isMax && (
                <div style={{ color: '#666', fontSize: '0.7rem' }}>{lvl.nextXP - xp} to go</div>
              )}
            </div>
          </div>
          <div style={{ height: 8, background: '#1e1e1e', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
              borderRadius: 4, transition: 'width 1s ease',
            }} />
          </div>
          {!lvl.isMax ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#555', marginTop: 5 }}>
              <span>{lvl.progressXP} / {lvl.rangeXP} XP</span>
              <span>Next: {lvl.nextEmoji} {lvl.nextTitle}</span>
            </div>
          ) : (
            <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginTop: 6, textAlign: 'center' }}>
              👑 Maximum level reached — you're a Reading Legend!
            </div>
          )}
        </div>
      )}

      {/* Streak calendar and badges */}
      <StreakCalendar books={books} />
      <BadgesSection books={books} />

      <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ color: '#e5e5e5', fontSize: '1rem', margin: 0 }}>📚 My Books</h2>
          <button onClick={() => setGridView(g => !g)}
            style={{ background: 'none', border: '1px solid #2e2e2e', borderRadius: 6, color: '#6b7280', fontSize: '0.72rem', padding: '4px 10px', cursor: 'pointer' }}>
            {gridView ? '≡ List' : '⊞ Grid'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="btn btn-secondary"
              style={{ padding: '5px 10px', fontSize: '0.75rem', background: tab === t.key ? '#ffffff' : undefined, color: tab === t.key ? '#000' : undefined }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {books.length > 4 && (
        <input type="text" placeholder="Search books…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
      )}

      {!loaded && <div className="text-muted" style={{ padding: '12px 0' }}>Loading…</div>}
      {loaded && filtered.length === 0 && (
        <div style={{ color: '#6b7280', fontSize: '0.85rem', padding: '12px 0', textAlign: 'center' }}>
          {search ? 'No books match your search.' : tab === 'all' ? 'No books yet — scan your first book above!' : 'No books in this category yet.'}
        </div>
      )}

      {gridView ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 8 }}>
          {paginated.map(b => (
            <BookGridItem key={b.id} book={b}
              onClick={() => b.status === 'finished' ? setViewBook(b) : setEditBook(b)} />
          ))}
        </div>
      ) : (
        paginated.map(b => (
          <BookRow key={b.id} book={b} onEdit={() => setEditBook(b)} onView={() => setViewBook(b)} />
        ))
      )}
      <Pagination
        page={page} totalPages={totalPages} totalItems={filtered.length}
        onPrev={() => setPage(p => p - 1)}
        onNext={() => setPage(p => p + 1)}
      />
    </div>
  )
}

// ── Book detail card (after scan) ──────────────────────────────────────────
function BookDetailCard({ book, onAdd, onCancel }) {
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [status, setStatus] = useState('reading')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [imgErr, setImgErr] = useState(false)

  async function handleAdd() {
    setSaving(true)
    setSaveError(null)
    try {
      await Promise.race([
        addBook({ ...book, rating, review, status }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out.')), 15000)),
      ])
      onAdd()
    } catch (e) {
      setSaveError(e?.message || 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="book-detail-card">
      <div className="book-info">
        {book.coverUrl && !imgErr ? (
          <img src={book.coverUrl} alt={book.title} onError={() => setImgErr(true)} />
        ) : (
          <div style={{ width: 70, height: 105, borderRadius: 4, background: '#1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>📚</div>
        )}
        <div className="book-meta">
          <h2>{book.title}</h2>
          <p>{book.author}</p>
          {book.year && <p style={{ marginTop: 4, fontSize: '0.75rem' }}>{book.year}</p>}
          {book.genre && <p style={{ fontSize: '0.75rem', color: '#ffffff' }}>{book.genre}</p>}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label className="text-sm text-muted">Status</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {[
            { val: 'reading', label: '📖 Reading' },
            { val: 'want-to-read', label: '🔖 Want to Read' },
          ].map(opt => (
            <button key={opt.val} className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', background: status === opt.val ? '#ffffff' : undefined, color: status === opt.val ? '#000' : undefined }}
              onClick={() => { setSaveError(null); setStatus(opt.val) }}>
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 5 }}>
          ✏️ Open the book from your shelf to write a summary and mark it <strong>Finished</strong>
        </div>
      </div>

      <label className="text-sm text-muted" style={{ marginBottom: 6, display: 'block' }}>Your rating</label>
      <Stars value={rating} onChange={setRating} />

      <div style={{ marginTop: 14, marginBottom: 4 }}>
        <label className="text-sm text-muted">Notes (optional)</label>
      </div>
      <textarea rows={3} placeholder="Quick notes (optional)…"
        value={review} onChange={e => setReview(e.target.value)} style={{ marginBottom: 6 }} />

      {saveError && <div className="error-banner" style={{ marginBottom: 12 }}>❌ {saveError}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary w-full" onClick={handleAdd} disabled={saving}>
          {saving ? '⏳ Saving…' : '📚 Add to My Shelf'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Manual search ──────────────────────────────────────────────────────────
function ManualSearch({ onFound, onCancel, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Auto-search when opened from a recommendation
  useEffect(() => {
    if (initialQuery) doSearch()
  }, [])

  async function doSearch() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const books = await searchBooks(query)
      setResults(books)
      if (books.length === 0) setError('No books found. Try a different title or author.')
    } catch (e) {
      setError(e?.message || 'Search failed. Check your internet connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 400 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input type="text" placeholder="Title, author, or ISBN…" value={query}
          onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} />
        <button className="btn btn-primary" onClick={doSearch} disabled={loading} style={{ flexShrink: 0 }}>
          {loading ? '…' : '🔍'}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {results.map((b, i) => (
        <div key={i} onClick={() => onFound(b)} style={{
          display: 'flex', gap: 12, padding: '10px 12px', background: '#141414',
          borderRadius: 6, marginBottom: 8, cursor: 'pointer', border: '1px solid #1e1e1e',
        }}>
          {b.coverUrl
            ? <img src={b.coverUrl} alt="" style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: 3 }} />
            : <div style={{ width: 40, height: 60, background: '#1e1e1e', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📚</div>
          }
          <div>
            <div style={{ fontSize: '0.9rem', color: '#e5e5e5' }}>{b.title}</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{b.author}</div>
            {b.year && <div style={{ fontSize: '0.75rem', color: '#666' }}>{b.year}</div>}
          </div>
        </div>
      ))}
      <button className="btn btn-secondary mt-12" onClick={onCancel} style={{ width: '100%' }}>← Back to Scanner</button>
    </div>
  )
}

// ── Main scanner view ──────────────────────────────────────────────────────
export default function ScannerView() {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const controlsRef = useRef(null)
  const streamRef = useRef(null)
  const nativeLoopRef = useRef(null)
  const scannedRef = useRef(false)

  const [session, setSession] = useState(() => getSession())
  const [balanceKey, setBalanceKey] = useState(0)
  const [shelfKey, setShelfKey] = useState(0)
  const [kidProfile, setKidProfile] = useState({ themeColor: '', avatarBase64: '', bannerBase64: '', colorMode: 'dark' })
  const [showStyleModal, setShowStyleModal] = useState(false)
  const [phase, setPhase] = useState('scanning')
  const [foundBook, setFoundBook] = useState(null)
  const [scanError, setScanError] = useState(null)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [activeTab, setActiveTab] = useState('scan')
  const [showCoinAnim, setShowCoinAnim] = useState(false)
  const touchStartX = useRef(null)
  const [notifPerm, setNotifPerm] = useState(() => {
    if (!('Notification' in window)) return 'unsupported'
    return Notification.permission  // 'default' | 'granted' | 'denied'
  })
  const [notifDismissed, setNotifDismissed] = useState(
    () => localStorage.getItem('notifCardDismissed') === '1'
  )

  // Auto-subscribe silently when permission is already granted
  useEffect(() => {
    if (session?.readerId && notifPerm === 'granted') {
      subscribeToPush(session.readerId)
    }
  }, [session?.readerId])

  // Load kid's visual profile (banner, avatar, theme colour, color mode)
  useEffect(() => {
    if (!session?.readerId || session.isAdmin) return
    getReaderProfile(session.readerId).then(p => {
      setKidProfile(p || {})
      const mode = (p || {}).colorMode || 'dark'
      localStorage.setItem('colorMode', mode)
      document.documentElement.classList.toggle('light-mode', mode === 'light')
    }).catch(() => {})
  }, [session?.readerId])

  // Stop scanner and reset scan state when leaving the scan tab
  useEffect(() => {
    if (session?.isAdmin) return
    if (activeTab !== 'scan') {
      stopScanner()
      if (['found', 'manual', 'success', 'loading'].includes(phase)) {
        setFoundBook(null)
        setScanError(null)
        setPhase('scanning')
      }
    }
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session) return
    if (phase !== 'scanning') return
    if (!session.isAdmin && activeTab !== 'scan') return
    scannedRef.current = false
    startScanner()
    return () => stopScanner()
  }, [phase, session, activeTab])

  // Coin animation — triggered by BookDetailCard via custom event
  useEffect(() => {
    const handler = () => { setShowCoinAnim(true) }
    window.addEventListener('book-added-reward', handler)
    return () => window.removeEventListener('book-added-reward', handler)
  }, [])

  const KID_TABS = ['scan', 'shelf', 'learn', 'rewards', 'profile']
  function handleTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const diff = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(diff) > 70) {
      const idx = KID_TABS.indexOf(activeTab)
      if (diff > 0 && idx > 0) setActiveTab(KID_TABS[idx - 1])
      else if (diff < 0 && idx < KID_TABS.length - 1) setActiveTab(KID_TABS[idx + 1])
    }
    touchStartX.current = null
  }

  async function startScanner() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
        async function tick() {
          if (scannedRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            for (const c of codes) {
              const code = c.rawValue
              if (/^\d{10,13}$/.test(code.replace(/-/g, '')) && !scannedRef.current) {
                scannedRef.current = true
                await handleBarcode(code)
                return
              }
            }
          } catch {}
          nativeLoopRef.current = requestAnimationFrame(tick)
        }
        nativeLoopRef.current = requestAnimationFrame(tick)
      } else {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        readerRef.current = new BrowserMultiFormatReader()
        controlsRef.current = await readerRef.current.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          async (result) => {
            if (!result || scannedRef.current) return
            const code = result.getText()
            if (!/^\d{10,13}$/.test(code.replace(/-/g, ''))) return
            scannedRef.current = true
            await handleBarcode(code)
          }
        )
      }
    } catch (e) {
      setScanError(
        e.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access and reload.'
          : 'Camera not available. Use manual search below.'
      )
    }
  }

  function stopScanner() {
    if (nativeLoopRef.current) { cancelAnimationFrame(nativeLoopRef.current); nativeLoopRef.current = null }
    try { controlsRef.current?.stop() } catch {}
    controlsRef.current = null
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }

  function withReader(book) {
    return { ...book, readerId: session.readerId, readerName: session.name, readerEmoji: session.emoji }
  }

  async function handleBarcode(isbn) {
    stopScanner()
    setPhase('loading')
    try {
      const book = await lookupByISBN(isbn)
      if (book) {
        setFoundBook(withReader(book))
        setPhase('found')
      } else {
        setScanError(`Book with ISBN ${isbn} not found. Try manual search.`)
        setPhase('scanning')
      }
    } catch {
      setScanError('Lookup failed. Check your internet and try again.')
      setPhase('scanning')
    }
  }

  function handleAdded() {
    setShelfKey(k => k + 1)   // force MyBooks to remount and re-poll immediately
    setFoundBook(null)
    setPhase('success')
    setTimeout(() => setPhase('scanning'), 3000)
  }

  function resetToScan() {
    setFoundBook(null)
    setScanError(null)
    setPhase('scanning')
  }

  function handleLogout() {
    stopScanner()
    logout()
    localStorage.removeItem('colorMode')
    document.documentElement.classList.remove('light-mode')
    setSession(null)
    setKidProfile({ themeColor: '', avatarBase64: '', bannerBase64: '', colorMode: 'dark' })
    setPhase('scanning')
    setFoundBook(null)
    setScanError(null)
  }

  // ── Not logged in ──
  if (!session) {
    return (
      <div className="scanner-view" style={{ justifyContent: 'center', gap: 0, paddingTop: 40 }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '3.8rem', filter: 'drop-shadow(0 4px 24px rgba(255,255,255,0.15))', marginBottom: 12 }}>📚</div>
          <h1 style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #9a9a9a 50%, #ffffff 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontSize: 'clamp(2rem, 7vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, margin: '0 0 8px',
          }}>Reading Tracker</h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0 0 20px' }}>Track books · Earn XP · Level up 🚀</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['📖 Personal Shelf', '🤖 AI Grading', '🧙 XP & Levels', '📊 Analytics'].map(f => (
              <span key={f} style={{
                background: '#141414', border: '1px solid #2a2a2a', borderRadius: 20,
                padding: '4px 12px', fontSize: '0.72rem', color: '#6b7280',
              }}>{f}</span>
            ))}
          </div>
        </div>

        {/* Auth card */}
        <div style={{
          background: '#141414',
          border: '1px solid #2a2a2a', borderRadius: 18, padding: '28px 24px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          width: '100%', maxWidth: 400,
        }}>
          <AuthForm onAuth={s => setSession(s)} />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 24, marginTop: 24, justifyContent: 'center' }}>
          <a href="/kiosk" style={{ color: '#374151', fontSize: '0.8rem', textDecoration: 'none' }}>📺 View Kiosk</a>
          <a href="/setup" style={{ color: '#374151', fontSize: '0.8rem', textDecoration: 'none' }}>New family? Sign up →</a>
        </div>
      </div>
    )
  }

  // ── Profile setup needed (profile was lost during quota exceeded) ──
  if (session?.needsProfileSetup) {
    return (
      <div className="scanner-view">
        <ProfileSetupModal session={session} onDone={updated => setSession(updated)} />
      </div>
    )
  }

  const themeColor = kidProfile.themeColor || '#2563eb'

  // ── Logged in ──
  return (
    <div className="scanner-view"
      style={{ paddingBottom: session?.isAdmin ? 20 : 84 }}
      onTouchStart={!session?.isAdmin ? handleTouchStart : undefined}
      onTouchEnd={!session?.isAdmin ? handleTouchEnd : undefined}>

      {/* Modals */}
      {showStyleModal && !session.isAdmin && (
        <StyleModal
          session={session}
          profile={kidProfile}
          onSaved={updates => {
            setKidProfile(p => ({ ...p, ...updates }))
            if (updates.name) setSession(s => ({ ...s, name: updates.name }))
          }}
          onClose={() => setShowStyleModal(false)}
        />
      )}
      {showChangePassword && <ChangePasswordModal session={session} onClose={() => setShowChangePassword(false)} />}
      {showCoinAnim && <CoinAnimation onDone={() => setShowCoinAnim(false)} />}

      {/* ── Kid profile header — always visible ── */}
      {!session.isAdmin && (
        <>
          {kidProfile.bannerBase64 ? (
            <div style={{ width: 'calc(100% + 32px)', marginTop: -20, marginLeft: -16, height: 110, overflow: 'hidden', position: 'relative', alignSelf: 'stretch', flexShrink: 0 }}>
              <img src={kidProfile.bannerBase64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,10,10,0) 40%, rgba(10,10,10,0.85) 100%)' }} />
            </div>
          ) : kidProfile.themeColor ? (
            <div style={{ width: 'calc(100% + 32px)', marginTop: -20, marginLeft: -16, height: 5, background: `linear-gradient(90deg, ${themeColor}, ${themeColor}88)`, alignSelf: 'stretch', flexShrink: 0 }} />
          ) : null}

          <div style={{ width: '100%', maxWidth: 480, marginBottom: 10, marginTop: kidProfile.bannerBase64 ? -28 : 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              {kidProfile.avatarBase64
                ? <img src={kidProfile.avatarBase64} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${themeColor}`, flexShrink: 0, background: '#0a0a0a' }} />
                : <div style={{ width: 60, height: 60, borderRadius: '50%', background: themeColor + '33', border: `3px solid ${themeColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>{session.emoji || '📚'}</div>
              }
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                <h1 style={{ margin: '0 0 5px', fontSize: '1rem', color: themeColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session.name}'s Shelf
                </h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => setShowStyleModal(true)}
                    style={{ background: themeColor, color: '#fff', border: 'none', borderRadius: 7, padding: '4px 11px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    ✏️ Edit
                  </button>
                  <BalanceBadge readerId={session.readerId} familyId={session.familyId} refreshKey={balanceKey} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0, paddingBottom: 2 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => setShowChangePassword(true)}>🔐</button>
                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={handleLogout}>Out</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Admin header ── */}
      {session.isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 480, marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem' }}>
            {session.emoji} {session.name}'s Shelf
            <span style={{ fontSize: '0.65rem', color: '#ffffff', marginLeft: 8, verticalAlign: 'middle', background: '#1e1e1e', padding: '2px 6px', borderRadius: 4 }}>ADMIN</span>
          </h1>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <a href="/admin" className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem', textDecoration: 'none' }}>⚙️ Admin</a>
            <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setShowChangePassword(true)}>🔐</button>
            <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} onClick={handleLogout}>Log Out</button>
          </div>
        </div>
      )}

      {/* ── SCAN TAB ── */}
      {(activeTab === 'scan' || session.isAdmin) && (
        <>
          <p className="subtitle" style={{ marginBottom: 8 }}>Point camera at the barcode on the back of the book</p>

          <div className="video-wrap" style={{ display: (phase === 'scanning' || phase === 'loading') ? 'block' : 'none' }}>
            <video ref={videoRef} muted playsInline />
            <div className="scan-overlay">
              {phase === 'loading' ? (
                <div style={{ background: 'rgba(0,0,0,0.7)', padding: '12px 24px', borderRadius: 8, color: '#e5e5e5' }}>Looking up book…</div>
              ) : (
                <div className="scan-frame"><div className="scan-line" /></div>
              )}
            </div>
          </div>

          {scanError && <div className="error-banner" style={{ maxWidth: 480, width: '100%' }}>{scanError}</div>}

          {phase === 'success' && (
            <div className="success-banner" style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
              ✅ Book added to your shelf! The TV will update automatically.
            </div>
          )}

          {phase === 'found' && foundBook && (
            <BookDetailCard book={foundBook} onAdd={handleAdded} onCancel={resetToScan} />
          )}

          {phase === 'manual' && (
            <ManualSearch onFound={book => { setFoundBook(withReader(book)); setPhase('found') }} onCancel={resetToScan} />
          )}

          {(phase === 'scanning' || phase === 'loading') && (
            <button className="btn btn-secondary mt-16" style={{ maxWidth: 480, width: '100%' }}
              onClick={() => { stopScanner(); setPhase('manual') }}>
              🔍 Search by title instead
            </button>
          )}

          {/* Notification opt-in card */}
          {!notifDismissed && notifPerm !== 'granted' && (() => {
            const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
            const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
            if (notifPerm === 'unsupported' && isIOS && !isStandalone) {
              return (
                <div style={{ width: '100%', maxWidth: 480, background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>📲</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#e5e5e5', fontSize: '0.85rem', fontWeight: 600, marginBottom: 3 }}>Install app for notifications</div>
                    <div style={{ color: '#6b7280', fontSize: '0.78rem', lineHeight: 1.5 }}>Tap <strong style={{ color: '#e5e5e5' }}>Share</strong> then <strong style={{ color: '#e5e5e5' }}>Add to Home Screen</strong> in Safari.</div>
                  </div>
                  <button onClick={() => { setNotifDismissed(true); localStorage.setItem('notifCardDismissed', '1') }}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1rem', flexShrink: 0, padding: 0, lineHeight: 1 }}>✕</button>
                </div>
              )
            }
            if (notifPerm === 'denied') {
              return (
                <div style={{ width: '100%', maxWidth: 480, background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>🔕</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#e5e5e5', fontSize: '0.85rem', fontWeight: 600, marginBottom: 3 }}>Notifications are blocked</div>
                    <div style={{ color: '#6b7280', fontSize: '0.78rem', lineHeight: 1.5 }}>Open browser settings → Notifications → Allow for this site.</div>
                  </div>
                  <button onClick={() => { setNotifDismissed(true); localStorage.setItem('notifCardDismissed', '1') }}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1rem', flexShrink: 0, padding: 0, lineHeight: 1 }}>✕</button>
                </div>
              )
            }
            if (notifPerm === 'default') {
              return (
                <div className="lm-card" style={{ width: '100%', maxWidth: 480, background: '#141414', border: '1px solid #2563EB', borderRadius: 10, padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>🔔</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#e5e5e5', fontSize: '0.85rem', fontWeight: 600, marginBottom: 2 }}>Get notified instantly</div>
                    <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>Know when your grade is ready or admin sends feedback.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                      onClick={async () => {
                        const perm = await requestPushPermission(session.readerId)
                        setNotifPerm(perm)
                        if (perm === 'granted') { setNotifDismissed(true); localStorage.setItem('notifCardDismissed', '1') }
                      }}>
                      Enable
                    </button>
                    <button onClick={() => { setNotifDismissed(true); localStorage.setItem('notifCardDismissed', '1') }}
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1rem', padding: '0 2px', lineHeight: 1 }}>✕</button>
                  </div>
                </div>
              )
            }
            return null
          })()}
        </>
      )}

      {/* ── SHELF TAB ── */}
      {(activeTab === 'shelf' || session.isAdmin) && (
        <>
          <MyBooks key={shelfKey} readerId={session.readerId} onBookCredited={() => setBalanceKey(k => k + 1)} />
          <BuddyChatsSection />
        </>
      )}

      {/* ── LEARN TAB ── */}
      {!session.isAdmin && activeTab === 'learn' && (
        <LearnView readerId={session.readerId} />
      )}

      {/* ── REWARDS TAB ── */}
      {!session.isAdmin && activeTab === 'rewards' && (
        <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 14, padding: '20px 16px', textAlign: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>💰</div>
            <div style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: 6 }}>Your balance</div>
            <BalanceBadge readerId={session.readerId} familyId={session.familyId} refreshKey={balanceKey} />
          </div>

          <a href="/chores" className="lm-card" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0a100a', border: '1px solid #14532d', borderRadius: 12, padding: '14px 16px', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.6rem' }}>🧹</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e5e5e5', fontSize: '0.9rem', fontWeight: 700 }}>My Chores</div>
              <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>Log chores · Earn rewards</div>
            </div>
            <span style={{ color: '#22c55e' }}>→</span>
          </a>

          <a href="/leaderboard" className="lm-card" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0a100a', border: '1px solid #14532d', borderRadius: 12, padding: '14px 16px', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.6rem' }}>🏆</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e5e5e5', fontSize: '0.9rem', fontWeight: 700 }}>Leaderboard</div>
              <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>Family rankings</div>
            </div>
            <span style={{ color: '#22c55e' }}>→</span>
          </a>

          <a href="/test" className="lm-card" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0f172a', border: '1px solid #1d4ed8', borderRadius: 12, padding: '14px 16px', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.6rem' }}>🧠</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e5e5e5', fontSize: '0.9rem', fontWeight: 700 }}>Take a Test</div>
              <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>Math · Science · Geography · History</div>
            </div>
            <span style={{ color: '#3b82f6' }}>→</span>
          </a>

          <a href="/worksheet" className="lm-card" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0a1a0a', border: '1px solid #166534', borderRadius: 12, padding: '14px 16px', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.6rem' }}>📝</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e5e5e5', fontSize: '0.9rem', fontWeight: 700 }}>Math Worksheet</div>
              <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>20 problems · Grade K–12</div>
            </div>
            <span style={{ color: '#22c55e' }}>→</span>
          </a>
        </div>
      )}

      {/* ── PROFILE TAB ── */}
      {!session.isAdmin && activeTab === 'profile' && (
        <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <a href={`/kiosk?family=${encodeURIComponent(session.familyId || '')}`}
            style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', marginBottom: 10 }}>
            <span style={{ fontSize: '1.6rem' }}>📺</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e5e5e5', fontSize: '0.9rem', fontWeight: 700 }}>View Kiosk</div>
              <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>Family bookshelf for TV display</div>
            </div>
            <span style={{ color: '#6b7280' }}>→</span>
          </a>
        </div>
      )}

      {/* ── Bottom tab bar (kids only) ── */}
      {!session.isAdmin && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'var(--bg-card, #141414)', borderTop: '1px solid #1e1e1e',
          display: 'flex', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          {[
            { key: 'scan',    icon: '📷', label: 'Scan' },
            { key: 'shelf',   icon: '📚', label: 'Shelf' },
            { key: 'learn',   icon: '📐', label: 'Learn' },
            { key: 'rewards', icon: '🏆', label: 'Rewards' },
            { key: 'profile', icon: '👤', label: 'Profile' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, background: 'none', border: 'none', padding: '10px 4px 12px',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                color: activeTab === tab.key ? themeColor : '#6b7280',
                transition: 'color 0.15s', position: 'relative',
              }}>
              <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>{tab.icon}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: activeTab === tab.key ? 700 : 400, letterSpacing: '0.02em' }}>{tab.label}</span>
              {activeTab === tab.key && (
                <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 32, height: 2, background: themeColor, borderRadius: '0 0 2px 2px' }} />
              )}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
