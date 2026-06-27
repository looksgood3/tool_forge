import { gradeHex, gradeTextClass } from '../ui'

// ScoreGauge 圆环式综合评分。
export function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const size = 132
  const stroke = 11
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  const color = gradeHex(score)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold tabular-nums ${gradeTextClass(score)}`}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
        <span className={`mt-0.5 text-sm font-semibold ${gradeTextClass(score)}`}>{grade}</span>
      </div>
    </div>
  )
}
