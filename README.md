# 🎵 CodeBeats

> **"I turn codebases into music. Healthy code sounds like jazz. Legacy code sounds like a horror movie."**

CodeBeats is a web application that analyzes any public GitHub repository and composes a unique, listenable piece of music from its code quality metrics. Every structural and quality property of the codebase — complexity, test coverage, duplication, commit behavior — is mapped to a musical property, producing audio that lets you *feel* the health of a codebase rather than read it off a dashboard.

---

## 🎯 The Concept

Code quality dashboards exist everywhere. Nobody reads them. Numbers like "cyclomatic complexity: 47" are meaningless to anyone who hasn't already internalized what those numbers *feel* like. CodeBeats makes code health immediate and visceral — a listener can tell the difference between a healthy and unhealthy codebase **in the first 10 seconds**.

### Metric → Music Mappings

| Code Metric | Musical Property | Why It Works |
|---|---|---|
| Cyclomatic complexity | Harmonic complexity / chord tension | Both measure the number of independent paths |
| Test coverage % | Rhythmic stability (beat regularity) | Tests provide structural certainty; rhythm provides temporal certainty |
| Code duplication % | Repeated melodic motifs | Duplication literally is repetition |
| Bug density (open issues / LOC) | Dissonance level (out-of-tune intervals) | Bugs are things that sound wrong but exist in the system |
| Avg function length | Note / phrase duration | Long functions = long, unwieldy musical phrases |
| Coupling (import density) | Harmonic interdependence (chord clusters) | Tightly coupled code = notes that can't exist without each other |
| Dead code estimate | Silence / rests | Code that does nothing = music that makes no sound |
| Commit frequency (90 days) | Tempo (BPM) | Active repos move fast; dormant repos are slow |
| Commit message sentiment | Mode (major vs minor) | Positive messages = major key; frustrated = minor key |
| Lines of code | Duration of piece | Bigger codebase = longer composition |
| File count | Number of instruments | More files = more voices in the ensemble |
| Avg PR review time | Note articulation (staccato vs legato) | Fast reviews = crisp staccato; slow reviews = drawn-out legato |

---

## 🏗️ Architecture

```
User (Browser)
    ↓ GitHub URL
Frontend (React + Vite + Tailwind)         ← Phase 3
    ↓ POST /api/analyze
Backend (Node.js + Express + TypeScript)   ← Phase 1 ✅
    ↓ GitHub API calls (authenticated, Redis-cached)
GitHub REST API v3
    ↓ File contents + commit history + PRs
Code Analysis Layer
    ├── JS/TS Parser (Babel AST)           ← Phase 1 ✅
    └── Python Parser (Flask microservice) ← Phase 4
    ↓ Normalized metric vector (12 values, all 0–1)
Composition Engine (Tone.js)               ← Phase 2
    └── Web Audio API → Sound output
```

---

## 🚀 Current Status

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Backend + GitHub API + metric extraction | ✅ Complete |
| **Phase 2** | Tone.js composition engine | 🔜 Next |
| **Phase 3** | React frontend UI | 🔜 |
| **Phase 4** | Python microservice + export + gallery | 🔜 |
| **Phase 5** | Docker deployment + README demo | 🔜 |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Audio | Tone.js (Web Audio API) |
| Backend | Node.js + Express + TypeScript |
| Python service | Flask (Phase 4) |
| Database | PostgreSQL |
| Cache | Redis (GitHub API response caching, 24h TTL) |
| Deployment | Docker Compose |

---

## ⚙️ Local Development (Phase 1 — Backend)

### Prerequisites
- Node.js 18+
- Docker (optional, for Redis caching)
- A GitHub Personal Access Token ([create one here](https://github.com/settings/tokens/new) — `public_repo` scope)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/kushalmehta2004/codebeats.git
cd codebeats

# 2. Install backend dependencies
cd backend
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add your GITHUB_TOKEN
```

### Start Redis (optional but recommended)
```bash
# From project root
docker-compose up redis -d
```

### Run the backend
```bash
cd backend
npm run dev
# Server starts at http://localhost:3001
```

### Analyze a repository
```bash
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://github.com/expressjs/express"}'
```

**PowerShell:**
```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/analyze `
  -ContentType "application/json" `
  -Body '{"url":"https://github.com/expressjs/express"}'
```

### Run tests
```bash
npm test
# 55 tests across 3 suites
```

---

## 📊 API Reference

### `POST /api/analyze`

Analyzes a public GitHub repository and returns metrics + composition config.

**Request body:**
```json
{ "url": "https://github.com/owner/repo" }
```

**Response:**
```json
{
  "repoId": "github:expressjs/express",
  "healthScore": 79,
  "analyzedAt": "2026-03-14T05:46:01.428Z",
  "raw": {
    "totalLOC": 21487,
    "fileCount": 141,
    "avgCyclomaticComplexity": 2.1,
    "avgFunctionLength": 10.1,
    "testCoverageProxy": 1.0,
    "commitFrequency": 31,
    "commitSentiment": 0.001,
    "bugDensity": 0.0088,
    "duplicationRatio": 0.068,
    "deadCodeRatio": 0,
    "importDensity": 2.88,
    "avgPRReviewTimeHours": 1512
  },
  "normalized": { ... },
  "compositionConfig": {
    "tempo": 85,
    "mode": "major",
    "dissonance": 0.44,
    "rhythmicStability": 1.0,
    "motifRepetition": 0.17,
    "voiceCount": 2,
    "totalDurationSeconds": 64
  },
  "metrics": [
    {
      "name": "cyclomaticComplexity",
      "display": "Cyclomatic Complexity",
      "rawValue": 2.1,
      "rating": "excellent",
      "musicalMapping": "Harmonic complexity / chord tension"
    }
  ]
}
```

**Error responses:**

| Status | Meaning |
|---|---|
| `400` | Invalid or missing URL |
| `404` | Repository not found or private |
| `429` | GitHub API rate limit exceeded |
| `500` | Internal analysis error |

### `GET /health`
Returns `{ "status": "ok", "timestamp": "..." }`

---

## 🧪 Tested With

| Repository | Health Score | Tempo | Mode | Notes |
|---|---|---|---|---|
| `expressjs/express` | 79/100 | 85 BPM | major | Clean, well-tested |
| More repos coming as phases progress | — | — | — | — |

---

## 📁 Project Structure

```
codebeats/
├── backend/                        # Node.js + Express API
│   ├── src/
│   │   ├── index.ts                # Express server entry point
│   │   ├── config.ts               # Environment config
│   │   ├── types/index.ts          # All TypeScript interfaces
│   │   ├── cache/redis.ts          # Redis client (graceful fallback)
│   │   ├── routes/analyze.ts       # POST /api/analyze
│   │   └── services/
│   │       ├── githubClient.ts     # GitHub API + caching
│   │       ├── fileFetcher.ts      # Trees API file fetching
│   │       ├── metricExtractor.ts  # Babel AST analysis
│   │       ├── commitAnalyzer.ts   # Commit history + sentiment
│   │       └── metricNormalizer.ts # 0–1 normalization + composition config
│   ├── tests/                      # Jest unit tests (55 tests)
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── docker-compose.yml              # Redis + PostgreSQL
├── PRD_1_Codebase_Sonification.md  # Full product spec
└── README.md
```

---

## 🤝 Contributing

This is a portfolio project actively in development. Phases 2–5 are coming soon. Feel free to open issues or PRs.

---

## 📄 License

MIT
