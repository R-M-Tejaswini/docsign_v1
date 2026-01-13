import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Toast } from '../components/ui/Toast'
import { useApi } from '../hooks/useApi'
import { templateAPI } from '../services/api'

export const TemplatesList = () => {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [templateName, setTemplateName] = useState('')
  const [toasts, setToasts] = useState([])

  const { execute: listTemplates, loading } = useApi(templateAPI.list)
  const { execute: createTemplate, loading: creating } = useApi(templateAPI.create)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      const data = await listTemplates()
      setTemplates(data.results || data)
    } catch (err) {
      addToast('Failed to load templates', 'error')
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!uploadFile || !templateName.trim()) {
      addToast('Please provide both name and file', 'warning')
      return
    }

    try {
      await createTemplate({
        name: templateName,
        file: uploadFile,
      })
      addToast('Template uploaded successfully', 'success')
      setTemplateName('')
      setUploadFile(null)
      setShowUploadModal(false)
      await loadTemplates()
    } catch (err) {
      addToast(err.message || 'Failed to upload template', 'error')
    }
  }

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts([...toasts, { id, message, type, duration: 3000 }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
          <Button onClick={() => setShowUploadModal(true)} variant="primary">
            + Upload Template
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed">
            <p className="text-gray-500 mb-4">No templates yet</p>
            <Button onClick={() => setShowUploadModal(true)} variant="outline">
              Upload your first template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/templates/${template.id}/edit`)}
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {template.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {template.page_count} page{template.page_count > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(template.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Upload Template"
        size="md"
      >
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Name
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Contract Template"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

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

          <div className="flex gap-2 justify-end pt-4">
            <Button onClick={() => setShowUploadModal(false)} variant="secondary">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? 'Uploading...' : 'Upload'}
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