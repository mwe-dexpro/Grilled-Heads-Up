import { dayOf, daysBetween } from "../home/days";
import type { Event } from "./event";
import { formatRelativeDay, type Translate } from "./formatEvent";
import type { EventRisk } from "./risk";

/** The status next to an Event: "At risk", "Tomorrow · 2 open", "Passed with 2 open tasks"; null when calm. */
export function formatRiskStatus(risk: EventRisk, t: Translate): string | null {
  const count = String(risk.openPreparation);
  switch (risk.status) {
    case "atRisk":
      return t("risk.atRisk");
    case "critical":
      return risk.daysUntil === 0 ? t("risk.criticalToday", { count }) : t("risk.criticalTomorrow", { count });
    case "passed":
      return risk.openPreparation === 1 ? t("risk.passedOne") : t("risk.passedMany", { count });
    case "none":
      return null;
  }
}

/** Why an Event is At risk or Critical, naming it: "Gift is 1 day overdue. Mom's birthday is in 8 days." */
export function formatRiskExplanation(event: Event, risk: EventRisk, now: Date, t: Translate): string | null {
  if (risk.status !== "atRisk" && risk.status !== "critical") return null;
  const today = dayOf(now);

  let what: string;
  if (risk.overdue.length > 1) {
    what = t("risk.overdueTasks", { count: String(risk.overdue.length) });
  } else if (risk.overdue.length === 1) {
    const [task] = risk.overdue;
    const days = daysBetween(task.date!, today);
    what = days === 1 ? t("risk.overdueOne", { title: task.title }) : t("risk.overdueMany", { title: task.title, count: String(days) });
  } else {
    what = risk.openPreparation === 1 ? t("risk.openOne") : t("risk.openMany", { count: String(risk.openPreparation) });
  }

  const when =
    risk.daysUntil < 0
      ? t("risk.eventUnderWay", { event: event.title })
      : t("risk.eventWhen", { event: event.title, when: formatRelativeDay(event.startDate, today, t) });
  return `${what} ${when}`;
}
