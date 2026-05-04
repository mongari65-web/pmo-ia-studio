'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

const TYPE_LABELS: Record<string, string> = {
  migration:'Migration', infra:'Infrastructure', reseau:'Réseau', deploiement:'Déploiement',
  pra:'PRA/PCA', solution_ia:'Solution IA', rd_ia:'R&D IA', secu:'Sécurité', devapp:'Dev Agile', transfoSI:'Transfo SI'
}

const DOC_TYPES = [
  { id:'charte',       icon:'📋', label:'Charte de Projet',    color:'var(--purple)' },
  { id:'wbs',          icon:'📊', label:'WBS',                  color:'var(--blue)'   },
  { id:'raid',         icon:'⚠',  label:'Registre RAID',       color:'var(--red)'    },
  { id:'raci',         icon:'🎯', label:'Matrice RACI',         color:'var(--gold)'   },
  { id:'plan_recette', icon:'🧪', label:'Plan de recette',      color:'var(--green)'  },
  { id:'gantt',        icon:'📅', label:'Gantt',                  color:'var(--cyan)'   },
  { id:'pmp',          icon:'📄', label:'Plan Management',      color:'var(--amber)'  },
]

const PROMPTS: Record<string, (p: any) => string> = {
  charte: (p) => `Génère une Charte de Projet complète et professionnelle en français selon PMBOK 7.
PROJET : ${p.name} | TYPE : ${TYPE_LABELS[p.project_type] || p.project_type}
SECTEUR : ${p.sector || 'Non spécifié'} | BUDGET : ${p.budget || 'Non défini'} | DURÉE : ${p.duration || 'Non définie'}
CLIENT : ${p.context?.client_name || 'Non renseigné'}
CONTRAINTES : ${p.context?.constraints?.join(', ') || 'Standard'}
CONTEXTE : ${p.context?.context_text || p.context?.description || 'Projet IT complexe'}
Génère une charte complète avec : objectifs SMART, périmètre IN/OUT, parties prenantes, jalons, budget, risques initiaux, critères d'acceptation, signatures.`,
  wbs: (p) => `Génère un WBS complet à 3 niveaux avec dictionnaire et fiches Work Packages en français selon PMBOK 7.
PROJET : ${p.name} | TYPE : ${TYPE_LABELS[p.project_type] || p.project_type}
SECTEUR : ${p.sector || 'Non spécifié'} | CONTEXTE : ${p.context?.context_text || ''}

IMPORTANT : Réponds en MARKDOWN structuré uniquement. PAS de JSON. Format attendu :
# WBS — [Nom du projet]
## 1. PHASE 1
### 1.1 Lot de travaux
#### 1.1.1 Tâche détaillée
- Durée : X jours
- Responsable : [Rôle]
- Livrable : [Livrable]

Génère toutes les phases, lots et tâches avec leurs durées, responsables et livrables.`,
  raid: (p) => `Génère un Registre RAID complet (Risques, Actions, Issues, Décisions) en français selon PMBOK 7.
PROJET : ${p.name} | TYPE : ${TYPE_LABELS[p.project_type] || p.project_type}
SECTEUR : ${p.sector || 'Non spécifié'} | CONTRAINTES : ${p.context?.constraints?.join(', ') || 'Standard'}
Inclure : 5 risques avec probabilité/impact/mitigation, 5 actions, 3 issues, 3 décisions.`,
  raci: (p) => `Génère une Matrice RACI complète en français selon PMBOK 7.
PROJET : ${p.name} | TYPE : ${TYPE_LABELS[p.project_type] || p.project_type}
SECTEUR : ${p.sector || 'Non spécifié'}
Inclure tous les rôles MOA/MOE et les activités clés. Règle : 1 seul A par activité.`,
  plan_recette: (p) => `Génère un Plan de Recette complet (VABF, VSR, GO/NO-GO) en français selon PMBOK 7.
PROJET : ${p.name} | TYPE : ${TYPE_LABELS[p.project_type] || p.project_type}
SECTEUR : ${p.sector || 'Non spécifié'} | CONTRAINTES : ${p.context?.constraints?.join(', ') || 'Standard'}
Inclure : stratégie, VABF/VSR, gestion anomalies, fiche GO/NO-GO, procédure bascule.`,
  gantt: (p) => `Génère un planning Gantt structuré avec jalons et analyse PERT en français selon PMBOK 7.
PROJET : ${p.name} | TYPE : ${TYPE_LABELS[p.project_type] || p.project_type}
DURÉE : ${p.duration || 'À estimer'} | SECTEUR : ${p.sector || 'Non spécifié'}
Inclure : phases, activités, durées, dépendances, jalons, chemin critique, marge totale.`,
  pmp: (p) => `Génère un Plan de Management de Projet complet en français selon PMBOK 7.
PROJET : ${p.name} | TYPE : ${TYPE_LABELS[p.project_type] || p.project_type}
SECTEUR : ${p.sector || 'Non spécifié'} | BUDGET : ${p.budget || 'Non défini'}
Inclure les 12 domaines de performance PMBOK 7.`,
}

// ── Rendu Markdown simplifié (sans librairie)
function renderMarkdown(text: string): string {
  if (!text) return ''
  return text
    // Titres
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Gras et italique
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Séparateurs
    .replace(/^---$/gm, '<hr>')
    .replace(/^===$/gm, '<hr class="thick">')
    // Tableaux
    .replace(/^\|(.+)\|$/gm, (line) => {
      if (line.includes('---')) return ''
      const cells = line.split('|').filter(c => c.trim())
      const isHeader = false
      return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>'
    })
    // Listes
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="num"><span class="num-n">$1.</span> $2</li>')
    // Sauts de ligne
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[h|l|t|h|p|u])/gm, '')
}

export default function ProjectDetailPage() {
  const [project, setProject]     = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeDoc, setActiveDoc] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genText, setGenText]     = useState('')
  const [viewMode, setViewMode]   = useState<'rendered'|'raw'>('rendered')
  const [fullscreen, setFullscreen] = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailTo, setEmailTo]     = useState('')
  const printRef = useRef<HTMLDivElement>(null)
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const id = params.id as string

  useEffect(() => { loadProject() }, [id])

  async function loadProject() {
    const { data: proj } = await supabase.from('projects').select('*, clients(name)').eq('id', id).single()
    setProject(proj)
    const { data: docs } = await supabase.from('documents').select('*').eq('project_id', id).order('created_at', { ascending: false })
    setDocuments(docs || [])
    setLoading(false)
  }

  async function generateDoc(docType: string) {
    if (!project) return
    setActiveDoc(docType)
    setGenerating(true)
    setGenText('')
    setSaveMsg('')
    setFullscreen(false)

    const promptFn = PROMPTS[docType]
    if (!promptFn) { setGenerating(false); return }

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptFn(project), docType })
      })
      const data = await res.json()
      const text = data.text || data.error || 'Erreur'
      setGenText(text)

      const { data: { user } } = await supabase.auth.getUser()
      if (user && data.text) {
        const docInfo = DOC_TYPES.find(d => d.id === docType)
        await supabase.from('documents').insert({
          project_id: id, user_id: user.id, doc_type: docType,
          title: `${docInfo?.label || docType} — ${project.name}`,
          content: data.text, model_used: 'claude-sonnet-4-5', status: 'generated',
        })
        await loadProject()
        setSaveMsg('Sauvegardé dans Supabase ✓')
      }
    } catch (e: any) { setGenText('Erreur : ' + e.message) }
    setGenerating(false)
  }

  function exportPDF() {
    const docInfo = DOC_TYPES.find(d => d.id === activeDoc)
    const title = `${docInfo?.label || 'Document'} — ${project?.name}`
    const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', Arial, sans-serif; font-size: 13px; color: #111; max-width: 820px; margin: 0 auto; padding: 40px 48px; line-height: 1.75; background: #fff; }

  /* En-tête document */
  .doc-header { border-bottom: 3px solid #C8A84B; padding-bottom: 20px; margin-bottom: 36px; display: flex; justify-content: space-between; align-items: flex-end; }
  .doc-header-left h1 { font-size: 24px; font-weight: 700; color: #0A0A0C; letter-spacing: -.3px; margin-bottom: 6px; }
  .doc-header-left .project { font-size: 14px; color: #5A5A72; font-weight: 500; }
  .doc-header-right { text-align: right; }
  .doc-header-right .brand { font-size: 13px; font-weight: 700; color: #C8A84B; letter-spacing: .08em; text-transform: uppercase; }
  .doc-header-right .meta { font-size: 10px; color: #999; margin-top: 4px; line-height: 1.6; }
  .pmbok-badge { display: inline-block; padding: 2px 8px; background: #1A1A28; color: #C8A84B; border-radius: 4px; font-size: 9px; font-weight: 600; letter-spacing: .08em; margin-top: 4px; }

  /* Titres */
  h1 { font-size: 20px; font-weight: 700; color: #0A0A1A; border-bottom: 2px solid #C8A84B; padding-bottom: 8px; margin: 32px 0 12px; page-break-after: avoid; }
  h2 { font-size: 16px; font-weight: 600; color: #1A1A30; background: linear-gradient(90deg,#C8A84B15 0%,transparent 100%); border-left: 4px solid #C8A84B; padding: 7px 12px; margin: 24px 0 10px; border-radius: 0 4px 4px 0; page-break-after: avoid; }
  h3 { font-size: 14px; font-weight: 600; color: #2A2A40; margin: 18px 0 8px; padding-bottom: 3px; border-bottom: 1px dashed #E0D8C0; page-break-after: avoid; }
  h4 { font-size: 13px; font-weight: 600; color: #4A4A60; font-style: italic; margin: 12px 0 6px; }

  /* Paragraphes */
  p { font-size: 13px; color: #222; line-height: 1.85; margin: 8px 0; }

  /* Listes */
  ul { list-style: none; padding: 0; margin: 10px 0; }
  ul li { font-size: 13px; color: #222; line-height: 1.7; margin: 4px 0; padding: 3px 8px 3px 22px; position: relative; }
  ul li::before { content: '▸'; position: absolute; left: 6px; top: 3px; color: #C8A84B; font-size: 10px; }
  ol { padding-left: 20px; margin: 10px 0; }
  ol li { font-size: 13px; color: #222; line-height: 1.7; margin: 4px 0; }

  /* Tableaux professionnels */
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; page-break-inside: avoid; border-radius: 6px; overflow: hidden; }
  tr:first-child td { background: #1A1A28 !important; color: #C8A84B !important; font-weight: 600 !important; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; padding: 10px 12px !important; border: none !important; }
  tr:nth-child(even) td { background: #F7F5EE; }
  tr:nth-child(odd):not(:first-child) td { background: #FFFFFF; }
  td { border: 1px solid #E8E4D8; padding: 8px 12px; text-align: left; color: #222; vertical-align: middle; }

  /* Éléments inline */
  strong { color: #0A0A0C; font-weight: 700; }
  em { color: #444; font-style: italic; }
  hr { border: none; height: 2px; background: linear-gradient(90deg,#C8A84B,#C8A84B44,transparent); margin: 24px 0; }
  code { background: #F0EDE4; padding: 1px 5px; border-radius: 3px; font-size: 11px; font-family: monospace; color: #5A3E00; }

  /* Pied de page */
  .doc-footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #E0D8C0; display: flex; justify-content: space-between; font-size: 10px; color: #999; }

  @media print {
    body { margin: 0; padding: 24px 32px; }
    h1, h2, h3 { page-break-after: avoid; }
    table { page-break-inside: avoid; }
    .doc-footer { position: fixed; bottom: 20px; left: 32px; right: 32px; }
  }
</style>
</head><body>
<div class="doc-header">
  <div class="doc-header-left">
    <h1>${title}</h1>
    <div class="project">Projet : ${project?.name || ''} ${project?.clients?.name ? '· Client : ' + project.clients.name : ''}</div>
  </div>
  <div class="doc-header-right">
    <div class="brand">PMO-IA Studio</div>
    <div class="meta">Généré le ${new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })}<br>Claude AI · Anthropic</div>
    <div class="pmbok-badge">PMBOK 7</div>
  </div>
</div>
${genText
  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
  .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>')
  .replace(/^---+$/gm, '<hr>')
  .replace(/^\|(.+)\|$/gm, (line) => {
    if (line.includes('---')) return ''
    const cells = line.split('|').filter(c => c.trim())
    return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>'
  })
  .replace(/(<tr>[\s\S]*?<\/tr>)/g, (match) => `<table>${match}</table>`)
  .replace(/<\/table>[\s\S]*?<table>/g, '')
  .replace(/^- (.+)$/gm, '<li>$1</li>')
  .replace(/(<li>[\s\S]*?<\/li>)\n(?!<li>)/g, '$1</ul>\n')
  .replace(/(?<!<\/ul>\n)(<li>)/g, '<ul>$1')
  .replace(/\n\n/g, '<br><br>')
}
<div class="doc-footer">
  <span>PMO-IA Studio · Confidentiel</span>
  <span>${title}</span>
  <span>Généré le ${new Date().toLocaleDateString('fr-FR')}</span>
</div>
</body></html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) {
      win.onload = () => {
        setTimeout(() => { win.print() }, 500)
      }
    }
  }

  function exportText() {
    const docInfo = DOC_TYPES.find(d => d.id === activeDoc)
    const filename = `${docInfo?.label || 'document'}-${project?.name || 'projet'}.txt`
      .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    const blob = new Blob([genText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  async function exportToNotion() {
    if (!genText || !project) return
    const docInfo = DOC_TYPES.find(d => d.id === activeDoc)
    setSaveMsg('Envoi vers Notion...')
    try {
      const res = await fetch('/api/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${docInfo?.label || 'Document'} — ${project.name}`,
          content: genText,
          project_name: project.name,
          doc_type: docInfo?.label || activeDoc,
          client_name: project.clients?.name || project.context?.client_name || '',
          date: new Date().toISOString().split('T')[0],
        })
      })
      const data = await res.json()
      if (data.success) {
        setSaveMsg('✓ Page créée dans Notion !')
        // Sauvegarder l'URL Notion dans Supabase
        if (data.notion_url) {
          await supabase.from('documents')
            .update({ notion_page_id: data.notion_page_id })
            .eq('project_id', id)
            .eq('doc_type', activeDoc || '')
          window.open(data.notion_url, '_blank')
        }
      } else {
        setSaveMsg('Erreur Notion : ' + (data.error || 'Inconnu'))
      }
    } catch (e: any) {
      setSaveMsg('Erreur : ' + e.message)
    }
  }

  async function exportToDrive() {
    if (!genText || !project) return
    const docInfo = DOC_TYPES.find(d => d.id === activeDoc)
    setSaveMsg('Envoi vers Google Drive...')
    try {
      const res = await fetch('/api/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${docInfo?.label || 'Document'} — ${project.name}`,
          content: genText,
          project_name: project.name,
          doc_type: docInfo?.label || activeDoc,
        })
      })
      const data = await res.json()
      if (data.success) {
        setSaveMsg('✓ Fichier sauvegardé dans Drive !')
        if (data.file_url) window.open(data.file_url, '_blank')
      } else {
        setSaveMsg('Erreur Drive : ' + (data.error || 'Inconnu'))
      }
    } catch (e: any) {
      setSaveMsg('Erreur : ' + e.message)
    }
  }

  async function sendByEmail(to: string) {
    if (!genText || !project) return
    const docInfo = DOC_TYPES.find(d => d.id === activeDoc)
    setSaveMsg('Envoi par Gmail...')
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: `${docInfo?.label || 'Document PMI'} — ${project.name}`,
          project_name: project.name,
          doc_type: activeDoc,
          doc_label: docInfo?.label,
          content: genText,
          sender_name: 'PMO-IA Studio',
        })
      })
      const data = await res.json()
      if (data.success) {
        setSaveMsg(`✓ Email envoyé à ${to}`)
      } else {
        setSaveMsg('Erreur Gmail : ' + (data.error || 'Inconnu'))
      }
    } catch (e: any) {
      setSaveMsg('Erreur : ' + e.message)
    }
  }

  if (loading) return <AppLayout><div style={{ textAlign:'center', padding:60, color:'var(--muted)', fontSize:12 }}>Chargement...</div></AppLayout>
  if (!project) return <AppLayout><div style={{ textAlign:'center', padding:60, color:'var(--muted)', fontSize:12 }}>Projet introuvable</div></AppLayout>

  const ctx = project.context || {}
  const activeDocInfo = DOC_TYPES.find(d => d.id === activeDoc)

  return (
    <AppLayout>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <button onClick={() => router.push('/projects')} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12 }}>← Projets</button>
            <span style={{ color:'var(--dim)' }}>›</span>
            <span style={{ fontSize:12, color:'var(--dim)' }}>{TYPE_LABELS[project.project_type] || project.project_type}</span>
          </div>
          <h1 style={{ fontFamily:'var(--syne)', fontSize:20, fontWeight:700, color:'var(--white)', marginBottom:8 }}>{project.name}</h1>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {project.clients?.name && <span className="badge b-gold">{project.clients.name}</span>}
            {project.sector && <span className="badge b-cyan">{project.sector}</span>}
            {project.budget && <span className="badge b-purple">{project.budget}</span>}
            {project.duration && <span className="badge b-amber">{project.duration}</span>}
          </div>
        </div>
        <button onClick={() => router.push('/projects')} style={{ background:'none', border:'1px solid var(--line2)', borderRadius:7, padding:'6px 12px', color:'var(--dim)', cursor:'pointer', fontSize:11, fontFamily:'var(--mono)' }}>
          ← Retour
        </button>
      </div>

      {/* Navigation onglets projet */}
      <div style={{ display:'flex', gap:6, marginBottom:20, borderBottom:'1px solid var(--line)', paddingBottom:12 }}>
        {[
          { label:'📄 Documents',     href:`/projects/${id}` },
          { label:'📚 WBS Dict',      href:`/projects/${id}/wbs-dict` },
          { label:'⚠ RAID',           href:`/projects/${id}/raid` },
          { label:'📅 Jalons',        href:`/projects/${id}/jalons` },
          { label:'📊 PERT',          href:`/projects/${id}/pert` },
          { label:'🧠 Mind Map',      href:`/projects/${id}/mindmap` },
          { label:'💰 Budget EVM',    href:`/projects/${id}/budget` },
          { label:'📅 Gantt',         href:`/projects/${id}/gantt` },
          { label:'📦 Work Packages', href:`/projects/${id}/workpackages` },
        ].map(tab => (
          <button key={tab.href} onClick={() => router.push(tab.href)}
            style={{ padding:'7px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', borderRadius:8, border:'1px solid var(--line2)', background: tab.href === `/projects/${id}` ? 'rgba(200,168,75,.15)' : 'transparent', color: tab.href === `/projects/${id}` ? 'var(--gold2)' : 'var(--muted)', fontWeight: tab.href === `/projects/${id}` ? 600 : 400, transition:'all .12s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {ctx.constraints?.length > 0 && (
        <div style={{ marginBottom:16, display:'flex', gap:6, flexWrap:'wrap' }}>
          {ctx.constraints.map((c: string) => (
            <span key={c} style={{ padding:'2px 8px', borderRadius:20, fontSize:10, background:'rgba(224,80,80,.08)', color:'var(--red)', border:'1px solid rgba(224,80,80,.15)' }}>{c}</span>
          ))}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:20 }}>

        {/* GÉNÉRATEURS SIDEBAR */}
        <div>
          <div style={{ marginBottom:12 }}>
            <div className="sec-label">// Documents PMI</div>
            <h2 style={{ fontFamily:'var(--syne)', fontSize:14, fontWeight:600, color:'var(--white)' }}>Générer</h2>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {DOC_TYPES.map(doc => {
              const existing = documents.find(d => d.doc_type === doc.id)
              return (
                <div key={doc.id}
                  style={{
                    display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                    background: activeDoc === doc.id ? 'rgba(200,168,75,.1)' : 'var(--ink2)',
                    border:`1px solid ${activeDoc === doc.id ? 'var(--gold)' : 'var(--line)'}`,
                    borderRadius:10, cursor: generating ? 'not-allowed' : 'pointer', transition:'all .12s'
                  }}
                  onClick={() => !generating && generateDoc(doc.id)}>
                  <div style={{ width:28, height:28, borderRadius:6, background:`${doc.color}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{doc.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:500, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{doc.label}</div>
                    {existing && <div style={{ fontSize:9, color:'var(--green)', marginTop:1 }}>✓ {new Date(existing.created_at).toLocaleDateString('fr-FR')}</div>}
                  </div>
                  {generating && activeDoc === doc.id
                    ? <div style={{ fontSize:9, color:'var(--gold)' }}>⏳</div>
                    : <div style={{ fontSize:10, color:'var(--gold2)' }}>→</div>}
                </div>
              )
            })}
          </div>

          {/* Documents sauvegardés */}
          {documents.length > 0 && (
            <div style={{ marginTop:20 }}>
              <div className="sec-label" style={{ marginBottom:8 }}>// Historique ({documents.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {documents.map(doc => {
                  const info = DOC_TYPES.find(d => d.id === doc.doc_type)
                  return (
                    <div key={doc.id}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--ink2)', border:'1px solid var(--line)', borderRadius:8, transition:'all .12s' }}>
                      <span style={{ fontSize:13, cursor:'pointer' }} onClick={() => { setActiveDoc(doc.doc_type); setGenText(doc.content); setSaveMsg('') }}>{info?.icon || '📄'}</span>
                      <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => { setActiveDoc(doc.doc_type); setGenText(doc.content); setSaveMsg('') }}>
                        <div style={{ fontSize:10, fontWeight:500, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{info?.label || doc.doc_type}</div>
                        <div style={{ fontSize:9, color:'var(--dim)', marginTop:1 }}>{new Date(doc.created_at).toLocaleDateString('fr-FR')}</div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm(`Supprimer "${info?.label || doc.doc_type}" ?`)) return
                          await supabase.from('documents').delete().eq('id', doc.id)
                          await loadProject()
                          if (activeDoc === doc.doc_type) { setGenText(''); setActiveDoc(null) }
                        }}
                        style={{ background:'rgba(224,80,80,.1)', border:'1px solid rgba(224,80,80,.15)', borderRadius:5, width:22, height:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'var(--red)', flexShrink:0 }}
                        title="Supprimer ce document"
                      >🗑</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ZONE DOCUMENT */}
        <div>
          {(generating || genText) ? (
            <div>
              {/* Toolbar */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
                <div style={{ flex:1, fontSize:13, fontWeight:500, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                  {generating ? (
                    <><span style={{ color:'var(--gold)', fontSize:14 }}>⏳</span> Génération en cours...</>
                  ) : (
                    <><span style={{ fontSize:14 }}>{activeDocInfo?.icon}</span> {activeDocInfo?.label}</>
                  )}
                </div>
                {genText && !generating && (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>

                    {/* Toggle Rendu / Brut */}
                    <div style={{ display:'flex', background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:8, overflow:'hidden' }}>
                      <button onClick={() => setViewMode('rendered')}
                        style={{ padding:'8px 14px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', border:'none', background: viewMode==='rendered' ? 'var(--ink4)' : 'transparent', color: viewMode==='rendered' ? 'var(--text)' : 'var(--dim)', transition:'all .12s', display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:14 }}>✦</span> Rendu
                      </button>
                      <button onClick={() => setViewMode('raw')}
                        style={{ padding:'8px 14px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', border:'none', background: viewMode==='raw' ? 'var(--ink4)' : 'transparent', color: viewMode==='raw' ? 'var(--text)' : 'var(--dim)', transition:'all .12s', display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:14 }}>{'</>'}</span> Brut
                      </button>
                    </div>

                    {/* Plein écran */}
                    <button onClick={() => setFullscreen(!fullscreen)}
                      style={{ padding:'8px 14px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:8, color:'var(--muted)', transition:'all .12s', display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:15 }}>{fullscreen ? '⊡' : '⊞'}</span>
                      {fullscreen ? 'Réduire' : 'Plein écran'}
                    </button>

                    {/* Copier */}
                    <button onClick={() => { navigator.clipboard?.writeText(genText); setSaveMsg('Copié !') }}
                      style={{ padding:'8px 14px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:8, color:'var(--muted)', transition:'all .12s', display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:15 }}>⎘</span> Copier
                    </button>

                    {/* Export .txt */}
                    <button onClick={exportText}
                      style={{ padding:'8px 14px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', background:'var(--ink3)', border:'1px solid var(--line2)', borderRadius:8, color:'var(--muted)', transition:'all .12s', display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:15 }}>↓</span> .txt
                    </button>

                    {/* PDF */}
                    <button onClick={exportPDF}
                      title="Exporter en PDF"
                      style={{ padding:'8px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', background:'rgba(200,168,75,.15)', border:'1px solid rgba(200,168,75,.4)', borderRadius:8, color:'var(--gold2)', fontWeight:600, transition:'all .15s', display:'flex', alignItems:'center', gap:8 }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(200,168,75,.28)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(200,168,75,.15)'}>
                      {/* Icône PDF officielle */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#C8A84B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <polyline points="14,2 14,8 20,8" stroke="#C8A84B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <line x1="8" y1="13" x2="16" y2="13" stroke="#C8A84B" strokeWidth="1.8" strokeLinecap="round"/>
                        <line x1="8" y1="17" x2="16" y2="17" stroke="#C8A84B" strokeWidth="1.8" strokeLinecap="round"/>
                        <line x1="10" y1="9" x2="12" y2="9" stroke="#C8A84B" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                      PDF
                    </button>

                    {/* Notion */}
                    <button onClick={exportToNotion}
                      title="Exporter vers Notion"
                      style={{ padding:'8px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.15)', borderRadius:8, color:'var(--white)', fontWeight:600, transition:'all .15s', display:'flex', alignItems:'center', gap:8 }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.12)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.06)'}>
                      {/* Logo Notion officiel */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.62c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
                      </svg>
                      Notion
                    </button>

                    {/* Google Drive */}
                    <button onClick={exportToDrive}
                      title="Sauvegarder dans Google Drive"
                      style={{ padding:'8px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', background:'rgba(66,133,244,.1)', border:'1px solid rgba(66,133,244,.3)', borderRadius:8, color:'#4A9EF0', fontWeight:600, transition:'all .15s', display:'flex', alignItems:'center', gap:8 }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(66,133,244,.2)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(66,133,244,.1)'}>
                      {/* Logo Google Drive officiel */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M8.267 3h7.466L22 15h-7.467L8.267 3z" fill="#4285F4" opacity=".8"/>
                        <path d="M2 15l3.733-6.5L9.2 15H2z" fill="#0F9D58" opacity=".9"/>
                        <path d="M9.2 15l3.733 6h7.534L17 15H9.2z" fill="#FBBC05" opacity=".9"/>
                        <path d="M2 15h7.2l3.733 6H5.933L2 15z" fill="#34A853" opacity=".7"/>
                        <path d="M12.933 21l3.534-6H22l-3.533 6h-5.534z" fill="#EA4335" opacity=".7"/>
                        <path d="M8.267 3L2 15l3.533-6.5L8.267 3z" fill="#0F9D58" opacity=".5"/>
                      </svg>
                      Drive
                    </button>

                    {/* Gmail */}
                    <button onClick={() => setShowEmailModal(true)}
                      title="Envoyer par Gmail"
                      style={{ padding:'8px 16px', fontSize:12, fontFamily:'var(--mono)', cursor:'pointer', background:'rgba(234,67,53,.1)', border:'1px solid rgba(234,67,53,.3)', borderRadius:8, color:'#EA4335', fontWeight:600, transition:'all .15s', display:'flex', alignItems:'center', gap:8 }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(234,67,53,.2)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(234,67,53,.1)'}>
                      {/* Logo Gmail officiel */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="white" stroke="#E8E8E8" strokeWidth=".5"/>
                        <path d="M2 6l10 7 10-7" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M2 6l10 7" stroke="#EA4335" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M22 6l-10 7" stroke="#EA4335" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M2 6v12h20V6" stroke="#E8E8E8" strokeWidth=".5"/>
                        <path d="M2 6l10 7 10-7V4H2v2z" fill="#EA4335" opacity=".15"/>
                      </svg>
                      Gmail
                    </button>

                  </div>
                )}
              </div>

              {saveMsg && <div style={{ fontSize:11, color:'var(--green)', marginBottom:8 }}>✓ {saveMsg}</div>}

              {/* Document rendu */}
              {generating ? (
                <div style={{ background:'var(--ink2)', border:'1px solid var(--line)', borderRadius:12, padding:40, textAlign:'center' }}>
                  <div style={{ fontSize:28, marginBottom:16, opacity:.5 }}>⏳</div>
                  <div style={{ fontSize:13, color:'var(--muted)' }}>Génération en cours via Claude AI...</div>
                  <div style={{ fontSize:11, color:'var(--dim)', marginTop:6 }}>10 à 30 secondes selon la complexité du document</div>
                </div>
              ) : viewMode === 'rendered' ? (
                <div ref={printRef}
                  style={{
                    background:'#FAFAF8', borderRadius:12, padding:'32px 40px',
                    maxHeight: fullscreen ? 'calc(100vh - 200px)' : '70vh',
                    overflowY:'auto', border:'1px solid #E0E0D8',
                    position: fullscreen ? 'fixed' : 'relative',
                    inset: fullscreen ? '80px 20px 20px' : 'auto',
                    zIndex: fullscreen ? 50 : 'auto',
                    boxShadow: fullscreen ? '0 20px 60px rgba(0,0,0,.5)' : 'none',
                  }}>
                  {fullscreen && (
                    <button onClick={() => setFullscreen(false)}
                      style={{ position:'sticky', top:0, float:'right', background:'#1A1A28', border:'1px solid #444', borderRadius:6, padding:'4px 10px', color:'#ccc', cursor:'pointer', fontSize:11, fontFamily:'monospace', marginBottom:8, zIndex:60 }}>
                      ✕ Fermer
                    </button>
                  )}
                  <style>{`
                    .md-doc { color: #111; font-family: 'Georgia', serif; line-height: 1.8; }
                    .md-doc h1 { font-size: 22px; font-weight: 700; color: #0A0A1A; border-bottom: 3px solid #C8A84B; padding-bottom: 10px; margin: 32px 0 14px; display: flex; align-items: center; gap: 10px; }
                    .md-doc h1::before { content: ''; display: inline-block; width: 4px; height: 22px; background: #C8A84B; border-radius: 2px; flex-shrink: 0; }
                    .md-doc h2 { font-size: 17px; font-weight: 600; color: #1A1A30; background: linear-gradient(90deg,#C8A84B18 0%,transparent 100%); border-left: 4px solid #C8A84B; padding: 8px 12px; margin: 24px 0 10px; border-radius: 0 6px 6px 0; }
                    .md-doc h3 { font-size: 14px; font-weight: 600; color: #2A2A40; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px dashed #E0D8C0; }
                    .md-doc h4 { font-size: 13px; font-weight: 600; color: #4A4A60; font-style: italic; margin: 14px 0 6px; }
                    .md-doc p { font-size: 13px; color: #222; line-height: 1.9; margin: 8px 0; }
                    .md-doc ul { padding-left: 0; margin: 10px 0; list-style: none; }
                    .md-doc ul li { font-size: 13px; color: #222; line-height: 1.7; margin: 4px 0; padding: 4px 10px 4px 26px; position: relative; border-radius: 4px; }
                    .md-doc ul li::before { content: '▸'; position: absolute; left: 8px; top: 4px; color: #C8A84B; font-size: 11px; }
                    .md-doc ol { padding-left: 20px; margin: 10px 0; }
                    .md-doc ol li { font-size: 13px; color: #222; line-height: 1.7; margin: 4px 0; }
                    .md-doc table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
                    .md-doc tr:first-child td { background: linear-gradient(135deg,#1A1A28 0%,#2A2A40 100%) !important; color: #C8A84B !important; font-weight: 600 !important; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; padding: 10px 12px !important; border: none !important; }
                    .md-doc tr:nth-child(even) td { background: #F7F5EE; }
                    .md-doc tr:nth-child(odd):not(:first-child) td { background: #FFFFFF; }
                    .md-doc tr:hover:not(:first-child) td { background: #FFF8E8 !important; }
                    .md-doc td { border: 1px solid #E8E4D8; padding: 8px 12px; text-align: left; color: #222; vertical-align: middle; }
                    .md-doc hr { border: none; margin: 24px 0; height: 2px; background: linear-gradient(90deg,#C8A84B 0%,#C8A84B44 50%,transparent 100%); }
                    .md-doc strong { color: #0A0A0C; font-weight: 700; }
                    .md-doc em { color: #444; font-style: italic; }
                    .md-doc code { background: #F0EDE4; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-family: monospace; color: #5A3E00; border: 1px solid #E0D8C0; }
                    .md-doc blockquote { border-left: 4px solid #C8A84B; margin: 16px 0; padding: 12px 16px; background: #FFFBEF; border-radius: 0 8px 8px 0; font-size: 13px; color: #444; }
                  `}</style>
                  <div className="md-doc" dangerouslySetInnerHTML={{ __html:
                    genText
                      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                      .replace(/^# (.+)$/gm,'<h1>$1</h1>')
                      .replace(/^## (.+)$/gm,'<h2>$1</h2>')
                      .replace(/^### (.+)$/gm,'<h3>$1</h3>')
                      .replace(/^#### (.+)$/gm,'<h4>$1</h4>')
                      .replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
                      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
                      .replace(/\*(.+?)\*/g,'<em>$1</em>')
                      .replace(/`(.+?)`/g,'<code>$1</code>')
                      .replace(/^---+$/gm,'<hr>')
                      .replace(/^\|(.+)\|$/gm,(line) => {
                        if(line.includes('---|')) return ''
                        const cells = line.split('|').filter(c=>c.trim())
                        return '<tr>'+cells.map(c=>`<td>${c.trim()}</td>`).join('')+'</tr>'
                      })
                      .replace(/(<tr>[\s\S]*?<\/tr>)/g,(m)=>`<table>${m}</table>`)
                      .replace(/<\/table>\n<table>/g,'')
                      .replace(/^[-*] (.+)$/gm,'<li>$1</li>')
                      .replace(/(<li>[\s\S]*?<\/li>)\n(?!<li>)/g,'$1</ul>\n')
                      .replace(/(?<!<\/ul>\n)(<li>)/g,'<ul>$1')
                      .replace(/\n\n/g,'</p><p>')
                      .replace(/^(?!<[htpu])/gm,(m)=>m)
                  }} />
                </div>
              ) : (
                <div style={{ background:'#0D0D14', border:'1px solid var(--line)', borderRadius:12, padding:24, maxHeight:'70vh', overflowY:'auto', fontFamily:'var(--mono)', fontSize:11, color:'#C8D8C0', lineHeight:1.7, whiteSpace:'pre-wrap', letterSpacing:'.02em' }}>
                  {genText}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, background:'var(--ink2)', border:'1px solid var(--line)', borderRadius:12, flexDirection:'column', gap:16 }}>
              <div style={{ fontSize:32, opacity:.3 }}>📄</div>
              <div style={{ fontSize:13, color:'var(--muted)', textAlign:'center', maxWidth:300, lineHeight:1.7 }}>
                Sélectionnez un type de document dans la liste à gauche pour le générer avec l'IA.
              </div>
              <div style={{ fontSize:11, color:'var(--dim)' }}>7 documents PMI disponibles</div>
            </div>
          )}
        </div>
      </div>

      {/* Modal envoi Gmail */}
      {showEmailModal && (
        <div className="modal-overlay" onClick={() => setShowEmailModal(false)}>
          <div className="modal" style={{ width:480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="white" stroke="#E8E8E8" strokeWidth=".5"/>
                  <path d="M2 6l10 7 10-7" stroke="#EA4335" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <div style={{ fontFamily:'var(--syne)', fontSize:16, fontWeight:700, color:'var(--white)' }}>Envoyer par Gmail</div>
              </div>
              <button onClick={() => setShowEmailModal(false)} style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:22 }}>×</button>
            </div>

            <div style={{ padding:'12px 16px', background:'rgba(212,168,75,.06)', border:'1px solid rgba(212,168,75,.2)', borderRadius:9, marginBottom:20, fontSize:12, color:'var(--muted)' }}>
              <div style={{ fontWeight:600, color:'var(--gold2)', marginBottom:4 }}>Document à envoyer :</div>
              <div>{DOC_TYPES.find(d => d.id === activeDoc)?.label} — {project?.name}</div>
            </div>

            <div className="fg">
              <label className="fl">Adresse email du destinataire *</label>
              <input className="fi" type="email"
                placeholder="client@entreprise.fr"
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && emailTo.includes('@')) {
                    sendByEmail(emailTo)
                    setShowEmailModal(false)
                    setEmailTo('')
                  }
                }} />
              <div style={{ fontSize:10, color:'var(--dim)', marginTop:4 }}>Appuyer sur Entrée ou cliquer Envoyer</div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn-gold" style={{ flex:1 }}
                onClick={() => {
                  if (!emailTo.includes('@')) return
                  sendByEmail(emailTo)
                  setShowEmailModal(false)
                  setEmailTo('')
                }}
                disabled={!emailTo.includes('@')}>
                <span style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
                  ✉ Envoyer
                </span>
              </button>
              <button className="btn-ghost" onClick={() => { setShowEmailModal(false); setEmailTo('') }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
