import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { Button } from '../components/ui/Button'
import { Toast } from '../components/ui/Toast'
import { GroupAuditPanel } from '../components/audit/GroupAuditPanel'

export const DocumentGroupEdit = () => {
  const { id } = useParams()
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState([])
  const [draggedItem, setDraggedItem] = useState(null)

  const { execute: getGroup } = useApi(() =>
    fetch(`/api/documents/document-groups/${id}/`).then(r => r.json())
  )
  const { execute: reorderItems } = useApi((data) =>
    fetch(`/api/documents/document-groups/${id}/reorder_items/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json())
  )
  const { execute: lockGroup } = useApi(() =>
    fetch(`/api/documents/document-groups/${id}/lock/`, {
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
      const groupData = await getGroup()
      setGroup(groupData)
    } catch (error) {
      addToast('Failed to load group', 'error')
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

  const handleDragStart = (e, item) => {
    setDraggedItem(item)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDrop = async (e, targetItem) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.id === targetItem.id) {
      setDraggedItem(null)
      return
    }

    const items = group.items.map(item => ({
      id: item.id,
      order: item.order
    }))

    const draggedIdx = items.findIndex(i => i.id === draggedItem.id)
    const targetIdx = items.findIndex(i => i.id === targetItem.id)

    const reordered = [...items]
    const [movedItem] = reordered.splice(draggedIdx, 1)
    reordered.splice(targetIdx, 0, movedItem)

    reordered.forEach((item, idx) => {
      item.order = idx + 1
    })

    try {
      await reorderItems({ items: reordered })
      addToast('Order updated', 'success')
      loadData()
    } catch (error) {
      addToast('Failed to reorder', 'error')
    }

    setDraggedItem(null)
  }

  const handleLockGroup = async () => {
    if (!window.confirm('Lock this group? Documents will be ready for signing.')) return

    try {
      const updatedGroup = await lockGroup()
      setGroup(updatedGroup)
      addToast('Group locked successfully', 'success')
    } catch (error) {
      addToast('Failed to lock group', 'error')
    }
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (!group) return <div className="p-8 text-center">Group not found</div>

  const canLock = group.status === 'draft'
  const canReorder = group.status === 'draft'

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <a href="/document-groups" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Groups
        </a>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{group.name}</h1>
            {group.description && <p className="text-gray-600 mt-2">{group.description}</p>}
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            group.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
            group.status === 'locked' ? 'bg-blue-100 text-blue-800' :
            'bg-green-100 text-green-800'
          }`}>
            {group.status}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-6 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Documents in Group</h2>
          {canLock && (
            <Button onClick={handleLockGroup} variant="primary">
              Lock Group
            </Button>
          )}
          {!canLock && (
            <a
              href={`/document-groups/${group.id}/sign-links`}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Generate Sign Links
            </a>
          )}
        </div>

        {group.items && group.items.length > 0 ? (
          <div className="space-y-2">
            {group.items.map((item, idx) => (
              <div
                key={item.id}
                draggable={canReorder}
                onDragStart={(e) => handleDragStart(e, item)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, item)}
                className={`flex items-center gap-4 p-4 bg-gray-50 rounded border ${
                  canReorder ? 'cursor-move hover:bg-gray-100' : ''
                } transition`}
              >
                <span className="text-gray-500 font-semibold min-w-8">{idx + 1}.</span>
                <div className="flex-1">
                  <p className="font-medium">{item.document_name}</p>
                  <p className="text-sm text-gray-500">
                    Version {item.version_number} • {item.version_status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 py-8 text-center">No documents in group</p>
        )}
      </div>

      {(group.status === 'locked' || group.status === 'completed') && (
        <div className="mt-8">
          <GroupAuditPanel groupId={group.id} />
        </div>
      )}

      {toasts.map(toast => (
        <Toast key={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  )
}