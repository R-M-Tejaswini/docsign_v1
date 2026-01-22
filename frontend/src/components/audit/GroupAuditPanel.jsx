import { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import { Button } from '../ui/Button'
import { Toast } from '../ui/Toast'

export const GroupAuditPanel = ({ groupId }) => {
  const [manifest, setManifest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [toasts, setToasts] = useState([])

  const { execute: getManifest } = useApi(() =>
    fetch(`/api/documents/document-groups/${groupId}/manifest/`).then(r => r.json())
  )

  useEffect(() => {
    loadManifest()
  }, [groupId])

  const loadManifest = async () => {
    setLoading(true)
    try {
      const data = await getManifest()
      setManifest(data)
    } catch (error) {
      addToast('Failed to load manifest', 'error')
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

  const handleDownload = async (format = 'zip') => {
    setDownloading(true)
    try {
      const response = await fetch(
        `/api/documents/document-groups/${groupId}/download/?format=${format}`
      )
      if (!response.ok) throw new Error('Download failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `group_${groupId}.${format === 'pdf' ? 'pdf' : 'zip'}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      addToast(`Downloaded as ${format.toUpperCase()}`, 'success')
    } catch (error) {
      addToast('Download failed', 'error')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return <div className="p-4 text-center">Loading manifest...</div>
  if (!manifest) return <div className="p-4 text-center">Manifest not available</div>

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-6">Group Audit & Download</h2>

      {/* Download Section */}
      <div className="mb-8 pb-8 border-b">
        <h3 className="font-medium mb-4">Download Signed Documents</h3>
        <div className="flex gap-2">
          <Button
            onClick={() => handleDownload('zip')}
            variant="primary"
            disabled={downloading}
          >
            Download as ZIP
          </Button>
          <Button
            onClick={() => handleDownload('pdf')}
            variant="primary"
            disabled={downloading}
          >
            Download as PDF
          </Button>
        </div>
      </div>

      {/* Manifest Section */}
      <div>
        <h3 className="font-medium mb-4">Group Manifest</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Group ID</p>
              <p className="font-mono text-gray-900">{manifest.group_id}</p>
            </div>
            <div>
              <p className="text-gray-600">Status</p>
              <p className="font-semibold text-green-600">{manifest.status}</p>
            </div>
            <div>
              <p className="text-gray-600">Created</p>
              <p className="text-gray-900">
                {new Date(manifest.created_at).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Exported</p>
              <p className="text-gray-900">
                {new Date(manifest.exported_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Items */}
          <div className="mt-6">
            <h4 className="font-medium mb-2">Documents in Group</h4>
            <div className="space-y-3">
              {manifest.items.map((item, idx) => (
                <div key={idx} className="bg-gray-50 rounded p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">
                        {item.order}. {item.document_name}
                      </p>
                      <p className="text-sm text-gray-600">
                        Version {item.version_number} • {item.status}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      item.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  {item.signatures.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-gray-600 mb-2">Signatures:</p>
                      {item.signatures.map((sig, sidx) => (
                        <p key={sidx} className="text-xs text-gray-700">
                          • {sig.signer_name} on{' '}
                          {new Date(sig.signed_at).toLocaleDateString()}
                        </p>
                      ))}
                    </div>
                  )}

                  {item.document_sha256 && (
                    <div className="mt-2 text-xs">
                      <p className="text-gray-600 font-mono break-all">
                        SHA256: {item.document_sha256}
                      </p>
                    </div>
                  )}
                </div>
              ))}
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