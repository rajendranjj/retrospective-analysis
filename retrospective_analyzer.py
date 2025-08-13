import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import os
from datetime import datetime
import numpy as np

# Page configuration
st.set_page_config(
    page_title="Release Retrospective Analyzer",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        color: #1f77b4;
        text-align: center;
        margin-bottom: 2rem;
    }
    .metric-card {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 4px solid #1f77b4;
    }
    .chart-container {
        background-color: white;
        padding: 1rem;
        border-radius: 0.5rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin: 1rem 0;
    }
</style>
""", unsafe_allow_html=True)

@st.cache_data
def load_retrospective_data():
    """Load all retrospective Excel files from the current directory"""
    data = {}
    excel_files = [f for f in os.listdir('.') if f.endswith('.xlsx') and 'Retrospective' in f]
    
    for file in excel_files:
        try:
            # Extract month from filename
            month = file.split()[0]
            df = pd.read_excel(file)
            data[month] = df
        except Exception as e:
            st.error(f"Error loading {file}: {str(e)}")
    
    return data

def extract_month_order(month_name):
    """Convert month name to number for proper sorting"""
    month_mapping = {
        'January': 1, 'February': 2, 'March': 3, 'April': 4,
        'May': 5, 'June': 6, 'July': 7, 'August': 8,
        'September': 9, 'October': 10, 'November': 11, 'December': 12
    }
    return month_mapping.get(month_name, 13)

def analyze_question_trends(data, question_column):
    """Analyze trends for a specific question across all releases"""
    trends = {}
    
    for month, df in data.items():
        if question_column in df.columns:
            # Get value counts and calculate percentages
            value_counts = df[question_column].value_counts()
            total_responses = len(df[question_column].dropna())
            
            if total_responses > 0:
                percentages = (value_counts / total_responses * 100).round(2)
                trends[month] = percentages.to_dict()
    
    return trends

def create_trend_chart(trends_data, question_title):
    """Create a trend chart showing percentage changes over time"""
    if not trends_data:
        return None
    
    # Sort months chronologically
    sorted_months = sorted(trends_data.keys(), key=extract_month_order)
    
    # Get all unique answer options across all months
    all_answers = set()
    for month_data in trends_data.values():
        all_answers.update(month_data.keys())
    
    # Create the chart
    fig = go.Figure()
    
    for answer in sorted(all_answers):
        percentages = []
        months = []
        
        for month in sorted_months:
            if month in trends_data and answer in trends_data[month]:
                percentages.append(trends_data[month][answer])
                months.append(month)
        
        if percentages:
            fig.add_trace(go.Scatter(
                x=months,
                y=percentages,
                mode='lines+markers',
                name=answer,
                line=dict(width=3),
                marker=dict(size=8)
            ))
    
    fig.update_layout(
        title=f"Trend Analysis: {question_title}",
        xaxis_title="Release Month",
        yaxis_title="Percentage (%)",
        height=500,
        showlegend=True,
        legend=dict(
            yanchor="top",
            y=0.99,
            xanchor="left",
            x=0.01
        ),
        hovermode='x unified'
    )
    
    return fig

def create_summary_metrics(data):
    """Create summary metrics for the dashboard"""
    total_files = len(data)
    total_responses = sum(len(df) for df in data.values())
    
    # Get the most recent file
    most_recent = max(data.keys(), key=extract_month_order)
    most_recent_responses = len(data[most_recent])
    
    return {
        'total_files': total_files,
        'total_responses': total_responses,
        'most_recent': most_recent,
        'most_recent_responses': most_recent_responses
    }

def main():
    st.markdown('<h1 class="main-header">📊 Release Retrospective Analyzer</h1>', unsafe_allow_html=True)
    
    # Load data
    with st.spinner("Loading retrospective data..."):
        data = load_retrospective_data()
    
    if not data:
        st.error("No retrospective Excel files found in the current directory.")
        st.info("Please ensure the Excel files are in the same directory as this application.")
        return
    
    # Display summary metrics
    metrics = create_summary_metrics(data)
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.markdown(f"""
        <div class="metric-card">
            <h3>📁 Total Files</h3>
            <h2>{metrics['total_files']}</h2>
        </div>
        """, unsafe_allow_html=True)
    
    with col2:
        st.markdown(f"""
        <div class="metric-card">
            <h3>👥 Total Responses</h3>
            <h2>{metrics['total_responses']:,}</h2>
        </div>
        """, unsafe_allow_html=True)
    
    with col3:
        st.markdown(f"""
        <div class="metric-card">
            <h3>📅 Most Recent</h3>
            <h2>{metrics['most_recent']}</h2>
        </div>
        """, unsafe_allow_html=True)
    
    with col4:
        st.markdown(f"""
        <div class="metric-card">
            <h3>📊 Recent Responses</h3>
            <h2>{metrics['most_recent_responses']:,}</h2>
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown("---")
    
    # Question selection
    st.header("📈 Question Trend Analysis")
    
    # Get sample data to show available questions
    sample_df = list(data.values())[0]
    available_questions = [col for col in sample_df.columns if col != 'Timestamp']
    
    # Group questions by category for better organization
    question_categories = {
        'Team & Organization': [col for col in available_questions if any(keyword in col.lower() for keyword in ['team', 'scrum', 'org', 'director'])],
        'AI & Efficiency': [col for col in available_questions if any(keyword in col.lower() for keyword in ['ai', 'efficiency', 'productivity'])],
        'Release Planning': [col for col in available_questions if any(keyword in col.lower() for keyword in ['planning', 'commitment', 'timeline'])],
        'Agile Ceremonies': [col for col in available_questions if any(keyword in col.lower() for keyword in ['sprint', 'standup', 'retrospective', 'ceremony'])],
        'Process & Support': [col for col in available_questions if any(keyword in col.lower() for keyword in ['process', 'support', 'capacity', 'jira'])],
        'Other': [col for col in available_questions if col not in [item for sublist in list(question_categories.values()) if sublist] for sublist in [question_categories.values()]]]
    
    # Question selection with categories
    selected_category = st.selectbox(
        "Select Question Category:",
        list(question_categories.keys())
    )
    
    if selected_category and question_categories[selected_category]:
        selected_question = st.selectbox(
            "Select Question:",
            question_categories[selected_category],
            format_func=lambda x: x[:80] + "..." if len(x) > 80 else x
        )
        
        if selected_question:
            # Analyze trends for selected question
            trends = analyze_question_trends(data, selected_question)
            
            if trends:
                # Create and display trend chart
                fig = create_trend_chart(trends, selected_question)
                
                if fig:
                    st.plotly_chart(fig, use_container_width=True)
                    
                    # Display detailed data table
                    st.subheader("📋 Detailed Data")
                    
                    # Create a summary table
                    summary_data = []
                    for month in sorted(trends.keys(), key=extract_month_order):
                        month_data = trends[month]
                        for answer, percentage in month_data.items():
                            summary_data.append({
                                'Month': month,
                                'Answer': answer,
                                'Percentage': percentage
                            })
                    
                    if summary_data:
                        summary_df = pd.DataFrame(summary_data)
                        st.dataframe(summary_df, use_container_width=True)
                        
                        # Download button for the data
                        csv = summary_df.to_csv(index=False)
                        st.download_button(
                            label="📥 Download Trend Data (CSV)",
                            data=csv,
                            file_name=f"trend_analysis_{selected_question[:30].replace(' ', '_')}.csv",
                            mime="text/csv"
                        )
            else:
                st.warning("No trend data available for the selected question.")
    
    # Additional analysis section
    st.markdown("---")
    st.header("🔍 Quick Insights")
    
    # Show response count trends
    response_counts = {month: len(df) for month, df in data.items()}
    sorted_months = sorted(response_counts.keys(), key=extract_month_order)
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("📊 Response Count Trends")
        response_fig = px.line(
            x=sorted_months,
            y=[response_counts[month] for month in sorted_months],
            title="Number of Responses per Release",
            labels={'x': 'Release Month', 'y': 'Number of Responses'}
        )
        response_fig.update_traces(line_color='#1f77b4', line_width=3, marker_size=8)
        st.plotly_chart(response_fig, use_container_width=True)
    
    with col2:
        st.subheader("📈 Response Distribution")
        response_df = pd.DataFrame({
            'Month': sorted_months,
            'Responses': [response_counts[month] for month in sorted_months]
        })
        st.dataframe(response_df, use_container_width=True)
    
    # Footer
    st.markdown("---")
    st.markdown(
        "<div style='text-align: center; color: #666; padding: 1rem;'>"
        "📊 Release Retrospective Analyzer | Built with Streamlit & Plotly"
        "</div>",
        unsafe_allow_html=True
    )

if __name__ == "__main__":
    main() 