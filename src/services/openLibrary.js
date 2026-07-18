// ── Timeout-safe fetch ────────────────────────────────────────────────────
async function timedFetch(url, ms = 8000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    return r
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

// ── Google Books ──────────────────────────────────────────────────────────
async function googleBooksSearch(q) {
  const r = await timedFetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12`
  )
  if (!r.ok) return null
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
}

// ── Open Library ──────────────────────────────────────────────────────────
async function openLibrarySearch(q) {
  const r = await timedFetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=key,title,author_name,isbn,cover_i,subject,first_publish_year`
  )
  if (!r.ok) return null
  const data = await r.json()
  if (!data.docs?.length) return null
  return data.docs.map(doc => ({
    isbn: doc.isbn?.[0] || null,
    title: doc.title || 'Unknown',
    author: doc.author_name?.[0] || 'Unknown Author',
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : null,
    genre: doc.subject?.[0] || '',
    year: doc.first_publish_year || null,
    description: '',
  }))
}

// ── ISBN lookup — 3 strategies, all browser-direct ────────────────────────
export async function lookupByISBN(isbn) {
  const clean = isbn.replace(/[^0-9X]/gi, '')

  // Strategy 1: Google Books
  try {
    const r = await timedFetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}&maxResults=1`
    )
    if (r.ok) {
      const data = await r.json()
      if (data.items?.length) {
        const info = data.items[0].volumeInfo
        return {
          isbn:
            info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier ||
            info.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier ||
            clean,
          title: info.title || 'Unknown Title',
          author: info.authors?.[0] || 'Unknown Author',
          coverUrl: info.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
          genre: info.categories?.[0] || '',
          year: info.publishedDate ? parseInt(info.publishedDate) : null,
          description: info.description || '',
        }
      }
    }
  } catch (e) {
    console.warn('[isbn] Google Books:', e.message)
  }

  // Strategy 2: Open Library /api/books
  try {
    const r = await timedFetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`
    )
    if (r.ok) {
      const data = await r.json()
      const b = data[`ISBN:${clean}`]
      if (b) {
        const desc =
          typeof b.description === 'string'
            ? b.description
            : b.description?.value || b.notes?.value || b.notes || ''
        return {
          isbn: clean,
          title: b.title || 'Unknown Title',
          author: b.authors?.[0]?.name || 'Unknown Author',
          coverUrl: b.cover?.large || b.cover?.medium || b.cover?.small || null,
          genre: b.subjects?.[0]?.name || '',
          year: b.publish_date ? parseInt(b.publish_date.slice(-4)) || null : null,
          description: desc,
        }
      }
    }
  } catch (e) {
    console.warn('[isbn] Open Library /api/books:', e.message)
  }

  // Strategy 3: Open Library /isbn/
  try {
    const r = await timedFetch(`https://openlibrary.org/isbn/${clean}.json`)
    if (r.ok) {
      const data = await r.json()
      if (data?.title) {
        let authorName = 'Unknown Author'
        const authorKey = data.authors?.[0]?.key
        if (authorKey) {
          try {
            const ar = await timedFetch(`https://openlibrary.org${authorKey}.json`, 3000)
            if (ar.ok) {
              const ad = await ar.json()
              authorName = ad.name || ad.personal_name || 'Unknown Author'
            }
          } catch {}
        }
        const coverId = data.covers?.[0]
        return {
          isbn: clean,
          title: data.title,
          author: authorName,
          coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
          genre: '',
          year: data.publish_date ? parseInt(data.publish_date.slice(-4)) || null : null,
          description: '',
        }
      }
    }
  } catch (e) {
    console.warn('[isbn] Open Library /isbn/:', e.message)
  }

  return null
}

// ── Text search — both APIs in parallel, browser-direct ───────────────────
export async function searchBooks(query) {
  const trimmed = query.trim()

  // ISBN shortcut
  const isbnLike = trimmed.replace(/[\s-]/g, '')
  if (/^\d{10}$|^\d{13}$|^\d{9}X$/i.test(isbnLike)) {
    const book = await lookupByISBN(isbnLike)
    return book ? [book] : []
  }

  // Fire both in parallel — take the first that returns results
  const [gbResult, olResult] = await Promise.allSettled([
    googleBooksSearch(trimmed),
    openLibrarySearch(trimmed),
  ])

  const books =
    (gbResult.status === 'fulfilled' && gbResult.value) ||
    (olResult.status === 'fulfilled' && olResult.value) ||
    null

  if (books === null) {
    const gbErr = gbResult.status === 'rejected' ? gbResult.reason?.message : 'no results'
    const olErr = olResult.status === 'rejected' ? olResult.reason?.message : 'no results'
    console.error('[search] Both failed — GB:', gbErr, '| OL:', olErr)
    throw new Error('Search failed. Check your internet connection and try again.')
  }

  return books
}
