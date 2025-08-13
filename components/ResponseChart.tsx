'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'

interface ResponseChartProps {
  months: string[]
  counts: number[]
}

export default function ResponseChart({ months, counts }: ResponseChartProps) {
  // Sort months chronologically
  const monthOrder = {
    'August': 1, 'September': 2, 'November': 3, 'January': 4,
    'March': 5, 'April': 6, 'May': 7, 'July': 8
  }
  
  const sortedData = months
    .map((month, index) => ({ month, responses: counts[index] }))
    .sort((a, b) => monthOrder[a.month as keyof typeof monthOrder] - monthOrder[b.month as keyof typeof monthOrder])

  // Format month labels to include year
  const formatMonthLabel = (month: string) => {
    const yearMap: { [key: string]: string } = {
      'August': 'Aug 2024',
      'September': 'Sep 2024', 
      'November': 'Nov 2024',
      'January': 'Jan 2025',
      'March': 'Mar 2025',
      'April': 'Apr 2025',
      'May': 'May 2025',
      'July': 'Jul 2025'
    }
    return yearMap[month] || month
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sortedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 12 }}
            tickFormatter={formatMonthLabel}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            label={{ value: 'Number of Responses', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip 
            formatter={(value: number) => [value, 'Responses']}
            labelFormatter={(label) => `Month: ${formatMonthLabel(label)}`}
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Line
            type="monotone"
            dataKey="responses"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 8, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
          >
            <LabelList 
              dataKey="responses" 
              position="top" 
              formatter={(value: number) => `${value}`}
              style={{ 
                fontSize: '11px', 
                fontWeight: '600',
                fill: '#3b82f6',
                textShadow: '0 1px 2px rgba(255, 255, 255, 0.8)'
              }}
              offset={8}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
} 