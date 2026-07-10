import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scrapeAuctions } from './scraper.js'
import { parseDaysLeft, parseDurationMs, formatPrice } from './utils/parse.js'
import { toThumbPath } from './utils/images.js'
import { recordScrape, getAuctions, getAuctionWithDetail } from './db/queries.js'
import { startScheduler, runScrape } from './scheduler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

function parseFilterNumber(value) {
  const n = Number(value);
  return value === '' || Number.isNaN(n) ? null : n;
}
app.set('view engine', 'pug');
app.use('/images', express.static(path.join(__dirname, 'db', 'images')));

app.get('/', async (req, res) => {
    const items = await scrapeAuctions();
    recordScrape(items);
    res.json({ scraped: items.length, timestamp: new Date().toISOString() });
})

app.get('/dashboard', (req, res) => {
  const search = req.query.search || '';
  const priceMin = req.query.priceMin || '';
  const priceMax = req.query.priceMax || '';
  const time = req.query.time || '';
  const sort = req.query.sort || 'time-asc';
  const status = ['active', 'ended', 'all'].includes(req.query.status) ? req.query.status : 'active';

  const q = search.toLowerCase();
  const min = parseFilterNumber(priceMin);
  const max = parseFilterNumber(priceMax);
  const maxDays = parseFilterNumber(time);

  const rows = getAuctions(status);

  const items = rows
    .map((row) => ({
      id: row.auction_id,
      title: row.title,
      url: row.url,
      catastralUnit: row.catastral_unit || '',
      startingPrice: formatPrice(row.starting_price),
      timeLeft: row.time_left || '',
      priceValue: row.starting_price,
      daysLeft: parseDaysLeft(row.time_left || ''),
      durationMs: parseDurationMs(row.time_left || ''),
      endsAt: row.ends_at || null,
      thumbnail: row.thumbnail ? `/images/${toThumbPath(row.thumbnail)}` : null,
      ended: Boolean(row.ended_at),
      endedAt: row.ended_at ? new Date(row.ended_at).toLocaleDateString('et-EE') : null,
    }))
    .filter((item) =>
      item.title.toLowerCase().includes(q)
      && (min === null || item.priceValue >= min)
      && (max === null || item.priceValue <= max)
      && (maxDays === null || item.daysLeft <= maxDays))
    .sort((a, b) => {
      if (sort === 'price-asc') return a.priceValue - b.priceValue;
      if (sort === 'price-desc') return b.priceValue - a.priceValue;
      return a.durationMs - b.durationMs;
    });

  const soonestItem = items.length
    ? items.reduce((min, i) => (i.durationMs < min.durationMs ? i : min))
    : null;

  const stats = {
    count: items.length,
    lowestPriceLabel: items.length
      ? items.reduce((min, i) => (i.priceValue < min.priceValue ? i : min)).startingPrice
      : '—',
    soonestLabel: soonestItem ? soonestItem.timeLeft : '—',
    soonestEndsAt: soonestItem ? soonestItem.endsAt : null,
  };

  const hasActiveFilters = Boolean(search || priceMin || priceMax || time || status !== 'active');

  res.render('dashboard', { items, stats, search, priceMin, priceMax, time, sort, status, hasActiveFilters });
})

app.get('/auction/:id', (req, res) => {
  const data = getAuctionWithDetail(req.params.id);
  if (!data) return res.status(404).send('Oksjonit ei leitud');

  const { auction, detail, images, priceHistory } = data;

  res.render('auction-detail', {
    auction: {
      id: auction.auction_id,
      title: auction.title,
      url: auction.url,
      catastralUnit: auction.catastral_unit || '',
      startingPrice: formatPrice(auction.starting_price),
      timeLeft: auction.time_left || '',
    },
    detail,
    images: images.map((img) => ({
      full: `/images/${img.local_path}`,
      thumb: `/images/${toThumbPath(img.local_path)}`,
    })),
    priceHistory: priceHistory.map((row) => ({
      price: formatPrice(row.price),
      date: new Date(row.scraped_at).toLocaleDateString('et-EE'),
    })),
  });
})

app.post('/scrape', async (req, res) => {
  await runScrape();
  res.sendStatus(200);
})

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000')
  startScheduler();
})
