import { Router } from 'express';

import type { AnalysisResult } from '../types';
import { createShare, getShare } from '../services/shareStore';

export const shareRouter = Router();

/**
 * POST /api/share
 * Body: { analysis: AnalysisResult }
 * Returns: { id, url }
 */
shareRouter.post('/', async (req, res) => {
  const { analysis } = req.body as { analysis?: AnalysisResult };
  if (!analysis || typeof analysis !== 'object') {
    return res.status(400).json({ error: 'Request body must include an analysis object.' });
  }

  try {
    const id = await createShare(analysis);
    return res.json({ id, url: `/share/${id}` });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to create share: ${err?.message ?? 'unknown'}` });
  }
});

/**
 * GET /api/share/:id
 * Returns stored analysis payload.
 */
shareRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id || id.length < 4) {
    return res.status(400).json({ error: 'Invalid share id.' });
  }

  try {
    const analysis = await getShare(id);
    if (!analysis) {
      return res.status(404).json({ error: 'Share not found.' });
    }

    return res.json({ analysis });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to load share: ${err?.message ?? 'unknown'}` });
  }
});
