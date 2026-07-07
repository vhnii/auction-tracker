import cron from 'node-cron';
import { scrapeAuctions } from './scraper.js';
import { recordScrape, getSoonestEndsAt } from './db/queries.js';

const CLOSING_WINDOW_MS = 15 * 60 * 1000;
const WATCH_INTERVAL_MS = 2 * 60 * 1000;

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
