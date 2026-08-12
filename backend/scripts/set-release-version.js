const fs = require('fs');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..');
const packagePath = path.join(backendDir, 'package.json');
const packageLockPath = path.join(backendDir, 'package-lock.json');
const requestedVersion = String(process.argv[2] || '').trim().replace(/^v/i, '');

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedVersion)) {
  console.error('Usage: npm run release:version -- <major.minor.patch[-prerelease]>');
  console.error('Example: npm run release:version -- 0.1.9-beta');
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const packageJson = readJson(packagePath);
const packageLock = readJson(packageLockPath);
const previousVersion = packageJson.version;

packageJson.version = requestedVersion;
packageLock.version = requestedVersion;

if (packageLock.packages?.['']) {
  packageLock.packages[''].version = requestedVersion;
}

writeJson(packagePath, packageJson);
writeJson(packageLockPath, packageLock);

const releaseNotesPath = path.join(repoRoot, `release-notes-${requestedVersion}.md`);

if (!fs.existsSync(releaseNotesPath)) {
  fs.writeFileSync(
    releaseNotesPath,
    [
      `# Seenary ${requestedVersion}`,
      '',
      `Tag: \`v${requestedVersion}\``,
      '',
      '## New and improved',
      '',
      '- Describe the user-visible improvements in this release.',
      '',
      '## Reliability and fixes',
      '',
      '- Describe the user-visible fixes in this release.',
      '',
    ].join('\n'),
  );
  console.log(`Created ${path.relative(repoRoot, releaseNotesPath)}`);
} else {
  console.log(`Kept existing ${path.relative(repoRoot, releaseNotesPath)}`);
}

console.log(`Updated Seenary version from ${previousVersion} to ${requestedVersion}.`);
console.log('Finish the release notes, commit the changes, and push to main.');
