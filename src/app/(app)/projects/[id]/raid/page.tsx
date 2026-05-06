'use client'
// app/(app)/projects/[id]/raid/page.tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'
import ActionBar from '@/components/ActionBar'
import { useHistory, HistoryEntry } from '@/hooks/useHistory'
import { printSection, exportToExcel, exportToPDF, exportToDrive, exportToNotion, exportToGmail } from '@/lib/exportUtils'

interface RAIDItem {
  id: string; category: 'Risk' | 'Action' | 'Issue' | 'Decision'
  title: string; description: string; probability?: string; impact?: string
  priority: 'Critique' | 'Élevé' | 'Moyen' | 'Faible'
  owner: string; due_date: string; status: string; mitigation: string
}

const CAT_CONFIG = {
  Risk:     { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    icon: '⚠️', label: 'Risques' },
  Action:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   icon: '✅', label: 'Actions' },
  Issue:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   icon: '🔴', label: 'Issues' },
  Decision: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    icon: '📌', label: 'Décisions' },
}

const PRIORITY_COLOR: Record<string, string> = {
  'Critique': '#ef4444', 'Élevé': '#f59e0b', 'Moyen': '#3b82f6', 'Faible': '#22c55e'
}

export default function RAIDPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [project, setProject] = useState<any>(null)
  const [items, setItems] = useState<RAIDItem[]>([])
  const [filter, setFilter] = useState<string>('All')
  const [loading, setLoading] = useState(false)
  const { history, saveToHistory, lastEntry } = useHistory(id, 'raid')

  useEffect(() => {
    supabase.from('projects').select('*').eq('id', id).single()
      .then(({ data }) => { if (data) setProject(data) })
  }, [id])

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
          tab: 'raid',
          project_name: project.name,
          prompt: `Génère un registre RAID complet pour "${project.name}". 
Retourne UNIQUEMENT du JSON:
{"items":[{"id":"R1","category":"Risk","title":"...","description":"...","probability":"Élevé","impact":"Critique","priority":"Critique","owner":"Chef de Projet","due_date":"2025-06-30","status":"Ouvert","mitigation":"..."}]}
Inclus: 5 Risques, 5 Actions, 4 Issues, 4 Décisions. Categories: Risk|Action|Issue|Decision. Priority: Critique|Élevé|Moyen|Faible`
        })
      })
      const data = await res.json()
      const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
      setItems(parsed.items)
      await saveToHistory(`RAID — ${new Date().toLocaleDateString('fr-FR')}`, { items: parsed.items })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [project, saveToHistory])

  const loadHistory = (entry: HistoryEntry) => {
    const d = entry.data as any
    if (d?.items) setItems(d.items)
  }

  const filtered = filter === 'All' ? items : items.filter(i => i.category === filter)
  const toRows = () => items.map(i => ({
    Catégorie: i.category, ID: i.id, Titre: i.title, Description: i.description,
    Probabilité: i.probability ?? '', Impact: i.impact ?? '',
    Priorité: i.priority, Responsable: i.owner, Échéance: i.due_date, Statut: i.status, Mitigation: i.mitigation
  }))

  return (
    <AppLayout>
      <div style={{ padding: '24px 32px', background: '#0a0f1a', minHeight: '100vh', color: '#e2e8f0' }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            // REGISTRE RAID
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>⚠️ RAID Register</h1>
        </div>

        <div style={{ margin: '16px 0' }}>
          <ActionBar
            history={history} onLoadHistory={loadHistory}
            primaryLabel="Générer RAID" primaryIcon="⚡" onPrimary={generate} loading={loading}
            onPrint={() => printSection('raid-content', `RAID — ${project?.name}`)}
            onExportExcel={() => exportToExcel(toRows(), `RAID_${project?.name}`)}
            onExportPDF={() => exportToPDF('raid-content', `RAID — ${project?.name}`)}
            onExportDrive={() => exportToDrive(JSON.stringify(items, null, 2), `RAID_${project?.name}.json`)}
            onExportNotion={() => exportToNotion(`RAID — ${project?.name}`, items.map(i => ({ content: `[${i.category}] ${i.title}: ${i.description}` })))}
            onExportGmail={() => exportToGmail(`RAID — ${project?.name}`, items.map(i => `[${i.category}] ${i.title}\n${i.description}\nPriorité: ${i.priority} | Responsable: ${i.owner}`).join('\n\n'))}
          />
        </div>

        {/* Category filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['All', 'Risk', 'Action', 'Issue', 'Decision'].map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: filter === cat ? (cat === 'All' ? '#2563eb' : CAT_CONFIG[cat as keyof typeof CAT_CONFIG]?.color) : '#1e293b',
              color: filter === cat ? '#fff' : '#64748b',
              transition: 'all 0.15s'
            }}>
              {cat === 'All' ? `Tous (${items.length})` : `${CAT_CONFIG[cat as keyof typeof CAT_CONFIG]?.icon} ${cat} (${items.filter(i => i.category === cat).length})`}
            </button>
          ))}
        </div>

        <div id="raid-content">
          {filtered.length === 0 && !loading && (
            <div style={{ padding: 48, textAlign: 'center', color: '#475569', background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Aucun élément RAID</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>Cliquez sur "Générer RAID" ou chargez un historique</div>
            </div>
          )}
          {loading && (
            <div style={{ padding: 48, textAlign: 'center', color: '#60a5fa', background: '#0f172a', borderRadius: 12 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <div>Génération du RAID en cours...</div>
            </div>
          )}
          <div style={{ display: 'grid', gap: 12 }}>
            {filtered.map(item => {
              const cfg = CAT_CONFIG[item.category]
              return (
                <div key={item.id} style={{
                  background: cfg.bg, border: `1px solid ${cfg.color}33`,
                  borderLeft: `4px solid ${cfg.color}`, borderRadius: 10, padding: 16
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, background: cfg.color, color: '#fff', borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>
                        {cfg.icon} {item.category}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{item.id}</span>
                      <span style={{ fontSize: 11, background: PRIORITY_COLOR[item.priority] + '22', color: PRIORITY_COLOR[item.priority], borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                        {item.priority}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: '#64748b', background: '#0f172a', borderRadius: 4, padding: '2px 8px' }}>
                      {item.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>{item.description}</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
                    <span>👤 {item.owner}</span>
                    <span>📅 {item.due_date}</span>
                    {item.probability && <span>📊 P: {item.probability}</span>}
                    {item.impact && <span>💥 I: {item.impact}</span>}
                  </div>
                  {item.mitigation && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 12px' }}>
                      🛡️ <strong style={{ color: '#94a3b8' }}>Mitigation :</strong> {item.mitigation}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
