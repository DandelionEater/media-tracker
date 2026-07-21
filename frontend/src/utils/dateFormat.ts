type DateInput = string | number | Date | null | undefined;
type WindowsRegionalFormat = NonNullable<typeof window.systemLocale>["regionalFormat"];

const SQL_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const ISO_WITHOUT_ZONE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WINDOWS_DATE_PATTERN_CHARS = new Set(["d", "M", "y"]);
const WINDOWS_TIME_PATTERN_CHARS = new Set(["h", "H", "m", "s", "t"]);

function getUserLocales() {
  const systemLocales = window.systemLocale?.locales?.filter(Boolean);

  if (systemLocales?.length) {
    return systemLocales;
  }

  if (window.systemLocale?.locale) {
    return window.systemLocale.locale;
  }

  if (typeof navigator === "undefined") {
    return undefined;
  }

  return navigator.languages?.length ? navigator.languages : navigator.language;
}

function getWindowsRegionalFormat() {
  const regionalFormat = window.systemLocale?.regionalFormat;

  if (!regionalFormat?.shortDate && !regionalFormat?.shortTime) {
    return null;
  }

  return regionalFormat;
}

function pad(value: number, size = 2) {
  return String(value).padStart(size, "0");
}

function formatName(
  date: Date,
  value: "month" | "weekday",
  width: "short" | "long",
  locales = getUserLocales()
) {
  return new Intl.DateTimeFormat(locales, { [value]: width }).format(date);
}

function formatWindowsToken(date: Date, token: string, format: WindowsRegionalFormat) {
  const char = token[0];
  const length = token.length;
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;

  switch (char) {
    case "d":
      if (length <= 2) {
        return length === 2 ? pad(date.getDate()) : String(date.getDate());
      }

      return formatName(date, "weekday", length === 3 ? "short" : "long");
    case "M":
      if (length <= 2) {
        const month = date.getMonth() + 1;
        return length === 2 ? pad(month) : String(month);
      }

      return formatName(date, "month", length === 3 ? "short" : "long");
    case "y":
      return length <= 2 ? pad(date.getFullYear() % 100) : String(date.getFullYear());
    case "H":
      return length === 2 ? pad(hours24) : String(hours24);
    case "h":
      return length === 2 ? pad(hours12) : String(hours12);
    case "m":
      return length === 2 ? pad(date.getMinutes()) : String(date.getMinutes());
    case "s":
      return length === 2 ? pad(date.getSeconds()) : String(date.getSeconds());
    case "t":
      if (length === 1) {
        return hours24 < 12
          ? (format?.amDesignator || "AM").charAt(0)
          : (format?.pmDesignator || "PM").charAt(0);
      }

      return hours24 < 12 ? format?.amDesignator || "AM" : format?.pmDesignator || "PM";
    default:
      return token;
  }
}

function formatWindowsPattern(
  date: Date,
  pattern: string,
  patternChars: Set<string>,
  format: WindowsRegionalFormat
) {
  let result = "";
  let index = 0;

  while (index < pattern.length) {
    const char = pattern[index];

    if (char === "'") {
      const endIndex = pattern.indexOf("'", index + 1);

      if (endIndex === -1) {
        result += char;
        index += 1;
      } else {
        result += pattern.slice(index + 1, endIndex);
        index = endIndex + 1;
      }

      continue;
    }

    if (patternChars.has(char)) {
      let nextIndex = index + 1;

      while (pattern[nextIndex] === char) {
        nextIndex += 1;
      }

      result += formatWindowsToken(date, pattern.slice(index, nextIndex), format);
      index = nextIndex;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function formatWindowsDate(date: Date, format: WindowsRegionalFormat) {
  if (!format?.shortDate) {
    return null;
  }

  return formatWindowsPattern(date, format.shortDate, WINDOWS_DATE_PATTERN_CHARS, format);
}

function formatWindowsTime(date: Date, format: WindowsRegionalFormat) {
  if (!format?.shortTime) {
    return null;
  }

  return formatWindowsPattern(date, format.shortTime, WINDOWS_TIME_PATTERN_CHARS, format);
}

function parseAppDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const trimmedValue = value.trim();
  const dateOnlyMatch = trimmedValue.match(DATE_ONLY_PATTERN);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const normalizedValue =
    SQL_UTC_TIMESTAMP_PATTERN.test(trimmedValue) ||
    ISO_WITHOUT_ZONE_PATTERN.test(trimmedValue)
      ? `${trimmedValue.replace(" ", "T")}Z`
      : trimmedValue;
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalDate(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  fallback = "-"
) {
  const date = parseAppDate(value);

  if (!date) {
    return typeof value === "string" && value ? value : fallback;
  }

  const windowsFormat = getWindowsRegionalFormat();
  const windowsDate = windowsFormat ? formatWindowsDate(date, windowsFormat) : null;

  if (windowsDate) {
    return windowsDate;
  }

  return new Intl.DateTimeFormat(getUserLocales(), options).format(date);
}

export function formatLocalDateTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" },
  fallback = "-"
) {
  const date = parseAppDate(value);

  if (!date) {
    return typeof value === "string" && value ? value : fallback;
  }

  const windowsFormat = getWindowsRegionalFormat();
  const windowsDate = windowsFormat ? formatWindowsDate(date, windowsFormat) : null;
  const windowsTime = windowsFormat ? formatWindowsTime(date, windowsFormat) : null;

  if (windowsDate && windowsTime) {
    return `${windowsDate}, ${windowsTime}`;
  }

  return new Intl.DateTimeFormat(getUserLocales(), options).format(date);
}
