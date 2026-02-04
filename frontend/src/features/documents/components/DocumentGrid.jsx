/**
 * ✅ NEW: Responsive grid layout for documents
 */

import { DocumentCard } from './DocumentCard'

export const DocumentGrid = ({ documents, onDuplicate, onDownload }) => {
  if (documents.length === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          document={doc}
          onDuplicate={onDuplicate}
          onDownload={onDownload}
        />
      ))}
    </div>
  )
}