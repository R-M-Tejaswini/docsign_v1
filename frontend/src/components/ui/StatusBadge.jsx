/**
 * Reusable StatusBadge component for displaying document/token status
 */

const STATUS_STYLES = {
  draft: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
    icon: '📝',
    label: 'Draft'
  },
  locked: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
    icon: '🔒',
    label: 'Locked'
  },
  completed: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
    icon: '✓',
    label: 'Completed'
  },
  revoked: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
    icon: '✕',
    label: 'Revoked'
  },
  active: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
    icon: '⏱',
    label: 'Active'
  },
  signed: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
    icon: '✓',
    label: 'Signed'
  },
  view: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
    icon: '👁',
    label: 'View'
  }
}

export const StatusBadge = ({ status, size = 'md', className = '' }) => {
  const config = STATUS_STYLES[status] || STATUS_STYLES.draft
  
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  }

  return (
    <span 
      className={`
        inline-flex items-center gap-1.5 
        rounded-full border-2 font-bold
        ${config.bg} ${config.text} ${config.border}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  )
}
