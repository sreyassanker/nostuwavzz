import sharp from 'sharp';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

const ROOT = 'C:/Users/sreya/Downloads/Wavz';
const SRC = join(ROOT, 'new-icon.jpg');
const TAURI_ICONS = join(ROOT, 'src-tauri/icons');
const DOCS_ASSETS = join(ROOT, 'docs/assets');

const sizes = [
  // src-tauri/icons
  { size: 32, path: join(TAURI_ICONS, '32x32.png') },
  { size: 64, path: join(TAURI_ICONS, '64x64.png') },
  { size: 128, path: join(TAURI_ICONS, '128x128.png') },
  { size: 256, path: join(TAURI_ICONS, '128x128@2x.png') },
  { size: 256, path: join(TAURI_ICONS, 'icon.png') },
  // Windows
  { size: 30, path: join(TAURI_ICONS, 'Square30x30Logo.png') },
  { size: 44, path: join(TAURI_ICONS, 'Square44x44Logo.png') },
  { size: 71, path: join(TAURI_ICONS, 'Square71x71Logo.png') },
  { size: 89, path: join(TAURI_ICONS, 'Square89x89Logo.png') },
  { size: 107, path: join(TAURI_ICONS, 'Square107x107Logo.png') },
  { size: 142, path: join(TAURI_ICONS, 'Square142x142Logo.png') },
  { size: 150, path: join(TAURI_ICONS, 'Square150x150Logo.png') },
  { size: 284, path: join(TAURI_ICONS, 'Square284x284Logo.png') },
  { size: 310, path: join(TAURI_ICONS, 'Square310x310Logo.png') },
  { size: 50, path: join(TAURI_ICONS, 'StoreLogo.png') },
  // docs/assets
  { size: 512, path: join(DOCS_ASSETS, 'icon.png') },
];

async function generate() {
  console.log('Generating icons from', SRC);
  
  for (const { size, path } of sizes) {
    await sharp(SRC)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png()
      .toFile(path);
    console.log(`  ✓ ${size}x${size} → ${path.split('/').pop()}`);
  }

  // Generate .ico for Windows (16, 32, 48, 256)
  const icoSizes = [16, 32, 48, 256];
  const icoBuffers = await Promise.all(
    icoSizes.map(s => sharp(SRC).resize(s, s, { fit: 'cover' }).png().toBuffer())
  );
  // Write as multi-size ICO
  await sharp(icoBuffers[icoBuffers.length - 1])
    .toFile(join(TAURI_ICONS, 'icon.ico'));
  console.log('  ✓ icon.ico');

  console.log('\nDone! All icons generated.');
}

generate().catch(e => { console.error(e); process.exit(1); });
