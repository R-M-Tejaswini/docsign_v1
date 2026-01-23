import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { useApi } from '../../hooks/useApi'
import { groupAPI, templateAPI, documentAPI } from '../../services/api'

export const GroupItemEditor = ({ isOpen, groupId, onClose, onSuccess }) => {
  const [source, setSource] = useState('upload')
  const [itemTitle, setItemTitle] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState(null)
  const [templates, setTemplates] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  
  const { execute: addItem } = useApi((data) => groupAPI.addItem(groupId, data))
  const { execute: listTemplates } = useApi(() => templateAPI.list())
  const { execute: listDocuments } = useApi(() => documentAPI.list())
  
  useEffect(() => {
    if (isOpen) {
      loadTemplatesAndDocuments()
    }
  }, [isOpen])
  
  const loadTemplatesAndDocuments = async () => {
    try {
      const [tResponse, dResponse] = await Promise.all([
        listTemplates(),
        listDocuments(),
      ])
      
      const tData = tResponse.data || tResponse
      const dData = dResponse.data || dResponse
      
      setTemplates(Array.isArray(tData) ? tData : tData.results || [])
      setDocuments(Array.isArray(dData) ? dData : dData.results || [])
    } catch (err) {
      console.error('Failed to load templates/documents:', err)
    }
  }
  
  const handleAddItem = async () => {
    if (!itemTitle.trim()) {
      alert('Please enter a document title')
      return
    }
    
    const payload = {
      source,
      title: itemTitle,
    }
    
    if (source === 'upload' && !selectedFile) {
      alert('Please select a PDF file')
      return
    } else if (source === 'upload') {
      payload.file = selectedFile
    } else if (source === 'template' && !selectedTemplateId) {
      alert('Please select a template')
      return
    } else if (source === 'template') {
      payload.template_id = selectedTemplateId
    } else if (source === 'existing' && !selectedDocumentId) {
      alert('Please select a document')
      return
    } else if (source === 'existing') {
      payload.document_id = selectedDocumentId
    }
    
    setLoading(true)
    try {
      await addItem(payload)
      setItemTitle('')
      setSelectedFile(null)
      setSelectedTemplateId(null)
      setSelectedDocumentId(null)
      onSuccess()
    } catch (err) {
      alert('Failed to add item: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Document to Group">
      <div className="space-y-6">
        {/* Source Selection */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            Source <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            {[
              { value: 'upload', label: '📤 Upload New PDF', desc: 'Upload a new PDF file' },
              { value: 'template', label: '📋 From Template', desc: 'Create from a template' },
              { value: 'existing', label: '📄 From Existing', desc: 'Copy an existing document' },
            ].map((opt) => (
              <label key={opt.value} className={`flex items-start p-3 border-2 rounded-lg cursor-pointer transition-all ${source === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}>
                <input
                  type="radio"
                  name="source"
                  value={opt.value}
                  checked={source === opt.value}
                  onChange={(e) => setSource(e.target.value)}
                  className="mt-1 w-4 h-4"
                />
                <div className="ml-3 flex-1">
                  <div className="font-semibold text-gray-900">{opt.label}</div>
                  <p className="text-xs text-gray-600">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        
        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Document Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={itemTitle}
            onChange={(e) => setItemTitle(e.target.value)}
            placeholder="e.g., Cover Letter"
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 text-base"
          />
        </div>
        
        {/* Source-Specific Fields */}
        {source === 'upload' && (
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              PDF File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700"
            />
            {selectedFile && (
              <p className="text-sm text-green-600 mt-2">✓ {selectedFile.name}</p>
            )}
          </div>
        )}
        
        {source === 'template' && (
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Template <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedTemplateId || ''}
              onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500"
            >
              <option value="">-- Select a template --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        )}
        
        {source === 'existing' && (
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Document <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedDocumentId || ''}
              onChange={(e) => setSelectedDocumentId(Number(e.target.value))}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500"
            >
              <option value="">-- Select a document --</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button onClick={handleAddItem} variant="primary" className="flex-1" disabled={loading}>
            {loading ? '⟳ Adding...' : '✓ Add to Group'}
          </Button>
          <Button onClick={onClose} variant="secondary" className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}