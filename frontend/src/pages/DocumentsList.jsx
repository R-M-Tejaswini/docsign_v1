import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useApi } from '../hooks/useApi'
import { documentAPI, templateAPI } from '../services/api'
import { getRecipientBadgeClasses } from '../utils/recipientColors'

export const DocumentsList = () => {
  const navigate = useNavigate()
  const [documentVersions, setDocumentVersions] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [newDocFile, setNewDocFile] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [templates, setTemplates] = useState([])
  const [copyingVersionId, setCopyingVersionId] = useState(null)
  const [createMode, setCreateMode] = useState('template') // 'template' or 'upload'
  
  const { execute: listDocuments, loading } = useApi(() => documentAPI.list())
  const { execute: createDocument } = useApi((data) => documentAPI.create(data))
  const { execute: copyDocumentVersion } = useApi((docId, versionId) =>
    documentAPI.copyVersion(docId, versionId)
  )

  useEffect(() => {
    loadDocuments()
    loadTemplates()
  }, [])

  const loadDocuments = async () => {
    try {
      const axiosResponse = await documentAPI.getVersions()
      const response = axiosResponse.data || axiosResponse
      
      let versionsArray = []
      if (response && typeof response === 'object') {
        if (Array.isArray(response)) {
          versionsArray = response
        } else if (response.results && Array.isArray(response.results)) {
          versionsArray = response.results
        }
      }
      
      versionsArray.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setDocumentVersions(versionsArray)
    } catch (err) {
      console.error('Failed to load documents:', err)
    }
  }

  const loadTemplates = async () => {
    try {
      const axiosResponse = await templateAPI.list()
      // Extract data from axios response
      const data = axiosResponse.data || axiosResponse
      
      // Handle different response structures
      let templatesArray = []
      if (data && typeof data === 'object') {
        if (Array.isArray(data)) {
          templatesArray = data
        } else if (data.results && Array.isArray(data.results)) {
          templatesArray = data.results
        }
      }
      setTemplates(templatesArray)
    } catch (err) {
      console.error('Failed to load templates:', err)
      setTemplates([]) // Set empty array on error
    }
  }

  const handleCreateDocument = async () => {
    if (!newDocTitle.trim()) {
      alert('Please enter a document title')
      return
    }

    if (createMode === 'template' && !selectedTemplateId) {
      alert('Please select a template')
      return
    }

    if (createMode === 'upload' && !newDocFile) {
      alert('Please select a PDF file')
      return
    }

    try {
      const payload = {
        title: newDocTitle,
      }
      
      if (createMode === 'template') {
        payload.template_id = selectedTemplateId
      } else {
        payload.file = newDocFile
      }

      const newDoc = await createDocument(payload)
      setShowCreateModal(false)
      setNewDocTitle('')
      setNewDocFile(null)
      setSelectedTemplateId(null)
      setCreateMode('template')
      await loadDocuments()
      navigate(`/documents/${newDoc.id}`)
    } catch (err) {
      alert('Failed to create document: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleCopyVersion = async (documentId, versionId) => {
    try {
      setCopyingVersionId(versionId)
      const newVersion = await copyDocumentVersion(documentId, versionId)
      await loadDocuments()
      navigate(`/documents/${documentId}`)
    } catch (err) {
      alert('Failed to copy version: ' + (err.response?.data?.error || err.message))
    } finally {
      setCopyingVersionId(null)
    }
  }

  const getStatusBadge = (status) => {
    const badges = {
      draft: {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        icon: '✏️',
        label: 'Draft'
      },
      locked: {
        bg: 'bg-yellow-100',
        text: 'text-yellow-800',
        icon: '🔒',
        label: 'Locked'
      },
      'in-progress': {
        bg: 'bg-purple-100',
        text: 'text-purple-800',
        icon: '⏳',
        label: 'Signing'
      },
      completed: {
        bg: 'bg-green-100',
        text: 'text-green-800',
        icon: '✓',
        label: 'Completed'
      }
    }
    return badges[status] || badges.draft
  }

  const getRecipientProgressText = (version) => {
    if (!version) return null
    
    const recipientStatus = version.recipient_status
    if (!recipientStatus) return null

    const statuses = Object.values(recipientStatus)
    const totalRecipients = statuses.length
    const completedRecipients = statuses.filter(s => s.completed).length

    if (totalRecipients === 0) return null
    return `${completedRecipients}/${totalRecipients} recipients signed`
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center text-gray-500">Loading documents...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-600 mt-2">All document versions for signing and editing</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          variant="primary"
        >
          + Create Document
        </Button>
      </div>

      {/* Create Document Modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => {
          setShowCreateModal(false)
          setNewDocTitle('')
          setNewDocFile(null)
          setSelectedTemplateId(null)
          setCreateMode('template')
        }}
        title="Create New Document"
      >
        <div className="space-y-4">
          {/* Document Title */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Document Title
            </label>
            <input
              type="text"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              placeholder="Enter document title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Create Mode Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">
              How would you like to create this document?
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors" 
                style={{ borderColor: createMode === 'template' ? '#3b82f6' : '#e5e7eb', backgroundColor: createMode === 'template' ? '#eff6ff' : 'white' }}>
                <input
                  type="radio"
                  name="create-mode"
                  value="template"
                  checked={createMode === 'template'}
                  onChange={(e) => setCreateMode(e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="font-medium text-gray-900">Use Existing Template</span>
              </label>
              
              <label className="flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors"
                style={{ borderColor: createMode === 'upload' ? '#3b82f6' : '#e5e7eb', backgroundColor: createMode === 'upload' ? '#eff6ff' : 'white' }}>
                <input
                  type="radio"
                  name="create-mode"
                  value="upload"
                  checked={createMode === 'upload'}
                  onChange={(e) => setCreateMode(e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="font-medium text-gray-900">Upload PDF File</span>
              </label>
            </div>
          </div>

          {/* Template Selection */}
          {createMode === 'template' && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Select Template *
              </label>
              {!templates || templates.length === 0 ? (
                <p className="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
                  No templates available. <a href="/templates" className="text-blue-600 hover:underline">Create one first</a>
                </p>
              ) : (
                <select
                  value={selectedTemplateId || ''}
                  onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white"
                >
                  <option value="">-- Select a template --</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title} ({template.page_count} pages • {template.fields?.length || 0} fields)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* File Upload */}
          {createMode === 'upload' && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Upload PDF File *
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setNewDocFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              {newDocFile && (
                <p className="text-xs text-gray-600 mt-2">
                  Selected: {newDocFile.name}
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={() => {
                setShowCreateModal(false)
                setNewDocTitle('')
                setNewDocFile(null)
                setSelectedTemplateId(null)
                setCreateMode('template')
              }}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateDocument}
              variant="primary"
              className="flex-1"
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Documents Grid */}
      {documentVersions.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📄</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No documents yet</h2>
          <p className="text-gray-600 mb-6">Create your first document to get started</p>
          <Button
            onClick={() => setShowCreateModal(true)}
            variant="primary"
          >
            Create Document
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documentVersions.map((version) => {
            const statusBadge = getStatusBadge(version.status)
            const progressText = getRecipientProgressText(version)
            const allRecipients = version.recipients || []
            const isLocked = version.status !== 'draft'

            return (
              <div
                key={`${version.document_id}-${version.id}`}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden group"
              >
                {/* Card Preview Area */}
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 h-40 flex items-center justify-center group-hover:from-indigo-100 group-hover:to-indigo-200 transition-colors">
                  <div className="text-4xl text-indigo-300">📑</div>
                </div>

                {/* Card Content */}
                <div className="p-6 space-y-4">
                  {/* Document Title and Status */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                          {version.document_title}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          v{version.version_number}
                        </p>
                      </div>
                      <span className={`${statusBadge.bg} ${statusBadge.text} text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1`}>
                        <span>{statusBadge.icon}</span>
                        {statusBadge.label}
                      </span>
                    </div>
                    {version.document_description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {version.document_description}
                      </p>
                    )}
                  </div>

                  {/* Version Info */}
                  <div className="space-y-3 pt-2 border-t border-gray-200">
                    {/* Progress Bar for Signing */}
                    {progressText && (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-gray-600">
                            Signing Progress
                          </span>
                          <span className="text-xs font-semibold text-gray-900">
                            {progressText}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          {(() => {
                            const statuses = Object.values(version.recipient_status || {})
                            const completed = statuses.filter(s => s.completed).length
                            const total = statuses.length || 1
                            const percentage = (completed / total) * 100
                            return (
                              <div
                                className="bg-gradient-to-r from-green-400 to-green-600 h-full rounded-full transition-all"
                                style={{ width: `${percentage}%` }}
                              ></div>
                            )
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Recipients */}
                    {allRecipients.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-gray-600 block mb-2">
                          Recipients ({allRecipients.length})
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {allRecipients.map((recipient, idx) => (
                            <span
                              key={`${version.id}-recipient-${idx}`}
                              className={`${getRecipientBadgeClasses(recipient, allRecipients)} text-xs`}
                            >
                              {recipient}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Created: {formatDate(version.created_at)}</span>
                      <span className="text-gray-700 font-medium">
                        {version.page_count} pages
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <Button
                      onClick={() => navigate(`/documents/${version.document_id}`)}
                      variant="secondary"
                      className="w-full"
                    >
                      Open →
                    </Button>
                    
                    {/* Copy Version Button - only for locked/completed versions */}
                    {isLocked && (
                      <Button
                        onClick={() => handleCopyVersion(version.document_id, version.id)}
                        variant="secondary"
                        className="w-full"
                        disabled={copyingVersionId === version.id}
                      >
                        {copyingVersionId === version.id ? 'Copying...' : '📋 Create New Version'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}