'use client'
// ═══════════════════════════════════════════════════════════════════════
// GANTT PAGE — app/(app)/projects/[id]/gantt/page.tsx
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'
import ActionBar from '@/components/ActionBar'
import { useHistory, HistoryEntry } from '@/hooks/useHistory'
import { printSection, exportToExcel, exportToPDF, exportToDrive, exportToNotion, exportToGmail } from '@/lib/exportUtils'

interface GanttTask {
  id: string; wbs: string; name: string; phase: string
  start: string; end: string; duration: number
  responsible: string; progress: number; dependencies: string
  critical: boolean
}

export default function GanttPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [project, setProject] = useState<any>(null)
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [loading, setLoading] = useState(false)
  const { history, saveToHistory, lastEntry } = useHistory(id, 'gantt')

  useEffect(() => {
    supabase.from('projects').select('*').eq('id', id).single()
      .then(({ data }) => { if (data) setProject(data) })
  }, [id])

  useEffect(() => {
    if (lastEntry && tasks.length === 0) {
      const d = lastEntry.data as any
      if (d?.tasks) setTasks(d.tasks)
    }
  }, [lastEntry])

  const generate = useCallback(async () => {
    if (!project) return
    setLoading(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: 'gantt',
          project_name: project.name,
          prompt: `Génère un planning Gantt pour "${project.name}".
Retourne UNIQUEMENT du JSON: {"tasks":[{"id":"T1","wbs":"1.1","name":"Nom tâche","phase":"Phase 1","start":"2025-01-15","end":"2025-01-30","duration":15,"responsible":"Chef de Projet","progress":0,"dependencies":"","critical":true}]}
Minimum 15 tâches, 4 phases, chemin critique identifié.`
        })
      })
      const data = await res.json()
      const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
      setTasks(parsed.tasks)
      await saveToHistory(`Gantt — ${new Date().toLocaleDateString('fr-FR')}`, { tasks: parsed.tasks })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [project, saveToHistory])

  const loadHistory = (entry: HistoryEntry) => {
    const d = entry.data as any
    if (d?.tasks) setTasks(d.tasks)
  }

  const toRows = () => tasks.map(t => ({
    WBS: t.wbs, Tâche: t.name, Phase: t.phase, Début: t.start,
    Fin: t.end, Durée: `${t.duration}j`, Responsable: t.responsible,
    Avancement: `${t.progress}%`, Dépendances: t.dependencies, Critique: t.critical ? 'Oui' : 'Non'
  }))

  // Group by phase
  const phases = Array.from(new Set(tasks.map(t => t.phase)))
  const totalDays = tasks.length > 0
    ? Math.ceil((new Date(Math.max(...tasks.map(t => new Date(t.end).getTime()))).getTime() -
        new Date(Math.min(...tasks.map(t => new Date(t.start).getTime()))).getTime()) / 86400000)
    : 0
  const projectStart = tasks.length > 0
    ? new Date(Math.min(...tasks.map(t => new Date(t.start).getTime())))
    : new Date()

  const barWidth = (task: GanttTask) => {
    const d = (new Date(task.end).getTime() - new Date(task.start).getTime()) / 86400000
    return Math.max(2, (d / Math.max(totalDays, 1)) * 100)
  }
  const barLeft = (task: GanttTask) => {
    const d = (new Date(task.start).getTime() - projectStart.getTime()) / 86400000
    return (d / Math.max(totalDays, 1)) * 100
  }

  return (
    <AppLayout>
      <div style={{ padding: '24px 32px', background: '#0a0f1a', minHeight: '100vh', color: '#e2e8f0' }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            // PLANNING GANTT
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>📅 Gantt</h1>
        </div>
        <div style={{ margin: '16px 0' }}>
          <ActionBar
            history={history} onLoadHistory={loadHistory}
            primaryLabel="Générer Gantt" primaryIcon="⚡" onPrimary={generate} loading={loading}
            onPrint={() => printSection('gantt-content', `Gantt — ${project?.name}`)}
            onExportExcel={() => exportToExcel(toRows(), `Gantt_${project?.name}`)}
            onExportPDF={() => exportToPDF('gantt-content', `Gantt — ${project?.name}`)}
            onExportDrive={() => exportToDrive(JSON.stringify(tasks, null, 2), `Gantt_${project?.name}.json`)}
            onExportNotion={() => exportToNotion(`Gantt — ${project?.name}`, tasks.map(t => ({ content: `${t.wbs} ${t.name} [${t.start} → ${t.end}] ${t.responsible}` })))}
            onExportGmail={() => exportToGmail(`Gantt — ${project?.name}`, tasks.map(t => `${t.wbs} ${t.name}\n${t.start} → ${t.end} | ${t.responsible} | ${t.progress}%`).join('\n\n'))}
          />
        </div>

        <div id="gantt-content" style={{ background: '#0f172a', borderRadius: 12, overflow: 'hidden', border: '1px solid #1e293b' }}>
          {tasks.length === 0 && !loading && (
            <div style={{ padding: 48, textAlign: 'center', color: '#475569' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Aucun planning Gantt</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>Cliquez sur "Générer Gantt" ou chargez un historique</div>
            </div>
          )}
          {loading && <div style={{ padding: 48, textAlign: 'center', color: '#60a5fa' }}>⏳ Génération...</div>}

          {tasks.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minWidth: 800 }}>
              {/* Left: task list */}
              <div style={{ borderRight: '1px solid #1e293b' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr',
                  background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                  padding: '10px 12px', gap: 8
                }}>
                  {['Tâche', 'Resp.', 'Avanc.'].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{h}</div>
                  ))}
                </div>
                {phases.map(phase => (
                  <div key={phase}>
                    <div style={{ padding: '8px 12px', background: '#1e293b', fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: 1 }}>
                      ▸ {phase}
                    </div>
                    {tasks.filter(t => t.phase === phase).map(task => (
                      <div key={task.id} style={{
                        display: 'grid', gridTemplateColumns: '2fr 1fr 1fr',
                        padding: '7px 12px', gap: 8, alignItems: 'center',
                        borderBottom: '1px solid #0f172a',
                        background: task.critical ? 'rgba(239,68,68,0.04)' : 'transparent'
                      }}>
                        <div style={{ fontSize: 12, color: task.critical ? '#fca5a5' : '#e2e8f0' }}>
                          {task.critical && <span style={{ color: '#ef4444', marginRight: 4 }}>●</span>}
                          {task.wbs} {task.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#60a5fa' }}>{task.responsible.split(' ')[0]}</div>
                        <div style={{ fontSize: 11 }}>
                          <div style={{ background: '#1e293b', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${task.progress}%`, height: '100%', background: task.progress === 100 ? '#22c55e' : '#3b82f6', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 10, color: '#64748b' }}>{task.progress}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Right: bars */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ padding: '10px 12px', background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', height: 37 }} />
                {phases.map(phase => (
                  <div key={phase}>
                    <div style={{ height: 33, background: '#1e293b' }} />
                    {tasks.filter(t => t.phase === phase).map(task => (
                      <div key={task.id} style={{
                        height: 33, position: 'relative', borderBottom: '1px solid #0f172a',
                        background: task.critical ? 'rgba(239,68,68,0.03)' : 'transparent'
                      }}>
                        <div style={{
                          position: 'absolute',
                          left: `${barLeft(task)}%`,
                          width: `${barWidth(task)}%`,
                          top: '50%', transform: 'translateY(-50%)',
                          height: 16, borderRadius: 4,
                          background: task.critical
                            ? 'linear-gradient(90deg, #dc2626, #ef4444)'
                            : 'linear-gradient(90deg, #1d4ed8, #3b82f6)',
                          minWidth: 24,
                          overflow: 'hidden'
                        }}>
                          {task.progress > 0 && (
                            <div style={{
                              width: `${task.progress}%`, height: '100%',
                              background: task.critical ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)'
                            }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
