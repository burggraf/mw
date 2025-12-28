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
import { EventsPage } from '@/pages/Events'
import { EventEditorPage } from '@/pages/EventEditor'
import { EventDetailPage } from '@/pages/EventDetail'
import { Controller } from '@/pages/live/Controller'
import { DisplayPage } from '@/pages/live/Display'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import WebRTCDebugPage from '@/routes/webrtc-debug'

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
        element: <EventsPage />,
      },
      {
        path: '/events/new',
        element: <EventEditorPage />,
      },
      {
        path: '/events/:id',
        element: <EventDetailPage />,
      },
      {
        path: '/events/:id/edit',
        element: <EventEditorPage />,
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
      {
        path: '/debug/webrtc',
        element: <WebRTCDebugPage />,
      },
    ],
  },
  // Live control routes (standalone, no sidebar, no auth required)
  {
    path: '/live/controller',
    element: <Controller />,
  },
  {
    path: '/live/display',
    element: <DisplayPage eventId="default" displayName="Display" />,
  },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
