import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { HomePage } from '@/pages/Home'
import { LoginPage } from '@/pages/Login'
import { SignUpPage } from '@/pages/SignUp'
import { DashboardPage } from '@/pages/Dashboard'
import { AuthCallbackPage } from '@/pages/AuthCallback'
import { SetupChurchPage } from '@/pages/SetupChurch'
import { ProtectedRoute } from '@/components/ProtectedRoute'

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/signup',
    element: <SignUpPage />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },
  {
    path: '/setup-church',
    element: (
      <ProtectedRoute>
        <SetupChurchPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <DashboardPage />
      </ProtectedRoute>
    ),
  },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
