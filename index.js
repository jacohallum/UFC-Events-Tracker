
import { getUFCFights } from './ufc-watcher.js';

const INTERVAL_MS = 1000 * 60 * 60;  // run every 1 hour (adjust as needed)

async function runWatcher() {
  // First run immediately:
  console.log('🚀 Starting UFC watcher…');
  await getUFCFights();

  // Then schedule repeats:
  setInterval(async () => {
    console.log('🕒 Scheduled run: fetching UFC fights…');
    await getUFCFights();
  }, INTERVAL_MS);
}

runWatcher();