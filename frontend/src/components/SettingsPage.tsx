import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import {
  ArrowPathIcon,
  CheckIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CloudArrowDownIcon,
  EyeSlashIcon,
  HomeIcon,
  LanguageIcon,
  LinkIcon,
  PaintBrushIcon,
  PlayCircleIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";

export type ThemeAccent = "cyan" | "violet" | "rose" | "amber" | "emerald";

export type AppSettings = {
  themeAccent: ThemeAccent;
  titleLanguage: TitleLanguage;
  showTrendingCarousel: boolean;
  autoRotateTrending: boolean;
  autoScrollHomeShelves: boolean;
  hideAdultContent: boolean;
};

type ImportPreviewItem = {
  animeId: number;
  status: string;
  progress: number;
  score: number | null;
  notes: string | null;
  title: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
    userPreferred?: string | null;
  };
  coverImage?: {
    large?: string | null;
  };
  episodes?: number | null;
  format?: string | null;
  season?: string | null;
  seasonYear?: number | null;
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
    selectedAnimeIds: number[]
  ) => Promise<{
    ok: boolean;
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
    selectedAnimeIds: number[]
  ) => Promise<{
    ok: boolean;
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
  onClearMyList: () => Promise<{
    ok: boolean;
    message: string;
    removedCount?: number;
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
type SyncActivityItem = {
  id: number;
  anime_id?: number | null;
  animeTitle?: string;
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

const THEME_OPTIONS: Array<{
  value: ThemeAccent;
  label: string;
  color: string;
  glow: string;
}> = [
  { value: "cyan", label: "Cyan", color: "#67e8f9", glow: "shadow-cyan-400/20" },
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

const IMPORT_STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  planned: "Planned",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
};

const SETTINGS_OPEN_SECTION_KEY = "media-tracker.settings.open-section";
const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  "appearance",
  "home",
  "content",
  "account",
  "sync",
  "data",
  "general",
];

function readStoredSettingsSection(): SettingsSectionId {
  if (typeof window === "undefined") {
    return "appearance";
  }

  try {
    const storedSection = window.localStorage.getItem(SETTINGS_OPEN_SECTION_KEY);
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
      : "appearance";
  } catch {
    return "appearance";
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
  onClearMyList,
  onLinkAniListAccount,
  onLinkMalAccount,
  onRunSyncNow,
  onPullFromAniList,
  onPullFromMal,
}: SettingsPageProps) {
  const sectionRefs = useRef<Partial<Record<SettingsSectionId, HTMLElement | null>>>({});
  const restoredSectionScroll = useRef(false);
  const [openSection, setOpenSection] = useState<SettingsSectionId | null>(
    readStoredSettingsSection
  );
  const [importUsername, setImportUsername] = useState(username);
  const [importPreviewUsername, setImportPreviewUsername] = useState(username);
  const [importProvider, setImportProvider] = useState<"anilist" | "mal">("anilist");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse["preview"] | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<number[]>([]);
  const [openImportGroups, setOpenImportGroups] = useState<Record<string, boolean>>({});
  const [importFeedback, setImportFeedback] = useState<{
    kind: "success" | "error";
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
  } | null>(null);
  const [clearFeedback, setClearFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
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
  const [isSyncActivityOpen, setIsSyncActivityOpen] = useState(false);
  const [syncActivityTab, setSyncActivityTab] = useState<SyncActivityTab>("pending");
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

  useEffect(() => {
    if (!openSection || restoredSectionScroll.current) {
      return;
    }

    restoredSectionScroll.current = true;
    window.setTimeout(() => {
      sectionRefs.current[openSection]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
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
      setIsSyncing(false);
    }
  }

  async function pullFromRemote() {
    try {
      setIsPullingFromRemote(true);
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
      setIsPullingFromRemote(false);
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
    } finally {
      setIsPreviewLoading(false);
    }
  }

  return (
    <div className="scroll-container h-full overflow-y-auto px-6 py-24 text-white">
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
              Organize the app around your taste, your home page rhythm, and how
              much onboarding you want around.
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
          <div ref={rememberSectionRef("appearance")} className="scroll-mt-24">
            <AccordionSection
              icon={PaintBrushIcon}
              title="Appearance"
              description="Theme color and title presentation across the app."
              summary={[`Accent ${capitalize(settings.themeAccent)}`, titleLabel]}
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
                </div>
              </div>

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
            </div>
            </AccordionSection>
          </div>

          <div ref={rememberSectionRef("home")} className="scroll-mt-24">
            <AccordionSection
              icon={HomeIcon}
              title="Home"
              description="How the home screen behaves when you land in the app."
              summary={[
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
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Quick note</p>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Carousel rotation only matters when the trending shelf is visible.
                  If you turn the carousel off, the home page starts directly with
                  your own library sections.
                </p>
              </div>
            </div>
            </AccordionSection>
          </div>

          <div ref={rememberSectionRef("content")} className="scroll-mt-24">
            <AccordionSection
              icon={EyeSlashIcon}
              title="Content & Discovery"
              description="Control what appears in search results and discovery surfaces."
              summary={[settings.hideAdultContent ? "18+ hidden" : "18+ visible"]}
              open={openSection === "content"}
              onToggle={() => toggleSection("content")}
            >
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
                  ? `Push local tracker changes to your linked ${syncProviderLabel} account.`
                  : "Link an external account before syncing local tracker changes."
              }
              summary={[
                syncStatus.linked
                  ? syncStatus.autoSyncEnabled
                    ? "Auto on"
                    : "Auto off"
                  : "Auto unavailable",
                `${syncStatus.pendingCount} pending`,
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
                      ? `${syncStatus.pendingCount} change${syncStatus.pendingCount === 1 ? "" : "s"} waiting to sync.`
                      : syncStatus.linked
                        ? `No queued ${syncProviderLabel} changes right now.`
                        : "Sync is unavailable because no external account is linked."}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={runSyncNow}
                      disabled={!syncStatus.linked || isSyncing}
                      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                        !syncStatus.linked || isSyncing
                          ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                          : "border border-white/10 bg-white text-black hover:opacity-90"
                      }`}
                    >
                      {isSyncing ? "Syncing..." : "Sync now"}
                    </button>

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
                      ? "Pull your full AniList library and replace local tracker fields that differ."
                      : "Pull your full MyAnimeList library and replace local tracker fields that differ."}
                  </p>

                  <button
                    type="button"
                    onClick={pullFromRemote}
                    disabled={!syncStatus.linked || isPullingFromRemote}
                    className={`mt-5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                      !syncStatus.linked || isPullingFromRemote
                        ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                        : "border border-white/10 bg-white text-black hover:opacity-90"
                    }`}
                  >
                    {isPullingFromRemote ? "Updating..." : `Update from ${syncTargetLabel}`}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => openSyncActivity("pending")}
                  className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                >
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Pending</p>
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
                      className={`mt-7 rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                        isPreviewLoading || !importUsername.trim()
                          ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                          : "border border-white/10 bg-white text-black hover:opacity-90"
                      }`}
                    >
                      {isPreviewLoading ? "Loading preview..." : "Choose what to import"}
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

                  {importFeedback && (
                    <div
                      className={`mt-5 rounded-3xl border p-4 ${
                        importFeedback.kind === "success"
                          ? "border-emerald-400/20 bg-emerald-400/10"
                          : "border-rose-400/20 bg-rose-400/10"
                      }`}
                    >
                      <p className="text-sm font-semibold text-white">
                        {importFeedback.message}
                      </p>

                      {importFeedback.summary && (
                        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                          <ImportStat label="Found" value={importFeedback.summary.totalFound} />
                          <ImportStat label="Imported" value={importFeedback.summary.imported} />
                          <ImportStat label="Created" value={importFeedback.summary.created} />
                          <ImportStat label="Updated" value={importFeedback.summary.updated} />
                          <ImportStat label="Skipped" value={importFeedback.summary.skipped} />
                        </div>
                      )}
                    </div>
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
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
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
                      className={`rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
                        isPreviewLoading || !malLink.linked
                          ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/35"
                          : "border border-white/10 bg-white text-black hover:opacity-90"
                      }`}
                    >
                      {isPreviewLoading && importProvider === "mal"
                        ? "Loading preview..."
                        : "Choose what to import"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/8 px-4 py-3">
                    <p className="text-sm leading-6 text-white/70">
                      Some MAL entries may be skipped if the app cannot confidently match them to an AniList anime record.
                    </p>
                  </div>
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

          <div ref={rememberSectionRef("general")} className="scroll-mt-24">
            <AccordionSection
              icon={SparklesIcon}
              title="General"
              description="Welcome screen and small quality-of-life recovery actions."
              summary={["Welcome replay", "Recovery actions"]}
              open={openSection === "general"}
              onToggle={() => toggleSection("general")}
            >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ActionCard
                icon={SparklesIcon}
                title="Show welcome screen again"
                description="Reopen the intro screen whenever you want a fresh walkthrough."
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
            </AccordionSection>
          </div>
        </div>
      </div>

      <ImportSelectionModal
        isOpen={isImportModalOpen}
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
          try {
            setIsImporting(true);
            const result =
              importProvider === "mal"
                ? await onImportMal(selectedImportStatuses, selectedImportIds)
                : await onImportAniList(
                    importUsername.trim(),
                    selectedImportStatuses,
                    selectedImportIds
                  );
            setImportFeedback({
              kind: result.ok ? "success" : "error",
              message: result.message,
              summary: result.summary,
            });

            if (result.ok) {
              setIsImportModalOpen(false);
            }
          } finally {
            setIsImporting(false);
          }
        }}
      />

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
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-white/55"
      >
        <div className="flex min-w-0 items-start gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white/70">
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
            open ? "rotate-180" : ""
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
      <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white/70">
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
      className={`flex items-center justify-between gap-4 rounded-3xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-white/55 ${
        disabled
          ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-45"
          : checked
          ? "border-white/25 bg-white/10 hover:bg-white/12"
          : "border-white/10 bg-white/[0.03] hover:bg-white/8"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-white/65">
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

function ImportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
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
                {tab} ({activity[tab].length})
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
                        {formatDateTime(item.created_at || item.updated_at || "")}
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
                    <p
                      className={`mt-4 rounded-2xl border px-3 py-2 text-sm ${
                        activeTab === "failed" || item.last_error
                          ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
                          : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                      }`}
                    >
                      {item.message || item.last_error}
                    </p>
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

function ImportSelectionModal({
  isOpen,
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
}: {
  isOpen: boolean;
  provider: "anilist" | "mal";
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
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 py-10">
      <button
        type="button"
        aria-label="Close import overlay"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div className="relative z-10 flex h-[min(86vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/95 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/35">
              {provider === "mal" ? "MyAnimeList import" : "AniList import"}
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
              Choose exact anime to import
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
              Previewing{" "}
              <span className="text-white">
                {username || (provider === "mal" ? "your MyAnimeList account" : "your AniList account")}
              </span>
              .
              Expand a group, tick the titles you want, then import only those.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-white/60 transition hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="scroll-container min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isPreviewLoading ? (
            <div className="flex h-full items-center justify-center text-white/65">
              Loading AniList preview...
            </div>
          ) : previewError ? (
            <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-white/80">
              {previewError}
            </div>
          ) : !preview ? null : (
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
                onClick={onClose}
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
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
