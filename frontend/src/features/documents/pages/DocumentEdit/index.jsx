//frontend/src/features/documents/pages/DocumentEdit/index.jsx
/**
 * ✅ SPLIT: Thin container for DocumentEdit
 * - Loads document data
 * - Manages active tab state
 * - Routes to appropriate tab component
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '../../../../shared/hooks/useApi'
import { useToast } from '../../../../shared/hooks/useToast'
import { documentAPI } from '../../api'
import { FieldsTab } from './FieldsTab'
import { LinksTab } from './LinksTab'
import { AuditTab } from './AuditTab'
import { Toast } from '../../../../shared/components/ui/Toast'
import { LoadingSpinner } from '../../../../shared/components/ui/LoadingSpinner'
import { Button } from '../../../../shared/components/ui/Button'

export const DocumentEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [documentData, setDocumentData] = useState(null)
  const [activeTab, setActiveTab] = useState('fields')
  const [loadError, setLoadError] = useState(null)
  const [isLocking, setIsLocking] = useState(false)
  const { toasts, addToast, removeToast } = useToast()

  const { execute: getDocument } = useApi(() => {
    if (!id) return Promise.reject(new Error('No document ID'))
    return documentAPI.get(id)
  })

  const { execute: lockDocument } = useApi(() => documentAPI.lock(id))

  useEffect(() => {
    if (!id) {
      console.error('❌ No document ID in route params')
      setLoadError('Invalid document ID')
      navigate('/documents')
      return
    }
    
    loadDocument()
  }, [id])

  const loadDocument = async () => {
    try {
      setLoadError(null)
      const data = await getDocument()
      console.log('✅ Loaded document:', data)
      setDocumentData(data)
    } catch (err) {
      console.error('Failed to load document:', err)
      setLoadError('Failed to load document')
      addToast('Failed to load document', 'error')
      setTimeout(() => navigate('/documents'), 2000)
    }
  }

  // ✅ NEW: Handle lock action
  const handleLockDocument = async () => {
    setIsLocking(true)
    try {
      await lockDocument()
      addToast('Document locked', 'success')
      await loadDocument()
    } catch (err) {
      console.error('Failed to lock document:', err)
      addToast('Failed to lock document', 'error')
    } finally {
      setIsLocking(false)
    }
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-gray-600 font-medium mb-2">{loadError}</p>
          <p className="text-gray-500 text-sm">Redirecting to documents...</p>
        </div>
      </div>
    )
  }

  if (!documentData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner message="Loading document..." />
      </div>
    )
  }

  const isDraft = documentData.status === 'draft'

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* ✅ FIXED: Header with tabs (fixed at top) */}
      <div className="flex-shrink-0 bg-white border-b-2 border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{documentData.title}</h1>
            {/* ✅ NEW: Status badge */}
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              isDraft
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-green-100 text-green-800'
            }`}>
              {documentData.status?.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* ✅ NEW: Lock button (only show if in draft) */}
            {isDraft && (
              <Button
                onClick={handleLockDocument}
                variant="primary"
                disabled={isLocking}
              >
                {isLocking ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    Locking...
                  </>
                ) : (
                  <>
                    <span>🔒</span>
                    Lock Document
                  </>
                )}
              </Button>
            )}
            
            <button
              onClick={() => navigate('/documents')}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-bold transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* ✅ FIXED: Tabs in a proper flex container */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('fields')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'fields'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            📋 Fields ({documentData.fields?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('links')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'links'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🔗 Links
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🔍 Audit
          </button>
        </div>
      </div>

      {/* ✅ FIXED: Content area (flex-1 for remaining space) */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'fields' && <FieldsTab document={documentData} onUpdate={loadDocument} addToast={addToast} />}
        {activeTab === 'links' && <LinksTab document={documentData} />}
        {activeTab === 'audit' && <AuditTab document={documentData} />}
      </div>

      {/* Toasts */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}