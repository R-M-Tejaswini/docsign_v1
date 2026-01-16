import { useState } from 'react'
import { Button } from '../ui/Button'
import { useApi } from '../../hooks/useApi'
import { useClipboard } from '../../hooks/useClipboard'
import { documentAPI } from '../../services/api'

export const AuditTrailPanel = ({ document: doc, version }) => {
  const [expandedSignatureId, setExpandedSignatureId] = useState(null)
  const [showMetadata, setShowMetadata] = useState({})
  const [verifying, setVerifying] = useState({})
  const [verificationResults, setVerificationResults] = useState({})
  const { copy, copied } = useClipboard()

  const { execute: verifySignature } = useApi((docId, versionId, sigId) =>
    documentAPI.verifySignature(docId, versionId, sigId)
  )

  // ✅ FIXED - use doc.id instead of document.id
  const { execute: downloadAuditExport } = useApi(() =>
    documentAPI.downloadAuditExport(doc.id, version.id)
  )

  const handleVerifySignature = async (signatureId) => {
    setVerifying((prev) => ({ ...prev, [signatureId]: true }))
    try {
      const result = await verifySignature(doc.id, version.id, signatureId)
      setVerificationResults((prev) => ({ ...prev, [signatureId]: result }))
    } catch (err) {
      console.error('Verification failed:', err)
    } finally {
      setVerifying((prev) => ({ ...prev, [signatureId]: false }))
    }
  }

  const handleDownloadAudit = async () => {
    try {
      const blob = await downloadAuditExport()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')  // ✅ Global document API
      link.href = url
      link.download = `audit_export_${doc.title}_v${version.version_number}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download audit export:', err)
    }
  }

  const toggleMetadata = (sigId) => {
    setShowMetadata((prev) => ({ ...prev, [sigId]: !prev[sigId] }))
  }

  if (!version.signatures || version.signatures.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No signatures yet
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with Export */}
      <div className="flex justify-between items-center pb-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900">Audit Trail</h3>
        {version.status === 'completed' && (
          <Button
            onClick={handleDownloadAudit}
            variant="secondary"
            size="sm"
          >
            📦 Download Audit Package
          </Button>
        )}
      </div>

      {/* Signed PDF Hash */}
      {version.signed_pdf_sha256 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <p className="text-blue-600 font-semibold mb-1">Signed PDF Hash</p>
              <code className="text-[10px] break-all text-blue-800">
                {version.signed_pdf_sha256}
              </code>
            </div>
            <Button
              onClick={() => copy(version.signed_pdf_sha256)}
              variant="secondary"
              size="sm"
              className="ml-2 whitespace-nowrap"
            >
              {copied ? '✓' : '📋'}
            </Button>
          </div>
        </div>
      )}

      {/* Signature Events */}
      <div className="space-y-3">
        {version.signatures.map((sig) => {
          const verResult = verificationResults[sig.id]
          const isVerified = verResult?.valid
          const isExpanded = expandedSignatureId === sig.id

          return (
            <div key={sig.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              {/* Header */}
              <div
                onClick={() => setExpandedSignatureId(isExpanded ? null : sig.id)}
                className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 cursor-pointer flex justify-between items-center transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {/* Verification Status */}
                    {verResult ? (
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                        isVerified
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {isVerified ? '✓ Valid' : '✕ Invalid'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                        ⏱ Not Verified
                      </span>
                    )}

                    {/* Recipient Badge */}
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {sig.recipient}
                    </span>
                  </div>

                  {/* Basic Info */}
                  <div className="text-sm font-medium text-gray-900">{sig.signer_name_display}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(sig.signed_at).toLocaleString()}
                  </div>
                </div>

                <div className="text-gray-400 ml-4">
                  {isExpanded ? '▼' : '▶'}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="p-4 bg-white border-t space-y-4">
                  {/* Event Hash */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase mb-2 block">
                      Event Hash (Tamper Detection)
                    </label>
                    <div className="flex gap-2">
                      <code className="flex-1 text-xs bg-gray-50 border border-gray-300 rounded px-3 py-2 break-all">
                        {sig.event_hash}
                      </code>
                      <Button
                        onClick={() => copy(sig.event_hash)}
                        variant="secondary"
                        size="sm"
                      >
                        {copied ? '✓' : '📋'}
                      </Button>
                    </div>
                  </div>

                  {/* Document SHA256 */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase mb-2 block">
                      Document Hash (At Sign Time)
                    </label>
                    <code className="text-xs bg-gray-50 border border-gray-300 rounded px-3 py-2 block break-all">
                      {sig.document_sha256}
                    </code>
                  </div>

                  {/* Field Values */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase mb-2 block">
                      Fields Signed
                    </label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {sig.field_values.map((fv, idx) => (
                        <div key={idx} className="text-xs bg-gray-50 p-2 rounded border border-gray-200">
                          <span className="font-medium text-gray-700">Field {fv.field_id}:</span>
                          <span className="ml-2 text-gray-600">{fv.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Metadata Toggle */}
                  <button
                    onClick={() => toggleMetadata(sig.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {showMetadata[sig.id] ? '▼ Hide Metadata' : '▶ Show Metadata'}
                  </button>

                  {showMetadata[sig.id] && (
                    <div className="border-t pt-3 space-y-2">
                      {sig.ip_address && (
                        <div className="text-xs">
                          <span className="font-medium text-gray-700">IP Address:</span>
                          <span className="ml-2 text-gray-600 font-mono">{sig.ip_address}</span>
                        </div>
                      )}
                      {sig.user_agent && (
                        <div className="text-xs">
                          <span className="font-medium text-gray-700">User Agent:</span>
                          <span className="ml-2 text-gray-600 text-[10px] break-all">{sig.user_agent}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verification Section */}
                  <div className="border-t pt-3">
                    {verResult ? (
                      <div className={`text-xs p-3 rounded ${
                        isVerified
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <div className="font-medium mb-2">
                          {isVerified ? '✓ Verification Passed' : '✕ Verification Failed'}
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>Event Hash Match:</span>
                            <span className={verResult.verification_details.event_hash_match ? 'text-green-700' : 'text-red-700'}>
                              {verResult.verification_details.event_hash_match ? '✓' : '✕'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>PDF Hash Match:</span>
                            <span className={verResult.verification_details.pdf_hash_match ? 'text-green-700' : 'text-red-700'}>
                              {verResult.verification_details.pdf_hash_match ? '✓' : '✕'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Signed PDF Match:</span>
                            <span className={verResult.verification_details.signed_pdf_hash_match ? 'text-green-700' : 'text-red-700'}>
                              {verResult.verification_details.signed_pdf_hash_match ? '✓' : '✕'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleVerifySignature(sig.id)}
                        disabled={verifying[sig.id]}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                      >
                        {verifying[sig.id] ? '🔍 Verifying...' : '🔍 Verify Signature'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}