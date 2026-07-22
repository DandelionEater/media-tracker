import type { ElementType, ReactNode } from "react";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  placement?: "top" | "bottom";
  align?: "start" | "center" | "end";
  as?: ElementType;
  focusable?: boolean;
  positioned?: boolean;
};

const PLACEMENT_CLASSES = {
  top: "bottom-[calc(100%+0.5rem)] translate-y-1 group-hover/tooltip:translate-y-0 group-focus-within/tooltip:translate-y-0",
  bottom:
    "top-[calc(100%+0.5rem)] -translate-y-1 group-hover/tooltip:translate-y-0 group-focus-within/tooltip:translate-y-0",
};

const ALIGNMENT_CLASSES = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

export function Tooltip({
  content,
  children,
  className = "",
  placement = "top",
  align = "center",
  as: Wrapper = "span",
  focusable = false,
  positioned = false,
}: TooltipProps) {
  return (
    <Wrapper
      className={`group/tooltip inline-flex ${positioned ? "" : "relative"} ${className}`}
      tabIndex={focusable ? 0 : undefined}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 w-max max-w-72 rounded-xl border border-white/15 bg-[#171717] px-3 py-2 text-center text-xs font-medium normal-case leading-4 tracking-normal text-white/85 opacity-0 shadow-2xl transition duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${PLACEMENT_CLASSES[placement]} ${ALIGNMENT_CLASSES[align]}`}
      >
        {content}
      </span>
    </Wrapper>
  );
}
