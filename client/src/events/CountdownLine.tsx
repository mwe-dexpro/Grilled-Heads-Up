import type { CSSProperties } from "react";
import { formatMonthDay } from "../home/format";
import { useI18n } from "../i18n/I18nProvider";
import type { Countdown } from "./risk";

/** A label needs this much of the line to itself, so neighbouring labels and the Event's date don't overlap. */
const labelRoom = 0.2;

/** Marks this close to the start align their label left, so it doesn't stick out of the line. */
const atStart = 0.1;

/**
 * The Preparation tasks on a line towards the Event, with a "Today" tick. Decorative: the Task list and
 * the explanation below the line say the same in words.
 */
export function CountdownLine({ countdown, eventDay }: { countdown: Countdown; eventDay: string }) {
  const { language, t } = useI18n();
  const at = (position: number): CSSProperties => ({ left: `${position * 100}%` });

  // Overdue marks get their labels first, then open ones, then done ones, as long as there is room.
  const priority = { overdue: 0, open: 1, done: 2 };
  const labelled = new Set<number>();
  for (const mark of [...countdown.marks].sort((a, b) => priority[a.state] - priority[b.state])) {
    const crowded = [...labelled].some((position) => Math.abs(position - mark.position) < labelRoom);
    if (!crowded && 1 - mark.position >= labelRoom) labelled.add(mark.position);
  }

  return (
    <div className="countdown" aria-hidden="true">
      <span className="countdown-track" />
      <span className="countdown-past" style={{ width: `${countdown.todayPosition * 100}%` }} />
      <span className="countdown-tick" style={at(countdown.todayPosition)} />
      <span className="countdown-today" style={at(countdown.todayPosition)}>
        {t("risk.today")}
      </span>
      {countdown.marks.map((mark) => (
        <span
          key={mark.offsetDays}
          className={["countdown-mark", mark.state, mark.position < atStart && "start"].filter(Boolean).join(" ")}
          style={at(mark.position)}
        >
          <span className="countdown-label">{labelled.has(mark.position) && (mark.tasks.length === 1 ? mark.tasks[0].title : t("risk.tasksOnDay", { count: String(mark.tasks.length) }))}</span>
          <span className="countdown-dot" />
        </span>
      ))}
      <span className="countdown-mark countdown-event" style={at(1)}>
        <span className="countdown-label">{formatMonthDay(eventDay, language)}</span>
        <span className="countdown-dot" />
      </span>
    </div>
  );
}
