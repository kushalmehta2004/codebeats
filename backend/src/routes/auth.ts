import { Router } from 'express';
import axios from 'axios';

import { config } from '../config';

export const authRouter = Router();

/**
 * GET /api/auth/github/start
 * Returns the GitHub OAuth authorization URL.
 */
authRouter.get('/github/start', (_req, res) => {
  if (!config.github.oauthClientId) {
    return res
      .status(400)
      .json({ error: 'GitHub OAuth is not configured. Set GITHUB_OAUTH_CLIENT_ID.' });
  }

  const params = new URLSearchParams({
    client_id: config.github.oauthClientId,
    redirect_uri: config.github.oauthRedirectUri,
    scope: 'public_repo read:user',
  });

  return res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
});

/**
 * GET /api/auth/github/callback
 * Exchanges OAuth code for an access token and redirects to frontend.
 */
authRouter.get('/github/callback', async (req, res) => {
  const code = String(req.query.code || '');
  if (!code) {
    return res.status(400).json({ error: 'Missing OAuth code.' });
  }

  if (!config.github.oauthClientId || !config.github.oauthClientSecret) {
    return res.status(400).json({
      error: 'GitHub OAuth is not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET.',
    });
  }

  try {
    const response = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: config.github.oauthClientId,
        client_secret: config.github.oauthClientSecret,
        code,
        redirect_uri: config.github.oauthRedirectUri,
      },
      {
        headers: {
          Accept: 'application/json',
        },
        timeout: 15000,
      },
    );

    const accessToken = response.data?.access_token as string | undefined;
    if (!accessToken) {
      return res.status(400).json({ error: 'OAuth token exchange failed.' });
    }

    const redirect = new URL(config.frontendBaseUrl);
    redirect.searchParams.set('oauth', 'success');
    redirect.searchParams.set('github_token', accessToken);
    return res.redirect(302, redirect.toString());
  } catch (err: any) {
    return res.status(500).json({ error: `OAuth callback failed: ${err?.message ?? 'unknown'}` });
  }
});
