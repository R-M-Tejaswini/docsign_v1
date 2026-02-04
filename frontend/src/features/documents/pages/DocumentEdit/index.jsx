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

export const DocumentEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [documentData, setDocumentData] = useState(null)
  const [activeTab, setActiveTab] = useState('fields')
  const { toasts, addToast } = useToast()

  const { execute: getDocument } = useApi(() => documentAPI.get(id))

  useEffect(() => {
    loadDocument()
  }, [id])

  const loadDocument = async () => {
    try {
      const data = await getDocument()
      setDocumentData(data)
    } catch (err) {
      addToast('Failed to load document', 'error')
      navigate('/documents')
    }
  }

  if (!documentData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading document...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Tab Navigation */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
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

      {/* Tab Content */}
      {activeTab === 'fields' && <FieldsTab document={documentData} onUpdate={loadDocument} addToast={addToast} />}
      {activeTab === 'links' && <LinksTab document={documentData} />}
      {activeTab === 'audit' && <AuditTab document={documentData} />}

      {/* Toasts */}
      {toasts.map((toast) => (
        <Toast key={toast.id} message={toast.message} type={toast.type} duration={toast.duration} />
      ))}
    </div>
  )
}