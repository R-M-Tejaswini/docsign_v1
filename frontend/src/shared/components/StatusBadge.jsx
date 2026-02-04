/**
 * ✅ CONSOLIDATED: Single badge component for all status types
 * Replaces 5+ status badge implementations
 */

import { DOCUMENT_STATUS_INFO, LINK_STATUS_INFO, WEBHOOK_EVENT_LABELS } from '../utils/constants'

export const StatusBadge = ({ type = 'document', status, className = '' }) => {
  let info

  if (type === 'document') {
    info = DOCUMENT_STATUS_INFO[status]
  } else if (type === 'link') {
    info = LINK_STATUS_INFO[status]
  }

  if (!info) return null

  return (
    <span
      className={`
        ${info.color} ${info.text || info.textColor} 
        text-xs font-bold px-3 py-1.5 rounded-full 
        whitespace-nowrap flex items-center gap-1.5 shadow-lg 
        ${info.ring ? `ring-2 ${info.ring}` : ''}
        ${className}
      `}
    >
      <span>{info.label}</span>
    </span>
  )
}