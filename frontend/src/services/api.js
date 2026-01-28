// frontend/src/services/api.js
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Template endpoints
export const templateAPI = {
  list: () => api.get('/templates/'),
  
  create: (formData) => {
    const data = new FormData()
    data.append('title', formData.title)
    data.append('file', formData.file)
    return api.post('/templates/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  
  get: (id) => api.get(`/templates/${id}/`),
  
  update: (id, data) => api.patch(`/templates/${id}/`, data),  // ← Add this
  
  getRecipients: (templateId) => api.get(`/templates/${templateId}/recipients/`),
  
  createField: (templateId, fieldData) =>
    api.post(`/templates/${templateId}/fields/`, fieldData),
  
  updateField: (templateId, fieldId, fieldData) =>
    api.patch(`/templates/${templateId}/fields/${fieldId}/`, fieldData),
  
  deleteField: (templateId, fieldId) =>
    api.delete(`/templates/${templateId}/fields/${fieldId}/`),
}

// Document endpoints
export const documentAPI = {
  list: () => api.get('/documents/'),
  
  create: (formData) => {
    const data = new FormData()
    data.append('title', formData.title)
    if (formData.description) {
      data.append('description', formData.description)
    }
    if (formData.template_id) {
      data.append('template_id', formData.template_id)
    }
    if (formData.file) {
      data.append('file', formData.file)
    }
    return api.post('/documents/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  
  get: (id) => api.get(`/documents/${id}/`),
  
  update: (id, data) => api.patch(`/documents/${id}/`, data),  // ← Add this
  
  // Document versions
  getVersions: (docId) => docId 
    ? api.get(`/documents/${docId}/versions/`)
    : api.get(`/documents/versions/`),  // ← This should hit the paginated endpoint
  
  getVersion: (docId, versionId) =>
    api.get(`/documents/${docId}/versions/${versionId}/`),
  
  copyVersion: (docId, versionId) =>
    api.post(`/documents/${docId}/versions/${versionId}/copy/`),
  
  lockVersion: (docId, versionId) =>
    api.post(`/documents/${docId}/versions/${versionId}/lock/`),
  
  getAvailableRecipients: (docId, versionId) =>
    api.get(`/documents/${docId}/versions/${versionId}/recipients/`),
  
  // Document fields
  createField: (docId, versionId, fieldData) =>
    api.post(`/documents/${docId}/versions/${versionId}/fields/`, fieldData),
  
  updateField: (docId, versionId, fieldId, fieldData) =>
    api.patch(
      `/documents/${docId}/versions/${versionId}/fields/${fieldId}/`,
      fieldData
    ),
  
  deleteField: (docId, versionId, fieldId) =>
    api.delete(`/documents/${docId}/versions/${versionId}/fields/${fieldId}/`),
  
  downloadVersion: (docId, versionId) =>
    api.get(`/documents/${docId}/versions/${versionId}/download/`, {
      responseType: 'blob'
    }),
  
  verifySignature: (docId, versionId, sigId) =>
    api.get(`/documents/${docId}/versions/${versionId}/signatures/${sigId}/verify/`),
  
  downloadAuditExport: (docId, versionId) =>
    api.get(`/documents/${docId}/versions/${versionId}/audit_export/`, {
      responseType: 'blob'
    }),
  
  webhooks: {
    list: () => api.get('/documents/webhooks/'),
    
    create: (data) => api.post('/documents/webhooks/', data),
    
    delete: (id) => api.delete(`/documents/webhooks/${id}/`),
    
    test: (id) => api.post(`/documents/webhooks/${id}/test/`),
    
    listEvents: (webhookId) => 
      api.get(`/documents/webhooks/${webhookId}/events/`),
    
    getEventLogs: (eventId) => 
      api.get(`/documents/webhook-events/${eventId}/logs/`),
  },
}


// Signing token endpoints
export const tokenAPI = {
  create: (docId, versionId, tokenData) =>
    api.post(`/documents/${docId}/versions/${versionId}/links/`, tokenData),
  
  listForDocument: (docId) => api.get(`/documents/${docId}/links/`),
  
  revoke: (token) =>
    api.post('/documents/links/revoke/', { token }),
}

// Group endpoints (Additive)
export const groupAPI = {
  list: () => api.get('/groups/'),
  
  create: (data) => api.post('/groups/', data),
  
  get: (id) => api.get(`/groups/${id}/`),
  
  // Items management
  addItem: (groupId, data) => 
    // data = { document_id: 1 } OR { template_id: 2 }
    api.post(`/groups/${groupId}/items/`, data),
    
  deleteItem: (groupId, itemId) =>
    api.delete(`/groups/${groupId}/items/${itemId}/`),
    
  reorderItems: (groupId, itemIds) =>
    // itemIds = [3, 1, 2]
    api.patch(`/groups/${groupId}/reorder/`, { item_ids: itemIds }),
    
  lockItem: (groupId, itemId) =>
    api.post(`/groups/${groupId}/items/${itemId}/lock/`),
    
  // Group actions
  lockGroup: (groupId) =>
    api.post(`/groups/${groupId}/lock/`),
    
  generateLinks: (groupId, recipients) =>
    // recipients = ["email@example.com", ...]
    api.post(`/groups/${groupId}/links/`, { recipients }),
    
  // Public Signing Flow
  getNextItem: (groupToken) =>
    api.get(`/groups/public/sign/${groupToken}/next/`, {
      headers: { 'Authorization': '' }, // No Auth
    }),
}

// Public signing endpoints (no auth)
export const publicAPI = {
  getSignPage: (token) =>
    api.get(`/documents/public/sign/${token}/`, {
      headers: { 'Authorization': '' },
    }),
  
  submitSignature: (token, signData) =>
    api.post(`/documents/public/sign/${token}/`, signData, {
      headers: { 'Authorization': '' },
    }),
  
  downloadPublicVersion: (token) =>
    api.get(`/documents/public/download/${token}/`, {
      headers: { 'Authorization': '' },
      responseType: 'blob'
    }),
}



export default api