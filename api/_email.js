// Shared email helper — sends via Resend (resend.com)
// Required env var: RESEND_API_KEY
// Optional env var: FROM_EMAIL  (default: onboarding@resend.dev for sandbox)

export async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log('[email] RESEND_API_KEY not set — skipping:', subject)
    return { ok: false, error: 'RESEND_API_KEY not set' }
  }
  const from = process.env.FROM_EMAIL || 'Reading Tracker <onboarding@resend.dev>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
    })
    const body = await res.json()
    if (!res.ok) {
      console.error('[email] Resend error:', body)
      return { ok: false, error: body?.message || body?.name || JSON.stringify(body) }
    }
    return { ok: true }
  } catch (e) {
    console.error('[email] fetch error:', e.message)
    return { ok: false, error: e.message }
  }
}

// ── Shared HTML shell ─────────────────────────────────────────────────────────
export function emailShell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>${title}</title>
  <style>
    body  { margin:0; padding:0; background:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; }
    .wrap { max-width:580px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 16px rgba(0,0,0,.08); }
    .hdr  { background:#111; padding:24px 32px; }
    .hdr h1 { margin:0; font-size:20px; color:#fff; letter-spacing:.5px; }
    .hdr p  { margin:4px 0 0; font-size:13px; color:#888; }
    .body { padding:28px 32px; }
    .reader-card { background:#f9f9f9; border-radius:8px; padding:16px 20px; margin-bottom:16px; border-left:4px solid #111; }
    .reader-name { font-size:16px; font-weight:700; margin-bottom:8px; }
    .book-row { font-size:13px; color:#444; padding:4px 0; border-bottom:1px solid #ececec; }
    .book-row:last-child { border:none; }
    .tag  { display:inline-block; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; }
    .tag-green  { background:#d1fae5; color:#065f46; }
    .tag-amber  { background:#fef3c7; color:#92400e; }
    .tag-gray   { background:#f3f4f6; color:#374151; }
    .stat { display:inline-block; margin-right:20px; }
    .stat .n { font-size:28px; font-weight:700; }
    .stat .l { font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; }
    .divider { border:none; border-top:1px solid #ececec; margin:24px 0; }
    .footer { padding:16px 32px 24px; font-size:11px; color:#9ca3af; text-align:center; }
    a { color:#111; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>📚 Reading Tracker</h1>
      <p>${title}</p>
    </div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">
      Reading Tracker &nbsp;·&nbsp; You're receiving this because you're a family admin.<br/>
      Manage your notification settings inside the app at <a href="https://kids-reading-tracker.vercel.app/admin">Admin Panel</a>.
    </div>
  </div>
</body>
</html>`
}
