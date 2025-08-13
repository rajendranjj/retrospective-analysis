'use client'

interface DirectorAnalysisData {
  director: string
  total: number
  [key: string]: any
}

interface ReleaseData {
  month: string
  directors: string[]
  answers: string[]
  data: DirectorAnalysisData[]
  totalResponses: number
}

interface DirectorAnalysisTableProps {
  question: string
  releases: { [month: string]: ReleaseData }
}

export default function DirectorAnalysisTable({ 
  question, 
  releases 
}: DirectorAnalysisTableProps) {
  if (!releases || Object.keys(releases).length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Director Analysis by Release</h2>
        <p className="text-gray-500">No data available for this question.</p>
      </div>
    )
  }

  // Format month names for display
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
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-gray-900">Director Analysis by Release</h2>
      <p className="text-gray-600 text-sm">{question}</p>
      
      {Object.entries(releases).map(([month, releaseData]) => (
        <div key={month} className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {formatMonthLabel(month)} - {releaseData.totalResponses} Total Responses
          </h3>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Director
                  </th>
                  {releaseData.answers.map((answer) => (
                    <th key={answer} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {answer}
                    </th>
                  ))}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Responses
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {releaseData.data.map((row, index) => (
                  <tr key={row.director} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {row.director}
                    </td>
                    {releaseData.answers.map((answer) => {
                      const answerData = row[answer]
                      const count = answerData ? answerData.count : 0
                      const percentage = answerData ? answerData.percentage : 0
                      
                      return (
                        <td key={answer} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex flex-col">
                            <span className="font-semibold text-blue-600">
                              {percentage}%
                            </span>
                            <span className="text-xs text-gray-500">
                              ({count})
                            </span>
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-6 py-3 text-sm font-semibold text-gray-900">
                    Total
                  </td>
                  {releaseData.answers.map((answer) => {
                    const totalCount = releaseData.data.reduce((sum, row) => {
                      const answerData = row[answer]
                      return sum + (answerData ? answerData.count : 0)
                    }, 0)
                    
                    return (
                      <td key={answer} className="px-6 py-3 text-sm font-semibold text-gray-900">
                        {totalCount}
                      </td>
                    )
                  })}
                  <td className="px-6 py-3 text-sm font-semibold text-gray-900">
                    {releaseData.data.reduce((sum, row) => sum + row.total, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
      
      <div className="text-sm text-gray-500">
        <p>• Percentages are calculated per director per release (row totals to 100%)</p>
        <p>• Blank responses are excluded from calculations</p>
        <p>• Counts shown in parentheses</p>
        <p>• Each table shows data for a specific release</p>
      </div>
    </div>
  )
}