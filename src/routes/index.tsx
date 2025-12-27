import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { HomePage } from '@/pages/Home'
import { LoginPage } from '@/pages/Login'
import { SignUpPage } from '@/pages/SignUp'
import { DashboardPage } from '@/pages/Dashboard'

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
    path: '/dashboard',
    element: <DashboardPage />,
  },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}
