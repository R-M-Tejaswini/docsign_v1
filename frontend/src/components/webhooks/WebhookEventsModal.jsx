import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useApi } from '../../hooks/useApi'
import { webhookAPI } from '../../services/api'

export const WebhookEventsModal = ({ isOpen, onClose, webhook }) => {
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventLogs, setEventLogs] = useState([])
  const [loading, setLoading] = useState(false)

  const { execute: listEvents } = useApi(() => webhookAPI.listEvents(webhook?.id))
  const { execute: getEventLogs } = useApi(() => webhookAPI.getEventLogs(selectedEvent?.id))

  useEffect(() => {
    if (isOpen && webhook) {
      loadEvents()
    }
  }, [isOpen, webhook])

  useEffect(() => {
    if (selectedEvent) {
      loadEventLogs()
    }
  }, [selectedEvent])

  const loadEvents = async () => {
    setLoading(true)
    try {
      const response = await listEvents()
      let eventsData = response.results || response
      setEvents(Array.isArray(eventsData) ? eventsData : [])
    } finally {
      setLoading(false)
    }
  }

  const loadEventLogs = async () => {
    try {
      const logs = await getEventLogs()
      setEventLogs(logs.results || logs || [])
    } catch (err) {
      console.error('Failed to load event logs:', err)
      setEventLogs([])
    }
  }

  if (!webhook) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Webhook Events - ${webhook.url}`}>
      <div className="space-y-6 max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-4 border-blue-600"></div>
            <p className="text-gray-600 mt-2">Loading events...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No events yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedEvent?.id === event.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onClick={() => setSelectedEvent(event)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{event.event_type}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Created: {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      event.status === 'delivered'
                        ? 'bg-green-100 text-green-800'
                        : event.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : event.status === 'retrying'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {event.status}
                  </span>
                </div>

                {selectedEvent?.id === event.id && eventLogs.length > 0 && (
                  <div className="mt-4 space-y-2 border-t-2 pt-4">
                    <p className="text-sm font-semibold text-gray-900">Delivery Attempts:</p>
                    {eventLogs.map((log, idx) => (
                      <div key={log.id} className="text-xs bg-gray-50 p-2 rounded border border-gray-200">
                        <p className="font-semibold">
                          Attempt {idx + 1}: HTTP {log.status_code} ({log.duration_ms}ms)
                        </p>
                        {log.error_message && (
                          <p className="text-red-600 mt-1">{log.error_message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}