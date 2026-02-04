/**
 * ✅ CONSOLIDATED: Single empty state component used everywhere
 * Replaces 5+ custom empty state implementations
 */

import { Button } from './ui/Button'

export const EmptyState = ({
  icon = '📭',
  title = 'No items',
  description = 'Get started by creating your first item.',
  action = null,
  actionLabel = 'Create',
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-16 text-center">
      <div className="text-7xl mb-6">{icon}</div>
      <h2 className="text-3xl font-bold text-gray-900 mb-3">{title}</h2>
      {description && (
        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action} variant="primary" size="lg">
          <span>➕</span>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}