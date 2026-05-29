type Props = {
  direction?: "up" | "down" | "left" | "right";
  size?: number;
  className?: string;
};

/** Solid primary arrow with bounce animation for walkthrough callouts. */
export function WalkthroughBounceArrow({
  direction = "up",
  size = 48,
  className = "",
}: Props) {
  const rotation =
    direction === "up"
      ? ""
      : direction === "down"
        ? "rotate-180"
        : direction === "left"
          ? "-rotate-90"
          : "rotate-90";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={`shrink-0 text-govbid-primary drop-shadow-[0_2px_8px_rgba(79,70,229,0.45)] motion-safe:animate-bounce ${rotation} ${className}`}
    >
      <path
        fill="currentColor"
        d="M12 2.5 4.5 11h4.25v10.5h5.5V11H19.5L12 2.5z"
      />
    </svg>
  );
}
