"""Auto-triage a GitHub issue: call GitHub Models for a structured analysis,
post a comment, and apply labels.

Reads env:
  GITHUB_TOKEN, REPO ("owner/repo"), ISSUE_NUMBER

Triage output (the model's JSON):
  complexity:           "easy" | "medium" | "hard"
  area:                 "backend" | "frontend" | "fullstack"
  is_security:          bool
  is_breaking_change:   bool
  needs_clarification:  bool
  estimated_minutes:    int
  files_to_touch:       [str]   # paths it expects to edit
  summary:              str     # 1-2 sentences
  plan:                 [str]   # 3-7 bullet steps
  warnings:             [str]   # gotchas, edge cases, risks (may be empty)

The script tolerates malformed JSON: if the model returns something we can't
parse, we post a minimal "triage failed" comment so humans get a signal.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

GH_API = "https://api.github.com"
MODELS_API = "https://models.github.ai/inference/chat/completions"
MODEL_NAME = "openai/gpt-4o-mini"

TRIAGE_SYSTEM_PROMPT = """You are a triage assistant for a Planning Poker app.

Architecture brief:
- Backend: FastAPI + WebSocket, Python 3.12. Layers:
  * backend/app/models.py — Pydantic models (Room, Player, Issue, DECKS)
  * backend/app/services.py — RoomService, all business logic
  * backend/app/store.py — RoomStore Protocol + InMemoryRoomStore
  * backend/app/ws_manager.py — ConnectionManager + cleanup task
  * backend/app/main.py — REST + WS routes, delegates to RoomService
  * backend/tests/ — pytest, treats tests as executable documentation
- Frontend: React + Vite + TypeScript + Tailwind.
  * frontend/src/pages/{Home,RoomPage}.tsx
  * frontend/src/components/{Card,PlayerList,StatsPanel,IssueSidebar}.tsx
  * frontend/src/hooks/useRoomSocket.ts — WS client with auto-reconnect
  * frontend/src/types.ts — mirrors backend public_state()
  * frontend/tests/e2e/ — Playwright e2e flows
- Deploy: Render (backend) + Vercel (frontend). Two branches: main = prod, dev = staging.

Conventions:
- WS protocol: client sends {type, ...}, server broadcasts room_state after mutations.
- Permissions: who_can_reveal / who_can_manage_issues settings, _require_facilitator helpers.
- Don't push to main without explicit approval. PRs go to dev.
- Docs and tests must be updated alongside code (RULES.md rule 13).

Your job: given an issue, output ONE JSON object analyzing it.
Be honest. If scope is unclear, set needs_clarification=true and explain in warnings.
If something would break existing API/WS protocol, set is_breaking_change=true.
Prefer accurate, small estimates over inflated ones.
"""


TRIAGE_USER_TEMPLATE = """Issue title: {title}

Issue body:
{body}

Output a single JSON object with this exact shape (no markdown fences):
{{
  "complexity": "easy" | "medium" | "hard",
  "area": "backend" | "frontend" | "fullstack",
  "is_security": boolean,
  "is_breaking_change": boolean,
  "needs_clarification": boolean,
  "estimated_minutes": integer,
  "files_to_touch": [string],
  "summary": string (1-2 sentences),
  "plan": [string] (3-7 short steps),
  "warnings": [string] (may be empty)
}}

Rules:
- complexity: easy ≤30 min, medium 30 min–2h, hard >2h.
- area: pick the dominant one. fullstack only if changes span both.
- files_to_touch: actual file paths from the repo (e.g. backend/app/services.py).
- plan: action-oriented steps a developer would take.
- warnings: only real risks/gotchas, skip if none.
"""


def gh_request(path: str, method: str = "GET", body: dict | None = None) -> dict:
    url = f"{GH_API}{path}"
    headers = {
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def call_model(title: str, body: str) -> dict | None:
    body = body or "(empty)"
    # Hard cap to avoid context blowup.
    if len(body) > 6000:
        body = body[:6000] + "\n…[truncated]"

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
            {"role": "user", "content": TRIAGE_USER_TEMPLATE.format(title=title, body=body)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 1200,
    }
    req = urllib.request.Request(
        MODELS_API,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            resp = json.load(r)
        content = resp["choices"][0]["message"]["content"]
        return json.loads(content)
    except urllib.error.HTTPError as e:
        print(f"Model call HTTP {e.code}: {e.read().decode()[:300]}", file=sys.stderr)
        return None
    except (KeyError, json.JSONDecodeError) as e:
        print(f"Model returned malformed response: {e}", file=sys.stderr)
        return None


def render_comment(t: dict) -> str:
    def lst(items):
        return "\n".join(f"- {x}" for x in items) if items else "_(none)_"

    badges = []
    badges.append(f"**{t['complexity'].upper()}**")
    badges.append(t["area"])
    if t.get("is_security"):
        badges.append("⚠️ security")
    if t.get("is_breaking_change"):
        badges.append("⚠️ breaking change")
    if t.get("needs_clarification"):
        badges.append("❓ needs clarification")

    return f"""## 🤖 Auto-triage

{' · '.join(badges)} · ~{t['estimated_minutes']} min

**Summary:** {t['summary']}

**Files likely to touch:**
{lst(t.get('files_to_touch', []))}

**Plan:**
{lst(t.get('plan', []))}

**Warnings:**
{lst(t.get('warnings', []))}

---
<sub>Triaged by GitHub Models ({MODEL_NAME}). Re-run by adding the `re-triage` label.</sub>
"""


def labels_from_triage(t: dict) -> list[str]:
    labels = ["auto-triaged"]
    if t.get("complexity") in ("easy", "medium", "hard"):
        labels.append(t["complexity"])
    if t.get("area") in ("backend", "frontend", "fullstack"):
        labels.append(t["area"])
    if t.get("is_security"):
        labels.append("security")
    if t.get("is_breaking_change"):
        labels.append("breaking-change")
    if t.get("needs_clarification"):
        labels.append("needs-clarification")
    return labels


def main() -> int:
    repo = os.environ["REPO"]
    issue_num = int(os.environ["ISSUE_NUMBER"])

    issue = gh_request(f"/repos/{repo}/issues/{issue_num}")
    title = issue["title"]
    body = issue.get("body") or ""

    triage = call_model(title, body)

    if triage is None:
        gh_request(
            f"/repos/{repo}/issues/{issue_num}/comments",
            method="POST",
            body={"body": "🤖 Auto-triage failed (model error). Try the `re-triage` label."},
        )
        return 1

    # Comment + label
    comment = render_comment(triage)
    gh_request(
        f"/repos/{repo}/issues/{issue_num}/comments",
        method="POST",
        body={"body": comment},
    )
    gh_request(
        f"/repos/{repo}/issues/{issue_num}/labels",
        method="POST",
        body={"labels": labels_from_triage(triage)},
    )

    print(f"Triaged #{issue_num} → {triage['complexity']} / {triage['area']} / ~{triage['estimated_minutes']}min")
    return 0


if __name__ == "__main__":
    sys.exit(main())
