'use client'
import { useState } from 'react'

interface ExportToolbarProps {
  title: string           // Titre du document à exporter
  content: string         // Contenu texte/JSON à exporter
  projectName: string     // Nom du projet
  docType: string         // Type de document (gantt, wbs, etc.)
  onMessage?: (msg: string) => void
}

export default function ExportToolbar({ title, content, projectName, docType, onMessage }: ExportToolbarProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string|null>(null)

  function msg(m: string) { onMessage?.(m) }

  // ── Print ──────────────────────────────────────────
  function handlePrint() {
    const win = window.open('','_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; color: #1a1a2e; font-size: 13px; line-height: 1.7; }
        h1 { font-size: 22px; color: #1F3864; border-bottom: 2px solid #2563EB; padding-bottom: 8px; }
        h2 { font-size: 16px; color: #2563EB; margin-top: 20px; }
        pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; white-space: pre-wrap; font-size: 11px; }
        @media print { body { margin: 20px; } }
      </style>
    </head><body>
      <h1>${title}</h1>
      <p style="color:#64748b">Projet : <strong>${projectName}</strong> — ${new Date().toLocaleDateString('fr-FR')}</p>
      <pre>${content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
    </body></html>`)
    win.document.close()
    win.print()
  }

  // ── Export PDF ─────────────────────────────────────
  function handlePDF() {
    handlePrint() // print dialog has Save as PDF on Mac/Chrome
    msg('Utilisez "Enregistrer en PDF" dans la fenêtre d\'impression')
  }

  // ── Export Word (.doc) ─────────────────────────────
  function handleWord() {
    const html = `<html><head><meta charset="utf-8">
      <style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;margin:2cm}
      h1{font-size:18pt;color:#1F3864}h2{font-size:14pt;color:#2563EB}</style>
    </head><body>
      <h1>${title}</h1>
      <p><strong>Projet :</strong> ${projectName} | <strong>Date :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
      <hr/>
      <pre style="white-space:pre-wrap;font-size:11pt">${content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
    </body></html>`
    const blob = new Blob(['\ufeff'+html], {type:'application/msword'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = title.replace(/[^a-zA-Z0-9]/g,'_')+'.doc'; a.click()
    URL.revokeObjectURL(url)
    msg('Fichier Word téléchargé !')
  }

  // ── Export Excel ───────────────────────────────────
  function handleExcel() {
    const rows = content.split('\n').map(line => line.split('\t').join(','))
    const csv = '\ufeff' + rows.join('\n')
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = title.replace(/[^a-zA-Z0-9]/g,'_')+'.csv'; a.click()
    URL.revokeObjectURL(url)
    msg('Fichier CSV/Excel téléchargé !')
  }

  // ── Export PowerPoint ──────────────────────────────
  function handlePPTX() {
    const loadPPTX = () => {
      const PptxGenJS = (window as any).PptxGenJS
      if (!PptxGenJS) { msg('Erreur chargement PptxGenJS'); return }
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_16x9'
      // Slide titre
      const slide1 = pptx.addSlide()
      slide1.background = { color: '1F3864' }
      slide1.addText(title, { x:0.5, y:1.5, w:9, h:1.5, fontSize:32, bold:true, color:'FFFFFF', align:'center' })
      slide1.addText(`Projet : ${projectName}  |  ${new Date().toLocaleDateString('fr-FR')}`, { x:0.5, y:3.5, w:9, fontSize:16, color:'93C5FD', align:'center' })
      // Slide contenu (chunked)
      const lines = content.split('\n').filter(l=>l.trim())
      const chunkSize = 12
      for (let i = 0; i < lines.length; i += chunkSize) {
        const slide = pptx.addSlide()
        slide.background = { color: 'F8FAFC' }
        slide.addText(title, { x:0.3, y:0.2, w:9.4, h:0.5, fontSize:14, bold:true, color:'1F3864' })
        const chunk = lines.slice(i, i+chunkSize).join('\n')
        slide.addText(chunk, { x:0.3, y:0.9, w:9.4, h:5.8, fontSize:11, color:'374151', valign:'top', wrap:true })
      }
      pptx.writeFile({ fileName: title.replace(/[^a-zA-Z0-9]/g,'_')+'.pptx' })
      msg('Fichier PowerPoint téléchargé !')
    }
    if ((window as any).PptxGenJS) { loadPPTX() }
    else {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/PptxGenJS/3.12.0/pptxgen.bundle.js'
      s.onload = loadPPTX
      document.head.appendChild(s)
    }
  }

  // ── Notion ─────────────────────────────────────────
  async function handleNotion() {
    setLoading('notion'); msg('Envoi vers Notion...')
    try {
      const res = await fetch('/api/notion', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ title, content, project_name:projectName, doc_type:docType, date:new Date().toISOString().split('T')[0] })
      })
      const data = await res.json()
      if (data.success) {
        msg('✓ Page créée dans Notion !')
        if (data.notion_url) window.open(data.notion_url,'_blank')
      } else { msg('Erreur Notion : '+(data.error||'Inconnu')) }
    } catch(e:any) { msg('Erreur : '+e.message) }
    setLoading(null)
  }

  // ── Google Drive ───────────────────────────────────
  async function handleDrive() {
    setLoading('drive'); msg('Envoi vers Google Drive...')
    try {
      const res = await fetch('/api/drive', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ title, content, project_name:projectName, doc_type:docType })
      })
      const data = await res.json()
      if (data.success) {
        msg('✓ Fichier sauvegardé dans Drive !')
        if (data.file_url) window.open(data.file_url,'_blank')
      } else { msg('Erreur Drive : '+(data.error||'Inconnu')) }
    } catch(e:any) { msg('Erreur : '+e.message) }
    setLoading(null)
  }

  const btnStyle = (active?: boolean) => ({
    display:'flex', alignItems:'center', gap:6, padding:'7px 12px',
    background:active?'rgba(212,168,75,.15)':'rgba(255,255,255,.05)',
    border:'1px solid '+(active?'var(--gold2)':'rgba(255,255,255,.1)'),
    borderRadius:7, cursor:'pointer', color:active?'var(--gold2)':'var(--muted)',
    fontSize:11, fontFamily:'var(--mono)', transition:'all .12s', whiteSpace:'nowrap' as const,
  })

  const actions = [
    { id:'print',  icon:'🖨️',  label:'Imprimer',       fn:handlePrint },
    { id:'pdf',    icon:'📄',  label:'PDF',             fn:handlePDF },
    { id:'word',   icon:'📝',  label:'Word',            fn:handleWord },
    { id:'excel',  icon:'📊',  label:'Excel/CSV',       fn:handleExcel },
    { id:'pptx',   icon:'📽️',  label:'PowerPoint',     fn:handlePPTX },
    { id:'notion', icon:'🔗',  label:'Notion',          fn:handleNotion },
    { id:'drive',  icon:'☁️',  label:'Google Drive',   fn:handleDrive },
  ]

  return (
    <div style={{position:'relative'}}>
      <button onClick={()=>setOpen(!open)} style={{...btnStyle(open), gap:5}}>
        <span>↗</span> Exporter
        <span style={{fontSize:9,opacity:.6}}>{open?'▲':'▼'}</span>
      </button>
      {open&&(
        <>
          <div onClick={()=>setOpen(false)} style={{position:'fixed',inset:0,zIndex:99}}/>
          <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',background:'var(--ink2)',border:'1px solid var(--line)',borderRadius:10,padding:8,zIndex:100,display:'flex',flexDirection:'column',gap:4,minWidth:170,boxShadow:'0 8px 32px rgba(0,0,0,.4)'}}>
            <div style={{fontSize:9,color:'var(--dim)',padding:'2px 8px',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:2}}>Exporter vers</div>
            {actions.map(a=>(
              <button key={a.id} onClick={()=>{setOpen(false);a.fn()}} disabled={loading===a.id}
                style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',background:'transparent',border:'none',cursor:'pointer',borderRadius:6,color:'var(--text)',fontSize:12,transition:'background .1s',textAlign:'left' as const}}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.06)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <span style={{fontSize:14}}>{a.icon}</span>
                <span>{loading===a.id?'Envoi...':a.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
