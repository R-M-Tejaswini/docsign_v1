//frontend/src/features/fields/utils/fieldRules.js
/**
 * ✅ UPDATED: Field display rules with prefilled_text color
 */

export const getFieldDisplayInfo = (fieldType) => {
  const info = {
    text: {
      icon: '📝',
      label: 'Text',
      color: 'bg-blue-100',
      borderColor: 'border-blue-300',
      textColor: 'text-blue-800',
    },
    signature: {
      icon: '✍️',
      label: 'Signature',
      color: 'bg-purple-100',
      borderColor: 'border-purple-300',
      textColor: 'text-purple-800',
    },
    date: {
      icon: '📅',
      label: 'Date',
      color: 'bg-green-100',
      borderColor: 'border-green-300',
      textColor: 'text-green-800',
    },
    checkbox: {
      icon: '☑️',
      label: 'Checkbox',
      color: 'bg-orange-100',
      borderColor: 'border-orange-300',
      textColor: 'text-orange-800',
    },
    initials: {
      icon: '👤',
      label: 'Initials',
      color: 'bg-pink-100',
      borderColor: 'border-pink-300',
      textColor: 'text-pink-800',
    },
    prefilled_text: {
      icon: '📄',
      label: 'Prefilled Text',
      color: 'bg-teal-100',           // ✅ DISTINCT: Teal for prefilled
      borderColor: 'border-teal-300',
      textColor: 'text-teal-800',
    },
  }
  return info[fieldType] || { 
    icon: '?', 
    label: 'Unknown', 
    color: 'bg-gray-100',
    borderColor: 'border-gray-300',
    textColor: 'text-gray-800',
  }
}