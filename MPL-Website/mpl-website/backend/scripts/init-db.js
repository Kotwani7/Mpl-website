import { initStore, closeStore } from '../src/store.js';
const result = await initStore();
console.log(`SQLite database ready: ${result.databaseFile}`);
closeStore();
