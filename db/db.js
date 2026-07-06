import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, 'auctions.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS auctions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    catastral_unit TEXT,
    starting_price INTEGER NOT NULL,
    time_left TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    ended_at TEXT,
    ends_at TEXT
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL REFERENCES auctions(id),
    price INTEGER NOT NULL,
    scraped_at TEXT NOT NULL
  );
`);

const auctionColumns = db.prepare('PRAGMA table_info(auctions)').all();
if (!auctionColumns.some((c) => c.name === 'ends_at')) {
  db.exec('ALTER TABLE auctions ADD COLUMN ends_at TEXT');
}

export default db;
