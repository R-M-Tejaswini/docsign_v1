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

export const DocumentEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [documentData, setDocumentData] = useState(null) // ← renamed from 'document'
  const [documentTitle, setDocumentTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [version, setVersion] = useState(null)
  const [fields, setFields] = useState([])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [addingFieldType, setAddingFieldType] = useState(null)
  const [toasts, setToasts] = useState([])
  const [activeTab, setActiveTab] = useState('fields') // 'fields' or 'links'
  const [allRecipients, setAllRecipients] = useState(['Recipient 1']) // Start with default
  const [downloadingVersion, setDownloadingVersion] = useState(false)

  const { execute: getDocument } = useApi(() => documentAPI.get(id))
  const { execute: updateDocument } = useApi((data) => documentAPI.update(id, data))
  const { execute: lockVersion } = useApi(() => 
    documentAPI.lockVersion(id, version?.id)
  )
  const { execute: createField } = useApi((data) =>
    documentAPI.createField(id, version?.id, data)
  )
  const { execute: updateField } = useApi((fieldId, data) =>
    documentAPI.updateField(id, version?.id, fieldId, data)
  )
  const { execute: deleteField } = useApi((fieldId) =>
    documentAPI.deleteField(id, version?.id, fieldId)
  )
  const { execute: downloadVersion } = useApi(() =>
    documentAPI.downloadVersion(id, version?.id)
  )

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts([...toasts, { id, message, type, duration: 3000 }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  useEffect(() => {
    loadDocument()
  }, [id])

  const loadDocument = async () => {
    try {
      const data = await getDocument()
      setDocumentData(data) // ← updated
      setDocumentTitle(data.title)
      const latestVersion = data.latest_version
      setVersion(latestVersion)
      setFields(latestVersion?.fields || [])
      
      // Extract all unique recipients from fields
      const recipients = [...new Set(latestVersion?.fields?.map(f => f.recipient).filter(Boolean))]
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
      setDocumentData({ ...documentData, title: documentTitle }) // ← updated
      setIsEditingTitle(false)
      addToast('Document name updated', 'success')
    } catch (err) {
      addToast('Failed to update document name', 'error')
      setDocumentTitle(document.title) // Revert on error
    }
  }

  const handleLockVersion = async () => {
    if (!window.confirm('Lock this version? You won\'t be able to edit fields after locking.')) {
      return
    }

    // Validate all fields have recipients
    const fieldsWithoutRecipient = fields.filter(f => !f.recipient || !f.recipient.trim())
    if (fieldsWithoutRecipient.length > 0) {
      addToast(
        `All fields must have recipients assigned before locking (${fieldsWithoutRecipient.length} fields missing)`,
        'error'
      )
      return
    }

    try {
      const updatedVersion = await lockVersion()
      setVersion(updatedVersion)
      addToast('Version locked successfully', 'success')
      setActiveTab('links') // Switch to links tab
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to lock version'
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
    if (!addingFieldType || !version || !isDraftMode) return

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
            value: updatedField.value, // Only value in locked mode
          }

      await updateField(updatedField.id, updateData)
      setFields(fields.map((f) => (f.id === updatedField.id ? updatedField : f)))
      
      // Update recipients list if new recipient added
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
      
      // Update recipients list
      const recipients = [...new Set(updatedFields.map(f => f.recipient).filter(Boolean))]
      setAllRecipients(recipients.sort())
      
      addToast('Field deleted', 'success')
    } catch (err) {
      addToast('Failed to delete field', 'error')
    }
  }

  const handleDownloadVersion = async () => {
    try {
      setDownloadingVersion(true)
      const blob = await downloadVersion()
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')  // ← now safe to use
      link.href = url
      link.download = `${documentData.title}_v${version.version_number}_signed.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      addToast('PDF downloaded successfully', 'success')
    } catch (err) {
      addToast('Failed to download PDF: ' + (err.response?.data?.error || err.message), 'error')
    } finally {
      setDownloadingVersion(false)
    }
  }

  const canUpdateFieldValue = (field) => {
    // In locked mode, can only update value if field is not locked
    return !field.locked
  }

  if (!documentData || !version) {
    return <div className="p-8 text-center">Loading document...</div>
  }

  const fileUrl = version?.file_url || version?.file

  // Build absolute URL
  let absoluteFileUrl = fileUrl
  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  const pageFields = fields.filter((f) => f.page_number === currentPage)
  const isDraftMode = version.status === 'draft'
  const selectedField = fields.find(f => f.id === selectedFieldId)

  // Get recipient statistics
  const recipientStats = version.recipient_status || {}

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left Sidebar - Field Palette or Links Panel */}
      {activeTab === 'fields' && isDraftMode && (
        <FieldPalette onSelectFieldType={handleAddField} />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
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
                      setDocumentTitle(document.title)
                      setIsEditingTitle(false)
                    }
                  }}
                  autoFocus
                  className="text-2xl font-bold px-2 py-1 border border-blue-500 rounded"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 
                  className={`text-2xl font-bold ${
                    isDraftMode 
                      ? 'cursor-pointer hover:text-blue-600' 
                      : 'cursor-default'
                  }`}
                  onClick={() => isDraftMode && setIsEditingTitle(true)}
                >
                  {documentData?.title}
                </h1>
                {isDraftMode && (
                  <span className="text-xs text-gray-500 ml-2">Click to edit</span>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 mt-1">
              <p className="text-sm text-gray-600">
                Status: <span className={`font-medium capitalize ${
                  version?.status === 'draft' ? 'text-blue-600' :
                  version?.status === 'completed' ? 'text-green-600' :
                  'text-yellow-600'
                }`}>{version?.status}</span>
                {isDraftMode && <span className="text-blue-600 ml-2">(Editable)</span>}
              </p>
              
              {/* Recipient badges */}
              {allRecipients.length > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">Recipients:</span>
                  {allRecipients.map(recipient => {
                    const recipientFields = fields.filter(f => f.recipient === recipient)
                    const stats = recipientStats[recipient]
                    return (
                      <span 
                        key={recipient} 
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          stats?.completed ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {recipient} ({stats?.signed || 0}/{stats?.total || recipientFields.length})
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            {addingFieldType && (
              <p className="text-sm text-blue-600 mt-1">
                Click on the PDF to add a {addingFieldType} field
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {/* Tab Switcher */}
            <div className="flex bg-gray-100 rounded-lg p-1 mr-4">
              <button
                onClick={() => setActiveTab('fields')}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  activeTab === 'fields' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Fields ({fields.length})
              </button>
              <button
                onClick={() => setActiveTab('links')}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  activeTab === 'links' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Links
              </button>
            </div>

            {/* Download Button - Add this */}
            {version?.status === 'completed' && (
              <Button 
                onClick={handleDownloadVersion} 
                variant="secondary" 
                size="sm"
                disabled={downloadingVersion}
              >
                {downloadingVersion ? '⬇️ Downloading...' : '⬇️ Download PDF'}
              </Button>
            )}

            {isDraftMode && (
              <Button onClick={handleLockVersion} variant="warning" size="sm">
                🔒 Lock Version
              </Button>
            )}
            <Button onClick={() => navigate('/documents')} variant="secondary" size="sm">
              ← Back
            </Button>
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
                  {/* Draggable field overlays in draft mode */}
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

          {/* Right Sidebar - Field Editor or Links Panel */}
          <div className="w-80 bg-white border-l overflow-y-auto">
            {activeTab === 'fields' ? (
              <div className="p-4">
                <FieldEditor
                  field={selectedField}
                  onUpdate={handleUpdateField}
                  onDelete={() => handleDeleteField(selectedFieldId)}
                  allRecipients={allRecipients}
                  canEdit={isDraftMode}
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
                        const stats = recipientStats[recipient]
                        
                        return (
                          <div key={recipient} className="text-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-medium">{recipient}</span>
                              <span className="text-gray-500">
                                {recipientFields.length} fields
                              </span>
                            </div>
                            {stats && (
                              <div className="text-gray-500 mt-1">
                                {stats.signed}/{stats.total} signed
                                {stats.completed && <span className="text-green-600 ml-2">✓</span>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <LinksPanel document={document} version={version} />
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