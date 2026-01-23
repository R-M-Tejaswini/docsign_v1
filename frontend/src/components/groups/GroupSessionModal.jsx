import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { useApi } from '../../hooks/useApi'
import { groupAPI } from '../../services/api'

export const GroupSessionModal = ({ isOpen, groupId, recipients = [], onClose, onSuccess }) => {
  const [recipientInput, setRecipientInput] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)
  const [loading, setLoading] = useState(false)
  
  const { execute: createSession } = useApi((data) => groupAPI.createSession(groupId, data))
  
  const handleCreateSession = async () => {
    if (!recipientInput.trim()) {
      alert('Please enter a recipient name')
      return
    }
    
    setLoading(true)
    try {
      await createSession({
        recipient: recipientInput,
        expires_in_days: expiresInDays || null,
      })
      setRecipientInput('')
      setExpiresInDays(30)
      onSuccess()
    } catch (err) {
      alert('Failed to create session: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Signing Session">
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            A session creates signing links for this recipient to sign all documents in sequence.
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Recipient Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            placeholder="e.g., John Smith"
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 text-base"
          />
        </div>
        
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Link Expiration (days)
          </label>
          <input
            type="number"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(Number(e.target.value))}
            min="1"
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 text-base"
          />
        </div>
        
        <div className="flex gap-3 pt-4">
          <Button onClick={handleCreateSession} variant="primary" className="flex-1" disabled={loading}>
            {loading ? '⟳ Creating...' : '✓ Create Session'}
          </Button>
          <Button onClick={onClose} variant="secondary" className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}