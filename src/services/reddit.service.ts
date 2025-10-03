import { summarizeRedditContent } from './ai.service'

interface RedditPost {
  data: {
    title: string
    id: string
    ups: number
    num_comments: number
    permalink: string
    subreddit: string
  }
}

interface RedditComment {
  data: {
    body: string
    ups: number
    author: string
  }
}

interface RedditApiResponse {
  data: {
    children: RedditPost[]
  }
}

interface RedditCommentsResponse {
  data: {
    children: RedditComment[]
  }
}

export class RedditService {
  private accessToken: string | null = null
  private tokenExpiry: number = 0

  private generateSearchQueries(name: string, shortName: string | null): string[] {
    const queries: string[] = []

    // French nature keywords
    const frenchKeywords = ['recommendations', 'randonnée', 'nature', 'visite', 'balade', 'paysage', 'endroit']
    frenchKeywords.forEach((keyword) => {
      queries.push(`${keyword} ${name}`)
      if (shortName) {
        queries.push(`${keyword} ${shortName}`)
      }
    })

    // English nature keywords
    const englishKeywords = [
      'recommendations',
      'landscape',
      'discover',
      'hiking',
      'nature',
      'visit',
      'trekking',
      'off the beaten path',
    ]
    englishKeywords.forEach((keyword) => {
      queries.push(`${name} ${keyword}`)
      if (shortName) {
        queries.push(`${shortName} ${keyword}`)
      }
    })

    // Remove duplicates and return
    return [...new Set(queries)]
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    const clientId = process.env.REDDIT_CLIENT_ID
    const clientSecret = process.env.REDDIT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error('❌ Reddit credentials not configured')
      return null
    }

    try {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

      const response = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'EmpreinteBot/1.0 (Nature Places Data Enhancement)',
        },
        body: 'grant_type=client_credentials',
      })

      if (!response.ok) {
        console.error('❌ Failed to get Reddit access token:', response.statusText)
        return null
      }

      const data = (await response.json()) as { access_token: string; expires_in: number }
      this.accessToken = data.access_token
      this.tokenExpiry = Date.now() + data.expires_in * 1000 - 60000 // Expire 1 minute early

      return this.accessToken
    } catch (error) {
      console.error('❌ Error getting Reddit access token:', error)
      return null
    }
  }

  private async searchRedditPosts(name: string, shortName: string | null): Promise<RedditPost[]> {
    const token = await this.getAccessToken()
    if (!token) {
      return []
    }

    try {
      // Enhanced subreddit list including French and regional subreddits
      const internationalSubreddits = [
        'hiking',
        'camping',
        'travel',
        'nationalparks',
        'outdoors',
        'backpacking',
        'earthporn',
        'natureporn',
      ]
      const frenchSubreddits = ['france', 'paris', 'randonnee', 'francetravel']
      const allSubreddits = [...internationalSubreddits, ...frenchSubreddits]

      // Generate multiple search queries using the new strategy
      const searchQueries = this.generateSearchQueries(name, shortName)

      let allPosts: RedditPost[] = []

      console.log(`🔍 Searching Reddit with ${searchQueries.length} different queries for: ${name}`)

      for (const query of searchQueries) {
        // Try both with and without subreddit restrictions for broader coverage
        const searches = [
          // Search within specific subreddits
          {
            query: `${query} (${allSubreddits.map((sub) => `subreddit:${sub}`).join(' OR ')})`,
            type: 'targeted',
          },
          // General search for popular posts
          {
            query: query,
            type: 'general',
          },
        ]

        for (const search of searches) {
          try {
            const response = await fetch(
              `https://oauth.reddit.com/search?q=${encodeURIComponent(search.query)}&sort=top&t=all&limit=5`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'User-Agent': 'EmpreinteBot/1.0 (Nature Places Data Enhancement)',
                },
              },
            )

            if (response.ok) {
              const data = (await response.json()) as RedditApiResponse
              allPosts.push(...data.data.children)

              if (data.data.children.length > 0) {
                console.log(`📱 Found ${data.data.children.length} posts for query: "${query}" (${search.type})`)
              }
            }

            // Small delay between requests to be respectful
            await new Promise((resolve) => setTimeout(resolve, 300))
          } catch (error) {
            console.warn(`⚠️ Error with search query "${search.query}":`, error)
          }
        }
      }

      // Remove duplicates and sort by upvotes
      const uniquePosts = allPosts.filter(
        (post, index, self) => index === self.findIndex((p) => p.data.id === post.data.id),
      )

      console.log(`📊 Total unique posts found: ${uniquePosts.length}`)

      return uniquePosts.sort((a, b) => b.data.ups - a.data.ups).slice(0, 8) // Top 8 posts for better coverage
    } catch (error) {
      console.error('❌ Error searching Reddit posts:', error)
      return []
    }
  }

  private async getPostComments(permalink: string): Promise<string[]> {
    const token = await this.getAccessToken()
    if (!token) {
      return []
    }

    try {
      const response = await fetch(`https://oauth.reddit.com${permalink}.json?sort=top&limit=10`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'EmpreinteBot/1.0 (Nature Places Data Enhancement)',
        },
      })

      if (!response.ok) {
        return []
      }

      const data = await response.json()

      if (!Array.isArray(data) || data.length < 2) {
        return []
      }

      const commentsData: RedditCommentsResponse = data[1]
      const comments = commentsData.data.children
        .filter(
          (comment) => comment.data.body && comment.data.body !== '[deleted]' && comment.data.body !== '[removed]',
        )
        .sort((a, b) => b.data.ups - a.data.ups)
        .slice(0, 5) // Top 5 comments
        .map((comment) => comment.data.body.slice(0, 500)) // Limit comment length

      return comments
    } catch (error) {
      console.error('❌ Error getting Reddit comments:', error)
      return []
    }
  }

  public async searchAndSummarizeRedditDiscussions(
    name: string,
    shortName: string | null,
  ): Promise<{ summary: string | null; rawData: any | null }> {
    try {
      console.log(`🔍 Searching Reddit discussions for place: ${name}`)

      const posts = await this.searchRedditPosts(name, shortName)

      if (posts.length === 0) {
        console.log(`❌ No Reddit discussions found for ${name}`)
        return { summary: null, rawData: null }
      }

      console.log(`📱 Found ${posts.length} relevant Reddit posts`)

      const threadsWithComments = []

      for (const post of posts) {
        const comments = await this.getPostComments(post.data.permalink)

        if (comments.length > 0) {
          threadsWithComments.push({
            title: post.data.title,
            comments: comments,
          })
        }

        // Add delay between requests to be respectful to Reddit API
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      if (threadsWithComments.length === 0) {
        console.log(`❌ No Reddit comments found for ${name}`)
        return { summary: null, rawData: null }
      }

      console.log(`📄 Processing ${threadsWithComments.length} threads with comments, sending to AI for summarization`)

      const summary = await summarizeRedditContent(name, { threads: threadsWithComments })

      // Store raw data for historical reference
      const rawData = {
        threads: threadsWithComments,
        posts: posts.map((p) => ({ title: p.data.title, subreddit: p.data.subreddit, ups: p.data.ups })),
      }

      if (summary) {
        console.log(`✅ Generated Reddit summary for ${name}`)
      } else {
        console.log(`❌ No relevant Reddit summary generated for ${name}`)
      }

      return { summary, rawData }
    } catch (error) {
      console.error(`❌ Error processing Reddit discussions for ${name}:`, error)
      return { summary: null, rawData: null }
    }
  }
}

export const redditService = new RedditService()
