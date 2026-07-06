export function parsePrice(str) {
  const normalized = str.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  return parseFloat(normalized) || 0;
}

export function parseDurationMs(str) {
  const days = parseInt(str.match(/(\d+)\s*p/)?.[1] || '0', 10);
  const hours = parseInt(str.match(/(\d+)\s*h/)?.[1] || '0', 10);
  const minutes = parseInt(str.match(/(\d+)\s*m/)?.[1] || '0', 10);
  return ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
}
