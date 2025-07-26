// ufc-live-checker.js
import fetch from "node-fetch";
import 'dotenv/config';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Live event detection logic
export async function checkLiveEvents() {
  console.log("🔍 Checking for live UFC events...");

  try {
    // Fetch current UFC scoreboard
    const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard");
    const data = await response.json();

    if (!data?.events) {
      console.log("❌ No events data found");
      return {
        isLive: false,
        eventName: null,
        nextCheckInterval: '3 hours'
      };
    }

    const now = new Date();
    const events = data.events || [];

    console.log(`📅 Found ${events.length} events to check`);

    // Check each event for live status
    for (const event of events) {
      const eventDate = new Date(event.date);
      const hoursFromNow = Math.abs(now - eventDate) / (1000 * 60 * 60);

      console.log(`🎯 Event: ${event.name}`);
      console.log(`   Date: ${eventDate.toISOString()}`);
      console.log(`   Hours from now: ${hoursFromNow.toFixed(2)}`);
      console.log(`   Status: ${event.status?.type?.name || 'Unknown'}`);

      const isLive = (
        event.status?.type?.state === 'in' ||
        (event.status?.type?.state === 'pre' && hoursFromNow <= 0.5) ||
        (event.status?.type?.state === 'post' && hoursFromNow <= 2)
      );

      if (isLive) {
        console.log(`🔴 LIVE EVENT DETECTED: ${event.name}`);
        return {
          isLive: true,
          eventName: event.name,
          eventId: event.id,
          eventDate: event.date,
          status: event.status?.type?.name || 'Live',
          nextCheckInterval: '10 seconds'
        };
      }

      if (eventDate > now && hoursFromNow <= 4) {
        console.log(`⏰ Upcoming event: ${event.name} in ${hoursFromNow.toFixed(1)} hours`);
        return {
          isLive: false,
          eventName: event.name,
          eventId: event.id,
          eventDate: event.date,
          status: 'Upcoming',
          nextCheckInterval: '30 minutes',
          upcomingSoon: true
        };
      }
    }

    console.log("📅 No live or upcoming events found");
    return {
      isLive: false,
      eventName: null,
      nextCheckInterval: '3 hours'
    };

  } catch (error) {
    console.error("❌ Error checking live events:", error);
    return {
      isLive: false,
      eventName: null,
      nextCheckInterval: '1 hour',
      error: error.message
    };
  }
}

export function enhanceMainScriptForLiveEvents() {
  const isLiveMode = process.env.LIVE_MODE === 'true';
  const forceSimulate = process.env.FORCE_SIMULATE_LIVE === 'true';
  const eventName = process.env.EVENT_NAME;

  if (isLiveMode || forceSimulate) {
    console.log(`🔴 ${forceSimulate ? 'SIMULATED' : 'LIVE'} MODE ACTIVATED for: ${eventName}`);
    console.log("🚀 Enhanced monitoring enabled:");
    console.log("   - Real-time fight status tracking");
    console.log("   - Live stats monitoring");
    console.log("   - Immediate Discord notifications");

    return {
      isLive: true,
      eventName: eventName,
      refreshInterval: 10000,
      features: {
        liveStats: true,
        immediateNotifications: true,
        enhancedUpdates: true
      }
    };
  }

  return {
    isLive: false,
    refreshInterval: 10800000,
    features: {
      liveStats: false,
      immediateNotifications: false,
      enhancedUpdates: false
    }
  };
}


export async function sendLiveEventNotification(type, data) {
  if (!DISCORD_WEBHOOK_URL) return;

  let content = '';

  switch (type) {
    case 'LIVE_START':
      content = `🔴 **LIVE EVENT STARTING!**\n\n🥊 **${data.eventName}**\n\n🤖 Switching to live mode - updates every 10 seconds!\n\n📊 Monitoring ${data.competitions} fights`;
      break;
    case 'LIVE_END':
      content = `🏍 **LIVE EVENT ENDED**\n\n✅ **${data.eventName}** has concluded\n\n🤖 Returning to normal monitoring (every 3 hours)`;
      break;
    case 'UPCOMING':
      content = `⏰ **UPCOMING EVENT**\n\n🥊 **${data.eventName}**\n\n📅 Starting in ${data.minutesUntil} minutes\n\n🤖 Increased monitoring frequency`;
      break;
    case 'FIGHT_UPDATE':
      content = `🔴 **LIVE UPDATE** - ${data.eventName}\n\n${data.update}`;
      break;
  }

  if (content) {
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      console.error("❌ Failed to send live notification:", error.message);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkLiveEvents().then(result => {
    console.log("\n🎯 Live Event Check Result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.isLive) {
      sendLiveEventNotification('LIVE_START', result);
    } else if (result.status === 'UPCOMING') {
      sendLiveEventNotification('UPCOMING', result);
    }
  }).catch(console.error);
}