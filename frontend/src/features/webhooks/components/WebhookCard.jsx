/**
 * ✅ NEW: Reusable webhook card for list display
 */

import { useState } from 'react'
import { Button } from '../../../shared/components/ui/Button'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { useApi } from '../../../shared/hooks/useApi'
import { webhookAPI } from '../api'

export const WebhookCard = ({ webhook, onDelete, onTest, onRetry, onShowEvents }) => {
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    try {
      await onTest(webhook.id)
    } finally {
      setTesting(false)
    }
  }

  // ✅ FIXED: Handle missing data gracefully
  const successRate = webhook.success_rate !== null ? `${Math.round(webhook.success_rate)}%` : 'N/A'
  const totalDeliveries = webhook.total_deliveries || 0
  const subscribedEventsList = webhook.events_list || webhook.subscribed_events || []

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all p-6 border-2 border-gray-200 hover:border-blue-300">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 truncate">{webhook.url}</h3>
          <p className="text-xs text-gray-600 mt-1">
            Created {new Date(webhook.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${webhook.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {webhook.is_active ? '🟢 Active' : '🔴 Inactive'}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
        <div>
          <p className="text-gray-600">Deliveries</p>
          <p className="font-bold text-gray-900">{totalDeliveries}</p>
        </div>
        <div>
          <p className="text-gray-600">Success Rate</p>
          <p className={`font-bold ${webhook.success_rate > 90 ? 'text-green-600' : webhook.success_rate > 70 ? 'text-yellow-600' : 'text-red-600'}`}>
            {successRate}
          </p>
        </div>
        <div>
          <p className="text-gray-600">Events</p>
          <p className="font-bold text-gray-900">{subscribedEventsList.length}</p>
        </div>
      </div>

      {/* Events List */}
      {subscribedEventsList.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
          <p className="text-xs font-bold text-gray-900 mb-2">Subscribed Events:</p>
          <div className="flex flex-wrap gap-2">
            {subscribedEventsList.map((event) => (
              <span key={event} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {event}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleTest}
          disabled={testing || !webhook.is_active}
          className="flex-1"
        >
          {testing ? 'Testing...' : 'Test'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onShowEvents(webhook)}
          className="flex-1"
        >
          Events
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRetry(webhook.id)}
          className="flex-1"
        >
          Retry
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (window.confirm('Delete this webhook?')) {
              onDelete(webhook.id)
            }
          }}
          className="flex-1"
        >
          Delete
        </Button>
      </div>
    </div>
  )
}