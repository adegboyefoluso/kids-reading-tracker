// All calls go through /api/* (Vercel serverless) — avoids phone network blocks on Firestore
import { getSession } from './auth'

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
  const result = { id: doc.name.split('/').pop() }
  for (const [k, v] of Object.entries(doc.fields || {})) {
    if ('stringValue' in v)      result[k] = v.stringValue
    else if ('integerValue' in v) result[k] = parseInt(v.integerValue)
    else if ('doubleValue' in v)  result[k] = v.doubleValue
    else if ('booleanValue' in v) result[k] = v.booleanValue
    else if ('nullValue' in v)    result[k] = null
    else if ('timestampValue' in v) result[k] = { seconds: Math.floor(new Date(v.timestampValue).getTime() / 1000) }
  }
  return result
}

// familyIdOverride is used by kiosk (no session) — pass undefined to use session
async function getBooks(readerId, familyIdOverride) {
  const session = getSession()
  const familyId = familyIdOverride !== undefined ? familyIdOverride : (session?.familyId || '')

  const params = new URLSearchParams()
  if (familyId) params.set('familyId', familyId)
  if (readerId) params.set('readerId', readerId)
  const url = '/api/books' + (params.toString() ? '?' + params.toString() : '')

  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  const books = (Array.isArray(data) ? data : [])
    .filter(item => item.document)
    .map(item => fromFS(item.document))
  // Sort newest-first client-side
  return books.sort((a, b) => {
    const ta = a.addedAt ? new Date(a.addedAt).getTime() : 0
    const tb = b.addedAt ? new Date(b.addedAt).getTime() : 0
    return tb - ta
  })
}

// Poll intervals — kept generous to stay within Firebase free quota
const POLL_ALL    = 3 * 60 * 1000  // 3 min for kiosk (all books)
const POLL_READER = 60 * 1000      // 1 min for personal shelf

function makeSub(fetchFn, interval, callback) {
  let timerId = null

  const poll = () => fetchFn().then(callback).catch(console.error)
  const start = () => { if (!timerId) timerId = setInterval(poll, interval) }
  const stop  = () => { clearInterval(timerId); timerId = null }

  poll()
  if (!document.hidden) start()

  const onVisibility = () => {
    if (document.hidden) { stop() } else { poll(); start() }
  }
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

// familyId optional override — used by KioskView which reads it from the URL
export function subscribeToBooks(callback, familyId) {
  return makeSub(() => getBooks(null, familyId), POLL_ALL, callback)
}

export function subscribeToBooksForReader(readerId, callback) {
  return makeSub(() => getBooks(readerId), POLL_READER, callback)
}

export async function addBook(bookData) {
  const session = getSession()
  const now = new Date().toISOString()
  const doc = {
    isbn: bookData.isbn || '',
    title: bookData.title || '',
    author: bookData.author || '',
    coverUrl: bookData.coverUrl || '',
    genre: bookData.genre || '',
    year: bookData.year || 0,
    description: bookData.description || '',  // stored at search time for grading
    status: bookData.status || 'finished',
    rating: bookData.rating || 0,
    review: bookData.review || '',
    addedAt: now,
    finishedAt: bookData.status === 'finished' ? now : '',
    readerId: bookData.readerId || '',
    readerName: bookData.readerName || '',
    readerEmoji: bookData.readerEmoji || '',
    familyId: session?.familyId || '',  // tag every book with the family
    draftReview: bookData.draftReview || '',
  }
  const res = await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFS(doc) }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Save failed: HTTP ${res.status}`)
  }
  return res.json()
}

// Fetch a single book — used for near-real-time chat polling
export async function getBook(id) {
  const res = await fetch(`/api/book?id=${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const doc = await res.json()
  return fromFS(doc)
}

export async function updateBook(id, data) {
  const fields = toFS(data)
  const res = await fetch(`/api/book?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error(`Update failed: HTTP ${res.status}`)
  return res.json()
}

export async function deleteBook(id) {
  const res = await fetch(`/api/book?id=${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`)
}

// familyId optional override — used by KioskView
export async function getGoal(familyIdOverride) {
  try {
    const session = getSession()
    const familyId = familyIdOverride !== undefined ? familyIdOverride : (session?.familyId || '')
    const url = '/api/goals' + (familyId ? `?familyId=${encodeURIComponent(familyId)}` : '')
    const res = await fetch(url)
    if (!res.ok) return { yearly: 20 }
    return res.json()
  } catch {
    return { yearly: 20 }
  }
}

export async function setGoal(yearlyTarget) {
  const session = getSession()
  const familyId = session?.familyId || ''
  const res = await fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yearly: yearlyTarget, familyId }),
  })
  if (!res.ok) throw new Error(`Goal save failed: HTTP ${res.status}`)
}

export async function saveNotificationSettings(settings) {
  const session = getSession()
  const familyId = session?.familyId || ''
  const res = await fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...settings, familyId }),
  })
  if (!res.ok) throw new Error(`Settings save failed: HTTP ${res.status}`)
}

// ── Chat & resubmission ────────────────────────────────────────────────────

// Append a message to a book's chat thread (pass currentChatJson from the loaded book)
export async function addChatMessage(bookId, currentChatJson, from, senderName, message) {
  const msgs = JSON.parse(currentChatJson || '[]')
  msgs.push({ from, name: senderName, msg: message, at: new Date().toISOString() })
  return updateBook(bookId, { chatMessages: JSON.stringify(msgs) })
}

// Admin enables / disables resubmission for a book
export async function setCanResubmit(bookId, value) {
  return updateBook(bookId, { canResubmit: value })
}

// Reader resubmits — archives current review + grade, saves new review, clears grade for regrading
export async function resubmitSummary(bookId, book, newReview) {
  const history = JSON.parse(book.reviewHistory || '[]')
  history.push({
    review:             book.review             || '',
    submittedAt:        book.submittedAt        || book.addedAt || new Date().toISOString(),
    gradeScore:         book.gradeScore         ?? null,
    gradeFeedback:      book.gradeFeedback      || '',
    gradeComprehension: book.gradeComprehension ?? null,
    gradeDetail:        book.gradeDetail        ?? null,
    gradeReflection:    book.gradeReflection    ?? null,
    gradeGrammar:       book.gradeGrammar       ?? null,
    gradeStructure:     book.gradeStructure     ?? null,
    gradeAccuracy:      book.gradeAccuracy      ?? null,
    gradeAccuracyNote:  book.gradeAccuracyNote  || '',
    gradeSuggestions:   book.gradeSuggestions   || '',
    aiDetection:        book.aiDetection        ?? 0,
  })
  return updateBook(bookId, {
    review:               newReview,
    reviewHistory:        JSON.stringify(history),
    canResubmit:          false,
    submittedAt:          new Date().toISOString(),
    // Clear grade so regrading runs on new submission
    gradeScore:           null,
    gradeFeedback:        '',
    gradeComprehension:   null,
    gradeDetail:          null,
    gradeReflection:      null,
    gradeGrammar:         null,
    gradeStructure:       null,
    gradeSuggestions:     '',
    gradeAccuracy:        null,
    gradeAccuracyNote:    '',
    gradeBookFound:       0,
    aiDetection:          0,
    aiWarning:            '',
    bookDescriptionPreview: '',
    gradeCorrections:     '',   // clear highlights so old marks don't appear on new text
  })
}

export const isConfigured = true
