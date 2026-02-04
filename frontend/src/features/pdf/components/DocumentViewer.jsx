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
  children,
}) => {
  const [numPages, setNumPages] = useState(null)
  const [scale, setScale] = useState(1)

  const handleLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
    onLoadSuccess?.({ numPages })
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Controls */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage} of {numPages || '?'}
          </span>
          <button
            onClick={() => onPageChange?.(Math.min(numPages, currentPage + 1))}
            disabled={currentPage === numPages}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next →
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            −
          </button>
          <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(Math.min(2, scale + 0.1))}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            +
          </button>
        </div>
      </div>

      {/* PDF Container with proper scaling */}
      <div className="flex-1 overflow-auto flex justify-center py-4">
        <Document file={fileUrl} onLoadSuccess={handleLoadSuccess}>
          <div 
            className="relative inline-block"
            style={{
              width: 612 * scale,
              height: 792 * scale,
            }}
          >
            {/* PDF Page - scaled using width/height */}
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
              />
            </div>

            {/* Overlay layer - positioned absolutely, also scaled */}
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
    </div>
  )
}