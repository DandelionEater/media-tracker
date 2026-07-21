import { useEffect, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

export function ModalShell({
  open = true,
  onClose,
  ariaLabel,
  children,
  panelClassName = "max-w-lg p-6",
  zClassName = "z-50",
  closeOnBackdrop = true,
  showCloseButton = false,
}: {
  open?: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  panelClassName?: string;
  zClassName?: string;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className={`fixed inset-0 ${zClassName} flex items-center justify-center px-6 py-10`} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button type="button" aria-label={`Close ${ariaLabel}`} onClick={closeOnBackdrop ? onClose : undefined} className="absolute inset-0 bg-black/82" />
      <div className={`relative z-10 w-full rounded-3xl border border-white/10 bg-[#111111]/95 shadow-2xl ${panelClassName}`}>
        {showCloseButton && <button type="button" onClick={onClose} aria-label={`Close ${ariaLabel}`} className="absolute right-5 top-5 rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-white/60 transition hover:bg-white/8 hover:text-white"><XMarkIcon className="h-5 w-5" /></button>}
        {children}
      </div>
    </div>
  );
}
