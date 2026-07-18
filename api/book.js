const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const KEY = (process.env.VITE_FIREBASE_API_KEY || '').replace(/^﻿/, '').trim()
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

function fromFS(doc) {
  const result = { id: doc.name.split('/').pop() }
  for (const [k, v] of Object.entries(doc.fields || {})) {
    if ('stringValue'  in v) result[k] = v.stringValue
    else if ('integerValue' in v) result[k] = parseInt(v.integerValue)
    else if ('doubleValue'  in v) result[k] = v.doubleValue
    else if ('booleanValue' in v) result[k] = v.booleanValue
    else if ('nullValue'    in v) result[k] = null
  }
  return result
}

// Recompute a reader's balance from: (# finished books × per-book reward) + chore ledger total.
// Called whenever a finished book is deleted or un-finished, so the stored balance stays accurate.
async function recalculateBalance(readerId, familyId) {
  if (!readerId || !familyId) return
  try {
    const [booksR, ledgerR, goalR] = await Promise.all([
      fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }], where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } },
          { fieldFilter: { field: { fieldPath: 'status'   }, op: 'EQUAL', value: { stringValue: 'finished' } } },
        ] } }, limit: 500 } }) }),
      fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'ledger' }], where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } },
          { fieldFilter: { field: { fieldPath: 'type'     }, op: 'EQUAL', value: { stringValue: 'chore' } } },
        ] } }, limit: 500 } }) }),
      fetch(`${FS}/readerGoals/${readerId}?key=${KEY}`),
    ])

    const finishedBooks = booksR.ok ? (await booksR.json()).filter(d => d.document).map(d => fromFS(d.document)) : []
    const choreEntries  = ledgerR.ok ? (await ledgerR.json()).filter(d => d.document).map(d => fromFS(d.document)) : []
    const choreTotal    = choreEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)

    let bookTotal = 0
    if (goalR.ok) {
      const goal = fromFS(await goalR.json())
      const yb = parseInt(goal.yearlyBooks)  || 0
      const ya = parseFloat(goal.yearlyAmount) || 0
      if (yb && ya) bookTotal = Math.round(finishedBooks.length * Math.round((ya / yb) * 100) / 100 * 100) / 100
    }

    const newBalance = Math.round((bookTotal + choreTotal) * 100) / 100
    await fetch(`${FS}/readers/${readerId}?key=${KEY}&updateMask.fieldPaths=balance`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { balance: { doubleValue: newBalance } } }),
    })
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  try {
    // ── Fetch a single book ────────────────────────────────────────────
    if (req.method === 'GET') {
      const r = await fetch(`${FS}/books/${id}?key=${KEY}`)
      return res.status(r.status).json(await r.json())
    }

    // ── Delete a book — recalculate balance if it was finished ─────────
    if (req.method === 'DELETE') {
      // Fetch before deleting so we know the book's status and owner
      const existing = await fetch(`${FS}/books/${id}?key=${KEY}`)
      const book = existing.ok ? fromFS(await existing.json()) : null
      await fetch(`${FS}/books/${id}?key=${KEY}`, { method: 'DELETE' })
      if (book?.status === 'finished' && book?.readerId && book?.familyId) {
        await recalculateBalance(book.readerId, book.familyId)
      }
      return res.status(200).json({ ok: true })
    }

    // ── Update a book — recalculate balance if status leaves 'finished' ─
    if (req.method === 'PATCH') {
      const fields = req.body.fields || {}
      const newStatus = fields.status?.stringValue

      // Only need the old status when the patch includes a status change away from finished
      let oldBook = null
      if (newStatus && newStatus !== 'finished') {
        const existing = await fetch(`${FS}/books/${id}?key=${KEY}`)
        if (existing.ok) oldBook = fromFS(await existing.json())
      }

      const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
      const r = await fetch(`${FS}/books/${id}?key=${KEY}&${mask}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      const body = await r.json()

      // If a previously-finished book was moved to a different status, correct the balance
      if (oldBook?.status === 'finished' && oldBook?.readerId && oldBook?.familyId) {
        await recalculateBalance(oldBook.readerId, oldBook.familyId)
      }

      return res.status(r.status).json(body)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
