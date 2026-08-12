const crypto = require('crypto');

const { db } = require('./db');
const {
  buildMonthAggregate,
  finalizeClosedMonths,
  getFinalizedAggregates,
  getRollingActiveAccounts,
  getUtcDate,
  pruneFinalizedDailyRows,
} = require('./engagementAnalytics');

const REPORT_PREFIX = '/reports';

function safeEqual(left, right) {
  const leftDigest = crypto.createHash('sha256').update(String(left)).digest();
  const rightDigest = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function getReportCredentials() {
  const username = String(process.env.ANALYTICS_REPORT_USERNAME || '').trim();
  const password = String(process.env.ANALYTICS_REPORT_PASSWORD || '');
  return {
    username,
    password,
    configured: Boolean(username && password.length >= 16),
  };
}

function isReportAuthorized(req, credentials = getReportCredentials()) {
  if (!credentials.configured) return false;

  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    return (
      safeEqual(decoded.slice(0, separator), credentials.username) &&
      safeEqual(decoded.slice(separator + 1), credentials.password)
    );
  } catch {
    return false;
  }
}

function buildAnalyticsReport(now = new Date()) {
  finalizeClosedMonths(now);
  const prunedRows = pruneFinalizedDailyRows(now);
  const currentDate = getUtcDate(now);
  const currentMonth = currentDate.slice(0, 7);
  const daily = db
    .prepare(
      `
      SELECT
        activity_date AS activityDate,
        COUNT(DISTINCT monthly_key) AS dailyActiveUsers
      FROM engagement_daily_activity
      GROUP BY activity_date
      ORDER BY activity_date
    `
    )
    .all();
  const monthly = [
    ...getFinalizedAggregates().filter((aggregate) => aggregate.month !== currentMonth),
    buildMonthAggregate(currentMonth),
  ];

  return {
    generatedAt: new Date(now).toISOString(),
    currentDate,
    currentMonth,
    prunedRows,
    overview: getRollingActiveAccounts({ days: 14, now }),
    daily,
    monthly,
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function makeCsv(columns, rows) {
  return `${[
    columns.map(csvCell).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ].join('\n')}\n`;
}

function getReportCsv(report, name) {
  if (name === 'overview.csv') {
    return makeCsv(
      [
        'window_days',
        'window_start_date',
        'window_end_date',
        'observed_active_registered_accounts',
        'total_registered_accounts',
      ],
      [
        {
          window_days: report.overview.days,
          window_start_date: report.overview.startDate,
          window_end_date: report.overview.endDate,
          observed_active_registered_accounts: report.overview.unavailable
            ? 'unavailable'
            : report.overview.observedActiveAccounts,
          total_registered_accounts: report.overview.registeredAccounts,
        },
      ]
    );
  }

  if (name === 'daily.csv') {
    return makeCsv(
      ['activity_date', 'daily_active_users'],
      report.daily.map((row) => ({
        activity_date: row.activityDate,
        daily_active_users: row.dailyActiveUsers,
      }))
    );
  }

  if (name === 'monthly.csv') {
    return makeCsv(
      [
        'activity_month',
        'monthly_active_users',
        'average_active_days',
        'dau_mau',
        'one_day_users',
        'two_to_three_day_users',
        'four_to_seven_day_users',
        'eight_to_fourteen_day_users',
        'fifteen_plus_day_users',
      ],
      report.monthly.map((aggregate) => ({
        activity_month: aggregate.month,
        monthly_active_users: aggregate.monthlyActiveUsers,
        average_active_days: Number(aggregate.averageActiveDays || 0).toFixed(4),
        dau_mau: Number(aggregate.dauMau || 0).toFixed(4),
        one_day_users: aggregate.activeDayRanges?.oneDay || 0,
        two_to_three_day_users: aggregate.activeDayRanges?.twoToThreeDays || 0,
        four_to_seven_day_users: aggregate.activeDayRanges?.fourToSevenDays || 0,
        eight_to_fourteen_day_users: aggregate.activeDayRanges?.eightToFourteenDays || 0,
        fifteen_plus_day_users: aggregate.activeDayRanges?.fifteenPlusDays || 0,
      }))
    );
  }

  if (name === 'dimensions.csv') {
    const rows = report.monthly.flatMap((aggregate) => [
      ...Object.entries(aggregate.platformActiveDays || {}).map(([dimensionName, value]) => ({
        activity_month: aggregate.month,
        dimension: 'platform_active_days',
        name: dimensionName,
        value,
      })),
      ...Object.entries(aggregate.versionActiveDays || {}).map(([dimensionName, value]) => ({
        activity_month: aggregate.month,
        dimension: 'version_active_days',
        name: dimensionName,
        value,
      })),
    ]);
    return makeCsv(['activity_month', 'dimension', 'name', 'value'], rows);
  }

  return null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number(value) || 0);
}

function renderDimensionRows(counts) {
  const entries = Object.entries(counts || {});
  const total = entries.reduce((sum, [, value]) => sum + Number(value), 0);
  if (!entries.length) return '<p class="empty">No activity recorded yet.</p>';

  return entries
    .map(([name, value]) => {
      const percentage = total ? (Number(value) / total) * 100 : 0;
      return `
        <div class="dimension">
          <div><span>${escapeHtml(name)}</span><strong>${formatNumber(value)}</strong></div>
          <div class="track"><span style="width:${percentage.toFixed(2)}%"></span></div>
          <small>${percentage.toFixed(1)}% of active-day records</small>
        </div>`;
    })
    .join('');
}

function renderAnalyticsDashboard(report) {
  const current =
    report.monthly.find((aggregate) => aggregate.month === report.currentMonth) ||
    buildMonthAggregate(report.currentMonth);
  const today =
    report.daily.find((row) => row.activityDate === report.currentDate)?.dailyActiveUsers || 0;
  const recentDaily = report.daily.slice(-14).reverse();
  const recentMonthly = report.monthly.slice(-12).reverse();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Seenary engagement reports</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#09090b;color:#f4f4f5}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 85% 0,#241b3d 0,transparent 31rem),#09090b}
    main{width:min(1180px,calc(100% - 32px));margin:auto;padding:48px 0 72px}
    header{display:flex;gap:24px;align-items:end;justify-content:space-between;margin-bottom:28px}
    h1{font-size:clamp(28px,5vw,46px);letter-spacing:-.04em;margin:8px 0}.eyebrow{color:#a78bfa;text-transform:uppercase;letter-spacing:.22em;font-size:12px;font-weight:700}
    .muted,.empty,small{color:#8b8b94}.downloads{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
    a{color:#ddd6fe;text-decoration:none}.button{border:1px solid #ffffff18;background:#ffffff0b;padding:10px 14px;border-radius:12px;font-size:13px;font-weight:650}.button:hover{background:#ffffff14}
    .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card,.panel{border:1px solid #ffffff14;background:#ffffff08;box-shadow:0 18px 60px #0006}
    .card{border-radius:22px;padding:20px}.card span{display:block;color:#9999a3;font-size:12px}.card strong{display:block;font-size:32px;margin-top:12px;letter-spacing:-.04em}
    .grid{display:grid;grid-template-columns:1.25fr .75fr;gap:16px;margin-top:16px}.panel{border-radius:24px;padding:22px;overflow:auto}
    .panel h2{font-size:17px;margin:0 0 18px}.stack{display:grid;gap:16px}
    table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:#8b8b94;font-size:11px;text-transform:uppercase;letter-spacing:.08em}th,td{padding:11px 10px;border-bottom:1px solid #ffffff0d}td:not(:first-child),th:not(:first-child){text-align:right}
    .dimension{margin:0 0 17px}.dimension>div:first-child{display:flex;justify-content:space-between;font-size:13px}.track{height:7px;background:#ffffff10;border-radius:99px;overflow:hidden;margin:8px 0 5px}.track span{display:block;height:100%;background:linear-gradient(90deg,#8b5cf6,#c4b5fd);border-radius:99px}
    footer{margin-top:22px;padding-top:18px;border-top:1px solid #ffffff12;font-size:12px;color:#71717a;display:flex;justify-content:space-between;gap:16px}
    @media(max-width:850px){header{align-items:flex-start;flex-direction:column}.downloads{justify-content:flex-start}.cards{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}}
    @media(max-width:480px){main{width:min(100% - 20px,1180px);padding-top:28px}.cards{grid-template-columns:1fr}.card strong{font-size:27px}}
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <div class="eyebrow">Private analytics</div>
      <h1>Engagement reports</h1>
      <div class="muted">Anonymous, aggregate product signals only · generated ${escapeHtml(report.generatedAt)}</div>
    </div>
    <nav class="downloads" aria-label="Download reports">
      <a class="button" href="/reports/download/overview.csv">Overview CSV</a>
      <a class="button" href="/reports/download/daily.csv">Daily CSV</a>
      <a class="button" href="/reports/download/monthly.csv">Monthly CSV</a>
      <a class="button" href="/reports/download/dimensions.csv">Dimensions CSV</a>
    </nav>
  </header>

  <section class="cards" aria-label="Current overview">
    <article class="card"><span>Active registered accounts · past 14 days</span><strong>${report.overview.unavailable ? '—' : formatNumber(report.overview.observedActiveAccounts)}</strong><small>Sharing-enabled accounts observed from ${escapeHtml(report.overview.startDate)} through ${escapeHtml(report.overview.endDate)}</small></article>
    <article class="card"><span>All registered accounts</span><strong>${formatNumber(report.overview.registeredAccounts)}</strong><small>Every current Seenary account, active or inactive</small></article>
    <article class="card"><span>Active today</span><strong>${formatNumber(today)}</strong><small>UTC ${escapeHtml(report.currentDate)}</small></article>
    <article class="card"><span>Active this month</span><strong>${formatNumber(current.monthlyActiveUsers)}</strong><small>${escapeHtml(report.currentMonth)}</small></article>
  </section>

  <section class="grid">
    <article class="panel">
      <h2>Recent daily activity</h2>
      ${recentDaily.length ? `<table><thead><tr><th>UTC date</th><th>Active users</th></tr></thead><tbody>${recentDaily.map((row) => `<tr><td>${escapeHtml(row.activityDate)}</td><td>${formatNumber(row.dailyActiveUsers)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No activity recorded yet.</p>'}
    </article>
    <div class="stack">
      <article class="panel"><h2>Current platforms</h2>${renderDimensionRows(current.platformActiveDays)}</article>
      <article class="panel"><h2>Current versions</h2>${renderDimensionRows(current.versionActiveDays)}</article>
    </div>
  </section>

  <section class="panel" style="margin-top:16px">
    <h2>Monthly engagement</h2>
    ${recentMonthly.length ? `<table><thead><tr><th>Month</th><th>MAU</th><th>Avg active days</th><th>DAU / MAU</th><th>1 day</th><th>2–3</th><th>4–7</th><th>8–14</th><th>15+</th></tr></thead><tbody>${recentMonthly.map((row) => `<tr><td>${escapeHtml(row.month)}</td><td>${formatNumber(row.monthlyActiveUsers)}</td><td>${formatNumber(row.averageActiveDays, 2)}</td><td>${(Number(row.dauMau || 0) * 100).toFixed(1)}%</td><td>${formatNumber(row.activeDayRanges?.oneDay)}</td><td>${formatNumber(row.activeDayRanges?.twoToThreeDays)}</td><td>${formatNumber(row.activeDayRanges?.fourToSevenDays)}</td><td>${formatNumber(row.activeDayRanges?.eightToFourteenDays)}</td><td>${formatNumber(row.activeDayRanges?.fifteenPlusDays)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No monthly activity recorded yet.</p>'}
  </section>

  <footer>
    <span>Only users who explicitly enabled anonymous statistics can be observed.</span>
    <span>No raw records, usernames, IP addresses, titles, or searches are shown.</span>
  </footer>
</main>
</body>
</html>`;
}

function sendReportResponse(res, status, contentType, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store, private',
    'Content-Type': contentType,
    'X-Robots-Tag': 'noindex, nofollow',
    ...extraHeaders,
  });
  res.end(body);
}

function handleAnalyticsReportRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (
    req.method !== 'GET' ||
    (requestUrl.pathname !== REPORT_PREFIX &&
      requestUrl.pathname !== `${REPORT_PREFIX}/` &&
      !requestUrl.pathname.startsWith(`${REPORT_PREFIX}/download/`))
  ) {
    return false;
  }

  const credentials = getReportCredentials();
  if (!credentials.configured) {
    sendReportResponse(res, 404, 'text/plain; charset=utf-8', 'Not found.');
    return true;
  }

  if (!isReportAuthorized(req, credentials)) {
    sendReportResponse(
      res,
      401,
      'text/plain; charset=utf-8',
      'Authentication required.',
      { 'WWW-Authenticate': 'Basic realm="Seenary Analytics", charset="UTF-8"' }
    );
    return true;
  }

  try {
    const report = buildAnalyticsReport();
    if (requestUrl.pathname === REPORT_PREFIX || requestUrl.pathname === `${REPORT_PREFIX}/`) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      );
      sendReportResponse(
        res,
        200,
        'text/html; charset=utf-8',
        renderAnalyticsDashboard(report)
      );
      return true;
    }

    const fileName = requestUrl.pathname.slice(`${REPORT_PREFIX}/download/`.length);
    const csv = getReportCsv(report, fileName);
    if (csv === null) {
      sendReportResponse(res, 404, 'text/plain; charset=utf-8', 'Report not found.');
      return true;
    }

    sendReportResponse(res, 200, 'text/csv; charset=utf-8', csv, {
      'Content-Disposition': `attachment; filename="seenary-${fileName}"`,
    });
  } catch (error) {
    console.error('Analytics report error:', error);
    sendReportResponse(
      res,
      500,
      'text/plain; charset=utf-8',
      'The analytics report could not be generated.'
    );
  }
  return true;
}

module.exports = {
  buildAnalyticsReport,
  getReportCredentials,
  getReportCsv,
  handleAnalyticsReportRequest,
  isReportAuthorized,
  renderAnalyticsDashboard,
};
