import { sendEmail, emailShell } from './_email.js'

const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const KEY     = (process.env.VITE_FIREBASE_API_KEY     || '').replace(/^﻿/, '').trim()
const FS      = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

// ── Milestone definitions (must match KioskView BADGES) ───────────────────
const MILESTONES = [
  { req: 1,   name: 'First Book!',     icon: '🌟' },
  { req: 5,   name: 'Bookworm',        icon: '📖' },
  { req: 10,  name: 'Champion Reader', icon: '🏆' },
  { req: 20,  name: 'Reading Rocket',  icon: '🚀' },
  { req: 50,  name: 'Library King',    icon: '👑' },
  { req: 100, name: 'Legend',          icon: '🌈' },
]

// ── Fire-and-forget milestone email ──────────────────────────────────────
async function checkMilestone(readerId, readerName, readerEmoji, familyId) {
  try {
    // Count finished books for this reader
    const countRes = await fetch(`${FS}:runQuery?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'books' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } },
                { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } } },
                { fieldFilter: { field: { fieldPath: 'status'   }, op: 'EQUAL', value: { stringValue: 'finished' } } },
              ],
            },
          },
          select: { fields: [{ fieldPath: '__name__' }] },
        },
      }),
    })
    const countData = await countRes.json()
    const count = Array.isArray(countData) ? countData.filter(d => d.document).length : 0

    const milestone = MILESTONES.find(m => m.req === count)
    if (!milestone) return // not a milestone number

    // Fetch admin email from goals doc
    const docName = `${familyId}_goals`
    const goalRes = await fetch(`${FS}/settings/${docName}?key=${KEY}`)
    if (!goalRes.ok) return
    const goalDoc = await goalRes.json()
    const adminEmail = goalDoc.fields?.adminEmail?.stringValue
    const notifyMilestones = goalDoc.fields?.notifyMilestones?.booleanValue ?? true
    if (!adminEmail || !notifyMilestones) return

    const bodyHtml = `
      <div style="text-align:center;padding:20px 0 28px">
        <div style="font-size:64px;margin-bottom:12px">${milestone.icon}</div>
        <div style="font-size:28px;font-weight:700;margin-bottom:8px">${readerEmoji} ${readerName}</div>
        <div style="font-size:18px;color:#374151;margin-bottom:4px">just earned the</div>
        <div style="font-size:24px;font-weight:700;color:#111;margin-bottom:4px">"${milestone.name}" badge</div>
        <div style="font-size:15px;color:#6b7280">by finishing their <strong>${count}${count === 1 ? 'st' : count === 2 ? 'nd' : count === 3 ? 'rd' : 'th'} book</strong> 🎉</div>
      </div>
      <div style="background:#f9f9f9;border-radius:8px;padding:16px;text-align:center;font-size:13px;color:#6b7280">
        Keep cheering them on — the next milestone is just a few books away!
      </div>
    `

    const result = await sendEmail({
      to: adminEmail,
      subject: `${milestone.icon} ${readerName} earned the "${milestone.name}" badge — ${count} book${count !== 1 ? 's' : ''} read!`,
      html: emailShell(`${readerName} hit a milestone!`, bodyHtml),
    })
    if (!result.ok) console.error('[milestone] email failed:', result.error)
  } catch (e) {
    console.error('[milestone]', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!PROJECT || !KEY) {
    return res.status(503).json({ error: 'Firebase credentials not configured — check VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_API_KEY in Vercel env vars' })
  }

  try {
    if (req.method === 'GET') {
      const { readerId, familyId } = req.query

      // Security: never return books without a familyId
      if (!familyId) return res.status(200).json([])

      const structuredQuery = {
        from: [{ collectionId: 'books' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'familyId' },
            op: 'EQUAL',
            value: { stringValue: familyId },
          },
        },
      }

      const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery }),
      })
      const data = await r.json()

      if (!r.ok || !Array.isArray(data)) {
        const msg = Array.isArray(data) ? 'Unexpected response' : (data?.error?.message || `Firestore error ${r.status}`)
        return res.status(r.ok ? 500 : r.status).json({ error: msg })
      }

      if (readerId) {
        return res.status(200).json(
          data.filter(item => item.document && (item.document.fields?.readerId?.stringValue || '') === readerId)
        )
      }
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const fields   = req.body?.fields || {}
      const isbn     = fields.isbn?.stringValue
      const readerId = fields.readerId?.stringValue
      const familyId = fields.familyId?.stringValue
      const status   = fields.status?.stringValue

      // Duplicate ISBN check
      if (isbn && readerId) {
        try {
          const dupQuery = {
            from: [{ collectionId: 'books' }],
            where: familyId
              ? { compositeFilter: { op: 'AND', filters: [
                    { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } },
                    { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } } },
                  ] } }
              : { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } },
          }
          const dupRes  = await fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: dupQuery }) })
          const dupData = await dupRes.json()
          if (Array.isArray(dupData) && dupData.some(item => item.document?.fields?.isbn?.stringValue === isbn)) {
            return res.status(409).json({ error: 'You have already added this book to your shelf' })
          }
        } catch {}
      }

      // Always resolve readerName from Firestore so stale client sessions don't persist old names
      let bodyToWrite = req.body
      if (readerId) {
        try {
          const rR = await fetch(`${FS}/readers/${readerId}?key=${KEY}`)
          if (rR.ok) {
            const rD = await rR.json()
            const currentName = rD.fields?.name?.stringValue
            if (currentName) bodyToWrite = { ...req.body, fields: { ...fields, readerName: { stringValue: currentName } } }
          }
        } catch {}
      }

      const r    = await fetch(`${FS}/books?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyToWrite) })
      const body = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: body.error?.message || `Firestore error ${r.status}` })

      // Fire milestone check async — don't block the response
      if (status === 'finished' && readerId && familyId) {
        const readerName  = bodyToWrite.fields?.readerName?.stringValue || 'Reader'
        const readerEmoji = fields.readerEmoji?.stringValue || '📚'
        checkMilestone(readerId, readerName, readerEmoji, familyId).catch(() => {})
      }

      return res.status(200).json(body)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
