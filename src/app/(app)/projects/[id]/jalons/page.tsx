'use client'
// ═══════════════════════════════════════════════════════════════════════════
// JALONS PAGE — app/(app)/projects/[id]/jalons/page.tsx
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'
import ActionBar from '@/components/ActionBar'
import { useHistory, HistoryEntry } from '@/hooks/useHistory'
import { printSection, exportToExcel, exportToPDF, exportToDrive, exportToNotion, exportToGmail } from '@/lib/exportUtils'
import { EmptyState, LoadingState } from '@/components/pmo-shared'

interface Jalon {
  id: string; code: string; name: string; date: string
  status: 'Planifié' | 'En cours' | 'Atteint' | 'En retard'
  description: string; deliverables: string; responsible: string; dependencies: string
}

const STATUS_CONFIG = {
  'Planifié':  { color: '#3b82f6', icon: '📅' },
  'En cours':  { color: '#f59e0b', icon: '🔄' },
  'Atteint':   { color: '#22c55e', icon: '✅' },
  'En retard': { color: '#ef4444', icon: '⚠️' },
}

export default function JalonsPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [project, setProject] = useState<any>(null)
  const [jalons, setJalons] = useState<Jalon[]>([])
  const [loading, setLoading] = useState(false)
  const { history, saveToHistory, lastEntry } = useHistory(id, 'jalons')

  useEffect(() => {
    supabase.from('projects').select('*').eq('id', id).single()
      .then(({ data }) => { if (data) setProject(data) })
  }, [id])

  useEffect(() => {
    if (lastEntry && jalons.length === 0) {
      const d = lastEntry.data as any
      if (d?.jalons) setJalons(d.jalons)
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
          tab: 'jalons',
          project_name: project.name,
          prompt: `Génère les jalons clés pour le projet "${project.name}". 
Retourne UNIQUEMENT du JSON: {"jalons":[{"id":"J1","code":"M0","name":"Lancement","date":"2025-01-15","status":"Planifié","description":"...","deliverables":"Charte signée","responsible":"Chef de Projet","dependencies":""}]}
Minimum 8 jalons couvrant tout le cycle de vie.`
        })
      })
      const data = await res.json()
      const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
      setJalons(parsed.jalons)
      await saveToHistory(`Jalons — ${new Date().toLocaleDateString('fr-FR')}`, { jalons: parsed.jalons })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [project, saveToHistory])

  const loadHistory = (entry: HistoryEntry) => {
    const d = entry.data as any
    if (d?.jalons) setJalons(d.jalons)
  }

  const toRows = () => jalons.map(j => ({
    Code: j.code, Nom: j.name, Date: j.date, Statut: j.status,
    Description: j.description, Livrables: j.deliverables,
    Responsable: j.responsible, Dépendances: j.dependencies
  }))

  return (
    <AppLayout>
      <div style={{ padding: '24px 32px', background: '#0a0f1a', minHeight: '100vh', color: '#e2e8f0' }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            // JALONS PROJET
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>📅 Jalons</h1>
        </div>
        <div style={{ margin: '16px 0' }}>
          <ActionBar
            history={history} onLoadHistory={loadHistory}
            primaryLabel="Générer Jalons" primaryIcon="⚡" onPrimary={generate} loading={loading}
            onPrint={() => printSection('jalons-content', `Jalons — ${project?.name}`)}
            onExportExcel={() => exportToExcel(toRows(), `Jalons_${project?.name}`)}
            onExportPDF={() => exportToPDF('jalons-content', `Jalons — ${project?.name}`)}
            onExportDrive={() => exportToDrive(JSON.stringify(jalons, null, 2), `Jalons_${project?.name}.json`)}
            onExportNotion={() => exportToNotion(`Jalons — ${project?.name}`, jalons.map(j => ({ content: `${j.code} ${j.name} — ${j.date} — ${j.status}` })))}
            onExportGmail={() => exportToGmail(`Jalons — ${project?.name}`, jalons.map(j => `${j.code} ${j.name}\nDate: ${j.date} | Statut: ${j.status}`).join('\n\n'))}
          />
        </div>
        <div id="jalons-content">
          {jalons.length === 0 && !loading && (
            <EmptyState icon="📅" label="Aucun jalon" hint='Cliquez sur "Générer Jalons"' />
          )}
          {loading && <LoadingState label="Génération des jalons..." />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {jalons.map((jalon, i) => {
              const cfg = STATUS_CONFIG[jalon.status] ?? { color: '#64748b', icon: '📅' }
              return (
                <div key={jalon.id} style={{
                  background: '#0f172a', border: `1px solid #1e293b`,
                  borderLeft: `4px solid ${cfg.color}`, borderRadius: 10, padding: 16,
                  display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: 16, alignItems: 'center'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{jalon.code}</div>
                    <div style={{ fontSize: 20, marginTop: 4 }}>{cfg.icon}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{jalon.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{jalon.description}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#fbbf24' }}>📅 {jalon.date}</div>
                    <div style={{ fontSize: 12, color: '#60a5fa', marginTop: 4 }}>👤 {jalon.responsible}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>📦 {jalon.deliverables}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: 11, background: cfg.color + '22', color: cfg.color,
                      borderRadius: 20, padding: '4px 12px', fontWeight: 600
                    }}>{jalon.status}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

