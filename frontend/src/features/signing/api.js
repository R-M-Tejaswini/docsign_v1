import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
const api = axios.create({ baseURL: API_BASE_URL })

export const tokenAPI = {
  create: (docId, tokenData) => api.post(`/documents/${docId}/links/`, tokenData),
  listForDocument: (docId) => api.get(`/documents/${docId}/links/`),
  revoke: (token) => api.post('/links/revoke/', { token }),
}

export const publicAPI = {
  getSignPage: (token) =>
    api.get(`/public/sign/${token}/`, {
      headers: { 'Authorization': '' },
    }),
  submitSignature: (token, signData) =>
    api.post(`/public/sign/${token}/`, signData, {
      headers: { 'Authorization': '' },
    }),
  downloadPublicDocument: (token) =>
    api.get(`/public/download/${token}/`, {
      headers: { 'Authorization': '' },
      responseType: 'blob',
    }),
}