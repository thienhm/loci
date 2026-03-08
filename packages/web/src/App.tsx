import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectBoardPage } from './pages/ProjectBoardPage'
import { TicketDetailPage } from './pages/TicketDetailPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/project/:projectId" element={<ProjectBoardPage />} />
        <Route path="/project/:projectId/:ticketId" element={<TicketDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

