'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts'
import ResponseTable from './ResponseTable'

interface TrendChartProps {
  trends: { [month: string]: { [answer: string]: number } } | null
  questionTitle: string
  responseCounts?: { [month: string]: number }
  rawCounts?: { [month: string]: { [answer: string]: number } }
}

export default function TrendChart({ trends, questionTitle, responseCounts, rawCounts }: TrendChartProps) {
  // Questions that should display as tables instead of charts
  const tableQuestions = [
    'Do you see the value to have access to ChatGPT, beyond your favourite AI enabled IDE ?',
    'Which mode do you prefer using in Cursor ?',
    'What are the key points for your preference as Copilot as IDE ?',
    'What was your engagement area during this release while not associated with the release deliverables?',
    'There is a significant increase in the AI usage with Cursor and code generation which is not getting directly translated into Sprint Velocity / Productivity gains. What is the reason you think ?',
    'Do you need any support to improve the cursor adoption ?',
    'Any interesting use case / problems you have solved using Cursor ?',
    'Give the reason for your choice in not making 75 or more requests on an average',
    'Can you elaborate the issue in few words or any Suggestion to solve it with respect to Sprint Velocity / Productivity gains',
    'What other features do you want to have in SSP?'
  ];
  
  // Helper function to normalize text for comparison
  const normalizeForComparison = (text: string) => {
    if (!text) return ''
    return text
      .replace(/\r\n/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }
  
  // Check if this question should display as a table (using normalized comparison)
  const normalizedQuestionTitle = normalizeForComparison(questionTitle)
  const shouldDisplayAsTable = tableQuestions.some(q => {
    const normalizedQ = normalizeForComparison(q)
    return normalizedQuestionTitle.includes(normalizedQ) || normalizedQ.includes(normalizedQuestionTitle.substring(0, 50))
  });
  
  if (shouldDisplayAsTable) {
    // For table questions, convert trends data to raw responses format
    const responses: { [month: string]: string[] } = {};
    
    if (trends) {
      Object.keys(trends).forEach(month => {
        const monthData = trends[month];
        const monthResponses: string[] = [];
        
        // Extract all unique responses from the percentage data
        Object.keys(monthData).forEach(response => {
          if (response && response.trim() !== '') {
            monthResponses.push(response);
          }
        });
        
        responses[month] = monthResponses;
      });
    }
    
    return <ResponseTable responses={responses} questionTitle={questionTitle} responseCounts={responseCounts} />;
  }
  
  // Early return if trends data is not available
  if (!trends || Object.keys(trends).length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Trend Analysis: {questionTitle}
        </h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto mb-2"></div>
            <p>Loading trend data...</p>
          </div>
        </div>
      </div>
    )
  }

  // Get all unique answer options first and sort them alphabetically for consistency
  const allAnswers = new Set<string>()
  Object.values(trends).forEach(monthData => {
    Object.keys(monthData).forEach(answer => allAnswers.add(answer))
  })
  
  // Convert to sorted array to ensure consistent color assignment and legend order
  const sortedAnswers = Array.from(allAnswers).sort((a, b) => {
    // Sort alphabetically, case insensitive
    return a.toLowerCase().localeCompare(b.toLowerCase())
  })

  // Convert trends data to chart format with both percentage and count
  // Get all months from trends data and sort them chronologically
  const extractMonthOrder = (monthName: string): number => {
    const monthMap: { [key: string]: number } = {
      'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
      'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
    };
    
    const parts = monthName.split(' ');
    const month = parts[0];
    const year = parseInt(parts[1]) || 2024;
    
    return year * 100 + (monthMap[month] || 0);
  };
  
  const allMonths = Object.keys(trends).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b))
  
      const completeChartData = allMonths.map(month => {
    const monthData = trends[month]
    if (!monthData) {
      // Month doesn't exist in trends, create empty structure
      return { 
        month, 
        ...Object.fromEntries(sortedAnswers.map(answer => [answer, 0])),
        ...Object.fromEntries(sortedAnswers.map(answer => [`${answer}_count`, 0]))
      }
    }
    
    const monthDataWithCounts: any = { month }
    
    // Use question-specific response counts from backend if available, otherwise calculate from percentage totals
    const totalResponses = responseCounts?.[month] || 100 // This should be question-specific responses, not total survey responses
    
    // Add percentage and count data for answers that exist in this month
    Object.entries(monthData).forEach(([answer, percentage]) => {
      // Use raw count if available, otherwise calculate from percentage
      const count = rawCounts?.[month]?.[answer] || Math.round((percentage / 100) * totalResponses)
      monthDataWithCounts[answer] = percentage
      monthDataWithCounts[`${answer}_count`] = count
    })
    
    // Ensure all answers are present (set to 0 if missing)
    sortedAnswers.forEach(answer => {
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
  console.log('All answers (sorted):', sortedAnswers)
  
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
              `${value.toFixed(2)}%`,
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
                    <p className="text-xs text-gray-500 mb-2">Question-specific responses:</p>
                    {payload.map((entry: any, index: number) => {
                      const answer = entry.dataKey
                      const percentage = entry.value
                      const count = monthData?.[`${answer}_count`] || 0
                      
                      return (
                        <p key={index} className="text-blue-600">
                          {answer}: {percentage.toFixed(2)}% ({count} responses)
                        </p>
                      )
                    })}
                  </div>
                )
              }
              return null
            }}
          />
          {sortedAnswers.map((answer, index) => (
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
                formatter={(value: number) => value === 0 ? '' : `${value.toFixed(2)}%`}
                style={{ fontSize: '12px', fill: '#1F2937', fontWeight: 'bold' }}
                offset={15}
              />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
      
      {/* Custom Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {sortedAnswers.map((answer, index) => (
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