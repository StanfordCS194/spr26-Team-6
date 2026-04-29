"use client";

type Props = {
  score: number;
  size?: number;
  stroke?: number;
};

export function ScoreRing({ score, size = 52, stroke = 4 }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, score));
  const offset = c - (clamped / 100) * c;

  return (
    <div
      className="relative shrink-0 text-govbid-primary"
      style={{ width: size, height: size }}
      aria-label={`Compatibility score ${score} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          className="text-violet-100"
          stroke="currentColor"
          fill="none"
          strokeWidth={stroke}
          r={r}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke="currentColor"
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          r={r}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-govbid-text md:text-xs">
        {score}
      </span>
    </div>
  );
}
