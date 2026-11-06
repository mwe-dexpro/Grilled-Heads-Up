import type { Progress } from "../home/buckets";
import type { Segment } from "../lists/lists";

/** Above this many Tasks one continuous bar reads better than segments. */
const maxSegments = 12;

/**
 * One segment per Task (Completed ones blue, first), or a continuous bar for long lists. Decorative. With `segments`
 * (see `progressSegments`) an Overdue Task's segment is amber; without, segments are blue or grey only.
 */
export function SegmentedProgress({ progress, segments }: { progress: Progress; segments?: Segment[] }) {
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
        <span key={i} className={segments ? (segments[i] === "open" ? undefined : segments[i]) : i < progress.done ? "done" : undefined} />
      ))}
    </div>
  );
}
