import { useState } from "react";
import type { GameSettings } from "../types";

const DEFAULTS: GameSettings = {
  autoReveal: false,
  showCountdown: true,
  showAverage: true,
  funFeatures: false,
  whoCanReveal: "facilitator",
  whoCanManageIssues: "facilitator",
  cardBack: "blue_stripes",
};

export function useSettings() {
  const [settings, setSettingsState] = useState<GameSettings>(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("pp:settings") || "{}") };
    } catch {
      return DEFAULTS;
    }
  });

  function setSettings(patch: Partial<GameSettings>) {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem("pp:settings", JSON.stringify(next));
      return next;
    });
  }

  return { settings, setSettings };
}
