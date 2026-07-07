import db from './db.js';
import { parsePrice, parseDurationMs } from '../utils/parse.js';

const getAuctionStmt = db.prepare('SELECT * FROM auctions WHERE auction_id = ?');

const insertAuctionStmt = db.prepare(`
  INSERT INTO auctions (auction_id, title, url, catastral_unit, starting_price, time_left, first_seen_at, last_seen_at, ends_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const touchAuctionStmt = db.prepare(`
  UPDATE auctions SET title = ?, url = ?, catastral_unit = ?, time_left = ?, last_seen_at = ?, ends_at = ?, ended_at = NULL
  WHERE auction_id = ?
`);

const latestSnapshotStmt = db.prepare(`
  SELECT price FROM price_history WHERE auction_id = ? ORDER BY scraped_at DESC LIMIT 1
`);

const insertSnapshotStmt = db.prepare(`
  INSERT INTO price_history (auction_id, price, scraped_at) VALUES (?, ?, ?)
`);

const activeAuctionIdsStmt = db.prepare(`SELECT id, auction_id FROM auctions WHERE ended_at IS NULL`);

const endAuctionStmt = db.prepare(`UPDATE auctions SET ended_at = ? WHERE id = ?`);

const soonestEndsAtStmt = db.prepare(`
  SELECT MIN(ends_at) as soonest FROM auctions WHERE ended_at IS NULL
`);

export function recordScrape(items) {
  const now = new Date().toISOString();
  const seenAuctionIds = new Set();

  db.exec('BEGIN');
  try {
    for (const item of items) {
      seenAuctionIds.add(item.id);
      const price = parsePrice(item.startingPrice);
      const endsAt = new Date(Date.now() + parseDurationMs(item.timeLeft)).toISOString();
      const existing = getAuctionStmt.get(item.id);

      if (!existing) {
        insertAuctionStmt.run(item.id, item.title, item.url, item.catastralUnit || null, price, item.timeLeft, now, now, endsAt);
        const inserted = getAuctionStmt.get(item.id);
        insertSnapshotStmt.run(inserted.id, price, now);
      } else {
        touchAuctionStmt.run(item.title, item.url, item.catastralUnit || null, item.timeLeft, now, endsAt, item.id);
        const latest = latestSnapshotStmt.get(existing.id);
        if (!latest || latest.price !== price) {
          insertSnapshotStmt.run(existing.id, price, now);
        }
      }
    }

    for (const row of activeAuctionIdsStmt.all()) {
      if (!seenAuctionIds.has(row.auction_id)) {
        endAuctionStmt.run(now, row.id);
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSoonestEndsAt() {
  return soonestEndsAtStmt.get().soonest;
}
