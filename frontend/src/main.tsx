import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import RoomPage from "./pages/RoomPage";
import "./index.css";

// Apply saved theme before first render to avoid flash
const _theme = localStorage.getItem("pp:theme") || "dark";
if (_theme === "light") {
  document.documentElement.classList.add("light");
} else if (_theme === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("light");
}

// StrictMode double-mounts effects in dev, which makes useRoomSocket open the
// WebSocket twice and confuses the join flow. Disable via env var in e2e tests.
const tree = (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
    </Routes>
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  import.meta.env.VITE_DISABLE_STRICT_MODE === "true"
    ? tree
    : <React.StrictMode>{tree}</React.StrictMode>
);
