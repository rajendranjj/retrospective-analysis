interface QuestionSelectorProps {
  questionCategories: { [key: string]: string[] }
  orderedQuestions: string[]
  selectedCategory: string
  selectedQuestion: string
  onCategoryChange: (category: string) => void
  onQuestionChange: (question: string) => void
}

export default function QuestionSelector({
  questionCategories,
  orderedQuestions,
  selectedCategory,
  selectedQuestion,
  onCategoryChange,
  onQuestionChange
}: QuestionSelectorProps) {
  // Get all unique questions across all categories
  const allQuestions = new Set<string>()
  Object.values(questionCategories).forEach(questions => {
    questions.forEach(question => allQuestions.add(question))
  })

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="question" className="block text-sm font-medium text-gray-700 mb-2">
          Select Question:
        </label>
        <select
          id="question"
          value={selectedQuestion}
          onChange={(e) => onQuestionChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">Choose a question...</option>
          {orderedQuestions.map((question, index) => (
            <option key={question} value={question}>
              {index + 1}. {question.length > 80 ? `${question.substring(0, 80)}...` : question}
            </option>
          ))}
        </select>
      </div>

      {/* Show question count info */}
      <div className="text-sm text-gray-600">
        Showing all {orderedQuestions.length} questions
      </div>
    </div>
  )
} 