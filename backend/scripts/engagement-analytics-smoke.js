const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'seenary-engagement-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'analytics-test.db');
process.env.ANALYTICS_HMAC_SECRET =
  'seenary-engagement-smoke-secret-with-at-least-32-characters';

let analytics;
let analyticsReports;
let db;

try {
  analytics = require('../engagementAnalytics');
  analyticsReports = require('../analyticsReports');
  ({ db } = require('../db'));
} catch (error) {
  const isNativeAbiMismatch =
    error?.code === 'ERR_DLOPEN_FAILED' &&
    /NODE_MODULE_VERSION|different Node\.js version/i.test(String(error?.message || ''));

  if (!process.versions.electron && isNativeAbiMismatch) {
    fs.rmSync(testDirectory, { recursive: true, force: true });
    const result = spawnSync(require('electron'), [__filename], {
      stdio: 'inherit',
      env: process.env,
    });
    process.exit(result.status ?? 1);
  }

  throw error;
}

const {
  buildMonthAggregate,
  deleteEngagementForUser,
  deriveMonthlyKey,
  finalizeClosedMonths,
  getFinalizedAggregates,
  getRollingActiveAccounts,
  pruneFinalizedDailyRows,
  recordEngagement,
} = analytics;
const {
  buildAnalyticsReport,
  getReportCsv,
  handleAnalyticsReportRequest,
  isReportAuthorized,
  renderAnalyticsDashboard,
} = analyticsReports;

try {
  const insertUser = db.prepare(
    `
    INSERT INTO users (id, username, username_normalized, password_hash)
    VALUES (?, ?, ?, 'test-only')
  `
  );
  insertUser.run(101, 'analytics-101', 'analytics-101');
  insertUser.run(202, 'analytics-202', 'analytics-202');
  insertUser.run(303, 'analytics-303', 'analytics-303');
  insertUser.run(404, 'analytics-404', 'analytics-404');

  const first = recordEngagement({
    userId: 101,
    platform: 'win32',
    appVersion: '0.1.9-beta',
    now: new Date('2026-07-03T23:59:59.000Z'),
  });
  assert.equal(first.ok, true);
  assert.equal(first.recorded, true);
  assert.equal(first.activityDate, '2026-07-03');

  const duplicate = recordEngagement({
    userId: 101,
    platform: 'linux',
    appVersion: 'different-version',
    now: new Date('2026-07-03T00:00:01.000Z'),
  });
  assert.equal(duplicate.duplicate, true);

  recordEngagement({
    userId: 101,
    platform: 'linux',
    appVersion: '0.1.9-beta',
    now: new Date('2026-07-04T12:00:00.000Z'),
  });
  recordEngagement({
    userId: 202,
    platform: 'darwin',
    appVersion: '0.1.9-beta',
    now: new Date('2026-07-03T12:00:00.000Z'),
  });

  const julyKey = deriveMonthlyKey(101, '2026-07');
  const augustKey = deriveMonthlyKey(101, '2026-08');
  assert.ok(julyKey);
  assert.ok(augustKey);
  assert.notEqual(julyKey, augustKey);

  const july = buildMonthAggregate('2026-07');
  assert.equal(july.monthlyActiveUsers, 2);
  assert.deepEqual(july.dailyActiveUsers, {
    '2026-07-03': 2,
    '2026-07-04': 1,
  });
  assert.equal(july.averageActiveDays, 1.5);
  assert.equal(july.platformActiveDays.windows, 1);
  assert.equal(july.platformActiveDays.linux, 1);
  assert.equal(july.platformActiveDays.macos, 1);

  const finalized = finalizeClosedMonths(new Date('2026-08-01T00:00:00.000Z'));
  assert.deepEqual(finalized, ['2026-07']);
  assert.equal(getFinalizedAggregates()[0].monthlyActiveUsers, 2);

  recordEngagement({
    userId: 101,
    platform: 'windows',
    appVersion: '0.1.9-beta',
    now: new Date('2026-07-31T23:59:59.000Z'),
  });
  recordEngagement({
    userId: 101,
    platform: 'windows',
    appVersion: '0.1.9-beta',
    now: new Date('2026-08-01T00:00:01.000Z'),
  });
  recordEngagement({
    userId: 202,
    platform: 'web',
    appVersion: '0.1.9-beta',
    now: new Date('2026-07-22T00:00:00.000Z'),
  });

  finalizeClosedMonths(new Date('2026-08-04T23:00:00.000Z'));
  assert.equal(getFinalizedAggregates()[0].averageActiveDays, 1.5);

  assert.deepEqual(
    getRollingActiveAccounts({
      days: 14,
      now: new Date('2026-08-04T23:00:00.000Z'),
    }),
    {
      days: 14,
      startDate: '2026-07-22',
      endDate: '2026-08-04',
      observedActiveAccounts: 2,
      registeredAccounts: 4,
      unavailable: false,
    }
  );

  recordEngagement({
    userId: 303,
    platform: 'unexpected-client-platform',
    appVersion: 'invalid version with spaces',
    now: new Date('2026-08-04T23:59:59.000Z'),
    clientDate: '1999-01-01',
  });
  const normalized = db
    .prepare(
      `
      SELECT activity_date, platform, app_version
      FROM engagement_daily_activity
      WHERE activity_date = '2026-08-04'
    `
    )
    .get();
  assert.deepEqual(normalized, {
    activity_date: '2026-08-04',
    platform: 'unknown',
    app_version: 'unknown',
  });

  assert.equal(deleteEngagementForUser(303), 1);
  assert.equal(buildMonthAggregate('2026-08').monthlyActiveUsers, 1);

  assert.equal(
    pruneFinalizedDailyRows(new Date('2026-09-01T00:00:00.000Z')),
    3
  );
  finalizeClosedMonths(new Date('2026-09-01T00:00:00.000Z'));
  assert.equal(getFinalizedAggregates()[0].averageActiveDays, 1.5);

  const report = buildAnalyticsReport(new Date('2026-08-04T23:00:00.000Z'));
  assert.equal(report.overview.observedActiveAccounts, 2);
  assert.match(renderAnalyticsDashboard(report), /Engagement reports/);
  assert.match(
    getReportCsv(report, 'overview.csv'),
    /observed_active_registered_accounts/
  );
  assert.equal(getReportCsv(report, 'missing.csv'), null);

  const reportCredentials = {
    username: 'reports',
    password: 'a-long-report-password',
    configured: true,
  };
  assert.equal(
    isReportAuthorized(
      {
        headers: {
          authorization: `Basic ${Buffer.from(
            'reports:a-long-report-password'
          ).toString('base64')}`,
        },
      },
      reportCredentials
    ),
    true
  );
  assert.equal(
    isReportAuthorized(
      {
        headers: {
          authorization: `Basic ${Buffer.from('reports:wrong-password').toString(
            'base64'
          )}`,
        },
      },
      reportCredentials
    ),
    false
  );

  const createResponse = () => ({
    headers: {},
    statusCode: null,
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      Object.assign(this.headers, headers);
    },
    end(body = '') {
      this.body = body;
    },
  });

  delete process.env.ANALYTICS_REPORT_USERNAME;
  delete process.env.ANALYTICS_REPORT_PASSWORD;
  const disabledResponse = createResponse();
  assert.equal(
    handleAnalyticsReportRequest(
      { method: 'GET', url: '/reports', headers: { host: 'localhost' } },
      disabledResponse
    ),
    true
  );
  assert.equal(disabledResponse.statusCode, 404);

  process.env.ANALYTICS_REPORT_USERNAME = reportCredentials.username;
  process.env.ANALYTICS_REPORT_PASSWORD = reportCredentials.password;
  const unauthorizedResponse = createResponse();
  handleAnalyticsReportRequest(
    { method: 'GET', url: '/reports', headers: { host: 'localhost' } },
    unauthorizedResponse
  );
  assert.equal(unauthorizedResponse.statusCode, 401);
  assert.match(unauthorizedResponse.headers['WWW-Authenticate'], /Seenary Analytics/);

  const authorization = `Basic ${Buffer.from(
    `${reportCredentials.username}:${reportCredentials.password}`
  ).toString('base64')}`;
  const dashboardResponse = createResponse();
  handleAnalyticsReportRequest(
    {
      method: 'GET',
      url: '/reports',
      headers: { host: 'localhost', authorization },
    },
    dashboardResponse
  );
  assert.equal(dashboardResponse.statusCode, 200);
  assert.match(dashboardResponse.body, /Engagement reports/);
  assert.match(dashboardResponse.headers['Content-Security-Policy'], /default-src 'none'/);

  const downloadResponse = createResponse();
  handleAnalyticsReportRequest(
    {
      method: 'GET',
      url: '/reports/download/overview.csv',
      headers: { host: 'localhost', authorization },
    },
    downloadResponse
  );
  assert.equal(downloadResponse.statusCode, 200);
  assert.match(downloadResponse.headers['Content-Disposition'], /seenary-overview\.csv/);
  assert.match(downloadResponse.body, /total_registered_accounts/);

  delete process.env.ANALYTICS_HMAC_SECRET;
  const disabled = recordEngagement({
    userId: 404,
    platform: 'web',
    appVersion: '0.1.9-beta',
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.disabled, true);

  console.log('Engagement analytics smoke checks passed.');
} finally {
  db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
