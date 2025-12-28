import { AppRoutes } from '@/routes'
import { AutoStartRedirect } from '@/components/AutoStartRedirect'

function App() {
  return (
    <>
      <AutoStartRedirect />
      <AppRoutes />
    </>
  )
}

export default App
