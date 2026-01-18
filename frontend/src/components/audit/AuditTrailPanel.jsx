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
      const link = document.createElement('a')
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
      <div className="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-6xl mb-4">🔍</div>
        <p className="text-gray-600 font-medium">No signatures yet</p>
        <p className="text-sm text-gray-500 mt-2">Audit trail will appear here after signing</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with Export */}
      <div className="flex justify-between items-center pb-4 border-b-2 border-gray-200">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Audit Trail</h3>
          <p className="text-xs text-gray-600 mt-1">Cryptographic proof of signatures</p>
        </div>
        {version.status === 'completed' && (
          <Button
            onClick={handleDownloadAudit}
            variant="secondary"
            size="sm"
          >
            <span>📦</span>
            Download Audit
          </Button>
        )}
      </div>

      {/* Signed PDF Hash */}
      {version.signed_pdf_sha256 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-blue-900 uppercase mb-2 tracking-wide">Signed PDF Hash</p>
              <code className="text-[10px] break-all text-blue-800 font-mono block">
                {version.signed_pdf_sha256}
              </code>
            </div>
            <Button
              onClick={() => copy(version.signed_pdf_sha256)}
              variant="secondary"
              size="sm"
              className="ml-3 flex-shrink-0"
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
            <div key={sig.id} className="border-2 border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all">
              {/* Header */}
              <div
                onClick={() => setExpandedSignatureId(isExpanded ? null : sig.id)}
                className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 cursor-pointer flex justify-between items-center transition-all"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    {/* Verification Status */}
                    {verResult ? (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg ${
                        isVerified
                          ? 'bg-gradient-to-r from-green-500 to-green-600 text-white ring-2 ring-green-200'
                          : 'bg-gradient-to-r from-red-500 to-red-600 text-white ring-2 ring-red-200'
                      }`}>
                        {isVerified ? '✓ Valid' : '✕ Invalid'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-200 text-gray-700">
                        ⏱ Not Verified
                      </span>
                    )}

                    {/* Recipient Badge */}
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border-2 border-blue-200">
                      {sig.recipient}
                    </span>
                  </div>

                  {/* Basic Info */}
                  <div className="text-sm font-bold text-gray-900">{sig.signer_name_display}</div>
                  <div className="text-xs text-gray-600 mt-1 font-semibold">
                    {new Date(sig.signed_at).toLocaleString()}
                  </div>
                </div>

                <div className="text-gray-400 ml-4 text-xl font-bold">
                  {isExpanded ? '▼' : '▶'}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="p-4 bg-white border-t-2 border-gray-200 space-y-4">
                  {/* Event Hash */}
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase mb-2 block tracking-wide">
                      Event Hash (Tamper Detection)
                    </label>
                    <div className="flex gap-2">
                      <code className="flex-1 text-xs bg-gray-50 border-2 border-gray-300 rounded-lg px-3 py-2 break-all font-mono">
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
                    <label className="text-xs font-bold text-gray-600 uppercase mb-2 block tracking-wide">
                      Document Hash (At Sign Time)
                    </label>
                    <code className="text-xs bg-gray-50 border-2 border-gray-300 rounded-lg px-3 py-2 block break-all font-mono">
                      {sig.document_sha256}
                    </code>
                  </div>

                  {/* Field Values */}
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase mb-2 block tracking-wide">
                      Fields Signed
                    </label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {sig.field_values.map((fv, idx) => (
                        <div key={idx} className="text-xs bg-gradient-to-r from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-200">
                          <span className="font-bold text-gray-900">Field {fv.field_id}:</span>
                          <span className="ml-2 text-gray-700">{fv.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Metadata Toggle */}
                  <button
                    onClick={() => toggleMetadata(sig.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline"
                  >
                    {showMetadata[sig.id] ? '▼ Hide Metadata' : '▶ Show Metadata'}
                  </button>

                  {showMetadata[sig.id] && (
                    <div className="border-t-2 border-gray-200 pt-3 space-y-2 bg-gray-50 p-3 rounded-lg">
                      {sig.ip_address && (
                        <div className="text-xs">
                          <span className="font-bold text-gray-900">IP Address:</span>
                          <span className="ml-2 text-gray-700 font-mono">{sig.ip_address}</span>
                        </div>
                      )}
                      {sig.user_agent && (
                        <div className="text-xs">
                          <span className="font-bold text-gray-900">User Agent:</span>
                          <span className="ml-2 text-gray-700 text-[10px] break-all">{sig.user_agent}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verification Section */}
                  <div className="border-t-2 border-gray-200 pt-3">
                    {verResult ? (
                      <div className={`text-xs p-4 rounded-lg ${
                        isVerified
                          ? 'bg-green-50 border-2 border-green-300'
                          : 'bg-red-50 border-2 border-red-300'
                      }`}>
                        <div className="font-bold mb-3 text-base">
                          {isVerified ? '✓ Verification Passed' : '✕ Verification Failed'}
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">Event Hash Match:</span>
                            <span className={`font-bold ${verResult.verification_details.event_hash_match ? 'text-green-700' : 'text-red-700'}`}>
                              {verResult.verification_details.event_hash_match ? '✓' : '✕'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">PDF Hash Match:</span>
                            <span className={`font-bold ${verResult.verification_details.pdf_hash_match ? 'text-green-700' : 'text-red-700'}`}>
                              {verResult.verification_details.pdf_hash_match ? '✓' : '✕'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">Signed PDF Match:</span>
                            <span className={`font-bold ${verResult.verification_details.signed_pdf_hash_match ? 'text-green-700' : 'text-red-700'}`}>
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
                        className="w-full"
                      >
                        {verifying[sig.id] ? (
                          <>
                            <span className="animate-spin">⟳</span>
                            Verifying...
                          </>
                        ) : (
                          <>
                            <span>🔍</span>
                            Verify Signature
                          </>
                        )}
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