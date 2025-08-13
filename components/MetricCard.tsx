import { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  icon: LucideIcon
  title: string
  value: string
  color: 'blue' | 'green' | 'purple' | 'orange'
}

const colorClasses = {
  blue: 'border-blue-500 text-blue-600',
  green: 'border-green-500 text-green-600',
  purple: 'border-purple-500 text-purple-600',
  orange: 'border-orange-500 text-orange-600'
}

export default function MetricCard({ icon: Icon, title, value, color }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="flex items-center">
        <div className={`p-2 rounded-lg bg-${color}-50 border border-${color}-200`}>
          <Icon className={`h-6 w-6 ${colorClasses[color]}`} />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
} 