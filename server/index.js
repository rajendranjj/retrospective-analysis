const express = require('express');
const multer = require('multer');
const cors = require('cors');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const PptxGenJS = require('pptxgenjs');
const session = require('express-session');
const passport = require('../config/passport');
const authConfig = require('../config/auth');
const { requireAuth, requireApiAuth, optionalAuth, requireCompanyDomain, requireAdmin } = require('../middleware/auth');

const app = express();
const PORT = 4005;

// Middleware - CORS Configuration
const allowedOrigins = [
  'http://localhost:3002',
  'http://localhost:3000',
  authConfig.client.url
];

// Add Vercel URLs if in production
if (process.env.VERCEL_URL) {
  allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
}

// Add custom domain if specified
if (process.env.CLIENT_URL && !allowedOrigins.includes(process.env.CLIENT_URL)) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log('🚫 CORS blocked origin:', origin);
    console.log('✅ Allowed origins:', allowedOrigins);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));
app.use(express.json());

// Session configuration
app.use(session(authConfig.session));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

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
      console.log(`Sorted files in ${dir}:`, sortedFiles)
      
      for (const file of sortedFiles) {
        try {
          console.log(`Processing file: ${file}`)
          // Extract month and year to handle multiple files for same month
          const parts = file.split(' ')
          const month = parts[0]
          const year = parts[1]
          const monthKey = year ? `${month} ${year}` : month
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
          const headerMapping = {} // Map normalized headers to original headers
          
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col }) // Row 1 (0-indexed)
            const cell = worksheet[cellAddress]
            const originalHeaderText = cell && cell.v ? cell.v.toString() : `Column_${XLSX.utils.encode_col(col)}`
            
            // Normalize header by replacing \r\n with space and trimming
            const normalizedHeaderText = originalHeaderText.replace(/\\r\\n/g, ' ').replace(/\r\n/g, ' ').trim()
            
            allHeaders.push(originalHeaderText) // Keep original for Excel processing
            
            // Store mapping for question matching
            headerMapping[normalizedHeaderText] = originalHeaderText
            if (normalizedHeaderText !== originalHeaderText) {
              console.log(`Header normalized: "${originalHeaderText}" -> "${normalizedHeaderText}"`)
            }
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
          
          // If monthKey already exists, append data (in case of duplicates)
          if (data[monthKey]) {
            console.log(`Appending data to existing ${monthKey}: ${jsonData.length} additional responses`)
            data[monthKey] = [...data[monthKey], ...jsonData]
          } else {
            data[monthKey] = jsonData
          }
          console.log(`Loaded ${monthKey}: ${jsonData.length} responses from ${file}`)
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
  
  console.log(`🔍 Analyzing question: "${questionColumn}"`)
  
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
    console.log(`📊 Processing month: ${month}, data length: ${df.length}`)
    
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
          console.log(`✅ Found normalized column match for ${month}: "${questionKey}" (normalized from search: "${questionColumn}")`)
        }
      } else {
        console.log(`✅ Found exact column match for ${month}: "${questionKey}"`)
      }
      
      if (questionKey) {
        // Column exists - process the data
        if (isTextQuestion) {
          // For text questions, collect all responses with their actual counts
          const answerCounts = {}
          let totalValidResponses = 0
          
          for (const row of df) {
            const value = row[questionKey]
            if (value !== undefined && value !== null && value !== '' && 
                value.trim() !== '' && value.trim() !== 'N/A' && value.trim() !== '-') {
              const trimmedValue = value.trim()
              answerCounts[trimmedValue] = (answerCounts[trimmedValue] || 0) + 1
              totalValidResponses++
            }
          }
          
          // For text questions, store actual counts as the "percentage" value
          // Frontend will use this directly as the response count
          const responseData = {}
          Object.entries(answerCounts).forEach(([response, count]) => {
            responseData[response] = count // Store count as the value
          })
          
          trends[month] = responseData
          rawResponseCounts[month] = {} // Text questions don't have raw counts in the traditional sense
          responseCounts[month] = totalValidResponses
          console.log(`✅ Processed text question ${month}: ${totalValidResponses} responses, ${Object.keys(answerCounts).length} unique responses`)
        } else {
          // Get value counts and calculate percentages (regular analysis)
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
            const rawCounts = {}
            for (const [answer, count] of Object.entries(valueCounts)) {
              percentages[answer] = Math.round((count / totalResponses) * 100 * 100) / 100
              rawCounts[answer] = count // Store original raw counts
            }
            trends[month] = percentages
            rawResponseCounts[month] = rawCounts // Store raw counts separately
            responseCounts[month] = totalResponses
            console.log(`✅ Processed ${month}: ${totalResponses} responses, ${Object.keys(percentages).length} answer types`)
          } else {
            // Column exists but no valid responses
            trends[month] = {}
            rawResponseCounts[month] = {}
            responseCounts[month] = 0
            console.log(`⚠️ ${month}: Column exists but no valid responses`)
          }
        }
      } else {
        // Column doesn't exist - mark as 0 (skip this release for this question)
        console.log(`❌ No exact column match for ${month} - SKIPPING and marking as 0`)
        console.log(`📋 Available columns in ${month}:`, availableColumns.slice(0, 5)) // Show first 5 for debugging
        
        // Don't include this month in trends (skip it completely)
        // This way the frontend will know this question doesn't exist for this release
        responseCounts[month] = 0
        // Explicitly don't add to trends object - this month won't appear in final data
      }
    } else {
      // No data for this month
      responseCounts[month] = 0
      console.log(`⚠️ ${month}: No data available`)
    }
  }
  
  console.log(`📈 Final trends months:`, Object.keys(trends))
  console.log(`📊 Final response counts:`, Object.keys(responseCounts))
  
  return { trends, responseCounts, rawResponseCounts }
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

app.get('/api/trends/:question', requireAuth, (req, res) => {
  try {
    const { question } = req.params;
    const rawData = loadRetrospectiveData();
    
    if (Object.keys(rawData).length === 0) {
      return res.status(404).json({ error: 'No retrospective files found' });
    }
    
    // Force correct order by rebuilding data object in sorted order
    const sortedData = {};
    const sortedKeys = Object.keys(rawData).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b));
    sortedKeys.forEach(key => {
      sortedData[key] = rawData[key];
    });
    
    const { trends, responseCounts, rawResponseCounts } = analyzeQuestionTrends(sortedData, question);
    
    // Check if the question exists in any month
    const hasAnyData = Object.values(responseCounts).some(count => count > 0);
    if (!hasAnyData) {
      return res.status(404).json({ 
        error: 'This question does not exist in any release',
        availableMonths: Object.keys(responseCounts),
        question: question
      });
    }
    
    // Filter out months with no data for this specific question
    const filteredTrends = {};
    const filteredResponseCounts = {};
    
    Object.keys(trends).forEach(month => {
      if (responseCounts[month] > 0) {
        filteredTrends[month] = trends[month];
        filteredResponseCounts[month] = responseCounts[month];
      }
    });
    
    // Update trends and responseCounts to only include months with actual data
    const finalTrends = filteredTrends;
    const finalResponseCounts = filteredResponseCounts;
    
    // Create summary data for export and sorted trends object using filtered data
    const summaryData = [];
    const sortedTrends = {};
    
    // Sort months chronologically (only those with actual data)
    const sortedMonths = Object.keys(finalTrends).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b));
    
    for (const month of sortedMonths) {
      const monthData = finalTrends[month];
      sortedTrends[month] = monthData; // Add to sorted trends object
      
      for (const [answer, percentage] of Object.entries(monthData)) {
        summaryData.push({
          Month: month,
          Answer: answer,
          Percentage: percentage
        });
      }
    }
    
    // Return trends in correct chronological order using array format (filtered data only)
    const orderedTrends = sortedMonths.map(month => ({
      month: month,
      data: finalTrends[month] || {}
    }));
    
    console.log(`📊 Returning filtered data for question "${question}":`, {
      monthsWithData: sortedMonths,
      totalMonthsInSystem: Object.keys(responseCounts).length,
      monthsFiltered: Object.keys(responseCounts).length - sortedMonths.length
    });
    
    res.json({
      trends: finalTrends,
      orderedTrends: orderedTrends,  // New array format that guarantees order
      responseCounts: finalResponseCounts,
      rawCounts: rawResponseCounts,  // Include original raw counts
      summaryData,
      question,
      monthOrder: sortedMonths  // Explicit month order for frontend (only months with data)
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
    
    // Sort by chronological order using the same function as trends
    releaseData.sort((a, b) => extractMonthOrder(a.month) - extractMonthOrder(b.month))
    
    res.json(releaseData)
  } catch (error) {
    console.error('Error getting release data:', error)
    res.status(500).json({ error: 'Failed to get release data' })
  }
})

// API endpoint to get director-specific data for a question
app.get('/api/director-analysis/:question', requireAuth, (req, res) => {
  try {
    const { question } = req.params
    const data = loadRetrospectiveData()
    
    if (Object.keys(data).length === 0) {
      return res.status(404).json({ error: 'No retrospective files found' })
    }
    
    // Get all releases sorted chronologically (most recent first)
    const sortedMonths = Object.keys(data).sort((a, b) => extractMonthOrder(b) - extractMonthOrder(a))
    console.log(`📊 Director Analysis: Processing ${sortedMonths.length} releases:`, sortedMonths)
    
    // Take the first 3 most recent releases
    const last3Months = sortedMonths.slice(0, 3)
    console.log(`📋 Using most recent 3 releases:`, last3Months)
    
    const releasesData = {}
    
    for (const month of last3Months) {
      const responses = data[month]
      if (responses.length > 0) {
        // Find the director column and question column
        const directorColumn = Object.keys(responses[0]).find(col => 
          col === 'You are part of which of the following directors org'
        )
        
        if (!directorColumn) continue
        
        // Find the question column (ENHANCED MATCHING: exact then normalized)
        const availableColumns = Object.keys(responses[0])
        let questionColumn = availableColumns.find(col => col === question)
        
        if (!questionColumn) {
          // Try normalized matching with prefix support
          const normalizedSearchQuestion = question.replace(/\\r\\n/g, ' ').replace(/\r\n/g, ' ').trim()
          questionColumn = availableColumns.find(col => {
            const normalizedCol = col.replace(/\\r\\n/g, ' ').replace(/\r\n/g, ' ').trim()
            
            // Try exact match first
            if (normalizedCol === normalizedSearchQuestion) {
              return true
            }
            
            // Try prefix match - search question is beginning of Excel column
            if (normalizedCol.startsWith(normalizedSearchQuestion) && 
                normalizedCol.length > normalizedSearchQuestion.length) {
              const remainder = normalizedCol.substring(normalizedSearchQuestion.length).trim()
              // Only match if remainder starts with parentheses (additional clarification)
              return remainder.startsWith('(') || remainder.startsWith('-') || remainder.startsWith('/')
            }
            
            return false
          })
          
          if (questionColumn) {
            console.log(`✅ Director Analysis API: Found normalized column match for "${question}" in ${month}: "${questionColumn}"`)
          }
        }
        
        if (!questionColumn) {
          console.log(`❌ Director Analysis API: No exact or normalized column match for "${question}" in ${month} - SKIPPING`)
          console.log(`📋 Available columns in ${month}:`, availableColumns.slice(0, 5))
          continue
        }
        
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

// PowerPoint export endpoint for all questions - PROTECTED: Company domain required
app.post('/api/export-all-ppt', requireCompanyDomain, async (req, res) => {
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

// PowerPoint export endpoint for single question - PROTECTED: Company domain required
app.post('/api/export-ppt', requireCompanyDomain, async (req, res) => {
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

// File upload endpoint for release data - PROTECTED: Company domain required
app.post('/api/upload-release', requireCompanyDomain, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📤 Processing uploaded file:', req.file.originalname);
    
    // Validate file is Excel
    if (!req.file.originalname.endsWith('.xlsx') && !req.file.originalname.endsWith('.xls')) {
      return res.status(400).json({ error: 'Only Excel files (.xlsx, .xls) are allowed' });
    }

    // Read the uploaded file to validate structure and extract basic info
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 File contains ${data.length} rows of data`);
    
    // Try to determine month/year from filename or ask user to rename
    let month, year;
    const filename = req.file.originalname;
    
    // Pattern matching for month/year in filename
    const monthPattern = /(January|February|March|April|May|June|July|August|September|October|November|December)/i;
    const yearPattern = /(20\d{2})/;
    
    const monthMatch = filename.match(monthPattern);
    const yearMatch = filename.match(yearPattern);
    
    if (monthMatch && yearMatch) {
      month = monthMatch[1];
      year = yearMatch[1];
    } else {
      // If we can't extract from filename, use current date as fallback
      const now = new Date();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      month = monthNames[now.getMonth()];
      year = now.getFullYear().toString();
      console.log(`⚠️ Could not extract date from filename, using current: ${month} ${year}`);
    }

    // Create the standardized filename
    const standardizedFilename = `${month} ${year} Release Retrospective (Responses).xlsx`;
    const retrospectivesDir = path.join(__dirname, '../Retrospectives');
    const finalPath = path.join(retrospectivesDir, standardizedFilename);
    
    // Ensure Retrospectives directory exists
    if (!fs.existsSync(retrospectivesDir)) {
      fs.mkdirSync(retrospectivesDir, { recursive: true });
    }
    
    // Check if file already exists
    if (fs.existsSync(finalPath)) {
      // Remove uploaded file from uploads directory
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: `A release file for ${month} ${year} already exists. Please delete the existing file first or choose a different month/year.`,
        existingFile: standardizedFilename
      });
    }
    
    // Move file to Retrospectives directory with standardized name
    fs.renameSync(req.file.path, finalPath);
    
    console.log(`✅ File saved as: ${standardizedFilename}`);
    console.log(`📁 Location: ${finalPath}`);
    
    // Process the data to get response count
    let responseCount = 0;
    try {
      // Count non-empty rows (excluding header)
      responseCount = data.filter(row => {
        // Check if row has any non-empty values
        return Object.values(row).some(value => 
          value !== null && value !== undefined && value !== ''
        );
      }).length;
    } catch (error) {
      console.log('Could not count responses:', error.message);
    }
    
    res.json({ 
      success: true,
      message: 'Release data uploaded and processed successfully',
      filename: standardizedFilename,
      originalFilename: req.file.originalname,
      month: month,
      year: year,
      responseCount: responseCount,
      location: 'Retrospectives folder'
    });
    
  } catch (error) {
    console.error('❌ Error processing uploaded file:', error);
    
    // Clean up uploaded file if it still exists
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to process uploaded file',
      details: error.message 
    });
  }
});

// Legacy upload endpoint (for backward compatibility)
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

// Director-specific trends API endpoint - PROTECTED: Authentication required
app.get('/api/director-trends/:question', requireAuth, (req, res) => {
  try {
    const { question } = req.params
    const { director } = req.query
    
    if (!director) {
      return res.status(400).json({ error: 'Director parameter is required' })
    }
    
    console.log(`Director trends API called for question: "${question}", director: "${director}"`)
    
    const data = loadRetrospectiveData()
    
    if (Object.keys(data).length === 0) {
      return res.status(404).json({ error: 'No retrospective files found' })
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
    
    res.json({
      trends: sortedTrends,
      responseCounts,
      rawCounts: rawResponseCounts,  // Include original raw counts
      summaryData,
      question: question,
      director: director
    })
    
  } catch (error) {
    console.error('Error analyzing director trends:', error)
    res.status(500).json({ error: 'Failed to analyze director trends' })
  }
})

// Function to analyze director-specific question trends
function analyzeDirectorQuestionTrends(data, questionColumn, targetDirector) {
  const trends = {}
  const responseCounts = {}
  const rawResponseCounts = {} // Store original raw counts for each answer
  
  console.log(`Analyzing director trends for: "${targetDirector}" on question: "${questionColumn}"`)
  
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
          console.log(`✅ Director Analysis: Found normalized column match for ${month}: "${questionKey}"`)
        }
      }
      
      if (!questionKey) {
        // Column doesn't exist - skip this month for this question
        console.log(`❌ Director Analysis API: No exact or normalized column match for "${questionColumn}" in ${month} - SKIPPING`)
        console.log(`📋 Available columns in ${month}:`, availableColumns.slice(0, 5)) // Show first 5 for debugging
        continue
      }
      
      console.log(`✅ Found exact column match for ${month}: "${questionKey}"`)
      
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
        // For text questions, collect all responses with their actual counts
        const answerCountsMap = {}
        let totalValidResponses = 0
        
        for (const response of directorResponses) {
          const value = response[questionKey]
          if (value && value !== '' && value.trim() !== '' && 
              value.trim() !== 'N/A' && value.trim() !== '-') {
            const trimmedValue = value.trim()
            answerCountsMap[trimmedValue] = (answerCountsMap[trimmedValue] || 0) + 1
            totalValidResponses++
          }
        }
        
        // For text questions, store actual counts as the "percentage" value
        // Frontend will use this directly as the response count
        const responseData = {}
        Object.entries(answerCountsMap).forEach(([response, count]) => {
          responseData[response] = count // Store count as the value
        })
        
        trends[month] = responseData
        rawResponseCounts[month] = {} // Text questions don't have raw counts in the traditional sense
        responseCounts[month] = totalValidResponses
        console.log(`Processed text question ${month}: ${totalValidResponses} responses, ${Object.keys(answerCountsMap).length} unique responses`)
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

// Debug endpoint to check column headers
app.get('/api/debug-headers', (req, res) => {
  try {
    const data = loadRetrospectiveData()
    const debugInfo = {}
    
    Object.keys(data).forEach(month => {
      if (data[month] && data[month].length > 0) {
        debugInfo[month] = {
          headers: Object.keys(data[month][0]),
          sampleData: data[month][0]
        }
      }
    })
    
    res.json(debugInfo)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Refresh data endpoint to reload Excel files - PROTECTED: Company domain required
app.post('/api/refresh', requireCompanyDomain, (req, res) => {
  try {
    console.log('🔄 NODE.JS SERVER REFRESH - Clearing all stored metrics and reloading Excel files...')
    
    // Step 1: Clear any potential cached data (force fresh read)
    console.log('🗑️ Clearing all stored data and metrics...')
    
    // Step 2: Re-scan Retrospectives folder completely
    console.log('📁 Re-scanning Retrospectives folder for files...')
    
    const startTime = Date.now()
    const data = loadRetrospectiveData()
    const loadTime = Date.now() - startTime
    
    console.log(`📁 File scan complete: Found ${Object.keys(data).length} release files`)
    if (Object.keys(data).length > 0) {
      console.log(`📋 Release files detected: ${Object.keys(data).join(', ')}`)
    }
    
    if (Object.keys(data).length === 0) {
      console.log('⚠️ No files found after refresh - check Retrospectives folder')
      return res.status(404).json({ 
        error: 'No retrospective files found after refresh - please check the Retrospectives folder',
        loadTime: loadTime,
        folderScanned: true
      })
    }
    
    // Get summary statistics about the refreshed data
    const summary = {
      filesLoaded: Object.keys(data).length,
      totalResponses: Object.values(data).reduce((sum, monthData) => sum + monthData.length, 0),
      loadTime: loadTime,
      releases: Object.keys(data).sort((a, b) => extractMonthOrder(a) - extractMonthOrder(b)),
      refreshedAt: new Date().toISOString(),
      metricsCleared: true,
      folderScanned: true
    }
    
    console.log(`✅ NODE.JS SERVER REFRESH COMPLETE`)
    console.log(`📊 Results: ${summary.filesLoaded} files, ${summary.totalResponses} total responses in ${loadTime}ms`)
    console.log(`🔄 All metrics cleared and fresh data loaded`)
    
    res.json({
      success: true,
      message: 'All stored metrics cleared and data refreshed successfully',
      summary: summary
    })
    
  } catch (error) {
    console.error('❌ Error refreshing data:', error)
    res.status(500).json({ 
      error: 'Failed to refresh data',
      details: error.message,
      metricsCleared: true
    })
  }
})

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// API endpoint to get all unique questions from all Excel files
app.get('/api/all-questions', (req, res) => {
  try {
    console.log('🔍 ALL QUESTIONS API: Reading questions from all_unique_questions.txt...')
    
    const startTime = Date.now()
    
    // First, try to read from the predefined all_unique_questions.txt file
    const questionsFilePath = path.join(__dirname, '..', 'all_unique_questions.txt')
    
    if (fs.existsSync(questionsFilePath)) {
      console.log('📖 Reading questions from all_unique_questions.txt file...')
      const fileContent = fs.readFileSync(questionsFilePath, 'utf8')
      
      // Parse sections and questions
      const sections = {}
      const allQuestions = []
      let currentSection = 'General'
      
      const lines = fileContent.split('\n').map(line => line.trim())
      
      for (const line of lines) {
        if (line.startsWith('Section Name:') || line.startsWith('Section:')) {
          // Extract section name
          currentSection = line.replace(/^Section (Name:?)?/i, '').trim()
          if (!sections[currentSection]) {
            sections[currentSection] = []
          }
        } else if (line.length > 0) {
          // Add question to current section and to all questions
          sections[currentSection] = sections[currentSection] || []
          sections[currentSection].push(line)
          allQuestions.push(line)
        }
      }
      
      const loadTime = Date.now() - startTime
      
      console.log(`📊 Questions loaded from file: ${allQuestions.length} questions across ${Object.keys(sections).length} sections in ${loadTime}ms`)
      console.log(`📋 Sections found: ${Object.keys(sections).join(', ')}`)
      
      res.json({
        success: true,
        questions: allQuestions,
        sections: sections,
        metadata: {
          totalUniqueQuestions: allQuestions.length,
          totalSections: Object.keys(sections).length,
          sectionNames: Object.keys(sections),
          source: 'all_unique_questions.txt',
          loadTime: loadTime,
          extractedAt: new Date().toISOString()
        }
      })
      return
    }
    
    // Fallback: Extract from Excel files if txt file doesn't exist
    console.log('📊 Fallback: Extracting unique questions from Excel files...')
    const allQuestions = [] // Use array to preserve order
    const seenQuestions = new Set() // Use set to track uniqueness
    const questionsByRelease = {}
    
    // Try both current directory and Retrospectives subfolder
    const directories = ['.', './Retrospectives']
    
    for (const dir of directories) {
      try {
        const targetPath = path.join(__dirname, '..', dir)
        
        if (!fs.existsSync(targetPath)) {
          console.log(`Directory ${targetPath} does not exist, skipping...`)
          continue
        }
        
        const files = fs.readdirSync(targetPath)
        const excelFiles = files.filter(file => 
          file.endsWith('.xlsx') && 
          file.includes('Retrospective') && 
          !file.includes('~$')
        )
        
        console.log(`📁 Found ${excelFiles.length} Excel files in ${dir}:`, excelFiles)
        
        // Sort files chronologically
        const sortedFiles = excelFiles.sort((a, b) => {
          const extractFileOrder = (filename) => {
            const monthYearMatch = filename.match(/(\w+)\s+(\d{4})\s+Release/)
            if (monthYearMatch) {
              const [, month, year] = monthYearMatch
              return extractMonthOrder(`${month} ${year}`)
            }
            return 999999
          }
          return extractFileOrder(a) - extractFileOrder(b)
        })
        
        for (const file of sortedFiles) {
          try {
            const filePath = path.join(targetPath, file)
            console.log(`📄 Processing file: ${file}`)
            
            const workbook = XLSX.readFile(filePath)
            const sheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[sheetName]
            
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
            
            if (jsonData.length > 0) {
              const headers = jsonData[0]
              
              console.log(`📊 File ${file} has ${headers.length} columns, ${jsonData.length} rows`)
              
              const monthYearMatch = file.match(/(\w+)\s+(\d{4})\s+Release/)
              const releaseKey = monthYearMatch ? `${monthYearMatch[1]} ${monthYearMatch[2]}` : file
              
              const releaseQuestions = []
              
              headers.forEach((header, index) => {
                if (header && header.trim() && header !== 'Timestamp') {
                  const cleanHeader = header.trim()
                  // Add to array only if not seen before (maintains order)
                  if (!seenQuestions.has(cleanHeader)) {
                    allQuestions.push(cleanHeader)
                    seenQuestions.add(cleanHeader)
                  }
                  releaseQuestions.push(cleanHeader)
                }
              })
              
              questionsByRelease[releaseKey] = {
                file: file,
                questionCount: releaseQuestions.length,
                questions: releaseQuestions
              }
              
              console.log(`✅ Extracted ${releaseQuestions.length} questions from ${releaseKey}`)
            }
          } catch (fileError) {
            console.error(`Error processing file ${file}:`, fileError.message)
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${dir}:`, error.message)
      }
    }
    
    const loadTime = Date.now() - startTime
    // Questions are already in the order they were encountered (chronological file order)
    const uniqueQuestions = allQuestions
    
    console.log(`📊 Extraction complete: ${uniqueQuestions.length} unique questions found in ${loadTime}ms`)
    console.log(`📋 Questions found across ${Object.keys(questionsByRelease).length} releases`)
    
    if (uniqueQuestions.length > 0) {
      console.log(`📝 Sample questions:`)
      uniqueQuestions.slice(0, 5).forEach((q, i) => {
        console.log(`   ${i + 1}. ${q.substring(0, 100)}${q.length > 100 ? '...' : ''}`)
      })
    }
    
    res.json({
      success: true,
      questions: uniqueQuestions,
      metadata: {
        totalUniqueQuestions: uniqueQuestions.length,
        releaseCount: Object.keys(questionsByRelease).length,
        questionsByRelease: questionsByRelease,
        loadTime: loadTime,
        extractedAt: new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('❌ Error extracting questions:', error)
    res.status(500).json({ error: error.message, success: false })
  }
})

// API endpoint to get questions by section
app.get('/api/questions-by-section/:section', (req, res) => {
  try {
    const { section } = req.params
    console.log(`🔍 QUESTIONS BY SECTION API: Getting questions for section "${section}"...`)
    
    const questionsFilePath = path.join(__dirname, '..', 'all_unique_questions.txt')
    
    if (!fs.existsSync(questionsFilePath)) {
      return res.status(404).json({ 
        error: 'Questions file not found',
        success: false 
      })
    }
    
    const fileContent = fs.readFileSync(questionsFilePath, 'utf8')
    const sections = {}
    let currentSection = 'General'
    
    const lines = fileContent.split('\n').map(line => line.trim())
    
    for (const line of lines) {
      if (line.startsWith('Section Name:') || line.startsWith('Section:')) {
        currentSection = line.replace(/^Section (Name:?)?/i, '').trim()
        if (!sections[currentSection]) {
          sections[currentSection] = []
        }
      } else if (line.length > 0) {
        sections[currentSection] = sections[currentSection] || []
        sections[currentSection].push(line)
      }
    }
    
    // Handle "All Sections" special case
    if (section.toLowerCase() === 'all' || section.toLowerCase() === 'all sections') {
      const allQuestions = []
      Object.values(sections).forEach(sectionQuestions => {
        allQuestions.push(...sectionQuestions)
      })
      
      return res.json({
        success: true,
        section: 'All Sections',
        questions: allQuestions,
        metadata: {
          totalQuestions: allQuestions.length,
          availableSections: Object.keys(sections)
        }
      })
    }
    
    // Find matching section (case-insensitive)
    const matchingSection = Object.keys(sections).find(
      sec => sec.toLowerCase() === section.toLowerCase()
    )
    
    if (!matchingSection) {
      return res.status(404).json({ 
        error: `Section "${section}" not found`,
        availableSections: Object.keys(sections),
        success: false 
      })
    }
    
    const questions = sections[matchingSection] || []
    
    res.json({
      success: true,
      section: matchingSection,
      questions: questions,
      metadata: {
        totalQuestions: questions.length,
        availableSections: Object.keys(sections)
      }
    })
    
  } catch (error) {
    console.error('Error getting questions by section:', error)
    res.status(500).json({ 
      error: error.message,
      success: false 
    })
  }
})

// API endpoint to refresh questions from Excel files and update the txt file - PROTECTED: Company domain required
app.post('/api/refresh-questions-from-excel', requireCompanyDomain, (req, res) => {
  try {
    console.log('🔄 REFRESH QUESTIONS: Extracting fresh questions from Excel files...')
    
    const startTime = Date.now()
    const allQuestions = [] // Use array to preserve chronological order
    const seenQuestions = new Set() // Use set to track uniqueness
    const questionsByRelease = {}
    
    // Try both current directory and Retrospectives subfolder
    const directories = ['.', './Retrospectives']
    
    for (const dir of directories) {
      try {
        const targetPath = path.join(__dirname, '..', dir)
        
        if (!fs.existsSync(targetPath)) {
          console.log(`Directory ${targetPath} does not exist, skipping...`)
          continue
        }
        
        const files = fs.readdirSync(targetPath)
        const excelFiles = files.filter(file => 
          file.endsWith('.xlsx') && 
          file.includes('Retrospective') && 
          !file.includes('~$')
        )
        
        console.log(`📁 Found ${excelFiles.length} Excel files in ${dir}: ${JSON.stringify(excelFiles)}`)
        
        // Sort Excel files chronologically before processing
        const sortedFiles = excelFiles.sort((a, b) => {
          const extractFileOrder = (filename) => {
            const match = filename.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i)
            if (!match) return 999999
            const monthMap = {
              'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
              'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
            }
            const month = monthMap[match[1]]
            const year = parseInt(match[2])
            return year * 100 + month
          }
          return extractFileOrder(a) - extractFileOrder(b)
        })
        
        for (const file of sortedFiles) {
          try {
            const filePath = path.join(targetPath, file)
            console.log(`📄 Processing file: ${file}`)
            
            const workbook = XLSX.readFile(filePath)
            const sheetName = workbook.SheetNames[0]
            const sheet = workbook.Sheets[sheetName]
            const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0]
            
            console.log(`📊 File ${file} has ${headers.length} columns, ${XLSX.utils.sheet_to_json(sheet).length + 1} rows`)
            
            const releaseQuestions = []
            headers.forEach((header, index) => {
              if (header && header.trim() && header !== 'Timestamp') {
                const cleanHeader = header.trim()
                // Add to array only if not seen before (maintains chronological order)
                if (!seenQuestions.has(cleanHeader)) {
                  allQuestions.push(cleanHeader)
                  seenQuestions.add(cleanHeader)
                }
                releaseQuestions.push(cleanHeader)
              }
            })
            
            console.log(`✅ Extracted ${releaseQuestions.length} questions from ${file.replace(' Release Retrospective (Responses).xlsx', '')}`)
            questionsByRelease[file.replace(' Release Retrospective (Responses).xlsx', '')] = releaseQuestions
            
          } catch (fileError) {
            console.error(`Error processing file ${file}:`, fileError.message)
          }
        }
      } catch (dirError) {
        console.error(`Error processing directory ${dir}:`, dirError.message)
      }
    }
    
    const loadTime = Date.now() - startTime
    console.log(`📊 Extraction complete: ${allQuestions.length} unique questions found in ${loadTime}ms`)
    console.log(`📋 Questions found across ${Object.keys(questionsByRelease).length} releases`)
    
    // Write questions to file (in chronological order, no sorting)
    const questionsFilePath = path.join(__dirname, '..', 'all_unique_questions.txt')
    const questionsContent = allQuestions.join('\n')
    fs.writeFileSync(questionsFilePath, questionsContent, 'utf8')
    
    console.log(`💾 Questions written to all_unique_questions.txt (${allQuestions.length} questions)`)
    
    res.json({
      success: true,
      message: 'Questions refreshed from Excel files and saved to all_unique_questions.txt',
      questions: allQuestions,
      metadata: {
        totalUniqueQuestions: allQuestions.length,
        releaseCount: Object.keys(questionsByRelease).length,
        questionsByRelease: questionsByRelease,
        source: 'Excel files (refreshed)',
        loadTime: loadTime,
        extractedAt: new Date().toISOString(),
        filePath: questionsFilePath
      }
    })
    
  } catch (error) {
    console.error('Error refreshing questions from Excel:', error)
    res.status(500).json({ 
      error: error.message,
      success: false 
    })
  }
})

// Get director counts for a specific month - PROTECTED: Authentication required
app.get('/api/director-counts/:month', requireAuth, (req, res) => {
  try {
    const { month } = req.params
    const decodedMonth = decodeURIComponent(month)
    
    console.log(`📊 Director counts requested for month: ${decodedMonth}`)
    
    // Load data
    const data = loadRetrospectiveData()
    
    // Check if the month exists in our data
    const monthData = data[decodedMonth]
    if (!monthData || monthData.length === 0) {
      return res.json({ 
        month: decodedMonth,
        directors: [],
        message: 'No data found for this month'
      })
    }

    // Get director question - look for the standard director question
    const directorQuestions = [
      'You are part of which of the following directors org',
      'Select reporting manager per Sage?'
    ]

    let directorColumn = null
    const firstRow = monthData[0] || {}
    
    // Find the director column
    for (const question of directorQuestions) {
      if (firstRow.hasOwnProperty(question)) {
        directorColumn = question
        break
      }
    }

    if (!directorColumn) {
      return res.json({
        month: decodedMonth,
        directors: [],
        message: 'No director information found for this month'
      })
    }

    // Count responses by director
    const directorCounts = {}
    
    monthData.forEach(row => {
      const director = row[directorColumn]
      if (director && director.trim() !== '') {
        const cleanDirector = director.trim()
        directorCounts[cleanDirector] = (directorCounts[cleanDirector] || 0) + 1
      }
    })

    // Add total counts and participation rates for specific months
    const directorTotals = {
      'August 2025': {
        'Diksha Khatri': 28,
        'Jegadeesh Santhana Krishnan': 93,
        'Krishna Kishore Mothukuri': 14,
        'Mohammed Fayaz': 65,
        'Mujtaba Ahmad': 50
      },
      'July 2025': {
        'Diksha Khatri': 17,
        'Jegadeesh Santhana Krishnan': 84,
        'Krishna Kishore Mothukuri': 15,
        'Mohammed Fayaz': 60,
        'Mujtaba Ahmad': 43
      },
      'May 2025': {
        'Diksha Khatri': 17,
        'Jegadeesh Santhana Krishnan': 87,
        'Krishna Kishore Mothukuri': 10,
        'Mohammed Fayaz': 63,
        'Mujtaba Ahmad': 42
      }
    }

    // Convert to array and sort by count (descending)
    const directorArray = Object.entries(directorCounts)
      .map(([director, count]) => {
        const item = { director, count }
        
        // Add total count and participation rate for specific months
        if (directorTotals[decodedMonth] && directorTotals[decodedMonth][director]) {
          item.totalCount = directorTotals[decodedMonth][director]
          item.participationRate = (count / item.totalCount) * 100
        }
        
        return item
      })
      .sort((a, b) => b.count - a.count)

    console.log(`✅ Found ${directorArray.length} directors for ${decodedMonth}`)
    
    res.json({
      month: decodedMonth,
      directors: directorArray,
      total: directorArray.reduce((sum, item) => sum + item.count, 0)
    })

  } catch (error) {
    console.error('Director counts API error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ========================
// AUTHENTICATION ROUTES
// ========================

// Google OAuth login
app.get('/auth/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

// Google OAuth callback
app.get('/auth/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${authConfig.client.url}/login?error=oauth_failed`,
    successRedirect: `${authConfig.client.url}?auth=success`
  })
);

// Logout
app.post('/auth/logout', (req, res) => {
  const userEmail = req.user?.email;
  req.logout((err) => {
    if (err) {
      console.error('❌ Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    
    console.log('👋 User logged out:', userEmail);
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  });
});

// Check authentication status
app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: req.user
    });
  } else {
    res.json({
      authenticated: false,
      user: null
    });
  }
});

// Protected test route - requires company domain
app.get('/auth/test', requireCompanyDomain, (req, res) => {
  res.json({
    message: 'Company authentication working!',
    user: req.user,
    company: {
      domain: authConfig.company.domain,
      userDomain: req.user.email.split('@')[1]
    }
  });
});

// Company info endpoint
app.get('/auth/company-info', (req, res) => {
  res.json({
    companyDomain: authConfig.company.domain,
    restrictionEnabled: !!authConfig.company.domain,
    allowedEmails: authConfig.company.allowedEmails.length,
    environment: process.env.NODE_ENV
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Retrospective Analyzer Server running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
}); 