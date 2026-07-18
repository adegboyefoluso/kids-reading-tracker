import { getSession } from './auth'

function fromFS(doc) {
  const result = { id: doc.name.split('/').pop() }
  for (const [k, v] of Object.entries(doc.fields || {})) {
    if ('stringValue' in v) result[k] = v.stringValue
    else if ('integerValue' in v) result[k] = parseInt(v.integerValue)
    else if ('doubleValue' in v) result[k] = v.doubleValue
    else if ('booleanValue' in v) result[k] = v.booleanValue
    else if ('nullValue' in v) result[k] = null
  }
  return result
}

export async function getReaders() {
  const session = getSession()
  const familyId = session?.familyId || ''
  const url = familyId ? `/api/readers?familyId=${encodeURIComponent(familyId)}` : '/api/readers'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (Array.isArray(data) ? data : [])
    .filter(item => item.document)
    .map(item => fromFS(item.document))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
}

// Admin creates a reader account within their family
export async function createFamilyReader({ name, emoji, email, password, grade }) {
  const session = getSession()
  if (!session?.familyId) throw new Error('No family ID found — please log out and back in')
  const res = await fetch('/api/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create-reader',
      name, emoji, email, password, grade: grade || '',
      familyId: session.familyId,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create reader')
  }
  return res.json()
}

export async function deleteReader(id) {
  const res = await fetch(`/api/readers?id=${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`)
}
