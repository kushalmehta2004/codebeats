import express from 'express';
import cors from 'cors';
import { config } from './config';
import { analyzeRouter } from './routes/analyze';
import { galleryRouter } from './routes/gallery';
import { shareRouter } from './routes/share';
import { authRouter } from './routes/auth';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Request logger (development)
if (process.env.NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/analyze', analyzeRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/share', shareRouter);
app.use('/api/auth', authRouter);

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  console.log(`[server] Codebase Sonification API running on http://localhost:${config.port}`);
  console.log(`[server] GitHub token: ${config.github.token ? 'configured ✓' : 'missing (60 req/hr limit)'}`);
});

export { app, server };
