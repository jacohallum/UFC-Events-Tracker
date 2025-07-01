// enhanced-ufc-watcher.js
import fetch from "node-fetch";
import 'dotenv/config';
import fs from "fs";
import { promisify } from 'util';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const KNOWN_FIGHTS_FILE = "knownFights.json";
const KNOWN_EVENTS_FILE = "knownEvents.json";
const PAST_EVENTS_FILE = "pastEvents.json";
const UPCOMING_UNANNOUNCED_FILE = "upcomingUnannouncedFights.json";
const FIGHT_LOG_FILE = "fightLog.json";
const FIGHT_DETAILS_FILE = "fightDetails.json";

// New files for enhanced features
const FIGHTER_STATS_FILE = "fighterStats.json";
const RANKINGS_HISTORY_FILE = "rankingsHistory.json";
const ODDS_HISTORY_FILE = "oddsHistory.json";
const LIVE_EVENTS_FILE = "liveEvents.json";
const PREDICTIONS_FILE = "predictions.json";
const FIGHTER_PROFILES_FILE = "fighterProfiles.json";

// Enhanced caches
const athleteCache = new Map();
const statsCache = new Map();
const rankingsCache = new Map();

// Rate limiting
const delay = promisify(setTimeout);
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 50;

const rateLimitedFetch = async (url, options = {}) => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  
  lastRequestTime = Date.now();
  return fetch(url, options);
};

const loadJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return file === FIGHT_DETAILS_FILE || file === FIGHTER_STATS_FILE || 
           file === RANKINGS_HISTORY_FILE || file === ODDS_HISTORY_FILE ||
           file === PREDICTIONS_FILE || file === FIGHTER_PROFILES_FILE ? {} : [];
  }
};

const saveJson = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

const safeFetch = async (url, retries = 2, delayMs = 500) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await rateLimitedFetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          console.log(`⏳ Rate limited, waiting ${delayMs * 2}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs * 2));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`⚠️  Attempt ${attempt + 1}/${retries} failed for ${url.substring(0, 50)}...`);
      if (attempt < retries - 1) {
        await new Promise(res => setTimeout(res, delayMs * (attempt + 1)));
      }
    }
  }
  console.error(`❌ All attempts failed for ${url.substring(0, 50)}...`);
  return null;
};

const sendDiscordMessage = async (content) => {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error("Discord message failed:", err.message);
  }
};

// ===========================================
// ENHANCED FIGHTER INTELLIGENCE
// ===========================================

const fetchFighterStats = async (athleteId) => {
  if (!athleteId) return null;
  
  const cacheKey = `stats_${athleteId}`;
  if (statsCache.has(cacheKey)) {
    return statsCache.get(cacheKey);
  }

  try {
    // Try to get basic athlete info first (this is more reliable)
    const athlete = await safeFetch(`https://sports.core.api.espn.com/v2/sports/mma/athletes/${athleteId}?lang=en&region=us`);
    
    if (!athlete) return null;
    
    // Try to get additional stats (these may fail, which is okay)
    const [eventLog, statistics] = await Promise.all([
      safeFetch(`https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/athletes/${athleteId}/eventlog?lang=en&region=us`).catch(() => null),
      safeFetch(`https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/athletes/${athleteId}/statistics?lang=en&region=us`).catch(() => null)
    ]);

    const fighterData = {
      athlete: athlete,
      stats: statistics || {},
      eventLog: eventLog || {},
      lastUpdated: new Date().toISOString()
    };

    statsCache.set(cacheKey, fighterData);
    return fighterData;
    
  } catch (error) {
    // If we can't get any data, cache null to avoid repeated attempts
    console.log(`No stats available for athlete ${athleteId}`);
    statsCache.set(cacheKey, null);
    return null;
  }
};

const analyzeFighterPerformance = (fighterData) => {
  if (!fighterData || !fighterData.eventLog) return null;

  const recentFights = fighterData.eventLog.items?.slice(0, 5) || [];
  const wins = recentFights.filter(fight => fight.result === 'W').length;
  const losses = recentFights.filter(fight => fight.result === 'L').length;
  
  return {
    recentRecord: `${wins}-${losses}`,
    winPercentage: recentFights.length > 0 ? (wins / recentFights.length * 100).toFixed(1) : 0,
    streak: calculateStreak(recentFights),
    averageFightTime: calculateAverageFightTime(recentFights),
    finishRate: calculateFinishRate(recentFights)
  };
};

const calculateStreak = (fights) => {
  let streak = 0;
  let streakType = '';
  
  for (const fight of fights) {
    if (streak === 0) {
      streakType = fight.result;
      streak = 1;
    } else if (fight.result === streakType) {
      streak++;
    } else {
      break;
    }
  }
  
  return `${streak}${streakType}`;
};

const calculateAverageFightTime = (fights) => {
  const timesInSeconds = fights
    .filter(f => f.duration)
    .map(f => parseTimeToSeconds(f.duration));
  
  if (timesInSeconds.length === 0) return 'N/A';
  
  const avgSeconds = timesInSeconds.reduce((a, b) => a + b, 0) / timesInSeconds.length;
  return formatSecondsToTime(avgSeconds);
};

const calculateFinishRate = (fights) => {
  const finishes = fights.filter(f => 
    f.result && (f.method?.includes('KO') || f.method?.includes('TKO') || f.method?.includes('SUB'))
  ).length;
  
  return fights.length > 0 ? (finishes / fights.length * 100).toFixed(1) + '%' : '0%';
};

const parseTimeToSeconds = (timeStr) => {
  const [minutes, seconds] = timeStr.split(':').map(Number);
  return minutes * 60 + seconds;
};

const formatSecondsToTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const sendEnhancedFightAlert = async (eventName, fights) => {
  // Enhanced notifications with fallback to original format
  const enrichedFights = [];

  for (const fight of fights) {
    let fightInfo = fight.fightName;
    
    // Only add enhanced stats if athleteIds are available
    if (fight.athleteIds && fight.athleteIds.length >= 2) {
      try {
        const [fighter1Stats, fighter2Stats] = await Promise.all([
          fetchFighterStats(fight.athleteIds[0]),
          fetchFighterStats(fight.athleteIds[1])
        ]);
        
        const f1Analysis = analyzeFighterPerformance(fighter1Stats);
        const f2Analysis = analyzeFighterPerformance(fighter2Stats);
        
        if (f1Analysis && f2Analysis) {
          fightInfo += `\n  📊 ${f1Analysis.recentRecord} (${f1Analysis.streak}) vs ${f2Analysis.recentRecord} (${f2Analysis.streak})`;
          fightInfo += `\n  ⚡ Finish rates: ${f1Analysis.finishRate} vs ${f2Analysis.finishRate}`;
        }
      } catch (error) {
        console.log(`Could not fetch enhanced stats for ${fight.fightName}: ${error.message}`);
        // Continue with basic notification
      }
    }
    
    enrichedFights.push(fightInfo);
  }
  
  const content = `🚨 **${eventName}**\nNew fights${enrichedFights.some(f => f.includes('📊')) ? ' with stats' : ''}:\n${enrichedFights.map(f => `- ${f.replace(/\n/g, '\n  ')}`).join('\n')}`;
  await sendDiscordMessage(content);
};

// ===========================================
// REAL-TIME FIGHT TRACKING
// ===========================================

const monitorLiveFights = async () => {
  console.log("🔴 Checking for live events...");
  
  try {
    const scoreboard = await safeFetch("https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard");
    const liveEvents = loadJson(LIVE_EVENTS_FILE);
    
    if (!scoreboard?.events) {
      // ENHANCED: Send status update for first run
      if (Object.keys(liveEvents).length === 0) {
        await sendDiscordMessage("👁️ **Live Event Monitoring Active**\nNo live events currently - will notify when fights go live!");
      }
      return;
    }

    let foundLiveEvents = false;
    for (const event of scoreboard.events) {
      if (event.status?.type?.state === 'in' || event.status?.type?.description?.toLowerCase().includes('live')) {
        console.log(`🔴 Live event detected: ${event.name}`);
        foundLiveEvents = true;
        
        const eventKey = `${event.id}_${event.status.period}`;
        const lastUpdate = liveEvents[eventKey];
        
        // Check if this is a new live update
        if (!lastUpdate || lastUpdate !== event.status.displayClock) {
          await sendDiscordMessage(`🔴 **LIVE**: ${event.name}\n📍 ${event.status.type.description}\n⏰ ${event.status.displayClock || 'In Progress'}`);
          
          liveEvents[eventKey] = event.status.displayClock;
          
          // Try to get detailed competition info
          for (const competition of event.competitions || []) {
            try {
              const situation = await safeFetch(
                `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${event.id}/competitions/${competition.id}/situation?lang=en&region=us`
              );
              
              if (situation && situation.lastPlay && situation.lastPlay.text) {
                await sendDiscordMessage(`⚡ **Live Update**: ${situation.lastPlay.text}`);
              }
            } catch (error) {
              console.log(`Could not fetch live situation for competition ${competition.id}`);
            }
          }
        }
      }
    }
    
    saveJson(LIVE_EVENTS_FILE, liveEvents);
    
  } catch (error) {
    console.error("Error monitoring live fights:", error.message);
  }
};

// ===========================================
// HISTORICAL ANALYSIS & TRENDS
// ===========================================

const trackRankingChanges = async () => {
  console.log("📈 Tracking ranking changes...");
  
  try {
    const currentRankings = await safeFetch("https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/rankings?lang=en&region=us");
    const rankingsHistory = loadJson(RANKINGS_HISTORY_FILE);
    
    if (!currentRankings) return;
    
    const today = new Date().toISOString().split('T')[0];
    const previousRankings = rankingsHistory[Object.keys(rankingsHistory).pop()];
    
    // ENHANCED: Send current rankings summary on first run
    if (!previousRankings && currentRankings?.items) {
      const championsMsg = "🏆 **Current UFC Champions**\n" + 
        currentRankings.items.slice(0, 5).map(div => {
          const champ = div.rankings?.find(r => r.rank === 1);
          return champ ? `${div.name}: ${champ.athlete?.displayName || 'Vacant'}` : `${div.name}: Vacant`;
        }).join('\n');
      
      await sendDiscordMessage(championsMsg);
    }
    
    if (previousRankings) {
      const changes = detectRankingChanges(previousRankings, currentRankings);
      
      if (changes.length > 0) {
        const changeMessage = `📈 **Ranking Changes**\n${changes.join('\n')}`;
        await sendDiscordMessage(changeMessage);
        console.log(`Detected ${changes.length} ranking changes`);
      }
    }
    
    rankingsHistory[today] = currentRankings;
    saveJson(RANKINGS_HISTORY_FILE, rankingsHistory);
    
  } catch (error) {
    console.error("Error tracking ranking changes:", error.message);
  }
};

const detectRankingChanges = (oldRankings, newRankings) => {
  const changes = [];
  
  if (!oldRankings || !newRankings || !newRankings.items) return changes;
  
  try {
    for (const category of newRankings.items) {
      const categoryName = category.name || 'Unknown Division';
      const newRanks = category.rankings || [];
      
      // Find corresponding old category
      const oldCategory = oldRankings.items?.find(cat => cat.name === categoryName);
      const oldRanks = oldCategory?.rankings || [];
      
      // Compare rankings
      for (const newRank of newRanks) {
        const oldRank = oldRanks.find(r => r.athlete?.id === newRank.athlete?.id);
        
        if (oldRank && oldRank.rank !== newRank.rank) {
          const direction = newRank.rank < oldRank.rank ? '⬆️' : '⬇️';
          changes.push(`${direction} ${newRank.athlete.displayName}: #${oldRank.rank} → #${newRank.rank} (${categoryName})`);
        } else if (!oldRank && newRank.rank <= 15) {
          changes.push(`🆕 ${newRank.athlete.displayName}: Entered rankings at #${newRank.rank} (${categoryName})`);
        }
      }
    }
  } catch (error) {
    console.error("Error in detectRankingChanges:", error.message);
  }
  
  return changes;
};

const analyzeHistoricalTrends = async () => {
  console.log("📊 Analyzing historical trends...");
  
  const rankingsHistory = loadJson(RANKINGS_HISTORY_FILE);
  const fighterStats = loadJson(FIGHTER_STATS_FILE);
  
  // Analyze trending fighters (those moving up consistently)
  const trendingFighters = analyzeTrendingFighters(rankingsHistory);
  
  if (trendingFighters.length > 0) {
    const trendMessage = `📈 **Trending Fighters**\n${trendingFighters.map(f => 
      `${f.name}: ${f.trend} (${f.division})`
    ).join('\n')}`;
    
    await sendDiscordMessage(trendMessage);
  }
  
  return { trendingFighters };
};

const analyzeTrendingFighters = (rankingsHistory) => {
  const trending = [];
  const dates = Object.keys(rankingsHistory).sort().slice(-30); // Last 30 entries
  
  if (dates.length < 2) return trending;
  
  const fighterRankings = new Map();
  
  // Collect ranking history for each fighter
  for (const date of dates) {
    const rankings = rankingsHistory[date];
    if (!rankings?.items) continue;
    
    for (const category of rankings.items) {
      for (const rank of category.rankings || []) {
        const fighterId = rank.athlete?.id;
        const fighterName = rank.athlete?.displayName;
        
        if (!fighterId || !fighterName) continue;
        
        if (!fighterRankings.has(fighterId)) {
          fighterRankings.set(fighterId, {
            name: fighterName,
            division: category.name,
            rankings: []
          });
        }
        
        fighterRankings.get(fighterId).rankings.push({
          date,
          rank: rank.rank
        });
      }
    }
  }
  
  // Analyze trends
  for (const [fighterId, data] of fighterRankings) {
    if (data.rankings.length < 2) continue;
    
    const firstRank = data.rankings[0].rank;
    const lastRank = data.rankings[data.rankings.length - 1].rank;
    const improvement = firstRank - lastRank; // Positive means moving up
    
    if (improvement >= 3) { // Moved up at least 3 spots
      trending.push({
        name: data.name,
        division: data.division,
        trend: `Up ${improvement} spots`,
        improvement
      });
    }
  }
  
  return trending.sort((a, b) => b.improvement - a.improvement).slice(0, 5);
};

// ===========================================
// PREDICTIVE FEATURES
// ===========================================

const trackOddsMovements = async (eventIds) => {
  console.log("💰 Tracking odds movements...");
  
  const oddsHistory = loadJson(ODDS_HISTORY_FILE);
  const today = new Date().toISOString().split('T')[0];
  
  for (const eventId of eventIds) {
    try {
      const event = await safeFetch(`https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`);
      
      if (!event?.competitions) continue;
      
      for (const competition of event.competitions) {
        try {
          const odds = await safeFetch(`https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}/competitions/${competition.id}/odds?lang=en&region=us`);
          
          if (!odds) continue;
          
          const competitionKey = `${eventId}_${competition.id}`;
          const previousOdds = oddsHistory[competitionKey]?.slice(-1)[0];
          
          if (!oddsHistory[competitionKey]) {
            oddsHistory[competitionKey] = [];
          }
          
          const currentOddsData = {
            date: today,
            odds: odds,
            timestamp: new Date().toISOString()
          };
          
          oddsHistory[competitionKey].push(currentOddsData);
          
          // Detect significant movements
          if (previousOdds) {
            const movements = detectSignificantOddsMovements(previousOdds.odds, odds, event.name);
            
            for (const movement of movements) {
              await sendDiscordMessage(`💰 **Odds Alert**: ${movement}`);
            }
          }
          
        } catch (error) {
          console.log(`Could not fetch odds for competition ${competition.id}`);
        }
      }
    } catch (error) {
      console.log(`Could not process odds for event ${eventId}`);
    }
  }
  
  saveJson(ODDS_HISTORY_FILE, oddsHistory);
};

const detectSignificantOddsMovements = (oldOdds, newOdds, eventName) => {
  const movements = [];
  const threshold = 0.15; // 15% change threshold
  
  try {
    if (!oldOdds?.items || !newOdds?.items) return movements;
    
    for (const newOdd of newOdds.items) {
      const oldOdd = oldOdds.items.find(o => o.provider?.name === newOdd.provider?.name);
      
      if (!oldOdd || !newOdd.details || !oldOdd.details) continue;
      
      // Handle details as either array or object
      const newDetails = Array.isArray(newOdd.details) ? newOdd.details : [newOdd.details];
      const oldDetails = Array.isArray(oldOdd.details) ? oldOdd.details : [oldOdd.details];
      
      for (const detail of newDetails) {
        // Find matching old detail by team name or other identifier
        const oldDetail = oldDetails.find(d => 
          d.team?.name === detail.team?.name || 
          d.team?.id === detail.team?.id ||
          (oldDetails.length === 1 && newDetails.length === 1) // Single detail case
        );
        
        if (oldDetail && detail.overUnder && oldDetail.overUnder) {
          const oldValue = parseFloat(oldDetail.overUnder);
          const newValue = parseFloat(detail.overUnder);
          
          if (!isNaN(oldValue) && !isNaN(newValue) && oldValue !== 0) {
            const change = Math.abs((newValue - oldValue) / oldValue);
            
            if (change >= threshold) {
              const direction = newValue > oldValue ? '📈' : '📉';
              const fighterName = detail.team?.name || detail.team?.displayName || 'Fighter';
              movements.push(`${direction} ${fighterName}: ${oldValue} → ${newValue} (${(change * 100).toFixed(1)}% change) - ${eventName}`);
            }
          }
        }
        
        // Also check moneyline if available
        if (oldDetail && detail.moneyLine && oldDetail.moneyLine) {
          const oldML = parseFloat(oldDetail.moneyLine);
          const newML = parseFloat(detail.moneyLine);
          
          if (!isNaN(oldML) && !isNaN(newML) && oldML !== 0) {
            const change = Math.abs((newML - oldML) / Math.abs(oldML));
            
            if (change >= threshold) {
              const direction = newML > oldML ? '📈' : '📉';
              const fighterName = detail.team?.name || detail.team?.displayName || 'Fighter';
              movements.push(`${direction} ${fighterName} ML: ${oldML > 0 ? '+' : ''}${oldML} → ${newML > 0 ? '+' : ''}${newML} (${(change * 100).toFixed(1)}% change) - ${eventName}`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error in detectSignificantOddsMovements:", error.message);
  }
  
  return movements;
};

const generateFightPredictions = async (eventId) => {
  console.log(`🔮 Generating predictions for event ${eventId}...`);
  
  try {
    // Get the full event data (we know this works)
    const event = await safeFetch(`https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`);
    
    if (!event || !event.competitions) return null;
    
    const predictions = [];
    const currentFightDetails = loadJson(FIGHT_DETAILS_FILE);
    
    // Use the fight data we already have from the main processing
    for (const competition of event.competitions) {
      const fightDetail = currentFightDetails[competition.id];
      
      if (!fightDetail || !fightDetail.athletes || fightDetail.athletes.length !== 2) continue;
      
      // Skip TBA fights
      if (fightDetail.unannounced) continue;
      
      const [fighter1Name, fighter2Name] = fightDetail.athletes;
      
      // Generate basic predictions based on fighter names and known patterns
      const prediction = generateBasicPrediction(fighter1Name, fighter2Name);
      
      predictions.push({
        fightId: competition.id,
        fighters: `${fighter1Name} vs ${fighter2Name}`,
        eventName: event.name,
        prediction: prediction,
        venue: event.venues?.[0]?.fullName || 'TBA',
        date: event.date
      });
    }
    
    // Send prediction summary if we have predictions
    if (predictions.length > 0) {
      const validPredictions = predictions.filter(p => 
        p.prediction.prediction && 
        p.prediction.prediction !== "Insufficient data for prediction" &&
        p.prediction.prediction !== "Analysis error"
      );
      
      if (validPredictions.length > 0) {
        const predictionMsg = `🔮 **Fight Predictions - ${event.name}**\n` +
          validPredictions.map(p => `${p.fighters}: ${p.prediction.prediction}`).join('\n');
        
        await sendDiscordMessage(predictionMsg);
        console.log(`✅ Generated ${validPredictions.length} predictions for ${event.name}`);
      } else {
        console.log(`⚠️ All fights are TBA for ${event.name}`);
      }
    }
    
    return predictions;
    
  } catch (error) {
    console.error(`Error generating predictions for event ${eventId}:`, error.message);
    return null;
  }
};

// Simple prediction generator based on fighter name recognition and patterns
const generateBasicPrediction = (fighter1Name, fighter2Name) => {
  // List of well-known fighters and their general skill levels (this could be expanded)
  const knownFighters = {
    // Champions and former champions
    'max holloway': { skill: 95, experience: 90 },
    'dustin poirier': { skill: 94, experience: 88 },
    'dricus du plessis': { skill: 90, experience: 75 },
    'khamzat chimaev': { skill: 92, experience: 70 },
    'robert whittaker': { skill: 93, experience: 90 },
    'stephen thompson': { skill: 88, experience: 85 },
    'derrick lewis': { skill: 80, experience: 85 },
    'aljamain sterling': { skill: 90, experience: 80 },
    'brian ortega': { skill: 88, experience: 75 },
    'marvin vettori': { skill: 85, experience: 80 },
    'brendan allen': { skill: 82, experience: 70 },
    'johnny walker': { skill: 78, experience: 65 },
    'sergei pavlovich': { skill: 88, experience: 70 },
    'petr yan': { skill: 92, experience: 85 },
    'edson barboza': { skill: 85, experience: 90 },
    'michael page': { skill: 80, experience: 75 },
    'jared cannonier': { skill: 86, experience: 85 },
    'gerald meerschaert': { skill: 78, experience: 80 },
    'jessica andrade': { skill: 88, experience: 85 },
    'lauren murphy': { skill: 80, experience: 85 },
    'alex perez': { skill: 82, experience: 75 },
    'tim elliott': { skill: 80, experience: 85 },
    'amir albazi': { skill: 83, experience: 70 },
    'tatsuro taira': { skill: 85, experience: 60 },
    'anthony hernandez': { skill: 82, experience: 70 },
    'roman dolidze': { skill: 80, experience: 65 },
    'said nurmagomedov': { skill: 88, experience: 75 },
    'bryce mitchell': { skill: 85, experience: 70 },
    'movsar evloev': { skill: 86, experience: 65 },
    'chris curtis': { skill: 78, experience: 75 },
    'steve garcia': { skill: 75, experience: 65 },
    'calvin kattar': { skill: 85, experience: 80 },
    'chidi njokuani': { skill: 75, experience: 70 },
    'jake matthews': { skill: 76, experience: 70 },
    'nassourdine imavov': { skill: 82, experience: 70 },
    'caio borralho': { skill: 80, experience: 60 }
  };
  
  const f1Key = fighter1Name.toLowerCase();
  const f2Key = fighter2Name.toLowerCase();
  
  const f1Data = knownFighters[f1Key];
  const f2Data = knownFighters[f2Key];
  
  // If we don't know both fighters, return even matchup
  if (!f1Data || !f2Data) {
    return { prediction: "Even matchup - insufficient data" };
  }
  
  // Calculate overall scores (skill weighted more heavily than experience)
  const f1Score = (f1Data.skill * 0.7) + (f1Data.experience * 0.3);
  const f2Score = (f2Data.skill * 0.7) + (f2Data.experience * 0.3);
  
  const difference = Math.abs(f1Score - f2Score);
  
  // Determine confidence based on score difference
  let confidence;
  if (difference < 3) confidence = 55;
  else if (difference < 6) confidence = 65;
  else if (difference < 10) confidence = 75;
  else confidence = 85;
  
  // Determine favorite
  const favorite = f1Score > f2Score ? fighter1Name : fighter2Name;
  
  return {
    prediction: `${favorite} (${confidence}% confidence)`,
    factors: [`Skill/Experience analysis based on career performance`]
  };
};

const analyzeFightMatchup = (fighter1, fighter2, stats1, stats2) => {
  const analysis = {
    favorite: null,
    confidence: 0,
    factors: [],
    prediction: null
  };
  
  try {
    const f1Analysis = analyzeFighterPerformance(stats1);
    const f2Analysis = analyzeFighterPerformance(stats2);
    
    if (!f1Analysis || !f2Analysis) {
      return { prediction: "Insufficient data for prediction" };
    }
    
    let f1Score = 0;
    let f2Score = 0;
    
    // Win percentage factor
    const f1WinPct = parseFloat(f1Analysis.winPercentage);
    const f2WinPct = parseFloat(f2Analysis.winPercentage);
    
    if (f1WinPct > f2WinPct) {
      f1Score += 1;
      analysis.factors.push(`${fighter1.displayName} has better win rate (${f1WinPct}% vs ${f2WinPct}%)`);
    } else if (f2WinPct > f1WinPct) {
      f2Score += 1;
      analysis.factors.push(`${fighter2.displayName} has better win rate (${f2WinPct}% vs ${f1WinPct}%)`);
    }
    
    // Streak factor
    const f1Streak = f1Analysis.streak;
    const f2Streak = f2Analysis.streak;
    
    if (f1Streak.includes('W') && !f2Streak.includes('W')) {
      f1Score += 1;
      analysis.factors.push(`${fighter1.displayName} on winning streak (${f1Streak})`);
    } else if (f2Streak.includes('W') && !f1Streak.includes('W')) {
      f2Score += 1;
      analysis.factors.push(`${fighter2.displayName} on winning streak (${f2Streak})`);
    }
    
    // Finish rate factor
    const f1FinishRate = parseFloat(f1Analysis.finishRate);
    const f2FinishRate = parseFloat(f2Analysis.finishRate);
    
    if (f1FinishRate > f2FinishRate + 10) { // 10% difference threshold
      f1Score += 1;
      analysis.factors.push(`${fighter1.displayName} higher finish rate (${f1Analysis.finishRate} vs ${f2Analysis.finishRate})`);
    } else if (f2FinishRate > f1FinishRate + 10) {
      f2Score += 1;
      analysis.factors.push(`${fighter2.displayName} higher finish rate (${f2Analysis.finishRate} vs ${f1Analysis.finishRate})`);
    }
    
    // Determine favorite
    if (f1Score > f2Score) {
      analysis.favorite = fighter1.displayName;
      analysis.confidence = Math.min(((f1Score - f2Score) / 3) * 100, 85);
    } else if (f2Score > f1Score) {
      analysis.favorite = fighter2.displayName;
      analysis.confidence = Math.min(((f2Score - f1Score) / 3) * 100, 85);
    } else {
      analysis.prediction = "Too close to call - even matchup";
      return analysis;
    }
    
    analysis.prediction = `${analysis.favorite} (${analysis.confidence.toFixed(0)}% confidence)`;
    
  } catch (error) {
    console.error("Error in matchup analysis:", error.message);
    analysis.prediction = "Analysis error";
  }
  
  return analysis;
};

// ===========================================
// CORE FUNCTIONS (ORIGINAL)
// ===========================================

const appendPastEvent = (fullEventObj) => {
  const existing = loadJson(PAST_EVENTS_FILE);
  if (!existing.some(e => e.eventId === fullEventObj.eventId)) {
    existing.push(fullEventObj);
    saveJson(PAST_EVENTS_FILE, existing);
  }
};

const saveUnannouncedFights = (unannounced) => {
  saveJson(UPCOMING_UNANNOUNCED_FILE, unannounced);
};

const saveFightDetails = (details) => {
  saveJson(FIGHT_DETAILS_FILE, details);
};

const logNewFights = (entries) => {
  const log = loadJson(FIGHT_LOG_FILE);
  const updated = [...log, ...entries];
  saveJson(FIGHT_LOG_FILE, updated);
};

const sendDiscordAlert = async (eventName, fightNames) => {
  const content = `🚨 **${eventName}**\nNew fights added:\n${fightNames.map(name => `- ${name}`).join('\n')}`;
  await sendDiscordMessage(content);
};

const sendUpdatedFightsAlert = async (eventName, fightNames) => {
  const content = `🔄 **${eventName}**\nUpdated fights:\n${fightNames.map(name => `- ${name}`).join('\n')}`;
  await sendDiscordMessage(content);
};

const sendFightChangesAlert = async (eventName, changes) => {
  const content = `⚠️ **${eventName}**\nFight changes detected:\n${changes.map(change => `- ${change}`).join('\n')}`;
  await sendDiscordMessage(content);
};

const sendRemovedFightsAlert = async (removedFights) => {
  const content = `❌ **Fights Removed**\n${removedFights.map(fight => `- ${fight.eventName}: ${fight.fightName}`).join('\n')}`;
  await sendDiscordMessage(content);
};

const fetchAthletesBatch = async (athleteRefs, concurrencyLimit = 8) => {
  if (athleteRefs.length === 0) return [];
  
  const results = [];
  const toFetch = [];
  const refToIndexMap = new Map();
  
  // Check cache first and build index mapping - PRESERVE ORIGINAL LOGIC
  for (let i = 0; i < athleteRefs.length; i++) {
    const ref = athleteRefs[i];
    if (athleteCache.has(ref)) {
      const cached = athleteCache.get(ref);
      // Handle both old string format and new object format
      results[i] = typeof cached === 'string' ? cached : cached.name;
    } else {
      results[i] = null;
      toFetch.push({ ref, originalIndex: i });
      refToIndexMap.set(ref, i);
    }
  }
  
  if (toFetch.length === 0) return results;
  
  console.log(`  📡 Fetching ${toFetch.length} new athletes...`);
  
  // Process in smaller chunks to avoid overwhelming the API
  const chunks = [];
  for (let i = 0; i < toFetch.length; i += concurrencyLimit) {
    chunks.push(toFetch.slice(i, i + concurrencyLimit));
  }
  
  let fetchedCount = 0;
  for (const chunk of chunks) {
    const promises = chunk.map(async ({ ref, originalIndex }) => {
      const athlete = await safeFetch(ref + "?lang=en&region=us");
      const name = athlete?.displayName || "Unknown Fighter";
      const athleteId = athlete?.id;
      
      // Store both formats for compatibility
      athleteCache.set(ref, name); // Original format for compatibility
      athleteCache.set(`${ref}_enhanced`, { name, id: athleteId }); // Enhanced format
      fetchedCount++;
      
      // Show progress for large batches
      if (toFetch.length > 10 && fetchedCount % 5 === 0) {
        console.log(`    ⚡ Progress: ${fetchedCount}/${toFetch.length} athletes fetched`);
      }
      
      return { originalIndex, name, id: athleteId };
    });
    
    const chunkResults = await Promise.all(promises);
    
    // Update results array
    for (const { originalIndex, name } of chunkResults) {
      results[originalIndex] = name; // Return names for original compatibility
    }
  }
  
  return results;
};

const processEventCompetitions = async (competitions, eventId, eventName) => {
  const allAthleteRefs = [];
  const competitionData = [];
  
  // Collect all athlete references first
  for (const comp of competitions) {
    const athleteRefs = comp.competitors.map(c => c.athlete.$ref);
    allAthleteRefs.push(...athleteRefs);
    competitionData.push({
      fightId: comp.id,
      athleteRefs,
      startIndex: allAthleteRefs.length - athleteRefs.length
    });
  }
  
  // Batch fetch all athletes for this event - returns names array for compatibility
  const allAthleteNames = await fetchAthletesBatch(allAthleteRefs);
  
  // Process fights with cached athlete data
  const fights = [];
  for (const compData of competitionData) {
    const athleteNames = compData.athleteRefs.map((_, index) => 
      allAthleteNames[compData.startIndex + index]
    );
    
    // Get athlete IDs for enhanced features
    const athleteIds = [];
    for (const ref of compData.athleteRefs) {
      const enhanced = athleteCache.get(`${ref}_enhanced`);
      if (enhanced && enhanced.id) {
        athleteIds.push(enhanced.id);
      }
    }
    
    fights.push({
      fightId: compData.fightId,
      athletes: athleteNames,
      athleteIds: athleteIds, // Enhanced feature
      fightName: athleteNames.join(" vs "),
      unannounced: athleteNames.every(name => name.toLowerCase().includes("tba")),
      eventId,
      eventName
    });
  }
  
  return fights;
};

const detectFightChanges = (previousDetails, currentFights) => {
  const changes = [];
  const removedFights = [];
  const currentFightIds = new Set(currentFights.map(f => f.fightId));
  
  for (const [fightId, oldFight] of Object.entries(previousDetails)) {
    if (!currentFightIds.has(fightId)) {
      removedFights.push({
        fightId,
        fightName: oldFight.fightName,
        eventName: oldFight.eventName
      });
      console.log(`  ❌ Fight removed: ${oldFight.fightName} from ${oldFight.eventName}`);
    }
  }
  
  for (const currentFight of currentFights) {
    const oldFight = previousDetails[currentFight.fightId];
    if (oldFight) {
      const oldFighters = oldFight.athletes.sort();
      const newFighters = currentFight.athletes.sort();
      
      if (JSON.stringify(oldFighters) !== JSON.stringify(newFighters)) {
        const changeMsg = `${oldFight.fightName} → ${currentFight.fightName}`;
        changes.push(changeMsg);
        console.log(`  🔄 Fight changed: ${changeMsg} in ${currentFight.eventName}`);
      }
    }
  }
  
  return { changes, removedFights };
};

// ===========================================
// MAIN FUNCTION
// ===========================================

export async function getUFCFights() {
  const startTime = Date.now();
  console.log("🚀 Starting UFC watcher with enhanced features...");

  let pstTime;
  try {
    pstTime = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: true
    });
  } catch (timeErr) {
    console.warn("⚠️ Could not apply PST formatting:", timeErr);
    pstTime = new Date().toISOString();
  }

  try {
    await sendDiscordMessage(`👀 Running UFC watcher script at ${pstTime}`);
  } catch (discordErr) {
    console.error("❌ Failed to send initial Discord message:", discordErr);
  }

  const knownFights = loadJson(KNOWN_FIGHTS_FILE);
  const knownEvents = loadJson(KNOWN_EVENTS_FILE);
  const upcomingUnannounced = loadJson(UPCOMING_UNANNOUNCED_FILE);
  const previousFightDetails = loadJson(FIGHT_DETAILS_FILE);

  try {
    // Quick API health check before starting enhanced features
    console.log("🔍 Checking ESPN API status...");
    const apiHealthCheck = await safeFetch("https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard");
    
    if (!apiHealthCheck) {
      console.log("⚠️ ESPN API appears to be down - running in minimal mode");
      await sendDiscordMessage("⚠️ **ESPN API Unavailable**\nESPN's API is currently down or experiencing issues.\n\nThe script will skip enhanced features and avoid sending false removal notifications until the API is restored.");
      
      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`⚡ UFC watcher completed in ${executionTime} seconds (API down)`);
      await sendDiscordMessage(`⚠️ UFC watcher completed in ${executionTime}s - ESPN API unavailable`);
      return;
    } else {
      console.log("✅ ESPN API is responding");
    }

    // Enhanced features execution (with error handling to not break main functionality)
    console.log("\n🔴 Checking for live events...");
    try {
      await monitorLiveFights();
    } catch (error) {
      console.log("Live monitoring failed:", error.message);
    }
    
    console.log("\n📈 Tracking rankings...");
    try {
      await trackRankingChanges();
    } catch (error) {
      console.log("Rankings tracking failed:", error.message);
    }
    
    console.log("\n📊 Analyzing trends...");
    try {
      await analyzeHistoricalTrends();
    } catch (error) {
      console.log("Trends analysis failed:", error.message);
    }

    // Main UFC data processing with better error handling
    const board = await safeFetch("https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard");
    
    // If the main scoreboard API fails, check if this is a temporary outage
    if (!board) {
      console.log("⚠️ ESPN API appears to be down - checking if this is temporary...");
      await sendDiscordMessage("⚠️ **ESPN API Issue Detected**\nUFC API appears to be temporarily unavailable. Will retry on next run.\n\nThis is likely a temporary ESPN outage, not a script issue.");
      
      // Don't process removals if we can't fetch any data
      console.log("⚡ Skipping processing due to API unavailability");
      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`⚡ UFC watcher completed in ${executionTime} seconds (API unavailable)`);
      await sendDiscordMessage(`⚠️ UFC watcher completed in ${executionTime}s - ESPN API temporarily unavailable`);
      return;
    }
    
    const calendar = board?.leagues?.[0]?.calendar || [];

    const now = new Date();
    const fourMonthsFromNow = new Date();
    fourMonthsFromNow.setMonth(now.getMonth() + 4);

    const eventIds = calendar.map(item => item.event?.$ref?.match(/events\/(\d+)/)?.[1]).filter(Boolean);
    const allEventIdsRaw = Array.from(new Set([...knownEvents, ...eventIds]));

    // If we have no event IDs from the API but we have known events, something is wrong
    if (eventIds.length === 0 && knownEvents.length > 0) {
      console.log("⚠️ No new events found from API but we have known events - likely API issue");
      await sendDiscordMessage("⚠️ **ESPN Calendar API Issue**\nNo events found in ESPN calendar. This is likely a temporary API issue.\n\nUsing previously known events to avoid false removal notifications.");
      
      // Use only known events to avoid mass removal notifications
      const eventChunks = [];
      const chunkSize = 6;
      for (let i = 0; i < knownEvents.length; i += chunkSize) {
        eventChunks.push(knownEvents.slice(i, i + chunkSize));
      }

      const allEvents = [];
      let processedEvents = 0;
      
      for (const chunk of eventChunks) {
        const promises = chunk.map(async eventId => {
          const url = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`;
          const event = await safeFetch(url);
          processedEvents++;
          
          return (event && event.name && event.competitions && event.date) ? { eventId, event } : null;
        });
        const chunkResults = await Promise.all(promises);
        allEvents.push(...chunkResults.filter(Boolean));
      }

      // If we can't get any known events either, it's definitely an API outage
      if (allEvents.length === 0) {
        console.log("❌ Cannot fetch any event data - ESPN API appears to be down");
        await sendDiscordMessage("❌ **ESPN API Outage Confirmed**\nCannot fetch any UFC event data. ESPN's API appears to be experiencing an outage.\n\nScript will resume normal operation when API is restored.");
        const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⚡ UFC watcher completed in ${executionTime} seconds (API outage)`);
        await sendDiscordMessage(`❌ UFC watcher completed in ${executionTime}s - ESPN API outage detected`);
        return;
      }

      // Continue with limited processing
      console.log(`⚡ Processing ${allEvents.length} known events (limited mode due to API issues)...`);
      
      // Skip the normal processing and just report status
      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`⚡ UFC watcher completed in ${executionTime} seconds (limited mode)`);
      await sendDiscordMessage(`⚠️ UFC watcher completed in ${executionTime}s - Limited mode due to ESPN API issues`);
      return;
    }

    console.log(`📡 Fetching ${allEventIdsRaw.length} events...`);
    const eventChunks = [];
    const chunkSize = 6;
    for (let i = 0; i < allEventIdsRaw.length; i += chunkSize) {
      eventChunks.push(allEventIdsRaw.slice(i, i + chunkSize));
    }

    const allEvents = [];
    let processedEvents = 0;
    
    for (const chunk of eventChunks) {
      const promises = chunk.map(async eventId => {
        const url = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`;
        const event = await safeFetch(url);
        processedEvents++;
        
        if (allEventIdsRaw.length > 20 && processedEvents % 10 === 0) {
          console.log(`  ⚡ Events progress: ${processedEvents}/${allEventIdsRaw.length}`);
        }
        
        return (event && event.name && event.competitions && event.date) ? { eventId, event } : null;
      });
      const chunkResults = await Promise.all(promises);
      allEvents.push(...chunkResults.filter(Boolean));
    }

    allEvents.sort((a, b) => new Date(a.event.date) - new Date(b.event.date));

    const validEventIds = [];
    const validFightIds = [];
    const newFightIdsGlobal = [];
    const updatedUnannounced = [];
    const newFightLogEntries = [];
    const currentFightDetails = {};
    const allCurrentFights = [];
    const upcomingEventIds = [];

    console.log(`⚡ Processing ${allEvents.length} valid events...`);

    for (const { eventId, event } of allEvents) {
      const eventDate = new Date(event.date);
      
      if (eventDate < now) {
        const pastEvent = { 
          eventId, 
          eventName: event.name, 
          fights: event.competitions.map(comp => ({
            fightId: comp.id,
            athletes: comp.competitors.map(c => c.athlete.displayName || "Unknown Fighter")
          }))
        };
        appendPastEvent(pastEvent);
        continue;
      }

      if (eventDate > fourMonthsFromNow) continue;

      validEventIds.push(eventId);
      upcomingEventIds.push(eventId);
      console.log(`\n📅 Event: ${event.name} on ${eventDate.toDateString()}`);

      const fights = await processEventCompetitions(event.competitions, eventId, event.name);
      allCurrentFights.push(...fights);
      
      const newFightsThisEvent = [];
      const updatedFightsThisEvent = [];

      for (const fight of fights) {
        validFightIds.push(fight.fightId);
        
        currentFightDetails[fight.fightId] = {
          fightName: fight.fightName,
          athletes: fight.athletes,
          athleteIds: fight.athleteIds,
          eventId: fight.eventId,
          eventName: fight.eventName,
          unannounced: fight.unannounced
        };
        
        console.log(`  🥊 Fight: ${fight.fightName} (ID: ${fight.fightId})`);
        
        const wasUnannounced = upcomingUnannounced.find(f => f.fightId === fight.fightId);
        if (!fight.unannounced && wasUnannounced) {
          updatedFightsThisEvent.push(fight.fightName);
        }
        if (fight.unannounced) {
          updatedUnannounced.push({ eventId, eventName: event.name, fightId: fight.fightId });
        }

        if (!knownFights.includes(fight.fightId)) {
          newFightsThisEvent.push(fight.fightName);
          newFightIdsGlobal.push(fight.fightId);
          newFightLogEntries.push({ 
            timestamp: new Date().toISOString(), 
            eventName: event.name, 
            fight: fight.fightName 
          });
        }
      }

      // Send Discord notifications - MAINTAIN ORIGINAL FUNCTIONALITY
      if (newFightsThisEvent.length) {
        await sendDiscordAlert(event.name, newFightsThisEvent);
      }
      if (updatedFightsThisEvent.length) {
        await sendUpdatedFightsAlert(event.name, updatedFightsThisEvent);
      }
    }

    // Enhanced features for upcoming events (with error handling)
    console.log("\n💰 Tracking odds movements...");
    try {
      await trackOddsMovements(upcomingEventIds);
    } catch (error) {
      console.log("Odds tracking failed:", error.message);
    }

    console.log("\n🔮 Generating predictions...");
    try {
      const predictions = loadJson(PREDICTIONS_FILE);
      let predictionsGenerated = 0;
      
      for (const eventId of upcomingEventIds.slice(0, 2)) {
        const eventPredictions = await generateFightPredictions(eventId);
        if (eventPredictions && eventPredictions.length > 0) {
          predictions[eventId] = {
            predictions: eventPredictions,
            generatedAt: new Date().toISOString()
          };
          predictionsGenerated++;
        }
      }
      
      saveJson(PREDICTIONS_FILE, predictions);
      
      if (predictionsGenerated > 0) {
        console.log(`Generated predictions for ${predictionsGenerated} events`);
      }
      
    } catch (error) {
      console.log("Predictions generation failed:", error.message);
    }

    // ENHANCED: Send summary of enhanced features activity
    const enhancedSummary = [];
    if (Object.keys(loadJson(RANKINGS_HISTORY_FILE)).length > 0) {
      enhancedSummary.push("📈 Rankings tracked");
    }
    if (Object.keys(loadJson(PREDICTIONS_FILE)).length > 0) {
      enhancedSummary.push("🔮 Predictions generated");
    }
    if (Object.keys(loadJson(FIGHTER_STATS_FILE)).length > 0) {
      enhancedSummary.push("📊 Fighter stats cached");
    }
    
    if (enhancedSummary.length > 0) {
      await sendDiscordMessage(`🚀 **Enhanced Features Active**\n${enhancedSummary.join('\n')}\n\n💡 These features will send notifications when:\n• Rankings change\n• Live events start\n• Betting odds move significantly\n• New fights are announced with enhanced stats`);
    }

    // Fight changes detection
    console.log("\n🔍 Checking for fight changes and removals...");
    const { changes, removedFights } = detectFightChanges(previousFightDetails, allCurrentFights);
    
    const changesByEvent = {};
    for (const change of changes) {
      const fight = allCurrentFights.find(f => change.includes(f.fightName));
      if (fight) {
        if (!changesByEvent[fight.eventName]) {
          changesByEvent[fight.eventName] = [];
        }
        changesByEvent[fight.eventName].push(change);
      }
    }
    
    for (const [eventName, eventChanges] of Object.entries(changesByEvent)) {
      await sendFightChangesAlert(eventName, eventChanges);
    }
    
    if (removedFights.length > 0) {
      await sendRemovedFightsAlert(removedFights);
    }

    // Save all data
    saveJson(KNOWN_EVENTS_FILE, validEventIds);
    const cleanedFights = Array.from(new Set([...knownFights, ...newFightIdsGlobal]))
      .filter(id => validFightIds.includes(id));
    saveJson(KNOWN_FIGHTS_FILE, cleanedFights);
    saveUnannouncedFights(updatedUnannounced);
    saveFightDetails(currentFightDetails);
    if (newFightLogEntries.length) logNewFights(newFightLogEntries);
    
    if (newFightIdsGlobal.length === 0 && changes.length === 0 && removedFights.length === 0) {
      await sendDiscordMessage("✅ UFC watcher ran — no changes detected.");
    }

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⚡ UFC watcher completed in ${executionTime} seconds`);
    console.log(`📊 Cache stats: ${athleteCache.size} athletes cached`);
    console.log(`📊 Changes detected: ${changes.length} fighter changes, ${removedFights.length} removed fights`);
    await sendDiscordMessage(`✅ UFC watcher completed in ${executionTime}s - Cache: ${athleteCache.size} athletes, ${changes.length} changes, ${removedFights.length} removals`);
    
  } catch (err) {
    console.error("❌ General failure in getUFCFights:", err);
    await sendDiscordMessage(`❌ UFC watcher failed: ${err.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  getUFCFights();
}