const express = require('express');
const multer = require('multer');
const cors = require('cors');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const PptxGenJS = require('pptxgenjs');

const app = express();
const PORT = 4005;

// Middleware
app.use(cors({
  origin: ['http://localhost:3002', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

// Load retrospective data from the current directory
function loadRetrospectiveData() {
  console.log('Starting to load retrospective data...')
  const data = {}
  
  // Check both current directory and Retrospectives subfolder
  const directories = ['.', './Retrospectives']
  
  for (const dir of directories) {
    try {
      console.log(`Checking directory: ${dir}`)
      const files = fs.readdirSync(path.join(__dirname, '..', dir))
      console.log(`Files in ${dir}:`, files)
      
      const excelFiles = files.filter(file => 
        file.endsWith('.xlsx') && 
        file.includes('Retrospective') &&
        !file.includes('~$') // Exclude temporary Excel files
      )
      console.log(`Excel files found in ${dir}:`, excelFiles)
      
      for (const file of excelFiles) {
        try {
          console.log(`Processing file: ${file}`)
          const month = file.split(' ')[0]
          const filePath = path.join(__dirname, '..', dir, file)
          console.log(`File path: ${filePath}`)
          const workbook = XLSX.readFile(filePath)
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          
          // Get the full range of the worksheet to read ALL columns
          const range = XLSX.utils.decode_range(worksheet['!ref'])
          console.log(`File ${file} has range: ${worksheet['!ref']} (${range.e.c + 1} columns, ${range.e.r + 1} rows)`)
          
          // Read ALL column headers from the first row
          const allHeaders = []
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col }) // Row 1 (0-indexed)
            const cell = worksheet[cellAddress]
            const headerText = cell && cell.v ? cell.v.toString() : `Column_${XLSX.utils.encode_col(col)}`
            allHeaders.push(headerText)
          }
          
          console.log(`All headers in ${file}:`, allHeaders)
          
          // Try to read data with all headers
          let jsonData = []
          try {
            // Force reading with all headers and ensure all columns are included
            const options = { 
              header: allHeaders, 
              range: 1, // Start from row 2 (0-indexed)
              defval: '', // Default value for empty cells
              raw: false // Convert values to appropriate types
            }
            jsonData = XLSX.utils.sheet_to_json(worksheet, options)
            
            // Verify we got all columns
            if (jsonData.length > 0) {
              const actualColumns = Object.keys(jsonData[0])
              if (actualColumns.length !== allHeaders.length) {
                console.log(`Warning: Expected ${allHeaders.length} columns but got ${actualColumns.length} for ${file}`)
                console.log(`Missing columns:`, allHeaders.filter(h => !actualColumns.includes(h)))
              }
            }
          } catch (error) {
            console.log(`Error reading with all headers, trying default method:`, error.message)
            jsonData = XLSX.utils.sheet_to_json(worksheet)
          }
          
          // Debug: Show what we found
          if (month === 'November') {
            console.log(`November file structure - All headers:`, allHeaders)
            console.log(`November file structure - Data rows:`, jsonData.length)
            if (jsonData.length > 0) {
              console.log(`November file structure - First row keys:`, Object.keys(jsonData[0]))
              // Check if capacity-related columns exist
              const capacityColumns = allHeaders.filter(header => 
                header.toLowerCase().includes('capacity') || 
                header.toLowerCase().includes('process') ||
                header.toLowerCase().includes('dev') ||
                header.toLowerCase().includes('qa')
              )
              console.log(`November file structure - Capacity-related columns:`, capacityColumns)
            }
          }
          
          // If month already exists, append data (in case of duplicates)
          if (data[month]) {
            console.log(`Appending data to existing ${month}: ${jsonData.length} additional responses`)
            data[month] = [...data[month], ...jsonData]
          } else {
            data[month] = jsonData
          }
          console.log(`Loaded ${month}: ${jsonData.length} responses from ${file}`)
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
  return monthMapping[monthName] || 13;
}

// Analyze trends for a specific question
function analyzeQuestionTrends(data, questionColumn) {
  const trends = {}
  const responseCounts = {}
  
  console.log(`Analyzing question: "${questionColumn}"`)
  
  // Get all months from the data
  const allMonths = Object.keys(data)
  
  for (const month of allMonths) {
    const df = data[month]
    console.log(`Processing month: ${month}, data length: ${df.length}`)
    
    if (df.length > 0) {
      // Try exact match first
      let questionKey = questionColumn
      
      // If exact match fails, try to find a similar column
      if (!df[0].hasOwnProperty(questionKey)) {
        // Look for columns that contain the question text
        const availableColumns = Object.keys(df[0])
        
        // Debug: Show ALL columns for this month
        console.log(`All columns in ${month}:`, availableColumns)
        
        // First try: exact match
        let matchingColumn = availableColumns.find(col => col === questionKey)
        
        // Second try: contains the question text (more flexible)
        if (!matchingColumn) {
          // Split question into key phrases and look for partial matches
          const questionPhrases = [
            'capacity',
            'process changes',
            'processes enablement',
            'DEV or QA Resources',
            'percent of your available capacity'
          ]
          
          matchingColumn = availableColumns.find(col => {
            if (col === 'Timestamp') return false
            
            const colLower = col.toLowerCase()
            // Check if any key phrase is found in the column
            return questionPhrases.some(phrase => 
              colLower.includes(phrase.toLowerCase())
            )
          })
        }
        
        // Third try: look for columns with similar structure
        if (!matchingColumn) {
          const questionWords = questionKey.toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Remove special characters
            .split(/\s+/)
            .filter(word => word.length > 3) // Only consider words longer than 3 characters
          
          matchingColumn = availableColumns.find(col => {
            if (col === 'Timestamp') return false
            
            const colLower = col.toLowerCase()
            const matchingWords = questionWords.filter(word => colLower.includes(word))
            
            // More lenient matching - at least 30% of words must match
            const minWordMatch = Math.ceil(questionWords.length * 0.3)
            return matchingWords.length >= minWordMatch
          })
        }
        
        if (matchingColumn) {
          questionKey = matchingColumn
          console.log(`Found matching column for ${month}: "${questionKey}" instead of "${questionColumn}"`)
        } else {
          console.log(`No matching column found for ${month}, available columns:`, availableColumns.filter(col => col !== 'Timestamp'))
          // Don't skip - add this month with 0 values
          trends[month] = {}
          responseCounts[month] = df.length
          console.log(`Added ${month} with 0 values (${df.length} total responses)`)
          continue
        }
      }
      
      // Get value counts and calculate percentages
      const valueCounts = {}
      let totalResponses = 0
      
      for (const row of df) {
        const value = row[questionKey]
        if (value !== undefined && value !== null && value !== '') {
          valueCounts[value] = (valueCounts[value] || 0) + 1
          totalResponses++
        }
      }
      
      if (totalResponses > 0) {
        const percentages = {}
        for (const [answer, count] of Object.entries(valueCounts)) {
          percentages[answer] = Math.round((count / totalResponses) * 100 * 100) / 100
        }
        trends[month] = percentages
        responseCounts[month] = totalResponses
        console.log(`Processed ${month}: ${totalResponses} responses, ${Object.keys(percentages).length} answer types`)
      } else {
        // Even if no valid responses, include the month with 0 values
        trends[month] = {}
        responseCounts[month] = df.length
        console.log(`Added ${month} with 0 values (${df.length} total responses)`)
      }
    }
  }
  
  console.log(`Final trends:`, Object.keys(trends))
  console.log(`Final response counts:`, Object.keys(responseCounts))
  
  return { trends, responseCounts }
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Retrospective Analyzer Server is running' });
});

app.get('/api/data', (req, res) => {
  try {
    const data = loadRetrospectiveData();
    
    if (Object.keys(data).length === 0) {
      return res.status(404).json({ error: 'No retrospective files found' });
    }
    
    // Get summary metrics
    const totalFiles = Object.keys(data).length;
    const totalResponses = Object.values(data).reduce((sum, df) => sum + df.length, 0);
    const mostRecent = Object.keys(data).reduce((a, b) => 
      extractMonthOrder(a) > extractMonthOrder(b) ? a : b
    );
    const mostRecentResponses = data[mostRecent].length;
    
    // Get sample data to show available questions
    const sampleData = Object.values(data)[0];
    const availableQuestions = Object.keys(sampleData[0] || {}).filter(col => col !== 'Timestamp');
    
    // Group questions by category
    const questionCategories = {
      'Team & Organization': availableQuestions.filter(col => 
        ['team', 'scrum', 'org', 'director'].some(keyword => col.toLowerCase().includes(keyword))
      ),
      'AI & Efficiency': availableQuestions.filter(col => 
        ['ai', 'efficiency', 'productivity'].some(keyword => col.toLowerCase().includes(keyword))
      ),
      'Release Planning': availableQuestions.filter(col => 
        ['planning', 'commitment', 'timeline'].some(keyword => col.toLowerCase().includes(keyword))
      ),
      'Agile Ceremonies': availableQuestions.filter(col => 
        ['sprint', 'standup', 'retrospective', 'ceremony'].some(keyword => col.toLowerCase().includes(keyword))
      ),
      'Process & Support': availableQuestions.filter(col => 
        ['process', 'support', 'capacity', 'jira'].some(keyword => col.toLowerCase().includes(keyword))
      )
    };
    
    // Add remaining questions to "Other" category
    const categorizedQuestions = Object.values(questionCategories).flat();
    questionCategories['Other'] = availableQuestions.filter(col => !categorizedQuestions.includes(col));
    
    res.json({
      summary: {
        totalFiles,
        totalResponses,
        mostRecent,
        mostRecentResponses
      },
      questionCategories,
      availableQuestions,
      data: Object.keys(data)
    });
  } catch (error) {
    console.error('Error loading data:', error);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

app.get('/api/trends/:question', (req, res) => {
  try {
    const { question } = req.params;
    const data = loadRetrospectiveData();
    
    if (Object.keys(data).length === 0) {
      return res.status(404).json({ error: 'No retrospective files found' });
    }
    
    const { trends, responseCounts } = analyzeQuestionTrends(data, question);
    
    if (Object.keys(trends).length === 0) {
      return res.status(404).json({ error: 'No trend data available for the selected question' });
    }
    
    // Create summary data for export
    const summaryData = [];
    for (const month of Object.keys(trends).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b))) {
      const monthData = trends[month];
      for (const [answer, percentage] of Object.entries(monthData)) {
        summaryData.push({
          Month: month,
          Answer: answer,
          Percentage: percentage
        });
      }
    }
    
    res.json({
      trends,
      responseCounts,
      summaryData,
      question
    });
  } catch (error) {
    console.error('Error analyzing trends:', error);
    res.status(500).json({ error: 'Failed to analyze trends' });
  }
});

app.get('/api/response-counts', (req, res) => {
  try {
    const data = loadRetrospectiveData();
    
    if (Object.keys(data).length === 0) {
      return res.status(404).json({ error: 'No retrospective files found' });
    }
    
    const responseCounts = {};
    for (const [month, df] of Object.entries(data)) {
      responseCounts[month] = df.length;
    }
    
    const sortedMonths = Object.keys(responseCounts).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b));
    
    res.json({
      responseCounts,
      sortedMonths,
      sortedCounts: sortedMonths.map(month => responseCounts[month])
    });
  } catch (error) {
    console.error('Error getting response counts:', error);
    res.status(500).json({ error: 'Failed to get response counts' });
  }
});

// API endpoint to get summary data
app.get('/api/summary', (req, res) => {
  try {
    const data = loadRetrospectiveData()
    
    let totalResponses = 0
    let totalQuestions = 0
    let totalQuestionsSet = new Set()
    
    for (const [month, responses] of Object.entries(data)) {
      totalResponses += responses.length
      if (responses.length > 0) {
        // Count questions for this month
        const monthQuestions = Object.keys(responses[0]).filter(col => col !== 'Timestamp')
        monthQuestions.forEach(q => totalQuestionsSet.add(q))
      }
    }
    
    totalQuestions = totalQuestionsSet.size
    
    // Calculate average response rate (assuming 100% for now)
    const averageResponseRate = 100.0
    
    res.json({
      totalResponses,
      totalQuestions,
      averageResponseRate
    })
  } catch (error) {
    console.error('Error getting summary:', error)
    res.status(500).json({ error: 'Failed to get summary' })
  }
})

// API endpoint to get available questions
app.get('/api/questions', (req, res) => {
  try {
    const data = loadRetrospectiveData()
    
    // Get the most recent month's data to preserve column order
    const months = Object.keys(data).sort((a, b) => extractMonthOrder(b) - extractMonthOrder(a))
    const mostRecentMonth = months[0]
    
    let orderedQuestions = []
    let questionCategories = {}
    
    if (mostRecentMonth && data[mostRecentMonth].length > 0) {
      // Get questions in the order they appear in the Excel sheet (excluding Timestamp)
      orderedQuestions = Object.keys(data[mostRecentMonth][0]).filter(col => col !== 'Timestamp')
      
      // Create categories based on question content
      const generalKeywords = ['team', 'scrum', 'org', 'director', 'collaboration', 'communication']
      const processKeywords = ['process', 'support', 'capacity', 'jira', 'workflow', 'efficiency']
      const technicalKeywords = ['ai', 'technology', 'tools', 'automation', 'performance', 'quality']
      
      questionCategories = {
        'General': orderedQuestions.filter(q => 
          generalKeywords.some(keyword => q.toLowerCase().includes(keyword))
        ),
        'Process': orderedQuestions.filter(q => 
          processKeywords.some(keyword => q.toLowerCase().includes(keyword))
        ),
        'Technical': orderedQuestions.filter(q => 
          technicalKeywords.some(keyword => q.toLowerCase().includes(keyword))
        )
      }
      
      // Add remaining questions to "Other" category
      const categorizedQuestions = Object.values(questionCategories).flat()
      questionCategories['Other'] = orderedQuestions.filter(q => !categorizedQuestions.includes(q))
    }
    
    res.json({ 
      categories: questionCategories,
      orderedQuestions: orderedQuestions
    })
  } catch (error) {
    console.error('Error getting questions:', error)
    res.status(500).json({ error: 'Failed to get questions' })
  }
})

// API endpoint to get release data for the chart
app.get('/api/releases', (req, res) => {
  try {
    const data = loadRetrospectiveData()
    const releaseData = []
    
    for (const [month, responses] of Object.entries(data)) {
      if (responses.length > 0) {
        // Count total questions (columns) for this release
        const totalQuestions = Object.keys(responses[0]).filter(col => col !== 'Timestamp').length
        
        releaseData.push({
          month: month,
          responses: responses.length,
          questions: totalQuestions
        })
      }
    }
    
    // Sort by chronological order
    const monthOrder = {
      'August': 1, 'September': 2, 'November': 3, 'January': 4,
      'March': 5, 'April': 6, 'May': 7, 'July': 8
    }
    
    releaseData.sort((a, b) => monthOrder[a.month] - monthOrder[b.month])
    
    res.json(releaseData)
  } catch (error) {
    console.error('Error getting release data:', error)
    res.status(500).json({ error: 'Failed to get release data' })
  }
})

// API endpoint to get director-specific data for a question
app.get('/api/director-analysis/:question', (req, res) => {
  try {
    const { question } = req.params
    const data = loadRetrospectiveData()
    
    if (Object.keys(data).length === 0) {
      return res.status(404).json({ error: 'No retrospective files found' })
    }
    
    // Get the last 3 releases (most recent months)
    const monthOrder = {
      'August': 1, 'September': 2, 'November': 3, 'January': 4,
      'March': 5, 'April': 6, 'May': 7, 'July': 8
    }
    
    const sortedMonths = Object.keys(data).sort((a, b) => monthOrder[b] - monthOrder[a])
    const last3Months = sortedMonths.slice(0, 3)
    
    const releasesData = {}
    
    for (const month of last3Months) {
      const responses = data[month]
      if (responses.length > 0) {
        // Find the director column and question column
        const directorColumn = Object.keys(responses[0]).find(col => 
          col === 'You are part of which of the following directors org'
        )
        
        if (!directorColumn) continue
        
        // Find the question column (exact match or similar)
        let questionColumn = question
        if (!responses[0].hasOwnProperty(questionColumn)) {
          const availableColumns = Object.keys(responses[0])
          questionColumn = availableColumns.find(col => 
            col === question || col.toLowerCase().includes(question.toLowerCase().substring(0, 20))
          )
        }
        
        if (!questionColumn) continue
        
        const directorAnalysis = {}
        const allDirectors = new Set()
        const allAnswers = new Set()
        
        // Process each response for this month
        for (const response of responses) {
          const director = response[directorColumn]
          const answer = response[questionColumn]
          
          if (director && director !== '' && answer && answer !== '') {
            allDirectors.add(director)
            allAnswers.add(answer)
            
            if (!directorAnalysis[director]) {
              directorAnalysis[director] = {}
            }
            
            if (!directorAnalysis[director][answer]) {
              directorAnalysis[director][answer] = 0
            }
            
            directorAnalysis[director][answer]++
          }
        }
        
        // Calculate percentages and format data for this month
        const formattedData = []
        const directors = Array.from(allDirectors).sort()
        const answers = Array.from(allAnswers).sort()
        
        for (const director of directors) {
          const directorData = directorAnalysis[director] || {}
          const totalResponses = Object.values(directorData).reduce((sum, count) => sum + count, 0)
          
          const row = { director }
          for (const answer of answers) {
            const count = directorData[answer] || 0
            const percentage = totalResponses > 0 ? Math.round((count / totalResponses) * 100 * 100) / 100 : 0
            row[answer] = { count, percentage }
          }
          row.total = totalResponses
          formattedData.push(row)
        }
        
        releasesData[month] = {
          month,
          directors,
          answers,
          data: formattedData,
          totalResponses: responses.length
        }
      }
    }
    
    res.json({
      question,
      releases: releasesData
    })
  } catch (error) {
    console.error('Error getting director analysis:', error)
    res.status(500).json({ error: 'Failed to get director analysis' })
  }
})

// PowerPoint export endpoint for all questions
app.post('/api/export-all-ppt', async (req, res) => {
  try {
    console.log('Starting export all PowerPoint...')
    const data = loadRetrospectiveData()
    
    const pptx = new PptxGenJS()
    
    // Set presentation properties
    pptx.author = 'Retrospective Analysis'
    pptx.company = 'Engineering Team'
    pptx.title = 'Complete Retrospective Analysis'
    
    // Get all available questions from the most recent file
    const months = Object.keys(data).sort()
    const mostRecentMonth = months[months.length - 1]
    const mostRecentData = data[mostRecentMonth]
    
    if (!mostRecentData || mostRecentData.length === 0) {
      return res.status(400).json({ error: 'No data available for export' })
    }
    
    const allQuestions = Object.keys(mostRecentData[0]).filter(key => 
      key !== 'Timestamp' && 
      key !== 'You are part of which of the following directors org' &&
      key !== "What's your primary role?" &&
      key !== 'Enter the Team/Scrum team that you are mostly associated with during the release. (Select Only One)'
    )
    
    console.log(`Found ${allQuestions.length} questions to process`)
    let slideNumber = 1
    
    // Process each question
    for (const question of allQuestions) {
      try {
        console.log(`Processing question ${slideNumber}: ${question.substring(0, 50)}...`)
        
        // Simple trend data - just count responses per month
        const trends = {}
        for (const month of months) {
          const monthData = data[month]
          if (monthData && monthData.length > 0) {
            const questionColumn = Object.keys(monthData[0]).find(col => col === question)
            if (questionColumn) {
              const answers = monthData.map(row => row[questionColumn]).filter(answer => answer && answer !== '')
              if (answers.length > 0) {
                const answerCounts = {}
                answers.forEach(answer => {
                  answerCounts[answer] = (answerCounts[answer] || 0) + 1
                })
                
                trends[month] = {}
                Object.entries(answerCounts).forEach(([answer, count]) => {
                  trends[month][answer] = Math.round((count / answers.length) * 100 * 100) / 100
                })
              }
            }
          }
        }
        
        // Slide 1: Trend Analysis
        const slide1 = pptx.addSlide()
        slide1.addText(`Question ${slideNumber}: Trend Analysis`, {
          x: 1, y: 0.5, w: 8, h: 0.8,
          fontSize: 20, bold: true, color: '363636'
        })
        
        slide1.addText(question, {
          x: 1, y: 1.3, w: 8, h: 0.8,
          fontSize: 12, color: '666666', wrap: true
        })
        
        // Add trend data as text (charts disabled due to stability issues)
        if (Object.keys(trends).length > 0) {
          let trendText = ''
          Object.keys(trends).sort().forEach(month => {
            trendText += `${month}:\n`
            const monthData = trends[month]
            if (monthData && typeof monthData === 'object') {
              Object.entries(monthData).forEach(([answer, percentage]) => {
                // Truncate very long answers to prevent display issues
                const truncatedAnswer = answer.length > 100 ? answer.substring(0, 100) + '...' : answer
                trendText += `  ${truncatedAnswer}: ${percentage}%\n`
              })
            }
            trendText += '\n'
          })
          
          slide1.addText(trendText, {
            x: 1, y: 2.2, w: 8, h: 3,
            fontSize: 9, color: '333333'
          })
        } else {
          slide1.addText('No trend data available for this question', {
            x: 1, y: 2.2, w: 8, h: 1,
            fontSize: 12, color: '999999', align: 'center'
          })
        }
        
        // Slide 2: Director Analysis
        const slide2 = pptx.addSlide()
        slide2.addText(`Question ${slideNumber}: Director Analysis by Release`, {
          x: 1, y: 0.5, w: 8, h: 0.8,
          fontSize: 20, bold: true, color: '363636'
        })
        
        slide2.addText(question, {
          x: 1, y: 1.3, w: 8, h: 0.8,
          fontSize: 12, color: '666666', wrap: true
        })
        
        // Simple director analysis for last 3 months
        let directorText = ''
        const last3Months = months.slice(-3)
        
        for (const month of last3Months) {
          const monthData = data[month]
          if (monthData && monthData.length > 0) {
            const directorColumn = Object.keys(monthData[0]).find(col =>
              col === 'You are part of which of the following directors org'
            )
            const questionColumn = Object.keys(monthData[0]).find(col => col === question)
            
            if (directorColumn && questionColumn) {
              directorText += `${month}:\n`
              directorText += 'Director\tAnswer\tCount\n'
              
              const directorData = {}
              monthData.forEach(row => {
                const director = row[directorColumn]
                const answer = row[questionColumn]
                if (director && director !== '' && answer && answer !== '') {
                  const key = `${director}-${answer}`
                  directorData[key] = (directorData[key] || 0) + 1
                }
              })
              
              Object.entries(directorData).forEach(([key, count]) => {
                const [director, answer] = key.split('-')
                directorText += `${director}\t${answer}\t${count}\n`
              })
              directorText += '\n'
            }
          }
        }
        
        if (directorText) {
          slide2.addText(directorText, {
            x: 1, y: 2.2, w: 8, h: 4,
            fontSize: 8, color: '333333', fontFace: 'Courier New'
          })
        } else {
          slide2.addText('No director data available for this question', {
            x: 1, y: 2.2, w: 8, h: 1,
            fontSize: 12, color: '999999', align: 'center'
          })
        }
        
        slideNumber++
        
      } catch (error) {
        console.error(`Error processing question "${question}":`, error)
        // Continue with next question
      }
    }
    
    console.log(`Export completed. Generated ${slideNumber - 1} questions with ${(slideNumber - 1) * 2} slides total`)
    
    // Generate the file with enhanced error handling
    try {
      console.log('Starting PowerPoint file generation...')
      const filename = `Complete_Retrospective_Analysis_${new Date().toISOString().split('T')[0]}.pptx`
      
      console.log('Writing PowerPoint to buffer...')
      const buffer = await pptx.write('nodebuffer')
      console.log(`PowerPoint buffer created successfully. Size: ${buffer.length} bytes`)
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(buffer)
      console.log('PowerPoint file sent successfully')
    } catch (writeError) {
      console.error('Error writing PowerPoint file:', writeError)
      throw writeError
    }
    
  } catch (error) {
    console.error('Error exporting complete PowerPoint:', error)
    res.status(500).json({ error: 'Failed to export complete PowerPoint' })
  }
})

// PowerPoint export endpoint for single question
app.post('/api/export-ppt', async (req, res) => {
  try {
    const { question, trends, directorAnalysis } = req.body
    
    if (!question || !trends || !directorAnalysis) {
      return res.status(400).json({ error: 'Missing required data for export' })
    }
    
    const pptx = new PptxGenJS()
    
    // Set presentation properties
    pptx.author = 'Retrospective Analysis'
    pptx.company = 'Engineering Team'
    pptx.title = `Analysis: ${question}`
    
    // Slide 1: Trend Analysis Chart
    const slide1 = pptx.addSlide()
    slide1.addText('Trend Analysis', {
      x: 1, y: 0.5, w: 8, h: 0.8,
      fontSize: 24, bold: true, color: '363636'
    })
    
    slide1.addText(question, {
      x: 1, y: 1.3, w: 8, h: 0.6,
      fontSize: 14, color: '666666', wrap: true
    })
    
        // Add trend data as text (charts disabled due to stability issues)
        if (Object.keys(trends.trends).length > 0) {
          let trendText = ''
          const months = Object.keys(trends.trends).sort()
          
          months.forEach(month => {
            trendText += `${month}:\n`
            const monthData = trends.trends[month]
            if (monthData && typeof monthData === 'object' && Object.keys(monthData).length > 0) {
              Object.entries(monthData).forEach(([answer, percentage]) => {
                // Truncate very long answers to prevent display issues
                const truncatedAnswer = answer.length > 100 ? answer.substring(0, 100) + '...' : answer
                trendText += `  ${truncatedAnswer}: ${percentage}%\n`
              })
            } else {
              trendText += `  No data available\n`
            }
            trendText += '\n'
          })
          
          slide1.addText(trendText, {
            x: 1, y: 2.2, w: 8, h: 3,
            fontSize: 10, color: '333333'
          })
        } else {
          slide1.addText('No trend data available for this question', {
            x: 1, y: 2.2, w: 8, h: 1,
            fontSize: 12, color: '999999', align: 'center'
          })
        }
    
    // Slide 2: Director Analysis Tables
    const slide2 = pptx.addSlide()
    slide2.addText('Director Analysis by Release', {
      x: 1, y: 0.5, w: 8, h: 0.8,
      fontSize: 24, bold: true, color: '363636'
    })
    
    slide2.addText(question, {
      x: 1, y: 1.3, w: 8, h: 0.6,
      fontSize: 14, color: '666666', wrap: true
    })
    
    // Add director analysis data
    let directorText = ''
    Object.entries(directorAnalysis.releases).forEach(([month, releaseData]) => {
      directorText += `${month}:\n`
      directorText += 'Director\t'
      
      // Add answer headers
      releaseData.answers.forEach((answer) => {
        directorText += `${answer}\t`
      })
      directorText += 'Total\n'
      
      // Add data rows
      releaseData.data.forEach((row) => {
        directorText += `${row.director}\t`
        releaseData.answers.forEach((answer) => {
          const answerData = row[answer]
          if (answerData) {
            directorText += `${answerData.percentage}% (${answerData.count})\t`
          } else {
            directorText += '0% (0)\t'
          }
        })
        directorText += `${row.total}\n`
      })
      directorText += '\n'
    })
    
    slide2.addText(directorText, {
      x: 1, y: 2.2, w: 8, h: 4,
      fontSize: 9, color: '333333', fontFace: 'Courier New'
    })
    
    // Generate the file
    const filename = `Retrospective_Analysis_${question.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.pptx`
    const buffer = await pptx.write('nodebuffer')
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
    
  } catch (error) {
    console.error('Error exporting PowerPoint:', error)
    res.status(500).json({ error: 'Failed to export PowerPoint' })
  }
})

// File upload endpoint (for future use)
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({ 
      message: 'File uploaded successfully',
      filename: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});



// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Retrospective Analyzer Server running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
}); 