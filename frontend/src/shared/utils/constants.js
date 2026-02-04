/**
 * ✅ CENTRALIZED: All enums and constants
 */

export const DOCUMENT_STATUS = {
  DRAFT: 'draft',
  LOCKED: 'locked',
  PARTIALLY_SIGNED: 'partially_signed',
  COMPLETED: 'completed',
}

export const DOCUMENT_STATUS_INFO = {
  [DOCUMENT_STATUS.DRAFT]: {
    label: '📝 Draft',
    color: 'bg-blue-100',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-300',
    ring: 'ring-blue-200',
  },
  [DOCUMENT_STATUS.LOCKED]: {
    label: '🔒 Locked',
    color: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    borderColor: 'border-yellow-300',
    ring: 'ring-yellow-200',
  },
  [DOCUMENT_STATUS.PARTIALLY_SIGNED]: {
    label: '⏳ Signing...',
    color: 'bg-purple-100',
    textColor: 'text-purple-800',
    borderColor: 'border-purple-300',
    ring: 'ring-purple-200',
  },
  [DOCUMENT_STATUS.COMPLETED]: {
    label: '✅ Complete',
    color: 'bg-green-100',
    textColor: 'text-green-800',
    borderColor: 'border-green-300',
    ring: 'ring-green-200',
  },
}

export const FIELD_TYPES = {
  TEXT: 'text',
  SIGNATURE: 'signature',
  DATE: 'date',
  CHECKBOX: 'checkbox',
}

export const LINK_STATUS = {
  PENDING: 'pending',
  USED: 'used',
  REVOKED: 'revoked',
}

export const LINK_STATUS_INFO = {
  [LINK_STATUS.PENDING]: {
    label: '⏳ Active',
    color: 'bg-blue-100',
    text: 'text-blue-800',
  },
  [LINK_STATUS.USED]: {
    label: '✓ Used',
    color: 'bg-green-100',
    text: 'text-green-800',
  },
  [LINK_STATUS.REVOKED]: {
    label: '✕ Revoked',
    color: 'bg-red-100',
    text: 'text-red-800',
  },
}

export const WEBHOOK_EVENTS = {
  SIGNATURE_CREATED: 'document.signature_created',
  COMPLETED: 'document.completed',
  STATUS_CHANGED: 'document.status_changed',
}

export const WEBHOOK_EVENT_LABELS = {
  [WEBHOOK_EVENTS.SIGNATURE_CREATED]: '👤 Signature Created',
  [WEBHOOK_EVENTS.COMPLETED]: '✅ Document Completed',
  [WEBHOOK_EVENTS.STATUS_CHANGED]: '🔄 Status Changed',
}