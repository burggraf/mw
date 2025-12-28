import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { BroadcastMessage, LiveState } from '@/types/live'

interface UseLiveChannelOptions {
  eventId: string
  onMessage?: (payload: BroadcastMessage) => void
}

interface UseLiveChannelReturn {
  isConnected: boolean
  sendSlide: (itemId: string, slideIndex: number) => void
  sendBlack: (isBlack: boolean) => void
  channel: RealtimeChannel | null
}

export function useLiveChannel(
  options: UseLiveChannelOptions
): UseLiveChannelReturn {
  const { eventId, onMessage } = options
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    const channelName = `live:${eventId}`

    const channel = supabase.channel(channelName, {
      config: { presence: { key: `${Date.now()}-${Math.random()}` } }
    })

    channel
      .on('broadcast', { event: 'slide' }, (payload) => {
        onMessage?.(payload.payload as BroadcastMessage)
      })
      .on('broadcast', { event: 'black' }, (payload) => {
        onMessage?.(payload.payload as BroadcastMessage)
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId, onMessage])

  const sendSlide = useCallback((itemId: string, slideIndex: number) => {
    const channel = channelRef.current
    if (!channel) return

    const message: BroadcastMessage = {
      type: 'slide',
      eventId,
      itemId,
      slideIndex,
    }

    channel.send({ type: 'broadcast', event: 'slide', payload: message })
  }, [eventId])

  const sendBlack = useCallback((isBlack: boolean) => {
    const channel = channelRef.current
    if (!channel) return

    const message: BroadcastMessage = {
      type: 'black',
      eventId,
      isBlack,
    }

    channel.send({ type: 'broadcast', event: 'black', payload: message })
  }, [eventId])

  return {
    isConnected,
    sendSlide,
    sendBlack,
    channel: channelRef.current,
  }
}

/**
 * Hook for operators to manage live state
 */
interface UseOperatorStateOptions {
  eventId: string
  initialItemId?: string | null
}

export function useOperatorState(
  options: UseOperatorStateOptions
): LiveState & {
  setCurrentItem: (itemId: string) => void
  setSlideIndex: (index: number) => void
  setBlack: (isBlack: boolean) => void
  goToSlide: (itemId: string, slideIndex: number) => void
} {
  const { eventId, initialItemId = null } = options
  const [state, setState] = useState<LiveState>({
    eventId,
    currentItemId: initialItemId,
    currentSlideIndex: 0,
    isBlack: false,
  })

  const { sendSlide, sendBlack } = useLiveChannel({
    eventId,
    onMessage: () => {}, // Operator doesn't need to receive
  })

  const setCurrentItem = useCallback((itemId: string) => {
    setState(prev => ({ ...prev, currentItemId: itemId, currentSlideIndex: 0 }))
    sendSlide(itemId, 0)
  }, [sendSlide])

  const setSlideIndex = useCallback((slideIndex: number) => {
    setState(prev => ({ ...prev, currentSlideIndex: slideIndex }))
    if (state.currentItemId) {
      sendSlide(state.currentItemId, slideIndex)
    }
  }, [state.currentItemId, sendSlide])

  const setBlack = useCallback((isBlack: boolean) => {
    setState(prev => ({ ...prev, isBlack }))
    sendBlack(isBlack)
  }, [sendBlack])

  const goToSlide = useCallback((itemId: string, slideIndex: number) => {
    setState(prev => ({ ...prev, currentItemId: itemId, currentSlideIndex: slideIndex, isBlack: false }))
    sendSlide(itemId, slideIndex)
  }, [sendSlide])

  return {
    ...state,
    setCurrentItem,
    setSlideIndex,
    setBlack,
    goToSlide,
  }
}
