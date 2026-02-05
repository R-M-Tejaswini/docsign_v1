/**
 * ✅ EXTRACTED: All field management logic
 * ✅ FIXED: Added proper scrollable layout & field editor sidebar
 * ✅ FIXED: Smooth drag-and-resize with proper z-indexing
 */

import { useState, useEffect } from 'react'
import { DocumentViewer } from '../../../pdf/components/DocumentViewer'
import { PageLayer } from '../../../pdf/components/PageLayer'
import { FieldPalette } from '../../../fields/components/FieldPalette'
import { FieldOverlay } from '../../../pdf/components/FieldOverlay'
import { FieldEditor } from '../../../fields/components/FieldEditor'
import { Button } from '../../../../shared/components/ui/Button'
import { useApi } from '../../../../shared/hooks/useApi'
import { documentAPI } from '../../api'

export const FieldsTab = ({ document, onUpdate, addToast }) => {
  const [fields, setFields] = useState([])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [addingFieldType, setAddingFieldType] = useState(null)
  const [allRecipients, setAllRecipients] = useState([])

  const { execute: createField } = useApi((data) => documentAPI.createField(document.id, data))
  const { execute: updateField } = useApi((fieldId, data) => documentAPI.updateField(document.id, fieldId, data))
  const { execute: deleteField } = useApi((fieldId) => documentAPI.deleteField(document.id, fieldId))

  useEffect(() => {
    setFields(document.fields || [])
    const recipients = [...new Set(document.fields?.map((f) => f.recipient) || [])]
    setAllRecipients(recipients.filter(Boolean).sort())
  }, [document])

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

    const defaultRecipient = allRecipients[0] || 'Recipient 1'

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
        required: true,
      })
      setFields([...fields, newField])
      setSelectedFieldId(newField.id)
      setAddingFieldType(null)
      addToast('Field added - drag to reposition', 'success')
    } catch (err) {
      addToast('Failed to add field', 'error')
    }
  }

  const handleUpdateField = async (updatedField) => {
    try {
      await updateField(updatedField.id, {
        label: updatedField.label,
        required: updatedField.required,
        recipient: updatedField.recipient,
        x_pct: updatedField.x_pct,
        y_pct: updatedField.y_pct,
        width_pct: updatedField.width_pct,
        height_pct: updatedField.height_pct,
      })
      setFields(fields.map((f) => (f.id === updatedField.id ? updatedField : f)))
      
      if (updatedField.recipient && !allRecipients.includes(updatedField.recipient)) {
        setAllRecipients([...allRecipients, updatedField.recipient].sort())
      }
      
      addToast('Field updated', 'success')
    } catch (err) {
      addToast('Failed to update field', 'error')
    }
  }

  const handleDeleteField = async (fieldId) => {
    if (!window.confirm('Delete this field?')) return
    
    try {
      await deleteField(fieldId)
      const updatedFields = fields.filter((f) => f.id !== fieldId)
      setFields(updatedFields)
      setSelectedFieldId(null)
      
      const recipients = [...new Set(updatedFields.map(f => f.recipient).filter(Boolean))]
      setAllRecipients(recipients.sort())
      
      addToast('Field deleted', 'success')
    } catch (err) {
      addToast('Failed to delete field', 'error')
    }
  }

  const isDraftMode = document.status === 'draft'
  const pageFields = fields.filter((f) => f.page_number === currentPage)
  const selectedField = fields.find((f) => f.id === selectedFieldId)

  const fileUrl = document.file_url || document.file
  let absoluteFileUrl = fileUrl
  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  return (
    <div className="flex h-full bg-gray-100 overflow-hidden">
      {/* Left Sidebar - Field Palette (only in draft mode) */}
      {isDraftMode && <FieldPalette onSelectFieldType={handleAddField} />}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Info Bar */}
        {addingFieldType && (
          <div className="flex-shrink-0 bg-blue-50 border-b-2 border-blue-300 p-3">
            <p className="text-sm text-blue-900 font-semibold flex items-center gap-2">
              <span>👆</span>
              Click on the PDF to add a {addingFieldType} field
            </p>
          </div>
        )}

        {/* PDF Viewer - scrollable */}
        <div
          className="flex-1 overflow-auto relative"
          onClick={addingFieldType ? handlePdfClick : undefined}
          style={{ cursor: addingFieldType ? 'crosshair' : 'default', userSelect: addingFieldType ? 'none' : 'auto' }}
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
                {isDraftMode &&
                  pageFields.map((field) => (
                    <FieldOverlay
                      key={field.id}
                      field={field}
                      pageWidth={612}
                      pageHeight={792}
                      onUpdate={handleUpdateField}
                      onSelect={setSelectedFieldId}
                      isSelected={selectedFieldId === field.id}
                      isEditing={isDraftMode}
                      scale={scale}
                    />
                  ))}
              </PageLayer>
            )}
          </DocumentViewer>
        </div>
      </div>

      {/* Right Sidebar - Field Editor (like TemplateEdit) */}
      <div className="w-96 bg-white border-l-2 border-gray-200 overflow-y-auto p-4 space-y-4 shadow-lg flex-shrink-0">
        <FieldEditor
          field={selectedField}
          onUpdate={handleUpdateField}
          onDelete={() => handleDeleteField(selectedFieldId)}
          allRecipients={allRecipients}
          canEdit={isDraftMode}
        />

        {/* Recipients Summary */}
        {allRecipients.length > 0 && (
          <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-200">
            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span>👥</span>
              Recipients Summary
            </h4>
            <div className="space-y-3">
              {allRecipients.map(recipient => {
                const recipientFields = fields.filter(f => f.recipient === recipient)
                const requiredCount = recipientFields.filter(f => f.required).length
                
                return (
                  <div key={recipient} className="bg-white p-3 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-gray-900">{recipient}</span>
                      <span className="text-xs text-gray-600 font-semibold">
                        {recipientFields.length} fields
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">
                      {requiredCount} required
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}