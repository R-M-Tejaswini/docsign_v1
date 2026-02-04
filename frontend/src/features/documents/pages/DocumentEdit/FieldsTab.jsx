/**
 * ✅ EXTRACTED: All field management logic
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
    setAllRecipients(recipients.filter(Boolean))
  }, [document])

  const handleAddField = (fieldType) => {
    setAddingFieldType(fieldType)
  }

  const handlePdfClick = async (e) => {
    if (!addingFieldType) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    const fieldData = {
      field_type: addingFieldType,
      label: `${addingFieldType} field`,
      recipient: allRecipients[0] || 'Recipient 1',
      page_number: currentPage,
      x_pct: x,
      y_pct: y,
      width_pct: 0.15,
      height_pct: 0.05,
      required: true,
    }

    try {
      await createField(fieldData)
      addToast('Field added', 'success')
      setAddingFieldType(null)
      onUpdate()
    } catch (err) {
      addToast('Failed to add field', 'error')
    }
  }

  const handleUpdateField = async (updatedField) => {
    try {
      await updateField(updatedField.id, updatedField)
      addToast('Field updated', 'success')
      onUpdate()
    } catch (err) {
      addToast('Failed to update field', 'error')
    }
  }

  const handleDeleteField = async (fieldId) => {
    if (!window.confirm('Delete this field?')) return
    try {
      await deleteField(fieldId)
      addToast('Field deleted', 'success')
      onUpdate()
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
    <div className="flex h-screen bg-gray-100">
      {/* Left Sidebar - Field Palette (only in draft mode) */}
      {isDraftMode && <FieldPalette onSelectFieldType={handleAddField} />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* PDF Viewer */}
        <div
          className="flex-1 relative"
          onClick={addingFieldType ? handlePdfClick : undefined}
          style={{ cursor: addingFieldType ? 'crosshair' : 'default' }}
        >
          <DocumentViewer fileUrl={absoluteFileUrl} currentPage={currentPage} onPageChange={setCurrentPage}>
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

          {addingFieldType && (
            <div className="absolute bottom-4 left-4 bg-blue-50 border-2 border-blue-300 rounded-lg p-3">
              <p className="text-sm text-blue-900 font-semibold flex items-center gap-2">
                <span>👆</span>
                Click on the PDF to add a {addingFieldType} field
              </p>
            </div>
          )}
        </div>

        {/* Right Sidebar - Field Editor */}
        <div className="w-96 bg-white border-l-2 border-gray-200 flex flex-col overflow-hidden shadow-lg p-4">
          {selectedField ? (
            <FieldEditor
              field={selectedField}
              onUpdate={handleUpdateField}
              onDelete={handleDeleteField}
              allRecipients={allRecipients}
              canEdit={isDraftMode}
            />
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>Select a field to edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}