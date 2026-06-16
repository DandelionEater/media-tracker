const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const sourcePng = path.join(repoRoot, 'icons', '1024x1024.png');
const runtimePng = path.join(repoRoot, 'backend', 'icon.png');
const runtimeIco = path.join(repoRoot, 'backend', 'icon.ico');
const trayPng = path.join(repoRoot, 'backend', 'tray.png');
const buildPng = path.join(repoRoot, 'backend', 'build', 'icon.png');
const buildIco = path.join(repoRoot, 'backend', 'build', 'icon.ico');
const frontendIconPng = path.join(repoRoot, 'frontend', 'public', 'icon.png');
const frontendAppleIconPng = path.join(repoRoot, 'frontend', 'public', 'apple-touch-icon.png');
const tempDir = path.join(repoRoot, 'backend', 'build', '.icon-work');
const pngSizes = [16, 24, 32, 48, 64, 128, 256];

if (!fs.existsSync(sourcePng)) {
  throw new Error(`Missing source icon: ${sourcePng}`);
}

fs.mkdirSync(path.dirname(buildPng), { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

resizePng(sourcePng, runtimePng, 512);
resizePng(sourcePng, trayPng, 32);
resizePng(sourcePng, buildPng, 1024);
resizePng(sourcePng, frontendIconPng, 512);
resizePng(sourcePng, frontendAppleIconPng, 180);

const iconImages = pngSizes.map((size) => {
  const outputPath = path.join(tempDir, `icon-${size}.png`);
  resizePng(sourcePng, outputPath, size);
  return {
    size,
    data: fs.readFileSync(outputPath),
  };
});

writeIco(buildIco, iconImages);
fs.copyFileSync(buildIco, runtimeIco);
fs.rmSync(tempDir, { recursive: true, force: true });

console.log(`Generated ${runtimePng}`);
console.log(`Generated ${runtimeIco}`);
console.log(`Generated ${trayPng}`);
console.log(`Generated ${buildPng}`);
console.log(`Generated ${buildIco}`);
console.log(`Generated ${frontendIconPng}`);
console.log(`Generated ${frontendAppleIconPng}`);

function resizePng(inputPath, outputPath, size) {
  const command = `
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile(${quotePs(inputPath)})
try {
  $bitmap = New-Object System.Drawing.Bitmap ${size}, ${size}
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.DrawImage($source, 0, 0, ${size}, ${size})
      $bitmap.Save(${quotePs(outputPath)}, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
    }
  } finally {
    $bitmap.Dispose()
  }
} finally {
  $source.Dispose()
}
`;
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    command,
  ], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to generate ${outputPath}`);
  }
}

function writeIco(outputPath, images) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  let imageOffset = headerSize + images.length * directoryEntrySize;
  const directory = Buffer.alloc(images.length * directoryEntrySize);

  images.forEach((image, index) => {
    const offset = index * directoryEntrySize;
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, offset);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, offset + 1);
    directory.writeUInt8(0, offset + 2);
    directory.writeUInt8(0, offset + 3);
    directory.writeUInt16LE(1, offset + 4);
    directory.writeUInt16LE(32, offset + 6);
    directory.writeUInt32LE(image.data.length, offset + 8);
    directory.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += image.data.length;
  });

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  fs.writeFileSync(outputPath, Buffer.concat([header, directory, ...images.map((image) => image.data)]));
}

function quotePs(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
