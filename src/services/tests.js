import { getSession } from './auth'

export async function saveTestResult({ subject, subjectLabel, difficulty, score, total, grade = '' }) {
  const session = getSession()
  if (!session) return

  const res = await fetch('/api/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action:       'save-test',
      readerId:     session.readerId  || '',
      readerName:   session.name      || '',
      readerEmoji:  session.emoji     || '📚',
      familyId:     session.familyId  || '',
      subject,
      subjectLabel,
      difficulty,
      score,
      total,
      grade,
      timestamp:    new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error('Failed to save test')
  return res.json()
}

export async function getTestsForFamily(familyId) {
  const res = await fetch(`/api/family?familyTests=${encodeURIComponent(familyId)}`)
  if (!res.ok) return []
  return res.json()
}
