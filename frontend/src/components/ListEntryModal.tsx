import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  HeartIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";

type ListEntryModalProps = {
  animeId: number;
  isOpen: boolean;
  entry: any | null;
  title?: string;
  totalEpisodes?: number | null;
  onClose: () => void;
  onSaved: (entry: any) => void;
  onRemoved: () => void;
};

const STATUS_OPTIONS = ["planned", "watching", "completed", "paused", "dropped"];

const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
};

let openListEntryModalCount = 0;

function updateModalOpenClass(delta: 1 | -1) {
  openListEntryModalCount = Math.max(0, openListEntryModalCount + delta);
  document.body.classList.toggle("modal-open", openListEntryModalCount > 0);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateFromInputValue(value: string) {
  if (!value) return new Date();

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function toDateInputValue(value: unknown) {
  if (!value) return "";

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function ListEntryModal({
  animeId,
  isOpen,
  entry,
  title,
  totalEpisodes,
  onClose,
  onSaved,
  onRemoved,
}: ListEntryModalProps) {
  const [status, setStatus] = useState("planned");
  const [isFavorite, setIsFavorite] = useState(false);
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState("");
  const [notes, setNotes] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [isRewatching, setIsRewatching] = useState(false);
  const [repeatCount, setRepeatCount] = useState(0);
  const [openDatePicker, setOpenDatePicker] = useState<"startedAt" | "completedAt" | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    updateModalOpenClass(1);

    return () => updateModalOpenClass(-1);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setStatus(entry?.status ?? "planned");
    setIsFavorite(Boolean(entry?.is_favorite));
    setProgress(entry?.progress ?? 0);
    setScore(entry?.score != null ? String(entry.score) : "");
    setNotes(entry?.notes ?? "");
    setStartedAt(toDateInputValue(entry?.started_at));
    setCompletedAt(toDateInputValue(entry?.completed_at));
    setIsRewatching(Boolean(entry?.is_rewatching));
    setRepeatCount(Math.max(0, Number(entry?.repeat_count ?? 0)));
    setMessage(null);
  }, [isOpen, entry]);

  if (!isOpen) return null;

  const clampedProgress =
    totalEpisodes && totalEpisodes > 0
      ? Math.max(0, Math.min(progress, totalEpisodes))
      : Math.max(0, progress);

  const progressPercent =
    totalEpisodes && totalEpisodes > 0
      ? Math.round((clampedProgress / totalEpisodes) * 100)
      : null;

  const markCompleted = () => {
    setStatus("completed");

    if (totalEpisodes && totalEpisodes > 0) {
      setProgress(totalEpisodes);
    }

    setStartedAt((current) => current || todayDate());
    setCompletedAt((current) => current || todayDate());

    if (isRewatching) {
      setRepeatCount((current) => current + 1);
      setIsRewatching(false);
    }
  };

  const startRewatch = () => {
    setIsRewatching(true);
    setStatus("watching");
    setProgress(0);
    setStartedAt(todayDate());
    setCompletedAt("");
  };

  const stopRewatch = () => {
    setIsRewatching(false);
  };

  async function handleSave() {
    if (busy) return;

    try {
      setBusy(true);
      setMessage(null);

      const finalProgress =
        status === "completed" && totalEpisodes && totalEpisodes > 0
          ? totalEpisodes
          : clampedProgress;

      const finishingActiveRewatch = isRewatching && status === "completed";
      const finalRepeatCount = repeatCount + (finishingActiveRewatch ? 1 : 0);

      const result = await window.api.saveMyListEntry(animeId, {
        status,
        isFavorite,
        progress: finalProgress,
        score: score.trim() === "" ? null : Number(score),
        notes: notes.trim() || null,
        startedAt: startedAt || null,
        completedAt: completedAt || null,
        isRewatching: finishingActiveRewatch ? false : isRewatching,
        repeatCount: finalRepeatCount,
      });

      if (!result.ok || !result.entry) {
        setMessage(result.message);
        return;
      }

      setMessage(result.message);
      onSaved(result.entry);
      onClose();
    } catch (error) {
      console.error(error);
      setMessage("Failed to save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (busy) return;

    try {
      setBusy(true);
      setMessage(null);

      const result = await window.api.removeMyListEntry(animeId);

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      onRemoved();
      onClose();
    } catch (error) {
      console.error(error);
      setMessage("Failed to remove entry.");
    } finally {
      setBusy(false);
    }
  }

  function chooseStatus(nextStatus: string) {
    if (nextStatus === "watching") {
      setStartedAt((current) => current || todayDate());
      setCompletedAt("");
    }

    if (nextStatus === "completed") {
      markCompleted();
      return;
    }

    if (nextStatus !== "completed") {
      setCompletedAt("");
    }

    setStatus(nextStatus);
  }

  function updateProgress(nextProgress: number) {
    const nextValue =
      totalEpisodes && totalEpisodes > 0
        ? Math.max(0, Math.min(nextProgress, totalEpisodes))
        : Math.max(0, nextProgress);

    setProgress(nextValue);

    if (totalEpisodes && totalEpisodes > 0 && nextValue >= totalEpisodes) {
      markCompleted();
    } else if (status === "planned" && nextValue > 0) {
      setStatus("watching");
      setStartedAt((current) => current || todayDate());
    }
  }

  return (
    <div className="absolute inset-0 z-80 flex items-center justify-center bg-black/50 px-6 py-4 backdrop-blur-sm">
      <div className="flex h-[calc(100vh-32px)] max-h-[900px] w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-[#111111]/95 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/35">
              List Entry
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Edit tracker entry
            </h2>
            {title && <p className="mt-2 text-sm text-white/55">{title}</p>}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
            title="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="scroll-container flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Favorite</p>
                <p className="mt-1 text-sm text-white/45">
                  Pin this title to the top of its segment.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsFavorite((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                  isFavorite
                    ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                    : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                }`}
              >
                {isFavorite ? (
                  <HeartIconSolid className="h-4 w-4" />
                ) : (
                  <HeartIcon className="h-4 w-4" />
                )}
                {isFavorite ? "Favorited" : "Favorite"}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">Rewatching</p>
                  <p className="mt-1 text-sm text-white/45">
                    Starts from episode 0 and counts on completion.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={isRewatching ? stopRewatch : startRewatch}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                    isRewatching
                      ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                      : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  {isRewatching ? "Active" : "Start"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/65">Status</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => chooseStatus(option)}
                  className={`rounded-2xl border px-3 py-2.5 text-sm transition ${
                    status === option
                      ? "border-white/20 bg-white text-black"
                      : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {STATUS_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <label className="block text-sm text-white/65">Progress</label>
              <span className="text-sm text-white/35">
                {clampedProgress}
                {totalEpisodes ? ` / ${totalEpisodes}` : ""}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateProgress(clampedProgress - 1)}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
                title="Decrease progress"
              >
                <MinusIcon className="h-4 w-4" />
              </button>

              <input
                type="number"
                min={0}
                max={totalEpisodes ?? undefined}
                value={progress}
                onChange={(event) => updateProgress(Number(event.target.value))}
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />

              <button
                type="button"
                onClick={() => updateProgress(clampedProgress + 1)}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
                title="Increase progress"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>

            {progressPercent !== null && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white/70"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <DatePickerField
              id="startedAt"
              label="Start date"
              value={startedAt}
              open={openDatePicker === "startedAt"}
              onOpenChange={(open) => setOpenDatePicker(open ? "startedAt" : null)}
              onChange={setStartedAt}
            />

            <DatePickerField
              id="completedAt"
              label="End date"
              value={completedAt}
              open={openDatePicker === "completedAt"}
              onOpenChange={(open) => setOpenDatePicker(open ? "completedAt" : null)}
              onChange={setCompletedAt}
            />

            <label className="block">
              <span className="mb-2 block text-sm text-white/65">Total rewatches</span>
              <input
                type="number"
                min={0}
                value={repeatCount}
                onChange={(event) =>
                  setRepeatCount(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                }
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <label className="block text-sm text-white/65">Score</label>
              <span className="text-sm text-white/35">0-10</span>
            </div>

            <div className="relative">
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={score}
                onChange={(event) => setScore(event.target.value)}
                placeholder="Optional"
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 pr-12 text-white outline-none placeholder:text-white/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />

              {score.trim() && (
                <button
                  type="button"
                  onClick={() => setScore("")}
                  className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
                  title="Clear score"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex min-h-[150px] flex-1 flex-col">
            <label className="mb-2 block text-sm text-white/65">Notes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes..."
              className="min-h-0 flex-1 resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-white/25"
            />
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
            {message}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-sm text-red-200 transition hover:bg-red-500/15 disabled:opacity-50"
          >
            <TrashIcon className="h-4 w-4" />
            Remove
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-50 sm:flex-none"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 sm:flex-none"
            >
              <CheckCircleIcon className="h-4 w-4" />
              {busy ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DatePickerField({
  id,
  label,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => dateFromInputValue(value));

  useEffect(() => {
    if (value) {
      setVisibleMonth(dateFromInputValue(value));
    }
  }, [value]);

  const selectedDate = value ? dateFromInputValue(value) : null;
  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const days = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = new Date(year, month, 1 - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  function moveMonth(offset: number) {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  }

  function selectDate(date: Date) {
    onChange(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`
    );
    onOpenChange(false);
  }

  return (
    <div className="relative">
      <span className="mb-2 flex items-center gap-2 text-sm text-white/65">
        <CalendarDaysIcon className="h-4 w-4" />
        {label}
      </span>

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 text-left text-white outline-none transition hover:border-white/20 hover:bg-white/[0.04]"
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
      >
        <span className={value ? "text-white" : "text-white/30"}>
          {value || "Pick date"}
        </span>
        <CalendarDaysIcon className="h-4 w-4 text-white/45" />
      </button>

      {open && (
        <div
          id={`${id}-calendar`}
          className="absolute left-0 top-full z-90 mt-2 w-72 rounded-3xl border border-white/10 bg-[#151515]/98 p-3 shadow-2xl backdrop-blur-md"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Prev
            </button>
            <p className="text-sm font-semibold text-white">{monthLabel}</p>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase text-white/35">
            {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((date) => {
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected =
                selectedDate &&
                date.getFullYear() === selectedDate.getFullYear() &&
                date.getMonth() === selectedDate.getMonth() &&
                date.getDate() === selectedDate.getDate();

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => selectDate(date)}
                  className={`h-8 rounded-xl text-sm transition ${
                    isSelected
                      ? "bg-white font-semibold text-black"
                      : isCurrentMonth
                        ? "text-white/75 hover:bg-white/10 hover:text-white"
                        : "text-white/25 hover:bg-white/5"
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                onOpenChange(false);
              }}
              className="rounded-xl px-3 py-2 text-sm text-white/45 transition hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => selectDate(new Date())}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
