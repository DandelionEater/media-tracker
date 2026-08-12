const crypto = require('crypto');

const { db } = require('./db');

const DAILY_RETENTION_DAYS = 45;
const ALLOWED_PLATFORMS = new Set(['windows', 'linux', 'macos', 'web', 'unknown']);

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS engagement_daily_activity (
    activity_date TEXT NOT NULL,
    monthly_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    app_version TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (activity_date, monthly_key)
  ) WITHOUT ROWID
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS engagement_monthly_aggregates (
    activity_month TEXT PRIMARY KEY,
    aggregate_json TEXT NOT NULL,
    finalized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`
).run();

db.prepare(
  `
  CREATE INDEX IF NOT EXISTS engagement_daily_activity_month_idx
  ON engagement_daily_activity(substr(activity_date, 1, 7))
`
).run();

function getAnalyticsSecret(secret = process.env.ANALYTICS_HMAC_SECRET) {
  const normalized = String(secret || '').trim();
  return normalized.length >= 32 ? normalized : null;
}

function getUtcDate(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function getUtcMonth(now = new Date()) {
  return getUtcDate(now).slice(0, 7);
}

function getRollingWindow(days, now = new Date()) {
  const normalizedDays = Number.isInteger(days) && days > 0 && days <= 366 ? days : 14;
  const end = new Date(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - normalizedDays + 1);

  return {
    days: normalizedDays,
    startDate: getUtcDate(start),
    endDate: getUtcDate(end),
  };
}

function deriveMonthlyKey(userId, activityMonth, secret = process.env.ANALYTICS_HMAC_SECRET) {
  const analyticsSecret = getAnalyticsSecret(secret);
  const numericUserId = Number(userId);
  const month = String(activityMonth || '');

  if (
    !analyticsSecret ||
    !Number.isInteger(numericUserId) ||
    numericUserId <= 0 ||
    !/^\d{4}-\d{2}$/.test(month)
  ) {
    return null;
  }

  return crypto
    .createHmac('sha256', analyticsSecret)
    .update(`${month}:${numericUserId}`)
    .digest('base64url');
}

function normalizePlatform(value) {
  const platform = String(value || '').trim().toLowerCase();
  if (platform === 'win32' || platform === 'win') return 'windows';
  if (platform === 'darwin' || platform === 'mac') return 'macos';
  return ALLOWED_PLATFORMS.has(platform) ? platform : 'unknown';
}

function normalizeVersion(value) {
  const version = String(value || '').trim();
  return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(version) ? version : 'unknown';
}

function recordEngagement({ userId, platform, appVersion, now = new Date(), secret } = {}) {
  const activityDate = getUtcDate(now);
  const monthlyKey = deriveMonthlyKey(userId, activityDate.slice(0, 7), secret);

  if (!monthlyKey) {
    return {
      ok: false,
      recorded: false,
      disabled: !getAnalyticsSecret(secret),
      message: 'Anonymous usage statistics are unavailable.',
    };
  }

  const result = db
    .prepare(
      `
      INSERT OR IGNORE INTO engagement_daily_activity (
        activity_date,
        monthly_key,
        platform,
        app_version
      )
      VALUES (?, ?, ?, ?)
    `
    )
    .run(
      activityDate,
      monthlyKey,
      normalizePlatform(platform),
      normalizeVersion(appVersion)
    );

  return {
    ok: true,
    recorded: result.changes > 0,
    duplicate: result.changes === 0,
    activityDate,
  };
}

function getMonthRows(activityMonth) {
  return db
    .prepare(
      `
      SELECT activity_date, monthly_key, platform, app_version
      FROM engagement_daily_activity
      WHERE substr(activity_date, 1, 7) = ?
      ORDER BY activity_date, platform, app_version
    `
    )
    .all(activityMonth);
}

function countBy(rows, selectValue) {
  const counts = new Map();
  for (const row of rows) {
    const value = selectValue(row);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  );
}

function buildMonthAggregate(activityMonth) {
  const rows = getMonthRows(activityMonth);
  const activeDaysByUser = new Map();

  for (const row of rows) {
    const activeDates = activeDaysByUser.get(row.monthly_key) || new Set();
    activeDates.add(row.activity_date);
    activeDaysByUser.set(row.monthly_key, activeDates);
  }

  const activeDayCounts = [...activeDaysByUser.values()].map((dates) => dates.size);
  const monthlyActiveUsers = activeDayCounts.length;
  const dailyActiveUsers = countBy(rows, (row) => row.activity_date);
  const rangeCounts = {
    oneDay: activeDayCounts.filter((count) => count === 1).length,
    twoToThreeDays: activeDayCounts.filter((count) => count >= 2 && count <= 3).length,
    fourToSevenDays: activeDayCounts.filter((count) => count >= 4 && count <= 7).length,
    eightToFourteenDays: activeDayCounts.filter((count) => count >= 8 && count <= 14).length,
    fifteenPlusDays: activeDayCounts.filter((count) => count >= 15).length,
  };
  const latestDate = Object.keys(dailyActiveUsers).sort().at(-1) || null;
  const latestDau = latestDate ? dailyActiveUsers[latestDate] : 0;

  return {
    month: activityMonth,
    monthlyActiveUsers,
    dailyActiveUsers,
    dauMau: monthlyActiveUsers ? latestDau / monthlyActiveUsers : 0,
    averageActiveDays: monthlyActiveUsers
      ? activeDayCounts.reduce((total, count) => total + count, 0) / monthlyActiveUsers
      : 0,
    activeDayRanges: rangeCounts,
    platformActiveDays: countBy(rows, (row) => row.platform),
    versionActiveDays: countBy(rows, (row) => row.app_version),
  };
}

function getRollingActiveAccounts({
  days = 14,
  now = new Date(),
  secret = process.env.ANALYTICS_HMAC_SECRET,
} = {}) {
  const analyticsSecret = getAnalyticsSecret(secret);
  const window = getRollingWindow(days, now);
  const registeredAccountIds = db
    .prepare(`SELECT id FROM users ORDER BY id`)
    .all()
    .map((row) => Number(row.id));

  if (!analyticsSecret) {
    return {
      ...window,
      observedActiveAccounts: 0,
      registeredAccounts: registeredAccountIds.length,
      unavailable: true,
    };
  }

  const activityRows = db
    .prepare(
      `
      SELECT DISTINCT
        substr(activity_date, 1, 7) AS activity_month,
        monthly_key
      FROM engagement_daily_activity
      WHERE activity_date BETWEEN ? AND ?
    `
    )
    .all(window.startDate, window.endDate);
  const observedKeysByMonth = new Map();

  for (const row of activityRows) {
    const keys = observedKeysByMonth.get(row.activity_month) || new Set();
    keys.add(row.monthly_key);
    observedKeysByMonth.set(row.activity_month, keys);
  }

  let observedActiveAccounts = 0;
  for (const userId of registeredAccountIds) {
    const active = [...observedKeysByMonth.entries()].some(([month, keys]) => {
      const key = deriveMonthlyKey(userId, month, analyticsSecret);
      return key ? keys.has(key) : false;
    });
    if (active) observedActiveAccounts += 1;
  }

  return {
    ...window,
    observedActiveAccounts,
    registeredAccounts: registeredAccountIds.length,
    unavailable: false,
  };
}

function finalizeClosedMonths(now = new Date()) {
  const currentMonth = getUtcMonth(now);
  const months = db
    .prepare(
      `
      SELECT DISTINCT substr(activity_date, 1, 7) AS activity_month
      FROM engagement_daily_activity
      WHERE substr(activity_date, 1, 7) < ?
      ORDER BY activity_month
    `
    )
    .all(currentMonth)
    .map((row) => row.activity_month);
  const upsert = db.prepare(
    `
    INSERT INTO engagement_monthly_aggregates (
      activity_month,
      aggregate_json,
      finalized_at,
      updated_at
    )
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(activity_month) DO NOTHING
  `
  );

  const transaction = db.transaction(() => {
    for (const month of months) {
      upsert.run(month, JSON.stringify(buildMonthAggregate(month)));
    }
  });
  transaction();
  return months;
}

function pruneFinalizedDailyRows(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - DAILY_RETENTION_DAYS);
  const cutoffDate = getUtcDate(cutoff);

  return db
    .prepare(
      `
      DELETE FROM engagement_daily_activity
      WHERE activity_date < ?
        AND substr(activity_date, 1, 7) IN (
          SELECT activity_month FROM engagement_monthly_aggregates
        )
    `
    )
    .run(cutoffDate).changes;
}

function deleteEngagementForUser(userId, secret = process.env.ANALYTICS_HMAC_SECRET) {
  const analyticsSecret = getAnalyticsSecret(secret);
  if (!analyticsSecret) return 0;

  const months = db
    .prepare(
      `
      SELECT DISTINCT substr(activity_date, 1, 7) AS activity_month
      FROM engagement_daily_activity
    `
    )
    .all()
    .map((row) => row.activity_month);
  const remove = db.prepare(
    `
    DELETE FROM engagement_daily_activity
    WHERE monthly_key = ?
  `
  );

  return db.transaction(() =>
    months.reduce((total, month) => {
      const monthlyKey = deriveMonthlyKey(userId, month, analyticsSecret);
      return total + (monthlyKey ? remove.run(monthlyKey).changes : 0);
    }, 0)
  )();
}

function getFinalizedAggregates() {
  return db
    .prepare(
      `
      SELECT activity_month, aggregate_json, finalized_at, updated_at
      FROM engagement_monthly_aggregates
      ORDER BY activity_month
    `
    )
    .all()
    .map((row) => ({
      ...JSON.parse(row.aggregate_json),
      finalizedAt: row.finalized_at,
      updatedAt: row.updated_at,
    }));
}

module.exports = {
  DAILY_RETENTION_DAYS,
  buildMonthAggregate,
  deleteEngagementForUser,
  deriveMonthlyKey,
  finalizeClosedMonths,
  getFinalizedAggregates,
  getRollingActiveAccounts,
  getRollingWindow,
  getUtcDate,
  normalizePlatform,
  normalizeVersion,
  pruneFinalizedDailyRows,
  recordEngagement,
};
