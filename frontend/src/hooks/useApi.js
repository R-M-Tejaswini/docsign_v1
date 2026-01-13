import { useState, useCallback } from 'react'

/**
 * Custom hook for making API calls with loading and error states.
 * @param {function} apiCall - Async function to execute
 * @returns {object} { execute, loading, error, data }
 */
export const useApi = (apiCall) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const execute = useCallback(
    async (...args) => {
      setLoading(true)
      setError(null)
      try {
        const result = await apiCall(...args)
        setData(result.data)
        return result.data
      } catch (err) {
        const message = err.response?.data?.detail || err.message
        setError(message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [apiCall]
  )

  return { execute, loading, error, data }
}