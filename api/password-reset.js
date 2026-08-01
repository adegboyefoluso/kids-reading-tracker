import { sendEmail, emailShell } from './_email.js'

const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const KEY = (process.env.VITE_FIREBASE_API_KEY || '').replace(/^﻿/, '').trim()
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

function toFS(obj) {
  const fields = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) fields[k] = { nullValue: null }
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v }
    else if (typeof v === 'number') fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
    else if (typeof v === 'string') fields[k] = { stringValue: v }
  }
  return fields
}

function fromFS(doc) {
  const result = { id: doc.name?.split('/').pop() }
  for (const [k, v] of Object.entries(doc.fields || {})) {
    if ('stringValue' in v) result[k] = v.stringValue
    else if ('booleanValue' in v) result[k] = v.booleanValue
    else if ('integerValue' in v) result[k] = parseInt(v.integerValue)
    else if ('doubleValue' in v) result[k] = v.doubleValue
  }
  return result
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, email, token, newPassword } = req.body || {}

  try {
    // ── Send password reset email ────────────────────────────────────
    if (action === 'send-reset-email') {
      if (!email) return res.status(400).json({ error: 'Email is required' })

      // Generate reset token (random 32-char string)
      const resetToken = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours

      // Store token in Firestore
      await fetch(`${FS}/passwordResets/${resetToken}?key=${KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: toFS({ email, expiresAt, used: false })
        })
      })

      // Send reset email via Resend
      const resetLink = `https://readershall.com/set-password?token=${resetToken}`
      const html = emailShell(
        'Reset Your Password',
        `
          <p>Hi,</p>
          <p>We received a request to reset your password. Click the button below to set a new password.</p>
          <div style="text-align:center; margin:24px 0;">
            <a href="${resetLink}" style="background:#111; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">Reset Password</a>
          </div>
          <p>Or copy this link: <a href="${resetLink}">${resetLink}</a></p>
          <p>This link expires in 24 hours.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        `
      )

      await sendEmail({ to: email, subject: 'Reset Your Password - Reading Tracker', html })
      return res.status(200).json({ ok: true, message: 'Password reset email sent' })
    }

    // ── Verify reset token ────────────────────────────────────────────
    if (action === 'verify-token') {
      if (!token) return res.status(400).json({ error: 'Token is required' })

      const tokenRes = await fetch(`${FS}/passwordResets/${token}?key=${KEY}`)
      if (!tokenRes.ok) return res.status(404).json({ error: 'Invalid or expired token' })

      const tokenDoc = fromFS(await tokenRes.json())
      const now = new Date()
      const expiresAt = new Date(tokenDoc.expiresAt)

      if (now > expiresAt) return res.status(400).json({ error: 'Token expired' })
      if (tokenDoc.used) return res.status(400).json({ error: 'Token already used' })

      return res.status(200).json({ ok: true, email: tokenDoc.email })
    }

    // ── Reset password (update Firebase Auth) ──────────────────────────
    if (action === 'reset-password') {
      if (!token || !newPassword) return res.status(400).json({ error: 'Token and password required' })
      if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

      const tokenRes = await fetch(`${FS}/passwordResets/${token}?key=${KEY}`)
      if (!tokenRes.ok) return res.status(404).json({ error: 'Invalid token' })

      const tokenDoc = fromFS(await tokenRes.json())
      const now = new Date()
      const expiresAt = new Date(tokenDoc.expiresAt)

      if (now > expiresAt) return res.status(400).json({ error: 'Token expired' })
      if (tokenDoc.used) return res.status(400).json({ error: 'Token already used' })

      // Find user by email and reset password
      // We need to use Firebase REST API to reset password
      // First, we need to get the user's ID by querying readers by email
      const readersRes = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'readers' }],
            where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: tokenDoc.email } } },
            limit: 1
          }
        })
      })

      const readersData = await readersRes.json()
      const reader = readersData[0]?.document ? fromFS(readersData[0].document) : null

      if (!reader) return res.status(404).json({ error: 'User not found' })

      // Update Firebase Auth password using the user ID as uid
      const AUTH = 'https://identitytoolkit.googleapis.com/v1'
      const authRes = await fetch(`${AUTH}/accounts:update?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localId: reader.id,
          password: newPassword,
          returnSecureToken: false
        })
      })

      if (!authRes.ok) {
        const authErr = await authRes.json()
        return res.status(400).json({ error: authErr.error?.message || 'Failed to reset password' })
      }

      // Mark token as used
      await fetch(`${FS}/passwordResets/${token}?key=${KEY}&updateMask.fieldPaths=used`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { used: { booleanValue: true } } })
      })

      return res.status(200).json({ ok: true, message: 'Password reset successfully' })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (e) {
    console.error('[password-reset]', e)
    return res.status(500).json({ error: e.message })
  }
}
