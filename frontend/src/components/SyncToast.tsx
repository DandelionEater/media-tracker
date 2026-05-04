import { CheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export type SyncToastState = {
  id: number;
  kind: "success" | "error" | "warning";
  title: string;
  message: string;
} | null;

type SyncToastProps = {
  toast: SyncToastState;
};

export function SyncToast({ toast }: SyncToastProps) {
  if (!toast) {
    return null;
  }

  const isSuccess = toast.kind === "success";
  const isError = toast.kind === "error";
  const Icon = isSuccess ? CheckIcon : ExclamationTriangleIcon;

  return (
    <div
      key={toast.id}
      className="no-drag pointer-events-none absolute right-5 top-20 z-50 max-w-[min(420px,calc(100vw-40px))] animate-sync-toast-in"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-white/10 bg-[#141414]/95 px-4 py-3 text-white shadow-2xl backdrop-blur-md">
        <div className="relative grid h-11 w-11 shrink-0 place-items-center">
          <span
            className={`absolute inset-0 rounded-full border-2 ${
              isSuccess
                ? "border-emerald-300/25"
                : isError
                  ? "border-rose-300/25"
                  : "border-amber-300/25"
            }`}
          />
          <span
            className={`absolute inset-0 rounded-full border-2 border-transparent animate-sync-ring ${
              isSuccess
                ? "border-t-emerald-300 border-r-emerald-300"
                : isError
                  ? "border-t-rose-300 border-r-rose-300"
                  : "border-t-amber-300 border-r-amber-300"
            }`}
          />
          <span
            className={`grid h-7 w-7 place-items-center rounded-full ${
              isSuccess
                ? "bg-emerald-300 text-black"
                : isError
                  ? "bg-rose-300 text-black"
                  : "bg-amber-300 text-black"
            }`}
          >
            <Icon className="h-4 w-4 stroke-[2.4]" />
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{toast.title}</p>
          <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-white/60">
            {toast.message}
          </p>
        </div>
      </div>
    </div>
  );
}
