import { useState, useCallback } from 'react'
import { useApi } from '../../../shared/hooks/useApi'
import { documentAPI } from '../api'

export const useDocuments = () => {
  const [documents, setDocuments] = useState([])
  const [templates, setTemplates] = useState([])

  const { execute: listDocuments, loading } = useApi(() => documentAPI.list())
  const { execute: createDocument } = useApi((data) => documentAPI.create(data))
  const { execute: duplicateDocument } = useApi((docId) => documentAPI.duplicate(docId))
  const { execute: downloadDocument } = useApi((docId) => documentAPI.download(docId))

  const loadDocuments = useCallback(async () => {
    try {
      const data = await listDocuments()
      setDocuments(Array.isArray(data) ? data : data.results || [])
    } catch (err) {
      console.error('Failed to load documents:', err)
    }
  }, [listDocuments])

  return {
    documents,
    setDocuments,
    templates,
    setTemplates,
    loading,
    loadDocuments,
    createDocument,
    duplicateDocument,
    downloadDocument,
  }
}