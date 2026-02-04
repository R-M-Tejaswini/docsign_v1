import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
const api = axios.create({ baseURL: API_BASE_URL })

export const signatureAPI = {
  listSignatures: (docId) => api.get(`/documents/${docId}/signatures/`),
  verifySignature: (docId, sigId) => api.get(`/documents/${docId}/signatures/${sigId}/verify/`),
  downloadAuditExport: (docId) => api.get(`/documents/${docId}/audit_export/`, { responseType: 'blob' }),
}