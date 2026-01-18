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
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const { execute: getSignPage } = useApi(() => publicAPI.getSignPage(token))
  const { execute: submitSignature } = useApi((signData) =>
    publicAPI.submitSignature(token, signData)
  )
  const { execute: downloadVersion } = useApi(() =>
    publicAPI.downloadPublicVersion(token)
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

      const initialValues = {}
      data.fields?.forEach((field) => {
        initialValues[field.id] = field.value || ''
      })
      setFieldValues(initialValues)
    } catch (err) {
      const errorData = err.response?.data
      
      if (err.response?.status === 403) {
        if (errorData?.revoked) {
          setPageData({
            error: 'This link has been revoked',
            errorType: 'revoked',
            token_status: 'invalid',
            revoked: true
          })
        } else if (errorData?.expired) {
          setPageData({
            error: 'This link has expired',
            errorType: 'expired',
            token_status: 'invalid',
            expired: true
          })
        } else if (errorData?.used) {
          setPageData({
            error: 'This signing link has already been used',
            errorType: 'used',
            token_status: 'invalid',
            used: true
          })
        } else {
          setPageData({
            error: errorData?.error || 'Access denied to this document',
            errorType: 'forbidden',
            token_status: 'invalid'
          })
        }
        return
      }

      if (err.response?.status === 404) {
        setPageData({
          error: 'Invalid or expired token',
          errorType: 'notfound',
          token_status: 'invalid'
        })
        return
      }

      if (errorData?.token_status === 'invalid') {
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

    if (pageData.scope === 'view') {
      addToast('This is a view-only link', 'warning')
      return
    }

    const editableFields = pageData.fields.filter((f) => 
      pageData.editable_field_ids?.includes(f.id)
    )

    const filledFields = Object.entries(fieldValues)
      .filter(([fieldId, value]) => {
        const id = parseInt(fieldId)
        return pageData.editable_field_ids?.includes(id) && value && value.trim()
      })
      .map(([fieldId, value]) => ({
        field_id: parseInt(fieldId),
        value: value,
      }))

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

      await submitSignature(signData)
      addToast('Document signed successfully!', 'success')
      
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

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true)
      const blob = await downloadVersion()
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${pageData.version?.document?.title}_signed.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      addToast('PDF downloaded successfully', 'success')
    } catch (err) {
      addToast('Failed to download PDF', 'error')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (!pageData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-700 font-semibold text-lg">Loading document...</p>
        </div>
      </div>
    )
  }

  // Handle error states
  if (pageData.error) {
    let icon = '⚠️'
    let title = 'Access Denied'
    let description = pageData.error
    let bgGradient = 'from-red-50 to-red-100'

    if (pageData.errorType === 'revoked') {
      icon = '🔗'
      title = 'Link Revoked'
      description = 'This signing link has been revoked and is no longer accessible.'
      bgGradient = 'from-gray-50 to-gray-100'
    } else if (pageData.errorType === 'expired') {
      icon = '⏰'
      title = 'Link Expired'
      description = 'This signing link has expired. Please request a new one.'
      bgGradient = 'from-yellow-50 to-yellow-100'
    } else if (pageData.errorType === 'used') {
      icon = '✓'
      title = 'Already Signed'
      description = 'This document has already been signed with this link.'
      bgGradient = 'from-green-50 to-green-100'
    } else if (pageData.errorType === 'notfound') {
      icon = '❌'
      title = 'Invalid Link'
      description = 'The link you provided is invalid or does not exist.'
      bgGradient = 'from-red-50 to-red-100'
    }

    return (
      <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br ${bgGradient}`}>
        <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-md text-center border-2 border-gray-200">
          <div className="text-7xl mb-6">{icon}</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">{title}</h2>
          <p className="text-gray-600 text-lg leading-relaxed">{description}</p>
        </div>
      </div>
    )
  }

  const fileUrl = pageData.version?.file_url || pageData.version?.file
  let absoluteFileUrl = fileUrl
  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  if (!absoluteFileUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
        <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-md text-center border-2 border-red-200">
          <div className="text-red-500 text-7xl mb-6">⚠️</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">File Not Found</h2>
          <p className="text-gray-600 text-lg mb-6">The PDF file for this document could not be found.</p>
          <Button onClick={() => navigate('/')} variant="primary">
            Go to Home
          </Button>
        </div>
      </div>
    )
  }
  
  const pageFields = pageData.fields.filter((f) => f.page_number === currentPage)
  const allRecipients = [...new Set(pageData.fields.map(f => f.recipient))].filter(Boolean)
  const editableFields = pageFields.filter(f => pageData.editable_field_ids?.includes(f.id))
  const lockedFields = pageFields.filter(f => f.locked)
  const otherRecipientFields = pageFields.filter(f => 
    !pageData.editable_field_ids?.includes(f.id) && !f.locked
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header - NO NAVBAR */}
        <div className="bg-white border-b-2 border-gray-200 px-6 py-4 shadow-md">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {pageData.version?.document?.title || 'Document Signing'}
          </h1>
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className={`px-4 py-1.5 rounded-full font-bold shadow-sm ${
              pageData.scope === 'sign' 
                ? 'bg-blue-100 text-blue-800 border-2 border-blue-200' 
                : 'bg-gray-100 text-gray-800 border-2 border-gray-200'
            }`}>
              {pageData.scope === 'sign' ? '✍️ Sign Mode' : '👁️ View Mode'}
            </span>
            
            {pageData.recipient && (
              <span className={`${getRecipientBadgeClasses(pageData.recipient, allRecipients)} shadow-sm`}>
                {pageData.recipient}
              </span>
            )}
            
            {pageData.expires_at && (
              <span className="text-gray-600 font-semibold flex items-center gap-1">
                <span>⏱</span>
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
                {/* Locked/signed fields */}
                {lockedFields.map((field) => {
                  const pxField = fieldPctToPx(field, 612, 792)
                  const recipientColor = getRecipientColor(field.recipient, allRecipients)
                  
                  return (
                    <div
                      key={`locked-${field.id}`}
                      className="absolute border-2 flex items-center px-2 shadow-md"
                      style={{
                        left: pxField.x * scale,
                        top: pxField.y * scale,
                        width: pxField.width * scale,
                        height: pxField.height * scale,
                        fontSize: `${Math.max(10, pxField.height * scale * 0.5)}px`,
                        borderColor: recipientColor.color,
                        backgroundColor: `${recipientColor.color}20`,
                      }}
                      title={`${field.recipient} - Signed`}
                    >
                      <span className="truncate text-gray-800 font-semibold">
                        {field.value}
                      </span>
                      <span className="ml-auto text-green-600 text-sm font-bold">✓</span>
                    </div>
                  )
                })}

                {/* Other recipients' fields */}
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
                        opacity: 0.6,
                      }}
                      title={`${field.recipient} - Pending`}
                    >
                      <div className="text-xs text-gray-500 px-1 truncate font-semibold">
                        {field.label}
                      </div>
                    </div>
                  )
                })}

                {/* Editable fields */}
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
                          zIndex: 10,
                        }}
                      >
                        {field.field_type === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={fieldValues[field.id] === 'true' || fieldValues[field.id] === true}
                            onChange={(e) =>
                              handleFieldChange(field.id, e.target.checked.toString())
                            }
                            className="w-6 h-6 cursor-pointer"
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
                            className="w-full h-full px-2 py-1 border-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:z-20 shadow-sm"
                            style={{
                              fontSize: `${Math.max(10, pxField.height * scale * 0.5)}px`,
                              borderColor: recipientColor.color,
                              backgroundColor: '#ffffff',
                              boxSizing: 'border-box',
                              fontFamily: field.field_type === 'signature' ? "'Dancing Script', cursive" : 'inherit',
                              fontWeight: field.field_type === 'signature' ? '700' : 'normal',
                              letterSpacing: field.field_type === 'signature' ? '0.5px' : 'normal',
                            }}
                            title={field.label}
                            autoComplete="off"
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
      <div className="w-96 bg-white border-l-2 border-gray-200 overflow-y-auto shadow-lg">
        <div className="p-6 space-y-6">
          {/* Signing Form */}
          {pageData.is_editable && pageData.scope === 'sign' && !pageData.used && (
            <div className="space-y-4">
              <div className="border-b-2 border-gray-200 pb-3">
                <h3 className="text-xl font-bold text-gray-900">Sign Document</h3>
                <p className="text-xs text-gray-600 mt-1">Complete the fields below to sign</p>
              </div>
              
              {/* Recipient Info */}
              {pageData.recipient && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                  <p className="text-xs text-gray-600 mb-2 font-semibold uppercase tracking-wide">Signing as:</p>
                  <span className={`${getRecipientBadgeClasses(pageData.recipient, allRecipients)} shadow-sm`}>
                    {pageData.recipient}
                  </span>
                </div>
              )}

              {/* Signer Name Input */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Your Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Enter your full name..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 text-center text-lg font-semibold transition-all"
                />
              </div>

              {/* Fields Summary */}
              <div className="border-t-2 border-gray-200 pt-4">
                <h4 className="text-sm font-bold text-gray-900 mb-3">
                  Your Fields ({editableFields.length})
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {editableFields.map((field) => {
                    const isFilled = fieldValues[field.id] && fieldValues[field.id].trim()
                    return (
                      <div 
                        key={field.id} 
                        className="text-sm p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-all border border-gray-200"
                        onClick={() => {
                          if (field.page_number !== currentPage) {
                            setCurrentPage(field.page_number)
                          }
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-gray-900 font-semibold">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </span>
                          <span className={`text-xs font-bold ${isFilled ? 'text-green-600' : 'text-gray-400'}`}>
                            {isFilled ? '✓ Filled' : '○ Empty'}
                          </span>
                        </div>
                        {field.page_number !== currentPage && (
                          <div className="text-xs text-blue-600 mt-1 font-semibold">
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
                {submitting ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    Signing...
                  </>
                ) : (
                  <>
                    <span>✍️</span>
                    Submit Signature
                  </>
                )}
              </Button>

              <p className="text-xs text-gray-600 text-center leading-relaxed">
                Fill all required fields above and click Submit to sign
              </p>
            </div>
          )}

          {/* View Mode / Already Signed */}
          {(!pageData.is_editable || pageData.scope === 'view' || pageData.used) && (
            <div className="space-y-4">
              <div className="border-b-2 border-gray-200 pb-3">
                <h3 className="text-xl font-bold text-gray-900">
                  {pageData.scope === 'view' ? '👁️ View Only' : '✓ Document Signed'}
                </h3>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {pageData.scope === 'view' 
                    ? 'This document is in view-only mode. Fields cannot be edited.'
                    : 'Thank you for signing! This document has been successfully signed.'}
                </p>
              </div>

              {/* Recipient Status */}
              {pageData.recipient_status && (
                <div className="border-t-2 border-gray-200 pt-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">
                    Completion Status
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(pageData.recipient_status).map(([recipient, status]) => (
                      <div key={recipient} className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span className={getRecipientBadgeClasses(recipient, allRecipients)}>
                          {recipient}
                        </span>
                        <span className={`text-xs px-3 py-1 rounded-full font-bold ${
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
                <div className="border-t-2 border-gray-200 pt-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">
                    Signatures ({pageData.signatures.length})
                  </h4>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {pageData.signatures.map((sig, idx) => (
                      <div key={idx} className="text-sm p-4 bg-green-50 rounded-lg border-2 border-green-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className={getRecipientBadgeClasses(sig.recipient, allRecipients)}>
                            {sig.recipient}
                          </span>
                          <span className="text-xs text-green-600 font-bold">✓ Signed</span>
                        </div>
                        <div className="font-bold text-gray-900 text-base">{sig.signer_name_display}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {new Date(sig.signed_at).toLocaleString()}
                        </div>
                        {sig.ip_address && (
                          <div className="text-xs text-gray-500 mt-1 font-mono">
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
                <div className="border-t-2 border-gray-200 pt-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">
                    Document Fields
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {pageData.fields
                      .filter(f => f.value)
                      .map((field) => (
                        <div key={field.id} className="text-sm p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={getRecipientBadgeClasses(field.recipient, allRecipients)}>
                              {field.recipient}
                            </span>
                            {field.locked && (
                              <span className="text-xs text-green-600 font-bold">✓</span>
                            )}
                          </div>
                          <div className="font-semibold text-gray-900">{field.label}</div>
                          <div className="text-gray-700 mt-1">{field.value}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Download Button */}
          {pageData.version?.status === 'completed' && (
            <Button
              onClick={handleDownloadPdf}
              variant="success"
              className="w-full"
              disabled={downloadingPdf}
            >
              {downloadingPdf ? (
                <>
                  <span className="animate-spin">⟳</span>
                  Downloading...
                </>
              ) : (
                <>
                  <span>⬇️</span>
                  Download Signed PDF
                </>
              )}
            </Button>
          )}

          {/* Legend */}
          <div className="border-t-2 border-gray-200 pt-4">
            <h4 className="text-sm font-bold text-gray-900 mb-3">Legend</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-500 bg-blue-50 rounded"></div>
                <span className="font-semibold">Your fields (editable)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-green-500 bg-green-50 rounded"></div>
                <span className="font-semibold">Signed fields (locked)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-dashed border-gray-400 bg-gray-50 rounded"></div>
                <span className="font-semibold">Other recipients' fields</span>
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