"use client";

interface SimpleBarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}

export function SimpleBarChart({ data, height = 160, color = "#8b5cf6" }: SimpleBarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div
          key={i}
          className="flex flex-1 flex-col items-center gap-1"
        >
          <div
            className="w-full rounded-t transition-all duration-300"
            style={{
              height: `${(d.value / max) * 100}%`,
              backgroundColor: color,
              minHeight: d.value > 0 ? 4 : 0,
            }}
          />
          <span className="text-[10px] text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
