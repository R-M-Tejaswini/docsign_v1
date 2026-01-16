import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useApi } from '../hooks/useApi'
import { templateAPI } from '../services/api'

export const TemplatesList = () => {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTemplateTitle, setNewTemplateTitle] = useState('')
  const [newTemplateFile, setNewTemplateFile] = useState(null)
  const { execute: listTemplates, loading } = useApi(() => templateAPI.list())
  const { execute: createTemplate } = useApi((data) => templateAPI.create(data))

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      const data = await listTemplates()
      // Handle both array and paginated responses
      setTemplates(data.results || data || [])
    } catch (err) {
      console.error('Failed to load templates:', err)
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateTitle.trim()) {
      alert('Please enter a template title')
      return
    }

    if (!newTemplateFile) {
      alert('Please select a PDF file')
      return
    }

    try {
      const newTemplate = await createTemplate({
        title: newTemplateTitle,
        file: newTemplateFile,
      })
      setShowCreateModal(false)
      setNewTemplateTitle('')
      setNewTemplateFile(null)
      navigate(`/templates/${newTemplate.id}`)
    } catch (err) {
      alert('Failed to create template')
    }
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
        <div className="text-center text-gray-500">Loading templates...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-600 mt-2">Manage PDF templates with predefined field locations</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          variant="primary"
        >
          + Create Template
        </Button>
      </div>

      {/* Create Template Modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Template"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Template Title
            </label>
            <input
              type="text"
              value={newTemplateTitle}
              onChange={(e) => setNewTemplateTitle(e.target.value)}
              placeholder="Enter template title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Upload PDF File
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setNewTemplateFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={() => setShowCreateModal(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              variant="primary"
              className="flex-1"
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📋</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No templates yet</h2>
          <p className="text-gray-600 mb-6">Create your first template to get started</p>
          <Button
            onClick={() => setShowCreateModal(true)}
            variant="primary"
          >
            Create Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              onClick={() => navigate(`/templates/${template.id}`)}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden group"
            >
              {/* Card Preview Area */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 h-40 flex items-center justify-center group-hover:from-blue-100 group-hover:to-blue-200 transition-colors">
                <div className="text-4xl text-blue-300">📄</div>
              </div>

              {/* Card Content */}
              <div className="p-6 space-y-4">
                {/* Template Title */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">
                    {template.title || `Template ${template.id}`}
                  </h3>
                  {template.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                </div>

                {/* Metadata */}
                <div className="space-y-2 pt-2 border-t border-gray-200">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Pages:</span>
                    <span className="font-medium text-gray-900">
                      {template.page_count || '1'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Fields:</span>
                    <span className="font-medium text-gray-900">
                      {template.fields?.length || '0'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>Created:</span>
                    <span>{formatDate(template.created_at)}</span>
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/templates/${template.id}`)
                  }}
                  variant="secondary"
                  className="w-full mt-4"
                >
                  Edit Template →
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}