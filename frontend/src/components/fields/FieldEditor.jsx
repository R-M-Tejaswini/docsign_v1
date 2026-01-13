import { Button } from '../ui/Button'

export const FieldEditor = ({ field, onUpdate, onDelete, onClose }) => {
  if (!field) return null

  const handleLabelChange = (e) => {
    onUpdate({ ...field, label: e.target.value })
  }

  const handleRequiredChange = (e) => {
    onUpdate({ ...field, required: e.target.checked })
  }

  return (
    <div className="bg-white border-l p-4 w-64 overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">Edit Field</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          ×
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Label
          </label>
          <input
            type="text"
            value={field.label || ''}
            onChange={handleLabelChange}
            className="w-full px-3 py-2 border rounded text-sm"
            placeholder="Field label"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type
          </label>
          <div className="px-3 py-2 bg-gray-100 rounded text-sm">
            {field.field_type}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Page
          </label>
          <div className="px-3 py-2 bg-gray-100 rounded text-sm">
            {field.page_number}
          </div>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="required"
            checked={field.required}
            onChange={handleRequiredChange}
            className="rounded"
          />
          <label htmlFor="required" className="ml-2 text-sm text-gray-700">
            Required
          </label>
        </div>

        <div className="border-t pt-4">
          <Button
            onClick={() => onDelete(field.id)}
            variant="danger"
            size="sm"
            className="w-full"
          >
            Delete Field
          </Button>
        </div>
      </div>
    </div>
  )
}