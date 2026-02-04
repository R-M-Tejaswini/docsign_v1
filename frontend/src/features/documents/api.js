import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
const api = axios.create({ baseURL: API_BASE_URL })

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
  duplicate: (id) => api.post(`/documents/${id}/duplicate/`),
  lock: (id) => api.post(`/documents/${id}/lock/`),
  getAvailableRecipients: (id) => api.get(`/documents/${id}/recipients/`),
  download: (id) => api.get(`/documents/${id}/download/`, { responseType: 'blob' }),
  createField: (docId, fieldData) => api.post(`/documents/${docId}/fields/`, fieldData),
  updateField: (docId, fieldId, fieldData) => api.patch(`/documents/${docId}/fields/${fieldId}/`, fieldData),
  deleteField: (docId, fieldId) => api.delete(`/documents/${docId}/fields/${fieldId}/`),
}