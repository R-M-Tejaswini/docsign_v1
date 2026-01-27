// frontend/src/pages/GroupList.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useApi } from '../hooks/useApi'
import { groupAPI } from '../services/api'

export const GroupList = () => {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')

  const { execute: listGroups, loading } = useApi(() => groupAPI.list())
  const { execute: createGroup } = useApi((data) => groupAPI.create(data))

  useEffect(() => {
    loadGroups()
  }, [])

const loadGroups = async () => {
    try {
      const response = await listGroups()
      console.log("Group List Response:", response) // 👈 Add this for debugging

      // Robust check for data location
      let data = []
      if (Array.isArray(response)) {
          data = response
      } else if (response.data && Array.isArray(response.data)) {
          data = response.data
      } else if (response.data?.results && Array.isArray(response.data.results)) {
          data = response.data.results
      } else if (response.results && Array.isArray(response.results)) {
          data = response.results
      }
      
      setGroups(data)
    } catch (err) {
      console.error('Failed to load groups:', err)
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupTitle.trim()) {
      alert('Please enter a group title')
      return
    }

    try {
      // 1. Send create request
      const response = await createGroup({
        title: newGroupTitle,
        description: newGroupDesc
      })
      
      // 2. CRITICAL FIX: Access .data.id (Axios response structure)
      const newGroupId = response.data?.id || response.id
      
      if (newGroupId) {
        setShowCreateModal(false)
        navigate(`/groups/${newGroupId}`)
      } else {
        console.error('No ID returned:', response)
        alert('Group created but ID missing')
      }
    } catch (err) {
      console.error(err)
      alert('Failed to create group')
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Document Groups</h1>
          <p className="text-lg text-gray-600">Combine documents into sequential signing packages</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} variant="primary" size="lg">
          <span>➕</span> Create Group
        </Button>
      </div>

      {/* Empty State */}
      {groups.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-lg border border-gray-100">
          <div className="text-7xl mb-6">🗂️</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">No groups yet</h2>
          <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
            Create a group to send multiple documents in a specific order.
          </p>
          <Button onClick={() => setShowCreateModal(true)} variant="primary" size="lg">
            Create First Group
          </Button>
        </div>
      ) : (
        /* Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <div 
              key={group.id}
              onClick={() => navigate(`/groups/${group.id}`)}
              className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-100 group overflow-hidden"
            >
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 h-32 flex items-center justify-center">
                <div className="text-5xl group-hover:scale-110 transition-transform">🗂️</div>
              </div>
              
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-bold text-gray-900 line-clamp-1">{group.title}</h3>
                  {group.is_locked ? (
                    <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1">
                      🔒 Locked
                    </span>
                  ) : (
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-bold">
                      Draft
                    </span>
                  )}
                </div>
                
                <p className="text-gray-500 text-sm mb-4 line-clamp-2 min-h-[2.5rem]">
                  {group.description || 'No description provided'}
                </p>
                
                <div className="flex justify-between items-center text-xs text-gray-400 border-t pt-4">
                  <span>{group.items?.length || 0} Documents</span>
                  <span>{formatDate(group.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Document Group"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Group Title</label>
            <input
              type="text"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Employee Onboarding Package"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Description (Optional)</label>
            <textarea
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              rows={3}
              placeholder="Brief description of this group..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateGroup}>Create Group</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}