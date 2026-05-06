'use client'
// app/(app)/projects/[id]/wbs/page.tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'
import ActionBar from '@/components/ActionBar'
import { useHistory, HistoryEntry } from '@/hooks/useHistory'
import { printSection, exportToExcel, exportToPDF, exportToDrive, exportToNotion, exportToGmail } from '@/lib/exportUtils'

interface WBSItem {
  id: string; code: string; name: string; level: number
  description: string; deliverable: string; responsible: string
  duration: string; budget: string; dependencies: string
}

export default function WBSPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [project, setProject] = useState<any>(null)
  const [items, setItems] = useState<WBSItem[]>([])
  const [loading, setLoading] = useState(false)
  const { history, saveToHistory, lastEntry } = useHistory(id, 'wbs')

  useEffect(() => {
    supabase.from('projects').select('*').eq('id', id).single()
      .then(({ data }) => { if (data) setProject(data) })
  }, [id])

  // Auto-load last history on mount
  useEffect(() => {
    if (lastEntry && items.length === 0) {
      const d = lastEntry.data as any
      if (d?.items) setItems(d.items)
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
          tab: 'wbs',
          project_name: project.name,
          project_description: project.description,
          prompt: `Génère un WBS (Work Breakdown Structure) complet pour le projet "${project.name}". 
Retourne UNIQUEMENT du JSON valide:
{"items": [{"id":"1","code":"1.0","name":"Nom","level":1,"description":"...","deliverable":"...","responsible":"Chef de Projet","duration":"2 semaines","budget":"5000€","dependencies":""}]}
Minimum 15 éléments, niveaux 1 à 4, couvrant toutes les phases du projet.`
        })
      })
      const data = await res.json()
      const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
      setItems(parsed.items)
      await saveToHistory(`WBS — ${new Date().toLocaleDateString('fr-FR')}`, { items: parsed.items })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [project, saveToHistory])

  const loadHistory = (entry: HistoryEntry) => {
    const d = entry.data as any
    if (d?.items) setItems(d.items)
  }

  const toRows = () => items.map(i => ({
    Code: i.code, Nom: i.name, Niveau: i.level,
    Description: i.description, Livrable: i.deliverable,
    Responsable: i.responsible, Durée: i.duration,
    Budget: i.budget, Dépendances: i.dependencies
  }))

  const levelColors: Record<number, string> = {
    1: '#1e3a5f', 2: '#1e293b', 3: '#0f172a', 4: '#0a0f1a'
  }
  const levelBorders: Record<number, string> = {
    1: '#2563eb', 2: '#7c3aed', 3: '#059669', 4: '#d97706'
  }

  return (
    <AppLayout>
      <div style={{ padding: '24px 32px', background: '#0a0f1a', minHeight: '100vh', color: '#e2e8f0' }}>
        {/* Header */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            // STRUCTURE DE DÉCOUPAGE
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>📋</span> WBS Dictionnaire
          </h1>
        </div>

        {/* Action Bar */}
        <div style={{ margin: '16px 0' }}>
          <ActionBar
            history={history}
            onLoadHistory={loadHistory}
            primaryLabel="Générer depuis WBS"
            primaryIcon="⚡"
            onPrimary={generate}
            loading={loading}
            onPrint={() => printSection('wbs-content', `WBS — ${project?.name}`)}
            onExportExcel={() => exportToExcel(toRows(), `WBS_${project?.name}`)}
            onExportPDF={() => exportToPDF('wbs-content', `WBS — ${project?.name}`)}
            onExportDrive={() => exportToDrive(JSON.stringify(items, null, 2), `WBS_${project?.name}.json`)}
            onExportNotion={() => exportToNotion(`WBS — ${project?.name}`, items.map(i => ({ content: `${i.code} ${i.name} — ${i.description}` })))}
            onExportGmail={() => exportToGmail(`WBS — ${project?.name}`, items.map(i => `${i.code} ${i.name}\n${i.description}`).join('\n\n'))}
          />
        </div>

        {/* Content */}
        <div id="wbs-content" style={{ background: '#0f172a', borderRadius: 12, overflow: 'hidden', border: '1px solid #1e293b' }}>
          {items.length === 0 && !loading && (
            <div style={{ padding: 48, textAlign: 'center', color: '#475569' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Aucun WBS généré</div>
              <div style={{ fontSize: 13 }}>Cliquez sur "Générer depuis WBS" ou chargez un historique</div>
            </div>
          )}
          {loading && (
            <div style={{ padding: 48, textAlign: 'center', color: '#60a5fa' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <div>Génération du WBS en cours...</div>
            </div>
          )}
          {items.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}>
                  {['Code', 'Élément WBS', 'Livrable', 'Responsable', 'Durée', 'Budget', 'Dépendances'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#fff', textAlign: 'left', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} style={{
                    background: i % 2 === 0 ? levelColors[item.level] || '#0f172a' : '#0a0f1a',
                    borderLeft: `3px solid ${levelBorders[item.level] || '#334155'}`,
                  }}>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{item.code}</td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#e2e8f0', fontWeight: item.level <= 2 ? 700 : 400, paddingLeft: `${12 + (item.level - 1) * 16}px` }}>
                      {item.name}
                      {item.description && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.description}</div>}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>{item.deliverable}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#60a5fa' }}>{item.responsible}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#a3e635' }}>{item.duration}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#fbbf24' }}>{item.budget}</td>
                    <td style={{ padding: '8px 12px', fontSize: 11, color: '#64748b' }}>{item.dependencies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
