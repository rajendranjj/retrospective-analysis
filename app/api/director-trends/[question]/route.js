import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

function extractMonthOrder(monthName) {
  const monthMapping = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
  };
  
  // Handle "Month Year" format
  const parts = monthName.split(' ')
  const month = parts[0]
  const year = parts[1] ? parseInt(parts[1]) : 2024 // Default year for backward compatibility
  
  const monthOrder = monthMapping[month] || 13
  
  // Create a sortable number: YYYYMM format
  return year * 100 + monthOrder
}

function loadRetrospectiveData() {
  console.log('🔍 VERCEL DEBUGGING: Starting to load retrospective data for director trends...')
  console.log('🔍 VERCEL DEBUGGING: Environment variables:')
  console.log('  - NODE_ENV:', process.env.NODE_ENV)
  console.log('  - VERCEL:', process.env.VERCEL)
  console.log('  - VERCEL_ENV:', process.env.VERCEL_ENV)
  console.log('  - Current working directory:', process.cwd())
  
  const data = {}
  
  // Enhanced directory checking for Vercel
  let directories = []
  
  if (process.env.VERCEL) {
    // In Vercel, try multiple potential locations
    directories = ['./Retrospectives', './public/Retrospectives', 'Retrospectives', 'public/Retrospectives']
  } else {
    // Local development
    directories = ['.', './Retrospectives']
  }

  // Use different path resolution based on environment
  let projectRoot
  if (process.env.VERCEL) {
    projectRoot = process.cwd()
  } else {
    projectRoot = path.resolve(__dirname, '..', '..', '..', '..', '..')
  }

  console.log('🔍 VERCEL DEBUGGING: Project root:', projectRoot)
  console.log('🔍 VERCEL DEBUGGING: Directories to check:', directories)

  for (const dir of directories) {
    try {
      const fullPath = path.join(projectRoot, dir)
      console.log(`🔍 VERCEL DEBUGGING: Checking directory: ${fullPath}`)
      
      if (!fs.existsSync(fullPath)) {
        console.log(`🔍 VERCEL DEBUGGING: Directory ${fullPath} does not exist, skipping...`)
        continue
      }
      
      const files = fs.readdirSync(fullPath)
      console.log(`🔍 VERCEL DEBUGGING: Files in ${dir}:`, files.length > 0 ? files.slice(0, 10) : 'No files found')
      
      const excelFiles = files.filter(file => 
        file.endsWith('.xlsx') && 
        file.includes('Release Retrospective') &&
        !file.includes('~$') // Exclude temporary Excel files
      )
      console.log(`🔍 VERCEL DEBUGGING: Excel files found in ${dir}:`, excelFiles)
      
      if (excelFiles.length === 0) {
        console.log(`🔍 VERCEL DEBUGGING: No Excel files found in ${dir}, continuing to next directory...`)
        continue
      }
      
      // Sort files chronologically before processing
      const sortedFiles = excelFiles.sort((a, b) => {
        const extractFileOrder = (filename) => {
          const parts = filename.split(' ')
          const month = parts[0]
          const year = parts[1] ? parseInt(parts[1]) : 2024
          const monthMapping = {
            'January': 1, 'February': 2, 'March': 3, 'April': 4,
            'May': 5, 'June': 6, 'July': 7, 'August': 8,
            'September': 9, 'October': 10, 'November': 11, 'December': 12
          }
          const monthOrder = monthMapping[month] || 13
          return year * 100 + monthOrder
        }
        return extractFileOrder(a) - extractFileOrder(b)
      })
      
      for (const file of sortedFiles) {
        try {
          const filePath = path.join(fullPath, file)
          const workbook = XLSX.readFile(filePath)
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          
          const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
          const allHeaders = []
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
            const cell = worksheet[cellAddress]
            const headerText = cell && cell.v ? cell.v.toString() : `Column_${XLSX.utils.encode_col(col)}`
            allHeaders.push(headerText)
          }
          
          const options = { 
            header: allHeaders, 
            range: 1,
            defval: '',
            raw: false
          }
          const jsonData = XLSX.utils.sheet_to_json(worksheet, options)
          
          // Extract month and year to handle multiple files for same month
          const parts = file.split(' ')
          const month = parts[0]
          const year = parts[1]
          const monthKey = year ? `${month} ${year}` : month
          if (data[monthKey]) {
            data[monthKey] = [...data[monthKey], ...jsonData]
          } else {
            data[monthKey] = jsonData
          }
        } catch (error) {
          console.error(`🔍 VERCEL DEBUGGING: Error loading ${file}:`, error.message)
          if (process.env.VERCEL) {
            console.log(`🔍 VERCEL DEBUGGING: Vercel file access error for ${file} - this may be expected in serverless environment`)
          }
        }
      }
      
      // If we found files in this directory, break (prioritize first working directory)
      if (excelFiles.length > 0) {
        console.log(`🔍 VERCEL DEBUGGING: Successfully loaded ${excelFiles.length} files from ${dir}, stopping search`)
        break
      }
    } catch (error) {
      console.log(`🔍 VERCEL DEBUGGING: Directory ${dir} not accessible:`, error.message)
    }
  }
  
  console.log(`🔍 VERCEL DEBUGGING: Final data keys:`, Object.keys(data))
  return data
}

function analyzeDirectorQuestionTrends(data, questionColumn, targetDirector) {
  const trends = {}
  const responseCounts = {}
  const rawResponseCounts = {} // Store original raw counts for each answer
  
  console.log(`Analyzing director trends for: "${targetDirector}" on question: "${questionColumn}"`)
  
  // Questions that should return raw responses instead of percentages
  const textQuestions = [
    'Share an interesting use case where Cursor helped you',
    'Any feedback/suggestion on Cursor Usage ?',
    'Are you getting all the support for AI adoption from various forums (Slack / email / Lunch n Learn series) ?',
    'What was your engagement area during this release while not associated with the release deliverables?'
  ];
  
  // Check if this is a text question
  const isTextQuestion = textQuestions.some(q => 
    questionColumn.includes(q) || q.includes(questionColumn.substring(0, 50))
  );
  
  const allMonths = Object.keys(data).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b))
  
  for (const month of allMonths) {
    const df = data[month]
    console.log(`Processing month: ${month}, data length: ${df.length}`)
    
    if (df.length > 0) {
      // Find director column
      const directorColumn = Object.keys(df[0]).find(col => 
        col === 'You are part of which of the following directors org'
      )
      
      if (!directorColumn) {
        console.log(`No director column found in ${month}`)
        continue
      }
      
      // ENHANCED MATCHING: Try exact match first, then normalized match for questions
      const availableColumns = Object.keys(df[0])
      let questionKey = availableColumns.find(col => col === questionColumn)
      
      if (!questionKey) {
        // Helper function to normalize text for comparison
        const normalizeText = (text) => {
          if (!text) return ''
          return text
            .replace(/\r\n/g, ' ')  // Replace \r\n with space
            .replace(/\n/g, ' ')     // Replace \n with space
            .replace(/\r/g, ' ')     // Replace \r with space
            .replace(/\s+/g, ' ')    // Replace multiple spaces with single space
            .trim()
            .toLowerCase()
        }
        
        // Try normalized matching with prefix support
        const normalizedSearchQuestion = normalizeText(questionColumn)
        questionKey = availableColumns.find(col => {
          const normalizedCol = normalizeText(col)
          
          // Try exact match after normalization
          if (normalizedCol === normalizedSearchQuestion) {
            return true
          }
          
          // Try reverse exact match (Excel column might be shorter)
          if (normalizedSearchQuestion === normalizedCol) {
            return true
          }
          
          // Try prefix match - search question is beginning of Excel column
          if (normalizedCol.startsWith(normalizedSearchQuestion) && 
              normalizedCol.length > normalizedSearchQuestion.length) {
            const remainder = normalizedCol.substring(normalizedSearchQuestion.length).trim()
            // Only match if remainder starts with parentheses (additional clarification)
            return remainder.startsWith('(') || remainder.startsWith('-') || remainder.startsWith('/')
          }
          
          // Try reverse prefix match - Excel column is beginning of search question
          if (normalizedSearchQuestion.startsWith(normalizedCol) && 
              normalizedSearchQuestion.length > normalizedCol.length) {
            const remainder = normalizedSearchQuestion.substring(normalizedCol.length).trim()
            return remainder.startsWith('(') || remainder.startsWith('-') || remainder.startsWith('/')
          }
          
          return false
        })
        
        if (questionKey) {
          console.log(`✅ Director Analysis API: Found normalized column match for "${questionColumn}" in ${month}: "${questionKey}"`)
        }
      }
      
      if (!questionKey) {
        // Column doesn't exist - skip this month for this question
        console.log(`❌ Director Analysis API: No exact or normalized column match for "${questionColumn}" in ${month} - SKIPPING`)
        console.log(`📋 Available columns in ${month}:`, availableColumns.slice(0, 5)) // Show first 5 for debugging
        continue
      }
      
      // Filter responses for the target director
      const directorResponses = df.filter(response => 
        response[directorColumn] === targetDirector
      )
      
      console.log(`Director ${targetDirector} responses in ${month}: ${directorResponses.length}`)
      
      if (directorResponses.length === 0) {
        console.log(`❌ No responses for director ${targetDirector} in ${month} - SKIPPING`)
        continue
      }
      
      if (isTextQuestion) {
        // For text questions, collect all unique responses
        const uniqueResponses = new Set()
        let totalValidResponses = 0
        
        for (const response of directorResponses) {
          const value = response[questionKey]
          if (value && value !== '' && value.trim() !== '' && 
              value.trim() !== 'N/A' && value.trim() !== '-') {
            uniqueResponses.add(value.trim())
            totalValidResponses++
          }
        }
        
        // Convert to object format for compatibility (each response gets 100% since they're unique)
        const responseData = {}
        Array.from(uniqueResponses).forEach(response => {
          responseData[response] = 100 // Each unique response gets 100% weight
        })
        
        trends[month] = responseData
        rawResponseCounts[month] = {} // Text questions don't have raw counts in the traditional sense
        responseCounts[month] = totalValidResponses
        console.log(`Processed text question ${month}: ${totalValidResponses} responses, ${uniqueResponses.size} unique responses`)
      } else {
        // Get value counts and calculate percentages (regular analysis)
        const valueCounts = {}
        let totalResponses = 0
        
        for (const response of directorResponses) {
          const value = response[questionKey]
          if (value && value !== '') {
            valueCounts[value] = (valueCounts[value] || 0) + 1
            totalResponses++
          }
        }
        
        // Convert counts to percentages
        const percentages = {}
        const rawCounts = {}
        for (const [value, count] of Object.entries(valueCounts)) {
          percentages[value] = (count / totalResponses) * 100
          rawCounts[value] = count // Store original raw counts
        }
        
        trends[month] = percentages
        rawResponseCounts[month] = rawCounts // Store raw counts separately
        responseCounts[month] = totalResponses
        
        console.log(`Processed ${month}: ${totalResponses} responses, ${Object.keys(percentages).length} answer types`)
      }
    }
  }
  
  return { trends, responseCounts, rawResponseCounts }
}

export async function GET(request, { params }) {
  try {
    const { question } = params
    const { searchParams } = new URL(request.url)
    const director = searchParams.get('director')
    
    if (!director) {
      return NextResponse.json({ error: 'Director parameter is required' }, { status: 400 })
    }
    
    console.log(`Director trends API called for question: "${question}", director: "${director}"`)
    
    // Try server first in development
    if (process.env.NODE_ENV === 'development') {
      try {
        const serverResponse = await fetch(`http://localhost:4005/api/director-trends/${encodeURIComponent(question)}?director=${encodeURIComponent(director)}`)
        if (serverResponse.ok) {
          const serverData = await serverResponse.json()
          console.log('Successfully got director trends from server')
          return NextResponse.json(serverData)
        }
      } catch (error) {
        console.log('Could not fetch from server:', error.message)
      }
    }
    
    // Fallback: read files directly
    const data = loadRetrospectiveData()
    
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ 
        error: 'No retrospective data found',
        trends: {},
        responseCounts: {},
        summaryData: [],
        question: question
      })
    }
    
    const { trends, responseCounts, rawResponseCounts } = analyzeDirectorQuestionTrends(data, question, director)
    
    // Create summary data for the chart and sorted trends object
    const summaryData = []
    const sortedTrends = {}
    const sortedMonths = Object.keys(trends).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b))
    
    for (const month of sortedMonths) {
      const monthTrends = trends[month]
      sortedTrends[month] = monthTrends // Add to sorted trends object
      
      for (const [answer, percentage] of Object.entries(monthTrends)) {
        summaryData.push({
          Month: month,
          Answer: answer,
          Percentage: percentage
        })
      }
    }
    
    console.log(`Director trends analysis complete. Months: ${sortedMonths.length}, Total data points: ${summaryData.length}`)
    
    return NextResponse.json({
      trends: sortedTrends,
      responseCounts,
      rawCounts: rawResponseCounts,  // Include original raw counts
      summaryData,
      question: question,
      director: director
    })
    
  } catch (error) {
    console.error('Error in director trends API:', error)
    return NextResponse.json({ 
      error: 'Failed to analyze director trends',
      trends: {},
      responseCounts: {},
      summaryData: [],
      question: params.question || 'Unknown'
    }, { status: 500 })
  }
}