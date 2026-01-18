import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useApi } from '../hooks/useApi'
import { documentAPI, templateAPI } from '../services/api'
import { getRecipientBadgeClasses } from '../utils/recipientColors'

export const DocumentsList = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [documentVersions, setDocumentVersions] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [newDocFile, setNewDocFile] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [templates, setTemplates] = useState([])
  const [copyingVersionId, setCopyingVersionId] = useState(null)
  const [downloadingVersionId, setDownloadingVersionId] = useState(null)
  const [createMode, setCreateMode] = useState('template')
  
  const { execute: listDocuments, loading } = useApi(() => documentAPI.list())
  const { execute: createDocument } = useApi((data) => documentAPI.create(data))
  const { execute: copyDocumentVersion } = useApi((docId, versionId) =>
    documentAPI.copyVersion(docId, versionId)
  )
  const { execute: downloadVersion } = useApi((docId, versionId) =>
    documentAPI.downloadVersion(docId, versionId)
  )

  useEffect(() => {
    loadDocuments()
    loadTemplates()
  }, [location.pathname])

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
      const data = axiosResponse.data || axiosResponse
      
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
      setTemplates([])
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
      await copyDocumentVersion(documentId, versionId)
      await loadDocuments()
      navigate(`/documents/${documentId}`)
    } catch (err) {
      alert('Failed to copy version: ' + (err.response?.data?.error || err.message))
    } finally {
      setCopyingVersionId(null)
    }
  }

  const handleDownloadVersion = async (documentTitle, versionId, documentId) => {
    try {
      setDownloadingVersionId(versionId)
      const blob = await downloadVersion(documentId, versionId)
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${documentTitle}_v${versionId}_signed.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Failed to download PDF: ' + (err.response?.data?.error || err.message))
    } finally {
      setDownloadingVersionId(null)
    }
  }

  const getStatusBadge = (status) => {
    const badges = {
      draft: {
        bg: 'bg-gradient-to-r from-blue-500 to-blue-600',
        text: 'text-white',
        icon: '✏️',
        label: 'Draft',
        ring: 'ring-blue-200'
      },
      locked: {
        bg: 'bg-gradient-to-r from-yellow-500 to-yellow-600',
        text: 'text-white',
        icon: '🔒',
        label: 'Locked',
        ring: 'ring-yellow-200'
      },
      'partially_signed': {
        bg: 'bg-gradient-to-r from-purple-500 to-purple-600',
        text: 'text-white',
        icon: '⏳',
        label: 'Signing',
        ring: 'ring-purple-200'
      },
      'in-progress': {
        bg: 'bg-gradient-to-r from-purple-500 to-purple-600',
        text: 'text-white',
        icon: '⏳',
        label: 'Signing',
        ring: 'ring-purple-200'
      },
      completed: {
        bg: 'bg-gradient-to-r from-green-500 to-green-600',
        text: 'text-white',
        icon: '✓',
        label: 'Completed',
        ring: 'ring-green-200'
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
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading documents...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Documents</h1>
          <p className="text-lg text-gray-600">All document versions for signing and tracking</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          variant="primary"
          size="lg"
        >
          <span>➕</span>
          Create Document
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
        <div className="space-y-6">
          {/* Document Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Document Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              placeholder="e.g., Contract for John Doe, Q1 2024 Agreement"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 text-base"
            />
          </div>

          {/* Create Mode Selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              How would you like to create this document?
            </label>
            <div className="space-y-3">
              <label className={`flex items-start p-4 border-2 rounded-xl cursor-pointer transition-all ${createMode === 'template' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'}`}>
                <input
                  type="radio"
                  name="create-mode"
                  value="template"
                  checked={createMode === 'template'}
                  onChange={(e) => setCreateMode(e.target.value)}
                  className="w-5 h-5 text-blue-600 mt-0.5"
                />
                <div className="ml-3 flex-1">
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <span>📋</span>
                    Use Existing Template
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Start with a pre-configured template
                  </div>
                </div>
              </label>
              
              <label className={`flex items-start p-4 border-2 rounded-xl cursor-pointer transition-all ${createMode === 'upload' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'}`}>
                <input
                  type="radio"
                  name="create-mode"
                  value="upload"
                  checked={createMode === 'upload'}
                  onChange={(e) => setCreateMode(e.target.value)}
                  className="w-5 h-5 text-blue-600 mt-0.5"
                />
                <div className="ml-3 flex-1">
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <span>📤</span>
                    Upload PDF File
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Upload a new PDF document
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Template Selection */}
          {createMode === 'template' && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Select Template <span className="text-red-500">*</span>
              </label>
              {!templates || templates.length === 0 ? (
                <div className="text-sm text-gray-600 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  No templates available. <a href="/templates" className="text-blue-600 hover:underline font-semibold">Create one first</a>
                </div>
              ) : (
                <select
                  value={selectedTemplateId || ''}
                  onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 bg-white text-base"
                >
                  <option value="">-- Select a template --</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* File Upload */}
          {createMode === 'upload' && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Upload PDF File <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setNewDocFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold hover:file:bg-blue-100"
              />
              {newDocFile && (
                <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
                  <span>✓</span>
                  Selected: {newDocFile.name}
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
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
              Create Document
            </Button>
          </div>
        </div>
      </Modal>

      {/* Documents Grid */}
      {documentVersions.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-lg">
          <div className="text-7xl mb-6">📄</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">No documents yet</h2>
          <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
            Create your first document to start collecting signatures
          </p>
          <Button
            onClick={() => setShowCreateModal(true)}
            variant="primary"
            size="lg"
          >
            <span>➕</span>
            Create Your First Document
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
                className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden group border border-gray-100 hover:border-indigo-300"
              >
                {/* Card Preview Area */}
                <div className="bg-gradient-to-br from-indigo-50 to-purple-100 h-44 flex items-center justify-center group-hover:from-indigo-100 group-hover:to-purple-200 transition-all duration-300 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10" style={{
                    backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(99, 102, 241, 0.5) 1px, transparent 0)',
                    backgroundSize: '20px 20px'
                  }}></div>
                  <div className="text-6xl text-indigo-400 group-hover:scale-110 transition-transform duration-300 relative z-10">📑</div>
                </div>

                {/* Card Content */}
                <div className="p-6 space-y-4">
                  {/* Document Title and Status */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-gray-900 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                          {version.document_title}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 font-semibold">
                          Version {version.version_number}
                        </p>
                      </div>
                      <span className={`${statusBadge.bg} ${statusBadge.text} text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1.5 shadow-lg ring-2 ${statusBadge.ring}`}>
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
                  <div className="space-y-3 pt-3 border-t border-gray-200">
                    {/* Progress Bar for Signing */}
                    {progressText && (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold text-gray-600 uppercase">
                            Progress
                          </span>
                          <span className="text-xs font-bold text-gray-900">
                            {progressText}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                          {(() => {
                            const statuses = Object.values(version.recipient_status || {})
                            const completed = statuses.filter(s => s.completed).length
                            const total = statuses.length || 1
                            const percentage = (completed / total) * 100
                            return (
                              <div
                                className="bg-gradient-to-r from-green-400 via-green-500 to-green-600 h-full rounded-full transition-all duration-500 shadow-sm"
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
                        <span className="text-xs font-semibold text-gray-600 uppercase block mb-2">
                          Recipients ({Array.from(new Set(allRecipients)).length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {Array.from(new Set(allRecipients)).map((recipient, idx) => (
                            <span
                              key={`${version.id}-recipient-${idx}-${recipient}`}
                              className={`${getRecipientBadgeClasses(recipient, allRecipients)} text-xs shadow-sm`}
                            >
                              {recipient}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-200">
                      <span className="flex items-center gap-1">
                        <span>📅</span>
                        {formatDate(version.created_at)}
                      </span>
                      <span className="text-gray-700 font-bold flex items-center gap-1">
                        <span>📄</span>
                        {version.page_count} pages
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-3 border-t border-gray-200">
                    <Button
                      onClick={() => navigate(`/documents/${version.document_id}`)}
                      variant="primary"
                      className="w-full"
                    >
                      Open Document →
                    </Button>
                    
                    {isLocked && (
                      <Button
                        onClick={() => handleCopyVersion(version.document_id, version.id)}
                        variant="secondary"
                        className="w-full"
                        disabled={copyingVersionId === version.id}
                      >
                        {copyingVersionId === version.id ? (
                          <>
                            <span className="animate-spin">⟳</span>
                            Copying...
                          </>
                        ) : (
                          <>
                            <span>📋</span>
                            Create New Version
                          </>
                        )}
                      </Button>
                    )}

                    {isLocked && version.status === 'completed' && (
                      <Button
                        onClick={() => handleDownloadVersion(version.document_title, version.id, version.document_id)}
                        variant="success"
                        className="w-full"
                        disabled={downloadingVersionId === version.id}
                      >
                        {downloadingVersionId === version.id ? (
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