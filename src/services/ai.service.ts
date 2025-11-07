import { GoogleGenAI, type GenerateContentResponse } from '@google/genai'

// Module-level initialization - most performant for server actions
let genAI: GoogleGenAI | null = null
let initialized = false
let initError: string | null = null

// Use working model names that exist in the API
enum MODEL {
  GEMMA = 'gemma-3-27b-it',
}

// Helper function to extract text from AI response with simplified fallbacks
function extractResponseText(result: GenerateContentResponse): string {
  // Type guard for expected response structure
  const isValidCandidate = (candidate: unknown): candidate is { content: { parts: { text: string }[] } } => {
    return (
      typeof candidate === 'object' &&
      candidate !== null &&
      'content' in candidate &&
      typeof candidate.content === 'object' &&
      candidate.content !== null &&
      'parts' in candidate.content &&
      Array.isArray(candidate.content.parts) &&
      candidate.content.parts.length > 0 &&
      typeof candidate.content.parts[0] === 'object' &&
      candidate.content.parts[0] !== null &&
      'text' in candidate.content.parts[0] &&
      typeof candidate.content.parts[0].text === 'string'
    )
  }

  // Check standard response structure
  if (
    typeof result === 'object' &&
    result !== null &&
    'candidates' in result &&
    Array.isArray(result.candidates) &&
    result.candidates.length > 0
  ) {
    const candidate = result.candidates[0]
    if (isValidCandidate(candidate)) {
      return candidate.content.parts[0].text
    }
  }

  // Check for alternative text property
  if (typeof result === 'object' && result !== null && 'text' in result && typeof result.text === 'string') {
    return result.text
  }

  throw new Error('No valid text content found in AI response')
}

function initializeGenAI(): void {
  if (initialized) return

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY

  if (!GEMINI_API_KEY) {
    initError = 'AI service is not configured. Missing GEMINI_API_KEY environment variable.'
    initialized = true
    return
  }

  try {
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
    initialized = true
  } catch (error) {
    console.error('Failed to initialize Google GenAI:', error)
    initError = 'Failed to initialize AI service.'
    initialized = true
  }
}

// Initialize on module load
initializeGenAI()

export function getGenAI(): GoogleGenAI | null {
  if (!initialized) initializeGenAI()
  return genAI
}

export function isAIAvailable(): boolean {
  if (!initialized) initializeGenAI()
  return genAI !== null
}

export function getAIError(): string | null {
  if (!initialized) initializeGenAI()
  return initError
}

function createEnhancementPrompt(
  placeName: string,
  contentType: string,
  content: string,
  focusAreas: string[],
): string {
  const focusAreasText = focusAreas.map((area) => `- ${area}`).join('\n')

  return `You are helping to enhance place information for a nature and outdoor discovery app.

Place name: ${placeName}
${contentType}: ${content}

Please analyze this ${contentType.toLowerCase()} and provide a summary that includes ONLY relevant information for someone visiting this nature/outdoor place. Focus on:
${focusAreasText}

IMPORTANT: Only include information if it's clearly relevant and useful for visitors. If the content is not relevant to travel, outdoor/nature activities or visitor planning, respond with "NO_RELEVANT_INFO". We prefer no information over irrelevant or poor quality information.`
}

export async function summarizeWebsiteContent(placeName: string, websiteContent: string): Promise<string | null> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  const prompt = createEnhancementPrompt(placeName, 'Website content', websiteContent, [
    'Key activities available',
    'Important visitor information (hours, fees, accessibility)',
    'Notable features or attractions',
    'Seasonal information if relevant',
  ])

  const contents = [{ role: 'user', parts: [{ text: prompt }] }]

  try {
    // First attempt with grounding tools
    const result = await genAI.models.generateContent({
      model: MODEL.GEMMA,
      contents: contents,
    })

    let responseText: string
    try {
      responseText = extractResponseText(result).trim()
    } catch (extractError) {
      // Retry without grounding tools if text extraction fails
      console.warn('First attempt failed, retrying without grounding tools...', extractError)

      const fallbackResult = await genAI.models.generateContent({
        model: MODEL.GEMMA,
        contents: contents,
        // No tools for fallback
      })

      console.log('🤖 Fallback Gemma response:', JSON.stringify(fallbackResult, null, 2))
      responseText = extractResponseText(fallbackResult).trim()
      console.log('📝 Fallback extracted response text:', responseText)
    }

    if (!responseText || responseText === 'NO_RELEVANT_INFO') {
      console.log('❌ AI returned no relevant info or empty response')
      return null
    }

    console.log('✅ AI processing successful')
    return responseText
  } catch (error) {
    console.error('Error summarizing website content:', error)
    return null
  }
}

export async function checkRedditRelevance(
  placeName: string,
  threads: Array<{ title: string; comments: string[] }>,
): Promise<Array<{ title: string; comments: string[]; isRelevant: boolean }>> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  const results: Array<{ title: string; comments: string[]; isRelevant: boolean }> = []

  for (const thread of threads) {
    const previewComments = thread.comments.slice(0, 3)
    const previewText = `Title: ${thread.title}\nSample comments: ${previewComments.join(' | ')}`

    const prompt = `You are helping to filter Reddit discussions for a nature and outdoor discovery app.

Place name: ${placeName}

Reddit thread preview:
${previewText}

Is this Reddit thread SPECIFICALLY about visiting, discovering, or experiencing "${placeName}" as a nature/outdoor place?
Answer ONLY with "YES" or "NO".

Answer "YES" only if:
- The thread is clearly about this specific place
- It contains visitor experiences, tips, or recommendations
- It discusses nature/outdoor activities at this place

Answer "NO" if:
- It's about a different place with a similar name
- It's only tangentially related
- It's not about nature/outdoor activities
- The place is only mentioned in passing`

    const contents = [{ role: 'user', parts: [{ text: prompt }] }]

    try {
      const result = await genAI.models.generateContent({
        model: MODEL.GEMMA,
        contents: contents,
      })

      const responseText = extractResponseText(result).trim().toUpperCase()
      const isRelevant = responseText.includes('YES')

      results.push({
        title: thread.title,
        comments: thread.comments,
        isRelevant,
      })

      console.log(`  ${isRelevant ? '✅' : '❌'} Thread relevance check: "${thread.title.slice(0, 60)}..."`)
    } catch (error) {
      console.error('Error checking Reddit relevance:', error)
      results.push({
        title: thread.title,
        comments: thread.comments,
        isRelevant: false,
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  return results
}

export async function summarizeRedditContent(
  placeName: string,
  redditData: { threads: Array<{ title: string; comments: string[] }> },
): Promise<string | null> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  console.log(`🔍 Stage 1: Checking relevance of ${redditData.threads.length} threads...`)
  const checkedThreads = await checkRedditRelevance(placeName, redditData.threads)

  const relevantThreads = checkedThreads.filter((t) => t.isRelevant)

  if (relevantThreads.length === 0) {
    console.log('❌ No relevant threads found after filtering')
    return null
  }

  console.log(`✅ Found ${relevantThreads.length} relevant threads, proceeding to summarization...`)

  const threadsText = relevantThreads
    .map((thread, i) => `Thread ${i + 1}: ${thread.title}\nComments: ${thread.comments.join(' | ')}`)
    .join('\n\n')

  const prompt = createEnhancementPrompt(placeName, 'Reddit discussions', threadsText, [
    'Visitor tips and experiences',
    'Best times to visit',
    'Things to be aware of',
    'Activity recommendations',
  ])

  const contents = [{ role: 'user', parts: [{ text: prompt }] }]

  try {
    const result = await genAI.models.generateContent({
      model: MODEL.GEMMA,
      contents: contents,
    })

    const responseText = extractResponseText(result).trim()

    if (!responseText || responseText === 'NO_RELEVANT_INFO') {
      return null
    }

    return responseText
  } catch (error) {
    console.error('Error summarizing Reddit content:', error)
    return null
  }
}

export async function summarizeWikipediaContent(placeName: string, wikipediaContent: string): Promise<string | null> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  const prompt = createEnhancementPrompt(placeName, 'Wikipedia content', wikipediaContent, [
    'Geographic and natural features',
    'Historical or cultural significance',
    'Activities available',
    'Access information',
  ])

  const contents = [{ role: 'user', parts: [{ text: prompt }] }]

  try {
    // First attempt with grounding tools
    const result = await genAI.models.generateContent({
      model: MODEL.GEMMA,
      contents: contents,
    })

    let responseText: string
    try {
      responseText = extractResponseText(result).trim()
    } catch (extractError) {
      // Retry without grounding tools if text extraction fails
      console.warn('Wikipedia AI processing failed, retrying without grounding tools...')

      const fallbackResult = await genAI.models.generateContent({
        model: MODEL.GEMMA,
        contents: contents,
        // No tools for fallback
      })

      responseText = extractResponseText(fallbackResult).trim()
    }

    if (!responseText || responseText === 'NO_RELEVANT_INFO') {
      return null
    }

    return responseText
  } catch (error) {
    console.error('Error summarizing Wikipedia content:', error)
    return null
  }
}

export interface PlaceAnalysisResult {
  description: string
  mentionedPlaces: string[]
}

/**
 * Uses LLM to filter which sitemap URLs are most relevant for scraping
 * @param placeName The name of the place being analyzed
 * @param sitemapUrls Array of URLs from the sitemap
 * @param maxUrls Maximum number of URLs to return (default: 10)
 * @param country Optional country code (e.g., "France") to prioritize language-specific pages
 * @returns Array of filtered URLs that are most relevant
 */
export async function filterRelevantSitemapUrls(
  placeName: string,
  sitemapUrls: string[],
  maxUrls: number = 10,
  country?: string | null,
): Promise<string[]> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  // If we have fewer URLs than max, return all
  if (sitemapUrls.length <= maxUrls) {
    return sitemapUrls
  }

  console.log(`🤖 Using LLM to filter ${sitemapUrls.length} sitemap URLs down to ${maxUrls} most relevant...`)

  const urlsList = sitemapUrls.map((url, index) => `${index + 1}. ${url}`).join('\n')

  // Language preference based on country
  const languageNote =
    country === 'France'
      ? '\n\nIMPORTANT: This place is located in France. STRONGLY prioritize French-language pages (URLs containing /fr/, /french/, or French language indicators). Exclude English or other language pages unless no French alternatives exist.'
      : ''

  const prompt = `You are helping to analyze a nature and outdoor place website for a discovery app.

Place name: ${placeName}${country ? `\nCountry: ${country}` : ''}
Sitemap URLs found: ${sitemapUrls.length} URLs${languageNote}

Here are the URLs from the sitemap:
${urlsList}

Please analyze these URLs and select the ${maxUrls} most relevant pages that would contain useful information about this nature/outdoor place. Prioritize pages in this order:

1. **Nature-related pages** - Pages specifically about natural features, landscapes, wildlife, ecosystems
2. **Informational pages describing the place** - Overview pages, about pages, place descriptions, what to see/do
3. **Visitor guides and tips** - Pages with tips on how to visit, enjoy, and experience the place (trail guides, visiting tips, best practices, what to bring, when to visit)

Focus on pages that likely contain:
- Detailed descriptions of the place and its natural features
- Information about activities available (hiking, wildlife viewing, photography, etc.)
- Visitor information (hours, fees, access, parking, facilities)
- Tips and guides for visiting (what to bring, best times to visit, trail recommendations)
- Natural attractions and points of interest
- Safety information and regulations

Avoid pages like:
- Legal/terms pages
- Privacy policy
- Generic blog posts not specifically about the place
- Contact forms
- Shopping/cart pages
- News archives or press releases
- Generic information pages
- Pages about other places or unrelated topics

Return ONLY a JSON array of the selected URLs (exactly ${maxUrls} URLs), in order of relevance. Format:
["url1", "url2", "url3", ...]

Response:`

  const contents = [{ role: 'user', parts: [{ text: prompt }] }]

  try {
    const result = await genAI.models.generateContent({
      model: MODEL.GEMMA,
      contents: contents,
    })

    let responseText: string
    try {
      responseText = extractResponseText(result).trim()
    } catch (extractError) {
      console.warn('First attempt failed, retrying without grounding tools...', extractError)
      const fallbackResult = await genAI.models.generateContent({
        model: MODEL.GEMMA,
        contents: contents,
      })
      responseText = extractResponseText(fallbackResult).trim()
    }

    if (!responseText) {
      console.warn('❌ LLM returned empty response, using first N URLs')
      return sitemapUrls.slice(0, maxUrls)
    }

    // Try to extract JSON array from response
    let jsonText = responseText
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    const parsed = JSON.parse(jsonText) as string[]

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn('❌ LLM returned invalid format, using first N URLs')
      return sitemapUrls.slice(0, maxUrls)
    }

    // Validate URLs exist in original list
    const validUrls = parsed.filter((url) => sitemapUrls.includes(url))
    if (validUrls.length === 0) {
      console.warn('❌ LLM returned URLs not in original list, using first N URLs')
      return sitemapUrls.slice(0, maxUrls)
    }

    console.log(`✅ LLM filtered to ${validUrls.length} relevant URLs`)
    return validUrls.slice(0, maxUrls)
  } catch (error) {
    console.error('Error filtering sitemap URLs with LLM:', error)
    console.warn('⚠️ Falling back to first N URLs')
    return sitemapUrls.slice(0, maxUrls)
  }
}

/**
 * Summarizes scraped website content, keeping only relevant information about the place
 * @param placeName The name of the place being analyzed
 * @param scrapedContent The combined text content from scraped website pages
 * @returns Summary string focused on nature features and relevant information, or null if analysis fails
 */
export async function summarizeScrapedContent(placeName: string, scrapedContent: string): Promise<string | null> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  const prompt = `You are helping to analyze nature and outdoor places for a discovery app.

Place name: ${placeName}
Scraped website content: ${scrapedContent.substring(0, 30000)}

Please analyze this content and provide a COMPREHENSIVE, DETAILED summary that includes ALL relevant information for nature/outdoor enthusiasts visiting this place. 

**TARGET LENGTH: Aim for close to 2000 characters** - this is NOT a brief summary. You should extract and synthesize ALL relevant information from the content. The summary should be thorough, informative, and complete, covering:

1. **Natural Features & Landscapes**: Describe the natural environment, geography, ecosystems, flora, fauna, geological features, biodiversity, unique natural characteristics
2. **History & Significance**: Historical context, cultural importance, designation status (national park, nature reserve, etc.), any notable historical events or figures associated with the place
3. **Activities & Experiences**: ALL available activities (hiking, wildlife viewing, photography, camping, birdwatching, etc.), specific trails, routes, viewpoints, guided tours, educational programs
4. **Access & Practicality**: 
   - How to get there (detailed directions, transportation options, GPS coordinates if mentioned)
   - Opening hours and seasons (when accessible, best seasons)
   - Fees and permits (entry fees, parking fees, required permits)
   - Parking and facilities (parking locations, restrooms, visitor centers, picnic areas)
   - Accessibility information (wheelchair access, difficulty levels)
5. **Visitor Information**: 
   - Best times to visit (seasons, times of day, weather considerations)
   - What to bring (recommended equipment, clothing, supplies)
   - Safety considerations (hazards, weather warnings, wildlife precautions)
   - Regulations and rules (what's allowed/prohibited, protected areas)
   - Contact information if relevant (visitor center, park office, emergency contacts)
6. **Notable Attractions**: Specific points of interest, landmarks, viewpoints, trails, areas to explore, must-see features
7. **What Makes It Special**: Unique features, why visitors should come here, what sets this place apart

**CRITICAL INSTRUCTIONS:**
- **LENGTH REQUIREMENT**: Generate a comprehensive summary aiming for 1500-2000 characters. This is NOT a brief 400-character summary. Extract ALL relevant information.
- **COMPLETENESS**: Include as much relevant detail as possible. If you have 70,000 characters of content, extract the most important and relevant information to create a rich, informative summary.
- **RELEVANCE**: Only exclude truly irrelevant information (legal disclaimers, generic website boilerplate, navigation menus, cookie notices). Include ALL information about the place itself, its features, activities, access, history, and visitor information.
- **QUALITY**: Write in an engaging, informative style suitable for nature enthusiasts. Use complete sentences and proper structure.
- **SCOPE**: Focus ONLY on information about "${placeName}" - do NOT include information about other places mentioned in the content.
- **NO SHORT SUMMARIES**: Do NOT return a brief summary saying "no relevant information" if there is ANY content about the place. Extract and synthesize the information that exists.

If the content contains relevant information about the place (which it should, since it was scraped from the place's website), provide a comprehensive summary. Only return "NO_RELEVANT_INFO" if the content is completely unrelated to the place (e.g., completely different website, error pages, etc.).

Response (comprehensive summary only, no JSON, aim for 1500-2000 characters):`

  const contents = [{ role: 'user', parts: [{ text: prompt }] }]

  try {
    const result = await genAI.models.generateContent({
      model: MODEL.GEMMA,
      contents: contents,
    })

    let responseText: string
    try {
      responseText = extractResponseText(result).trim()
    } catch (extractError) {
      console.warn('First attempt failed, retrying without grounding tools...', extractError)
      const fallbackResult = await genAI.models.generateContent({
        model: MODEL.GEMMA,
        contents: contents,
      })
      responseText = extractResponseText(fallbackResult).trim()
    }

    if (!responseText || responseText === 'NO_RELEVANT_INFO') {
      console.log('❌ AI returned no relevant info or empty response')
      return null
    }

    console.log(`✅ Summarization successful: ${responseText.length} characters`)
    return responseText
  } catch (error) {
    console.error('Error summarizing scraped content:', error)
    return null
  }
}

/**
 * Extracts nature places with descriptions from URL content (for source analysis)
 * @param urlContent The scraped content from a URL
 * @returns Array of objects with name and description for each place found
 */
export interface ExtractedPlace {
  name: string
  description: string | null
}

export async function extractPlacesFromUrlContent(urlContent: string): Promise<ExtractedPlace[]> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  const prompt = `You are helping to analyze nature and outdoor places from a URL (like a travel guide, blog post, or article).

URL content: ${urlContent.substring(0, 30000)}

Please analyze this content and extract ALL nature places, parks, trails, natural landmarks, or outdoor destinations that are mentioned. For each place, extract:
- The exact name of the place
- A description (if available) - this could be information about the place, what makes it special, activities available, location details, etc.

These should be:
- Specifically named places (not generic references like "nearby parks" or "local trails")
- Related to nature, outdoors, hiking, wildlife, camping, or similar activities
- Distinct places that could have their own database entry
- Include ALL places mentioned, even if briefly

Return ONLY a JSON array of objects. Format:
[
  {
    "name": "Place Name 1",
    "description": "Description of Place 1 with details about features, activities, location, etc."
  },
  {
    "name": "Place Name 2",
    "description": "Description of Place 2..."
  }
]

If a place has no description available, use null:
{
  "name": "Place Name",
  "description": null
}

IMPORTANT:
- Only include nature/outdoor places
- Use the exact names as mentioned in the content
- Remove duplicates (if same place mentioned multiple times, combine information)
- Extract as much information as possible for descriptions (aim for 200-500 characters per description when available)
- Return ONLY valid JSON array, no additional text
- If no relevant places are found, return an empty array: []

Response:`

  const contents = [{ role: 'user', parts: [{ text: prompt }] }]

  try {
    const result = await genAI.models.generateContent({
      model: MODEL.GEMMA,
      contents: contents,
    })

    let responseText: string
    try {
      responseText = extractResponseText(result).trim()
    } catch (extractError) {
      console.warn('First attempt failed, retrying without grounding tools...', extractError)
      const fallbackResult = await genAI.models.generateContent({
        model: MODEL.GEMMA,
        contents: contents,
      })
      responseText = extractResponseText(fallbackResult).trim()
    }

    if (!responseText) {
      console.log('❌ AI returned empty response')
      return []
    }

    // Try to extract JSON array from response
    let jsonText = responseText
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    const parsed = JSON.parse(jsonText) as ExtractedPlace[]

    if (!Array.isArray(parsed)) {
      console.warn('❌ AI returned invalid format, returning empty array')
      return []
    }

    // Filter and normalize
    const places = parsed
      .filter((place) => place && typeof place.name === 'string' && place.name.trim().length > 0)
      .map((place) => ({
        name: place.name.trim(),
        description: place.description && typeof place.description === 'string' ? place.description.trim() : null,
      }))

    console.log(`✅ Extracted ${places.length} places from URL content`)
    return places
  } catch (error) {
    console.error('Error extracting places from URL content:', error)
    return []
  }
}

/**
 * Extracts mentioned nature places from scraped website content
 * @param placeName The name of the place being analyzed
 * @param scrapedContent The combined text content from scraped website pages
 * @returns Array of nature place names mentioned in the content, or empty array if none found
 */
export async function extractMentionedPlaces(placeName: string, scrapedContent: string): Promise<string[]> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  const prompt = `You are helping to analyze nature and outdoor places for a discovery app.

Place name: ${placeName}
Scraped website content: ${scrapedContent.substring(0, 15000)}

Please analyze this content and extract ONLY the names of other nature places, parks, trails, or natural landmarks that are mentioned. These should be:
- Specifically named places (not generic references like "nearby parks")
- Related to nature, outdoors, hiking, wildlife, or similar activities
- Distinct places that could have their own database entry
- NOT the place itself (${placeName})

Return ONLY a JSON array of place names. Format:
["Place Name 1", "Place Name 2", "Place Name 3"]

If no relevant places are found, return an empty array: []

IMPORTANT:
- Only include nature/outdoor places
- Use the exact names as mentioned in the content
- Remove duplicates
- Return ONLY valid JSON array, no additional text

Response:`

  const contents = [{ role: 'user', parts: [{ text: prompt }] }]

  try {
    const result = await genAI.models.generateContent({
      model: MODEL.GEMMA,
      contents: contents,
    })

    let responseText: string
    try {
      responseText = extractResponseText(result).trim()
    } catch (extractError) {
      console.warn('First attempt failed, retrying without grounding tools...', extractError)
      const fallbackResult = await genAI.models.generateContent({
        model: MODEL.GEMMA,
        contents: contents,
      })
      responseText = extractResponseText(fallbackResult).trim()
    }

    if (!responseText) {
      console.log('❌ AI returned empty response')
      return []
    }

    // Try to extract JSON array from response
    let jsonText = responseText
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    const parsed = JSON.parse(jsonText) as string[]

    if (!Array.isArray(parsed)) {
      console.warn('❌ AI returned invalid format, returning empty array')
      return []
    }

    // Filter out empty strings and normalize
    const places = parsed
      .filter((place) => typeof place === 'string' && place.trim().length > 0)
      .map((place) => place.trim())
      .filter((place) => place.toLowerCase() !== placeName.toLowerCase()) // Remove the place itself

    console.log(`✅ Extracted ${places.length} mentioned places`)
    return places
  } catch (error) {
    console.error('Error extracting mentioned places:', error)
    return []
  }
}

/**
 * Analyzes scraped website content to extract a detailed description and mentioned nature places
 * @deprecated Use summarizeScrapedContent and extractMentionedPlaces separately instead
 * @param placeName The name of the place being analyzed
 * @param scrapedContent The combined text content from scraped website pages
 * @returns An object with description (max 2000 chars) and array of mentioned places, or null if analysis fails
 */
export async function analyzeScrapedContent(
  placeName: string,
  scrapedContent: string,
): Promise<PlaceAnalysisResult | null> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  const prompt = `You are helping to analyze nature and outdoor places for a discovery app.

Place name: ${placeName}
Scraped website content: ${scrapedContent.substring(0, 15000)}

Please analyze this content and provide a JSON response with the following structure:
{
  "description": "A detailed, engaging description of this place (maximum 2000 characters). Focus on what makes this place special, key activities, visitor information, natural features, and why someone would want to visit. Only include relevant information for nature/outdoor enthusiasts.",
  "mentionedPlaces": ["Array of other nature places, parks, trails, or natural landmarks mentioned in the content that would be worth having in our database. Only include places that are specifically named and relevant to nature/outdoor activities. Return empty array if none found."]
}

IMPORTANT RULES:
1. The description must be engaging, informative, and focused on nature/outdoor activities
2. Maximum 2000 characters for description
3. Only include mentioned places that are:
   - Specifically named (not generic references like "nearby parks")
   - Related to nature, outdoors, hiking, wildlife, or similar activities
   - Distinct places that could have their own database entry
4. If the content is not relevant or insufficient, return: {"description": "NO_RELEVANT_INFO", "mentionedPlaces": []}
5. Return ONLY valid JSON, no additional text

Response:`

  const contents = [{ role: 'user', parts: [{ text: prompt }] }]

  try {
    const result = await genAI.models.generateContent({
      model: MODEL.GEMMA,
      contents: contents,
    })

    let responseText: string
    try {
      responseText = extractResponseText(result).trim()
    } catch (extractError) {
      console.warn('First attempt failed, retrying without grounding tools...')

      const fallbackResult = await genAI.models.generateContent({
        model: MODEL.GEMMA,
        contents: contents,
      })

      responseText = extractResponseText(fallbackResult).trim()
    }

    if (!responseText) {
      console.log('❌ AI returned empty response')
      return null
    }

    // Try to extract JSON from response (handle cases where AI adds extra text)
    let jsonText = responseText
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    // Parse JSON response
    const parsed = JSON.parse(jsonText) as PlaceAnalysisResult

    // Validate response
    if (!parsed.description || parsed.description === 'NO_RELEVANT_INFO') {
      console.log('❌ AI returned no relevant info')
      return null
    }

    // Ensure description is within limit
    if (parsed.description.length > 2000) {
      parsed.description = parsed.description.substring(0, 1997) + '...'
    }

    // Ensure mentionedPlaces is an array
    if (!Array.isArray(parsed.mentionedPlaces)) {
      parsed.mentionedPlaces = []
    }

    console.log(
      `✅ AI analysis successful: ${parsed.description.length} chars, ${parsed.mentionedPlaces.length} mentioned places`,
    )

    return parsed
  } catch (error) {
    console.error('Error analyzing scraped content:', error)
    return null
  }
}
