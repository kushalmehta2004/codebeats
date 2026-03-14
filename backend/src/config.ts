import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),

  github: {
    token: process.env.GITHUB_TOKEN || '',
    apiBase: 'https://api.github.com',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  cache: {
    /** 24 hours in seconds */
    ttl: 86_400,
  },

  analysis: {
    /** Skip files larger than 1 MB */
    maxFileSizeBytes: 1_000_000,
    /** Stop analysis if total LOC across all JS/TS files exceeds this */
    maxLOC: 50_000,
    /** Cap the number of files fetched from GitHub */
    maxFiles: 300,
    /** Maximum commit messages to fetch for sentiment analysis */
    maxCommits: 200,
    /** Look-back window for commit frequency */
    commitWindowDays: 90,
    /** Max concurrent GitHub blob fetches */
    fetchConcurrency: 10,
  },
} as const;
