// frontend/src/pages/GroupEdit.jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useApi } from '../hooks/useApi'
import { groupAPI, templateAPI, documentAPI } from '../services/api'
import { Toast } from '../components/ui/Toast'
// ✅ Import the new modal
import { GroupGenerateLinkModal } from '../components/links/GroupGenerateLinkModal'

export const GroupEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  
  const [group, setGroup] = useState(null)
  const [items, setItems] = useState([])
  const [toasts, setToasts] = useState([])
  
  // Modal States
  const [showAddModal, setShowAddModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false) // ✅ Link Modal State
  
  const [addMode, setAddMode] = useState('template')
  const [availableTemplates, setAvailableTemplates] = useState([])
  const [availableDocuments, setAvailableDocuments] = useState([])
  const [selectedAddId, setSelectedAddId] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  // API Hooks
  const { execute: getGroup } = useApi(() => groupAPI.get(id))
  const { execute: addItem } = useApi((data) => groupAPI.addItem(id, data))
  const { execute: deleteItem } = useApi((itemId) => groupAPI.deleteItem(id, itemId))
  const { execute: reorderItems } = useApi((itemIds) => groupAPI.reorderItems(id, itemIds))
  const { execute: lockItem } = useApi((itemId) => groupAPI.lockItem(id, itemId))
  const { execute: lockGroup } = useApi(() => groupAPI.lockGroup(id))

  // Load Data
  useEffect(() => {
    loadGroupData()
    loadAddOptions()
  }, [id])

  const loadGroupData = async () => {
    try {
      const response = await getGroup()
      const data = response.data || response
      setGroup(data)
      setItems((data.items || []).sort((a, b) => a.order - b.order))
    } catch (err) {
      addToast('Failed to load group', 'error')
    }
  }

  const loadAddOptions = async () => {
    try {
      const tRes = await templateAPI.list()
      const tData = tRes.data?.results || tRes.data || []
      setAvailableTemplates(tData)
      
      const dRes = await documentAPI.list()
      const dData = dRes.data?.results || dRes.data || []
      setAvailableDocuments(dData)
    } catch (err) {
      console.error(err)
    }
  }

  const addToast = (msg, type = 'info') => {
    const tid = Date.now()
    setToasts(prev => [...prev, { id: tid, message: msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== tid)), 3000)
  }

  // --- Handlers ---

  const handleAddItem = async () => {
    if (!selectedAddId) return
    setIsAdding(true)
    try {
      const payload = addMode === 'template' 
        ? { template_id: parseInt(selectedAddId) }
        : { document_id: parseInt(selectedAddId) }
      
      await addItem(payload)
      await loadGroupData()
      setShowAddModal(false)
      setSelectedAddId('')
      addToast('Item added successfully', 'success')
    } catch (err) {
      addToast('Failed to add item', 'error')
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Remove this document from the group?')) return
    try {
      await deleteItem(itemId)
      setItems(items.filter(i => i.id !== itemId))
      addToast('Item removed', 'success')
    } catch (err) {
      addToast('Failed to remove item', 'error')
    }
  }

  const handleDragEnd = async (result) => {
    if (!result.destination || group.is_locked) return

    const newItems = Array.from(items)
    const [reorderedItem] = newItems.splice(result.source.index, 1)
    newItems.splice(result.destination.index, 0, reorderedItem)

    setItems(newItems)

    const itemIds = newItems.map(i => i.id)
    try {
      await reorderItems(itemIds)
    } catch (err) {
      addToast('Failed to save order', 'error')
      loadGroupData()
    }
  }

  const handleLockItem = async (itemId) => {
    try {
      await lockItem(itemId)
      addToast('Document locked', 'success')
      loadGroupData()
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to lock document', 'error')
    }
  }

  const handleLockGroup = async () => {
    if (!window.confirm('Lock the entire group? No more items can be added or reordered.')) return
    try {
      await lockGroup()
      addToast('Group locked successfully', 'success')
      loadGroupData()
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to lock group', 'error')
    }
  }

  const handleEditItem = (item) => {
    // Navigate with group context
    navigate(`/documents/${item.document}?groupId=${group.id}`)
  }

  // --- Render ---

  if (!group) return <div className="p-8 text-center">Loading Group...</div>

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => {}} />
        ))}
      </div>

      <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full p-6">
        
        {/* Header */}
        <div className="flex justify-between items-end mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-gray-900">{group.title}</h1>
              {group.is_locked && <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded font-bold">LOCKED</span>}
            </div>
            <p className="text-gray-500">{group.description}</p>
          </div>
          <div className="flex gap-2">
            {!group.is_locked ? (
              <>
                <Button onClick={() => setShowAddModal(true)} variant="secondary">
                  ➕ Add Document
                </Button>
                <Button onClick={handleLockGroup} variant="warning" 
                  disabled={items.some(i => !i.is_locked)}>
                  🔒 Lock Group
                </Button>
              </>
            ) : (
              // ✅ Updated Button to trigger modal
              <Button onClick={() => setShowLinkModal(true)} variant="primary">
                🔗 Generate Signing Links
              </Button>
            )}
          </div>
        </div>

        {/* Drag Drop List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col">
          <div className="p-4 bg-gray-50 border-b border-gray-200 font-semibold text-gray-700 flex justify-between">
            <span>Signing Sequence ({items.length})</span>
            <span className="text-xs font-normal text-gray-500">
              {group.is_locked ? "Order is locked" : "Drag to reorder"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="group-items">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                    {items.map((item, index) => (
                      <Draggable 
                        key={item.id} 
                        draggableId={String(item.id)} 
                        index={index}
                        isDragDisabled={group.is_locked}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`
                              flex items-center gap-4 p-4 rounded-lg border-2 transition-all
                              ${snapshot.isDragging ? 'bg-blue-50 border-blue-300 shadow-lg' : 'bg-white border-gray-100 hover:border-blue-200'}
                            `}
                          >
                            <div {...provided.dragHandleProps} className={`text-gray-400 cursor-grab ${group.is_locked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                              ⋮⋮
                            </div>

                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                              {index + 1}
                            </div>

                            <div className="flex-1">
                              <h4 className="font-bold text-gray-900">{item.document_title}</h4>
                              <div className="flex items-center gap-2 text-xs mt-1">
                                <span className={`px-2 py-0.5 rounded-full ${item.is_locked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {item.is_locked ? 'Ready' : 'Draft'}
                                </span>
                                <span className="text-gray-400">Version {item.version_number}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {!item.is_locked && !group.is_locked && (
                                <Button size="sm" variant="secondary" onClick={() => handleLockItem(item.id)}>
                                  Lock
                                </Button>
                              )}
                              
                              <Button size="sm" variant="primary" onClick={() => handleEditItem(item)}>
                                {item.is_locked ? 'View' : 'Edit'}
                              </Button>

                              {!group.is_locked && (
                                <button 
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            
            {items.length === 0 && (
              <div className="text-center py-20 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                No documents in this group yet. Add one to start.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Item Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Document to Group">
        <div className="space-y-4">
          <div className="flex gap-4 border-b border-gray-200 mb-4">
            <button 
              className={`pb-2 px-1 ${addMode === 'template' ? 'border-b-2 border-blue-500 font-bold text-blue-600' : 'text-gray-500'}`}
              onClick={() => { setAddMode('template'); setSelectedAddId(''); }}
            >
              From Template
            </button>
            <button 
              className={`pb-2 px-1 ${addMode === 'existing' ? 'border-b-2 border-blue-500 font-bold text-blue-600' : 'text-gray-500'}`}
              onClick={() => { setAddMode('existing'); setSelectedAddId(''); }}
            >
              Existing Document
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2">
            {(addMode === 'template' ? availableTemplates : availableDocuments).map(opt => (
              <label key={opt.id} className={`flex items-center p-3 rounded-lg border cursor-pointer hover:bg-blue-50 ${selectedAddId == opt.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200'}`}>
                <input type="radio" name="add_item" value={opt.id} checked={selectedAddId == opt.id} onChange={(e) => setSelectedAddId(e.target.value)} className="mr-3" />
                <div>
                  <div className="font-semibold">{opt.title}</div>
                  <div className="text-xs text-gray-500">ID: {opt.id} • {new Date(opt.created_at).toLocaleDateString()}</div>
                </div>
              </label>
            ))}
            {((addMode === 'template' ? availableTemplates : availableDocuments).length === 0) && (
              <div className="text-gray-500 text-center py-4">No items found.</div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddItem} disabled={!selectedAddId || isAdding}>
              {isAdding ? 'Adding...' : 'Add to Group'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ✅ New Link Generation Modal */}
      {group && (
        <GroupGenerateLinkModal 
          isOpen={showLinkModal} 
          onClose={() => setShowLinkModal(false)} 
          group={group} 
        />
      )}
    </div>
  )
}