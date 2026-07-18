import { getSession } from './auth'

// ── Invite ─────────────────────────────────────────────────────────────────

export async function createBuddyInvite(bookTitle) {
  const session = getSession()
  if (!session?.readerId) throw new Error('Not logged in')
  const res = await fetch('/api/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'buddy-invite',
      reader1Id:       session.readerId,
      reader1Name:     session.name   || 'Reader',
      reader1Emoji:    session.emoji  || '📚',
      reader1FamilyId: session.familyId || '',
      bookTitle:       bookTitle || '',
    }),
  })
  if (!res.ok) throw new Error('Failed to create invite')
  return res.json() // { ok, code }
}

export async function getBuddyInvite(code) {
  const res = await fetch(`/api/family?buddyInvite=${encodeURIComponent(code)}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Invite not found')
  }
  return res.json() // { reader1Name, reader1Emoji, bookTitle, status, chatId }
}

export async function acceptBuddyInvite(code) {
  const session = getSession()
  if (!session?.readerId) throw new Error('Not logged in')
  const res = await fetch('/api/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action:          'buddy-accept',
      code,
      reader2Id:       session.readerId,
      reader2Name:     session.name   || 'Reader',
      reader2Emoji:    session.emoji  || '📚',
      reader2FamilyId: session.familyId || '',
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to accept invite')
  }
  return res.json() // { ok, chatId }
}

// ── Chat ───────────────────────────────────────────────────────────────────

export async function getBuddyChats() {
  const session = getSession()
  if (!session?.readerId) return []
  const res = await fetch(`/api/family?buddyChats=${encodeURIComponent(session.readerId)}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function getBuddyChatsForAdmin(familyId) {
  if (!familyId) return []
  const res = await fetch(`/api/family?buddyChatsAdmin=${encodeURIComponent(familyId)}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function getBuddyChatById(chatId) {
  const res = await fetch(`/api/family?buddyChat=${encodeURIComponent(chatId)}`)
  if (!res.ok) return null
  return res.json()
}

export async function sendBuddyMessage(chatId, msg) {
  const session = getSession()
  if (!session?.readerId) throw new Error('Not logged in')
  const res = await fetch('/api/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action:     'buddy-message',
      chatId,
      senderId:   session.readerId,
      senderName: session.name || 'Reader',
      msg,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to send message')
  }
  return res.json()
}
