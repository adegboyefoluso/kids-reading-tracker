const GB_KEY = (process.env.GOOGLE_BOOKS_API_KEY || '').trim()

async function timedFetch(url, ms = 7000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    return r
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

async function searchGoogleBooks(q) {
  if (!GB_KEY) return null   // skip if no key — will be rate-limited from shared IPs
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12&key=${GB_KEY}`
  try {
    const r = await timedFetch(url)
    if (!r.ok) { console.warn('[search] GB status:', r.status); return null }
    const data = await r.json()
    if (!data.items?.length) return null
    return data.items.map(item => {
      const info = item.volumeInfo
      return {
        isbn:
          info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier ||
          info.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier || null,
        title: info.title || 'Unknown',
        author: info.authors?.[0] || 'Unknown Author',
        coverUrl: info.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
        genre: info.categories?.[0] || '',
        year: info.publishedDate ? parseInt(info.publishedDate) : null,
        description: info.description || '',
      }
    })
  } catch (e) {
    console.warn('[search] GB error:', e.message)
    return null
  }
}

async function searchOpenLibrary(q) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=key,title,author_name,isbn,cover_i,subject,first_publish_year`
  try {
    const r = await timedFetch(url)
    if (!r.ok) { console.warn('[search] OL status:', r.status); return null }
    const data = await r.json()
    if (!data.docs?.length) return null
    return data.docs.map(doc => ({
      isbn: doc.isbn?.[0] || null,
      title: doc.title || 'Unknown',
      author: doc.author_name?.[0] || 'Unknown Author',
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
      genre: doc.subject?.[0] || '',
      year: doc.first_publish_year || null,
      description: '',
    }))
  } catch (e) {
    console.warn('[search] OL error:', e.message)
    return null
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { q, isbn } = req.query

  try {
    // ── ISBN lookup ──────────────────────────────────────────────────────
    if (isbn) {
      const clean = isbn.replace(/[^0-9X]/gi, '')

      // Google Books by ISBN (needs key)
      if (GB_KEY) {
        try {
          const r = await timedFetch(
            `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}&maxResults=1&key=${GB_KEY}`
          )
          if (r.ok) {
            const data = await r.json()
            if (data.items?.length) {
              const info = data.items[0].volumeInfo
              return res.status(200).json({
                isbn: info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier ||
                      info.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier || clean,
                title: info.title || 'Unknown Title',
                author: info.authors?.[0] || 'Unknown Author',
                coverUrl: info.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
                genre: info.categories?.[0] || '',
                year: info.publishedDate ? parseInt(info.publishedDate) : null,
                description: info.description || '',
              })
            }
          }
        } catch (e) { console.warn('[search] GB ISBN:', e.message) }
      }

      // Open Library /api/books
      try {
        const r = await timedFetch(
          `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`
        )
        if (r.ok) {
          const data = await r.json()
          const b = data[`ISBN:${clean}`]
          if (b) {
            const desc = typeof b.description === 'string' ? b.description
              : b.description?.value || b.notes?.value || b.notes || ''
            return res.status(200).json({
              isbn: clean,
              title: b.title || 'Unknown Title',
              author: b.authors?.[0]?.name || 'Unknown Author',
              coverUrl: b.cover?.large || b.cover?.medium || b.cover?.small || null,
              genre: b.subjects?.[0]?.name || '',
              year: b.publish_date ? parseInt(b.publish_date.slice(-4)) || null : null,
              description: desc,
            })
          }
        }
      } catch (e) { console.warn('[search] OL ISBN:', e.message) }

      return res.status(404).json({ error: 'Book not found' })
    }

    // ── Text search ──────────────────────────────────────────────────────
    if (q) {
      console.log('[search] q:', q.trim(), '| GB key:', GB_KEY ? 'yes' : 'NO')
      const [gbResult, olResult] = await Promise.allSettled([
        searchGoogleBooks(q.trim()),
        searchOpenLibrary(q.trim()),
      ])
      const books =
        (gbResult.status === 'fulfilled' && gbResult.value) ||
        (olResult.status === 'fulfilled' && olResult.value) || null
      console.log('[search] result: books=', books ? books.length : null,
        '| GB:', gbResult.status, '| OL:', olResult.status)
      if (!books) return res.status(503).json({ error: 'Search is temporarily unavailable. Please try again.' })
      return res.status(200).json(books)
    }

    return res.status(400).json({ error: 'Provide q or isbn param' })
  } catch (e) {
    console.error('[search] unexpected:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
