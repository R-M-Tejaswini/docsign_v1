/**
 * ✅ NEW: Reusable document card for list display
 */

import { Link } from 'react-router-dom'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { Button } from '../../../shared/components/ui/Button'

export const DocumentCard = ({ document, onDuplicate, onDownload }) => {
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
          <h3 className="text-lg font-bold text-gray-900 truncate">{document.title}</h3>
          {document.description && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{document.description}</p>
          )}
        </div>
        <StatusBadge type="document" status={document.status} className="ml-2" />
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div>
          <p className="text-gray-600">Pages</p>
          <p className="font-bold text-gray-900">{document.page_count}</p>
        </div>
        <div>
          <p className="text-gray-600">Created</p>
          <p className="font-bold text-gray-900">{formatDate(document.created_at)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link to={`/documents/${document.id}`} className="flex-1">
          <Button variant="primary" className="w-full" size="sm">
            Edit
          </Button>
        </Link>
        {onDuplicate && (
          <Button
            variant="secondary"
            onClick={() => onDuplicate(document.id)}
            size="sm"
            className="flex-1"
          >
            Duplicate
          </Button>
        )}
      </div>
    </div>
  )
}