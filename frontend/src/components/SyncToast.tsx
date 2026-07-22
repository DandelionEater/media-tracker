import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "./ui/Tooltip";

export type SyncToastState = {
  id: number;
  kind: "success" | "error" | "warning";
  title: string;
  message: string;
} | null;

type SyncToastProps = {
  toast: SyncToastState;
  onDismiss: () => void;
};

const DISMISS_DISTANCE_PX = 72;

export function SyncToast({ toast, onDismiss }: SyncToastProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const dragStartXRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const activePointerRef = useRef<number | null>(null);

  if (!toast) {
    return null;
  }

  function dismiss(direction: -1 | 1) {
    setIsDragging(false);
    setIsDismissing(true);
    const exitOffset = direction * Math.max(window.innerWidth, 520);
    dragOffsetRef.current = exitOffset;
    setDragOffset(exitOffset);
    window.setTimeout(onDismiss, 180);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || isDismissing) return;
    activePointerRef.current = event.pointerId;
    dragStartXRef.current = event.clientX - dragOffsetRef.current;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDragging || activePointerRef.current !== event.pointerId) return;
    const nextOffset = event.clientX - dragStartXRef.current;
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    setIsDragging(false);
    if (Math.abs(dragOffsetRef.current) >= DISMISS_DISTANCE_PX) {
      dismiss(dragOffsetRef.current < 0 ? -1 : 1);
    } else {
      dragOffsetRef.current = 0;
      setDragOffset(0);
    }
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
      <div
        className={`pointer-events-auto flex touch-pan-y select-none items-center gap-4 rounded-2xl border border-white/10 bg-[#141414]/95 px-4 py-3 text-white shadow-2xl backdrop-blur-md ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          opacity: Math.max(0.28, 1 - Math.abs(dragOffset) / 260),
          transform: `translateX(${dragOffset}px) rotate(${dragOffset / 80}deg)`,
          transition: isDragging ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
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

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{toast.title}</p>
          <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-white/60">
            {toast.message}
          </p>
        </div>

        <Tooltip content="Dismiss notification">
        <button
          type="button"
          aria-label={`Dismiss ${toast.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            dismiss(1);
          }}
          className="-mr-1 shrink-0 cursor-pointer rounded-full p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/45"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
        </Tooltip>
      </div>
    </div>
  );
}
