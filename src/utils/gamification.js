// ── XP earned per finished book ────────────────────────────────────────────
// Base: 50 XP for finishing
// +20 XP for writing a summary
// +0–50 bonus XP from grade percentage (100% grade = +50, 50% grade = +25)
export function getXP(books) {
  return books
    .filter(b => b.status === 'finished')
    .reduce((total, book) => {
      let xp = 50 // base
      if (book.review && book.review.trim().length > 0) xp += 20
      if (book.gradeScore != null) {
        const isNew = book.gradeGrammar != null
        const base = isNew ? 50 : 30
        const hasAcc = book.gradeAccuracy != null && book.gradeAccuracy >= 0
        const maxPts = hasAcc ? base + 10 : base
        const fullScore = hasAcc ? book.gradeScore + book.gradeAccuracy : book.gradeScore
        const pct = Math.round((fullScore / maxPts) * 100)
        xp += Math.round(pct / 2) // up to +50 bonus
      }
      return total + xp
    }, 0)
}

// ── Level definitions ──────────────────────────────────────────────────────
// Designed so ~20 books/year at average grades reaches Level 7
export const LEVELS = [
  { level: 1, title: 'Curious Reader',   emoji: '🌱', minXP: 0    },
  { level: 2, title: 'Bookworm',         emoji: '📚', minXP: 150  },
  { level: 3, title: 'Story Explorer',   emoji: '🗺️', minXP: 350  },
  { level: 4, title: 'Chapter Champion', emoji: '⚡', minXP: 650  },
  { level: 5, title: 'Book Wizard',      emoji: '🧙', minXP: 1050 },
  { level: 6, title: 'Literary Hero',    emoji: '🦸', minXP: 1550 },
  { level: 7, title: 'Word Master',      emoji: '🔮', minXP: 2250 },
  { level: 8, title: 'Reading Legend',   emoji: '👑', minXP: 3150 },
]

// Returns the current level details plus progress towards the next level
export function getLevel(xp) {
  let current = LEVELS[0]
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXP) current = lvl
    else break
  }
  const idx = LEVELS.indexOf(current)
  const next = LEVELS[idx + 1] || null
  return {
    ...current,
    xp,
    nextTitle: next?.title || null,
    nextEmoji: next?.emoji || null,
    nextXP: next?.minXP || null,
    progressXP: next ? xp - current.minXP : null,  // XP earned within this level
    rangeXP: next ? next.minXP - current.minXP : null, // total XP needed for this level
    isMax: !next,
  }
}
