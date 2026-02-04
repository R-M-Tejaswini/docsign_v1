/**
 * ✅ NEW: Reusable template card for list display
 */

import { Link } from 'react-router-dom'
import { Button } from '../../../shared/components/ui/Button'

export const TemplateCard = ({ template, onDelete, onUse }) => {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all p-6 border-2 border-gray-200 hover:border-blue-300">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 truncate">{template.title}</h3>
          {template.description && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{template.description}</p>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
        <div>
          <p className="text-gray-600">Pages</p>
          <p className="font-bold text-gray-900">{template.page_count}</p>
        </div>
        <div>
          <p className="text-gray-600">Fields</p>
          <p className="font-bold text-gray-900">{template.field_count || 0}</p>
        </div>
        <div>
          <p className="text-gray-600">Recipients</p>
          <p className="font-bold text-gray-900">{template.recipient_count || 0}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link to={`/templates/${template.id}`} className="flex-1">
          <Button variant="primary" className="w-full" size="sm">
            Edit
          </Button>
        </Link>
        <Button
          variant="secondary"
          onClick={() => onUse(template.id)}
          size="sm"
          className="flex-1"
        >
          Use
        </Button>
        <Button
          variant="secondary"
          onClick={() => onDelete(template.id)}
          size="sm"
          className="flex-1"
        >
          Delete
        </Button>
      </div>
    </div>
  )
}