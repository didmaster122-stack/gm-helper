// Shared styles first: module stylesheets, imported through App, must come later to override them.
import "./shared/ui/styles/fonts.css";
import "./shared/ui/styles/tokens.css";
import "./shared/ui/styles/base.css";
import "./shared/ui/styles/components.css";
import "./app/app.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { initErrorLog } from "./shared/log";
import { ErrorBoundary, initTheme } from "./shared/ui";

initErrorLog();
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fullScreen>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
