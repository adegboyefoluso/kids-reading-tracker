const SESSION_KEY = 'readerSession'

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

function save(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  return data
}

export async function login(email, password) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  return save(data)
}

export async function signup({ email, password, name, emoji }) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signup', email, password, name, emoji }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Signup failed')
  return save(data)
}

export async function resetPassword(email) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset-password', email }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Reset failed')
  return data
}

export async function joinFamily({ email, password, name, emoji, inviteCode }) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'join-family', email, password, name, emoji, inviteCode }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Join failed')
  return save(data)
}

export async function changePassword(newPassword) {
  const session = getSession()
  if (!session?.idToken) throw new Error('Not logged in')
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'change-password', idToken: session.idToken, newPassword }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Password change failed')
  save({ ...session, idToken: data.idToken, refreshToken: data.refreshToken })
}
