// YouTube Data API v3 wrapper

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search'
const YT_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos'

export interface YouTubeVideo {
  videoId: string
  title: string
  description: string
  channelTitle: string
  channelId: string
  publishedAt: string
  url: string
  viewCount?: number
  likeCount?: number
  commentCount?: number
}

export async function fetchYouTubeVideos(
  companyName: string,
  maxResults = 20
): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.warn('YOUTUBE_API_KEY not configured — skipping YouTube search')
    return []
  }

  // Search for videos
  const searchParams = new URLSearchParams({
    part: 'snippet',
    q: companyName,
    type: 'video',
    maxResults: String(Math.min(maxResults, 50)),
    order: 'relevance',
    key: apiKey,
  })

  let videoIds: string[] = []
  let searchItems: Array<{
    id: { videoId: string }
    snippet: {
      title: string
      description: string
      channelTitle: string
      channelId: string
      publishedAt: string
    }
  }> = []

  try {
    const searchRes = await fetch(`${YT_SEARCH_URL}?${searchParams}`)
    if (!searchRes.ok) {
      const text = await searchRes.text()
      console.warn(`YouTube search API error ${searchRes.status}: ${text}`)
      return []
    }
    const searchData = await searchRes.json()
    searchItems = searchData.items ?? []
    videoIds = searchItems.map((item) => item.id.videoId).filter(Boolean)
  } catch (err) {
    console.warn('YouTube search failed:', err)
    return []
  }

  if (videoIds.length === 0) return []

  // Fetch video stats
  const statsParams = new URLSearchParams({
    part: 'statistics',
    id: videoIds.join(','),
    key: apiKey,
  })

  let statsMap: Record<string, { viewCount?: string; likeCount?: string; commentCount?: string }> = {}

  try {
    const statsRes = await fetch(`${YT_VIDEOS_URL}?${statsParams}`)
    if (statsRes.ok) {
      const statsData = await statsRes.json()
      for (const item of statsData.items ?? []) {
        statsMap[item.id] = item.statistics ?? {}
      }
    }
  } catch (err) {
    console.warn('YouTube stats fetch failed:', err)
  }

  return searchItems.map((item) => {
    const stats = statsMap[item.id.videoId] ?? {}
    return {
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      viewCount: stats.viewCount ? parseInt(stats.viewCount) : undefined,
      likeCount: stats.likeCount ? parseInt(stats.likeCount) : undefined,
      commentCount: stats.commentCount ? parseInt(stats.commentCount) : undefined,
    }
  })
}
