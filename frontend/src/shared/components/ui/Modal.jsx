/**
 * ✅ UNIFIED: Reusable modal component
 */

import { useEffect } from 'react'
import { Button } from './Button'

export const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'lg', 
  closeOnBackdropClick = true 
}) => {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        className={`bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-2 border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 text-2xl font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6">{children}</div>
      </div>

      {/* Backdrop */}
      {closeOnBackdropClick && (
        <div className="fixed inset-0 z-40" onClick={onClose} />
      )}
    </div>
  )
}