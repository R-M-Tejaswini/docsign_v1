import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { LoadingSpinner } from '../../../shared/components/ui/LoadingSpinner'
import { useApi } from '../../../shared/hooks/useApi'
import { useToast } from '../../../shared/hooks/useToast'
import { templateAPI } from '../../../shared/utils/api'

export const TemplatesList = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [templates, setTemplates] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTemplateTitle, setNewTemplateTitle] = useState('')
  const [newTemplateFile, setNewTemplateFile] = useState(null)
  
  // ✅ NEW: Delete state
  const [deletingTemplateId, setDeletingTemplateId] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  
  const { addToast } = useToast()
  const { execute: listTemplates, loading } = useApi(() => templateAPI.list())
  const { execute: createTemplate } = useApi((data) => templateAPI.create(data))
  // ✅ NEW: Delete API call
  const { execute: deleteTemplate } = useApi((templateId) =>
    templateAPI.delete(templateId)
  )

  useEffect(() => {
    loadTemplates()
  }, [location])

  const loadTemplates = async () => {
    try {
      const axiosResponse = await listTemplates()
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
      addToast('Failed to load templates', 'error')
      setTemplates([])
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateTitle.trim()) {
      addToast('Please enter a template title', 'error')
      return
    }

    if (!newTemplateFile) {
      addToast('Please select a PDF file', 'error')
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
      await loadTemplates()
      navigate(`/templates/${newTemplate.id}`)
      addToast('Template created successfully', 'success')
    } catch (err) {
      addToast('Failed to create template: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  // ✅ NEW: Handle delete template
  const handleDeleteTemplate = async (templateId) => {
    try {
      setDeletingTemplateId(templateId)
      await deleteTemplate(templateId)
      setShowDeleteConfirm(null)
      await loadTemplates()
      addToast('Template deleted successfully', 'success')
    } catch (err) {
      addToast('Failed to delete template: ' + (err.response?.data?.error || err.message), 'error')
    } finally {
      setDeletingTemplateId(null)
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
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading templates...</p>
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Templates</h1>
          <p className="text-lg text-gray-600">Reusable PDF templates with predefined field locations</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          variant="primary"
          size="lg"
        >
          <span>➕</span>
          Create Template
        </Button>
      </div>

      {/* Create Template Modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Template"
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Template Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newTemplateTitle}
              onChange={(e) => setNewTemplateTitle(e.target.value)}
              placeholder="e.g., Employment Contract, NDA, Lease Agreement"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Upload PDF File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setNewTemplateFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold hover:file:bg-blue-100"
            />
            {newTemplateFile && (
              <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
                <span>✓</span>
                Selected: {newTemplateFile.name}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
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
              Create Template
            </Button>
          </div>
        </div>
      </Modal>

      {/* ✅ NEW: Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm !== null}
        onClose={() => setShowDeleteConfirm(null)}
        title="Delete Template"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-900">
              <strong>⚠️ Warning:</strong> This action cannot be undone. The template and all associated data will be permanently deleted.
            </p>
          </div>
          
          {showDeleteConfirm && (
            <div>
              <p className="text-gray-900 font-medium mb-2">Template to delete:</p>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-sm font-semibold text-gray-900">
                  {templates.find(t => t.id === showDeleteConfirm)?.title}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Created: {formatDate(templates.find(t => t.id === showDeleteConfirm)?.created_at)}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => setShowDeleteConfirm(null)}
              variant="secondary"
              className="flex-1"
              disabled={deletingTemplateId === showDeleteConfirm}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleDeleteTemplate(showDeleteConfirm)}
              variant="danger"
              className="flex-1"
              disabled={deletingTemplateId === showDeleteConfirm}
            >
              {deletingTemplateId === showDeleteConfirm ? (
                <>
                  <span className="animate-spin">⟳</span>
                  Deleting...
                </>
              ) : (
                <>
                  <span>🗑️</span>
                  Delete Permanently
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-lg">
          <div className="text-7xl mb-6">📋</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">No templates yet</h2>
          <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
            Create your first template to streamline your document signing workflow
          </p>
          <Button
            onClick={() => setShowCreateModal(true)}
            variant="primary"
            size="lg"
          >
            <span>➕</span>
            Create Your First Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden group border border-gray-100 hover:border-blue-300"
            >
              {/* Card Preview Area */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-100 h-44 flex items-center justify-center group-hover:from-blue-100 group-hover:to-indigo-200 transition-all duration-300 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{
                  backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(59, 130, 246, 0.5) 1px, transparent 0)',
                  backgroundSize: '20px 20px'
                }}></div>
                <div className="text-6xl text-blue-400 group-hover:scale-110 transition-transform duration-300 relative z-10">📄</div>
              </div>

              {/* Card Content */}
              <div className="p-6 space-y-4">
                {/* Template Title */}
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                    {template.title || `Template ${template.id}`}
                  </h3>
                  {template.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Pages</div>
                    <div className="text-2xl font-bold text-gray-900">{template.page_count || '1'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Fields</div>
                    <div className="text-2xl font-bold text-gray-900">{template.field_count || template.fields?.length || '0'}</div>
                  </div>
                </div>

                {/* Created Date */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-200">
                  <span>Created</span>
                  <span className="font-semibold">{formatDate(template.created_at)}</span>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/templates/${template.id}`)
                    }}
                    variant="outline"
                    className="w-full group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all"
                  >
                    Edit Template →
                  </Button>

                  {/* ✅ NEW: Delete Button */}
                  <Button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowDeleteConfirm(template.id)
                    }}
                    variant="danger"
                    className="w-full"
                    disabled={deletingTemplateId === template.id}
                  >
                    {deletingTemplateId === template.id ? (
                      <>
                        <span className="animate-spin">⟳</span>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <span>🗑️</span>
                        Delete Template
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}