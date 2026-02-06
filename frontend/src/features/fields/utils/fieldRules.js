//frontend/src/features/fields/utils/fieldRules.js
/**
 * ✅ UPDATED: Field display rules with prefilled_text color
 */

export const getFieldDisplayInfo = (fieldType) => {
  const info = {
    text: {
      icon: '📝',
      label: 'Text',
      color: 'bg-white',           // ✅ WHITE
      borderColor: 'border-blue-400',
      textColor: 'text-blue-800',
    },
    signature: {
      icon: '✍️',
      label: 'Signature',
      color: 'bg-white',           // ✅ WHITE
      borderColor: 'border-purple-400',
      textColor: 'text-purple-800',
    },
    date: {
      icon: '📅',
      label: 'Date',
      color: 'bg-white',           // ✅ WHITE
      borderColor: 'border-green-400',
      textColor: 'text-green-800',
    },
    checkbox: {
      icon: '☑️',
      label: 'Checkbox',
      color: 'bg-white',           // ✅ WHITE
      borderColor: 'border-orange-400',
      textColor: 'text-orange-800',
    },
    initials: {
      icon: '👤',
      label: 'Initials',
      color: 'bg-white',           // ✅ WHITE
      borderColor: 'border-pink-400',
      textColor: 'text-pink-800',
    },
    prefilled_text: {
      icon: '📄',
      label: 'Prefilled Text',
      color: 'bg-white',           // ✅ WHITE (not teal)
      borderColor: 'border-gray-400',
      textColor: 'text-gray-800',
    },
  }
  return info[fieldType] || { 
    icon: '?', 
    label: 'Unknown', 
    color: 'bg-white',
    borderColor: 'border-gray-400',
    textColor: 'text-gray-800',
  }
}