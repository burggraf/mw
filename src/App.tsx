import { Button } from '@/components/ui/button'

function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-bold">Mobile Worship</h1>
        <Button onClick={() => alert('Shadcn works!')}>
          Click Me
        </Button>
      </div>
    </div>
  )
}

export default App
