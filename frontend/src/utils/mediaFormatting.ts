import type { ListStatus, MediaType } from "../types/domain";

const LIST_STATUS_LABELS: Record<ListStatus, string> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
};

export const LIST_STATUS_ORDER: ListStatus[] = [
  "planned",
  "watching",
  "completed",
  "paused",
  "dropped",
];

export function getListStatusLabel(status: ListStatus, mediaType: MediaType = "ANIME") {
  if (mediaType === "MANGA" && status === "watching") return "Reading";
  if (mediaType === "MANGA" && status === "planned") return "Plan to Read";
  return LIST_STATUS_LABELS[status];
}

export function formatEnum(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}

export function formatScore10(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
