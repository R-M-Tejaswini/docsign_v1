/**
 * ✅ NEW: Reusable field list for display
 */

import { getRecipientBadgeClasses } from '../../../shared/utils/recipientColors'

export const FieldList = ({ fields = [], onSelect = null, selectedFieldId = null }) => {
  if (fields.length === 0) {
    return <p className="text-gray-500 text-sm">No fields</p>
  }

  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div
          key={field.id}
          onClick={() => onSelect?.(field.id)}
          className={`
            p-3 rounded-lg border-2 cursor-pointer transition-all
            ${
              selectedFieldId === field.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 bg-white'
            }
          `}
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{field.label}</p>
              <p className="text-xs text-gray-600 mt-0.5">{field.field_type}</p>
            </div>
            {field.recipient && (
              <span className={`text-xs px-2 py-1 rounded ${getRecipientBadgeClasses(field.recipient)}`}>
                {field.recipient}
              </span>
            )}
          </div>
          {field.required && <p className="text-xs text-red-600 mt-2">Required</p>}
        </div>
      ))}
    </div>
  )
}