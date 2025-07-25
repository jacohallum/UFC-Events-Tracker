// simulate-live-event.js
import 'dotenv/config';

// Set up environment variables BEFORE loading any modules
envSetup();

console.log("🎯 Simulating live event mode for a past UFC card...");

// Dynamically import the watcher AFTER setting env vars
const { getUFCFightsWithLiveMode } = await import("./ufc-watcher.js");
await getUFCFightsWithLiveMode();

function envSetup() {
  process.env.FORCE_SIMULATE_LIVE = 'true';
  process.env.DEBUG_MODE = 'true';
  process.env.FORCE_EVENT_ID = '600053545';
  process.env.EVENT_NAME = 'UFC Fight Night: Whittaker vs. de Ridder';
}