// test-with-main-logic.js
// Use main UFC watcher logic with identical Discord formatting

import fetch from "node-fetch";
import 'dotenv/config';

// Import the main logic from your UFC watcher
import {
  safeFetch,
  processEventCompetitionsEnhanced,
  loadJson,
  formatEventDateTime,
  formatEnhancedFightForDiscord,
  getCountryFlag
} from './ufc-watcher.js';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Test version of Discord message sender
const sendTestDiscordMessage = async (content) => {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `🧪 TEST - ${content}` }),
    });
  } catch (err) {
    console.error("Test Discord message failed:", err.message);
  }
};

// EXACT COPY of formatEnhancedFightForDiscord from main file
const formatEnhancedFightForDiscordWithFlags = (athlete1, athlete2, weightClass = null) => {
  if (!athlete1 || !athlete2) {
    return `Unknown Fighter vs Unknown Fighter`;
  }

  let fightDisplay = '';
  
  // Fighter 1 - clean text format
  fightDisplay += `**${athlete1.displayName}**`;
  if (athlete1.countryFlag) {
    fightDisplay += ` ${athlete1.countryFlag}`;
  }
  if (athlete1.nickname) {
    fightDisplay += ` "${athlete1.nickname}"`;
  }
  if (athlete1.record) {
    fightDisplay += ` (${athlete1.record})`;
  }
  
  fightDisplay += ' vs ';
  
  // Fighter 2 - clean text format
  fightDisplay += `**${athlete2.displayName}**`;
  if (athlete2.countryFlag) {
    fightDisplay += ` ${athlete2.countryFlag}`;
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
  
  return fightDisplay;
};

// EXACT COPY of sendEnhancedDiscordAlert from main file
const sendTestEnhancedDiscordAlert = async (eventName, eventDate, fights) => {
  const dateTimeInfo = formatEventDateTime(eventDate);
  
  // Create main message content with better formatting - EXACT MATCH to main file
  let content = `🚨 **${eventName}**\n\n📅 **${dateTimeInfo}**\n\n🥊 **New fights added:**\n\n`;
  
  fights.forEach((fight, index) => {
    if (fight.athletes && fight.athletes.length >= 2) {
      const enhancedDisplay = formatEnhancedFightForDiscordWithFlags(
        fight.athletes[0], 
        fight.athletes[1], 
        fight.weightClass
      );
      
      // Add fight number and enhanced spacing - EXACT MATCH to main file
      content += `**${index + 1}.** ${enhancedDisplay}\n\n`;
    } else {
      content += `**${index + 1}.** ${fight.fightName}\n\n`;
    }
  });
  
  // Handle Discord's 2000 character limit - EXACT MATCH to main file
  if (content.length > 1900) {
    content = content.substring(0, 1900) + '\n\n*...truncated (message too long)*';
  }
  
  // Add TEST prefix to the final content
  content = `🧪 **TEST OUTPUT** - This matches main file formatting:\n\n${content}`;
  
  await sendTestDiscordMessage(content);
};

// EXACT COPY of sendEnhancedUpdatedFightsAlert from main file
const sendTestEnhancedUpdatedFightsAlert = async (eventName, eventDate, fights) => {
  const dateTimeInfo = formatEventDateTime(eventDate);
  let content = `🔄 **${eventName}**\n\n📅 **${dateTimeInfo}**\n\n⬆️ **Updated fights:**\n\n`;
  
  fights.forEach((fight, index) => {
    if (typeof fight === 'string') {
      content += `**${index + 1}.** ${fight}\n\n`;
    } else if (fight.athletes && fight.athletes.length >= 2) {
      const enhancedDisplay = formatEnhancedFightForDiscordWithFlags(
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
  
  // Add TEST prefix to the final content
  content = `🧪 **TEST OUTPUT** - Updated fights format:\n\n${content}`;
  
  await sendTestDiscordMessage(content);
};

// EXACT COPY of sendEnhancedFightChangesAlert from main file (with test prefix)
const sendTestEnhancedFightChangesAlert = async (eventName, eventDate, changes) => {
  const dateTimeInfo = formatEventDateTime(eventDate);
  let content = `⚠️ **${eventName}**\n\n📅 **${dateTimeInfo}**\n\n🔄 **Fight changes detected:**\n\n`;
  
  changes.forEach((change, index) => {
    content += `**${index + 1}.** ${change}\n\n`;
  });
  
  if (content.length > 1900) {
    content = content.substring(0, 1900) + '\n\n*...truncated*';
  }
  
  // Add TEST prefix to the final content
  content = `🧪 **TEST OUTPUT** - Fight changes format:\n\n${content}`;
  
  await sendTestDiscordMessage(content);
};

// Test flag functionality specifically
const testFlagFunctionality = async () => {
  console.log("🏳️ Testing flag functionality...");
  
  // Test common countries that appear in UFC
  const testCountries = [
    'United States', 'Brazil', 'Russia', 'Ireland', 'England', 
    'Australia', 'Canada', 'Mexico', 'Lithuania', 'Iceland',
    'Georgia', 'Dagestan', 'Poland', 'Sweden', 'Netherlands'
  ];
  
  console.log("\n🌍 Testing flag mapping for common UFC countries:");
  for (const country of testCountries) {
    const flag = getCountryFlag(null, country);
    console.log(`  ${country}: ${flag || '❌ No flag found'}`);
  }
  
  // Test country codes
  const testCodes = ['US', 'BR', 'RU', 'IE', 'AU', 'CA', 'MX', 'IS', 'LT'];
  console.log("\n🔤 Testing country codes:");
  for (const code of testCodes) {
    const flag = getCountryFlag(code);
    console.log(`  ${code}: ${flag || '❌ No flag found'}`);
  }
};

// Test specific event by ID using main logic
const testSpecificEvent = async (eventId) => {
  console.log(`🧪 Testing specific event: ${eventId}`);
  
  try {
    // Use main file's safeFetch function
    const url = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`;
    const event = await safeFetch(url);
    
    if (!event || !event.competitions) {
      console.log("❌ Event not found or has no competitions");
      return;
    }
    
    console.log(`📅 Found event: ${event.name}`);
    
    // Use main file's enhanced processing function
    const fights = await processEventCompetitionsEnhanced(
      event.competitions, 
      eventId, 
      event.name, 
      event.date
    );
    
    if (fights.length > 0) {
      await sendTestEnhancedDiscordAlert(event.name, event.date, fights);
      console.log(`✅ Sent ${fights.length} fights from ${event.name} and EXACT main file formatting!`);
      
      // Show what data we got with flag info
      console.log(`\n📊 Sample fight data:`);
      const sampleFight = fights[0];
      console.log(`  Fight: ${sampleFight.fightName}`);
      console.log(`  Athlete 1: ${sampleFight.athletes[0]?.displayName} ${sampleFight.athletes[0]?.countryFlag || ''}`);
      console.log(`    - Nickname: ${sampleFight.athletes[0]?.nickname || 'None'}`);
      console.log(`    - Record: ${sampleFight.athletes[0]?.record || 'Unknown'}`);
      console.log(`    - Citizenship: ${sampleFight.athletes[0]?.citizenship || 'Unknown'}`);
      console.log(`    - Flag: ${sampleFight.athletes[0]?.countryFlag || 'None'}`);
      console.log(`  Athlete 2: ${sampleFight.athletes[1]?.displayName} ${sampleFight.athletes[1]?.countryFlag || ''}`);
      console.log(`    - Nickname: ${sampleFight.athletes[1]?.nickname || 'None'}`);
      console.log(`    - Record: ${sampleFight.athletes[1]?.record || 'Unknown'}`);
      console.log(`    - Citizenship: ${sampleFight.athletes[1]?.citizenship || 'Unknown'}`);
      console.log(`    - Flag: ${sampleFight.athletes[1]?.countryFlag || 'None'}`);
      console.log(`  Weight Class: ${sampleFight.weightClass}`);
      
    } else {
      console.log("❌ No fights found in this event");
    }
    
  } catch (error) {
    console.error("❌ Error testing specific event:", error.message);
  }
};

// Test next upcoming event using main logic
const testNextUpcomingEvent = async () => {
  console.log("🧪 Testing next upcoming UFC event and EXACT main file formatting...");
  
  try {
    // Use main file's loadJson function
    const knownEvents = loadJson("knownEvents.json");
    
    if (!knownEvents || knownEvents.length === 0) {
      console.log("❌ No known events found. Run the main script first.");
      return;
    }
    
    console.log(`📋 Found ${knownEvents.length} known events, checking for next upcoming event...`);
    
    // Find next upcoming event
    let nextEvent = null;
    const now = new Date();
    
    for (const eventId of knownEvents) {
      const url = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`;
      const event = await safeFetch(url);
      
      if (event && event.name && event.competitions && event.date) {
        const eventDate = new Date(event.date);
        
        if (eventDate > now) {
          nextEvent = { eventId, event };
          console.log(`✅ Found next upcoming event: ${event.name} on ${eventDate.toDateString()}`);
          break;
        } else {
          console.log(`⏭️  Skipping past event: ${event.name} (${eventDate.toDateString()})`);
        }
      }
    }
    
    if (!nextEvent) {
      console.log("❌ No upcoming events found");
      return;
    }
    
    // Use main file's enhanced processing
    console.log(`🥊 Processing fights using EXACT main file logic...`);
    const fights = await processEventCompetitionsEnhanced(
      nextEvent.event.competitions, 
      nextEvent.eventId, 
      nextEvent.event.name, 
      nextEvent.event.date
    );
    
    if (fights.length > 0) {
      console.log(`\n📊 Processing ${fights.length} fights with enhanced data INCLUDING FLAGS:`);
      
      // Show detailed data for first few fights including flag info
      for (let i = 0; i < Math.min(3, fights.length); i++) {
        const fight = fights[i];
        console.log(`\n  ${i + 1}. ${fight.fightName}`);
        console.log(`     Fighter 1: ${fight.athletes[0]?.displayName} ${fight.athletes[0]?.countryFlag || ''}`);
        console.log(`       - Nickname: ${fight.athletes[0]?.nickname || 'None'}`);
        console.log(`       - Record: ${fight.athletes[0]?.record || 'Unknown'}`);
        console.log(`       - Citizenship: ${fight.athletes[0]?.citizenship || 'Unknown'}`);
        console.log(`       - Flag: ${fight.athletes[0]?.countryFlag || 'None'}`);
        console.log(`       - Weight Class: ${fight.athletes[0]?.weightClass || 'Unknown'}`);
        console.log(`     Fighter 2: ${fight.athletes[1]?.displayName} ${fight.athletes[1]?.countryFlag || ''}`);
        console.log(`       - Nickname: ${fight.athletes[1]?.nickname || 'None'}`);
        console.log(`       - Record: ${fight.athletes[1]?.record || 'Unknown'}`);
        console.log(`       - Citizenship: ${fight.athletes[1]?.citizenship || 'Unknown'}`);
        console.log(`       - Flag: ${fight.athletes[1]?.countryFlag || 'None'}`);
        console.log(`       - Weight Class: ${fight.athletes[1]?.weightClass || 'Unknown'}`);
        console.log(`     Division: ${fight.weightClass || 'Unknown'}`);
      }
      
      await sendTestEnhancedDiscordAlert(nextEvent.event.name, nextEvent.event.date, fights);
      console.log(`\n✅ Sent ${fights.length} fights and EXACT main file formatting!`);
      console.log(`📝 Message format matches sendEnhancedDiscordAlert from main file`);
      
    } else {
      console.log("❌ No fights found");
    }
    
  } catch (error) {
    console.error("❌ Error testing with main logic:", error.message);
  }
};

// Test all upcoming events (limited to first 3)
const testMultipleUpcomingEvents = async () => {
  console.log("🧪 Testing multiple upcoming events and EXACT main file formatting...");
  
  try {
    const knownEvents = loadJson("knownEvents.json");
    const now = new Date();
    let eventsProcessed = 0;
    
    for (const eventId of knownEvents) {
      if (eventsProcessed >= 3) break; // Limit to 3 events
      
      const url = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`;
      const event = await safeFetch(url);
      
      if (event && event.name && event.competitions && event.date) {
        const eventDate = new Date(event.date);
        
        if (eventDate > now) {
          console.log(`\n📅 Processing: ${event.name}`);
          
          const fights = await processEventCompetitionsEnhanced(
            event.competitions, 
            eventId, 
            event.name, 
            event.date
          );
          
          if (fights.length > 0) {
            // Show flag info for this event
            const flagsFound = fights.filter(f => 
              f.athletes[0]?.countryFlag || f.athletes[1]?.countryFlag
            ).length;
            console.log(`    🏳️  ${flagsFound}/${fights.length} fights have nationality flags`);
            
            await sendTestEnhancedDiscordAlert(event.name, event.date, fights);
            console.log(`✅ Sent ${fights.length} fights from ${event.name} and main file formatting`);
            eventsProcessed++;
            
            // Wait between events to avoid spam
            if (eventsProcessed < 3) {
              console.log(`⏳ Waiting 3 seconds before next event...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
        }
      }
    }
    
    console.log(`\n✅ Processed ${eventsProcessed} upcoming events and EXACT main file formatting!`);
    
  } catch (error) {
    console.error("❌ Error testing multiple events:", error.message);
  }
};

// Test different message types
const testMessageTypes = async () => {
  console.log("🧪 Testing all Discord message types from main file...");
  
  try {
    const knownEvents = loadJson("knownEvents.json");
    const now = new Date();
    
    // Find an event to test with
    let testEvent = null;
    for (const eventId of knownEvents) {
      const url = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`;
      const event = await safeFetch(url);
      
      if (event && event.name && event.competitions && event.date) {
        const eventDate = new Date(event.date);
        if (eventDate > now) {
          testEvent = { eventId, event };
          break;
        }
      }
    }
    
    if (!testEvent) {
      console.log("❌ No test event found");
      return;
    }
    
    const fights = await processEventCompetitionsEnhanced(
      testEvent.event.competitions, 
      testEvent.eventId, 
      testEvent.event.name, 
      testEvent.event.date
    );
    
    if (fights.length === 0) {
      console.log("❌ No fights to test with");
      return;
    }
    
    // Count fights
    const flaggedFights = fights.filter(f => 
      f.athletes[0]?.countryFlag || f.athletes[1]?.countryFlag
    ).length;
    
    console.log(`📋 Testing with ${testEvent.event.name} (${fights.length} fights, ${flaggedFights})`);
    
    // Test 1: New fights alert (main format)
    console.log("\n1️⃣ Testing NEW FIGHTS alert format...");
    await sendTestEnhancedDiscordAlert(testEvent.event.name, testEvent.event.date, fights.slice(0, 3));
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Updated fights alert (main format)
    console.log("2️⃣ Testing UPDATED FIGHTS alert format...");
    await sendTestEnhancedUpdatedFightsAlert(testEvent.event.name, testEvent.event.date, fights.slice(0, 2));
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: Fight changes alert (main format)
    console.log("3️⃣ Testing FIGHT CHANGES alert format...");
    const sampleChanges = [
      `${fights[0]?.fightName} → Updated Fighter Names`,
      `${fights[1]?.fightName} → Weight Class Changed`
    ];
    await sendTestEnhancedFightChangesAlert(testEvent.event.name, testEvent.event.date, sampleChanges);
    
    console.log("\n✅ All message types tested and EXACT main file formatting!");
    
  } catch (error) {
    console.error("❌ Error testing message types:", error.message);
  }
};

// Main test runner
const runMainLogicTests = async () => {
  console.log("🧪 UFC Test and EXACT Main File Logic & Formatting");
  console.log("================================================================");
  
  const args = process.argv.slice(2);
  const testType = args[0] || 'next';
  
  switch (testType) {
    case 'next':
      await testNextUpcomingEvent();
      break;
    case 'event':
      const eventId = args[1];
      if (!eventId) {
        console.log("❌ Please provide an event ID: node test-with-main-logic.js event 600053545");
        return;
      }
      await testSpecificEvent(eventId);
      break;
    case 'multiple':
      await testMultipleUpcomingEvents();
      break;
    case 'messages':
      await testMessageTypes();
      break;
    case 'flags':
      await testFlagFunctionality();
      break;
    default:
      console.log("Available test types:");
      console.log("- next (default): Test next upcoming event");
      console.log("- event [eventId]: Test specific event by ID");
      console.log("- multiple: Test first 3 upcoming events");
      console.log("- messages: Test all Discord message types");
      console.log("- flags: Test flag mapping functionality");
      console.log("\nUsage examples:");
      console.log("node test-with-main-logic.js next");
      console.log("node test-with-main-logic.js event 600053545");
      console.log("node test-with-main-logic.js multiple");
      console.log("node test-with-main-logic.js messages");
      console.log("node test-with-main-logic.js flags");
      return;
  }
  
  console.log("\n✅ Test completed! Check your Discord channel for messages and EXACT main file formatting.");
};

// Run the tests
console.log("🚀 Starting UFC Test and EXACT Main Logic Formatting...");
runMainLogicTests().catch(error => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});