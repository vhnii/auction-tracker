import * as cheerio from 'cheerio';

function parseListingRows($) {
  const items = [];
  $('#content .enampakkumised table.pakkumiseAndmed').each((_i, el) => {
    const anchor = $(el).find('h2 a');
    const id = anchor.attr('href').match(/okid=(\d+)/)?.[1];
    items.push({
      id,
      title: anchor.text().trim(),
      url: 'https://www.oksjonikeskus.ee/' + anchor.attr('href'),
      startingPrice: $(el).find('.alghind').text().replace('Alghind:', '').trim(),
      timeLeft: $(el).find('.timeLeft').text().trim(),
      catastralUnit: $(el).find('a[href*="maaamet.ee"]').text().trim(),
    });
  });
  return items;
}

export async function scrapeAuctions() {
  const response = await fetch('https://www.oksjonikeskus.ee/?varaliik=KI&offers=aktiiv&onpage=100');
  if (!response.ok) {
    throw new Error(`Failed to fetch auction list: ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  return parseListingRows($);
}

function getValueByLabel($, label) {
  const labelEl = $('strong').filter((_i, el) => $(el).text().trim() === label).first();
  return labelEl.closest('td, th').next('td, th').text().trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeAuctionDetail(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch auction detail (${url}): ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const dates = $('.generalInfoTable2date');

  return {
    currentPrice: $('#ylemine_hetkhind').text().replace('Hetkehind:', '').trim(),
    address: getValueByLabel($, 'aadress:'),
    city: getValueByLabel($, 'linn / vald:'),
    catastralUnit: getValueByLabel($, 'katastritunnus:'),
    deposit: getValueByLabel($, 'tagatisraha:'),
    registrationStart: dates.eq(0).text().trim(),
    registrationEnd: dates.eq(1).text().trim(),
    auctionStart: dates.eq(2).text().trim(),
    auctionEnd: dates.eq(3).text().trim(),
    announcement: {
      header: $('.announcement-header').text().trim(),
      date: $('.announcement-date').text().trim(),
      body: $('.announcement-body').text().trim(),
      menetluse_nr: $('.announcement-mennr').text().trim(),
      provider: $('.announcement-provider').text().trim(),
      publisher: $('.announcement-publisher').text().trim(),
      number: $('.announcement-number').text().trim(),
    },
  };
}

const DETAIL_REQUEST_DELAY_MS = 400;

export async function scrapeAuctionsWithDetails() {
  const items = await scrapeAuctions();
  const detailedAuctionItems = [];

  for (const item of items) {
    const detail = await scrapeAuctionDetail(item.url);
    detailedAuctionItems.push({ ...item, ...detail });
    await sleep(DETAIL_REQUEST_DELAY_MS);
  }

  return detailedAuctionItems;
}
