import { useState, useRef, useEffect, useLayoutEffect, type CSSProperties } from "react";
import type { RoomState, Issue } from "../types";
import { ConfirmModal } from "./ConfirmModal";

/**
 * Internal state for the three issue-deletion confirmation flows. `kind`
 * tells the modal what to ask (single issue vs. all), `id` is only set for
 * the single-issue case so the parent knows which issue to delete on
 * confirm.
 */
type PendingDelete =
  | { kind: "one"; id: string; title: string }
  | { kind: "all" }
  | null;

interface Props {
  state: RoomState;
  canManageIssues: boolean;
  myPlayerId: string;
  send: (msg: object) => void;
  onClose: () => void;
}

export function IssueSidebar({ state, canManageIssues, myPlayerId, send, onClose }: Props) {
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [issueMenuId, setIssueMenuId] = useState<string | null>(null);
  const [estimatePickerId, setEstimatePickerId] = useState<string | null>(null);
  // Issue #4 — replaces the three previous `confirm("Delete…")` browser
  // dialogs with a single in-app ConfirmModal driven by this state.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  // Issue #5 — FLIP-slide issue rows when `reorder_issue` changes their
  // order: capture each row's position before the reorder commits, then
  // after the DOM has the new order, offset each row back to where it used
  // to be and transition it to zero. Same manual-FLIP approach as
  // ThrowFloater (issue #51) — no animation library.
  const listRef = useRef<HTMLUListElement>(null);
  const prevOrderRef = useRef<string[]>([]);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const newOrder = state.issues.map((i) => i.id);
    const prevOrder = prevOrderRef.current;
    const prevRects = prevRectsRef.current;

    if (prevOrder.length > 0 && prevOrder.join() !== newOrder.join()) {
      for (const id of newOrder) {
        const el = ul.querySelector<HTMLElement>(`[data-issue-id="${id}"]`);
        const oldRect = prevRects.get(id);
        if (!el || !oldRect) continue;
        const newRect = el.getBoundingClientRect();
        const deltaY = oldRect.top - newRect.top;
        if (!deltaY) continue;
        el.style.transition = "none";
        el.style.transform = `translateY(${deltaY}px)`;
        el.getBoundingClientRect(); // force reflow before re-enabling transition
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.25s ease-out";
          el.style.transform = "";
        });
      }
    }

    const newRects = new Map<string, DOMRect>();
    for (const id of newOrder) {
      const el = ul.querySelector<HTMLElement>(`[data-issue-id="${id}"]`);
      if (el) newRects.set(id, el.getBoundingClientRect());
    }
    prevRectsRef.current = newRects;
    prevOrderRef.current = newOrder;
  }, [state.issues]);

  const totalPoints = state.issues.reduce((sum, i) => {
    const n = Number(i.final_estimate);
    return isNaN(n) ? sum : sum + n;
  }, 0);

  function addIssue() {
    if (!addTitle.trim()) return;
    send({ type: "add_issue", title: addTitle.trim() });
    setAddTitle("");
    setAdding(false);
  }

  function downloadCSV() {
    const rows = [
      ["#", "Title", "Link", "Description", "Estimate"],
      ...state.issues.map((issue, i) => [
        `PP-${i + 1}`,
        issue.title,
        issue.link,
        issue.description,
        issue.final_estimate ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.name}-issues.csv`;
    a.click();
  }

  return (
    <div className="h-full flex flex-col bg-[var(--c-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
        <div>
          <h3 className="font-semibold text-white">Issues</h3>
          <p className="text-xs text-slate-400">
            {state.issues.length} issue{state.issues.length !== 1 ? "s" : ""} · {totalPoints} points
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Bulk actions */}
          {canManageIssues && (
            <div className="relative">
              <button
                onClick={() => setShowBulkMenu((v) => !v)}
                title="More options"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[var(--c-panel2)] transition-colors text-lg leading-none"
              >
                ⋮
              </button>
              {showBulkMenu && (
                <Dropdown onClose={() => setShowBulkMenu(false)}>
                  <DropdownItem icon="⬇️" label="Download issues as CSV" onClick={() => { downloadCSV(); setShowBulkMenu(false); }} />
                  <DropdownItem
                    icon="🗑"
                    label="Delete all issues"
                    danger
                    onClick={() => {
                      setPendingDelete({ kind: "all" });
                      setShowBulkMenu(false);
                    }}
                  />
                </Dropdown>
              )}
            </div>
          )}

          {/* Close sidebar */}
          <button
            onClick={onClose}
            title="Close sidebar"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[var(--c-panel2)] transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Issue list */}
      <ul ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {state.issues.map((issue, index) => {
          const isCurrent = issue.id === state.current_issue_id;
          return (
            <IssueCard
              key={issue.id}
              issue={issue}
              index={index}
              isCurrent={isCurrent}
              canManageIssues={canManageIssues}
              deck={state.deck}
              showEstimatePicker={estimatePickerId === issue.id}
              showMenu={issueMenuId === issue.id}
              onSelect={() => canManageIssues && send({ type: "select_issue", issue_id: issue.id })}
              onOpenEdit={() => { setEditingIssue(issue); setIssueMenuId(null); }}
              onToggleMenu={() => setIssueMenuId((id) => id === issue.id ? null : issue.id)}
              onCloseMenu={() => setIssueMenuId(null)}
              onToggleEstimate={() => setEstimatePickerId((id) => id === issue.id ? null : issue.id)}
              onCloseEstimate={() => setEstimatePickerId(null)}
              onMoveTop={() => { send({ type: "reorder_issue", issue_id: issue.id, direction: "top" }); setIssueMenuId(null); }}
              onMoveBottom={() => { send({ type: "reorder_issue", issue_id: issue.id, direction: "bottom" }); setIssueMenuId(null); }}
              onDelete={() => { setPendingDelete({ kind: "one", id: issue.id, title: issue.title }); setIssueMenuId(null); }}
              onSetEstimate={(v) => { send({ type: "set_estimate", issue_id: issue.id, estimate: v }); setEstimatePickerId(null); }}
            />
          );
        })}

        {state.issues.length === 0 && (
          <li className="text-center text-slate-500 text-sm py-8">
            No issues yet
          </li>
        )}
      </ul>

      {/* Add issue */}
      {canManageIssues && (
        <div className="px-3 py-3 border-t border-[var(--c-border)]">
          {adding ? (
            <>
              <input
                className="w-full bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 mb-2 focus:outline-none focus:border-accent"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addIssue()}
                placeholder="Enter a title for the issue"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setAdding(false); setAddTitle(""); }}
                  className="flex-1 border border-[var(--c-border)] text-slate-300 py-2 rounded-lg text-sm hover:bg-[var(--c-panel)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addIssue}
                  disabled={!addTitle.trim()}
                  className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-accent-fg py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Save
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm py-2 transition-colors w-full"
            >
              + Add another issue
            </button>
          )}
        </div>
      )}

      {/* Issue edit modal */}
      {editingIssue && (
        <IssueEditModal
          issue={editingIssue}
          index={state.issues.findIndex((i) => i.id === editingIssue.id)}
          deck={state.deck}
          canManageIssues={canManageIssues}
          onSave={(patch) => {
            send({ type: "update_issue", issue_id: editingIssue.id, ...patch });
            setEditingIssue((prev) => prev ? { ...prev, ...patch } : prev);
          }}
          onVote={() => {
            send({ type: "select_issue", issue_id: editingIssue.id });
            setEditingIssue(null);
          }}
          onSetEstimate={(v) => {
            send({ type: "set_estimate", issue_id: editingIssue.id, estimate: v });
            setEditingIssue((prev) => prev ? { ...prev, final_estimate: v } : prev);
          }}
          onDelete={() => {
            if (editingIssue) {
              setPendingDelete({ kind: "one", id: editingIssue.id, title: editingIssue.title });
              setEditingIssue(null);
            }
          }}
          onClose={() => setEditingIssue(null)}
        />
      )}

      {/* Issue #4 — single ConfirmModal driving the three issue-delete flows
          (one / all / from-edit-form). Replaces the previous browser confirm()
          dialogs. */}
      <ConfirmModal
        open={pendingDelete !== null}
        title={pendingDelete?.kind === "all" ? "Delete all issues?" : "Delete this issue?"}
        message={
          pendingDelete?.kind === "all"
            ? `${state.issues.length} issue${state.issues.length === 1 ? "" : "s"} will be removed from the room.`
            : pendingDelete?.kind === "one"
            ? `“${pendingDelete.title}” will be removed from the room.`
            : undefined
        }
        confirmLabel="Delete"
        icon="🗑️"
        onConfirm={() => {
          if (pendingDelete?.kind === "all") send({ type: "delete_all_issues" });
          else if (pendingDelete?.kind === "one") send({ type: "delete_issue", issue_id: pendingDelete.id });
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function IssueCard({
  issue,
  index,
  isCurrent,
  canManageIssues,
  deck,
  showEstimatePicker,
  showMenu,
  onSelect,
  onOpenEdit,
  onToggleMenu,
  onCloseMenu,
  onToggleEstimate,
  onCloseEstimate,
  onMoveTop,
  onMoveBottom,
  onDelete,
  onSetEstimate,
}: {
  issue: Issue;
  index: number;
  isCurrent: boolean;
  canManageIssues: boolean;
  deck: string[];
  showEstimatePicker: boolean;
  showMenu: boolean;
  onSelect: () => void;
  onOpenEdit: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onToggleEstimate: () => void;
  onCloseEstimate: () => void;
  onMoveTop: () => void;
  onMoveBottom: () => void;
  onDelete: () => void;
  onSetEstimate: (v: string) => void;
}) {
  return (
    <li
      data-issue-id={issue.id}
      className={`rounded-xl text-sm transition-colors ${
        isCurrent ? "bg-[var(--c-panel2)] border border-[var(--c-border-hi)]" : "bg-[var(--c-panel)]"
      }`}
    >
      {/* Card header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500 mb-0.5">PP-{index + 1}</div>
            <div
              className="text-slate-200 truncate cursor-pointer hover:text-white"
              onClick={onOpenEdit}
              title={issue.title}
            >
              {issue.title}
            </div>
          </div>
          {/* Per-issue menu */}
          {canManageIssues && (
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
                className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors text-base leading-none"
              >
                ···
              </button>
              {showMenu && (
                <Dropdown onClose={onCloseMenu} align="right">
                  <DropdownItem icon="✏️" label="Open" onClick={onOpenEdit} />
                  <DropdownItem icon="⬆️" label="Move to top" onClick={onMoveTop} />
                  <DropdownItem icon="⬇️" label="Move to bottom" onClick={onMoveBottom} />
                  <DropdownItem icon="🗑" label="Delete" danger onClick={onDelete} />
                </Dropdown>
              )}
            </div>
          )}
        </div>

        {/* Estimate badge if set */}
        {issue.final_estimate && (
          <div className="mt-1.5 inline-flex items-center bg-[var(--c-bg)] border border-[var(--c-border-hi)] text-white font-bold px-2 py-0.5 rounded-lg text-xs">
            {issue.final_estimate}
          </div>
        )}
      </div>

      {/* Action row */}
      {canManageIssues && (
        <div className="flex gap-2 px-3 pb-3">
          <button
            onClick={onSelect}
            className="flex-1 text-xs bg-accent-soft text-accent border border-accent-soft-hi px-2 py-1.5 rounded-lg hover:bg-accent-soft-hi transition-colors"
          >
            Vote this issue
          </button>
          <EstimatePicker
            value={issue.final_estimate}
            deck={deck}
            open={showEstimatePicker}
            onToggle={onToggleEstimate}
            onClose={onCloseEstimate}
            onSelect={onSetEstimate}
          />
        </div>
      )}
    </li>
  );
}

function IssueEditModal({
  issue,
  index,
  deck,
  canManageIssues,
  onSave,
  onVote,
  onSetEstimate,
  onDelete,
  onClose,
}: {
  issue: Issue;
  index: number;
  deck: string[];
  canManageIssues: boolean;
  onSave: (patch: Partial<Pick<Issue, "title" | "description" | "link">>) => void;
  onVote: () => void;
  onSetEstimate: (v: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(issue.title);
  const [link, setLink] = useState(issue.link);
  const [description, setDescription] = useState(issue.description);
  const [showEstPicker, setShowEstPicker] = useState(false);

  function save() {
    const patch: Partial<Pick<Issue, "title" | "description" | "link">> = {};
    if (title.trim() !== issue.title) patch.title = title.trim();
    if (link !== issue.link) patch.link = link;
    if (description !== issue.description) patch.description = description;
    if (Object.keys(patch).length > 0) onSave(patch);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--c-panel)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)]">
          <span className="text-xs text-slate-400 font-medium">PP-{index + 1}</span>
          <div className="flex items-center gap-2">
            {canManageIssues && (
              <button
                onClick={onDelete}
                className="text-slate-400 hover:text-red-400 transition-colors"
                title="Delete issue"
              >
                🗑
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Title</label>
            <input
              className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={save}
              disabled={!canManageIssues}
            />
          </div>

          {/* Link */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Link</label>
            <input
              className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onBlur={save}
              placeholder="https://..."
              disabled={!canManageIssues}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Description</label>
            <textarea
              className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={save}
              placeholder="Add a description…"
              rows={3}
              disabled={!canManageIssues}
            />
          </div>
        </div>

        {/* Footer actions */}
        {canManageIssues && (
          <div className="flex items-center gap-2 px-6 py-4 border-t border-[var(--c-border)]">
            <button
              onClick={onVote}
              className="flex-1 bg-accent hover:bg-accent-hover text-accent-fg font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              Vote this issue
            </button>
            <div className="relative">
              <button
                onClick={() => setShowEstPicker((v) => !v)}
                className="bg-[var(--c-panel2)] hover:bg-[var(--c-border)] border border-[var(--c-border-hi)] text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                {issue.final_estimate ?? "—"}
              </button>
              {showEstPicker && (
                <div className="absolute bottom-full right-0 mb-2 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-2 shadow-2xl z-10 w-48">
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {deck.map((v) => (
                      <button
                        key={v}
                        onClick={() => { onSetEstimate(v); setShowEstPicker(false); }}
                        className={`w-10 h-14 rounded-lg border font-bold text-sm transition-all ${
                          issue.final_estimate === v
                            ? "bg-accent border-accent text-accent-fg"
                            : "bg-[var(--c-bg)] border-[var(--c-border)] text-slate-300 hover:border-accent"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Reusable dropdown — auto-flips to avoid viewport edge clipping
function Dropdown({
  children,
  onClose,
  align = "left",
}: {
  children: React.ReactNode;
  onClose: () => void;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Measure position after mount and flip if needed
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s: React.CSSProperties = {};

    // Horizontal: if right edge overflows, switch to right-aligned
    if (rect.right > vw - 8) {
      s.left = "auto";
      s.right = 0;
    } else if (rect.left < 8) {
      s.left = 0;
      s.right = "auto";
    }

    // Vertical: if bottom edge overflows, show above
    if (rect.bottom > vh - 8) {
      s.top = "auto";
      s.bottom = "100%";
      s.marginTop = 0;
      s.marginBottom = "4px";
    }

    setStyle(s);
  }, []);

  const baseAlign = align === "right" ? "right-0" : "left-0";

  return (
    <div
      ref={ref}
      className={`absolute top-full mt-1 ${baseAlign} bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-40 overflow-hidden min-w-[180px]`}
      style={style}
    >
      {children}
    </div>
  );
}

// Issue #23 follow-up — mobile gets a centered modal (mirrors the RevotePicker
// on the main player card, RoomPage.tsx): no measurement needed, so no jump.
// Desktop keeps the original fixed-position dropdown anchored to the trigger
// button, which has room to open without covering the whole screen.
function EstimatePicker({
  value,
  deck,
  open,
  onToggle,
  onClose,
  onSelect,
}: {
  value: string | null;
  deck: string[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (v: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  // Desktop only: calculate fixed dropdown position when opened.
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const PICKER_H = 212;
    const PICKER_W = 188;
    const spaceAbove = rect.top;
    const top = spaceAbove > PICKER_H + 8 ? rect.top - PICKER_H - 8 : rect.bottom + 8;
    const right = Math.max(8, window.innerWidth - rect.right);
    setStyle({ position: "fixed", top, right, width: PICKER_W, zIndex: 999 });
  }, [open]);

  // Click outside the trigger button, the mobile modal's content box, or the
  // desktop dropdown closes it. All three need checking — only one of the
  // two pickers is visible at a time (the other is `display:none`), but
  // both are always mounted, and this single document listener runs
  // regardless of which one CSS is currently showing. Checking only the
  // desktop ref meant a tap on any value button inside the *mobile* modal
  // read as "outside" and fired onClose() on mousedown, a beat before the
  // click's onSelect handler could run — the picker closed before the
  // estimate change registered.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      const insideButton = btnRef.current?.contains(target);
      const insideMobile = mobileRef.current?.contains(target);
      const insideDesktop = pickerRef.current?.contains(target);
      if (!insideButton && !insideMobile && !insideDesktop) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={onToggle}
        className="text-xs bg-[var(--c-panel2)] text-slate-300 border border-[var(--c-border)] px-3 py-1.5 rounded-lg hover:bg-[var(--c-border)] transition-colors"
        title="Set estimate"
      >
        {value ?? "—"}
      </button>
      {open && (
        <>
          {/* Mobile: centered modal */}
          <div
            className="md:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={onClose}
          >
            <div
              ref={mobileRef}
              className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-slate-400 mb-3 text-center">Set estimate</p>
              <div className="grid grid-cols-4 gap-2">
                {deck.map((v) => (
                  <button
                    key={v}
                    onClick={() => onSelect(v)}
                    className={`w-12 h-16 sm:w-14 sm:h-20 rounded-xl border-2 font-bold text-base sm:text-lg transition-all ${
                      v === value
                        ? "bg-accent border-accent text-accent-fg scale-105"
                        : "bg-[var(--c-panel2)] border-[var(--c-border)] text-slate-300 hover:border-accent hover:scale-105"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Desktop: fixed-position dropdown anchored to the trigger button */}
          <div
            ref={pickerRef}
            style={style}
            className="hidden md:block bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-2 shadow-2xl"
          >
            <div className="flex flex-wrap gap-1.5 justify-center">
              {deck.map((v) => (
                <button
                  key={v}
                  onClick={() => onSelect(v)}
                  className={`w-10 h-14 rounded-lg border font-bold text-sm transition-all ${
                    value === v
                      ? "bg-accent border-accent text-accent-fg"
                      : "bg-[var(--c-bg)] border-[var(--c-border)] text-slate-300 hover:border-accent"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DropdownItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--c-panel2)] ${
        danger ? "text-red-400 hover:text-red-300" : "text-slate-200"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
