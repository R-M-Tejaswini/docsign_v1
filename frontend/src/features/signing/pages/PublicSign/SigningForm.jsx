/**
 * ✅ EXTRACTED: Signing form interface
 */

import { useState, useEffect } from 'react'
import { DocumentViewer } from '../../../pdf/components/DocumentViewer'
import { PageLayer } from '../../../pdf/components/PageLayer'
import { Button } from '../../../../shared/components/ui/Button'
import { useApi } from '../../../../shared/hooks/useApi'
import { publicAPI } from '../../api'
import { fieldPctToPx } from '../../../fields/utils/coords'

export const SigningForm = ({ token, pageData, onSuccess, addToast }) => {
  const [signerName, setSignerName] = useState('')
  const [fieldValues, setFieldValues] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const { execute: submitSignature } = useApi((signData) => publicAPI.submitSignature(token, signData))

  useEffect(() => {
    const initialValues = {}
    pageData.fields?.forEach((field) => {
      initialValues[field.id] = field.value || ''
    })
    setFieldValues(initialValues)
  }, [pageData])

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

  const fileUrl = pageData.document?.file_url || pageData.document?.file
  let absoluteFileUrl = fileUrl
  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  const pageFields = pageData.fields?.filter((f) => f.page_number === currentPage) || []
  const editableFields = pageFields.filter((f) => pageData.editable_field_ids?.includes(f.id))

  return (
    <div className="flex h-screen bg-gray-50">
      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <DocumentViewer fileUrl={absoluteFileUrl} currentPage={currentPage} onPageChange={setCurrentPage}>
          {(pageNum, scale) => (
            <PageLayer
              pageWidth={612}
              pageHeight={792}
              fields={pageFields}
              scale={scale}
            />
          )}
        </DocumentViewer>

        {/* Page Navigation */}
        <div className="bg-white border-t border-gray-200 p-4 flex justify-between items-center">
          <Button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} variant="secondary" disabled={currentPage === 1}>
            ← Previous
          </Button>
          <span className="text-gray-600 font-semibold">
            Page {currentPage} of {pageData.document?.page_count || 1}
          </span>
          <Button
            onClick={() => setCurrentPage(currentPage + 1)}
            variant="secondary"
            disabled={currentPage === (pageData.document?.page_count || 1)}
          >
            Next →
          </Button>
        </div>
      </div>

      {/* Right Sidebar - Signing Form */}
      <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto p-6 shadow-lg">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Sign Document</h3>

        <div className="space-y-6">
          {/* Signer Name */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">Your Name</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={submitting}
            />
          </div>

          {/* Editable Fields */}
          {editableFields.length > 0 && (
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">Fields to Sign</label>
              <div className="space-y-3">
                {editableFields.map((field) => (
                  <div key={field.id}>
                    <label className="text-xs font-semibold text-gray-700">{field.label}</label>
                    {field.field_type === 'date' ? (
                      <input
                        type="date"
                        value={fieldValues[field.id] || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={submitting}
                      />
                    ) : field.field_type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={fieldValues[field.id] === 'true'}
                        onChange={(e) => handleFieldChange(field.id, e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4 text-blue-600"
                        disabled={submitting}
                      />
                    ) : (
                      <input
                        type="text"
                        value={fieldValues[field.id] || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={submitting}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button onClick={handleSubmit} variant="primary" className="w-full" disabled={submitting}>
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
        </div>
      </div>
    </div>
  )
}