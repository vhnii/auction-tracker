// One-time backfill: fetch images for auctions that were detail-scraped
// before the scraper could read single-image galleries (lightGalleryData fix).
// Run with: node scripts/backfill-images.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeAuctionDetail } from '../scraper.js';
import { getAuctionsMissingImages, saveAuctionImages } from '../db/queries.js';
import { downloadImage } from '../utils/images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, '..', 'db', 'images');
const DETAIL_REQUEST_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const pending = getAuctionsMissingImages();
console.log(`[backfill] ${pending.length} auctions have detail but no images`);

let saved = 0;
for (const auction of pending) {
  try {
    const detail = await scrapeAuctionDetail(auction.url);

    if (!detail.pageMatchesId) {
      console.log(`[backfill] skip ${auction.auction_id}: page no longer shows this auction`);
      continue;
    }
    if (detail.images.length === 0) {
      console.log(`[backfill] skip ${auction.auction_id}: no images on page`);
      continue;
    }

    const imageRecords = [];
    for (const thumbUrl of detail.images) {
      const { filename, sourceUrl } = await downloadImage(thumbUrl, path.join(IMAGES_DIR, auction.auction_id));
      imageRecords.push({ sourceUrl, localPath: `${auction.auction_id}/${filename}` });
    }

    saveAuctionImages(auction.id, imageRecords);
    saved++;
    console.log(`[backfill] saved ${imageRecords.length} image(s) for auction ${auction.auction_id}`);
  } catch (err) {
    console.error(`[backfill] failed for auction ${auction.auction_id}:`, err.message);
  }
  await sleep(DETAIL_REQUEST_DELAY_MS);
}

console.log(`[backfill] done: images added for ${saved} of ${pending.length} auctions`);
