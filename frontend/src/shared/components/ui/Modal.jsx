/**
 * ✅ UNIFIED: Reusable modal component with proper z-index layering
 */

import { useEffect } from 'react'

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
    <>
      {/* ✅ FIXED: Backdrop is separate with lower z-index */}
      {closeOnBackdropClick && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50" 
          onClick={onClose}
        />
      )}
      
      {/* ✅ FIXED: Modal content container with higher z-index */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        {/* ✅ FIXED: Content div has pointer-events-auto to receive clicks */}
        <div
          className={`${sizeClasses[size]} bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto pointer-events-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b-2 border-gray-200 px-6 py-4 flex justify-between items-center z-10">
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-900 text-2xl font-bold transition-colors flex-shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Body - scrollable content */}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </>
  )
}