export function HexMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <polygon points="16,10 21,13 21,19 16,22 11,19 11,13" fill="currentColor" />
    </svg>
  );
}
