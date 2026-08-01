import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  ArrowPathIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";
import type { ArtistSearchResult, SongSearchResult } from "../types/domain";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";

const PREVIEW_START_SECONDS = 12;
const PREVIEW_DURATION_SECONDS = 20;

let activePreview:
  | {
      audio: HTMLAudioElement;
      stop: () => void;
    }
  | null = null;

type SongSearchCardProps = {
  result: SongSearchResult | ArtistSearchResult;
  onSelectMedia: (id: number, type: SongSearchResult["media"]["type"]) => void;
  titleLanguage: TitleLanguage;
  previewVolume: number;
  matchKind?: "song" | "artist";
};

export function SongSearchCard({
  result,
  onSelectMedia,
  titleLanguage,
  previewVolume,
  matchKind = "song",
}: SongSearchCardProps) {
  const songTitle =
    result.song.title.romaji || result.song.title.native || "Unknown theme song";
  const artistNames =
    result.song.artists.map((artist) => artist.name).filter(Boolean).join(", ") ||
    "Unknown artist";
  const mediaTitle = getPreferredTitle(result.media.title, titleLanguage);
  const themeLabel = `${result.theme.type}${
    result.theme.sequence ? result.theme.sequence : ""
  }`;
  const artistMatch = matchKind === "artist" ? (result as ArtistSearchResult) : null;
  const primaryTitle = artistMatch?.artist.name || songTitle;
  const secondaryLabel = artistMatch
    ? `${artistMatch.creditedAs ? `Credited as ${artistMatch.creditedAs} · ` : ""}${songTitle}`
    : artistNames;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewStartedAtRef = useRef(0);
  const previewHasStartedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);

  function resetPreview() {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    if (audio.readyState >= 1) {
      audio.currentTime = previewStartedAtRef.current;
    }
    if (activePreview?.audio === audio) {
      activePreview = null;
    }
    previewHasStartedRef.current = false;
    setIsPlaying(false);
    setIsLoadingPreview(false);
    setPreviewProgress(0);
  }

  function pausePreview() {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    if (activePreview?.audio === audio) {
      activePreview = null;
    }
    setIsLoadingPreview(false);
  }

  function finishPreview() {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    if (activePreview?.audio === audio) {
      activePreview = null;
    }
    previewHasStartedRef.current = false;
    setIsPlaying(false);
    setIsLoadingPreview(false);
    setPreviewProgress(1);
  }

  function preparePreview() {
    if (!result.previewUrl) return null;
    if (audioRef.current) return audioRef.current;

    const audio = new Audio(result.previewUrl);
    audio.preload = "metadata";
    audio.volume = clampVolume(previewVolume);
    audio.onplaying = () => {
      setIsLoadingPreview(false);
      setIsPlaying(true);
    };
    audio.onwaiting = () => {
      if (!audio.paused) setIsLoadingPreview(true);
    };
    audio.onstalled = () => {
      if (!audio.paused) setIsLoadingPreview(true);
    };
    audio.onseeking = () => {
      if (!audio.paused) setIsLoadingPreview(true);
    };
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => finishPreview();
    audio.onerror = () => {
      setIsLoadingPreview(false);
      setIsPlaying(false);
    };
    audio.ontimeupdate = () => {
      const elapsed = Math.max(0, audio.currentTime - previewStartedAtRef.current);
      setPreviewProgress(Math.min(1, elapsed / PREVIEW_DURATION_SECONDS));

      if (!audio.paused && elapsed >= PREVIEW_DURATION_SECONDS) {
        finishPreview();
      }
    };
    audioRef.current = audio;
    audio.load();
    return audio;
  }

  async function handlePreviewClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.blur();

    const audio = preparePreview();
    if (!audio) return;

    if (isLoadingPreview) {
      pausePreview();
      return;
    }

    if (!audio.paused) {
      pausePreview();
      return;
    }

    activePreview?.stop();

    if (!previewHasStartedRef.current) {
      if (audio.readyState >= 1 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(
          PREVIEW_START_SECONDS,
          Math.max(0, audio.duration - PREVIEW_DURATION_SECONDS)
        );
      }
      previewStartedAtRef.current = audio.currentTime;
      previewHasStartedRef.current = true;
      setPreviewProgress(0);
    }

    activePreview = {
      audio,
      stop: () => resetPreview(),
    };
    setIsLoadingPreview(true);

    try {
      await audio.play();
    } catch {
      if (activePreview?.audio === audio) {
        activePreview = null;
      }
      setIsLoadingPreview(false);
      setIsPlaying(false);
    }
  }

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = clampVolume(previewVolume);
    }
  }, [previewVolume]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (activePreview?.audio === audio) {
        activePreview = null;
      }
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, [result.previewUrl]);

  return (
    <div
      className="browse-search-card group relative cursor-pointer"
      onMouseEnter={preparePreview}
    >
      <button
        type="button"
        className="absolute inset-0 z-40 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        aria-label={`Open Anime ${mediaTitle}, matched by ${
          artistMatch ? `artist ${artistMatch.artist.name}` : `${themeLabel} song ${songTitle}`
        }`}
        onClick={() => onSelectMedia(result.media.id, result.media.type)}
      />

      <div className="browse-search-poster relative aspect-2/3 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <img
          src={result.media.coverImage.large}
          alt={mediaTitle}
          className="h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.02] group-hover:brightness-50 group-hover:blur-[2px]"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-black/80 via-black/35 to-transparent"
        />
        <div className="pointer-events-none absolute inset-x-2 top-2 z-50 flex h-6 items-stretch gap-1">
          <div className="flex h-full shrink-0 items-center rounded-lg border border-fuchsia-300/20 bg-fuchsia-400/15 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-fuchsia-100 backdrop-blur-sm">
            {artistMatch ? "Artist" : "Song"}
          </div>

          {result.previewUrl && (
            <button
              type="button"
              onClick={(event) => void handlePreviewClick(event)}
              className={`relative flex h-full min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-black/70 px-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white shadow-lg backdrop-blur-md transition duration-200 hover:border-white/35 hover:bg-black/85 focus:outline-none focus:ring-2 focus:ring-white/70 ${
                isPlaying || isLoadingPreview
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
              }`}
              aria-label={
                isLoadingPreview
                  ? `Cancel loading preview of ${songTitle}`
                  : isPlaying
                  ? `Pause preview of ${songTitle}`
                  : `Play a 20 second preview of ${songTitle}`
              }
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-fuchsia-400/35 transition-[width] duration-200 ease-linear"
                style={{ width: `${Math.round(previewProgress * 100)}%` }}
              />
              <span className="relative z-10 flex items-center justify-center gap-1">
                {isLoadingPreview ? (
                  <>
                    <ArrowPathIcon className="h-3 w-3 shrink-0 animate-spin" />
                    <span className="truncate">Loading</span>
                  </>
                ) : isPlaying ? (
                  <>
                    <PauseIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">Pause</span>
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">Play</span>
                  </>
                )}
              </span>
            </button>
          )}

          <div
            className={`ml-auto flex h-full shrink-0 items-center rounded-lg border px-2 text-[9px] font-semibold uppercase tracking-[0.12em] backdrop-blur-sm ${
              result.theme.type === "OP"
                ? "border-amber-300/20 bg-amber-400/15 text-amber-100"
                : "border-cyan-300/20 bg-cyan-400/15 text-cyan-100"
            }`}
          >
            {themeLabel}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-3 pt-16">
          <p className="line-clamp-2 text-sm font-semibold text-white">{primaryTitle}</p>
          <p className="mt-1 line-clamp-1 text-[10px] font-medium uppercase tracking-[0.1em] text-fuchsia-100/65">
            {secondaryLabel}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-white/75">{mediaTitle}</p>
        </div>
      </div>

      <div className="browse-search-gallery-info hidden pt-3">
        <p className="line-clamp-2 text-sm font-semibold text-white">{primaryTitle}</p>
        <p className="mt-1 line-clamp-2 text-xs text-white/45">
          {themeLabel} for {mediaTitle} · {artistNames}
        </p>
      </div>
    </div>
  );
}

function clampVolume(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.7));
}
