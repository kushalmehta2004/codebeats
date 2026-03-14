import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { cacheGet, cacheSet } from '../cache/redis';
import type { GitHubTree, GitHubRepoInfo, CommitData, GitHubPR } from '../types';

// ─── Axios instance ───────────────────────────────────────────────────────────

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (config.github.token) {
    headers['Authorization'] = `Bearer ${config.github.token}`;
  }
  return headers;
}

const gh: AxiosInstance = axios.create({
  baseURL: config.github.apiBase,
  headers: buildHeaders(),
  timeout: 30_000,
});

// ─── Retry helper ─────────────────────────────────────────────────────────────

/**
 * Retries `fn` up to `retries` times with exponential back-off on 429/403 responses.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status = axiosErr?.response?.status;

      if (status === 429 || status === 403) {
        const retryAfterHeader = axiosErr.response?.headers?.['retry-after'];
        const waitMs = retryAfterHeader
          ? parseInt(String(retryAfterHeader), 10) * 1000
          : Math.pow(2, attempt) * 1_000;

        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error('withRetry: max retries exceeded');
}

// ─── Cache wrapper ────────────────────────────────────────────────────────────

/**
 * Returns a cached value if available, otherwise calls `fetcher`, caches and
 * returns its result. All values are JSON-serialised.
 */
async function cachedGet<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = await cacheGet(cacheKey);
  if (hit) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      // Corrupted cache entry — fall through and re-fetch
    }
  }
  const result = await fetcher();
  await cacheSet(cacheKey, JSON.stringify(result), config.cache.ttl);
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches basic repo metadata: default branch, star count, open issue count,
 * and repo size in kilobytes.
 */
export async function getRepoInfo(owner: string, repo: string): Promise<GitHubRepoInfo> {
  const key = `gh:repo:${owner}/${repo}`;
  return cachedGet(key, async () => {
    const { data } = await withRetry(() => gh.get(`/repos/${owner}/${repo}`));
    return {
      defaultBranch: data.default_branch as string,
      starCount: data.stargazers_count as number,
      openIssues: data.open_issues_count as number,
      sizeKb: data.size as number,
    };
  });
}

/**
 * Fetches the full recursive git tree for a given branch.
 * Uses a single API call via the Trees API with `recursive=1`.
 */
export async function getRepoTree(
  owner: string,
  repo: string,
  branch: string,
): Promise<GitHubTree> {
  const key = `gh:tree:${owner}/${repo}:${branch}`;
  return cachedGet(key, async () => {
    const { data } = await withRetry(() =>
      gh.get(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`),
    );
    return data as GitHubTree;
  });
}

/**
 * Fetches the raw UTF-8 text content of a git blob by its SHA.
 * Content is base-64 decoded from the GitHub Blob API response.
 */
export async function getBlobContent(
  owner: string,
  repo: string,
  sha: string,
): Promise<string> {
  const key = `gh:blob:${sha}`;
  return cachedGet(key, async () => {
    const { data } = await withRetry(() =>
      gh.get(`/repos/${owner}/${repo}/git/blobs/${sha}`),
    );
    if (data.encoding === 'base64') {
      return Buffer.from((data.content as string).replace(/\n/g, ''), 'base64').toString(
        'utf-8',
      );
    }
    return (data.content as string) || '';
  });
}

/**
 * Fetches up to `config.analysis.maxCommits` commits since `since` (ISO-8601 string).
 * Paginates automatically.
 */
export async function getCommits(
  owner: string,
  repo: string,
  since: string,
): Promise<CommitData[]> {
  const key = `gh:commits:${owner}/${repo}:${since}`;
  return cachedGet(key, async () => {
    const commits: CommitData[] = [];
    let page = 1;

    while (commits.length < config.analysis.maxCommits) {
      const { data } = await withRetry(() =>
        gh.get(`/repos/${owner}/${repo}/commits`, {
          params: { since, per_page: 100, page },
        }),
      );

      if (!Array.isArray(data) || data.length === 0) break;

      for (const c of data) {
        commits.push({
          sha: c.sha as string,
          message: (c.commit?.message as string) || '',
          date: (c.commit?.author?.date as string) || '',
          author: (c.commit?.author?.name as string) || '',
        });
      }

      if (data.length < 100) break;
      page++;
    }

    return commits.slice(0, config.analysis.maxCommits);
  });
}

/**
 * Fetches the 100 most-recently closed pull requests for PR review time analysis.
 */
export async function getClosedPRs(owner: string, repo: string): Promise<GitHubPR[]> {
  const key = `gh:prs:${owner}/${repo}`;
  return cachedGet(key, async () => {
    const { data } = await withRetry(() =>
      gh.get(`/repos/${owner}/${repo}/pulls`, {
        params: { state: 'closed', per_page: 100, sort: 'updated', direction: 'desc' },
      }),
    );
    return (data as any[]).map((pr) => ({
      createdAt: pr.created_at as string,
      mergedAt: (pr.merged_at as string | null) ?? null,
      closedAt: (pr.closed_at as string | null) ?? null,
    }));
  });
}
