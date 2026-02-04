/**
 * ✅ NEW: Display verification status summary
 */

export const VerificationStatus = ({ result }) => {
  if (!result) {
    return null
  }

  const { valid, event_hash_valid, document_hash_valid, signed_pdf_hash_valid } = result

  const Status = ({ label, isValid }) => (
    <div className="flex items-center gap-2 p-2 rounded text-xs">
      <span className={`text-lg ${isValid ? 'text-green-600' : 'text-red-600'}`}>
        {isValid ? '✓' : '✕'}
      </span>
      <span className={isValid ? 'text-green-800' : 'text-red-800'}>{label}</span>
    </div>
  )

  return (
    <div className={`p-4 rounded-lg border-2 ${valid ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
      <p className={`font-bold mb-3 ${valid ? 'text-green-900' : 'text-red-900'}`}>
        {valid ? '✓ Signature Valid' : '✕ Signature Invalid'}
      </p>

      <div className="space-y-1">
        <Status label="Event Hash" isValid={event_hash_valid} />
        <Status label="Document Hash" isValid={document_hash_valid} />
        {signed_pdf_hash_valid !== undefined && (
          <Status label="Signed PDF Hash" isValid={signed_pdf_hash_valid} />
        )}
      </div>
    </div>
  )
}