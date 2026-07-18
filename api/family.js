import webpush from 'web-push'

const PROJECT = (process.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const KEY = (process.env.VITE_FIREBASE_API_KEY || '').replace(/^﻿/, '').trim()
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const AUTH = 'https://identitytoolkit.googleapis.com/v1'

const VAPID_PUBLIC  = (process.env.VAPID_PUBLIC_KEY  || '').replace(/^﻿/, '').trim()
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').replace(/^﻿/, '').trim()
const VAPID_MAILTO  = (process.env.VAPID_MAILTO || 'mailto:admin@readingtracker.app').replace(/^﻿/, '').trim()

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
  const result = { id: doc.name?.split('/').pop() }
  for (const [k, v] of Object.entries(doc.fields || {})) {
    if ('stringValue'  in v) result[k] = v.stringValue
    else if ('booleanValue' in v) result[k] = v.booleanValue
    else if ('integerValue' in v) result[k] = parseInt(v.integerValue)
    else if ('doubleValue'  in v) result[k] = v.doubleValue
  }
  return result
}

function friendlyError(msg = '') {
  if (msg.includes('EMAIL_EXISTS')) return 'An account with this email already exists'
  if (msg.includes('INVALID_EMAIL')) return 'Invalid email address'
  if (msg.includes('WEAK_PASSWORD')) return 'Password must be at least 6 characters'
  return msg || 'An error occurred'
}

// ── Chore push notification helper ────────────────────────────────────────

async function sendChoreNotification(familyId, readerName, choreName) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return
  try {
    webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE)
    const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'readers' }], where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } } } } }),
    })
    if (!r.ok) return
    const docs = await r.json()
    const admins = docs.filter(d => d.document).map(d => fromFS(d.document)).filter(rd => rd.isAdmin && rd.pushSubscription)
    const payload = JSON.stringify({ title: `🧹 ${readerName} completed a chore!`, body: `"${choreName}" — tap to approve and credit their reward.`, url: '/admin', tab: 'chores' })
    await Promise.all(admins.map(a => {
      try { return webpush.sendNotification(JSON.parse(a.pushSubscription), payload).catch(() => {}) }
      catch { return Promise.resolve() }
    }))
  } catch {}
}

// ── PG content moderation for buddy chat ──────────────────────────────────

async function moderateMessage(msg) {
  const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
  if (!GROQ_API_KEY) return { ok: true } // no key → skip (fail open)

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 4000)

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',   // fast small model — just need yes/no
        messages: [{
          role: 'user',
          content: `You are a content moderator for a children's reading app used by kids aged 6-10.
Decide if this chat message is appropriate.

BLOCK the message if it contains any of:
- Swear words, profanity, or crude insults
- Sexual or romantic content beyond a simple mention (e.g. "they kissed")
- Graphic violence describing real harm to people or animals
- Bullying, name-calling, or threats aimed at another person
- Hate speech or discrimination based on race, gender, religion, etc.
- Personal information (phone numbers, home addresses, passwords, school names)
- Instructions for dangerous, illegal, or harmful activities

ALLOW (these are fine):
- Excitement, opinions, or questions about books and stories
- Fantasy or fictional violence typical in children's literature (e.g. "Harry fought the dragon")
- Mild, contextually harmless frustration (e.g. "ugh I hate this chapter")
- Emoji, casual abbreviations, normal friendly chat
- Mild toilet humour that any 8-year-old might say

Message to review: "${msg.replace(/"/g, '\\"').slice(0, 500)}"

Reply with JSON only — nothing else:
{"ok":true} if the message is appropriate.
{"ok":false,"reason":"<short, child-friendly explanation, max 12 words>"} if it should be blocked.`,
        }],
        temperature: 0,
        max_tokens: 80,
        response_format: { type: 'json_object' },
      }),
    })
    clearTimeout(t)
    if (!r.ok) return { ok: true } // Groq error → fail open
    const data = await r.json()
    const text = data.choices?.[0]?.message?.content || '{}'
    try { return JSON.parse(text) } catch { return { ok: true } }
  } catch (e) {
    clearTimeout(t)
    return { ok: true } // timeout / network error → fail open
  }
}

// ── Buddy Chat helpers ─────────────────────────────────────────────────────

async function fsQuery(collectionId, fieldPath, value) {
  const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue: value } } },
      },
    }),
  })
  if (!r.ok) return []
  const docs = await r.json()
  return docs.filter(d => d.document).map(d => fromFS(d.document))
}

async function getBuddyChatsForReader(readerId) {
  const [asReader1, asReader2] = await Promise.all([
    fsQuery('buddy_chats', 'reader1Id', readerId),
    fsQuery('buddy_chats', 'reader2Id', readerId),
  ])
  const seen = new Set()
  return [...asReader1, ...asReader2].filter(c => !seen.has(c.id) && seen.add(c.id))
}

async function getBuddyChatsForFamily(familyId) {
  const [asFamily1, asFamily2] = await Promise.all([
    fsQuery('buddy_chats', 'reader1FamilyId', familyId),
    fsQuery('buddy_chats', 'reader2FamilyId', familyId),
  ])
  const seen = new Set()
  return [...asFamily1, ...asFamily2].filter(c => !seen.has(c.id) && seen.add(c.id))
}

// ── Alexa skill helpers ────────────────────────────────────────────────────

function alexaSpeak(text, sessionAttrs = {}, shouldEnd = false) {
  return { version: '1.0', sessionAttributes: sessionAttrs, response: { outputSpeech: { type: 'SSML', ssml: `<speak>${text}</speak>` }, shouldEndSession: shouldEnd } }
}
function alexaAsk(text, reprompt, sessionAttrs = {}) {
  return { version: '1.0', sessionAttributes: sessionAttrs, response: { outputSpeech: { type: 'SSML', ssml: `<speak>${text}</speak>` }, reprompt: { outputSpeech: { type: 'SSML', ssml: `<speak>${reprompt}</speak>` } }, shouldEndSession: false } }
}
function matchChore(chores, spoken) {
  const s = (spoken || '').toLowerCase()
  return chores.find(c => s.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(s))
}

async function handleAlexa(req, res) {
  const body = req.body || {}
  const requestType = body.request?.type
  const sessionAttrs = body.session?.attributes || {}
  try {
    if (requestType === 'LaunchRequest') return res.json(alexaAsk('Welcome to Family Rewards! Say your name to get started. For example: I am Emma.', 'Please say your name to continue.', {}))
    if (requestType === 'SessionEndedRequest') return res.json({ version: '1.0', response: {} })
    if (requestType !== 'IntentRequest') return res.json(alexaSpeak('I did not understand that. Please try again.', {}, true))

    const intentName = body.request?.intent?.name
    const slots = body.request?.intent?.slots || {}

    if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent') return res.json(alexaSpeak('Goodbye! Keep up the great work!', {}, true))
    if (intentName === 'AMAZON.HelpIntent') return res.json(alexaAsk('You can say: log a chore, check my balance, or list my chores. First say your name to sign in.', 'What would you like to do?', sessionAttrs))

    if (intentName === 'IdentifyIntent') {
      const name = slots.readerName?.value
      if (!name) return res.json(alexaAsk('Please say your name. For example: I am Emma.', 'What is your name?', sessionAttrs))
      const rQ = await fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'readers' }] } }) })
      const rDocs = await rQ.json()
      const readers = rDocs.filter(d => d.document).map(d => fromFS(d.document)).filter(rd => !rd.isAdmin)
      const spoken = name.toLowerCase().trim()
      const soundex = s => {
        if (!s) return ''
        const map = { b:1,f:1,p:1,v:1,c:2,g:2,j:2,k:2,q:2,s:2,x:2,z:2,d:3,t:3,l:4,m:5,n:5,r:6 }
        let r = s[0].toUpperCase(), prev = map[s[0]] || 0
        for (let i = 1; i < s.length && r.length < 4; i++) {
          const c = map[s[i]] || 0
          if (c && c !== prev) r += c
          prev = c
        }
        return r.padEnd(4, '0')
      }
      console.log('[alexa-identify]', spoken, readers.map(r => r.name))
      const reader = readers.find(rd => {
        const stored = rd.name?.toLowerCase().trim() || ''
        const storedFirst = stored.split(' ')[0]
        const spokenFirst = spoken.split(' ')[0]
        const sdxA = soundex(storedFirst), sdxB = soundex(spokenFirst)
        return stored === spoken ||
          stored.startsWith(spoken) ||
          spoken.startsWith(stored) ||
          sdxA.slice(0, 3) === sdxB.slice(0, 3)
      })
      if (!reader) return res.json(alexaAsk(`I could not find ${name}. Please check your name is correct.`, 'Please say your name again.', sessionAttrs))
      return res.json(alexaAsk(`Hi ${reader.name}! You are signed in. You can say: log a chore, check my balance, or list my chores.`, 'What would you like to do?', { readerId: reader.id, readerName: reader.name, readerEmoji: reader.emoji || '📚', familyId: reader.familyId }))
    }

    const { readerId, readerName, readerEmoji, familyId: alexaFamilyId } = sessionAttrs
    if (!readerId || !alexaFamilyId) return res.json(alexaAsk('You need to sign in first. Please say your name.', 'Please say your name.', sessionAttrs))

    if (intentName === 'LogChoreIntent') {
      const choreName = slots.choreName?.value
      if (!choreName) return res.json(alexaAsk('Which chore did you complete?', 'Please tell me the chore name.', sessionAttrs))
      const cQ = await fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'chores' }], where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: alexaFamilyId } } } } }) })
      const cDocs = await cQ.json()
      const chores = cDocs.filter(d => d.document).map(d => fromFS(d.document))
      const matched = matchChore(chores, choreName)
      const entryId = crypto.randomUUID()
      const entryData = matched
        ? { familyId: alexaFamilyId, readerId, readerName, readerEmoji, choreId: matched.id || '', choreName: matched.name, amount: parseFloat(matched.amount) || 0, status: 'pending', createdAt: new Date().toISOString() }
        : { familyId: alexaFamilyId, readerId, readerName, readerEmoji, choreId: '', choreName, amount: 0, status: 'pending', createdAt: new Date().toISOString() }
      await fetch(`${FS}/choreEntries/${entryId}?key=${KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: toFS(entryData) }) })
      if (matched && entryData.amount > 0) {
        const ledgerId = crypto.randomUUID()
        await fetch(`${FS}/ledger/${ledgerId}?key=${KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: toFS({ readerId, familyId: alexaFamilyId, type: 'chore', description: matched.name, amount: entryData.amount, refId: entryId, createdAt: new Date().toISOString() }) }) })
        const rR = await fetch(`${FS}/readers/${readerId}?key=${KEY}`)
        if (rR.ok) {
          const rdr = fromFS(await rR.json())
          const newBal = Math.round(((parseFloat(rdr.balance) || 0) + entryData.amount) * 100) / 100
          await fetch(`${FS}/readers/${readerId}?key=${KEY}&updateMask.fieldPaths=balance`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { balance: { doubleValue: newBal } } }) })
          return res.json(alexaSpeak(`Great job, ${readerName}! You earned $${entryData.amount.toFixed(2)} for ${matched.name}. Your balance is now $${newBal.toFixed(2)}. Keep it up!`, sessionAttrs, false))
        }
      }
      return res.json(alexaSpeak(matched ? `Great job, ${readerName}! I logged ${matched.name} for $${entryData.amount.toFixed(2)}. Keep it up!` : `Got it! I logged "${choreName}" for ${readerName}. Great work!`, sessionAttrs, false))
    }

    if (intentName === 'CheckBalanceIntent') {
      const rR = await fetch(`${FS}/readers/${readerId}?key=${KEY}`)
      if (!rR.ok) return res.json(alexaSpeak('I could not fetch your balance right now. Please try again.', sessionAttrs, false))
      const rdr = fromFS(await rR.json())
      const earned = parseFloat(rdr.balance) || 0
      // Sum all payments ever made to this reader to get amount owed
      const pQ = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'payments' }], where: { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } } } }),
      })
      let totalPaid = 0
      if (pQ.ok) {
        const pDocs = await pQ.json()
        totalPaid = pDocs.filter(d => d.document).map(d => fromFS(d.document)).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
      }
      const owed = Math.max(0, Math.round((earned - totalPaid) * 100) / 100)
      const msg = owed > 0
        ? `You are owed $${owed.toFixed(2)}, ${readerName}. Keep up the great work!`
        : `You have no outstanding balance right now, ${readerName}. Keep doing chores to earn more!`
      return res.json(alexaSpeak(msg, sessionAttrs, false))
    }

    if (intentName === 'ListChoresIntent') {
      const cQ = await fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'chores' }], where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: alexaFamilyId } } } } }) })
      const cDocs = await cQ.json()
      const chores = cDocs.filter(d => d.document).map(d => fromFS(d.document))
      if (!chores.length) return res.json(alexaSpeak('No chores have been set up yet. Ask a parent to add chores in the app.', sessionAttrs, false))
      return res.json(alexaSpeak(`Here are your family chores: ${chores.map(c => `${c.name} for $${(parseFloat(c.amount)||0).toFixed(2)}`).join(', ')}. Which one did you complete?`, sessionAttrs, false))
    }

    return res.json(alexaAsk('I did not understand that. You can say: log a chore, check my balance, or list my chores.', 'What would you like to do?', sessionAttrs))
  } catch (e) {
    console.error('[alexa]', e)
    return res.json(alexaSpeak('Sorry, something went wrong. Please try again later.', {}, true))
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── Alexa skill webhook (detected by Alexa request body structure) ────────
  if (req.body?.version && req.body?.request?.type) return handleAlexa(req, res)

  if (!PROJECT || !KEY) return res.status(503).json({ error: 'Firebase credentials not configured' })

  // ── GET: buddy invite / chat lookups ────────────────────────────────────
  if (req.method === 'GET') {
    const { buddyInvite, buddyChat, buddyChats, buddyChatsAdmin } = req.query

    // Return invite metadata (public — no auth needed)
    if (buddyInvite) {
      const r = await fetch(`${FS}/buddy_invites/${buddyInvite}?key=${KEY}`)
      if (r.status === 404) return res.status(404).json({ error: 'Invite not found or expired' })
      if (!r.ok) return res.status(500).json({ error: 'Failed to fetch invite' })
      const invite = fromFS(await r.json())
      // Expire after 7 days
      const age = Date.now() - new Date(invite.createdAt || 0).getTime()
      if (age > 7 * 24 * 60 * 60 * 1000 && invite.status !== 'accepted') {
        return res.status(410).json({ error: 'This invite link has expired (7 days)' })
      }
      return res.json({
        reader1Name: invite.reader1Name,
        reader1Emoji: invite.reader1Emoji || '📚',
        bookTitle: invite.bookTitle,
        status: invite.status,
        chatId: invite.chatId || null,
      })
    }

    // Return a single buddy chat (for polling)
    if (buddyChat) {
      const r = await fetch(`${FS}/buddy_chats/${buddyChat}?key=${KEY}`)
      if (!r.ok) return res.status(404).json({ error: 'Chat not found' })
      return res.json(fromFS(await r.json()))
    }

    // Return all buddy chats for a reader
    if (buddyChats) {
      return res.json(await getBuddyChatsForReader(buddyChats))
    }

    // Return all buddy chats visible to an admin's family
    if (buddyChatsAdmin) {
      return res.json(await getBuddyChatsForFamily(buddyChatsAdmin))
    }

    // Return chore definitions for a family
    if (req.query.chores) {
      const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'chores' }], where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: req.query.chores } } } } }),
      })
      if (!r.ok) return res.json([])
      const docs = await r.json()
      return res.json(docs.filter(d => d.document).map(d => fromFS(d.document)))
    }

    // Return today's chore log for a family
    if (req.query.choreLog) {
      const today = new Date().toISOString().split('T')[0]
      const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'choreEntries' }], where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: req.query.choreLog } } },
          { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: today + 'T00:00:00.000Z' } } },
        ] } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 200 } }),
      })
      if (!r.ok) return res.json([])
      const docs = await r.json()
      return res.json(docs.filter(d => d.document).map(d => fromFS(d.document)))
    }

    // Return monthly totals per reader (chores from ledger + books from books collection)
    if (req.query.choreMonthly) {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
      const fid = req.query.choreMonthly

      // Fetch readers, ledger chore entries, and all finished books for this family in parallel
      const [readerR, ledgerR, booksR] = await Promise.all([
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'readers' }], where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: fid } } } } }) }),
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'ledger' }], where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: fid } } },
            { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: monthStart } } },
          ] } }, limit: 500 } }) }),
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }], where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: fid } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'finished' } } },
          ] } }, limit: 500 } }) }),
      ])

      const readerMap = {}
      if (readerR.ok) (await readerR.json()).filter(d => d.document).map(d => fromFS(d.document)).filter(rd => !rd.isAdmin).forEach(rd => { readerMap[rd.id] = rd })

      const choreEntries = ledgerR.ok
        ? (await ledgerR.json()).filter(d => d.document).map(d => fromFS(d.document)).filter(e => e.type === 'chore' && e.createdAt < nextMonthStart)
        : []

      const monthFinishedBooks = booksR.ok
        ? (await booksR.json()).filter(d => d.document).map(d => fromFS(d.document)).filter(b => {
            const d = b.finishedAt || b.addedAt
            return d && d >= monthStart && d < nextMonthStart
          })
        : []

      // Fetch reading goals for readers who have finished books this month
      const bookReaderIds = [...new Set(monthFinishedBooks.map(b => b.readerId).filter(Boolean))]
      const goalMap = {}
      await Promise.all(bookReaderIds.map(async rid => {
        try {
          const gr = await fetch(`${FS}/readerGoals/${rid}?key=${KEY}`)
          if (gr.ok) {
            const gd = await gr.json()
            if (gd.fields) {
              const g = fromFS(gd)
              const yb = parseInt(g.yearlyBooks) || 0
              const ya = parseFloat(g.yearlyAmount) || 0
              goalMap[rid] = yb && ya ? Math.round((ya / yb) * 100) / 100 : 0
            }
          }
        } catch {}
      }))

      const totals = {}
      const ensureEntry = (readerId) => {
        if (!totals[readerId]) {
          const rd = readerMap[readerId] || {}
          totals[readerId] = { readerId, readerName: rd.name || readerId, readerEmoji: rd.emoji || '📚', chores: 0, choresTotal: 0, books: 0, booksTotal: 0, total: 0 }
        }
      }

      for (const e of choreEntries) {
        ensureEntry(e.readerId)
        totals[e.readerId].chores++
        totals[e.readerId].choresTotal = Math.round((totals[e.readerId].choresTotal + (parseFloat(e.amount) || 0)) * 100) / 100
      }

      for (const b of monthFinishedBooks) {
        if (!b.readerId) continue
        const perBook = goalMap[b.readerId] || 0
        ensureEntry(b.readerId)
        totals[b.readerId].books++
        totals[b.readerId].booksTotal = Math.round((totals[b.readerId].booksTotal + perBook) * 100) / 100
      }

      for (const t of Object.values(totals)) {
        t.total = Math.round((t.choresTotal + t.booksTotal) * 100) / 100
      }

      return res.json(Object.values(totals).filter(t => t.chores > 0 || t.books > 0).sort((a, b) => b.total - a.total))
    }

    // Return a kid's personal earnings history: daily breakdown of books + chores for a month
    if (req.query.earningsHistory) {
      const readerId = req.query.earningsHistory
      const now = new Date()
      const year = parseInt(req.query.year) || now.getFullYear()
      const month = parseInt(req.query.month) || (now.getMonth() + 1)
      const monthStr = `${year}-${String(month).padStart(2, '0')}`
      const monthStart = `${monthStr}-01T00:00:00.000Z`
      const ny = month === 12 ? year + 1 : year
      const nm = month === 12 ? 1 : month + 1
      const nextMonthStart = `${ny}-${String(nm).padStart(2, '0')}-01T00:00:00.000Z`

      let perBook = 0
      try {
        const gr = await fetch(`${FS}/readerGoals/${readerId}?key=${KEY}`)
        if (gr.ok) {
          const gd = await gr.json()
          if (gd.fields) {
            const g = fromFS(gd)
            const yb = parseInt(g.yearlyBooks) || 0
            const ya = parseFloat(g.yearlyAmount) || 0
            if (yb && ya) perBook = Math.round((ya / yb) * 100) / 100
          }
        }
      } catch {}

      // Fetch all finished books + this month's ledger entries in parallel
      const [booksR, ledgerR] = await Promise.all([
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }], where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'finished' } } },
          ] } }, limit: 500 } }) }),
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'ledger' }], where: { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } }, limit: 500 } }) }),
      ])

      const allFinishedBooks = booksR.ok ? (await booksR.json()).filter(d => d.document).map(d => fromFS(d.document)) : []
      const monthBooks = allFinishedBooks.filter(b => {
        const d = b.finishedAt || b.addedAt
        return d && d >= monthStart && d < nextMonthStart
      })

      const monthLedger = ledgerR.ok
        ? (await ledgerR.json()).filter(d => d.document).map(d => fromFS(d.document))
            .filter(e => e.createdAt >= monthStart && e.createdAt < nextMonthStart)
        : []

      // Build daily breakdown
      const days = {}
      for (const b of monthBooks) {
        const day = (b.finishedAt || b.addedAt || '').split('T')[0]
        if (!day) continue
        if (!days[day]) days[day] = { books: 0, bookTitles: [], chores: 0, choreNames: [] }
        days[day].books = Math.round((days[day].books + perBook) * 100) / 100
        days[day].bookTitles.push(b.title || 'Book')
      }
      for (const e of monthLedger) {
        if (e.type !== 'chore') continue
        const day = (e.createdAt || '').split('T')[0]
        if (!day) continue
        const amt = parseFloat(e.amount) || 0
        if (!days[day]) days[day] = { books: 0, bookTitles: [], chores: 0, choreNames: [] }
        days[day].chores = Math.round((days[day].chores + amt) * 100) / 100
        days[day].choreNames.push(e.description || 'Chore')
      }
      for (const day of Object.keys(days)) {
        days[day].total = Math.round((days[day].books + days[day].chores) * 100) / 100
      }

      const choreTotal = monthLedger.filter(e => e.type === 'chore').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
      return res.json({
        month: monthStr,
        perBook,
        days,
        allTimeBooks: allFinishedBooks.length,
        totals: {
          bookCount: monthBooks.length,
          books: Math.round(monthBooks.length * perBook * 100) / 100,
          chores: Math.round(choreTotal * 100) / 100,
          total: Math.round((monthBooks.length * perBook + choreTotal) * 100) / 100,
        },
      })
    }

    // Return family leaderboard (non-admin readers sorted by balance)
    if (req.query.leaderboard) {
      const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'readers' }], where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: req.query.leaderboard } } } } }),
      })
      if (!r.ok) return res.json([])
      const docs = await r.json()
      const readers = docs.filter(d => d.document).map(d => fromFS(d.document)).filter(rd => !rd.isAdmin)
      return res.json(readers.sort((a, b) => (b.balance || 0) - (a.balance || 0)).map(rd => ({
        id: rd.id, name: rd.name, emoji: rd.emoji || '📚', balance: rd.balance || 0,
      })))
    }

    // Return ledger transactions for a reader
    if (req.query.ledger) {
      const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'ledger' }], where: { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: req.query.ledger } } }, limit: 50 } }),
      })
      if (!r.ok) return res.json([])
      const docs = await r.json()
      return res.json(docs.filter(d => d.document).map(d => fromFS(d.document)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    }

    // Return per-child reading reward goal
    if (req.query.readerGoal) {
      const r = await fetch(`${FS}/readerGoals/${req.query.readerGoal}?key=${KEY}`)
      if (!r.ok) return res.json(null)
      const doc = await r.json()
      if (!doc.fields) return res.json(null)
      return res.json(fromFS(doc))
    }

    // Return test results for a single reader
    if (req.query.tests) {
      const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'tests' }],
            where: { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: req.query.tests } } },
            limit: 30,
          },
        }),
      })
      if (!r.ok) return res.json([])
      const docs = await r.json()
      return res.json(docs.filter(d => d.document).map(d => fromFS(d.document)))
    }

    // Return all test results for a family (admin view)
    if (req.query.familyTests) {
      const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'tests' }],
            where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: req.query.familyTests } } },
            limit: 100,
          },
        }),
      })
      if (!r.ok) return res.json([])
      const docs = await r.json()
      return res.json(docs.filter(d => d.document).map(d => fromFS(d.document)))
    }

    // Return all payment records for a family
    if (req.query.payments) {
      const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'payments' }], where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: req.query.payments } } }, limit: 500 } }),
      })
      if (!r.ok) return res.json([])
      const docs = await r.json()
      return res.json(docs.filter(d => d.document).map(d => fromFS(d.document)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    }

    // Return all-time earnings for a reader: all finished books × perBook + all chore ledger entries
    if (req.query.totalEarnings) {
      const readerId = req.query.totalEarnings

      let perBook = 0
      try {
        const gr = await fetch(`${FS}/readerGoals/${readerId}?key=${KEY}`)
        if (gr.ok) {
          const gd = await gr.json()
          if (gd.fields) {
            const g = fromFS(gd)
            const yb = parseInt(g.yearlyBooks)   || 0
            const ya = parseFloat(g.yearlyAmount) || 0
            if (yb && ya) perBook = Math.round((ya / yb) * 100) / 100
          }
        }
      } catch {}

      const [booksR, ledgerR] = await Promise.all([
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }], where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } },
            { fieldFilter: { field: { fieldPath: 'status' },   op: 'EQUAL', value: { stringValue: 'finished' } } },
          ] } }, limit: 1000 } }) }),
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'ledger' }], where: { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } }, limit: 1000 } }) }),
      ])

      const totalBooks  = booksR.ok  ? (await booksR.json()).filter(d => d.document).length * perBook : 0
      const choreTotal  = ledgerR.ok
        ? (await ledgerR.json()).filter(d => d.document).map(d => fromFS(d.document))
            .filter(e => e.type === 'chore')
            .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
        : 0

      return res.json({
        total:  Math.round((totalBooks + choreTotal) * 100) / 100,
        books:  Math.round(totalBooks  * 100) / 100,
        chores: Math.round(choreTotal  * 100) / 100,
        perBook,
      })
    }

    // Return a reader's visual profile (themeColor, avatarBase64, bannerBase64, balance, colorMode)
    if (req.query.readerProfile) {
      const r = await fetch(`${FS}/readers/${req.query.readerProfile}?key=${KEY}`)
      if (!r.ok) return res.json({})
      const doc = fromFS(await r.json())
      return res.json({
        themeColor:   doc.themeColor   || '',
        avatarBase64: doc.avatarBase64 || '',
        bannerBase64: doc.bannerBase64 || '',
        colorMode:    doc.colorMode    || 'dark',
        balance:      parseFloat(doc.balance) || 0,
        grade:        doc.grade        || '',
      })
    }

    return res.status(400).json({ error: 'Unknown GET query' })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, name, emoji, email, password, familyId, grade } = req.body || {}

  try {
    // ── Create a reader account within a family (admin only) ────────────────
    if (action === 'create-reader') {
      if (!name || !email || !password || !familyId)
        return res.status(400).json({ error: 'Name, email, password and familyId are required' })

      const authRes = await fetch(`${AUTH}/accounts:signUp?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      })
      const authData = await authRes.json()
      if (!authRes.ok) return res.status(400).json({ error: friendlyError(authData.error?.message) })

      const { localId } = authData

      await fetch(`${FS}/readers/${localId}?key=${KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: toFS({
            name, email,
            emoji:   emoji || '📚',
            isAdmin: false,
            familyId,
            grade:   grade || '',
            createdAt: new Date().toISOString(),
          }),
        }),
      })

      return res.status(200).json({
        id: localId, name, email,
        emoji: emoji || '📚',
        isAdmin: false, familyId,
      })
    }

    // ── One-time migration ──────────────────────────────────────────────────
    if (action === 'migrate') {
      if (!familyId) return res.status(400).json({ error: 'familyId required' })

      let booksUpdated = 0, readersUpdated = 0

      const booksRes = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }] } }),
      })
      const booksData = await booksRes.json()
      if (Array.isArray(booksData)) {
        for (const item of booksData) {
          if (!item.document) continue
          if (item.document.fields?.familyId?.stringValue) continue
          const id = item.document.name.split('/').pop()
          await fetch(`${FS}/books/${id}?key=${KEY}&updateMask.fieldPaths=familyId`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { familyId: { stringValue: familyId } } }),
          })
          booksUpdated++
        }
      }

      const readersRes = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'readers' }] } }),
      })
      const readersData = await readersRes.json()
      if (Array.isArray(readersData)) {
        for (const item of readersData) {
          if (!item.document) continue
          if (item.document.fields?.familyId?.stringValue) continue
          const id = item.document.name.split('/').pop()
          await fetch(`${FS}/readers/${id}?key=${KEY}&updateMask.fieldPaths=familyId`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { familyId: { stringValue: familyId } } }),
          })
          readersUpdated++
        }
      }

      return res.status(200).json({ ok: true, booksUpdated, readersUpdated })
    }

    // ── Buddy: Create an invite link for a book ─────────────────────────────
    if (action === 'buddy-invite') {
      const { reader1Id, reader1Name, reader1Emoji, reader1FamilyId, bookTitle } = req.body
      if (!reader1Id || !reader1Name || !reader1FamilyId) {
        return res.status(400).json({ error: 'reader1Id, reader1Name and reader1FamilyId are required' })
      }
      const code = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      await fetch(`${FS}/buddy_invites/${code}?key=${KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({
          reader1Id, reader1Name,
          reader1Emoji: reader1Emoji || '📚',
          reader1FamilyId,
          bookTitle: bookTitle || '',
          status: 'pending',
          createdAt: new Date().toISOString(),
        }) }),
      })
      return res.json({ ok: true, code })
    }

    // ── Buddy: Accept an invite and create the chat ─────────────────────────
    if (action === 'buddy-accept') {
      const { code, reader2Id, reader2Name, reader2Emoji, reader2FamilyId } = req.body
      if (!code || !reader2Id) return res.status(400).json({ error: 'code and reader2Id are required' })

      const inviteRes = await fetch(`${FS}/buddy_invites/${code}?key=${KEY}`)
      if (!inviteRes.ok) return res.status(404).json({ error: 'Invite not found or expired' })
      const invite = fromFS(await inviteRes.json())

      if (invite.reader1Id === reader2Id) {
        return res.status(400).json({ error: 'You cannot buddy-chat with yourself' })
      }
      if (invite.status === 'accepted' && invite.chatId) {
        return res.json({ ok: true, chatId: invite.chatId }) // idempotent
      }

      // Create the buddy chat
      const chatId = crypto.randomUUID()
      await fetch(`${FS}/buddy_chats/${chatId}?key=${KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({
          reader1Id:       invite.reader1Id,
          reader1Name:     invite.reader1Name,
          reader1Emoji:    invite.reader1Emoji || '📚',
          reader1FamilyId: invite.reader1FamilyId,
          reader2Id,
          reader2Name:     reader2Name || 'Reader',
          reader2Emoji:    reader2Emoji || '📚',
          reader2FamilyId: reader2FamilyId || '',
          bookTitle:       invite.bookTitle || '',
          status:          'active',
          messages:        '[]',
          createdAt:       new Date().toISOString(),
          updatedAt:       new Date().toISOString(),
        }) }),
      })

      // Mark invite as accepted
      await fetch(`${FS}/buddy_invites/${code}?key=${KEY}&updateMask.fieldPaths=status&updateMask.fieldPaths=chatId`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({ status: 'accepted', chatId }) }),
      })

      return res.json({ ok: true, chatId })
    }

    // ── Buddy: Send a message (append only — no deletion) ───────────────────
    if (action === 'buddy-message') {
      const { chatId, senderId, senderName, msg } = req.body
      if (!chatId || !senderId || !msg?.trim()) {
        return res.status(400).json({ error: 'chatId, senderId and msg are required' })
      }

      const chatRes = await fetch(`${FS}/buddy_chats/${chatId}?key=${KEY}`)
      if (!chatRes.ok) return res.status(404).json({ error: 'Chat not found' })
      const chat = fromFS(await chatRes.json())

      if (chat.reader1Id !== senderId && chat.reader2Id !== senderId) {
        return res.status(403).json({ error: 'You are not a participant in this chat' })
      }

      // ── PG moderation check ────────────────────────────────────────────
      const modResult = await moderateMessage(msg.trim())
      if (!modResult.ok) {
        return res.status(422).json({
          error: modResult.reason || 'That message isn\'t appropriate for this reading chat. Please keep it friendly! 📚',
          blocked: true,
        })
      }

      const msgs = JSON.parse(chat.messages || '[]')
      msgs.push({ from: senderId, name: senderName || 'Reader', msg: msg.trim(), at: new Date().toISOString() })

      await fetch(`${FS}/buddy_chats/${chatId}?key=${KEY}&updateMask.fieldPaths=messages&updateMask.fieldPaths=updatedAt`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({ messages: JSON.stringify(msgs), updatedAt: new Date().toISOString() }) }),
      })

      return res.json({ ok: true })
    }

    // ── Save test result to Firestore ───────────────────────────────────────
    if (action === 'save-test') {
      const { readerId, readerName, readerEmoji, familyId: fid,
              subject, subjectLabel, difficulty, score, total, timestamp } = req.body
      if (!readerId || !fid) return res.status(400).json({ error: 'readerId and familyId required' })
      const testId = crypto.randomUUID()
      const r = await fetch(`${FS}/tests/${testId}?key=${KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: toFS({
            readerId:     readerId || '',
            readerName:   readerName || '',
            readerEmoji:  readerEmoji || '📚',
            familyId:     fid || '',
            subject:      subject || '',
            subjectLabel: subjectLabel || '',
            difficulty:   difficulty || 'easy',
            score:        typeof score === 'number' ? score : 0,
            total:        typeof total === 'number' ? total : 10,
            timestamp:    timestamp || new Date().toISOString(),
          }),
        }),
      })
      if (!r.ok) return res.status(500).json({ error: 'Failed to save test' })
      return res.json({ ok: true, testId })
    }

    // ── Set (replace) chore definitions for a family ───────────────────────
    if (action === 'set-chores') {
      const { chores } = req.body
      if (!familyId || !Array.isArray(chores)) return res.status(400).json({ error: 'familyId and chores[] required' })
      // Delete all existing chores for this family
      const listR = await fetch(`${FS}:runQuery?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'chores' }], where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } } } } }),
      })
      if (listR.ok) {
        const listDocs = await listR.json()
        const ids = listDocs.filter(d => d.document).map(d => d.document.name.split('/').pop())
        await Promise.all(ids.map(id => fetch(`${FS}/chores/${id}?key=${KEY}`, { method: 'DELETE' }).catch(() => {})))
      }
      // Create fresh chore documents
      await Promise.all(chores.map(c => {
        const id = crypto.randomUUID()
        return fetch(`${FS}/chores/${id}?key=${KEY}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: toFS({ familyId, name: String(c.name || ''), amount: parseFloat(c.amount) || 0, createdAt: new Date().toISOString() }) }),
        }).catch(() => {})
      }))
      return res.json({ ok: true })
    }

    // ── Kid logs a completed chore (auto-approved, credited immediately) ──────
    if (action === 'log-chore') {
      const { readerId, readerName, readerEmoji, choreId, choreName, amount } = req.body
      if (!familyId || !readerId || !choreName) return res.status(400).json({ error: 'familyId, readerId and choreName required' })
      const amt = parseFloat(amount) || 0
      const now = new Date().toISOString()
      const entryId = crypto.randomUUID()
      // Fetch reader to resolve authoritative name (avoids stale session names) and get balance
      const readerR = await fetch(`${FS}/readers/${readerId}?key=${KEY}`)
      const readerDoc = readerR.ok ? fromFS(await readerR.json()) : null
      const authorName = readerDoc?.name || readerName || ''
      await fetch(`${FS}/choreEntries/${entryId}?key=${KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({
          familyId, readerId, readerName: authorName, readerEmoji: readerEmoji || '📚',
          choreId: choreId || '', choreName, amount: amt,
          status: 'approved', createdAt: now,
        }) }),
      })
      if (amt > 0) {
        const ledgerId = crypto.randomUUID()
        await fetch(`${FS}/ledger/${ledgerId}?key=${KEY}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: toFS({ readerId, familyId, type: 'chore', description: choreName, amount: amt, refId: entryId, createdAt: now }) }),
        })
        if (readerDoc) {
          const newBalance = Math.round(((parseFloat(readerDoc.balance) || 0) + amt) * 100) / 100
          await fetch(`${FS}/readers/${readerId}?key=${KEY}&updateMask.fieldPaths=balance`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { balance: { doubleValue: newBalance } } }),
          })
        }
      }
      return res.json({ ok: true, entryId, amount: amt })
    }

    // ── Admin sets per-child yearly reading reward goal ─────────────────────
    if (action === 'set-reader-goal') {
      const { readerId, yearlyBooks, yearlyAmount, year } = req.body
      if (!readerId || !familyId) return res.status(400).json({ error: 'readerId and familyId required' })
      await fetch(`${FS}/readerGoals/${readerId}?key=${KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({ readerId, familyId, yearlyBooks: parseInt(yearlyBooks) || 0, yearlyAmount: parseFloat(yearlyAmount) || 0, year: parseInt(year) || new Date().getFullYear() }) }),
      })
      return res.json({ ok: true })
    }

    // ── Auto-credit reading reward when a book is finished ─────────────────
    if (action === 'credit-book') {
      const { readerId, bookId, bookTitle } = req.body
      if (!readerId || !familyId) return res.status(400).json({ error: 'readerId and familyId required' })
      const goalR = await fetch(`${FS}/readerGoals/${readerId}?key=${KEY}`)
      if (!goalR.ok) return res.json({ ok: true, credited: 0, reason: 'no_goal' })
      const goal = fromFS(await goalR.json())
      const yearlyBooks  = parseInt(goal.yearlyBooks)  || 0
      const yearlyAmount = parseFloat(goal.yearlyAmount) || 0
      if (!yearlyBooks || !yearlyAmount) return res.json({ ok: true, credited: 0, reason: 'no_goal' })
      const perBook = Math.round((yearlyAmount / yearlyBooks) * 100) / 100
      const ledgerId = crypto.randomUUID()
      await fetch(`${FS}/ledger/${ledgerId}?key=${KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({ readerId, familyId, type: 'book', description: bookTitle ? `Finished "${bookTitle}"` : 'Finished a book', amount: perBook, refId: bookId || '', createdAt: new Date().toISOString() }) }),
      })
      const readerR = await fetch(`${FS}/readers/${readerId}?key=${KEY}`)
      if (readerR.ok) {
        const reader = fromFS(await readerR.json())
        const newBalance = Math.round(((parseFloat(reader.balance) || 0) + perBook) * 100) / 100
        await fetch(`${FS}/readers/${readerId}?key=${KEY}&updateMask.fieldPaths=balance`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { balance: { doubleValue: newBalance } } }),
        })
      }
      return res.json({ ok: true, credited: perBook })
    }

    // ── Directly set a reader's earned balance (admin override) ───────────────
    if (action === 'set-balance') {
      const { readerId, balance } = req.body
      if (!readerId || balance == null) return res.status(400).json({ error: 'readerId and balance required' })
      const newBalance = Math.round(parseFloat(balance) * 100) / 100
      if (isNaN(newBalance) || newBalance < 0) return res.status(400).json({ error: 'Invalid balance' })
      await fetch(`${FS}/readers/${readerId}?key=${KEY}&updateMask.fieldPaths=balance`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { balance: { doubleValue: newBalance } } }),
      })
      return res.json({ ok: true, newBalance })
    }

    // ── Recalculate a reader's balance from ground truth ──────────────────────
    if (action === 'recalculate-balance') {
      const { readerId } = req.body
      if (!readerId || !familyId) return res.status(400).json({ error: 'readerId and familyId required' })

      // Fetch finished books for this reader + chore ledger entries in parallel
      const [booksR, ledgerR, goalR] = await Promise.all([
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }], where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'finished' } } },
          ] } }, limit: 500 } }) }),
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'ledger' }], where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } },
            { fieldFilter: { field: { fieldPath: 'type' }, op: 'EQUAL', value: { stringValue: 'chore' } } },
          ] } }, limit: 500 } }) }),
        fetch(`${FS}/readerGoals/${readerId}?key=${KEY}`),
      ])

      const finishedBooks = booksR.ok ? (await booksR.json()).filter(d => d.document).map(d => fromFS(d.document)) : []
      const choreEntries  = ledgerR.ok ? (await ledgerR.json()).filter(d => d.document).map(d => fromFS(d.document)) : []
      const choreTotal    = choreEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)

      let bookTotal = 0
      if (goalR.ok) {
        const goal = fromFS(await goalR.json())
        const yearlyBooks  = parseInt(goal.yearlyBooks)  || 0
        const yearlyAmount = parseFloat(goal.yearlyAmount) || 0
        if (yearlyBooks && yearlyAmount) {
          const perBook = Math.round((yearlyAmount / yearlyBooks) * 100) / 100
          bookTotal = Math.round(finishedBooks.length * perBook * 100) / 100
        }
      }

      const newBalance = Math.round((bookTotal + choreTotal) * 100) / 100
      await fetch(`${FS}/readers/${readerId}?key=${KEY}&updateMask.fieldPaths=balance`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { balance: { doubleValue: newBalance } } }),
      })
      return res.json({ ok: true, newBalance, finishedBooks: finishedBooks.length, bookTotal, choreTotal })
    }

    // ── Record a cash payment made to a kid ────────────────────────────────────
    if (action === 'make-payment') {
      const { readerId, readerName, readerEmoji, amount, note, month } = req.body
      if (!familyId || !readerId || !amount) return res.status(400).json({ error: 'familyId, readerId and amount required' })
      const amt = Math.round(parseFloat(amount) * 100) / 100
      if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' })
      const paymentId = crypto.randomUUID()
      const now = new Date().toISOString()
      await fetch(`${FS}/payments/${paymentId}?key=${KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({ familyId, readerId, readerName: readerName || '', readerEmoji: readerEmoji || '📚', amount: amt, note: note || '', month: month || now.slice(0, 7), createdAt: now }) }),
      })
      return res.json({ ok: true, paymentId, amount: amt })
    }

    // ── Sync current reader names into all book + chore-entry documents ──────
    if (action === 'backfill-reader-names') {
      if (!familyId) return res.status(400).json({ error: 'familyId required' })

      const readersR = await fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'readers' }], where: { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } } } } }) })
      const readers = readersR.ok ? (await readersR.json()).filter(d => d.document).map(d => fromFS(d.document)) : []

      let updated = 0
      for (const reader of readers) {
        if (!reader.id || !reader.name) continue
        const nameField = JSON.stringify({ fields: { readerName: { stringValue: reader.name } } })
        const [booksR2, choreR2] = await Promise.all([
          fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }], where: { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: reader.id } } }, limit: 500 } }) }),
          fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'choreEntries' }], where: { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: reader.id } } }, limit: 500 } }) }),
        ])
        const bookIds  = booksR2.ok  ? (await booksR2.json()).filter(d => d.document).map(d => d.document.name.split('/').pop()) : []
        const choreIds = choreR2.ok  ? (await choreR2.json()).filter(d => d.document).map(d => d.document.name.split('/').pop()) : []
        await Promise.all([
          ...bookIds.map(id  => fetch(`${FS}/books/${id}?key=${KEY}&updateMask.fieldPaths=readerName`,        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: nameField }).catch(() => {})),
          ...choreIds.map(id => fetch(`${FS}/choreEntries/${id}?key=${KEY}&updateMask.fieldPaths=readerName`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: nameField }).catch(() => {})),
        ])
        updated += bookIds.length + choreIds.length
      }

      return res.json({ ok: true, updated, readers: readers.length })
    }

    // ── Backfill book rewards for all uncredited finished books ───────────────
    if (action === 'backfill-book-rewards') {
      if (!familyId) return res.status(400).json({ error: 'familyId required' })

      // Fetch all finished books for this family + all existing book ledger entries
      const [booksR, ledgerR] = await Promise.all([
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }], where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'finished' } } },
          ] } }, limit: 500 } }) }),
        fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'ledger' }], where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: familyId } } },
            { fieldFilter: { field: { fieldPath: 'type' }, op: 'EQUAL', value: { stringValue: 'book' } } },
          ] } }, limit: 500 } }) }),
      ])

      const allFinished = booksR.ok ? (await booksR.json()).filter(d => d.document).map(d => fromFS(d.document)) : []
      const creditedIds = new Set()
      if (ledgerR.ok) (await ledgerR.json()).filter(d => d.document).map(d => fromFS(d.document)).forEach(e => { if (e.refId) creditedIds.add(e.refId) })

      const uncredited = allFinished.filter(b => b.id && b.readerId && !creditedIds.has(b.id))
      if (!uncredited.length) return res.json({ ok: true, credited: 0, skipped: 0, message: 'All books already credited' })

      // Fetch reading goals for readers who have uncredited books
      const readerIds = [...new Set(uncredited.map(b => b.readerId))]
      const goalMap = {}
      await Promise.all(readerIds.map(async rid => {
        try {
          const gr = await fetch(`${FS}/readerGoals/${rid}?key=${KEY}`)
          if (gr.ok) {
            const gd = await gr.json()
            if (gd.fields) {
              const g = fromFS(gd)
              const yb = parseInt(g.yearlyBooks) || 0
              const ya = parseFloat(g.yearlyAmount) || 0
              goalMap[rid] = yb && ya ? Math.round((ya / yb) * 100) / 100 : 0
            }
          }
        } catch {}
      }))

      // Create ledger entries; accumulate per-reader totals for balance update
      let credited = 0, skipped = 0
      const readerCredits = {}
      for (const book of uncredited) {
        const perBook = goalMap[book.readerId] || 0
        if (!perBook) { skipped++; continue }
        const finishedDate = book.finishedAt || book.addedAt || new Date().toISOString()
        const ledgerId = crypto.randomUUID()
        await fetch(`${FS}/ledger/${ledgerId}?key=${KEY}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: toFS({ readerId: book.readerId, familyId, type: 'book', description: book.title ? `Finished "${book.title}"` : 'Finished a book', amount: perBook, refId: book.id, createdAt: finishedDate }) }),
        })
        readerCredits[book.readerId] = Math.round(((readerCredits[book.readerId] || 0) + perBook) * 100) / 100
        credited++
      }

      // Update each reader's balance once
      await Promise.all(Object.entries(readerCredits).map(async ([rid, totalCredit]) => {
        const rR = await fetch(`${FS}/readers/${rid}?key=${KEY}`)
        if (rR.ok) {
          const rdr = fromFS(await rR.json())
          const newBal = Math.round(((parseFloat(rdr.balance) || 0) + totalCredit) * 100) / 100
          await fetch(`${FS}/readers/${rid}?key=${KEY}&updateMask.fieldPaths=balance`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { balance: { doubleValue: newBal } } }),
          })
        }
      }))

      return res.json({ ok: true, credited, skipped, total: uncredited.length })
    }

    // ── Set Alexa PIN for family (stored in alexaPins collection) ───────────
    if (action === 'set-alexa-pin') {
      const { pin } = req.body
      if (!familyId || !pin) return res.status(400).json({ error: 'familyId and pin required' })
      const pinStr = String(pin).replace(/\D/g, '').slice(0, 6)
      if (pinStr.length < 4) return res.status(400).json({ error: 'PIN must be 4-6 digits' })
      await fetch(`${FS}/alexaPins/${pinStr}?key=${KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFS({ familyId, updatedAt: new Date().toISOString() }) }),
      })
      return res.json({ ok: true, pin: pinStr })
    }

    // ── Update reader visual profile (themeColor, avatarBase64, bannerBase64, name, colorMode) ─
    if (action === 'update-reader-profile') {
      const { readerId, themeColor, avatarBase64, bannerBase64, name, colorMode, grade: profileGrade } = req.body
      if (!readerId) return res.status(400).json({ error: 'readerId required' })
      const newName = name !== undefined && name.trim() ? name.trim() : null
      const fields = {}
      if (themeColor     !== undefined) fields.themeColor   = { stringValue: themeColor }
      if (avatarBase64   !== undefined) fields.avatarBase64 = { stringValue: avatarBase64 }
      if (bannerBase64   !== undefined) fields.bannerBase64 = { stringValue: bannerBase64 }
      if (newName)                      fields.name         = { stringValue: newName }
      if (colorMode      !== undefined) fields.colorMode    = { stringValue: colorMode }
      if (profileGrade   !== undefined) fields.grade        = { stringValue: String(profileGrade) }
      if (Object.keys(fields).length === 0) return res.json({ ok: true })
      const masks = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&')
      await fetch(`${FS}/readers/${readerId}?key=${KEY}&${masks}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })

      // Backfill new name into all existing books and chore entries for this reader
      if (newName) {
        const nameField = JSON.stringify({ fields: { readerName: { stringValue: newName } } })
        const [booksR, choreR] = await Promise.all([
          fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'books' }],
              where: { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } }, limit: 500 } }) }),
          fetch(`${FS}:runQuery?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'choreEntries' }],
              where: { fieldFilter: { field: { fieldPath: 'readerId' }, op: 'EQUAL', value: { stringValue: readerId } } }, limit: 500 } }) }),
        ])
        const bookIds   = booksR.ok  ? (await booksR.json()).filter(d => d.document).map(d => d.document.name.split('/').pop()) : []
        const choreIds  = choreR.ok  ? (await choreR.json()).filter(d => d.document).map(d => d.document.name.split('/').pop()) : []
        await Promise.all([
          ...bookIds.map(id  => fetch(`${FS}/books/${id}?key=${KEY}&updateMask.fieldPaths=readerName`,         { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: nameField }).catch(() => {})),
          ...choreIds.map(id => fetch(`${FS}/choreEntries/${id}?key=${KEY}&updateMask.fieldPaths=readerName`,  { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: nameField }).catch(() => {})),
        ])
      }

      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
