import { useState, useEffect } from 'react'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { LoadingSpinner } from '../../../shared/components/ui/LoadingSpinner'
import { EmptyState } from '../../../shared/components/EmptyState'
import { Toast } from '../../../shared/components/ui/Toast'
import { useApi } from '../../../shared/hooks/useApi'
import { useToast } from '../../../shared/hooks/useToast'
import { webhookAPI } from '../api'

import { WebhookCard } from '../components/WebhookCard'
import { CreateWebhookModal } from '../components/CreateWebhookModal'
import { WebhookEventsList } from '../components/WebhookEventsList'

export const WebhooksPage = () => {
  const [webhooks, setWebhooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedWebhookForEvents, setSelectedWebhookForEvents] = useState(null)
  const [showEventsModal, setShowEventsModal] = useState(false)
  
  // ✅ FIXED: Initialize toasts state using useToast hook
  const { toasts, addToast, removeToast } = useToast()
  
  const { execute: listWebhooks } = useApi(() => webhookAPI.list())
  const { execute: createWebhook } = useApi((data) => webhookAPI.create(data))
  const { execute: testWebhook } = useApi((id) => webhookAPI.test(id))
  const { execute: deleteWebhook } = useApi((id) => webhookAPI.delete(id))

  useEffect(() => {
    loadWebhooks()
  }, [])

  const loadWebhooks = async () => {
    setLoading(true)
    try {
      const response = await listWebhooks()
      
      // ✅ FIXED: Handle paginated response structure correctly
      let webhooksData = []
      
      // Check if response has a 'results' key (paginated response)
      if (response && response.results && Array.isArray(response.results)) {
        webhooksData = response.results
      } 
      // Otherwise check if response is directly an array
      else if (Array.isArray(response)) {
        webhooksData = response
      }
      // Handle if response is the data object itself
      else if (response && typeof response === 'object') {
        webhooksData = response
      }
      
      setWebhooks(webhooksData)
      console.log('✅ Loaded webhooks:', webhooksData.length) // DEBUG
    } catch (err) {
      console.error('Failed to load webhooks:', err)
      addToast('Failed to load webhooks', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateWebhook = async (formData) => {
    if (!formData.url.trim()) {
      addToast('Please enter a webhook URL', 'error')
      return
    }

    if (!formData.subscribed_events || formData.subscribed_events.length === 0) {
      addToast('Please select at least one event', 'error')
      return
    }

    try {
      const newWebhook = await createWebhook(formData)
      setWebhooks((prev) => [newWebhook, ...prev])
      addToast('Webhook created successfully', 'success')
      setShowCreateModal(false)
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to create webhook'
      addToast(errorMsg, 'error')
    }
  }

  const handleTestWebhook = async (webhookId) => {
    try {
      await testWebhook(webhookId)
      addToast('Test webhook sent successfully', 'success')
      loadWebhooks()
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to test webhook'
      addToast(errorMsg, 'error')
    }
  }

  const handleDeleteWebhook = async (webhookId) => {
    if (!window.confirm('Are you sure you want to delete this webhook?')) return

    try {
      await deleteWebhook(webhookId)
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId))
      addToast('Webhook deleted successfully', 'success')
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to delete webhook'
      addToast(errorMsg, 'error')
    }
  }

  const handleRetryWebhook = async (webhookId) => {
    try {
      addToast('Retrying failed webhook events...', 'info')
      loadWebhooks()
    } catch (err) {
      addToast('Failed to retry webhook', 'error')
    }
  }

  const handleShowEvents = (webhook) => {
    setSelectedWebhookForEvents(webhook)
    setShowEventsModal(true)
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
            <p className="text-gray-600 font-medium mt-4">Loading webhooks...</p>
          </div>
        ) : webhooks.length === 0 ? (
          /* Empty State */
          <EmptyState
            title="No webhooks configured"
            description="Create your first webhook to receive real-time notifications about document signing events"
            action={() => setShowCreateModal(true)}
            actionLabel="Create Webhook"
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
                onRetry={handleRetryWebhook}
                onShowEvents={handleShowEvents}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Webhook Modal */}
      <CreateWebhookModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateWebhook}
        loading={false}
      />

      {/* Webhook Events Modal */}
      {selectedWebhookForEvents && (
        <Modal 
          isOpen={showEventsModal}
          onClose={() => setShowEventsModal(false)}
          title={`Webhook Events - ${selectedWebhookForEvents.url}`}
          size="lg"
        >
          <WebhookEventsList 
            events={selectedWebhookForEvents.events || []}
            loading={false}
            onShowLogs={(eventId) => console.log('Show logs for event:', eventId)}
          />
        </Modal>
      )}

      {/* Toast Notifications */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}