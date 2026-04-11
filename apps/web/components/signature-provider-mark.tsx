/**
 * Vizual identifikasiya: ASAN İmza / SİMA (rəsmi loqotiplər deyil — UI üçün stilizə edilmiş nişanlar).
 */
export function SignatureProviderMark({
  provider,
  className = "",
}: {
  provider: "ASAN_IMZA" | "SIMA" | string;
  className?: string;
}) {
  const isAsan = provider === "ASAN_IMZA";

  if (isAsan) {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-xl border-2 border-emerald-600/30 bg-emerald-50 px-4 py-3 shadow-sm ${className}`}
        role="img"
        aria-label="ASAN İmza"
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
          aria-hidden
        >
          <rect width="40" height="40" rx="10" fill="#047857" />
          <path
            d="M12 26V14h4l3 8 3-8h4v12h-3v-7l-3 7h-2l-3-7v7h-3z"
            fill="white"
          />
        </svg>
        <div className="text-left leading-tight">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            ASAN
          </div>
          <div className="text-sm font-bold text-emerald-950">İmza</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border-2 border-action/40 bg-action/10 px-4 py-3 shadow-sm ${className}`}
      role="img"
      aria-label="SİMA"
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden
      >
        <rect width="40" height="40" rx="10" fill="#2980B9" />
        <path
          d="M20 9c-2.5 0-4.5 2-4.5 4.5v1.5h2v-1.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5c0 1.2-.8 2.2-2 2.4l-1 .2c-1.4.3-2.5 1.5-2.5 3v1.4h2v-1.4c0-.5.3-.9.8-1l1-.2c2.1-.4 3.7-2.3 3.7-4.4C24.5 11 22.5 9 20 9z"
          fill="white"
          opacity="0.95"
        />
        <path
          d="M14.5 22.5c0-1.2.6-2.3 1.5-3 .9.7 1.5 1.8 1.5 3V31h-3v-8.5zM18 26v5h3v-5c0-1.1.9-2 2-2s2 .9 2 2v5h3v-5c0-2.8-2.2-5-5-5s-5 2.2-5 5z"
          fill="white"
        />
      </svg>
      <div className="text-left leading-tight">
        <div className="text-sm font-bold text-primary">SİMA</div>
        <div className="text-[11px] font-medium text-primary/90">
          biometrik imza
        </div>
      </div>
    </div>
  );
}
