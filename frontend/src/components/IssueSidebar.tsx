import { useState } from "react";
import type { RoomState } from "../types";

interface Props {
  state: RoomState;
  isFacilitator: boolean;
  send: (msg: object) => void;
}

export function IssueSidebar({ state, isFacilitator, send }: Props) {
  const [title, setTitle] = useState("");

  function addIssue() {
    if (!title.trim()) return;
    send({ type: "add_issue", title: title.trim() });
    setTitle("");
  }

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h3 className="font-semibold mb-3">Issues</h3>

      {isFacilitator && (
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addIssue()}
            placeholder="Add issue…"
          />
          <button
            onClick={addIssue}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded-lg text-sm"
          >
            +
          </button>
        </div>
      )}

      <ul className="space-y-1.5">
        {state.issues.length === 0 && (
          <li className="text-sm text-slate-400 italic">No issues yet</li>
        )}
        {state.issues.map((issue) => {
          const isCurrent = issue.id === state.current_issue_id;
          return (
            <li
              key={issue.id}
              onClick={() =>
                isFacilitator && send({ type: "select_issue", issue_id: issue.id })
              }
              className={`
                p-2 rounded-lg text-sm flex items-center justify-between
                ${isCurrent ? "bg-blue-50 border border-blue-300" : "hover:bg-slate-50"}
                ${isFacilitator ? "cursor-pointer" : ""}
              `}
            >
              <span className="truncate">{issue.title}</span>
              {issue.final_estimate && (
                <span className="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded ml-2">
                  {issue.final_estimate}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
