import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon } from "@heroicons/react/24/outline";

const SHOW_AFTER_PX = 360;

export function GlobalScrollToTop({ viewKey }: { viewKey: string }) {
  const activeRootRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    function setActiveRoot(root: HTMLElement | null) {
      activeRootRef.current = root;
      setIsVisible(Boolean(root && root.scrollTop >= SHOW_AFTER_PX));
    }

    function findCurrentRoot() {
      const roots = Array.from(
        document.querySelectorAll<HTMLElement>("[data-global-scroll-root]")
      );
      setActiveRoot(
        roots.find(
          (root) => root.offsetParent !== null && root.scrollHeight > root.clientHeight
        ) ?? roots.find((root) => root.offsetParent !== null) ?? null
      );
    }

    function handleScroll(event: Event) {
      const root = event.target;
      if (!(root instanceof HTMLElement) || !root.hasAttribute("data-global-scroll-root")) {
        return;
      }
      setActiveRoot(root);
    }

    document.addEventListener("scroll", handleScroll, true);
    frame = window.requestAnimationFrame(findCurrentRoot);

    return () => {
      document.removeEventListener("scroll", handleScroll, true);
      window.cancelAnimationFrame(frame);
    };
  }, [viewKey]);

  function scrollToTop() {
    const root = activeRootRef.current;
    if (!root?.isConnected) return;
    root.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      title="Scroll to top"
      aria-hidden={!isVisible}
      tabIndex={isVisible ? 0 : -1}
      className={`no-drag fixed bottom-5 right-5 z-[35] inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-[#111111]/82 text-white/75 shadow-2xl backdrop-blur-xl transition-all duration-300 ease-out hover:border-(--app-accent)/35 hover:bg-(--app-accent-soft) hover:text-white focus:outline-none focus:ring-2 focus:ring-(--app-accent)/55 sm:bottom-6 sm:right-6 ${
        isVisible
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-3 scale-90 opacity-0"
      }`}
    >
      <ArrowUpIcon className="h-5 w-5" />
    </button>
  );
}
