import { useState, useEffect } from 'react'

// ✅ FIXED: Import from shared
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { LoadingSpinner } from '../../../shared/components/ui/LoadingSpinner'
import { EmptyState } from '../../../shared/components/EmptyState'
import { useApi } from '../../../shared/hooks/useApi'
import { useToast } from '../../../shared/hooks/useToast'
import { webhookAPI } from '../../../shared/utils/api'

import { WebhookCard } from '../components/WebhookCard'
import { CreateWebhookModal } from '../components/CreateWebhookModal'
import { WebhookEventsList } from '../components/WebhookEventsList'

export const WebhooksPage = () => {
  const [webhooks, setWebhooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedWebhookForEvents, setSelectedWebhookForEvents] = useState(null)
  const [showEventsModal, setShowEventsModal] = useState(false)
  
  const [formData, setFormData] = useState({
    url: '',
    subscribed_events: []
  })

  const { execute: listWebhooks } = useApi(() => webhookAPI.list()) // ← Changed from documentAPI.webhooks
  const { execute: createWebhook } = useApi((data) => webhookAPI.create(data)) // ← Changed
  const { execute: testWebhook } = useApi((id) => webhookAPI.test(id)) // ← Changed
  const { execute: deleteWebhook } = useApi((id) => webhookAPI.delete(id)) // ← Changed

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
            <LoadingSpinner />
            <p className="text-gray-600 font-medium">Loading webhooks...</p>
          </div>
        ) : webhooks.length === 0 ? (
          /* Empty State */
          <EmptyState
            title="No webhooks configured"
            description="Create your first webhook to receive real-time notifications about document signing events"
            ctaText="Create Your First Webhook"
            onCtaClick={() => setShowCreateModal(true)}
            icon="🪝"
          />
        ) : (
          /* Webhooks List */
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <WebhookCard
                key={webhook.id}
                webhook={webhook}
                onTest={handleTestWebhook}
                onDelete={handleDeleteWebhook}
                onViewEvents={() => {
                  setSelectedWebhookForEvents(webhook)
                  setShowEventsModal(true)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Webhook Modal */}
      <CreateWebhookModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateWebhook}
        formData={formData}
        setFormData={setFormData}
        toggleEvent={toggleEvent}
      />

      {/* Webhook Events Modal */}
      <Modal 
        isOpen={showEventsModal}
        onClose={() => setShowEventsModal(false)}
        title="Webhook Events"
      >
        <div className="p-4">
          <WebhookEventsList webhookId={selectedWebhookForEvents?.id} />
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