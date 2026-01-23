import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Toast } from '../components/ui/Toast'
import { DocumentViewer } from '../components/pdf/DocumentViewer'
import { PageLayer } from '../components/pdf/PageLayer'
import { useApi } from '../hooks/useApi'
import { publicAPI } from '../services/api'

export const PublicSign = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  const [pageData, setPageData] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [fieldValues, setFieldValues] = useState({})
  const [signerName, setSignerName] = useState('')
  const [toasts, setToasts] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [showCongrats, setShowCongrats] = useState(false)
  const [groupProgress, setGroupProgress] = useState(null)
  const [nextSigningUrl, setNextSigningUrl] = useState(null)
  
  const { execute: getSignPage } = useApi(() => publicAPI.getSignPage(token))
  const { execute: submitSignature } = useApi((signData) =>
    publicAPI.submitSignature(token, signData)
  )
  const { execute: downloadVersion } = useApi(() =>
    publicAPI.downloadPublicVersion(token)
  )

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts([...toasts, { id, message, type, duration: 3000 }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  useEffect(() => {
    loadSignPage()
  }, [token])

  const loadSignPage = async () => {
    try {
      const data = await getSignPage()
      setPageData(data)

      const initialValues = {}
      data.fields?.forEach((field) => {
        initialValues[field.id] = field.value || ''
      })
      setFieldValues(initialValues)
    } catch (err) {
      addToast('Failed to load document', 'error')
      console.error(err)
    }
  }

  const handleFieldChange = (fieldId, value) => {
    setFieldValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }))
  }

  const handleSubmitSignature = async () => {
    if (!signerName.trim()) {
      addToast('Please enter your name', 'error')
      return
    }

    const editableFieldIds = pageData.editable_field_ids || []
    const filledFields = editableFieldIds.filter((id) => fieldValues[id]?.trim())

    if (filledFields.length === 0) {
      addToast('Please fill in at least one field', 'error')
      return
    }

    const signatureData = {
      signer_name: signerName,
      field_values: filledFields.map((id) => ({
        field_id: id,
        value: fieldValues[id],
      })),
    }

    setSubmitting(true)
    try {
      const response = await submitSignature(signatureData)
      
      // ✅ NEW: Handle group session response
      if (response.group_session_id) {
        setGroupProgress(response.group_progress)
        
        if (response.next_signing_url) {
          setNextSigningUrl(response.next_signing_url)
          addToast(`✅ ${response.message}. Redirecting in 3 seconds...`, 'success')
          
          // Auto-redirect to next document in group
          setTimeout(() => {
            navigate(`/sign/${response.next_signing_url.split('/sign/')[1]}`)
          }, 3000)
        } else if (response.group_progress?.completed === response.group_progress?.total) {
          // All documents signed
          setShowCongrats(true)
          addToast('🎉 All documents signed successfully!', 'success')
        }
      } else {
        // Single document signing
        setShowCongrats(true)
        addToast('✅ Document signed successfully!', 'success')
      }
    } catch (err) {
      addToast(
        'Failed to sign document: ' + (err.response?.data?.error || err.message),
        'error'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true)
      const blob = await downloadVersion()

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${pageData.version?.document?.title}_signed.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      addToast('PDF downloaded successfully', 'success')
    } catch (err) {
      addToast('Failed to download PDF', 'error')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (!pageData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-700 font-semibold text-lg">Loading document...</p>
        </div>
      </div>
    )
  }

  const pageFields = pageData.fields.filter((f) => f.page_number === currentPage)
  const editableFields = pageFields.filter((f) =>
    pageData.editable_field_ids?.includes(f.id)
  )

  const fileUrl = pageData.version?.file_url
  let absoluteFileUrl = fileUrl
  if (fileUrl && !fileUrl.startsWith('http')) {
    absoluteFileUrl = `http://localhost:8000${fileUrl}`
  }

  // ✅ NEW: Congratulations Modal for Group Sessions
  const CongratulationsModal = () => {
    const progress = groupProgress || pageData.recipient_status
    const allSigned = progress?.completed === progress?.total

    return (
      <Modal
        isOpen={showCongrats}
        onClose={() => setShowCongrats(false)}
        title={allSigned ? '🎉 All Done!' : '✅ Document Signed'}
      >
        <div className="text-center space-y-6">
          <div className="text-6xl mb-4">
            {allSigned ? '🎊' : '✅'}
          </div>

          {allSigned ? (
            <>
              <h3 className="text-2xl font-bold text-gray-900">
                All documents signed successfully!
              </h3>
              <p className="text-gray-600">
                Thank you for signing all {groupProgress?.total || progress?.total} documents.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-2xl font-bold text-gray-900">
                Document signed!
              </h3>
              {groupProgress && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">Progress</p>
                  <div className="flex items-center gap-2 text-lg font-bold text-blue-600">
                    <span>{groupProgress.completed}</span>
                    <span className="text-gray-400">/</span>
                    <span>{groupProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${groupProgress.percentage}%`,
                      }}
                    ></div>
                  </div>
                </div>
              )}
              {nextSigningUrl && (
                <p className="text-sm text-gray-600">
                  Next document link will open automatically...
                </p>
              )}
            </>
          )}

          <Button
            onClick={() => navigate('/')}
            variant="primary"
            className="w-full"
          >
            Return to Home
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-t-3xl shadow-lg border-b-2 border-gray-200 p-6">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {pageData.version?.document?.title}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {pageData.scope === 'sign' ? '✍️ Signing Link' : '👁️ View Only'}
              </p>
            </div>

            {/* ✅ NEW: Group Progress Badge */}
            {groupProgress && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg px-4 py-3 border-2 border-blue-200">
                <div className="text-xs font-bold text-blue-600 uppercase mb-1">
                  Group Progress
                </div>
                <div className="text-lg font-bold text-blue-900">
                  {groupProgress.completed}/{groupProgress.total}
                </div>
                <div className="w-32 bg-gray-200 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${groupProgress.percentage}%`,
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Status Info */}
          <div className="mt-4 flex gap-4 flex-wrap">
            <div className="text-sm">
              <span className="text-gray-600">Status:</span>
              <span className={`ml-2 font-bold px-3 py-1 rounded-full text-xs ${
                pageData.version?.status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : pageData.version?.status === 'locked'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {pageData.version?.status}
              </span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* PDF Viewer */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
              <div className="relative bg-gray-100 p-4" style={{ minHeight: '600px' }}>
                {absoluteFileUrl ? (
                  <DocumentViewer
                    fileUrl={absoluteFileUrl}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                  >
                    {(pageNum, scale) => (
                      <PageLayer
                        pageWidth={612}
                        pageHeight={792}
                        fields={pageFields}
                        scale={scale}
                      />
                    )}
                  </DocumentViewer>
                ) : (
                  <div className="h-96 flex items-center justify-center">
                    <p className="text-gray-500">PDF file not available</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Signing Panel */}
          {pageData.is_editable && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 p-6 sticky top-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-900">Sign Document</h3>

                {/* Signer Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
                  />
                </div>

                {/* Fields to Sign */}
                {editableFields.length > 0 ? (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      Fields to Sign ({editableFields.length})
                    </label>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {editableFields.map((field) => (
                        <div key={field.id} className="border-2 border-gray-200 rounded-lg p-3">
                          <label className="text-xs font-bold text-gray-600 uppercase block mb-2">
                            {field.label}
                          </label>
                          <textarea
                            value={fieldValues[field.id] || ''}
                            onChange={(e) =>
                              handleFieldChange(field.id, e.target.value)
                            }
                            placeholder="Enter value..."
                            rows="2"
                            className="w-full px-3 py-2 border-2 border-gray-300 rounded text-sm focus:border-blue-500 focus:outline-none"
                          />
                          {field.required && (
                            <p className="text-xs text-red-600 mt-1">Required field</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-600">No fields to sign</p>
                  </div>
                )}

                {/* Submit Button */}
                {pageData.is_editable && (
                  <Button
                    onClick={handleSubmitSignature}
                    variant="primary"
                    className="w-full"
                    disabled={submitting || !signerName.trim()}
                  >
                    {submitting ? (
                      <>
                        <span className="animate-spin">⟳</span>
                        Signing...
                      </>
                    ) : (
                      <>
                        <span>✍️</span>
                        Sign & Submit
                      </>
                    )}
                  </Button>
                )}

                {/* Download Button (if completed) */}
                {pageData.version?.status === 'completed' && (
                  <Button
                    onClick={handleDownloadPdf}
                    variant="success"
                    className="w-full"
                    disabled={downloadingPdf}
                  >
                    {downloadingPdf ? (
                      <>
                        <span className="animate-spin">⟳</span>
                        Downloading...
                      </>
                    ) : (
                      <>
                        <span>📥</span>
                        Download Signed PDF
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Congratulations Modal */}
      <CongratulationsModal />

      {/* Toasts */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => setToasts(toasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  )
}