# 🚀 Quick Start Guide - Next.js Version

Get your Release Retrospective Analyzer running in 3 simple steps!

## ⚡ Step 1: Install Dependencies
```bash
npm install
```

## ⚡ Step 2: Start Both Services
```bash
./start.sh
```

**Or manually:**
- Terminal 1: `npm run server` (Backend on port 4005)
- Terminal 2: `npm run dev` (Frontend on port 3002)

## ⚡ Step 3: Open Your Browser
- **Frontend**: `http://localhost:3002`
- **Backend API**: `http://localhost:4005`

---

## 🎯 What You'll See

1. **Dashboard Overview** - Summary metrics and file information
2. **Question Categories** - Organized by topic (Team, AI, Planning, etc.)
3. **Interactive Charts** - Beautiful trend charts using Recharts
4. **Data Export** - Download CSV files for further analysis
5. **Real-time Updates** - Fast data processing with Express.js backend

## 🔍 Quick Test

Test the backend API:
```bash
curl http://localhost:4005/api/health
```

## 🆘 Need Help?

- Check the full [README.md](README.md) for detailed instructions
- Ensure your Excel files contain "Retrospective" in the filename
- All files should have the same column structure
- Make sure ports 3002 and 4005 are available

---

**🎉 You're all set! Start analyzing your release retrospectives with the modern Next.js app!** 