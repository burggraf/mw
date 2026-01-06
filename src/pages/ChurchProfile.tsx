import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useChurch } from '@/contexts/ChurchContext'
import { getSupabase } from '@/lib/supabase'
import { getSongs } from '@/services/songs'
import { getEvents } from '@/services/events'
import { getDisplaysForChurch } from '@/services/displays'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Database, CreditCard, Image, Presentation, FileImage, FolderOpen, Music, Calendar, Monitor, BarChart3 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface StorageCategory {
  name: string
  size: number
  count: number
  icon: React.ComponentType<{ className?: string }>
}

interface StorageStats {
  total: number
  categories: StorageCategory[]
}

interface ChurchStats {
  songs: number
  totalEvents: number
  upcomingEvents: number
  backgrounds: number
  slides: number
  displays: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function ChurchProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentChurch, isAdmin } = useChurch()

  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [churchStats, setChurchStats] = useState<ChurchStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin && currentChurch) {
      navigate('/dashboard')
    }
  }, [isAdmin, currentChurch, navigate])

  useEffect(() => {
    if (!currentChurch || !isAdmin) return

    const loadStats = async () => {
      setLoading(true)
      setError(null)

      try {
        const supabase = getSupabase()

        // Fetch all stats in parallel
        const [storageResult, songs, allEvents, upcomingEvents, displays] = await Promise.all([
          supabase.rpc('get_church_storage_stats', { p_church_id: currentChurch.id }),
          getSongs(currentChurch.id),
          getEvents(currentChurch.id, 'all'),
          getEvents(currentChurch.id, 'upcoming'),
          getDisplaysForChurch(currentChurch.id),
        ])

        if (storageResult.error) throw storageResult.error

        // Map categories to display info
        const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
          background: Image,
          slide: Presentation,
          thumbnails: FileImage,
          other: FolderOpen,
        }

        const categoryNames: Record<string, string> = {
          background: 'backgrounds',
          slide: 'slides',
          thumbnails: 'thumbnails',
          other: 'other',
        }

        const categories: StorageCategory[] = (storageResult.data || []).map((item: { category: string; file_count: number; total_bytes: number }) => ({
          name: categoryNames[item.category] || item.category,
          size: Number(item.total_bytes) || 0,
          count: Number(item.file_count) || 0,
          icon: categoryIcons[item.category] || FolderOpen,
        }))

        const total = categories.reduce((sum, cat) => sum + cat.size, 0)

        // Get background and slide counts from storage categories
        const backgroundCat = categories.find(c => c.name === 'backgrounds')
        const slideCat = categories.find(c => c.name === 'slides')

        setStorageStats({
          total,
          categories: categories.filter(cat => cat.count > 0),
        })

        setChurchStats({
          songs: songs.length,
          totalEvents: allEvents.length,
          upcomingEvents: upcomingEvents.length,
          backgrounds: backgroundCat?.count || 0,
          slides: slideCat?.count || 0,
          displays: displays.length,
        })
      } catch (err) {
        console.error('Failed to load stats:', err)
        setError(t('churchProfile.error'))
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [currentChurch, isAdmin, t])

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-8 max-w-4xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('churchProfile.accessDenied')}</AlertTitle>
          <AlertDescription>{t('churchProfile.adminOnly')}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('churchProfile.title')}</h1>
        <p className="text-muted-foreground">{currentChurch?.name}</p>
      </div>

      <div className="space-y-6">
        {/* Analytics Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t('churchProfile.analytics')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : churchStats ? (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Music className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.songs}</div>
                  <div className="text-xs text-muted-foreground">{t('nav.songs')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.totalEvents}</div>
                  <div className="text-xs text-muted-foreground">{t('churchProfile.totalEvents')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.upcomingEvents}</div>
                  <div className="text-xs text-muted-foreground">{t('dashboard.upcoming')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Image className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.backgrounds}</div>
                  <div className="text-xs text-muted-foreground">{t('nav.backgrounds')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Presentation className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.slides}</div>
                  <div className="text-xs text-muted-foreground">{t('nav.slides')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.displays}</div>
                  <div className="text-xs text-muted-foreground">{t('nav.displays')}</div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Storage Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {t('churchProfile.storage')}
            </CardTitle>
            <CardDescription>{t('churchProfile.storageBreakdown')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : storageStats ? (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="storage" className="border-none">
                  <AccordionTrigger className="hover:no-underline py-0">
                    <div className="flex-1 space-y-2 pr-4">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{t('churchProfile.totalStorage')}</span>
                        <span className="text-muted-foreground">
                          {formatBytes(storageStats.total)} / 1 GB ({Math.round((storageStats.total / (1024 * 1024 * 1024)) * 100)}%)
                        </span>
                      </div>
                      <Progress
                        value={Math.min((storageStats.total / (1024 * 1024 * 1024)) * 100, 100)}
                        className="h-2"
                      />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {storageStats.categories.length > 0 ? (
                      <div className="space-y-2 pt-4">
                        {storageStats.categories.map((category) => {
                          const Icon = category.icon

                          return (
                            <div key={category.name} className="flex items-center justify-between py-1">
                              <div className="flex items-center gap-3">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{t(`churchProfile.${category.name}`)}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>{category.count} {category.count === 1 ? 'file' : 'files'}</span>
                                <span className="w-20 text-right">{formatBytes(category.size)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {t('churchProfile.noFiles')}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </CardContent>
        </Card>

        {/* Subscription Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('churchProfile.subscription')}
            </CardTitle>
            <CardDescription>{t('churchProfile.plan')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">{t('churchProfile.freePlan')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('churchProfile.subscriptionComingSoon')}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
