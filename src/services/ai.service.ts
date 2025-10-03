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
