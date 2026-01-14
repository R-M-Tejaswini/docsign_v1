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
  
  // Document versions
  getVersions: (docId) => api.get(`/documents/${docId}/versions/`),
  
  getVersion: (docId, versionId) =>
    api.get(`/documents/${docId}/versions/${versionId}/`),
  
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
}

export default api