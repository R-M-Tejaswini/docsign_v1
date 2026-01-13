import { getFieldDisplayInfo } from '../../utils/fieldRules'

export const FieldPalette = ({ onSelectFieldType }) => {
  const fieldTypes = ['text', 'signature', 'date', 'checkbox']

  return (
    <div className="bg-white border-r p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Add Fields</h3>
      <div className="space-y-2">
        {fieldTypes.map((type) => {
          const info = getFieldDisplayInfo(type)
          return (
            <button
              key={type}
              onClick={() => onSelectFieldType(type)}
              className="w-full text-left px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm transition-colors"
              style={{ borderLeft: `4px solid ${info.color}` }}
            >
              <span className="mr-2">{info.icon}</span>
              {info.label}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-gray-500 mt-4">
        Click a field type, then click on the PDF to add a field
      </p>
    </div>
  )
}