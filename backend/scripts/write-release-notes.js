const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');

const repoRoot = path.resolve(__dirname, '..', '..');
const releaseDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(repoRoot, 'release', packageJson.version);
const updateMetadataPath = findUpdateMetadataFile();

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function getCommitRange() {
  try {
    return `${runGit(['describe', '--tags', '--abbrev=0'])}..HEAD`;
  } catch {
    return 'HEAD';
  }
}

function getReleaseNotes() {
  const releaseNotesPath = findReleaseNotesFile();

  if (releaseNotesPath) {
    return fs.readFileSync(releaseNotesPath, 'utf8').trim();
  }

  try {
    const range = getCommitRange();
    const args =
      range === 'HEAD'
        ? ['log', '--max-count=8', '--pretty=format:%s']
        : ['log', range, '--pretty=format:%s'];
    const notes = runGit(args)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return notes.length
      ? notes.map((note) => `- ${note}`).join('\n')
      : `Seenary ${packageJson.version} update.`;
  } catch {
    return `Seenary ${packageJson.version} update.`;
  }
}

function findReleaseNotesFile() {
  const candidates = [
    `release-notes-${packageJson.version}.md`,
    `release-notes-${packageJson.version}-beta.md`,
  ];

  for (const candidate of candidates) {
    const filePath = path.join(repoRoot, candidate);

    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

function yamlBlock(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join('\n');
}

if (!updateMetadataPath) {
  console.error(`Could not find update metadata in ${releaseDir}`);
  process.exit(1);
}

const releaseNotes = getReleaseNotes();
const current = fs
  .readFileSync(updateMetadataPath, 'utf8')
  .replace(/\nreleaseName:.*(?:\r?\n|$)/g, '\n')
  .replace(/\nreleaseNotes:\s\|[\s\S]*$/g, '');

const next = `${current.trimEnd()}
releaseName: Seenary ${packageJson.version}
releaseNotes: |
${yamlBlock(releaseNotes)}
`;

fs.writeFileSync(updateMetadataPath, next);
console.log(`Wrote release notes to ${updateMetadataPath}`);

const latestYmlPath = path.join(releaseDir, 'latest.yml');

if (path.basename(updateMetadataPath) !== 'latest.yml') {
  fs.writeFileSync(latestYmlPath, next);
  console.log(`Mirrored release metadata to ${latestYmlPath}`);
}

function findUpdateMetadataFile() {
  const candidates = [
    'beta.yml',
    'alpha.yml',
    'dev.yml',
    'latest.yml',
  ];

  for (const candidate of candidates) {
    const filePath = path.join(releaseDir, candidate);

    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}
