'use client'
// app/(app)/projects/[id]/documents/page.tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'
import ActionBar from '@/components/ActionBar'
import { useHistory, HistoryEntry } from '@/hooks/useHistory'
import { printSection, exportToPDF, exportToDrive, exportToNotion, exportToGmail } from '@/lib/exportUtils'

interface Document {
  id: string; type: string; title: string; version: string
  status: 'Brouillon' | 'En révision' | 'Approuvé' | 'Archivé'
  author: string; date: string; summary: string; content: string
}

const DOC_TYPES = ['PMP', 'Charte', 'WBS', 'PRA/PCA', 'RETEX', 'CR Réunion', 'Propale', 'Contrat', 'Rapport']
const STATUS_CONFIG = {
  'Brouillon':   { color: '#f59e0b', icon: '📝' },
  'En révision': { color: '#3b82f6', icon: '🔍' },
  'Approuvé':    { color: '#22c55e', icon: '✅' },
  'Archivé':     { color: '#64748b', icon: '📦' },
}

export default function DocumentsPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [project, setProject] = useState<any>(null)
  const [docs, setDocs] = useState<Document[]>([])
  const [selected, setSelected] = useState<Document | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [filter, setFilter] = useState('Tous')
  const { history, saveToHistory, lastEntry } = useHistory(id, 'documents')

  useEffect(() => {
    supabase.from('projects').select('*').eq('id', id).single()
      .then(({ data }) => { if (data) setProject(data) })
  }, [id])

  useEffect(() => {
    if (lastEntry && docs.length === 0) {
      const d = lastEntry.data as any
      if (d?.docs) setDocs(d.docs)
    }
  }, [lastEntry])

  const generateDoc = useCallback(async (type: string) => {
    if (!project) return
    setGenerating(type)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: 'document',
          project_name: project.name,
          doc_type: type,
          prompt: `Génère un document professionnel de type "${type}" pour le projet "${project.name}" (${project.description ?? ''}).
Retourne UNIQUEMENT du JSON:
{"doc":{"id":"DOC-${Date.now()}","type":"${type}","title":"${type} — ${project.name}","version":"v1.0","status":"Brouillon","author":"Chef de Projet","date":"${new Date().toISOString().split('T')[0]}","summary":"Résumé en 2 phrases.","content":"Contenu complet et structuré du document avec tous les chapitres requis pour un ${type} professionnel conforme PMI/PMBOK."}}
Le content doit être complet, structuré, professionnel.`
        })
      })
      const data = await res.json()
      const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
      const newDoc = parsed.doc
      const updated = [newDoc, ...docs.filter(d => d.type !== type || d.title !== newDoc.title)]
      setDocs(updated)
      setSelected(newDoc)
      await saveToHistory(`${type} — ${new Date().toLocaleDateString('fr-FR')}`, { docs: updated })
    } catch (e) { console.error(e) }
    finally { setGenerating(null) }
  }, [project, docs, saveToHistory])

  const loadHistory = (entry: HistoryEntry) => {
    const d = entry.data as any
    if (d?.docs) setDocs(d.docs)
  }

  const filtered = filter === 'Tous' ? docs : docs.filter(d => d.type === filter)

  return (
    <AppLayout>
      <div style={{ padding: '24px 32px', background: '#0a0f1a', minHeight: '100vh', color: '#e2e8f0' }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            // BIBLIOTHÈQUE DOCUMENTAIRE
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>📄 Documents</h1>
        </div>

        <div style={{ margin: '16px 0' }}>
          <ActionBar
            history={history} onLoadHistory={loadHistory}
            historyCount={history.length}
            onPrint={() => selected && printSection('doc-viewer', selected.title)}
            onExportPDF={() => selected && exportToPDF('doc-viewer', selected.title)}
            onExportDrive={() => selected && exportToDrive(selected.content, `${selected.title}.txt`)}
            onExportNotion={() => selected && exportToNotion(selected.title, [{ content: selected.content }])}
            onExportGmail={() => selected && exportToGmail(selected.title, selected.summary + '\n\n' + selected.content)}
          />
        </div>

        {/* Generate buttons per doc type */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {DOC_TYPES.map(type => (
            <button key={type} onClick={() => generateDoc(type)}
              disabled={generating === type}
              style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid #334155',
                background: generating === type ? '#1e3a5f' : '#0f172a',
                color: generating === type ? '#60a5fa' : '#94a3b8',
                cursor: generating === type ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s'
              }}>
              {generating === type ? '⏳' : '⚡'} {type}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, minHeight: 500 }}>
          {/* Document list */}
          <div style={{ background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#1e293b', fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>
              📚 {docs.length} document{docs.length > 1 ? 's' : ''}
            </div>
            {docs.length === 0 && (
              <div style={{ padding: 24, color: '#475569', fontSize: 13, textAlign: 'center' }}>
                Générez votre premier document →
              </div>
            )}
            {docs.map(doc => {
              const cfg = STATUS_CONFIG[doc.status] ?? { color: '#64748b', icon: '📄' }
              return (
                <button key={doc.id} onClick={() => setSelected(doc)} style={{
                  display: 'flex', flexDirection: 'column', gap: 4, width: '100%',
                  padding: '12px 14px', background: selected?.id === doc.id ? '#1e293b' : 'none',
                  border: 'none', borderBottom: '1px solid #0f172a',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                  borderLeft: selected?.id === doc.id ? '3px solid #2563eb' : '3px solid transparent'
                }}>
                  <div style={{ fontSize: 11, color: cfg.color }}>{cfg.icon} {doc.type} · {doc.version}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{doc.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{doc.author} · {doc.date}</div>
                </button>
              )
            })}
          </div>

          {/* Document viewer */}
          <div id="doc-viewer" style={{ background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b', padding: 24 }}>
            {!selected ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#475569' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Sélectionnez un document</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>ou générez-en un nouveau via les boutons ci-dessus</div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{selected.type} · {selected.version}</div>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{selected.title}</h2>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{selected.author} · {selected.date}</div>
                  </div>
                  <span style={{
                    fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600,
                    background: (STATUS_CONFIG[selected.status]?.color ?? '#64748b') + '22',
                    color: STATUS_CONFIG[selected.status]?.color ?? '#64748b'
                  }}>{selected.status}</span>
                </div>
                <div style={{ background: '#1e293b', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>
                  {selected.summary}
                </div>
                <div style={{
                  fontSize: 13, color: '#cbd5e1', lineHeight: 1.8,
                  whiteSpace: 'pre-wrap', maxHeight: 600, overflowY: 'auto',
                  padding: 4
                }}>
                  {selected.content}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
