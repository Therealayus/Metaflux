export function FluxMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="flux-tile" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818CF8" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#flux-tile)" />
      <rect x="1" y="1" width="30" height="30" rx="8" stroke="rgba(255,255,255,0.25)" />
      <path
        d="M9 20.5c2.5 0 2.5-9 5-9s2.5 9 5 9 2.5-9 4-9"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="9" cy="20.5" r="1.7" fill="#FFFFFF" />
    </svg>
  );
}
