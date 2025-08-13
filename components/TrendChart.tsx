'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts'

interface TrendChartProps {
  trends: { [month: string]: { [answer: string]: number } }
  questionTitle: string
  responseCounts?: { [month: string]: number }
}

export default function TrendChart({ trends, questionTitle, responseCounts }: TrendChartProps) {
  // Get all unique answer options first
  const allAnswers = new Set<string>()
  Object.values(trends).forEach(monthData => {
    Object.keys(monthData).forEach(answer => allAnswers.add(answer))
  })

  // Convert trends data to chart format with both percentage and count
  // Ensure all months are present with their actual data
  const allMonths = ['August', 'September', 'November', 'January', 'March', 'April', 'May', 'July']
  
  const completeChartData = allMonths.map(month => {
    const monthData = trends[month]
    if (!monthData) {
      // Month doesn't exist in trends, create empty structure
      return { 
        month, 
        ...Object.fromEntries(Array.from(allAnswers).map(answer => [answer, 0])),
        ...Object.fromEntries(Array.from(allAnswers).map(answer => [`${answer}_count`, 0]))
      }
    }
    
    const monthDataWithCounts: any = { month }
    
    // Use response counts from backend if available, otherwise calculate
    const totalResponses = responseCounts?.[month] || Object.values(monthData).reduce((sum, percentage) => sum + percentage, 0)
    
    // Add percentage and count data for answers that exist in this month
    Object.entries(monthData).forEach(([answer, percentage]) => {
      const count = Math.round((percentage / 100) * totalResponses)
      monthDataWithCounts[answer] = percentage
      monthDataWithCounts[`${answer}_count`] = count
    })
    
    // Ensure all answers are present (set to 0 if missing)
    Array.from(allAnswers).forEach(answer => {
      if (!(answer in monthDataWithCounts)) {
        monthDataWithCounts[answer] = 0
        monthDataWithCounts[`${answer}_count`] = 0
      }
    })
    
    return monthDataWithCounts
  })

  // Debug logging
  console.log('Trends data:', trends)
  console.log('Trends month names:', Object.keys(trends))
  console.log('Response counts:', responseCounts)
  console.log('Response count month names:', Object.keys(responseCounts || {}))
  console.log('Complete chart data:', completeChartData)
  console.log('All answers:', Array.from(allAnswers))
  
  // Specific check for November 2024
  if (trends['November']) {
    console.log('November 2024 trends found:', trends['November'])
  } else {
    console.log('November 2024 trends NOT found in trends data')
  }
  
  if (responseCounts?.['November']) {
    console.log('November 2024 response count found:', responseCounts['November'])
  } else {
    console.log('November 2024 response count NOT found in responseCounts')
  }

  // Sort months chronologically with proper month ordering
  const monthOrder = {
    'August': 1, 'September': 2, 'November': 3, 'January': 4,
    'March': 5, 'April': 6, 'May': 7, 'July': 8
  }
  
  completeChartData.sort((a, b) => monthOrder[a.month as keyof typeof monthOrder] - monthOrder[b.month as keyof typeof monthOrder])

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

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']



  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={completeChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
            tickFormatter={formatMonthLabel}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip 
            formatter={(value: number, name: string) => [
              `${value}%`,
              name
            ]}
            labelFormatter={(label: string) => formatMonthLabel(label)}
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const month = label
                const monthData = completeChartData.find(item => item.month === month)
                
                return (
                  <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                    <p className="font-semibold text-gray-900">{formatMonthLabel(month)}</p>
                    {payload.map((entry: any, index: number) => {
                      const answer = entry.dataKey
                      const percentage = entry.value
                      const count = monthData?.[`${answer}_count`] || 0
                      
                      return (
                        <p key={index} className="text-blue-600">
                          {answer}: {percentage}% ({count})
                        </p>
                      )
                    })}
                  </div>
                )
              }
              return null
            }}
          />
          {Array.from(allAnswers).map((answer, index) => (
            <Line
              key={answer}
              type="monotone"
              dataKey={answer}
              stroke={colors[index % colors.length]}
              strokeWidth={3}
              dot={{ fill: colors[index % colors.length], strokeWidth: 2, r: 6 }}
              activeDot={{ r: 8, stroke: colors[index % colors.length], strokeWidth: 2 }}
              connectNulls={true}
            >
              <LabelList 
                dataKey={answer} 
                position="top" 
                formatter={(value: number) => value === 0 ? '' : `${value}%`}
                style={{ fontSize: '12px', fill: '#1F2937', fontWeight: 'bold' }}
                offset={15}
              />
              <LabelList 
                dataKey={answer} 
                position="bottom" 
                formatter={(value: number) => value === 0 ? '' : answer}
                style={{ fontSize: '11px', fill: colors[index % colors.length], fontWeight: '500' }}
                offset={15}
              />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
      
      {/* Custom Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {Array.from(allAnswers).map((answer, index) => (
          <div key={answer} className="flex items-center gap-2">
            <div 
              className="w-4 h-3 rounded-sm" 
              style={{ backgroundColor: colors[index % colors.length] }}
            ></div>
            <span className="text-sm text-gray-700 font-medium">
              {answer}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
} 