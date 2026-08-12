import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type FocusEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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

const VIEWPORT_GUTTER = 8;
const TOOLTIP_GAP = 8;

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
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  const wrapperRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const isVisible = isHovered || hasKeyboardFocus;

  const updatePosition = useCallback(() => {
    const wrapper = wrapperRef.current;
    const tooltip = tooltipRef.current;

    if (!wrapper || !tooltip) return;

    const anchorRect = wrapper.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const spaceAbove = anchorRect.top - TOOLTIP_GAP - VIEWPORT_GUTTER;
    const spaceBelow =
      window.innerHeight - anchorRect.bottom - TOOLTIP_GAP - VIEWPORT_GUTTER;
    const resolvedPlacement =
      placement === "top" && tooltipRect.height > spaceAbove && spaceBelow > spaceAbove
        ? "bottom"
        : placement === "bottom" &&
            tooltipRect.height > spaceBelow &&
            spaceAbove > spaceBelow
          ? "top"
          : placement;

    let left =
      align === "start"
        ? anchorRect.left
        : align === "end"
          ? anchorRect.right - tooltipRect.width
          : anchorRect.left + (anchorRect.width - tooltipRect.width) / 2;
    const top =
      resolvedPlacement === "top"
        ? anchorRect.top - tooltipRect.height - TOOLTIP_GAP
        : anchorRect.bottom + TOOLTIP_GAP;

    left = Math.min(
      window.innerWidth - tooltipRect.width - VIEWPORT_GUTTER,
      Math.max(VIEWPORT_GUTTER, left),
    );

    setPosition({
      left,
      top: Math.min(
        window.innerHeight - tooltipRect.height - VIEWPORT_GUTTER,
        Math.max(VIEWPORT_GUTTER, top),
      ),
      ready: true,
    });
  }, [align, placement]);

  useLayoutEffect(() => {
    if (!isVisible) {
      setPosition((current) =>
        current.ready ? { ...current, ready: false } : current,
      );
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isVisible, updatePosition]);

  return (
    <Wrapper
      ref={wrapperRef}
      className={`group/tooltip inline-flex ${positioned ? "" : "relative"} ${className}`}
      tabIndex={focusable ? 0 : undefined}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onFocusCapture={(event: FocusEvent<HTMLElement>) => {
        setHasKeyboardFocus(
          event.target instanceof HTMLElement &&
            event.target.matches(":focus-visible"),
        );
      }}
      onBlurCapture={() => setHasKeyboardFocus(false)}
      onPointerDownCapture={() => setHasKeyboardFocus(false)}
    >
      {children}
      {isVisible &&
        createPortal(
          <span
            ref={tooltipRef}
            role="tooltip"
            className="pointer-events-none fixed z-[1000] w-max max-w-72 rounded-xl border border-white/15 bg-[#171717] px-3 py-2 text-center text-xs font-medium normal-case leading-4 tracking-normal text-white/85 shadow-2xl"
            style={{
              left: position.left,
              top: position.top,
              visibility: position.ready ? "visible" : "hidden",
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </Wrapper>
  );
}
