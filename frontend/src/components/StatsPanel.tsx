import type { Stats } from "../types";

interface Props {
  stats: Stats;
}

export function StatsPanel({ stats }: Props) {
  const total = stats.total_votes || 1;
  const sorted = Object.entries(stats.distribution).sort(([, a], [, b]) => b - a);

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h3 className="font-semibold mb-3">
        Results
        {stats.consensus && (
          <span className="ml-2 text-green-600 text-sm font-normal">
            ✓ Consensus reached
          </span>
        )}
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Metric label="Average" value={stats.average?.toString() ?? "—"} />
        <Metric label="Median" value={stats.median?.toString() ?? "—"} />
        <Metric label="Votes" value={stats.total_votes.toString()} />
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500 mb-2">Distribution</div>
        <div className="space-y-1.5">
          {sorted.map(([value, count]) => (
            <div key={value} className="flex items-center gap-2 text-sm">
              <span className="font-mono w-8 font-semibold">{value}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-5 relative overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full"
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </div>
              <span className="text-slate-600 w-6 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
