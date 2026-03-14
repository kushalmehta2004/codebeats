# PRD — Codebase Sonification Engine
**"I turn codebases into music. Healthy code sounds like jazz. Legacy code sounds like a horror movie."**

---

## 1. Overview

### 1.1 Product Summary
Codebase Sonification Engine is a web application that analyzes any public GitHub repository and composes a unique, listenable piece of music from its code quality metrics. Every structural and quality property of the codebase — complexity, test coverage, duplication, commit behavior — is mapped to a musical property, producing audio that lets you *feel* the health of a codebase rather than read it off a dashboard.

### 1.2 Problem Statement
Code quality dashboards exist everywhere. Nobody reads them. Numbers like "cyclomatic complexity: 47" or "test coverage: 23%" are meaningless to anyone who hasn't already internalized what those numbers feel like. Developers, engineering managers, and non-technical stakeholders all struggle to develop intuition for code health. Charts and percentages are cognitive overhead. Music is immediate and visceral.

### 1.3 Solution
Map code metrics to music theory properties in a way that makes the relationship feel natural and inevitable — not arbitrary. A codebase with high complexity and low test coverage should sound tense and unresolved. A clean, well-tested, modular codebase should sound harmonious and rhythmically stable. The listener should be able to tell the difference in the first 10 seconds — without reading a single number.

### 1.4 Target Users
- Final year CS/IT students building portfolio projects
- Engineering managers wanting a novel way to demo code health
- Developers curious about their own repositories
- Technical recruiters and interviewers (as a demo/talking point)

### 1.5 Success Metrics
- A listener with no context can correctly rank two codebases by health based on audio alone (user study target: 75% accuracy)
- Average session time > 4 minutes (user explores multiple repos)
- LinkedIn post demo video reaches 10k+ impressions
- GitHub repo earns 100+ stars within 30 days of launch post

---

## 2. Core Concept — The Metric-to-Music Mapping

This is the intellectual heart of the project. Every mapping must feel *justified* — the musical property should have an analogous relationship to the code property.

| Code Metric | Musical Property | Justification |
|---|---|---|
| Cyclomatic complexity (avg) | Harmonic complexity (chord tension) | Both measure the number of independent paths/possibilities |
| Test coverage % | Rhythmic stability (beat regularity) | Tests provide structural certainty, rhythm provides temporal certainty |
| Code duplication % | Repeated motifs (melodic repetition) | Duplication literally is repetition — the metaphor is exact |
| Bug density (open issues / LOC) | Dissonance level (out-of-tune intervals) | Bugs are things that sound wrong but exist in the system |
| Function length (avg lines) | Note duration / phrase length | Long functions = long, unwieldy musical phrases |
| Coupling (import density) | Harmonic interdependence (chord clusters) | Tightly coupled code = notes that can't exist without each other |
| Dead code % | Silence / rests | Code that does nothing = music that makes no sound |
| Commit frequency (last 90 days) | Tempo (BPM) | Active repos move fast, dormant repos are slow |
| Commit message sentiment (avg) | Mode (major vs minor) | Positive messages = major key, frustrated/negative = minor key |
| Lines of code (total) | Duration of piece | Bigger codebase = longer composition |
| File count | Number of instruments | More files = more voices in the ensemble |
| Average PR review time | Note articulation (staccato vs legato) | Fast reviews = crisp staccato, slow reviews = drawn-out legato |

### 2.1 Musical Structure
The composition follows a loose structure:
- **Introduction (4 bars):** Establishes the tempo (from commit frequency) and mode (from sentiment)
- **Theme (8 bars):** Main melodic line driven by complexity and duplication
- **Development (8 bars):** Variations introduce dissonance (bugs) and silence (dead code)
- **Resolution (4 bars):** Ends on a resolved or unresolved chord based on overall health score

---

## 3. Features

### 3.1 Phase 1 — Core (MVP)

**F-01: GitHub Repository Input**
- User pastes a public GitHub repo URL
- System validates the URL and checks API accessibility
- Shows a loading state with a progress indicator (parsing → analyzing → composing → rendering)
- Handles repos up to 50k LOC within 30 seconds

**F-02: Code Analysis Engine**
- Clones/fetches repo content via GitHub API (no full clone needed — use Contents API + Trees API)
- Parses JavaScript/TypeScript files using Babel parser for AST analysis
- Supports Python files using a Python microservice with the `ast` module
- Extracts per-file metrics: function count, avg function length, cyclomatic complexity estimate, import count
- Aggregates to repo-level metrics
- Fetches commit history (last 90 days) via GitHub API for tempo and sentiment

**F-03: Music Composition Engine**
- Takes normalized metric vector as input (all values scaled 0–1)
- Uses Tone.js for browser-based audio synthesis (no audio file generation needed)
- Implements the 12 metric-to-music mappings defined in Section 2
- Generates a 45–90 second composition
- Uses a pentatonic or diatonic scale to ensure the output is always somewhat musical even for bad codebases (pure noise is not the goal — tension within structure is)

**F-04: Playback Interface**
- Play/pause/restart controls
- Visual waveform animation synchronized to playback (CSS animation, not real waveform)
- Progress bar
- A live "what you're hearing now" panel — shows which metric is currently most audibly influencing the music at each moment

**F-05: Metrics Panel**
- Shows the extracted metrics alongside their musical translations
- Color-coded by health (green/amber/red)
- An overall "codebase health score" (0–100) derived as a weighted average of all metrics

**F-06: Repo Comparison Mode**
- Enter two repo URLs side by side
- Play both compositions with synchronized panels
- "Which sounds healthier?" prompt — reinforces the intuition

### 3.2 Phase 2 — Enhancements

**F-07: Export**
- Export composition as a WAV/MP3 file (using Tone.js offline rendering)
- Export metrics report as PDF
- Share as a URL that reconstructs the analysis (metrics cached in DB, composition regenerated on load)

**F-08: Language Support Expansion**
- Add Java (using a Java AST parser microservice)
- Add Go, Rust support
- Auto-detect language from repo composition and use appropriate parser

**F-09: Historical Playback**
- Select a date range and hear how the codebase's music has *changed over time*
- Composition evolves as code quality has evolved — play the "story" of a repo

**F-10: Embed Widget**
- Embeddable `<iframe>` widget for GitHub README files
- Shows a play button that plays the repo's composition

### 3.3 Phase 3 — Polish

**F-11: Instrument Themes**
- "Orchestra" theme: maps file types to instruments (JS → piano, CSS → strings, tests → percussion)
- "Electronic" theme: uses synthesizer voices
- "Minimal" theme: single instrument, stark and clean

**F-12: Public Gallery**
- Leaderboard of most-analyzed repos
- "Hall of Shame" — repos with the lowest health scores and their compositions
- "Hall of Fame" — repos with highest scores

---

## 4. Technical Architecture

### 4.1 System Overview

```
User (Browser)
    ↓ GitHub URL
Frontend (React + Vite)
    ↓ API call
Backend (Node/Express)
    ↓ GitHub API calls
GitHub REST API v3
    ↓ Raw file contents + commit history
Code Analysis Layer
    ├── JS/TS Parser (Babel — runs in Node)
    └── Python Parser (Flask microservice)
    ↓ Normalized metric vector
Composition Engine (Node)
    ↓ Composition config JSON
Frontend
    └── Tone.js (Web Audio API) → Sound output
```

### 4.2 Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React + Vite | Fast dev, component-based UI |
| Audio | Tone.js | Best browser audio synthesis library, free |
| Backend | Node.js + Express | Same language as frontend, fast I/O |
| Python service | Flask | Best AST tools are in Python |
| Database | PostgreSQL | Cache analysis results, store compositions |
| Caching | Redis | Cache GitHub API responses (rate limit: 60 req/hr unauthenticated, 5000 authenticated) |
| Deployment | Docker Compose | Packages Node + Flask + Redis + Postgres together |
| Hosting | Render / Railway | Free tier sufficient for portfolio |

### 4.3 GitHub API Strategy
- Use authenticated requests (GitHub OAuth App) to get 5000 req/hr
- Use the Git Trees API with `recursive=true` to get full file list in one request
- Fetch only files under 1MB (skip large generated files, lock files, minified JS)
- Cache all API responses in Redis with 24hr TTL
- Respect rate limits with exponential backoff

### 4.4 Cyclomatic Complexity Estimation
Full cyclomatic complexity requires expensive AST traversal. Use a lightweight proxy:
- Count decision points in AST: `if`, `else if`, `for`, `while`, `switch case`, `&&`, `||`, ternary operators
- This gives ~85% correlation with formal cyclomatic complexity at a fraction of the cost
- Normalize per function, then average across repo

### 4.5 Commit Sentiment Analysis
- Fetch last 200 commit messages via GitHub API
- Run through a pre-trained sentiment model (use `sentiment` npm package — lightweight, no API call needed)
- Average sentiment score across commits, weighted by recency (recent commits weighted higher)
- Map score to major/minor mode and melodic register

### 4.6 Tone.js Composition Architecture
```javascript
// Pseudocode for composition engine
const metrics = { complexity: 0.7, coverage: 0.3, duplication: 0.4, ... }

const tempo = 60 + (metrics.commitFrequency * 80)  // 60–140 BPM
const mode = metrics.sentiment > 0.5 ? 'major' : 'minor'
const dissonance = metrics.bugDensity  // 0 = consonant, 1 = atonal
const stability = metrics.testCoverage  // 0 = erratic rhythm, 1 = metronomic

const synth = new Tone.PolySynth()
const transport = Tone.getTransport()
transport.bpm.value = tempo

// Schedule composition using Tone.js sequence/pattern API
// Each metric influences a different musical dimension simultaneously
```

---

## 5. Data Models

### 5.1 Analysis Result
```json
{
  "repoId": "github:facebook/react",
  "analyzedAt": "2025-03-14T10:00:00Z",
  "metrics": {
    "cyclomaticComplexity": { "value": 4.2, "normalized": 0.42, "rating": "moderate" },
    "testCoverage": { "value": 71, "normalized": 0.71, "rating": "good" },
    "duplication": { "value": 8.3, "normalized": 0.17, "rating": "good" },
    "bugDensity": { "value": 0.003, "normalized": 0.3, "rating": "moderate" },
    "commitFrequency": { "value": 42, "normalized": 0.84, "rating": "excellent" },
    "commitSentiment": { "value": 0.62, "normalized": 0.62, "rating": "positive" },
    "avgFunctionLength": { "value": 18, "normalized": 0.36, "rating": "good" },
    "deadCodeEstimate": { "value": 3.1, "normalized": 0.06, "rating": "excellent" }
  },
  "healthScore": 74,
  "compositionConfig": { ... }
}
```

---

## 6. UI/UX Design Principles

### 6.1 Visual Language
- Dark background (code editor aesthetic)
- Minimal UI — the music is the product, not the interface
- Animated waveform visualization using Canvas API (purely aesthetic, not real waveform)
- Metric cards that animate in as each metric is analyzed (progressive disclosure)

### 6.2 Key Screens
1. **Landing page** — Hero with an animated waveform. One input field. One button. A "hear a demo" button plays facebook/react's composition immediately without requiring input.
2. **Analysis in progress** — Animated progress with step labels: "Fetching files → Analyzing complexity → Composing → Ready"
3. **Playback page** — Full screen player with metrics panel. Comparison mode accessible via a toggle.
4. **Gallery** — Grid of repo cards, each with a mini play button

---

## 7. Constraints and Limitations

- Only public repositories (no OAuth scope needed for private repos in MVP)
- Analysis capped at 50k LOC to stay within free API tier limits
- No real cyclomatic complexity (uses proxy metric) — this should be disclosed in the UI
- Tone.js requires user interaction before audio can play (browser autoplay policy) — handled with explicit play button

---

## 8. Development Phases Summary

| Phase | Duration | Deliverable |
|---|---|---|
| Phase 1 | Week 1–2 | GitHub API integration + metric extraction working for JS repos |
| Phase 2 | Week 3 | Tone.js composition engine with 6 core metric mappings |
| Phase 3 | Week 4 | Full UI, playback interface, metrics panel |
| Phase 4 | Week 5 | Python microservice for Python repo support |
| Phase 5 | Week 6 | Comparison mode, export, deployment, demo video |

---

## 9. Cursor / Copilot Implementation Prompt

Copy this prompt into Cursor or GitHub Copilot Chat at the start of a new project to get a phased build plan and then implement phase by phase:

---

```
You are a senior full-stack engineer helping me build a "Codebase Sonification Engine" — 
a web app that analyzes any public GitHub repository and composes a unique piece of music 
from its code quality metrics. This is a portfolio project for a final year IT student 
targeting full-stack and ML roles.

Here is the complete product spec:

CONCEPT:
Map code metrics to musical properties so you can *hear* codebase health:
- Cyclomatic complexity → harmonic complexity / chord tension
- Test coverage % → rhythmic stability (regular vs erratic beat)
- Code duplication % → repeated melodic motifs
- Bug density (open issues / LOC) → dissonance level
- Avg function length → note/phrase duration
- Commit frequency (last 90 days) → tempo (BPM)
- Commit message sentiment → musical mode (major = positive, minor = negative)
- Dead code estimate → silence / rests
- File count → number of instruments/voices

TECH STACK:
- Frontend: React + Vite + Tailwind CSS
- Audio: Tone.js (browser-based synthesis, no audio files)
- Backend: Node.js + Express
- Python microservice: Flask (for Python AST parsing)
- Database: PostgreSQL (cache analysis results)
- Cache: Redis (GitHub API response caching)
- Deployment: Docker Compose

GITHUB API STRATEGY:
- Use authenticated GitHub OAuth App (5000 req/hr)
- Use Git Trees API with recursive=true for full file listing
- Skip files > 1MB, lock files, minified JS, node_modules
- Cache all responses in Redis with 24hr TTL
- Support JS/TS in Phase 1, add Python in Phase 2

COMPOSITION STRUCTURE:
- Intro (4 bars): establishes tempo + mode
- Theme (8 bars): main melody driven by complexity + duplication
- Development (8 bars): dissonance + silence variations
- Resolution (4 bars): resolved chord if healthy, unresolved if not
- Total duration: 45–90 seconds
- Use pentatonic/diatonic scales — bad code should sound tense, not unlistenable

UI SCREENS:
1. Landing: hero + single repo URL input + "hear a demo" button (plays facebook/react)
2. Analysis progress: animated steps (Fetching → Analyzing → Composing → Ready)
3. Playback: full-screen player, animated waveform (CSS, not real), metrics panel, 
   "what you're hearing now" live annotation
4. Comparison mode: two repos side by side
5. Gallery: most analyzed repos with mini play buttons

PHASES I WANT YOU TO BUILD:

PHASE 1 — Backend + GitHub API Integration (Days 1–4):
- Set up Node/Express project with TypeScript
- Implement GitHub API client with authentication + Redis caching
- Implement file fetcher using Trees API
- Implement JS/TS metric extractor using Babel parser:
  * cyclomatic complexity proxy (count decision nodes in AST)
  * average function length
  * import/dependency count per file
  * dead code estimate (exported functions never imported)
- Implement commit history fetcher + sentiment analyzer (use 'sentiment' npm package)
- Implement metric normalizer (scale all values 0–1 against benchmarks)
- Expose POST /api/analyze endpoint returning normalized metric vector + raw metrics
- Write unit tests for metric extraction with 3 known repos

PHASE 2 — Composition Engine (Days 5–8):
- Set up Tone.js in React frontend
- Implement CompositionEngine class that takes metric vector and produces Tone.js schedule
- Implement all 9 metric-to-music mappings
- Implement 4-section structure (intro, theme, development, resolution)
- Implement pentatonic scale selector based on mode
- Implement real-time "what you're hearing" annotation system
- Test with 5 repos of varying quality to validate that better codebases sound better

PHASE 3 — Frontend UI (Days 9–12):
- Build landing page with animated waveform hero + URL input
- Build analysis progress page with step-by-step animation
- Build playback page: waveform animation, play/pause/restart, progress bar
- Build metrics panel with color-coded cards and health score
- Build comparison mode (two repos, synchronized playback)
- Make fully responsive

PHASE 4 — Python Support + Polish (Days 13–16):
- Set up Flask microservice for Python AST analysis
- Implement Python metric extraction using ast module
- Add language detection + routing (JS files → Node parser, .py files → Flask)
- Add WAV export using Tone.js offline rendering
- Add shareable URL (cache metrics in PostgreSQL, regenerate composition on load)
- Add public gallery page

PHASE 5 — Deployment (Days 17–18):
- Write Docker Compose file (Node app + Flask service + PostgreSQL + Redis)
- Deploy to Render or Railway (free tier)
- Set up GitHub OAuth App for authenticated API access
- Write comprehensive README with demo GIF, architecture diagram, and setup guide
- Record 60-second demo video: play linux kernel vs clean Next.js starter side by side

For each phase, please:
1. First give me a detailed implementation plan with file structure
2. Then implement each file completely with no placeholders
3. After each phase, run the code and fix any errors before moving to the next phase
4. Use TypeScript throughout
5. Add JSDoc comments to all public functions
6. Handle all error cases gracefully with user-friendly messages

Start with Phase 1. Give me the complete file structure first, then implement each file.
```

---
