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
  const [templateTitle, setTemplateTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [fields, setFields] = useState([])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [addingFieldType, setAddingFieldType] = useState(null)
  const [toasts, setToasts] = useState([])
  const [allRecipients, setAllRecipients] = useState(['Recipient 1'])

  const { execute: getTemplate } = useApi(() => templateAPI.get(id))
  const { execute: createField } = useApi((data) => templateAPI.createField(id, data))
  const { execute: updateField } = useApi((fid, data) => templateAPI.updateField(id, fid, data))
  const { execute: deleteField } = useApi((fid) => templateAPI.deleteField(id, fid))
  const { execute: updateTemplate } = useApi((data) => templateAPI.update(id, data))

  const addToast = (message, type = 'info') => {
    const toastId = Date.now()
    setToasts([...toasts, { id: toastId, message, type, duration: 3000 }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId))
    }, 3000)
  }

  useEffect(() => {
    loadTemplate()
  }, [id])

  const loadTemplate = async () => {
    try {
      const data = await getTemplate()
      setTemplate(data)
      setTemplateTitle(data.title)
      setFields(data.fields || [])
      
      const recipients = [...new Set(data.fields?.map(f => f.recipient).filter(Boolean))]
      if (recipients.length > 0) {
        setAllRecipients(recipients.sort())
      }
    } catch (err) {
      addToast('Failed to load template', 'error')
    }
  }

  const handleSaveTitle = async () => {
    if (!templateTitle.trim()) {
      addToast('Template name cannot be empty', 'error')
      return
    }

    try {
      await updateTemplate({ title: templateTitle })
      setTemplate({ ...template, title: templateTitle })
      setIsEditingTitle(false)
      addToast('Template name updated', 'success')
    } catch (err) {
      addToast('Failed to update template name', 'error')
      setTemplateTitle(template.title)
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

  if (!template) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading template...</p>
        </div>
      </div>
    )
  }

  const fileUrl = template.file_url || template.file
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
        {/* Enhanced Header */}
        <div className="bg-white border-b-2 border-gray-200 px-6 py-4 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={templateTitle}
                    onChange={(e) => setTemplateTitle(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle()
                      if (e.key === 'Escape') {
                        setTemplateTitle(template.title)
                        setIsEditingTitle(false)
                      }
                    }}
                    autoFocus
                    className="text-2xl font-bold px-3 py-2 border-2 border-blue-500 rounded-lg focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <h1 
                    className="text-3xl font-bold cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    {template?.title}
                  </h1>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">✏️ Click to edit</span>
                </div>
              )}
            </div>

            <Button onClick={() => navigate('/templates')} variant="secondary" size="sm">
              <span>←</span>
              Back to Templates
            </Button>
          </div>

          {addingFieldType && (
            <div className="mb-3 p-3 bg-blue-50 border-2 border-blue-300 rounded-lg">
              <p className="text-sm text-blue-900 font-semibold flex items-center gap-2">
                <span>👆</span>
                Click on the PDF to add a {addingFieldType} field
              </p>
            </div>
          )}
          
          {/* Recipient badges */}
          {allRecipients.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600 font-semibold">Recipients:</span>
              {allRecipients.map(recipient => {
                const recipientFields = fields.filter(f => f.recipient === recipient)
                return (
                  <span key={recipient} className="text-xs px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-bold shadow-sm">
                    {recipient} ({recipientFields.length})
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* PDF Viewer */}
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

          {/* Right Sidebar */}
          <div className="w-96 bg-white border-l-2 border-gray-200 overflow-y-auto p-4 space-y-4 shadow-lg">
            <FieldEditor
              field={selectedField}
              onUpdate={handleUpdateField}
              onDelete={() => handleDeleteField(selectedFieldId)}
              allRecipients={allRecipients}
              canEdit={true}
            />

            {/* Enhanced Recipient Summary */}
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