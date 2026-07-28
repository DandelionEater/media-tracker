const fs = require('fs');
const path = require('path');

const BACKUP_FILENAME_PATTERN =
  /^media-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite$/;

function readNonNegativeNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getBackupConfig(dbPath) {
  const intervalHours = readNonNegativeNumber('DB_BACKUP_INTERVAL_HOURS', 24);
  const retention = Math.floor(readNonNegativeNumber('DB_BACKUP_RETENTION', 7));
  const backupDirectory = path.resolve(
    process.env.DB_BACKUP_DIRECTORY || `${dbPath}.backups`
  );

  return {
    backupDirectory,
    intervalMs: intervalHours * 60 * 60 * 1000,
    retention,
  };
}

function listBackups(backupDirectory) {
  try {
    return fs
      .readdirSync(backupDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && BACKUP_FILENAME_PATTERN.test(entry.name))
      .map((entry) => {
        const filePath = path.join(backupDirectory, entry.name);
        return { filePath, modifiedAt: fs.statSync(filePath).mtimeMs };
      })
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
  } catch {
    return [];
  }
}

async function createDatabaseBackup(db, dbPath, config = getBackupConfig(dbPath)) {
  if (!config.intervalMs || !config.retention || dbPath === ':memory:') {
    return { created: false, reason: 'disabled' };
  }

  fs.mkdirSync(config.backupDirectory, { recursive: true });
  const existingBackups = listBackups(config.backupDirectory);
  if (
    existingBackups[0] &&
    Date.now() - existingBackups[0].modifiedAt < config.intervalMs
  ) {
    return { created: false, reason: 'current' };
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const destination = path.join(config.backupDirectory, `media-${timestamp}.sqlite`);
  await db.backup(destination);

  const backupsAfterCreation = listBackups(config.backupDirectory);
  for (const expiredBackup of backupsAfterCreation.slice(config.retention)) {
    const resolvedBackup = path.resolve(expiredBackup.filePath);
    if (
      path.dirname(resolvedBackup) === config.backupDirectory &&
      BACKUP_FILENAME_PATTERN.test(path.basename(resolvedBackup))
    ) {
      fs.unlinkSync(resolvedBackup);
    }
  }

  return { created: true, destination };
}

function startDatabaseBackups(db, dbPath) {
  const config = getBackupConfig(dbPath);
  if (!config.intervalMs || !config.retention || dbPath === ':memory:') return null;

  let running = false;
  const runBackup = async () => {
    if (running) return;
    running = true;
    try {
      const result = await createDatabaseBackup(db, dbPath, config);
      if (result.created) {
        console.log(`SQLite backup created: ${result.destination}`);
      }
    } catch (error) {
      console.error('SQLite backup failed:', error);
    } finally {
      running = false;
    }
  };

  void runBackup();
  const checkIntervalMs = Math.min(config.intervalMs, 60 * 60 * 1000);
  const timer = setInterval(runBackup, checkIntervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  createDatabaseBackup,
  getBackupConfig,
  startDatabaseBackups,
};
