// ufc-watcher.js
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
const FIGHT_DETAILS_FILE = "fightDetails.json"; // New file to store fight details

// Athlete cache to avoid redundant API calls
const athleteCache = new Map();

// Rate limiting
const delay = promisify(setTimeout);
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 50; // 50ms between requests

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
    return file === FIGHT_DETAILS_FILE ? {} : [];
  }
};

const saveJson = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

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

const safeFetch = async (url, retries = 2, delay = 500) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await rateLimitedFetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          console.log(`⏳ Rate limited, waiting ${delay * 2}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay * 2));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`⚠️  Attempt ${attempt + 1}/${retries} failed for ${url.substring(0, 50)}...`);
      if (attempt < retries - 1) {
        await new Promise(res => setTimeout(res, delay * (attempt + 1)));
      }
    }
  }
  console.error(`❌ All attempts failed for ${url.substring(0, 50)}...`);
  return null;
};

// Batch fetch athletes with caching and concurrency limit
const fetchAthletesBatch = async (athleteRefs, concurrencyLimit = 8) => {
  if (athleteRefs.length === 0) return [];
  
  const results = [];
  const toFetch = [];
  const refToIndexMap = new Map();
  
  // Check cache first and build index mapping
  for (let i = 0; i < athleteRefs.length; i++) {
    const ref = athleteRefs[i];
    if (athleteCache.has(ref)) {
      results[i] = athleteCache.get(ref);
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
      athleteCache.set(ref, name);
      fetchedCount++;
      
      // Show progress for large batches
      if (toFetch.length > 10 && fetchedCount % 5 === 0) {
        console.log(`    ⚡ Progress: ${fetchedCount}/${toFetch.length} athletes fetched`);
      }
      
      return { originalIndex, name };
    });
    
    const chunkResults = await Promise.all(promises);
    
    // Update results array
    for (const { originalIndex, name } of chunkResults) {
      results[originalIndex] = name;
    }
  }
  
  return results;
};

// Process competitions in batches to reduce API calls
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
  
  // Batch fetch all athletes for this event
  const allAthleteNames = await fetchAthletesBatch(allAthleteRefs);
  
  // Process fights with cached athlete data
  const fights = [];
  for (const compData of competitionData) {
    const athleteNames = compData.athleteRefs.map((_, index) => 
      allAthleteNames[compData.startIndex + index]
    );
    
    fights.push({
      fightId: compData.fightId,
      athletes: athleteNames,
      fightName: athleteNames.join(" vs "),
      unannounced: athleteNames.every(name => name.toLowerCase().includes("tba")),
      eventId,
      eventName
    });
  }
  
  return fights;
};

// Compare fight details to detect changes
const detectFightChanges = (previousDetails, currentFights) => {
  const changes = [];
  const removedFights = [];
  const currentFightIds = new Set(currentFights.map(f => f.fightId));
  
  // Check for removed fights - but exclude fights from recently completed events
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  for (const [fightId, oldFight] of Object.entries(previousDetails)) {
    if (!currentFightIds.has(fightId)) {
      // Check if this fight is from a recently completed event
      // If so, don't report it as removed - it's just moved to past events
      const isRecentlyCompleted = currentFights.length > 0 && 
        !currentFights.some(f => f.eventId === oldFight.eventId);
      
      if (!isRecentlyCompleted) {
        removedFights.push({
          fightId,
          fightName: oldFight.fightName,
          eventName: oldFight.eventName
        });
        console.log(`  ❌ Fight removed: ${oldFight.fightName} from ${oldFight.eventName}`);
      } else {
        console.log(`  📝 Fight moved to past events: ${oldFight.fightName} from ${oldFight.eventName}`);
      }
    }
  }
  
  // Check for fighter changes in existing fights
  for (const currentFight of currentFights) {
    const oldFight = previousDetails[currentFight.fightId];
    if (oldFight) {
      // Compare fighters
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

export async function getUFCFights() {
  const startTime = Date.now();
  console.log("🚀 Starting optimized UFC watcher...");

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
    const board = await safeFetch("https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard");
    const calendar = board?.leagues?.[0]?.calendar || [];

    const now = new Date();
    const fourMonthsFromNow = new Date();
    fourMonthsFromNow.setMonth(now.getMonth() + 4);

    const eventIds = calendar.map(item => item.event?.$ref?.match(/events\/(\d+)/)?.[1]).filter(Boolean);
    const allEventIdsRaw = Array.from(new Set([...knownEvents, ...eventIds]));

    // Batch fetch all events with concurrency limit
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

    console.log(`⚡ Processing ${allEvents.length} valid events...`);

    for (const { eventId, event } of allEvents) {
      const eventDate = new Date(event.date);
      
      // FIXED: Use the same processEventCompetitions function for past events too
      if (eventDate < now) {
        console.log(`📝 Processing past event: ${event.name}`);
        // Use the same processing function to get proper athlete names
        const pastFights = await processEventCompetitions(event.competitions, eventId, event.name);
        
        const pastEvent = { 
          eventId, 
          eventName: event.name, 
          fights: pastFights.map(fight => ({
            fightId: fight.fightId,
            athletes: fight.athletes
          }))
        };
        appendPastEvent(pastEvent);
        continue;
      }

      if (eventDate > fourMonthsFromNow) continue;

      validEventIds.push(eventId);
      console.log(`\n📅 Event: ${event.name} on ${eventDate.toDateString()}`);

      // Process all fights for this event in batch
      const fights = await processEventCompetitions(event.competitions, eventId, event.name);
      allCurrentFights.push(...fights);
      
      const newFightsThisEvent = [];
      const updatedFightsThisEvent = [];

      for (const fight of fights) {
        validFightIds.push(fight.fightId);
        
        // Store current fight details
        currentFightDetails[fight.fightId] = {
          fightName: fight.fightName,
          athletes: fight.athletes,
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

      // Send Discord notifications
      if (newFightsThisEvent.length) await sendDiscordAlert(event.name, newFightsThisEvent);
      if (updatedFightsThisEvent.length) await sendUpdatedFightsAlert(event.name, updatedFightsThisEvent);
    }

    // Detect fight changes and removals
    console.log("\n🔍 Checking for fight changes and removals...");
    const { changes, removedFights } = detectFightChanges(previousFightDetails, allCurrentFights);
    
    // Group changes by event for cleaner notifications
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
    
    // Send change notifications
    for (const [eventName, eventChanges] of Object.entries(changesByEvent)) {
      await sendFightChangesAlert(eventName, eventChanges);
    }
    
    // Only send removal notifications if there are actually removed fights (not just moved to past events)
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
    console.log(`⚡ Completed in ${executionTime} seconds`);
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
