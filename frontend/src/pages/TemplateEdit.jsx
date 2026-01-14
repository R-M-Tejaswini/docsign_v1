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
  const [allRecipients, setAllRecipients] = useState(['Recipient 1']) // Start with default

  const { execute: getTemplate } = useApi(() => templateAPI.get(id))
  const { execute: createField } = useApi((data) => templateAPI.createField(id, data))
  const { execute: updateField } = useApi((fid, data) => templateAPI.updateField(id, fid, data))
  const { execute: deleteField } = useApi((fid) => templateAPI.deleteField(id, fid))

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
      
      // Extract all unique recipients from fields
      const recipients = [...new Set(data.fields?.map(f => f.recipient).filter(Boolean))]
      if (recipients.length > 0) {
        setAllRecipients(recipients.sort())
      }
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
    
    const pdfContainer = e.currentTarget
    const rect = pdfContainer.getBoundingClientRect()
    
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    // Determine default recipient
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
      
      // Update recipients list if new recipient added
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
      
      // Update recipients list
      const recipients = [...new Set(updatedFields.map(f => f.recipient).filter(Boolean))]
      setAllRecipients(recipients.sort())
      
      addToast('Field deleted', 'success')
    } catch (err) {
      addToast('Failed to delete field', 'error')
    }
  }

  if (!template) {
    return <div className="p-8 text-center">Loading template...</div>
  }

  const fileUrl = template.file_url || template.file

  // Build absolute URL
let absoluteFileUrl = fileUrl
if (fileUrl && !fileUrl.startsWith('http')) {
  absoluteFileUrl = `http://localhost:8000${fileUrl}`
}
  const pageFields = fields.filter((f) => f.page_number === currentPage)
  const selectedField = fields.find(f => f.id === selectedFieldId)

  return (
    <div className="flex h-screen bg-gray-100">
      <FieldPalette onSelectFieldType={handleAddField} />

      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{template.title}</h1>
            {addingFieldType && (
              <p className="text-sm text-blue-600 mt-1">
                Click on the PDF to add a {addingFieldType} field
              </p>
            )}
            
            {/* Recipient badges */}
            {allRecipients.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-500">Recipients:</span>
                {allRecipients.map(recipient => {
                  const recipientFields = fields.filter(f => f.recipient === recipient)
                  return (
                    <span key={recipient} className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                      {recipient} ({recipientFields.length})
                    </span>
                  )
                })}
              </div>
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

          <div className="w-80 bg-white border-l p-4 overflow-y-auto">
            <FieldEditor
              field={selectedField}
              onUpdate={handleUpdateField}
              onDelete={() => handleDeleteField(selectedFieldId)}
              allRecipients={allRecipients}
              canEdit={true}
            />

            {/* Recipient Summary */}
            {allRecipients.length > 0 && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Recipients Summary
                </h4>
                <div className="space-y-2">
                  {allRecipients.map(recipient => {
                    const recipientFields = fields.filter(f => f.recipient === recipient)
                    const requiredCount = recipientFields.filter(f => f.required).length
                    
                    return (
                      <div key={recipient} className="text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{recipient}</span>
                          <span className="text-gray-500">
                            {recipientFields.length} fields
                          </span>
                        </div>
                        <div className="text-gray-500 mt-1">
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