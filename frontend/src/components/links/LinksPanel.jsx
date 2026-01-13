import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'
import { useApi } from '../../hooks/useApi'
import { useClipboard } from '../../hooks/useClipboard'
import { tokenAPI } from '../../services/api'
import { GenerateLinkModal } from './GenerateLinkModal'

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
      const versionSpecificTokens = data.filter((t) => t.version_id === version?.id)
      setTokens(versionSpecificTokens)
    } catch (err) {
      console.error('Failed to load tokens:', err)
    }
  }

  const handleRevoke = async (token) => {
    try {
      await revokeToken(token)
      setTokens(tokens.map((t) => (t.token === token ? { ...t, revoked: true } : t)))
    } catch (err) {
      console.error('Failed to revoke token:', err)
    }
  }

  const handleLinkGenerated = async () => {
    await loadTokens()
    setShowModal(false)
  }

  // Check if links can be generated
  const canGenerateLink = version && ['locked', 'partially_signed', 'completed'].includes(version.status)

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'partially_signed':
        return 'bg-yellow-100 text-yellow-800'
      case 'locked':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getTokenStatusIcon = (token) => {
    if (token.revoked) return '🚫'
    if (token.used && token.single_use) return '✓'
    return token.scope === 'sign' ? '✍️' : '👁️'
  }

  const getTokenStatusText = (token) => {
    if (token.revoked) return 'Revoked'
    if (token.used && token.single_use) return 'Used'
    return 'Active'
  }

  return (
    <div className="space-y-4">
      {/* Generate Link Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Generate Signing Links</h3>
        </div>

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
                    setExpandedTokenId(
                      expandedTokenId === token.id ? null : token.id
                    )
                  }
                  className="p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-lg">
                      {getTokenStatusIcon(token)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {token.scope === 'sign' ? 'Sign Link' : 'View Only'}
                        {' • '}
                        {token.single_use ? 'Single-use' : 'Multi-use'}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {token.token.slice(0, 16)}...
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        token.revoked
                          ? 'bg-red-100 text-red-800'
                          : token.used && token.single_use
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {getTokenStatusText(token)}
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
                          disabled={token.revoked}
                        >
                          {copied ? '✓' : 'Copy'}
                        </Button>
                      </div>
                    </div>

                    {/* Token Metadata */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="font-semibold text-gray-600">
                          Created
                        </label>
                        <p className="text-gray-700">
                          {new Date(token.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {token.expires_at && (
                        <div>
                          <label className="font-semibold text-gray-600">
                            Expires
                          </label>
                          <p className="text-gray-700">
                            {new Date(token.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Signatures Section */}
                    {token.signatures && token.signatures.length > 0 && (
                      <div className="border-t pt-3">
                        <label className="text-xs font-semibold text-gray-600 uppercase mb-2 block">
                          Signatures ({token.signatures.length})
                        </label>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {token.signatures.map((sig, idx) => (
                            <div
                              key={sig.id}
                              className="bg-gray-50 p-2 rounded text-xs"
                            >
                              <div className="font-medium text-gray-800">
                                {idx + 1}. {sig.signer_name_display}
                              </div>
                              <div className="text-gray-500 mt-1">
                                Signed:{' '}
                                {new Date(sig.signed_at).toLocaleString()}
                              </div>
                              {sig.field_values && sig.field_values.length > 0 && (
                                <div className="text-gray-600 mt-1">
                                  Fields filled: {sig.field_values.length}
                                  <div className="mt-1 ml-2 space-y-1">
                                    {sig.field_values.map((fv, fidx) => (
                                      <div key={fidx} className="text-gray-500">
                                        • Field {fv.field_id}: {fv.value}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
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
        onSuccess={handleLinkGenerated}
      />
    </div>
  )
}