import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useApi } from '../../hooks/useApi'
import { tokenAPI, documentAPI } from '../../services/api'
import { getRecipientBadgeClasses } from '../../utils/recipientColors'

export const GenerateLinkModal = ({ isOpen, onClose, document, version, onSuccess }) => {
  const [linkType, setLinkType] = useState('sign')
  const [selectedRecipient, setSelectedRecipient] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [availableRecipients, setAvailableRecipients] = useState([])
  const [loading, setLoading] = useState(false)

  const { execute: createToken } = useApi((data) =>
    tokenAPI.create(document.id, version.id, data)
  )

  const { execute: getRecipients } = useApi(() =>
    documentAPI.getAvailableRecipients(document.id, version.id)
  )

  useEffect(() => {
    if (isOpen && version) {
      loadAvailableRecipients()
    }
  }, [isOpen, version?.id])

  const loadAvailableRecipients = async () => {
    try {
      setLoading(true)
      const data = await getRecipients()
      setAvailableRecipients(data.recipients || [])
      
      // Pre-select first available recipient for sign links
      const available = data.recipients?.find(r => r.can_generate_sign_link)
      if (available && linkType === 'sign') {
        setSelectedRecipient(available.recipient)
      }
    } catch (err) {
      console.error('Failed to load recipients:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (linkType === 'sign' && !selectedRecipient) {
      alert('Please select a recipient for the sign link')
      return
    }

    try {
      const tokenData = {
        scope: linkType,
        expires_in_days: expiresInDays || null,
      }

      if (linkType === 'sign') {
        tokenData.recipient = selectedRecipient
      }

      await createToken(tokenData)
      onSuccess?.()
      handleClose()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate link')
    }
  }

  const handleClose = () => {
    setLinkType('sign')
    setSelectedRecipient('')
    setExpiresInDays(7)
    onClose()
  }

  const handleLinkTypeChange = (type) => {
    setLinkType(type)
    if (type === 'view') {
      setSelectedRecipient('')
    } else {
      // Auto-select first available recipient
      const available = availableRecipients.find(r => r.can_generate_sign_link)
      if (available) {
        setSelectedRecipient(available.recipient)
      }
    }
  }

  const allRecipients = availableRecipients.map(r => r.recipient)
  const canGenerateSignLinks = availableRecipients.some(r => r.can_generate_sign_link)

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Generate Signing Link" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Link Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Link Type
          </label>
          <div className="space-y-2">
            <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="linkType"
                value="sign"
                checked={linkType === 'sign'}
                onChange={(e) => handleLinkTypeChange(e.target.value)}
                disabled={!canGenerateSignLinks}
                className="text-blue-500 focus:ring-blue-500"
              />
              <div className="ml-3">
                <div className="font-medium text-gray-900">Sign Link</div>
                <div className="text-xs text-gray-500">
                  Single-use link for a specific recipient to sign their fields
                </div>
              </div>
            </label>

            <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="linkType"
                value="view"
                checked={linkType === 'view'}
                onChange={(e) => handleLinkTypeChange(e.target.value)}
                className="text-blue-500 focus:ring-blue-500"
              />
              <div className="ml-3">
                <div className="font-medium text-gray-900">View Link</div>
                <div className="text-xs text-gray-500">
                  Unlimited-use link for viewing the document
                </div>
              </div>
            </label>
          </div>
          
          {!canGenerateSignLinks && (
            <p className="text-xs text-red-600 mt-2">
              All recipients have already signed or have active sign links
            </p>
          )}
        </div>

        {/* Recipient Selection (Sign Links Only) */}
        {linkType === 'sign' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Recipient *
            </label>
            
            {loading ? (
              <div className="text-sm text-gray-500">Loading recipients...</div>
            ) : availableRecipients.length === 0 ? (
              <div className="text-sm text-red-600">No recipients available</div>
            ) : (
              <div className="space-y-2">
                {availableRecipients.map((recipientInfo) => {
                  const isAvailable = recipientInfo.can_generate_sign_link
                  const isSelected = selectedRecipient === recipientInfo.recipient
                  
                  return (
                    <label
                      key={recipientInfo.recipient}
                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer ${
                        isAvailable
                          ? isSelected
                            ? 'bg-blue-50 border-blue-500'
                            : 'hover:bg-gray-50'
                          : 'bg-gray-100 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <div className="flex items-center flex-1">
                        <input
                          type="radio"
                          name="recipient"
                          value={recipientInfo.recipient}
                          checked={isSelected}
                          onChange={(e) => setSelectedRecipient(e.target.value)}
                          disabled={!isAvailable}
                          className="text-blue-500 focus:ring-blue-500"
                        />
                        <div className="ml-3 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={getRecipientBadgeClasses(recipientInfo.recipient, allRecipients)}>
                              {recipientInfo.recipient}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {recipientInfo.signed_fields}/{recipientInfo.total_fields} fields signed
                          </div>
                          {!isAvailable && recipientInfo.reason && (
                            <div className="text-xs text-red-600 mt-1">
                              {recipientInfo.reason}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {recipientInfo.completed && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          ✓ Completed
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Expiry Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Expires In (Days)
          </label>
          <input
            type="number"
            min="1"
            max="365"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(parseInt(e.target.value) || '')}
            placeholder="Leave empty for no expiry"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave empty for links that never expire
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleClose} variant="secondary" className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            disabled={linkType === 'sign' && !selectedRecipient}
          >
            Generate Link
          </Button>
        </div>
      </form>
    </Modal>
  )
}