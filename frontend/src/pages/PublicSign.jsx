import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DocumentViewer } from '../components/pdf/DocumentViewer'
import { PageLayer } from '../components/pdf/PageLayer'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'
import { useApi } from '../hooks/useApi'
import { publicAPI } from '../services/api'
import { fieldPctToPx } from '../utils/coords'

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
      addToast('Invalid or expired token', 'error')
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

    // Get only the editable fields on current page
    const editableFields = pageData.fields.filter((f) => 
      pageData.editable_field_ids?.includes(f.id)
    )
    
    // For view-only scope, no submission
    if (pageData.scope === 'view') {
      addToast('This is a view-only link', 'warning')
      return
    }

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

    // DIFFERENT VALIDATION FOR SINGLE-USE vs MULTI-USE
    if (pageData.is_single_use) {
      // Single-use: ALL editable fields must be filled
      if (filledFields.length === 0) {
        addToast('Please fill all fields', 'warning')
        return
      }

      const editableRequiredFields = editableFields.filter((f) => f.required)
      const filledFieldIds = new Set(filledFields.map((f) => f.field_id))
      const missingRequired = editableRequiredFields.filter((f) => !filledFieldIds.has(f.id))

      if (missingRequired.length > 0) {
        addToast(`Please fill all required fields: ${missingRequired.map(f => f.label).join(', ')}`, 'warning')
        return
      }
    } else {
      // Multi-use: AT LEAST ONE field must be filled
      if (filledFields.length === 0) {
        addToast('Please fill at least one field', 'warning')
        return
      }
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
      addToast(err.message || 'Failed to sign document', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!pageData) {
    return <div className="p-8 text-center">Loading document...</div>
  }

  const fileUrl = pageData.version?.file_url || pageData.version?.file
  const pageFields = pageData.fields.filter(
    (f) => f.page_number === currentPage
  )
  const pageSignatures = pageData.signatures.filter(
    (s) => s.page_number === currentPage
  )

  // Determine which fields to show as overlays (with values)
  const filledFields = pageFields.filter(f => f.value && f.value.trim())
  const editableFieldsOnPage = pageFields.filter(f => 
    pageData.editable_field_ids?.includes(f.id)
  )

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-6 py-4">
          <h1 className="text-2xl font-bold">{pageData.version.document?.title}</h1>
          <p className="text-sm text-gray-600">
            {pageData.scope === 'sign' 
              ? 'Please review and sign this document' 
              : 'Document view (read-only)'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Status: <span className="font-medium capitalize">{pageData.version.status}</span>
          </p>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 relative">
            <DocumentViewer
              fileUrl={fileUrl}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            >
              {(pageNum, scale = 1) => (
                <PageLayer
                  pageWidth={612}
                  pageHeight={792}
                  fields={pageFields}
                  signatures={pageSignatures}
                  scale={scale}
                >
                  {/* Show filled fields as overlays */}
                  {filledFields.map((field) => {
                    const pxField = fieldPctToPx(field, 612, 792)
                    return (
                      <div
                        key={`filled-${field.id}`}
                        style={{
                          position: 'absolute',
                          left: pxField.x * scale,
                          top: pxField.y * scale,
                          width: pxField.width * scale,
                          height: pxField.height * scale,
                          pointerEvents: 'none',
                        }}
                        className="flex items-center px-2 py-1 text-sm bg-gray-100 border border-gray-400 rounded"
                      >
                        <span className="truncate">{field.value}</span>
                      </div>
                    )
                  })}

                  {/* Show editable fields as inputs */}
                  {pageData.is_editable &&
                    editableFieldsOnPage.map((field) => {
                      const pxField = fieldPctToPx(field, 612, 792)
                      return (
                        <input
                          key={`editable-${field.id}`}
                          type={field.field_type === 'date' ? 'date' : 'text'}
                          value={fieldValues[field.id] || ''}
                          onChange={(e) =>
                            handleFieldChange(field.id, e.target.value)
                          }
                          placeholder={field.label}
                          style={{
                            position: 'absolute',
                            left: pxField.x * scale,
                            top: pxField.y * scale,
                            width: pxField.width * scale,
                            height: pxField.height * scale,
                            pointerEvents: 'auto',
                            zIndex: 20,
                          }}
                          className="px-2 py-1 text-sm border-2 border-green-400 rounded bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                      )
                    })}
                </PageLayer>
              )}
            </DocumentViewer>
          </div>

          <div className="w-80 bg-white border-l overflow-y-auto p-6">
            {pageData.is_editable ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Sign Document</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Fields to Sign ({editableFieldsOnPage.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {pageFields
                      .filter((f) => pageData.editable_field_ids?.includes(f.id))
                      .map((field) => (
                        <div key={field.id} className="text-sm p-2 bg-gray-50 rounded">
                          <div className="flex justify-between">
                            <span className="text-gray-700">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </span>
                            <span className="text-xs">
                              {fieldValues[field.id] ? '✓ Filled' : '○ Empty'}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <Button
                  onClick={handleSubmit}
                  variant="success"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? 'Signing...' : 'Submit Signature'}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  Fill the fields above and click Submit to sign
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                  {pageData.scope === 'view' ? '👁️ View Only' : '✓ Document Signed'}
                </h3>
                <p className="text-sm text-gray-600">
                  {pageData.scope === 'view' 
                    ? 'This document is in view-only mode. Fields cannot be edited.'
                    : 'Thank you for signing! This document has been successfully signed.'}
                </p>

                {pageData.signatures?.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Signatures ({pageData.signatures.length})
                    </h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {pageData.signatures.map((sig) => (
                        <div key={sig.id} className="text-xs bg-gray-50 p-3 rounded">
                          <div className="font-medium text-gray-800">
                            {sig.signer_name_display}
                          </div>
                          <div className="text-gray-500 mt-1">
                            {new Date(sig.signed_at).toLocaleString()}
                          </div>
                          <div className="text-gray-400 text-[10px] mt-1">
                            Fields signed: {sig.field_values?.length || 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filledFields.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Filled Fields ({filledFields.length})
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {filledFields.map((field) => (
                        <div key={field.id} className="text-xs bg-gray-50 p-2 rounded">
                          <div className="font-medium text-gray-700">{field.label}</div>
                          <div className="text-gray-600 mt-1">{field.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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