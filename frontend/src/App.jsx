import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { DocumentsList } from './pages/DocumentsList'
import { DocumentEdit } from './pages/DocumentEdit'
import { TemplatesList } from './pages/TemplatesList'
import { TemplateEdit } from './pages/TemplateEdit'
import { PublicSign } from './pages/PublicSign'
import { WebhooksPage } from './pages/WebhooksPage'
import { TemplateGroupList } from './pages/TemplateGroupList'
import { TemplateGroupEdit } from './pages/TemplateGroupEdit'
import { DocumentGroupList } from './pages/DocumentGroupList'
import { DocumentGroupCreate } from './pages/DocumentGroupCreate'
import { DocumentGroupEdit } from './pages/DocumentGroupEdit'
import { DocumentGroupSignLinks } from './pages/DocumentGroupSignLinks'
import { GroupSign } from './pages/GroupSign'

function Navigation() {
  const location = useLocation()
  
  // Hide navigation on public sign pages
  if (location.pathname.includes('/sign/')) {
    return null
  }

  const navLinks = [
    { to: '/templates', label: 'Templates', icon: '📋' },
    { to: '/documents', label: 'Documents', icon: '📄' },
    { to: '/webhooks', label: 'Webhooks', icon: '🪝' },
  ]

  const isActive = (path) => location.pathname.startsWith(path)

  return (
    <nav className="bg-white shadow-md border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link 
            to="/" 
            className="flex items-center gap-3 group transition-all"
          >
            <div className="text-3xl group-hover:scale-110 transition-transform">📝</div>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              DocSign
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="flex gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`
                  px-4 py-2 rounded-lg font-semibold transition-all duration-200
                  flex items-center gap-2
                  ${isActive(link.to)
                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }
                `}
              >
                <span className="text-lg">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <Routes>
          <Route path="/" element={<HomePage />} />

          {/* Templates */}
          <Route path="/templates" element={<TemplatesList />} />
          <Route path="/templates/:id/edit" element={<TemplateEdit />} />

          {/* Template Groups */}
          <Route path="/template-groups" element={<TemplateGroupList />} />
          <Route path="/template-groups/:id/edit" element={<TemplateGroupEdit />} />

          {/* Documents */}
          <Route path="/documents" element={<DocumentsList />} />
          <Route path="/documents/:id/edit" element={<DocumentEdit />} />

          {/* Document Groups */}
          <Route path="/document-groups" element={<DocumentGroupList />} />
          <Route path="/document-groups/create" element={<DocumentGroupCreate />} />
          <Route path="/document-groups/:id/edit" element={<DocumentGroupEdit />} />
          <Route path="/document-groups/:id/sign-links" element={<DocumentGroupSignLinks />} />

          {/* Public Signing */}
          <Route path="/sign/:token" element={<PublicSign />} />
          <Route path="/group-sign/:token" element={<GroupSign />} />

          {/* Admin */}
          <Route path="/webhooks" element={<WebhooksPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App