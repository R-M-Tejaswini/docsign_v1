import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Toast } from '../components/ui/Toast'

export const TemplateGroupList = () => {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [toasts, setToasts] = useState([])
  const [formData, setFormData] = useState({ name: '', description: '' })

  const { execute: listGroups } = useApi(() => 
    fetch('/api/templates/template-groups/').then(r => r.json())
  )
  const { execute: createGroup } = useApi((data) =>
    fetch('/api/templates/template-groups/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json())
  )
  const { execute: deleteGroup } = useApi((id) =>
    fetch(`/api/templates/template-groups/${id}/`, { method: 'DELETE' })
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
      addToast('Failed to load template groups', 'error')
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

  const handleCreateGroup = async () => {
    if (!formData.name.trim()) {
      addToast('Group name required', 'error')
      return
    }

    try {
      await createGroup(formData)
      setFormData({ name: '', description: '' })
      setShowCreateModal(false)
      addToast('Template group created', 'success')
      loadGroups()
    } catch (error) {
      addToast('Failed to create group', 'error')
    }
  }

  const handleDeleteGroup = async (id) => {
    if (!window.confirm('Delete this template group?')) return

    try {
      await deleteGroup(id)
      addToast('Template group deleted', 'success')
      loadGroups()
    } catch (error) {
      addToast('Failed to delete group', 'error')
    }
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Template Groups</h1>
        <Button onClick={() => setShowCreateModal(true)} variant="primary">
          New Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-12 text-center">
          <p className="text-gray-600 mb-4">No template groups yet</p>
          <Button onClick={() => setShowCreateModal(true)} variant="primary">
            Create First Group
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map(group => (
            <div key={group.id} className="border rounded-lg p-6 hover:shadow-lg transition">
              <h2 className="text-xl font-semibold mb-2">{group.name}</h2>
              {group.description && (
                <p className="text-gray-600 mb-4">{group.description}</p>
              )}
              <p className="text-sm text-gray-500 mb-4">
                {group.items?.length || 0} templates
              </p>
              <div className="flex gap-2">
                <a
                  href={`/template-groups/${group.id}/edit`}
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

      {showCreateModal && (
        <Modal title="Create Template Group" onClose={() => setShowCreateModal(false)}>
          <input
            type="text"
            placeholder="Group name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded mb-4"
          />
          <textarea
            placeholder="Description (optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border rounded mb-4 h-24"
          />
          <div className="flex gap-2">
            <Button onClick={handleCreateGroup} variant="primary" className="flex-1">
              Create
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