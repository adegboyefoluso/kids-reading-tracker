const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const KEY = (process.env.VITE_FIREBASE_API_KEY || '').replace(/^﻿/, '').trim()
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const AUTH = 'https://identitytoolkit.googleapis.com/v1'

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
    else if ('integerValue' in v) result[k] = parseInt(v.integerValue)
    else if ('doubleValue' in v) result[k] = v.doubleValue
    else if ('booleanValue' in v) result[k] = v.booleanValue
    else if ('nullValue' in v) result[k] = null
  }
  return result
}

function friendlyError(msg = '') {
  if (msg.includes('EMAIL_EXISTS')) return 'An account with this email already exists'
  if (msg.includes('INVALID_EMAIL')) return 'Invalid email address'
  if (msg.includes('WEAK_PASSWORD')) return 'Password must be at least 6 characters'
  if (msg.includes('EMAIL_NOT_FOUND')) return 'No account found with this email'
  if (msg.includes('INVALID_PASSWORD') || msg.includes('INVALID_LOGIN_CREDENTIALS')) return 'Incorrect email or password'
  if (msg.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) return 'Too many attempts — try again later'
  if (msg.includes('USER_DISABLED')) return 'This account has been disabled'
  if (msg.includes('CREDENTIAL_TOO_OLD')) return 'Session expired — please log in again'
  return msg || 'An error occurred'
}

async function saveReaderProfile(localId, fields) {
  try {
    await fetch(`${FS}/readers/${localId}?key=${KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFS(fields) }),
    })
  } catch {} // never block login/signup on profile save failure
}

async function saveFamily(familyId, fields) {
  try {
    await fetch(`${FS}/families/${familyId}?key=${KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFS(fields) }),
    })
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, email, password, name, emoji, idToken, newPassword } = req.body || {}

  try {
    // ── Sign up — always creates a new family, always admin ────────────────
    if (action === 'signup') {
      if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name are required' })

      const authRes = await fetch(`${AUTH}/accounts:signUp?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      })
      const authData = await authRes.json()
      if (!authRes.ok) return res.status(400).json({ error: friendlyError(authData.error?.message) })

      const { localId, idToken: token, refreshToken } = authData

      // Every public signup creates a new family and becomes its admin
      const familyId = crypto.randomUUID()

      await saveReaderProfile(localId, {
        name, email, emoji: emoji || '📚',
        isAdmin: true, familyId,
        createdAt: new Date().toISOString(),
      })
      await saveFamily(familyId, {
        adminId: localId, createdAt: new Date().toISOString(),
      })

      return res.status(200).json({
        readerId: localId, name, email,
        emoji: emoji || '📚', isAdmin: true, familyId,
        idToken: token, refreshToken,
      })
    }

    // ── Sign in ────────────────────────────────────────────────────────────
    if (action === 'login') {
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

      const authRes = await fetch(`${AUTH}/accounts:signInWithPassword?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      })
      const authData = await authRes.json()
      if (!authRes.ok) return res.status(401).json({ error: friendlyError(authData.error?.message) })

      const { localId, idToken: token, refreshToken } = authData

      const profileRes = await fetch(`${FS}/readers/${localId}?key=${KEY}`)
      const profileDoc = await profileRes.json()

      let profile = { name: email.split('@')[0], emoji: '📚', isAdmin: false, familyId: null }
      let needsProfileSetup = false
      let needsMigration = false

      if (profileDoc.fields) {
        const r = fromFS(profileDoc)
        profile = {
          name:     r.name     || profile.name,
          emoji:    r.emoji    || profile.emoji,
          isAdmin:  Boolean(r.isAdmin),
          familyId: r.familyId || null,
        }
      } else {
        // Profile missing — recreate it
        needsProfileSetup = true
        await saveReaderProfile(localId, {
          name: profile.name, email, emoji: profile.emoji,
          isAdmin: profile.isAdmin, createdAt: new Date().toISOString(),
        })
      }

      // If no familyId yet (user existed before multi-family update), generate one now
      if (!profile.familyId) {
        profile.familyId = crypto.randomUUID()
        needsMigration = true
        await saveReaderProfile(localId, {
          name: profile.name, email, emoji: profile.emoji,
          isAdmin: profile.isAdmin, familyId: profile.familyId,
          createdAt: profileDoc.fields?.createdAt?.stringValue || new Date().toISOString(),
        })
        await saveFamily(profile.familyId, {
          adminId: localId, createdAt: new Date().toISOString(),
        })
      }

      return res.status(200).json({
        readerId: localId, email, ...profile,
        idToken: token, refreshToken,
        needsProfileSetup, needsMigration,
      })
    }

    // ── Forgot password ────────────────────────────────────────────────────
    if (action === 'reset-password') {
      if (!email) return res.status(400).json({ error: 'Email is required' })

      const authRes = await fetch(`${AUTH}/accounts:sendOobCode?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
      })
      const authData = await authRes.json()
      if (!authRes.ok) return res.status(400).json({ error: friendlyError(authData.error?.message) })
      return res.status(200).json({ ok: true })
    }

    // ── Change password ────────────────────────────────────────────────────
    if (action === 'change-password') {
      if (!idToken || !newPassword) return res.status(400).json({ error: 'Token and new password are required' })

      const authRes = await fetch(`${AUTH}/accounts:update?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, password: newPassword, returnSecureToken: true }),
      })
      const authData = await authRes.json()
      if (!authRes.ok) return res.status(400).json({ error: friendlyError(authData.error?.message) })
      return res.status(200).json({ idToken: authData.idToken, refreshToken: authData.refreshToken })
    }

    // ── Join Family (co-admin via invite code) ────────────────────────────
    if (action === 'join-family') {
      const { email: je, password: jp, name: jn, emoji: jm, inviteCode } = req.body || {}
      if (!je || !jp || !jn || !inviteCode) {
        return res.status(400).json({ error: 'Email, password, name and invite code are required' })
      }

      // 1. Validate invite directly from Firestore
      const invRes = await fetch(`${FS}/invites/${inviteCode}?key=${KEY}`)
      if (invRes.status === 404) return res.status(404).json({ error: 'Invite code not found. Check the link and try again.' })
      const invDoc  = await invRes.json()
      const invF    = invDoc.fields || {}
      const invFamilyId  = invF.familyId?.stringValue
      const invAdminName = invF.adminName?.stringValue || ''
      const invExpiresAt = invF.expiresAt?.stringValue
      const invUsed      = invF.used?.booleanValue ?? false

      if (invUsed) return res.status(410).json({ error: 'This invite link has already been used.' })
      if (invExpiresAt && new Date(invExpiresAt) < new Date()) {
        return res.status(410).json({ error: 'This invite link has expired. Ask the admin to generate a new one.' })
      }
      if (!invFamilyId) return res.status(400).json({ error: 'Invalid invite code.' })

      // 2. Create Firebase auth account
      const authRes = await fetch(`${AUTH}/accounts:signUp?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: je, password: jp, returnSecureToken: true }),
      })
      const authData = await authRes.json()
      if (!authRes.ok) return res.status(400).json({ error: friendlyError(authData.error?.message) })

      const { localId, idToken: token, refreshToken } = authData

      // 3. Save profile — same familyId, isAdmin: true
      await saveReaderProfile(localId, {
        name: jn, email: je, emoji: jm || '📚',
        isAdmin: true, familyId: invFamilyId,
        createdAt: new Date().toISOString(),
      })

      // 4. Mark invite as used (non-blocking)
      fetch(`${FS}/invites/${inviteCode}?key=${KEY}&updateMask.fieldPaths=used`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { used: { booleanValue: true } } }),
      }).catch(() => {})

      return res.status(200).json({
        readerId: localId, name: jn, email: je,
        emoji: jm || '📚', isAdmin: true, familyId: invFamilyId,
        idToken: token, refreshToken,
      })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
