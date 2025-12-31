import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
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
import { DisplaysPage } from '@/pages/Displays'
import { Controller } from '@/pages/live/Controller'
import { DisplayPage } from '@/pages/live/Display'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { AutoStartRedirect } from '@/components/AutoStartRedirect'
import { WebSocketProvider } from '@/contexts/WebSocketContext'

// Layout wrapper that includes auto-redirect
function RootLayout() {
  return (
    <AutoStartRedirect>
      <Outlet />
    </AutoStartRedirect>
  )
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
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
            element: <DisplaysPage />,
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
      // Live control routes (standalone, no sidebar, no auth required)
      {
        path: '/live/controller',
        element: <Controller />,
      },
      {
        path: '/live/display',
        element: <DisplayPage eventId="default" displayName="Display" />,
      },
    ],
  },
])

export function AppRoutes() {
  return (
    <WebSocketProvider>
      <RouterProvider router={router} />
    </WebSocketProvider>
  )
}
