import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
const api = axios.create({ baseURL: API_BASE_URL })

export const documentAPI = {
  list: () => api.get('/documents/').then((res) => res.data),
  
  create: (formData) => {
    const data = new FormData()
    data.append('title', formData.title)
    if (formData.description) data.append('description', formData.description)
    if (formData.template_id) data.append('template_id', formData.template_id)
    if (formData.file) data.append('file', formData.file)
    return api.post('/documents/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((res) => res.data)  // ✅ FIXED: Extract data from response
  },
  
  get: (id) => {
    // ✅ FIXED: Better error handling and response extraction
    return api.get(`/documents/${id}/`).then((res) => {
      console.log('✅ Document API response:', res.data)  // DEBUG
      return res.data
    }).catch((err) => {
      console.error(`❌ Failed to fetch document ${id}:`, err.response?.status, err.message)
      throw err
    })
  },
  
  update: (id, data) => api.patch(`/documents/${id}/`, data).then((res) => res.data),
  delete: (id) => api.delete(`/documents/${id}/`),
  duplicate: (id) => api.post(`/documents/${id}/duplicate/`).then((res) => res.data),
  lock: (id) => api.post(`/documents/${id}/lock/`).then((res) => res.data),
  getAvailableRecipients: (id) => api.get(`/documents/${id}/recipients/`).then((res) => res.data),
  download: (id) => api.get(`/documents/${id}/download/`, { responseType: 'blob' }).then((res) => res.data),
  createField: (docId, fieldData) => api.post(`/documents/${docId}/fields/`, fieldData).then((res) => res.data),
  updateField: (docId, fieldId, fieldData) => api.patch(`/documents/${docId}/fields/${fieldId}/`, fieldData).then((res) => res.data),
  deleteField: (docId, fieldId) => api.delete(`/documents/${docId}/fields/${fieldId}/`),
}