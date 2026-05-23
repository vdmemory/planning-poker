import { useState, useRef, useEffect } from "react";
import type { RoomState, Issue } from "../types";

interface Props {
  state: RoomState;
  isFacilitator: boolean;
  myPlayerId: string;
  send: (msg: object) => void;
  onClose: () => void;
}

export function IssueSidebar({ state, isFacilitator, myPlayerId, send, onClose }: Props) {
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [issueMenuId, setIssueMenuId] = useState<string | null>(null);
  const [estimatePickerId, setEstimatePickerId] = useState<string | null>(null);

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
    <div className="h-full flex flex-col bg-[#1e2d3d]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a3a52]">
        <div>
          <h3 className="font-semibold text-white">Issues</h3>
          <p className="text-xs text-slate-400">
            {state.issues.length} issue{state.issues.length !== 1 ? "s" : ""} · {totalPoints} points
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Import */}
          {isFacilitator && (
            <div className="relative">
              <button
                onClick={() => { setShowImportMenu((v) => !v); setShowBulkMenu(false); }}
                title="Import issues"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#2a3a52] transition-colors"
              >
                📥
              </button>
              {showImportMenu && (
                <Dropdown onClose={() => setShowImportMenu(false)}>
                  <DropdownItem icon="🔗" label="Import from JIRA" onClick={() => setShowImportMenu(false)} />
                  <DropdownItem icon="📐" label="Import from Linear" onClick={() => setShowImportMenu(false)} />
                  <DropdownItem icon="🌐" label="Add from URLs" onClick={() => setShowImportMenu(false)} />
                  <DropdownItem icon="📋" label="Import from CSV" onClick={() => setShowImportMenu(false)} />
                </Dropdown>
              )}
            </div>
          )}

          {/* Bulk actions */}
          {isFacilitator && (
            <div className="relative">
              <button
                onClick={() => { setShowBulkMenu((v) => !v); setShowImportMenu(false); }}
                title="More options"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#2a3a52] transition-colors text-lg leading-none"
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
                      if (confirm("Delete all issues?")) {
                        send({ type: "delete_all_issues" });
                      }
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
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#2a3a52] transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Issue list */}
      <ul className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {state.issues.map((issue, index) => {
          const isCurrent = issue.id === state.current_issue_id;
          return (
            <IssueCard
              key={issue.id}
              issue={issue}
              index={index}
              isCurrent={isCurrent}
              isFacilitator={isFacilitator}
              deck={state.deck}
              showEstimatePicker={estimatePickerId === issue.id}
              showMenu={issueMenuId === issue.id}
              onSelect={() => isFacilitator && send({ type: "select_issue", issue_id: issue.id })}
              onOpenEdit={() => { setEditingIssue(issue); setIssueMenuId(null); }}
              onToggleMenu={() => setIssueMenuId((id) => id === issue.id ? null : issue.id)}
              onCloseMenu={() => setIssueMenuId(null)}
              onToggleEstimate={() => setEstimatePickerId((id) => id === issue.id ? null : issue.id)}
              onCloseEstimate={() => setEstimatePickerId(null)}
              onMoveTop={() => { send({ type: "reorder_issue", issue_id: issue.id, direction: "top" }); setIssueMenuId(null); }}
              onMoveBottom={() => { send({ type: "reorder_issue", issue_id: issue.id, direction: "bottom" }); setIssueMenuId(null); }}
              onDelete={() => { if (confirm("Delete this issue?")) send({ type: "delete_issue", issue_id: issue.id }); setIssueMenuId(null); }}
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
      {isFacilitator && (
        <div className="px-3 py-3 border-t border-[#2a3a52]">
          {adding ? (
            <>
              <input
                className="w-full bg-[#1a2332] border border-[#3a4f6a] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 mb-2 focus:outline-none focus:border-blue-500"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addIssue()}
                placeholder="Enter a title for the issue"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setAdding(false); setAddTitle(""); }}
                  className="flex-1 border border-[#3a4f6a] text-slate-300 py-2 rounded-lg text-sm hover:bg-[#243447] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addIssue}
                  disabled={!addTitle.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium transition-colors"
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
          isFacilitator={isFacilitator}
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
            if (confirm("Delete this issue?")) {
              send({ type: "delete_issue", issue_id: editingIssue.id });
              setEditingIssue(null);
            }
          }}
          onClose={() => setEditingIssue(null)}
        />
      )}
    </div>
  );
}

function IssueCard({
  issue,
  index,
  isCurrent,
  isFacilitator,
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
  isFacilitator: boolean;
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
      className={`rounded-xl text-sm transition-colors ${
        isCurrent ? "bg-[#2a3a52] border border-[#4a6a8a]" : "bg-[#243447]"
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
          {isFacilitator && (
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
          <div className="mt-1.5 inline-flex items-center bg-[#1a2332] border border-[#4a6a8a] text-white font-bold px-2 py-0.5 rounded-lg text-xs">
            {issue.final_estimate}
          </div>
        )}
      </div>

      {/* Action row */}
      {isFacilitator && (
        <div className="flex gap-2 px-3 pb-3">
          <button
            onClick={onSelect}
            className="flex-1 text-xs bg-blue-600/20 text-blue-400 border border-blue-600/40 px-2 py-1.5 rounded-lg hover:bg-blue-600/30 transition-colors"
          >
            Vote this issue
          </button>
          <div className="relative">
            <button
              onClick={onToggleEstimate}
              className="text-xs bg-[#2a3a52] text-slate-300 border border-[#3a4f6a] px-3 py-1.5 rounded-lg hover:bg-[#354d6a] transition-colors"
              title="Set estimate"
            >
              {issue.final_estimate ?? "—"}
            </button>
            {showEstimatePicker && (
              <div
                className="absolute bottom-full right-0 mb-2 bg-[#243447] border border-[#3a4f6a] rounded-xl p-2 shadow-2xl z-30"
                style={{ width: "180px" }}
              >
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {deck.map((v) => (
                    <button
                      key={v}
                      onClick={() => onSetEstimate(v)}
                      className={`w-10 h-14 rounded-lg border font-bold text-sm transition-all ${
                        issue.final_estimate === v
                          ? "bg-blue-600 border-blue-400 text-white"
                          : "bg-[#1a2332] border-[#3a4f6a] text-slate-300 hover:border-blue-500"
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
    </li>
  );
}

function IssueEditModal({
  issue,
  index,
  deck,
  isFacilitator,
  onSave,
  onVote,
  onSetEstimate,
  onDelete,
  onClose,
}: {
  issue: Issue;
  index: number;
  deck: string[];
  isFacilitator: boolean;
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
        className="bg-[#243447] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a4f6a]">
          <span className="text-xs text-slate-400 font-medium">PP-{index + 1}</span>
          <div className="flex items-center gap-2">
            {isFacilitator && (
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
              className="w-full bg-[#1a2332] border border-[#4a6a8a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={save}
              disabled={!isFacilitator}
            />
          </div>

          {/* Link */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Link</label>
            <input
              className="w-full bg-[#1a2332] border border-[#4a6a8a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onBlur={save}
              placeholder="https://..."
              disabled={!isFacilitator}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Description</label>
            <textarea
              className="w-full bg-[#1a2332] border border-[#4a6a8a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={save}
              placeholder="Add a description…"
              rows={3}
              disabled={!isFacilitator}
            />
          </div>
        </div>

        {/* Footer actions */}
        {isFacilitator && (
          <div className="flex items-center gap-2 px-6 py-4 border-t border-[#3a4f6a]">
            <button
              onClick={onVote}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              Vote this issue
            </button>
            <div className="relative">
              <button
                onClick={() => setShowEstPicker((v) => !v)}
                className="bg-[#2a3a52] hover:bg-[#354d6a] border border-[#4a6a8a] text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                {issue.final_estimate ?? "—"}
              </button>
              {showEstPicker && (
                <div className="absolute bottom-full right-0 mb-2 bg-[#243447] border border-[#3a4f6a] rounded-xl p-2 shadow-2xl z-10 w-48">
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {deck.map((v) => (
                      <button
                        key={v}
                        onClick={() => { onSetEstimate(v); setShowEstPicker(false); }}
                        className={`w-10 h-14 rounded-lg border font-bold text-sm transition-all ${
                          issue.final_estimate === v
                            ? "bg-blue-600 border-blue-400 text-white"
                            : "bg-[#1a2332] border-[#3a4f6a] text-slate-300 hover:border-blue-500"
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

// Reusable dropdown
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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute top-full mt-1 ${align === "right" ? "right-0" : "left-0"} bg-[#243447] border border-[#3a4f6a] rounded-xl shadow-2xl z-40 overflow-hidden min-w-[180px]`}
    >
      {children}
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
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[#2a3a52] ${
        danger ? "text-red-400 hover:text-red-300" : "text-slate-200"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
