import webpush from 'web-push'

const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const KEY     = (process.env.VITE_FIREBASE_API_KEY     || '').replace(/^﻿/, '').trim()
const FS      = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

const VAPID_PUBLIC  = (process.env.VAPID_PUBLIC_KEY  || '').replace(/^﻿/, '').trim()
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').replace(/^﻿/, '').trim()
const VAPID_MAILTO  = (process.env.VAPID_MAILTO || 'mailto:admin@readingtracker.app').replace(/^﻿/, '').trim()

// ── Push helpers ──────────────────────────────────────────────────────────
function fromFSReader(doc) {
  const result = { id: doc.name?.split('/').pop() }
  for (const [k, v] of Object.entries(doc.fields || {})) {
    if ('stringValue'  in v) result[k] = v.stringValue
    else if ('booleanValue' in v) result[k] = v.booleanValue
  }
  return result
}

async function fetchReader(readerId) {
  const r = await fetch(`${FS}/readers/${readerId}?key=${KEY}`)
  if (!r.ok) return null
  return fromFSReader(await r.json())
}

async function fetchFamilyAdmins(familyId) {
  // Query on familyId only (single-field index — auto-created by Firestore)
  // then filter isAdmin client-side to avoid needing a composite index.
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'readers' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'familyId' },
          op: 'EQUAL',
          value: { stringValue: familyId },
        },
      },
    },
  }
  const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    console.error('[push] fetchFamilyAdmins HTTP', r.status, txt.slice(0, 200))
    return []
  }
  const docs = await r.json()
  const all = docs.filter(d => d.document).map(d => fromFSReader(d.document))
  const admins = all.filter(reader => reader.isAdmin === true)
  console.log(`[push] fetchFamilyAdmins familyId=${familyId} total=${all.length} admins=${admins.length}`)
  return admins
}

async function savePushSubscription(readerId, subscriptionJson) {
  const mask = 'updateMask.fieldPaths=pushSubscription'
  const r = await fetch(`${FS}/readers/${readerId}?key=${KEY}&${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { pushSubscription: { stringValue: subscriptionJson } } }),
  })
  return r.ok
}

async function sendOnePush(subscriptionJson, payload) {
  if (!subscriptionJson) return
  try {
    const sub = JSON.parse(subscriptionJson)
    if (!sub?.endpoint) return
    await webpush.sendNotification(sub, JSON.stringify(payload))
  } catch (e) {
    // 410 Gone / 404 Not Found = subscription expired — normal, not an error
    if (e.statusCode !== 410 && e.statusCode !== 404) console.error('[push]', e.statusCode, e.message)
  }
}

async function handlePushAction(req, res) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('[push] VAPID keys missing — push not configured')
    return res.status(200).json({ ok: false, reason: 'push_not_configured' })
  }
  webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE)

  const { action, readerId, familyId, subscription, type, bookTitle, readerName, bookId } = req.body || {}
  console.log(`[push] action=${action} type=${type} familyId=${familyId} readerId=${readerId} bookId=${bookId}`)

  if (action === 'subscribe') {
    if (!readerId || !subscription) return res.status(400).json({ error: 'readerId and subscription required' })
    const ok = await savePushSubscription(readerId, JSON.stringify(subscription))
    console.log(`[push] subscribe readerId=${readerId} ok=${ok}`)
    return res.status(ok ? 200 : 500).json({ ok })
  }

  if (action === 'unsubscribe') {
    if (!readerId) return res.status(400).json({ error: 'readerId required' })
    await savePushSubscription(readerId, '')
    return res.status(200).json({ ok: true })
  }

  if (action === 'notify') {
    if (!type || !familyId) return res.status(400).json({ error: 'type and familyId required' })

    if (type === 'graded' && readerId) {
      const reader = await fetchReader(readerId)
      console.log(`[push] graded reader=${reader?.id} hasSub=${!!reader?.pushSubscription} familyMatch=${reader?.familyId === familyId}`)
      if (!reader || reader.familyId !== familyId) return res.status(403).json({ error: 'Unauthorized' })
      await sendOnePush(reader.pushSubscription, {
        title: '🎯 Your summary was graded!',
        body: bookTitle ? `"${bookTitle}" has been graded — open the app to see your score!` : 'Open the app to see your grade.',
        url: '/',
        bookId: bookId || null,
        tab: 'grade',
      })
      return res.status(200).json({ ok: true })
    }

    if (type === 'submitted' || type === 'chat_to_admins') {
      const admins = await fetchFamilyAdmins(familyId)
      console.log(`[push] ${type} admins found=${admins.length} withSub=${admins.filter(a => a.pushSubscription).length}`)
      const payload = type === 'submitted'
        ? { title: `📚 ${readerName || 'A reader'} submitted a summary!`, body: bookTitle ? `"${bookTitle}" — open the admin panel to review.` : 'Open the admin panel to review.', url: '/admin', bookId: bookId || null, tab: 'grade' }
        : { title: `💬 ${readerName || 'A reader'} replied in chat`, body: bookTitle ? `"${bookTitle}" — open the admin panel to respond.` : 'Open the admin panel to respond.', url: '/admin', bookId: bookId || null, tab: 'chat' }
      await Promise.all(admins.map(a => sendOnePush(a.pushSubscription, payload)))
      return res.status(200).json({ ok: true, sent: admins.length })
    }

    if (type === 'chat_to_reader' && readerId) {
      const reader = await fetchReader(readerId)
      console.log(`[push] chat_to_reader reader=${reader?.id} hasSub=${!!reader?.pushSubscription}`)
      if (!reader || reader.familyId !== familyId) return res.status(403).json({ error: 'Unauthorized' })
      await sendOnePush(reader.pushSubscription, {
        title: '💬 New message from your admin',
        body: bookTitle ? `"${bookTitle}" — open the app to read and reply.` : 'Open the app to read and reply.',
        url: '/',
        bookId: bookId || null,
        tab: 'chat',
      })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown notify type' })
  }

  return res.status(400).json({ error: 'Unknown push action' })
}

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── Push actions (subscribe / unsubscribe / notify) ──────────────────
  const bodyAction = req.body?.action
  if (req.method === 'POST' && (bodyAction === 'subscribe' || bodyAction === 'unsubscribe' || bodyAction === 'notify')) {
    return handlePushAction(req, res)
  }

  // ── Goals / notification settings ────────────────────────────────────
  const familyId = req.query.familyId || (req.body && req.body.familyId) || null
  const docName  = familyId ? `${familyId}_goals` : 'goals'

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${FS}/settings/${docName}?key=${KEY}`)
      if (r.status === 404) return res.status(200).json({ yearly: 20, adminEmail: '', notifyWeekly: true, notifyInactivity: true, notifyMilestones: true })
      const doc = await r.json()
      const f = doc.fields || {}
      return res.status(200).json({
        yearly:            parseInt(f.yearly?.integerValue || '20'),
        adminEmail:        f.adminEmail?.stringValue        || '',
        notifyWeekly:      f.notifyWeekly?.booleanValue     ?? true,
        notifyInactivity:  f.notifyInactivity?.booleanValue ?? true,
        notifyMilestones:  f.notifyMilestones?.booleanValue ?? true,
      })
    }

    if (req.method === 'POST') {
      const { yearly, adminEmail, notifyWeekly, notifyInactivity, notifyMilestones } = req.body

      const fields = {}
      const mask   = []

      if (yearly !== undefined)           { fields.yearly           = { integerValue: String(yearly) };         mask.push('yearly') }
      if (adminEmail !== undefined)       { fields.adminEmail       = { stringValue: adminEmail };              mask.push('adminEmail') }
      if (notifyWeekly !== undefined)     { fields.notifyWeekly     = { booleanValue: !!notifyWeekly };         mask.push('notifyWeekly') }
      if (notifyInactivity !== undefined) { fields.notifyInactivity = { booleanValue: !!notifyInactivity };     mask.push('notifyInactivity') }
      if (notifyMilestones !== undefined) { fields.notifyMilestones = { booleanValue: !!notifyMilestones };     mask.push('notifyMilestones') }
      if (familyId)                       { fields.familyId         = { stringValue: familyId };               mask.push('familyId') }

      const maskQS = mask.map(f => `updateMask.fieldPaths=${f}`).join('&')
      await fetch(`${FS}/settings/${docName}?key=${KEY}&${maskQS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
