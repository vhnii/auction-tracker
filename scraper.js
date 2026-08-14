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
      // multi-property auctions list one link per cadastral unit; .text() on the
      // set would concatenate them with no separator (the whitespace between the
      // anchors belongs to the parent, not to any anchor)
      catastralUnit: $(el).find('a[href*="maaamet.ee"]').map((_j, a) => $(a).text().trim()).get().join(' '),
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

const LISTING_PAGE_SIZE = 100;

export async function scrapeUpcomingAuctions() {
  const items = [];

  for (let page = 1; ; page++) {
    const response = await fetch(`https://www.oksjonikeskus.ee/?varaliik=KI&offers=reg&onpage=${LISTING_PAGE_SIZE}&page=${page}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch upcoming auctions (page ${page}): ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const rows = parseListingRows($);

    items.push(...rows);
    if (rows.length < LISTING_PAGE_SIZE) break;
  }

  return items;
}

function getValueByLabel($, label) {
  const labelEl = $('strong').filter((_i, el) => $(el).text().trim() === label).first();
  return labelEl.closest('td, th').next('td, th').text().trim();
}

function textWithBreaks(el) {
  el.find('br').replaceWith('\x01');
  return el.text()
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/\x01 ?/g, '\n')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Single-image pages have no <img> thumbnails in the gallery column (the image
// is injected by client-side JS), so prefer the lightGalleryData JSON embedded
// in the page — it lists every image on both single- and multi-image pages.
function parseGalleryImages($, html) {
  const match = html.match(/lightGalleryData\s*=\s*(\[.*\]);/);
  if (match) {
    try {
      const urls = JSON.parse(match[1])
        .map((entry) => entry.thumb || entry.src)
        .filter(Boolean);
      if (urls.length) return urls;
    } catch {
      // malformed JSON — fall back to the DOM selector below
    }
  }
  return $('#bid-content-gallery1_right_col img')
    .map((_i, el) => $(el).attr('src'))
    .get()
    .filter(Boolean);
}

export async function scrapeAuctionDetail(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch auction detail (${url}): ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const dates = $('.generalInfoTable2date');

  // some pages use relative /media/... paths — resolve against the page URL
  const images = parseGalleryImages($, html).map((u) => new URL(u, url).href);

  const expectedId = url.match(/okid=(\d+)/)?.[1] || null;

  return {
    pageMatchesId: expectedId !== null && $('#col-id').text().trim() === expectedId,
    upcomingCountdown: getValueByLabel($, 'aega alguseni:'),
    currentPrice: $('#ylemine_hetkhind').text().replace('Hetkehind:', '').trim(),
    status: $('strong.ending, span.ending').first().text().trim() || null,
    images,
    address: getValueByLabel($, 'aadress:'),
    city: getValueByLabel($, 'linn / vald:'),
    catastralUnit: getValueByLabel($, 'katastritunnus:'),
    deposit: getValueByLabel($, 'tagatisraha:'),
    registrationStart: dates.eq(0).text().trim(),
    registrationEnd: dates.eq(1).text().trim(),
    auctionStart: dates.eq(2).text().trim(),
    auctionEnd: dates.eq(3).text().trim(),
    announcement: {
      header: textWithBreaks($('.announcement-header')),
      date: textWithBreaks($('.announcement-date')),
      body: textWithBreaks($('.announcement-body')),
      menetluse_nr: textWithBreaks($('.announcement-mennr')),
      provider: textWithBreaks($('.announcement-provider')),
      publisher: textWithBreaks($('.announcement-publisher')),
      number: textWithBreaks($('.announcement-number')),
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
