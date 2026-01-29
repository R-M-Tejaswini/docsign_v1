/**
 * ✅ UPDATED: Removed version_id parameters from all calls
 * All other functionality remains identical
 */

import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ===== TEMPLATE ENDPOINTS =====
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
  
  update: (id, data) => api.patch(`/templates/${id}/`, data),
  
  delete: (id) => api.delete(`/templates/${id}/`),
  
  getRecipients: (templateId) => api.get(`/templates/${templateId}/recipients/`),
  
  createField: (templateId, fieldData) =>
    api.post(`/templates/${templateId}/fields/`, fieldData),
  
  updateField: (templateId, fieldId, fieldData) =>
    api.patch(`/templates/${templateId}/fields/${fieldId}/`, fieldData),
  
  deleteField: (templateId, fieldId) =>
    api.delete(`/templates/${templateId}/fields/${fieldId}/`),
}

// ===== DOCUMENT ENDPOINTS (✅ UPDATED: NO version_id) =====
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
  
  update: (id, data) => api.patch(`/documents/${id}/`, data),
  
  delete: (id) => api.delete(`/documents/${id}/`),
  
  // ✅ UPDATED: Duplicate document (replaces copyVersion)
  duplicate: (id) => api.post(`/documents/${id}/duplicate/`),
  
  lock: (id) => api.post(`/documents/${id}/lock/`),
  
  getAvailableRecipients: (id) => api.get(`/documents/${id}/recipients/`),
  
  createField: (docId, fieldData) =>
    api.post(`/documents/${docId}/fields/`, fieldData),
  
  updateField: (docId, fieldId, fieldData) =>
    api.patch(`/documents/${docId}/fields/${fieldId}/`, fieldData),
  
  deleteField: (docId, fieldId) =>
    api.delete(`/documents/${docId}/fields/${fieldId}/`),
  
  download: (id) =>
    api.get(`/documents/${id}/download/`, {
      responseType: 'blob'
    }),
  
  getSignatures: (id) =>
    api.get(`/documents/${id}/signatures/`),
  
  verifySignature: (docId, sigId) =>
    api.get(`/documents/${docId}/signatures/${sigId}/verify/`),
  
  downloadAuditExport: (id) =>
    api.get(`/documents/${id}/audit_export/`, {
      responseType: 'blob'
    }),
}

// ===== SIGNING TOKEN ENDPOINTS (✅ UPDATED: NO version_id) =====
export const tokenAPI = {
  // ✅ UPDATED: docId only (no version_id)
  create: (docId, tokenData) =>
    api.post(`/documents/${docId}/links/`, tokenData),
  
  listForDocument: (docId) => api.get(`/documents/${docId}/links/`),
  
  revoke: (token) =>
    api.post('/documents/links/revoke/', { token }),
}

// ===== PUBLIC SIGNING ENDPOINTS (NO AUTH) =====
export const publicAPI = {
  getSignPage: (token) =>
    api.get(`/documents/public/sign/${token}/`, {
      headers: { 'Authorization': '' },
    }),
  
  submitSignature: (token, signData) =>
    api.post(`/documents/public/sign/${token}/`, signData, {
      headers: { 'Authorization': '' },
    }),
  
  downloadPublicDocument: (token) =>
    api.get(`/documents/public/download/${token}/`, {
      headers: { 'Authorization': '' },
      responseType: 'blob'
    }),
}

// ===== WEBHOOK ENDPOINTS =====
export const webhookAPI = {
  list: () => api.get('/documents/webhooks/'),
  
  create: (data) => api.post('/documents/webhooks/', data),
  
  get: (id) => api.get(`/documents/webhooks/${id}/`),
  
  update: (id, data) => api.patch(`/documents/webhooks/${id}/`, data),
  
  delete: (id) => api.delete(`/documents/webhooks/${id}/`),
  
  test: (id) => api.post(`/documents/webhooks/${id}/test/`),
  
  listEvents: (webhookId) => 
    api.get(`/documents/webhooks/${webhookId}/events/`),
  
  getEventLogs: (eventId) => 
    api.get(`/documents/webhook-events/${eventId}/logs/`),
}

export default api