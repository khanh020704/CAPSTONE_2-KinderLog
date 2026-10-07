import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { StoreProvider } from './store/store'
import { ToastProvider } from './components/ui'
import { AppShell, ParentShell, RequireRole } from './components/Shell'
import ChatPage from './components/Chat'
import { ForgotPasswordPage, LoginPage } from './pages/auth'
import { LandingPage } from './pages/landing'
import { AuditLogPage, ChangePasswordPage, NotificationsPage, ProfilePage } from './pages/shared'
import { AdminDashboard, MonitoringPage, PrincipalsPage, SchoolsPage, SettingsPage } from './pages/admin'
import {
  AcademicYearPage,
  AnnouncementsPage,
  CameraMonitoringPage,
  CameraSchedulePage,
  ClassesPage,
  ParentsPage,
  PrincipalDashboard,
  RelationshipsPage,
  ReportsPage,
  SchoolProfilePage,
  StudentsPage,
  TeachersPage,
} from './pages/principal'
import { AttendancePage, DailyJournalPage, MyClassPage, TeacherDashboard } from './pages/teacher'
import { ParentAnnouncementsPage, ParentCameraPage, ParentHome, ParentJournalPage, ParentMorePage } from './pages/parent'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

const account = (
  <>
    <Route path="profile" element={<ProfilePage />} />
    <Route path="password" element={<ChangePasswordPage />} />
  </>
)

const shell = (role) => (
  <RequireRole role={role}>
    <AppShell role={role} />
  </RequireRole>
)

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            <Route path="/admin" element={shell('admin')}>
              <Route index element={<AdminDashboard />} />
              <Route path="schools" element={<SchoolsPage />} />
              <Route path="principals" element={<PrincipalsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="audit" element={<AuditLogPage />} />
              <Route path="monitoring" element={<MonitoringPage />} />
              {account}
            </Route>

            <Route path="/principal" element={shell('principal')}>
              <Route index element={<PrincipalDashboard />} />
              <Route path="school" element={<SchoolProfilePage />} />
              <Route path="academic-year" element={<AcademicYearPage />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="teachers" element={<TeachersPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="parents" element={<ParentsPage />} />
              <Route path="relationships" element={<RelationshipsPage />} />
              <Route path="cameras" element={<CameraMonitoringPage />} />
              <Route path="camera-schedule" element={<CameraSchedulePage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="audit" element={<AuditLogPage scope="school" />} />
              {account}
            </Route>

            <Route path="/teacher" element={shell('teacher')}>
              <Route index element={<TeacherDashboard />} />
              <Route path="class" element={<MyClassPage />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="journal" element={<DailyJournalPage />} />
              <Route path="messages" element={<ChatPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              {account}
            </Route>

            <Route
              path="/parent"
              element={
                <RequireRole role="parent">
                  <ParentShell />
                </RequireRole>
              }
            >
              <Route index element={<ParentHome />} />
              <Route path="journal" element={<ParentJournalPage />} />
              <Route path="messages" element={<ChatPage />} />
              <Route path="camera" element={<ParentCameraPage />} />
              <Route path="more" element={<ParentMorePage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="announcements" element={<ParentAnnouncementsPage />} />
              {account}
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </StoreProvider>
  )
}
