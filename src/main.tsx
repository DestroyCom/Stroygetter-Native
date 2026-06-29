import * as Sentry from "@sentry/react";
import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./globals.css";
import "./lib/i18n";
import { trackAppStarted } from "./lib/analytics";
import { setLogLevel } from "./lib/commands";
import { initLogger } from "./lib/logger";
import { loadDownloadSettings } from "./lib/settings";

const settings = loadDownloadSettings();

if (settings.errorReportingEnabled && import.meta.env.VITE_GLITCHTIP_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_GLITCHTIP_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

initLogger();
setLogLevel(settings.logLevel);
trackAppStarted();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p className="p-8 text-white">Une erreur inattendue est survenue.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
