import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'

export const DocumentGroupCreate = () => {
  const navigate = useNavigate()
  const [source, setSource] = useState('uploads') // 'uploads' or 'templates'
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template_group_id: null
  })
  const [files, setFiles] = useState([])
  const [templateGroups, setTemplateGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState([])

  const { execute: listTemplateGroups } = useApi(() =>
    fetch('/api/templates/template-groups/').then(r => r.json())
  )
  const { execute: createGroup } = useApi((data) => {
    const formDataObj = new FormData()
    formDataObj.append('name', data.name)
    formDataObj.append('description', data.description)
    formDataObj.append('source', data.source)

    if (data.source === 'templates') {
      formDataObj.append('template_group_id', data.template_group_id)
    } else if (data.source === 'uploads' && data.files) {
      data.files.forEach(file => formDataObj.append('files', file))
    }

    return fetch('/api/documents/document-groups/', {
      method: 'POST',
      body: formDataObj
    }).then(r => r.json())
  })

  useEffect(() => {
    loadTemplateGroups()
  }, [])

  const loadTemplateGroups = async () => {
    try {
      const data = await listTemplateGroups()
      setTemplateGroups(data.results || data)
    } catch (error) {
      addToast('Failed to load template groups', 'error')
    }
  }

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  const handleCreateGroup = async () => {
    if (!formData.name.trim()) {
      addToast('Group name required', 'error')
      return
    }

    if (source === 'uploads' && files.length === 0) {
      addToast('Please upload at least one file', 'error')
      return
    }

    if (source === 'templates' && !formData.template_group_id) {
      addToast('Please select a template group', 'error')
      return
    }

    setLoading(true)
    try {
      const payload = {
        ...formData,
        source,
        files: source === 'uploads' ? files : undefined
      }
      const result = await createGroup(payload)
      addToast('Document group created', 'success')
      navigate(`/document-groups/${result.id}/edit`)
    } catch (error) {
      addToast('Failed to create group', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <a href="/document-groups" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Groups
        </a>
        <h1 className="text-3xl font-bold">Create Document Group</h1>
      </div>

      <div className="bg-white rounded-lg border p-6 space-y-6">
        {/* Group Info */}
        <div>
          <label className="block text-sm font-medium mb-2">Group Name *</label>
          <input
            type="text"
            placeholder="e.g., Contract Package 2024"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            placeholder="Optional description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border rounded h-20"
          />
        </div>

        {/* Source Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Source *</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                value="uploads"
                checked={source === 'uploads'}
                onChange={(e) => setSource(e.target.value)}
                className="mr-2"
              />
              Upload PDF files
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="templates"
                checked={source === 'templates'}
                onChange={(e) => setSource(e.target.value)}
                className="mr-2"
              />
              Create from template group
            </label>
          </div>
        </div>

        {/* Upload Files */}
        {source === 'uploads' && (
          <div>
            <label className="block text-sm font-medium mb-2">Upload PDFs *</label>
            <input
              type="file"
              multiple
              accept=".pdf"
              onChange={(e) => setFiles(Array.from(e.target.files))}
              className="w-full px-3 py-2 border rounded"
            />
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((file, idx) => (
                  <p key={idx} className="text-sm text-gray-600">
                    {idx + 1}. {file.name}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Template Group Selection */}
        {source === 'templates' && (
          <div>
            <label className="block text-sm font-medium mb-2">Template Group *</label>
            <select
              value={formData.template_group_id || ''}
              onChange={(e) => setFormData({ ...formData, template_group_id: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Select a template group...</option>
              {templateGroups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.items?.length || 0} templates)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button
            onClick={handleCreateGroup}
            variant="primary"
            disabled={loading}
            className="flex-1"
          >
            {loading ? 'Creating...' : 'Create Group'}
          </Button>
          <Button
            onClick={() => navigate('/document-groups')}
            variant="secondary"
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>

      {toasts.map(toast => (
        <Toast key={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  )
}