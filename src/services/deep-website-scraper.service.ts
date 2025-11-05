import * as cheerio from 'cheerio'
import { Readable } from 'stream'

interface ScrapedPage {
  url: string
  text: string
}

interface SitemapItem {
  url?: string
  [key: string]: unknown
}

export class DeepWebsiteScraperService {
  private readonly MAX_PAGES = 20 // Limit to avoid overwhelming the target site
  private readonly TIMEOUT_MS = 10000
  private readonly USER_AGENT = 'Mozilla/5.0 (compatible; EmpreinteBot/1.0; Nature Places Data Enhancement)'

  /**
   * Fetches and parses a sitemap from a website
   */
  private async fetchSitemap(baseUrl: string): Promise<string[] | null> {
    try {
      console.log(`🗺️  Attempting to fetch sitemap from: ${baseUrl}`)

      // Common sitemap locations
      const sitemapUrls = [
        `${baseUrl}/sitemap.xml`,
        `${baseUrl}/sitemap_index.xml`,
        `${baseUrl}/sitemap`,
      ]

      for (const sitemapUrl of sitemapUrls) {
        try {
          const response = await fetch(sitemapUrl, {
            headers: { 'User-Agent': this.USER_AGENT },
            signal: AbortSignal.timeout(this.TIMEOUT_MS),
          })

          if (!response.ok) continue

          const xml = await response.text()
          const urls = await this.parseSitemapXml(xml)

          if (urls.length > 0) {
            console.log(`✅ Found sitemap with ${urls.length} URLs at ${sitemapUrl}`)
            return urls.slice(0, this.MAX_PAGES)
          }
        } catch (error) {
          // Try next sitemap location
          continue
        }
      }

      console.log(`⚠️  No sitemap found, will only scrape the homepage`)
      return null
    } catch (error) {
      console.warn(`❌ Error fetching sitemap:`, error)
      return null
    }
  }

  /**
   * Parses sitemap XML and extracts URLs
   */
  private async parseSitemapXml(xml: string): Promise<string[]> {
    try {
      const urls: string[] = []

      // Use simple XML parsing to extract URLs
      const urlMatches = xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)

      for (const match of urlMatches) {
        const url = match[1].trim()
        if (url) {
          urls.push(url)
        }
      }

      return urls
    } catch (error) {
      console.warn(`❌ Error parsing sitemap XML:`, error)
      return []
    }
  }

  /**
   * Fetches HTML content from a URL
   */
  private async fetchPage(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.USER_AGENT },
        signal: AbortSignal.timeout(this.TIMEOUT_MS),
      })

      if (!response.ok) {
        console.warn(`❌ Failed to fetch ${url}: ${response.status}`)
        return null
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('text/html')) {
        console.warn(`⚠️  Skipping non-HTML content: ${url}`)
        return null
      }

      return await response.text()
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        console.warn(`⏰ Timeout fetching ${url}`)
      } else if (error instanceof Error && error.message.includes('fetch failed')) {
        console.warn(`🔒 Protection detected or network error on ${url}`)
      } else {
        console.warn(`❌ Error fetching ${url}:`, error)
      }
      return null
    }
  }

  /**
   * Extracts clean text content from HTML
   */
  private extractTextContent(html: string): string {
    const $ = cheerio.load(html)

    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, iframe, noscript, form').remove()
    $(
      '.menu, .navigation, .sidebar, .ad, .advertisement, .cookie-banner, .social-share, .comments',
    ).remove()

    // Try semantic HTML5 first
    const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.main-content',
      '.content',
      '.article-content',
      '#content',
      '.post-content',
      '.entry-content',
    ]

    let content = ''
    for (const selector of contentSelectors) {
      const element = $(selector)
      if (element.length > 0) {
        content = element.text()
        if (content.length > 200) break
      }
    }

    // Fallback to body if no specific content area found
    if (!content || content.length < 200) {
      content = $('body').text()
    }

    // Clean up text
    return content
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\[.*?\]/g, '') // Remove [citations]
      .replace(/\{.*?\}/g, '') // Remove {annotations}
      .trim()
  }

  /**
   * Validates URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  /**
   * Gets base URL from a full URL
   */
  private getBaseUrl(url: string): string {
    try {
      const parsed = new URL(url)
      return `${parsed.protocol}//${parsed.host}`
    } catch {
      return url
    }
  }

  /**
   * Main method: Scrapes multiple pages from a website using sitemap
   * Returns combined text content from all pages
   */
  public async scrapeWebsiteDeep(websiteUrl: string): Promise<string | null> {
    try {
      console.log(`🔍 Starting deep scrape for: ${websiteUrl}`)

      if (!this.isValidUrl(websiteUrl)) {
        console.warn(`❌ Invalid URL: ${websiteUrl}`)
        return null
      }

      const baseUrl = this.getBaseUrl(websiteUrl)
      const pages: ScrapedPage[] = []

      // Try to get sitemap URLs
      const sitemapUrls = await this.fetchSitemap(baseUrl)

      // Determine which URLs to scrape
      const urlsToScrape = sitemapUrls && sitemapUrls.length > 0 ? sitemapUrls : [websiteUrl]

      console.log(`📄 Will scrape ${urlsToScrape.length} pages`)

      // Scrape each page with a small delay to be respectful
      for (const url of urlsToScrape) {
        const html = await this.fetchPage(url)

        if (html) {
          const text = this.extractTextContent(html)
          if (text && text.length > 100) {
            pages.push({ url, text })
            console.log(`✅ Scraped: ${url} (${text.length} chars)`)
          }
        }

        // Small delay between requests to be respectful
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      if (pages.length === 0) {
        console.warn(`❌ No content extracted from ${websiteUrl}`)
        return null
      }

      // Combine all page texts
      const combinedText = pages
        .map((page, index) => {
          // Add page separator for context
          const pageHeader = `\n\n=== Page ${index + 1}: ${page.url} ===\n\n`
          return pageHeader + page.text
        })
        .join('\n')

      console.log(
        `✅ Deep scrape complete: ${pages.length} pages, ${combinedText.length} total characters`,
      )

      return combinedText
    } catch (error) {
      console.error(`❌ Error during deep scrape:`, error)
      return null
    }
  }
}

export const deepWebsiteScraperService = new DeepWebsiteScraperService()
