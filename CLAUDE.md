# Kids Reading Tracker — Project Context

**Status:** Active development | **Deployed:** Vercel | **Tech:** React + Vite + Firebase

## Project Overview

A family book tracking app for kids with real-time sync across devices. Runs as a fullscreen kiosk on LG webOS TV, with a phone-based barcode scanner for adding books. Features gamification (badges, rewards, leaderboards), chore tracking, analytics, and reading goals.

**Main deployment:** `https://kids-reading-tracker.vercel.app`

## Tech Stack

- **Frontend:** React 18 + Vite + React Router
- **Backend:** Vercel serverless functions (Node.js)
- **Database:** Firebase Firestore (real-time)
- **Book Data:** Open Library API (free, no key)
- **Barcode Scanning:** @zxing/browser (ISBN/EAN-13)
- **Push Notifications:** Firebase Cloud Messaging + web-push
- **PWA:** vite-plugin-pwa (makes scanner installable on phones)
- **Image Processing:** Sharp (for Alexa icons)
- **Hosting:** Vercel (free tier)

## Project Structure

```
kids-reading-tracker/
├── src/                          # React frontend
│   ├── App.jsx                   # Route definitions (11 routes)
│   ├── main.jsx                  # Entry point
│   ├── firebase.js               # Firebase config & initialization
│   ├── sw.js                     # Service worker for PWA
│   ├── views/                    # Page components
│   │   ├── KioskView.jsx         # TV display (auto-rotate: bookshelf → stats → badges)
│   │   ├── ScannerView.jsx       # Phone barcode scanner (/)
│   │   ├── AdminView.jsx         # Manage books, goals, ratings
│   │   ├── AnalyticsView.jsx     # Reading stats & trends
│   │   ├── SetupView.jsx         # Initial setup wizard
│   │   ├── BuddyView.jsx         # Buddy system (social features)
│   │   ├── TestView.jsx          # Test/debug view
│   │   ├── WorksheetView.jsx     # Worksheet/activities
│   │   ├── ChoresView.jsx        # Chore tracking
│   │   └── LeaderboardView.jsx   # Gamification leaderboard
│   ├── components/               # Reusable UI components
│   │   ├── BookCard.jsx
│   │   └── Pagination.jsx
│   ├── services/                 # API/data layer
│   │   ├── books.js              # Book CRUD operations
│   │   ├── auth.js               # Authentication
│   │   ├── readers.js            # Reader profiles
│   │   ├── rewards.js            # Badge/reward logic
│   │   ├── buddy.js              # Buddy system
│   │   ├── openLibrary.js        # Open Library API calls
│   │   ├── push.js               # Push notification setup
│   │   └── tests.js              # Test/quiz data
│   ├── utils/                    # Helpers
│   │   └── gamification.js       # Badge calculation, scoring
│   └── data/
│       └── curriculum.js         # Curriculum/reading lists
│
├── api/                          # Vercel serverless functions
│   ├── auth.js                   # User authentication endpoints
│   ├── books.js                  # Book CRUD API
│   ├── book.js                   # Single book operations
│   ├── search.js                 # Book search (Open Library)
│   ├── readers.js                # Reader management
│   ├── family.js                 # Family/household management
│   ├── goals.js                  # Reading goal endpoints
│   ├── stats.js                  # Analytics/stats generation
│   ├── grade.js                  # Grade/level management
│   ├── invite.js                 # Family invite links
│   ├── cron/                     # Scheduled jobs
│   │   ├── weekly-digest.js      # Weekly email digest
│   │   └── inactivity.js         # Inactivity notifications
│   ├── _email.js                 # Email template helper
│
├── public/                       # Static assets
├── .vercel/                      # Vercel config
├── index.html                    # HTML entry
├── vite.config.js                # Vite build config
├── vercel.json                   # Vercel deployment config
├── .env.example                  # Firebase config template
├── package.json                  # Dependencies
├── README.md                     # User setup guide
└── alexa-interaction-model.json  # Alexa skill definition (future)
```

## Key Routes

| Route | Purpose | Device |
|-------|---------|--------|
| `/` | Scanner (default) | Phone |
| `/scan` | Redirects to `/` | Phone |
| `/kiosk` | TV display (fullscreen) | TV |
| `/admin` | Book management & settings | Phone/Desktop |
| `/analytics` | Reading stats & trends | Phone/Desktop |
| `/setup` | Initial configuration | Phone/Desktop |
| `/buddy` | Social features | Phone |
| `/chores` | Chore tracker | Phone |
| `/leaderboard` | Gamification ranking | Phone/TV |
| `/test` | Quiz/test module | Phone |
| `/worksheet` | Reading activities | Phone |

## Core Features

### Scanner (Phone, `/`)
- Scan ISBN barcode with phone camera
- Auto-lookup book details via Open Library API
- Instant Firebase sync to TV
- Works offline → syncs when online

### Kiosk (TV, `/kiosk`)
- Fullscreen bookshelf display
- Auto-rotate every 30s: Bookshelf → Stats → Badges
- Real-time updates from phone scanner
- Dark/light mode toggle (localStorage)

### Admin Panel (`/admin`)
- Add/edit/delete books manually
- Set yearly reading goal
- Edit ratings & reviews
- Manage multiple readers

### Gamification
- Badge system (progress-based rewards)
- Leaderboard with point scoring
- Daily/weekly/monthly streaks
- Reading level/grade tracking

### Analytics (`/analytics`)
- Books read per month
- Average rating trends
- Reader comparison
- Goal progress tracking

### Family Features
- Multiple reader profiles
- Buddy system (social reading)
- Invite links for family members
- Weekly digest email (cron job)

## Firebase Schema (Firestore)

**Collections:**
- `families/{familyId}` — Household data (goal, preferences)
- `readers/{readerId}` — Child profiles (name, level, preferences)
- `books/{bookId}` — Book entries (ISBN, title, rating, coverUrl, dateRead)
- `rewards/{readerId}` — Badge/reward state
- `goals/{familyId}` — Reading targets

**Real-time Sync:** Any book add/update triggers Firebase listeners → TV updates instantly.

## Environment Variables (.env)

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_KID_NAME=Tolu (customize per family)
```

## Local Development

```bash
npm install
npm run dev           # http://localhost:5173
```

Scanner: `http://localhost:5173/`
Kiosk: `http://localhost:5173/kiosk`
Admin: `http://localhost:5173/admin`

## Deployment (Vercel)

1. Push to GitHub (auto-deploy on main)
2. Or: `vercel --prod`
3. Add .env vars in Vercel dashboard → redeploy

**Current URL:** https://kids-reading-tracker.vercel.app

## Known Features & TODOs

### ✅ Implemented
- Barcode scanning (ISBN/EAN-13)
- Real-time Firebase sync
- Multi-reader support
- Badge/reward system
- Reading analytics
- Dark/light mode
- PWA (installable on phone)
- Chore tracking
- Leaderboard gamification
- Weekly digest email
- Inactivity notifications

### 🚧 In Progress / Ideas
- Alexa integration (interaction model drafted)
- Advanced reading goals (by genre, author)
- Reading challenges/quests
- Social features expansion (sharing)
- Buddy reading sessions
- Grade/curriculum alignment
- Test/quiz module

## Service Worker & PWA

- **vite-plugin-pwa:** Auto-generates service worker, manifest, icons
- **Auto-reload on update:** When new version deployed, service worker reloads page automatically
- **Offline:** Scanner works offline, syncs when online

## Performance Notes

- Open Library API lookups are fast (~100-500ms)
- Firebase queries are real-time (sub-100ms for small families)
- Vercel cold starts: ~500-1000ms (acceptable for family app)
- Barcode scanning uses web camera (no server calls)

## Testing

- `/test` view for manual testing
- No automated test suite yet (could add Jest/Vitest)
- Manual QA: test on actual LG TV via Vercel URL

## Future Enhancements

1. **Alexa voice commands** — "Alexa, add a book to the reading tracker"
2. **School integration** — Auto-sync reading assignments
3. **Book club features** — Read same book, discussion threads
4. **Advanced goals** — Track by reading level, genre diversity
5. **Parent dashboard** — More detailed analytics & reports
6. **Mobile app** — Native iOS/Android wrapper (or PWA improvements)

---

## Quick Commands

```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build locally
vercel                   # Deploy to Vercel (staging)
vercel --prod            # Deploy to production
```

## Troubleshooting

**Scanner not finding books:** Check Open Library API is reachable (no CORS issues in modern browsers)
**TV not updating:** Verify Firebase credentials, check console for auth errors
**Service worker stuck:** Clear site data → hard reload (Ctrl+Shift+R)
**Dark mode doesn't persist:** Check localStorage permissions

---

**Last updated:** 2026-07-18
**Original commit:** 002e7f3 (Initial commit — Kids Reading Tracker)
