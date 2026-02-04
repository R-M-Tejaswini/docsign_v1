/**
 * ✅ NEW: Modal for creating templates
 */

import { useState } from 'react'
import { Modal } from '../../../shared/components/ui/Modal'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'

export const CreateTemplateModal = ({ isOpen, onClose, onSubmit, loading }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!file) {
      setFileError('Please select a PDF file')
      return
    }

    if (!file.type.includes('pdf')) {
      setFileError('File must be a PDF')
      return
    }

    await onSubmit({
      title,
      description,
      file,
    })

    setTitle('')
    setDescription('')
    setFile(null)
    setFileError(null)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Template" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <Input
          label="Template Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Standard Contract"
          required
        />

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-900">Description (Optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this template is for"
            rows={3}
            className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* File Upload */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-900">Upload PDF *</label>
          <div className="relative">
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null)
                setFileError(null)
              }}
              className="w-full"
              required
            />
            {file && (
              <p className="text-sm text-green-600 mt-2 font-semibold">
                ✓ {file.name} selected ({Math.round(file.size / 1024)} KB)
              </p>
            )}
            {fileError && <p className="text-sm text-red-600 mt-2">{fileError}</p>}
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-900 leading-relaxed">
            <strong>💡 Tip:</strong> Upload your base PDF template here. After creation, you'll be able to add fields 
            to define where signers can enter information.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading || !file}>
            {loading ? 'Creating...' : 'Create Template'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}