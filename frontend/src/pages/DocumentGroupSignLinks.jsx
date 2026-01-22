import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useClipboard } from '../hooks/useClipboard'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Toast } from '../components/ui/Toast'

export const DocumentGroupSignLinks = () => {
  const { id } = useParams()
  const { copyToClipboard } = useClipboard()
  const [group, setGroup] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [toasts, setToasts] = useState([])
  const [formData, setFormData] = useState({
    recipient: '',
    expires_in_days: 7
  })

  const { execute: getGroup } = useApi(() =>
    fetch(`/api/documents/document-groups/${id}/`).then(r => r.json())
  )
  const { execute: listSessions } = useApi(() =>
    fetch(`/api/documents/document-groups/${id}/sessions/`).then(r => r.json())
  )
  const { execute: generateSession } = useApi((data) =>
    fetch(`/api/documents/document-groups/${id}/generate-session/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json())
  )
  const { execute: revokeSession } = useApi((sessionId) =>
    fetch(`/api/documents/document-groups/${id}/sessions/${sessionId}/revoke/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).then(r => r.json())
  )

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [groupData, sessionsData] = await Promise.all([
        getGroup(),
        listSessions()
      ])
      setGroup(groupData)
      setSessions(sessionsData.results || sessionsData)
    } catch (error) {
      addToast('Failed to load data', 'error')
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

  const handleGenerateSession = async () => {
    if (!formData.recipient.trim()) {
      addToast('Recipient name required', 'error')
      return
    }

    try {
      const session = await generateSession({
        recipient: formData.recipient,
        expires_in_days: parseInt(formData.expires_in_days)
      })
      setSessions([...sessions, session])
      setFormData({ recipient: '', expires_in_days: 7 })
      setShowCreateModal(false)
      addToast('Signing session created', 'success')
    } catch (error) {
      addToast('Failed to generate session', 'error')
    }
  }

  const handleRevokeSession = async (sessionId) => {
    if (!window.confirm('Revoke this signing session?')) return

    try {
      await revokeSession(sessionId)
      setSessions(sessions.filter(s => s.id !== sessionId))
      addToast('Session revoked', 'success')
    } catch (error) {
      addToast('Failed to revoke session', 'error')
    }
  }

  const handleCopyLink = (token) => {
    const url = `${window.location.origin}/group-sign/${token}`
    copyToClipboard(url)
    addToast('Link copied to clipboard', 'success')
  }

  const getSignLink = (token) => {
    return `${window.location.origin}/group-sign/${token}`
  }

  const getStatusBadge = (session) => {
    if (session.revoked) return 'bg-red-100 text-red-800'
    if (session.used) return 'bg-green-100 text-green-800'
    return 'bg-blue-100 text-blue-800'
  }

  const getStatusText = (session) => {
    if (session.revoked) return 'Revoked'
    if (session.used) return 'Used'
    return 'Active'
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (!group) return <div className="p-8 text-center">Group not found</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <a href={`/document-groups/${group.id}/edit`} className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Group
        </a>
        <h1 className="text-3xl font-bold">Generate Signing Links</h1>
        <p className="text-gray-600 mt-2">{group.name}</p>
      </div>

      <div className="bg-white rounded-lg border p-6 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Signing Sessions</h2>
          <Button onClick={() => setShowCreateModal(true)} variant="primary">
            New Session
          </Button>
        </div>

        {sessions.length === 0 ? (
          <p className="text-gray-500 py-8 text-center">No signing sessions yet</p>
        ) : (
          <div className="space-y-4">
            {sessions.map(session => (
              <div key={session.id} className="border rounded-lg p-4 hover:shadow transition">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <p className="font-semibold">{session.recipient || 'Anonymous'}</p>
                    <p className="text-sm text-gray-500 mb-2">
                      Created: {new Date(session.created_at).toLocaleDateString()} •
                      Progress: {session.current_index} / {session.current_item ? group.items.length : 0}
                    </p>
                    {session.expires_at && (
                      <p className="text-sm text-gray-500">
                        Expires: {new Date(session.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(session)}`}>
                    {getStatusText(session)}
                  </span>
                </div>

                <div className="bg-gray-50 rounded p-3 mb-3 break-all text-sm font-mono text-gray-700">
                  {getSignLink(session.token)}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyLink(session.token)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    Copy Link
                  </button>
                  <a
                    href={getSignLink(session.token)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm text-center"
                  >
                    Test
                  </a>
                  {!session.revoked && !session.used && (
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <Modal title="Create Signing Session" onClose={() => setShowCreateModal(false)}>
          <input
            type="text"
            placeholder="Recipient name"
            value={formData.recipient}
            onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
            className="w-full px-3 py-2 border rounded mb-4"
          />
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Expires in (days)</label>
            <input
              type="number"
              min="1"
              max="365"
              value={formData.expires_in_days}
              onChange={(e) => setFormData({ ...formData, expires_in_days: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerateSession} variant="primary" className="flex-1">
              Generate
            </Button>
            <Button
              onClick={() => setShowCreateModal(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {toasts.map(toast => (
        <Toast key={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  )
}