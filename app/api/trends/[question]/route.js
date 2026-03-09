import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// Load retrospective data from the current directory
function loadRetrospectiveData() {
  const data = {}
  
  // Check both current directory and Retrospectives subfolder
  const directories = ['.', './Retrospectives']
  
  for (const dir of directories) {
    try {
      const files = fs.readdirSync(path.join(process.cwd(), dir))
      
      const excelFiles = files.filter(file => 
        file.endsWith('.xlsx') && 
        file.includes('Retrospective') &&
        !file.includes('~$') // Exclude temporary Excel files
      )
      
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
          // Extract month and year to handle multiple files for same month
          const parts = file.split(' ')
          const month = parts[0]
          const year = parts[1]
          const monthKey = year ? `${month} ${year}` : month
          const filePath = path.join(process.cwd(), dir, file)
          const workbook = XLSX.readFile(filePath)
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          
          // Get the full range of the worksheet to read ALL columns
          const range = XLSX.utils.decode_range(worksheet['!ref'])
          
          // Read ALL column headers from the first row
          const allHeaders = []
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col }) // Row 1 (0-indexed)
            const cell = worksheet[cellAddress]
            const headerText = cell && cell.v ? cell.v.toString() : `Column_${XLSX.utils.encode_col(col)}`
            allHeaders.push(headerText)
          }
          
          // Try to read data with all headers
          let jsonData = []
          try {
            const options = { 
              header: allHeaders, 
              range: 1, // Start from row 2 (0-indexed)
              defval: '', // Default value for empty cells
              raw: false // Convert values to appropriate types
            }
            jsonData = XLSX.utils.sheet_to_json(worksheet, options)
          } catch (error) {
            jsonData = XLSX.utils.sheet_to_json(worksheet)
          }
          
          // If monthKey already exists, append data (in case of duplicates)
          if (data[monthKey]) {
            data[monthKey] = [...data[monthKey], ...jsonData]
          } else {
            data[monthKey] = jsonData
          }
        } catch (error) {
          console.error(`Error loading ${file}:`, error.message)
        }
      }
    } catch (error) {
      // Directory might not exist, continue to next one
      console.log(`Directory ${dir} not accessible, skipping...`)
    }
  }
  
  return data
}

// Extract month order for proper sorting
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

// Analyze trends for a specific question with STRICT column matching
function analyzeQuestionTrends(data, questionColumn) {
  const trends = {}
  const responseCounts = {}
  const rawResponseCounts = {} // Store original raw counts for each answer
  
  console.log(`🔍 Next.js: Analyzing question: "${questionColumn}"`)
  
  // Questions that should return raw responses instead of percentages
  const textQuestions = [
    'What was your engagement area during this release while not associated with the release deliverables?',
    'There is a significant increase in the AI usage with Cursor and code generation which is not getting directly translated into Sprint Velocity / Productivity gains. What is the reason you think ?',
    'Do you need any support to improve the cursor adoption ?',
    'Any interesting use case / problems you have solved using Cursor ?',
    'Give the reason for your choice in not making 75 or more requests on an average',
    'Can you elaborate the issue in few words or any Suggestion to solve it with respect to Sprint Velocity / Productivity gains',
    'What other features do you want to have in SSP?'
  ];
  
  // Helper function to normalize text for comparison
  const normalizeForComparison = (text) => {
    if (!text) return ''
    return text
      .replace(/\r\n/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }
  
  // Check if this is a text question (using normalized comparison)
  const normalizedQuestionColumn = normalizeForComparison(questionColumn)
  const isTextQuestion = textQuestions.some(q => {
    const normalizedQ = normalizeForComparison(q)
    return normalizedQuestionColumn.includes(normalizedQ) || normalizedQ.includes(normalizedQuestionColumn.substring(0, 50))
  });
  
  // Get all months from the data and sort them chronologically
  const allMonths = Object.keys(data).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b))
  
  for (const month of allMonths) {
    const df = data[month]
    console.log(`📊 Next.js: Processing month: ${month}, data length: ${df.length}`)
    
    if (df.length > 0) {
      const availableColumns = Object.keys(df[0])
      
      // ENHANCED MATCHING: Try exact match first, then normalized match
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
        
        // Try normalized matching: normalize both the search question and available columns
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
          // This handles cases like "What types of tasks..." vs "What types of tasks... (select all that apply)"
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
          console.log(`✅ Next.js: Found normalized column match for ${month}: "${questionKey}" (normalized from search: "${questionColumn}")`)
        }
      }
      
      if (questionKey) {
        // Column exists - process the data
        console.log(`✅ Next.js: Found exact column match for ${month}: "${questionKey}"`)
        
        if (isTextQuestion) {
          // For text questions, collect all unique responses
          const uniqueResponses = new Set()
          let totalValidResponses = 0
          
          df.forEach(row => {
            const answer = row[questionKey]
            if (answer !== undefined && answer !== null && answer !== '' && 
                answer.trim() !== '' && answer.trim() !== 'N/A' && answer.trim() !== '-') {
              uniqueResponses.add(answer.trim())
              totalValidResponses++
            }
          })
          
          // Convert to object format for compatibility (each response gets 100% since they're unique)
          const responseData = {}
          Array.from(uniqueResponses).forEach(response => {
            responseData[response] = 100 // Each unique response gets 100% weight
          })
          
          trends[month] = responseData
          rawResponseCounts[month] = {} // Text questions don't have raw counts in the traditional sense
          responseCounts[month] = totalValidResponses
          console.log(`✅ Next.js: Processed text question ${month}: ${totalValidResponses} responses, ${uniqueResponses.size} unique responses`)
        } else {
          // Count responses for each answer option (regular percentage analysis)
          const answerCounts = {}
          let totalValidResponses = 0
          
          df.forEach(row => {
            const answer = row[questionKey]
            if (answer !== undefined && answer !== null && answer !== '') {
              answerCounts[answer] = (answerCounts[answer] || 0) + 1
              totalValidResponses++
            }
          })
          
          if (totalValidResponses > 0) {
            // Convert counts to percentages
            const percentages = {}
            const rawCounts = {}
            for (const [answer, count] of Object.entries(answerCounts)) {
              percentages[answer] = Math.round((count / totalValidResponses) * 100 * 100) / 100
              rawCounts[answer] = count // Store original raw counts
            }
            trends[month] = percentages
            rawResponseCounts[month] = rawCounts // Store raw counts separately
            responseCounts[month] = totalValidResponses
            console.log(`✅ Next.js: Processed ${month}: ${totalValidResponses} responses, ${Object.keys(percentages).length} answer types`)
          } else {
            // Column exists but no valid responses
            trends[month] = {}
            rawResponseCounts[month] = {}
            responseCounts[month] = 0
            console.log(`⚠️ Next.js: ${month}: Column exists but no valid responses`)
          }
        }
      } else {
        // Column doesn't exist - skip this month for this question
        console.log(`❌ Next.js: No exact column match for ${month} - SKIPPING and marking as 0`)
        console.log(`📋 Next.js: Available columns in ${month}:`, availableColumns.slice(0, 5)) // Show first 5 for debugging
        
        // Don't include this month in trends (skip it completely)
        responseCounts[month] = 0
      }
    } else {
      // No data for this month
      responseCounts[month] = 0
      console.log(`⚠️ Next.js: ${month}: No data available`)
    }
  }
  
  console.log(`📈 Next.js: Final trends months:`, Object.keys(trends))
  console.log(`📊 Next.js: Final response counts:`, Object.keys(responseCounts))
  
  return { trends, responseCounts, rawResponseCounts }
}

export async function GET(request, { params }) {
  try {
    const { question } = params
    
    // Decode the question parameter (it comes URL-encoded)
    const decodedQuestion = decodeURIComponent(question)
    
    console.log(`📥 Trends API called with question: "${decodedQuestion}"`)
    console.log(`📥 Original encoded: "${question}"`)
    
    if (!decodedQuestion) {
      return NextResponse.json({ error: 'Question parameter is required' }, { status: 400 })
    }
    
    const data = loadRetrospectiveData()
    
    if (!data || Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 })
    }
    
    const { trends, responseCounts, rawResponseCounts } = analyzeQuestionTrends(data, decodedQuestion)
    
    // Get all months and sort them
    const allMonths = Object.keys(data).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b))
    
    // Create sorted trends object
    const sortedTrends = {}
    const sortedMonths = Object.keys(trends).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b))
    for (const month of sortedMonths) {
      sortedTrends[month] = trends[month]
    }
    
    const result = {
      question: decodedQuestion,
      trends: sortedTrends,
      responseCounts,
      rawCounts: rawResponseCounts,  // Include original raw counts
      months: allMonths
    }
    
    console.log(`📤 Trends API response for "${decodedQuestion}":`, {
      monthsWithData: Object.keys(sortedTrends),
      totalMonths: allMonths.length,
      responseCounts: Object.values(responseCounts).reduce((a, b) => a + b, 0)
    })
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
} 