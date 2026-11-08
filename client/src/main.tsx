import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { AuthGate } from "./auth/AuthGate";
import { I18nProvider } from "./i18n/I18nProvider";
// Inter ships with the app (offline, no Google Fonts); Latin + Latin-extended cover English and German.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-ext-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-ext-600.css";
import "./styles.css";

registerSW({ immediate: true });

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root to put the app in.");

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </I18nProvider>
  </StrictMode>,
);
