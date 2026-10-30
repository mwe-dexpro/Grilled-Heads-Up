import type { Progress } from "../home/buckets";

/** Above this many Tasks one continuous bar reads better than segments. */
const maxSegments = 12;

/** One segment per Task (Completed ones blue, first), or a continuous bar for long lists. Decorative. */
export function SegmentedProgress({ progress }: { progress: Progress }) {
  if (progress.total === 0) return null;
  if (progress.total > maxSegments) {
    return (
      <div className="progress-bar" aria-hidden="true">
        <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
      </div>
    );
  }
  return (
    <div className="progress-segments" aria-hidden="true">
      {Array.from({ length: progress.total }, (_, i) => (
        <span key={i} className={i < progress.done ? "done" : undefined} />
      ))}
    </div>
  );
}
