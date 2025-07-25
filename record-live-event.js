//record-live-event.js
import fs from 'fs';
import fetch from 'node-fetch';
import 'dotenv/config';

const INTERVAL = 10000; // Every 10 seconds
const MAX_DURATION = 1000 * 60 * 30; // Run for 30 minutes
const OUTPUT_DIR = './mock-event-recordings';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

let snapshotCount = 0;
let eventId = null;

async function getLiveEventId() {
  const scoreboardUrl = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";
  const response = await fetch(scoreboardUrl);
  const data = await response.json();
  const events = data?.events || [];

  const now = new Date();
  for (const event of events) {
    const startTime = new Date(event.date);
    const endTime = new Date(startTime.getTime() + 1000 * 60 * 240); // 4 hours buffer

    if (now >= startTime && now <= endTime) {
      const match = event.links?.[0]?.href?.match(/event\/(\d+)/);
      return match?.[1] || event.id;
    }
  }

  return null;
}

async function recordSnapshot() {
  try {
    const url = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}?lang=en&region=us`;
    const res = await fetch(url);
    const data = await res.json();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${OUTPUT_DIR}/event-${eventId}-${timestamp}.json`;

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`📸 Snapshot saved: ${filename}`);
    snapshotCount++;
  } catch (err) {
    console.error("❌ Failed to fetch snapshot:", err.message);
  }
}

(async () => {
  console.log("📡 Detecting current live event...");
  eventId = await getLiveEventId();

  if (!eventId) {
    console.error("❌ No live event currently active.");
    process.exit(1);
  }

  console.log(`🎯 Live event detected: ${eventId}`);
  console.log(`🕒 Recording snapshots every ${INTERVAL / 1000}s...`);

  const intervalId = setInterval(recordSnapshot, INTERVAL);
  setTimeout(() => {
    clearInterval(intervalId);
    console.log(`✅ Done. ${snapshotCount} snapshots saved to ${OUTPUT_DIR}`);
  }, MAX_DURATION);
})();
