export function parsePrice(str) {
  const normalized = str.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  return parseFloat(normalized) || 0;
}

export function parseDaysLeft(str) {
  const match = str.match(/(\d+)\s*p/);
  return match ? parseInt(match[1], 10) : 0;
}

export function parseDurationMs(str) {
  const days = parseInt(str.match(/(\d+)\s*p/)?.[1] || '0', 10);
  const hours = parseInt(str.match(/(\d+)\s*h/)?.[1] || '0', 10);
  const minutes = parseInt(str.match(/(\d+)\s*m/)?.[1] || '0', 10);
  return ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
}

export function formatPrice(n) {
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat('et-EE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}
