/**
 * ✅ NEW: Modal for creating documents
 */

import { useState } from 'react'
import { Modal } from '../../../shared/components/ui/Modal'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'

export const CreateDocumentModal = ({ isOpen, onClose, onSubmit, templates, loading }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [file, setFile] = useState(null)
  const [createMode, setCreateMode] = useState('template') // 'template' or 'upload'

  const handleSubmit = async (e) => {
    e.preventDefault()
    await onSubmit({
      title,
      description,
      template_id: createMode === 'template' ? templateId : null,
      file: createMode === 'upload' ? file : null,
    })
    setTitle('')
    setDescription('')
    setTemplateId('')
    setFile(null)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Document" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mode selector */}
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={createMode === 'template'}
              onChange={(e) => setCreateMode('template')}
              className="w-4 h-4"
            />
            <span className="text-sm font-semibold">From Template</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={createMode === 'upload'}
              onChange={(e) => setCreateMode('upload')}
              className="w-4 h-4"
            />
            <span className="text-sm font-semibold">Upload PDF</span>
          </label>
        </div>

        {/* Title */}
        <Input
          label="Document Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter document title"
          required
        />

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-900">Description (Optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this document"
            rows={3}
            className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Template or File selection */}
        {createMode === 'template' ? (
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-900">Select Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Choose a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-900">Upload PDF</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full"
              required
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Document'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}