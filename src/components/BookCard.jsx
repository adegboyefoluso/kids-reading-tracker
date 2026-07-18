import { useState } from 'react'

const COVER_COLORS = [
  '#8b1a1a', '#1a5276', '#1e8449', '#6c3483',
  '#935116', '#1a5276', '#922b21', '#1f618d',
]

function colorForTitle(title) {
  let hash = 0
  for (const c of (title || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length]
}

export default function BookCard({ book, size = 'md', showBadge = false }) {
  const [imgErr, setImgErr] = useState(false)
  const bg = colorForTitle(book.title)

  const sizes = {
    sm: { width: 80, height: 120, fontSize: '0.55rem' },
    md: { width: 120, height: 180, fontSize: '0.7rem' },
    lg: { width: 160, height: 240, fontSize: '0.85rem' },
  }
  const { width, height, fontSize } = sizes[size] || sizes.md

  const isNew = book.addedAt?.seconds
    ? Date.now() / 1000 - book.addedAt.seconds < 86400
    : false

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {(showBadge && isNew) && (
        <span style={{
          position: 'absolute', top: -8, right: -8, zIndex: 2,
          background: '#e5e5e5', color: '#0a0a0a', fontSize: '0.6rem',
          fontWeight: 700, padding: '2px 6px', borderRadius: 10,
          textTransform: 'uppercase', letterSpacing: 1,
        }}>NEW</span>
      )}
      <div style={{
        width, height, borderRadius: 4, overflow: 'hidden',
        boxShadow: '3px 3px 10px rgba(0,0,0,0.6)',
        background: bg, position: 'relative', flexShrink: 0,
        transition: 'transform 0.2s',
        cursor: 'pointer',
      }}
        title={`${book.title} — ${book.author}`}
      >
        {book.coverUrl && !imgErr ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            onError={() => setImgErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 8,
            boxSizing: 'border-box', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📚</div>
            <div style={{ fontSize, color: '#fff', fontWeight: 600, lineHeight: 1.3 }}>
              {book.title}
            </div>
            <div style={{ fontSize: `calc(${fontSize} - 0.05rem)`, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
              {book.author}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
