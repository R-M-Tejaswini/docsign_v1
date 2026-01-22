import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Toast } from '../components/ui/Toast'

export const TemplateGroupEdit = () => {
  const { id } = useParams()
  const [group, setGroup] = useState(null)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [toasts, setToasts] = useState([])
  const [draggedItem, setDraggedItem] = useState(null)

  const { execute: getGroup } = useApi(() =>
    fetch(`/api/templates/template-groups/${id}/`).then(r => r.json())
  )
  const { execute: getAllTemplates } = useApi(() =>
    fetch('/api/templates/').then(r => r.json())
  )
  const { execute: addTemplate } = useApi((data) =>
    fetch(`/api/templates/template-groups/${id}/add_template/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json())
  )
  const { execute: reorderItems } = useApi((data) =>
    fetch(`/api/templates/template-groups/${id}/reorder_items/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json())
  )
  const { execute: removeItem } = useApi((itemId) =>
    fetch(`/api/templates/template-groups/${id}/items/${itemId}/`, {
      method: 'DELETE'
    })
  )

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [groupData, templatesData] = await Promise.all([
        getGroup(),
        getAllTemplates()
      ])
      setGroup(groupData)
      setTemplates(templatesData.results || templatesData)
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

  const handleAddTemplate = async (templateId) => {
    try {
      const maxOrder = (group.items?.length || 0) + 1
      await addTemplate({ template_id: templateId, order: maxOrder })
      addToast('Template added', 'success')
      setShowAddModal(false)
      loadData()
    } catch (error) {
      addToast('Failed to add template', 'error')
    }
  }

  const handleRemoveItem = async (itemId) => {
    if (!window.confirm('Remove this template from group?')) return
    try {
      await removeItem(itemId)
      addToast('Template removed', 'success')
      loadData()
    } catch (error) {
      addToast('Failed to remove template', 'error')
    }
  }

  const handleDragStart = (e, item) => {
    setDraggedItem(item)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
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

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (!group) return <div className="p-8 text-center">Group not found</div>

  const availableTemplates = templates.filter(
    t => !group.items?.some(item => item.template.id === t.id)
  )

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <a href="/template-groups" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Groups
        </a>
        <h1 className="text-3xl font-bold">{group.name}</h1>
        {group.description && <p className="text-gray-600 mt-2">{group.description}</p>}
      </div>

      <div className="bg-white rounded-lg border p-6 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Templates in Group</h2>
          <Button onClick={() => setShowAddModal(true)} variant="primary">
            Add Template
          </Button>
        </div>

        {group.items && group.items.length > 0 ? (
          <div className="space-y-2">
            {group.items.map((item, idx) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, item)}
                className="flex items-center gap-4 p-4 bg-gray-50 rounded border cursor-move hover:bg-gray-100 transition"
              >
                <span className="text-gray-500 font-semibold min-w-8">{idx + 1}.</span>
                <div className="flex-1">
                  <p className="font-medium">{item.template.name}</p>
                  <p className="text-sm text-gray-500">
                    {item.template.page_count} pages
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="px-3 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 py-8 text-center">No templates in group yet</p>
        )}
      </div>

      {showAddModal && (
        <Modal title="Add Template" onClose={() => setShowAddModal(false)}>
          {availableTemplates.length === 0 ? (
            <p className="text-gray-600">No templates available</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {availableTemplates.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleAddTemplate(template.id)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 rounded border hover:border-blue-300 transition"
                >
                  <p className="font-medium">{template.name}</p>
                  <p className="text-sm text-gray-500">{template.page_count} pages</p>
                </button>
              ))}
            </div>
          )}
          <Button
            onClick={() => setShowAddModal(false)}
            variant="secondary"
            className="w-full mt-4"
          >
            Close
          </Button>
        </Modal>
      )}

      {toasts.map(toast => (
        <Toast key={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  )
}