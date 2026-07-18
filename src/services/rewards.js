const API = '/api/family'

export async function getChores(familyId) {
  const r = await fetch(`${API}?chores=${encodeURIComponent(familyId)}`)
  if (!r.ok) throw new Error('Failed to fetch chores')
  return r.json()
}

export async function setChores(familyId, chores) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set-chores', familyId, chores }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to save chores') }
  return r.json()
}

export async function logChore(payload) {
  // payload: { familyId, readerId, readerName, readerEmoji, choreId, choreName, amount }
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'log-chore', ...payload }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to log chore') }
  return r.json()
}

export async function getChoreLog(familyId) {
  const r = await fetch(`${API}?choreLog=${encodeURIComponent(familyId)}`)
  if (!r.ok) throw new Error('Failed to fetch chore log')
  return r.json()
}

export async function getChoreMonthly(familyId) {
  const r = await fetch(`${API}?choreMonthly=${encodeURIComponent(familyId)}`)
  if (!r.ok) throw new Error('Failed to fetch monthly totals')
  return r.json()
}

export async function getLeaderboard(familyId) {
  const r = await fetch(`${API}?leaderboard=${encodeURIComponent(familyId)}`)
  if (!r.ok) throw new Error('Failed to fetch leaderboard')
  return r.json()
}

export async function getLedger(readerId) {
  const r = await fetch(`${API}?ledger=${encodeURIComponent(readerId)}`)
  if (!r.ok) throw new Error('Failed to fetch ledger')
  return r.json()
}

export async function getReaderGoal(readerId) {
  const r = await fetch(`${API}?readerGoal=${encodeURIComponent(readerId)}`)
  if (!r.ok) throw new Error('Failed to fetch goal')
  return r.json()
}

export async function setReaderGoal(payload) {
  // payload: { readerId, familyId, yearlyBooks, yearlyAmount, year }
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set-reader-goal', ...payload }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to save goal') }
  return r.json()
}

export async function getTotalEarnings(readerId) {
  const r = await fetch(`${API}?totalEarnings=${encodeURIComponent(readerId)}`)
  if (!r.ok) return null
  return r.json()
}

export async function getEarningsHistory(readerId, year, month) {
  const params = new URLSearchParams({ earningsHistory: readerId })
  if (year) params.set('year', year)
  if (month) params.set('month', month)
  const r = await fetch(`${API}?${params}`)
  if (!r.ok) throw new Error('Failed to fetch earnings history')
  return r.json()
}

export async function creditBook(payload) {
  // payload: { readerId, familyId, bookId, bookTitle }
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'credit-book', ...payload }),
  })
  if (!r.ok) return { ok: false }
  return r.json()
}

export async function getPayments(familyId) {
  const r = await fetch(`${API}?payments=${encodeURIComponent(familyId)}`)
  if (!r.ok) throw new Error('Failed to fetch payments')
  return r.json()
}

export async function makePayment(payload) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'make-payment', ...payload }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Payment failed') }
  return r.json()
}

export async function backfillReaderNames(familyId) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'backfill-reader-names', familyId }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Name sync failed') }
  return r.json()
}

export async function setBalance(readerId, familyId, balance) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set-balance', readerId, familyId, balance }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to set balance') }
  return r.json()
}

export async function recalculateBalance(readerId, familyId) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'recalculate-balance', readerId, familyId }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Recalculate failed') }
  return r.json()
}

export async function backfillBookRewards(familyId) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'backfill-book-rewards', familyId }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Backfill failed') }
  return r.json()
}

export async function getReaderProfile(readerId) {
  const r = await fetch(`${API}?readerProfile=${encodeURIComponent(readerId)}`)
  if (!r.ok) return {}
  return r.json()
}

export async function updateReaderProfile(readerId, data) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update-reader-profile', readerId, ...data }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to save profile') }
  return r.json()
}

export async function setAlexaPin(familyId, pin) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set-alexa-pin', familyId, pin }),
  })
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to set PIN') }
  return r.json()
}
