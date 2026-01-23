import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useApi } from '../hooks/useApi'
import { groupAPI } from '../services/api'
import { Toast } from '../components/ui/Toast'

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export const GroupsList = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [groups, setGroups] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [toasts, setToasts] = useState([])
  
  const { execute: listGroups, loading } = useApi(() => groupAPI.list())
  const { execute: createGroup } = useApi((data) => groupAPI.create(data))
  const { execute: deleteGroup } = useApi((id) => groupAPI.delete(id))
  
  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts([...toasts, { id, message, type, duration: 3000 }])
    setTimeout(() => setToasts(toasts.filter((t) => t.id !== id)), 3000)
  }
  
  useEffect(() => {
    loadGroups()
  }, [location])
  
const loadGroups = async () => {
  try {
    console.log('Fetching from:', '/api/groups/')  // ← Debug log
    const response = await listGroups()
    console.log('Response:', response)  // ← Debug log
    
    const data = response.data || response
    
    let groupsArray = []
    if (Array.isArray(data)) {
      groupsArray = data
    } else if (data?.results && Array.isArray(data.results)) {
      groupsArray = data.results
    }
    setGroups(groupsArray)
  } catch (err) {
    console.error('Failed to load groups:', err.response)  // ← Better error logging
    console.error('Status:', err.response?.status)  // ← See the exact status
    console.error('Detail:', err.response?.data)  // ← See backend error message
    addToast('Failed to load groups', 'error')
    setGroups([])
  }
}
  
  const handleCreateGroup = async () => {
    if (!newGroupTitle.trim()) {
      addToast('Please enter a group title', 'error')
      return
    }
    
    try {
      const newGroup = await createGroup({
        title: newGroupTitle,
        description: newGroupDescription,
      })
      setShowCreateModal(false)
      setNewGroupTitle('')
      setNewGroupDescription('')
      addToast('Group created successfully', 'success')
      await loadGroups()
      navigate(`/groups/${newGroup.id}`)
    } catch (err) {
      addToast('Failed to create group: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }
  
  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this group?')) {
      return
    }
    
    try {
      await deleteGroup(groupId)
      addToast('Group deleted successfully', 'success')
      await loadGroups()
    } catch (err) {
      addToast('Failed to delete group: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }
  
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading groups...</p>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Document Groups</h1>
          <p className="text-lg text-gray-600">Create sequences of documents for organized signing</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          variant="primary"
          size="lg"
        >
          <span>➕</span>
          New Group
        </Button>
      </div>
      
      {/* Empty State */}
      {groups.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-blue-100 mb-6">
            <span className="text-5xl">📑</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">No groups yet</h3>
          <p className="text-gray-600 mb-6">Create your first document group to get started</p>
          <Button onClick={() => setShowCreateModal(true)} variant="primary">
            <span>➕</span>
            Create Your First Group
          </Button>
        </div>
      )}
      
      {/* Groups Grid */}
      {groups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <div
              key={group.id}
              className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-6 border border-gray-100 hover:border-indigo-200 cursor-pointer"
              onClick={() => navigate(`/groups/${group.id}`)}
            >
              {/* Icon */}
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 mb-4 text-4xl group-hover:scale-110 transition-transform">
                📑
              </div>
              
              {/* Title */}
              <h3 className="text-xl font-bold text-gray-900 line-clamp-2 group-hover:text-indigo-600 transition-colors mb-2">
                {group.title}
              </h3>
              
              {/* Description */}
              {group.description && (
                <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                  {group.description}
                </p>
              )}
              
              {/* Stats */}
              <div className="space-y-2 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Documents</span>
                  <span className="font-bold text-gray-900">{group.item_count}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Recipients</span>
                  <span className="font-bold text-gray-900">{group.recipients?.length || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Active Sessions</span>
                  <span className="font-bold text-indigo-600">{group.active_sessions}</span>
                </div>
              </div>
              
              {/* Created Date */}
              <div className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
                Created {formatDate(group.created_at)}
              </div>
              
              {/* Actions */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/groups/${group.id}`)
                  }}
                  variant="primary"
                  size="sm"
                  className="flex-1"
                >
                  <span>→</span>
                  Open
                </Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteGroup(group.id)
                  }}
                  variant="danger"
                  size="sm"
                  className="flex-1"
                >
                  <span>🗑️</span>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Create Group Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Document Group"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Group Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              placeholder="e.g., Annual Contract Review"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Description
            </label>
            <textarea
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              placeholder="Optional description..."
              rows="3"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-base"
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button onClick={handleCreateGroup} variant="primary" className="flex-1">
              <span>✓</span>
              Create Group
            </Button>
            <Button onClick={() => setShowCreateModal(false)} variant="secondary" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
      
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