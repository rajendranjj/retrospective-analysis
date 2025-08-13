# 📊 Release Retrospective Analyzer

A modern Next.js application for analyzing release retrospective Excel files with interactive charts and trend analysis. Features a React frontend on port 3002 and an Express.js backend API on port 4005.

## 🚀 Features

- **Modern Web Interface**: Built with Next.js 14 and React 18
- **Interactive Charts**: Beautiful trend charts using Recharts
- **Real-time Analysis**: Fast data processing with Express.js backend
- **Automatic Data Loading**: Detects and loads all retrospective Excel files
- **Trend Analysis**: Creates interactive charts showing answer percentage changes over time
- **Question Categorization**: Organized by topic (Team, AI, Planning, Agile, etc.)
- **Data Export**: Download trend analysis data as CSV files
- **Responsive Design**: Modern UI with Tailwind CSS
- **TypeScript Support**: Full type safety throughout the application

## 🏗️ Architecture

- **Frontend**: Next.js 14 with React 18, TypeScript, and Tailwind CSS
- **Backend**: Express.js server with Excel processing capabilities
- **Charts**: Recharts for interactive data visualization
- **Ports**: Frontend on 3002, Backend on 4005

## 📋 Requirements

- Node.js 18+ 
- npm or yarn
- Excel files with "Retrospective" in the filename
- All Excel files should have the same column structure

## 🛠️ Installation

1. **Clone or download** this repository to your local machine
2. **Navigate** to the directory containing your retrospective Excel files
3. **Install dependencies**:
   ```bash
   npm install
   ```

## 🚀 Quick Start

### Option 1: Use the startup script (Recommended)
```bash
chmod +x start.sh
./start.sh
```

### Option 2: Manual startup
1. **Start the backend server** (Terminal 1):
   ```bash
   npm run server
   ```

2. **Start the frontend** (Terminal 2):
   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to:
   - Frontend: `http://localhost:3002`
   - Backend API: `http://localhost:4005`

## 📊 How It Works

### Data Loading
- The backend automatically scans the current directory for Excel files containing "Retrospective" in the filename
- Each file is processed using the `xlsx` library and converted to JSON
- Data is cached in memory for fast API responses

### Question Analysis
- Questions are automatically categorized into logical groups:
  - **Team & Organization**: Questions about teams, scrum, and organizational structure
  - **AI & Efficiency**: Questions about AI usage and productivity improvements
  - **Release Planning**: Questions about planning, commitments, and timelines
  - **Agile Ceremonies**: Questions about sprint meetings, standups, and retrospectives
  - **Process & Support**: Questions about processes, support, and tools
  - **Other**: Remaining questions

### Trend Charts
- For each selected question, the backend calculates the percentage of each answer option
- Frontend creates interactive line charts using Recharts
- Charts are sorted chronologically by month
- Hover information shows exact percentages

### API Endpoints
- `GET /api/health` - Server health check
- `GET /api/data` - Load all retrospective data and metadata
- `GET /api/trends/:question` - Get trend analysis for a specific question
- `GET /api/response-counts` - Get response count trends across releases

## 📁 File Structure

```
Retrospective Analysis/
├── app/                          # Next.js app directory
│   ├── globals.css              # Global styles with Tailwind
│   ├── layout.tsx               # Root layout component
│   └── page.tsx                 # Main dashboard page
├── components/                   # React components
│   ├── MetricCard.tsx           # Summary metric cards
│   ├── QuestionSelector.tsx     # Question selection interface
│   ├── TrendChart.tsx           # Trend analysis charts
│   ├── ResponseChart.tsx        # Response count charts
│   └── DataTable.tsx            # Data display table
├── server/                       # Express.js backend
│   └── index.js                 # Main server file
├── package.json                  # Node.js dependencies
├── next.config.js               # Next.js configuration
├── tailwind.config.js           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
├── start.sh                     # Startup script
└── README.md                    # This file
```

## 🔧 Development

### Available Scripts
- `npm run dev` - Start frontend development server (port 3002)
- `npm run server` - Start backend server (port 4005)
- `npm run build` - Build production frontend
- `npm run start` - Start production frontend
- `npm run lint` - Run ESLint

### Adding New Features
1. **Backend**: Add new routes in `server/index.js`
2. **Frontend**: Create new components in `components/` directory
3. **Styling**: Use Tailwind CSS classes or extend `globals.css`

## 📈 Example Use Cases

1. **Track Team Satisfaction**: Monitor how team satisfaction ratings change over releases
2. **AI Adoption Trends**: Analyze how AI tool usage and productivity improvements evolve
3. **Process Effectiveness**: Track the effectiveness of agile ceremonies and processes
4. **Response Rate Monitoring**: Monitor participation rates across different releases
5. **Improvement Areas**: Identify trends in areas that need improvement

## 🐛 Troubleshooting

### Common Issues

1. **Port already in use**: 
   - Frontend: Change port in `package.json` scripts
   - Backend: Change `PORT` constant in `server/index.js`

2. **No files found**: Ensure Excel files contain "Retrospective" in the filename

3. **Column mismatch**: All Excel files must have the same column structure

4. **Module not found**: Run `npm install` to install dependencies

### Error Messages

- **"Failed to load data"**: Check if backend server is running on port 4005
- **"No trend data available"**: The selected question may not exist in all files
- **"CORS error"**: Backend CORS is configured for localhost development

## 🚀 Deployment

### Production Build
1. Build the frontend: `npm run build`
2. Start production server: `npm run start`
3. Deploy backend to your preferred hosting service

### Environment Variables
- Set `NODE_ENV=production` for production mode
- Configure backend port via environment variable if needed

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve this application.

## 📄 License

This project is open source and available under the MIT License.

## 🆘 Support

If you encounter any issues or have questions, please check the troubleshooting section above or create an issue in the repository. 