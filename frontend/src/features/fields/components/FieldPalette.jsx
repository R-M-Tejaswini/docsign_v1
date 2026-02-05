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
    'prefilled_text',  // ✅ NEW
  ]

  return (
    <div className="bg-white border-r border-gray-200 p-5 w-64 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Add Fields</h3>
        <p className="text-xs text-gray-600">Click a field type to add it to the PDF</p>
      </div>
      
      <div className="space-y-3">
        {fieldTypes.map((type) => {
          const info = getFieldDisplayInfo(type)
          const descriptions = {
            text: 'Input field for text',
            signature: 'Handwritten signature',
            date: 'Date picker field',
            checkbox: 'Checkbox selection',
            initials: 'Initials signature',
            prefilled_text: 'Static or editable pre-filled text',  // ✅ NEW
          }
          
          return (
            <button
              key={type}
              onClick={() => onSelectFieldType(type)}
              className={`
                w-full text-left px-4 py-3 rounded-lg text-sm transition-all 
                duration-200 border-2 border-transparent hover:border-gray-300 
                hover:shadow-md active:scale-95 group
                ${info.color}
              `}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl group-hover:scale-110 transition-transform">
                  {info.icon}
                </span>
                <div className="flex-1">
                  <div className={`font-semibold ${info.textColor}`}>
                    {info.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {descriptions[type]}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <span className="text-blue-600 text-lg">💡</span>
          <p className="text-xs text-blue-900 leading-relaxed">
            <strong>Tip:</strong> After clicking a field type, click anywhere on the 
            PDF to place it. Then drag to reposition or resize.
          </p>
        </div>
      </div>
    </div>
  )
}