import { TriangleAlert } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { formatRiskStatus } from "./formatEvent";
import type { EventRisk } from "./risk";

/**
 * An Event's status, wherever the Event shows: amber "At risk" with an icon, a filled amber pill when
 * Critical ("Tomorrow · 2 open"), a grey note once it passed with open Tasks; nothing when calm.
 */
export function RiskBadge({ risk }: { risk: EventRisk }) {
  const { t } = useI18n();
  const label = formatRiskStatus(risk, t);
  if (label === null) return null;

  switch (risk.status) {
    case "critical":
      return (
        <span className="risk-badge critical">
          <span className="visually-hidden">{t("risk.critical")}: </span>
          {label}
        </span>
      );
    case "atRisk":
      return (
        <span className="risk-badge at-risk">
          <TriangleAlert size={15} strokeWidth={1.5} aria-hidden="true" />
          {label}
        </span>
      );
    default:
      return <span className="risk-badge passed">{label}</span>;
  }
}
