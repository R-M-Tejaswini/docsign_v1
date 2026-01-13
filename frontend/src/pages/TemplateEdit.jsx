import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DocumentViewer } from '../components/pdf/DocumentViewer'
import { PageLayer } from '../components/pdf/PageLayer'
import { FieldPalette } from '../components/fields/FieldPalette'
import { FieldOverlay } from '../components/fields/FieldOverlay'
import { FieldEditor } from '../components/fields/FieldEditor'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'
import { useApi } from '../hooks/useApi'
import { templateAPI } from '../services/api'

export const TemplateEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [template, setTemplate] = useState(null)
  const [fields, setFields] = useState([])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [addingFieldType, setAddingFieldType] = useState(null)
  const [toasts, setToasts] = useState([])

  const { execute: getTemplate } = useApi(() => templateAPI.get(id))
  const { execute: createField } = useApi((data) =>
    templateAPI.createField(id, data)
  )
  const { execute: updateField } = useApi((fid, data) =>
    templateAPI.updateField(id, fid, data)
  )
  const { execute: deleteField } = useApi((fid) =>
    templateAPI.deleteField(id, fid)
  )

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts([...toasts, { id, message, type, duration: 3000 }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  useEffect(() => {
    loadTemplate()
  }, [id])

  const loadTemplate = async () => {
    try {
      const data = await getTemplate()
      setTemplate(data)
      setFields(data.fields || [])
    } catch (err) {
      addToast('Failed to load template', 'error')
    }
  }

  const handleAddField = (fieldType) => {
    setAddingFieldType(fieldType)
    addToast(`Click on the PDF to add a ${fieldType} field`, 'info')
  }

  const handlePdfClick = async (e) => {
    if (!addingFieldType || !template) return

    e.stopPropagation()
    
    // Get the PDF container position (the scaled element inside DocumentViewer)
    const pdfContainer = e.currentTarget
    const rect = pdfContainer.getBoundingClientRect()
    
    // Calculate position relative to unscaled PDF dimensions
    // The click coordinates need to account for the PDF scale
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    try {
      const newField = await createField({
        field_type: addingFieldType,
        label: `${addingFieldType.charAt(0).toUpperCase() + addingFieldType.slice(1)} ${fields.length + 1}`,
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
      // Only send the fields that can be updated
      await updateField(updatedField.id, {
        label: updatedField.label,
        required: updatedField.required,
      })
      setFields(fields.map((f) => (f.id === updatedField.id ? updatedField : f)))
      addToast('Field updated', 'success')
    } catch (err) {
      addToast('Failed to update field', 'error')
    }
  }

  const handleDeleteField = async (fieldId) => {
    if (!window.confirm('Delete this field?')) return
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
    return <div className="p-8 text-center">Loading template...</div>
  }

  const fileUrl = template.file_url || template.file
  const pageFields = fields.filter((f) => f.page_number === currentPage)

  return (
    <div className="flex h-screen bg-gray-100">
      <FieldPalette onSelectFieldType={handleAddField} />

      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{template.name}</h1>
            {addingFieldType && (
              <p className="text-sm text-blue-600 mt-1">
                Click on the PDF to add a {addingFieldType} field
              </p>
            )}
          </div>
          <Button onClick={() => navigate('/templates')} variant="secondary">
            ← Back
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div 
            className="flex-1 relative"
            onClick={addingFieldType ? handlePdfClick : undefined}
            style={{ cursor: addingFieldType ? 'crosshair' : 'default' }}
          >
            <DocumentViewer
              fileUrl={fileUrl}
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
                      scale={scale}
                      isSelected={selectedFieldId === field.id}
                      isEditing={true}
                      onUpdate={handleUpdateField}
                      onSelect={setSelectedFieldId}
                    />
                  ))}
                </PageLayer>
              )}
            </DocumentViewer>
          </div>

          {selectedFieldId && (
            <FieldEditor
              field={fields.find((f) => f.id === selectedFieldId)}
              onUpdate={handleUpdateField}
              onDelete={handleDeleteField}
              onClose={() => setSelectedFieldId(null)}
            />
          )}
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