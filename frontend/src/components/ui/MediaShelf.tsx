import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode, type SVGProps } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

export function MediaShelf<T>({
  title,
  icon: Icon,
  items,
  emptyText,
  gridClassName,
  carousel = false,
  autoScroll = false,
  gapClassName,
  gapPixels,
  visibleCards,
  getKey,
  renderItem,
}: {
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  items: T[];
  emptyText: string;
  gridClassName: string;
  carousel?: boolean;
  autoScroll?: boolean;
  gapClassName: string;
  gapPixels: number;
  visibleCards: number;
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const manualPauseUntil = useRef(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const useCarousel = carousel && items.length > 0;

  const scrollRail = useCallback((direction: "left" | "right", automatic = false) => {
    const rail = railRef.current;
    if (!rail) return;
    if (!automatic) manualPauseUntil.current = Date.now() + 12000;
    const cardWidth = rail.firstElementChild instanceof HTMLElement ? rail.firstElementChild.offsetWidth : Math.max(220, rail.clientWidth * 0.35);
    const distance = cardWidth + gapPixels;
    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
    if (direction === "right" && rail.scrollLeft >= maxScrollLeft - distance * 0.5) {
      rail.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      rail.scrollBy({ left: direction === "right" ? distance : -distance, behavior: "smooth" });
    }
  }, [gapPixels]);

  useEffect(() => {
    if (!useCarousel || !autoScroll || items.length <= 5 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (!isInteracting && Date.now() >= manualPauseUntil.current) scrollRail("right", true);
    }, 8500);
    return () => window.clearInterval(timer);
  }, [autoScroll, isInteracting, items.length, scrollRail, useCarousel]);

  const itemStyle: CSSProperties | undefined = useCarousel ? { flexBasis: `calc((100% - ${gapPixels * (visibleCards - 1)}px) / ${visibleCards})` } : undefined;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="rounded-2xl border border-[var(--app-accent)]/20 bg-[var(--app-accent-soft)] p-2.5 text-white/80"><Icon className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold text-white">{title}</h2><p className="text-sm text-white/40">{items.length || emptyText}</p></div></div>
        {useCarousel && items.length > 5 && <div className="flex items-center gap-2">{(["left", "right"] as const).map((direction) => <button key={direction} type="button" onClick={() => scrollRail(direction)} className="rounded-2xl border border-[var(--app-accent)]/20 bg-[var(--app-accent-soft)] p-2 text-white/80 transition hover:border-[var(--app-accent)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/55" title={`Scroll ${title} ${direction}`}>{direction === "left" ? <ArrowLeftIcon className="h-5 w-5" /> : <ArrowRightIcon className="h-5 w-5" />}</button>)}</div>}
      </div>
      {items.length ? <div ref={useCarousel ? railRef : undefined} onMouseEnter={() => setIsInteracting(true)} onMouseLeave={() => setIsInteracting(false)} onFocusCapture={() => setIsInteracting(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false); }} className={useCarousel ? `scroll-container flex snap-x overflow-x-auto overflow-y-hidden pb-2 scroll-smooth ${gapClassName}` : gridClassName}>{items.map((item, index) => <div key={getKey(item, index)} className={useCarousel ? "min-w-0 shrink-0 snap-start" : ""} style={itemStyle}>{renderItem(item, index)}</div>)}</div> : <div className="rounded-3xl border border-dashed border-white/10 bg-white/3 px-5 py-8 text-sm text-white/45">{emptyText}</div>}
    </section>
  );
}
