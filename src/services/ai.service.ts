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

export interface ExtractedPlace {
  name: string
  description: string
  placeType: string
  locationHint: string
  confidence: number // 0-1 score
}

/**
 * Analyzes scraped website content to extract a detailed description and mentioned nature places
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

/**
 * Extracts detailed place information from scraped content
 * Used for discovering new places mentioned in URLs
 * @param scrapedContent Combined text content from scraped website pages
 * @returns Array of extracted places with details, or null if analysis fails
 */
export async function extractPlacesFromContent(scrapedContent: string): Promise<ExtractedPlace[] | null> {
  const genAI = getGenAI()
  if (!genAI) {
    throw new Error('AI service is not available')
  }

  const prompt = `You are helping to extract nature and outdoor places from website content for a discovery app.

Website content:
${scrapedContent.substring(0, 15000)}

Please analyze this content and extract ALL nature places, parks, trails, natural landmarks, or outdoor locations mentioned.

Provide a JSON response with the following structure:
{
  "places": [
    {
      "name": "Full name of the place",
      "description": "Brief description (max 500 chars) of what this place is and why it's notable",
      "placeType": "Type of place: park, trail, forest, mountain, beach, lake, etc.",
      "locationHint": "Geographic location info: country, region, state, or nearby cities mentioned",
      "confidence": 0.85
    }
  ]
}

IMPORTANT RULES:
1. Only include places that are:
   - Specifically named (not "local parks" or "nearby trails")
   - Related to nature, outdoors, hiking, wildlife, or recreation
   - Distinct locations that could have their own database entry
2. Confidence score (0-1):
   - 0.9-1.0: Clearly defined with location info
   - 0.7-0.9: Well mentioned but partial location info
   - 0.5-0.7: Mentioned but vague details
   - Below 0.5: Don't include
3. Extract location hints from context (country, state, region, nearby cities)
4. If no places found, return: {"places": []}
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
      console.warn('First attempt failed, retrying...')

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

    // Try to extract JSON from response
    let jsonText = responseText
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    // Parse JSON response
    const parsed = JSON.parse(jsonText) as { places: ExtractedPlace[] }

    // Validate response
    if (!parsed.places || !Array.isArray(parsed.places)) {
      console.log('❌ AI returned invalid structure')
      return null
    }

    // Filter and validate places
    const validPlaces = parsed.places.filter((place) => {
      return (
        place.name &&
        place.name.length > 0 &&
        place.confidence >= 0.5 &&
        place.placeType &&
        place.description &&
        place.locationHint
      )
    })

    console.log(`✅ Extracted ${validPlaces.length} places from content`)

    return validPlaces.length > 0 ? validPlaces : null
  } catch (error) {
    console.error('Error extracting places from content:', error)
    return null
  }
}
