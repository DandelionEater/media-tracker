import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  HeartIcon,
  LinkIcon,
  PencilSquareIcon,
  PlayCircleIcon,
  PlusIcon,
  StarIcon,
  TagIcon,
  TvIcon,
  UserGroupIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { ListEntryModal } from "./ListEntryModal";
import { getPreferredTitle, type TitleLanguage } from "../utils/titlePreference";

type AnimeDetailsProps = {
  animeId: number;
  onBack: () => void;
  titleLanguage: TitleLanguage;
};

type ListEntry = {
  status: "planned" | "watching" | "completed" | "paused" | "dropped";
  is_favorite?: number | boolean;
  progress: number;
  score: number | null;
  notes: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
};

type MetaItem = {
  label: string;
  value: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const STATUS_LABELS: Record<ListEntry["status"], string> = {
  planned: "Planned",
  watching: "Watching",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
};

export default function AnimeDetails({
  animeId,
  onBack,
  titleLanguage,
}: AnimeDetailsProps) {
  const [anime, setAnime] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listEntry, setListEntry] = useState<ListEntry | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  async function loadListEntry(currentAnimeId: number) {
    try {
      const result = await window.api.getMyListEntry(currentAnimeId);

      if (result.ok) {
        setListEntry(result.entry);
      }
    } catch (err) {
      console.error("Failed to load list entry:", err);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadAnime() {
      try {
        setLoading(true);
        setError(null);

        const data = await window.api.getAnimeDetails(animeId);

        if (mounted) {
          setAnime(data);
          await loadListEntry(animeId);
        }
      } catch (err) {
        console.error(err);
        if (mounted) {
          setError("Failed to load anime details.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadAnime();

    return () => {
      mounted = false;
    };
  }, [animeId]);

  async function handleAddToList() {
    if (listBusy) return;

    try {
      setListBusy(true);
      setListMessage(null);

      const result = await window.api.saveMyListEntry(animeId, {
        status: "planned",
        isFavorite: Boolean(listEntry?.is_favorite),
        progress: 0,
        score: null,
        notes: null,
      });

      if (!result.ok) {
        setListMessage(result.message);
        return;
      }

      setListEntry(result.entry ?? { status: "planned", progress: 0 });
      setListMessage(result.message);
    } catch (err) {
      console.error(err);
      setListMessage("Failed to add anime to your list.");
    } finally {
      setListBusy(false);
    }
  }

  function handleOpenEditor() {
    if (!listEntry) return;
    setIsEditorOpen(true);
  }

  async function handleQuickProgress() {
    if (listBusy) return;

    try {
      setListBusy(true);
      setListMessage(null);

      const totalEpisodes =
        typeof anime?.episodes === "number" && anime.episodes > 0
          ? anime.episodes
          : null;

      const currentProgress = Number(listEntry?.progress ?? 0);
      let nextProgress = currentProgress + 1;

      if (totalEpisodes) {
        nextProgress = Math.min(nextProgress, totalEpisodes);
      }

      let nextStatus = listEntry?.status ?? "watching";

      if (!listEntry) {
        nextStatus = "watching";
      }

      if (listEntry?.status === "planned" && nextProgress > 0) {
        nextStatus = "watching";
      }

      if (totalEpisodes && nextProgress >= totalEpisodes) {
        nextStatus = "completed";
        nextProgress = totalEpisodes;
      }

      const result = await window.api.saveMyListEntry(animeId, {
        status: nextStatus,
        isFavorite: Boolean(listEntry?.is_favorite),
        progress: nextProgress,
        score: listEntry?.score ?? null,
        notes: listEntry?.notes ?? null,
      });

      if (!result.ok) {
        setListMessage(result.message);
        return;
      }

      setListEntry(result.entry ?? null);

      if (!listEntry) {
        setListMessage("Anime added to your list and progress updated.");
      } else if (nextStatus === "completed") {
        setListMessage("Progress updated. Anime marked as completed.");
      } else {
        setListMessage("Progress updated.");
      }
    } catch (err) {
      console.error(err);
      setListMessage("Failed to update progress.");
    } finally {
      setListBusy(false);
    }
  }

  async function handleToggleFavorite() {
    if (listBusy) return;

    try {
      setListBusy(true);
      setListMessage(null);

      const nextFavorite = !Boolean(listEntry?.is_favorite);
      const fallbackStatus = listEntry?.status ?? "planned";
      const fallbackProgress = Number(listEntry?.progress ?? 0);

      const result = await window.api.saveMyListEntry(animeId, {
        status: fallbackStatus,
        isFavorite: nextFavorite,
        progress: fallbackProgress,
        score: listEntry?.score ?? null,
        notes: listEntry?.notes ?? null,
      });

      if (!result.ok) {
        setListMessage(result.message);
        return;
      }

      setListEntry(result.entry ?? null);
      setListMessage(
        nextFavorite
          ? listEntry
            ? "Added to favorites."
            : "Added to your list and marked as favorite."
          : "Removed from favorites."
      );
    } catch (err) {
      console.error(err);
      setListMessage("Failed to update favorite.");
    } finally {
      setListBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-white/80">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-white">
        <button
          onClick={onBack}
          className="mb-4 rounded-xl bg-white/10 px-4 py-2 transition hover:bg-white/20"
        >
          Back
        </button>
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  if (!anime) {
    return (
      <div className="p-6 text-white">
        <button
          onClick={onBack}
          className="mb-4 rounded-xl bg-white/10 px-4 py-2 transition hover:bg-white/20"
        >
          Back
        </button>
        <p>No anime found.</p>
      </div>
    );
  }

  const title = getPreferredTitle(anime.title, titleLanguage);

  const studios =
    anime.studios?.nodes?.map((studio: any) => studio.name).join(", ") || null;

  const metaItems: MetaItem[] = [
    anime.format
      ? { label: "Format", value: anime.format, icon: TvIcon }
      : null,
    anime.status
      ? { label: "Status", value: formatEnum(anime.status), icon: CheckCircleIcon }
      : null,
    anime.episodes
      ? { label: "Episodes", value: `${anime.episodes}`, icon: PlayCircleIcon }
      : null,
    anime.averageScore
      ? { label: "Avg score", value: `${anime.averageScore}%`, icon: StarIcon }
      : null,
    anime.duration
      ? { label: "Duration", value: `${anime.duration} min`, icon: ClockIcon }
      : null,
    anime.source
      ? { label: "Source", value: formatEnum(anime.source), icon: BookmarkIcon }
      : null,
    anime.season && anime.seasonYear
      ? {
          label: "Season",
          value: `${formatEnum(anime.season)} ${anime.seasonYear}`,
          icon: CalendarDaysIcon,
        }
      : null,
  ].filter(Boolean) as MetaItem[];

  const titleRows = [
    anime.title?.romaji ? { label: "Romaji", value: anime.title.romaji } : null,
    anime.title?.english
      ? { label: "English", value: anime.title.english }
      : null,
    anime.title?.native ? { label: "Native", value: anime.title.native } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const safeTags = (anime.tags ?? [])
    .filter((tag: any) => !tag.isMediaSpoiler && !tag.isGeneralSpoiler)
    .sort((a: any, b: any) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, 12);

  const characterEdges = anime.characters?.edges?.slice(0, 12) ?? [];
  const staffEdges = anime.staff?.edges?.slice(0, 12) ?? [];
  const relationEdges = anime.relations?.edges ?? [];
  const recommendations = anime.recommendations?.nodes ?? [];
  const externalLinks = (anime.externalLinks ?? []).filter((link: any) => !link.isDisabled);
  const streamingEpisodes = anime.streamingEpisodes ?? [];
  const trailerUrl = getTrailerUrl(anime.trailer);
  const primaryLinks = [
    anime.siteUrl ? { label: "AniList", url: anime.siteUrl, accent: "bg-sky-400/15 text-sky-100" } : null,
    trailerUrl ? { label: "Trailer", url: trailerUrl, accent: "bg-red-400/15 text-red-100" } : null,
  ].filter(Boolean) as Array<{ label: string; url: string; accent: string }>;

  const isFavorite = Boolean(listEntry?.is_favorite);

  return (
    <>
      <div className="relative h-full overflow-hidden rounded-3xl bg-[#0f0f0f] text-white">
        <div className="scroll-container h-full overflow-y-auto">
          <div className="relative h-56 w-full overflow-hidden rounded-t-3xl">
            {anime.bannerImage ? (
              <img
                src={anime.bannerImage}
                alt={`${title} banner`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-white/5" />
            )}

            <div className="absolute inset-0 bg-linear-to-t from-[#0f0f0f] via-[#0f0f0f]/60 to-[#0f0f0f]/10" />
            <div className="absolute inset-0 bg-linear-to-r from-[#0f0f0f]/80 via-transparent to-[#0f0f0f]/40" />
          </div>

          <div className="relative px-6 pb-28 pl-8">
            <section className="-mt-20 grid grid-cols-1 gap-6 lg:grid-cols-[10rem_1fr]">
              <div>
                <img
                  src={anime.coverImage?.large}
                  alt={title}
                  className="h-64 w-40 rounded-2xl object-cover shadow-2xl ring-1 ring-white/10"
                />
              </div>

              <div className="min-w-0 self-end rounded-3xl border border-white/10 bg-[#0f0f0f]/70 p-5 shadow-2xl backdrop-blur-md">
                <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-white">
                  {title}
                </h1>

                <div className="mt-4 flex flex-wrap gap-2">
                  {metaItems.map((item) => (
                    <MetaPill key={`${item.label}-${item.value}`} item={item} />
                  ))}
                </div>

                <div className="mt-5 grid max-w-3xl grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
                  {titleRows.map((row) => (
                    <InfoLine key={row.label} label={row.label} value={row.value} />
                  ))}

                  {anime.source && (
                    <InfoLine label="Source" value={formatEnum(anime.source)} />
                  )}

                  {anime.countryOfOrigin && (
                    <InfoLine label="Origin" value={anime.countryOfOrigin} />
                  )}

                  {anime.startDate && (
                    <InfoLine label="Started" value={formatFuzzyDate(anime.startDate)} />
                  )}

                  {anime.endDate && (
                    <InfoLine label="Ended" value={formatFuzzyDate(anime.endDate)} />
                  )}

                  {studios && <InfoLine label="Studios" value={studios} wide />}

                  {anime.nextAiringEpisode && (
                    <InfoLine
                      label="Next airing"
                      value={`Episode ${anime.nextAiringEpisode.episode}`}
                    />
                  )}
                </div>

                {primaryLinks.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {primaryLinks.map((link) => (
                      <a
                        key={link.label}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-sm transition hover:bg-white/10 ${link.accent}`}
                      >
                        <LinkIcon className="h-4 w-4" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}

                {listMessage && (
                  <div className="mt-5 w-fit rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                    {listMessage}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-6 grid grid-cols-1 gap-8 xl:grid-cols-[1fr_18rem]">
              <div className="min-w-0 space-y-8">
                <PersonalTrackerPanel
                  entry={listEntry}
                  totalEpisodes={anime.episodes ?? null}
                  onAdd={handleAddToList}
                  onEdit={handleOpenEditor}
                  busy={listBusy}
                />

                {anime.genres?.length > 0 && (
                  <ContentSection title="Genres" icon={TagIcon}>
                    <div className="flex flex-wrap gap-2">
                      {anime.genres.map((genre: string) => (
                        <span
                          key={genre}
                          className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm text-white/80"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  </ContentSection>
                )}

                {safeTags.length > 0 && (
                  <ContentSection title="Tags" icon={TagIcon}>
                    <div className="flex flex-wrap gap-2">
                      {safeTags.map((tag: any) => (
                        <span
                          key={tag.id}
                          className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm text-white/80"
                          title={tag.description || tag.name}
                        >
                          {tag.name}
                          {tag.rank ? (
                            <span className="ml-2 text-white/35">{tag.rank}%</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </ContentSection>
                )}

                {anime.description && (
                  <ContentSection title="Description" icon={BookmarkIcon}>
                    <div
                      className="max-w-4xl text-sm leading-7 text-white/75 [&_br]:hidden"
                      dangerouslySetInnerHTML={{ __html: anime.description }}
                    />
                  </ContentSection>
                )}

                {characterEdges.length > 0 && (
                  <PeopleShelf title="Characters" icon={UsersIcon} edges={characterEdges} />
                )}

                {staffEdges.length > 0 && (
                  <PeopleShelf title="Staff" icon={UserGroupIcon} edges={staffEdges} />
                )}

                {relationEdges.length > 0 && (
                  <MediaShelf
                    title="Related Anime"
                    icon={LinkIcon}
                    items={relationEdges.map((edge: any) => ({
                      label: formatEnum(edge.relationType || "Related"),
                      media: edge.node,
                    }))}
                  />
                )}

                {recommendations.length > 0 && (
                  <MediaShelf
                    title="Recommendations"
                    icon={StarIcon}
                    items={recommendations
                      .filter((item: any) => item.mediaRecommendation)
                      .map((item: any) => ({
                        label: item.rating ? `${item.rating} votes` : "Recommended",
                        media: item.mediaRecommendation,
                      }))}
                  />
                )}

                {(streamingEpisodes.length > 0 || externalLinks.length > 0) && (
                  <LinksSection
                    streamingEpisodes={streamingEpisodes}
                    externalLinks={externalLinks}
                  />
                )}

                {anime.synonyms?.length > 0 && (
                  <ContentSection title="Synonyms" icon={TagIcon}>
                    <p className="text-sm leading-7 text-white/60">
                      {anime.synonyms.join(", ")}
                    </p>
                  </ContentSection>
                )}
              </div>

              <div className="space-y-5">
                <TrailerPanel trailer={anime.trailer} trailerUrl={trailerUrl} />

                <SideFacts
                  score={anime.averageScore ?? null}
                  meanScore={anime.meanScore ?? null}
                  popularity={anime.popularity ?? null}
                  favourites={anime.favourites ?? null}
                  duration={anime.duration ?? null}
                  source={anime.source ?? null}
                  countryOfOrigin={anime.countryOfOrigin ?? null}
                  startDate={anime.startDate ?? null}
                  endDate={anime.endDate ?? null}
                  season={anime.season}
                  seasonYear={anime.seasonYear}
                  format={anime.format}
                  animeStatus={anime.status}
                />
              </div>
            </section>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex justify-center">
          <div className="pointer-events-auto flex items-center overflow-hidden rounded-full border border-white/10 bg-[#1a1a1a]/90 shadow-2xl backdrop-blur-md">
            <ActionButton label="Back" onClick={onBack}>
              <ArrowLeftIcon className="h-5 w-5" />
            </ActionButton>

            <ActionDivider />

            <ActionButton
              label={listEntry ? "Edit list entry" : "Add to list"}
              onClick={listEntry ? handleOpenEditor : handleAddToList}
              disabled={listBusy}
            >
              {listEntry ? (
                <PencilSquareIcon className="h-5 w-5" />
              ) : (
                <PlusIcon className="h-5 w-5" />
              )}
            </ActionButton>

            <ActionDivider />

            <ActionButton
              label={listEntry ? "Add 1 episode watched" : "Start watching (+1)"}
              onClick={handleQuickProgress}
              disabled={listBusy}
            >
              <span className="text-base font-semibold tracking-wide">+1</span>
            </ActionButton>

            <ActionDivider />

            <ActionButton
              label={isFavorite ? "Remove favorite" : "Add to favorites"}
              onClick={handleToggleFavorite}
              disabled={listBusy}
              active={isFavorite}
            >
              {isFavorite ? (
                <HeartIconSolid className="h-5 w-5" />
              ) : (
                <HeartIcon className="h-5 w-5" />
              )}
            </ActionButton>
          </div>
        </div>
      </div>

      <ListEntryModal
        animeId={animeId}
        isOpen={isEditorOpen}
        entry={listEntry}
        title={title}
        totalEpisodes={anime?.episodes ?? null}
        onClose={() => setIsEditorOpen(false)}
        onSaved={(updatedEntry) => {
          setListEntry(updatedEntry);
          setListMessage("List entry updated.");
        }}
        onRemoved={() => {
          setListEntry(null);
          setListMessage("Anime removed from your list.");
        }}
      />
    </>
  );
}

function MetaPill({ item }: { item: MetaItem }) {
  const Icon = item.icon;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs text-white/80 shadow-lg">
      <Icon className="h-3.5 w-3.5 text-white/45" />
      <span className="text-white/40">{item.label}</span>
      <span className="font-medium text-white/85">{item.value}</span>
    </span>
  );
}

function InfoLine({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <p className={`min-w-0 text-white/65 ${wide ? "md:col-span-2" : ""}`}>
      <span className="text-white/35">{label}</span>
      <span className="mx-2 text-white/20">/</span>
      <span className="text-white/75">{value}</span>
    </p>
  );
}

function PersonalTrackerPanel({
  entry,
  totalEpisodes,
  onAdd,
  onEdit,
  busy,
}: {
  entry: ListEntry | null;
  totalEpisodes: number | null;
  onAdd: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  if (!entry) {
    return (
      <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/8 p-2.5 text-white/65">
            <BookmarkIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-white/35">
              Your tracker
            </p>
            <h2 className="mt-1 text-base font-semibold text-white">Not in list</h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-white/50">
          Add this title to track progress, notes, and your personal score.
        </p>

        <button
          onClick={onAdd}
          disabled={busy}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          Add to list
        </button>
      </aside>
    );
  }

  const progressPercent =
    totalEpisodes && totalEpisodes > 0
      ? Math.min(100, Math.round((entry.progress / totalEpisodes) * 100))
      : null;

  return (
    <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/35">
            Your progress
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white">
              {STATUS_LABELS[entry.status]}
            </span>
            <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-white/70">
              {formatProgress(entry.progress, totalEpisodes)}
            </span>
          </div>
        </div>

        <button
          onClick={onEdit}
          disabled={busy}
          className="rounded-2xl border border-white/10 bg-white/6 p-2.5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          title="Edit tracker entry"
        >
          <PencilSquareIcon className="h-5 w-5" />
        </button>
      </div>

      {progressPercent !== null && (
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-white/40">{progressPercent}% watched</p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <TrackerStat label="Score" value={entry.score ?? "-"} icon={StarIcon} />
        <TrackerStat
          label="Updated"
          value={entry.updated_at ? formatDate(entry.updated_at) : "-"}
          icon={ClockIcon}
        />
      </div>

      {entry.notes?.trim() && (
        <p className="mt-4 line-clamp-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/60">
          {entry.notes.trim()}
        </p>
      )}
    </aside>
  );
}

function TrackerStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <Icon className="h-4 w-4 text-white/40" />
      <p className="mt-3 text-xs text-white/35">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-white/80">{value}</p>
    </div>
  );
}

function ContentSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-white/55">
        <Icon className="h-4 w-4" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function PeopleShelf({
  title,
  icon: Icon,
  edges,
}: {
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  edges: any[];
}) {
  return (
    <ContentSection title={title} icon={Icon}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {edges.map((edge, index) => {
          const person = edge.node;
          const voiceActor = edge.voiceActors?.[0];
          const name = getPersonName(person);

          return (
            <div
              key={`${title}-${person?.id ?? index}-${edge.role}`}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
            >
              <div className="flex gap-3 p-3">
                <PersonImage src={person?.image?.large} name={name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white/85">
                    {name}
                  </p>
                  {edge.role && (
                    <p className="mt-1 truncate text-xs text-white/45">
                      {formatEnum(edge.role)}
                    </p>
                  )}
                  {voiceActor && (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/50">
                      VA: {getPersonName(voiceActor)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ContentSection>
  );
}

function MediaShelf({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  items: Array<{ label: string; media: any }>;
}) {
  return (
    <ContentSection title={title} icon={Icon}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.slice(0, 10).map(({ label, media }, index) => {
          const titleText = getMediaTitle(media);

          return (
            <div
              key={`${media?.id ?? index}-${label}`}
              className="flex min-w-0 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
                {media?.coverImage?.large ? (
                  <img
                    src={media.coverImage.large}
                    alt={titleText}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-white/5" />
                )}
              </div>
              <div className="min-w-0 flex-1 py-1">
                <p className="line-clamp-2 text-sm font-semibold leading-5 text-white/85">
                  {titleText}
                </p>
                <p className="mt-2 truncate text-xs text-white/45">{label}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {media?.format && (
                    <span className="rounded-full bg-white/8 px-2 py-1 text-[11px] text-white/45">
                      {media.format}
                    </span>
                  )}
                  {media?.averageScore && (
                    <span className="rounded-full bg-white/8 px-2 py-1 text-[11px] text-white/45">
                      {media.averageScore}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ContentSection>
  );
}

function LinksSection({
  streamingEpisodes,
  externalLinks,
}: {
  streamingEpisodes: any[];
  externalLinks: any[];
}) {
  return (
    <ContentSection title="Watch & Links" icon={LinkIcon}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {streamingEpisodes.slice(0, 6).map((episode, index) => (
          <a
            key={`stream-${episode.url ?? index}`}
            href={episode.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/8"
          >
            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-2xl bg-white/5">
              {episode.thumbnail ? (
                <img
                  src={episode.thumbnail}
                  alt={episode.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-white/5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white/85">
                {episode.title || episode.site}
              </p>
              <p className="mt-1 text-xs text-white/45">{episode.site}</p>
            </div>
          </a>
        ))}

        {externalLinks.slice(0, 8).map((link) => (
          <a
            key={`external-${link.id ?? link.url}`}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/8"
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/8"
              style={{ color: link.color || undefined }}
            >
              <LinkIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white/85">
                {link.site || "External link"}
              </p>
              {link.type && (
                <p className="mt-1 text-xs text-white/45">{formatEnum(link.type)}</p>
              )}
            </div>
          </a>
        ))}
      </div>
    </ContentSection>
  );
}

function PersonImage({ src, name }: { src?: string | null; name: string }) {
  return (
    <div className="h-16 w-12 shrink-0 overflow-hidden rounded-2xl bg-white/5">
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-white/5" />
      )}
    </div>
  );
}

function TrailerPanel({
  trailer,
  trailerUrl,
}: {
  trailer?: { id?: string | null; site?: string | null; thumbnail?: string | null } | null;
  trailerUrl: string | null;
}) {
  if (!trailer?.thumbnail && !trailerUrl) return null;

  const content = (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
      {trailer?.thumbnail ? (
        <div className="relative aspect-video overflow-hidden bg-white/5">
          <img
            src={trailer.thumbnail}
            alt="Trailer thumbnail"
            className="h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur">
            <PlayCircleIcon className="h-4 w-4" />
            Trailer
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4">
          <PlayCircleIcon className="h-5 w-5 text-white/55" />
          <span className="text-sm font-medium text-white/80">Trailer</span>
        </div>
      )}

      {trailer?.site && (
        <div className="px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-white/35">
            {trailer.site}
          </p>
        </div>
      )}
    </div>
  );

  if (!trailerUrl) return content;

  return (
    <a href={trailerUrl} target="_blank" rel="noreferrer" className="block">
      {content}
    </a>
  );
}

function SideFacts({
  score,
  meanScore,
  popularity,
  favourites,
  duration,
  source,
  countryOfOrigin,
  startDate,
  endDate,
  season,
  seasonYear,
  format,
  animeStatus,
}: {
  score: number | null;
  meanScore: number | null;
  popularity: number | null;
  favourites: number | null;
  duration: number | null;
  source?: string | null;
  countryOfOrigin?: string | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  endDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  season?: string | null;
  seasonYear?: number | null;
  format?: string | null;
  animeStatus?: string | null;
}) {
  const facts = [
    score ? { label: "Community", value: `${score}%`, icon: StarIcon } : null,
    meanScore ? { label: "Mean", value: `${meanScore}%`, icon: StarIcon } : null,
    popularity
      ? { label: "Popularity", value: formatNumber(popularity), icon: UsersIcon }
      : null,
    favourites
      ? { label: "Favourites", value: formatNumber(favourites), icon: HeartIcon }
      : null,
    duration ? { label: "Duration", value: `${duration} min`, icon: ClockIcon } : null,
    source ? { label: "Source", value: formatEnum(source), icon: BookmarkIcon } : null,
    countryOfOrigin
      ? { label: "Country", value: countryOfOrigin, icon: TagIcon }
      : null,
    startDate
      ? { label: "Start", value: formatFuzzyDate(startDate), icon: CalendarDaysIcon }
      : null,
    endDate
      ? { label: "End", value: formatFuzzyDate(endDate), icon: CalendarDaysIcon }
      : null,
    season && seasonYear
      ? {
          label: "Season",
          value: `${formatEnum(season)} ${seasonYear}`,
          icon: CalendarDaysIcon,
        }
      : null,
    format ? { label: "Format", value: format, icon: TvIcon } : null,
    animeStatus
      ? { label: "Airing", value: formatEnum(animeStatus), icon: CheckCircleIcon }
      : null,
  ].filter(Boolean) as MetaItem[];

  if (!facts.length) return null;

  return (
    <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-white/35">
        Quick facts
      </p>
      <div className="mt-4 space-y-3">
        {facts.map((fact) => {
          const Icon = fact.icon;
          return (
            <div
              key={`${fact.label}-${fact.value}`}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
            >
              <Icon className="h-4 w-4 text-white/45" />
              <div className="min-w-0">
                <p className="text-xs text-white/35">{fact.label}</p>
                <p className="truncate text-sm font-medium text-white/75">
                  {fact.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  active = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`no-drag px-5 py-3 transition-transform duration-300 ease-out hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 ${
        active
          ? "text-[var(--app-accent)]"
          : "text-white/80 hover:text-white"
      }`}
      title={label}
    >
      {children}
    </button>
  );
}

function ActionDivider() {
  return <div className="h-6 w-px bg-white/10" />;
}

function formatProgress(progress: number, totalEpisodes: number | null) {
  if (totalEpisodes && totalEpisodes > 0) {
    return `${progress} / ${totalEpisodes} eps`;
  }

  return `${progress} eps`;
}

function formatEnum(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatFuzzyDate(date: {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}) {
  if (!date?.year) return "-";

  const parts = [date.year];

  if (date.month) {
    parts.push(date.month);
  }

  if (date.day) {
    parts.push(date.day);
  }

  return parts.join("-");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function getPersonName(person: any) {
  return (
    person?.name?.userPreferred ||
    person?.name?.full ||
    person?.name?.native ||
    "Unknown"
  );
}

function getMediaTitle(media: any) {
  return (
    media?.title?.userPreferred ||
    media?.title?.english ||
    media?.title?.romaji ||
    media?.title?.native ||
    "Unknown title"
  );
}

function getTrailerUrl(trailer?: {
  id?: string | null;
  site?: string | null;
} | null) {
  if (!trailer?.id || !trailer.site) return null;

  const site = trailer.site.toLowerCase();

  if (site === "youtube") {
    return `https://www.youtube.com/watch?v=${trailer.id}`;
  }

  if (site === "dailymotion") {
    return `https://www.dailymotion.com/video/${trailer.id}`;
  }

  return null;
}
