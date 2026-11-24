import { initStore, getDatabaseStatus, closeStore } from '../src/store.js';

try {
  const initialized = await initStore();
  const status = getDatabaseStatus();
  if (status.integrity !== 'ok') throw new Error(`SQLite integrity check returned: ${status.integrity}`);
  if (status.foreignKeyErrors !== 0) throw new Error(`SQLite foreign key check found ${status.foreignKeyErrors} error(s).`);
  console.log('MPL DATABASE CONNECTION: OK');
  console.log(`SQLite version: ${status.sqliteVersion}`);
  console.log(`Database file: ${initialized.databaseFile}`);
  console.log(`Teams: ${status.counts.teams}`);
  console.log(`Unique players: ${status.counts.players}`);
  console.log(`Matches: ${status.counts.matches}`);
  console.log(`Foreign key errors: ${status.foreignKeyErrors}`);
  console.log(`Registrations: ${status.counts.registrations}`);
} catch (error) {
  console.error('MPL DATABASE CONNECTION: FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  closeStore();
}
