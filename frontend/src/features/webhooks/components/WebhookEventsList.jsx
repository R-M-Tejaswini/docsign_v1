/**
 * ✅ NEW: Display list of webhook events with delivery status
 */

export const WebhookEventsList = ({ events, loading, onShowLogs }) => {
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-4 border-blue-600"></div>
        <p className="text-gray-600 mt-2">Loading events...</p>
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No events yet</p>
      </div>
    )
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'retrying':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {events.map((event) => (
        <div key={event.id} className="p-4 border-2 border-gray-300 rounded-lg hover:border-gray-400 transition-all">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">{event.event_type}</p>
              <p className="text-xs text-gray-600 mt-1">
                {new Date(event.created_at).toLocaleString()}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(event.status)}`}>
              {event.status}
            </span>
          </div>

          {event.last_error && (
            <p className="text-xs text-red-600 mb-2">Error: {event.last_error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onShowLogs(event.id)}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              View Logs ({event.attempt_count} attempts)
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}