import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Fonts are bundled, not fetched from a CDN. If the kiosk boots with Wi-Fi
// down, a CDN font would fail and reflow the entire board into a fallback
// face -- on a screen nobody is standing in front of.
import "@fontsource/fira-sans/latin-400.css";
import "@fontsource/fira-sans/latin-500.css";
import "@fontsource/fira-sans/latin-600.css";
import "@fontsource/fira-code/latin-400.css";

import "./index.css";
import { App } from "./App.tsx";

const container = document.getElementById("root");
if (!container) throw new Error("#root missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
