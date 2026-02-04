/**
 * ✅ UNIFIED: Clipboard hook with feedback
 */

import { useState, useCallback } from 'react'

export const useClipboard = () => {
  const [copied, setCopied] = useState(false)

  const copy = useCallback((text) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    } else {
      // Fallback for insecure contexts
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy:', err)
      }
      document.body.removeChild(textarea)
    }
  }, [])

  return { copy, copied }
}