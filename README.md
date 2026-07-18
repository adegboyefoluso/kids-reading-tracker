# Kids Reading Tracker

A family book tracker that runs on your LG webOS TV as a live kiosk, with a phone-based ISBN barcode scanner.

## Features
- **TV Kiosk** — fullscreen bookshelf, stats, and badges that auto-rotate every 30 seconds
- **Phone Scanner** — scan any book's ISBN barcode and the TV updates instantly
- **Real-time sync** — Firebase pushes changes to the TV the moment a book is added
- **PWA** — add the scanner page to your phone's home screen (no app store needed)
- **Admin Panel** — manage books, set yearly reading goal, edit ratings

---

## Setup (one-time, ~20 minutes)

### 1. Install Node.js
Download from https://nodejs.org (LTS version)

### 2. Create a Firebase project
1. Go to https://console.firebase.google.com
2. Click **Add project** → give it a name (e.g. "kids-reading-tracker")
3. Disable Google Analytics (not needed) → Create project
4. In the left sidebar: **Build → Firestore Database → Create database**
   - Choose **Start in test mode** (you can lock it down later)
   - Pick a region close to you
5. In the left sidebar: **Project Settings (gear icon) → Your apps → Web (</>)**
   - Register a web app with any nickname
   - Copy the `firebaseConfig` object values

### 3. Configure the app
In this folder, copy `.env.example` to `.env` and fill in your Firebase values:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_KID_NAME=Tolu        ← change to your child's name
```

### 4. Install & run locally
```bash
cd kids-reading-tracker
npm install
npm run dev
```
Open http://localhost:5173 in your browser — the app is running!

---

## Deploy to Vercel (free, gets a public URL for the TV)

1. Create a free account at https://vercel.com
2. Install the Vercel CLI: `npm install -g vercel`
3. In this folder run: `vercel`
4. Follow the prompts (defaults are fine)
5. Add your environment variables in Vercel:
   - Go to your project on vercel.com → Settings → Environment Variables
   - Add all 7 variables from your `.env` file
6. Redeploy: `vercel --prod`

You'll get a URL like `https://kids-reading-tracker.vercel.app`

---

## Using the App

### On the TV
1. Open the LG TV browser
2. Navigate to your Vercel URL
3. The kiosk auto-rotates: Bookshelf → Stats → Badges

**To make it auto-launch on TV startup:**
- LG webOS: Settings → General → System → Smart TV → Auto Start

### On your phone (scanner)
1. Open `your-url.vercel.app/scan` in your phone browser
2. Tap the browser menu → **"Add to Home Screen"**
3. It now appears as an app icon on your phone
4. Open it, allow camera access, point at the barcode on the back of any book
5. The book appears on the TV automatically!

### Admin panel
Open `your-url.vercel.app/admin` to:
- View and manage all books
- Set the yearly reading goal
- Edit ratings and reviews
- Delete books

---

## App Routes
| URL | What it does |
|-----|-------------|
| `/` | TV kiosk display |
| `/scan` | Phone barcode scanner |
| `/admin` | Admin panel |

---

## Tech Stack
- **React + Vite** — fast, modern frontend
- **Firebase Firestore** — real-time database
- **@zxing/browser** — barcode scanning (ISBN / EAN-13)
- **Open Library API** — free book lookup by ISBN (no key needed)
- **vite-plugin-pwa** — makes the scanner installable on phones
- **Vercel** — free hosting
