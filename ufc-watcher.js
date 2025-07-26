// ufc-watcher.js
import fetch from "node-fetch";
import 'dotenv/config';
import fs from "fs";
import { promisify } from 'util';
import { enhanceMainScriptForLiveEvents, sendLiveEventNotification } from './ufc-live-checker.js';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const KNOWN_FIGHTS_FILE = "knownFights.json";
const KNOWN_EVENTS_FILE = "knownEvents.json";
const PAST_EVENTS_FILE = "pastEvents.json";
const UPCOMING_UNANNOUNCED_FILE = "upcomingUnannouncedFights.json";
const FIGHT_LOG_FILE = "fightLog.json";
const FIGHT_DETAILS_FILE = "fightDetails.json";
const fightDetailsHistory = new Map();
const sentAlerts = new Map();

// Debug configuration
const DEBUG_CONFIG = {
  enabled: process.env.DEBUG_MODE === 'true' || false,
  categories: {
    api: true,
    fighters: true,
    formatting: true,
    events: true,
    changes: true,
    performance: true,
    cache: true,
    flags: true // New category for flag processing
  }
};

// Debug logging utility
const debug = {
  log: (category, message, data = null) => {
    if (!DEBUG_CONFIG.enabled || !DEBUG_CONFIG.categories[category]) return;
    
    const emoji = {
      api: '📡',
      fighters: '🔍', 
      formatting: '🎨',
      events: '📅',
      changes: '🔄',
      performance: '⚡',
      cache: '💾',
      flags: '🏳️'
    };
    
    const prefix = `${emoji[category] || '🐛'} DEBUG [${category.toUpperCase()}]`;
    
    if (data) {
      console.log(`${prefix} - ${message}:`, data);
    } else {
      console.log(`${prefix} - ${message}`);
    }
  },
  
  api: (message, data) => debug.log('api', message, data),
  fighters: (message, data) => debug.log('fighters', message, data),
  formatting: (message, data) => debug.log('formatting', message, data),
  events: (message, data) => debug.log('events', message, data),
  changes: (message, data) => debug.log('changes', message, data),
  performance: (message, data) => debug.log('performance', message, data),
  cache: (message, data) => debug.log('cache', message, data),
  flags: (message, data) => debug.log('flags', message, data),
  
  time: (label) => {
    if (!DEBUG_CONFIG.enabled || !DEBUG_CONFIG.categories.performance) return { end: () => {} };
    
    const start = Date.now();
    console.time(`⚡ DEBUG [PERFORMANCE] - ${label}`);
    
    return {
      end: () => {
        console.timeEnd(`⚡ DEBUG [PERFORMANCE] - ${label}`);
        const duration = Date.now() - start;
        debug.performance(`${label} completed in ${duration}ms`);
      }
    };
  }
};

// Enhanced country/flag mapping for international appeal
const getCountryFlag = (countryCode, countryName = null) => {
  // Handle null/undefined cases
  if (!countryCode && !countryName) return null;
  
  // Common country code to emoji flag mapping
  const flagMap = {
    // North America
    'US': '🇺🇸', 'USA': '🇺🇸', 'United States': '🇺🇸',
    'CA': '🇨🇦', 'CAN': '🇨🇦', 'Canada': '🇨🇦',
    'MX': '🇲🇽', 'MEX': '🇲🇽', 'Mexico': '🇲🇽',
    
    // Europe
    'GB': '🇬🇧', 'UK': '🇬🇧', 'United Kingdom': '🇬🇧', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'IE': '🇮🇪', 'IRL': '🇮🇪', 'Ireland': '🇮🇪',
    'FR': '🇫🇷', 'FRA': '🇫🇷', 'France': '🇫🇷',
    'DE': '🇩🇪', 'DEU': '🇩🇪', 'Germany': '🇩🇪',
    'IT': '🇮🇹', 'ITA': '🇮🇹', 'Italy': '🇮🇹',
    'ES': '🇪🇸', 'ESP': '🇪🇸', 'Spain': '🇪🇸',
    'NL': '🇳🇱', 'NLD': '🇳🇱', 'Netherlands': '🇳🇱',
    'SE': '🇸🇪', 'SWE': '🇸🇪', 'Sweden': '🇸🇪',
    'NO': '🇳🇴', 'NOR': '🇳🇴', 'Norway': '🇳🇴',
    'PL': '🇵🇱', 'POL': '🇵🇱', 'Poland': '🇵🇱',
    'RU': '🇷🇺', 'RUS': '🇷🇺', 'Russia': '🇷🇺',
    'UA': '🇺🇦', 'UKR': '🇺🇦', 'Ukraine': '🇺🇦',
    
    // South America
    'BR': '🇧🇷', 'BRA': '🇧🇷', 'Brazil': '🇧🇷',
    'AR': '🇦🇷', 'ARG': '🇦🇷', 'Argentina': '🇦🇷',
    'CL': '🇨🇱', 'CHL': '🇨🇱', 'Chile': '🇨🇱',
    'CO': '🇨🇴', 'COL': '🇨🇴', 'Colombia': '🇨🇴',
    'PE': '🇵🇪', 'PER': '🇵🇪', 'Peru': '🇵🇪',
    'VE': '🇻🇪', 'VEN': '🇻🇪', 'Venezuela': '🇻🇪',
    
    // Asia & Oceania  
    'AU': '🇦🇺', 'AUS': '🇦🇺', 'Australia': '🇦🇺',
    'NZ': '🇳🇿', 'NZL': '🇳🇿', 'New Zealand': '🇳🇿',
    'JP': '🇯🇵', 'JPN': '🇯🇵', 'Japan': '🇯🇵',
    'KR': '🇰🇷', 'KOR': '🇰🇷', 'South Korea': '🇰🇷',
    'CN': '🇨🇳', 'CHN': '🇨🇳', 'China': '🇨🇳',
    'TH': '🇹🇭', 'THA': '🇹🇭', 'Thailand': '🇹🇭',
    'PH': '🇵🇭', 'PHL': '🇵🇭', 'Philippines': '🇵🇭',
    'IN': '🇮🇳', 'IND': '🇮🇳', 'India': '🇮🇳',
    'ID': '🇮🇩', 'IDN': '🇮🇩', 'Indonesia': '🇮🇩',
    'MY': '🇲🇾', 'MYS': '🇲🇾', 'Malaysia': '🇲🇾',
    'SG': '🇸🇬', 'SGP': '🇸🇬', 'Singapore': '🇸🇬',
    
    // Africa & Middle East
    'ZA': '🇿🇦', 'RSA': '🇿🇦', 'South Africa': '🇿🇦',
    'NG': '🇳🇬', 'NGA': '🇳🇬', 'Nigeria': '🇳🇬',
    'EG': '🇪🇬', 'EGY': '🇪🇬', 'Egypt': '🇪🇬',
    'IL': '🇮🇱', 'ISR': '🇮🇱', 'Israel': '🇮🇱',
    'IR': '🇮🇷', 'IRN': '🇮🇷', 'Iran': '🇮🇷',
    'IQ': '🇮🇶', 'IRQ': '🇮🇶', 'Iraq': '🇮🇶',
    'AE': '🇦🇪', 'ARE': '🇦🇪', 'UAE': '🇦🇪',
    
    // Additional MMA hotspots
    'FI': '🇫🇮', 'FIN': '🇫🇮', 'Finland': '🇫🇮',
    'IS': '🇮🇸', 'ISL': '🇮🇸', 'Iceland': '🇮🇸',
    'LT': '🇱🇹', 'LTU': '🇱🇹', 'Lithuania': '🇱🇹',
    'LV': '🇱🇻', 'LVA': '🇱🇻', 'Latvia': '🇱🇻',
    'EE': '🇪🇪', 'EST': '🇪🇪', 'Estonia': '🇪🇪',
    'CZ': '🇨🇿', 'CZE': '🇨🇿', 'Czech Republic': '🇨🇿',
    'SK': '🇸🇰', 'SVK': '🇸🇰', 'Slovakia': '🇸🇰',
    'HR': '🇭🇷', 'HRV': '🇭🇷', 'Croatia': '🇭🇷',
    'RS': '🇷🇸', 'SRB': '🇷🇸', 'Serbia': '🇷🇸',
    'BA': '🇧🇦', 'BIH': '🇧🇦', 'Bosnia': '🇧🇦',
    'MK': '🇲🇰', 'MKD': '🇲🇰', 'North Macedonia': '🇲🇰',
    'GE': '🇬🇪', 'GEO': '🇬🇪', 'Georgia': '🇬🇪',
    'AM': '🇦🇲', 'ARM': '🇦🇲', 'Armenia': '🇦🇲',
    'AZ': '🇦🇿', 'AZE': '🇦🇿', 'Azerbaijan': '🇦🇿',
    'KZ': '🇰🇿', 'KAZ': '🇰🇿', 'Kazakhstan': '🇰🇿',
    'UZ': '🇺🇿', 'UZB': '🇺🇿', 'Uzbekistan': '🇺🇿',
    'KG': '🇰🇬', 'KGZ': '🇰🇬', 'Kyrgyzstan': '🇰🇬',
    'TJ': '🇹🇯', 'TJK': '🇹🇯', 'Tajikistan': '🇹🇯',
    'CU': '🇨🇺', 'CUB': '🇨🇺', 'Cuba': '🇨🇺',
    'JM': '🇯🇲', 'JAM': '🇯🇲', 'Jamaica': '🇯🇲'
  };
  
  // Try country code first, then country name
  const key = countryCode || countryName;
  if (!key) return null;
  
  // Direct lookup
  let flag = flagMap[key];
  if (flag) {
    debug.flags(`Found flag for ${key}`, flag);
    return flag;
  }
  
  // Try uppercase version
  flag = flagMap[key.toUpperCase()];
  if (flag) {
    debug.flags(`Found flag for ${key.toUpperCase()}`, flag);
    return flag;
  }
  
  // Try to match partial country names
  const keyLower = key.toLowerCase();
  for (const [mapKey, mapFlag] of Object.entries(flagMap)) {
    if (mapKey.toLowerCase().includes(keyLower) || keyLower.includes(mapKey.toLowerCase())) {
      debug.flags(`Found partial match for ${key} -> ${mapKey}`, mapFlag);
      return mapFlag;
    }
  }
  
  debug.flags(`No flag found for ${key}`);
  return null;
};

// Enhanced athlete cache to store complete fighter data
const athleteCache = new Map();
const fighterDataCache = new Map();

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

// Helper function to format event date and time in PST/PDT
const formatEventDateTime = (eventDate) => {
  try {
    // eventDate comes as UTC string like "2025-07-26T16:00Z"
    const date = new Date(eventDate);
    
    // Format date (e.g., "Saturday, July 26, 2025")
    const dateString = date.toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "long",
      year: "numeric", 
      month: "long",
      day: "numeric"
    });
    
    // Format time (e.g., "9:00 AM PDT" or "9:00 AM PST")
    const timeString = date.toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      hour12: true
    });
    
    return `${dateString} at ${timeString}`;
  } catch (err) {
    console.warn("⚠️ Could not format event date:", err);
    return "Date/Time TBA";
  }
};

// Fetch fighter record from records API
const fetchFighterRecord = async (athleteId) => {
  try {
    const recordUrl = `http://sports.core.api.espn.com/v2/sports/mma/athletes/${athleteId}/records?lang=en&region=us`;
    debug.api(`Fetching record for athlete ${athleteId}`);
    const recordData = await safeFetch(recordUrl);
    
    // Look for overall record
    const overallRecord = recordData?.items?.find(record => 
      record.name === 'overall' || record.type === 'total'
    );
    
    const result = overallRecord?.summary || null;
    debug.fighters(`Record for athlete ${athleteId}`, result);
    return result;
  } catch (error) {
    console.warn(`⚠️ Could not fetch record for athlete ${athleteId}:`, error.message);
    return null;
  }
};

// Create unknown fighter object
const createUnknownFighter = () => ({
  id: null,
  displayName: "Unknown Fighter",
  nickname: null,
  record: null,
  weightClass: null,
  citizenship: null,
  countryFlag: null,
  headshot: null,
  flag: null,
  shortDisplay: "Unknown Fighter"
});

// Enhanced formatEnhancedFightForDiscord with flag display
const formatEnhancedFightForDiscord = (athlete1, athlete2, weightClass = null) => {
  debug.formatting('Formatting fight for Discord');
  
  if (!athlete1 || !athlete2) {
    debug.formatting('Missing athlete data!');
    return `Unknown Fighter vs Unknown Fighter`;
  }

  let fightDisplay = '';
  
  // Fighter 1 - clean text format with flag
  fightDisplay += `**${athlete1.displayName}**`;
  if (athlete1.countryFlag) {
    fightDisplay += ` ${athlete1.countryFlag}`;
    debug.formatting(`Added flag for fighter 1: ${athlete1.countryFlag}`);
  }
  if (athlete1.nickname) {
    fightDisplay += ` "${athlete1.nickname}"`;
  }
  if (athlete1.record) {
    fightDisplay += ` (${athlete1.record})`;
  }
  
  fightDisplay += ' vs ';
  
  // Fighter 2 - clean text format with flag
  fightDisplay += `**${athlete2.displayName}**`;
  if (athlete2.countryFlag) {
    fightDisplay += ` ${athlete2.countryFlag}`;
    debug.formatting(`Added flag for fighter 2: ${athlete2.countryFlag}`);
  }
  if (athlete2.nickname) {
    fightDisplay += ` "${athlete2.nickname}"`;
  }
  if (athlete2.record) {
    fightDisplay += ` (${athlete2.record})`;
  }
  
  // Add division/weight class
  const division = weightClass || athlete1.weightClass || athlete2.weightClass;
  if (division) {
    fightDisplay += ` (${division})`;
  }
  
  debug.formatting('Final formatted display', fightDisplay);
  return fightDisplay;
};

// Enhanced Discord alert with complete fighter data
const sendEnhancedDiscordAlert = async (eventName, eventDate, fights) => {
  const dateTimeInfo = formatEventDateTime(eventDate);
  
  // Create main message content with better formatting
  let content = `🚨 **${eventName}**\n\n📅 **${dateTimeInfo}**\n\n🥊 **New fights added:**\n\n`;
  
  fights.forEach((fight, index) => {
    if (fight.athletes && fight.athletes.length >= 2) {
      debug.formatting(`About to format fight: ${fight.fightName}`);
      debug.formatting('Athletes array length', fight.athletes.length);
      debug.formatting('Athlete 1 data', fight.athletes[0]);
      debug.formatting('Athlete 2 data', fight.athletes[1]);
      debug.formatting('Weight class', fight.weightClass);
      
      const enhancedDisplay = formatEnhancedFightForDiscord(
        fight.athletes[0], 
        fight.athletes[1], 
        fight.weightClass
      );
      
      // Add fight number and enhanced spacing
      content += `**${index + 1}.** ${enhancedDisplay}\n\n`;
    } else {
      debug.formatting('Fight missing athletes data', fight);
      content += `**${index + 1}.** ${fight.fightName}\n\n`;
    }
  });
  
  // Handle Discord's 2000 character limit
  if (content.length > 1900) {
    content = content.substring(0, 1900) + '\n\n*...truncated (message too long)*';
  }
  
  await sendDiscordMessage(content);
};

// Enhanced updated fights alert
const sendEnhancedUpdatedFightsAlert = async (eventName, eventDate, fights) => {
  const dateTimeInfo = formatEventDateTime(eventDate);
  let content = `🔄 **${eventName}**\n\n📅 **${dateTimeInfo}**\n\n⬆️ **Updated fights:**\n\n`;
  
  fights.forEach((fight, index) => {
    if (typeof fight === 'string') {
      content += `**${index + 1}.** ${fight}\n\n`;
    } else if (fight.athletes && fight.athletes.length >= 2) {
      const enhancedDisplay = formatEnhancedFightForDiscord(
        fight.athletes[0], 
        fight.athletes[1], 
        fight.weightClass
      );
      content += `**${index + 1}.** ${enhancedDisplay}\n\n`;
    }
  });
  
  if (content.length > 1900) {
    content = content.substring(0, 1900) + '\n\n*...truncated*';
  }
  
  await sendDiscordMessage(content);
};

// Enhanced fight changes alert
const sendEnhancedFightChangesAlert = async (eventName, eventDate, changes) => {
  const dateTimeInfo = formatEventDateTime(eventDate);
  let content = `⚠️ **${eventName}**\n\n📅 **${dateTimeInfo}**\n\n🔄 **Fight changes detected:**\n\n`;
  
  changes.forEach((change, index) => {
    content += `**${index + 1}.** ${change}\n\n`;
  });
  
  if (content.length > 1900) {
    content = content.substring(0, 1900) + '\n\n*...truncated*';
  }
  
  await sendDiscordMessage(content);
};

const sendRemovedFightsAlert = async (removedFights) => {
  let content = `❌ **Fights Removed**\n\n`;
  
  removedFights.forEach((fight, index) => {
    content += `**${index + 1}.** ${fight.eventName}: ${fight.fightName}\n\n`;
  });
  
  await sendDiscordMessage(content);
};

const safeFetch = async (url, retries = 2, delay = 500) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      debug.api(`Attempt ${attempt + 1}/${retries} for ${url.substring(0, 50)}...`);
      const res = await rateLimitedFetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          console.log(`⏳ Rate limited, waiting ${delay * 2}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay * 2));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      debug.api(`Success for ${url.substring(0, 50)}...`);
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

// Enhanced athlete fetching with records, nicknames, headshots, and flags
const fetchAthletesBatchEnhanced = async (athleteRefs, concurrencyLimit = 6) => {
  if (athleteRefs.length === 0) return [];
  
  const timer = debug.time(`Fetch ${athleteRefs.length} fighters`);
  
  const results = [];
  const toFetch = [];
  
  // Check cache first 
  for (let i = 0; i < athleteRefs.length; i++) {
    const ref = athleteRefs[i];
    if (fighterDataCache.has(ref)) {
      results[i] = fighterDataCache.get(ref);
      debug.cache(`Cache hit for fighter: ${ref.substring(ref.lastIndexOf('/') + 1)}`);
    } else {
      results[i] = null;
      toFetch.push({ ref, originalIndex: i });
    }
  }
  
  if (toFetch.length === 0) {
    timer.end();
    return results;
  }
  
  console.log(`  📡 Fetching ${toFetch.length} fighters with enhanced data (records, nicknames, images, flags)...`);
  debug.api(`Fetching ${toFetch.length} fighters with enhanced data including flags`);
  
  // Process in smaller chunks to avoid overwhelming the API
  const chunks = [];
  for (let i = 0; i < toFetch.length; i += concurrencyLimit) {
    chunks.push(toFetch.slice(i, i + concurrencyLimit));
  }
  
  let fetchedCount = 0;
  for (const chunk of chunks) {
    const promises = chunk.map(async ({ ref, originalIndex }) => {
      try {
        // Fetch basic athlete data
        const athlete = await safeFetch(ref + "?lang=en&region=us");
        
        if (!athlete) {
          return { originalIndex, athlete: createUnknownFighter() };
        }
        
        // Fetch fighter record separately
        let record = null;
        if (athlete.id) {
          record = await fetchFighterRecord(athlete.id);
        }
        
        // Process nationality/flag data  
        let countryFlag = null;
        
        // Try to get flag from various sources
        if (athlete.citizenship) {
          countryFlag = getCountryFlag(null, athlete.citizenship);
          debug.flags(`Processed citizenship: ${athlete.citizenship} -> ${countryFlag}`);
        }
        
        // Fallback to flag href if available and no flag found yet
        if (!countryFlag && athlete.flag?.href) {
          // Extract country info from flag URL if possible
          const flagUrl = athlete.flag.href;
          const countryMatch = flagUrl.match(/flags\/([A-Z]{2,3})\./i);
          if (countryMatch) {
            countryFlag = getCountryFlag(countryMatch[1]);
            debug.flags(`Extracted from flag URL: ${countryMatch[1]} -> ${countryFlag}`);
          }
        }
        
        // Create enhanced fighter object with flag
        const enhancedFighter = {
          // Basic info
          id: athlete.id,
          displayName: athlete.displayName || "Unknown Fighter",
          nickname: athlete.nickname || null,
          
          // Fighting record
          record: record || null,
          
          // Physical/fighting info
          weightClass: athlete.weightClass?.text || null,
          citizenship: athlete.citizenship || null,
          
          // Flag/nationality
          countryFlag: countryFlag,
          
          // Media
          headshot: athlete.headshot?.href || null,
          flag: athlete.flag?.href || null, // Keep original for backwards compatibility
          
          // For backwards compatibility
          shortDisplay: athlete.displayName || "Unknown Fighter"
        };

        debug.fighters(`Fighter: ${enhancedFighter.displayName}`, {
          nickname: enhancedFighter.nickname,
          record: enhancedFighter.record,
          weightClass: enhancedFighter.weightClass,
          citizenship: enhancedFighter.citizenship,
          countryFlag: enhancedFighter.countryFlag,
          hasHeadshot: !!enhancedFighter.headshot
        });

        // Cache the enhanced data
        fighterDataCache.set(ref, enhancedFighter);
        fetchedCount++;
        
        // Progress logging
        if (toFetch.length > 10 && fetchedCount % 5 === 0) {
          console.log(`    ⚡ Progress: ${fetchedCount}/${toFetch.length} fighters processed`);
          debug.performance(`Progress: ${fetchedCount}/${toFetch.length} fighters processed`);
        }
        
        return { originalIndex, athlete: enhancedFighter };
        
      } catch (error) {
        console.warn(`⚠️ Error fetching fighter data:`, error.message);
        return { originalIndex, athlete: createUnknownFighter() };
      }
    });
    
    const chunkResults = await Promise.all(promises);
    
    // Update results array
    for (const { originalIndex, athlete } of chunkResults) {
      results[originalIndex] = athlete;
    }
  }
  
  timer.end();
  return results;
};

// Enhanced processEventCompetitions with complete fighter data
const processEventCompetitionsEnhanced = async (competitions, eventId, eventName, eventDate) => {
  const timer = debug.time(`Process ${competitions.length} competitions for ${eventName}`);
  
  const allAthleteRefs = [];
  const competitionData = [];
  
  // Collect all athlete references first  
  for (const comp of competitions) {
    const athleteRefs = comp.competitors.map(c => c.athlete.$ref);
    allAthleteRefs.push(...athleteRefs);
    competitionData.push({
      fightId: comp.id,
      athleteRefs,
      startIndex: allAthleteRefs.length - athleteRefs.length,
      weightClass: comp.type?.text || null // Get weight class from competition
    });
  }
  
  debug.events(`Collected ${allAthleteRefs.length} athlete refs for ${eventName}`);
  
  // Batch fetch all athletes with enhanced data including flags
  const allAthletes = await fetchAthletesBatchEnhanced(allAthleteRefs);
  
  // Process fights with enhanced athlete data
  const fights = [];
  for (const compData of competitionData) {
    const fightAthletes = compData.athleteRefs.map((_, index) => 
      allAthletes[compData.startIndex + index]
    );
    
    // Generate basic fight name for compatibility
    const basicName = fightAthletes.map(a => a.displayName).join(" vs ");
    
    fights.push({
      fightId: compData.fightId,
      athletes: fightAthletes, // Now contains enhanced fighter objects
      fightName: basicName, // Keep for compatibility
      unannounced: fightAthletes.every(a => a.displayName.toLowerCase().includes("tba")),
      eventId,
      eventName,
      eventDate,
      weightClass: compData.weightClass // Weight class from competition
    });
  }
  
  timer.end();
  return fights;
};

// Compare fight details to detect changes
const detectFightChanges = (previousDetails, currentFights) => {
  const timer = debug.time('Detect fight changes');
  
  const removedFights = [];
  const currentFightIds = new Set(currentFights.map(f => f.fightId));
  
  // Check for removed fights - but exclude fights from recently completed events
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
        debug.changes(`Fight removed: ${oldFight.fightName} from ${oldFight.eventName}`);
      } else {
        debug.changes(`Fight moved to past events: ${oldFight.fightName} from ${oldFight.eventName}`);
      }
    }
  }
  
  // Check for fighter changes in existing fights
  const changesByEvent = {};
  
  for (const currentFight of currentFights) {
    const oldFight = previousDetails[currentFight.fightId];
    if (oldFight) {
      // FIXED: Normalize athlete data for comparison
      // Old fights store athletes as strings, new fights store as objects
      let oldFighters, newFighters;
      
      if (Array.isArray(oldFight.athletes) && typeof oldFight.athletes[0] === 'string') {
        // Old format: athletes are strings
        oldFighters = [...oldFight.athletes].sort();
      } else if (Array.isArray(oldFight.athletes) && typeof oldFight.athletes[0] === 'object') {
        // Old format: athletes are objects (shouldn't happen, but handle it)
        oldFighters = oldFight.athletes.map(a => a.displayName || a).sort();
      } else {
        // Fallback
        oldFighters = [];
      }
      
      if (Array.isArray(currentFight.athletes) && typeof currentFight.athletes[0] === 'object') {
        // New format: athletes are enhanced objects
        newFighters = currentFight.athletes.map(a => a.displayName || a.shortDisplay || 'Unknown Fighter').sort();
      } else if (Array.isArray(currentFight.athletes) && typeof currentFight.athletes[0] === 'string') {
        // New format: athletes are strings (fallback case)
        newFighters = [...currentFight.athletes].sort();
      } else {
        // Fallback
        newFighters = [];
      }
      
      // Compare normalized fighter names
      if (JSON.stringify(oldFighters) !== JSON.stringify(newFighters)) {
        const oldFightName = oldFighters.join(' vs ');
        const newFightName = newFighters.join (' vs ');
        const changeMsg = `${oldFightName} → ${newFightName}`;
        
        // Use the current fight's event name directly and store event date
        if (!changesByEvent[currentFight.eventName]) {
          changesByEvent[currentFight.eventName] = {
            changes: [],
            eventDate: currentFight.eventDate // Store event date for notifications
          };
        }
        changesByEvent[currentFight.eventName].changes.push(changeMsg);
        
        debug.changes(`Fight changed: ${changeMsg} in ${currentFight.eventName}`);
      }
    }
  }
  
  timer.end();
  return { changesByEvent, removedFights };
};

export async function getUFCFights() {
  const startTime = Date.now();
  const timer = debug.time('Full UFC watcher execution');
  
  console.log("🚀 Starting optimized UFC watcher with flag support...");

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
    await sendDiscordMessage(`👀 Running UFC watcher at ${pstTime}`);
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
    debug.api(`Fetching ${allEventIdsRaw.length} events`);
    
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
          debug.performance(`Events progress: ${processedEvents}/${allEventIdsRaw.length}`);
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
    debug.events(`Processing ${allEvents.length} valid events`);

    for (const { eventId, event } of allEvents) {
      const eventDate = new Date(event.date);
      
      // Use enhanced processing for past events too
      if (eventDate < now) {
        console.log(`📝 Processing past event: ${event.name}`);
        debug.events(`Processing past event: ${event.name}`);
        
        // Use the enhanced processing function to get proper athlete data
        const pastFights = await processEventCompetitionsEnhanced(event.competitions, eventId, event.name, event.date);
        
        const pastEvent = { 
          eventId, 
          eventName: event.name, 
          fights: pastFights.map(fight => ({
            fightId: fight.fightId,
            athletes: fight.athletes.map(a => a.displayName) // Convert back to names for past events
          }))
        };
        appendPastEvent(pastEvent);
        continue;
      }

      if (eventDate > fourMonthsFromNow) continue;

      validEventIds.push(eventId);
      console.log(`\n📅 Event: ${event.name} on ${eventDate.toDateString()}`);
      debug.events(`Processing upcoming event: ${event.name}`);

      // Process all fights for this event with enhanced data including flags
      const fights = await processEventCompetitionsEnhanced(event.competitions, eventId, event.name, event.date);
      allCurrentFights.push(...fights);
      
      const newFightsThisEvent = [];
      const updatedFightsThisEvent = [];

      for (const fight of fights) {
        validFightIds.push(fight.fightId);
        
        // Store current fight details with enhanced athlete data
        currentFightDetails[fight.fightId] = {
          fightName: fight.fightName,
          athletes: fight.athletes.map(a => a.displayName), // Store names for compatibility
          eventId: fight.eventId,
          eventName: fight.eventName,
          eventDate: event.date,
          unannounced: fight.unannounced
        };
        
        // Enhanced logging with flag info
        const fighter1Flag = fight.athletes[0]?.countryFlag || '';
        const fighter2Flag = fight.athletes[1]?.countryFlag || '';
        console.log(`  🥊 Fight: ${fight.fightName} ${fighter1Flag} vs ${fighter2Flag} (ID: ${fight.fightId})`);
        debug.events(`Fight: ${fight.fightName} ${fighter1Flag} vs ${fighter2Flag} (ID: ${fight.fightId})`);
        
        const wasUnannounced = upcomingUnannounced.find(f => f.fightId === fight.fightId);
        if (!fight.unannounced && wasUnannounced) {
          updatedFightsThisEvent.push(fight);
        }
        if (fight.unannounced) {
          updatedUnannounced.push({ eventId, eventName: event.name, fightId: fight.fightId });
        }

        if (!knownFights.includes(fight.fightId)) {
          newFightsThisEvent.push(fight);
          newFightIdsGlobal.push(fight.fightId);
          newFightLogEntries.push({ 
            timestamp: new Date().toISOString(), 
            eventName: event.name, 
            fight: fight.fightName 
          });
        }
      }

      // Send enhanced Discord notifications
      if (newFightsThisEvent.length) await sendEnhancedDiscordAlert(event.name, event.date, newFightsThisEvent);
      if (updatedFightsThisEvent.length) await sendEnhancedUpdatedFightsAlert(event.name, event.date, updatedFightsThisEvent);
    }

    // Detect fight changes and removals
    console.log("\n🔍 Checking for fight changes and removals...");
    const { changesByEvent, removedFights } = detectFightChanges(previousFightDetails, allCurrentFights);
    
    // Send enhanced change notifications
    for (const [eventName, eventData] of Object.entries(changesByEvent)) {
      await sendEnhancedFightChangesAlert(eventName, eventData.eventDate, eventData.changes);
    }
    
    // Count total changes for logging
    const totalChanges = Object.values(changesByEvent).reduce((total, eventData) => total + eventData.changes.length, 0);
    
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
    
    if (newFightIdsGlobal.length === 0 && totalChanges === 0 && removedFights.length === 0) {
      await sendDiscordMessage("✅ UFC watcher ran — no changes detected.");
    }

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⚡ Completed in ${executionTime} seconds`);
    console.log(`📊 Cache stats: ${athleteCache.size} athletes cached, ${fighterDataCache.size} enhanced fighters cached`);
    console.log(`📊 Changes detected: ${totalChanges} fighter changes, ${removedFights.length} removed fights`);
    
    debug.performance(`Total execution time: ${executionTime}s`);
    debug.cache(`Cache stats: ${fighterDataCache.size} enhanced fighters cached`);
    debug.changes(`Changes detected: ${totalChanges} fighter changes, ${removedFights.length} removed fights`);
    
    await sendDiscordMessage(`✅ UFC watcher completed in ${executionTime}s - Cache: ${fighterDataCache.size} fighters, ${totalChanges} changes, ${removedFights.length} removals`);
    
    timer.end();
    
  } catch (err) {
    console.error("❌ General failure in getUFCFights:", err);
    await sendDiscordMessage(`❌ UFC watcher failed: ${err.message}`);
  }
}

// Enhanced Discord message sending for live events
const sendLiveDiscordMessage = async (content, isUrgent = false) => {
  try {
    // Remove the live event prefix logic that depends on global LIVE_MODE_CONFIG
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    
    // Optional: Log to console if urgent
    if (isUrgent) {
      console.log(`📺 URGENT DISCORD: ${content.substring(0, 100)}...`);
    }
  } catch (err) {
    console.error("Discord message failed:", err.message);
  }
};

// Enhanced event processing for live mode
const processEventsForLiveMode = async (allEvents) => {
  const now = new Date();
  const liveEvents = [];
  const upcomingEvents = [];
 
  for (const { eventId, event } of allEvents) {
    const eventDate = new Date(event.date);
    const timeDiff = now - eventDate;  // ✅ Keep the sign! Positive = past, Negative = future
    const hoursFromNow = Math.abs(timeDiff) / (1000 * 60 * 60);  // Only abs() for the hours calculation
    
    console.log(`🔍 Event: ${event.name}, Hours: ${hoursFromNow.toFixed(2)}, TimeDiff: ${timeDiff > 0 ? 'past' : 'future'}`);
   
    // Categorize events for live mode processing
    if (timeDiff >= 0 && hoursFromNow <= 6) {  // ✅ Event is in the past (started) and within 6 hours
      // Potentially live event
      console.log(`🔴 Processing potential live event: ${event.name}`);
      liveEvents.push({ eventId, event, hoursFromNow });
    } else if (timeDiff < 0 && hoursFromNow <= 2) {  // ✅ Event is in the future and within 2 hours
      // Upcoming event
      console.log(`⏰ Processing upcoming event: ${event.name}`);
      upcomingEvents.push({ eventId, event, hoursFromNow });
    } else {
      console.log(`⚪ Skipping: ${event.name} (${hoursFromNow.toFixed(2)}h ${timeDiff > 0 ? 'ago' : 'away'})`);
    }
  }
  
  console.log(`🔴 Total live events found: ${liveEvents.length}`);
  console.log(`⏰ Total upcoming events found: ${upcomingEvents.length}`);
 
  return { liveEvents, upcomingEvents };
};

const detectLiveFightChanges = (currentDetails, previousDetails, fightName) => {
  if (!previousDetails) return { type: 'initial', changes: [] };
  
  const changes = [];
  
  // Round change detection
  if (currentDetails.round !== previousDetails.round && currentDetails.round > previousDetails.round) {
    changes.push({
      type: 'round_start',
      data: {
        fightName,
        newRound: currentDetails.round,
        previousRound: previousDetails.round,
        timeRemaining: currentDetails.timeRemaining
      }
    });
  }
  
  // Fight state changes
  if (currentDetails.state !== previousDetails.state) {
    changes.push({
      type: 'state_change',
      data: {
        fightName,
        from: previousDetails.state,
        to: currentDetails.state,
        round: currentDetails.round,
        time: currentDetails.timeRemaining
      }
    });
  }
  
  // Time-based alerts
  if (currentDetails.isActive && previousDetails.isActive) {
    // Round ending soon (30 seconds remaining)
    if (currentDetails.clockSeconds <= 30 && previousDetails.clockSeconds > 30) {
      changes.push({
        type: 'round_ending',
        data: {
          fightName,
          round: currentDetails.round,
          timeRemaining: currentDetails.timeRemaining
        }
      });
    }
    
    // Round halfway point
    if (currentDetails.clockSeconds <= 150 && previousDetails.clockSeconds > 150) {
      changes.push({
        type: 'round_halfway',
        data: {
          fightName,
          round: currentDetails.round,
          timeRemaining: currentDetails.timeRemaining
        }
      });
    }
  }
  
  // Fight finish detection
  if (currentDetails.isCompleted && !previousDetails.isCompleted) {
    changes.push({
      type: 'fight_finish',
      data: {
        fightName,
        finalRound: previousDetails.round,
        finalTime: previousDetails.timeRemaining,
        completedAt: new Date().toISOString()
      }
    });
  }
  
  return { type: 'update', changes };
};

// Enhanced competition status checking
const checkCompetitionStatus = async (competition) => {
  if (!competition) {
    console.log(`⚠️  No competition data provided`);
    return { status: 'unknown', details: null };
  }
  
  console.log(`🔍 Competition ID: ${competition.id}`);
  
  // Check if status is a reference that needs to be fetched (keeping your existing logic)
  if (competition.status?.$ref) {
    console.log(`📡 Fetching status from: ${competition.status.$ref}`);
    
    try {
      const statusData = await safeFetch(competition.status.$ref);
      if (statusData) {
        console.log(`✅ Fetched status data:`, statusData);
        return parseStatusData(statusData);
      } else {
        console.log(`❌ Failed to fetch status data`);
        return { status: 'unknown', details: null };
      }
    } catch (error) {
      console.log(`❌ Error fetching status:`, error.message);
      return { status: 'unknown', details: null };
    }
  }
  
  // Handle direct status data (fallback) - keeping your existing logic
  return parseStatusData(competition.status);
};

// Helper function to parse the actual status data
const parseStatusData = (statusData) => {
  if (!statusData) {
    console.log(`⚠️  No status data to parse`);
    return { status: 'unknown', details: null };
  }
  
  // Log enhanced details including round/time info
  console.log(`🔍 Parsing status data:`, {
    state: statusData.type?.state,
    round: statusData.period,
    time: statusData.displayClock,
    clock: statusData.clock
  });
  
  // Extract detailed fight information for change detection
  const fightDetails = {
    round: statusData.period || 0,
    timeRemaining: statusData.displayClock || '-',
    clockSeconds: statusData.clock || 0,
    state: statusData.type?.state || 'unknown',
    lastUpdated: new Date().toISOString(),
    
    // Calculated fields for change detection
    isActive: statusData.type?.state === 'in',
    isCompleted: statusData.type?.state === 'post',
    isScheduled: statusData.type?.state === 'pre',
    
    // Round information
    isFirstRound: statusData.period === 1,
    isFinalRound: statusData.period >= 3,
    
    // Progress calculations
    roundProgress: calculateRoundProgress(statusData.clock, statusData.period),
    fightProgress: calculateFightProgress(statusData.clock, statusData.period)
  };
  
  // Handle different possible status structures (keeping your existing logic)
  let status;
  if (statusData.type?.state) {
    status = statusData.type.state;
  } else if (statusData.state) {
    status = statusData.state;
  } else if (statusData.type) {
    status = statusData.type;
  } else if (typeof statusData === 'string') {
    status = statusData;
  } else {
    console.log(`⚠️  Unknown status structure:`, statusData);
    return { status: 'unknown', details: fightDetails };
  }
  
  // Enhanced logging with round/time info
  const roundInfo = statusData.period ? ` | Round: ${statusData.period}` : '';
  const timeInfo = statusData.displayClock ? ` | Time: ${statusData.displayClock}` : '';
  console.log(`🔍 Extracted status: "${status}"${roundInfo}${timeInfo}`);
  
  // Determine final status
  let finalStatus = 'unknown';
  if (status === 'in' || status === 'STATUS_IN_PROGRESS' || status === 'STATUS_LIVE' ||
      status === 'in-progress' || status === 'live' || status === 'active' || status === 'ongoing') {
    console.log(`🔴 STATUS IS LIVE: ${status}${roundInfo}${timeInfo}`);
    finalStatus = 'live';
  } else if (status === 'pre' || status === 'STATUS_SCHEDULED' || status === 'scheduled' || status === 'upcoming') {
    console.log(`⏰ STATUS IS SCHEDULED: ${status}`);
    finalStatus = 'scheduled';
  } else if (status === 'post' || status === 'STATUS_FINAL' || status === 'STATUS_COMPLETED' ||
             status === 'final' || status === 'completed' || status === 'finished') {
    console.log(`✅ STATUS IS COMPLETED: ${status}`);
    finalStatus = 'completed';
  } else {
    console.log(`⚠️  Unrecognized status: "${status}"`);
  }
  
  return { status: finalStatus, details: fightDetails };
};

// Helper functions for calculations
const calculateRoundProgress = (clockSeconds, period) => {
  if (!clockSeconds || !period) return 0;
  const totalRoundSeconds = 5 * 60; // 5 minutes = 300 seconds
  const elapsedSeconds = totalRoundSeconds - clockSeconds;
  return Math.round((elapsedSeconds / totalRoundSeconds) * 100);
};

const calculateFightProgress = (clockSeconds, period) => {
  if (!clockSeconds || !period) return 0;
  const totalFightSeconds = 3 * 5 * 60; // 3 rounds × 5 minutes × 60 seconds
  const completedRounds = Math.max(0, period - 1) * 5 * 60;
  const currentRoundElapsed = (5 * 60) - clockSeconds;
  const totalElapsed = completedRounds + currentRoundElapsed;
  return Math.round((totalElapsed / totalFightSeconds) * 100);
};

// Live event fight processing with enhanced details
const processLiveFights = async (competitions, eventId, eventName, eventDate) => {
  console.log(`🔴 Processing ${competitions.length} competitions with ENHANCED DETAILS + CHANGE DETECTION`);
  
  const fights = await processEventCompetitionsEnhanced(competitions, eventId, eventName, eventDate);
  console.log(`📋 Total fights processed: ${fights.length}`);
  
  // Process fights with enhanced details tracking and change detection
  const enhancedFights = [];
  const allSignificantChanges = [];
  
  for (let i = 0; i < fights.length; i++) {
    const fight = fights[i];
    console.log(`\n🥊 Processing fight ${i + 1}: ${fight.fightName}`);
    
    const competition = competitions.find(c => c.id === fight.fightId);
    if (!competition) {
      console.log(`❌ No competition found for fight ID: ${fight.fightId}`);
      enhancedFights.push({
        ...fight,
        liveStatus: 'unknown',
        lastUpdated: null,
        isCurrentlyLive: false,
        fightDetails: null
      });
      continue;
    }
    
    console.log(`✅ Found competition for fight ${fight.fightName}`);
    
    // Get detailed status information (now returns both status and details)
    const { status, details } = await checkCompetitionStatus(competition);
    const isLive = status === 'live';
    
    // Check for changes if we have previous data
    const previousDetails = fightDetailsHistory.get(fight.fightId);
    if (details && previousDetails) {
      console.log(`🔍 Checking for changes in ${fight.fightName}...`);
      const changeDetection = detectLiveFightChanges(details, previousDetails, fight.fightName);
      
      if (changeDetection.changes.length > 0) {
        console.log(`🔔 ${changeDetection.changes.length} significant changes detected for ${fight.fightName}`);
        allSignificantChanges.push(...changeDetection.changes);
        
        // Log each change for debugging
        changeDetection.changes.forEach(change => {
          console.log(`   📝 Change: ${change.type} - ${JSON.stringify(change.data)}`);
        });
      }
    } else if (details) {
      console.log(`📝 First time tracking ${fight.fightName} - storing initial state`);
    }
    
    // Store current details for next comparison
    if (details) {
      fightDetailsHistory.set(fight.fightId, details);
    }
    
    console.log(`   Final status: ${status}${details ? ` | Round: ${details.round} | Time: ${details.timeRemaining}` : ''}`);
    console.log(`   Is currently live: ${isLive}`);
    
    enhancedFights.push({
      ...fight,
      liveStatus: status,
      lastUpdated: competition?.lastUpdated || null,
      isCurrentlyLive: isLive,
      fightDetails: details // Store detailed fight information
    });
  }
  
  // Send alerts for all significant changes
  console.log(`\n📢 Processing ${allSignificantChanges.length} total significant changes...`);
  for (const change of allSignificantChanges) {
    console.log(`📺 Sending alert for: ${change.type} - ${change.data.fightName}`);
    await sendFightDetailAlert(change, eventName, eventDate);
  }
  
  // Count and report live fights (keeping your existing structure)
  const liveFights = enhancedFights.filter(f => f.isCurrentlyLive);
  const scheduledFights = enhancedFights.filter(f => f.liveStatus === 'scheduled');
  const completedFights = enhancedFights.filter(f => f.liveStatus === 'completed');
  
  console.log(`\n🔴 ENHANCED LIVE FIGHTS SUMMARY:`);
  console.log(`   🥊 Live: ${liveFights.length}`);
  console.log(`   ⏰ Scheduled: ${scheduledFights.length}`);
  console.log(`   ✅ Completed: ${completedFights.length}`);
  console.log(`   🔔 Significant changes detected: ${allSignificantChanges.length}`);
  console.log(`   📊 Total fights tracked: ${fightDetailsHistory.size}`);
  
  if (liveFights.length > 0) {
    console.log(`🔴 LIVE FIGHTS WITH DETAILS:`);
    liveFights.forEach(fight => {
      const details = fight.fightDetails;
      console.log(`   - ${fight.fightName} (Round ${details?.round || '?'}, Time: ${details?.timeRemaining || '?'})`);
    });
  } else {
    console.log(`❌ NO LIVE FIGHTS DETECTED`);
    console.log(`All fight statuses:`);
    enhancedFights.forEach(fight => {
      console.log(`   - ${fight.fightName}: ${fight.liveStatus}`);
    });
  }
  
  // Sort fights by status (keeping your existing logic)
  enhancedFights.sort((a, b) => {
    const statusPriority = { live: 0, scheduled: 1, completed: 2, unknown: 3 };
    return statusPriority[a.liveStatus] - statusPriority[b.liveStatus];
  });
  
  return enhancedFights;
};

const sendFightDetailAlert = async (change, eventName, eventDate) => {
  const dateTimeInfo = formatEventDateTime(eventDate);
  let content = '';
  
  switch (change.type) {
    case 'round_start':
      content = `🚨 **ROUND ${change.data.newRound} STARTING!**\n\n` +
                `🥊 **${change.data.fightName}**\n` +
                `📅 ${eventName}\n` +
                `⏱️ **Round ${change.data.newRound}** - ${change.data.timeRemaining}\n\n` +
                `🔥 **Previous Round Complete** - Moving to Round ${change.data.newRound}`;
      break;
      
    case 'round_ending':
      content = `⏰ **ROUND ENDING SOON!**\n\n` +
                `🥊 **${change.data.fightName}**\n` +
                `📅 ${eventName}\n` +
                `⏱️ **${change.data.timeRemaining} remaining** in Round ${change.data.round}\n\n` +
                `🔥 **Final 30 seconds of action!**`;
      break;
      
    case 'round_halfway':
      content = `📊 **ROUND ${change.data.round} HALFWAY POINT**\n\n` +
                `🥊 **${change.data.fightName}**\n` +
                `📅 ${eventName}\n` +
                `⏱️ **${change.data.timeRemaining} remaining** in Round ${change.data.round}\n\n` +
                `⚡ **2:30 elapsed - heating up!**`;
      break;
      
    case 'fight_finish':
      content = `🏁 **FIGHT OVER!**\n\n` +
                `🥊 **${change.data.fightName}**\n` +
                `📅 ${eventName}\n` +
                `⏱️ **Finished:** ${change.data.finalTime} of Round ${change.data.finalRound}\n\n` +
                `🎬 **Fight completed** - Results coming soon!`;
      break;
      
    case 'state_change':
      if (change.data.to === 'in') {
        content = `🚨 **FIGHT STARTING NOW!**\n\n` +
                  `🥊 **${change.data.fightName}**\n` +
                  `📅 ${eventName}\n` +
                  `⏱️ **Round ${change.data.round}** - ${change.data.time}\n\n` +
                  `🔴 **LIVE ACTION BEGINNING!**`;
      }
      break;
  }
  
  if (content) {
    // Handle Discord's 2000 character limit
    if (content.length > 1900) {
      content = content.substring(0, 1900) + '\n\n*...truncated*';
    }
    
    await sendLiveDiscordMessage(content, true);
    console.log(`📺 Sent detailed fight alert: ${change.type} for ${change.data.fightName}`);
  }
};

// Enhanced Discord alert for live events
const sendLiveEventAlert = async (eventName, eventDate, fights, isLiveEvent = false) => {
  const dateTimeInfo = formatEventDateTime(eventDate);
  const liveIndicator = isLiveEvent ? '🔴 **LIVE** - ' : '';
  
  let content = `${liveIndicator}🚨 **${eventName}**\n\n📅 **${dateTimeInfo}**\n\n`;
  
  if (isLiveEvent) {
    // Group fights by live status (keeping your existing logic)
    const liveFights = fights.filter(f => f.liveStatus === 'live');
    const scheduledFights = fights.filter(f => f.liveStatus === 'scheduled');
    const completedFights = fights.filter(f => f.liveStatus === 'completed');
    
    // Show live fights first and prominently (keeping your existing structure)
    if (liveFights.length > 0) {
      content += `🔴 **LIVE NOW:**\n`;
      liveFights.forEach((fight, index) => {
        const enhancedDisplay = formatEnhancedFightForDiscord(
          fight.athletes[0], 
          fight.athletes[1], 
          fight.weightClass
        );
        content += `**${index + 1}.** ${enhancedDisplay} 🔴\n\n`;
      });
    }
    
    if (scheduledFights.length > 0) {
      content += `⏰ **COMING UP:**\n`;
      scheduledFights.slice(0, 3).forEach((fight, index) => {
        const enhancedDisplay = formatEnhancedFightForDiscord(
          fight.athletes[0], 
          fight.athletes[1], 
          fight.weightClass
        );
        content += `**${index + 1}.** ${enhancedDisplay}\n\n`;
      });
    }
    
    if (completedFights.length > 0) {
      content += `✅ **COMPLETED:** ${completedFights.length} fights\n\n`;
    }
  } else {
    // Standard format for non-live events (keeping your existing logic)
    content += `🥊 **New fights added:**\n\n`;
    fights.forEach((fight, index) => {
      if (fight.athletes && fight.athletes.length >= 2) {
        const enhancedDisplay = formatEnhancedFightForDiscord(
          fight.athletes[0], 
          fight.athletes[1], 
          fight.weightClass
        );
        content += `**${index + 1}.** ${enhancedDisplay}\n\n`;
      }
    });
  }
  
  // Handle Discord's 2000 character limit (keeping your existing logic)
  if (content.length > 1900) {
    content = content.substring(0, 1900) + '\n\n*...truncated (message too long)*';
  }
  
  await sendLiveDiscordMessage(content, isLiveEvent);
};

export async function getUFCFightsWithLiveMode() {
  const startTime = Date.now();
  
  // ✅ DETECT LIVE MODE AT RUNTIME (not at import time)
  console.log("🔍 Determining live mode...");
  const LIVE_MODE_CONFIG = await enhanceMainScriptForLiveEvents();
  
  const modeIndicator = LIVE_MODE_CONFIG.isLive ? '🔴 LIVE MODE' : '📅 STANDARD MODE';
  console.log(`🚀 Starting UFC watcher in ${modeIndicator}...`);
  
  if (LIVE_MODE_CONFIG.isLive) {
    console.log(`🎯 Live event: ${LIVE_MODE_CONFIG.eventName}`);
    console.log(`⚡ Refresh rate: Every ${LIVE_MODE_CONFIG.refreshInterval / 1000} seconds`);
  }

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

  // Send different startup messages based on mode
  // try {
  //   const startupMessage = LIVE_MODE_CONFIG.isLive ? 
  //     `🔴 **LIVE MODE** - UFC watcher monitoring live event at ${pstTime}` :
  //     `👀 Running UFC watcher in standard mode at ${pstTime}`;
      
  //   await sendLiveDiscordMessage(startupMessage);
  // } catch (discordErr) {
  //   console.error("❌ Failed to send initial Discord message:", discordErr);
  // }

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
    
    // ✅ LIVE MODE: Process fewer events BUT ensure live event is included
    let allEventIdsRaw;
    if (LIVE_MODE_CONFIG.isLive) {
      // In live mode, get more recent events to ensure we catch the live one
      const recentEventIds = eventIds.slice(-20);
      const recentKnownEvents = knownEvents.slice(-20);
      const priorityEventIds = [...recentEventIds, ...recentKnownEvents];
      
      // ✅ CRITICAL: Add the live event ID if we have it
      if (LIVE_MODE_CONFIG.eventId) {
        console.log(`🔴 ENSURING live event ${LIVE_MODE_CONFIG.eventId} is included`);
        priorityEventIds.unshift(LIVE_MODE_CONFIG.eventId);
      }
      
      allEventIdsRaw = Array.from(new Set(priorityEventIds));
      console.log(`🔴 LIVE MODE: Focusing on ${allEventIdsRaw.length} events (expanded to include live event)`);
    } else {
      // Standard mode: Process all events
      allEventIdsRaw = Array.from(new Set([...knownEvents, ...eventIds]));
      console.log(`📅 STANDARD MODE: Processing all ${allEventIdsRaw.length} events`);
    }

    // Fetch events with enhanced live mode processing
    console.log(`📡 Fetching ${allEventIdsRaw.length} events...`);
    const eventChunks = [];
    const chunkSize = LIVE_MODE_CONFIG.isLive ? 15 : 6;
    
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
        
        if (allEventIdsRaw.length > 10 && processedEvents % 5 === 0) {
          console.log(`  ⚡ Events progress: ${processedEvents}/${allEventIdsRaw.length}`);
        }
        
        return (event && event.name && event.competitions && event.date) ? { eventId, event } : null;
      });
      const chunkResults = await Promise.all(promises);
      allEvents.push(...chunkResults.filter(Boolean));
    }

    allEvents.sort((a, b) => new Date(a.event.date) - new Date(b.event.date));

    // ✅ BRANCHING LOGIC: Different processing for live vs standard mode
    if (LIVE_MODE_CONFIG.isLive) {
      return await processLiveMode(allEvents, LIVE_MODE_CONFIG, now, fourMonthsFromNow, knownFights, knownEvents, upcomingUnannounced, previousFightDetails, startTime);
    } else {
      return await processStandardMode(allEvents, now, fourMonthsFromNow, knownFights, knownEvents, upcomingUnannounced, previousFightDetails, startTime);
    }
    
  } catch (err) {
    console.error("❌ General failure in getUFCFights:", err);
    await sendLiveDiscordMessage(`❌ UFC watcher failed: ${err.message}`, true);
  }
}

// ✅ LIVE MODE: Focused processing for live events - NO EVENT CHECKER
async function processLiveMode(allEvents, LIVE_MODE_CONFIG, now, fourMonthsFromNow, knownFights, knownEvents, upcomingUnannounced, previousFightDetails, startTime) {
  console.log("🔴 PROCESSING IN LIVE MODE - Focused on live and essential events");
  console.log("⚡ LIVE MODE: Skipping event categorization - processing known live event directly");
  
  // ✅ REMOVED: processEventsForLiveMode - we already know which event is live
  const liveEvents = [];
  
  // Find the live event directly from LIVE_MODE_CONFIG
  if (LIVE_MODE_CONFIG.eventId) {
    const liveEvent = allEvents.find(({ eventId }) => eventId === LIVE_MODE_CONFIG.eventId);
    if (liveEvent) {
      console.log(`🔴 Found configured live event: ${liveEvent.event.name}`);
      liveEvents.push(liveEvent);
    } else {
      console.log(`⚠️  Configured live event ${LIVE_MODE_CONFIG.eventId} not found in fetched events`);
    }
  }
  
  // ✅ Inject forced event ID into live events (for simulation/testing)
  const forcedEventId = process.env.FORCE_EVENT_ID;
  if (forcedEventId && !liveEvents.some(e => e.eventId === forcedEventId)) {
    const forced = allEvents.find(e => e.eventId === forcedEventId);
    if (forced) {
      console.log(`🧪 FORCING event ${forced.event.name} (${forcedEventId}) to be live`);
      liveEvents.push(forced);
    }
  }

  const validEventIds = [];
  const validFightIds = [];
  const currentFightDetails = {};
  const allCurrentFights = [];
  
  // 🔴 PRIORITY 1: Process live events with enhanced monitoring
  if (liveEvents.length > 0) {
    console.log(`🔴 Found ${liveEvents.length} live events - PRIORITY PROCESSING`);
    
    for (const { eventId, event } of liveEvents) {
      console.log(`\n🔴 LIVE EVENT: ${event.name}`);
      
      // First, get all fights from the event
      const fights = await processLiveFights(event.competitions, eventId, event.name, event.date);
      
      // Then filter for live fights
      const liveFights = fights.filter(f => f.isCurrentlyLive);
      
      // Now handle the alert logic
      if (liveFights.length > 0) {
        console.log(`🥊 ${liveFights.length} fights currently live!`);
        
        // Check if any fight status actually changed
        let hasStatusChanges = false;
        let changedFights = [];
        
        for (const fight of liveFights) {
          // Create a simple key for tracking
          const fightKey = `${fight.fightId}-live`;
          const previousAlertSent = fightDetailsHistory.get(fightKey);
          
          if (!previousAlertSent) {
            // First time seeing this fight as live
            console.log(`🆕 NEW live fight detected: ${fight.fightName}`);
            hasStatusChanges = true;
            changedFights.push(fight);
            fightDetailsHistory.set(fightKey, true); // Mark as alerted
          } else {
            // Already sent alert for this live fight
            console.log(`⚪ Already sent alert for live fight: ${fight.fightName}`);
          }
        }
        
        if (hasStatusChanges && changedFights.length > 0) {
          console.log(`📺 Sending live fight alert due to NEW live fights (${changedFights.length} fights)`);
          await sendLiveEventAlert(event.name, event.date, changedFights, true);
        } else {
          console.log(`⚪ No NEW live fights detected - skipping duplicate alert`);
        }
      } else {
        console.log(`⚪ No fights currently live for ${event.name}`);
      }
      
      // Process live event fights for tracking
      allCurrentFights.push(...fights);
      validEventIds.push(eventId);
      fights.forEach(fight => {
        validFightIds.push(fight.fightId);
        currentFightDetails[fight.fightId] = {
          fightName: fight.fightName,
          athletes: fight.athletes.map(a => a.displayName),
          eventId: fight.eventId,
          eventName: fight.eventName,
          eventDate: event.date,
          unannounced: fight.unannounced,
          isLive: fight.isCurrentlyLive
        };
      });
    }
  } else {
    console.log(`❌ No live events found! Expected live event: ${LIVE_MODE_CONFIG.eventName} (${LIVE_MODE_CONFIG.eventId})`);
  }
  
  // ⚪ SKIP: Upcoming events processing in live mode (save time and focus)
  console.log("⚪ LIVE MODE: Skipping upcoming events processing to focus on live content");
  
  // ⚪ SKIP: Past events processing in live mode (save time)
  console.log("⚪ LIVE MODE: Skipping past events processing to focus on live content");
  
  // Quick data saving (minimal processing)
  saveJson(KNOWN_EVENTS_FILE, Array.from(new Set([...knownEvents, ...validEventIds])));
  saveJson(KNOWN_FIGHTS_FILE, Array.from(new Set([...knownFights, ...validFightIds])));
  saveFightDetails(currentFightDetails);
  
  const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const modeStatus = `🔴 Live mode completed in ${executionTime}s - Focused on ${liveEvents.length} live events`;
  console.log(modeStatus);
  //await sendLiveDiscordMessage(modeStatus);
}

// ✅ STANDARD MODE: Comprehensive processing (your existing logic)
async function processStandardMode(allEvents, now, fourMonthsFromNow, knownFights, knownEvents, upcomingUnannounced, previousFightDetails, startTime) {
  console.log("📅 PROCESSING IN STANDARD MODE - Comprehensive event processing");
  
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
    
    // Process past events (full processing in standard mode)
    if (eventDate < now) {
      console.log(`📝 Processing past event: ${event.name}`);
      const pastFights = await processEventCompetitionsEnhanced(event.competitions, eventId, event.name, event.date);
      const pastEvent = { 
        eventId, 
        eventName: event.name, 
        fights: pastFights.map(fight => ({
          fightId: fight.fightId,
          athletes: fight.athletes.map(a => a.displayName)
        }))
      };
      appendPastEvent(pastEvent);
      continue;
    }

    if (eventDate > fourMonthsFromNow) continue;

    validEventIds.push(eventId);
    console.log(`\n📅 Event: ${event.name} on ${eventDate.toDateString()}`);

    // Process fights for this event
    const fights = await processEventCompetitionsEnhanced(event.competitions, eventId, event.name, event.date);
    allCurrentFights.push(...fights);
    
    const newFightsThisEvent = [];
    const updatedFightsThisEvent = [];

    for (const fight of fights) {
      validFightIds.push(fight.fightId);
      
      currentFightDetails[fight.fightId] = {
        fightName: fight.fightName,
        athletes: fight.athletes.map(a => a.displayName),
        eventId: fight.eventId,
        eventName: fight.eventName,
        eventDate: event.date,
        unannounced: fight.unannounced
      };
      
      const wasUnannounced = upcomingUnannounced.find(f => f.fightId === fight.fightId);
      if (!fight.unannounced && wasUnannounced) {
        updatedFightsThisEvent.push(fight);
      }
      if (fight.unannounced) {
        updatedUnannounced.push({ eventId, eventName: event.name, fightId: fight.fightId });
      }

      if (!knownFights.includes(fight.fightId)) {
        newFightsThisEvent.push(fight);
        newFightIdsGlobal.push(fight.fightId);
        newFightLogEntries.push({ 
          timestamp: new Date().toISOString(), 
          eventName: event.name, 
          fight: fight.fightName 
        });
      }
    }

    // Send notifications (standard mode)
    if (newFightsThisEvent.length) await sendEnhancedDiscordAlert(event.name, event.date, newFightsThisEvent);
    if (updatedFightsThisEvent.length) await sendEnhancedUpdatedFightsAlert(event.name, event.date, updatedFightsThisEvent);
  }

  // Detect changes and save data (full processing)
  const { changesByEvent, removedFights } = detectFightChanges(previousFightDetails, allCurrentFights);

  for (const [eventName, eventData] of Object.entries(changesByEvent)) {
    await sendEnhancedFightChangesAlert(eventName, eventData.eventDate, eventData.changes);
  }

  const totalChanges = Object.values(changesByEvent).reduce((total, eventData) => total + eventData.changes.length, 0);

  if (removedFights.length > 0) {
    await sendRemovedFightsAlert(removedFights);
  }

  // Save all data (comprehensive)
  saveJson(KNOWN_EVENTS_FILE, validEventIds);
  const cleanedFights = Array.from(new Set([...knownFights, ...newFightIdsGlobal]))
    .filter(id => validFightIds.includes(id));
  saveJson(KNOWN_FIGHTS_FILE, cleanedFights);
  saveUnannouncedFights(updatedUnannounced);
  saveFightDetails(currentFightDetails);
  if (newFightLogEntries.length) logNewFights(newFightLogEntries);

  if (newFightIdsGlobal.length === 0 && totalChanges === 0 && removedFights.length === 0) {
    await sendLiveDiscordMessage("✅ UFC watcher ran — no changes detected.");
  }

  const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const modeStatus = `✅ Standard mode completed in ${executionTime}s`;
  console.log(modeStatus);
  await sendLiveDiscordMessage(modeStatus);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting UFC Watcher...');
  getUFCFightsWithLiveMode();
}

export {
  safeFetch,
  fetchAthletesBatchEnhanced,
  processEventCompetitionsEnhanced,
  loadJson,
  formatEventDateTime,
  fetchFighterRecord,
  createUnknownFighter,
  rateLimitedFetch,
  getCountryFlag,
  formatEnhancedFightForDiscord
};