import { summarizeWikipediaContent } from './ai.service'

interface WikipediaSearchResult {
  query: {
    search: Array<{
      title: string
      pageid: number
    }>
  }
}

interface WikipediaPageResult {
  query: {
    pages: {
      [key: string]: {
        pageid: number
        title: string
        extract?: string
      }
    }
  }
}

export class WikipediaService {
  private parseWikipediaReference(wikipedia: string): { language: string; title: string } | null {
    // Parse format like "fr:Parc regional du Gatinais" or just "Article Name"
    const match = wikipedia.match(/^([a-z]{2}):(.+)$/)
    if (match) {
      return {
        language: match[1],
        title: match[2].trim(),
      }
    }

    // Default to English if no language prefix
    return {
      language: 'en',
      title: wikipedia.trim(),
    }
  }

  private async searchWikipediaArticle(title: string, language: string = 'en'): Promise<string | null> {
    try {
      const baseUrl = `https://${language}.wikipedia.org/w/api.php`

      console.log(`🔍 Searching Wikipedia (${language}) for: ${title}`)

      // First, search for the article
      const searchUrl = `${baseUrl}?action=query&format=json&list=search&srsearch=${encodeURIComponent(title)}&srlimit=1`

      const searchResponse = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'EmpreinteBot/1.0 (Nature Places Data Enhancement)',
        },
      })

      if (!searchResponse.ok) {
        console.warn(`❌ Wikipedia search failed: ${searchResponse.statusText}`)
        return null
      }

      const searchData = (await searchResponse.json()) as WikipediaSearchResult

      if (!searchData.query.search || searchData.query.search.length === 0) {
        console.log(`❌ No Wikipedia article found for: ${title}`)
        return null
      }

      const pageTitle = searchData.query.search[0].title
      console.log(`📄 Found Wikipedia article: ${pageTitle}`)

      // Get the page content
      const contentUrl = `${baseUrl}?action=query&format=json&prop=extracts&exintro=1&explaintext=1&exsectionformat=plain&titles=${encodeURIComponent(pageTitle)}`

      const contentResponse = await fetch(contentUrl, {
        headers: {
          'User-Agent': 'EmpreinteBot/1.0 (Nature Places Data Enhancement)',
        },
      })

      if (!contentResponse.ok) {
        console.warn(`❌ Wikipedia content fetch failed: ${contentResponse.statusText}`)
        return null
      }

      const contentData = (await contentResponse.json()) as WikipediaPageResult

      const pages = contentData.query.pages
      const pageId = Object.keys(pages)[0]
      const page = pages[pageId]

      if (!page.extract) {
        console.log(`❌ No extract available for Wikipedia article: ${pageTitle}`)
        return null
      }

      return page.extract.slice(0, 3000) // Limit content to avoid token limits
    } catch (error) {
      console.error(`❌ Error searching Wikipedia for ${title}:`, error)
      return null
    }
  }

  public async fetchAndSummarizeWikipedia(placeName: string, wikipediaReference: string): Promise<{ summary: string | null; rawContent: string | null }> {
    try {
      console.log(`🔍 Processing Wikipedia info for place: ${placeName}`)

      const parsed = this.parseWikipediaReference(wikipediaReference)
      if (!parsed) {
        console.warn(`❌ Invalid Wikipedia reference format: ${wikipediaReference}`)
        return { summary: null, rawContent: null }
      }

      const wikipediaContent = await this.searchWikipediaArticle(parsed.title, parsed.language)

      if (!wikipediaContent) {
        return { summary: null, rawContent: null }
      }

      // Always store raw content, with more generous limit for AI processing
      const rawContent = wikipediaContent.length > 4000 ? wikipediaContent.substring(0, 4000) + '...' : wikipediaContent

      console.log(`📄 Retrieved ${wikipediaContent.length} characters from Wikipedia, sending to AI for summarization`)

      const summary = await summarizeWikipediaContent(placeName, wikipediaContent)

      if (summary) {
        console.log(`✅ Generated Wikipedia summary for ${placeName}`)
      } else {
        console.log(`❌ No relevant Wikipedia summary generated for ${placeName}`)
      }

      return { summary, rawContent }
    } catch (error) {
      console.error(`❌ Error processing Wikipedia for ${placeName}:`, error)
      return { summary: null, rawContent: null }
    }
  }

  public async searchWikipediaByPlaceName(placeName: string): Promise<{ summary: string | null; rawContent: string | null }> {
    try {
      console.log(`🔍 Searching Wikipedia by place name: ${placeName}`)

      // Try both English and French
      const languages = ['en', 'fr']

      for (const language of languages) {
        const content = await this.searchWikipediaArticle(placeName, language)
        if (content) {
          console.log(`📄 Found Wikipedia content in ${language}, sending to AI for summarization`)

          // Always store raw content, with more generous limit for AI processing
          const rawContent = content.length > 4000 ? content.substring(0, 4000) + '...' : content

          const summary = await summarizeWikipediaContent(placeName, content)

          if (summary) {
            console.log(`✅ Generated Wikipedia summary for ${placeName}`)
            return { summary, rawContent }
          }

          // Return raw content even if AI summarization failed
          return { summary: null, rawContent }
        }
      }

      console.log(`❌ No relevant Wikipedia content found for ${placeName}`)
      return { summary: null, rawContent: null }
    } catch (error) {
      console.error(`❌ Error searching Wikipedia for ${placeName}:`, error)
      return { summary: null, rawContent: null }
    }
  }
}

export const wikipediaService = new WikipediaService()
