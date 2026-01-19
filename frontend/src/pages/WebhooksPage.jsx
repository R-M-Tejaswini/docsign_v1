import { useState, useEffect } from 'react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useApi } from '../hooks/useApi'
import { documentAPI } from '../services/api'
import { Toast } from '../components/ui/Toast'

export const WebhooksPage = () => {
  const [webhooks, setWebhooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [toasts, setToasts] = useState([])
  
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
      
      let webhooksData = response
      if (response && typeof response === 'object') {
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Webhooks</h1>
            <p className="text-lg text-gray-600">
              Listen to document signing events in real-time
            </p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            variant="primary"
            size="lg"
          >
            <span>➕</span>
            Create Webhook
          </Button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading webhooks...</p>
          </div>
        ) : webhooks.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl shadow-lg p-16 text-center">
            <div className="text-7xl mb-6">🪝</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              No webhooks configured
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
              Create your first webhook to receive real-time notifications about document signing events
            </p>
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="primary"
              size="lg"
            >
              <span>➕</span>
              Create Your First Webhook
            </Button>
          </div>
        ) : (
          /* Webhooks List */
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 p-6 border-2 border-gray-100"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-bold text-gray-900 break-all">
                        {webhook.url}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                        webhook.is_active
                          ? 'bg-green-100 text-green-800 border-2 border-green-200'
                          : 'bg-gray-100 text-gray-800 border-2 border-gray-200'
                      }`}>
                        {webhook.is_active ? '✓ Active' : '○ Inactive'}
                      </span>
                    </div>

                    {/* Events */}
                    <div className="text-sm text-gray-600 mb-4">
                      <strong className="font-semibold">Events:</strong>{' '}
                      {webhook.events_list?.join(', ') || 'None'}
                    </div>

                    {/* Statistics */}
                    <div className="grid grid-cols-4 gap-4 bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-xl border border-gray-200">
                      <div className="text-center">
                        <div className="text-xs text-gray-600 font-semibold uppercase mb-1">Total</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {webhook.total_deliveries}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-600 font-semibold uppercase mb-1">Success</div>
                        <div className="text-2xl font-bold text-green-600">
                          {webhook.successful_deliveries}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-600 font-semibold uppercase mb-1">Failed</div>
                        <div className="text-2xl font-bold text-red-600">
                          {webhook.failed_deliveries}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-600 font-semibold uppercase mb-1">Success Rate</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {webhook.success_rate ?? 'N/A'}%
                        </div>
                      </div>
                    </div>

                    {/* Last Triggered */}
                    {webhook.last_triggered_at && (
                      <div className="text-xs text-gray-500 mt-3 font-semibold">
                        Last triggered: {new Date(webhook.last_triggered_at).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* Secret */}
                  <div className="ml-6 bg-gray-50 p-4 rounded-lg border-2 border-gray-200 text-right max-w-xs">
                    <div className="text-xs text-gray-600 mb-2 font-semibold uppercase">Secret</div>
                    <code className="text-xs font-mono text-gray-700 break-all block">
                      {webhook.secret?.substring(0, 20)}...
                    </code>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t-2 border-gray-200">
                  <Button
                    onClick={() => handleTestWebhook(webhook.id)}
                    variant="secondary"
                    size="sm"
                  >
                    <span>🧪</span>
                    Send Test
                  </Button>
                  <Button
                    onClick={() => handleDeleteWebhook(webhook.id)}
                    variant="danger"
                    size="sm"
                  >
                    <span>🗑️</span>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Webhook Modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create Webhook"
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* URL Input */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Webhook URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com/webhooks/docsign"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 text-base"
            />
            <p className="text-xs text-gray-600 mt-2">
              💡 Tip: Use{' '}
              <a 
                href="https://webhook.site" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:underline font-semibold"
              >
                webhook.site
              </a>
              {' '}for testing
            </p>
          </div>

          {/* Events Checkboxes */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-3">
              Subscribe to Events <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {[
                { value: 'document.signature_created', label: '👤 Signature Created', desc: 'When a recipient signs fields' },
                { value: 'document.completed', label: '✅ Document Completed', desc: 'When all signatures are collected' },
                { value: 'document.locked', label: '🔒 Document Locked', desc: 'When a version is locked' },
                { value: 'document.status_changed', label: '🔄 Status Changed', desc: 'When document status updates' },
              ].map((event) => (
                <label 
                  key={event.value} 
                  className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    formData.subscribed_events.includes(event.value)
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.subscribed_events.includes(event.value)}
                    onChange={() => toggleEvent(event.value)}
                    className="w-5 h-5 text-blue-600 rounded mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-bold text-gray-900 block">{event.label}</span>
                    <span className="text-xs text-gray-600">{event.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t-2 border-gray-200">
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
              <span>➕</span>
              Create Webhook
            </Button>
          </div>
        </div>
      </Modal>

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