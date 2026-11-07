import type { Progress } from "../home/buckets";
import { formatSubtaskCount } from "../home/format";
import { useI18n } from "../i18n/I18nProvider";

/** "3/5" for the eye and "3 of 5 subtasks done" for a screen reader: the second line of a Task row ends with it. */
export function SubtaskCount({ progress }: { progress: Progress }) {
  const { t } = useI18n();
  const { short, long } = formatSubtaskCount(progress, t);
  return (
    <span className="subtask-count">
      <span aria-hidden="true">{short}</span>
      <span className="visually-hidden">{long}</span>
    </span>
  );
}
