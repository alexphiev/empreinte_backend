import 'dotenv/config'
import { enhancementController } from '../controllers/enhancement.controller'
import { getPlaceById } from '../db/places'
import { getAIError, isAIAvailable } from '../services/ai.service'

async function main() {
  console.log('🌟 Places Enhancement Script')
  console.log('============================\n')

  // Check AI service availability
  if (!isAIAvailable()) {
    console.error('❌ AI service is not available:', getAIError())
    process.exit(1)
  }

  // Check environment variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'GEMINI_API_KEY',
    'REDDIT_CLIENT_ID',
    'REDDIT_CLIENT_SECRET',
  ]

  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar])

  if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:')
    missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`))
    process.exit(1)
  }

  console.log()

  try {
    // Get command line arguments
    const args = process.argv.slice(2)
    const command = args[0]

    switch (command) {
      case 'all':
        const limit = parseInt(args[1]) || undefined
        const forceAll = args.includes('--force') || args.includes('force')
        await enhanceAllPlaces(limit, forceAll)
        break
      case 'list':
        await listPlacesNeedingEnhancement()
        break
      default:
        // If it's not a recognized command, treat it as a place ID
        if (command && (command.length > 10 || /^[a-f0-9-]{36}$/i.test(command))) {
          const forceSingle = args.includes('--force') || args.includes('force')
          await enhanceSinglePlace(command, forceSingle)
        } else {
          printUsage()
        }
    }
  } catch (error) {
    console.error('❌ Script failed:', error)
    process.exit(1)
  }
}

async function enhanceSinglePlace(placeId?: string, force: boolean = false) {
  if (!placeId) {
    console.error('❌ Place ID is required for single place enhancement')
    console.log('Usage: yarn enhance-places <place-id>')
    process.exit(1)
  }

  console.log(`🎯 Enhancing single place: ${placeId}`)

  const { data: place, error } = await getPlaceById(placeId)

  if (error) {
    console.error('❌ Error fetching place:', error)
    process.exit(1)
  }

  if (!place) {
    console.error('❌ Place not found')
    process.exit(1)
  }

  console.log(`📍 Found place: ${place.name}`)

  if (force) {
    console.log(`🔄 Force mode enabled - overriding existing enhancements`)
  }

  const result = await enhancementController.enhancePlace(place, force)

  console.log('\n📊 Enhancement Result:')
  console.log('=====================')
  console.log(`Place: ${result.placeName}`)
  console.log(`Website enhanced: ${result.websiteEnhanced ? '✅' : '❌'}`)
  console.log(`Reddit enhanced: ${result.redditEnhanced ? '✅' : '❌'}`)
  console.log(`Wikipedia enhanced: ${result.wikipediaEnhanced ? '✅' : '❌'}`)
  console.log(`Score: +${result.score}`)

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:')
    result.errors.forEach((error) => console.log(`   - ${error}`))
  }
}

async function enhanceAllPlaces(limit?: number, force: boolean = false) {
  console.log(`🎯 Starting enhancement of ${limit ? `first ${limit}` : 'all'} places...`)

  if (force) {
    console.log(`🔄 Force mode enabled - overriding existing enhancements`)
  }

  const results = await enhancementController.enhanceAllPlaces(limit, force)

  if (results.length === 0) {
    console.log('✅ All places are already enhanced!')
    return
  }

  // Show detailed results for places with errors
  const placesWithErrors = results.filter((r) => r.errors.length > 0)
  if (placesWithErrors.length > 0) {
    console.log('\n❌ Places with errors:')
    placesWithErrors.forEach((result) => {
      console.log(`\n   📍 ${result.placeName} (${result.placeId}):`)
      result.errors.forEach((error) => console.log(`      - ${error}`))
    })
  }

  console.log('\n🎉 Enhancement completed!')
}

async function listPlacesNeedingEnhancement() {
  console.log('🎯 Checking places that need enhancement...')

  const places = await enhancementController.getPlacesNeedingEnhancement()

  console.log(`\n📊 Places needing enhancement: ${places.length}`)
}

function printUsage() {
  console.log('🌟 Places Enhancement Script Usage:')
  console.log('===================================\n')
  console.log('Commands:')
  console.log('  yarn enhance-places list                      - Check how many places need enhancement')
  console.log('  yarn enhance-places all [limit] [force]       - Enhance all places that need it (optional limit)')
  console.log('  yarn enhance-places <place-id> [force]        - Enhance a specific place by ID')
  console.log()
  console.log('Options:')
  console.log('  force or --force                              - Override existing enhancements')
  console.log()
  console.log('Examples:')
  console.log('  yarn enhance-places list')
  console.log('  yarn enhance-places all')
  console.log('  yarn enhance-places all 10                    - Enhance first 10 places')
  console.log('  yarn enhance-places all force                 - Re-enhance all places')
  console.log('  yarn enhance-places 123e4567... force         - Force re-enhance specific place')
}

// Run the script
main().catch(console.error)
