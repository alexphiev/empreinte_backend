import 'dotenv/config'
import { VerificationStatus, verifyPlacesCore } from '../services/place-verification.service'

async function main() {
  const arg1 = process.argv[2]
  const arg2 = process.argv[3]
  const arg3 = process.argv[4]

  if (!arg1) {
    console.error('❌ Error: Either sourceId or generatedPlaceId is required')
    console.error('\nUsage:')
    console.error('  pnpm run verify-places <sourceId> [scoreBump] [limit]')
    console.error('  pnpm run verify-places <generatedPlaceId> [scoreBump]')
    console.error('\nExamples:')
    console.error('  pnpm run verify-places 123e4567-e89b-12d3-a456-426614174000')
    console.error('  pnpm run verify-places 123e4567-e89b-12d3-a456-426614174000 2')
    console.error('  pnpm run verify-places 123e4567-e89b-12d3-a456-426614174000 2 10')
    console.error('  pnpm run verify-places abc123-def456-789 3')
    process.exit(1)
  }

  // Determine if arg1 is sourceId or generatedPlaceId
  // If arg2 exists and is a number, arg1 is sourceId and arg2 is scoreBump
  // If arg2 exists and is a UUID, arg1 is sourceId and arg2 is generatedPlaceId
  // Otherwise, arg1 could be either, but we'll treat it as sourceId first
  let sourceId: string | undefined
  let generatedPlaceId: string | undefined
  let scoreBump = 2
  let limit: number | undefined

  if (arg2) {
    const arg2AsNumber = parseInt(arg2, 10)
    if (!isNaN(arg2AsNumber) && arg2AsNumber > 0) {
      // arg2 is a number, so arg1 is sourceId
      sourceId = arg1
      scoreBump = arg2AsNumber
      // Check if arg3 is limit
      if (arg3) {
        const arg3AsNumber = parseInt(arg3, 10)
        if (!isNaN(arg3AsNumber) && arg3AsNumber > 0) {
          limit = arg3AsNumber
        }
      }
    } else if (arg2.includes('-')) {
      // arg2 is a UUID, so arg1 is sourceId and arg2 is generatedPlaceId
      sourceId = arg1
      generatedPlaceId = arg2
      if (arg3) {
        const arg3AsNumber = parseInt(arg3, 10)
        if (!isNaN(arg3AsNumber) && arg3AsNumber > 0) {
          scoreBump = arg3AsNumber
        }
      }
    } else {
      // arg2 is not a number or UUID, treat arg1 as sourceId
      sourceId = arg1
      scoreBump = parseInt(arg2, 10) || 2
      // Check if arg3 is limit
      if (arg3) {
        const arg3AsNumber = parseInt(arg3, 10)
        if (!isNaN(arg3AsNumber) && arg3AsNumber > 0) {
          limit = arg3AsNumber
        }
      }
    }
  } else {
    // Only arg1 provided - could be sourceId or generatedPlaceId
    // We'll try sourceId first (service will handle if it's actually a generatedPlaceId)
    sourceId = arg1
  }

  console.log('🚀 Starting place verification...\n')
  if (sourceId) {
    console.log(`Source ID: ${sourceId}`)
  }
  if (generatedPlaceId) {
    console.log(`Generated Place ID: ${generatedPlaceId}`)
  }
  console.log(`Score bump: ${scoreBump}`)
  if (limit) {
    console.log(`Limit: ${limit}`)
  }
  console.log()

  try {
    const { results, error } = await verifyPlacesCore({
      sourceId,
      generatedPlaceId,
      scoreBump,
      limit,
    })

    if (error) {
      console.error(`❌ ${error}`)
      process.exit(1)
    }

    // Display results
    console.log('\n' + '='.repeat(80))
    console.log('✅ PLACE VERIFICATION COMPLETE')
    console.log('='.repeat(80))

    const verifiedCount = results.filter((r) => r.status === VerificationStatus.ADDED).length
    const failedCount = results.length - verifiedCount

    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.generatedPlaceName}`)
      console.log('-'.repeat(80))
      if (result.status === VerificationStatus.ADDED) {
        console.log(`   ✅ Verified (${result.status})`)
        console.log(`   Place ID: ${result.placeId}`)
        if (result.osmId) {
          console.log(`   OSM ID: ${result.osmId}`)
        }
      } else {
        console.log(`   ❌ Not verified (${result.status})`)
        if (result.error) {
          console.log(`   Error: ${result.error}`)
        }
      }
      console.log('-'.repeat(80))
    })

    console.log(`\n✨ Summary:`)
    console.log(`   - Total places: ${results.length}`)
    console.log(`   - Verified: ${verifiedCount}`)
    console.log(`   - Failed: ${failedCount}`)

    console.log('\n✅ Script completed successfully!')
  } catch (error) {
    console.error('\n❌ Fatal error occurred:')
    console.error(error)
    process.exit(1)
  }
}

// Run the script
main()
