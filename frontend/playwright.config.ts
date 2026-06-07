import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test config.
 *
 * Spawns dedicated backend (port 8765) and Vite (port 5174) instances so tests
 * don't collide with the developer's regular `npm run dev` / `uvicorn --reload`.
 * The frontend is told to talk to the test backend via VITE_API_URL.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // tests share a single backend process; keep sequential to avoid cross-pollination
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      // Auto-activate the venv if it exists (local dev) so users don't have to
      // remember to `source .venv/bin/activate` before `npm run test:e2e`. In CI
      // there's no venv — `python -m uvicorn` resolves to the runner's Python
      // where `pip install` was run by the workflow.
      command:
        "cd ../backend && " +
        "{ [ -f .venv/bin/activate ] && . .venv/bin/activate; } ; " +
        "python -m uvicorn app.main:app --port 8765 --host 127.0.0.1",
      url: "http://127.0.0.1:8765/healthz",
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    },
    {
      // VITE_DISABLE_STRICT_MODE turns off React.StrictMode for these tests.
      // StrictMode double-mounts the WS hook in dev and creates orphan players.
      command: "VITE_API_URL=http://localhost:8765 VITE_DISABLE_STRICT_MODE=true npx vite --port 5174 --strictPort",
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    },
  ],
});
