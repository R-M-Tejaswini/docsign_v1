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
      <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        {/* Link Type Selection */}
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-3">
            Link Type <span className="text-red-500">*</span>
          </label>
          <div className="space-y-3">
            <label className={`flex items-start p-4 border-2 rounded-xl cursor-pointer transition-all ${linkType === 'sign' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'} ${!canGenerateSignLinks ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input
                type="radio"
                name="linkType"
                value="sign"
                checked={linkType === 'sign'}
                onChange={(e) => handleLinkTypeChange(e.target.value)}
                disabled={!canGenerateSignLinks}
                className="mt-1 w-5 h-5"
              />
              <div className="ml-3 flex-1">
                <div className="font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-xl">✍️</span>
                  Sign Link
                </div>
                <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Single-use link for a specific recipient to sign their fields
                </div>
              </div>
            </label>

            <label className={`flex items-start p-4 border-2 rounded-xl cursor-pointer transition-all ${linkType === 'view' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'}`}>
              <input
                type="radio"
                name="linkType"
                value="view"
                checked={linkType === 'view'}
                onChange={(e) => handleLinkTypeChange(e.target.value)}
                className="mt-1 w-5 h-5"
              />
              <div className="ml-3 flex-1">
                <div className="font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-xl">👁️</span>
                  View Link
                </div>
                <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Unlimited-use link for viewing the document
                </div>
              </div>
            </label>
          </div>
          
          {!canGenerateSignLinks && (
            <div className="mt-3 p-3 bg-red-50 border-2 border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-red-600 text-lg">⚠️</span>
                <p className="text-xs text-red-800 font-semibold">
                  All recipients have already signed or have active sign links
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Recipient Selection (Sign Links Only) */}
        {linkType === 'sign' && (
          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-900">
              Select Recipient <span className="text-red-500">*</span>
            </label>
            
            {loading ? (
              <div className="text-sm text-gray-600 text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-4 border-blue-600 mb-2"></div>
                <p className="font-medium">Loading recipients...</p>
              </div>
            ) : availableRecipients.length === 0 ? (
              <div className="text-sm text-red-700 text-center py-8 bg-red-50 rounded-lg border-2 border-red-200">
                <p className="font-bold">No recipients available</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto border-2 border-gray-200 rounded-lg p-2">
                {availableRecipients.map((recipientInfo, idx) => {
                  const isAvailable = recipientInfo.can_generate_sign_link
                  const isSelected = selectedRecipient === recipientInfo.recipient
                  
                  return (
                    <label
                      key={`recipient-${idx}-${recipientInfo.recipient}`}
                      className={`flex items-center justify-between p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        isAvailable
                          ? isSelected
                            ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200 shadow-md'
                            : 'hover:bg-gray-50 border-gray-200 hover:border-gray-300'
                          : 'bg-gray-100 cursor-not-allowed opacity-60 border-gray-200'
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
                          className="w-5 h-5 cursor-pointer"
                        />
                        <div className="ml-3 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={getRecipientBadgeClasses(recipientInfo.recipient, allRecipients)}>
                              {recipientInfo.recipient}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 font-medium">
                            {recipientInfo.signed_fields}/{recipientInfo.total_fields} fields signed
                          </div>
                          {!isAvailable && recipientInfo.reason && (
                            <div className="text-xs text-red-600 mt-1 font-semibold">
                              {recipientInfo.reason}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {recipientInfo.completed && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold ml-2">
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
        <div className="space-y-3">
          <label className="block text-sm font-bold text-gray-900">
            Link Expiration
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value) : null)}
              min="1"
              max="365"
              placeholder="Days"
              className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 text-base font-semibold"
            />
            <span className="text-sm text-gray-700 font-semibold">days</span>
          </div>
          {expiresInDays && (
            <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="font-semibold">Expires on: </span>
              {new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t-2 border-gray-200">
          <Button onClick={handleClose} variant="secondary" className="flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1">
            <span>🔗</span>
            Generate Link
          </Button>
        </div>
      </form>
    </Modal>
  )
}