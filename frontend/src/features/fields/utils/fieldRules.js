/**
 * Field display rules and utilities
 */

export const getFieldDisplayInfo = (fieldType) => {
  const info = {
    text: {
      icon: '📝',
      label: 'Text',
      color: 'bg-blue-100',
    },
    signature: {
      icon: '✍️',
      label: 'Signature',
      color: 'bg-purple-100',
    },
    date: {
      icon: '📅',
      label: 'Date',
      color: 'bg-green-100',
    },
    checkbox: {
      icon: '☑️',
      label: 'Checkbox',
      color: 'bg-orange-100',
    },
  }
  return info[fieldType] || { icon: '?', label: 'Unknown', color: 'bg-gray-100' }
}