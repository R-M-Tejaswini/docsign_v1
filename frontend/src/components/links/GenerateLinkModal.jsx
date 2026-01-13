import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useApi } from '../../hooks/useApi'
import { tokenAPI } from '../../services/api'

export const GenerateLinkModal = ({ isOpen, onClose, document, version, onSuccess }) => {
  const [scope, setScope] = useState('sign')
  const [singleUse, setSingleUse] = useState(true)
  const [expiresInDays, setExpiresInDays] = useState(7)
  
  const { execute: createToken, loading, error } = useApi(
    (data) => tokenAPI.create(document.id, version.id, data)
  )

  // Determine available scopes based on version status
  const getAvailableScopes = () => {
    if (version.status === 'draft') {
      return [] // No links can be generated for draft
    }
    
    const scopes = []
    
    // View links available for any non-draft document
    scopes.push({ value: 'view', label: 'View Only' })
    
    // Sign links only for locked and partially_signed
    if (['locked', 'partially_signed'].includes(version.status)) {
      scopes.push({ value: 'sign', label: 'Allow Signing' })
    }
    
    return scopes
  }

  const availableScopes = getAvailableScopes()

  // Reset scope if it's no longer available
  useEffect(() => {
    if (!availableScopes.find(s => s.value === scope)) {
      setScope(availableScopes[0]?.value || 'view')
    }
  }, [version.status])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!scope) {
      alert('Invalid scope selected')
      return
    }

    try {
      const token = await createToken({
        scope,
        single_use: singleUse,
        expires_in_days: expiresInDays || null,
      })
      onSuccess?.(token)
      onClose()
    } catch (err) {
      console.error('Failed to create token:', err)
    }
  }

  const getStatusMessage = () => {
    if (version.status === 'draft') {
      return 'Please lock the document first before generating links'
    }
    if (version.status === 'completed') {
      return 'All fields have been signed. You can only generate view-only links.'
    }
    return `Document status: ${version.status}`
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generate Signing Link" size="md">
      {availableScopes.length === 0 ? (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          {getStatusMessage()}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Link Type
            </label>
            <div className="space-y-2">
              {availableScopes.map((option) => (
                <label key={option.value} className="flex items-center">
                  <input
                    type="radio"
                    name="scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={(e) => setScope(e.target.value)}
                    className="rounded"
                  />
                  <span className="ml-2 text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {scope === 'sign' && (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="single_use"
                checked={singleUse}
                onChange={(e) => setSingleUse(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="single_use" className="ml-2 text-sm">
                Single-use link (expires after first use)
              </label>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expires In (days)
            </label>
            <input
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Leave empty for no expiry"
              className="w-full px-3 py-2 border rounded text-sm"
              min="1"
            />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <p className="text-xs text-gray-500">
            {scope === 'view' 
              ? 'View-only links allow recipients to see the document but not sign it.'
              : 'Signing links allow recipients to fill in and sign the remaining fields.'}
          </p>

          <div className="flex gap-2 justify-end pt-4">
            <Button onClick={onClose} variant="secondary" size="sm">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={loading}>
              {loading ? 'Creating...' : 'Generate Link'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}