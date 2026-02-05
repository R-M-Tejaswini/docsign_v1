/**
 * ✅ EXTRACTED: Signing form interface
 * ✅ FIXED: Proper file URL handling
 * ✅ FIXED: Guard against undefined pageData
 * ✅ NEW: Live preview of field values on PDF
 */

import { useState, useEffect } from 'react'
import { DocumentViewer } from '../../../pdf/components/DocumentViewer'
import { PageLayer } from '../../../pdf/components/PageLayer'
import { FieldOverlay } from '../../../pdf/components/FieldOverlay'
import { Button } from '../../../../shared/components/ui/Button'
import { useApi } from '../../../../shared/hooks/useApi'
import { publicAPI } from '../../api'
import { getFieldDisplayInfo } from '../../../fields/utils/fieldRules'

export const SigningForm = ({ token, pageData, onSuccess, addToast }) => {
  const [signerName, setSignerName] = useState('')
  const [fieldValues, setFieldValues] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [documentViewerError, setDocumentViewerError] = useState(null)

  const { execute: submitSignature } = useApi((signData) => publicAPI.submitSignature(token, signData))

  useEffect(() => {
    if (!pageData?.fields) return
    
    const initialValues = {}
    pageData.fields.forEach((field) => {
      initialValues[field.id] = field.value || ''
    })
    setFieldValues(initialValues)
    console.log('✅ SigningForm initialized with fields:', pageData.fields)
  }, [pageData])

  // ✅ GUARD: Don't render if pageData is missing
  if (!pageData?.document) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading document...</p>
        </div>
      </div>
    )
  }

  const handleFieldChange = (fieldId, value) => {
    if (!pageData.editable_field_ids?.includes(fieldId)) return
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }))
  }

  const handleSubmit = async () => {
    const filledFields = pageData.fields
      .filter((f) => pageData.editable_field_ids?.includes(f.id))
      .map((f) => ({
        field_id: f.id,
        value: fieldValues[f.id] || '',
      }))

    const editableRequiredFields = pageData.fields.filter(
      (f) => pageData.editable_field_ids?.includes(f.id) && f.required
    )
    const filledFieldIds = new Set(filledFields.map((f) => f.field_id))
    const missingRequired = editableRequiredFields.filter((f) => !filledFieldIds.has(f.id))

    if (missingRequired.length > 0) {
      addToast(
        `Please fill all required fields: ${missingRequired.map((f) => f.label).join(', ')}`,
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
        onSuccess()
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

  // ✅ FIXED: Extract fileUrl safely with null checks
  const fileUrl = pageData.document?.file_url
  let absoluteFileUrl = fileUrl

  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  const pageFields = pageData.fields?.filter((f) => f.page_number === currentPage) || []
  const editableFields = pageFields.filter((f) => pageData.editable_field_ids?.includes(f.id))

  // ✅ NEW: Live preview overlay layer
  const LiveFieldPreview = ({ field, pageWidth = 612, pageHeight = 792, scale = 1 }) => {
    const value = fieldValues[field.id] || ''
    const info = getFieldDisplayInfo(field.field_type)
    
    return (
      <div
        className="absolute border-2 border-green-400 bg-green-50 bg-opacity-60 flex items-center justify-center overflow-hidden"
        style={{
          left: `${field.x_pct * 100}%`,
          top: `${field.y_pct * 100}%`,
          width: `${field.width_pct * 100}%`,
          height: `${field.height_pct * 100}%`,
          zIndex: 15,
        }}
        title={`${field.label}: ${value || '(empty)'}`}
      >
        <div className="text-center pointer-events-none w-full h-full flex flex-col items-center justify-center p-1">
          {field.field_type === 'signature' ? (
            <div className="text-center w-full">
              <div className="text-xs text-green-700 font-bold italic whitespace-nowrap overflow-hidden text-ellipsis">
                {value || '(signature)'}
              </div>
            </div>
          ) : field.field_type === 'date' ? (
            <div className="text-xs text-green-700 font-bold whitespace-nowrap">
              {value || '(date)'}
            </div>
          ) : field.field_type === 'checkbox' ? (
            <div className="text-lg text-green-700 font-bold">
              {value === 'true' ? '☑️' : '☐'}
            </div>
          ) : (
            <div className="text-xs text-green-700 font-bold whitespace-nowrap overflow-hidden text-ellipsis w-full px-1">
              {value || '(text)'}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden flex flex-col relative bg-gray-100">
        {!absoluteFileUrl ? (
          <div className="flex-1 flex items-center justify-center bg-gray-100">
            <div className="text-center bg-white p-8 rounded-lg border-2 border-red-300">
              <p className="text-6xl mb-4">❌</p>
              <p className="text-gray-600 font-medium">No document file found</p>
              <p className="text-sm text-gray-500 mt-2">File URL: {fileUrl}</p>
            </div>
          </div>
        ) : (
          <DocumentViewer 
            fileUrl={absoluteFileUrl} 
            currentPage={currentPage} 
            onPageChange={setCurrentPage}
            onLoadSuccess={() => {
              console.log('✅ PDF loaded successfully in SigningForm')
            }}
            onError={(err) => {
              console.error('❌ DocumentViewer error:', err)
              setDocumentViewerError(err)
            }}
          >
            {(pageNum, scale) => (
              <PageLayer
                pageWidth={612}
                pageHeight={792}
                fields={pageFields}
                selectedFieldId={null}
                scale={scale}
              >
                {/* ✅ NEW: Live preview of filled values */}
                {editableFields.map((field) => (
                  <LiveFieldPreview key={`preview-${field.id}`} field={field} scale={scale} />
                ))}
              </PageLayer>
            )}
          </DocumentViewer>
        )}

        {documentViewerError && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg border-2 border-red-400 max-w-md">
              <p className="text-red-600 font-bold mb-2">PDF Loading Error</p>
              <p className="text-sm text-gray-700">{documentViewerError.message || 'Failed to load PDF'}</p>
              <p className="text-xs text-gray-500 mt-3 font-mono break-all">{absoluteFileUrl}</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Signing Form */}
      <div className="w-96 bg-white border-l border-gray-200 overflow-y-auto p-6 shadow-lg flex flex-col">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Sign Document</h3>
        <p className="text-xs text-gray-600 mb-6">
          Fill out the required fields below and sign
        </p>

        <div className="flex-1 space-y-6 overflow-y-auto">
          {/* Signer Name */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Your Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              disabled={submitting}
            />
          </div>

          {/* Editable Fields */}
          {editableFields.length > 0 && (
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-3">
                <span>Fields to Sign</span>
                <span className="text-xs text-gray-500 font-normal ml-2">(live preview on left)</span>
              </label>
              <div className="space-y-4 bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
                {editableFields.map((field) => (
                  <div key={field.id}>
                    <label className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2 flex justify-between items-center">
                      <span>
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </span>
                      {fieldValues[field.id] && (
                        <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded font-semibold">✓ filled</span>
                      )}
                    </label>
                    
                    {field.field_type === 'date' ? (
                      <input
                        type="date"
                        value={fieldValues[field.id] || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition"
                        disabled={submitting}
                      />
                    ) : field.field_type === 'checkbox' ? (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fieldValues[field.id] === 'true'}
                          onChange={(e) => handleFieldChange(field.id, e.target.checked ? 'true' : 'false')}
                          className="w-5 h-5 text-blue-600 rounded border-2 border-gray-300 focus:ring-2 focus:ring-blue-500"
                          disabled={submitting}
                        />
                        <span className="text-sm text-gray-700">I agree</span>
                      </label>
                    ) : field.field_type === 'signature' ? (
                      <div className="border-2 border-dashed border-blue-400 rounded-lg p-3 bg-white">
                        <input
                          type="text"
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleFieldChange(field.id, e.target.value)}
                          placeholder="Type your signature"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-italic focus:outline-none focus:ring-2 focus:ring-blue-400"
                          disabled={submitting}
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={fieldValues[field.id] || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition"
                        disabled={submitting}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {editableFields.length === 0 && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 text-center">
              <p className="text-sm text-yellow-800 font-semibold">No fields to sign on this page</p>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <Button 
            onClick={handleSubmit} 
            variant="primary" 
            className="w-full" 
            disabled={submitting || !signerName.trim()}
          >
            {submitting ? (
              <>
                <span className="animate-spin inline-block mr-2">⟳</span>
                Signing...
              </>
            ) : (
              <>
                <span className="mr-2">✍️</span>
                Submit Signature
              </>
            )}
          </Button>
          {!signerName.trim() && (
            <p className="text-xs text-gray-500 mt-2 text-center">Enter your name to sign</p>
          )}
        </div>
      </div>
    </div>
  )
}