import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SVGProps } from "react";
import {
  ArrowPathIcon,
  BookmarkIcon,
  CheckIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CloudArrowDownIcon,
  CommandLineIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
  HomeIcon,
  LanguageIcon,
  LinkIcon,
  PaintBrushIcon,
  PlayCircleIcon,
  RocketLaunchIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";
import { getMigratedLocalStorageItem } from "../utils/localStorageMigration";
import { formatLocalDateTime as formatDateTime } from "../utils/dateFormat";
import type { ImportPreviewItem } from "../types/domain";

export type ThemeAccent = "violet" | "rose" | "amber" | "emerald" | "custom";
export type OverlayBackground = "solid" | "glass" | "transparent";
export type NavbarStyle = "integrated" | "floating" | "minimal";
export type BrowseCardStyle = "default" | "immersive" | "gallery";
export type StartView = "home" | "list" | "search";
export type AnimationLevel = "full" | "reduced" | "off";
export type CardDensity = "comfortable" | "balanced" | "compact";
export type DiscoverDensity = CardDensity;

export type AppSettings = {
  themeAccent: ThemeAccent;
  customAccentColor: string;
  titleLanguage: TitleLanguage;
  showTrendingCarousel: boolean;
  autoRotateTrending: boolean;
  autoScrollHomeShelves: boolean;
  hideAdultContent: boolean;
  overlayOpacity: number;
  overlayBackground: OverlayBackground;
  navbarStyle: NavbarStyle;
  browseCardStyle: BrowseCardStyle;
  backgroundDim: number;
  animationLevel: AnimationLevel;
  compactMode: boolean;
  discoverDensity: DiscoverDensity;
  homeDensity: CardDensity;
  myListDensity: CardDensity;
  startView: StartView;
};

type ImportPreviewGroup = {
  status: string;
  items: ImportPreviewItem[];
};

type ImportPreviewResponse = {
  ok: boolean;
  message?: string;
  username?: string;
  preview?: {
    totalFound: number;
    groups: ImportPreviewGroup[];
    unmatched?: string[];
  };
};

type ImportProvider = "anilist" | "mal" | "txt" | "pdf";
type ImportFeedback = {
  provider: ImportProvider;
  kind: "success" | "error" | "warning";
  message: string;
  summary?: {
    sourceUsername: string;
    totalFound: number;
    selectedStatuses: string[];
    selectedAnimeIds: number[];
    imported: number;
    created: number;
    updated: number;
    skipped: number;
  };
};

type AniListLinkedAccount = {
  anilistUserId: number;
  anilistUsername: string;
  originalAniListUsername: string;
  lastImportAt: string | null;
  updatedAt: string;
};

type AniListLinkConflict = {
  anilistUserId: number;
  anilistUsername: string;
  sourceUser: {
    id: number;
    username: string;
  } | null;
  targetUser: {
    id: number;
    username: string;
  };
};

type MalLinkedAccount = {
  malUserId: number;
  malUsername: string;
  originalMalUsername: string;
  lastImportAt: string | null;
  updatedAt: string;
};

type MalLinkConflict = {
  malUserId: number;
  malUsername: string;
  sourceUser: {
    id: number;
    username: string;
  } | null;
  targetUser: {
    id: number;
    username: string;
  };
};

type SettingsPageProps = {
  username: string;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void | Promise<void>;
  onShowWelcomeScreen: () => void | Promise<void>;
  onResetSettings: () => void | Promise<void>;
  onImportAniList: (
    username: string,
    selectedStatuses: string[],
    selectedAnimeIds: number[],
    options?: { signal?: AbortSignal }
  ) => Promise<{
    ok: boolean;
    cancelled?: boolean;
    message: string;
    summary?: {
      sourceUsername: string;
      totalFound: number;
      selectedStatuses: string[];
      selectedAnimeIds: number[];
      imported: number;
      created: number;
      updated: number;
      skipped: number;
    };
  }>;
  onImportMal: (
    selectedStatuses: string[],
    selectedAnimeIds: number[],
    options?: { signal?: AbortSignal }
  ) => Promise<{
    ok: boolean;
    cancelled?: boolean;
    message: string;
    summary?: {
      sourceUsername: string;
      totalFound: number;
      selectedStatuses: string[];
      selectedAnimeIds: number[];
      imported: number;
      created: number;
      updated: number;
      skipped: number;
      mapped?: number;
      unmapped?: number;
    };
  }>;
  onImportTextList: (
    entries: ImportPreviewItem[],
    selectedAnimeIds: number[],
    options?: { signal?: AbortSignal }
  ) => Promise<{
    ok: boolean;
    cancelled?: boolean;
    message: string;
    summary?: {
      sourceUsername: string;
      totalFound: number;
      selectedStatuses: string[];
      selectedAnimeIds: number[];
      imported: number;
      created: number;
      updated: number;
      skipped: number;
    };
  }>;
  onClearMyList: () => Promise<{
    ok: boolean;
    message: string;
    removedCount?: number;
  }>;
  onExportLocalBackup: () => Promise<void>;
  onImportLocalBackup: (backup: unknown) => Promise<{
    ok: boolean;
    message: string;
    imported?: number;
  }>;
  onLinkAniListAccount: () => Promise<{
    ok: boolean;
    message: string;
    linked: boolean;
    account?: AniListLinkedAccount | null;
    needsConflictResolution?: boolean;
    conflict?: AniListLinkConflict;
  }>;
  onLinkMalAccount: () => Promise<{
    ok: boolean;
    message: string;
    linked: boolean;
    account?: MalLinkedAccount | null;
    needsConflictResolution?: boolean;
    conflict?: MalLinkConflict;
  }>;
  onRunSyncNow: () => Promise<{
    ok: boolean;
    message: string;
    synced?: number;
    failed?: number;
    pending?: number;
  }>;
  onPullFromAniList: () => Promise<{
    ok: boolean;
    message: string;
    summary?: {
      sourceUsername: string;
      totalFound: number;
      imported: number;
      created: number;
      updated: number;
      skipped: number;
    };
  }>;
  onPullFromMal: () => Promise<{
    ok: boolean;
    message: string;
    summary?: {
      sourceUsername: string;
      totalFound: number;
      imported: number;
      created: number;
      updated: number;
      skipped: number;
      mapped?: number;
      unmapped?: number;
    };
  }>;
};

type SettingsSectionId = "appearance" | "home" | "content" | "account" | "sync" | "data" | "general";
type SyncActivityTab = "pending" | "completed" | "failed";
type DesktopShortcutState = {
  available: boolean;
  loading: boolean;
  enabled: boolean;
  accelerator: string;
  draftAccelerator: string;
  feedback: { kind: "success" | "error"; message: string } | null;
};
type DesktopStartupState = {
  available: boolean;
  loading: boolean;
  openAtLogin: boolean;
  feedback: { kind: "success" | "error"; message: string } | null;
};
type WindowPresetId = "compact" | "balanced" | "cinematic" | "custom";
type SelectableWindowPresetId = Exclude<WindowPresetId, "custom">;
type DesktopWindowState = {
  available: boolean;
  loading: boolean;
  preset: WindowPresetId;
  bounds: { x: number; y: number; width: number; height: number } | null;
  customBounds: { x: number; y: number; width: number; height: number } | null;
  feedback: { kind: "success" | "error"; message: string } | null;
};
type SyncActivityItem = {
  id: number;
  anime_id?: number | null;
  animeTitle?: string | null;
  anime_title?: string | null;
  operation: string;
  status: string;
  attempts?: number;
  last_error?: string | null;
  next_attempt_at?: string | null;
  created_at: string;
  updated_at?: string;
  message?: string | null;
  changedFields?: Array<{ field: string; from: unknown; to: unknown }>;
};
type SyncProgressEvent = {
  operation: "manual-sync" | "pull-anilist" | "pull-mal";
  stage: "fetching" | "mapping" | "saving" | "processing" | "complete" | "failed";
  label: string;
  current?: number | null;
  total?: number | null;
  updatedAt?: string;
};

const THEME_OPTIONS: Array<{
  value: Exclude<ThemeAccent, "custom">;
  label: string;
  color: string;
  glow: string;
}> = [
  { value: "violet", label: "Violet", color: "#a78bfa", glow: "shadow-violet-400/20" },
  { value: "rose", label: "Rose", color: "#fb7185", glow: "shadow-rose-400/20" },
  { value: "amber", label: "Amber", color: "#fbbf24", glow: "shadow-amber-400/20" },
  { value: "emerald", label: "Emerald", color: "#34d399", glow: "shadow-emerald-400/20" },
];

const TITLE_OPTIONS: Array<{
  value: TitleLanguage;
  label: string;
  description: string;
}> = [
  {
    value: "userPreferred",
    label: "AniList preferred",
    description: "Use AniList's preferred title when available.",
  },
  {
    value: "english",
    label: "English",
    description: "Prefer official English titles.",
  },
  {
    value: "romaji",
    label: "Romaji",
    description: "Prefer romanized Japanese titles.",
  },
  {
    value: "native",
    label: "Native",
    description: "Prefer native-language titles.",
  },
];

const OVERLAY_BACKGROUND_OPTIONS: Array<{
  value: OverlayBackground;
  label: string;
  description: string;
}> = [
  {
    value: "solid",
    label: "Solid",
    description: "Keep the app surface opaque and closest to the current look.",
  },
  {
    value: "glass",
    label: "Glass",
    description: "Let more desktop color through with a stronger blur.",
  },
  {
    value: "transparent",
    label: "Light glass",
    description: "Use the clearest overlay style while keeping text readable.",
  },
];

const NAVBAR_STYLE_OPTIONS: Array<{
  value: NavbarStyle;
  label: string;
  description: string;
}> = [
  {
    value: "integrated",
    label: "Integrated",
    description: "A steady full-width bar that feels connected to the app.",
  },
  {
    value: "floating",
    label: "Floating",
    description: "An inset glass surface that lifts the navbar above the page.",
  },
  {
    value: "minimal",
    label: "Minimal",
    description: "Separate navigation, search, and account controls with no full-width bar.",
  },
];

const BROWSE_CARD_STYLE_OPTIONS: Array<{
  value: BrowseCardStyle;
  label: string;
  description: string;
}> = [
  {
    value: "default",
    label: "Default",
    description: "Keep artwork and information in Seenary's familiar card layout.",
  },
  {
    value: "immersive",
    label: "Immersive",
    description: "Let artwork fill the card with details layered over a soft gradient.",
  },
  {
    value: "gallery",
    label: "Gallery",
    description: "Remove the heavy card shell for a lighter, poster-wall presentation.",
  },
];

const START_VIEW_OPTIONS: Array<{
  value: StartView;
  label: string;
  description: string;
}> = [
  {
    value: "home",
    label: "Home",
    description: "Open on discovery and your library shelves.",
  },
  {
    value: "list",
    label: "My List",
    description: "Open directly to your tracked anime.",
  },
  {
    value: "search",
    label: "Search",
    description: "Open home with the search field ready.",
  },
];

const ANIMATION_LEVEL_OPTIONS: Array<{
  value: AnimationLevel;
  label: string;
  description: string;
}> = [
  {
    value: "full",
    label: "Full",
    description: "Keep Seenary's full transitions, hover movement, and loading motion.",
  },
  {
    value: "reduced",
    label: "Reduced",
    description: "Calm down decorative motion while keeping quick interface feedback.",
  },
  {
    value: "off",
    label: "Off",
    description: "Remove non-essential animations and transitions.",
  },
];

const CARD_DENSITY_OPTIONS: Array<{
  value: CardDensity;
  label: string;
  description: string;
}> = [
  {
    value: "comfortable",
    label: "Comfortable",
    description: "Larger posters and wider spacing for slower, artwork-led browsing.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "The default Discover page layout with a steady mix of artwork and scan speed.",
  },
  {
    value: "compact",
    label: "Compact",
    description: "Smaller cards and tighter shelves so more titles fit in the overlay.",
  },
];

const DISCOVER_DENSITY_OPTIONS = CARD_DENSITY_OPTIONS;

const WINDOW_PRESET_OPTIONS: Array<{
  value: WindowPresetId;
  label: string;
  description: string;
  selectable: boolean;
}> = [
  {
    value: "compact",
    label: "Compact",
    description: "A smaller overlay for quick checks beside another app.",
    selectable: true,
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "The default roomy layout for everyday browsing.",
    selectable: true,
  },
  {
    value: "cinematic",
    label: "Cinematic",
    description: "A wide overlay for artwork-heavy discovery and details.",
    selectable: true,
  },
  {
    value: "custom",
    label: "Custom",
    description: "Return to your last manually chosen size.",
    selectable: false,
  },
];

const IMPORT_STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  planned: "Planned",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
};

const SHORTCUT_PRESETS = [
  "Control+Space",
  "Control+Shift+Space",
  "Alt+Space",
  "Control+Alt+Space",
  "Control+Alt+Shift+Space",
  "Control+Shift+Enter",
  "Alt+Shift+Space",
];

const APP_VERSION = __APP_VERSION__;
const SETTINGS_OPEN_SECTION_KEY = "seenary.settings.open-section";
const SETTINGS_OPEN_SECTION_LEGACY_KEY = "media-tracker.settings.open-section";
const SETTINGS_SECTION_SCROLL_OFFSET = 88;
const MIN_DESKTOP_WINDOW_SIZE = { width: 900, height: 600 };
const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  "general",
  "appearance",
  "content",
  "home",
  "account",
  "sync",
  "data",
];

function readStoredSettingsSection(): SettingsSectionId {
  if (typeof window === "undefined") {
    return "general";
  }

  try {
    const storedSection = getMigratedLocalStorageItem(
      SETTINGS_OPEN_SECTION_KEY,
      SETTINGS_OPEN_SECTION_LEGACY_KEY
    );
    const migratedSection =
      storedSection === "behavior"
        ? "home"
        : storedSection === "library"
          ? "data"
          : storedSection === "onboarding"
            ? "general"
            : storedSection;

    return SETTINGS_SECTION_IDS.includes(migratedSection as SettingsSectionId)
      ? (migratedSection as SettingsSectionId)
      : "general";
  } catch {
    return "general";
  }
}

export function SettingsPage({
  username,
  settings,
  onUpdateSettings,
  onShowWelcomeScreen,
  onResetSettings,
  onImportAniList,
  onImportMal,
  onImportTextList,
  onClearMyList,
  onExportLocalBackup,
  onImportLocalBackup,
  onLinkAniListAccount,
  onLinkMalAccount,
  onRunSyncNow,
  onPullFromAniList,
  onPullFromMal,
}: SettingsPageProps) {
  const settingsScrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Partial<Record<SettingsSectionId, HTMLElement | null>>>({});
  const textImportInputRef = useRef<HTMLInputElement | null>(null);
  const pdfImportInputRef = useRef<HTMLInputElement | null>(null);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const activePreviewAbortRef = useRef<AbortController | null>(null);
  const activeImportAbortRef = useRef<AbortController | null>(null);
  const [openSection, setOpenSection] = useState<SettingsSectionId | null>(
    readStoredSettingsSection
  );
  const [importUsername, setImportUsername] = useState(username);
  const [importPreviewUsername, setImportPreviewUsername] = useState(username);
  const [importProvider, setImportProvider] = useState<ImportProvider>("anilist");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse["preview"] | null>(null);
  const [textImportFileName, setTextImportFileName] = useState("");
  const [selectedImportIds, setSelectedImportIds] = useState<number[]>([]);
  const [openImportGroups, setOpenImportGroups] = useState<Record<string, boolean>>({});
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);
  const [clearFeedback, setClearFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [isClearArmed, setIsClearArmed] = useState(false);
  const [isClearingList, setIsClearingList] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    loading: true,
    linked: false,
    provider: null as "anilist" | "mal" | null,
    providerLabel: null as string | null,
    autoSyncEnabled: true,
    pendingCount: 0,
    feedback: null as { kind: "success" | "error"; message: string } | null,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPullingFromRemote, setIsPullingFromRemote] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressEvent | null>(null);
  const [isSyncActivityOpen, setIsSyncActivityOpen] = useState(false);
  const [syncActivityTab, setSyncActivityTab] = useState<SyncActivityTab>("pending");
  const [desktopShortcut, setDesktopShortcut] = useState<DesktopShortcutState>({
    available: Boolean(window.desktopShortcuts),
    loading: Boolean(window.desktopShortcuts),
    enabled: true,
    accelerator: "Control+Space",
    draftAccelerator: "Control+Space",
    feedback: null,
  });
  const [isShortcutRecorderFocused, setIsShortcutRecorderFocused] = useState(false);
  const [desktopStartup, setDesktopStartup] = useState<DesktopStartupState>({
    available: Boolean(window.desktopStartup),
    loading: Boolean(window.desktopStartup),
    openAtLogin: false,
    feedback: null,
  });
  const [desktopWindow, setDesktopWindow] = useState<DesktopWindowState>({
    available: Boolean(window.desktopWindow),
    loading: Boolean(window.desktopWindow),
    preset: "balanced",
    bounds: null,
    customBounds: null,
    feedback: null,
  });
  const [desktopWindowDraft, setDesktopWindowDraft] = useState({
    width: "",
    height: "",
  });

  useEffect(() => {
    return () => {
      void window.desktopShortcuts?.setShortcutRecordingActive(false);
    };
  }, []);
  const [syncActivity, setSyncActivity] = useState<{
    loading: boolean;
    pending: SyncActivityItem[];
    completed: SyncActivityItem[];
    failed: SyncActivityItem[];
  }>({
    loading: false,
    pending: [],
    completed: [],
    failed: [],
  });
  const [aniListLink, setAniListLink] = useState<{
    loading: boolean;
    linked: boolean;
    account: AniListLinkedAccount | null;
    feedback: {
      kind: "success" | "error";
      message: string;
    } | null;
    conflict: AniListLinkConflict | null;
  }>({
    loading: true,
    linked: false,
    account: null,
    feedback: null,
    conflict: null,
  });
  const [malLink, setMalLink] = useState<{
    loading: boolean;
    linked: boolean;
    account: MalLinkedAccount | null;
    feedback: {
      kind: "success" | "error";
      message: string;
    } | null;
    conflict: MalLinkConflict | null;
  }>({
    loading: true,
    linked: false,
    account: null,
    feedback: null,
    conflict: null,
  });

  const titleLabel = useMemo(() => {
    return (
      TITLE_OPTIONS.find((option) => option.value === settings.titleLanguage)?.label ??
      "AniList preferred"
    );
  }, [settings.titleLanguage]);
  const overlayOpacity = Number.isFinite(Number(settings.overlayOpacity))
    ? Math.min(100, Math.max(70, Math.round(Number(settings.overlayOpacity))))
    : 100;
  const backgroundDim = Number.isFinite(Number(settings.backgroundDim))
    ? Math.min(100, Math.max(0, Math.round(Number(settings.backgroundDim))))
    : 65;
  const customAccentColor = normalizeAccentColor(settings.customAccentColor);
  const accentSummary =
    settings.themeAccent === "custom" ? "Accent Custom" : `Accent ${capitalize(settings.themeAccent)}`;
  const syncProviderLabel = syncStatus.providerLabel ?? "external account";
  const isAniListSync = syncStatus.provider === "anilist";
  const syncTargetLabel = syncStatus.linked ? syncProviderLabel : "No linked account";

  function toggleSection(section: SettingsSectionId) {
    setOpenSection((current) => {
      const nextSection = current === section ? null : section;

      if (nextSection) {
        try {
          window.localStorage.setItem(SETTINGS_OPEN_SECTION_KEY, nextSection);
        } catch {
          // Keep settings usable even if local storage is unavailable.
        }
      }

      return nextSection;
    });
  }

  function rememberSectionRef(section: SettingsSectionId) {
    return (element: HTMLElement | null) => {
      sectionRefs.current[section] = element;
    };
  }

  function scrollToSettingsSection(section: SettingsSectionId) {
    const container = settingsScrollRef.current;
    const target = sectionRefs.current[section];

    if (!target) {
      return;
    }

    if (!container) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop =
      targetRect.top - containerRect.top + container.scrollTop - SETTINGS_SECTION_SCROLL_OFFSET;

    container.scrollTo({
      top: Math.max(0, nextTop),
      behavior: "smooth",
    });
  }

  useEffect(() => {
    if (!openSection) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToSettingsSection(openSection);
    });
    const settledLayoutId = window.setTimeout(() => {
      scrollToSettingsSection(openSection);
    }, 260);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(settledLayoutId);
    };
  }, [openSection]);

  useEffect(() => {
    let cancelled = false;

    loadAniListLinkStatus(undefined, () => cancelled);
    loadMalLinkStatus(undefined, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadSyncStatus();
  }, []);

  useEffect(() => {
    loadDesktopShortcut();
  }, []);

  useEffect(() => {
    loadDesktopStartup();
  }, []);

  useEffect(() => {
    if (!window.api.onSyncProgress) {
      return;
    }

    const removeListener = window.api.onSyncProgress((progress: SyncProgressEvent) => {
      setSyncProgress(progress);
    });

    return () => {
      removeListener();
    };
  }, []);

  useEffect(() => {
    loadDesktopWindow();
  }, []);

  useEffect(() => {
    if (!window.desktopWindow?.onWindowStateChanged) {
      return;
    }

    return window.desktopWindow.onWindowStateChanged((state) => {
      if (!state.ok) {
        return;
      }

      setDesktopWindow((current) => ({
        ...current,
        available: true,
        loading: false,
        preset: getWindowPresetId(state.preset),
        bounds: state.bounds ?? current.bounds,
        customBounds: state.customBounds ?? current.customBounds,
        feedback: null,
      }));
    });
  }, []);

  useEffect(() => {
    if (!desktopWindow.bounds) {
      return;
    }

    setDesktopWindowDraft({
      width: String(desktopWindow.bounds.width),
      height: String(desktopWindow.bounds.height),
    });
  }, [desktopWindow.bounds]);

  async function loadDesktopWindow() {
    if (!window.desktopWindow) {
      return;
    }

    try {
      const result = await window.desktopWindow.getWindowState();

      setDesktopWindow((current) => ({
        ...current,
        available: Boolean(result.ok),
        loading: false,
        preset: getWindowPresetId(result.preset),
        bounds: result.bounds ?? null,
        customBounds: result.customBounds ?? current.customBounds,
        feedback: result.ok
          ? current.feedback
          : { kind: "error", message: result.message || "Failed to load window layout." },
      }));
    } catch {
      setDesktopWindow((current) => ({
        ...current,
        available: true,
        loading: false,
        feedback: { kind: "error", message: "Failed to load window layout." },
      }));
    }
  }

  async function applyDesktopWindowPreset(preset: SelectableWindowPresetId) {
    if (!window.desktopWindow || desktopWindow.loading) {
      return;
    }

    const customBoundsBeforePreset =
      desktopWindow.preset === "custom" && desktopWindow.bounds
        ? desktopWindow.bounds
        : desktopWindow.customBounds;

    setDesktopWindow((current) => ({
      ...current,
      loading: true,
      preset,
      customBounds: customBoundsBeforePreset ?? current.customBounds,
      feedback: null,
    }));

    try {
      const result = await window.desktopWindow.setWindowPreset(preset);

      setDesktopWindow((current) => ({
        ...current,
        available: true,
        loading: false,
        preset: getWindowPresetId(result.preset ?? preset),
        bounds: result.bounds ?? current.bounds,
        customBounds:
          result.customBounds ?? customBoundsBeforePreset ?? current.customBounds,
        feedback: {
          kind: result.ok ? "success" : "error",
          message: result.message || (result.ok ? "Window layout updated." : "Failed to update window layout."),
        },
      }));
    } catch {
      setDesktopWindow((current) => ({
        ...current,
        loading: false,
        feedback: { kind: "error", message: "Failed to update window layout." },
      }));
    }
  }

  async function applyDesktopWindowCustomSize(nextSize: Partial<{ width: number; height: number }>) {
    if (!window.desktopWindow) {
      return;
    }

    const currentBounds = desktopWindow.bounds ?? {
      x: 0,
      y: 0,
      width: 1280,
      height: 900,
    };
    const nextBounds = {
      ...currentBounds,
      width:
        typeof nextSize.width === "number" && Number.isFinite(nextSize.width)
          ? Math.max(MIN_DESKTOP_WINDOW_SIZE.width, Math.round(nextSize.width))
          : currentBounds.width,
      height:
        typeof nextSize.height === "number" && Number.isFinite(nextSize.height)
          ? Math.max(MIN_DESKTOP_WINDOW_SIZE.height, Math.round(nextSize.height))
          : currentBounds.height,
    };

    setDesktopWindow((current) => ({
      ...current,
      available: true,
      preset: "custom",
      bounds: nextBounds,
      customBounds: nextBounds,
      feedback: null,
    }));

    try {
      const result = await window.desktopWindow.setCustomBounds({
        width: nextBounds.width,
        height: nextBounds.height,
      });

      if (!result.ok) {
        setDesktopWindow((current) => ({
          ...current,
          feedback: { kind: "error", message: result.message || "Failed to update custom size." },
        }));
        return;
      }

      setDesktopWindow((current) => ({
        ...current,
        available: true,
        loading: false,
        preset: getWindowPresetId(result.preset),
        bounds: result.bounds ?? current.bounds,
        customBounds: result.customBounds ?? current.customBounds,
        feedback: null,
      }));
    } catch {
      setDesktopWindow((current) => ({
        ...current,
        feedback: { kind: "error", message: "Failed to update custom size." },
      }));
    }
  }

  function handleDesktopWindowSizeInput(field: "width" | "height", value: string) {
    setDesktopWindowDraft((current) => ({
      ...current,
      [field]: value,
    }));

    const parsed = Number(value);
    const minimum = MIN_DESKTOP_WINDOW_SIZE[field];

    if (Number.isFinite(parsed) && parsed >= minimum) {
      applyDesktopWindowCustomSize(
        field === "width" ? { width: parsed } : { height: parsed }
      );
    }
  }

  function commitDesktopWindowSizeInput(field: "width" | "height", value: string) {
    const parsed = Number(value);
    const minimum = MIN_DESKTOP_WINDOW_SIZE[field];
    const nextValue = Number.isFinite(parsed) ? Math.max(minimum, Math.round(parsed)) : minimum;

    setDesktopWindowDraft((current) => ({
      ...current,
      [field]: String(nextValue),
    }));
    applyDesktopWindowCustomSize(
      field === "width" ? { width: nextValue } : { height: nextValue }
    );
  }

  async function loadDesktopStartup() {
    if (!window.desktopStartup) {
      return;
    }

    try {
      const result = await window.desktopStartup.getStartupSetting();

      setDesktopStartup((current) => ({
        ...current,
        available: result.available,
        loading: false,
        openAtLogin: result.openAtLogin,
        feedback:
          !result.available
            ? current.feedback
            : result.ok
            ? result.message
              ? { kind: "success", message: result.message }
              : current.feedback
            : { kind: "error", message: result.message || "Failed to load startup setting." },
      }));
    } catch {
      setDesktopStartup((current) => ({
        ...current,
        available: true,
        loading: false,
        feedback: { kind: "error", message: "Failed to load startup setting." },
      }));
    }
  }

  async function saveDesktopStartup(openAtLogin: boolean) {
    if (!window.desktopStartup || desktopStartup.loading) {
      return;
    }

    setDesktopStartup((current) => ({ ...current, loading: true }));

    try {
      const result = await window.desktopStartup.setStartupSetting(openAtLogin);

      setDesktopStartup({
        available: result.available,
        loading: false,
        openAtLogin: result.openAtLogin,
        feedback: {
          kind: result.ok ? "success" : "error",
          message: result.message || (result.ok ? "Startup setting updated." : "Failed to update startup setting."),
        },
      });
    } catch {
      setDesktopStartup((current) => ({
        ...current,
        loading: false,
        feedback: { kind: "error", message: "Failed to update startup setting." },
      }));
    }
  }

  async function loadDesktopShortcut() {
    if (!window.desktopShortcuts) {
      return;
    }

    try {
      const result = await window.desktopShortcuts.getHideShowShortcut();

      setDesktopShortcut((current) => ({
        ...current,
        available: true,
        loading: false,
        enabled: result.enabled,
        accelerator: result.accelerator,
        draftAccelerator: result.accelerator,
        feedback: result.ok
          ? current.feedback
          : { kind: "error", message: result.message || "Failed to load shortcut setting." },
      }));
    } catch {
      setDesktopShortcut((current) => ({
        ...current,
        available: true,
        loading: false,
        feedback: { kind: "error", message: "Failed to load shortcut setting." },
      }));
    }
  }

  async function saveDesktopShortcut(next: {
    enabled?: boolean;
    accelerator?: string;
  }) {
    if (!window.desktopShortcuts || desktopShortcut.loading) {
      return;
    }

    const enabled = next.enabled ?? desktopShortcut.enabled;
    const accelerator = (next.accelerator ?? desktopShortcut.draftAccelerator).trim();

    if (enabled && !hasAcceleratorActionKey(accelerator)) {
      setDesktopShortcut((current) => ({
        ...current,
        feedback: {
          kind: "error",
          message: "Add a letter, number, or key after the modifiers, such as Control+Shift+Alt+Space.",
        },
      }));
      return;
    }

    setDesktopShortcut((current) => ({ ...current, loading: true }));

    try {
      const result = await window.desktopShortcuts.setHideShowShortcut({
        enabled,
        accelerator,
      });

      setDesktopShortcut((current) => ({
        ...current,
        loading: false,
        enabled: result.enabled,
        accelerator: result.accelerator,
        draftAccelerator: result.accelerator || accelerator,
        feedback: {
          kind: result.ok ? "success" : "error",
          message: result.message || (result.ok ? "Shortcut updated." : "Failed to update shortcut."),
        },
      }));
    } catch {
      setDesktopShortcut((current) => ({
        ...current,
        loading: false,
        feedback: { kind: "error", message: "Failed to update shortcut." },
      }));
    }
  }

  function updateDraftShortcut(accelerator: string) {
    setDesktopShortcut((current) => ({
      ...current,
      draftAccelerator: accelerator,
      feedback: null,
    }));
  }

  function setShortcutRecorderFocused(focused: boolean) {
    setIsShortcutRecorderFocused(focused);
    void window.desktopShortcuts?.setShortcutRecordingActive(focused);
  }

  function appendDraftShortcutToken(token: string) {
    setDesktopShortcut((current) => ({
      ...current,
      draftAccelerator: appendAcceleratorToken(current.draftAccelerator, token),
      feedback: null,
    }));
  }

  function handleShortcutKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!desktopShortcut.enabled || desktopShortcut.loading) {
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      updateDraftShortcut(removeLastAcceleratorToken(desktopShortcut.draftAccelerator));
      return;
    }

    const token = keyEventToAcceleratorToken(event);

    if (!token) {
      return;
    }

    event.preventDefault();
    appendDraftShortcutToken(token);
  }

  function handleShortcutPreset(accelerator: string) {
    setDesktopShortcut((current) => ({
      ...current,
      enabled: true,
      draftAccelerator: accelerator,
      feedback: null,
    }));
    void saveDesktopShortcut({ enabled: true, accelerator });
  }

  async function loadSyncStatus() {
    try {
      const result = await window.api.getSyncStatus();

      setSyncStatus((current) => ({
        ...current,
        loading: false,
        linked: Boolean(result.linked),
        provider: result.provider ?? null,
        providerLabel: result.providerLabel ?? null,
        autoSyncEnabled: result.autoSyncEnabled ?? true,
        pendingCount: result.pendingCount ?? 0,
        feedback: result.ok
          ? current.feedback
          : { kind: "error", message: result.message || "Failed to load sync status." },
      }));
    } catch {
      setSyncStatus((current) => ({
        ...current,
        loading: false,
        feedback: { kind: "error", message: "Failed to load sync status." },
      }));
    }
  }

  async function loadAniListLinkStatus(
    feedback?: { kind: "success" | "error"; message: string },
    isCancelled = () => false
  ) {
    try {
      const result = await window.api.getAniListLinkStatus();

      if (isCancelled()) {
        return;
      }

      setAniListLink((current) => ({
        ...current,
        loading: false,
        linked: Boolean(result.ok && result.linked),
        account: result.account ?? null,
        conflict: null,
        feedback: result.ok
          ? feedback ?? current.feedback
          : { kind: "error", message: result.message || "Failed to load AniList link status." },
      }));
    } catch {
      if (!isCancelled()) {
        setAniListLink((current) => ({
          ...current,
          loading: false,
          conflict: null,
          feedback: { kind: "error", message: "Failed to load AniList link status." },
        }));
      }
    }
  }

  async function loadMalLinkStatus(
    feedback?: { kind: "success" | "error"; message: string },
    isCancelled = () => false
  ) {
    try {
      const result = await window.api.getMalLinkStatus();

      if (isCancelled()) {
        return;
      }

      setMalLink((current) => ({
        ...current,
        loading: false,
        linked: Boolean(result.ok && result.linked),
        account: result.account ?? null,
        conflict: null,
        feedback: result.ok
          ? feedback ?? current.feedback
          : { kind: "error", message: result.message || "Failed to load MyAnimeList link status." },
      }));
    } catch {
      if (!isCancelled()) {
        setMalLink((current) => ({
          ...current,
          loading: false,
          conflict: null,
          feedback: { kind: "error", message: "Failed to load MyAnimeList link status." },
        }));
      }
    }
  }

  async function updateAutoSync(enabled: boolean) {
    try {
      const result = await window.api.setAutoSync(enabled);

      setSyncStatus((current) => ({
        ...current,
        loading: false,
        linked: Boolean(result.linked),
        provider: result.provider ?? null,
        providerLabel: result.providerLabel ?? null,
        autoSyncEnabled: result.autoSyncEnabled ?? enabled,
        pendingCount: result.pendingCount ?? current.pendingCount,
        feedback: {
          kind: result.ok ? "success" : "error",
          message: result.ok
            ? enabled
              ? `Automatic ${result.providerLabel ?? "external"} sync enabled.`
              : `Automatic ${result.providerLabel ?? "external"} sync disabled.`
            : result.message || "Failed to update sync setting.",
        },
      }));
    } catch {
      setSyncStatus((current) => ({
        ...current,
        feedback: { kind: "error", message: "Failed to update sync setting." },
      }));
    }
  }

  async function runSyncNow() {
    try {
      setIsSyncing(true);
      setSyncProgress({
        operation: "manual-sync",
        stage: "processing",
        label: "Preparing queued sync changes...",
        current: 0,
        total: syncStatus.pendingCount || null,
      });
      const result = await onRunSyncNow();
      await loadSyncStatus();

      setSyncStatus((current) => ({
        ...current,
        pendingCount: result.pending ?? current.pendingCount,
        feedback: {
          kind: result.ok ? "success" : "error",
          message: result.message,
        },
      }));

      if (isSyncActivityOpen) {
        await loadSyncActivity(syncActivityTab);
      }
    } finally {
      window.setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress((current) =>
          current?.operation === "manual-sync" ? null : current
        );
      }, 700);
    }
  }

  async function pullFromRemote() {
    const operation = syncStatus.provider === "mal" ? "pull-mal" : "pull-anilist";

    try {
      setIsPullingFromRemote(true);
      setSyncProgress({
        operation,
        stage: "fetching",
        label: `Preparing ${syncTargetLabel} update...`,
        current: 0,
        total: null,
      });
      const result =
        syncStatus.provider === "mal"
          ? await onPullFromMal()
          : await onPullFromAniList();
      await loadSyncStatus();

      setSyncStatus((current) => ({
        ...current,
        feedback: {
          kind: result.ok ? "success" : "error",
          message: result.message,
        },
      }));

      if (isSyncActivityOpen) {
        await loadSyncActivity(syncActivityTab);
      }
    } finally {
      window.setTimeout(() => {
        setIsPullingFromRemote(false);
        setSyncProgress((current) =>
          current?.operation === operation ? null : current
        );
      }, 700);
    }
  }

  async function loadSyncActivity(tab: SyncActivityTab = syncActivityTab) {
    try {
      setSyncActivity((current) => ({ ...current, loading: true }));
      const result = await window.api.getSyncActivity();

      if (!result.ok) {
        setSyncStatus((current) => ({
          ...current,
          feedback: { kind: "error", message: result.message || "Failed to load sync activity." },
        }));
        return;
      }

      setSyncActivity({
        loading: false,
        pending: result.pending ?? [],
        completed: result.completed ?? [],
        failed: result.failed ?? [],
      });
      setSyncActivityTab(tab);
    } finally {
      setSyncActivity((current) => ({ ...current, loading: false }));
    }
  }

  async function openSyncActivity(tab: SyncActivityTab) {
    setIsSyncActivityOpen(true);
    setSyncActivityTab(tab);
    await loadSyncActivity(tab);
  }

  async function linkAniListAccount() {
    try {
      setAniListLink((current) => ({
        ...current,
        loading: true,
        conflict: null,
        feedback: { kind: "success", message: "Opening AniList in your browser..." },
      }));

      const result = await onLinkAniListAccount();

      if (result.ok && !result.needsConflictResolution) {
        await Promise.all([
          loadAniListLinkStatus({ kind: "success", message: result.message }),
          loadMalLinkStatus(),
          loadSyncStatus(),
        ]);
        return;
      }

      setAniListLink({
        loading: false,
        linked: Boolean(result.ok && result.linked),
        account: result.account ?? null,
        conflict: result.needsConflictResolution ? result.conflict ?? null : null,
        feedback: {
          kind: result.ok ? "success" : "error",
          message: result.message,
        },
      });
    } catch {
      setAniListLink((current) => ({
        ...current,
        loading: false,
        conflict: null,
        feedback: { kind: "error", message: "Failed to link AniList account." },
      }));
    }
  }

  async function resolveAniListConflict(action: "transfer" | "merge") {
    try {
      setAniListLink((current) => ({
        ...current,
        loading: true,
        feedback: {
          kind: "success",
          message: action === "merge" ? "Merging accounts..." : "Transferring AniList link...",
        },
      }));

      const result = await window.api.resolveAniListLinkConflict(action);

      if (result.ok) {
        await Promise.all([
          loadAniListLinkStatus({ kind: "success", message: result.message }),
          loadMalLinkStatus(),
          loadSyncStatus(),
        ]);
        return;
      }

      setAniListLink({
        loading: false,
        linked: Boolean(result.linked),
        account: result.account ?? null,
        conflict: aniListLink.conflict,
        feedback: {
          kind: "error",
          message: result.message,
        },
      });
    } catch {
      setAniListLink((current) => ({
        ...current,
        loading: false,
        feedback: { kind: "error", message: "Failed to resolve AniList link conflict." },
      }));
    }
  }

  async function linkMalAccount() {
    try {
      setMalLink((current) => ({
        ...current,
        loading: true,
        conflict: null,
        feedback: { kind: "success", message: "Opening MyAnimeList in your browser..." },
      }));

      const result = await onLinkMalAccount();

      if (result.ok && !result.needsConflictResolution) {
        await Promise.all([
          loadMalLinkStatus({ kind: "success", message: result.message }),
          loadAniListLinkStatus(),
          loadSyncStatus(),
        ]);
        return;
      }

      setMalLink({
        loading: false,
        linked: Boolean(result.ok && result.linked),
        account: result.account ?? null,
        conflict: result.needsConflictResolution ? result.conflict ?? null : null,
        feedback: {
          kind: result.ok ? "success" : "error",
          message: result.message,
        },
      });
    } catch {
      setMalLink((current) => ({
        ...current,
        loading: false,
        conflict: null,
        feedback: { kind: "error", message: "Failed to link MyAnimeList account." },
      }));
    }
  }

  async function resolveMalConflict(action: "transfer" | "merge") {
    try {
      setMalLink((current) => ({
        ...current,
        loading: true,
        feedback: {
          kind: "success",
          message:
            action === "merge" ? "Merging accounts..." : "Transferring MyAnimeList link...",
        },
      }));

      const result = await window.api.resolveMalLinkConflict(action);

      if (result.ok) {
        await Promise.all([
          loadMalLinkStatus({ kind: "success", message: result.message }),
          loadAniListLinkStatus(),
          loadSyncStatus(),
        ]);
        return;
      }

      setMalLink({
        loading: false,
        linked: Boolean(result.linked),
        account: result.account ?? null,
        conflict: malLink.conflict,
        feedback: {
          kind: "error",
          message: result.message,
        },
      });
    } catch {
      setMalLink((current) => ({
        ...current,
        loading: false,
        feedback: { kind: "error", message: "Failed to resolve MyAnimeList link conflict." },
      }));
    }
  }

  const selectedImportStatuses = useMemo(() => {
    if (!importPreview) {
      return [];
    }

    return importPreview.groups
      .filter((group) => group.items.some((item) => selectedImportIds.includes(item.animeId)))
      .map((group) => group.status);
  }, [importPreview, selectedImportIds]);

  function resetActiveImportAttempt() {
    activePreviewAbortRef.current?.abort();
    activePreviewAbortRef.current = null;
    activeImportAbortRef.current?.abort();
    activeImportAbortRef.current = null;
    setIsPreviewLoading(false);
    setIsImporting(false);
    setPreviewError(null);
    setImportPreview(null);
    setSelectedImportIds([]);
    setOpenImportGroups({});

    if (textImportInputRef.current) {
      textImportInputRef.current.value = "";
    }

    if (pdfImportInputRef.current) {
      pdfImportInputRef.current.value = "";
    }
  }

  async function openImportPreview() {
    const trimmedUsername = importUsername.trim();
    if (!trimmedUsername) {
      return;
    }

    try {
      setImportProvider("anilist");
      setIsPreviewLoading(true);
      setPreviewError(null);
      setImportFeedback(null);
      setImportPreview(null);
      setImportPreviewUsername(trimmedUsername);
      setSelectedImportIds([]);
      setOpenImportGroups({});
      setIsImportModalOpen(true);

      const result = (await window.api.previewAniListImport(
        trimmedUsername
      )) as ImportPreviewResponse;

      if (!result.ok || !result.preview) {
        setPreviewError(result.message || "Failed to preview AniList list.");
        return;
      }

      setImportPreview(result.preview);
      setSelectedImportIds(
        result.preview.groups.flatMap((group) => group.items.map((item) => item.animeId))
      );
      setOpenImportGroups(
        Object.fromEntries(
          result.preview.groups.map((group, index) => [group.status, index < 2])
        )
      );
    } catch (error) {
      console.error("Failed to preview AniList import:", error);
      setPreviewError(getErrorMessage(error, "Failed to preview AniList list."));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function openMalImportPreview() {
    try {
      setImportProvider("mal");
      setIsPreviewLoading(true);
      setPreviewError(null);
      setImportFeedback(null);
      setImportPreview(null);
      setSelectedImportIds([]);
      setOpenImportGroups({});
      setIsImportModalOpen(true);

      const result = (await window.api.previewMalImport()) as ImportPreviewResponse;

      if (!result.ok || !result.preview) {
        setPreviewError(result.message || "Failed to preview MyAnimeList list.");
        return;
      }

      setImportPreviewUsername(result.username || "MyAnimeList");
      setImportPreview(result.preview);
      setSelectedImportIds(
        result.preview.groups.flatMap((group) => group.items.map((item) => item.animeId))
      );
      setOpenImportGroups(
        Object.fromEntries(
          result.preview.groups.map((group, index) => [group.status, index < 2])
        )
      );
    } catch (error) {
      console.error("Failed to preview MyAnimeList import:", error);
      setPreviewError(getErrorMessage(error, "Failed to preview MyAnimeList list."));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function openTextImportPreview(file: File | null) {
    if (!file) {
      return;
    }

    const controller = new AbortController();
    activePreviewAbortRef.current?.abort();
    activePreviewAbortRef.current = controller;

    try {
      setImportProvider("txt");
      setTextImportFileName(file.name);
      setIsPreviewLoading(true);
      setPreviewError(null);
      setImportFeedback(null);
      setImportPreview(null);
      setImportPreviewUsername(file.name);
      setSelectedImportIds([]);
      setOpenImportGroups({});
      setIsImportModalOpen(true);

      const text = await file.text();
      if (controller.signal.aborted) {
        return;
      }

      const result = (await window.api.previewTextImport(
        text,
        settings.hideAdultContent,
        { signal: controller.signal }
      )) as ImportPreviewResponse;

      if (activePreviewAbortRef.current !== controller || controller.signal.aborted) {
        return;
      }

      if (!result.ok || !result.preview) {
        setPreviewError(result.message || "Failed to preview text list.");
        return;
      }

      setImportPreview(result.preview);
      setSelectedImportIds(
        result.preview.groups.flatMap((group) => group.items.map((item) => item.animeId))
      );
      setOpenImportGroups(
        Object.fromEntries(
          result.preview.groups.map((group, index) => [group.status, index < 2])
        )
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      console.error("Failed to preview text import:", error);
      setPreviewError(getErrorMessage(error, "Failed to preview text list."));
    } finally {
      if (activePreviewAbortRef.current === controller) {
        activePreviewAbortRef.current = null;
        setIsPreviewLoading(false);
      }

      if (textImportInputRef.current) {
        textImportInputRef.current.value = "";
      }
    }
  }

  async function openPdfImportPreview(file: File | null) {
    if (!file) {
      return;
    }

    const controller = new AbortController();
    activePreviewAbortRef.current?.abort();
    activePreviewAbortRef.current = controller;

    try {
      setImportProvider("pdf");
      setTextImportFileName(file.name);
      setIsPreviewLoading(true);
      setPreviewError(null);
      setImportFeedback(null);
      setImportPreview(null);
      setImportPreviewUsername(file.name);
      setSelectedImportIds([]);
      setOpenImportGroups({});
      setIsImportModalOpen(true);

      const pdfBase64 = await fileToBase64(file);
      if (controller.signal.aborted) {
        return;
      }

      const result = (await window.api.previewPdfImport(
        pdfBase64,
        settings.hideAdultContent,
        { signal: controller.signal }
      )) as ImportPreviewResponse;

      if (activePreviewAbortRef.current !== controller || controller.signal.aborted) {
        return;
      }

      if (!result.ok || !result.preview) {
        setPreviewError(result.message || "Failed to preview PDF list.");
        return;
      }

      setImportPreview(result.preview);
      setSelectedImportIds(
        result.preview.groups.flatMap((group) => group.items.map((item) => item.animeId))
      );
      setOpenImportGroups(
        Object.fromEntries(
          result.preview.groups.map((group, index) => [group.status, index < 2])
        )
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      console.error("Failed to preview PDF import:", error);
      setPreviewError(getErrorMessage(error, "Failed to preview PDF list."));
    } finally {
      if (activePreviewAbortRef.current === controller) {
        activePreviewAbortRef.current = null;
        setIsPreviewLoading(false);
      }

      if (pdfImportInputRef.current) {
        pdfImportInputRef.current.value = "";
      }
    }
  }

  async function importBackupFile(file: File | null) {
    if (!file || isImportingBackup) {
      return;
    }

    try {
      setIsImportingBackup(true);
      setBackupFeedback(null);
      const text = await file.text();
      const backup = JSON.parse(text);
      const result = await onImportLocalBackup(backup);

      setBackupFeedback({
        kind: result.ok ? "success" : "error",
        message: result.message,
      });
    } catch {
      setBackupFeedback({
        kind: "error",
        message: "Could not read this backup file.",
      });
    } finally {
      setIsImportingBackup(false);
      if (backupImportInputRef.current) {
        backupImportInputRef.current.value = "";
      }
    }
  }

  return (
    <div
      ref={settingsScrollRef}
      className="scroll-container h-full overflow-y-auto px-6 py-24 text-white"
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/35">
              Preferences
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
              Settings
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              Organize the app around general behavior, visual customization,
              content preferences, accounts, sync, and local data.
            </p>
          </div>

          <button
            type="button"
            onClick={onResetSettings}
            className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Reset defaults
          </button>
        </header>

        <div className="space-y-4">
          <div ref={rememberSectionRef("general")} className="scroll-mt-24">
            <AccordionSection
              icon={SparklesIcon}
              title="General"
              description="App information, startup behavior, shortcuts, and welcome screen access."
              summary={[
                `Version ${APP_VERSION}`,
                ...(window.desktopStartup
                  ? [desktopStartup.openAtLogin ? "Launches at login" : "Manual launch"]
                  : []),
                "Welcome replay",
              ]}
              open={openSection === "general"}
              onToggle={() => toggleSection("general")}
            >
            <div className="space-y-5">
              <div>
                <SectionHeading
                  icon={SparklesIcon}
                  title="About Seenary"
                  description="Quick app information for this install."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <InfoCard label="Version" value={APP_VERSION} />
                  <InfoCard label="Profile" value={username} />
                </div>
              </div>

              {window.desktopStartup && (
                <div>
                  <SectionHeading
                    icon={RocketLaunchIcon}
                    title="Startup"
                    description="Choose whether Seenary should open when you sign in."
                  />

                  <div className="space-y-3">
                    <ToggleSetting
                      icon={RocketLaunchIcon}
                      title="Launch Seenary at login"
                      description={
                        desktopStartup.available
                          ? "Open the desktop app automatically after you sign in to your computer."
                          : "This option is available after installing the desktop app."
                      }
                      checked={desktopStartup.openAtLogin}
                      disabled={!desktopStartup.available || desktopStartup.loading}
                      onChange={saveDesktopStartup}
                    />

                    {desktopStartup.feedback && (
                      <p
                        className={`rounded-2xl border px-3 py-2 text-sm ${
                          desktopStartup.feedback.kind === "success"
                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                            : "border-rose-400/20 bg-rose-400/10 text-rose-100"
                        }`}
                      >
                        {desktopStartup.feedback.message}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {desktopShortcut.available && (
                <div>
                  <SectionHeading
                    icon={CommandLineIcon}
                    title="Desktop shortcut"
                    description="Choose the global shortcut that hides or shows the desktop app."
                  />

                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="font-semibold text-white">Hide/show Seenary</p>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
                          Use Electron accelerator format, such as Control+Shift+Space or Alt+Space.
                          Turn it off if the shortcut conflicts with another app.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={desktopShortcut.loading}
                        onClick={() => saveDesktopShortcut({ enabled: !desktopShortcut.enabled })}
                        className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          desktopShortcut.enabled
                            ? "border border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/8"
                            : "border border-white/10 bg-white text-black hover:opacity-90"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {desktopShortcut.enabled ? "Disable shortcut" : "Enable shortcut"}
                      </button>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 md:flex-row">
                      <div className="relative min-w-0 flex-1">
                        <input
                          value={desktopShortcut.draftAccelerator}
                          disabled={!desktopShortcut.enabled || desktopShortcut.loading}
                          onFocus={() => setShortcutRecorderFocused(true)}
                          onBlur={() => setShortcutRecorderFocused(false)}
                          onKeyDown={handleShortcutKeyDown}
                          onChange={(event) => updateDraftShortcut(normalizeAcceleratorInput(event.target.value))}
                          className={`min-w-0 w-full rounded-2xl border bg-black/20 px-4 py-3 pr-12 text-sm text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                            isShortcutRecorderFocused
                              ? "border-white/25"
                              : "border-white/10"
                          }`}
                          placeholder="Press a shortcut combination"
                          aria-label="Hide/show shortcut"
                        />
                        {desktopShortcut.draftAccelerator && (
                          <button
                            type="button"
                            disabled={!desktopShortcut.enabled || desktopShortcut.loading}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => updateDraftShortcut("")}
                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            title="Clear shortcut"
                            aria-label="Clear shortcut"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!desktopShortcut.enabled || desktopShortcut.loading}
                        onClick={() => saveDesktopShortcut({ enabled: true })}
                        className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save shortcut
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {SHORTCUT_PRESETS.map((accelerator) => (
                        <button
                          key={accelerator}
                          type="button"
                          disabled={desktopShortcut.loading}
                          onClick={() => handleShortcutPreset(accelerator)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            normalizeAcceleratorInput(desktopShortcut.draftAccelerator) === accelerator
                              ? "border-white/25 bg-white/12 text-white"
                              : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/8 hover:text-white"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {accelerator}
                        </button>
                      ))}
                    </div>

                    {desktopShortcut.feedback && (
                      <p
                        className={`mt-4 rounded-2xl border px-3 py-2 text-sm ${
                          desktopShortcut.feedback.kind === "success"
                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                            : "border-rose-400/20 bg-rose-400/10 text-rose-100"
                        }`}
                      >
                        {desktopShortcut.feedback.message}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <ActionCard
                  icon={SparklesIcon}
                  title="Show welcome screen again"
                  description="Reopen onboarding whenever you want to revisit the welcome flow."
                  actionLabel="Open welcome"
                  onAction={onShowWelcomeScreen}
                />

                <ActionCard
                  icon={ArrowPathIcon}
                  title="Reset preferences"
                  description="Return the settings panel to the default app behavior and visual style."
                  actionLabel="Reset defaults"
                  onAction={onResetSettings}
                />
              </div>
            </div>
            </AccordionSection>
          </div>

          <div ref={rememberSectionRef("appearance")} className="scroll-mt-24">
            <AccordionSection
              icon={PaintBrushIcon}
              title="Appearance"
              description="Visual customization for the app."
              summary={[
                accentSummary,
                `${overlayOpacity}% opacity`,
                `${getNavbarStyleLabel(settings.navbarStyle)} navbar`,
                `${getBrowseCardStyleLabel(settings.browseCardStyle)} cards`,
                `${backgroundDim}% dim`,
                `${getAnimationLevelLabel(settings.animationLevel)} motion`,
                settings.compactMode ? "Compact mode on" : "Compact mode off",
                `${getCardDensityLabel(settings.homeDensity)} Personal page`,
                `${getDiscoverDensityLabel(settings.discoverDensity)} Discover page`,
                `${getCardDensityLabel(settings.myListDensity)} My List page`,
              ]}
              open={openSection === "appearance"}
              onToggle={() => toggleSection("appearance")}
            >
            <div className="space-y-6">
              <div>
                <SectionHeading
                  icon={PaintBrushIcon}
                  title="Theme color"
                  description="Pick the accent color used for selected controls and highlights."
                />

                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {THEME_OPTIONS.map((option) => {
                    const selected = settings.themeAccent === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ themeAccent: option.value })}
                        className={`rounded-3xl border p-4 text-left shadow-xl transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? `border-white/25 bg-white/10 ${option.glow}`
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className="h-8 w-8 rounded-2xl border border-white/20"
                            style={{ backgroundColor: option.color }}
                          />
                          {selected && (
                            <span
                              className="rounded-full px-1.5 py-1 text-black"
                              style={{ backgroundColor: option.color }}
                            >
                              <CheckIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                        <p className="mt-4 text-sm font-semibold text-white">
                          {option.label}
                        </p>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        themeAccent: "custom",
                        customAccentColor,
                      })
                    }
                    className={`rounded-3xl border p-4 text-left shadow-xl transition ${
                      settings.themeAccent === "custom"
                        ? "border-white/25 bg-white/10"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/8"
                    }`}
                    style={
                      settings.themeAccent === "custom"
                        ? {
                            boxShadow: `0 20px 25px -5px ${customAccentColor}33, 0 8px 10px -6px ${customAccentColor}33`,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className="h-8 w-8 rounded-2xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/55"
                        style={{ backgroundColor: customAccentColor }}
                      />
                      {settings.themeAccent === "custom" && (
                        <span
                          className="rounded-full px-1.5 py-1 text-black"
                          style={{ backgroundColor: customAccentColor }}
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <p className="mt-4 text-sm font-semibold text-white">Custom</p>
                    <input
                      type="color"
                      value={customAccentColor}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        onUpdateSettings({
                          themeAccent: "custom",
                          customAccentColor: event.target.value,
                        })
                      }
                      className="mt-3 h-8 w-full cursor-pointer rounded-xl border border-white/10 bg-black/30 p-1"
                      aria-label="Custom accent color"
                    />
                  </button>
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={PaintBrushIcon}
                  title="Overlay surface"
                  description="Tune how Seenary sits over the rest of your desktop."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {OVERLAY_BACKGROUND_OPTIONS.map((option) => {
                    const selected = settings.overlayBackground === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ overlayBackground: option.value })}
                        className={`rounded-3xl border p-5 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? "border-white/25 bg-white/10"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-white">{option.label}</p>
                            <p className="mt-2 text-sm leading-6 text-white/45">
                              {option.description}
                            </p>
                          </div>
                          {selected && (
                            <span className="rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                              <CheckIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={PaintBrushIcon}
                  title="Navbar style"
                  description="Choose how the top controls sit over Seenary. Navigation and search behavior stay the same."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {NAVBAR_STYLE_OPTIONS.map((option) => {
                    const selected = settings.navbarStyle === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ navbarStyle: option.value })}
                        className={`rounded-3xl border p-4 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <NavbarStylePreview style={option.value} />
                        <div className="mt-4 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{option.label}</p>
                            <p className="mt-1.5 text-sm leading-5 text-white/45">
                              {option.description}
                            </p>
                          </div>
                          {selected && (
                            <span className="shrink-0 rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                              <CheckIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={PaintBrushIcon}
                  title="Browsing card style"
                  description="Change poster cards on Personal, Discover, and search. My List stays unchanged."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {BROWSE_CARD_STYLE_OPTIONS.map((option) => {
                    const selected = settings.browseCardStyle === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ browseCardStyle: option.value })}
                        className={`rounded-3xl border p-4 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <BrowseCardStylePreview style={option.value} />
                        <div className="mt-4 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{option.label}</p>
                            <p className="mt-1.5 text-sm leading-5 text-white/45">
                              {option.description}
                            </p>
                          </div>
                          {selected && (
                            <span className="shrink-0 rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                              <CheckIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">Overlay opacity</p>
                      <p className="mt-2 text-sm leading-6 text-white/45">
                        Lower values reveal more of whatever is behind the app.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm font-semibold text-white/75">
                      {overlayOpacity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={70}
                    max={100}
                    step={5}
                    value={overlayOpacity}
                    onChange={(event) =>
                      onUpdateSettings({ overlayOpacity: Number(event.target.value) })
                    }
                    className="mt-5 w-full accent-[var(--app-accent)]"
                  />
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">Background dim</p>
                      <p className="mt-2 text-sm leading-6 text-white/45">
                        Darken the desktop behind glass surfaces without changing the app shell.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm font-semibold text-white/75">
                      {backgroundDim}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={backgroundDim}
                    onChange={(event) =>
                      onUpdateSettings({ backgroundDim: Number(event.target.value) })
                    }
                    className="mt-5 w-full accent-[var(--app-accent)]"
                  />
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={SparklesIcon}
                  title="Motion"
                  description="Choose how lively Seenary should feel while you browse."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {ANIMATION_LEVEL_OPTIONS.map((option) => {
                    const selected = settings.animationLevel === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ animationLevel: option.value })}
                        className={`rounded-3xl border p-5 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? "border-white/25 bg-white/10"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-white">{option.label}</p>
                            <p className="mt-2 text-sm leading-6 text-white/45">
                              {option.description}
                            </p>
                          </div>
                          {selected && (
                            <span className="rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                              <CheckIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <ToggleSetting
                icon={PaintBrushIcon}
                title="Compact mode"
                description="Slightly shrink text and controls, shorten the navbar, and slim down scrollbars so more fits on screen."
                checked={settings.compactMode}
                onChange={(checked) => onUpdateSettings({ compactMode: checked })}
              />

              <div>
                <SectionHeading
                  icon={SparklesIcon}
                  title="Personal page density"
                  description="Choose how much room Personal page shelves give each saved anime card."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {CARD_DENSITY_OPTIONS.map((option) => {
                    const selected = settings.homeDensity === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ homeDensity: option.value })}
                        className={`rounded-3xl border p-5 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? "border-white/25 bg-white/10"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{option.label}</p>
                            <p className="mt-3 text-sm leading-6 text-white/50">
                              {option.description}
                            </p>
                          </div>
                          {selected && (
                            <span className="rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                              <CheckIcon className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={SparklesIcon}
                  title="Discover page density"
                  description="Choose how much space each Discover page title gets while browsing."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {DISCOVER_DENSITY_OPTIONS.map((option) => {
                    const selected = settings.discoverDensity === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ discoverDensity: option.value })}
                        className={`rounded-3xl border p-5 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? "border-white/25 bg-white/10"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-white">{option.label}</p>
                            <p className="mt-2 text-sm leading-6 text-white/45">
                              {option.description}
                            </p>
                          </div>
                          {selected && (
                            <span className="rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                              <CheckIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={BookmarkIcon}
                  title="My List page density"
                  description="Choose how much detail each My List page entry shows while managing your library."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {CARD_DENSITY_OPTIONS.map((option) => {
                    const selected = settings.myListDensity === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ myListDensity: option.value })}
                        className={`rounded-3xl border p-5 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? "border-white/25 bg-white/10"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{option.label}</p>
                            <p className="mt-3 text-sm leading-6 text-white/50">
                              {option.description}
                            </p>
                          </div>
                          {selected && (
                            <span className="rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                              <CheckIcon className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {window.desktopWindow && (
                <div>
                  <SectionHeading
                    icon={PaintBrushIcon}
                    title="Window layout"
                    description="Change size without losing Seenary's place, or return to your last custom size."
                  />

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    {WINDOW_PRESET_OPTIONS.map((option) => {
                      const selected = desktopWindow.preset === option.value;

                      if (option.value === "custom") {
                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={desktopWindow.loading}
                            onClick={() => {
                              const customBounds =
                                desktopWindow.customBounds ?? desktopWindow.bounds;
                              if (customBounds) {
                                applyDesktopWindowCustomSize({
                                  width: customBounds.width,
                                  height: customBounds.height,
                                });
                              }
                            }}
                            className={`rounded-3xl border p-5 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 disabled:cursor-not-allowed disabled:opacity-60 ${
                              selected
                                ? "border-white/25 bg-white/10"
                                : "border-white/10 bg-white/[0.03]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-semibold text-white">{option.label}</p>
                                <p className="mt-2 text-sm leading-6 text-white/45">
                                  {option.description}
                                </p>
                              </div>
                              {selected && (
                                <span className="rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                                  <CheckIcon className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      }

                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={desktopWindow.loading}
                          onClick={() => {
                            if (option.value !== "custom") {
                              applyDesktopWindowPreset(option.value);
                            }
                          }}
                          className={`rounded-3xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-white/55 disabled:cursor-not-allowed disabled:opacity-60 ${
                            selected
                              ? "border-white/25 bg-white/10"
                              : "border-white/10 bg-white/[0.03]"
                          } ${option.selectable ? "hover:bg-white/8" : "cursor-default"}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-semibold text-white">{option.label}</p>
                              <p className="mt-2 text-sm leading-6 text-white/45">
                                {option.description}
                              </p>
                            </div>
                            {selected && (
                              <span className="rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                                <CheckIcon className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {desktopWindow.preset === "custom" && (
                    <div className="mt-3 rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4">
                      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,1fr)_8rem_8rem]">
                        <p className="text-sm text-white/45">
                          <span className="font-semibold text-white">Custom size</span>
                          <span className="mx-2 text-white/25">/</span>
                          Minimum {MIN_DESKTOP_WINDOW_SIZE.width} x{" "}
                          {MIN_DESKTOP_WINDOW_SIZE.height} px
                        </p>

                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                          Width
                          <input
                            type="number"
                            min={MIN_DESKTOP_WINDOW_SIZE.width}
                            step={1}
                            value={desktopWindowDraft.width}
                            onChange={(event) =>
                              handleDesktopWindowSizeInput("width", event.target.value)
                            }
                            onBlur={(event) =>
                              commitDesktopWindowSizeInput("width", event.target.value)
                            }
                            className="mt-2 h-10 w-full rounded-2xl border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none transition focus:border-white/25"
                          />
                        </label>

                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                          Height
                          <input
                            type="number"
                            min={MIN_DESKTOP_WINDOW_SIZE.height}
                            step={1}
                            value={desktopWindowDraft.height}
                            onChange={(event) =>
                              handleDesktopWindowSizeInput("height", event.target.value)
                            }
                            onBlur={(event) =>
                              commitDesktopWindowSizeInput("height", event.target.value)
                            }
                            className="mt-2 h-10 w-full rounded-2xl border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none transition focus:border-white/25"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {desktopWindow.feedback && (
                    <p
                      className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${
                        desktopWindow.feedback.kind === "success"
                          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                          : "border-rose-400/20 bg-rose-400/10 text-rose-100"
                      }`}
                    >
                      {desktopWindow.feedback.message}
                    </p>
                  )}
                </div>
              )}

            </div>
            </AccordionSection>
          </div>

          <div ref={rememberSectionRef("content")} className="scroll-mt-24">
            <AccordionSection
              icon={EyeSlashIcon}
              title="Content"
              description="Control anime title display and what appears in discovery surfaces."
              summary={[
                titleLabel,
                settings.hideAdultContent ? "18+ hidden" : "18+ visible",
              ]}
              open={openSection === "content"}
              onToggle={() => toggleSection("content")}
            >
            <div className="space-y-6">
              <div>
                <SectionHeading
                  icon={LanguageIcon}
                  title="Anime title language"
                  description="Choose which title version should be preferred throughout the app."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {TITLE_OPTIONS.map((option) => {
                    const selected = settings.titleLanguage === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ titleLanguage: option.value })}
                        className={`rounded-3xl border p-5 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? "border-white/25 bg-white/10"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-white">{option.label}</p>
                            <p className="mt-2 text-sm leading-6 text-white/45">
                              {option.description}
                            </p>
                          </div>
                          {selected && (
                            <span className="rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                              <CheckIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={EyeSlashIcon}
                  title="Discovery filters"
                  description="Choose which AniList content can appear while browsing."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <ToggleSetting
                    icon={EyeSlashIcon}
                    title="Hide 18+ content"
                    description="Hide adult anime from search results and trending picks."
                    checked={settings.hideAdultContent}
                    onChange={(checked) =>
                      onUpdateSettings({ hideAdultContent: checked })
                    }
                  />
                </div>
              </div>
            </div>
            </AccordionSection>
          </div>

          <div ref={rememberSectionRef("home")} className="scroll-mt-24">
            <AccordionSection
              icon={HomeIcon}
              title="Home"
              description="How the home screen behaves when you land in the app."
              summary={[
                `Starts on ${getStartViewLabel(settings.startView)}`,
                settings.showTrendingCarousel ? "Carousel on" : "Carousel off",
                settings.autoRotateTrending ? "Auto rotate" : "Manual",
                settings.autoScrollHomeShelves ? "Shelves move" : "Shelves still",
              ]}
              open={openSection === "home"}
              onToggle={() => toggleSection("home")}
            >
            <div className="space-y-6">
              <div>
                <SectionHeading
                  icon={HomeIcon}
                  title="Home behavior"
                  description="Choose how the home page should greet you when the app opens."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <ToggleSetting
                    icon={SparklesIcon}
                    title="Trending carousel"
                    description="Show the large trending anime showcase at the top of home."
                    checked={settings.showTrendingCarousel}
                    onChange={(checked) =>
                      onUpdateSettings({ showTrendingCarousel: checked })
                    }
                  />

                  <ToggleSetting
                    icon={PlayCircleIcon}
                    title="Auto-rotate carousel"
                    description="Let trending picks advance automatically while home is open."
                    checked={settings.autoRotateTrending}
                    disabled={!settings.showTrendingCarousel}
                    onChange={(checked) =>
                      onUpdateSettings({ autoRotateTrending: checked })
                    }
                  />

                  <ToggleSetting
                    icon={ArrowPathIcon}
                    title="Auto-scroll shelves"
                    description="Occasionally move Continue Watching and Planned Picks when you are not hovering them."
                    checked={settings.autoScrollHomeShelves}
                    onChange={(checked) =>
                      onUpdateSettings({ autoScrollHomeShelves: checked })
                    }
                  />
                </div>

                <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">Quick note</p>
                  <p className="mt-2 text-sm leading-6 text-white/45">
                    Carousel rotation only matters when the trending shelf is visible.
                    If you turn the carousel off, the home page starts directly with
                    your own library sections.
                  </p>
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={HomeIcon}
                  title="Startup view"
                  description="Choose what Seenary shows first after you log in."
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {START_VIEW_OPTIONS.map((option) => {
                    const selected = settings.startView === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdateSettings({ startView: option.value })}
                        className={`rounded-3xl border p-5 text-left transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-white/55 ${
                          selected
                            ? "border-white/25 bg-white/10"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-white">{option.label}</p>
                            <p className="mt-2 text-sm leading-6 text-white/45">
                              {option.description}
                            </p>
                          </div>
                          {selected && (
                            <span className="rounded-full bg-[var(--app-accent)] px-1.5 py-1 text-black">
                              <CheckIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            </AccordionSection>
          </div>

          <div ref={rememberSectionRef("account")} className="scroll-mt-24">
            <AccordionSection
              icon={LinkIcon}
              title="Account Links"
              description="Connect external accounts for authenticated imports and future sync."
              summary={[
                aniListLink.loading
                  ? "Checking AniList"
                  : aniListLink.linked
                    ? `AniList ${aniListLink.account?.anilistUsername ?? "linked"}`
                    : "AniList not linked",
                malLink.loading
                  ? "Checking MAL"
                  : malLink.linked
                    ? `MAL ${malLink.account?.malUsername ?? "linked"}`
                    : "MAL not linked",
              ]}
              open={openSection === "account"}
              onToggle={() => toggleSection("account")}
            >
            <div>
              <SectionHeading
                icon={LinkIcon}
                title="AniList account"
                description="Link your local profile to AniList so sync can use a verified account identity later."
              />

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-white">
                      {aniListLink.linked
                        ? `Connected as ${aniListLink.account?.anilistUsername ?? "AniList user"}`
                        : "No AniList account linked"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/45">
                      {aniListLink.linked
                        ? "This local account is ready for authenticated AniList operations."
                        : "Authorize AniList in your browser and attach it to this local account."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={linkAniListAccount}
                    disabled={aniListLink.loading}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                      aniListLink.loading
                        ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                        : "border border-white/10 bg-white text-black hover:opacity-90"
                    }`}
                  >
                    <LinkIcon className="h-4 w-4" />
                    {aniListLink.loading
                      ? "Checking..."
                      : aniListLink.linked
                        ? "Relink AniList"
                        : "Link AniList"}
                  </button>
                </div>

                {aniListLink.account && (
                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <LinkStat label="AniList ID" value={String(aniListLink.account.anilistUserId)} />
                    <LinkStat
                      label="Original name"
                      value={aniListLink.account.originalAniListUsername}
                    />
                    <LinkStat
                      label="Last import"
                      value={
                        aniListLink.account.lastImportAt
                          ? formatDateTime(aniListLink.account.lastImportAt)
                          : "Not yet"
                      }
                    />
                  </div>
                )}

                {aniListLink.conflict && (
                  <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4">
                    <p className="text-sm font-semibold text-white">
                      AniList account already linked
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/70">
                      {aniListLink.conflict.anilistUsername} is linked to{" "}
                      <span className="font-semibold text-white">
                        {aniListLink.conflict.sourceUser?.username ?? "another local account"}
                      </span>
                      . Transfer moves only the AniList connection here. Merge brings over
                      non-duplicate list entries and removes that old local account.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={aniListLink.loading}
                        onClick={() => resolveAniListConflict("transfer")}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Transfer link here
                      </button>
                      <button
                        type="button"
                        disabled={aniListLink.loading}
                        onClick={() => resolveAniListConflict("merge")}
                        className="rounded-2xl border border-white/10 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Merge into this account
                      </button>
                    </div>
                  </div>
                )}

                {aniListLink.feedback && (
                  <div
                    className={`mt-5 rounded-3xl border p-4 ${
                      aniListLink.feedback.kind === "success"
                        ? "border-emerald-400/20 bg-emerald-400/10"
                        : "border-rose-400/20 bg-rose-400/10"
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">
                      {aniListLink.feedback.message}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5">
              <SectionHeading
                icon={LinkIcon}
                title="MyAnimeList account"
                description="Link your local profile to MyAnimeList so the app can recognize your MAL identity."
              />

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-white">
                      {malLink.linked
                        ? `Connected as ${malLink.account?.malUsername ?? "MyAnimeList user"}`
                        : "No MyAnimeList account linked"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/45">
                      {malLink.linked
                        ? "This local account can be matched back to your MyAnimeList profile."
                        : "Authorize MyAnimeList in your browser and attach it to this local account."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={linkMalAccount}
                    disabled={malLink.loading}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                      malLink.loading
                        ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                        : "border border-white/10 bg-white text-black hover:opacity-90"
                    }`}
                  >
                    <LinkIcon className="h-4 w-4" />
                    {malLink.loading
                      ? "Checking..."
                      : malLink.linked
                        ? "Relink MyAnimeList"
                        : "Link MyAnimeList"}
                  </button>
                </div>

                {malLink.account && (
                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <LinkStat label="MAL ID" value={String(malLink.account.malUserId)} />
                    <LinkStat label="Original name" value={malLink.account.originalMalUsername} />
                    <LinkStat
                      label="Last import"
                      value={
                        malLink.account.lastImportAt
                          ? formatDateTime(malLink.account.lastImportAt)
                          : "Not yet"
                      }
                    />
                  </div>
                )}

                {malLink.conflict && (
                  <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4">
                    <p className="text-sm font-semibold text-white">
                      MyAnimeList account already linked
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/70">
                      {malLink.conflict.malUsername} is linked to{" "}
                      <span className="font-semibold text-white">
                        {malLink.conflict.sourceUser?.username ?? "another local account"}
                      </span>
                      . Transfer moves only the MyAnimeList connection here. Merge brings over
                      non-duplicate list entries and removes that old local account.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={malLink.loading}
                        onClick={() => resolveMalConflict("transfer")}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Transfer link here
                      </button>
                      <button
                        type="button"
                        disabled={malLink.loading}
                        onClick={() => resolveMalConflict("merge")}
                        className="rounded-2xl border border-white/10 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Merge into this account
                      </button>
                    </div>
                  </div>
                )}

                {malLink.feedback && (
                  <div
                    className={`mt-5 rounded-3xl border p-4 ${
                      malLink.feedback.kind === "success"
                        ? "border-emerald-400/20 bg-emerald-400/10"
                        : "border-rose-400/20 bg-rose-400/10"
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">
                      {malLink.feedback.message}
                    </p>
                  </div>
                )}
              </div>
            </div>
            </AccordionSection>
          </div>

          <div ref={rememberSectionRef("sync")} className="scroll-mt-24">
            <AccordionSection
              icon={ArrowPathIcon}
              title={syncStatus.linked ? `${syncProviderLabel} Sync` : "External Sync"}
              description={
                syncStatus.linked
                  ? `Push local list changes to your linked ${syncProviderLabel} account.`
                  : "Link an external account before syncing local list changes."
              }
              summary={[
                syncStatus.linked
                  ? syncStatus.autoSyncEnabled
                    ? "Auto on"
                    : "Auto off"
                  : "Auto unavailable",
                `${syncStatus.pendingCount} queued`,
                syncStatus.linked ? syncProviderLabel : "Unavailable",
              ]}
              open={openSection === "sync"}
              onToggle={() => toggleSection("sync")}
            >
            <div className="space-y-5">
              <SectionHeading
                icon={ArrowPathIcon}
                title="Sync controls"
                description={
                  syncStatus.linked
                    ? `Local edits are queued first, then pushed to ${syncProviderLabel} when sync runs.`
                    : "Sync is unavailable until you link AniList or MyAnimeList."
                }
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <ToggleSetting
                  icon={ArrowPathIcon}
                  title="Automatic sync"
                  description={
                    syncStatus.linked
                      ? "Push queued local changes after a short delay."
                      : "Link AniList or MyAnimeList before automatic sync can run."
                  }
                  checked={syncStatus.autoSyncEnabled}
                  disabled={!syncStatus.linked || syncStatus.loading}
                  onChange={updateAutoSync}
                />

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="font-semibold text-white">Manual sync</p>
                  <p className="mt-2 text-sm leading-6 text-white/45">
                    {syncStatus.pendingCount > 0
                      ? `${syncStatus.pendingCount} queued change${syncStatus.pendingCount === 1 ? "" : "s"} waiting to sync or retry.`
                      : syncStatus.linked
                        ? `No queued ${syncProviderLabel} changes right now.`
                        : "Sync is unavailable because no external account is linked."}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <ProgressActionButton
                      onClick={runSyncNow}
                      disabled={!syncStatus.linked || isSyncing}
                      active={isSyncing}
                      progress={syncProgress?.operation === "manual-sync" ? syncProgress : null}
                    >
                      {isSyncing ? "Syncing..." : "Sync now"}
                    </ProgressActionButton>

                    <button
                      type="button"
                      onClick={() => openSyncActivity("pending")}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/8 hover:text-white"
                    >
                      View activity
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="font-semibold text-white">Update from {syncTargetLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-white/45">
                    {!syncStatus.linked
                      ? "Link an external account before pulling remote list updates."
                      : isAniListSync
                      ? "Pull your full AniList library and replace local list fields that differ."
                      : "Pull your full MyAnimeList library and replace local list fields that differ."}
                  </p>

                  <ProgressActionButton
                    onClick={pullFromRemote}
                    disabled={!syncStatus.linked || isPullingFromRemote}
                    active={isPullingFromRemote}
                    progress={
                      syncProgress?.operation === (isAniListSync ? "pull-anilist" : "pull-mal")
                        ? syncProgress
                        : null
                    }
                    className="mt-5"
                  >
                    {isPullingFromRemote ? "Updating..." : `Update from ${syncTargetLabel}`}
                  </ProgressActionButton>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => openSyncActivity("pending")}
                  className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                >
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Queued</p>
                  <p className="mt-1 text-xl font-semibold text-white">{syncStatus.pendingCount}</p>
                </button>
                <button
                  type="button"
                  onClick={() => openSyncActivity("completed")}
                  className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                >
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Completed</p>
                  <p className="mt-1 text-sm font-semibold text-white">Open log</p>
                </button>
                <button
                  type="button"
                  onClick={() => openSyncActivity("failed")}
                  className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                >
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Failed</p>
                  <p className="mt-1 text-sm font-semibold text-white">Open log</p>
                </button>
              </div>

              {syncStatus.feedback && (
                <div
                  className={`rounded-3xl border p-4 ${
                    syncStatus.feedback.kind === "success"
                      ? "border-emerald-400/20 bg-emerald-400/10"
                      : "border-rose-400/20 bg-rose-400/10"
                  }`}
                >
                  <p className="text-sm font-semibold text-white">
                    {syncStatus.feedback.message}
                  </p>
                </div>
              )}
            </div>
            </AccordionSection>
          </div>

          <div ref={rememberSectionRef("data")} className="scroll-mt-24">
            <AccordionSection
              icon={CloudArrowDownIcon}
              title="Import & Data"
              description="Bring anime data into the app and manage local list data."
              summary={["AniList import", "Clear list"]}
              open={openSection === "data"}
              onToggle={() => toggleSection("data")}
            >
            <div className="space-y-6">
              <div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/8 p-5">
                <p className="font-semibold text-white">Local data and backups</p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Your web list is saved on this browser and device. Link AniList or MyAnimeList
                  for sync, or export a backup file if you want to move your Seenary data to another PC.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={isExportingBackup}
                    onClick={async () => {
                      try {
                        setIsExportingBackup(true);
                        setBackupFeedback(null);
                        await onExportLocalBackup();
                        setBackupFeedback({
                          kind: "success",
                          message: "Backup exported.",
                        });
                      } catch {
                        setBackupFeedback({
                          kind: "error",
                          message: "Failed to export backup.",
                        });
                      } finally {
                        setIsExportingBackup(false);
                      }
                    }}
                    className={`rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                      isExportingBackup
                        ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                        : "border border-white/10 bg-white text-black hover:opacity-90"
                    }`}
                  >
                    {isExportingBackup ? "Exporting..." : "Export backup"}
                  </button>

                  <input
                    ref={backupImportInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(event) => importBackupFile(event.target.files?.[0] ?? null)}
                  />

                  <button
                    type="button"
                    disabled={isImportingBackup}
                    onClick={() => backupImportInputRef.current?.click()}
                    className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                      isImportingBackup
                        ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-white/35"
                        : "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    {isImportingBackup ? "Importing..." : "Import backup"}
                  </button>
                </div>

                {backupFeedback && (
                  <div
                    className={`mt-5 rounded-3xl border p-4 ${
                      backupFeedback.kind === "success"
                        ? "border-emerald-400/20 bg-emerald-400/10"
                        : "border-rose-400/20 bg-rose-400/10"
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{backupFeedback.message}</p>
                  </div>
                )}
              </div>

              <div>
                <SectionHeading
                  icon={CloudArrowDownIcon}
                  title="Import from AniList"
                  description="Preview your AniList library first, then choose exact titles to bring over."
                />

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-white/70">
                        AniList username
                      </span>
                      <input
                        type="text"
                        value={importUsername}
                        onChange={(event) => setImportUsername(event.target.value)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !isPreviewLoading &&
                            importUsername.trim()
                          ) {
                            event.preventDefault();
                            openImportPreview();
                          }
                        }}
                        placeholder="Enter AniList username"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.07]"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={isPreviewLoading || !importUsername.trim()}
                      onClick={openImportPreview}
                      className={`mt-7 inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                        isPreviewLoading || !importUsername.trim()
                          ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                          : "border border-white/10 bg-white text-black hover:opacity-90"
                      }`}
                    >
                      {isPreviewLoading && importProvider === "anilist" && (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      )}
                      {isPreviewLoading && importProvider === "anilist"
                        ? "Matching titles..."
                        : "Choose what to import"}
                    </button>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-white/45">
                    This imports anime statuses, progress, score, notes, and cached title data.
                    Existing local entries with the same AniList anime id are updated. Nothing gets deleted.
                  </p>

                  <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/8 px-4 py-3">
                    <p className="text-sm leading-6 text-white/70">
                      Make sure your AniList account is <span className="font-semibold text-white">public</span>,
                      otherwise this username import will not be able to read your list. Private-account import
                      will need a login-based method instead.
                    </p>
                  </div>

                  {importFeedback?.provider === "anilist" && (
                    <ImportFeedbackPanel feedback={importFeedback} />
                  )}
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={CloudArrowDownIcon}
                  title="Import from MyAnimeList"
                  description="Preview your linked MyAnimeList library, then choose exact matched titles to bring over."
                />

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">
                        {malLink.linked
                          ? `Ready to import ${malLink.account?.malUsername ?? "your MAL list"}`
                          : "Link MyAnimeList first"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/45">
                        MyAnimeList entries are matched to AniList anime records before import so they can fit the local library.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isPreviewLoading || !malLink.linked}
                      onClick={openMalImportPreview}
                      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                        isPreviewLoading || !malLink.linked
                          ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                          : "border border-white/10 bg-white text-black hover:opacity-90"
                      }`}
                    >
                      {isPreviewLoading && importProvider === "mal" && (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      )}
                      {isPreviewLoading && importProvider === "mal"
                        ? "Matching titles..."
                        : "Choose what to import"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/8 px-4 py-3">
                    <p className="text-sm leading-6 text-white/70">
                      Some MAL entries may be skipped if the app cannot confidently match them to an AniList anime record.
                    </p>
                  </div>

                  {importFeedback?.provider === "mal" && (
                    <ImportFeedbackPanel feedback={importFeedback} />
                  )}
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={DocumentTextIcon}
                  title="Import from text file"
                  description="Bring in a simple notepad list, one anime title per line."
                />

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        {textImportFileName || "Choose a .txt file"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/45">
                        Lines without progress are imported as completed. Lines like 3/12 are imported with that progress.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-amber-100/75">
                        Larger files can still take a moment, but Seenary now matches titles in faster batches before showing the import preview.
                      </p>
                    </div>

                    <input
                      ref={textImportInputRef}
                      type="file"
                      accept=".txt,text/plain"
                      className="hidden"
                      onChange={(event) => openTextImportPreview(event.target.files?.[0] ?? null)}
                    />

                    <button
                      type="button"
                      disabled={isPreviewLoading}
                      onClick={() => textImportInputRef.current?.click()}
                      className={`inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 md:w-auto md:shrink-0 ${
                        isPreviewLoading
                          ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                          : "border border-white/10 bg-white text-black hover:opacity-90"
                      }`}
                    >
                      {isPreviewLoading && importProvider === "txt"
                        ? "Matching titles..."
                        : "Choose text file"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/8 px-4 py-3">
                    <p className="text-sm leading-6 text-white/70">
                      Text imports use best-effort AniList matching. Review the preview before importing.
                    </p>
                  </div>

                  {importFeedback?.provider === "txt" && (
                    <ImportFeedbackPanel feedback={importFeedback} />
                  )}
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={DocumentTextIcon}
                  title="Import from PDF"
                  description="Extract anime titles from a text-based PDF, then review matched titles before importing."
                />

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">
                        Choose a .pdf file
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/45">
                        Best for browser-exported pages and other PDFs with selectable text.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-amber-100/75">
                        PDF import is experimental. Scanned image PDFs may not contain readable titles.
                      </p>
                    </div>

                    <input
                      ref={pdfImportInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(event) => openPdfImportPreview(event.target.files?.[0] ?? null)}
                    />

                    <button
                      type="button"
                      disabled={isPreviewLoading}
                      onClick={() => pdfImportInputRef.current?.click()}
                      className={`inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 md:w-auto md:shrink-0 ${
                        isPreviewLoading
                          ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                          : "border border-white/10 bg-white text-black hover:opacity-90"
                      }`}
                    >
                      {isPreviewLoading && importProvider === "pdf"
                        ? "Reading PDF..."
                        : "Choose PDF"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/8 px-4 py-3">
                    <p className="text-sm leading-6 text-white/70">
                      Seenary extracts readable PDF text, matches likely title lines through AniList, and lets you confirm every matched anime.
                    </p>
                  </div>

                  {importFeedback?.provider === "pdf" && (
                    <ImportFeedbackPanel feedback={importFeedback} />
                  )}
                </div>
              </div>

              <div>
                <SectionHeading
                  icon={TrashIcon}
                  title="Clear my anime list"
                  description="Remove every anime from your list without affecting the rest of the app."
                />

                <div className="rounded-3xl border border-rose-400/15 bg-rose-400/8 p-5">
                  <p className="text-sm leading-6 text-white/70">
                    This only clears <span className="font-semibold text-white">your list</span>.
                    Your account stays the same, and anime pages and app content will still be available.
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={isClearingList}
                      onClick={() => {
                        setClearFeedback(null);
                        setIsClearArmed(true);
                      }}
                      className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                        isClearingList
                          ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-white/35"
                          : "border-rose-400/20 bg-rose-500/15 text-rose-100 hover:bg-rose-500/20"
                      }`}
                    >
                      Clear my anime list
                    </button>

                    {isClearArmed && (
                      <>
                        <button
                          type="button"
                          disabled={isClearingList}
                          onClick={async () => {
                            try {
                              setIsClearingList(true);
                              const result = await onClearMyList();
                              setClearFeedback({
                                kind: result.ok ? "success" : "error",
                                message: result.message,
                              });
                            } finally {
                              setIsClearingList(false);
                              setIsClearArmed(false);
                            }
                          }}
                          className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                            isClearingList
                              ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-white/35"
                              : "border-rose-400/25 bg-rose-500 text-white hover:opacity-90"
                          }`}
                        >
                          {isClearingList ? "Clearing..." : "Yes, clear it"}
                        </button>

                        <button
                          type="button"
                          disabled={isClearingList}
                          onClick={() => setIsClearArmed(false)}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>

                  {isClearArmed && (
                    <p className="mt-4 text-sm leading-6 text-rose-100/85">
                      Second confirmation: this will remove every list entry tied to your account.
                    </p>
                  )}

                  {clearFeedback && (
                    <div
                      className={`mt-5 rounded-3xl border p-4 ${
                        clearFeedback.kind === "success"
                          ? "border-emerald-400/20 bg-emerald-400/10"
                          : "border-rose-400/20 bg-rose-400/10"
                      }`}
                    >
                      <p className="text-sm font-semibold text-white">
                        {clearFeedback.message}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            </AccordionSection>
          </div>
        </div>
      </div>

      {isImportModalOpen && (
      <ImportSelectionModal
        provider={importProvider}
        username={importPreviewUsername.trim()}
        preview={importPreview}
        previewError={previewError}
        isPreviewLoading={isPreviewLoading}
        isImporting={isImporting}
        selectedIds={selectedImportIds}
        openGroups={openImportGroups}
        titleLanguage={settings.titleLanguage}
        onClose={() => setIsImportModalOpen(false)}
        onToggleGroup={(status) =>
          setOpenImportGroups((current) => ({ ...current, [status]: !current[status] }))
        }
        onToggleAnime={(animeId) =>
          setSelectedImportIds((current) =>
            current.includes(animeId)
              ? current.filter((value) => value !== animeId)
              : [...current, animeId]
          )
        }
        onSelectAll={() =>
          setSelectedImportIds(
            importPreview?.groups.flatMap((group) => group.items.map((item) => item.animeId)) ?? []
          )
        }
        onDeselectAll={() => setSelectedImportIds([])}
        onSelectGroup={(status) =>
          setSelectedImportIds((current) => {
            const ids =
              importPreview?.groups.find((group) => group.status === status)?.items.map((item) => item.animeId) ??
              [];
            return Array.from(new Set([...current, ...ids]));
          })
        }
        onDeselectGroup={(status) =>
          setSelectedImportIds((current) => {
            const ids = new Set(
              importPreview?.groups.find((group) => group.status === status)?.items.map((item) => item.animeId) ?? []
            );
            return current.filter((animeId) => !ids.has(animeId));
          })
        }
        onConfirm={async () => {
          const controller = new AbortController();
          const feedbackProvider = importProvider;
          activeImportAbortRef.current = controller;

          try {
            setIsImporting(true);
            const result =
              feedbackProvider === "txt" || feedbackProvider === "pdf"
                ? await onImportTextList(
                    importPreview?.groups.flatMap((group) => group.items) ?? [],
                    selectedImportIds,
                    { signal: controller.signal }
                  )
                : feedbackProvider === "mal"
                  ? await onImportMal(selectedImportStatuses, selectedImportIds, {
                      signal: controller.signal,
                    })
                  : await onImportAniList(
                    importUsername.trim(),
                    selectedImportStatuses,
                    selectedImportIds,
                    { signal: controller.signal }
                  );

            if (result.cancelled) {
              setImportFeedback({
                provider: feedbackProvider,
                kind: "warning",
                message: result.message,
                summary: result.summary,
              });
              return;
            }

            setImportFeedback({
              provider: feedbackProvider,
              kind: result.ok ? "success" : "error",
              message: result.message,
              summary: result.summary,
            });

            if (result.ok) {
              setIsImportModalOpen(false);
            }
          } catch (error) {
            console.error("Failed to import selected anime:", error);
            setImportFeedback({
              provider: feedbackProvider,
              kind: "error",
              message: getErrorMessage(error, "Import failed. Try again in a moment."),
            });
          } finally {
            setIsImporting(false);
            if (activeImportAbortRef.current === controller) {
              activeImportAbortRef.current = null;
            }
          }
        }}
        onCancelImport={() => {
          resetActiveImportAttempt();
          setIsImportModalOpen(false);
        }}
      />
      )}

      <SyncActivityModal
        isOpen={isSyncActivityOpen}
        activeTab={syncActivityTab}
        activity={syncActivity}
        onClose={() => setIsSyncActivityOpen(false)}
        onChangeTab={(tab) => {
          setSyncActivityTab(tab);
          loadSyncActivity(tab);
        }}
      />
    </div>
  );
}

function AccordionSection({
  icon: Icon,
  title,
  description,
  summary,
  open,
  onToggle,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  summary: string[];
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-xl">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/55"
      >
        <div className="flex min-w-0 items-start gap-4">
          <div className={`rounded-2xl border p-3 transition ${
            open
              ? "border-[var(--app-accent)]/30 bg-[var(--app-accent-soft)] text-white/80"
              : "border-white/10 bg-white/5 text-white/70"
          }`}>
            <Icon className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              {summary.map((item) => (
                <span
                  key={`${title}-${item}`}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/50"
                >
                  {item}
                </span>
              ))}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">
              {description}
            </p>
          </div>
        </div>

        <span
          className={`rounded-2xl border border-white/10 bg-white/5 p-2 text-white/55 transition-transform duration-300 ${
            open ? "rotate-180 border-[var(--app-accent)]/25 bg-[var(--app-accent-soft)] text-white/80" : ""
          }`}
        >
          <ChevronDownIcon className="h-5 w-5" />
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0.7 }}
      >
        <div className="overflow-hidden">
          <div
            className={`border-t border-white/10 px-6 pb-6 pt-5 transition duration-300 ${
              open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="rounded-2xl border border-[var(--app-accent)]/20 bg-[var(--app-accent-soft)] p-2.5 text-white/80">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-white/40">{description}</p>
      </div>
    </div>
  );
}

function ToggleSetting({
  icon: Icon,
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-4 rounded-3xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/55 ${
        disabled
          ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-45"
          : checked
          ? "border-[var(--app-accent)]/35 bg-[var(--app-accent-soft)] hover:bg-[var(--app-accent-soft)]"
          : "border-white/10 bg-white/[0.03] hover:bg-white/8"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className={`rounded-2xl border p-2 ${
          checked
            ? "border-[var(--app-accent)]/25 bg-[var(--app-accent-soft)] text-white/80"
            : "border-white/10 bg-white/5 text-white/65"
        }`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-white">{title}</p>
          <p className="mt-1 text-sm leading-6 text-white/45">{description}</p>
        </div>
      </div>

      <span
        className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
          checked
            ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
            : "border-white/10 bg-white/8"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full transition ${
            checked ? "left-6 bg-[var(--app-accent)]" : "left-1 bg-white/45"
          }`}
        />
      </span>
    </button>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void | Promise<void>;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="w-fit rounded-2xl border border-white/10 bg-white/5 p-2 text-white/65">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/45">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 rounded-2xl border border-white/10 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/55"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
        {label}
      </p>
      <p className="mt-3 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function ImportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function ImportFeedbackPanel({ feedback }: { feedback: ImportFeedback }) {
  return (
    <div
      className={`mt-5 rounded-3xl border p-4 ${
        feedback.kind === "success"
          ? "border-emerald-400/20 bg-emerald-400/10"
          : feedback.kind === "warning"
            ? "border-amber-300/20 bg-amber-300/10"
          : "border-rose-400/20 bg-rose-400/10"
      }`}
    >
      <p className="text-sm font-semibold text-white">
        {feedback.message}
      </p>

      {feedback.summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <ImportStat label="Found" value={feedback.summary.totalFound} />
          <ImportStat label="Imported" value={feedback.summary.imported} />
          <ImportStat label="Created" value={feedback.summary.created} />
          <ImportStat label="Updated" value={feedback.summary.updated} />
          <ImportStat label="Skipped" value={feedback.summary.skipped} />
        </div>
      )}
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function LinkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SyncActivityModal({
  isOpen,
  activeTab,
  activity,
  onClose,
  onChangeTab,
}: {
  isOpen: boolean;
  activeTab: SyncActivityTab;
  activity: {
    loading: boolean;
    pending: SyncActivityItem[];
    completed: SyncActivityItem[];
    failed: SyncActivityItem[];
  };
  onClose: () => void;
  onChangeTab: (tab: SyncActivityTab) => void;
}) {
  if (!isOpen) return null;

  const items = activity[activeTab];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 py-10">
      <button
        type="button"
        aria-label="Close sync activity overlay"
        onClick={onClose}
        className="absolute inset-0 bg-black/82"
      />

      <div className="relative z-10 flex h-[min(82vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/95 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/35">
              AniList sync
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
              Sync activity
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              Review queued changes, successful syncs, and failed attempts.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-white/60 transition hover:bg-white/8 hover:text-white"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-white/10 px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {(["pending", "completed", "failed"] as SyncActivityTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onChangeTab(tab)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold capitalize transition ${
                  activeTab === tab
                    ? "bg-white text-black"
                    : "border border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/8 hover:text-white"
                }`}
              >
                {getSyncActivityTabLabel(tab)} ({activity[tab].length})
              </button>
            ))}
          </div>
        </div>

        <div className="scroll-container min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {activity.loading ? (
            <div className="flex h-full items-center justify-center text-white/60">
              Loading sync activity...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/45">
              No {activeTab} sync items.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={`${activeTab}-${item.id}`}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">
                        {item.animeTitle || item.anime_title || `Anime #${item.anime_id}`}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/70">
                          {formatOperation(item.operation)}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getOperationAccent(item.operation)}`}>
                          {formatOperationProvider(item.operation)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-white/55">
                        {formatDateTime(item.updated_at || item.created_at || "")}
                      </p>
                      {activeTab === "pending" && item.next_attempt_at && (
                        <p className="mt-1 text-xs text-amber-200/70">
                          Retry {formatDateTime(item.next_attempt_at)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(item.changedFields || []).map((change) => (
                      <span
                        key={`${item.id}-${change.field}`}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70"
                      >
                        {formatFieldName(change.field)}: {formatValue(change.from)} {"->"}{" "}
                        {formatValue(change.to)}
                      </span>
                    ))}
                  </div>

                  {(item.message || item.last_error) && (
                    <div
                      className={`mt-4 rounded-2xl border px-3 py-2 text-sm ${
                        activeTab === "failed" || item.last_error
                          ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
                          : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                      }`}
                    >
                      <p className="font-semibold">
                        {activeTab === "failed" || item.last_error
                          ? "Sync failed"
                          : "Sync completed"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-white/75">
                        {formatSyncActivityMessage(item.message || item.last_error)}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getImportModalCopy(
  provider: "anilist" | "mal" | "txt" | "pdf",
  username: string,
  preview: ImportPreviewResponse["preview"] | null,
  isPreviewLoading: boolean
) {
  const sourceName =
    username ||
    (provider === "txt"
      ? "your text file"
      : provider === "pdf"
        ? "your PDF"
      : provider === "mal"
        ? "your MyAnimeList account"
        : "your AniList account");

  if (provider === "txt" || provider === "pdf") {
    const matchedCount =
      preview?.groups.reduce((sum, group) => sum + group.items.length, 0) ?? 0;
    const totalFound = preview?.totalFound ?? 0;
    const sourceType = provider === "pdf" ? "PDF" : "text file";

    return {
      title: isPreviewLoading ? "Matching anime titles" : "Choose exact anime to import",
      description: isPreviewLoading
        ? `Reading ${sourceName} and matching extracted title lines to AniList anime records.`
        : preview
          ? `Matched ${matchedCount} of ${totalFound} line${totalFound === 1 ? "" : "s"} from ${sourceName}. Review the matches, then import only the titles you want.`
          : `Previewing ${sourceName}. Review the matches, then import only the titles you want.`,
      loadingTitle: `Matching titles from your ${sourceType}`,
      loadingDescription:
        `Seenary checks each extracted line against AniList so the preview can show covers, episodes, and the exact anime that will be imported. Larger ${sourceType}s can take a few minutes.`,
    };
  }

  if (provider === "mal") {
    return {
      title: isPreviewLoading ? "Matching anime titles" : "Choose exact anime to import",
      description: isPreviewLoading
        ? `Reading ${sourceName} and matching list entries to AniList anime records.`
        : `Previewing ${sourceName}. Expand a group, tick the titles you want, then import only those.`,
      loadingTitle: "Matching titles from your MyAnimeList account",
      loadingDescription:
        "Seenary checks your linked MyAnimeList entries against AniList so the preview can show covers, episodes, and the exact anime that will be imported.",
    };
  }

  return {
    title: isPreviewLoading ? "Matching anime titles" : "Choose exact anime to import",
    description: isPreviewLoading
      ? `Reading ${sourceName} and preparing matched AniList anime records.`
      : `Previewing ${sourceName}. Expand a group, tick the titles you want, then import only those.`,
    loadingTitle: "Matching titles from your AniList account",
    loadingDescription:
      "Seenary is reading the public AniList list so the preview can show covers, episodes, and the exact anime that will be imported.",
  };
}

function formatElapsedSeconds(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}m ${remainingSeconds}s`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() || "" : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function ImportSelectionModal({
  provider,
  username,
  preview,
  previewError,
  isPreviewLoading,
  isImporting,
  selectedIds,
  openGroups,
  titleLanguage,
  onClose,
  onToggleGroup,
  onToggleAnime,
  onSelectAll,
  onDeselectAll,
  onSelectGroup,
  onDeselectGroup,
  onConfirm,
  onCancelImport,
}: {
  provider: "anilist" | "mal" | "txt" | "pdf";
  username: string;
  preview: ImportPreviewResponse["preview"] | null;
  previewError: string | null;
  isPreviewLoading: boolean;
  isImporting: boolean;
  selectedIds: number[];
  openGroups: Record<string, boolean>;
  titleLanguage: TitleLanguage;
  onClose: () => void;
  onToggleGroup: (status: string) => void;
  onToggleAnime: (animeId: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectGroup: (status: string) => void;
  onDeselectGroup: (status: string) => void;
  onConfirm: () => void | Promise<void>;
  onCancelImport: () => void;
}) {
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [isQuitImportConfirmOpen, setIsQuitImportConfirmOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (isImporting || isPreviewLoading) {
      setIsQuitImportConfirmOpen(true);
      return;
    }

    onClose();
  }, [isImporting, isPreviewLoading, onClose]);

  useEffect(() => {
    if (!isPreviewLoading) return;

    const startedAt = Date.now();
    const updateLoadingSeconds = () => {
      setLoadingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    };
    const initialUpdateId = window.setTimeout(updateLoadingSeconds, 0);
    const intervalId = window.setInterval(() => {
      updateLoadingSeconds();
    }, 1000);

    return () => {
      window.clearTimeout(initialUpdateId);
      window.clearInterval(intervalId);
    };
  }, [isPreviewLoading]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      if (isQuitImportConfirmOpen) {
        setIsQuitImportConfirmOpen(false);
        return;
      }

      requestClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isQuitImportConfirmOpen, requestClose]);

  const guessedImportItems = useMemo(
    () => preview?.groups.flatMap((group) => group.items.filter((item) => item.guessed)) ?? [],
    [preview]
  );

  const copy = getImportModalCopy(provider, username, preview, isPreviewLoading);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 py-10">
      <button
        type="button"
        aria-label="Close import overlay"
        onClick={requestClose}
        className="absolute inset-0 bg-black/82"
      />

      <div className="relative z-10 flex h-[min(86vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/95 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/35">
              {provider === "txt"
                ? "Text file import"
                : provider === "pdf"
                  ? "PDF import"
                : provider === "mal"
                  ? "MyAnimeList import"
                  : "AniList import"}
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
              {copy.description}
            </p>
          </div>

          <button
            type="button"
            onClick={requestClose}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-white/60 transition hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="scroll-container min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isPreviewLoading ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-white/65">
              <ArrowPathIcon className="h-7 w-7 animate-spin text-white/35" />
              <p className="mt-5 text-sm font-semibold text-white/75">
                {copy.loadingTitle}
              </p>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/42">
                {copy.loadingDescription}
              </p>
              <div className="mt-6 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
                <div className="import-activity-bar h-2 w-1/3 rounded-full bg-[var(--app-accent)] shadow-[0_0_18px_var(--app-accent)]" />
              </div>
              <p className="mt-3 text-xs text-white/35">
                Still matching titles - {formatElapsedSeconds(loadingSeconds)} elapsed
              </p>
            </div>
          ) : previewError ? (
            <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-white/80">
              {previewError}
            </div>
          ) : !preview ? (
            <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-white/80">
              No import preview was returned. Try again in a moment, or try a shorter text file.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/75 transition hover:bg-white/8 hover:text-white"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={onDeselectAll}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/75 transition hover:bg-white/8 hover:text-white"
                >
                  Deselect all
                </button>
              </div>

              {(provider === "txt" || provider === "pdf") && preview.unmatched?.length ? (
                <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4">
                  <p className="text-sm font-semibold text-white">
                    {preview.unmatched.length} line{preview.unmatched.length === 1 ? "" : "s"} skipped
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/65">
                    These lines could not be matched confidently. You can import the matched titles now and add the skipped ones manually later.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {preview.unmatched.slice(0, 12).map((line) => (
                      <span
                        key={line}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70"
                      >
                        {line}
                      </span>
                    ))}
                    {preview.unmatched.length > 12 && (
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/45">
                        +{preview.unmatched.length - 12} more
                      </span>
                    )}
                  </div>
                </div>
              ) : null}

              {(provider === "txt" || provider === "pdf") && guessedImportItems.length ? (
                <div className="rounded-3xl border border-sky-300/20 bg-sky-300/10 p-4">
                  <p className="text-sm font-semibold text-white">
                    {guessedImportItems.length} guessed entr{guessedImportItems.length === 1 ? "y" : "ies"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/65">
                    These messy lines were interpreted before matching. Review them before importing.
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {guessedImportItems.slice(0, 8).map((item) => {
                      const title = getPreferredTitle(item.title, titleLanguage);
                      const fromTitle = item.guessedFrom || item.sourceTitle || "Unknown input";
                      const interpretedTitle = item.interpretedTitle || title;

                      return (
                        <div
                          key={`${item.animeId}-${fromTitle}`}
                          className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2"
                        >
                          <p className="line-clamp-1 text-xs text-white/45">{fromTitle}</p>
                          <p className="mt-1 line-clamp-1 text-sm font-semibold text-white">
                            {interpretedTitle}
                          </p>
                          {interpretedTitle !== title && (
                            <p className="mt-1 line-clamp-1 text-xs text-white/45">
                              Matched: {title}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {guessedImportItems.length > 8 && (
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/45">
                        +{guessedImportItems.length - 8} more guessed
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {preview.groups.map((group) => {
                const groupSelectedCount = group.items.filter((item) =>
                  selectedIds.includes(item.animeId)
                ).length;
                const isOpen = openGroups[group.status] ?? false;

                return (
                  <section
                    key={group.status}
                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                      <button
                        type="button"
                        onClick={() => onToggleGroup(group.status)}
                        className="flex min-w-0 items-center gap-3 text-left"
                      >
                        <span
                          className={`rounded-2xl border border-white/10 bg-white/5 p-2 text-white/55 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        >
                          <ChevronDownIcon className="h-5 w-5" />
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-white">
                              {IMPORT_STATUS_LABELS[group.status] ?? capitalize(group.status)}
                            </h3>
                            <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/45">
                              {groupSelectedCount} / {group.items.length} selected
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectGroup(group.status)}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/75 transition hover:bg-white/8 hover:text-white"
                        >
                          Select group
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeselectGroup(group.status)}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/75 transition hover:bg-white/8 hover:text-white"
                        >
                          Clear group
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                        {group.items.map((item) => {
                          const selected = selectedIds.includes(item.animeId);
                          const title = getPreferredTitle(item.title, titleLanguage);

                          return (
                            <button
                              key={item.animeId}
                              type="button"
                              onClick={() => onToggleAnime(item.animeId)}
                              className={`flex items-start gap-4 rounded-3xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                                selected
                                  ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                                  : "border-white/10 bg-white/[0.03] hover:bg-white/8"
                              }`}
                            >
                              <div className="h-24 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/5">
                                {item.coverImage?.large ? (
                                  <img
                                    src={item.coverImage.large}
                                    alt={title}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="h-full w-full bg-white/5" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                <p className="line-clamp-2 text-sm font-semibold text-white">
                                  {title}
                                </p>
                                {(provider === "txt" || provider === "pdf") && item.sourceTitle && item.sourceTitle !== title && (
                                  <p className="mt-1 line-clamp-1 text-xs text-white/35">
                                    From: {item.sourceTitle}
                                  </p>
                                )}
                                <p className="mt-1 text-xs text-white/45">
                                  {[
                                        item.format,
                                        item.season && item.seasonYear
                                          ? `${capitalize(item.season)} ${item.seasonYear}`
                                          : item.seasonYear
                                          ? String(item.seasonYear)
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" - ")}
                                    </p>
                                  </div>

                                  <span
                                    className={`rounded-full p-1 ${
                                      selected
                                        ? "bg-white text-black"
                                        : "bg-white/8 text-white/30"
                                    }`}
                                  >
                                    <CheckCircleIcon className="h-4 w-4" />
                                  </span>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-black/15 px-2.5 py-1 text-[11px] text-white/70">
                                    Progress {item.episodes ? `${item.progress} / ${item.episodes}` : item.progress}
                                  </span>
                                  {typeof item.score === "number" && item.score > 0 && (
                                    <span className="rounded-full bg-black/15 px-2.5 py-1 text-[11px] text-white/70">
                                      Score {item.score}
                                    </span>
                                  )}
                                </div>

                                {item.notes?.trim() && (
                                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-white/50">
                                    {item.notes.trim()}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-6 py-4">
          <div className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-sm text-white/60">
              {selectedIds.length > 0
                ? `${selectedIds.length} anime selected`
                : "Choose at least one anime to import"}
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!preview || selectedIds.length === 0 || isImporting || isPreviewLoading}
                onClick={onConfirm}
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                  !preview || selectedIds.length === 0 || isImporting || isPreviewLoading
                    ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                    : "border border-white/10 bg-white text-black hover:opacity-90"
                }`}
              >
                {isImporting ? "Importing..." : "Import selected"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {isQuitImportConfirmOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <button
            type="button"
            aria-label="Keep import window open"
            onClick={() => setIsQuitImportConfirmOpen(false)}
            className="absolute inset-0 bg-black/55"
          />

          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quit-import-title"
            aria-describedby="quit-import-description"
            className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-6 text-white shadow-2xl"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>

              <div>
                <h3 id="quit-import-title" className="text-lg font-semibold">
                  {isPreviewLoading ? "Cancel matching?" : "Cancel import?"}
                </h3>
                <p
                  id="quit-import-description"
                  className="mt-2 text-sm leading-6 text-white/60"
                >
                  {isPreviewLoading
                    ? "Seenary is still matching titles. Cancelling will close this preview and stop waiting for the matching result."
                    : "An import is still running. Cancelling will stop the current import request and skip any remaining entries that have not been saved yet."}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsQuitImportConfirmOpen(false);
                  onCancelImport();
                }}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
              >
                {isPreviewLoading ? "Cancel matching" : "Cancel import"}
              </button>

              <button
                type="button"
                onClick={() => setIsQuitImportConfirmOpen(false)}
                className="rounded-2xl border border-white/10 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/55"
              >
                Keep importing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getStartViewLabel(value: StartView) {
  return START_VIEW_OPTIONS.find((option) => option.value === value)?.label ?? "Home";
}

function normalizeAccentColor(value: string | null | undefined) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#a78bfa";
}

function getAnimationLevelLabel(value: AnimationLevel) {
  return ANIMATION_LEVEL_OPTIONS.find((option) => option.value === value)?.label ?? "Full";
}

function getNavbarStyleLabel(value: NavbarStyle) {
  return NAVBAR_STYLE_OPTIONS.find((option) => option.value === value)?.label ?? "Integrated";
}

function getBrowseCardStyleLabel(value: BrowseCardStyle) {
  return BROWSE_CARD_STYLE_OPTIONS.find((option) => option.value === value)?.label ?? "Default";
}

function BrowseCardStylePreview({ style }: { style: BrowseCardStyle }) {
  return (
    <div className="flex h-28 items-center justify-center overflow-hidden rounded-2xl border border-white/8 bg-black/35 p-3">
      <div
        className={`relative flex h-full w-16 flex-col overflow-hidden rounded-xl ${
          style === "gallery"
            ? "bg-transparent"
            : "border border-white/12 bg-white/[0.05] shadow-xl"
        }`}
      >
        <div className={`relative min-h-0 flex-1 overflow-hidden bg-linear-to-br from-[var(--app-accent)]/55 via-slate-700 to-black ${style === "gallery" ? "rounded-xl shadow-xl" : ""}`}>
          <span className="absolute right-1.5 top-1.5 h-3 w-3 rounded-md bg-black/55" />
          {style === "immersive" && (
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black via-black/70 to-transparent px-2 pb-2 pt-8">
              <span className="block h-1.5 w-10 rounded-full bg-white/80" />
              <span className="mt-1 block h-1 w-7 rounded-full bg-white/35" />
            </div>
          )}
        </div>
        {style !== "immersive" && (
          <div className={`px-1.5 pb-1.5 pt-2 ${style === "gallery" ? "bg-transparent" : "bg-white/[0.04]"}`}>
            <span className="block h-1.5 w-10 rounded-full bg-white/80" />
            <span className="mt-1 block h-1 w-7 rounded-full bg-white/35" />
          </div>
        )}
      </div>
    </div>
  );
}

function NavbarStylePreview({ style }: { style: NavbarStyle }) {
  const floating = style === "floating";
  const minimal = style === "minimal";

  return (
    <div className="relative h-16 overflow-hidden rounded-2xl border border-white/8 bg-black/35">
      {!minimal && (
        <div
          className={`absolute flex items-center gap-2 border-white/10 bg-white/[0.07] px-2 backdrop-blur ${
            floating
              ? "inset-x-2 top-2 h-10 rounded-xl border"
              : "inset-x-0 top-0 h-11 border-b"
          }`}
        >
          <NavbarPreviewContents />
        </div>
      )}
      {minimal && (
        <div className="absolute inset-x-2 top-2 flex h-10 items-center justify-between gap-2">
          <div className="flex h-full items-center gap-1 rounded-xl border border-white/10 bg-white/[0.07] px-2 backdrop-blur">
            <span className="h-2.5 w-2.5 rounded-full bg-white/45" />
            <span className="h-2.5 w-4 rounded-full bg-white/25" />
          </div>
          <span className="h-full flex-1 rounded-xl border border-white/10 bg-white/[0.07] backdrop-blur" />
          <div className="flex h-full items-center gap-1 rounded-xl border border-white/10 bg-white/[0.07] px-2 backdrop-blur">
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/45" />
          </div>
        </div>
      )}
    </div>
  );
}

function NavbarPreviewContents() {
  return (
    <>
      <span className="h-2.5 w-2.5 rounded-full bg-white/45" />
      <span className="h-2.5 w-4 rounded-full bg-white/25" />
      <span className="mx-auto h-5 w-2/5 rounded-lg border border-white/10 bg-white/8" />
      <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
      <span className="h-2.5 w-2.5 rounded-full bg-white/45" />
    </>
  );
}

function getDiscoverDensityLabel(value: DiscoverDensity) {
  return DISCOVER_DENSITY_OPTIONS.find((option) => option.value === value)?.label ?? "Balanced";
}

function getCardDensityLabel(value: CardDensity) {
  return CARD_DENSITY_OPTIONS.find((option) => option.value === value)?.label ?? "Balanced";
}

function getWindowPresetId(value: unknown): WindowPresetId {
  return WINDOW_PRESET_OPTIONS.some((option) => option.value === value)
    ? (value as WindowPresetId)
    : "balanced";
}

function normalizeAcceleratorInput(value: string) {
  return value
    .split("+")
    .map((part) => normalizeAcceleratorToken(part))
    .filter(Boolean)
    .join("+");
}

function appendAcceleratorToken(accelerator: string, token: string) {
  const normalizedToken = normalizeAcceleratorToken(token);

  if (!normalizedToken) {
    return normalizeAcceleratorInput(accelerator);
  }

  const tokens = normalizeAcceleratorInput(accelerator)
    .split("+")
    .filter(Boolean);

  if (!tokens.includes(normalizedToken)) {
    tokens.push(normalizedToken);
  }

  return tokens.join("+");
}

function removeLastAcceleratorToken(accelerator: string) {
  const tokens = normalizeAcceleratorInput(accelerator)
    .split("+")
    .filter(Boolean);

  tokens.pop();

  return tokens.join("+");
}

function keyEventToAcceleratorToken(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (event.repeat) {
    return null;
  }

  return normalizeAcceleratorToken(event.key);
}

function normalizeAcceleratorToken(value: string) {
  if (value === " ") {
    return "Space";
  }

  const token = value.trim();

  if (!token) {
    return "";
  }

  const lowerToken = token.toLowerCase();

  if (lowerToken === "control" || lowerToken === "ctrl") {
    return "Control";
  }

  if (lowerToken === "alt" || lowerToken === "option") {
    return "Alt";
  }

  if (lowerToken === "shift") {
    return "Shift";
  }

  if (lowerToken === "meta" || lowerToken === "command" || lowerToken === "cmd") {
    return "Meta";
  }

  if (lowerToken === " " || lowerToken === "space" || lowerToken === "spacebar") {
    return "Space";
  }

  if (lowerToken === "escape" || lowerToken === "esc") {
    return "Escape";
  }

  if (lowerToken === "arrowup") {
    return "Up";
  }

  if (lowerToken === "arrowdown") {
    return "Down";
  }

  if (lowerToken === "arrowleft") {
    return "Left";
  }

  if (lowerToken === "arrowright") {
    return "Right";
  }

  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lowerToken)) {
    return lowerToken.toUpperCase();
  }

  if (/^[a-z0-9]$/.test(lowerToken)) {
    return lowerToken.toUpperCase();
  }

  return token.charAt(0).toUpperCase() + token.slice(1);
}

function hasAcceleratorActionKey(accelerator: string) {
  const modifierTokens = new Set(["Control", "Alt", "Shift", "Meta"]);

  return normalizeAcceleratorInput(accelerator)
    .split("+")
    .some((token) => token && !modifierTokens.has(token));
}

function getSyncActivityTabLabel(tab: SyncActivityTab) {
  return tab === "pending" ? "Queued" : capitalize(tab);
}

function ProgressActionButton({
  children,
  onClick,
  disabled,
  active,
  progress,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  active?: boolean;
  progress?: SyncProgressEvent | null;
  className?: string;
}) {
  const hasTotal = Number(progress?.total) > 0;
  const percent = hasTotal
    ? Math.min(100, Math.max(0, (Number(progress?.current || 0) / Number(progress?.total)) * 100))
    : active
      ? 8
      : 0;
  const labelPercent = hasTotal ? Math.round(percent) : 0;
  const isDisabled = Boolean(disabled);

  return (
    <div className={`inline-flex min-w-0 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className={`relative overflow-hidden rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
          isDisabled && !active
            ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
            : `border border-white/10 bg-white text-black ${active ? "cursor-progress" : "hover:opacity-90"}`
        }`}
      >
        {active && (
          <span
            className={`absolute inset-y-0 left-0 bg-emerald-300/35 transition-all duration-300 ${
              hasTotal ? "" : "animate-pulse"
            }`}
            style={{ width: `${percent}%` }}
          />
        )}
        <span className="relative z-10">{active ? `${labelPercent}%` : children}</span>
      </button>
    </div>
  );
}

function formatOperation(value: string) {
  switch (value) {
    case "upsert_anilist_entry":
      return "Pushed list entry";
    case "upsert_mal_entry":
      return "Pushed list entry";
    case "delete_anilist_entry":
      return "Deleted list entry";
    case "delete_mal_entry":
      return "Deleted list entry";
    case "pull_from_anilist":
      return "Pulled remote update";
    case "pull_from_mal":
      return "Pulled remote update";
    default:
      return value
        .replace(/_/g, " ")
        .replace(/^./, (char) => char.toUpperCase());
  }
}

function formatOperationProvider(value: string) {
  if (value.includes("mal")) {
    return "MyAnimeList";
  }

  if (value.includes("anilist")) {
    return "AniList";
  }

  return "Sync";
}

function getOperationAccent(value: string) {
  if (value.includes("mal")) {
    return "bg-indigo-400/10 text-indigo-100";
  }

  if (value.includes("anilist")) {
    return "bg-sky-400/10 text-sky-100";
  }

  return "bg-white/8 text-white/60";
}

function formatFieldName(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "empty";
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  return String(value);
}

function formatSyncActivityMessage(value: string | null | undefined) {
  const message = String(value || "").trim();

  if (message.toLowerCase() === "invalid q") {
    return "MyAnimeList rejected the title search query while matching this anime.";
  }

  return message;
}
