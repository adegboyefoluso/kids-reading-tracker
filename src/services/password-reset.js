export async function sendPasswordResetEmail(email) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send-reset-email', email }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to send reset email')
  return data
}

export async function verifyPasswordResetToken(token) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify-token', token }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Invalid token')
  return data
}

export async function resetPassword(token, newPassword) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset-password', token, newPassword }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to reset password')
  return data
}
