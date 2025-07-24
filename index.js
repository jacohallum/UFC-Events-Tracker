//index.js
import { getUFCFights } from './ufc-watcher.js';

console.log('🚀 Starting UFC watcher...');
await getUFCFights();
