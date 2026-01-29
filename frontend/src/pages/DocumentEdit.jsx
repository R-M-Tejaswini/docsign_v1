/**
 * ✅ CONSOLIDATED: Removed version concept
 * - No version state or nested data
 * - Direct document manipulation
 * - Simplified lock/unlock flow
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DocumentViewer } from '../components/pdf/DocumentViewer'
import { PageLayer } from '../components/pdf/PageLayer'
import { FieldPalette } from '../components/fields/FieldPalette'
import { FieldOverlay } from '../components/fields/FieldOverlay'
import { FieldEditor } from '../components/fields/FieldEditor'
import { LinksPanel } from '../components/links/LinksPanel'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'
import { useApi } from '../hooks/useApi'
import { documentAPI } from '../services/api'
import { AuditTrailPanel } from '../components/audit/AuditTrailPanel'

export const DocumentEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [documentData, setDocumentData] = useState(null)
  const [documentTitle, setDocumentTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [fields, setFields] = useState([])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [addingFieldType, setAddingFieldType] = useState(null)
  const [toasts, setToasts] = useState([])
  const [activeTab, setActiveTab] = useState('fields')
  const [allRecipients, setAllRecipients] = useState(['Recipient 1'])
  const [downloadingDocument, setDownloadingDocument] = useState(false)

  // ✅ CONSOLIDATED: Direct document API calls (no version_id)
  const { execute: getDocument } = useApi(() => documentAPI.get(id))
  const { execute: updateDocument } = useApi((data) => documentAPI.update(id, data))
  const { execute: lockDocument } = useApi(() => 
    documentAPI.lock(id)
  )
  const { execute: createField } = useApi((data) =>
    documentAPI.createField(id, data)
  )
  const { execute: updateField } = useApi((fieldId, data) =>
    documentAPI.updateField(id, fieldId, data)
  )
  const { execute: deleteField } = useApi((fieldId) =>
    documentAPI.deleteField(id, fieldId)
  )
  const { execute: downloadDoc } = useApi(() =>
    documentAPI.download(id)
  )

  const addToast = (message, type = 'info') => {
    const toastId = Date.now()
    setToasts([...toasts, { id: toastId, message, type, duration: 3000 }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId))
    }, 3000)
  }

  useEffect(() => {
    loadDocument()
  }, [id])

  const loadDocument = async () => {
    try {
      const data = await getDocument()
      setDocumentData(data)
      setDocumentTitle(data.title)
      setFields(data.fields || [])
      
      const recipients = [...new Set(data.fields?.map(f => f.recipient).filter(Boolean))]
      if (recipients.length > 0) {
        setAllRecipients(recipients.sort())
      }
    } catch (err) {
      addToast('Failed to load document', 'error')
    }
  }

  const handleSaveTitle = async () => {
    if (!documentTitle.trim()) {
      addToast('Document name cannot be empty', 'error')
      return
    }

    try {
      await updateDocument({ title: documentTitle })
      setDocumentData({ ...documentData, title: documentTitle })
      setIsEditingTitle(false)
      addToast('Document name updated', 'success')
    } catch (err) {
      addToast('Failed to update document name', 'error')
      setDocumentTitle(documentData.title)
    }
  }

  const handleLockDocument = async () => {
    if (!window.confirm('Lock this document? You won\'t be able to edit fields after locking.')) {
      return
    }

    const fieldsWithoutRecipient = fields.filter(f => !f.recipient || !f.recipient.trim())
    if (fieldsWithoutRecipient.length > 0) {
      addToast(
        `All fields must have recipients assigned before locking (${fieldsWithoutRecipient.length} fields missing)`,
        'error'
      )
      return
    }

    try {
      const updatedDoc = await lockDocument()
      setDocumentData(updatedDoc)
      addToast('Document locked successfully', 'success')
      setActiveTab('links')
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to lock document'
      addToast(errorMsg, 'error')
    }
  }

  const handleAddField = (fieldType) => {
    if (!isDraftMode) {
      addToast('Cannot add fields in locked mode', 'warning')
      return
    }
    setAddingFieldType(fieldType)
    addToast(`Click on the PDF to add a ${fieldType} field`, 'info')
  }

  const handlePdfClick = async (e) => {
    if (!addingFieldType || !documentData || !isDraftMode) return

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
    if (!isDraftMode && !canUpdateFieldValue(updatedField)) {
      addToast('Cannot update locked fields', 'warning')
      return
    }

    try {
      const updateData = isDraftMode 
        ? {
            label: updatedField.label,
            required: updatedField.required,
            recipient: updatedField.recipient,
            x_pct: updatedField.x_pct,
            y_pct: updatedField.y_pct,
            width_pct: updatedField.width_pct,
            height_pct: updatedField.height_pct,
          }
        : {
            value: updatedField.value,
          }

      await updateField(updatedField.id, updateData)
      setFields(fields.map((f) => (f.id === updatedField.id ? updatedField : f)))
      
      if (updatedField.recipient && !allRecipients.includes(updatedField.recipient)) {
        setAllRecipients([...allRecipients, updatedField.recipient].sort())
      }
      
      addToast('Field updated', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update field', 'error')
    }
  }

  const handleDeleteField = async (fieldId) => {
    if (!isDraftMode) {
      addToast('Cannot delete fields in locked mode', 'warning')
      return
    }

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

  const handleDownloadDocument = async () => {
    try {
      setDownloadingDocument(true)
      const blob = await downloadDoc()
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${documentData.title}_signed.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      addToast('PDF downloaded successfully', 'success')
    } catch (err) {
      addToast('Failed to download PDF: ' + (err.response?.data?.error || err.message), 'error')
    } finally {
      setDownloadingDocument(false)
    }
  }

  const canUpdateFieldValue = (field) => {
    return !field.locked
  }

  if (!documentData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading document...</p>
        </div>
      </div>
    )
  }

  const fileUrl = documentData?.file_url || documentData?.file
  let absoluteFileUrl = fileUrl
  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  const pageFields = fields.filter((f) => f.page_number === currentPage)
  const isDraftMode = documentData.status === 'draft'
  const selectedField = fields.find(f => f.id === selectedFieldId)
  const recipientStats = documentData.recipient_status || {}

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left Sidebar - Field Palette */}
      {activeTab === 'fields' && isDraftMode && (
        <FieldPalette onSelectFieldType={handleAddField} />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Enhanced Header */}
        <div className="bg-white border-b-2 border-gray-200 px-6 py-4 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={documentTitle}
                    onChange={(e) => setDocumentTitle(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle()
                      if (e.key === 'Escape') {
                        setDocumentTitle(documentData.title)
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
                    className={`text-3xl font-bold ${
                      isDraftMode 
                        ? 'cursor-pointer hover:text-blue-600 transition-colors' 
                        : 'cursor-default'
                    }`}
                    onClick={() => isDraftMode && setIsEditingTitle(true)}
                  >
                    {documentData?.title}
                  </h1>
                  {isDraftMode && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">✏️ Click to edit</span>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {documentData?.status === 'completed' && (
                <Button 
                  onClick={handleDownloadDocument} 
                  variant="success" 
                  size="sm"
                  disabled={downloadingDocument}
                >
                  {downloadingDocument ? (
                    <>
                      <span className="animate-spin">⟳</span>
                      Downloading...
                    </>
                  ) : (
                    <>
                      <span>⬇️</span>
                      Download PDF
                    </>
                  )}
                </Button>
              )}

              {isDraftMode && (
                <Button onClick={handleLockDocument} variant="warning" size="sm">
                  <span>🔒</span>
                  Lock Document
                </Button>
              )}
              <Button onClick={() => navigate('/documents')} variant="secondary" size="sm">
                <span>←</span>
                Back
              </Button>
            </div>
          </div>

          {/* Status and Recipients */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-semibold">Status:</span>
              <span className={`font-bold capitalize px-3 py-1 rounded-full text-sm ${
                documentData?.status === 'draft' ? 'bg-blue-100 text-blue-800' :
                documentData?.status === 'completed' ? 'bg-green-100 text-green-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {documentData?.status}
              </span>
              {isDraftMode && <span className="text-blue-600 text-sm font-semibold">(Editable)</span>}
            </div>
            
            {allRecipients.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600 font-semibold">Recipients:</span>
                {allRecipients.map(recipient => {
                  const recipientFields = fields.filter(f => f.recipient === recipient)
                  const stats = recipientStats[recipient]
                  return (
                    <span 
                      key={recipient} 
                      className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                        stats?.completed ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {recipient} ({stats?.signed || 0}/{stats?.total || recipientFields.length})
                      {stats?.completed && ' ✓'}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {addingFieldType && (
            <div className="mt-3 p-3 bg-blue-50 border-2 border-blue-300 rounded-lg">
              <p className="text-sm text-blue-900 font-semibold flex items-center gap-2">
                <span>👆</span>
                Click on the PDF to add a {addingFieldType} field
              </p>
            </div>
          )}

          {/* Enhanced Tab Switcher */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab('fields')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'fields' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="mr-2">📋</span>
              Fields ({fields.length})
            </button>
            <button
              onClick={() => setActiveTab('links')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'links' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="mr-2">🔗</span>
              Links
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'audit' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="mr-2">🔍</span>
              Audit ({documentData?.signatures?.length || 0})
            </button>
          </div>
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
                  {isDraftMode && pageFields.map((field) => (
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

          {/* Right Sidebar */}
          <div className="w-96 bg-white border-l-2 border-gray-200 flex flex-col overflow-hidden shadow-lg">
            {activeTab === 'fields' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <FieldEditor
                  field={selectedField}
                  onUpdate={handleUpdateField}
                  onDelete={() => handleDeleteField(selectedFieldId)}
                  allRecipients={allRecipients}
                  canEdit={isDraftMode}
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
                        const stats = recipientStats[recipient]
                        
                        return (
                          <div key={recipient} className="bg-white p-3 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-bold text-gray-900">{recipient}</span>
                              <span className="text-xs text-gray-600 font-semibold">
                                {recipientFields.length} fields
                              </span>
                            </div>
                            {stats && (
                              <div className="text-xs text-gray-600 flex items-center justify-between">
                                <span>{stats.signed}/{stats.total} signed</span>
                                {stats.completed && <span className="text-green-600 font-bold">✓ Complete</span>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === 'links' ? (
              <LinksPanel document={documentData} />
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                <AuditTrailPanel document={documentData} />
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