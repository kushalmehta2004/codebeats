import { config } from '../config';
import { getRepoInfo, getRepoTree, getBlobContent } from './githubClient';
import type { ParsedFile } from '../types';

// ─── Filters ──────────────────────────────────────────────────────────────────

const SOURCE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|py)$/i;

/** Paths containing these segments are skipped entirely. */
const SKIP_PATH_SEGMENTS = /node_modules|\.min\.|dist\/|build\/|coverage\/|__snapshots__|\.d\.ts$|\.lock$|-lock\.json$/;

// ─── Concurrency limiter ─────────────────────────────────────────────────────

/**
 * Runs `fn` over each item with at most `concurrency` parallel calls at once.
 * Preserves result order. Failed items produce `null` in the output array.
 */
async function pLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        // Individual file fetch failures are non-fatal
        const path = (items[idx] as any)?.path ?? String(idx);
        console.warn(`[fileFetcher] Skipping ${path}:`, (err as Error).message);
        results[idx] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches JS/TS/Python source files from a public GitHub repository.
 *
 * Strategy:
 *  1. One `GET /git/trees?recursive=1` call fetches the full file list.
 *  2. Files are filtered (type, extension, path segment, size).
 *  3. Content is fetched in parallel (capped at `maxFiles` and `fetchConcurrency`).
 *
 * @returns Array of `ParsedFile` objects (path, content, line count).
 */
export async function fetchRepoFiles(owner: string, repo: string): Promise<ParsedFile[]> {
  const repoInfo = await getRepoInfo(owner, repo);
  const tree = await getRepoTree(owner, repo, repoInfo.defaultBranch);

  if (tree.truncated) {
    console.warn(
      `[fileFetcher] Tree for ${owner}/${repo} is truncated (>100k items). ` +
        'Analysis will use a partial file list.',
    );
  }

  // Filter to source blobs within the size limit
  const candidates = tree.tree.filter((item) => {
    if (item.type !== 'blob') return false;
    if (!SOURCE_EXT.test(item.path)) return false;
    if (SKIP_PATH_SEGMENTS.test(item.path)) return false;
    if ((item.size ?? 0) > config.analysis.maxFileSizeBytes) return false;
    return true;
  });

  const limited = candidates.slice(0, config.analysis.maxFiles);

  console.log(
    `[fileFetcher] ${owner}/${repo}: ${candidates.length} source files found, ` +
      `fetching ${limited.length}`,
  );

  // Fetch contents concurrently
  const rawResults = await pLimit(
    limited,
    async (item) => {
      const content = await getBlobContent(owner, repo, item.sha);
      return {
        path: item.path,
        content,
        loc: content.split('\n').length,
      } as ParsedFile;
    },
    config.analysis.fetchConcurrency,
  );

  const files = rawResults.filter((f): f is ParsedFile => f !== null);

  const totalLOC = files.reduce((acc, f) => acc + f.loc, 0);
  console.log(`[fileFetcher] Fetched ${files.length} files, ${totalLOC.toLocaleString()} LOC`);

  return files;
}
