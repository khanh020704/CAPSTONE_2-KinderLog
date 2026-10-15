import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtDate } from '../lib/utils'

// Categorical slots 1–2, validated (CVD ΔE 24.7, ≥ 3:1 on white). Text never uses these colors.
export const SERIES = ['#2a78d6', '#eb6834']
const INK = { primary: '#2a2545', secondary: '#4a4466', muted: '#777190', grid: '#ece7f3' }
const axis = { stroke: INK.grid, tick: { fill: INK.muted, fontSize: 12 }, tickLine: false }

function Tip({ active, payload, label, format = (v) => v, labelFormat = (l) => l }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <strong>{labelFormat(label)}</strong>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tip-row">
          <span className="chart-swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <strong>{format(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

const pct = (v) => `${v}%`
const shortDate = (iso) => fmtDate(iso).slice(0, 6)

/** Attendance rate and journal submission rate per school day — both in %, so one axis. */
export function RateTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axis} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={pct} {...axis} axisLine={false} />
        <Tooltip content={<Tip format={pct} labelFormat={fmtDate} />} cursor={{ stroke: INK.muted, strokeDasharray: '3 3' }} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} formatter={(value) => <span style={{ color: INK.secondary }}>{value}</span>} />
        <Line
          type="monotone"
          dataKey="attendanceRate"
          name="Attendance"
          stroke={SERIES[0]}
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="submissionRate"
          name="Journals approved"
          stroke={SERIES[1]}
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** One series of magnitudes by category, horizontal so long labels stay readable. */
export function CategoryBarChart({ data, valueName, format = (v) => v, height = 200 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 8 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={INK.grid} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="label" width={170} {...axis} axisLine={false} tick={{ fill: INK.secondary, fontSize: 12 }} />
        <Tooltip content={<Tip format={format} />} cursor={{ fill: 'rgba(106, 79, 224, 0.06)' }} />
        <Bar dataKey="value" name={valueName} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          <LabelList dataKey="value" position="right" formatter={format} style={{ fill: INK.secondary, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
