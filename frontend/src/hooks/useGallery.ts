import { useCallback, useEffect, useState } from 'react'

import type { GalleryRepoSummary } from '../types/composition'

type GallerySection = 'leaderboard' | 'hall-of-fame' | 'hall-of-shame'

function getGalleryEndpoint(section: GallerySection): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
  const path = `/api/gallery/${section}`
  if (!baseUrl || baseUrl.trim() === '') {
    return path
  }
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

async function fetchSection(section: GallerySection, limit = 10): Promise<GalleryRepoSummary[]> {
  const endpoint = `${getGalleryEndpoint(section)}?limit=${limit}`
  const response = await fetch(endpoint)
  if (!response.ok) {
    throw new Error(`Failed to load ${section} (${response.status})`)
  }

  const payload = (await response.json()) as { items?: GalleryRepoSummary[] }
  return payload.items ?? []
}

export interface UseGalleryResult {
  leaderboard: GalleryRepoSummary[]
  hallOfFame: GalleryRepoSummary[]
  hallOfShame: GalleryRepoSummary[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useGallery(limit = 10): UseGalleryResult {
  const [leaderboard, setLeaderboard] = useState<GalleryRepoSummary[]>([])
  const [hallOfFame, setHallOfFame] = useState<GalleryRepoSummary[]>([])
  const [hallOfShame, setHallOfShame] = useState<GalleryRepoSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [leaderboardItems, fameItems, shameItems] = await Promise.all([
        fetchSection('leaderboard', limit),
        fetchSection('hall-of-fame', limit),
        fetchSection('hall-of-shame', limit),
      ])
      setLeaderboard(leaderboardItems)
      setHallOfFame(fameItems)
      setHallOfShame(shameItems)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load gallery'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [limit])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    leaderboard,
    hallOfFame,
    hallOfShame,
    isLoading,
    error,
    refresh,
  }
}
