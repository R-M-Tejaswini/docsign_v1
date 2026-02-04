/**
 * ✅ CONSOLIDATED: Removed version concept
 * Now displays audit trail directly for documents (no version_id)
 */

import { useState } from 'react'
import { Button } from '../ui/Button'
import { useApi } from '../../hooks/useApi'
import { useClipboard } from '../../hooks/useClipboard'
import { documentAPI } from '../../services/api'

export const AuditTrailPanel = ({ document: doc }) => {  // ✅ Removed version prop
  const [expandedSignatureId, setExpandedSignatureId] = useState(null)
  const [showMetadata, setShowMetadata] = useState({})
  const [verifying, setVerifying] = useState({})
  const [verificationResults, setVerificationResults] = useState({})
  const { copy, copied } = useClipboard()

  // ✅ CONSOLIDATED: No version_id parameter
  const { execute: verifySignature } = useApi((sigId) =>
    documentAPI.verifySignature(doc.id, sigId)
  )

  const { execute: downloadAuditExport } = useApi(() =>
    documentAPI.downloadAuditExport(doc.id)
  )

  const handleVerifySignature = async (signatureId) => {
    setVerifying((prev) => ({ ...prev, [signatureId]: true }))
    try {
      const result = await verifySignature(signatureId)
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
      link.download = `${doc.title}_audit_export.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Failed to download audit export: ' + err.message)
    }
  }

  const signatures = doc.signatures || []

  return (
    <div className="space-y-4">
      {/* Export Button */}
      {signatures.length > 0 && (
        <Button
          onClick={handleDownloadAudit}
          variant="primary"
          className="w-full"
        >
          <span>📦</span>
          Export Audit Package
        </Button>
      )}

      {/* Audit Trail */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {signatures.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            <p className="text-sm">No signatures yet</p>
          </div>
        ) : (
          signatures.map((signature) => {
            const isExpanded = expandedSignatureId === signature.id
            const result = verificationResults[signature.id]
            
            return (
              <div
                key={signature.id}
                className="border-2 border-gray-300 rounded-lg overflow-hidden"
              >
                {/* Header */}
                <button
                  onClick={() => setExpandedSignatureId(isExpanded ? null : signature.id)}
                  className="w-full p-4 bg-gray-50 hover:bg-gray-100 text-left transition-all flex justify-between items-center"
                >
                  <div className="flex-1">
                    <div className="font-bold text-gray-900">{signature.signer_name}</div>
                    <div className="text-xs text-gray-600">
                      {new Date(signature.signed_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-4 bg-white border-t-2 border-gray-200 space-y-3">
                    {/* Signature Info */}
                    <div>
                      <label className="text-xs font-bold text-gray-600 uppercase mb-2 block">
                        Signature Information
                      </label>
                      <div className="text-sm space-y-1">
                        <p><span className="font-semibold">Recipient:</span> {signature.recipient}</p>
                        <p><span className="font-semibold">IP Address:</span> {signature.ip_address || 'N/A'}</p>
                        <p><span className="font-semibold">Event Hash:</span> <code className="text-xs bg-gray-100 px-2 py-1 rounded">{signature.event_hash?.substring(0, 16)}...</code></p>
                      </div>
                    </div>

                    {/* Verify Button */}
                    <Button
                      onClick={() => handleVerifySignature(signature.id)}
                      variant="secondary"
                      className="w-full"
                      disabled={verifying[signature.id]}
                    >
                      {verifying[signature.id] ? (
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

                    {/* Verification Result */}
                    {result && (
                      <div className={`p-3 rounded-lg border-2 ${
                        result.valid
                          ? 'bg-green-50 border-green-300'
                          : 'bg-red-50 border-red-300'
                      }`}>
                        <p className={`text-sm font-bold ${result.valid ? 'text-green-900' : 'text-red-900'}`}>
                          {result.valid ? '✓ Signature Valid' : '✗ Signature Invalid'}
                        </p>
                      </div>
                    )}

                    {/* Field Values */}
                    {signature.field_values && signature.field_values.length > 0 && (
                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase mb-2 block">
                          Fields Signed ({signature.field_values.length})
                        </label>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {signature.field_values.map((fv, idx) => (
                            <div key={idx} className="text-xs p-2 bg-gray-50 rounded border border-gray-200">
                              <p><span className="font-semibold">Field {fv.field_id}:</span> {fv.value?.substring(0, 50)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}