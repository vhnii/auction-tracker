import cron from 'node-cron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeAuctions, scrapeAuctionDetail } from './scraper.js';
import { recordScrape, getSoonestEndsAt, getAuctionsMissingDetail, saveAuctionDetail, getAuctionsNeedingOutcomeCheck, setAuctionOutcome } from './db/queries.js';
import { downloadImage } from './utils/images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, 'db', 'images');

const CLOSING_WINDOW_MS = 15 * 60 * 1000;
const WATCH_INTERVAL_MS = 2 * 60 * 1000;
const DETAIL_REQUEST_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeMissingDetails() {
  const pending = getAuctionsMissingDetail();
  let succeeded = 0;

  for (const auction of pending) {
    try {
      const detail = await scrapeAuctionDetail(auction.url);

      const imageRecords = [];
      for (const thumbUrl of detail.images) {
        const { filename, sourceUrl } = await downloadImage(thumbUrl, path.join(IMAGES_DIR, auction.auction_id));
        imageRecords.push({ sourceUrl, localPath: `${auction.auction_id}/${filename}` });
      }

      saveAuctionDetail(auction.id, detail, imageRecords);
      succeeded++;
    } catch (err) {
      console.error(`[scrape] failed to fetch detail for auction ${auction.auction_id}:`, err);
    }
    await sleep(DETAIL_REQUEST_DELAY_MS);
  }

  if (succeeded) {
    console.log(`[scrape] fetched details + images for ${succeeded} auctions`);
  }
}

async function checkEndedAuctionOutcomes() {
  const pending = getAuctionsNeedingOutcomeCheck();
  let reappraisalCount = 0;
  let concludedCount = 0;

  for (const auction of pending) {
    try {
      const detail = await scrapeAuctionDetail(auction.url);
      const outcome = detail.pageMatchesId && (detail.status || detail.upcomingCountdown)
        ? 'reappraisal'
        : 'concluded';

      setAuctionOutcome(auction.id, outcome);
      if (outcome === 'reappraisal') reappraisalCount++; else concludedCount++;
    } catch (err) {
      console.error(`[scrape] failed to check outcome for auction ${auction.auction_id}:`, err);
    }
    await sleep(DETAIL_REQUEST_DELAY_MS);
  }

  if (pending.length) {
    console.log(`[scrape] outcome check: ${reappraisalCount} re-appraised, ${concludedCount} concluded`);
  }
}

let isScraping = false;

export async function runScrape() {
  if (isScraping) {
    console.log('[scrape] skipped: already running');
    return;
  }

  isScraping = true;
  try {
    const items = await scrapeAuctions();
    recordScrape(items);
    console.log(`[scrape] recorded ${items.length} items at ${new Date().toISOString()}`);

    await scrapeMissingDetails();
    await checkEndedAuctionOutcomes();
  } catch (err) {
    console.error('[scrape] run failed:', err);
  } finally {
    isScraping = false;
  }
}

export function startScheduler() {
  runScrape();

  cron.schedule('0 8,20 * * *', runScrape);

  setInterval(async () => {
    const soonestEndsAt = getSoonestEndsAt();
    if (!soonestEndsAt) return;

    const msUntilEnd = new Date(soonestEndsAt).getTime() - Date.now();
    if (msUntilEnd <= CLOSING_WINDOW_MS) {
      await runScrape();
    }
  }, WATCH_INTERVAL_MS);

  console.log('Scheduler started: 08:00/20:00 baseline + closing-window watcher');
}
