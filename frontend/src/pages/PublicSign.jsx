import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DocumentViewer } from '../components/pdf/DocumentViewer'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'
import { useApi } from '../hooks/useApi'
import { publicAPI } from '../services/api'
import { fieldPctToPx } from '../utils/coords'
import { getRecipientColor, getRecipientBadgeClasses } from '../utils/recipientColors'

export const PublicSign = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  const [pageData, setPageData] = useState(null)
  const [signerName, setSignerName] = useState('')
  const [fieldValues, setFieldValues] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [toasts, setToasts] = useState([])

  const { execute: getSignPage } = useApi(() => publicAPI.getSignPage(token))
  const { execute: submitSignature } = useApi((signData) =>
    publicAPI.submitSignature(token, signData)
  )

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts([...toasts, { id, message, type, duration: 3000 }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  useEffect(() => {
    loadSignPage()
  }, [token])

  const loadSignPage = async () => {
    try {
      const data = await getSignPage()
      setPageData(data)

      // Initialize field values with existing data
      const initialValues = {}
      data.fields?.forEach((field) => {
        initialValues[field.id] = field.value || ''
      })
      setFieldValues(initialValues)
    } catch (err) {
      const errorData = err.response?.data
      if (errorData?.token_status === 'invalid') {
        // Show specific error for expired/revoked tokens
        if (errorData.revoked) {
          addToast('This link has been revoked', 'error')
        } else if (errorData.expired) {
          addToast('This link has expired', 'error')
        } else if (errorData.used) {
          addToast('This signing link has already been used', 'error')
        } else {
          addToast(errorData.error || 'Invalid or expired token', 'error')
        }
      } else {
        addToast('Invalid or expired token', 'error')
      }
      setTimeout(() => navigate('/'), 2000)
    }
  }

  const handleFieldChange = (fieldId, value) => {
    if (!pageData?.is_editable) return
    
    // Check if this specific field is editable
    if (!pageData.editable_field_ids?.includes(fieldId)) return
    
    setFieldValues({
      ...fieldValues,
      [fieldId]: value,
    })
  }

  const handleSubmit = async () => {
    if (!signerName.trim()) {
      addToast('Please enter your name', 'warning')
      return
    }

    // For view-only scope, no submission allowed
    if (pageData.scope === 'view') {
      addToast('This is a view-only link', 'warning')
      return
    }

    // Get only the editable fields
    const editableFields = pageData.fields.filter((f) => 
      pageData.editable_field_ids?.includes(f.id)
    )

    // Collect filled field values
    const filledFields = Object.entries(fieldValues)
      .filter(([fieldId, value]) => {
        const id = parseInt(fieldId)
        return pageData.editable_field_ids?.includes(id) && value && value.trim()
      })
      .map(([fieldId, value]) => ({
        field_id: parseInt(fieldId),
        value: value,
      }))

    // Validate: ALL required editable fields must be filled
    if (filledFields.length === 0) {
      addToast('Please fill at least one field', 'warning')
      return
    }

    const editableRequiredFields = editableFields.filter((f) => f.required)
    const filledFieldIds = new Set(filledFields.map((f) => f.field_id))
    const missingRequired = editableRequiredFields.filter((f) => !filledFieldIds.has(f.id))

    if (missingRequired.length > 0) {
      addToast(
        `Please fill all required fields: ${missingRequired.map(f => f.label).join(', ')}`, 
        'warning'
      )
      return
    }

    setSubmitting(true)
    try {
      const signData = {
        signer_name: signerName,
        field_values: filledFields,
      }

      const response = await submitSignature(signData)
      addToast('Document signed successfully!', 'success')
      
      // Reload the page data to get updated status
      setTimeout(async () => {
        await loadSignPage()
        setSignerName('')
        setFieldValues({})
      }, 500)
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to sign document'
      addToast(errorMsg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!pageData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading document...</p>
        </div>
      </div>
    )
  }

  // Handle error states
  if (pageData.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">{pageData.error}</p>
          <Button onClick={() => navigate('/')} variant="primary">
            Go to Home
          </Button>
        </div>
      </div>
    )
  }

  const fileUrl = pageData.version?.file_url || pageData.version?.file

  // Build absolute URL if it's a relative path
  let absoluteFileUrl = fileUrl
  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  console.log('FileUrl:', fileUrl)
  console.log('AbsoluteFileUrl:', absoluteFileUrl)

  // Add validation
  if (!absoluteFileUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">File Not Found</h2>
          <p className="text-gray-600 mb-4">The PDF file for this document could not be found.</p>
          <Button onClick={() => navigate('/')} variant="primary">
            Go to Home
          </Button>
        </div>
      </div>
    )
  }
  
  const pageFields = pageData.fields.filter((f) => f.page_number === currentPage)
  
  // Get all recipients used in the document
  const allRecipients = [...new Set(pageData.fields.map(f => f.recipient))].filter(Boolean)
  
  // Separate fields by editability and recipient
  const editableFields = pageFields.filter(f => 
    pageData.editable_field_ids?.includes(f.id)
  )
  const lockedFields = pageFields.filter(f => f.locked)
  const otherRecipientFields = pageFields.filter(f => 
    !pageData.editable_field_ids?.includes(f.id) && !f.locked
  )

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {pageData.version?.document?.title || 'Document Signing'}
          </h1>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className={`px-3 py-1 rounded-full font-medium ${
              pageData.scope === 'sign' 
                ? 'bg-blue-100 text-blue-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {pageData.scope === 'sign' ? '✍️ Sign Mode' : '👁️ View Mode'}
            </span>
            
            {pageData.recipient && (
              <span className={getRecipientBadgeClasses(pageData.recipient, allRecipients)}>
                {pageData.recipient}
              </span>
            )}
            
            {pageData.expires_at && (
              <span className="text-gray-500">
                Expires: {new Date(pageData.expires_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 overflow-hidden">
          <DocumentViewer
            fileUrl={absoluteFileUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          >
            {(pageNum, scale) => (
              <div
                className="absolute inset-0"
                style={{
                  width: 612 * scale,
                  height: 792 * scale,
                  position: 'relative',
                }}
              >
                {/* Render locked/signed fields (read-only) */}
                {lockedFields.map((field) => {
                  const pxField = fieldPctToPx(field, 612, 792)
                  const recipientColor = getRecipientColor(field.recipient, allRecipients)
                  
                  return (
                    <div
                      key={`locked-${field.id}`}
                      className="absolute border-2 bg-green-50 border-green-500 flex items-center px-2"
                      style={{
                        left: pxField.x * scale,
                        top: pxField.y * scale,
                        width: pxField.width * scale,
                        height: pxField.height * scale,
                        fontSize: `${Math.max(10, pxField.height * scale * 0.5)}px`,
                        borderColor: recipientColor.color,
                        backgroundColor: `${recipientColor.color}15`,
                      }}
                      title={`${field.recipient} - Signed`}
                    >
                      <span className="truncate text-gray-700">
                        {field.value}
                      </span>
                      <span className="ml-auto text-green-600 text-xs">✓</span>
                    </div>
                  )
                })}

                {/* Render other recipients' fields (not editable, not signed) */}
                {otherRecipientFields.map((field) => {
                  const pxField = fieldPctToPx(field, 612, 792)
                  const recipientColor = getRecipientColor(field.recipient, allRecipients)
                  
                  return (
                    <div
                      key={`other-${field.id}`}
                      className="absolute border-2 border-dashed bg-gray-50"
                      style={{
                        left: pxField.x * scale,
                        top: pxField.y * scale,
                        width: pxField.width * scale,
                        height: pxField.height * scale,
                        borderColor: recipientColor.color,
                        opacity: 0.5,
                      }}
                      title={`${field.recipient} - Pending`}
                    >
                      <div className="text-xs text-gray-500 px-1 truncate">
                        {field.label}
                      </div>
                    </div>
                  )
                })}

                {/* Render editable fields as inputs */}
                {pageData.is_editable &&
                  editableFields.map((field) => {
                    const pxField = fieldPctToPx(field, 612, 792)
                    const recipientColor = getRecipientColor(field.recipient, allRecipients)
                    
                    return (
                      <div
                        key={`editable-${field.id}`}
                        className="absolute"
                        style={{
                          left: pxField.x * scale,
                          top: pxField.y * scale,
                          width: pxField.width * scale,
                          height: pxField.height * scale,
                          zIndex: 10,  // ← Add this
                        }}
                      >
                        {field.field_type === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={fieldValues[field.id] === 'true' || fieldValues[field.id] === true}
                            onChange={(e) =>
                              handleFieldChange(field.id, e.target.checked.toString())
                            }
                            className="w-6 h-6 cursor-pointer"  // ← Fixed sizing
                            style={{
                              accentColor: recipientColor.color,
                            }}
                            title={field.label}
                          />
                        ) : (
                          <input
                            type={field.field_type === 'date' ? 'date' : 'text'}
                            value={fieldValues[field.id] || ''}
                            onChange={(e) =>
                              handleFieldChange(field.id, e.target.value)
                            }
                            placeholder={field.label}
                            className="w-full h-full px-2 py-1 border-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:z-20"  // ← Updated classes
                            style={{
                              fontSize: `${Math.max(10, pxField.height * scale * 0.5)}px`,
                              borderColor: recipientColor.color,
                              backgroundColor: '#ffffff',  // ← Changed to white
                              boxSizing: 'border-box',  // ← Add this
                            }}
                            title={field.label}
                            autoComplete="off"  // ← Add this
                          />
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </DocumentViewer>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 bg-white border-l overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Signing Form (for sign mode) */}
          {pageData.is_editable && pageData.scope === 'sign' && !pageData.used && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Sign Document</h3>
              
              {/* Recipient Info */}
              {pageData.recipient && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">Signing as:</p>
                  <span className={getRecipientBadgeClasses(pageData.recipient, allRecipients)}>
                    {pageData.recipient}
                  </span>
                </div>
              )}

              {/* Signer Name Input */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Sign here..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none text-center text-xl transition-colors"
                  style={{
                    fontFamily: "'Dancing Script', cursive",
                    fontWeight: '700',
                    fontSize: '24px',
                    letterSpacing: '0.5px'
                  }}
                />
                <p className="text-xs text-gray-500 text-center">
                  (Signature will appear in handwriting style)
                </p>
              </div>

              {/* Fields Summary */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Your Fields ({editableFields.length})
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {editableFields.map((field) => {
                    const isFilled = fieldValues[field.id] && fieldValues[field.id].trim()
                    return (
                      <div 
                        key={field.id} 
                        className="text-sm p-2 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer"
                        onClick={() => {
                          // Scroll to field's page if not on current page
                          if (field.page_number !== currentPage) {
                            setCurrentPage(field.page_number)
                          }
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </span>
                          <span className={`text-xs ${isFilled ? 'text-green-600' : 'text-gray-400'}`}>
                            {isFilled ? '✓ Filled' : '○ Empty'}
                          </span>
                        </div>
                        {field.page_number !== currentPage && (
                          <div className="text-xs text-blue-600 mt-1">
                            → Page {field.page_number}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleSubmit}
                variant="primary"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? 'Signing...' : 'Submit Signature'}
              </Button>

              <p className="text-xs text-gray-500 text-center">
                Fill all required fields above and click Submit to sign
              </p>
            </div>
          )}

          {/* View Mode / Already Signed */}
          {(!pageData.is_editable || pageData.scope === 'view' || pageData.used) && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                {pageData.scope === 'view' ? '👁️ View Only' : '✓ Document Signed'}
              </h3>
              <p className="text-sm text-gray-600">
                {pageData.scope === 'view' 
                  ? 'This document is in view-only mode. Fields cannot be edited.'
                  : 'Thank you for signing! This document has been successfully signed.'}
              </p>

              {/* Recipient Status */}
              {pageData.recipient_status && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Completion Status
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(pageData.recipient_status).map(([recipient, status]) => (
                      <div key={recipient} className="flex items-center justify-between text-sm">
                        <span className={getRecipientBadgeClasses(recipient, allRecipients)}>
                          {recipient}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          status.completed 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {status.signed}/{status.total} fields
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Signatures List */}
              {pageData.signatures?.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Signatures ({pageData.signatures.length})
                  </h4>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {pageData.signatures.map((sig, idx) => (
                      <div key={idx} className="text-sm p-3 bg-gray-50 rounded border">
                        <div className="flex items-center justify-between mb-2">
                          <span className={getRecipientBadgeClasses(sig.recipient, allRecipients)}>
                            {sig.recipient}
                          </span>
                          <span className="text-xs text-green-600">✓ Signed</span>
                        </div>
                        <div className="font-medium text-gray-900">{sig.signer_name_display}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(sig.signed_at).toLocaleString()}
                        </div>
                        {sig.ip_address && (
                          <div className="text-xs text-gray-400 mt-1">
                            IP: {sig.ip_address}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Fields Display */}
              {pageData.fields?.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Document Fields
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {pageData.fields
                      .filter(f => f.value)
                      .map((field) => (
                        <div key={field.id} className="text-sm p-2 bg-gray-50 rounded">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={getRecipientBadgeClasses(field.recipient, allRecipients)}>
                              {field.recipient}
                            </span>
                            {field.locked && (
                              <span className="text-xs text-green-600">✓</span>
                            )}
                          </div>
                          <div className="font-medium text-gray-700">{field.label}</div>
                          <div className="text-gray-600 mt-1">{field.value}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Legend</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-500 bg-blue-50"></div>
                <span>Your fields (editable)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-green-500 bg-green-50"></div>
                <span>Signed fields (locked)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-dashed border-gray-400 bg-gray-50"></div>
                <span>Other recipients' fields</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => setToasts(toasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  )
}