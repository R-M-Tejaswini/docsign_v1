/**
 * Determine if a field is editable based on its state and version status.
 * @param {object} field - Field object with value, locked properties
 * @param {string} versionStatus - Status of the document version
 * @param {string} scope - Token scope (view or sign)
 * @returns {boolean}
 */
export const isFieldEditable = (field, versionStatus, scope) => {
  // Can only edit in draft versions and with sign scope
  if (versionStatus !== 'draft') return false
  if (scope !== 'sign') return false
  
  // Cannot edit locked fields
  if (field.locked) return false
  
  // Cannot edit fields that already have a value
  if (field.value && field.value.trim() !== '') return false
  
  return true
}

/**
 * Determine if a field is visible based on its type and context.
 * @param {object} field - Field object
 * @param {boolean} isEditMode - Whether in edit mode
 * @returns {boolean}
 */
export const isFieldVisible = (field, isEditMode = false) => {
  return true // All fields visible by default
}

/**
 * Get field display info based on type.
 * @param {string} fieldType - Type of field (text, signature, date, checkbox)
 * @returns {object} Display info with label, placeholder, icon
 */
export const getFieldDisplayInfo = (fieldType) => {
  const info = {
    text: {
      label: 'Text Field',
      placeholder: 'Enter text...',
      icon: '✎',
      color: '#3b82f6',
    },
    signature: {
      label: 'Signature',
      placeholder: 'Signature',
      icon: '✍',
      color: '#8b5cf6',
    },
    date: {
      label: 'Date',
      placeholder: 'MM/DD/YYYY',
      icon: '📅',
      color: '#ec4899',
    },
    checkbox: {
      label: 'Checkbox',
      placeholder: '☐',
      icon: '☑',
      color: '#10b981',
    },
  }
  return info[fieldType] || info.text
}

/**
 * Validate field value based on type.
 * @param {string} value - Field value to validate
 * @param {string} fieldType - Type of field
 * @returns {boolean}
 */
export const validateFieldValue = (value, fieldType) => {
  if (!value) return false
  
  switch (fieldType) {
    case 'date':
      // Simple date validation (MM/DD/YYYY)
      return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)
    case 'text':
      return value.trim().length > 0
    case 'signature':
      return value.trim().length > 0
    case 'checkbox':
      return true // Just needs to exist
    default:
      return value.trim().length > 0
  }
}