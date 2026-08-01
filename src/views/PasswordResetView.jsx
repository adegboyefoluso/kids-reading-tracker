import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function PasswordResetView() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const email = searchParams.get('email')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [userEmail, setUserEmail] = useState(email || '')

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setError('No reset token provided')
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify-token', token })
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Invalid or expired token')
        } else {
          setUserEmail(data.email)
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    verifyToken()
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!password || !confirmPassword) {
      setError('Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password', token, newPassword: password })
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to reset password')
      } else {
        setSuccess(true)
        setTimeout(() => navigate('/login'), 3000)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f5' }}>
        <div style={{ textAlign: 'center' }}>
          <p>Verifying reset link...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f5', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', maxWidth: '400px', width: '100%', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#111' }}>Set Your Password</h1>
        <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>Create a secure password for your account</p>

        {error && (
          <div style={{ background: '#fee', border: '1px solid #fcc', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#c33', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: '#efe', border: '1px solid #cfc', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#3c3', fontSize: '14px' }}>
            ✓ Password set successfully! Redirecting to login...
          </div>
        )}

        {userEmail && (
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
            Email: <strong>{userEmail}</strong>
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600', color: '#111' }}>
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600', color: '#111' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '12px',
              background: submitting ? '#ccc' : '#111',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {submitting ? 'Setting password...' : 'Set Password'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: '#999', marginTop: '16px' }}>
          Back to <a href="/login" style={{ color: '#111', textDecoration: 'none', fontWeight: '600' }}>login</a>
        </p>
      </div>
    </div>
  )
}
