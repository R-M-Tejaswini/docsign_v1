import { useState, useEffect } from 'react'
import { Button } from '../components/ui/Button'
import { useApi } from '../hooks/useApi'
import { documentAPI } from '../services/api'
import { Toast } from '../components/ui/Toast'

export const WebhooksPage = () => {
  const [webhooks, setWebhooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [toasts, setToasts] = useState([])
  
  // Form state
  const [formData, setFormData] = useState({
    url: '',
    subscribed_events: []
  })

  const { execute: listWebhooks } = useApi(() => documentAPI.webhooks.list())
  const { execute: createWebhook } = useApi((data) => documentAPI.webhooks.create(data))
  const { execute: testWebhook } = useApi((id) => documentAPI.webhooks.test(id))
  const { execute: deleteWebhook } = useApi((id) => documentAPI.webhooks.delete(id))

  useEffect(() => {
    loadWebhooks()
  }, [])

  const loadWebhooks = async () => {
    setLoading(true)
    try {
      const response = await listWebhooks()
      
      // ✅ Handle paginated response
      let webhooksData = response
      if (response && typeof response === 'object') {
        // If it's a paginated response, extract results
        if (response.results) {
          webhooksData = response.results
        } else if (Array.isArray(response)) {
          webhooksData = response
        } else {
          webhooksData = []
        }
      }
      
      setWebhooks(webhooksData)
    } catch (err) {
      console.error('Failed to load webhooks:', err)
      addToast('Failed to load webhooks', 'error')
    } finally {
      setLoading(false)
    }
  }

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts([...toasts, { id, message, type, duration: 3000 }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  const handleCreateWebhook = async () => {
    if (!formData.url.trim()) {
      addToast('Please enter a webhook URL', 'error')
      return
    }

    if (formData.subscribed_events.length === 0) {
      addToast('Please select at least one event', 'error')
      return
    }

    try {
      await createWebhook({
        url: formData.url,
        subscribed_events: formData.subscribed_events,
      })
      addToast('✅ Webhook created successfully', 'success')
      setFormData({ url: '', subscribed_events: [] })
      setShowCreateModal(false)
      await loadWebhooks()
    } catch (err) {
      console.error('Failed to create webhook:', err)
      addToast('❌ Failed to create webhook', 'error')
    }
  }

  const handleTestWebhook = async (webhookId) => {
    try {
      await testWebhook(webhookId)
      addToast('🧪 Test webhook sent', 'success')
      
      // Reload to see the event
      setTimeout(() => loadWebhooks(), 1000)
    } catch (err) {
      console.error('Failed to test webhook:', err)
      addToast('❌ Failed to send test webhook', 'error')
    }
  }

  const handleDeleteWebhook = async (webhookId) => {
    if (!window.confirm('Are you sure? This will delete the webhook.')) {
      return
    }

    try {
      await deleteWebhook(webhookId)
      addToast('✅ Webhook deleted', 'success')
      await loadWebhooks()
    } catch (err) {
      console.error('Failed to delete webhook:', err)
      addToast('❌ Failed to delete webhook', 'error')
    }
  }

  const toggleEvent = (event) => {
    setFormData((prev) => ({
      ...prev,
      subscribed_events: prev.subscribed_events.includes(event)
        ? prev.subscribed_events.filter((e) => e !== event)
        : [...prev.subscribed_events, event],
    }))
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Webhooks</h1>
            <p className="text-gray-600 mt-1">
              Listen to document signing events in real-time
            </p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            variant="primary"
            className="px-6 py-3"
          >
            ➕ Create Webhook
          </Button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading webhooks...</div>
          </div>
        ) : webhooks.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">🪝</div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              No webhooks configured
            </h2>
            <p className="text-gray-600 mb-6">
              Create your first webhook to receive real-time notifications about document signing events
            </p>
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="primary"
            >
              Create Your First Webhook
            </Button>
          </div>
        ) : (
          /* Webhooks List */
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 break-all">
                        {webhook.url}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        webhook.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {webhook.is_active ? '✓ Active' : '○ Inactive'}
                      </span>
                    </div>

                    {/* Events */}
                    <div className="text-sm text-gray-600 mb-3">
                      <strong>Events:</strong> {webhook.events_list?.join(', ') || 'None'}
                    </div>

                    {/* Statistics */}
                    <div className="grid grid-cols-4 gap-3 bg-gray-50 p-3 rounded">
                      <div>
                        <div className="text-xs text-gray-600">Total</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {webhook.total_deliveries}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600">Success</div>
                        <div className="text-lg font-semibold text-green-600">
                          {webhook.successful_deliveries}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600">Failed</div>
                        <div className="text-lg font-semibold text-red-600">
                          {webhook.failed_deliveries}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600">Success Rate</div>
                        <div className="text-lg font-semibold text-blue-600">
                          {webhook.success_rate ?? 'N/A'}%
                        </div>
                      </div>
                    </div>

                    {/* Last Triggered */}
                    {webhook.last_triggered_at && (
                      <div className="text-xs text-gray-500 mt-3">
                        Last triggered: {new Date(webhook.last_triggered_at).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* Secret */}
                  <div className="ml-4 bg-gray-50 p-3 rounded text-right max-w-xs">
                    <div className="text-xs text-gray-600 mb-1">Secret</div>
                    <code className="text-xs font-mono text-gray-700 break-all">
                      {webhook.secret?.substring(0, 20)}...
                    </code>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => handleTestWebhook(webhook.id)}
                    variant="secondary"
                    size="sm"
                  >
                    🧪 Send Test
                  </Button>
                  <Button
                    onClick={() => handleDeleteWebhook(webhook.id)}
                    variant="secondary"
                    size="sm"
                  >
                    🗑️ Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Webhook Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Webhook</h2>

            {/* URL Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Webhook URL *
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com/webhooks/docsign"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 Tip: Use <a href="https://webhook.site" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">webhook.site</a> for testing
              </p>
            </div>

            {/* Events Checkboxes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subscribe to Events *
              </label>
              <div className="space-y-2">
                {[
                  { value: 'document.signature_created', label: '👤 Signature Created' },
                  { value: 'document.completed', label: '✅ Document Completed' },
                  { value: 'document.locked', label: '🔒 Document Locked' },
                  { value: 'document.status_changed', label: '🔄 Status Changed' },
                ].map((event) => (
                  <label key={event.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.subscribed_events.includes(event.value)}
                      onChange={() => toggleEvent(event.value)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">{event.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={() => setShowCreateModal(false)}
                variant="secondary"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateWebhook}
                variant="primary"
                className="flex-1"
              >
                Create Webhook
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => setToasts(toasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  )
}