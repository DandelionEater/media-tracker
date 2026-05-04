import { useEffect, useRef, useState } from "react";
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
  onClearNotifications: () => void;
  onLogout: () => void;
  currentView: "home" | "list" | "details" | "settings";
  onOpenHome: () => void;
  onOpenMyList: () => void;
  onOpenSettings: () => void;
};

export function TopNavbar({
  query,
  onSearch,
  onClear,
  username,
  notifications,
  onReadNotification,
  onClearNotifications,
  onLogout,
  currentView,
  onOpenHome,
  onOpenMyList,
  onOpenSettings,
}: TopNavbarProps) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const accountCloseTimerRef = useRef<number | null>(null);
  const notificationsCloseTimerRef = useRef<number | null>(null);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const clearAccountCloseTimer = () => {
    if (accountCloseTimerRef.current !== null) {
      window.clearTimeout(accountCloseTimerRef.current);
      accountCloseTimerRef.current = null;
    }
  };

  const clearNotificationsCloseTimer = () => {
    if (notificationsCloseTimerRef.current !== null) {
      window.clearTimeout(notificationsCloseTimerRef.current);
      notificationsCloseTimerRef.current = null;
    }
  };

  const closeAccountMenu = () => {
    clearAccountCloseTimer();
    setIsAccountMenuOpen(false);
  };

  const closeNotifications = () => {
    clearNotificationsCloseTimer();
    setIsNotificationsOpen(false);
  };

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
  }, []);

  return (
    <div className="drag-region absolute inset-x-0 top-0 z-40 flex h-16 items-center justify-center px-4">
      <div className="absolute inset-0 bg-[#0f0f0f]/45 backdrop-blur-md" />

      <div className="relative flex w-full items-center justify-center">
        <div className="absolute left-0 flex items-center gap-2">
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

        <div className="no-drag mx-auto flex w-full max-w-xl items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-3 py-2 shadow-lg">
          <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-white/45" />

          <input
            type="text"
            value={query}
            placeholder="Search anime..."
            onChange={(e) => onSearch(e.target.value)}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />

          {query.trim() && (
            <button
              onClick={onClear}
              className="no-drag rounded-full p-1 text-white/45 transition-all duration-200 ease-out hover:scale-105 hover:bg-white/10 hover:text-white active:scale-95"
              title="Clear search"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="no-drag absolute right-0 top-0 flex items-start gap-2">
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
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
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
                          {!notification.read && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--app-accent)]" />
                          )}
                        </div>
                        <p className="mt-2 text-[11px] text-white/30">
                          {formatNotificationTime(notification.createdAt)}
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

function formatNotificationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
