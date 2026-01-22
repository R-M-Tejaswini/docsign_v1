import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { DocumentViewer } from '../components/pdf/DocumentViewer'
import { FieldOverlay } from '../components/fields/FieldOverlay'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'

export const GroupSign = () => {
  const { token } = useParams()
  const [session, setSession] = useState(null)
  const [currentDoc, setCurrentDoc] = useState(null)
  const [fields, setFields] = useState([])
  const [fieldValues, setFieldValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toasts, setToasts] = useState([])
  const [signerName, setSignerName] = useState('')
  const [showSummary, setShowSummary] = useState(false)

  const { execute: getGroupSign } = useApi(() =>
    fetch(`/api/documents/group-sign/${token}/`).then(r => r.json())
  )
  const { execute: submitGroupSign } = useApi((data) =>
    fetch(`/api/documents/group-sign/${token}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json())
  )

  useEffect(() => {
    loadSigningPage()
  }, [token])

  const loadSigningPage = async () => {
    setLoading(true)
    try {
      const data = await getGroupSign()
      
      if (data.status === 'completed') {
        setShowSummary(true)
        setLoading(false)
        return
      }

      setSession(data)
      if (data.fields) {
        setFields(data.fields)
        const initialValues = {}
        data.fields.forEach(field => {
          initialValues[field.id] = field.value || ''
        })
        setFieldValues(initialValues)
      }
    } catch (error) {
      addToast('Failed to load signing session', 'error')
    } finally {
      setLoading(false)
    }
  }

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  const handleFieldChange = (fieldId, value) => {
    setFieldValues(prev => ({
      ...prev,
      [fieldId]: value
    }))
  }

  const handleSubmitSignatures = async () => {
    if (!signerName.trim()) {
      addToast('Please enter your name', 'error')
      return
    }

    // Validate required fields
    const requiredFields = fields.filter(f => f.field_type === 'signature' || f.field_type === 'initial')
    const missingRequired = requiredFields.some(f => !fieldValues[f.id] || fieldValues[f.id].trim() === '')
    
    if (missingRequired) {
      addToast('Please complete all required fields', 'error')
      return
    }

    setSubmitting(true)
    try {
      const result = await submitGroupSign({
        signer_name: signerName,
        field_values: fieldValues
      })

      if (result.status === 'completed') {
        setShowSummary(true)
        addToast('All documents signed successfully!', 'success')
      } else if (result.status === 'next_document') {
        addToast('Document signed! Loading next document...', 'success')
        setTimeout(() => {
          loadSigningPage()
        }, 1000)
      }
    } catch (error) {
      addToast('Failed to submit signatures', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading signing session...</p>
        </div>
      </div>
    )
  }

  if (showSummary) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md text-center">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-green-600 mb-2">All Documents Signed!</h1>
          <p className="text-gray-600 mb-6">
            Thank you for signing. All documents in this group have been completed successfully.
          </p>
          <div className="bg-gray-50 rounded p-4 mb-6 text-left text-sm">
            <p><strong>Signer:</strong> {signerName}</p>
            <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
          </div>
          <p className="text-gray-500 text-sm">
            You can close this page now.
          </p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8 text-center">
          <p className="text-red-600">Invalid or expired signing session</p>
        </div>
      </div>
    )
  }

  const progress = ((session.current_index + 1) / session.total_items) * 100

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="mb-4">
            <h1 className="text-2xl font-bold">{session.group_name}</h1>
            <p className="text-gray-600">
              Document {session.current_index + 1} of {session.total_items}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="grid grid-cols-3 gap-8">
          {/* Document Viewer */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <DocumentViewer
                pdfUrl={session.pdf_url}
                fields={fields}
                fieldValues={fieldValues}
                onFieldChange={handleFieldChange}
                readOnly={false}
              >
                {fields.map(field => (
                  <FieldOverlay
                    key={field.id}
                    field={field}
                    value={fieldValues[field.id]}
                    onChange={(value) => handleFieldChange(field.id, value)}
                    readOnly={field.locked}
                  />
                ))}
              </DocumentViewer>
            </div>
          </div>

          {/* Sidebar - Signer Info & Fields */}
          <div className="space-y-6">
            {/* Signer Name (only show once) */}
            {session.current_index === 0 && !signerName && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-4">Your Information</h3>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full px-3 py-2 border rounded mb-4"
                />
                <p className="text-sm text-gray-600">
                  This name will be used for all signatures in this group.
                </p>
              </div>
            )}

            {/* Document Info */}
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
              <h3 className="font-semibold text-blue-900 mb-2">
                {session.document_name}
              </h3>
              <p className="text-sm text-blue-700">
                Version {session.version_number}
              </p>
            </div>

            {/* Fields Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4">Fields to Complete</h3>
              <div className="space-y-3">
                {fields.map(field => {
                  const isFilled = fieldValues[field.id] && fieldValues[field.id].trim() !== ''
                  return (
                    <div key={field.id} className="text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-4 h-4 rounded-full ${isFilled ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                        <span className="text-gray-700">{field.field_type}</span>
                      </div>
                      <p className="text-xs text-gray-500 ml-6">
                        {field.recipient && `For: ${field.recipient}`}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button
                onClick={handleSubmitSignatures}
                variant="primary"
                disabled={submitting || !signerName}
                className="w-full"
              >
                {submitting ? 'Signing...' : session.current_index < session.total_items - 1 ? 'Sign & Next' : 'Complete Signing'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {toasts.map(toast => (
        <Toast key={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  )
}