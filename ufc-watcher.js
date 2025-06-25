import fetch from "node-fetch";
import fs from "fs";

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1387213888709460008/y5ABTwgCN1rBq_8BPM48UWruwdhKytwDFdq___EBMEBoCS-TAGdapWxB8yhXQtWc1bIz";

const KNOWN_FIGHTS_FILE = "knownFights.json";
const KNOWN_EVENTS_FILE = "knownEvents.json";
const PAST_EVENTS_FILE = "pastEvents.json";
const UPCOMING_UNANNOUNCED_FILE = "upcomingUnannouncedFights.json";

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return [];
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function appendPastEvent(fullEventObj) {
  const existing = loadJson(PAST_EVENTS_FILE);
  const alreadyExists = existing.some((e) => e.eventId === fullEventObj.eventId);
  if (!alreadyExists) {
    existing.push(fullEventObj);
    saveJson(PAST_EVENTS_FILE, existing);
  }
}

function saveUnannouncedFights(unannounced) {
  saveJson(UPCOMING_UNANNOUNCED_FILE, unannounced);
}

async function sendDiscordAlert(eventName, fightIds) {
  const content = `🚨 **${eventName}**\nNew fights added: ${fightIds.join(', ')}`;
  await sendDiscordMessage(content);
}

async function sendDiscordMessage(content) {
  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

async function getUFCFights() {
  await sendDiscordMessage(`👀 Running UFC watcher script at ${new Date().toLocaleString()}`);

  const knownFights = loadJson(KNOWN_FIGHTS_FILE);
  const knownEvents = loadJson(KNOWN_EVENTS_FILE);
  const upcomingUnannounced = loadJson(UPCOMING_UNANNOUNCED_FILE);

  try {
    const boardRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard");
    const board = await boardRes.json();
    const calendar = board.leagues?.[0]?.calendar || [];

    const now = new Date();
    const fourMonthsFromNow = new Date();
    fourMonthsFromNow.setMonth(now.getMonth() + 4);

    const eventIds = calendar.map((item) => {
      const ref = item.event?.$ref;
      const match = ref && ref.match(/events\/(\d+)/);
      return match ? match[1] : null;
    }).filter(Boolean);

    const allEventIdsRaw = Array.from(new Set([...knownEvents, ...eventIds]));
    const validEventIds = [];
    const validFightIds = [];
    const newFightIdsGlobal = [];
    const updatedUnannounced = [];

    for (const eventId of allEventIdsRaw) {
      try {
        const url = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`;
        const res = await fetch(url);
        const event = await res.json();
        const eventDate = new Date(event.date);

        if (!event.name || !event.competitions) continue;

        if (eventDate < now) {
          const pastEvent = {
            eventId,
            eventName: event.name,
            fights: []
          };

          for (const comp of event.competitions) {
            const fightId = comp.id;
            const competitors = [];

            for (const c of comp.competitors) {
              try {
                const athleteRes = await fetch(c.athlete.$ref + "?lang=en&region=us");
                const athlete = await athleteRes.json();
                competitors.push(athlete.displayName);
              } catch {
                competitors.push(c.athlete.displayName || "Unknown Fighter");
              }
            }

            pastEvent.fights.push({ fightId, athletes: competitors });
          }

          appendPastEvent(pastEvent);
          continue;
        }

        if (eventDate > fourMonthsFromNow) continue;

        validEventIds.push(eventId);
        const dateStr = eventDate.toDateString();
        console.log(`\n📅 Event: ${event.name} on ${dateStr}`);

        const newFightsThisEvent = [];

        for (const comp of event.competitions) {
          const fightId = comp.id;
          validFightIds.push(fightId);
          const competitorsInfo = [];

          let unannounced = true;

          for (const c of comp.competitors) {
            try {
              const athleteRes = await fetch(c.athlete.$ref + "?lang=en&region=us");
              const athlete = await athleteRes.json();
              competitorsInfo.push(athlete.displayName);
              if (!athlete.displayName.toLowerCase().includes("tba")) unannounced = false;
            } catch {
              competitorsInfo.push(c.athlete.displayName || "Unknown Fighter");
            }
          }

          const wasUnannounced = upcomingUnannounced.find(f => f.fightId === fightId);
          if (!unannounced && wasUnannounced) {
            console.log(`  🔄 UPDATED FIGHT: ${competitorsInfo.join(" vs ")} (ID: ${fightId}) was previously unannounced.`);
          }

          if (unannounced) {
            updatedUnannounced.push({ eventId, eventName: event.name, fightId });
          }

          console.log(`  🥊 Fight: ${competitorsInfo.join(" vs ")} (ID: ${fightId})`);

          if (!knownFights.includes(fightId)) {
            newFightsThisEvent.push(fightId);
            newFightIdsGlobal.push(fightId);
          }
        }

        if (newFightsThisEvent.length) {
          console.log(`  🚨 NEW FIGHTS for this event: ${newFightsThisEvent.join(', ')}`);
          await sendDiscordAlert(event.name, newFightsThisEvent);
        } else {
          console.log("  ✅ No new fights for this event.");
        }

      } catch (err) {
        console.error(`❌ Error processing event ID ${eventId}:`, err);
      }
    }

    saveJson(KNOWN_EVENTS_FILE, validEventIds);
    const cleanedFights = Array.from(new Set([...knownFights, ...newFightIdsGlobal]))
      .filter(id => validFightIds.includes(id));
    saveJson(KNOWN_FIGHTS_FILE, cleanedFights);
    saveUnannouncedFights(updatedUnannounced);

    if (newFightIdsGlobal.length === 0) {
      await sendDiscordMessage("✅ UFC watcher ran — no new fights detected.");
    }

  } catch (err) {
    console.error("❌ General failure in getUFCFights:", err);
  }
}

export { getUFCFights };

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  getUFCFights();
}
