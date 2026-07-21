import type { ComponentType, SVGProps } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

type AsyncStatePanelProps = {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  message?: string;
  busy?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
};

export function AsyncStatePanel({
  icon: Icon,
  title,
  message,
  busy = false,
  actionLabel,
  onAction,
  compact = false,
}: AsyncStatePanelProps) {
  if (compact) {
    return (
      <div className="flex min-h-72 items-center justify-center text-white/55" aria-busy={busy}>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
          {busy ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : Icon ? <Icon className="h-5 w-5" /> : null}
          <span className="text-sm">{title}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-72 items-center justify-center px-6 text-center text-white/70" aria-busy={busy}>
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-xl">
        {(Icon || busy) && (
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/55">
            {Icon ? <Icon className="h-6 w-6" /> : busy ? <ArrowPathIcon className="h-6 w-6 animate-spin" /> : null}
          </div>
        )}
        <h2 className="mt-5 text-lg font-semibold text-white">{title}</h2>
        {message && <p className="mx-auto mt-2 text-sm leading-6 text-white/45">{message}</p>}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            disabled={busy}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/55 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
