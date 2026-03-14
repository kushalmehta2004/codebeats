import { randomUUID } from 'crypto';

import { Pool } from 'pg';

import { config } from '../config';
import type { AnalysisResult } from '../types';

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS shared_analyses (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let pool: Pool | null = null;
let tableReady = false;

const memoryStore = new Map<string, AnalysisResult>();

function getPool(): Pool {
  if (pool) return pool;

  pool = new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    max: 8,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000,
  });

  pool.on('error', (err) => {
    console.warn('[shareStore] PostgreSQL pool error:', err.message);
  });

  return pool;
}

async function ensureTable(): Promise<void> {
  if (tableReady) return;

  const db = getPool();
  await db.query(TABLE_SQL);
  tableReady = true;
}

/**
 * Stores an analysis payload and returns a share id.
 * Falls back to in-memory storage when Postgres is unavailable.
 */
export async function createShare(result: AnalysisResult): Promise<string> {
  const id = randomUUID().slice(0, 12);

  try {
    await ensureTable();
    await getPool().query(
      `INSERT INTO shared_analyses (id, repo_id, repo_url, payload) VALUES ($1, $2, $3, $4::jsonb)`,
      [id, result.repoId, result.repoUrl, JSON.stringify(result)],
    );
    return id;
  } catch (err: any) {
    console.warn(`[shareStore] Falling back to memory store for share id ${id}: ${err?.message ?? 'unknown'}`);
    memoryStore.set(id, result);
    return id;
  }
}

/**
 * Loads a shared analysis by id. Returns null if not found.
 */
export async function getShare(id: string): Promise<AnalysisResult | null> {
  const memoryHit = memoryStore.get(id);
  if (memoryHit) return memoryHit;

  try {
    await ensureTable();
    const rows = await getPool().query<{ payload: AnalysisResult }>(
      `SELECT payload FROM shared_analyses WHERE id = $1 LIMIT 1`,
      [id],
    );

    if (rows.rowCount === 0 || !rows.rows[0]) {
      return null;
    }

    await getPool().query(
      `UPDATE shared_analyses SET last_accessed_at = NOW() WHERE id = $1`,
      [id],
    );

    return rows.rows[0].payload;
  } catch (err: any) {
    console.warn(`[shareStore] Failed to read share ${id}: ${err?.message ?? 'unknown'}`);
    return null;
  }
}
