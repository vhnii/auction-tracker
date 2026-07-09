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

const auctionsByStatusStmt = {
  active: db.prepare(`
    SELECT a.auction_id, a.title, a.url, a.catastral_unit, a.starting_price, a.time_left, a.ended_at, a.ends_at,
      (SELECT local_path FROM auction_images i WHERE i.auction_id = a.id ORDER BY sort_order LIMIT 1) AS thumbnail
    FROM auctions a
    WHERE a.ended_at IS NULL
    ORDER BY a.last_seen_at DESC
  `),
  ended: db.prepare(`
    SELECT a.auction_id, a.title, a.url, a.catastral_unit, a.starting_price, a.time_left, a.ended_at, a.ends_at,
      (SELECT local_path FROM auction_images i WHERE i.auction_id = a.id ORDER BY sort_order LIMIT 1) AS thumbnail
    FROM auctions a
    WHERE a.ended_at IS NOT NULL
    ORDER BY a.ended_at DESC
  `),
  all: db.prepare(`
    SELECT a.auction_id, a.title, a.url, a.catastral_unit, a.starting_price, a.time_left, a.ended_at, a.ends_at,
      (SELECT local_path FROM auction_images i WHERE i.auction_id = a.id ORDER BY sort_order LIMIT 1) AS thumbnail
    FROM auctions a
    ORDER BY a.last_seen_at DESC
  `),
};

const soonestEndsAtStmt = db.prepare(`
  SELECT MIN(ends_at) as soonest FROM auctions WHERE ended_at IS NULL
`);

const auctionsMissingDetailStmt = db.prepare(`
  SELECT a.id, a.auction_id, a.url
  FROM auctions a
  LEFT JOIN auction_details d ON d.auction_id = a.id
  WHERE a.ended_at IS NULL AND d.id IS NULL
`);

const upsertDetailStmt = db.prepare(`
  INSERT INTO auction_details (
    auction_id, address, city, deposit, current_price,
    registration_start, registration_end, auction_start, auction_end,
    announcement_header, announcement_date, announcement_body, announcement_menetluse_nr,
    announcement_provider, announcement_publisher, announcement_number, scraped_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(auction_id) DO UPDATE SET
    address = excluded.address,
    city = excluded.city,
    deposit = excluded.deposit,
    current_price = excluded.current_price,
    registration_start = excluded.registration_start,
    registration_end = excluded.registration_end,
    auction_start = excluded.auction_start,
    auction_end = excluded.auction_end,
    announcement_header = excluded.announcement_header,
    announcement_date = excluded.announcement_date,
    announcement_body = excluded.announcement_body,
    announcement_menetluse_nr = excluded.announcement_menetluse_nr,
    announcement_provider = excluded.announcement_provider,
    announcement_publisher = excluded.announcement_publisher,
    announcement_number = excluded.announcement_number,
    scraped_at = excluded.scraped_at
`);

const deleteImagesStmt = db.prepare('DELETE FROM auction_images WHERE auction_id = ?');
const insertImageStmt = db.prepare(`
  INSERT INTO auction_images (auction_id, source_url, local_path, sort_order, downloaded_at)
  VALUES (?, ?, ?, ?, ?)
`);

const auctionByPublicIdStmt = db.prepare('SELECT * FROM auctions WHERE auction_id = ?');
const detailByAuctionRowIdStmt = db.prepare('SELECT * FROM auction_details WHERE auction_id = ?');
const imagesByAuctionRowIdStmt = db.prepare('SELECT * FROM auction_images WHERE auction_id = ? ORDER BY sort_order');
const priceHistoryByAuctionRowIdStmt = db.prepare('SELECT price, scraped_at FROM price_history WHERE auction_id = ? ORDER BY scraped_at ASC');

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

export function getAuctions(status = 'active') {
  const stmt = auctionsByStatusStmt[status] || auctionsByStatusStmt.active;
  return stmt.all();
}

export function getSoonestEndsAt() {
  return soonestEndsAtStmt.get().soonest;
}

export function getAuctionsMissingDetail() {
  return auctionsMissingDetailStmt.all();
}

export function saveAuctionDetail(auctionRowId, detail, imageRecords) {
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    upsertDetailStmt.run(
      auctionRowId,
      detail.address,
      detail.city,
      detail.deposit,
      detail.currentPrice,
      detail.registrationStart,
      detail.registrationEnd,
      detail.auctionStart,
      detail.auctionEnd,
      detail.announcement.header,
      detail.announcement.date,
      detail.announcement.body,
      detail.announcement.menetluse_nr,
      detail.announcement.provider,
      detail.announcement.publisher,
      detail.announcement.number,
      now
    );

    deleteImagesStmt.run(auctionRowId);
    imageRecords.forEach((img, i) => {
      insertImageStmt.run(auctionRowId, img.sourceUrl, img.localPath, i, now);
    });

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getAuctionWithDetail(publicId) {
  const auction = auctionByPublicIdStmt.get(publicId);
  if (!auction) return null;

  const priceHistory = [];
  for (const row of priceHistoryByAuctionRowIdStmt.all(auction.id)) {
    if (priceHistory.length === 0 || priceHistory[priceHistory.length - 1].price !== row.price) {
      priceHistory.push(row);
    }
  }
  priceHistory.reverse();

  return {
    auction,
    detail: detailByAuctionRowIdStmt.get(auction.id) || null,
    images: imagesByAuctionRowIdStmt.all(auction.id),
    priceHistory,
  };
}
