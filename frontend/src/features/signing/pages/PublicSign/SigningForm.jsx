/**
 * ✅ COMPLETE: Signing form with prefilled_text support
 * ✅ Features: Live preview, field validation, prefill defaults
 */

import { useState, useEffect } from 'react'
import { DocumentViewer } from '../../../pdf/components/DocumentViewer'
import { PageLayer } from '../../../pdf/components/PageLayer'
import { FieldOverlay } from '../../../pdf/components/FieldOverlay'
import { Button } from '../../../../shared/components/ui/Button'
import { Toast } from '../../../../shared/components/ui/Toast'
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

  // ✅ INITIALIZE: Prefilled text fields with their default values
  useEffect(() => {
    if (!pageData?.fields) return
    
    const initialValues = {}
    pageData.fields.forEach((field) => {
      // ✅ NEW: For prefilled_text, use prefill_value as default
      if (field.field_type === 'prefilled_text') {
        initialValues[field.id] = field.prefill_value || field.value || ''
      } else {
        initialValues[field.id] = field.value || ''
      }
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
    // ✅ DEBUG: Log what we're checking
    console.log('🔍 handleFieldChange:', {
      fieldId,
      value,
      editableIds: pageData.editable_field_ids,
      isIncluded: pageData.editable_field_ids?.includes(fieldId),
    })
    
    const field = pageData.fields?.find(f => f.id === fieldId)
    
    // Static prefilled fields are never editable
    if (field?.field_type === 'prefilled_text' && !field.is_editable_prefill) {
      console.log('⚠️ Static prefilled - blocking edit')
      return
    }
    
    // ✅ FIX: Check if field ID is in the editable list
    if (!pageData.editable_field_ids || !pageData.editable_field_ids.includes(fieldId)) {
      console.log('❌ Field not in editable_field_ids, blocking')
      return
    }
    
    console.log('✅ Field is editable, allowing change')
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }))
  }

  const handleSubmit = async () => {
    // ✅ NEW: Validate required editable fields (not static prefilled)
    const editableRequiredFields = pageData.fields.filter(
      (f) => pageData.editable_field_ids?.includes(f.id) && f.required
    )
    
    const filledFieldIds = new Set(
      editableRequiredFields
        .filter(f => fieldValues[f.id] && fieldValues[f.id].trim())
        .map(f => f.id)
    )
    
    const missingRequired = editableRequiredFields.filter(f => !filledFieldIds.has(f.id))

    if (missingRequired.length > 0) {
      addToast(
        `Please fill all required fields: ${missingRequired.map((f) => f.label).join(', ')}`,
        'warning'
      )
      return
    }

    setSubmitting(true)
    try {
      // ✅ CRITICAL FIX: Send as ARRAY, not object
      const filledFields = pageData.fields
        .filter(f => pageData.editable_field_ids?.includes(f.id))  // Only editable fields
        .map((f) => ({
          field_id: f.id.toString(),  // ✅ Convert to string
          value: fieldValues[f.id] || '',
        }))

      console.log('📝 Submitting field values:', filledFields)  // ✅ DEBUG

      const signData = {
        signer_name: signerName.trim(),
        field_values: filledFields,  // ✅ This is an ARRAY
      }

      const result = await submitSignature(signData)
      addToast('✅ Signature submitted successfully!', 'success')
      
      // Reload page data to show completion state
      if (onSuccess) {
        setTimeout(() => onSuccess(), 1000)
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to submit signature'
      addToast(errorMsg, 'error')
      console.error('Signature submission error:', err)
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
  
  // ✅ NEW: Separate static prefilled from editable fields
  const editablePageFields = pageFields.filter((f) => {
    // Static prefilled fields are never editable
    if (f.field_type === 'prefilled_text' && !f.is_editable_prefill) {
      return true  // Show for display but not editing
    }
    return pageData.editable_field_ids?.includes(f.id)
  })

  // ✅ SIMPLIFIED: Live field preview overlay
  const LiveFieldPreview = ({ field, pageWidth = 612, pageHeight = 792, scale = 1 }) => {
    if (!field || !pageData.editable_field_ids?.includes(field.id)) {
      return null
    }

    const value = fieldValues[field.id] || ''
    
    // ✅ Only show preview if field has value AND not static prefilled
    if (!value || (field.field_type === 'prefilled_text' && !field.is_editable_prefill)) {
      return null
    }

    const x = field.x_pct * pageWidth * scale
    const y = field.y_pct * pageHeight * scale
    const width = field.width_pct * pageWidth * scale
    const height = field.height_pct * pageHeight * scale

    return (
      <div
        className="absolute border-2 border-blue-500 bg-white bg-opacity-70 p-1 overflow-hidden flex items-center justify-center"
        style={{
          left: x,
          top: y,
          width,
          height,
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        <span className="text-xs text-gray-700 text-center line-clamp-2 font-semibold">
          {value}
        </span>
      </div>
    )
  }

  // ✅ SIMPLIFIED: Render field inputs
  const renderFieldInput = (field, value, onChange) => {
    // ✅ Handle prefilled_text fields
    if (field.field_type === 'prefilled_text') {
      if (!field.is_editable_prefill) {
        // Static: Read-only display - MINIMAL
        return (
          <div className="px-3 py-2 bg-gray-50 border-2 border-gray-300 rounded text-gray-700 text-sm">
            {field.prefill_value || '(empty)'}
          </div>
        )
      } else {
        // Editable: Text input
        return (
          <textarea
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.prefill_value || 'Enter text...'}
            rows={3}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            disabled={!pageData.editable_field_ids?.includes(field.id)}
          />
        )
      }
    }

    // Standard field types - SIMPLIFIED
    switch (field.field_type) {
      case 'text':
        return (
          <textarea
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder="Enter text..."
            rows={3}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            disabled={!pageData.editable_field_ids?.includes(field.id)}
          />
        )

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!pageData.editable_field_ids?.includes(field.id)}
          />
        )

      case 'signature':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder="Type your signature..."
            className="w-full px-3 py-2 border-2 border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!pageData.editable_field_ids?.includes(field.id)}
          />
        )

      default:
        return <div className="text-red-600 text-sm">Unsupported: {field.field_type}</div>
    }
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Left: PDF Viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Info Bar */}
        <div className="flex-shrink-0 bg-blue-50 border-b-2 border-blue-300 p-4">
          <p className="text-sm text-blue-900 font-semibold">
            📄 Please review and sign this document below
          </p>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 overflow-auto">
          {documentViewerError ? (
            <div className="flex items-center justify-center h-full bg-red-50">
              <div className="text-center">
                <p className="text-6xl mb-4">❌</p>
                <p className="text-red-600 font-bold">Failed to load PDF</p>
                <p className="text-sm text-gray-600 mt-2">{documentViewerError}</p>
              </div>
            </div>
          ) : (
            <DocumentViewer
              fileUrl={absoluteFileUrl}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onError={setDocumentViewerError}
            >
              {(pageNum, scale) => (
                <PageLayer
                  pageWidth={612}
                  pageHeight={792}
                  fields={pageFields}
                  scale={scale}
                >
                  {/* Live preview of filled values */}
                  {editablePageFields.map((field) => (
                    <LiveFieldPreview
                      key={`preview-${field.id}`}
                      field={field}
                      pageWidth={612}
                      pageHeight={792}
                      scale={scale}
                    />
                  ))}
                </PageLayer>
              )}
            </DocumentViewer>
          )}
        </div>
      </div>

      {/* Right Sidebar: Form */}
      <div className="w-96 bg-white border-l-2 border-gray-200 overflow-y-auto p-6 shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign Document</h2>
          <p className="text-sm text-gray-600">
            Fill in all required fields marked with <span className="text-red-500 font-bold">*</span>
          </p>
        </div>

        {/* Signer Name */}
        <div className="flex-shrink-0 mb-6">
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Your Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={submitting}
          />
        </div>

        {/* Form Fields - Scrollable */}
        <div className="flex-1 overflow-y-auto space-y-6 mb-6">
          {editablePageFields.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No fields to fill on this page</p>
            </div>
          ) : (
            editablePageFields.map((field) => (
              <div key={field.id} className="space-y-2">
                <label className="block text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>{getFieldDisplayInfo(field.field_type).icon}</span>
                  <span>{field.label}</span>
                  {field.required && <span className="text-red-500">*</span>}
                </label>
                {renderFieldInput(field, fieldValues[field.id] || '', handleFieldChange)}
              </div>
            ))
          )}
        </div>

        {/* Submit Button */}
        <div className="flex-shrink-0 space-y-3 border-t-2 border-gray-200 pt-6">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            disabled={submitting || !signerName.trim()}
            className="w-full"
          >
            {submitting ? (
              <>
                <span className="animate-spin">⟳</span>
                Submitting...
              </>
            ) : (
              <>
                <span>✍️</span>
                Submit Signature
              </>
            )}
          </Button>

          <p className="text-xs text-gray-600 text-center">
            By submitting, you agree that this is your legal signature
          </p>
        </div>
      </div>
    </div>
  )
}