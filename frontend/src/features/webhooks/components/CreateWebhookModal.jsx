/**
 * ✅ NEW: Modal for creating webhooks
 */

import { useState } from 'react'
import { Modal } from '../../../shared/components/ui/Modal'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS } from '../../../shared/utils/constants'

export const CreateWebhookModal = ({ isOpen, onClose, onSubmit, loading }) => {
  const [url, setUrl] = useState('')
  const [subscribedEvents, setSubscribedEvents] = useState([])
  const [urlError, setUrlError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validate URL
    try {
      new URL(url)
      setUrlError(null)
    } catch {
      setUrlError('Invalid URL format')
      return
    }

    if (subscribedEvents.length === 0) {
      setUrlError('Select at least one event')
      return
    }

    await onSubmit({
      url,
      subscribed_events: subscribedEvents,
    })

    setUrl('')
    setSubscribedEvents([])
    setUrlError(null)
  }

  const toggleEvent = (event) => {
    setSubscribedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Webhook" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* URL Input */}
        <Input
          label="Webhook URL"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhooks"
          required
          error={urlError}
        />

        {/* Events Selection */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-gray-900">Subscribe to Events</label>
          <div className="space-y-2">
            {Object.values(WEBHOOK_EVENTS).map((event) => (
              <label key={event} className="flex items-center gap-3 p-3 border-2 border-gray-300 rounded-lg hover:border-gray-400 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={subscribedEvents.includes(event)}
                  onChange={() => toggleEvent(event)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{WEBHOOK_EVENT_LABELS[event]}</p>
                  <p className="text-xs text-gray-600">{event}</p>
                </div>
              </label>
            ))}
          </div>
          {subscribedEvents.length === 0 && (
            <p className="text-sm text-red-600">Select at least one event</p>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-900 leading-relaxed">
            <strong>📝 Note:</strong> Your webhook URL will receive POST requests with signed payloads. 
            Include the signature validation code from the documentation to verify authenticity.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading || subscribedEvents.length === 0}>
            {loading ? 'Creating...' : 'Create Webhook'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}