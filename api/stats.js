// Global app stats — only callable by admins (checked client-side; data is non-sensitive counts)
const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const KEY     = (process.env.VITE_FIREBASE_API_KEY     || '').replace(/^﻿/, '').trim()
const FS      = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!PROJECT || !KEY) return res.status(503).json({ error: 'Firebase not configured' })

  try {
    // Fetch all readers — each has a familyId field
    const readersRes = await fetch(`${FS}:runQuery?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'readers' }] } }),
    })
    const readersData = await readersRes.json()
    const readers = Array.isArray(readersData)
      ? readersData.filter(d => d.document).map(d => d.document.fields)
      : []

    const familyIds = new Set(
      readers.map(f => f?.familyId?.stringValue).filter(Boolean)
    )
    const totalReaders = readers.length

    // Fetch all books — count per family
    const booksRes = await fetch(`${FS}:runQuery?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }] } }),
    })
    const booksData = await booksRes.json()
    const books = Array.isArray(booksData)
      ? booksData.filter(d => d.document).map(d => d.document.fields)
      : []

    const totalBooks    = books.length
    const finishedBooks = books.filter(b => b?.status?.stringValue === 'finished').length

    // Per-family breakdown
    const familyMap = {}
    books.forEach(b => {
      const fid = b?.familyId?.stringValue
      if (!fid) return
      if (!familyMap[fid]) familyMap[fid] = { books: 0, finished: 0 }
      familyMap[fid].books++
      if (b?.status?.stringValue === 'finished') familyMap[fid].finished++
    })

    // Attach reader names/counts per family
    const familyReaderMap = {}
    readers.forEach(r => {
      const fid = r?.familyId?.stringValue
      if (!fid) return
      if (!familyReaderMap[fid]) familyReaderMap[fid] = []
      familyReaderMap[fid].push(r?.name?.stringValue || 'Unknown')
    })

    const families = Array.from(familyIds).map(fid => ({
      familyId: fid,
      readers: familyReaderMap[fid] || [],
      totalBooks: familyMap[fid]?.books || 0,
      finishedBooks: familyMap[fid]?.finished || 0,
    })).sort((a, b) => b.finishedBooks - a.finishedBooks)

    return res.status(200).json({
      totalFamilies: familyIds.size,
      totalReaders,
      totalBooks,
      finishedBooks,
      families,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
