import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent } from "react";
import {
  ArrowRightStartOnRectangleIcon,
  BellIcon,
  BookmarkIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { formatLocalDateTime } from "../utils/dateFormat";
import type { NavbarStyle } from "./SettingsPage";

type NotificationItem = {
  id: number;
  kind: "success" | "error" | "warning";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

type TopNavbarProps = {
  query: string;
  onSearch: (query: string) => void;
  onClear: () => void;
  username: string;
  notifications: NotificationItem[];
  onReadNotification: (id: number) => void;
  onDismissNotification: (id: number) => void;
  onClearNotifications: () => void;
  onLogout: () => void;
  currentView: "home" | "list" | "details" | "settings";
  onOpenHome: () => void;
  onOpenMyList: () => void;
  onOpenSettings: () => void;
  focusSearchOnMount?: boolean;
  navbarStyle: NavbarStyle;
};

export function TopNavbar({
  query,
  onSearch,
  onClear,
  username,
  notifications,
  onReadNotification,
  onDismissNotification,
  onClearNotifications,
  onLogout,
  currentView,
  onOpenHome,
  onOpenMyList,
  onOpenSettings,
  focusSearchOnMount = false,
  navbarStyle,
}: TopNavbarProps) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const accountCloseTimerRef = useRef<number | null>(null);
  const notificationsCloseTimerRef = useRef<number | null>(null);
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const isFloating = navbarStyle === "floating";
  const isMinimal = navbarStyle === "minimal";

  const clearAccountCloseTimer = useCallback(() => {
    if (accountCloseTimerRef.current !== null) {
      window.clearTimeout(accountCloseTimerRef.current);
      accountCloseTimerRef.current = null;
    }
  }, []);

  const clearNotificationsCloseTimer = useCallback(() => {
    if (notificationsCloseTimerRef.current !== null) {
      window.clearTimeout(notificationsCloseTimerRef.current);
      notificationsCloseTimerRef.current = null;
    }
  }, []);

  const closeAccountMenu = useCallback(() => {
    clearAccountCloseTimer();
    setIsAccountMenuOpen(false);
  }, [clearAccountCloseTimer]);

  const closeNotifications = useCallback(() => {
    clearNotificationsCloseTimer();
    setIsNotificationsOpen(false);
  }, [clearNotificationsCloseTimer]);

  const openAccountMenu = () => {
    clearAccountCloseTimer();
    setIsAccountMenuOpen(true);
  };

  const openNotifications = () => {
    clearNotificationsCloseTimer();
    setIsNotificationsOpen(true);
  };

  const scheduleCloseAccountMenu = () => {
    clearAccountCloseTimer();

    accountCloseTimerRef.current = window.setTimeout(() => {
      setIsAccountMenuOpen(false);
      accountCloseTimerRef.current = null;
    }, 180);
  };

  const scheduleCloseNotifications = () => {
    clearNotificationsCloseTimer();

    notificationsCloseTimerRef.current = window.setTimeout(() => {
      setIsNotificationsOpen(false);
      notificationsCloseTimerRef.current = null;
    }, 180);
  };

  const handleAccountBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (accountMenuRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }

    scheduleCloseAccountMenu();
  };

  const handleNotificationsBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (notificationsRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }

    scheduleCloseNotifications();
  };

  const focusSearchInput = (selectExistingText = true) => {
    const input = searchInputRef.current;
    if (!input) return;

    input.focus();

    if (selectExistingText && input.value) {
      window.requestAnimationFrame(() => {
        input.select();
      });
    }
  };

  const handleClearSearch = () => {
    onClear();
    window.requestAnimationFrame(() => {
      focusSearchInput(false);
    });
  };

  const handleSearchCloseOrClear = () => {
    if (query.trim()) {
      handleClearSearch();
      return;
    }

    searchInputRef.current?.blur();
  };

  useEffect(() => {
    const handleWindowBlur = () => {
      closeAccountMenu();
      closeNotifications();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        closeAccountMenu();
        closeNotifications();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node | null)) {
        closeAccountMenu();
      }

      if (!notificationsRef.current?.contains(event.target as Node | null)) {
        closeNotifications();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAccountMenu();
        closeNotifications();
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearAccountCloseTimer();
      clearNotificationsCloseTimer();
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    clearAccountCloseTimer,
    clearNotificationsCloseTimer,
    closeAccountMenu,
    closeNotifications,
  ]);

  useEffect(() => {
    if (!focusSearchOnMount) {
      return;
    }

    window.requestAnimationFrame(() => {
      focusSearchInput(false);
    });
  }, [focusSearchOnMount]);

  useEffect(() => {
    function handleGlobalSearchFocus(event: KeyboardEvent) {
      if (event.key === "Delete") {
        const input = searchInputRef.current;
        const target = event.target as HTMLElement | null;
        const isSearchInput = target === input;

        if (
          !input ||
          !query.trim() ||
          (!isSearchInput && isKeyboardInputTarget(target)) ||
          document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')
        ) {
          return;
        }

        event.preventDefault();
        onClear();
        return;
      }

      if (!shouldFocusSearchFromKey(event)) {
        return;
      }

      const input = searchInputRef.current;
      if (!input || document.activeElement === input) {
        return;
      }

      event.preventDefault();

      if (event.key !== "Enter") {
        onSearch(event.key);
      }

      window.requestAnimationFrame(() => {
        focusSearchInput(event.key === "Enter");
      });
    }

    document.addEventListener("keydown", handleGlobalSearchFocus);
    return () => document.removeEventListener("keydown", handleGlobalSearchFocus);
  }, [onClear, onSearch, query]);

  return (
    <div
      className={`drag-region absolute z-40 flex items-center justify-center transition-[inset,background-color,border-color,border-radius,box-shadow] duration-300 ${
        isFloating
          ? "inset-x-3 top-3 h-14 rounded-2xl border border-white/10 bg-[#111111]/62 px-3 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl"
          : "inset-x-0 top-0 h-16 px-4"
      }`}
    >
      {!isFloating && !isMinimal && (
        <div className="absolute inset-0 bg-[#0f0f0f]/45 backdrop-blur-md" />
      )}

      <div className="relative flex w-full items-center justify-center">
        <div
          className={`absolute left-0 flex items-center gap-2 transition ${
            isMinimal
              ? "rounded-2xl border border-white/10 bg-[#111111]/62 p-1 shadow-xl backdrop-blur-xl"
              : ""
          }`}
        >
          <button
            onClick={onOpenHome}
            className={`no-drag inline-flex items-center justify-center rounded-xl border p-2 text-sm transition-all duration-200 ease-out active:scale-95 ${
              currentView === "home"
                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-white"
                : "border-transparent bg-transparent text-white/65 hover:bg-white/10 hover:text-white"
            }`}
            title="Open home"
          >
            <HomeIcon className="h-5 w-5" />
          </button>

          <button
            onClick={onOpenMyList}
            className={`no-drag flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-200 ease-out active:scale-95 ${
              currentView === "list"
                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-white"
                : "border-transparent bg-transparent text-white/65 hover:bg-white/10 hover:text-white"
            }`}
            title="Open my list"
          >
            <BookmarkIcon className="h-5 w-5" />
            <span>My List</span>
          </button>
        </div>

        <div
          className={`no-drag mx-auto flex w-full items-center gap-2 rounded-2xl border px-3 py-2 shadow-lg transition-[max-width,border-color,background-color,box-shadow] duration-300 ${
            isFloating ? "max-w-lg" : "max-w-xl"
          } ${
            isSearchFocused
              ? "border-white/20 bg-white/9 shadow-[0_10px_35px_rgba(0,0,0,0.32)]"
              : isMinimal
                ? "border-white/10 bg-[#111111]/62 backdrop-blur-xl"
                : "border-white/10 bg-white/6"
          }`}
        >
          <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-white/45" />

          <input
            ref={searchInputRef}
            type="text"
            value={query}
            placeholder="Search anime..."
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            onFocus={(event) => {
              setIsSearchFocused(true);
              if (event.currentTarget.value) {
                event.currentTarget.select();
              }
            }}
            onBlur={() => setIsSearchFocused(false)}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />

          {!query.trim() && !isSearchFocused && (
            <kbd className="hidden shrink-0 items-center rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] font-medium tracking-wide text-white/38 sm:inline-flex">
              Enter
            </kbd>
          )}

          {(query.trim() || isSearchFocused) && (
            <>
              <kbd
                className={`hidden shrink-0 items-center rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] font-medium tracking-wide sm:inline-flex ${
                  query.trim() ? "text-white/38" : "text-white/25"
                }`}
              >
                Del
              </kbd>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleSearchCloseOrClear}
                className="no-drag rounded-full p-1 text-white/45 transition-all duration-200 ease-out hover:scale-105 hover:bg-white/10 hover:text-white active:scale-95"
                title={query.trim() ? "Clear search" : "Unfocus search"}
                aria-label={query.trim() ? "Clear search" : "Unfocus search"}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        <div
          className={`no-drag absolute right-0 top-0 flex items-start gap-2 transition ${
            isMinimal
              ? "rounded-2xl border border-white/10 bg-[#111111]/62 p-1 shadow-xl backdrop-blur-xl"
              : ""
          }`}
        >
          <div
            ref={notificationsRef}
            className="relative"
            onMouseLeave={scheduleCloseNotifications}
            onFocus={openNotifications}
            onBlur={handleNotificationsBlur}
          >
            <button
              type="button"
              onMouseEnter={openNotifications}
              onClick={() => setIsNotificationsOpen((current) => !current)}
              className="relative flex items-center justify-center rounded-xl border border-transparent p-2 text-white/70 transition-all duration-200 ease-out hover:bg-white/10 hover:text-white"
              title="Notifications"
            >
              <BellIcon className="h-6 w-6" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--app-accent)] px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-black">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <div
              onMouseEnter={openNotifications}
              className={`absolute right-0 top-full mt-2 w-80 rounded-2xl border border-white/10 bg-[#111111]/95 p-2 shadow-2xl backdrop-blur-md transition-all duration-200 ${
                isNotificationsOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-[-6px] opacity-0"
              }`}
            >
              <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
                <p className="text-sm font-semibold text-white">Notifications</p>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearNotifications}
                    className="rounded-lg px-2 py-1 text-xs text-white/45 transition hover:bg-white/10 hover:text-white/75"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="scroll-container max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-white/40">
                    No notifications yet.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => onReadNotification(notification.id)}
                        className={`group/notification w-full rounded-xl border py-2.5 pl-3 pr-2 text-left transition ${
                          notification.read
                            ? "border-transparent bg-transparent hover:bg-white/[0.05]"
                            : "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {notification.title}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                              {notification.message}
                            </p>
                          </div>
                          <div className="flex h-6 w-7 shrink-0 items-center justify-end">
                            {!notification.read && (
                              <span className="h-2 w-2 rounded-full bg-[var(--app-accent)] transition-transform duration-200 ease-out group-hover/notification:-translate-x-4 group-focus-within/notification:-translate-x-4" />
                            )}
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Dismiss ${notification.title}`}
                              title="Dismiss notification"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDismissNotification(notification.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") {
                                  return;
                                }

                                event.preventDefault();
                                event.stopPropagation();
                                onDismissNotification(notification.id);
                              }}
                              className="-ml-1 translate-x-1 rounded-full p-1 text-white/35 opacity-0 transition duration-200 ease-out hover:bg-white/10 hover:text-white/75 focus:translate-x-0 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/45 group-hover/notification:translate-x-0 group-hover/notification:opacity-100"
                            >
                              <XMarkIcon className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] text-white/30">
                          {formatLocalDateTime(notification.createdAt)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            ref={accountMenuRef}
            className="relative"
            onMouseLeave={scheduleCloseAccountMenu}
            onFocus={openAccountMenu}
            onBlur={handleAccountBlur}
          >
            <button
              type="button"
              onMouseEnter={openAccountMenu}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-200 ease-out ${
                currentView === "settings"
                  ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-white"
                  : "border-transparent text-white/70 hover:bg-white/10 hover:text-white"
              }`}
              title={username}
            >
              <UserCircleIcon className="h-6 w-6" />
              <span className="max-w-30 truncate text-sm">{username}</span>
              <ChevronDownIcon
                className={`h-4 w-4 text-white/45 transition-transform duration-200 ${
                  isAccountMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <div
              onMouseEnter={openAccountMenu}
              className={`absolute right-0 top-full mt-2 w-48 rounded-2xl border border-white/10 bg-[#111111]/95 p-2 shadow-2xl backdrop-blur-md transition-all duration-200 ${
                isAccountMenuOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-[-6px] opacity-0"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  closeAccountMenu();
                  onOpenSettings();
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                  currentView === "settings"
                    ? "bg-[var(--app-accent-soft)] text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Cog6ToothIcon className="h-5 w-5" />
                Settings
              </button>

              <button
                type="button"
                onClick={() => {
                  closeAccountMenu();
                  onLogout();
                }}
                className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
                Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function shouldFocusSearchFromKey(event: KeyboardEvent) {
  const isEnterShortcut = event.key === "Enter";
  const isTypeToSearchShortcut = event.key.length === 1;

  if (
    event.defaultPrevented ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    (!isEnterShortcut && !isTypeToSearchShortcut)
  ) {
    return false;
  }

  const target = event.target as HTMLElement | null;

  if (isKeyboardInputTarget(target)) {
    return false;
  }

  if (
    isEnterShortcut &&
    target?.closest("button, a, [role='button'], [role='menuitem'], [role='option']")
  ) {
    return false;
  }

  if (document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) {
    return false;
  }

  return true;
}

function isKeyboardInputTarget(element: HTMLElement | null) {
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    element.isContentEditable ||
    Boolean(element.closest("input, textarea, select, [contenteditable='true']"))
  );
}
