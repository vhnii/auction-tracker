import express from 'express'
import { scrapeAuctions } from './scraper.js'
import { recordScrape } from './db/queries.js'
import { startScheduler } from './scheduler.js'

const app = express()

app.get('/', async (req, res) => {
    const items = await scrapeAuctions();
    recordScrape(items);
    res.json({ scraped: items.length, timestamp: new Date().toISOString() });
})

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000')
  startScheduler();
})
