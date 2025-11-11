import { getPlaces, updatePlaceScores } from '@/db/places'
import 'dotenv/config'
import { calculateScore } from '../services/score.service'

interface ScoreRecalculationResult {
  placeId: string
  placeName: string
  previousSourceScore: number
  newSourceScore: number
  previousEnhancementScore: number
  newEnhancementScore: number
  previousTotalScore: number
  newTotalScore: number
}

async function recalculateScores() {
  console.log('🧮 Score Recalculation Script')
  console.log('=============================\n')

  try {
    // Fetch all places with wikipedia data
    console.log('📋 Fetching all places...')
    const { data: places, error } = await getPlaces()

    if (error) {
      console.error('❌ Error fetching places:', error)
      process.exit(1)
    }

    if (!places || places.length === 0) {
      console.log('✅ No places found!')
      return
    }

    console.log(`📊 Found ${places.length} places to process\n`)

    const results: ScoreRecalculationResult[] = []
    let updatedCount = 0

    for (let i = 0; i < places.length; i++) {
      const place = places[i]
      console.log(`📍 Processing place ${i + 1}/${places.length}: ${place.name}`)

      const previousSourceScore = place.source_score || 0
      const previousEnhancementScore = place.enhancement_score || 0
      const previousTotalScore = place.score || 0

      // Calculate scores using the score service (this now recalculates source scores too)
      const scoreCalculation = await calculateScore(place)
      const newSourceScore = scoreCalculation.sourceScore
      const newEnhancementScore = scoreCalculation.enhancementScore
      const newTotalScore = scoreCalculation.totalScore

      const result: ScoreRecalculationResult = {
        placeId: place.id,
        placeName: place.name || 'Unknown',
        previousSourceScore,
        newSourceScore,
        previousEnhancementScore,
        newEnhancementScore,
        previousTotalScore,
        newTotalScore,
      }

      results.push(result)

      // Update database if any scores changed
      if (
        previousSourceScore !== newSourceScore ||
        previousEnhancementScore !== newEnhancementScore ||
        previousTotalScore !== newTotalScore
      ) {
        const { error: updateError } = await updatePlaceScores(
          place.id,
          newEnhancementScore,
          newTotalScore,
          newSourceScore,
        )

        if (updateError) {
          console.error(`  ❌ Failed to update scores: ${updateError.message}`)
        } else {
          console.log(
            `  📈 Updated scores: ${previousSourceScore} → ${newSourceScore} (source), ${previousEnhancementScore} → ${newEnhancementScore} (enhancement), ${previousTotalScore} → ${newTotalScore} (total)`,
          )
          updatedCount++
        }
      } else {
        console.log(`  ✅ Scores already correct`)
      }

      console.log() // Empty line for readability
    }

    // Summary
    console.log('📊 Recalculation Summary:')
    console.log('========================')
    console.log(`Total places processed: ${results.length}`)
    console.log(`Places with score updates: ${updatedCount}`)

    console.log('\n🎉 Score recalculation completed!')
  } catch (error) {
    console.error('❌ Script failed:', error)
    process.exit(1)
  }
}

// Run the script
recalculateScores().catch(console.error)
