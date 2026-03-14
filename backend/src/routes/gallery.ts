import { Router } from 'express';
import {
  getHallOfFame,
  getHallOfShame,
  getLeaderboard,
} from '../services/galleryStore';

export const galleryRouter = Router();

galleryRouter.get('/leaderboard', async (req, res) => {
  try {
    const items = await getLeaderboard(req.query.limit);
    res.json({ items, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch leaderboard: ${err?.message ?? 'unknown'}` });
  }
});

galleryRouter.get('/hall-of-fame', async (req, res) => {
  try {
    const items = await getHallOfFame(req.query.limit);
    res.json({ items, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch hall of fame: ${err?.message ?? 'unknown'}` });
  }
});

galleryRouter.get('/hall-of-shame', async (req, res) => {
  try {
    const items = await getHallOfShame(req.query.limit);
    res.json({ items, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch hall of shame: ${err?.message ?? 'unknown'}` });
  }
});
