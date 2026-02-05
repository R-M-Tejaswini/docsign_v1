import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
const api = axios.create({ baseURL: API_BASE_URL })

export const templateAPI = {
  list: () => api.get('/templates/').then((res) => res.data),
  
  create: (formData) => {
    // ✅ FormData should already have title, description, file from frontend
    return api.post('/templates/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data)
  },
  
  get: (id) => api.get(`/templates/${id}/`).then((res) => res.data),
  update: (id, data) => api.patch(`/templates/${id}/`, data).then((res) => res.data),
  delete: (id) => api.delete(`/templates/${id}/`),
  getRecipients: (id) => api.get(`/templates/${id}/recipients/`).then((res) => res.data),
  createField: (templateId, fieldData) => 
    api.post(`/templates/${templateId}/fields/`, fieldData).then((res) => res.data),
  updateField: (templateId, fieldId, fieldData) => 
    api.patch(`/templates/${templateId}/fields/${fieldId}/`, fieldData).then((res) => res.data),
  deleteField: (templateId, fieldId) => 
    api.delete(`/templates/${templateId}/fields/${fieldId}/`),
}