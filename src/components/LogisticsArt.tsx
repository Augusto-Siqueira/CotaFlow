export function LogisticsArt({
  className = "pointer-events-none absolute inset-y-0 right-0 h-full w-full max-w-2xl text-white",
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 560 380"
      preserveAspectRatio="xMaxYMax slice"
      className={className}
      style={{
        maskImage: "linear-gradient(to right, transparent 0%, black 40%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 40%)",
      }}
    >
      <g stroke="currentColor" strokeOpacity="0.14" strokeWidth="1">
        {[60, 120, 180, 240, 300].map((y) => (
          <line key={y} x1="0" y1={y} x2="560" y2={y} />
        ))}
        {[100, 180, 260, 340, 420, 500].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="380" />
        ))}
      </g>

      <path
        d="M70 305 C 140 295, 190 232, 300 238 S 440 248, 505 212"
        fill="none"
        stroke="#75c779"
        strokeOpacity="0.95"
        strokeWidth="3"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      {[
        [70, 305],
        [300, 238],
        [505, 212],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="16" fill="#4db753" fillOpacity="0.3" />
          <circle cx={cx} cy={cy} r="7" fill="#4db753" />
          <circle cx={cx} cy={cy} r="3" fill="#ffffff" />
        </g>
      ))}

      <line x1="120" y1="352" x2="560" y2="352" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />
      <line x1="120" y1="366" x2="560" y2="366" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" strokeDasharray="22 16" />

      <g transform="translate(235 262)" fill="currentColor" opacity="0.32">
        <rect x="0" y="0" width="200" height="62" rx="5" />
        <rect x="14" y="14" width="172" height="3" rx="1.5" fill="#192134" fillOpacity="0.25" />
        <rect x="14" y="26" width="172" height="3" rx="1.5" fill="#192134" fillOpacity="0.25" />
        <rect x="200" y="50" width="14" height="8" />
        <path d="M214 66 V26 H246 L270 44 H284 V66 Z" />
        <path d="M232 32 H244 L258 44 H232 Z" fill="#192134" />
        <rect x="0" y="64" width="284" height="5" />
        {[34, 64, 150, 180, 236, 268].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="80" r="12" />
            <circle cx={cx} cy="80" r="5" fill="#192134" />
          </g>
        ))}
      </g>
    </svg>
  );
}
