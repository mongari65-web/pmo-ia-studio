'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DocToolbarProps {
  projectId: string
  projectName: string
  docType: string
  title: string
  content: string
  generating?: boolean
  onRestore?: (content: string) => void
  onNewVersion?: () => void
  onMessage?: (msg: string) => void
}

export default function DocToolbar({
  projectId, projectName, docType, title, content,
  generating, onRestore, onNewVersion, onMessage
}: DocToolbarProps) {
  const [lastSaved, setLastSaved] = useState<string|null>(null)
  const [version, setVersion] = useState(1)
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [loadingExport, setLoadingExport] = useState<string|null>(null)
  const [timeAgo, setTimeAgo] = useState('')
  const supabase = createClient()

  useEffect(() => { loadHistory() }, [projectId, docType])

  useEffect(() => {
    if (!lastSaved) return
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(lastSaved).getTime()) / 1000)
      if (diff < 10) setTimeAgo('à l\'instant')
      else if (diff < 60) setTimeAgo(`il y a ${diff}s`)
      else if (diff < 3600) setTimeAgo(`il y a ${Math.floor(diff/60)} min`)
      else if (diff < 86400) setTimeAgo(`il y a ${Math.floor(diff/3600)}h`)
      else setTimeAgo(new Date(lastSaved).toLocaleDateString('fr-FR'))
    }
    update()
    const t = setInterval(update, 15000)
    return () => clearInterval(t)
  }, [lastSaved])

  async function loadHistory() {
    // Load current doc timestamp
    const { data: cur } = await supabase.from('documents')
      .select('updated_at, created_at')
      .eq('project_id', projectId).eq('doc_type', docType)
      .order('updated_at', { ascending: false }).limit(1)
    if (cur?.[0]) {
      setLastSaved((cur[0] as any).updated_at || (cur[0] as any).created_at)
    }
    // Load history
    const histType = docType + '_history'
    const { data: hist } = await supabase.from('documents')
      .select('id, title, content, created_at')
      .eq('project_id', projectId).eq('doc_type', histType)
      .order('created_at', { ascending: false }).limit(20)
    if (hist) {
      const valid = hist.filter(h => { try { JSON.parse(h.content); return true } catch { return false } })
      setHistory(valid)
      setVersion(valid.length + 1)
    }
  }

  function notifyLastSaved() {
    setLastSaved(new Date().toISOString())
    loadHistory()
  }

  async function saveToHistory() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !content) return
    const ts = new Date().toISOString().replace('T',' ').slice(0,16)
    await supabase.from('documents').insert({
      project_id: projectId, user_id: user.id,
      doc_type: docType + '_history',
      title: title + ' — v' + version + ' — ' + ts,
      content: JSON.stringify({ saved_at: ts, version, content, doc_type: docType }),
      status: 'archived',
    })
    await loadHistory()
  }

  // ── EXPORTS ─────────────────────────────────────────

  function handlePrint() {
    const win = window.open('', '_blank'); if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;color:#1a1a2e;font-size:13px;line-height:1.7}
    h1{font-size:22px;color:#1F3864;border-bottom:2px solid #2563EB;padding-bottom:8px}
    pre{background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:11px}
    @media print{body{margin:20px}}</style></head><body>
    <h1>${title}</h1>
    <p style="color:#64748b">Projet : <strong>${projectName}</strong> — ${new Date().toLocaleDateString('fr-FR')}</p>
    <pre>${content.replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0,50000)}</pre>
    </body></html>`)
    win.document.close(); win.print()
  }

  function handleWord() {
    const html = `<html><head><meta charset="utf-8">
    <style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;margin:2cm}
    h1{font-size:18pt;color:#1F3864}pre{white-space:pre-wrap;font-size:10pt}</style></head><body>
    <h1>${title}</h1>
    <p><strong>Projet :</strong> ${projectName} | <strong>Date :</strong> ${new Date().toLocaleDateString('fr-FR')}</p><hr/>
    <pre>${content.replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0,50000)}</pre>
    </body></html>`
    const blob = new Blob(['\ufeff'+html], {type:'application/msword'})
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = title.replace(/[^a-zA-Z0-9]/g,'_')+'.doc'
    a.click()
    onMessage?.('✓ Fichier Word téléchargé !')
  }

  function handleExcel() {
    const csv = '\ufeff' + content.split('\n').join('\n')
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'})
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = title.replace(/[^a-zA-Z0-9]/g,'_')+'.csv'
    a.click()
    onMessage?.('✓ Fichier CSV téléchargé !')
  }

  function handlePPTX() {
    const load = () => {
      const PptxGenJS = (window as any).PptxGenJS; if (!PptxGenJS) return
      const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_16x9'
      const s1 = pptx.addSlide(); s1.background = {color:'1F3864'}
      s1.addText(title, {x:0.5,y:1.5,w:9,h:1.5,fontSize:32,bold:true,color:'FFFFFF',align:'center'})
      s1.addText(`${projectName}  |  ${new Date().toLocaleDateString('fr-FR')}`, {x:0.5,y:3.5,w:9,fontSize:16,color:'93C5FD',align:'center'})
      const lines = content.split('\n').filter(l=>l.trim())
      for (let i=0; i<lines.length; i+=12) {
        const s = pptx.addSlide(); s.background = {color:'F8FAFC'}
        s.addText(title, {x:0.3,y:0.2,w:9.4,h:0.5,fontSize:14,bold:true,color:'1F3864'})
        s.addText(lines.slice(i,i+12).join('\n'), {x:0.3,y:0.9,w:9.4,h:5.8,fontSize:11,color:'374151',valign:'top',wrap:true})
      }
      pptx.writeFile({fileName: title.replace(/[^a-zA-Z0-9]/g,'_')+'.pptx'})
      onMessage?.('✓ PowerPoint téléchargé !')
    }
    if ((window as any).PptxGenJS) load()
    else {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/PptxGenJS/3.12.0/pptxgen.bundle.js'
      s.onload = load; document.head.appendChild(s)
    }
  }

  async function handleNotion() {
    setLoadingExport('notion'); onMessage?.('Envoi vers Notion...')
    try {
      const res = await fetch('/api/notion', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({title, content, project_name:projectName, doc_type:docType, date:new Date().toISOString().split('T')[0]})})
      const data = await res.json()
      if (data.success) { onMessage?.('✓ Page créée dans Notion !'); if(data.notion_url) window.open(data.notion_url,'_blank') }
      else onMessage?.('Erreur Notion: '+(data.error||'Vérifiez la configuration'))
    } catch(e:any) { onMessage?.('Erreur: '+e.message) }
    setLoadingExport(null)
  }

  async function handleDrive() {
    setLoadingExport('drive'); onMessage?.('Envoi vers Google Drive...')
    try {
      const res = await fetch('/api/drive', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({title, content, project_name:projectName, doc_type:docType})})
      const data = await res.json()
      if (data.success) { onMessage?.('✓ Sauvegardé dans Drive !'); if(data.file_url) window.open(data.file_url,'_blank') }
      else onMessage?.('Erreur Drive: '+(data.error||'Vérifiez la configuration'))
    } catch(e:any) { onMessage?.('Erreur: '+e.message) }
    setLoadingExport(null)
  }

  async function handleEmail() {
    const subject = encodeURIComponent(title + ' — ' + projectName)
    const body = encodeURIComponent(title + '\n\nProjet : ' + projectName + '\nDate : ' + new Date().toLocaleDateString('fr-FR') + '\n\n' + content.slice(0,2000))
    window.open(`mailto:?subject=${subject}&body=${body}`)
    onMessage?.('✓ Email ouvert !')
  }

  const exports = [
    {id:'print', icon:'🖨️', label:'Imprimer', fn:handlePrint},
    {id:'pdf',   icon:'📄', label:'PDF',       fn:handlePrint},
    {id:'word',  icon:'📝', label:'Word (.doc)', fn:handleWord},
    {id:'excel', icon:'📊', label:'Excel/CSV',  fn:handleExcel},
    {id:'pptx',  icon:'📽️', label:'PowerPoint', fn:handlePPTX},
    {id:'notion',icon:'🔗', label:'Notion',     fn:handleNotion},
    {id:'drive', icon:'☁️', label:'Google Drive',fn:handleDrive},
    {id:'email', icon:'✉️', label:'Email',      fn:handleEmail},
  ]

  return (
    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>

      {/* Save status */}
      {lastSaved && (
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:'rgba(53,200,144,.07)',border:'1px solid rgba(53,200,144,.2)',borderRadius:7,fontSize:11}}>
          <span style={{color:'var(--green)',fontSize:12}}>✓</span>
          <span style={{color:'var(--muted)'}}>Sauvegardé {timeAgo}</span>
          {version > 1 && <span style={{color:'var(--dim)',fontSize:10,background:'var(--ink)',padding:'1px 5px',borderRadius:4}}>v{version}</span>}
        </div>
      )}

      {/* History button */}
      {history.length > 0 && (
        <button onClick={()=>setShowHistory(!showHistory)}
          style={{padding:'5px 10px',background:showHistory?'rgba(8,145,178,.15)':'transparent',border:'1px solid rgba(8,145,178,.3)',borderRadius:7,cursor:'pointer',color:'var(--cyan)',fontSize:11,fontFamily:'var(--mono)'}}>
          📜 {history.length} version{history.length>1?'s':''}
        </button>
      )}

      {/* New version button */}
      {onNewVersion && (
        <button onClick={async()=>{ await saveToHistory(); onNewVersion() }} disabled={generating}
          style={{padding:'5px 10px',background:'rgba(212,168,75,.08)',border:'1px solid rgba(212,168,75,.3)',borderRadius:7,cursor:'pointer',color:'var(--gold2)',fontSize:11,fontFamily:'var(--mono)'}}>
          {generating ? '⏳' : '🔄 Nouvelle version'}
        </button>
      )}

      {/* Export dropdown */}
      <div style={{position:'relative'}}>
        <button onClick={()=>setShowExport(!showExport)}
          style={{padding:'5px 10px',background:showExport?'rgba(255,255,255,.08)':'transparent',border:'1px solid var(--line2)',borderRadius:7,cursor:'pointer',color:'var(--muted)',fontSize:11,fontFamily:'var(--mono)',display:'flex',alignItems:'center',gap:4}}>
          ↗ Exporter <span style={{fontSize:9,opacity:.5}}>{showExport?'▲':'▼'}</span>
        </button>
        {showExport && (
          <>
            <div onClick={()=>setShowExport(false)} style={{position:'fixed',inset:0,zIndex:99}}/>
            <div style={{position:'absolute',right:0,top:'calc(100% + 4px)',background:'var(--ink2)',border:'1px solid var(--line)',borderRadius:10,padding:6,zIndex:100,minWidth:160,boxShadow:'0 8px 32px rgba(0,0,0,.5)'}}>
              <div style={{fontSize:9,color:'var(--dim)',padding:'3px 8px',textTransform:'uppercase',letterSpacing:'.06em'}}>Exporter vers</div>
              {exports.map(e=>(
                <button key={e.id} disabled={loadingExport===e.id}
                  onClick={()=>{setShowExport(false);e.fn()}}
                  style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'7px 10px',background:'transparent',border:'none',cursor:'pointer',borderRadius:6,color:'var(--text)',fontSize:12,textAlign:'left'}}
                  onMouseEnter={el=>(el.currentTarget.style.background='rgba(255,255,255,.06)')}
                  onMouseLeave={el=>(el.currentTarget.style.background='transparent')}>
                  <span style={{fontSize:14}}>{e.icon}</span>
                  <span>{loadingExport===e.id?'Envoi...':e.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <div style={{position:'absolute',top:'100%',right:0,marginTop:8,background:'var(--ink2)',border:'1px solid var(--line)',borderRadius:12,padding:12,zIndex:200,minWidth:340,boxShadow:'0 8px 32px rgba(0,0,0,.5)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--white)'}}>📜 Historique des versions</div>
            <button onClick={()=>setShowHistory(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:18}}>×</button>
          </div>
          {history.map((h,i)=>{
            let info:any={}; try{info=JSON.parse(h.content)}catch{}
            const d = new Date(h.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
            return(
              <div key={h.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--line)'}}>
                <div>
                  <div style={{fontSize:11,color:'var(--text)',fontWeight:500}}>v{history.length-i} — {d}</div>
                  <div style={{fontSize:10,color:'var(--dim)'}}>{info.doc_type||docType}</div>
                </div>
                <button onClick={()=>{
                  if(info.content && onRestore) {
                    try {
                      onRestore(typeof info.content==='string'?info.content:JSON.stringify(info.content))
                      setShowHistory(false)
                      onMessage?.('✓ Version restaurée !')
                    } catch { onMessage?.('Erreur restauration') }
                  }
                }} style={{padding:'4px 10px',background:'rgba(212,168,75,.1)',border:'1px solid rgba(212,168,75,.3)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--gold2)'}}>
                  Restaurer
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
