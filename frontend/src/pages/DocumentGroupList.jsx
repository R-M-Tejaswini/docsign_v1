import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Toast } from '../components/ui/Toast'

export const DocumentGroupList = () => {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [toasts, setToasts] = useState([])
  const [formData, setFormData] = useState({ name: '', description: '', source: 'uploads' })

  const { execute: listGroups } = useApi(() =>
    fetch('/api/documents/document-groups/').then(r => r.json())
  )
  const { execute: deleteGroup } = useApi((id) =>
    fetch(`/api/documents/document-groups/${id}/`, { method: 'DELETE' })
  )

  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const data = await listGroups()
      setGroups(data.results || data)
    } catch (error) {
      addToast('Failed to load document groups', 'error')
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

  const handleDeleteGroup = async (id) => {
    if (!window.confirm('Delete this document group?')) return
    try {
      await deleteGroup(id)
      addToast('Document group deleted', 'success')
      loadGroups()
    } catch (error) {
      addToast('Failed to delete group', 'error')
    }
  }

  const getStatusBadgeClass = (status) => {
    const classes = {
      draft: 'bg-yellow-100 text-yellow-800',
      locked: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800'
    }
    return classes[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Document Groups</h1>
        <a
          href="/document-groups/create"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          New Group
        </a>
      </div>

      {groups.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-12 text-center">
          <p className="text-gray-600 mb-4">No document groups yet</p>
          <a
            href="/document-groups/create"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Create First Group
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map(group => (
            <div key={group.id} className="border rounded-lg p-6 hover:shadow-lg transition">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-semibold">{group.name}</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeClass(group.status)}`}>
                  {group.status}
                </span>
              </div>
              {group.description && (
                <p className="text-gray-600 mb-4">{group.description}</p>
              )}
              <p className="text-sm text-gray-500 mb-4">
                {group.items?.length || 0} documents
              </p>
              <div className="flex gap-2">
                <a
                  href={`/document-groups/${group.id}/edit`}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-center"
                >
                  Edit
                </a>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toasts.map(toast => (
        <Toast key={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  )
}