//frontend/src/features/pdf/components/DocumentViewer.jsx
import { useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

export const DocumentViewer = ({
  fileUrl,
  currentPage = 1,
  onPageChange,
  onLoadSuccess,
  onLoad,  // ✅ ADDED: Support both callback names
  onError,  // ✅ ADDED: Error callback
  children,
}) => {
  const [numPages, setNumPages] = useState(null)
  const [scale, setScale] = useState(1)
  const [loadError, setLoadError] = useState(null)

  console.log('🔵 DocumentViewer mounted with fileUrl:', fileUrl)  // ✅ DEBUG

  const handleLoadSuccess = ({ numPages }) => {
    console.log('✅ PDF loaded successfully, pages:', numPages)  // ✅ DEBUG
    setNumPages(numPages)
    setLoadError(null)
    
    // ✅ Call both callbacks to support different naming conventions
    onLoadSuccess?.({ numPages })
    onLoad?.({ numPages })
  }

  const handleError = (error) => {
    console.error('❌ DocumentViewer error:', error)  // ✅ DEBUG
    setLoadError(error)
    onError?.(error)
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Controls */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              console.log('⬅️ Previous clicked, current page:', currentPage)
              onPageChange?.(Math.max(1, currentPage - 1))
            }}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300 transition"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-600 font-semibold">
            Page {currentPage} of {numPages || '?'}
          </span>
          <button
            onClick={() => {
              console.log('➡️ Next clicked, current page:', currentPage)
              onPageChange?.(Math.min(numPages, currentPage + 1))
            }}
            disabled={currentPage === numPages}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300 transition"
          >
            Next →
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition"
          >
            −
          </button>
          <span className="text-sm w-12 text-center font-semibold">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(Math.min(2, scale + 0.1))}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition"
          >
            +
          </button>
        </div>
      </div>

      {/* Error Display */}
      {loadError && (
        <div className="flex-1 flex items-center justify-center bg-red-50">
          <div className="text-center p-6 bg-white rounded-lg border-2 border-red-300">
            <p className="text-6xl mb-4">❌</p>
            <p className="text-red-600 font-bold mb-2">PDF Loading Error</p>
            <p className="text-sm text-gray-700 mb-4">{loadError.message || 'Failed to load PDF'}</p>
            <p className="text-xs text-gray-500 font-mono break-all">{fileUrl}</p>
          </div>
        </div>
      )}

      {/* PDF Container */}
      {!loadError && (
        <div className="flex-1 overflow-auto flex justify-center py-4">
          <Document 
            file={fileUrl} 
            onLoadSuccess={handleLoadSuccess}
            onError={handleError}
            loading={
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
                  <p className="text-gray-600 font-medium">Loading PDF...</p>
                </div>
              </div>
            }
          >
            <div 
              className="relative inline-block bg-white shadow-lg"
              style={{
                width: 612 * scale,
                height: 792 * scale,
              }}
            >
              {/* PDF Page */}
              <div
                style={{
                  width: 612 * scale,
                  height: 792 * scale,
                  transformOrigin: 'top center',
                }}
              >
                <Page
                  pageNumber={currentPage}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  width={612 * scale}
                  onLoadSuccess={() => console.log('📄 Page rendered:', currentPage)}
                  onError={(err) => console.error('❌ Page render error:', err)}
                />
              </div>

              {/* Overlay layer */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 612 * scale,
                  height: 792 * scale,
                  pointerEvents: 'auto',
                }}
              >
                {children?.(currentPage, scale)}
              </div>
            </div>
          </Document>
        </div>
      )}
    </div>
  )
}