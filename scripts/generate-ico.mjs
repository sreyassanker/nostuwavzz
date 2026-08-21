import sharp from 'sharp';
import { join } from 'path';
import { writeFileSync } from 'fs';

const ROOT = 'C:/Users/sreya/Downloads/Wavz';
const SRC = join(ROOT, 'src-tauri/icons/icon.png');
const ICO_PATH = join(ROOT, 'src-tauri/icons/icon.ico');

// ICO format requires BMP or PNG entries
// We'll create a proper ICO with 16, 32, 48, 256 px entries using PNG
async function generate() {
  console.log('Regenerating icon.ico...');

  const sizes = [16, 32, 48, 256];
  const entries = [];

  for (const size of sizes) {
    const pngBuffer = await sharp(SRC)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer();

    entries.push({ size, data: pngBuffer });
  }

  // ICO header: 6 bytes
  // reserved (2) + type (2) + count (2)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // type = 1 (ICO)
  header.writeUInt16LE(entries.length, 4); // count

  // Directory entries: 16 bytes each
  // width (1) + height (1) + colors (1) + reserved (1) + planes (2) + bpp (2) + size (4) + offset (4)
  const dirSize = entries.length * 16;
  const dir = Buffer.alloc(dirSize);
  
  let dataOffset = 6 + dirSize; // header + all directory entries

  for (let i = 0; i < entries.length; i++) {
    const { size, data } = entries[i];
    const offset = i * 16;
    
    dir.writeUInt8(size > 255 ? 0 : size, offset);       // width (0 = 256)
    dir.writeUInt8(size > 255 ? 0 : size, offset + 1);   // height
    dir.writeUInt8(0, offset + 2);                         // color palette
    dir.writeUInt8(0, offset + 3);                         // reserved
    dir.writeUInt16LE(1, offset + 4);                      // color planes
    dir.writeUInt16LE(32, offset + 6);                     // bits per pixel
    dir.writeUInt32LE(data.length, offset + 8);            // data size
    dir.writeUInt32LE(dataOffset, offset + 12);            // data offset
    
    dataOffset += data.length;
  }

  // Combine all
  const totalSize = 6 + dirSize + entries.reduce((sum, e) => sum + e.data.length, 0);
  const ico = Buffer.alloc(totalSize);
  
  header.copy(ico, 0);
  dir.copy(ico, 6);
  
  let pos = 6 + dirSize;
  for (const { data } of entries) {
    data.copy(ico, pos);
    pos += data.length;
  }

  writeFileSync(ICO_PATH, ico);
  console.log(`  ✓ icon.ico (${(totalSize / 1024).toFixed(1)} KB)`);
  console.log('\nDone!');
}

generate().catch(e => { console.error(e); process.exit(1); });
