import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'
import { useApi } from '../../hooks/useApi'
import { useClipboard } from '../../hooks/useClipboard'
import { tokenAPI } from '../../services/api'
import { GenerateLinkModal } from './GenerateLinkModal'
import { getRecipientBadgeClasses } from '../../utils/recipientColors'

export const LinksPanel = ({ document, version }) => {
  const [tokens, setTokens] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [expandedTokenId, setExpandedTokenId] = useState(null)
  const { copy, copied } = useClipboard()

  const { execute: listTokens, loading } = useApi(() =>
    tokenAPI.listForDocument(document.id)
  )

  const { execute: revokeToken } = useApi((token) => tokenAPI.revoke(token))

  useEffect(() => {
    loadTokens()
  }, [document.id])

  const loadTokens = async () => {
    try {
      const data = await listTokens()
      const versionTokens = data.filter(t => t.version_id === version.id)
      setTokens(versionTokens)
    } catch (err) {
      console.error('Failed to load tokens:', err)
    }
  }

  const handleRevoke = async (tokenStr) => {
    if (!window.confirm('Revoke this link? It will no longer be accessible.')) {
      return
    }

    try {
      await revokeToken(tokenStr)
      await loadTokens()
    } catch (err) {
      alert('Failed to revoke token')
    }
  }

  const handleGenerateSuccess = () => {
    loadTokens()
  }

  const canGenerateLink = version.status !== 'draft'

  const getTokenStatusBadge = (token) => {
    if (token.revoked) {
      return { text: 'Revoked', color: 'bg-red-100 text-red-800', icon: '✕' }
    }
    if (token.scope === 'sign') {
      return token.used 
        ? { text: 'Signed', color: 'bg-green-100 text-green-800', icon: '✓' }
        : { text: 'Active', color: 'bg-blue-100 text-blue-800', icon: '⏱' }
    }
    return { text: 'View', color: 'bg-gray-100 text-gray-800', icon: '👁' }
  }

  const getTokenStatusText = (token) => {
    if (token.revoked) return 'Revoked'
    if (token.scope === 'sign') {
      if (token.used) return 'Signed'
      return `Sign (${token.recipient})`
    }
    return 'View'
  }

  // Get all recipients from version
  const allRecipients = version.recipients || []

  const formatExpiryDate = (expiresAt) => {
    if (!expiresAt) return 'Never'
    return new Date(expiresAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900">Signing Links</h3>
        {canGenerateLink && (
          <Button
            onClick={() => setShowModal(true)}
            variant="primary"
            size="sm"
          >
            + Generate Link
          </Button>
        )}
      </div>

      {!canGenerateLink && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            📋 Lock the document first to generate signing links
          </p>
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-gray-500">Loading links...</div>
      )}

      {tokens.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          No links created yet
        </div>
      )}

      {/* Token List */}
      <div className="space-y-3">
        {tokens.map((token) => {
          const badge = getTokenStatusBadge(token)
          return (
            <div key={token.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              {/* Token Header */}
              <div
                onClick={() =>
                  setExpandedTokenId(expandedTokenId === token.id ? null : token.id)
                }
                className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 cursor-pointer flex justify-between items-center transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-xs px-3 py-1 rounded-full font-semibold inline-flex items-center gap-1 ${badge.color}`}>
                      <span>{badge.icon}</span>
                      {badge.text}
                    </span>
                    
                    {token.recipient && (
                      <span className={getRecipientBadgeClasses(token.recipient, allRecipients)}>
                        {token.recipient}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>Created: {new Date(token.created_at).toLocaleDateString()}</div>
                    {token.expires_at && (
                      <div>Expires: {formatExpiryDate(token.expires_at)}</div>
                    )}
                  </div>
                  
                  {/* Recipient Status for Sign Tokens */}
                  {token.recipient_status && (
                    <div className="text-xs mt-2">
                      <span className={`inline-flex items-center gap-1 ${
                        token.recipient_status.completed 
                          ? 'text-green-600' 
                          : 'text-yellow-600'
                      }`}>
                        {token.recipient_status.signed}/{token.recipient_status.total} fields
                        {token.recipient_status.completed && ' ✓'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-gray-400 ml-4">
                  {expandedTokenId === token.id ? '▼' : '▶'}
                </div>
              </div>

              {/* Token Details - Expandable */}
              {expandedTokenId === token.id && (
                <div className="p-4 bg-white border-t space-y-4">
                  {/* Link Info */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase mb-2 block">
                      Signing Link
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={token.public_url}
                        className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded font-mono"
                      />
                      <Button
                        onClick={() => copy(token.public_url)}
                        variant="secondary"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        {copied ? '✓ Copied' : '📋 Copy'}
                      </Button>
                    </div>
                  </div>

                  {/* Signature Events */}
                  {token.signatures && token.signatures.length > 0 && (
                    <div className="border-t pt-4">
                      <label className="text-xs font-semibold text-gray-600 uppercase mb-2 block">
                        Signature Events ({token.signatures.length})
                      </label>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {token.signatures.map((sig, idx) => (
                          <div key={idx} className="text-xs p-3 bg-green-50 rounded border border-green-200">
                            <div className="flex items-center justify-between mb-1">
                              {sig.recipient && (
                                <span className={getRecipientBadgeClasses(sig.recipient, allRecipients)}>
                                  {sig.recipient}
                                </span>
                              )}
                              <span className="text-green-600 font-semibold">✓ Signed</span>
                            </div>
                            <div className="font-medium text-gray-900 mt-1">
                              {sig.signer_name_display}
                            </div>
                            <div className="text-gray-500 mt-1">
                              {new Date(sig.signed_at).toLocaleString()}
                            </div>
                            {sig.ip_address && (
                              <div className="text-gray-400 text-[10px] mt-1">
                                IP: {sig.ip_address}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2 border-t">
                    {!token.revoked && (
                      <Button
                        onClick={() => handleRevoke(token.token)}
                        variant="danger"
                        size="sm"
                        className="flex-1"
                      >
                        🔗 Revoke Link
                      </Button>
                    )}
                    {token.revoked && (
                      <div className="flex-1 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 text-center font-medium">
                        This link has been revoked
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Generate Link Modal */}
      <GenerateLinkModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        document={document}
        version={version}
        onSuccess={handleGenerateSuccess}
      />
    </div>
  )
}