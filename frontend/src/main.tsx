import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import RoomPage from "./pages/RoomPage";
import LandingPage from "./pages/LandingPage";
import FAQPage from "./pages/FAQPage";
import "./index.css";

// Apply saved theme + accent before first render to avoid flash.
// Mode (light/dark/system) drives neutrals; accent (issue #42) drives the
// brand colour. Both are persisted in localStorage and applied to <html>
// via the corresponding hook.
const _theme = localStorage.getItem("pp:theme") || "dark";
if (_theme === "light") {
  document.documentElement.classList.add("light");
} else if (_theme === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("light");
}
const _accent = localStorage.getItem("pp:accent");
const _ACCENT_ALLOWED = new Set(["green", "red", "purple", "yellow", "orange", "teal"]);
if (_accent && _ACCENT_ALLOWED.has(_accent)) {
  // Default "blue" leaves the attribute off so `:root` selectors win
  // without specificity tricks — only set the attribute for non-defaults.
  document.documentElement.setAttribute("data-accent", _accent);
}

// StrictMode double-mounts effects in dev, which makes useRoomSocket open the
// WebSocket twice and confuses the join flow. Disable via env var in e2e tests.
const tree = (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/new" element={<Home />} />
      <Route path="/faq" element={<FAQPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
    </Routes>
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  import.meta.env.VITE_DISABLE_STRICT_MODE === "true"
    ? tree
    : <React.StrictMode>{tree}</React.StrictMode>
);
