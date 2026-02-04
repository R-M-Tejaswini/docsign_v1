/**
 * ✅ NEW: Hook for managing document fields
 */

import { useState, useCallback } from 'react'
import { useApi } from '../../../shared/hooks/useApi'
import { documentAPI } from '../api'

export const useDocumentFields = (documentId) => {
  const [fields, setFields] = useState([])
  const [selectedFieldId, setSelectedFieldId] = useState(null)

  const { execute: createField } = useApi((data) => documentAPI.createField(documentId, data))
  const { execute: updateField } = useApi((fieldId, data) => documentAPI.updateField(documentId, fieldId, data))
  const { execute: deleteField } = useApi((fieldId) => documentAPI.deleteField(documentId, fieldId))

  const addField = useCallback(
    async (fieldData) => {
      const newField = await createField(fieldData)
      setFields((prev) => [...prev, newField])
      return newField
    },
    [createField]
  )

  const editField = useCallback(
    async (fieldId, updates) => {
      const updatedField = await updateField(fieldId, updates)
      setFields((prev) => prev.map((f) => (f.id === fieldId ? updatedField : f)))
      return updatedField
    },
    [updateField]
  )

  const removeField = useCallback(
    async (fieldId) => {
      await deleteField(fieldId)
      setFields((prev) => prev.filter((f) => f.id !== fieldId))
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null)
      }
    },
    [deleteField, selectedFieldId]
  )

  return {
    fields,
    setFields,
    selectedFieldId,
    setSelectedFieldId,
    addField,
    editField,
    removeField,
  }
}