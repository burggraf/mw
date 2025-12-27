import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { HomePage } from '@/pages/Home'
import { LoginPage } from '@/pages/Login'
import { SignUpPage } from '@/pages/SignUp'
import { DashboardPage } from '@/pages/Dashboard'
import { AuthCallbackPage } from '@/pages/AuthCallback'
import { SetupChurchPage } from '@/pages/SetupChurch'
import { SongsPage } from '@/pages/Songs'
import { SongEditorPage } from '@/pages/SongEditor'
import { SongDetailPage } from '@/pages/SongDetail'
import { MediaPage } from '@/pages/Media'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'

const router = createBrowserRouter([
  // Public routes (no sidebar)
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
  // Protected routes with sidebar layout
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: '/dashboard',
        element: <DashboardPage />,
      },
      {
        path: '/songs',
        element: <SongsPage />,
      },
      {
        path: '/songs/new',
        element: <SongEditorPage />,
      },
      {
        path: '/songs/:id',
        element: <SongDetailPage />,
      },
      {
        path: '/songs/:id/edit',
        element: <SongEditorPage />,
      },
      {
        path: '/media',
        element: <MediaPage />,
      },
      {
        path: '/events',
        element: <div className="p-8"><h1 className="text-2xl font-bold">Events</h1><p className="text-muted-foreground mt-2">Coming soon</p></div>,
      },
      {
        path: '/displays',
        element: <div className="p-8"><h1 className="text-2xl font-bold">Displays</h1><p className="text-muted-foreground mt-2">Coming soon</p></div>,
      },
      {
        path: '/team',
        element: <div className="p-8"><h1 className="text-2xl font-bold">Team</h1><p className="text-muted-foreground mt-2">Coming soon</p></div>,
      },
      {
        path: '/settings',
        element: <div className="p-8"><h1 className="text-2xl font-bold">Settings</h1><p className="text-muted-foreground mt-2">Coming soon</p></div>,
      },
    ],
  },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
