'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

interface GanttTask {
  id: string
  wbs_id: string
  name: string
  role: string
  start: string
  end: string
  progress: number
  type: 'task' | 'milestone' | 'group'
  dependencies: string[]
  color?: string
}

const NAV = ['Documents','WBS Dict','RAID','Jalons','PERT','Mind Map','Budget EVM','Gantt','Work Packages']
const NAV_ICONS: Record<string,string> = {'Documents':'📄','WBS Dict':'📚','RAID':'⚠','Jalons':'📅','PERT':'📊','Mind Map':'🧠','Budget EVM':'💰','Gantt':'📅','Work Packages':'📦'}
function navHref(label: string, id: string): string {
  const m: Record<string,string> = {
    'Documents':'/projects/'+id,'WBS Dict':'/projects/'+id+'/wbs-dict',
    'RAID':'/projects/'+id+'/raid','Jalons':'/projects/'+id+'/jalons',
    'PERT':'/projects/'+id+'/pert','Mind Map':'/projects/'+id+'/mindmap',
    'Budget EVM':'/projects/'+id+'/budget','Gantt':'/projects/'+id+'/gantt',
    'Work Packages':'/projects/'+id+'/workpackages',
  }
  return m[label]||'/projects/'+id
}

const COLORS = ['#2563EB','#059669','#D97706','#7C3AED','#DC2626','#0891B2','#65A30D','#C2410C']

function addDays(date: string, days: number): string {
  const d = new Date(date); d.setDate(d.getDate()+days); return d.toISOString().split('T')[0]
}
function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime()-new Date(a).getTime())/86400000)+1)
}
function fmt(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})
}
function toX(date: string, minDate: Date, dayW: number): number {
  return Math.max(0,(new Date(date).getTime()-minDate.getTime())/86400000)*dayW
}

export default function GanttPage() {
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState('')
  const [selected, setSelected] = useState<string|null>(null)
  const [drag, setDrag] = useState<{id:string,type:'move'|'end',sx:number,os:string,oe:string}|null>(null)
  const [zoom, setZoom] = useState(28)
  const [wbsContent, setWbsContent] = useState('')
  const [lastSaved, setLastSaved] = useState<string|null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const params = useParams(); const router = useRouter()
  const supabase = createClient(); const id = params.id as string

  useEffect(()=>{loadData()},[id])

  async function loadData() {
    try {
      const {data:proj} = await supabase.from('projects').select('*').eq('id',id).single()
      setProject(proj)
      const {data:wbs} = await supabase.from('documents').select('content').eq('project_id',id).eq('doc_type','wbs').order('created_at',{ascending:false}).limit(1)
      if(wbs?.[0]) setWbsContent(wbs[0].content||'')
      const {data:docs} = await supabase.from('documents').select('content,updated_at').eq('project_id',id).eq('doc_type','gantt').order('created_at',{ascending:false}).limit(1)
      if(docs?.[0]) {
        try { setTasks(JSON.parse(docs[0].content)); setLastSaved((docs[0] as any).updated_at||null) } catch {}
      }
      const {data:hist} = await supabase.from('documents').select('id,title,content,created_at').eq('project_id',id).eq('doc_type','gantt_history').order('created_at',{ascending:false}).limit(20)
      if(hist) setHistory(hist.filter(h=>{ try{JSON.parse(h.content);return true}catch{return false} }))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function save(t: GanttTask[]) {
    const {data:{user}} = await supabase.auth.getUser(); if(!user) return
    const {error} = await supabase.from('documents').upsert({
      project_id:id, user_id:user.id, doc_type:'gantt',
      title:'Gantt — '+(project?.name||''), content:JSON.stringify(t), status:'generated',
    },{onConflict:'project_id,doc_type'})
    if(!error) setLastSaved(new Date().toISOString())
  }

  async function saveHistory(t: GanttTask[]) {
    const {data:{user}} = await supabase.auth.getUser(); if(!user) return
    const ts = new Date().toISOString().replace('T',' ').slice(0,16)
    await supabase.from('documents').insert({
      project_id:id, user_id:user.id, doc_type:'gantt_history',
      title:'Gantt v'+(history.length+1)+' — '+ts,
      content:JSON.stringify({saved_at:ts, version:history.length+1, content:t}),
      status:'archived',
    })
    loadData()
  }

  async function generateFromWBS() {
    setGenerating(true); setGenMsg('Génération du Gantt...')
    if(tasks.length>0) await saveHistory(tasks)
    let wbsText = project?.name||'Projet'
    if(wbsContent) {
      try {
        const stripped=wbsContent.replace(/```json/gi,'').replace(/```/g,'').trim()
        const m=stripped.match(/\{[\s\S]*\}/)
        if(m){try{const obj=JSON.parse(m[0]);if(obj.wbs)wbsText=Object.values(obj.wbs as Record<string,any>).slice(0,20).map((v:any)=>(v.id||'')+' '+(v.name||'')).join('\n')}catch{wbsText=stripped.slice(0,1500)}}
        else wbsText=wbsContent.replace(/[#*`]/g,'').slice(0,1500)
      } catch { wbsText=project?.name||'Projet' }
    }
    const today=new Date().toISOString().split('T')[0]
    const prompt='Génère un planning Gantt PMBOK 7 pour ce projet.\nProjet: '+(project?.name||'')+'\nWBS:\n'+wbsText+'\n\nRègles:\n- 8 à 12 tâches + 2-3 jalons\n- start/end format YYYY-MM-DD à partir de '+today+'\n- type: "task", "milestone" ou "group"\n- progress: 0\n- dependencies: tableau ids\nRéponds UNIQUEMENT avec le tableau JSON (pas de markdown):\n[{"id":"T1","wbs_id":"1.1","name":"Cadrage","role":"Chef de Projet","start":"'+today+'","end":"'+addDays(today,10)+'","progress":0,"type":"task","dependencies":[]},{"id":"M1","wbs_id":"M1","name":"Lancement","role":"","start":"'+addDays(today,10)+'","end":"'+addDays(today,10)+'","progress":0,"type":"milestone","dependencies":["T1"]}]'
    try {
      const res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,maxTokens:4000})})
      const data=await res.json(); const text=data.text||''
      const cb=text.match(/```(?:json)?\s*([\s\S]*?)```/); const jsonStr=cb?cb[1].trim():text
      const si=jsonStr.indexOf('['),ei=jsonStr.lastIndexOf(']')
      if(si===-1||ei===-1) throw new Error('Format inattendu')
      const parsed:GanttTask[]=JSON.parse(jsonStr.slice(si,ei+1))
      setTasks(parsed); await save(parsed)
      setGenMsg(parsed.length+' éléments générés !')
    } catch(e:any){setGenMsg('Erreur: '+e.message)}
    setGenerating(false); setTimeout(()=>setGenMsg(''),5000)
  }

  function addTask() {
    const today=new Date().toISOString().split('T')[0]
    const t:GanttTask={id:'T'+Date.now(),wbs_id:(tasks.length+1)+'.0',name:'Nouvelle tâche',role:'',start:today,end:addDays(today,5),progress:0,type:'task',dependencies:[],color:COLORS[tasks.length%COLORS.length]}
    const u=[...tasks,t]; setTasks(u); save(u); setSelected(t.id)
  }
  function addMilestone() {
    const today=new Date().toISOString().split('T')[0]
    const m:GanttTask={id:'M'+Date.now(),wbs_id:'M'+(tasks.length+1),name:'Jalon',role:'',start:today,end:today,progress:0,type:'milestone',dependencies:[]}
    const u=[...tasks,m]; setTasks(u); save(u); setSelected(m.id)
  }
  function deleteTask(tid:string) {
    const u=tasks.filter(t=>t.id!==tid).map(t=>({...t,dependencies:t.dependencies.filter(d=>d!==tid)}))
    setTasks(u); save(u); setSelected(null)
  }
  function updateTask(tid:string,field:string,value:any) {
    const u=tasks.map(t=>t.id!==tid?t:{...t,[field]:value}); setTasks(u); save(u)
  }
  function toggleDep(tid:string,depId:string) {
    const t=tasks.find(t=>t.id===tid); if(!t) return
    const deps=t.dependencies.includes(depId)?t.dependencies.filter(d=>d!==depId):[...t.dependencies,depId]
    updateTask(tid,'dependencies',deps)
  }

  // Export functions
  function handleExport(type: string) {
    if(type==='print'||type==='pdf') {
      const win=window.open('','_blank'); if(!win) return
      const rows=tasks.map(t=>`<tr><td>${t.wbs_id}</td><td>${t.name}</td><td>${t.role}</td><td>${fmt(t.start)}</td><td>${fmt(t.end)}</td><td>${daysBetween(t.start,t.end)}j</td><td>${t.progress}%</td></tr>`).join('')
      win.document.write(`<!DOCTYPE html><html><head><title>Gantt — ${project?.name}</title><style>body{font-family:Arial;margin:40px}table{width:100%;border-collapse:collapse}th{background:#1F3864;color:white;padding:8px}td{padding:6px;border:1px solid #ddd}@media print{body{margin:10px}}</style></head><body><h1>Gantt — ${project?.name}</h1><p>Exporté le ${new Date().toLocaleDateString('fr-FR')}</p><table><tr><th>WBS</th><th>Tâche</th><th>Rôle</th><th>Début</th><th>Fin</th><th>Durée</th><th>%</th></tr>${rows}</table></body></html>`)
      win.document.close(); win.print()
    } else if(type==='word') {
      const rows=tasks.map(t=>`<tr><td>${t.wbs_id}</td><td>${t.name}</td><td>${t.role}</td><td>${fmt(t.start)}</td><td>${fmt(t.end)}</td><td>${t.progress}%</td></tr>`).join('')
      const html=`<html><head><meta charset="utf-8"></head><body><h1>Gantt — ${project?.name}</h1><table border="1">${rows}</table></body></html>`
      const a=document.createElement('a'); a.href='data:application/msword,'+encodeURIComponent(html)
      a.download='Gantt-'+(project?.name||'projet')+'.doc'; a.click()
    } else if(type==='excel') {
      const csv='\uFEFFWBS;Tâche;Rôle;Début;Fin;Durée;Avancement\n'+tasks.map(t=>[t.wbs_id,t.name,t.role,t.start,t.end,daysBetween(t.start,t.end)+'j',t.progress+'%'].join(';')).join('\n')
      const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv)
      a.download='Gantt-'+(project?.name||'projet')+'.csv'; a.click()
    } else if(type==='email') {
      const body=encodeURIComponent('Gantt — '+project?.name+'\n\n'+tasks.map(t=>t.wbs_id+' | '+t.name+' | '+fmt(t.start)+' → '+fmt(t.end)).join('\n'))
      window.open('mailto:?subject='+encodeURIComponent('Gantt — '+project?.name)+'&body='+body)
    }
    setGenMsg('✓ Export '+type+' effectué !')
    setTimeout(()=>setGenMsg(''),3000)
  }

  const {minDate,totalDays}=useMemo(()=>{
    if(!tasks.length){const m=new Date();m.setDate(m.getDate()-3);return{minDate:m,totalDays:90}}
    const starts=tasks.map(t=>new Date(t.start)); const ends=tasks.map(t=>new Date(t.end))
    const min=new Date(Math.min(...starts.map(d=>d.getTime()))); min.setDate(min.getDate()-3)
    const max=new Date(Math.max(...ends.map(d=>d.getTime()))); max.setDate(max.getDate()+10)
    return{minDate:min,totalDays:Math.ceil((max.getTime()-min.getTime())/86400000)}
  },[tasks])

  const weeks=useMemo(()=>{
    const ws:{label:string,x:number,month:boolean}[]=[]
    const cur=new Date(minDate)
    for(let i=0;i<totalDays;i++){
      const x=i*zoom
      if(cur.getDay()===1) ws.push({label:cur.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}),x,month:false})
      if(cur.getDate()===1) ws.push({label:cur.toLocaleDateString('fr-FR',{month:'long',year:'2-digit'}),x,month:true})
      cur.setDate(cur.getDate()+1)
    }
    return ws
  },[minDate,totalDays,zoom])

  const ROW_H=36; const LEFT_W=300
  const todayX=toX(new Date().toISOString().split('T')[0],minDate,zoom)

  function onMD(e:React.MouseEvent,tid:string,type:'move'|'end'){
    e.preventDefault(); e.stopPropagation()
    const t=tasks.find(t=>t.id===tid); if(!t) return
    setDrag({id:tid,type,sx:e.clientX,os:t.start,oe:t.end}); setSelected(tid)
  }
  function onMM(e:React.MouseEvent){
    if(!drag) return
    const dd=Math.round((e.clientX-drag.sx)/zoom); if(dd===0) return
    setTasks(prev=>prev.map(t=>{
      if(t.id!==drag.id) return t
      if(drag.type==='move') return{...t,start:addDays(drag.os,dd),end:addDays(drag.oe,dd)}
      const ne=addDays(drag.oe,dd); return ne>t.start?{...t,end:ne}:t
    }))
  }
  function onMU(){if(drag){save(tasks);setDrag(null)}}

  const sel=tasks.find(t=>t.id===selected)
  const ah='/projects/'+id+'/gantt'

  if(loading) return <AppLayout><div style={{textAlign:'center',padding:60,color:'var(--muted)'}}>Chargement...</div></AppLayout>

  return (
    <AppLayout>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <button onClick={()=>router.push('/projects/'+id)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:12}}>← Projet</button>
            <span style={{color:'var(--dim)'}}>›</span>
            <span style={{fontSize:12,color:'var(--dim)'}}>{project?.name}</span>
          </div>
          <div className="sec-label">// Planning</div>
          <h1 className="sec-title" style={{marginBottom:4}}>📅 Diagramme de Gantt</h1>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {/* Save status */}
          {lastSaved&&<div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:'rgba(53,200,144,.07)',border:'1px solid rgba(53,200,144,.2)',borderRadius:7,fontSize:11}}>
            <span style={{color:'var(--green)'}}>✓</span>
            <span style={{color:'var(--muted)'}}>Sauvegardé</span>
          </div>}
          {/* History */}
          {history.length>0&&<button onClick={()=>setShowHistory(!showHistory)} style={{padding:'5px 10px',background:'transparent',border:'1px solid rgba(8,145,178,.3)',borderRadius:7,cursor:'pointer',color:'var(--cyan)',fontSize:11}}>
            📜 {history.length} version{history.length>1?'s':''}
          </button>}
          {/* Export menu */}
          <div style={{position:'relative'}}>
            <select onChange={e=>{if(e.target.value){handleExport(e.target.value);e.target.value=''}}} style={{padding:'5px 10px',background:'var(--ink2)',border:'1px solid var(--line2)',borderRadius:7,cursor:'pointer',color:'var(--muted)',fontSize:11}}>
              <option value="">↗ Exporter</option>
              <option value="print">🖨️ Imprimer / PDF</option>
              <option value="word">📝 Word</option>
              <option value="excel">📊 Excel/CSV</option>
              <option value="email">✉️ Email</option>
            </select>
          </div>
          <div style={{display:'flex',gap:4,alignItems:'center',background:'var(--ink2)',border:'1px solid var(--line2)',borderRadius:8,padding:'0 6px'}}>
            <button onClick={()=>setZoom(z=>Math.max(10,z-6))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:16,padding:'4px 6px'}}>−</button>
            <span style={{fontSize:10,color:'var(--dim)',minWidth:40,textAlign:'center'}}>{zoom}px/j</span>
            <button onClick={()=>setZoom(z=>Math.min(80,z+6))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:16,padding:'4px 6px'}}>+</button>
          </div>
          <button onClick={addMilestone} className="btn-ghost" style={{fontSize:11,color:'var(--amber)',borderColor:'rgba(245,184,64,.3)'}}>◆ Jalon</button>
          <button onClick={addTask} className="btn-ghost" style={{fontSize:11}}>+ Tâche</button>
          <button onClick={generateFromWBS} className="btn-gold" disabled={generating} style={{fontSize:11}}>{generating?'Génération...':tasks.length>0?'🔄 Nouvelle version':'⚡ Générer depuis WBS'}</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{display:'flex',gap:5,marginBottom:16,borderBottom:'1px solid var(--line)',paddingBottom:12,flexWrap:'wrap'}}>
        {NAV.map(label=>{const href=navHref(label,id);return(
          <button key={href} onClick={()=>router.push(href)} style={{padding:'6px 12px',fontSize:11,cursor:'pointer',borderRadius:8,border:'1px solid var(--line2)',background:href===ah?'rgba(212,168,75,.15)':'transparent',color:href===ah?'var(--gold2)':'var(--muted)',fontWeight:href===ah?600:400,transition:'all .12s',fontFamily:'var(--mono)'}}>
            {NAV_ICONS[label]||''} {label}
          </button>
        )})}
      </div>

      {/* Messages */}
      {genMsg&&<div style={{padding:'10px 16px',borderRadius:9,background:genMsg.includes('Erreur')?'rgba(240,96,96,.08)':'rgba(53,200,144,.08)',border:'1px solid '+(genMsg.includes('Erreur')?'var(--red)':'var(--green)'),fontSize:12,color:genMsg.includes('Erreur')?'var(--red)':'var(--green)',marginBottom:16}}>{genMsg}</div>}

      {/* History panel */}
      {showHistory&&history.length>0&&(
        <div style={{background:'var(--ink2)',border:'1px solid var(--line)',borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:13}}>📜 Historique des versions</div>
            <button onClick={()=>setShowHistory(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:18}}>×</button>
          </div>
          {history.map((h,i)=>{
            let info:any={}; try{info=JSON.parse(h.content)}catch{}
            return(
              <div key={h.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--line)'}}>
                <div>
                  <div style={{fontSize:11,fontWeight:600}}>v{history.length-i} — {new Date(h.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                  <div style={{fontSize:10,color:'var(--dim)'}}>{info.content?.length||0} tâches</div>
                </div>
                <button onClick={()=>{if(info.content&&Array.isArray(info.content)){setTasks(info.content);save(info.content);setShowHistory(false);setGenMsg('✓ Version restaurée !')}}}
                  style={{padding:'4px 10px',background:'rgba(212,168,75,.1)',border:'1px solid rgba(212,168,75,.3)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--gold2)'}}>
                  Restaurer
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {tasks.length===0?(
        <div style={{textAlign:'center',padding:'80px 20px',background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:14}}>
          <div style={{fontSize:56,marginBottom:16,opacity:.4}}>📅</div>
          <div style={{fontFamily:'var(--syne)',fontSize:20,fontWeight:700,color:'var(--white)',marginBottom:10}}>Aucun planning Gantt</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:28}}>Générez depuis le WBS Dict ou ajoutez des tâches manuellement.</div>
          <div style={{display:'flex',gap:12,justifyContent:'center'}}>
            <button className="btn-gold" onClick={generateFromWBS} disabled={generating}>{generating?'Génération...':'⚡ Générer depuis WBS'}</button>
            <button className="btn-ghost" onClick={addTask}>+ Ajouter manuellement</button>
          </div>
        </div>
      ):(
        <div style={{display:'flex',gap:16}}>
          {/* Gantt chart */}
          <div style={{flex:1,minWidth:0,overflow:'hidden'}}>
            <div className="card" style={{overflow:'hidden',background:'#F8FAFC'}}>
              <div style={{display:'flex',gap:16,padding:'8px 16px',borderBottom:'1px solid #E2E8F0',fontSize:11,alignItems:'center',background:'#F1F5F9'}}>
                <span style={{display:'flex',alignItems:'center',gap:4,color:'#374151'}}><span style={{width:10,height:10,background:'var(--green)',borderRadius:2,display:'inline-block'}}/> Avancement</span>
                <span style={{display:'flex',alignItems:'center',gap:4,color:'#374151'}}><span style={{width:14,height:2,border:'1px dashed rgba(220,38,38,.5)',display:'inline-block'}}/> Dépendance</span>
                <span style={{color:'#64748B',marginLeft:'auto',fontSize:10}}>Glisser = déplacer · Bord droit = redimensionner</span>
              </div>
              <div style={{display:'flex'}}>
                {/* Left column */}
                <div style={{width:LEFT_W,flexShrink:0,borderRight:'1px solid #E2E8F0'}}>
                  <div style={{height:48,background:'#E2E8F0',borderBottom:'1px solid #CBD5E1',display:'flex',alignItems:'center',padding:'0 12px',fontSize:10,color:'#374151',fontWeight:700,gap:8,textTransform:'uppercase'}}>
                    <span style={{width:32}}>WBS</span><span style={{flex:1}}>Tâche</span><span>Durée</span>
                  </div>
                  {tasks.map((t,i)=>(
                    <div key={t.id} onClick={()=>setSelected(t.id===selected?null:t.id)}
                      style={{height:ROW_H,display:'flex',alignItems:'center',padding:'0 10px',gap:6,background:t.id===selected?'#FEF3C7':i%2===0?'#F8FAFC':'#FFFFFF',cursor:'pointer',borderBottom:'1px solid #E2E8F0'}}>
                      <span style={{fontSize:9,color:'#64748B',fontFamily:'monospace',width:32,flexShrink:0}}>{t.wbs_id}</span>
                      <div style={{flex:1,overflow:'hidden'}}>
                        <div style={{fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:t.type==='milestone'?600:400,color:t.type==='milestone'?'#D97706':'#1E293B'}}>{t.type==='milestone'?'◆ ':''}{t.name}</div>
                        {t.role&&<div style={{fontSize:9,color:'#64748B',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.role}</div>}
                      </div>
                      <span style={{fontSize:9,color:'#64748B',flexShrink:0}}>{daysBetween(t.start,t.end)}j</span>
                    </div>
                  ))}
                </div>
                {/* Chart area */}
                <div style={{flex:1,overflowX:'auto'}}>
                  <div style={{width:Math.max(totalDays*zoom+60,400),position:'relative'}} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}>
                    {/* Date headers */}
                    <div style={{height:48,background:'#E2E8F0',borderBottom:'1px solid #CBD5E1',position:'relative'}}>
                      {weeks.filter(w=>w.month).map((w,i)=>(
                        <div key={i} style={{position:'absolute',left:w.x+4,top:3,fontSize:9,color:'#1D4ED8',fontWeight:700,whiteSpace:'nowrap'}}>{w.label}</div>
                      ))}
                      {weeks.filter(w=>!w.month).map((w,i)=>(
                        <div key={i} style={{position:'absolute',left:w.x+2,top:22,fontSize:9,color:'#64748B',whiteSpace:'nowrap'}}>{w.label}</div>
                      ))}
                      <div style={{position:'absolute',left:todayX,top:0,bottom:0,width:2,background:'#DC2626',opacity:.8,zIndex:5}}/>
                      <div style={{position:'absolute',left:todayX+4,top:2,fontSize:8,color:'#DC2626',fontWeight:700,background:'rgba(220,38,38,.1)',padding:'1px 3px',borderRadius:2}}>Auj.</div>
                    </div>
                    {/* Task rows */}
                    {tasks.map((t,i)=>{
                      const x=toX(t.start,minDate,zoom)
                      const w=Math.max(daysBetween(t.start,t.end)*zoom,t.type==='milestone'?14:8)
                      const col=t.color||COLORS[i%COLORS.length]
                      const isSel=t.id===selected
                      return(
                        <div key={t.id} style={{height:ROW_H,position:'relative',background:i%2===0?'rgba(0,0,0,.015)':'#FFFFFF',borderBottom:'1px solid #E2E8F0'}}>
                          {weeks.filter(w=>!w.month).map((wk,j)=>(
                            <div key={j} style={{position:'absolute',left:wk.x,top:0,bottom:0,width:1,background:'rgba(0,0,0,.05)'}}/>
                          ))}
                          <div style={{position:'absolute',left:todayX,top:0,bottom:0,width:1,background:'rgba(220,38,38,.2)'}}/>
                          {/* Dependencies */}
                          {t.dependencies.map(depId=>{
                            const dep=tasks.find(d=>d.id===depId); if(!dep) return null
                            const depIdx=tasks.findIndex(d=>d.id===depId)
                            const x1=toX(dep.end,minDate,zoom)+daysBetween(dep.start,dep.end)*zoom
                            const y1=(depIdx-i)*ROW_H+ROW_H/2; const y2=ROW_H/2
                            return(
                              <svg key={depId} style={{position:'absolute',left:0,top:0,width:'100%',height:ROW_H,overflow:'visible',pointerEvents:'none'}}>
                                <defs><marker id={'a'+depId+t.id} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0,0 5,2.5 0,5" fill="rgba(220,38,38,.6)"/></marker></defs>
                                <path d={`M${x1},${y1} C${x1+16},${y1} ${x-16},${y2} ${x},${y2}`} fill="none" stroke="rgba(220,38,38,.5)" strokeWidth={1.5} strokeDasharray="4,3" markerEnd={`url(#a${depId+t.id})`}/>
                              </svg>
                            )
                          })}
                          {t.type==='milestone'?(
                            <div title={t.name} onMouseDown={e=>onMD(e,t.id,'move')}
                              style={{position:'absolute',left:x-7,top:ROW_H/2-7,width:14,height:14,background:'#D97706',transform:'rotate(45deg)',cursor:'grab',zIndex:3,boxShadow:isSel?'0 0 0 2px white':'none'}}/>
                          ):(
                            <div title={t.name}
                              style={{position:'absolute',left:x,top:5,height:ROW_H-10,width:w,borderRadius:5,background:col+'22',border:`2px solid ${col}`,cursor:'grab',userSelect:'none',zIndex:2,boxShadow:isSel?`0 0 0 2px ${col}`:'none'}}
                              onMouseDown={e=>onMD(e,t.id,'move')}>
                              <div style={{position:'absolute',left:0,top:0,height:'100%',width:t.progress+'%',background:col+'55',borderRadius:4}}/>
                              {w>50&&<span style={{position:'absolute',left:6,top:'50%',transform:'translateY(-50%)',fontSize:9,color:'#1E293B',fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:w-22,pointerEvents:'none'}}>{t.name}</span>}
                              <div onMouseDown={e=>onMD(e,t.id,'end')} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'ew-resize',background:col,borderRadius:'0 4px 4px 0',opacity:.9}}/>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Edit panel */}
          {sel&&(
            <div style={{width:260,flexShrink:0}}>
              <div className="card">
                <div className="card-hdr">
                  <div className="card-title">✏️ {sel.type==='milestone'?'Jalon':'Tâche'}</div>
                  <button onClick={()=>deleteTask(sel.id)} style={{padding:'3px 8px',background:'rgba(220,38,38,.1)',border:'1px solid rgba(220,38,38,.3)',borderRadius:5,cursor:'pointer',fontSize:11,color:'var(--red)'}}>🗑</button>
                </div>
                <div className="card-body" style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div className="fg"><label className="fl">WBS</label><input className="fi" value={sel.wbs_id} onChange={e=>updateTask(sel.id,'wbs_id',e.target.value)}/></div>
                  <div className="fg"><label className="fl">Nom</label><input className="fi" value={sel.name} onChange={e=>updateTask(sel.id,'name',e.target.value)}/></div>
                  <div className="fg"><label className="fl">Type</label>
                    <select className="fi" value={sel.type} onChange={e=>updateTask(sel.id,'type',e.target.value as any)}>
                      <option value="task">Tâche</option><option value="milestone">Jalon</option><option value="group">Groupe</option>
                    </select>
                  </div>
                  <div className="fg"><label className="fl">Rôle</label><input className="fi" value={sel.role} onChange={e=>updateTask(sel.id,'role',e.target.value)}/></div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                    <div className="fg"><label className="fl">Début</label><input className="fi" type="date" value={sel.start} onChange={e=>updateTask(sel.id,'start',e.target.value)}/></div>
                    <div className="fg"><label className="fl">Fin</label><input className="fi" type="date" value={sel.end} onChange={e=>updateTask(sel.id,'end',e.target.value)}/></div>
                  </div>
                  <div className="fg">
                    <label className="fl">Avancement : <strong style={{color:'var(--green)'}}>{sel.progress}%</strong></label>
                    <input type="range" min={0} max={100} step={5} value={sel.progress} onChange={e=>updateTask(sel.id,'progress',+e.target.value)} style={{width:'100%',accentColor:'var(--green)'}}/>
                  </div>
                  {sel.type!=='milestone'&&(
                    <div className="fg">
                      <label className="fl">Couleur</label>
                      <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                        {COLORS.map(c=><div key={c} onClick={()=>updateTask(sel.id,'color',c)} style={{width:18,height:18,borderRadius:3,background:c,cursor:'pointer',border:sel.color===c?'2px solid white':'2px solid transparent'}}/>)}
                      </div>
                    </div>
                  )}
                  <div className="fg">
                    <label className="fl">Dépendances</label>
                    <div style={{display:'flex',flexDirection:'column',gap:3,maxHeight:130,overflowY:'auto'}}>
                      {tasks.filter(t=>t.id!==sel.id).map(t=>(
                        <label key={t.id} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,cursor:'pointer'}}>
                          <input type="checkbox" checked={sel.dependencies.includes(t.id)} onChange={()=>toggleDep(sel.id,t.id)} style={{accentColor:'var(--gold2)'}}/>
                          <span style={{color:t.type==='milestone'?'var(--amber)':'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.wbs_id} — {t.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{padding:'8px',background:'var(--ink)',borderRadius:6,fontSize:10,color:'var(--dim)'}}>
                    <div>{fmt(sel.start)} → {fmt(sel.end)}</div>
                    <div style={{marginTop:2}}>Durée : {daysBetween(sel.start,sel.end)} jour(s)</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
