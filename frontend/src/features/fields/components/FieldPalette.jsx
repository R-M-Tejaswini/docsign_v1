//frontend/src/features/fields/components/FieldPalette.jsx
/**
 * ✅ UPDATED: Field palette with prefilled_text option
 */

import { Button } from '../../../shared/components/ui/Button'
import { FIELD_TYPE_INFO } from '../types'
import { getFieldDisplayInfo } from '../utils/fieldRules'

export const FieldPalette = ({ onSelectFieldType }) => {
  const fieldTypes = [
    'text', 
    'signature', 
    'date', 
    'checkbox', 
    'initials',
    'prefilled_text',
  ]

  return (
    <div className="bg-white border-r border-gray-200 p-4 w-64 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Add Fields</h3>
        <p className="text-xs text-gray-600">Click to add field type</p>
      </div>
      
      <div className="space-y-2">
        {fieldTypes.map((type) => {
          const info = getFieldDisplayInfo(type)
          
          return (
            <button
              key={type}
              onClick={() => onSelectFieldType(type)}
              className={`
                w-full text-left px-4 py-2 rounded-lg text-sm transition-all 
                duration-200 border-2 border-gray-200 hover:border-gray-400 
                hover:shadow-md active:scale-95 group
                bg-white  # ✅ WHITE background, not colored
              `}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">
                    {info.label}
                  </div>
                </div>
                {/* ✅ NEW: Colored dot indicator (subtle) */}
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: getFieldTypeColor(type),
                  }}
                  title={`${info.label} field`}
                />
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs text-gray-700 leading-relaxed">
          <strong>💡 Tip:</strong> Click a type, then click on the PDF to place it.
        </p>
      </div>
    </div>
  )
}

// ✅ NEW: Helper function for subtle color dots
function getFieldTypeColor(fieldType) {
  const colors = {
    text: '#3b82f6',        // Blue
    signature: '#a855f7',   // Purple
    date: '#10b981',        // Green
    checkbox: '#f97316',    // Orange
    initials: '#ec4899',    // Pink
    prefilled_text: '#14b8a6', // Teal
  }
  return colors[fieldType] || '#6b7280'
}