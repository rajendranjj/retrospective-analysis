#!/usr/bin/env python3
"""
Demo script for Release Retrospective Analyzer
This script demonstrates the core functionality without running the Streamlit interface.
"""

import pandas as pd
import os
from collections import defaultdict

def load_retrospective_data():
    """Load all retrospective Excel files from the current directory"""
    data = {}
    excel_files = [f for f in os.listdir('.') if f.endswith('.xlsx') and 'Retrospective' in f]
    
    print(f"📁 Found {len(excel_files)} retrospective files:")
    for file in excel_files:
        print(f"   - {file}")
    
    for file in excel_files:
        try:
            month = file.split()[0]
            df = pd.read_excel(file)
            data[month] = df
            print(f"✅ Loaded {month}: {len(df)} responses, {len(df.columns)} questions")
        except Exception as e:
            print(f"❌ Error loading {file}: {str(e)}")
    
    return data

def analyze_question_trends(data, question_column):
    """Analyze trends for a specific question across all releases"""
    trends = {}
    
    for month, df in data.items():
        if question_column in df.columns:
            value_counts = df[question_column].value_counts()
            total_responses = len(df[question_column].dropna())
            
            if total_responses > 0:
                percentages = (value_counts / total_responses * 100).round(2)
                trends[month] = percentages.to_dict()
    
    return trends

def main():
    print("🚀 Release Retrospective Analyzer - Demo Mode")
    print("=" * 50)
    
    # Load data
    data = load_retrospective_data()
    
    if not data:
        print("❌ No data loaded. Exiting.")
        return
    
    print(f"\n📊 Summary:")
    print(f"   Total files: {len(data)}")
    print(f"   Total responses: {sum(len(df) for df in data.values()):,}")
    
    # Get sample questions
    sample_df = list(data.values())[0]
    available_questions = [col for col in sample_df.columns if col != 'Timestamp']
    
    print(f"\n🔍 Available questions: {len(available_questions)}")
    
    # Show some example questions
    print("\n📝 Example questions:")
    for i, question in enumerate(available_questions[:5]):
        print(f"   {i+1}. {question[:80]}{'...' if len(question) > 80 else ''}")
    
    # Analyze a specific question (AI usage)
    ai_question = None
    for col in available_questions:
        if 'AI' in col and 'efficiency' in col.lower():
            ai_question = col
            break
    
    if ai_question:
        print(f"\n🤖 Analyzing AI efficiency question:")
        print(f"   Question: {ai_question}")
        
        trends = analyze_question_trends(data, ai_question)
        
        if trends:
            print("\n📈 Trend Analysis:")
            for month in sorted(trends.keys()):
                print(f"   {month}:")
                for answer, percentage in trends[month].items():
                    print(f"     - {answer}: {percentage}%")
        else:
            print("   No trend data available.")
    
    # Show response count trends
    print(f"\n📊 Response Count Trends:")
    response_counts = {month: len(df) for month, df in data.items()}
    for month in sorted(response_counts.keys()):
        print(f"   {month}: {response_counts[month]:,} responses")
    
    print(f"\n✅ Demo completed successfully!")
    print(f"💡 Run 'streamlit run retrospective_analyzer.py' to use the full application.")

if __name__ == "__main__":
    main() 