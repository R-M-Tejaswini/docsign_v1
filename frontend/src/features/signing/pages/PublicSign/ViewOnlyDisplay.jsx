/**
 * ✅ EXTRACTED: View-only display after signing
 */

import { DocumentViewer } from '../../../pdf/components/DocumentViewer'
import { PageLayer } from '../../../pdf/components/PageLayer'
import { useState } from 'react'

export const ViewOnlyDisplay = ({ pageData }) => {
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

      {/* Right Sidebar */}
      <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto p-6 shadow-lg">
        <h3 className="text-xl font-bold text-gray-900 mb-6">✓ Document Signed</h3>
        <p className="text-gray-600 text-sm">This document has been successfully signed.</p>

        {pageData.signatures && pageData.signatures.length > 0 && (
          <div className="mt-6 space-y-3">
            <h4 className="text-sm font-bold text-gray-900">Signatures:</h4>
            {pageData.signatures.map((sig) => (
              <div key={sig.id} className="bg-green-50 p-3 rounded border border-green-300">
                <p className="text-sm font-semibold text-green-900">{sig.signer_name}</p>
                <p className="text-xs text-gray-600 mt-1">{new Date(sig.signed_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}