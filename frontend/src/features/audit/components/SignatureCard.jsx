/**
 * ✅ NEW: Display individual signature with verification status
 */

import { useState } from 'react'
import { Button } from '../../../shared/components/ui/Button'
import { useClipboard } from '../../../shared/hooks/useClipboard'

export const SignatureCard = ({ signature, onVerify, verifying, verificationResult }) => {
  const { copy, copied } = useClipboard()
  const [showDetails, setShowDetails] = useState(false)

  const handleVerify = async () => {
    await onVerify(signature.id)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="bg-white rounded-lg border-2 border-gray-300 p-4 hover:border-gray-400 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-900">{signature.signer_name}</p>
          <p className="text-xs text-gray-600">{signature.recipient}</p>
        </div>
        {verificationResult?.[signature.id] && (
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              verificationResult[signature.id].valid
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {verificationResult[signature.id].valid ? '✓ Valid' : '✕ Invalid'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-2 mb-3 text-xs text-gray-600">
        <p>Signed: {formatDate(signature.signed_at)}</p>
        {signature.ip_address && <p>IP: {signature.ip_address}</p>}
      </div>

      {/* Hash (short display) */}
      <div className="bg-gray-50 p-2 rounded border border-gray-300 mb-3">
        <p className="text-xs text-gray-600">Document Hash:</p>
        <p className="text-xs font-mono text-gray-900 truncate">{signature.document_sha256}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={handleVerify}
          disabled={verifying}
          className="flex-1"
        >
          {verifying ? 'Verifying...' : 'Verify'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => copy(signature.document_sha256)}
          className="flex-1"
        >
          {copied ? '✓ Copied' : 'Copy Hash'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowDetails(!showDetails)}
          className="flex-1"
        >
          Details
        </Button>
      </div>

      {/* Details Panel */}
      {showDetails && verificationResult?.[signature.id] && (
        <div className="mt-4 p-3 bg-gray-50 border-t-2 border-gray-300 text-xs space-y-2">
          <div>
            <p className="font-bold text-gray-900">Event Hash:</p>
            <p className="font-mono text-gray-600 break-all">{signature.event_hash}</p>
            <p
              className={`text-xs mt-1 font-bold ${
                verificationResult[signature.id].event_hash_valid
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {verificationResult[signature.id].event_hash_valid ? '✓ Valid' : '✕ Invalid'}
            </p>
          </div>

          <div>
            <p className="font-bold text-gray-900">Field Values:</p>
            {signature.field_values && signature.field_values.length > 0 ? (
              <div className="space-y-1 mt-1">
                {signature.field_values.map((fv, idx) => (
                  <p key={idx} className="text-gray-600">
                    Field {fv.field_id}: {fv.value ? '✓ Filled' : '○ Empty'}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-gray-600">No field values</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}