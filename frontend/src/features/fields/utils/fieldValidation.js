//frontend/src/features/fields/utils/fieldValidation.js
/**
 * ✅ UNIFIED: Field validation logic
 */

export const validateFieldValue = (value, fieldType, required = false) => {
  if (required && (!value || (typeof value === 'string' && !value.trim()))) {
    return 'This field is required'
  }

  switch (fieldType) {
    case 'date':
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return 'Invalid date format'
      }
      break

    case 'signature':
      if (value && value.trim().length < 2) {
        return 'Signature must be at least 2 characters'
      }
      break

    case 'text':
      if (value && value.length > 500) {
        return 'Text cannot exceed 500 characters'
      }
      break

    default:
      break
  }

  return null
}

export const validateField = (field) => {
  const errors = {}

  if (!field.label || !field.label.trim()) {
    errors.label = 'Label is required'
  }

  if (!field.field_type) {
    errors.field_type = 'Field type is required'
  }

  if (!field.recipient || !field.recipient.trim()) {
    errors.recipient = 'Recipient is required'
  }

  if (field.x_pct < 0 || field.x_pct > 1) {
    errors.x_pct = 'X position must be between 0 and 1'
  }

  if (field.y_pct < 0 || field.y_pct > 1) {
    errors.y_pct = 'Y position must be between 0 and 1'
  }

  if (field.x_pct + field.width_pct > 1) {
    errors.width_pct = 'Field extends past right edge'
  }

  if (field.y_pct + field.height_pct > 1) {
    errors.height_pct = 'Field extends past bottom edge'
  }

  return errors
}