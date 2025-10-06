// aggregate-stats.js
// Run this script ONCE to create the aggregatedPlayerStats collection
// Then use the Cloud Function for automatic updates

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCAEWkrTcprzJ2KPPJu-vFJPvYOVU4ky20",
  authDomain: "acessoftballreference-84791.firebaseapp.com",
  projectId: "acessoftballreference-84791",
  storageBucket: "acessoftballreference-84791.firebasestorage.app",
  messagingSenderId: "777699560175",
  appId: "1:777699560175:web:4092b422e7d7116352e91a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Main aggregation function
 * Creates aggregatedPlayerStats collection from existing data
 */
async function aggregateAllPlayerStats() {
  console.log('Starting player stats aggregation...');
  
  try {
    // Get all players
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', 'player'));
    const usersSnapshot = await getDocs(q);
    
    console.log(`Found ${usersSnapshot.size} players to process`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each player
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      try {
        console.log(`Processing player: ${userData.name} (${userId})`);
        
        // Get career batting stats
        const careerStatsRef = doc(db, 'playerStats', userId, 'career', 'stats');
        const careerStatsSnap = await getDoc(careerStatsRef);
        const careerStats = careerStatsSnap.exists() ? careerStatsSnap.data() : {};
        
        // Get all season batting stats
        const seasonsRef = collection(db, 'playerStats', userId, 'seasons');
        const seasonsSnapshot = await getDocs(seasonsRef);
        
        const seasonStats = [];
        seasonsSnapshot.forEach(doc => {
          const data = doc.data();
          seasonStats.push({
            seasonId: doc.id,
            team: data.team || '',
            games: data.games || 0,
            atBats: data.atBats || 0,
            hits: data.hits || 0,
            runs: data.runs || 0,
            walks: data.walks || 0,
            battingAverage: data.atBats > 0 ? (data.hits / data.atBats) : 0,
            onBasePercentage: (data.atBats + data.walks) > 0 
              ? ((data.hits + data.walks) / (data.atBats + data.walks)) 
              : 0,
            acesWar: data.acesWar || 0
          });
        });
        
        // Get career pitching stats
        const pitchingCareerRef = doc(db, 'pitchingStats', userId, 'career', 'stats');
        const pitchingCareerSnap = await getDoc(pitchingCareerRef);
        const pitchingCareerStats = pitchingCareerSnap.exists() ? pitchingCareerSnap.data() : {};
        
        // Get all season pitching stats
        const pitchingSeasonsRef = collection(db, 'pitchingStats', userId, 'seasons');
        const pitchingSeasonsSnapshot = await getDocs(pitchingSeasonsRef);
        
        const pitchingSeasonStats = [];
        pitchingSeasonsSnapshot.forEach(doc => {
          const data = doc.data();
          pitchingSeasonStats.push({
            seasonId: doc.id,
            team: data.team || '',
            games: data.games || 0,
            inningsPitched: data.IP || 0,
            earnedRunAverage: data.ERA || 0,
            strikeouts: data.K || 0,
            walks: data.BB || 0
          });
        });
        
        // Create aggregated document
        const aggregatedData = {
          userId: userId,
          name: userData.name || '',
          email: userData.email || '',
          currentTeam: userData.currentTeam || '',
          photoURL: userData.photoURL || '',
          
          // Career batting stats
          career: {
            games: careerStats.games || 0,
            atBats: careerStats.atBats || 0,
            hits: careerStats.hits || 0,
            runs: careerStats.runs || 0,
            walks: careerStats.walks || 0,
            battingAverage: careerStats.battingAverage || 0,
            onBasePercentage: careerStats.onBasePercentage || 0,
            acesWar: careerStats.acesWar || 0,
            
            // Add pitching if available
            pitching: {
              games: pitchingCareerStats.games || 0,
              inningsPitched: pitchingCareerStats.inningsPitched || 0,
              earnedRunAverage: pitchingCareerStats.earnedRunAverage || 0,
              strikeouts: pitchingCareerStats.strikeouts || 0,
              walks: pitchingCareerStats.walks || 0
            }
          },
          
          // All season batting data
          seasons: seasonStats,
          
          // All season pitching data
          pitchingSeasons: pitchingSeasonStats,
          
          // Metadata for queries
          totalSeasons: seasonStats.length,
          hasPitchingStats: pitchingSeasonStats.length > 0,
          lastUpdated: new Date()
        };
        
        // Write to aggregated collection
        const aggregatedRef = doc(db, 'aggregatedPlayerStats', userId);
        await setDoc(aggregatedRef, aggregatedData);
        
        console.log(`✓ Aggregated stats for ${userData.name}`);
        successCount++;
        
      } catch (error) {
        console.error(`✗ Error processing ${userData.name}:`, error);
        errorCount++;
      }
    }
    
    console.log('\n=================================');
    console.log('Aggregation Complete!');
    console.log(`✓ Success: ${successCount} players`);
    console.log(`✗ Errors: ${errorCount} players`);
    console.log('=================================\n');
    
    return { success: successCount, errors: errorCount };
    
  } catch (error) {
    console.error('Fatal error during aggregation:', error);
    throw error;
  }
}

/**
 * Verify aggregated collection was created
 */
async function verifyAggregation() {
  console.log('\nVerifying aggregated collection...');
  
  try {
    const statsRef = collection(db, 'aggregatedPlayerStats');
    const snapshot = await getDocs(statsRef);
    
    console.log(`Found ${snapshot.size} documents in aggregatedPlayerStats collection`);
    
    if (snapshot.size > 0) {
      const firstDoc = snapshot.docs[0];
      console.log('\nSample document structure:');
      console.log(JSON.stringify(firstDoc.data(), null, 2));
    }
    
  } catch (error) {
    console.error('Error verifying aggregation:', error);
  }
}

// Run the aggregation
console.log('=================================');
console.log('Firebase Stats Aggregation Tool');
console.log('=================================\n');

aggregateAllPlayerStats()
  .then(result => {
    console.log('Starting verification...');
    return verifyAggregation();
  })
  .then(() => {
    console.log('\n✓ All done! Check your Firebase Console to see the new collection.');
    console.log('Collection: aggregatedPlayerStats');
  })
  .catch(error => {
    console.error('\n✗ Aggregation failed:', error);
  });
