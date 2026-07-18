// Vercel Cron — runs daily at 09:00 UTC
// Mondays:       sends inactivity nudge if a reader hasn't added a book in 14+ days.
// Last day/month: sends payment reminder if any kid has an unpaid balance.

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

function daysAgo(isoDate) {
  if (!isoDate) return 999
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (24 * 60 * 60 * 1000))
}

function friendlyDate(isoDate) {
  if (!isoDate) return 'never'
  return new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const today     = new Date()
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const isMonday        = today.getDay() === 1
  const isLastDayOfMonth = tomorrow.getDate() === 1

  const settings = await fsQuery('settings')
  const families = settings.filter(doc => field(doc, 'adminEmail'))

  let inactivitySent = 0
  let paymentSent    = 0

  // ── Inactivity nudge (Mondays only) ──────────────────────────────────────
  if (isMonday) {
    const INACTIVITY_DAYS = 14

    for (const fam of families) {
      if (field(fam, 'notifyInactivity') === false) continue
      const adminEmail = field(fam, 'adminEmail')
      const docId      = fam.name?.split('/').pop() || ''
      const familyId   = field(fam, 'familyId') || (docId.endsWith('_goals') ? docId.slice(0, -6) : null)
      if (!familyId || !adminEmail) continue

      const books = await fsQuery('books', [
        { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } },
      ])

      const readerLatest = {}
      books.forEach(doc => {
        const rName   = field(doc, 'readerName') || 'Unknown'
        const emoji   = field(doc, 'readerEmoji') || '📚'
        const addedAt = field(doc, 'addedAt') || ''
        const title   = field(doc, 'title') || 'Untitled'
        const author  = field(doc, 'author') || ''
        if (!readerLatest[rName] || addedAt > (readerLatest[rName].addedAt || '')) {
          readerLatest[rName] = { emoji, addedAt, title, author }
        }
      })

      const inactive = Object.entries(readerLatest).filter(([, r]) => daysAgo(r.addedAt) >= INACTIVITY_DAYS)
      if (inactive.length === 0) continue

      const rows = inactive.map(([name, r]) => {
        const days = daysAgo(r.addedAt)
        return `<div class="reader-card">
          <div class="reader-name">${r.emoji} ${name}</div>
          <div style="font-size:13px;color:#6b7280">
            Last activity: <strong>${friendlyDate(r.addedAt)}</strong>
            &nbsp;<span class="tag tag-amber">${days} days ago</span>
          </div>
          ${r.title ? `<div style="font-size:12px;color:#9ca3af;margin-top:6px">Last book: <em>${r.title}${r.author ? ` by ${r.author}` : ''}</em></div>` : ''}
        </div>`
      }).join('')

      const bodyHtml = `
        <p style="font-size:15px;margin:0 0 20px">
          The following reader${inactive.length !== 1 ? 's haven\'t' : ' hasn\'t'} logged a book in <strong>${INACTIVITY_DAYS}+ days</strong>.
          A little nudge might go a long way! 📣
        </p>
        ${rows}
        <p style="font-size:13px;color:#6b7280;margin-top:20px">
          Open the app and encourage them to pick up their next book 📚
        </p>
      `
      const names   = inactive.map(([n]) => n).join(', ')
      const subject = `💤 Reading reminder — ${names} ${inactive.length === 1 ? 'hasn\'t' : 'haven\'t'} logged a book in ${INACTIVITY_DAYS}+ days`
      const result  = await sendEmail({ to: adminEmail, subject, html: emailShell('Inactivity Reminder', bodyHtml) })
      if (result.ok) inactivitySent++
    }
  }

  // ── Payment reminder (last day of month only) ─────────────────────────────
  if (isLastDayOfMonth) {
    const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    for (const fam of families) {
      const adminEmail = field(fam, 'adminEmail')
      const docId      = fam.name?.split('/').pop() || ''
      const familyId   = field(fam, 'familyId') || (docId.endsWith('_goals') ? docId.slice(0, -6) : null)
      if (!familyId || !adminEmail) continue

      // Get all non-admin readers for this family
      const readers = await fsQuery('readers', [
        { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } },
      ])

      const kids = readers
        .map(doc => ({
          id:      doc.name?.split('/').pop(),
          name:    field(doc, 'name')    || 'Unknown',
          emoji:   field(doc, 'emoji')   || '📚',
          earned:  parseFloat(field(doc, 'balance') || '0'),
          isAdmin: field(doc, 'isAdmin'),
        }))
        .filter(r => !r.isAdmin && r.earned > 0)

      // For each kid, subtract total payments made to get amount actually owed
      const unpaid = []
      for (const kid of kids) {
        const payments = await fsQuery('payments', [
          { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: kid.id } },
        ])
        const totalPaid = payments.reduce((sum, doc) => sum + (parseFloat(field(doc, 'amount')) || 0), 0)
        const owed = Math.max(0, Math.round((kid.earned - totalPaid) * 100) / 100)
        if (owed > 0) unpaid.push({ ...kid, owed })
      }

      if (unpaid.length === 0) continue

      const total = unpaid.reduce((sum, r) => sum + r.owed, 0)

      const rows = unpaid.map(r => `
        <div class="reader-card">
          <div class="reader-name">${r.emoji} ${r.name}</div>
          <div style="font-size:13px;color:#6b7280">
            Amount owed: <strong style="color:#22c55e">$${r.owed.toFixed(2)}</strong>
          </div>
        </div>
      `).join('')

      const bodyHtml = `
        <p style="font-size:15px;margin:0 0 20px">
          It's the last day of <strong>${monthLabel}</strong>! 💰 The following kids have unpaid chore earnings:
        </p>
        ${rows}
        <div style="background:#0a1a0a;border:1px solid #166534;border-radius:10px;padding:14px 18px;margin:20px 0;text-align:center">
          <div style="font-size:13px;color:#6b7280;margin-bottom:4px">Total owed this month</div>
          <div style="font-size:28px;font-weight:800;color:#22c55e">$${total.toFixed(2)}</div>
        </div>
        <p style="font-size:13px;color:#6b7280">
          Open the app, go to <strong>Admin → Payments</strong> to pay them before the month ends. 🏦
        </p>
      `

      const names   = unpaid.map(r => r.name).join(', ')
      const subject = `💰 Pay day! ${names} ${unpaid.length === 1 ? 'is' : 'are'} owed $${total.toFixed(2)} — ${monthLabel}`
      const result  = await sendEmail({ to: adminEmail, subject, html: emailShell('Payment Reminder', bodyHtml) })
      if (result.ok) paymentSent++
    }
  }

  return res.status(200).json({ ok: true, isMonday, isLastDayOfMonth, inactivitySent, paymentSent })
}
