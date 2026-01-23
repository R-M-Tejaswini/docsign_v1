import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Toast } from '../components/ui/Toast'
import { useApi } from '../hooks/useApi'
import { groupAPI, documentAPI, templateAPI } from '../services/api'
import { DocumentViewer } from '../components/pdf/DocumentViewer'
import { PageLayer } from '../components/pdf/PageLayer'
import { FieldOverlay } from '../components/fields/FieldOverlay'
import { FieldEditor } from '../components/fields/FieldEditor'

export const GroupDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  
  // Main State
  const [group, setGroup] = useState(null)
  const [items, setItems] = useState([])
  const [sessions, setSessions] = useState([])
  const [toasts, setToasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('items')
  
  // Drag & Drop
  const [draggedItemId, setDraggedItemId] = useState(null)
  const [dragOverItemId, setDragOverItemId] = useState(null)
  
  // Document Editor State
  const [editingItemId, setEditingItemId] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [editingFields, setEditingFields] = useState([])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [allRecipients, setAllRecipients] = useState([])
  const [addingFieldType, setAddingFieldType] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  
  // Add Item Modal
  const [showAddItemModal, setShowAddItemModal] = useState(false)
  const [addItemMode, setAddItemMode] = useState('upload')
  const [addItemTitle, setAddItemTitle] = useState('')
  const [addItemFile, setAddItemFile] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [templates, setTemplates] = useState([])
  const [documents, setDocuments] = useState([])
  
  // Create Session Modal
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [sessionRecipient, setSessionRecipient] = useState('')
  const [sessionExpiresIn, setSessionExpiresIn] = useState(30)
  
  // API Hooks
  const { execute: getGroup } = useApi(() => groupAPI.get(id))
  const { execute: getSessions } = useApi(() => groupAPI.getSessions(id))
  const { execute: addItem } = useApi((data) => groupAPI.addItem(id, data))
  const { execute: removeItem } = useApi((itemId) => groupAPI.deleteItem(id, itemId))
  const { execute: reorderItem } = useApi((itemId, data) => groupAPI.reorderItem(id, itemId, data))
  const { execute: createSession } = useApi((data) => groupAPI.createSession(id, data))
  const { execute: revokeSession } = useApi((sessionId) => groupAPI.revokeSession(id, sessionId))
  const { execute: listTemplates } = useApi(() => templateAPI.list())
  const { execute: listDocuments } = useApi(() => documentAPI.list())
  const { execute: getDocument } = useApi((docId) => documentAPI.get(docId))
  const { execute: updateField } = useApi((docId, versionId, fieldId, data) =>
    documentAPI.updateField(docId, versionId, fieldId, data)
  )
  const { execute: deleteField } = useApi((docId, versionId, fieldId) =>
    documentAPI.deleteField(docId, versionId, fieldId)
  )
  const { execute: createField } = useApi((docId, versionId, data) =>
    documentAPI.createField(docId, versionId, data)
  )
  const { execute: lockVersion } = useApi((docId, versionId) =>
    documentAPI.lockVersion(docId, versionId)
  )
  
  // Toast Handler
  const addToast = (message, type = 'info') => {
    const toastId = Date.now()
    setToasts([...toasts, { id: toastId, message, type, duration: 3000 }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId))
    }, 3000)
  }
  
  // Load Initial Data
  useEffect(() => {
    loadGroupData()
  }, [id])
  
  const loadGroupData = async () => {
    setLoading(true)
    try {
      const groupData = await getGroup()
      setGroup(groupData)
      setItems(groupData.items || [])
      
      // ✅ FIX: Handle paginated response
      const sessionsResponse = await getSessions()
      let sessionsArray = []
      
      if (sessionsResponse) {
        // Check if it's a paginated response
        if (sessionsResponse.results && Array.isArray(sessionsResponse.results)) {
          sessionsArray = sessionsResponse.results
        } else if (Array.isArray(sessionsResponse)) {
          sessionsArray = sessionsResponse
        }
      }
      
      setSessions(sessionsArray)
      
      // Load templates and documents for adding items
      const templatesData = await listTemplates()
      const docsData = await listDocuments()
      
      setTemplates(Array.isArray(templatesData) ? templatesData : templatesData?.results || [])
      setDocuments(Array.isArray(docsData) ? docsData : docsData?.results || [])
    } catch (err) {
      console.error('Failed to load group:', err)
      addToast('Failed to load group', 'error')
    } finally {
      setLoading(false)
    }
  }
  
  // Document Editor Functions
const handleEditItem = async (item) => {
  try {
    setEditingItemId(item.id)
    setEditingItem(item)
    setEditingTitle(item.title)
    
    // ✅ FIX: Get the correct document_id
    // The item structure is: { id: 19, version_detail: { document_id: 19, ... } }
    const documentId = item.version_detail?.document_id || item.document_id
    
    if (!documentId) {
      addToast('Error: Could not find document ID', 'error')
      console.error('Item structure:', item)
      return
    }
    
    const docData = await getDocument(documentId)
    const version = docData.latest_version || item.version_detail
    
    setEditingFields(version?.fields || [])
    setCurrentPage(1)
    setSelectedFieldId(null)
    
    const recipients = [...new Set(version?.fields?.map(f => f.recipient).filter(Boolean) || [])]
    setAllRecipients(recipients.sort())
    
    addToast('Document editor opened', 'info')
  } catch (err) {
    console.error('Failed to load document:', err)
    addToast('Failed to load document for editing', 'error')
  }
}
  
  const handleCloseEditor = () => {
    setEditingItemId(null)
    setEditingItem(null)
    setEditingFields([])
    setSelectedFieldId(null)
    setCurrentPage(1)
    setAllRecipients([])
    setAddingFieldType(null)
  }
  
  const handleAddField = (fieldType) => {
    if (editingItem?.version_detail?.status !== 'draft') {
      addToast('Document must be in draft mode to add fields', 'warning')
      return
    }
    setAddingFieldType(fieldType)
  }
  
  const handlePdfClick = async (x, y, pageNum, scale) => {
    if (!addingFieldType || editingItem?.version_detail?.status !== 'draft') return
    
    const xPct = x / scale / 612
    const yPct = y / scale / 792
    
    // ✅ Get correct document ID
    const documentId = editingItem.version_detail?.document_id || editingItem.document_id
    
    const newField = {
      field_type: addingFieldType,
      label: `${addingFieldType.charAt(0).toUpperCase() + addingFieldType.slice(1)} ${editingFields.length + 1}`,
      recipient: allRecipients[0] || 'Recipient 1',
      page_number: pageNum,
      x_pct: Math.max(0, Math.min(1, xPct)),
      y_pct: Math.max(0, Math.min(1, yPct)),
      width_pct: 0.2,
      height_pct: 0.05,
      required: true,
    }
    
    try {
      const createdField = await createField(
        documentId,  // ← Use correct ID
        editingItem.version_detail?.id || editingItem.version,  // ← Use version ID, not version_number
        newField
      )
      
      setEditingFields([...editingFields, createdField])
      if (!allRecipients.includes(newField.recipient)) {
        setAllRecipients([...allRecipients, newField.recipient].sort())
      }
      setAddingFieldType(null)
      addToast('Field added - drag to reposition', 'success')
    } catch (err) {
      console.error('Failed to add field:', err)
      addToast('Failed to add field', 'error')
    }
  }
  
  const handleUpdateField = async (updatedField) => {
    if (editingItem?.version_detail?.status !== 'draft') {
      addToast('Cannot update locked fields', 'warning')
      return
    }
    
    const documentId = editingItem.version_detail?.document_id || editingItem.document_id
    const versionId = editingItem.version_detail?.id || editingItem.version
    
    try {
      const updateData = {
        label: updatedField.label,
        required: updatedField.required,
        recipient: updatedField.recipient,
        x_pct: updatedField.x_pct,
        y_pct: updatedField.y_pct,
        width_pct: updatedField.width_pct,
        height_pct: updatedField.height_pct,
      }
      
      await updateField(documentId, versionId, updatedField.id, updateData)
      
      setEditingFields(editingFields.map((f) => (f.id === updatedField.id ? updatedField : f)))
      
      if (updatedField.recipient && !allRecipients.includes(updatedField.recipient)) {
        setAllRecipients([...allRecipients, updatedField.recipient].sort())
      }
      
      addToast('Field updated', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update field', 'error')
    }
  }
  
  const handleDeleteField = async (fieldId) => {
    if (editingItem?.version_detail?.status !== 'draft') {
      addToast('Cannot delete fields in locked mode', 'warning')
      return
    }
    
    if (!window.confirm('Delete this field?')) return
    
    const documentId = editingItem.version_detail?.document_id || editingItem.document_id
    const versionId = editingItem.version_detail?.id || editingItem.version
    
    try {
      await deleteField(documentId, versionId, fieldId)
      
      const updatedFields = editingFields.filter((f) => f.id !== fieldId)
      setEditingFields(updatedFields)
      setSelectedFieldId(null)
      
      const recipients = [...new Set(updatedFields.map(f => f.recipient).filter(Boolean))]
      setAllRecipients(recipients.sort())
      
      addToast('Field deleted', 'success')
    } catch (err) {
      addToast('Failed to delete field', 'error')
    }
  }
  
  const handleLockVersion = async () => {
    if (!window.confirm('Lock this document? You won\'t be able to edit fields after locking.')) {
      return
    }
    
    const fieldsWithoutRecipient = editingFields.filter(f => !f.recipient || !f.recipient.trim())
    if (fieldsWithoutRecipient.length > 0) {
      addToast(
        `All fields must have recipients assigned before locking (${fieldsWithoutRecipient.length} fields missing)`,
        'error'
      )
      return
    }
    
    const documentId = editingItem.version_detail?.document_id || editingItem.document_id
    const versionId = editingItem.version_detail?.id || editingItem.version
    
    try {
      await lockVersion(documentId, versionId)
      
      setEditingItem({
        ...editingItem,
        version_detail: { ...editingItem.version_detail, status: 'locked' }
      })
      
      addToast('Document locked successfully', 'success')
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to lock version'
      addToast(errorMsg, 'error')
    }
  }
  
  // Drag & Drop Handler
  const handleDragStart = (e, itemId) => {
    setDraggedItemId(itemId)
    e.dataTransfer.effectAllowed = 'move'
  }
  
  const handleDragOver = (e, itemId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverItemId(itemId)
  }
  
  const handleDrop = async (e, targetItemId) => {
    e.preventDefault()
    
    if (!draggedItemId || draggedItemId === targetItemId) {
      setDraggedItemId(null)
      setDragOverItemId(null)
      return
    }
    
    const draggedItem = items.find((i) => i.id === draggedItemId)
    const targetItem = items.find((i) => i.id === targetItemId)
    
    if (!draggedItem || !targetItem) return
    
    // Update UI optimistically
    const newItems = items.map((item) => {
      if (item.id === draggedItem.id) {
        return { ...item, order: targetItem.order }
      }
      if (item.id === targetItem.id) {
        return { ...item, order: draggedItem.order }
      }
      return item
    })
    
    // Sort by order
    newItems.sort((a, b) => a.order - b.order)
    setItems(newItems)
    
    try {
      // Reorder on backend
      await reorderItem(draggedItem.id, { new_order: targetItem.order })
      addToast('Document reordered', 'success')
    } catch (err) {
      console.error('Failed to reorder:', err)
      addToast('Failed to reorder document', 'error')
      // Revert on error
      loadGroupData()
    }
    
    setDraggedItemId(null)
    setDragOverItemId(null)
  }
  
  const handleAddItem = async () => {
    if (!addItemTitle.trim()) {
      addToast('Please enter a title', 'error')
      return
    }
    
    try {
      const formData = new FormData()
      formData.append('title', addItemTitle)
      formData.append('source', addItemMode)
      
      if (addItemMode === 'upload' && addItemFile) {
        formData.append('file', addItemFile)
      } else if (addItemMode === 'template' && selectedTemplate) {
        formData.append('template_id', selectedTemplate)
      } else if (addItemMode === 'existing' && selectedDocument) {
        formData.append('document_id', selectedDocument)
      } else {
        addToast('Please select the required source', 'error')
        return
      }
      
      const newItem = await addItem(formData)
      setItems([...items, newItem])
      setShowAddItemModal(false)
      setAddItemTitle('')
      setAddItemFile(null)
      setSelectedTemplate(null)
      setSelectedDocument(null)
      setAddItemMode('upload')
      addToast('Document added to group', 'success')
    } catch (err) {
      console.error('Failed to add item:', err)
      addToast('Failed to add document: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }
  
  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Remove this document from the group?')) return
    
    try {
      await removeItem(itemId)
      setItems(items.filter((item) => item.id !== itemId))
      addToast('Document removed', 'success')
    } catch (err) {
      console.error('Failed to delete item:', err)
      addToast('Failed to remove document', 'error')
    }
  }
  
  const handleCreateSession = async () => {
    if (!sessionRecipient.trim()) {
      addToast('Please enter recipient name', 'error')
      return
    }
    
    if (items.length === 0) {
      addToast('Group must have at least one document', 'error')
      return
    }
    
    try {
      const newSession = await createSession({
        recipient: sessionRecipient,
        expires_in_days: sessionExpiresIn,
      })
      setSessions([...sessions, newSession])
      setShowSessionModal(false)
      setSessionRecipient('')
      setSessionExpiresIn(30)
      addToast('✅ Signing session created!', 'success')
    } catch (err) {
      console.error('Failed to create session:', err)
      addToast('Failed to create session: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }
  
  const handleRevokeSession = async (sessionId) => {
    if (!window.confirm('Revoke this signing session?')) return
    
    try {
      await revokeSession(sessionId)
      setSessions(sessions.filter((s) => s.id !== sessionId))
      addToast('Session revoked', 'success')
    } catch (err) {
      console.error('Failed to revoke session:', err)
      addToast('Failed to revoke session', 'error')
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-700 font-semibold">Loading group...</p>
        </div>
      </div>
    )
  }
  
  if (!group) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Group not found</h2>
          <Button onClick={() => navigate('/groups')} variant="primary">
            Back to Groups
          </Button>
        </div>
      </div>
    )
  }
  
  // ========== DOCUMENT EDITOR VIEW ==========
  if (editingItemId) {
    // ✅ FIX: Get file_url from latest_version, not version_detail
    const fileUrl = editingItem?.version_detail?.file_url || 
                    editingItem?.latest_version?.file_url ||
                    editingItem?.version_detail?.file
  
    let absoluteFileUrl = fileUrl
    if (fileUrl && !fileUrl.startsWith('http')) {
      absoluteFileUrl = `http://localhost:8000${fileUrl}`
    }
    
    const pageFields = editingFields.filter((f) => f.page_number === currentPage)
    const isDraftMode = editingItem?.version_detail?.status === 'draft'
    const selectedField = editingFields.find(f => f.id === selectedFieldId)
    
    return (
      <div className="flex h-screen bg-gray-100">
        {/* Left Sidebar - Field Tools */}
        {isDraftMode && (
          <div className="w-48 bg-white border-r-2 border-gray-200 p-4 overflow-y-auto shadow-lg">
            <div className="mb-6">
              <h3 className="font-bold text-gray-900 mb-3">Add Field</h3>
              <div className="space-y-2">
                {['text', 'signature', 'date', 'checkbox'].map((type) => (
                  <button
                    key={type}
                    onClick={() => handleAddField(type)}
                    className={`w-full px-3 py-2 rounded-lg text-sm font-semibold transition ${
                      addingFieldType === type
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {type === 'text' && '📝 Text'}
                    {type === 'signature' && '✍️ Signature'}
                    {type === 'date' && '📅 Date'}
                    {type === 'checkbox' && '☑️ Checkbox'}
                  </button>
                ))}
              </div>
            </div>
            
            {addingFieldType && (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-3 mb-6">
                <p className="text-xs text-blue-900 font-semibold">👆 Click on PDF to add {addingFieldType} field</p>
              </div>
            )}
            
            <div className="mb-6">
              <h3 className="font-bold text-gray-900 mb-3">Recipients</h3>
              <div className="space-y-2">
                {allRecipients.map((recipient) => (
                  <div
                    key={recipient}
                    className="bg-blue-50 border-2 border-blue-200 rounded-lg px-3 py-2"
                  >
                    <p className="text-xs text-blue-900 font-bold">{recipient}</p>
                    <p className="text-xs text-blue-700">
                      {editingFields.filter(f => f.recipient === recipient).length} fields
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-white border-b-2 border-gray-200 p-6 shadow-sm">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                {isEditingTitle ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => setIsEditingTitle(false)}
                    autoFocus
                    className="text-3xl font-bold text-gray-900 border-2 border-blue-500 rounded px-2 py-1"
                  />
                ) : (
                  <h1
                    className="text-3xl font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    {editingTitle}
                  </h1>
                )}
                <p className="text-sm text-gray-600 mt-2">
                  Status: <span className={`font-bold ${
                    isDraftMode ? 'text-blue-600' : 'text-yellow-600'
                  }`}>
                    {editingItem?.version_detail?.status}
                  </span>
                </p>
              </div>
              
              <div className="flex gap-2">
                {isDraftMode && (
                  <Button
                    onClick={handleLockVersion}
                    variant="warning"
                    size="sm"
                  >
                    🔒 Lock Document
                  </Button>
                )}
                <Button
                  onClick={handleCloseEditor}
                  variant="secondary"
                  size="sm"
                >
                  ← Back to Group
                </Button>
              </div>
            </div>
          </div>
          
          {/* PDF Viewer & Field Editor */}
          <div className="flex-1 flex overflow-hidden">
            {/* PDF Viewer */}
            <div
              className="flex-1 relative"
              onClick={(e) => {
                if (!addingFieldType) return
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const y = e.clientY - rect.top
                handlePdfClick(x, y, currentPage, 1)
              }}
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
            
            {/* Right Sidebar - Field Properties */}
            {selectedField && isDraftMode && (
              <div className="w-80 bg-white border-l-2 border-gray-200 p-4 overflow-y-auto shadow-lg">
                <FieldEditor
                  field={selectedField}
                  allRecipients={allRecipients}
                  onUpdate={handleUpdateField}
                  onDelete={() => handleDeleteField(selectedField.id)}
                />
              </div>
            )}
          </div>
        </div>
        
        {/* Toasts */}
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
  
  // ========== GROUP DETAIL VIEW ==========
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">{group.title}</h1>
            <p className="text-gray-600 mt-2">{group.description}</p>
          </div>
          <Button
            onClick={() => navigate('/groups')}
            variant="secondary"
          >
            ← Back
          </Button>
        </div>
        
        <div className="flex gap-4 flex-wrap">
          <div className="bg-blue-50 rounded-lg px-4 py-2 border border-blue-200">
            <span className="text-sm text-gray-600">Documents:</span>
            <span className="ml-2 font-bold text-blue-600">{items.length}</span>
          </div>
          <div className="bg-green-50 rounded-lg px-4 py-2 border border-green-200">
            <span className="text-sm text-gray-600">Active Sessions:</span>
            <span className="ml-2 font-bold text-green-600">
              {sessions.filter((s) => s.status === 'in_progress').length}
            </span>
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-4 border-b-2 border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('items')}
          className={`px-6 py-3 font-semibold transition ${
            activeTab === 'items'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📄 Documents ({items.length})
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-6 py-3 font-semibold transition ${
            activeTab === 'sessions'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🔗 Sessions ({sessions.length})
        </button>
      </div>
      
      {/* Items Tab */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          <Button
            onClick={() => setShowAddItemModal(true)}
            variant="primary"
            className="mb-6"
          >
            <span>➕</span>
            Add Document
          </Button>
          
          {items.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300">
              <div className="text-6xl mb-4">📋</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No documents yet</h3>
              <p className="text-gray-600 mb-6">Add documents to create a signing sequence</p>
              <Button onClick={() => setShowAddItemModal(true)} variant="primary">
                Add First Document
              </Button>
            </div>
          ) : (
            <div className="space-y-3 bg-white p-6 rounded-2xl border-2 border-gray-100">
              <p className="text-sm text-gray-600 font-semibold mb-4">
                💡 Tip: Drag documents to reorder
              </p>
              
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={(e) => handleDrop(e, item.id)}
                  className={`
                    bg-white rounded-lg border-2 p-4 transition cursor-move
                    ${draggedItemId === item.id
                      ? 'opacity-50 border-blue-400 bg-blue-50'
                      : dragOverItemId === item.id
                      ? 'border-blue-500 bg-blue-50 transform scale-105'
                      : 'border-gray-200 hover:border-blue-400'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 flex items-start gap-3">
                      <div className="bg-blue-100 text-blue-700 font-bold rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
                        {idx + 1}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                        <div className="flex gap-3 text-sm mt-2">
                          <span className="text-gray-600">
                            📄 v{item.version_detail?.version || '1'}
                          </span>
                          <span className={`px-2 py-1 rounded font-semibold text-xs ${
                            item.version_detail?.status === 'locked'
                              ? 'bg-yellow-100 text-yellow-800'
                              : item.version_detail?.status === 'draft'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {item.version_detail?.status}
                          </span>
                          {item.version_detail?.recipients?.length > 0 && (
                            <span className="text-gray-600">
                              👥 {item.version_detail.recipients.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        onClick={() => handleEditItem(item)}
                        variant="primary"
                        size="sm"
                      >
                        ✏️ Edit
                      </Button>
                      <Button
                        onClick={() => handleDeleteItem(item.id)}
                        variant="danger"
                        size="sm"
                      >
                        🗑️
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <Button
            onClick={() => setShowSessionModal(true)}
            variant="primary"
            className="mb-6"
            disabled={items.length === 0}
          >
            <span>🔗</span>
            Create Signing Session
          </Button>
          
          {items.length === 0 && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 font-semibold">
                ⚠️ Add at least one document to the group before creating a signing session
              </p>
            </div>
          )}
          
          {sessions.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300">
              <div className="text-6xl mb-4">🔗</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No sessions yet</h3>
              <p className="text-gray-600 mb-6">Create a signing session to share with recipients</p>
              <Button
                onClick={() => setShowSessionModal(true)}
                variant="primary"
                disabled={items.length === 0}
              >
                Create Session
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const progress = session.progress || { completed: 0, total: 0, percentage: 0 }
                const isActive = session.status === 'in_progress' || session.status === 'pending'
                
                return (
                  <div
                    key={session.id}
                    className={`rounded-lg border-2 p-4 transition ${
                      isActive
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-bold text-gray-900">
                            {session.recipient}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            session.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : session.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : session.status === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {session.status}
                          </span>
                        </div>
                        
                        <div className="mb-2">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">Progress</span>
                            <span className="font-bold text-gray-900">
                              {progress.completed}/{progress.total}
                            </span>
                          </div>
                          <div className="w-full bg-gray-300 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${progress.percentage}%` }}
                            />
                          </div>
                        </div>
                        
                        <p className="text-sm text-gray-600">
                          Created: {new Date(session.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      
                      {isActive && (
                        <Button
                          onClick={() => handleRevokeSession(session.id)}
                          variant="danger"
                          size="sm"
                        >
                          🚫 Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Add Item Modal */}
      <Modal
        isOpen={showAddItemModal}
        onClose={() => {
          setShowAddItemModal(false)
          setAddItemMode('upload')
          setAddItemTitle('')
          setAddItemFile(null)
          setSelectedTemplate(null)
          setSelectedDocument(null)
        }}
        title="Add Document to Group"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Document Title
            </label>
            <input
              type="text"
              value={addItemTitle}
              onChange={(e) => setAddItemTitle(e.target.value)}
              placeholder="e.g., Signature Page, NDA, etc."
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Source
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'upload', label: '📤 Upload' },
                { id: 'template', label: '📋 Template' },
                { id: 'existing', label: '📄 Document' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setAddItemMode(mode.id)}
                  className={`py-3 px-2 rounded-lg font-semibold transition border-2 ${
                    addItemMode === mode.id
                      ? 'bg-blue-100 border-blue-600 text-blue-900'
                      : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          
          {addItemMode === 'upload' && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                PDF File
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setAddItemFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}
          
          {addItemMode === 'template' && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Select Template
              </label>
              <select
                value={selectedTemplate || ''}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              >
                <option value="">-- Choose a template --</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {addItemMode === 'existing' && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Select Document
              </label>
              <select
                value={selectedDocument || ''}
                onChange={(e) => setSelectedDocument(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              >
                <option value="">-- Choose a document --</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => {
                setShowAddItemModal(false)
                setAddItemMode('upload')
                setAddItemTitle('')
                setAddItemFile(null)
                setSelectedTemplate(null)
                setSelectedDocument(null)
              }}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddItem}
              variant="primary"
              className="flex-1"
            >
              Add Document
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* Create Session Modal */}
      <Modal
        isOpen={showSessionModal}
        onClose={() => {
          setShowSessionModal(false)
          setSessionRecipient('')
          setSessionExpiresIn(30)
        }}
        title="Create Signing Session"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Recipient Name
            </label>
            <input
              type="text"
              value={sessionRecipient}
              onChange={(e) => setSessionRecipient(e.target.value)}
              placeholder="e.g., John Doe"
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Link Expires In (days)
            </label>
            <input
              type="number"
              value={sessionExpiresIn}
              onChange={(e) => setSessionExpiresIn(parseInt(e.target.value))}
              min="1"
              max="365"
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>
          
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>📝 Info:</strong> The recipient will receive {items.length} documents to sign sequentially.
            </p>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => {
                setShowSessionModal(false)
                setSessionRecipient('')
                setSessionExpiresIn(30)
              }}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSession}
              variant="primary"
              className="flex-1"
            >
              Create Session
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* Toasts */}
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