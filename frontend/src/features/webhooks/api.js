import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
const api = axios.create({ baseURL: API_BASE_URL })

export const webhookAPI = {
  list: () => api.get('/webhooks/'),
  create: (data) => api.post('/webhooks/', data),
  get: (id) => api.get(`/webhooks/${id}/`),
  update: (id, data) => api.patch(`/webhooks/${id}/`, data),
  delete: (id) => api.delete(`/webhooks/${id}/`),
  test: (id) => api.post(`/webhooks/${id}/test/`),
  listEvents: (webhookId) => api.get(`/webhooks/${webhookId}/events/`),
  listAllEvents: () => api.get('/webhook-events/'),
  getEvent: (eventId) => api.get(`/webhook-events/${eventId}/`),
  getEventLogs: (eventId) => api.get(`/webhook-events/${eventId}/logs/`),
}