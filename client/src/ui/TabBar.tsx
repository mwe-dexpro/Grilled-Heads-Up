import { Calendar, Folder, Sun, type LucideIcon } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

export type Tab = "today" | "calendar" | "projects";

const tabs: { tab: Tab; icon: LucideIcon }[] = [
  { tab: "today", icon: Sun },
  { tab: "calendar", icon: Calendar },
  { tab: "projects", icon: Folder },
];

export function TabBar({ current, onSelect }: { current: Tab; onSelect(tab: Tab): void }) {
  const { t } = useI18n();
  return (
    <nav className="tab-bar" aria-label={t("tabs.label")}>
      {tabs.map(({ tab, icon: Icon }) => (
        <button
          key={tab}
          type="button"
          className="tab"
          aria-current={tab === current ? "page" : undefined}
          onClick={() => onSelect(tab)}
        >
          <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
          <span>{t(`tabs.${tab}`)}</span>
        </button>
      ))}
    </nav>
  );
}
