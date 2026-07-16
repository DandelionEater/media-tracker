import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { formatLocalDate } from "../utils/dateFormat";

type DesktopUpdateInfo = {
  version: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseDate?: string | null;
};

type UpdateModalProps = {
  info: DesktopUpdateInfo;
  status: "available" | "downloading" | "downloaded" | "error";
  progress: number;
  errorMessage?: string | null;
  onDownload: () => void;
  onInstall: () => void;
  onRemindLater: () => void;
};

export function UpdateModal({
  info,
  status,
  progress,
  errorMessage,
  onDownload,
  onInstall,
  onRemindLater,
}: UpdateModalProps) {
  const isDownloading = status === "downloading";
  const isDownloaded = status === "downloaded";
  const releaseNoteBlocks = parseReleaseNotes(info.releaseNotes);

  return (
    <div className="no-drag absolute inset-0 z-[80] flex items-center justify-center bg-black/82 px-5">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#121212] text-white shadow-2xl">
        <div className="border-b border-white/10 bg-white/[0.04] px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--app-accent-soft)] text-white/85">
              {isDownloaded ? (
                <CheckCircleIcon className="h-7 w-7" />
              ) : (
                <ArrowDownTrayIcon className="h-7 w-7" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
                Desktop update
              </p>
              <h2 className="mt-2 text-2xl font-bold leading-tight text-white">
                {isDownloaded ? "Update ready" : "New version available"}
              </h2>
              <p className="mt-2 text-sm text-white/55">
                {info.releaseName || `Seenary ${info.version}`}{" "}
                {info.version ? (
                  <span className="text-white/35">({info.version})</span>
                ) : null}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">Changelog</p>
              {info.releaseDate && (
                <p className="text-xs text-white/35">
                  {formatLocalDate(info.releaseDate)}
                </p>
              )}
            </div>

            {releaseNoteBlocks.length ? (
              <div className="scroll-container max-h-56 space-y-4 overflow-y-auto pr-1">
                {releaseNoteBlocks.map((block, index) => {
                  if (block.type === "heading") {
                    return (
                      <p
                        key={`${block.type}-${block.text}-${index}`}
                        className="text-xs font-semibold uppercase tracking-[0.2em] text-white/38"
                      >
                        {block.text}
                      </p>
                    );
                  }

                  if (block.type === "bullet") {
                    return (
                      <div
                        key={`${block.type}-${block.text}-${index}`}
                        className="flex gap-2 text-sm leading-6 text-white/62"
                      >
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--app-accent)]" />
                        <span>{block.text}</span>
                      </div>
                    );
                  }

                  return (
                    <p
                      key={`${block.type}-${block.text}-${index}`}
                      className="text-sm leading-6 text-white/55"
                    >
                      {block.text}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm leading-6 text-white/45">
                Release notes are not attached to this build yet.
              </p>
            )}
          </div>

          {(isDownloading || isDownloaded) && (
            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-white/45">
                <span>{isDownloaded ? "Downloaded" : "Downloading"}</span>
                <span>{Math.max(0, Math.min(100, progress))}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--app-accent)] transition-all duration-300"
                  style={{ width: `${isDownloaded ? 100 : Math.max(4, progress)}%` }}
                />
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100/90">
              {errorMessage || "Seenary could not finish the update."}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onRemindLater}
              disabled={isDownloading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ClockIcon className="h-4 w-4" />
              Remind me later
            </button>

            {isDownloaded ? (
              <button
                type="button"
                onClick={onInstall}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
              >
                <CheckCircleIcon className="h-4 w-4" />
                Install and restart
              </button>
            ) : (
              <button
                type="button"
                onClick={onDownload}
                disabled={isDownloading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDownloading ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDownTrayIcon className="h-4 w-4" />
                )}
                {isDownloading ? "Downloading..." : "Download update"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type ReleaseNoteBlock = {
  type: "heading" | "bullet" | "paragraph";
  text: string;
};

function parseReleaseNotes(releaseNotes?: string): ReleaseNoteBlock[] {
  return String(releaseNotes || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^tag:\s*/i.test(line))
    .map((line) => {
      if (/^#{1,6}\s+/.test(line)) {
        return {
          type: "heading",
          text: line.replace(/^#{1,6}\s+/, ""),
        };
      }

      if (/^[-*]\s+/.test(line)) {
        return {
          type: "bullet",
          text: line.replace(/^[-*]\s+/, ""),
        };
      }

      return {
        type: "paragraph",
        text: line,
      };
    });
}
