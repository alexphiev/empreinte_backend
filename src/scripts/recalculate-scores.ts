import 'dotenv/config'
import { supabase } from '../services/supabase.service'
import {
  calculatePlaceScore,
  hasWebsiteEnhancement,
  hasRedditEnhancement,
  hasWikipediaEnhancement,
} from '../services/score.service'

interface ScoreRecalculationResult {
  placeId: string
  placeName: string
  previousEnhancementScore: number
  newEnhancementScore: number
  previousTotalScore: number
  newTotalScore: number
}

async function recalculateScores() {
  console.log('🧮 Score Recalculation Script')
  console.log('=============================\n')

  try {
    // Fetch all places
    console.log('📋 Fetching all places...')
    const { data: places, error } = await supabase.from('places').select('*')

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

      const previousEnhancementScore = place.enhancement_score || 0
      const previousTotalScore = place.score || 0

      // Calculate scores using the score service
      const scoreCalculation = calculatePlaceScore(place)
      const newEnhancementScore = scoreCalculation.totalEnhancementScore
      const newTotalScore = scoreCalculation.totalScore

      if (scoreCalculation.websiteScore > 0) {
        console.log('  ✅ Website enhancement found (+2 points)')
      }
      if (scoreCalculation.redditScore > 0) {
        console.log('  ✅ Reddit enhancement found (+2 points)')
      }
      if (scoreCalculation.wikipediaScore > 0) {
        console.log('  ✅ Wikipedia enhancement found (+4 points)')
      }

      const result: ScoreRecalculationResult = {
        placeId: place.id,
        placeName: place.name || 'Unknown',
        previousEnhancementScore,
        newEnhancementScore,
        previousTotalScore,
        newTotalScore,
      }

      results.push(result)

      // Update database if scores changed
      if (previousEnhancementScore !== newEnhancementScore || previousTotalScore !== newTotalScore) {
        const { error: updateError } = await supabase
          .from('places')
          .update({
            enhancement_score: newEnhancementScore,
            score: newTotalScore,
          })
          .eq('id', place.id)

        if (updateError) {
          console.error(`  ❌ Failed to update scores: ${updateError.message}`)
        } else {
          console.log(`  📈 Updated scores: ${previousEnhancementScore} → ${newEnhancementScore} (enhancement), ${previousTotalScore} → ${newTotalScore} (total)`)
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
    console.log(`Places with website enhancements: ${results.filter(r => hasWebsiteEnhancement(places.find(p => p.id === r.placeId)!)).length}`)
    console.log(`Places with reddit enhancements: ${results.filter(r => hasRedditEnhancement(places.find(p => p.id === r.placeId)!)).length}`)
    console.log(`Places with wikipedia enhancements: ${results.filter(r => hasWikipediaEnhancement(places.find(p => p.id === r.placeId)!)).length}`)

    const totalEnhancementScore = results.reduce((sum, r) => sum + r.newEnhancementScore, 0)
    const totalScore = results.reduce((sum, r) => sum + r.newTotalScore, 0)

    console.log(`Total enhancement score: ${totalEnhancementScore}`)
    console.log(`Total score: ${totalScore}`)

    console.log('\n🎉 Score recalculation completed!')
  } catch (error) {
    console.error('❌ Script failed:', error)
    process.exit(1)
  }
}


// Run the script
recalculateScores().catch(console.error)