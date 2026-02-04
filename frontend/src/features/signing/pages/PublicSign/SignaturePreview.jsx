/**
 * ✅ EXTRACTED: Signature preview and audit display
 */

import { DocumentViewer } from '../../../pdf/components/DocumentViewer'
import { PageLayer } from '../../../pdf/components/PageLayer'
import { useState } from 'react'

export const SignaturePreview = ({ pageData }) => {
  const [currentPage, setCurrentPage] = useState(1)

  const fileUrl = pageData.document?.file_url || pageData.document?.file
  let absoluteFileUrl = fileUrl
  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  const pageFields = pageData.fields?.filter((f) => f.page_number === currentPage) || []

  return (
    <div className="flex h-screen bg-gray-50">
      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <DocumentViewer fileUrl={absoluteFileUrl} currentPage={currentPage} onPageChange={setCurrentPage}>
          {(pageNum, scale) => (
            <PageLayer
              pageWidth={612}
              pageHeight={792}
              fields={pageFields}
              scale={scale}
            />
          )}
        </DocumentViewer>
      </div>

      {/* Right Sidebar - Audit Info */}
      <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto p-6 shadow-lg">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Document Status</h3>
        
        {pageData.recipient_status && (
          <div className="space-y-3">
            {Object.entries(pageData.recipient_status).map(([recipient, status]) => (
              <div key={recipient} className="bg-gray-50 p-3 rounded border border-gray-300">
                <p className="text-sm font-semibold text-gray-900">{recipient}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {status.signed}/{status.total} fields signed
                </p>
                {status.completed && <p className="text-xs text-green-600 font-bold mt-1">✓ Complete</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}