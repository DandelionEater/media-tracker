const fs = require('fs');
const path = require('path');

const {
  buildMonthAggregate,
  finalizeClosedMonths,
  getFinalizedAggregates,
  getRollingActiveAccounts,
  pruneFinalizedDailyRows,
} = require('../engagementAnalytics');
const { db } = require('../db');

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, columns, rows) {
  const lines = [
    columns.map(csvCell).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function flattenCounts(prefix, counts) {
  return Object.entries(counts || {}).map(([name, value]) => ({
    dimension: prefix,
    name,
    value,
  }));
}

const outputDirectory = path.resolve(
  process.argv[2] || path.join(path.dirname(require('../db').dbPath), 'analytics-exports')
);
fs.mkdirSync(outputDirectory, { recursive: true });

finalizeClosedMonths();
const prunedRows = pruneFinalizedDailyRows();

const dailyRows = db
  .prepare(
    `
    SELECT
      activity_date,
      COUNT(DISTINCT monthly_key) AS daily_active_users
    FROM engagement_daily_activity
    GROUP BY activity_date
    ORDER BY activity_date
  `
  )
  .all();
writeCsv(
  path.join(outputDirectory, 'engagement-daily.csv'),
  ['activity_date', 'daily_active_users'],
  dailyRows
);

const rollingActivity = getRollingActiveAccounts({ days: 14 });
writeCsv(
  path.join(outputDirectory, 'engagement-overview.csv'),
  [
    'window_days',
    'window_start_date',
    'window_end_date',
    'observed_active_registered_accounts',
    'total_registered_accounts',
  ],
  [
    {
      window_days: rollingActivity.days,
      window_start_date: rollingActivity.startDate,
      window_end_date: rollingActivity.endDate,
      observed_active_registered_accounts: rollingActivity.unavailable
        ? 'unavailable'
        : rollingActivity.observedActiveAccounts,
      total_registered_accounts: rollingActivity.registeredAccounts,
    },
  ]
);

const currentMonth = new Date().toISOString().slice(0, 7);
const aggregates = [
  ...getFinalizedAggregates(),
  buildMonthAggregate(currentMonth),
];
const monthlyRows = aggregates.map((aggregate) => ({
  activity_month: aggregate.month,
  monthly_active_users: aggregate.monthlyActiveUsers,
  average_active_days: Number(aggregate.averageActiveDays || 0).toFixed(4),
  dau_mau: Number(aggregate.dauMau || 0).toFixed(4),
  one_day_users: aggregate.activeDayRanges?.oneDay || 0,
  two_to_three_day_users: aggregate.activeDayRanges?.twoToThreeDays || 0,
  four_to_seven_day_users: aggregate.activeDayRanges?.fourToSevenDays || 0,
  eight_to_fourteen_day_users: aggregate.activeDayRanges?.eightToFourteenDays || 0,
  fifteen_plus_day_users: aggregate.activeDayRanges?.fifteenPlusDays || 0,
}));
writeCsv(
  path.join(outputDirectory, 'engagement-monthly.csv'),
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
  monthlyRows
);

const dimensionRows = aggregates.flatMap((aggregate) => [
  ...flattenCounts('platform_active_days', aggregate.platformActiveDays),
  ...flattenCounts('version_active_days', aggregate.versionActiveDays),
].map((row) => ({ activity_month: aggregate.month, ...row })));
writeCsv(
  path.join(outputDirectory, 'engagement-dimensions.csv'),
  ['activity_month', 'dimension', 'name', 'value'],
  dimensionRows
);

console.log(`Private engagement analytics exported to ${outputDirectory}`);
console.log(`Pruned ${prunedRows} finalized daily row(s) beyond the correction window.`);
