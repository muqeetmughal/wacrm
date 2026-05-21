"use client";

interface StatusDonutProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

export function StatusDonut({ data, size = 160 }: StatusDonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const strokeWidth = size * 0.12;

  let offset = 0;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={strokeWidth} />
        {data.map((d) => {
          const segment = circumference * (d.value / total);
          const dash = offset === 0 ? `${segment} ${circumference - segment}` : undefined;
          const start = offset;
          offset += segment;
          return (
            <circle
              key={d.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
              strokeDashoffset={dash ? -start : undefined}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
      </svg>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-slate-400">{d.label}</span>
            <span className="font-medium text-slate-200">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
