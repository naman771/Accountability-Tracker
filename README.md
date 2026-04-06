# PlacePrep — Campus Placement Accountability Tracker

A full-stack web application for tracking campus placement preparation with weekly/daily goals, progress tracking, a dynamic calendar, and a social accountability system with friends.

## Features

- **Goal Management** — Create weekly or daily goals with custom targets and units
- **Daily Progress Tracking** — Update completion percentage for each day with notes
- **Dynamic Calendar** — Monthly heatmap-style calendar with color-coded progress (green ≥75%, yellow 40–74%, red <40%), streak detection, and tooltips
- **Friends System** — Add friends, accept/reject requests, and view each other's public progress
- **Privacy Controls** — Toggle goals between public and private (hidden from friends)
- **Secure Auth** — User registration with security question for password recovery
- **Password Reset** — Forgot password flow using security question verification (no email required)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS, HTML, CSS (Vite bundled) |
| Backend | Node.js, Express |
| Database | SQLite (better-sqlite3) |
| Auth | bcryptjs, express-session |
| Fonts | DM Sans, JetBrains Mono |
| Icons | Inline SVG (Lucide-style) |

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation

```bash
git clone https://github.com/naman771/Accountability-Tracker.git
cd Accountability-Tracker
npm install
```

### Run (Development)

```bash
npm run dev
```

This starts both the Express API server (port 3000) and the Vite dev server (port 5173) concurrently.

Open **http://localhost:5173** in your browser.

### Build & Production

```bash
npm run build
npm start
```

The production server runs on **http://localhost:3000**.

## Project Structure

```
├── server.js              # Express server + session config
├── db.js                  # SQLite database setup + migrations
├── routes/
│   ├── auth.js            # Login, register, password reset
│   ├── goals.js           # Weekly/daily goal CRUD
│   ├── progress.js        # Daily progress updates + calendar data
│   └── friends.js         # Friend requests, search, management
├── src/
│   ├── main.js            # Frontend application logic
│   └── style.css          # Complete design system (monochrome theme)
├── index.html             # Single-page application shell
└── package.json
```

## Design

- **Theme** — Professional black-and-white monochrome with sharp corners
- **Typography** — DM Sans (body) + JetBrains Mono (data/badges)
- **Icons** — Inline SVG icons throughout (no emoji)
- **Animations** — Subtle micro-animations on modals, buttons, and calendar cells

## Security

- Passwords are hashed with **bcrypt** (10 rounds)
- Security question answers are also **bcrypt-hashed** and must be lowercase
- Sessions managed via **express-session** with server-side storage

## License

MIT
