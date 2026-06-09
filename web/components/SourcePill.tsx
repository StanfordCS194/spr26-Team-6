import type { RfpSource } from "@/lib/rfpSource";
import { SOURCE_DISPLAY, SOURCE_STYLE } from "@/lib/rfpSource";

type Props = {
  source: RfpSource;
  className?: string;
};

export function SourcePill({ source, className = "" }: Props) {
  const style = SOURCE_STYLE[source];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.bg} ${style.text} ${style.border} ${className}`}
      title={`Sourced from ${SOURCE_DISPLAY[source]}`}
    >
      {SOURCE_DISPLAY[source]}
    </span>
  );
}
