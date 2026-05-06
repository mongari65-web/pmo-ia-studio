// hooks/useHistory.ts
// Usage: const { history, saveToHistory, lastEntry } = useHistory(projectId, tabKey)

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface HistoryEntry {
  id: string
  project_id: string
  tab: string
  label: string
  data: Record<string, unknown>
  created_at: string
}

export function useHistory(projectId: string, tab: string) {
  const supabase = createClient()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!projectId) return
    const { data } = await supabase
      .from('pmo_history')
      .select('*')
      .eq('project_id', projectId)
      .eq('tab', tab)
      .order('created_at', { ascending: false })
      .limit(20)
    setHistory(data ?? [])
  }, [projectId, tab])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const saveToHistory = useCallback(async (label: string, data: Record<string, unknown>) => {
    const entry = { project_id: projectId, tab, label, data }
    const { data: saved } = await supabase.from('pmo_history').insert(entry).select().single()
    if (saved) setHistory(prev => [saved, ...prev.slice(0, 19)])
    return saved
  }, [projectId, tab])

  const loadEntry = useCallback((entry: HistoryEntry) => entry.data, [])
  const lastEntry = history[0] ?? null

  return { history, saveToHistory, loadEntry, lastEntry, fetchHistory, loading }
}
