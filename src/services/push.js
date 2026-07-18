// ── PWA Push Notification service ─────────────────────────────────────────
// VAPID public key must be set as VITE_VAPID_PUBLIC_KEY in Vercel env vars
// Strip BOM (U+FEFF) and whitespace — PowerShell piping can add invisible prefix chars
const VAPID_PUBLIC   = (import.meta.env.VITE_VAPID_PUBLIC_KEY    || '').replace(/^﻿/, '').trim()
const FIREBASE_KEY   = (import.meta.env.VITE_FIREBASE_API_KEY    || '').replace(/^﻿/, '').trim()
const FIREBASE_PROJ  = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').replace(/^﻿/, '').trim()
const FS_BASE        = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJ}/databases/(default)/documents`

// Web Push requires the VAPID public key as a Uint8Array
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Save push subscription directly to Firestore (bypasses server hop entirely)
async function saveSubToFirestore(readerId, subJson) {
  if (!FIREBASE_KEY || !FIREBASE_PROJ || !readerId) return false
  try {
    const url = `${FS_BASE}/readers/${readerId}?key=${FIREBASE_KEY}&updateMask.fieldPaths=pushSubscription`
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { pushSubscription: { stringValue: subJson } } }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      console.error('[push] Firestore save failed', r.status, txt.slice(0, 200))
      return false
    }
    return true
  } catch (e) {
    console.error('[push] Firestore save error', e)
    return false
  }
}

// Subscribe this browser to push and save the subscription to Firestore.
// Safe to call when permission is already granted — returns quietly if unsupported.
export async function subscribeToPush(readerId) {
  if (!readerId) { console.warn('[push] subscribeToPush: no readerId'); return null }
  if (!VAPID_PUBLIC) { console.warn('[push] subscribeToPush: VAPID_PUBLIC missing'); return null }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[push] subscribeToPush: push not supported in this browser')
    return null
  }
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()

    // If there's an existing sub but it was created with a different key, unsubscribe first
    if (sub) {
      const subKey = sub.options?.applicationServerKey
      if (subKey) {
        const existingKey = btoa(String.fromCharCode(...new Uint8Array(subKey)))
        const currentKey  = btoa(String.fromCharCode(...urlBase64ToUint8Array(VAPID_PUBLIC)))
        if (existingKey !== currentKey) {
          console.warn('[push] Key mismatch — resubscribing')
          await sub.unsubscribe()
          sub = null
        }
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })
    }

    const subJson = JSON.stringify(sub.toJSON())
    const saved = await saveSubToFirestore(readerId, subJson)
    console.log('[push] subscribeToPush complete — saved:', saved, 'endpoint:', sub.endpoint?.slice(-30))
    return sub
  } catch (e) {
    console.error('[push] subscribeToPush failed:', e.name, e.message)
    return null
  }
}

// Request push permission from the user (shows the browser prompt if needed).
// Returns: 'granted' | 'denied' | 'default' | 'unsupported'
export async function requestPushPermission(readerId) {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted') {
    await subscribeToPush(readerId) // re-subscribe (no prompt shown)
    return 'granted'
  }
  const result = await Notification.requestPermission()
  if (result === 'granted') await subscribeToPush(readerId)
  return result
}

// ── Fire-and-forget notify helpers ────────────────────────────────────────
// All are best-effort — silently ignored if push is not configured or fails.

function pushNotify(payload) {
  fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'notify', ...payload }),
  }).catch(() => {})
}

/** Admin graded a summary → notify the reader */
export function notifyGraded({ readerId, familyId, bookTitle, bookId }) {
  if (!readerId || !familyId) return
  pushNotify({ type: 'graded', readerId, familyId, bookTitle, bookId })
}

/** Reader submitted a new summary → notify all admins */
export function notifySubmitted({ familyId, bookTitle, readerName, bookId }) {
  if (!familyId) return
  pushNotify({ type: 'submitted', familyId, bookTitle, readerName, bookId })
}

/** Admin sent a chat message → notify the reader */
export function notifyChatToReader({ readerId, familyId, bookTitle, bookId }) {
  if (!readerId || !familyId) return
  pushNotify({ type: 'chat_to_reader', readerId, familyId, bookTitle, bookId })
}

/** Reader sent a chat reply → notify all admins */
export function notifyChatToAdmins({ familyId, bookTitle, readerName, bookId }) {
  if (!familyId) return
  pushNotify({ type: 'chat_to_admins', familyId, bookTitle, readerName, bookId })
}
