//frontend/src/features/templates/pages/TemplateEdit.jsx
/**
 * ✅ UPDATED: TemplateEdit with prefilled_text support
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DocumentViewer } from '../../pdf/components/DocumentViewer'
import { PageLayer } from '../../pdf/components/PageLayer'
import { FieldPalette } from '../../fields/components/FieldPalette'
import { FieldOverlay } from '../../pdf/components/FieldOverlay'
import { FieldEditor } from '../../fields/components/FieldEditor'
import { Toast } from '../../../shared/components/ui/Toast'
import { Button } from '../../../shared/components/ui/Button'
import { useApi } from '../../../shared/hooks/useApi'
import { useToast } from '../../../shared/hooks/useToast'
import { templateAPI } from '../api'

export const TemplateEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [template, setTemplate] = useState(null)
  const [fields, setFields] = useState([])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [addingFieldType, setAddingFieldType] = useState(null)
  const [allRecipients, setAllRecipients] = useState(['Recipient 1'])
  const { toasts, addToast, removeToast } = useToast()

  const { execute: getTemplate } = useApi(() => templateAPI.get(id))
  const { execute: createField } = useApi((data) => templateAPI.createField(id, data))
  const { execute: updateField } = useApi((fid, data) => templateAPI.updateField(id, fid, data))
  const { execute: deleteField } = useApi((fid) => templateAPI.deleteField(id, fid))

  useEffect(() => {
    if (!id) {
      addToast('No template ID provided', 'error')
      navigate('/templates')
      return
    }
    loadTemplate()
  }, [id])

  const loadTemplate = async () => {
    try {
      const data = await getTemplate()
      setTemplate(data)
      setFields(data.fields || [])
      const recipients = [...new Set(data.fields?.map((f) => f.recipient) || [])]
      setAllRecipients(recipients.filter(Boolean).sort())
      addToast('Template loaded', 'success')
    } catch (err) {
      addToast('Failed to load template', 'error')
      console.error(err)
    }
  }

  const handleAddField = (fieldType) => {
    setAddingFieldType(fieldType)
    addToast(`Click on the PDF to add a ${fieldType} field`, 'info')
  }

  const handlePdfClick = async (e) => {
    if (!addingFieldType) return

    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    // ✅ NEW: For static prefilled fields, don't require a recipient
    const isStaticPrefilled = addingFieldType === 'prefilled_text'
    const defaultRecipient = isStaticPrefilled ? null : (allRecipients[0] || 'Recipient 1')

    try {
      const newField = await createField({
        field_type: addingFieldType,
        label: `${addingFieldType.charAt(0).toUpperCase() + addingFieldType.slice(1)} ${fields.length + 1}`,
        recipient: defaultRecipient,
        page_number: currentPage,
        x_pct: Math.max(0, Math.min(1, x)),
        y_pct: Math.max(0, Math.min(1, y)),
        width_pct: 0.15,
        height_pct: 0.05,
        required: addingFieldType === 'prefilled_text' ? false : true,
        // ✅ NEW: Prefilled text defaults
        prefill_value: addingFieldType === 'prefilled_text' ? '' : undefined,
        is_editable_prefill: false,
      })
      setFields([...fields, newField])
      setSelectedFieldId(newField.id)
      setAddingFieldType(null)
      addToast('Field added', 'success')
    } catch (err) {
      addToast('Failed to add field', 'error')
      console.error(err)
    }
  }

  const handleUpdateField = async (updatedField) => {
    try {
      const result = await updateField(updatedField.id, updatedField)
      setFields(fields.map((f) => (f.id === updatedField.id ? result : f)))
      addToast('Field updated', 'success')
    } catch (err) {
      addToast('Failed to update field', 'error')
      console.error(err)
    }
  }

  const handleDeleteField = async (fieldId) => {
    try {
      await deleteField(fieldId)
      setFields(fields.filter((f) => f.id !== fieldId))
      setSelectedFieldId(null)
      addToast('Field deleted', 'success')
    } catch (err) {
      addToast('Failed to delete field', 'error')
    }
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4 mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading template...</p>
        </div>
      </div>
    )
  }

  const pageFields = fields.filter((f) => f.page_number === currentPage)
  const selectedField = fields.find((f) => f.id === selectedFieldId)

  const fileUrl = template.file_url || template.file
  let absoluteFileUrl = fileUrl
  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  return (
    <div className="flex h-full bg-gray-100 overflow-hidden">
      {/* Left Sidebar - Field Palette */}
      <FieldPalette onSelectFieldType={handleAddField} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b-2 border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">{template.title}</h1>
            <button
              onClick={() => navigate('/templates')}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-bold transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Info Bar */}
        {addingFieldType && (
          <div className="flex-shrink-0 bg-blue-50 border-b-2 border-blue-300 p-3">
            <p className="text-sm text-blue-900 font-semibold flex items-center gap-2">
              <span>👆</span>
              Click on the PDF to add a {addingFieldType} field
            </p>
          </div>
        )}

        {/* PDF Viewer */}
        <div
          className="flex-1 overflow-auto relative"
          onClick={addingFieldType ? handlePdfClick : undefined}
          style={{ cursor: addingFieldType ? 'crosshair' : 'default' }}
        >
          <DocumentViewer
            fileUrl={absoluteFileUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          >
            {(pageNum, scale) => (
              <PageLayer
                pageWidth={612}
                pageHeight={792}
                fields={pageFields}
                selectedFieldId={selectedFieldId}
                onFieldSelect={setSelectedFieldId}
                scale={scale}
              >
                {pageFields.map((field) => (
                  <FieldOverlay
                    key={field.id}
                    field={field}
                    pageWidth={612}
                    pageHeight={792}
                    onUpdate={handleUpdateField}
                    onSelect={setSelectedFieldId}
                    isSelected={selectedFieldId === field.id}
                    isEditing={true}
                    scale={scale}
                  />
                ))}
              </PageLayer>
            )}
          </DocumentViewer>
        </div>
      </div>

      {/* Right Sidebar - Field Editor */}
      <div className="w-96 bg-white border-l-2 border-gray-200 overflow-y-auto p-4 space-y-4 shadow-lg flex-shrink-0">
        <FieldEditor
          field={selectedField}
          onUpdate={handleUpdateField}
          onDelete={() => handleDeleteField(selectedFieldId)}
          allRecipients={allRecipients}
          canEdit={true}
        />

        {/* Recipients Summary */}
        {allRecipients.length > 0 && (
          <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-200">
            <h4 className="text-sm font-bold text-gray-900 mb-3">👥 Recipients</h4>
            <div className="space-y-2">
              {allRecipients.map((recipient) => (
                <div key={recipient} className="bg-white p-2 rounded border border-gray-200 text-xs">
                  <p className="font-semibold text-gray-900">{recipient}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}