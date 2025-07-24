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
const FIGHT_DETAILS_FILE = "fightDetails.json";

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

if (import.meta.url === `file://${process.argv[1]}`) {
  getUFCFights();
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