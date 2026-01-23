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

// Group endpoints
export const groupAPI = {
  list: () => api.get('/documents/groups/'),
  create: (data) => api.post('/documents/groups/', data),
  retrieve: (id) => api.get(`/documents/groups/${id}/`),  // ← ADD THIS
  get: (id) => api.get(`/documents/groups/${id}/`),  // ← ADD THIS (alias)
  update: (id, data) => api.patch(`/documents/groups/${id}/`, data),
  delete: (id) => api.delete(`/documents/groups/${id}/`),
  
  // Items
  listItems: (groupId) => api.get(`/documents/groups/${groupId}/items/`),
  addItem: (groupId, data) => api.post(`/documents/groups/${groupId}/items/`, data),
  deleteItem: (groupId, itemId) => api.delete(`/documents/groups/${groupId}/items/${itemId}/`),
  reorderItem: (groupId, itemId, data) => api.patch(`/documents/groups/${groupId}/items/${itemId}/reorder/`, data),
  
  // Sessions
  listSessions: (groupId) => api.get(`/documents/groups/${groupId}/sessions/`),  // ← ADD THIS
  getSessions: (groupId) => api.get(`/documents/groups/${groupId}/sessions/`),  // ← ADD THIS (alias)
  createSession: (groupId, data) => api.post(`/documents/groups/${groupId}/sessions/`, data),
  getSession: (groupId, sessionId) => api.get(`/documents/groups/${groupId}/sessions/${sessionId}/`),
  revokeSession: (groupId, sessionId) => api.post(`/documents/groups/${groupId}/sessions/${sessionId}/revoke/`),
  
  // Download
  downloadGroup: (groupId) => api.get(`/documents/groups/${groupId}/download/`, { responseType: 'blob' }),
}

export default api