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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { id, familyId } = req.query

  try {
    // ── Single-reader operations (PATCH / DELETE) when ?id= is present ──
    if (id) {
      if (req.method === 'DELETE') {
        await fetch(`${FS}/readers/${id}?key=${KEY}`, { method: 'DELETE' })
        return res.status(200).json({ ok: true })
      }

      if (req.method === 'PATCH') {
        const { name, emoji, isAdmin } = req.body || {}
        const updates = {}
        if (name    !== undefined) updates.name    = name
        if (emoji   !== undefined) updates.emoji   = emoji
        if (isAdmin !== undefined) updates.isAdmin = isAdmin
        const fields = toFS(updates)
        const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
        const r = await fetch(`${FS}/readers/${id}?key=${KEY}&${mask}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields }),
        })
        return res.status(r.status).json(await r.json())
      }

      return res.status(405).json({ error: 'Method not allowed' })
    }

    // ── List readers (GET, filtered by familyId) ─────────────────────────
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const structuredQuery = { from: [{ collectionId: 'readers' }] }
    if (familyId) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: 'familyId' },
          op: 'EQUAL',
          value: { stringValue: familyId },
        },
      }
    }

    const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
    })
    return res.status(200).json(await r.json())
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
