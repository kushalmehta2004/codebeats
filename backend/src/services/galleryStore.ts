import type { AnalysisResult, GalleryRepoSummary } from '../types';
import { getRedisClient } from '../cache/redis';

const KEY_LEADERBOARD = 'gallery:leaderboard';
const KEY_HALL_OF_FAME = 'gallery:hallOfFame';
const KEY_HALL_OF_SHAME = 'gallery:hallOfShame';
const KEY_REPO_HASH = (repoId: string) => `gallery:repo:${repoId}`;

type StoredRow = GalleryRepoSummary;

const memoryRows = new Map<string, StoredRow>();

function toStoredRow(result: AnalysisResult, previousCount: number): StoredRow {
  return {
    repoId: result.repoId,
    repoUrl: result.repoUrl,
    owner: result.owner,
    repo: result.repo,
    analyzeCount: previousCount + 1,
    lastHealthScore: result.healthScore,
    lastTempo: result.compositionConfig.tempo,
    lastMode: result.compositionConfig.mode,
    lastAnalyzedAt: result.analyzedAt,
  };
}

function parseLimit(raw: unknown, fallback = 10): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(value)));
}

function inMemorySorted(
  sorter: (a: StoredRow, b: StoredRow) => number,
  limit: number,
): GalleryRepoSummary[] {
  return Array.from(memoryRows.values())
    .sort(sorter)
    .slice(0, limit);
}

function tieBreaker(a: StoredRow, b: StoredRow): number {
  if (a.lastAnalyzedAt !== b.lastAnalyzedAt) {
    return b.lastAnalyzedAt.localeCompare(a.lastAnalyzedAt);
  }
  return a.repoId.localeCompare(b.repoId);
}

function scoreDescWithTie(scoreA: number, scoreB: number, a: StoredRow, b: StoredRow): number {
  if (scoreA !== scoreB) return scoreB - scoreA;
  return tieBreaker(a, b);
}

async function getRowsByRepoIds(repoIds: string[]): Promise<StoredRow[]> {
  const redis = getRedisClient();
  if (!redis || repoIds.length === 0) {
    return repoIds
      .map((repoId) => memoryRows.get(repoId))
      .filter((row): row is StoredRow => Boolean(row));
  }

  try {
    const pipeline = redis.pipeline();
    for (const repoId of repoIds) {
      pipeline.hgetall(KEY_REPO_HASH(repoId));
    }
    const responses = await pipeline.exec();
    if (!responses) throw new Error('Pipeline failed');

    const rows: StoredRow[] = [];
    responses.forEach((response, index) => {
      const [, payload] = response;
      if (!payload || typeof payload !== 'object') return;
      const obj = payload as Record<string, string>;
      if (!obj.repoId) return;
      rows.push({
        repoId: obj.repoId,
        repoUrl: obj.repoUrl,
        owner: obj.owner,
        repo: obj.repo,
        analyzeCount: Number(obj.analyzeCount || 0),
        lastHealthScore: Number(obj.lastHealthScore || 0),
        lastTempo: Number(obj.lastTempo || 60),
        lastMode: obj.lastMode === 'minor' ? 'minor' : 'major',
        lastAnalyzedAt: obj.lastAnalyzedAt || new Date(0).toISOString(),
      });
      memoryRows.set(obj.repoId, rows[rows.length - 1]);
    });

    return rows;
  } catch {
    return repoIds
      .map((repoId) => memoryRows.get(repoId))
      .filter((row): row is StoredRow => Boolean(row));
  }
}

export async function recordAnalysisRun(result: AnalysisResult): Promise<void> {
  const existing = memoryRows.get(result.repoId);
  const row = toStoredRow(result, existing?.analyzeCount ?? 0);
  memoryRows.set(result.repoId, row);

  const redis = getRedisClient();
  if (!redis) return;

  try {
    const hashKey = KEY_REPO_HASH(result.repoId);
    const previousCountRaw = await redis.hget(hashKey, 'analyzeCount');
    const previousCount = Number(previousCountRaw || 0);
    const nextRow = toStoredRow(result, previousCount);
    memoryRows.set(result.repoId, nextRow);

    const pipeline = redis.pipeline();
    pipeline.hset(hashKey, {
      repoId: nextRow.repoId,
      repoUrl: nextRow.repoUrl,
      owner: nextRow.owner,
      repo: nextRow.repo,
      analyzeCount: String(nextRow.analyzeCount),
      lastHealthScore: String(nextRow.lastHealthScore),
      lastTempo: String(nextRow.lastTempo),
      lastMode: nextRow.lastMode,
      lastAnalyzedAt: nextRow.lastAnalyzedAt,
    });
    pipeline.zadd(KEY_LEADERBOARD, String(nextRow.analyzeCount), nextRow.repoId);
    pipeline.zadd(KEY_HALL_OF_FAME, String(nextRow.lastHealthScore), nextRow.repoId);
    pipeline.zadd(KEY_HALL_OF_SHAME, String(-nextRow.lastHealthScore), nextRow.repoId);
    await pipeline.exec();
  } catch {
    // Non-fatal. Memory fallback is already updated.
  }
}

export async function getLeaderboard(limitRaw: unknown): Promise<GalleryRepoSummary[]> {
  const limit = parseLimit(limitRaw, 10);
  const redis = getRedisClient();
  if (!redis) {
    return inMemorySorted((a, b) => scoreDescWithTie(a.analyzeCount, b.analyzeCount, a, b), limit);
  }

  try {
    const repoIds = (await redis.zrevrange(KEY_LEADERBOARD, 0, limit - 1)) as string[];
    const rows = await getRowsByRepoIds(repoIds);
    return rows.sort((a, b) => scoreDescWithTie(a.analyzeCount, b.analyzeCount, a, b)).slice(0, limit);
  } catch {
    return inMemorySorted((a, b) => scoreDescWithTie(a.analyzeCount, b.analyzeCount, a, b), limit);
  }
}

export async function getHallOfFame(limitRaw: unknown): Promise<GalleryRepoSummary[]> {
  const limit = parseLimit(limitRaw, 10);
  const redis = getRedisClient();
  if (!redis) {
    return inMemorySorted((a, b) => scoreDescWithTie(a.lastHealthScore, b.lastHealthScore, a, b), limit);
  }

  try {
    const repoIds = (await redis.zrevrange(KEY_HALL_OF_FAME, 0, limit - 1)) as string[];
    const rows = await getRowsByRepoIds(repoIds);
    return rows.sort((a, b) => scoreDescWithTie(a.lastHealthScore, b.lastHealthScore, a, b)).slice(0, limit);
  } catch {
    return inMemorySorted((a, b) => scoreDescWithTie(a.lastHealthScore, b.lastHealthScore, a, b), limit);
  }
}

export async function getHallOfShame(limitRaw: unknown): Promise<GalleryRepoSummary[]> {
  const limit = parseLimit(limitRaw, 10);
  const redis = getRedisClient();
  if (!redis) {
    return inMemorySorted((a, b) => scoreDescWithTie(b.lastHealthScore, a.lastHealthScore, a, b), limit);
  }

  try {
    const repoIds = (await redis.zrange(KEY_HALL_OF_SHAME, 0, limit - 1)) as string[];
    const rows = await getRowsByRepoIds(repoIds);
    return rows.sort((a, b) => scoreDescWithTie(b.lastHealthScore, a.lastHealthScore, a, b)).slice(0, limit);
  } catch {
    return inMemorySorted((a, b) => scoreDescWithTie(b.lastHealthScore, a.lastHealthScore, a, b), limit);
  }
}
