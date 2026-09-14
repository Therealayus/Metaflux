export function FluxMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#15151C" stroke="rgba(255,255,255,0.12)" />
      <path
        d="M9 20.5c2.5 0 2.5-9 5-9s2.5 9 5 9 2.5-9 4-9"
        stroke="#818CF8"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="9" cy="20.5" r="1.6" fill="#818CF8" />
    </svg>
  );
}
