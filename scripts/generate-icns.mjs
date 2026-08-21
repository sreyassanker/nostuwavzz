import sharp from 'sharp';
import { join } from 'path';
import { writeFileSync } from 'fs';

const ROOT = 'C:/Users/sreya/Downloads/Wavz';
const SRC = join(ROOT, 'new-icon.jpg');
const ICNS_PATH = join(ROOT, 'src-tauri/icons/icon.icns');

// macOS .icns format - we'll create a simple PNG-based .icns
// Apple supports PNG in .icns since macOS 10.7
async function generate() {
  console.log('Generating macOS .icns...');

  // Generate 16x16 to 1024x1024
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  
  // For .icns, we need to create a proper binary format
  // Each icon entry: 4-byte type + 4-byte length + PNG data
  const entries = [];

  for (const size of sizes) {
    const pngBuffer = await sharp(SRC)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer();

    // ic07 = 128x128, ic08 = 256x256, ic09 = 512x512, ic10 = 1024x1024 (retina)
    // ic11 = 16x16@2x, ic12 = 32x32@2x, ic13 = 128x128@2x, ic14 = 256x256@2x
    let type;
    switch (size) {
      case 16: type = 'icp4'; break;   // 16x16
      case 32: type = 'icp5'; break;   // 32x32 (16x16@2x)
      case 64: type = 'icp6'; break;   // 64x64 (32x32@2x)
      case 128: type = 'ic07'; break;  // 128x128
      case 256: type = 'ic08'; break;  // 256x256
      case 512: type = 'ic09'; break;  // 512x512
      case 1024: type = 'ic10'; break; // 1024x1024
    }

    const entryLength = 8 + pngBuffer.length;
    const entry = Buffer.alloc(entryLength);
    entry.write(type, 0, 4);
    entry.writeUInt32BE(entryLength, 4);
    pngBuffer.copy(entry, 8);
    entries.push(entry);
  }

  // Build .icns file
  const totalLength = 8 + entries.reduce((sum, e) => sum + e.length, 0);
  const icns = Buffer.alloc(totalLength);
  icns.write('icns', 0, 4);
  icns.writeUInt32BE(totalLength, 4);

  let offset = 8;
  for (const entry of entries) {
    entry.copy(icns, offset);
    offset += entry.length;
  }

  writeFileSync(ICNS_PATH, icns);
  console.log(`  ✓ icon.icns (${(totalLength / 1024).toFixed(1)} KB)`);
  console.log('\nDone!');
}

generate().catch(e => { console.error(e); process.exit(1); });
