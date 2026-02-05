//frontend/src/features/fields/types.js
/**
 * ✅ CENTRALIZED: Field type definitions
 */

export const FIELD_TYPES = {
  TEXT: 'text',
  SIGNATURE: 'signature',
  DATE: 'date',
  CHECKBOX: 'checkbox',
}

export const FIELD_TYPE_INFO = {
  [FIELD_TYPES.TEXT]: {
    label: 'Text',
    icon: '📝',
    description: 'Single-line or multi-line text input',
    placeholder: 'Enter text...',
  },
  [FIELD_TYPES.SIGNATURE]: {
    label: 'Signature',
    icon: '✍️',
    description: 'Digital signature field',
    placeholder: 'Signer name',
  },
  [FIELD_TYPES.DATE]: {
    label: 'Date',
    icon: '📅',
    description: 'Date selection field',
    placeholder: 'Select date...',
  },
  [FIELD_TYPES.CHECKBOX]: {
    label: 'Checkbox',
    icon: '☑️',
    description: 'Yes/No checkbox field',
    placeholder: 'Check if agreed',
  },
}