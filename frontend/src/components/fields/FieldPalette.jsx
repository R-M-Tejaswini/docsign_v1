import { getFieldDisplayInfo } from '../../utils/fieldRules'

export const FieldPalette = ({ onSelectFieldType }) => {
  const fieldTypes = ['text', 'signature', 'date', 'checkbox']

  return (
    <div className="bg-white border-r border-gray-200 p-5 w-64 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Add Fields</h3>
        <p className="text-xs text-gray-600">Click a field type to add it to the PDF</p>
      </div>
      
      <div className="space-y-3">
        {fieldTypes.map((type) => {
          const info = getFieldDisplayInfo(type)
          return (
            <button
              key={type}
              onClick={() => onSelectFieldType(type)}
              className="w-full text-left px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-white hover:to-gray-50 rounded-lg text-sm transition-all duration-200 border-2 border-transparent hover:border-gray-300 hover:shadow-md active:scale-95 group"
              style={{ 
                borderLeftColor: info.color,
                borderLeftWidth: '4px'
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl group-hover:scale-110 transition-transform">{info.icon}</span>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 group-hover:text-gray-700">
                    {info.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {type === 'text' && 'Input field for text'}
                    {type === 'signature' && 'Handwritten signature'}
                    {type === 'date' && 'Date picker field'}
                    {type === 'checkbox' && 'Checkbox selection'}
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
            <strong>Tip:</strong> After clicking a field type, click anywhere on the PDF to place it. Then drag to reposition or resize.
          </p>
        </div>
      </div>
    </div>
  )
}