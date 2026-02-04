/**
 * ✅ UPDATED: New app structure with separated signing and webhooks apps
 * 
 * All API endpoints properly routed to their respective apps.
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
    if (formData.description) data.append('description', formData.description)
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

// ===== DOCUMENT ENDPOINTS (CRUD + fields only) =====
export const documentAPI = {
  list: () => api.get('/documents/'),
  
  create: (formData) => {
    const data = new FormData()
    data.append('title', formData.title)
    if (formData.description) data.append('description', formData.description)
    if (formData.template_id) data.append('template_id', formData.template_id)
    if (formData.file) data.append('file', formData.file)
    
    return api.post('/documents/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  
  get: (id) => api.get(`/documents/${id}/`),
  update: (id, data) => api.patch(`/documents/${id}/`, data),
  delete: (id) => api.delete(`/documents/${id}/`),
  
  // Document actions
  duplicate: (id) => api.post(`/documents/${id}/duplicate/`),
  lock: (id) => api.post(`/documents/${id}/lock/`),
  getAvailableRecipients: (id) => api.get(`/documents/${id}/recipients/`),
  download: (id) => api.get(`/documents/${id}/download/`, {
    responseType: 'blob'
  }),
  
  // Field management
  createField: (docId, fieldData) =>
    api.post(`/documents/${docId}/fields/`, fieldData),
  
  updateField: (docId, fieldId, fieldData) =>
    api.patch(`/documents/${docId}/fields/${fieldId}/`, fieldData),
  
  deleteField: (docId, fieldId) =>
    api.delete(`/documents/${docId}/fields/${fieldId}/`),
}

// ===== SIGNING TOKEN ENDPOINTS (NEW APP: signing) =====
export const tokenAPI = {
  create: (docId, tokenData) =>
    api.post(`/documents/${docId}/links/`, tokenData),
  
  listForDocument: (docId) =>
    api.get(`/documents/${docId}/links/`),
  
  revoke: (token) =>
    api.post('/links/revoke/', { token }),
}

// ===== PUBLIC SIGNING ENDPOINTS (NO AUTH REQUIRED) =====
export const publicAPI = {
  // Get signing page data
  getSignPage: (token) =>
    api.get(`/public/sign/${token}/`, {
      headers: { 'Authorization': '' },
    }),
  
  // Submit signature
  submitSignature: (token, signData) =>
    api.post(`/public/sign/${token}/`, signData, {
      headers: { 'Authorization': '' },
    }),
  
  // Download public document
  downloadPublicDocument: (token) =>
    api.get(`/public/download/${token}/`, {
      headers: { 'Authorization': '' },
      responseType: 'blob'
    }),
}

// ===== SIGNATURE VERIFICATION & AUDIT (NEW APP: signing) =====
export const signatureAPI = {
  listSignatures: (docId) =>
    api.get(`/documents/${docId}/signatures/`),
  
  verifySignature: (docId, sigId) =>
    api.get(`/documents/${docId}/signatures/${sigId}/verify/`),
  
  downloadAuditExport: (docId) =>
    api.get(`/documents/${docId}/audit_export/`, {
      responseType: 'blob'
    }),
}

// ===== WEBHOOK ENDPOINTS (NEW APP: webhooks) =====
export const webhookAPI = {
  list: () => api.get('/webhooks/'),
  
  create: (data) => api.post('/webhooks/', data),
  
  get: (id) => api.get(`/webhooks/${id}/`),
  
  update: (id, data) => api.patch(`/webhooks/${id}/`, data),
  
  delete: (id) => api.delete(`/webhooks/${id}/`),
  
  // Webhook actions
  test: (id) => api.post(`/webhooks/${id}/test/`),
  
  retry: (id, eventId) =>
    api.post(`/webhooks/${id}/retry/`, { event_id: eventId }),
  
  // Webhook events
  listEvents: (webhookId) =>
    api.get(`/webhooks/${webhookId}/events/`),
  
  listAllEvents: () =>
    api.get('/webhook-events/'),
  
  getEvent: (eventId) =>
    api.get(`/webhook-events/${eventId}/`),
  
  getEventLogs: (eventId) =>
    api.get(`/webhook-events/${eventId}/logs/`),
}

export default api