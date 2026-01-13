import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DocumentViewer } from '../components/pdf/DocumentViewer'
import { PageLayer } from '../components/pdf/PageLayer'
import { FieldOverlay } from '../components/fields/FieldOverlay'
import { FieldEditor } from '../components/fields/FieldEditor'
import { LinksPanel } from '../components/links/LinksPanel'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'
import { useApi } from '../hooks/useApi'
import { documentAPI } from '../services/api'

export const DocumentEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [document, setDocument] = useState(null)
  const [version, setVersion] = useState(null)
  const [fields, setFields] = useState([])
  const [signatures, setSignatures] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [toasts, setToasts] = useState([])

  const { execute: getDocument } = useApi(() => documentAPI.get(id))
  const { execute: updateField } = useApi((versionId, fieldId, data) =>
    documentAPI.updateField(id, versionId, fieldId, data)
  )
  const { execute: lockVersion } = useApi((versionId) =>
    documentAPI.lockVersion(id, versionId)
  )

  useEffect(() => {
    loadDocument()
  }, [id])

  const loadDocument = async () => {
    try {
      const data = await getDocument()
      setDocument(data)
      if (data.latest_version) {
        setVersion(data.latest_version)
        setFields(data.latest_version.fields || [])
        setSignatures(data.latest_version.signatures || [])
      }
    } catch (err) {
      addToast('Failed to load document', 'error')
    }
  }

  const handleUpdateField = async (updatedField) => {
    if (version.status !== 'draft') {
      addToast('Cannot edit fields in a locked version', 'warning')
      return
    }

    try {
      // Send only the fields that can be updated
      await updateField(version.id, updatedField.id, {
        label: updatedField.label,
        value: updatedField.value,
      })
      setFields(fields.map((f) => (f.id === updatedField.id ? updatedField : f)))
      addToast('Field updated', 'success')
    } catch (err) {
      addToast('Failed to update field', 'error')
    }
  }

  const handleLockVersion = async () => {
    if (!window.confirm('Lock this version? Fields will no longer be editable.')) {
      return
    }

    try {
      const updated = await lockVersion(version.id)
      setVersion(updated)
      setFields(updated.fields || [])
      addToast('Version locked successfully', 'success')
    } catch (err) {
      addToast('Failed to lock version', 'error')
    }
  }

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts([...toasts, { id, message, type, duration: 3000 }])
  }

  if (!document || !version) {
    return <div className="p-8 text-center">Loading document...</div>
  }

  const fileUrl = version.file_url || version.file
  const pageFields = fields.filter((f) => f.page_number === currentPage)
  const pageSignatures = signatures.filter((s) => s.page_number === currentPage)
  const isDraftMode = version.status === 'draft'

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{document.title}</h1>
            <p className="text-sm text-gray-600">
              Status: <span className="font-medium capitalize">{version.status}</span>
              {isDraftMode && <span className="text-blue-600 ml-2">(Editable)</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {isDraftMode && (
              <Button onClick={handleLockVersion} variant="warning" size="sm">
                Lock Version
              </Button>
            )}
            <Button onClick={() => navigate('/documents')} variant="secondary" size="sm">
              ← Back
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 relative">
            <DocumentViewer
              fileUrl={fileUrl}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            >
              {(pageNum, scale) => (
                <PageLayer
                  pageWidth={612}
                  pageHeight={792}
                  fields={pageFields}
                  signatures={pageSignatures}
                  selectedFieldId={selectedFieldId}
                  onFieldSelect={setSelectedFieldId}
                  scale={scale}
                >
                  {/* Draggable field overlays in draft mode */}
                  {isDraftMode &&
                    pageFields.map((field) => (
                      <FieldOverlay
                        key={field.id}
                        field={field}
                        pageWidth={612}
                        pageHeight={792}
                        scale={scale}
                        isSelected={selectedFieldId === field.id}
                        isEditing={true}
                        onUpdate={handleUpdateField}
                        onSelect={setSelectedFieldId}
                      />
                    ))}
                </PageLayer>
              )}
            </DocumentViewer>
          </div>

          <div className="w-80 bg-white border-l overflow-y-auto p-4 flex flex-col">
            {isDraftMode && selectedFieldId ? (
              <FieldEditor
                field={fields.find((f) => f.id === selectedFieldId)}
                onUpdate={handleUpdateField}
                onDelete={() => {}}
                onClose={() => setSelectedFieldId(null)}
              />
            ) : (
              <LinksPanel document={document} version={version} />
            )}
          </div>
        </div>
      </div>

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