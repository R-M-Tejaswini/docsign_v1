import { useState, useCallback } from 'react'

/**
 * Custom hook for clipboard operations.
 * @returns {object} { copy, copied }
 */
export const useClipboard = () => {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return true
    } catch (err) {
      console.error('Failed to copy:', err)
      return false
    }
  }, [])

  return { copy, copied }
}