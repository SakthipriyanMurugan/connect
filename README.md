# VERTEX CONNECT

> **All-in-One Business Communication & AI Call Intelligence Platform**  
> Built for JM Vertex Technologies · 0-Cost High-Efficiency Architecture

---

## 🚀 Overview

**VERTEX CONNECT** is an enterprise-grade unified communication suite engineered for high performance, modern liquid-glass aesthetics, and complete data privacy at zero infrastructure cost.

### Core Capabilities:
- **Audio/Video Calling & Screen Sharing (Phase 3)**: WebRTC + LiveKit Cloud SFU (`wss://connect-jflh7xn8.livekit.cloud`), 1080p video, 60fps screen sharing, incoming call ringing popup, and picture-in-picture local view.
- **Unique Connect ID (`@username`)**: Live availability badge during registration (`Available` vs `Taken`).
- **Profile & Settings**: Dedicated user profile management with Connect ID copy badge, bio, status, and avatar customizer.
- **Search & Connect Workflow**: Instant teammate discovery by Connect ID with connection request & accept pairing.
- **WhatsApp-Style 1-to-1 Chat**: Real-time messaging, file/attachment sharing (images, PDFs, documents) with inline previews and downloads.
- **Cloudflare D1 Cloud Database**: Serverless edge SQL database (`connect`) with real-time cloud auto-sync.
- **Zero-Cost High Efficiency Stack**: FastAPI + Cloudflare D1 / SQLite, React 19 + Vite + Tailwind CSS, Gmail SMTP, and WebSockets.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons | Liquid glass responsive UI, live queries, WebSocket client |
| **WebRTC & Calling** | LiveKit Cloud SFU + WebRTC Media Streams | Ultra-low latency (<50ms) audio/video calls, screen sharing |
| **Backend** | Python 3.13, FastAPI, Uvicorn, livekit-api | Async RESTful API, WebSockets, LiveKit Token generation |
| **Authentication** | JWT (HS256) + Passlib (bcrypt) + Gmail SMTP OTP | Passwordless / Password login with OTP email verification |
| **Database** | Cloudflare D1 Cloud DB + SQLite (`vertex_connect.db`) | Zero-cost persistent storage with global edge sync |
| **Realtime Signaling** | Native FastAPI WebSockets | Instant messaging, call invites, presence alerts |

---

## 📂 Project Structure

```
vertex/
├── backend/
│   ├── app/
│   │   ├── core/         # Config, JWT tokens, bcrypt security
│   │   ├── db/           # Async database engine & session
│   │   ├── models/       # User, UserConnection, Message models
│   │   ├── services/     # Gmail SMTP OTP verification service
│   │   └── main.py       # FastAPI application routes & WebSocket manager
│   ├── uploads/          # User-shared attachments (images, PDFs, docs)
│   ├── requirements.txt  # Python backend dependencies
│   ├── test_phase2_e2e.py# Full end-to-end automated test suite
│   ├── view_users.py     # CLI utility to view registered users
│   └── .env.example      # Environment variable template
├── frontend/
│   ├── src/
│   │   ├── components/   # Auth, Pages (Messages, Settings, Meetings, Intelligence, etc.)
│   │   ├── context/      # AuthContext, AppearanceContext
│   │   └── types/        # TypeScript interfaces
│   ├── package.json      # Node dependencies
│   └── vite.config.ts    # Vite bundler config
├── run_dev.ps1           # One-click startup script for both servers
└── README.md
```

---

## ⚡ Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+ (tested on Node 20+)
- npm

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Configure your SMTP credentials in .env
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173** to access the application.  
API documentation is available at **http://localhost:8000/docs**.

---

## 🔒 Security & Privacy
- Sensitive keys and secrets (`.env`) are strictly excluded from version control.
- Passwords are encrypted with `bcrypt`.
- File uploads are validated and stored with sanitized timestamped filenames.
