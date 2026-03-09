'use client'

import { useState, useEffect, useRef } from 'react'
import { RefreshCw, BarChart3, Download, Upload } from 'lucide-react'
import MetricCard from '@/components/MetricCard'

import TrendChart from '@/components/TrendChart'
import ResponseChart from '@/components/ResponseChart'
import DirectorAnalysisTable from '@/components/DirectorAnalysisTable'
import DirectorTrendAnalysis from '@/components/DirectorTrendAnalysis'
import DirectorResponsePopup from '@/components/DirectorResponsePopup'
import Login from '@/components/Login'
import UserProfile from '@/components/UserProfile'
import { useAuth } from '@/contexts/AuthContext'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Label } from 'recharts'

interface SummaryData {
  Month: string
  Answer: string
  Percentage: number
}

interface Summary {
  totalResponses: number
  totalQuestions: number
  averageResponseRate: number
}

interface TrendsData {
  trends: Record<string, Record<string, number>>
  responseCounts: Record<string, number>
  rawCounts: Record<string, Record<string, number>>
  summaryData: SummaryData[]
  question: string
}

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth()

  const [summary, setSummary] = useState<Summary>({
    totalResponses: 0,
    totalQuestions: 0,
    averageResponseRate: 0
  })
  const [orderedQuestions, setOrderedQuestions] = useState<string[]>([])
  const [sections, setSections] = useState<{ [key: string]: string[] }>({})
  const [allTrends, setAllTrends] = useState<{ [question: string]: TrendsData }>({})
  const [trendsLoading, setTrendsLoading] = useState(false)
  const [loadedQuestions, setLoadedQuestions] = useState<Set<string>>(new Set())
  const [tablePagination, setTablePagination] = useState<{ [question: string]: number }>({})
  const [loading, setLoading] = useState(true)
  const [releaseData, setReleaseData] = useState<Array<{month: string, responses: number, questions: number}>>([])
  const [directorAnalysis, setDirectorAnalysis] = useState<any>(null)
  const loadingRef = useRef(loading)
  const [testData, setTestData] = useState<string>('Not loaded')
  const [activeTab, setActiveTab] = useState<'overview' | 'director'>('overview')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Director popup state
  const [showDirectorPopup, setShowDirectorPopup] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [directorData, setDirectorData] = useState<Array<{director: string, count: number, totalCount?: number, participationRate?: number}>>([])
  const [directorLoading, setDirectorLoading] = useState(false)
  
  // Navigation dropdowns state
  const [selectedSection, setSelectedSection] = useState<string>('')
  const [selectedQuestion, setSelectedQuestion] = useState<string>('')

  useEffect(() => {
    console.log('useEffect triggered, starting data fetch...')
    fetchData()
    
    // Add timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.log('Timeout reached, current loading state:', loadingRef.current)
      if (loadingRef.current) {
        console.log('Loading timeout reached, setting loading to false')
        setLoading(false)
        // Set default values
        setSummary({ totalResponses: 0, totalQuestions: 0, averageResponseRate: 0 })
        setOrderedQuestions([])
        setReleaseData([])
      }
    }, 10000) // Reduced to 10 second timeout
    
    return () => clearTimeout(timeout)
  }, [])

  // Monitor authentication and trigger automatic chart loading when ready
  useEffect(() => {
    if (isAuthenticated && user && !loading && Object.keys(sections).length > 0 && loadedQuestions.size === 0 && !trendsLoading) {
      console.log('🔄 Authentication ready and data loaded, triggering automatic chart loading...')
      const autoLoadTimeout = setTimeout(() => {
        console.log('⏰ Auto-loading charts after authentication stabilized')
        loadAllTrends()
      }, 3000) // Additional 3 second delay for full stabilization
      
      return () => clearTimeout(autoLoadTimeout)
    }
  }, [isAuthenticated, user, loading, sections, loadedQuestions.size, trendsLoading])

  const fetchData = async () => {
    try {
      setLoading(true)
      loadingRef.current = true
      console.log('Starting to fetch data...')
      
      // Fetch summary data
      console.log('Fetching summary data...')
      const summaryResponse = await fetch('/api/summary', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      })
      console.log('Summary response status:', summaryResponse.status)
      if (!summaryResponse.ok) {
        throw new Error(`Summary API failed: ${summaryResponse.status}`)
      }
      const summaryData = await summaryResponse.json()
      console.log('Summary data received:', summaryData)
      console.log('Summary data keys:', Object.keys(summaryData))
      console.log('Total responses value:', summaryData.totalResponses)
      console.log('Setting summary data...')
      setSummary(summaryData)
      console.log('Summary state set')

      // Fetch available questions from all releases
      console.log('Fetching all unique questions data...')
      const apiBaseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
        ? 'http://localhost:4005' 
        : '';
      
      const questionsResponse = await fetch(`${apiBaseUrl}/api/all-questions`, {
        credentials: 'include'
      })
      if (!questionsResponse.ok) {
        throw new Error(`All questions API failed: ${questionsResponse.status}`)
      }
      const questionsData = await questionsResponse.json()
      console.log('All questions data received:', questionsData)
      console.log('Sections data:', questionsData.sections)
      
      // Set questions and sections data
      setOrderedQuestions(questionsData.questions || [])
      setSections(questionsData.sections || {})
      
      // Auto-select first section if available
      if (questionsData.sections && Object.keys(questionsData.sections).length > 0 && !selectedSection) {
        setSelectedSection(Object.keys(questionsData.sections)[0])
      }
      
      // Start loading trends for all questions (don't await to not block main loading)
      if (questionsData.sections && Object.keys(questionsData.sections).length > 0) {
        console.log('📊 Starting background loading of all trend charts...')
        // Use setTimeout to allow state to update first and authentication to settle
        setTimeout(() => {
          console.log('🔄 Delayed start of trend loading to ensure authentication is ready')
          // Additional authentication check before automatic loading
          if (isAuthenticated && user) {
            console.log('✅ Authentication confirmed, proceeding with automatic trend loading')
            loadAllTrends()
          } else {
            console.log('⚠️ Authentication not ready, skipping automatic loading')
            console.log(`Auth status: ${isAuthenticated}, User: ${user?.email || 'none'}`)
          }
        }, 5000) // Increased delay to 5 seconds for auth to fully settle
      }
      
      // Fetch release data for the new chart (environment-aware)
      console.log('Fetching releases data...')
      const releasesResponse = await fetch(`${apiBaseUrl}/api/releases`, {
        credentials: 'include'
      })
      if (!releasesResponse.ok) {
        throw new Error(`Releases API failed: ${releasesResponse.status}`)
      }
      const releasesData = await releasesResponse.json()
      console.log('Release data loaded from Node.js server:', releasesData)
      console.log('✅ CORRECT ORDER: First release:', releasesData[0]?.month, 'Last release:', releasesData[releasesData.length-1]?.month)
      // The releases API returns an array directly, not an object with a releases property
      setReleaseData(Array.isArray(releasesData) ? releasesData : [])

      console.log('All data fetched successfully')
      console.log('Setting loading to false...')
      setLoading(false)
      loadingRef.current = false
      console.log('Loading state set to false')
    } catch (error) {
      console.error('Error fetching data:', error)
      setLoading(false)
      loadingRef.current = false
      // Set default values to prevent infinite loading
      setSummary({ totalResponses: 0, totalQuestions: 0, averageResponseRate: 0 })
      setOrderedQuestions([])
      setReleaseData([])
    }
  }

  const handleRefresh = async () => {
    try {
      setLoading(true)
      loadingRef.current = true
      console.log('🔄 Refreshing data from server...')
      
      // First, call the refresh endpoint to reload Excel files
      const refreshResponse = await fetch('/api/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })
      
      if (!refreshResponse.ok) {
        throw new Error('Failed to refresh data from server')
      }
      
      const refreshResult = await refreshResponse.json()
      console.log('✅ Server data refreshed:', refreshResult)
      
      // Also refresh questions from Excel files
      console.log('🔄 Refreshing questions from Excel files...')
      const questionsRefreshResponse = await fetch('/api/refresh-questions-from-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })
      
      if (questionsRefreshResponse.ok) {
        const questionsResult = await questionsRefreshResponse.json()
        console.log('✅ Questions refreshed from Excel:', questionsResult)
      } else {
        console.warn('⚠️ Questions refresh failed, but continuing with data refresh')
      }
      
      // Then reload the frontend data
      await fetchData()
      
      alert(`Data and questions refreshed successfully! 
📁 Files loaded: ${refreshResult.summary.filesLoaded}
📊 Total responses: ${refreshResult.summary.totalResponses}
⏱️ Load time: ${refreshResult.summary.loadTime}ms
🔄 Questions updated from Excel files`)
      
    } catch (error) {
      console.error('❌ Refresh failed:', error)
      alert('Refresh failed. Please try again.')
      setLoading(false)
      loadingRef.current = false
    }
  }

  // Questions to show as tables instead of trend charts
  const isTableQuestion = (question: string) => {
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
    
    const tableQuestions = [
      "What was the action item and how was it resolved during the release?",
      "Any other thought you would like to share related to the releases.",
      "Do you have any suggestion for improving and streamlining the release further?",
      "Any Suggestions for Jira enhancements?",
      "What was your engagement area during this release while not associated with the release deliverables?",
      "There is a significant increase in the AI usage with Cursor and code generation which is not getting directly translated into Sprint Velocity / Productivity gains. What is the reason you think ?",
      "Do you need any support to improve the cursor adoption ?",
      "Any interesting use case / problems you have solved using Cursor ?",
      "Give the reason for your choice in not making 75 or more requests on an average",
      "Can you elaborate the issue in few words or any Suggestion to solve it with respect to Sprint Velocity / Productivity gains",
      "What other features do you want to have in SSP?"
    ]
    
    const normalizedQuestion = normalizeForComparison(question)
    return tableQuestions.some(tableQ => {
      const normalizedQ = normalizeForComparison(tableQ)
      return normalizedQuestion === normalizedQ || normalizedQuestion.includes(normalizedQ) || normalizedQ.includes(normalizedQuestion.substring(0, 50))
    })
  }

  // Generate AI summary from text responses
  const generateAISummary = (answers: Array<{answer: string, totalResponses: number}>, questionText: string) => {
    if (answers.length === 0) return "No responses available for analysis."
    
    const allResponses = answers.flatMap(item => Array(item.totalResponses).fill(item.answer))
    const totalResponses = allResponses.length
    
    // Generate content-based summary
    const contentSummary = generateContentSummary(allResponses, questionText)
    const sentiment = analyzeSentiment(allResponses)
    
    let summary = `📊 **Summary of ${totalResponses} responses:**\n\n`
    summary += contentSummary
    summary += `\n\n🎯 **Overall Sentiment:** ${sentiment.overall} (${Math.round(sentiment.positiveRatio * 100)}% positive responses)`
    
    return summary
  }

  // Generate content-based summary of responses
  const generateContentSummary = (responses: string[], questionText: string) => {
    if (responses.length === 0) return "No responses to analyze."
    
    // Sort responses by frequency to prioritize most common themes
    const responseFreq = responses.reduce((acc, resp) => {
      acc[resp] = (acc[resp] || 0) + 1
      return acc
    }, {} as {[key: string]: number})
    
    const sortedResponses = Object.entries(responseFreq)
      .sort(([,a], [,b]) => b - a)
      .map(([resp]) => resp)
    
    // Generate summary based on question type
    if (questionText.toLowerCase().includes('cursor') || questionText.toLowerCase().includes('ai') || questionText.toLowerCase().includes('copilot')) {
      return generateAIToolContentSummary(sortedResponses, responseFreq)
    } else if (questionText.toLowerCase().includes('jira')) {
      return generateJiraContentSummary(sortedResponses, responseFreq)
    } else if (questionText.toLowerCase().includes('action item')) {
      return generateActionItemContentSummary(sortedResponses, responseFreq)
    } else if (questionText.toLowerCase().includes('suggestion') || questionText.toLowerCase().includes('improve')) {
      return generateImprovementContentSummary(sortedResponses, responseFreq)
    } else if (questionText.toLowerCase().includes('engagement')) {
      return generateEngagementContentSummary(sortedResponses, responseFreq)
    } else {
      return generateGeneralContentSummary(sortedResponses, responseFreq)
    }
  }

  const generateAIToolContentSummary = (responses: string[], freq: {[key: string]: number}) => {
    const topResponses = responses.slice(0, 8)
    let summary = "**Key AI Tool Usage Patterns & Feedback:**\n\n"
    
    // Analyze common use cases
    const codeGenResponses = topResponses.filter(r => 
      r.toLowerCase().includes('generat') || r.toLowerCase().includes('creat') || r.toLowerCase().includes('writ')
    )
    const debugResponses = topResponses.filter(r => 
      r.toLowerCase().includes('debug') || r.toLowerCase().includes('fix') || r.toLowerCase().includes('error')
    )
    const productivityResponses = topResponses.filter(r => 
      r.toLowerCase().includes('fast') || r.toLowerCase().includes('quick') || r.toLowerCase().includes('time')
    )
    
    if (codeGenResponses.length > 0) {
      summary += `• **Code Generation:** Many users leverage AI tools for writing boilerplate code, creating functions, and generating initial code structures. Common use cases include "${codeGenResponses[0].substring(0, 80)}..."\n\n`
    }
    
    if (debugResponses.length > 0) {
      summary += `• **Debugging & Problem Solving:** Users frequently use AI assistants to identify and fix code issues. Typical scenarios: "${debugResponses[0].substring(0, 80)}..."\n\n`
    }
    
    if (productivityResponses.length > 0) {
      summary += `• **Productivity Enhancement:** AI tools significantly improve development speed and efficiency. Users report: "${productivityResponses[0].substring(0, 80)}..."\n\n`
    }
    
    // Add most common specific feedback
    const topResponse = responses[0]
    if (topResponse && freq[topResponse] > 1) {
      summary += `• **Most Common Response:** "${topResponse}" (mentioned ${freq[topResponse]} times)\n\n`
    }
    
    // Add variety insight
    if (responses.length > 5) {
      summary += `• **Usage Diversity:** Responses show ${responses.length} different ways teams are utilizing AI tools, indicating widespread adoption across various development tasks.`
    }
    
    return summary
  }

  const generateJiraContentSummary = (responses: string[], freq: {[key: string]: number}) => {
    const topResponses = responses.slice(0, 6)
    let summary = "**Common Jira Enhancement Requests:**\n\n"
    
    // Categorize improvement areas
    const uiResponses = topResponses.filter(r => 
      r.toLowerCase().includes('interface') || r.toLowerCase().includes('ui') || r.toLowerCase().includes('user')
    )
    const performanceResponses = topResponses.filter(r => 
      r.toLowerCase().includes('slow') || r.toLowerCase().includes('speed') || r.toLowerCase().includes('performance')
    )
    const featureResponses = topResponses.filter(r => 
      r.toLowerCase().includes('feature') || r.toLowerCase().includes('function') || r.toLowerCase().includes('add')
    )
    
    if (uiResponses.length > 0) {
      summary += `• **User Interface Improvements:** "${uiResponses[0]}"\n\n`
    }
    
    if (performanceResponses.length > 0) {
      summary += `• **Performance Concerns:** "${performanceResponses[0]}"\n\n`
    }
    
    if (featureResponses.length > 0) {
      summary += `• **Feature Requests:** "${featureResponses[0]}"\n\n`
    }
    
    // Add top suggestions
    topResponses.slice(0, 3).forEach((response, index) => {
      if (response.length > 10) {
        summary += `• **Suggestion ${index + 1}:** "${response}"\n\n`
      }
    })
    
    return summary
  }

  const generateActionItemContentSummary = (responses: string[], freq: {[key: string]: number}) => {
    const topResponses = responses.slice(0, 5)
    let summary = "**Key Action Items & Resolutions:**\n\n"
    
    topResponses.forEach((response, index) => {
      if (response.length > 15) {
        summary += `• **Action Item ${index + 1}:** "${response}"\n\n`
      }
    })
    
    const commonPatterns = responses.filter(r => r.toLowerCase().includes('process') || r.toLowerCase().includes('communication')).length
    if (commonPatterns > 0) {
      summary += `• **Common Theme:** ${commonPatterns} action items relate to process improvements and better communication protocols.`
    }
    
    return summary
  }

  const generateImprovementContentSummary = (responses: string[], freq: {[key: string]: number}) => {
    const topResponses = responses.slice(0, 6)
    let summary = "**Top Improvement Suggestions:**\n\n"
    
    topResponses.forEach((response, index) => {
      if (response.length > 10) {
        summary += `• "${response}"\n\n`
      }
    })
    
    return summary
  }

  const generateEngagementContentSummary = (responses: string[], freq: {[key: string]: number}) => {
    const topResponses = responses.slice(0, 6)
    let summary = "**Team Engagement Areas Outside Release Deliverables:**\n\n"
    
    topResponses.forEach((response, index) => {
      if (response.length > 10) {
        summary += `• "${response}"\n\n`
      }
    })
    
    return summary
  }

  const generateGeneralContentSummary = (responses: string[], freq: {[key: string]: number}) => {
    const topResponses = responses.slice(0, 6)
    let summary = "**Key Feedback & Insights:**\n\n"
    
    topResponses.forEach((response, index) => {
      if (response.length > 10) {
        summary += `• "${response}"\n\n`
      }
    })
    
    return summary
  }

  // Helper functions for AI summary generation
  const extractCommonThemes = (responses: string[]) => {
    const wordCounts: {[key: string]: number} = {}
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these', 'those'])
    
    responses.forEach(response => {
      const words = response.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/)
      words.forEach(word => {
        if (word.length > 3 && !stopWords.has(word)) {
          wordCounts[word] = (wordCounts[word] || 0) + 1
        }
      })
    })
    
    return Object.entries(wordCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word)
  }

  const analyzeSentiment = (responses: string[]) => {
    const positiveWords = ['good', 'great', 'excellent', 'helpful', 'useful', 'effective', 'improved', 'better', 'positive', 'satisfied', 'happy', 'love', 'like', 'amazing', 'fantastic', 'perfect']
    const negativeWords = ['bad', 'poor', 'terrible', 'useless', 'ineffective', 'worse', 'negative', 'dissatisfied', 'unhappy', 'hate', 'dislike', 'awful', 'frustrating', 'difficult', 'problem', 'issue']
    
    let positiveCount = 0
    let negativeCount = 0
    
    responses.forEach(response => {
      const words = response.toLowerCase().split(/\s+/)
      words.forEach(word => {
        if (positiveWords.includes(word)) positiveCount++
        if (negativeWords.includes(word)) negativeCount++
      })
    })
    
    const total = positiveCount + negativeCount
    const positiveRatio = total > 0 ? positiveCount / total : 0.5
    
    let overall = 'Neutral'
    if (positiveRatio > 0.6) overall = 'Positive'
    else if (positiveRatio < 0.4) overall = 'Negative'
    
    return { overall, positiveRatio, positiveCount, negativeCount }
  }

  const categorizeResponses = (responses: string[], questionText: string) => {
    const categories: {[key: string]: string[]} = {}
    
    if (questionText.toLowerCase().includes('cursor') || questionText.toLowerCase().includes('ai')) {
      categories['Code Generation'] = responses.filter(r => r.toLowerCase().includes('generate') || r.toLowerCase().includes('create') || r.toLowerCase().includes('write'))
      categories['Debugging'] = responses.filter(r => r.toLowerCase().includes('debug') || r.toLowerCase().includes('fix') || r.toLowerCase().includes('error'))
      categories['Productivity'] = responses.filter(r => r.toLowerCase().includes('fast') || r.toLowerCase().includes('quick') || r.toLowerCase().includes('efficient'))
      categories['Learning'] = responses.filter(r => r.toLowerCase().includes('learn') || r.toLowerCase().includes('understand') || r.toLowerCase().includes('help'))
    } else if (questionText.toLowerCase().includes('jira')) {
      categories['UI/UX'] = responses.filter(r => r.toLowerCase().includes('interface') || r.toLowerCase().includes('ui') || r.toLowerCase().includes('user'))
      categories['Performance'] = responses.filter(r => r.toLowerCase().includes('slow') || r.toLowerCase().includes('fast') || r.toLowerCase().includes('speed'))
      categories['Features'] = responses.filter(r => r.toLowerCase().includes('feature') || r.toLowerCase().includes('function') || r.toLowerCase().includes('add'))
    } else {
      categories['Process'] = responses.filter(r => r.toLowerCase().includes('process') || r.toLowerCase().includes('workflow'))
      categories['Communication'] = responses.filter(r => r.toLowerCase().includes('communication') || r.toLowerCase().includes('meeting') || r.toLowerCase().includes('discuss'))
      categories['Technical'] = responses.filter(r => r.toLowerCase().includes('technical') || r.toLowerCase().includes('code') || r.toLowerCase().includes('development'))
    }
    
    return categories
  }

  const generateAIToolSummary = (categories: {[key: string]: string[]}, sentiment: any) => {
    const insights: string[] = []
    Object.entries(categories).forEach(([category, items]) => {
      if (items.length > 0) {
        insights.push(`${category}: ${items.length} mentions`)
      }
    })
    return insights.length > 0 ? insights.join(', ') : 'Various AI tool usage patterns identified'
  }

  const generateJiraSummary = (categories: {[key: string]: string[]}, commonWords: string[]) => {
    const insights: string[] = []
    Object.entries(categories).forEach(([category, items]) => {
      if (items.length > 0) {
        insights.push(`${category} improvements: ${items.length} suggestions`)
      }
    })
    return insights.length > 0 ? insights.join(', ') : `Focus areas include: ${commonWords.slice(0, 3).join(', ')}`
  }

  const generateActionItemSummary = (categories: {[key: string]: string[]}) => {
    return 'Action items cover process improvements, technical enhancements, and team coordination'
  }

  const generateGeneralSummary = (categories: {[key: string]: string[]}, sentiment: any) => {
    const insights: string[] = []
    Object.entries(categories).forEach(([category, items]) => {
      if (items.length > 0) {
        insights.push(`${category}: ${items.length} responses`)
      }
    })
    return insights.length > 0 ? insights.join(', ') : 'Diverse feedback covering multiple areas'
  }

  // Extract unique answers from trend data for table display
  const getUniqueAnswersFromTrends = (trendsData: TrendsData, questionText: string) => {
    const uniqueAnswers: Array<{answer: string, months: string[], totalResponses: number}> = []
    
    // For all table questions (text-based questions), use the latest available month
    // Only trend graph questions show data across all months
    const availableMonths = Object.keys(trendsData.trends).sort((a, b) => {
      const extractMonthOrder = (monthName: string) => {
        const [monthStr, yearStr] = monthName.split(' ')
        const year = parseInt(yearStr)
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December']
        const month = monthNames.indexOf(monthStr) + 1
        return year * 100 + month
      }
      return extractMonthOrder(b) - extractMonthOrder(a) // Sort descending to get latest first
    })
    
    const targetMonth = availableMonths[0] // Get the latest month for all table questions
    console.log(`🔄 Using latest month '${targetMonth}' for table question: ${questionText.substring(0, 50)}...`)
    
    const monthData = trendsData.trends[targetMonth]
    
    if (!monthData) {
      console.warn(`No data found for ${targetMonth}`)
      return uniqueAnswers
    }

    Object.entries(monthData).forEach(([answer, percentage]) => {
      // Skip empty answers or very common non-responses
      const cleanAnswer = answer.trim().toLowerCase()
      if (!answer || cleanAnswer === '' || 
          cleanAnswer === 'n/a' || cleanAnswer === 'na' ||
          cleanAnswer === 'none' || cleanAnswer === 'nil' ||
          cleanAnswer === 'no' || cleanAnswer === 'not applicable' ||
          cleanAnswer === 'no action' || cleanAnswer === 'no suggestion' ||
          cleanAnswer === 'no thoughts' || cleanAnswer === 'no feedback' ||
          cleanAnswer === 'nothing' || cleanAnswer === 'not sure' ||
          cleanAnswer === '-' || cleanAnswer === '--' ||
          cleanAnswer.includes('not applicable') ||
          cleanAnswer.includes('no suggestions') ||
          cleanAnswer.includes('no comments') ||
          cleanAnswer.includes('no thoughts') ||
          cleanAnswer.includes('no feedback')) {
        return
      }

      // For table questions (text questions), the server stores actual counts as the percentage value
      // For regular questions, we need to calculate from percentage
      let totalResponses
      if (isTableQuestion(questionText)) {
        // Text questions: percentage value is actually the count
        totalResponses = Math.round(percentage)
      } else {
        // Regular questions: calculate from percentage and month total
        const monthTotal = trendsData.responseCounts[targetMonth] || 100
        totalResponses = Math.round((percentage / 100) * monthTotal)
      }
      
      uniqueAnswers.push({
        answer: answer,
        months: [targetMonth],
        totalResponses: totalResponses
      })
    })

    return uniqueAnswers.sort((a, b) => {
      // Primary sort: by answer length (longest first)
      const lengthDiff = b.answer.length - a.answer.length
      if (lengthDiff !== 0) return lengthDiff
      
      // Secondary sort: by total responses (most mentioned first)
      return b.totalResponses - a.totalResponses
    })
  }

  // Helper function to get current page for a question
  const getCurrentPage = (question: string) => tablePagination[question] || 0
  
  // Helper function to set page for a question
  const setQuestionPage = (question: string, page: number) => {
    setTablePagination(prev => ({ ...prev, [question]: page }))
  }

  const loadAllTrends = async () => {
    if (Object.keys(sections).length === 0) {
      console.log('No sections available yet, skipping trend loading')
      return
    }

    // Check if user is authenticated before loading trends
    if (!isAuthenticated) {
      console.log('⚠️ User not authenticated, skipping trend loading')
      return
    }

    console.log('🔄 Loading trends for all questions...')
    setTrendsLoading(true)

      const apiBaseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
        ? 'http://localhost:4005' 
        : '';
      
    const newAllTrends: { [question: string]: TrendsData } = {}
    const newLoadedQuestions = new Set<string>()
    let totalQuestions = 0
    let processedQuestions = 0

    // Count total questions
    Object.values(sections).forEach(sectionQuestions => {
      totalQuestions += sectionQuestions.length
    })

    console.log(`📊 Loading trends for ${totalQuestions} questions across ${Object.keys(sections).length} sections`)
    console.log(`🔐 Authentication status: ${isAuthenticated ? 'Authenticated' : 'Not authenticated'}`)
    console.log(`👤 User: ${user?.email || 'No user data'}`)

    try {
      // Test with a single API call first to verify authentication
      const testQuestions = Object.values(sections).flat().slice(0, 1)
      if (testQuestions.length > 0) {
        console.log(`🧪 Testing authentication with question: "${testQuestions[0].substring(0, 60)}..."`)
        
        try {
          const testResponse = await fetch(`${apiBaseUrl}/api/trends/${encodeURIComponent(testQuestions[0])}`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          })
          
          if (!testResponse.ok) {
            const errorText = await testResponse.text()
            console.error('❌ Authentication test failed:', testResponse.status, errorText)
            
            // If it's an authentication error, show a helpful message
            if (testResponse.status === 401 || testResponse.status === 403) {
              console.log('🔑 Authentication issue detected - charts will need to be loaded manually')
              console.log('💡 This is normal on first load - try clicking "Load Charts" or refresh the page')
            }
            
            setTrendsLoading(false)
            return
          }
          
          const testData = await testResponse.json()
          console.log('✅ Authentication test passed, proceeding with batch loading')
          newAllTrends[testQuestions[0]] = testData
          newLoadedQuestions.add(testQuestions[0])
          processedQuestions++
    } catch (error) {
          console.error('❌ Authentication test error:', error)
          console.log('🔑 Network/authentication issue - manual loading will be required')
          setTrendsLoading(false)
          return
        }
      }

      // Process remaining questions in batches
      const batchSize = 3 // Reduced batch size to be more conservative
      const remainingQuestions = Object.values(sections).flat().slice(1) // Skip the test question
      
      for (let i = 0; i < remainingQuestions.length; i += batchSize) {
        const batch = remainingQuestions.slice(i, i + batchSize)
        
        // Process batch sequentially instead of parallel to avoid overwhelming auth
        for (const question of batch) {
          try {
            const response = await fetch(`${apiBaseUrl}/api/trends/${encodeURIComponent(question)}`, {
              credentials: 'include'
            })
            
            if (response.ok) {
              const trendsData = await response.json()
              newAllTrends[question] = trendsData
              newLoadedQuestions.add(question)
              processedQuestions++
              
              if (isTableQuestion(question)) {
                console.log(`✅ Loaded table data for: "${question.substring(0, 60)}..." (${processedQuestions}/${totalQuestions})`)
              } else {
                console.log(`✅ Loaded trends for: "${question.substring(0, 60)}..." (${processedQuestions}/${totalQuestions})`)
              }
            } else {
              const errorText = await response.text()
              console.log(`⚠️ Failed to load data for: "${question.substring(0, 60)}..." - ${response.status}: ${errorText}`)
              processedQuestions++
            }
    } catch (error) {
            console.error(`❌ Error loading data for question: "${question.substring(0, 60)}..."`, error)
            processedQuestions++
          }
          
          // Small delay between each request to be respectful to the server
          await new Promise(resolve => setTimeout(resolve, 200))
        }
        
        // Update state periodically to show progress
        setAllTrends({...newAllTrends})
        setLoadedQuestions(new Set(newLoadedQuestions))
      }

      setAllTrends(newAllTrends)
      setLoadedQuestions(newLoadedQuestions)
      console.log(`✅ Successfully loaded trends for ${newLoadedQuestions.size}/${totalQuestions} questions`)
      
    } catch (error) {
      console.error('❌ Error loading all trends:', error)
    } finally {
      setTrendsLoading(false)
    }
  }



  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Please select an Excel file (.xlsx or .xls)')
      return
    }

    try {
      setUploading(true)
      console.log('📤 Uploading file:', file.name)

      const formData = new FormData()
      formData.append('file', file)

      // Environment-aware API base URL
      const apiBaseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
        ? 'http://localhost:4005' 
        : '';

      const response = await fetch(`${apiBaseUrl}/api/upload-release`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      })

      if (!response.ok) {
        let errorMessage = 'Upload failed'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || 'Upload failed'
        } catch (jsonError) {
          // If we can't parse the JSON response, show a custom message
          errorMessage = 'Only app owner can upload from backend!'
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      console.log('✅ File uploaded successfully:', result)

      // Refresh the data to include the new file
      await handleRefresh()

      alert(`🎉 Release data uploaded successfully!
📁 File: ${result.filename}
📊 Responses processed: ${result.responseCount || 'Unknown'}
✅ Data refreshed automatically`)

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

    } catch (error) {
      console.error('❌ Upload failed:', error)
      
      // Check if it's the JSON parsing error and show custom message
      if (error instanceof Error && error.message.includes('Unexpected end of JSON input')) {
        alert('Upload failed: Only app owner can upload from backend!')
      } else {
        alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setUploading(false)
    }
  }

  // Handle click on chart data points
  const handleChartClick = async (data: any, event: any) => {
    if (!data || !data.activePayload || !data.activePayload[0]) return
    
    const clickedMonth = data.activePayload[0].payload.month
    console.log('Clicked month:', clickedMonth)
    
    setSelectedMonth(clickedMonth)
    setShowDirectorPopup(true)
    setDirectorLoading(true)
    setDirectorData([])
    
    try {
      const response = await fetch(`/api/director-counts/${encodeURIComponent(clickedMonth)}`)
      if (!response.ok) {
        throw new Error('Failed to fetch director data')
      }
      
      const result = await response.json()
      setDirectorData(result.directors || [])
    } catch (error) {
      console.error('Error fetching director data:', error)
      setDirectorData([])
    } finally {
      setDirectorLoading(false)
    }
  }

  // Show loading spinner while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading data...</p>
            <p className="mt-2 text-sm text-gray-500">This may take a few moments on first load</p>
            <p className="mt-2 text-xs text-gray-400">Debug: Total Responses = {summary.totalResponses}</p>
            <p className="mt-1 text-xs text-gray-400">Debug: Questions Length = {orderedQuestions.length}</p>
            <p className="mt-1 text-xs text-gray-400">Debug: Loading State = {loading.toString()}</p>
            <p className="mt-1 text-xs text-gray-400">Debug: Test Data = {testData}</p>
            <button 
              onClick={() => {
                console.log('Manual refresh clicked')
                fetchData()
              }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
            <button 
              onClick={() => {
                console.log('Force stop loading clicked')
                setLoading(false)
              }}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Force Stop Loading
            </button>
            <button 
              onClick={async () => {
                console.log('Quick test API clicked')
                try {
                  const response = await fetch('/api/summary')
                  const data = await response.json()
                  setTestData(`Loaded: ${data.totalResponses} responses`)
                  console.log('Quick test data:', data)
                } catch (error) {
                  setTestData(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  console.error('Quick test error:', error)
                }
              }}
              className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Quick Test API
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Release Retrospective Analysis
            </h1>
            <p className="text-gray-600 mt-2">
              Comprehensive analysis of trends and insights across all release retrospectives
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            
            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || loading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                uploading || loading
                  ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <Upload className={`w-4 h-4 ${uploading ? 'animate-pulse' : ''}`} />
              {uploading ? 'Uploading...' : 'Add Release Data'}
            </button>

            {/* Export All to PPT button - Hidden per user request
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/export-all-ppt', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    }
                  })
                  
                  if (!response.ok) {
                    throw new Error('Export failed')
                  }
                  
                  // Create blob and download
                  const blob = await response.blob()
                  const url = window.URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `Complete_Retrospective_Analysis_${new Date().toISOString().split('T')[0]}.pptx`
                  document.body.appendChild(a)
                  a.click()
                  window.URL.revokeObjectURL(url)
                  document.body.removeChild(a)
                } catch (error) {
                  console.error('Export failed:', error)
                  alert('Export failed. Please try again.')
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export All to PPT
            </button>
            */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                loading 
                  ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>

            {/* User Profile */}
            <UserProfile />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm p-1 mb-8">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-3 px-6 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📊 Overview Analysis
            </button>
            <button
              onClick={() => setActiveTab('director')}
              className={`flex-1 py-3 px-6 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'director'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              👥 Director Analysis
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Summary Metrics */}
        <div className="flex justify-center mb-8">
          <MetricCard
            icon={BarChart3}
            title="Total Releases"
            value={(releaseData?.length || 0).toString()}
            color="blue"
          />
        </div>



        {/* Release Responses Chart */}
        {(
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Total Survey Responses by Release</h2>
            <p className="text-sm text-gray-600 mb-4">Shows total number of people who completed the survey (may not have answered every question)</p>
            {releaseData && releaseData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={releaseData} onClick={handleChartClick}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tickFormatter={(value) => {
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
                    return yearMap[value] || value
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    `${value} responses`,
                    name === 'responses' ? 'Total Responses' : name
                  ]}
                  labelFormatter={(label: string) => {
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
                    return yearMap[label] || label
                  }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
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
                      return (
                        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                          <p className="font-semibold text-gray-900">{yearMap[label] || label}</p>
                          <p className="text-blue-600">Total Responses: {data.responses}</p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="responses" 
                  stroke="#3B82F6" 
                  strokeWidth={3}
                  dot={{ fill: '#3B82F6', strokeWidth: 2, r: 6 }}
                  activeDot={{ r: 8, stroke: '#3B82F6', strokeWidth: 2 }}
                >
                  <LabelList 
                    dataKey="responses" 
                    position="bottom" 
                    style={{ fontSize: '12px', fill: '#3B82F6', fontWeight: 'bold' }}
                    offset={10}
                  />
                </Line>



              </LineChart>
            </ResponsiveContainer>
          </div>
          ) : (
            <div className="h-80 flex items-center justify-center">
              <p className="text-gray-500">Loading release data...</p>
            </div>
          )}
          </div>
        )}

        {/* Comprehensive Question Analysis */}
        <div className="space-y-8">
          {/* Section and Question Navigation Dropdowns */}
          {Object.keys(sections).length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label htmlFor="section-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Navigate to Section
                  </label>
                  <select
                    id="section-select"
                    value={selectedSection}
                    onChange={(e) => {
                      setSelectedSection(e.target.value)
                      setSelectedQuestion('') // Reset question when section changes
                      if (e.target.value) {
                        // Scroll to the selected section
                        const sectionId = `section-${e.target.value.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`
                        const element = document.getElementById(sectionId)
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">Select a section...</option>
                    {Object.keys(sections).map((section) => (
                      <option key={section} value={section}>
                        {section}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex-1">
                  <label htmlFor="question-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Navigate to Question
                  </label>
                  <select
                    id="question-select"
                    value={selectedQuestion}
                    onChange={(e) => {
                      setSelectedQuestion(e.target.value)
                      if (e.target.value) {
                        // Scroll to the selected question
                        const questionId = `question-${e.target.value.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`
                        const element = document.getElementById(questionId)
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          // Highlight the question briefly
                          element.classList.add('ring-4', 'ring-blue-300', 'ring-offset-2')
                          setTimeout(() => {
                            element.classList.remove('ring-4', 'ring-blue-300', 'ring-offset-2')
                          }, 2000)
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                    disabled={!selectedSection}
                  >
                    <option value="">Select a question...</option>
                    {selectedSection && sections[selectedSection]?.map((question, index) => (
                      <option key={question} value={question}>
                        Q{index + 1}. {question.length > 80 ? `${question.substring(0, 80)}...` : question}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
          
          <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">📊 Comprehensive Question Analysis</h2>
                <p className="text-gray-600 mt-2">All questions organized by sections with trend analysis</p>
              </div>
              <div className="flex items-center gap-4">
                {trendsLoading && (
                  <div className="flex items-center gap-2 text-blue-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-sm">Loading trend charts...</span>
                  </div>
                )}
                <div className="text-sm text-gray-500">
                  {loadedQuestions.size > 0 && (
                    <span>
                      {loadedQuestions.size} of {Object.values(sections).flat().length} charts loaded
                    </span>
                  )}
                </div>
                {!trendsLoading && loadedQuestions.size === 0 && Object.keys(sections).length > 0 && (
              <button
                onClick={() => {
                      console.log('🔄 Manual retry of trend loading requested')
                      loadAllTrends()
                    }}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Load Charts
              </button>
            )}
          </div>
        </div>

            {Object.keys(sections).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Loading question sections...</p>
              </div>
            ) : !trendsLoading && loadedQuestions.size === 0 && Object.keys(sections).length > 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-yellow-800">
                  <span>⚠️</span>
                  <p className="font-medium">Trend Charts Not Loaded</p>
                </div>
                <p className="text-sm text-yellow-700 mt-1">
                  The trend analysis charts haven't loaded yet. This might be due to authentication or connectivity issues. 
                  Click "Load Charts" to retry, or check that you're logged in properly.
                </p>
                <div className="text-sm text-gray-600 mt-2">
                  <span>📋 {Object.keys(sections).length} sections • </span>
                  <span>📊 {Object.values(sections).flat().length} questions total (ready to load)</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                <span>📋 {Object.keys(sections).length} sections • </span>
                <span>📊 {Object.values(sections).flat().length} questions total</span>
          </div>
        )}
          </div>

          {/* Render all sections and their questions */}
          {Object.entries(sections).map(([sectionName, sectionQuestions]) => {
            const sectionId = `section-${sectionName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`
            return (
            <div key={sectionName} id={sectionId} className="bg-white rounded-lg shadow-sm scroll-mt-24">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">
                  📋 {sectionName}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {sectionQuestions.length} questions in this section
                </p>
          </div>
              
              <div className="p-6 space-y-8">
                {sectionQuestions.map((question, index) => {
                  const questionTrends = allTrends[question]
                  const isLoaded = loadedQuestions.has(question)
                  const questionId = `question-${question.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`
                  
                  return (
                    <div key={question} id={questionId} className="border-l-4 border-blue-200 pl-6 py-4 scroll-mt-20">
                      {/* Question Header */}
                      <div className="mb-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="text-lg font-medium text-gray-900 leading-relaxed">
                              <span className="text-blue-600 font-semibold mr-2">
                                Q{index + 1}.
                              </span>
                              {question}
                            </h4>
                          </div>
                          <div className="ml-4 flex-shrink-0">
                            {trendsLoading && !isLoaded && (
                              <div className="flex items-center gap-2 text-gray-500">
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>
                                <span className="text-xs">Loading...</span>
                              </div>
                            )}
                            {isLoaded && (
                              <span className="text-xs text-green-600 font-medium">✅ Loaded</span>
                            )}
                            {!trendsLoading && !isLoaded && (
                              <span className="text-xs text-gray-400">⏳ Queued</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Trend Chart or Table */}
                      {questionTrends ? (
                        isTableQuestion(question) ? (
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="mb-3">
                              <h5 className="text-md font-medium text-gray-800">
                                {(() => {
                                  // Dynamic headers based on question type
                                  if (question.includes("action item")) {
                                    return "Unique Action Items and Resolutions"
                                  } else if (question.includes("Jira")) {
                                    return "Jira Enhancement Suggestions"
                                  } else if (question.includes("Cursor") || question.includes("ChatGPT") || question.includes("Copilot")) {
                                    return "AI Tool Feedback and Usage"
                                  } else if (question.includes("engagement area")) {
                                    return "Engagement Areas Outside Release Deliverables"
                                  } else if (question.includes("suggestion") || question.includes("improving")) {
                                    return "Improvement Suggestions"
                                  } else if (question.includes("thought")) {
                                    return "Additional Thoughts and Feedback"
                                  } else {
                                    return "Unique Responses"
                                  }
                                })()}
                              </h5>
                              <p className="text-xs text-gray-600">
                                Showing unique responses from latest release
                              </p>
                            </div>
                            {(() => {
                              const uniqueAnswers = getUniqueAnswersFromTrends(questionTrends, question)
                              const currentPage = getCurrentPage(question)
                              const itemsPerPage = 10
                              const totalPages = Math.ceil(uniqueAnswers.length / itemsPerPage)
                              const startIndex = currentPage * itemsPerPage
                              const endIndex = startIndex + itemsPerPage
                              const currentPageAnswers = uniqueAnswers.slice(startIndex, endIndex)
                              
                              if (uniqueAnswers.length === 0) {
                                return (
                                  <div className="text-center py-8 text-gray-500">
                                    <p>No responses found for this question</p>
                                  </div>
                                )
                              }

                              // Generate AI summary
                              const aiSummary = generateAISummary(uniqueAnswers, question)

                              return (
                                <div>
                                  {/* AI Summary Section */}
                                  <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <h6 className="text-md font-semibold text-blue-900 flex items-center gap-2">
                                        🤖 AI Summary & Insights
                                      </h6>
                                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                                        Generated Analysis
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                                      {aiSummary}
                                    </div>
                                  </div>
                                  {/* Pagination Info */}
                                  <div className="flex justify-between items-center mb-3">
                                    <div className="text-xs text-gray-600">
                                      Showing {startIndex + 1}-{Math.min(endIndex, uniqueAnswers.length)} of {uniqueAnswers.length} responses from latest release
                                      <span className="ml-2 text-blue-600">(Sorted by answer length)</span>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      Page {currentPage + 1} of {totalPages}
                                    </div>
                                  </div>
                                  
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="text-left p-3 font-medium text-gray-700">
                                          {(() => {
                                            // Dynamic column headers based on question type
                                            if (question.includes("action item")) {
                                              return "Action Item & Resolution"
                                            } else if (question.includes("Jira")) {
                                              return "Jira Enhancement Suggestion"
                                            } else if (question.includes("Cursor") || question.includes("ChatGPT") || question.includes("Copilot")) {
                                              return "AI Tool Feedback/Usage"
                                            } else if (question.includes("engagement area")) {
                                              return "Engagement Area"
                                            } else if (question.includes("suggestion") || question.includes("improving")) {
                                              return "Improvement Suggestion"
                                            } else if (question.includes("thought")) {
                                              return "Thought/Feedback"
                                            } else {
                                              return "Response"
                                            }
                                          })()}
                                        </th>
                                        <th className="text-left p-3 font-medium text-gray-700">Release</th>
                                        <th className="text-left p-3 font-medium text-gray-700">Responses</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {currentPageAnswers.map((item, idx) => (
                                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                          <td className="p-3 border-t border-gray-200">
                                            <div className="max-w-md">
                                              <p className="text-gray-900 leading-relaxed">{item.answer}</p>
                                            </div>
                                          </td>
                                          <td className="p-3 border-t border-gray-200">
                                            <div className="flex flex-wrap gap-1">
                                              {item.months.map((month) => (
                                                <span 
                                                  key={month}
                                                  className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                                                >
                                                  {month}
                                                </span>
                                              ))}
                                            </div>
                                          </td>
                                          <td className="p-3 border-t border-gray-200 text-center">
                                            <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded font-medium">
                                              {item.totalResponses}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    </table>
            </div>

                                  {/* Pagination Controls */}
                                  {totalPages > 1 && (
                                    <div className="flex justify-center items-center gap-2 mt-4">
                                      <button
                                        onClick={() => setQuestionPage(question, Math.max(0, currentPage - 1))}
                                        disabled={currentPage === 0}
                                        className={`px-3 py-1 text-xs rounded ${
                                          currentPage === 0 
                                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                                            : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                        }`}
                                      >
                                        Previous
                                      </button>
                                      
                                      {/* Page numbers */}
                                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                          pageNum = i;
                                        } else if (currentPage < 3) {
                                          pageNum = i;
                                        } else if (currentPage >= totalPages - 2) {
                                          pageNum = totalPages - 5 + i;
                                        } else {
                                          pageNum = currentPage - 2 + i;
                                        }
                                        
                                        return (
                                          <button
                                            key={pageNum}
                                            onClick={() => setQuestionPage(question, pageNum)}
                                            className={`px-2 py-1 text-xs rounded ${
                                              pageNum === currentPage
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                            }`}
                                          >
                                            {pageNum + 1}
                                          </button>
                                        );
                                      })}
                                      
                                      <button
                                        onClick={() => setQuestionPage(question, Math.min(totalPages - 1, currentPage + 1))}
                                        disabled={currentPage === totalPages - 1}
                                        className={`px-3 py-1 text-xs rounded ${
                                          currentPage === totalPages - 1
                                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                            : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                        }`}
                                      >
                                        Next
                                      </button>
          </div>
        )}
                                </div>
                              )
                            })()}
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="mb-3">
                              <h5 className="text-md font-medium text-gray-800">Trend Analysis</h5>
                              <p className="text-xs text-gray-600">
                                Hover over data points to see question-specific response counts
                              </p>
                            </div>
                            <TrendChart
                              trends={questionTrends.trends}
                              questionTitle={question}
                              responseCounts={questionTrends.responseCounts}
                              rawCounts={questionTrends.rawCounts}
                            />
                          </div>
                        )
                      ) : !trendsLoading && !isLoaded ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <p className="text-sm text-red-600">
                            ⚠️ Unable to load trend data for this question
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                            <div className="h-48 bg-gray-200 rounded"></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            )
          })}
        </div>


        </>
        )}

        {/* Director Analysis Tab */}
        {activeTab === 'director' && (
          <DirectorTrendAnalysis
            questionCategories={{}}
            orderedQuestions={orderedQuestions}
            sections={sections}
          />
        )}

        {/* Director Response Popup */}
        <DirectorResponsePopup
          isOpen={showDirectorPopup}
          onClose={() => setShowDirectorPopup(false)}
          month={selectedMonth}
          data={directorData}
          loading={directorLoading}
        />

      </div>
    </div>
  )
} 