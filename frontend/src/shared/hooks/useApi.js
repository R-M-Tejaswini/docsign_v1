/**
 * ✅ UNIFIED: API call hook with error handling
 * Used by all features for consistent API interaction
 */

import { useState, useCallback } from 'react'

export const useApi = (apiFunction) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const execute = useCallback(
    async (...args) => {
      setLoading(true)
      setError(null)
      try {
        const result = await apiFunction(...args)
        setData(result)
        return result
      } catch (err) {
        const errorMessage = err.response?.data?.error || err.message || 'An error occurred'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [apiFunction]
  )

  return { execute, loading, error, data }
}