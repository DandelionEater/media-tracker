const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');

const releaseDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '..', '..', 'release', packageJson.version);
const latestYmlPath = path.join(releaseDir, 'latest.yml');

function runGit(args) {
  return execFileSync('git', args, {
    cwd: path.resolve(__dirname, '..', '..'),
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

    return notes.length ? notes : [`Seenary ${packageJson.version} update.`];
  } catch {
    return [`Seenary ${packageJson.version} update.`];
  }
}

function yamlBlock(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join('\n');
}

if (!fs.existsSync(latestYmlPath)) {
  console.error(`Could not find ${latestYmlPath}`);
  process.exit(1);
}

const releaseNotes = getReleaseNotes();
const current = fs
  .readFileSync(latestYmlPath, 'utf8')
  .replace(/\nreleaseName:.*(?:\r?\n|$)/g, '\n')
  .replace(/\nreleaseNotes:\s\|[\s\S]*$/g, '');

const next = `${current.trimEnd()}
releaseName: Seenary ${packageJson.version}
releaseNotes: |
${yamlBlock(releaseNotes.map((note) => `- ${note}`).join('\n'))}
`;

fs.writeFileSync(latestYmlPath, next);
console.log(`Wrote release notes to ${latestYmlPath}`);
