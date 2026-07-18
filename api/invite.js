// Invite code management — lets an admin invite another parent/guardian as co-admin
const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const KEY     = (process.env.VITE_FIREBASE_API_KEY     || '').replace(/^﻿/, '').trim()
const FS      = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

function genCode() {
  // No ambiguous characters (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!PROJECT || !KEY) return res.status(503).json({ error: 'Firebase not configured' })

  try {
    // ── POST: create invite code ───────────────────────────────────────────
    if (req.method === 'POST') {
      const { familyId, adminName } = req.body || {}
      if (!familyId) return res.status(400).json({ error: 'familyId required' })

      const code      = genCode()
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

      await fetch(`${FS}/invites/${code}?key=${KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            familyId:  { stringValue: familyId },
            adminName: { stringValue: adminName || '' },
            createdAt: { stringValue: new Date().toISOString() },
            expiresAt: { stringValue: expiresAt },
            used:      { booleanValue: false },
          },
        }),
      })

      return res.status(200).json({ code, expiresAt })
    }

    // ── GET: validate invite code ──────────────────────────────────────────
    if (req.method === 'GET') {
      const { code } = req.query
      if (!code) return res.status(400).json({ error: 'code required' })

      const r = await fetch(`${FS}/invites/${code}?key=${KEY}`)
      if (r.status === 404) return res.status(404).json({ error: 'Invite code not found. Check the link and try again.' })

      const doc = await r.json()
      const f   = doc.fields || {}

      const familyId  = f.familyId?.stringValue
      const adminName = f.adminName?.stringValue || ''
      const expiresAt = f.expiresAt?.stringValue
      const used      = f.used?.booleanValue ?? false

      if (used)      return res.status(410).json({ error: 'This invite link has already been used.' })
      if (expiresAt && new Date(expiresAt) < new Date()) {
        return res.status(410).json({ error: 'This invite link has expired. Ask the admin to generate a new one.' })
      }

      return res.status(200).json({ valid: true, familyId, adminName })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
