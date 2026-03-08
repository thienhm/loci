import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * useSSE — subscribes to the project's SSE event stream.
 *
 * When the server emits a `change` event, all ticket-related queries for the
 * project are invalidated so React Query re-fetches the latest data.
 *
 * The EventSource is cleaned up automatically on unmount.
 */
export function useSSE(projectId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!projectId) return

    let es: EventSource
    let retryTimeout: ReturnType<typeof setTimeout> | null = null

    function connect() {
      es = new EventSource(`/api/projects/${projectId}/events`)

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type: string }
          if (data.type === 'change') {
            queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
            queryClient.invalidateQueries({ queryKey: ['project', projectId] })
          }
        } catch {
          // Ignore malformed events
        }
      }

      es.onerror = () => {
        // On connection error, close and retry after 3s
        es.close()
        retryTimeout = setTimeout(() => {
          retryTimeout = null
          connect()
        }, 3_000)
      }
    }

    connect()

    return () => {
      es?.close()
      if (retryTimeout !== null) clearTimeout(retryTimeout)
    }
  }, [projectId, queryClient])
}
