import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const THUMB_WIDTH = 640;

function toFullSizeUrl(url) {
  return url.replace(/(\.\w+)$/, '_1280x960$1');
}

export function toThumbPath(localPath) {
  return localPath.replace(/([^/\\]+)$/, 'thumb_$1');
}

export async function downloadImage(url, destDir) {
  const fullSizeUrl = toFullSizeUrl(url);
  let response = await fetch(fullSizeUrl);
  let sourceUrl = fullSizeUrl;

  if (!response.ok) {
    response = await fetch(url);
    sourceUrl = url;
    if (!response.ok) {
      throw new Error(`Failed to download image ${sourceUrl}: ${response.status}`);
    }
  }

  const originalFilename = path.basename(new URL(sourceUrl).pathname);
  const filename = originalFilename.replace(/\.\w+$/, '.webp');
  await fs.mkdir(destDir, { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await sharp(buffer).webp({ quality: 80 }).toFile(path.join(destDir, filename));
  await sharp(buffer).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 75 }).toFile(path.join(destDir, `thumb_${filename}`));
  return { filename, sourceUrl };
}
