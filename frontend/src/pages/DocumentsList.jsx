import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Toast } from '../components/ui/Toast'
import { useApi } from '../hooks/useApi'
import { documentAPI, templateAPI } from '../services/api'

export const DocumentsList = () => {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [templates, setTemplates] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createMode, setCreateMode] = useState('template') // 'template' or 'upload'
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [documentTitle, setDocumentTitle] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [toasts, setToasts] = useState([])

  const { execute: listDocuments, loading } = useApi(documentAPI.list)
  const { execute: listTemplates } = useApi(templateAPI.list)
  const { execute: createDocument, loading: creating } = useApi(documentAPI.create)

  useEffect(() => {
    loadDocuments()
    loadTemplates()
  }, [])

  const loadDocuments = async () => {
    try {
      const data = await listDocuments()
      setDocuments(data.results || data)
    } catch (err) {
      addToast('Failed to load documents', 'error')
    }
  }

  const loadTemplates = async () => {
    try {
      const data = await listTemplates()
      setTemplates(data.results || data)
    } catch (err) {
      addToast('Failed to load templates', 'error')
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!documentTitle.trim()) {
      addToast('Please enter a document title', 'warning')
      return
    }

    if (createMode === 'template' && !selectedTemplate) {
      addToast('Please select a template', 'warning')
      return
    }

    if (createMode === 'upload' && !uploadFile) {
      addToast('Please select a file to upload', 'warning')
      return
    }

    try {
      const doc = await createDocument({
        title: documentTitle,
        template_id: createMode === 'template' ? selectedTemplate : null,
        file: createMode === 'upload' ? uploadFile : null,
      })
      addToast('Document created successfully', 'success')
      setDocumentTitle('')
      setSelectedTemplate(null)
      setUploadFile(null)
      setShowCreateModal(false)
      navigate(`/documents/${doc.id}/edit`)
    } catch (err) {
      addToast(err.message || 'Failed to create document', 'error')
    }
  }

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts([...toasts, { id, message, type, duration: 3000 }])
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
          <Button onClick={() => setShowCreateModal(true)} variant="primary">
            + Create Document
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed">
            <p className="text-gray-500 mb-4">No documents yet</p>
            <Button onClick={() => setShowCreateModal(true)} variant="outline">
              Create your first document
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/documents/${doc.id}/edit`)}
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {doc.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    Status: <span className="font-medium">{doc.latest_version?.status || 'draft'}</span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Document"
        size="md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document Title
            </label>
            <input
              type="text"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              placeholder="e.g., Client Contract"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Source
            </label>
            <div className="space-y-2">
              {[
                { value: 'template', label: 'From Template' },
                { value: 'upload', label: 'Upload PDF' },
              ].map((option) => (
                <label key={option.value} className="flex items-center">
                  <input
                    type="radio"
                    name="source"
                    value={option.value}
                    checked={createMode === option.value}
                    onChange={(e) => setCreateMode(e.target.value)}
                    className="rounded"
                  />
                  <span className="ml-2 text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {createMode === 'template' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Template
              </label>
              <select
                value={selectedTemplate || ''}
                onChange={(e) => setSelectedTemplate(parseInt(e.target.value) || null)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">-- Choose a template --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} {/* Changed from "t.name" to "t.title" */}
                  </option>
                ))}
              </select>
            </div>
          )}

          {createMode === 'upload' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PDF File
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4">
            <Button onClick={() => setShowCreateModal(false)} variant="secondary">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

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