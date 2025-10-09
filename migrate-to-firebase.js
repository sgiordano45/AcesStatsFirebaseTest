// migrate-to-firebase.js - FIXED VERSION
const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateAllData() {
  console.log('🚀 Starting Aces data migration to Firebase (FIXED)...\n');
  
  try {
    const battingData = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
    const pitchingData = JSON.parse(fs.readFileSync('./pitching.json', 'utf8'));
    const gamesData = JSON.parse(fs.readFileSync('./games.json', 'utf8'));
    const awardsData = JSON.parse(fs.readFileSync('./awards.json', 'utf8'));
    
    console.log('📂 Loaded data files:');
    console.log(`   - ${battingData.length} batting records`);
    console.log(`   - ${pitchingData.length} pitching records`);
    console.log(`   - ${gamesData.length} game records`);
    console.log(`   - ${awardsData.length} awards\n`);
    
    console.log('1️⃣  Creating teams...');
    await createTeams(battingData);
    
    console.log('2️⃣  Creating player accounts...');
    await createPlayers(battingData, pitchingData);
    
    console.log('3️⃣  Creating seasons and games...');
    await createSeasonsAndGames(gamesData);
    
    console.log('4️⃣  Migrating player statistics (FIXED - with sub support)...');
    await migrateBattingStats(battingData);
    await migratePitchingStats(pitchingData);
    
    console.log('5️⃣  Migrating awards...');
    await migrateAwards(awardsData);
    
    console.log('\n✅ Migration complete! Check your Firebase Console.\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

async function createTeams(battingData) {
  const teams = new Set();
  battingData.forEach(player => {
    if (player.team) teams.add(player.team.trim());
  });
  
  const teamColors = {
    'Black': '#1a1a1a',
    'Blue': '#1976d2',
    'Carolina': '#4b9cd3',
    'Gold': '#f9a825',
    'Green': '#2d7d32',
    'Orange': '#f57c00',
    'Purple': '#7b1fa2',
    'Red': '#d32f2f',
    'Silver': '#757575',
    'White': '#ffffff',
    'Army': '#4b5320'
  };
  
  const activeTeams = ['Black', 'Blue', 'Carolina', 'Gold', 'Green', 'Orange', 'Purple', 'Red', 'Silver', 'White', 'Army'];
  
  const batch = db.batch();
  let count = 0;
  
  for (const teamName of teams) {
    const teamRef = db.collection('teams').doc(teamName.toLowerCase().replace(/\s+/g, '_'));
    batch.set(teamRef, {
      name: teamName,
      color: teamColors[teamName] || '#333333',
      active: activeTeams.includes(teamName),
      captainIds: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    count++;
  }
  
  await batch.commit();
  console.log(`   ✓ Created ${count} teams`);
}

async function createPlayers(battingData, pitchingData) {
  const players = new Map();
  
  battingData.forEach(record => {
    if (record.name) {
      const name = record.name.trim();
      if (!players.has(name)) {
        players.set(name, {
          name: name,
          team: record.team?.trim() || '',
          year: record.year,
          season: record.season
        });
      } else {
        const player = players.get(name);
        if (record.year > player.year || 
            (record.year === player.year && record.season === 'Fall')) {
          player.team = record.team?.trim() || '';
          player.year = record.year;
          player.season = record.season;
        }
      }
    }
  });
  
  pitchingData.forEach(record => {
    if (record.name && !players.has(record.name.trim())) {
      const name = record.name.trim();
      players.set(name, {
        name: name,
        team: record.team?.trim() || '',
        year: record.year,
        season: record.season
      });
    }
  });
  
  const batch = db.batch();
  let count = 0;
  
  for (const [playerName, data] of players) {
    const userId = playerName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
    
    const userRef = db.collection('users').doc(userId);
    batch.set(userRef, {
      name: playerName,
      displayName: playerName,
      email: `${userId}@placeholder.aces`,
      role: 'player',
      currentTeam: data.team,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isPlaceholder: true
    });
    
    count++;
    
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`   ✓ Created ${count} player accounts...`);
    }
  }
  
  await batch.commit();
  console.log(`   ✓ Created ${players.size} total player accounts`);
}

async function createSeasonsAndGames(gamesData) {
  const seasons = new Map();
  
  gamesData.forEach(game => {
    const seasonKey = `${game.year}-${game.season.toLowerCase()}`;
    if (!seasons.has(seasonKey)) {
      seasons.set(seasonKey, []);
    }
    seasons.get(seasonKey).push(game);
  });
  
  let totalGames = 0;
  
  for (const [seasonKey, games] of seasons) {
    const [year, season] = seasonKey.split('-');
    
    const seasonRef = db.collection('seasons').doc(seasonKey);
    await seasonRef.set({
      year: parseInt(year),
      season: season,
      isActive: year === '2025' && season === 'summer',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const batch = db.batch();
    
    games.forEach((game) => {
      const gameRef = seasonRef.collection('games').doc();
      
      batch.set(gameRef, {
        date: game.date && !isNaN(new Date(game.date).getTime()) 
          ? admin.firestore.Timestamp.fromDate(new Date(game.date))
          : admin.firestore.Timestamp.fromDate(new Date()),
        homeTeamId: game['home team'].toLowerCase().replace(/\s+/g, '_'),
        awayTeamId: game['away team'].toLowerCase().replace(/\s+/g, '_'),
        homeTeamName: game['home team'],
        awayTeamName: game['away team'],
        homeScore: parseInt(game['home score']) || 0,
        awayScore: parseInt(game['away score']) || 0,
        winner: game.winner ? game.winner.toLowerCase().replace(/\s+/g, '_') : null,
        gameType: game.game_type.toLowerCase(),
        status: 'completed',
        forfeit: game.forfeit === 'Yes'
      });
      
      totalGames++;
    });
    
    await batch.commit();
    console.log(`   ✓ Created season ${seasonKey} with ${games.length} games`);
  }
  
  console.log(`   ✓ Total games migrated: ${totalGames}`);
}

// FIXED: This function now properly handles substitute stats
async function migrateBattingStats(battingData) {
  const playerStats = new Map();
  
  // Group by player
  battingData.forEach(record => {
    const userId = record.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
    
    if (!playerStats.has(userId)) {
      playerStats.set(userId, {
        seasons: [] // Changed from Map to Array to handle duplicates
      });
    }
    
    const stats = playerStats.get(userId);
    
    // CRITICAL FIX: Create unique seasonId that includes team
    const year = record.year;
    const season = record.season.toLowerCase();
    const team = record.team.toLowerCase().replace(/\s+/g, '_');
    const isSub = record.sub && record.sub.toLowerCase() === 'yes';
    
    // Create unique season ID: "2024-fall-gold" or "2024-fall-white-sub"
    const seasonId = isSub 
      ? `${year}-${season}-${team}-sub`
      : `${year}-${season}-${team}`;
    
    stats.seasons.push({
      seasonId: seasonId,
      year: year,
      season: season,
      team: record.team,
      games: parseInt(record.games) || 0,
      atBats: parseInt(record.atBats) || 0,
      hits: parseInt(record.hits) || 0,
      runs: parseInt(record.runs) || 0,
      walks: parseInt(record.walks) || 0,
      acesBPI: record.AcesWar && record.AcesWar !== "N/A" ? parseFloat(record.AcesWar) : 0,
      sub: isSub ? "Yes" : "No"
    });
  });
  
  // Write to Firestore
  let count = 0;
  for (const [userId, data] of playerStats) {
    const statsRef = db.collection('playerStats').doc(userId);
    
    // Calculate career stats (include ALL seasons including subs for totals)
    const career = {
      games: 0,
      atBats: 0,
      hits: 0,
      runs: 0,
      walks: 0,
      acesBPITotal: 0,
      acesBPICount: 0
    };
    
    data.seasons.forEach(season => {
      career.games += season.games;
      career.atBats += season.atBats;
      career.hits += season.hits;
      career.runs += season.runs;
      career.walks += season.walks;
      
      // Only count non-sub AcesBPI for career average
      if (season.acesBPI !== 0 && season.sub === "No") {
        career.acesBPITotal += season.acesBPI;
        career.acesBPICount++;
      }
    });
    
    career.battingAverage = career.atBats > 0 ? career.hits / career.atBats : 0;
    career.onBasePercentage = (career.atBats + career.walks) > 0 
      ? (career.hits + career.walks) / (career.atBats + career.walks) 
      : 0;
    career.acesBPI = career.acesBPICount > 0 ? career.acesBPITotal / career.acesBPICount : 0;
    
    // Write career stats to career/stats document
    await statsRef.collection('career').doc('stats').set(career);
    
    // Write each season as a separate document with UNIQUE ID
    const batch = db.batch();
    data.seasons.forEach(season => {
      const seasonRef = statsRef.collection('seasons').doc(season.seasonId);
      
      const seasonData = {
        year: season.year,
        season: season.season,
        team: season.team,
        games: season.games,
        atBats: season.atBats,
        hits: season.hits,
        runs: season.runs,
        walks: season.walks,
        acesBPI: season.acesBPI,
        sub: season.sub,
        battingAverage: season.atBats > 0 ? season.hits / season.atBats : 0,
        onBasePercentage: (season.atBats + season.walks) > 0 
          ? (season.hits + season.walks) / (season.atBats + season.walks) 
          : 0
      };
      
      batch.set(seasonRef, seasonData);
    });
    
    await batch.commit();
    
    count++;
    if (count % 50 === 0) {
      console.log(`   ✓ Migrated batting stats for ${count} players...`);
    }
  }
  
  console.log(`   ✓ Migrated batting stats for ${playerStats.size} total players`);
  console.log(`   ✓ Each player now has separate documents for regular and substitute seasons`);
}

async function migratePitchingStats(pitchingData) {
  const pitcherStats = new Map();
  
  pitchingData.forEach(record => {
    const userId = record.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
    
    if (!pitcherStats.has(userId)) {
      pitcherStats.set(userId, {
        seasons: []
      });
    }
    
    const stats = pitcherStats.get(userId);
    
    const year = record.year;
    const season = record.season.toLowerCase();
    const team = record.team.toLowerCase().replace(/\s+/g, '_');
    const seasonId = `${year}-${season}-${team}`;
    
    const ip = parseFloat(record.IP) || 0;
    const runsAllowed = parseInt(record["runs allowed"]) || 0;
    const era = record.ERA && record.ERA !== "N/A" ? parseFloat(record.ERA) : 0;
    
    stats.seasons.push({
      seasonId: seasonId,
      year: year,
      season: season,
      team: record.team,
      games: parseInt(record.games) || 0,
      inningsPitched: ip,
      runsAllowed: runsAllowed,
      earnedRunAverage: era
    });
  });
  
  let count = 0;
  for (const [userId, data] of pitcherStats) {
    const statsRef = db.collection('pitchingStats').doc(userId);
    
    // Calculate career stats
    const career = {
      games: 0,
      inningsPitched: 0,
      runsAllowed: 0,
      earnedRuns: 0
    };
    
    data.seasons.forEach(season => {
      career.games += season.games;
      career.inningsPitched += season.inningsPitched;
      career.runsAllowed += season.runsAllowed;
      
      if (season.earnedRunAverage > 0 && season.inningsPitched > 0) {
        career.earnedRuns += (season.earnedRunAverage * season.inningsPitched) / 7;
      }
    });
    
    career.earnedRunAverage = career.inningsPitched > 0 
      ? (career.earnedRuns * 7) / career.inningsPitched 
      : 0;
    
    await statsRef.collection('career').doc('stats').set(career);
    
    const batch = db.batch();
    data.seasons.forEach(season => {
      const seasonRef = statsRef.collection('seasons').doc(season.seasonId);
      batch.set(seasonRef, {
        year: season.year,
        season: season.season,
        team: season.team,
        games: season.games,
        inningsPitched: season.inningsPitched,
        runsAllowed: season.runsAllowed,
        earnedRunAverage: season.earnedRunAverage
      });
    });
    
    await batch.commit();
    count++;
  }
  
  console.log(`   ✓ Migrated pitching stats for ${pitcherStats.size} pitchers`);
}

async function migrateAwards(awardsData) {
  const batch = db.batch();
  let count = 0;
  
  awardsData.forEach(award => {
    const awardRef = db.collection('awards').doc();
    batch.set(awardRef, {
      seasonId: `${award.Year}-${award.Season.toLowerCase()}`,
      category: award.Award,
      playerName: award.Player,
      team: award.Team || null,
      position: award.Position || null,
      value: award.Value || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    count++;
  });
  
  await batch.commit();
  console.log(`   ✓ Migrated ${count} awards`);
}

// Run the migration
migrateAllData();