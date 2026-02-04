/**
 * ✅ CONSOLIDATED: Removed version concept
 * Now displays links directly for documents (no version_id)
 */

import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'
import { useApi } from '../../hooks/useApi'
import { useClipboard } from '../../hooks/useClipboard'
import { tokenAPI } from '../../services/api'
import { GenerateLinkModal } from './GenerateLinkModal'
import { getRecipientBadgeClasses } from '../../utils/recipientColors'

// ✅ UPDATED: Removed version prop
export const LinksPanel = ({ document }) => {
  const [tokens, setTokens] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [expandedTokenId, setExpandedTokenId] = useState(null)
  const { copy, copied } = useClipboard()

  // ✅ UPDATED: Only document.id (no version.id)
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
      // ✅ UPDATED: Removed version_id filter (all tokens belong to document directly now)
      setTokens(Array.isArray(data) ? data : data.results || [])
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

  // ✅ UPDATED: document.status (no version.status)
  const canGenerateLink = document.status !== 'draft'

  const getTokenStatusBadge = (token) => {
    if (token.revoked) {
      return { 
        text: 'Revoked', 
        color: 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg', 
        icon: '✕',
        ring: 'ring-red-200'
      }
    }
    if (token.scope === 'sign') {
      return token.used 
        ? { 
            text: 'Signed', 
            color: 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg', 
            icon: '✓',
            ring: 'ring-green-200'
          }
        : { 
            text: 'Active', 
            color: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg', 
            icon: '⏱',
            ring: 'ring-blue-200'
          }
    }
    return { 
      text: 'View', 
      color: 'bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-lg', 
      icon: '👁',
      ring: 'ring-gray-200'
    }
  }

  // ✅ UPDATED: document.recipients (no version.recipients)
  const allRecipients = document.recipients || []

  const formatExpiryDate = (expiresAt) => {
    if (!expiresAt) return 'Never'
    return new Date(expiresAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header - Fixed at top */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Signing Links</h3>
            <p className="text-xs text-gray-600 mt-1">Manage access to this document</p>
          </div>
          {canGenerateLink && (
            <Button
              onClick={() => setShowModal(true)}
              variant="primary"
              size="sm"
            >
              <span>➕</span>
              Generate Link
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {!canGenerateLink && (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="text-sm font-bold text-yellow-900 mb-1">Document Not Locked</p>
                <p className="text-xs text-yellow-800">
                  Lock the document first to generate signing links
                </p>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600 mb-3"></div>
            <p className="text-sm text-gray-600 font-medium">Loading links...</p>
          </div>
        )}

        {tokens.length === 0 && !loading && (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-5xl mb-4">🔗</div>
            <p className="text-gray-600 font-medium">No links created yet</p>
            {canGenerateLink && (
              <p className="text-xs text-gray-500 mt-2">Click "Generate Link" to create one</p>
            )}
          </div>
        )}

        {/* Token List */}
        {tokens.map((token) => {
          const badge = getTokenStatusBadge(token)
          const isExpanded = expandedTokenId === token.id
          
          return (
            <div 
              key={token.id} 
              className="border-2 border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200 bg-white"
            >
              {/* Token Header */}
              <div
                onClick={() => setExpandedTokenId(isExpanded ? null : token.id)}
                className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 cursor-pointer flex justify-between items-center transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-xs px-3 py-1.5 rounded-full font-bold inline-flex items-center gap-1.5 ${badge.color} ring-2 ${badge.ring}`}>
                      <span>{badge.icon}</span>
                      {badge.text}
                    </span>
                    
                    {token.recipient && (
                      <span className={getRecipientBadgeClasses(token.recipient, allRecipients)}>
                        {token.recipient}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Created:</span>
                      <span>{new Date(token.created_at).toLocaleDateString()}</span>
                    </div>
                    {token.expires_at && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Expires:</span>
                        <span>{formatExpiryDate(token.expires_at)}</span>
                      </div>
                    )}
                  </div>
                  
                  {token.recipient_status && (
                    <div className="text-xs mt-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded font-semibold ${
                        token.recipient_status.completed 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {token.recipient_status.signed}/{token.recipient_status.total} fields
                        {token.recipient_status.completed && ' ✓'}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="text-gray-400 ml-4 text-xl font-bold">
                  {isExpanded ? '▼' : '▶'}
                </div>
              </div>

              {/* Token Details - Expandable */}
              {isExpanded && (
                <div className="p-4 bg-white border-t-2 border-gray-200 space-y-4">
                  {/* Link Info */}
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase mb-2 block tracking-wide">
                      Signing Link
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={token.public_url}
                        className="flex-1 px-3 py-2 text-xs bg-gray-50 border-2 border-gray-300 rounded-lg font-mono"
                      />
                      <Button
                        onClick={() => copy(token.public_url)}
                        variant="secondary"
                        size="sm"
                      >
                        {copied ? '✓ Copied' : '📋 Copy'}
                      </Button>
                    </div>
                  </div>

                  {/* Signature Events */}
                  {token.signature_events && token.signature_events.length > 0 && (
                    <div className="border-t-2 border-gray-200 pt-4">
                      <label className="text-xs font-bold text-gray-600 uppercase mb-3 block tracking-wide">
                        Signature Events ({token.signature_events.length})
                      </label>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {token.signature_events.map((sig, idx) => (
                          <div key={idx} className="text-xs p-3 bg-green-50 rounded-lg border-2 border-green-200">
                            <div className="flex items-center justify-between mb-2">
                              {sig.recipient && (
                                <span className={getRecipientBadgeClasses(sig.recipient, allRecipients)}>
                                  {sig.recipient}
                                </span>
                              )}
                              <span className="text-green-600 font-bold">✓ Signed</span>
                            </div>
                            <div className="font-bold text-gray-900 mt-1">
                              {sig.signer_name}
                            </div>
                            <div className="text-gray-600 mt-1">
                              {new Date(sig.signed_at).toLocaleString()}
                            </div>
                            {sig.ip_address && (
                              <div className="text-gray-500 text-[10px] mt-1 font-mono">
                                IP: {sig.ip_address}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2 border-t-2 border-gray-200">
                    {!token.revoked ? (
                      <Button
                        onClick={() => handleRevoke(token.token)}
                        variant="danger"
                        size="sm"
                        className="flex-1"
                      >
                        <span>🔗</span>
                        Revoke Link
                      </Button>
                    ) : (
                      <div className="flex-1 px-3 py-2 bg-red-50 border-2 border-red-300 rounded-lg text-xs text-red-800 text-center font-bold">
                        ✕ This link has been revoked
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
      {/* ✅ UPDATED: Removed version prop */}
      <GenerateLinkModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        document={document}
        onSuccess={handleGenerateSuccess}
      />
    </div>
  )
}