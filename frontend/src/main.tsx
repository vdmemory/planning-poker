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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
