import { useEffect, useState } from 'react'

/**
 * ✅ UNIFIED: Toast notification component
 */

export const Toast = ({ message, type = 'info', duration = 3000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (duration) {
      const timer = setTimeout(() => {
        setIsExiting(true)
        setTimeout(() => {
          setIsVisible(false)
          onClose?.()
        }, 300) // Animation duration
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  if (!isVisible) return null

  const typeClasses = {
    success: 'bg-green-100 text-green-800 border-green-300',
    error: 'bg-red-100 text-red-800 border-red-300',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    info: 'bg-blue-100 text-blue-800 border-blue-300',
  }

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  }

  return (
    <div className={`
      fixed bottom-4 right-4 p-4 rounded-lg border-2 shadow-lg 
      ${typeClasses[type]} flex items-center gap-3 max-w-sm z-50 animate-in
    `}>
      <span className="text-xl font-bold">{icons[type]}</span>
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="text-lg font-bold opacity-50 hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}

export const ToastContainer = ({ toasts, onRemove }) => {
  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-50">
      {toasts.map((toast, index) => (
        <div 
          key={toast.id}
          style={{ 
            transform: `translateY(-${index * 8}px)`,
            transition: 'transform 0.2s ease-out'
          }}
        >
          <Toast
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => onRemove(toast.id)}
          />
        </div>
      ))}
    </div>
  )
}

// Add these styles to your global CSS or as a style tag
const style = document.createElement('style')
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(400px);
    }
  }
`
if (!document.querySelector('style[data-toast-styles]')) {
  style.setAttribute('data-toast-styles', 'true')
  document.head.appendChild(style)
}