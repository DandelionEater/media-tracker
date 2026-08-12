import {
  ChartBarSquareIcon,
  CheckIcon,
  ShieldCheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

type AnalyticsConsentModalProps = {
  onChoose: (enabled: boolean) => void;
};

export function AnalyticsConsentModal({ onChoose }: AnalyticsConsentModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-description"
    >
      <section className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#171717] text-white shadow-2xl">
        <header className="border-b border-white/10 px-6 py-6 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--app-accent)]/25 bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <ChartBarSquareIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                Your choice
              </p>
              <h2
                id="analytics-consent-title"
                className="mt-2 text-2xl font-bold tracking-tight"
              >
                Help improve Seenary, privately
              </h2>
              <p
                id="analytics-consent-description"
                className="mt-2 text-sm leading-6 text-white/55"
              >
                Share one anonymous activity record on days when you meaningfully use
                Seenary. This helps prioritize platforms, releases, and improvements.
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-4 px-6 py-6 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <PrivacyFact
              icon={CheckIcon}
              title="Only three fields"
              description="UTC date, operating-system platform, and Seenary version."
            />
            <PrivacyFact
              icon={ShieldCheckIcon}
              title="Rotating anonymous key"
              description="The server derives a new pseudonym every month. It is not sent by your device."
            />
            <PrivacyFact
              icon={XMarkIcon}
              title="Your media stays private"
              description="No titles, library, progress, searches, providers, history, or account name."
            />
            <PrivacyFact
              icon={XMarkIcon}
              title="No tracking identifiers"
              description="No stored IP address, device ID, advertising ID, hardware details, or fingerprint."
            />
          </div>

          <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/45">
            Background launches, updates, sync, and API traffic do not count. Daily
            pseudonymous rows are removed after finalized monthly totals pass a 45-day
            correction window. You can turn sharing off immediately in Settings.
          </p>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
          <button
            type="button"
            onClick={() => onChoose(false)}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/55"
          >
            No thanks
          </button>
          <button
            type="button"
            onClick={() => onChoose(true)}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/55"
          >
            Share anonymous statistics
          </button>
        </footer>
      </section>
    </div>
  );
}

function PrivacyFact({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CheckIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2 text-white/85">
        <Icon className="h-4 w-4 text-[var(--app-accent)]" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-white/45">{description}</p>
    </div>
  );
}
