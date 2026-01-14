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
      // Filter tokens for this specific version
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

  return (
    <div className="p-6 space-y-6">
      {/* Generate Link Button */}
      <div>
        <Button
          onClick={() => setShowModal(true)}
          variant="primary"
          size="sm"
          disabled={!canGenerateLink}
          className="w-full"
        >
          + Generate New Link
        </Button>

        {!canGenerateLink && (
          <p className="text-xs text-red-600 mt-2">
            Lock document first to generate links
          </p>
        )}
      </div>

      {/* Links List Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">All Links ({tokens.length})</h3>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading links...</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No links generated yet
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {tokens.map((token) => (
              <div key={token.id} className="border rounded-lg overflow-hidden">
                {/* Token Header */}
                <div
                  onClick={() =>
                    setExpandedTokenId(expandedTokenId === token.id ? null : token.id)
                  }
                  className="p-3 bg-gray-50 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          token.revoked
                            ? 'bg-red-100 text-red-800'
                            : token.scope === 'sign' && token.used
                            ? 'bg-green-100 text-green-800'
                            : token.scope === 'sign'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {getTokenStatusText(token)}
                      </span>
                      
                      {/* Show recipient badge for sign tokens */}
                      {token.recipient && (
                        <span className={getRecipientBadgeClasses(token.recipient, allRecipients)}>
                          {token.recipient}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Created: {new Date(token.created_at).toLocaleDateString()}
                    </div>
                    {token.expires_at && (
                      <div className="text-xs text-gray-500">
                        Expires: {new Date(token.expires_at).toLocaleDateString()}
                      </div>
                    )}
                    {/* Show recipient status for sign tokens */}
                    {token.recipient_status && (
                      <div className="text-xs mt-1">
                        <span className={`${
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
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        token.revoked
                          ? 'bg-red-100 text-red-800'
                          : token.used
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {token.revoked ? 'Revoked' : token.used ? 'Used' : 'Active'}
                    </span>
                    <span className="text-gray-400">
                      {expandedTokenId === token.id ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {/* Token Details - Expandable */}
                {expandedTokenId === token.id && (
                  <div className="p-4 bg-white border-t space-y-3">
                    {/* Link Info */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase">
                        Link
                      </label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          readOnly
                          value={token.public_url}
                          className="flex-1 px-2 py-1 text-xs bg-gray-50 border rounded"
                        />
                        <Button
                          onClick={() => copy(token.public_url)}
                          variant="secondary"
                          size="sm"
                        >
                          {copied ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    </div>

                    {/* Signature Events */}
                    {token.signatures && token.signatures.length > 0 && (
                      <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase">
                          Signature Events ({token.signatures.length})
                        </label>
                        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                          {token.signatures.map((sig, idx) => (
                            <div key={idx} className="text-xs p-2 bg-gray-50 rounded border">
                              <div className="flex items-center justify-between mb-1">
                                {sig.recipient && (
                                  <span className={getRecipientBadgeClasses(sig.recipient, allRecipients)}>
                                    {sig.recipient}
                                  </span>
                                )}
                                <span className="text-green-600">✓ Signed</span>
                              </div>
                              <div className="font-medium text-gray-900">
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
                          Revoke
                        </Button>
                      )}
                      {token.revoked && (
                        <div className="flex-1 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 text-center">
                          This link has been revoked
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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