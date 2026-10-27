// The Coursework mark: two prerequisites feeding one course, drawn in the palette tokens so it follows light and dark.
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      <rect width="32" height="32" rx="3" fill="var(--accent)" />
      <path d="M9 10.5 L23 16 M9 21.5 L23 16" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="10.5" r="3.2" fill="var(--on-accent)" />
      <circle cx="9" cy="21.5" r="3.2" fill="var(--on-accent)" />
      <circle cx="23" cy="16" r="4" fill="var(--on-accent)" />
    </svg>
  );
}
