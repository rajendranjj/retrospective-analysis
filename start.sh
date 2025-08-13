#!/bin/bash

echo "🚀 Starting Release Retrospective Analyzer..."
echo "📁 Working directory: $(pwd)"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🌐 Starting backend server on port 4005..."
echo "📊 Starting frontend on port 3002..."
echo ""

# Start backend server in background
node server/index.js &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Start frontend
npm run dev &
FRONTEND_PID=$!

echo "✅ Both services are starting..."
echo "📊 Backend API: http://localhost:4005"
echo "🌐 Frontend: http://localhost:3002"
echo ""
echo "⏹️  Press Ctrl+C to stop both services"

# Function to cleanup processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $SERVER_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait 