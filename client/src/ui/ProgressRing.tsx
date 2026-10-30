import type { Progress } from "../home/buckets";

const size = 28;
const stroke = 2.5;
const radius = (size - stroke) / 2;
const circumference = 2 * Math.PI * radius;

/** A ring that fills clockwise from 12 o'clock. Decorative: the text next to it carries the numbers. */
export function ProgressRing({ progress }: { progress: Progress }) {
  const share = progress.total === 0 ? 0 : progress.done / progress.total;
  return (
    <svg className="progress-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="progress-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
      <circle
        className="progress-ring-arc"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - share)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
