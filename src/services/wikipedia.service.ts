import { extractMentionedPlaces, summarizeWikipediaContent } from './ai.service'

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

  private async searchWikipediaArticle(
    title: string,
    language: string = 'en',
  ): Promise<{ content: string; articleTitle: string } | null> {
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

      // Store full content (up to reasonable limit for AI processing)
      // Wikipedia articles can be very long, so we limit to 10000 chars for storage
      // but pass full content to AI for better summaries
      const fullContent = page.extract
      const contentForStorage = fullContent.length > 10000 ? fullContent.substring(0, 10000) + '...' : fullContent

      return {
        content: contentForStorage,
        articleTitle: pageTitle,
      }
    } catch (error) {
      console.error(`❌ Error searching Wikipedia for ${title}:`, error)
      return null
    }
  }

  public async fetchAndSummarizeWikipedia(
    placeName: string,
    wikipediaReference: string,
  ): Promise<{
    summary: string | null
    rawContent: string | null
    mentionedPlaces: string[]
    wikipediaReference: string
  }> {
    try {
      console.log(`🔍 Processing Wikipedia info for place: ${placeName}`)

      const parsed = this.parseWikipediaReference(wikipediaReference)
      if (!parsed) {
        console.warn(`❌ Invalid Wikipedia reference format: ${wikipediaReference}`)
        return { summary: null, rawContent: null, mentionedPlaces: [], wikipediaReference }
      }

      const searchResult = await this.searchWikipediaArticle(parsed.title, parsed.language)

      if (!searchResult) {
        return { summary: null, rawContent: null, mentionedPlaces: [], wikipediaReference }
      }

      const wikipediaContent = searchResult.content

      // Store raw content (already limited to 10000 chars in searchWikipediaArticle)
      // Use the same content for AI processing
      const rawContent = wikipediaContent

      console.log(`📄 Retrieved ${wikipediaContent.length} characters from Wikipedia`)
      console.log(`📝 Summarizing content...`)
      console.log(`📍 Extracting mentioned places...`)

      // Two separate LLM calls in parallel - summarization and place extraction
      // Pass full content to AI (up to 10000 chars) for better summaries
      const [summary, mentionedPlaces] = await Promise.all([
        summarizeWikipediaContent(placeName, wikipediaContent),
        extractMentionedPlaces(placeName, wikipediaContent),
      ])

      if (summary) {
        console.log(`✅ Generated Wikipedia summary for ${placeName}`)
      } else {
        console.log(`❌ No relevant Wikipedia summary generated for ${placeName}`)
      }

      if (mentionedPlaces.length > 0) {
        console.log(`✅ Extracted ${mentionedPlaces.length} mentioned places from Wikipedia`)
      }

      return { summary, rawContent, mentionedPlaces, wikipediaReference }
    } catch (error) {
      console.error(`❌ Error processing Wikipedia for ${placeName}:`, error)
      return { summary: null, rawContent: null, mentionedPlaces: [], wikipediaReference }
    }
  }

  public async searchWikipediaByPlaceName(
    placeName: string,
    country?: string | null,
  ): Promise<{
    summary: string | null
    rawContent: string | null
    mentionedPlaces: string[]
    wikipediaReference: string | null
  }> {
    try {
      console.log(`🔍 Searching Wikipedia by place name: ${placeName}`)

      // Prioritize language based on country
      // For France, try French first, then English
      // For other countries, try English first, then French
      const languages = country === 'France' ? ['fr', 'en'] : ['en', 'fr']

      for (const language of languages) {
        const searchResult = await this.searchWikipediaArticle(placeName, language)
        if (searchResult) {
          console.log(`📄 Found Wikipedia content in ${language}`)

          const content = searchResult.content
          const articleTitle = searchResult.articleTitle
          const wikipediaReference = `${language}:${articleTitle}`

          console.log(`📝 Summarizing content...`)
          console.log(`📍 Extracting mentioned places...`)

          // Store raw content (already limited to 10000 chars in searchWikipediaArticle)
          const rawContent = content

          // Two separate LLM calls in parallel - summarization and place extraction
          // Pass full content to AI (up to 10000 chars) for better summaries
          const [summary, mentionedPlaces] = await Promise.all([
            summarizeWikipediaContent(placeName, content),
            extractMentionedPlaces(placeName, content),
          ])

          if (summary) {
            console.log(`✅ Generated Wikipedia summary for ${placeName}`)
            if (mentionedPlaces.length > 0) {
              console.log(`✅ Extracted ${mentionedPlaces.length} mentioned places from Wikipedia`)
            }
            return { summary, rawContent, mentionedPlaces, wikipediaReference }
          }

          // Return raw content and places even if AI summarization failed
          return { summary: null, rawContent, mentionedPlaces, wikipediaReference }
        }
      }

      console.log(`❌ No relevant Wikipedia content found for ${placeName}`)
      return { summary: null, rawContent: null, mentionedPlaces: [], wikipediaReference: null }
    } catch (error) {
      console.error(`❌ Error searching Wikipedia for ${placeName}:`, error)
      return { summary: null, rawContent: null, mentionedPlaces: [], wikipediaReference: null }
    }
  }
}

export const wikipediaService = new WikipediaService()
