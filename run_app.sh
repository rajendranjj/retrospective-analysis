#!/bin/bash

echo "🚀 Starting Release Retrospective Analyzer..."
echo "📁 Working directory: $(pwd)"
echo "📊 Excel files found: $(ls -1 *.xlsx | grep -c 'Retrospective')"
echo ""
echo "🌐 The application will open in your browser at: http://localhost:8501"
echo "⏹️  Press Ctrl+C to stop the application"
echo ""

streamlit run retrospective_analyzer.py --server.headless true --server.port 8501 