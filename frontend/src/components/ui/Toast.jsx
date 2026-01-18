import { useEffect, useState } from 'react'

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

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  }

  const typeStyles = {
    success: 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg',
    error: 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg',
    info: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg',
    warning: 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white shadow-lg',
  }

  return (
    <div
      className={`
        fixed bottom-4 right-4 px-5 py-3 rounded-lg z-50 
        flex items-center gap-3 min-w-[280px] max-w-md
        ${typeStyles[type]}
        ${isExiting ? 'animate-fade-out' : 'animate-slide-in'}
      `}
      style={{
        animation: isExiting 
          ? 'fadeOut 0.3s ease-out forwards' 
          : 'slideIn 0.3s ease-out'
      }}
    >
      <span className="text-xl font-bold">{icons[type]}</span>
      <span className="flex-1 font-medium">{message}</span>
      <button
        onClick={() => {
          setIsExiting(true)
          setTimeout(() => {
            setIsVisible(false)
            onClose?.()
          }, 300)
        }}
        className="text-white hover:text-gray-200 transition-colors ml-2"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
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