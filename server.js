import express from 'express'
import { scrapeAuctions } from './scraper.js'

const app = express()

app.get('/', async (req, res) => {
    const items = await scrapeAuctions();
    res.json({items: items});
})

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000')
})