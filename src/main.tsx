// Shared styles first: module stylesheets, imported through App, must come later to override them.
import "./shared/ui/styles/fonts.css";
import "./shared/ui/styles/tokens.css";
import "./shared/ui/styles/base.css";
import "./shared/ui/styles/components.css";
import "./app/app.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { initTheme } from "./shared/ui";

initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
