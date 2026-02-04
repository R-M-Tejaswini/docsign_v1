/**
 * ✅ NEW: Reusable signing link card for display
 */

import { useState } from 'react'
import { Button } from '../../../shared/components/ui/Button'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { useClipboard } from '../../../shared/hooks/useClipboard'

export const LinkCard = ({ token, onRevoke, onCopy }) => {
  const { copy, copied } = useClipboard()
  const [revoking, setRevoking] = useState(false)

  const handleRevoke = async () => {
    if (!window.confirm('Revoke this link? Recipients won\'t be able to access it.')) return
    setRevoking(true)
    try {
      await onRevoke(token.token)
    } finally {
      setRevoking(false)
    }
  }

  const handleCopy = () => {
    copy(token.public_url)
    onCopy && onCopy()
  }

  const isExpired = token.expires_at && new Date(token.expires_at) < new Date()
  const daysUntilExpiry = token.expires_at
    ? Math.ceil((new Date(token.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="bg-white rounded-lg border-2 border-gray-300 p-4 hover:border-gray-400 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          {token.scope === 'sign' ? (
            <>
              <p className="text-sm font-bold text-gray-900">✍️ Sign Link</p>
              <p className="text-xs text-gray-600 mt-1">{token.recipient}</p>
            </>
          ) : (
            <p className="text-sm font-bold text-gray-900">👁️ View Link</p>
          )}
        </div>
        <StatusBadge
          type="link"
          status={token.revoked ? 'revoked' : token.used ? 'used' : 'pending'}
        />
      </div>

      {/* Status & Expiry */}
      <div className="space-y-2 mb-3 text-xs text-gray-600">
        {isExpired && (
          <p className="text-red-600 font-semibold">⚠️ Expired</p>
        )}
        {daysUntilExpiry && daysUntilExpiry > 0 && (
          <p>
            Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
          </p>
        )}
        <p>Created {new Date(token.created_at).toLocaleDateString()}</p>
      </div>

      {/* Link Preview */}
      <div className="bg-gray-50 p-2 rounded border border-gray-300 mb-3 text-xs truncate text-gray-600">
        {token.public_url}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={handleCopy}
          className="flex-1"
          disabled={token.revoked || token.used || isExpired}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleRevoke}
          className="flex-1"
          disabled={revoking || token.revoked || token.used}
        >
          {revoking ? 'Revoking...' : 'Revoke'}
        </Button>
      </div>
    </div>
  )
}