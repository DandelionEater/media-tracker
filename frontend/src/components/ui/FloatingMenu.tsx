import type { ReactNode } from "react";

export function FloatingMenu({
  open,
  children,
  widthClass = "w-48",
  className = "",
  role = "menu",
}: {
  open: boolean;
  children: ReactNode;
  widthClass?: string;
  className?: string;
  role?: "menu" | "dialog";
}) {
  return (
    <div
      role={role}
      aria-hidden={!open}
      className={`absolute right-0 top-full mt-2 ${widthClass} rounded-2xl border border-white/10 bg-[#111111]/95 p-2 shadow-2xl backdrop-blur-md transition-all duration-200 ${open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1.5 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}
