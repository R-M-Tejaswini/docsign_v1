import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
const api = axios.create({ baseURL: API_BASE_URL })

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
  createField: (templateId, fieldData) => api.post(`/templates/${templateId}/fields/`, fieldData),
  updateField: (templateId, fieldId, fieldData) =>
    api.patch(`/templates/${templateId}/fields/${fieldId}/`, fieldData),
  deleteField: (templateId, fieldId) => api.delete(`/templates/${templateId}/fields/${fieldId}/`),
}