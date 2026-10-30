import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { goBack } from "../app/navigation";
import { useI18n } from "../i18n/I18nProvider";

/** 44px bar: a back button on the left (or a custom left action), an optional title and right action. */
export function NavBar({ left, title, right }: { left?: ReactNode; title?: string; right?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="nav-bar">
      <div className="nav-side">
        {left ?? (
          <button type="button" className="nav-action" onClick={goBack}>
            <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
            {t("nav.back")}
          </button>
        )}
      </div>
      {/* The middle cell stays even without a title, so the right action keeps to the right. */}
      {title ? <h1 className="nav-title">{title}</h1> : <span />}
      <div className="nav-side end">{right}</div>
    </div>
  );
}
