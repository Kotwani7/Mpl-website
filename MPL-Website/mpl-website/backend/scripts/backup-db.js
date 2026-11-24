import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(import.meta.dirname, '../data');
const backupDir = path.join(dataDir, 'backups');
const databaseFile = path.join(dataDir, 'mpl.sqlite');
if (!fs.existsSync(databaseFile)) throw new Error(`MPL database not found: ${databaseFile}`);

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `mpl-${stamp}.sqlite`);
const db = new DatabaseSync(databaseFile);
try {
  db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
} finally {
  db.close();
}
console.log(`SQLite backup created: ${backupFile}`);
