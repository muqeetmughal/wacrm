"use client";

interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  color?: string;
  showPercent?: boolean;
}

export function ProgressBar({ label, value, max, color = "#8b5cf6", showPercent = true }: ProgressBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-500">
          {value}{showPercent && max > 0 && ` (${pct}%)`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
