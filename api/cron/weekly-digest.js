// Vercel Cron — runs every Sunday at 08:00 UTC
// Sends each family admin their own digest of their readers' activity for the past 7 days.

import { sendEmail, emailShell } from '../_email.js'

const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const KEY     = (process.env.VITE_FIREBASE_API_KEY     || '').replace(/^﻿/, '').trim()
const FS      = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

async function fsQuery(collectionId, filters = []) {
  const where = filters.length === 1
    ? { fieldFilter: filters[0] }
    : filters.length > 1
      ? { compositeFilter: { op: 'AND', filters: filters.map(f => ({ fieldFilter: f })) } }
      : undefined
  const structuredQuery = { from: [{ collectionId }], ...(where ? { where } : {}) }
  const res = await fetch(`${FS}:runQuery?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  })
  const data = await res.json()
  return Array.isArray(data) ? data.filter(d => d.document).map(d => d.document) : []
}

function field(doc, key) {
  const f = doc.fields?.[key]
  if (!f) return undefined
  return f.stringValue ?? f.integerValue ?? f.booleanValue ?? null
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Load all settings docs — find families with a notification email set
  const settings = await fsQuery('settings')
  const families = settings.filter(doc => {
    const email   = field(doc, 'adminEmail')
    const enabled = field(doc, 'notifyWeekly')
    return email && enabled !== false
  })

  let sent = 0

  for (const fam of families) {
    const adminEmail = field(fam, 'adminEmail')
    // familyId is stored explicitly, but can also be derived from the doc name ({familyId}_goals)
    const docId    = fam.name?.split('/').pop() || ''
    const familyId = field(fam, 'familyId') || (docId.endsWith('_goals') ? docId.slice(0, -6) : null)
    if (!familyId || !adminEmail) continue

    // Fetch this family's books
    const books = await fsQuery('books', [
      { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } },
    ])

    // Build per-reader summary
    const readerMap = {}
    books.forEach(doc => {
      const rName   = field(doc, 'readerName')  || 'Unknown'
      const emoji   = field(doc, 'readerEmoji') || '📚'
      const status  = field(doc, 'status')
      const addedAt = field(doc, 'addedAt')     || ''
      const title   = field(doc, 'title')       || 'Untitled'
      const author  = field(doc, 'author')      || ''

      if (!readerMap[rName]) readerMap[rName] = { emoji, thisWeek: [], reading: [], totalFinished: 0 }
      if (status === 'finished') readerMap[rName].totalFinished++
      if (status === 'reading')  readerMap[rName].reading.push(title)
      if (addedAt >= weekAgoISO) readerMap[rName].thisWeek.push({ title, author, status })
    })

    const readers = Object.entries(readerMap)
    if (readers.length === 0) continue

    const totalThisWeek = readers.reduce((n, [, r]) => n + r.thisWeek.length, 0)

    // Build email HTML
    const readerCards = readers.map(([name, r]) => {
      const bookRows = r.thisWeek.length > 0
        ? r.thisWeek.map(b =>
            `<div class="book-row">
               📖 <strong>${b.title}</strong>${b.author ? ` <span style="color:#6b7280">by ${b.author}</span>` : ''}
               &nbsp;<span class="tag ${b.status === 'finished' ? 'tag-green' : 'tag-amber'}">${b.status === 'finished' ? '✅ Finished' : '📖 Reading'}</span>
             </div>`).join('')
        : `<div style="color:#9ca3af;font-size:13px;padding:4px 0">No books logged this week 😴</div>`

      return `<div class="reader-card">
        <div class="reader-name">${r.emoji} ${name}
          <span style="font-size:12px;font-weight:400;color:#6b7280;margin-left:8px">${r.totalFinished} books all-time</span>
        </div>
        ${bookRows}
        ${r.reading.length > 0 ? `<div style="margin-top:8px;font-size:12px;color:#6b7280">Currently reading: <em>${r.reading.join(', ')}</em></div>` : ''}
      </div>`
    }).join('')

    const bodyHtml = `
      <p style="font-size:15px;margin:0 0 20px">Here's your family's reading activity for the past 7 days.</p>
      <div style="margin-bottom:24px">
        <div class="stat"><div class="n">${totalThisWeek}</div><div class="l">Books This Week</div></div>
        <div class="stat"><div class="n">${readers.length}</div><div class="l">Readers</div></div>
      </div>
      <hr class="divider"/>
      ${readerCards}
      <p style="font-size:13px;color:#6b7280;margin-top:20px">Keep up the great reading! 🌟</p>
    `

    const subject = totalThisWeek > 0
      ? `📚 Weekly Digest — ${totalThisWeek} book${totalThisWeek !== 1 ? 's' : ''} logged this week`
      : `📚 Weekly Digest — No books logged this week`

    const result = await sendEmail({ to: adminEmail, subject, html: emailShell('Weekly Reading Digest', bodyHtml) })
    if (!result.ok) console.error('[weekly-digest] send failed:', result.error)
    if (result.ok) sent++
  }

  return res.status(200).json({ ok: true, familiesProcessed: families.length, emailsSent: sent })
}
