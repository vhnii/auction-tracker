import * as cheerio from 'cheerio';

export async function scrapeAuctions() {
  const response = await fetch('https://www.oksjonikeskus.ee/?varaliik=KI&onpage=100');
  const html = await response.text();
  const $ = cheerio.load(html);

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