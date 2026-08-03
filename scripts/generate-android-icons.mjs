import sharp from 'sharp';
import { join } from 'path';

const ROOT = 'C:/Users/sreya/Downloads/Wavz';
const SRC = join(ROOT, 'src-tauri/icons/icon.png');
const ANDROID = join(ROOT, 'src-tauri/icons/android');

const densities = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

async function generate() {
  console.log('Generating Android icons...');

  for (const { dir, size } of densities) {
    const dirPath = join(ANDROID, dir);
    
    // ic_launcher.png
    await sharp(SRC)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png()
      .toFile(join(dirPath, 'ic_launcher.png'));

    // ic_launcher_round.png (circular)
    const roundSize = size;
    const svgCircle = `<svg width="${roundSize}" height="${roundSize}"><circle cx="${roundSize/2}" cy="${roundSize/2}" r="${roundSize/2}" fill="white"/></svg>`;
    const maskBuffer = Buffer.from(svgCircle);
    
    await sharp(SRC)
      .resize(roundSize, roundSize, { fit: 'cover', position: 'center' })
      .composite([{
        input: maskBuffer,
        blend: 'dest-in',
      }])
      .png()
      .toFile(join(dirPath, 'ic_launcher_round.png'));

    // ic_launcher_foreground.png (with some padding for adaptive icon)
    const fgSize = Math.round(size * 1.5);
    const padding = Math.round(size * 0.25);
    await sharp(SRC)
      .resize(fgSize - padding * 2, fgSize - padding * 2, { fit: 'cover', position: 'center' })
      .extend({
        top: padding, bottom: padding, left: padding, right: padding,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(join(dirPath, 'ic_launcher_foreground.png'));

    console.log(`  ✓ ${dir} (${size}px)`);
  }

  console.log('\nDone! Android icons generated.');
}

generate().catch(e => { console.error(e); process.exit(1); });
