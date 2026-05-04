'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'
import ExportToolbar from '@/components/ui/ExportToolbar'

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
  const m: Record<string,string> = {'Documents':'/projects/'+id,'WBS Dict':'/projects/'+id+'/wbs-dict','RAID':'/projects/'+id+'/raid','Jalons':'/projects/'+id+'/jalons','PERT':'/projects/'+id+'/pert','Mind Map':'/projects/'+id+'/mindmap','Budget EVM':'/projects/'+id+'/budget','Gantt':'/projects/'+id+'/gantt','Work Packages':'/projects/'+id+'/workpackages'}
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
  const params = useParams(); const router = useRouter()
  const supabase = createClient(); const id = params.id as string

  useEffect(()=>{loadData()},[id])

  async function loadData() {
    const {data:proj} = await supabase.from('projects').select('*').eq('id',id).single()
    setProject(proj)
    const {data:wbs} = await supabase.from('documents').select('content').eq('project_id',id).eq('doc_type','wbs').order('created_at',{ascending:false}).limit(1)
    if(wbs?.[0]) setWbsContent(wbs[0].content)
    const {data:docs} = await supabase.from('documents').select('content').eq('project_id',id).eq('doc_type','gantt').order('created_at',{ascending:false}).limit(1)
    if(docs?.[0]) { try{setTasks(JSON.parse(docs[0].content))}catch{} }
    setLoading(false)
  }

  async function save(t: GanttTask[]) {
    const {data:{user}} = await supabase.auth.getUser(); if(!user) return
    await supabase.from('documents').upsert({project_id:id,user_id:user.id,doc_type:'gantt',title:'Gantt — '+(project?.name||''),content:JSON.stringify(t),status:'generated'},{onConflict:'project_id,doc_type'})
  }

  async function saveHistory(t: GanttTask[]) {
    const {data:{user}} = await supabase.auth.getUser(); if(!user) return
    const ts = new Date().toISOString().replace('T',' ').slice(0,16)
    await supabase.from('documents').insert({
      project_id:id, user_id:user.id,
      doc_type:'gantt_history',
      title:'Gantt Historique — '+ts,
      content:JSON.stringify({generated_at:ts, count:t.length, tasks:t}),
      status:'archived',
    })
  }

  async function generateFromWBS() {
    setGenerating(true); setGenMsg('Génération du Gantt depuis le WBS...')
    let wbsText = project?.name||'Projet'
    if(wbsContent) {
      try {
        const stripped=wbsContent.replace(/[`]{3}json/gi,'').replace(/[`]{3}/g,'').trim()
        const m=stripped.match(/\{[\s\S]*\}/)
        if(m){try{const obj=JSON.parse(m[0]);if(obj.wbs)wbsText=Object.values(obj.wbs as Record<string,any>).map((v:any)=>v.id+' - '+v.name).join('\n');else wbsText=wbsContent.slice(0,2000)}catch{wbsText=wbsContent.slice(0,2000)}}
        else wbsText=wbsContent.slice(0,2000)
      }catch{wbsText=wbsContent.slice(0,2000)}
    }
    const today=new Date().toISOString().split('T')[0]
    const prompt='Tu es expert PMBOK 7. Génère un planning Gantt pour ce projet.\nPROJET: '+(project?.name||'')+'\nWBS: '+wbsText+'\n\nGénère 8 à 12 tâches + 2-3 jalons. Règles:\n- start/end format YYYY-MM-DD à partir de '+today+'\n- type: "task", "milestone" ou "group"\n- progress: 0\n- dependencies: tableau ids\n- Jalons aux étapes clés\n\nRéponds UNIQUEMENT avec le tableau JSON:\n[{"id":"T1","wbs_id":"1.1","name":"Cadrage","role":"Chef de Projet","start":"'+today+'","end":"'+addDays(today,10)+'","progress":0,"type":"task","dependencies":[]},{"id":"M1","wbs_id":"M1","name":"Lancement","role":"","start":"'+addDays(today,10)+'","end":"'+addDays(today,10)+'","progress":0,"type":"milestone","dependencies":["T1"]}]'
    try {
      const res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,maxTokens:4000})})
      const data=await res.json(); const text=data.text||''
      const si=text.indexOf('['),ei=text.lastIndexOf(']')
      if(si===-1||ei===-1) throw new Error('JSON non trouvé')
      const parsed: GanttTask[]=JSON.parse(text.slice(si,ei+1))
      setTasks(parsed); await save(parsed); await saveHistory(parsed)
      setGenMsg(parsed.length+' éléments générés et sauvegardés !')
    }catch(e:any){setGenMsg('Erreur: '+e.message)}
    setGenerating(false); setTimeout(()=>setGenMsg(''),5000)
  }

  function addTask() {
    const today=new Date().toISOString().split('T')[0]
    const t: GanttTask={id:'T'+Date.now(),wbs_id:(tasks.length+1)+'.0',name:'Nouvelle tâche',role:'',start:today,end:addDays(today,5),progress:0,type:'task',dependencies:[],color:COLORS[tasks.length%COLORS.length]}
    const u=[...tasks,t]; setTasks(u); save(u); setSelected(t.id)
  }
  function addMilestone() {
    const today=new Date().toISOString().split('T')[0]
    const m: GanttTask={id:'M'+Date.now(),wbs_id:'M'+(tasks.length+1),name:'Jalon',role:'',start:today,end:today,progress:0,type:'milestone',dependencies:[]}
    const u=[...tasks,m]; setTasks(u); save(u); setSelected(m.id)
  }
  function deleteTask(tid: string) {
    const u=tasks.filter(t=>t.id!==tid).map(t=>({...t,dependencies:t.dependencies.filter(d=>d!==tid)}))
    setTasks(u); save(u); setSelected(null)
  }
  function updateTask(tid: string, field: string, value: any) {
    const u=tasks.map(t=>t.id!==tid?t:{...t,[field]:value})
    setTasks(u); save(u)
  }
  function toggleDep(tid: string, depId: string) {
    const t=tasks.find(t=>t.id===tid); if(!t) return
    const deps=t.dependencies.includes(depId)?t.dependencies.filter(d=>d!==depId):[...t.dependencies,depId]
    updateTask(tid,'dependencies',deps)
  }

  const {minDate,totalDays} = useMemo(()=>{
    if(!tasks.length){const m=new Date();m.setDate(m.getDate()-3);return{minDate:m,totalDays:90}}
    const starts=tasks.map(t=>new Date(t.start)); const ends=tasks.map(t=>new Date(t.end))
    const min=new Date(Math.min(...starts.map(d=>d.getTime()))); min.setDate(min.getDate()-3)
    const max=new Date(Math.max(...ends.map(d=>d.getTime()))); max.setDate(max.getDate()+10)
    return{minDate:min,totalDays:Math.ceil((max.getTime()-min.getTime())/86400000)}
  },[tasks])

  const weeks = useMemo(()=>{
    const ws: {label:string,x:number,month:boolean}[]=[]
    const cur=new Date(minDate)
    for(let i=0;i<totalDays;i++){
      const x=i*zoom
      if(cur.getDay()===1){ws.push({label:cur.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}),x,month:false})}
      if(cur.getDate()===1){ws.push({label:cur.toLocaleDateString('fr-FR',{month:'long',year:'2-digit'}),x,month:true})}
      cur.setDate(cur.getDate()+1)
    }
    return ws
  },[minDate,totalDays,zoom])

  const ROW_H=36; const LEFT_W=300
  const todayX=toX(new Date().toISOString().split('T')[0],minDate,zoom)

  function onMD(e: React.MouseEvent,tid: string,type: 'move'|'end'){
    e.preventDefault(); e.stopPropagation()
    const t=tasks.find(t=>t.id===tid); if(!t) return
    setDrag({id:tid,type,sx:e.clientX,os:t.start,oe:t.end}); setSelected(tid)
  }
  function onMM(e: React.MouseEvent){
    if(!drag) return
    const dd=Math.round((e.clientX-drag.sx)/zoom)
    if(dd===0) return
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
          <div style={{display:'flex',gap:4,alignItems:'center',background:'var(--ink2)',border:'1px solid var(--line2)',borderRadius:8,padding:'0 6px'}}>
            <button onClick={()=>setZoom(z=>Math.max(10,z-6))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:16,padding:'4px 6px'}}>−</button>
            <span style={{fontSize:10,color:'var(--dim)',minWidth:40,textAlign:'center'}}>{zoom}px/j</span>
            <button onClick={()=>setZoom(z=>Math.min(80,z+6))} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:16,padding:'4px 6px'}}>+</button>
          </div>
          <button onClick={addMilestone} className="btn-ghost" style={{fontSize:11,color:'var(--amber)',borderColor:'rgba(245,184,64,.3)'}}>◆ Jalon</button>
          <button onClick={addTask} className="btn-ghost" style={{fontSize:11}}>+ Tâche</button>
          <ExportToolbar
            title={'Gantt — '+(project?.name||'')}
            content={JSON.stringify(tasks,null,2)}
            projectName={project?.name||''}
            docType="gantt"
            onMessage={m=>{setGenMsg(m);setTimeout(()=>setGenMsg(''),5000)}}
          />
          <button onClick={generateFromWBS} className="btn-gold" disabled={generating} style={{fontSize:11}}>{generating?'Génération...':'⚡ Générer depuis WBS'}</button>
        </div>
      </div>

      <div style={{display:'flex',gap:5,marginBottom:16,borderBottom:'1px solid #E2E8F0',paddingBottom:12,flexWrap:'wrap'}}>
        {NAV.map(label=>{const href=navHref(label,id);return(
          <button key={href} onClick={()=>router.push(href)} style={{padding:'6px 12px',fontSize:11,cursor:'pointer',borderRadius:8,border:'1px solid var(--line2)',background:href===ah?'rgba(212,168,75,.15)':'transparent',color:href===ah?'var(--gold2)':'var(--muted)',fontWeight:href===ah?600:400,transition:'all .12s',fontFamily:'var(--mono)'}}>
            {NAV_ICONS[label]||''} {label}
          </button>
        )})}
      </div>

      {genMsg&&<div style={{padding:'10px 16px',borderRadius:9,background:genMsg.includes('Erreur')?'rgba(240,96,96,.08)':'rgba(53,200,144,.08)',border:'1px solid '+(genMsg.includes('Erreur')?'var(--red)':'var(--green)'),fontSize:12,color:genMsg.includes('Erreur')?'var(--red)':'var(--green)',marginBottom:16}}>{genMsg}</div>}

      {tasks.length===0?(
        <div style={{textAlign:'center',padding:'80px 20px',background:'var(--ink2)',border:'1.5px solid var(--line)',borderRadius:14}}>
          <div style={{fontSize:56,marginBottom:16,opacity:.4}}>📅</div>
          <div style={{fontFamily:'var(--syne)',fontSize:20,fontWeight:700,color:'var(--white)',marginBottom:10}}>Aucun planning Gantt</div>
          <div style={{fontSize:13,color:'var(--muted)',marginBottom:28,maxWidth:500,margin:'0 auto 28px',lineHeight:1.8}}>Générez depuis le WBS Dict ou ajoutez des tâches manuellement.</div>
          <div style={{display:'flex',gap:12,justifyContent:'center'}}>
            <button className="btn-gold" onClick={generateFromWBS} disabled={generating} style={{fontSize:13}}>{generating?'Génération...':'⚡ Générer depuis WBS'}</button>
            <button className="btn-ghost" onClick={addTask} style={{fontSize:13}}>+ Ajouter manuellement</button>
          </div>
        </div>
      ):(
        <div style={{display:'flex',gap:16}}>
          <div style={{flex:1,minWidth:0,overflow:'hidden'}}>
            <div className="card" style={{overflow:'hidden',background:'#F8FAFC'}}>
              <div style={{display:'flex',gap:16,padding:'8px 16px',borderBottom:'1px solid #E2E8F0',fontSize:11,color:'var(--muted)',alignItems:'center'}}>
                <span style={{width:8,height:8,background:'var(--green)',borderRadius:2,display:'inline-block'}}/><span>Avancement</span>
                <span style={{width:12,height:2,border:'1px dashed rgba(220,38,38,.5)',display:'inline-block'}}/><span>Dépendance</span>
                <span style={{color:'#64748B',marginLeft:'auto',fontSize:10}}>Glisser barre = déplacer · Glisser bord droit = redimensionner</span>
              </div>
              <div style={{display:'flex'}}>
                {/* Noms */}
                <div style={{width:LEFT_W,flexShrink:0,borderRight:'1px solid var(--line)'}}>
                  <div style={{height:48,background:'#E2E8F0',borderBottom:'1px solid #CBD5E1',display:'flex',alignItems:'center',padding:'0 12px',fontSize:10,color:'#374151',fontWeight:600,textTransform:'uppercase',gap:8}}>
                    <span style={{width:32}}>WBS</span><span style={{flex:1}}>Tâche / Rôle</span><span>Durée</span>
                  </div>
                  {tasks.map((t,i)=>(
                    <div key={t.id} onClick={()=>setSelected(t.id===selected?null:t.id)}
                      style={{height:ROW_H,display:'flex',alignItems:'center',padding:'0 10px',gap:6,background:t.id===selected?'#FEF3C7':i%2===0?'#F8FAFC':'#FFFFFF',cursor:'pointer',borderBottom:'1px solid #E2E8F0'}}>
                      <span style={{fontSize:9,color:'#64748B',fontFamily:'monospace',width:32,flexShrink:0}}>{t.wbs_id}</span>
                      <div style={{flex:1,overflow:'hidden'}}>
                        <div style={{fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:t.type==='milestone'?600:400,color:t.type==='milestone'?'#D97706':t.type==='group'?'#1D4ED8':'#1E293B'}}>
                          {t.type==='milestone'?'◆ ':t.type==='group'?'▸ ':''}{t.name}
                        </div>
                        {t.role&&<div style={{fontSize:9,color:'#64748B',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.role}</div>}
                      </div>
                      <span style={{fontSize:9,color:'#64748B',flexShrink:0}}>{daysBetween(t.start,t.end)}j</span>
                    </div>
                  ))}
                </div>

                {/* Zone graphique */}
                <div style={{flex:1,overflowX:'auto'}}>
                  <div style={{width:Math.max(totalDays*zoom+60,400),position:'relative'}} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}>
                    {/* Headers dates */}
                    <div style={{height:48,background:'#E2E8F0',borderBottom:'1px solid #CBD5E1',position:'relative'}}>
                      {weeks.filter(w=>w.month).map((w,i)=>(
                        <div key={i} style={{position:'absolute',left:w.x+4,top:3,fontSize:9,color:'#1D4ED8',fontWeight:700,background:'rgba(29,78,216,.08)',padding:'2px 6px',borderRadius:4,whiteSpace:'nowrap'}}>{w.label}</div>
                      ))}
                      {weeks.filter(w=>!w.month).map((w,i)=>(
                        <div key={i} style={{position:'absolute',left:w.x+2,top:22,fontSize:9,color:'#64748B',whiteSpace:'nowrap'}}>{w.label}</div>
                      ))}
                      <div style={{position:'absolute',left:todayX,top:0,bottom:0,width:2,background:'var(--red)',opacity:.8,zIndex:5}}/>
                      <div style={{position:'absolute',left:todayX+3,top:2,fontSize:8,color:'#DC2626',fontWeight:700,background:'rgba(220,38,38,.1)',padding:'1px 3px',borderRadius:2}}>Auj.</div>
                    </div>

                    {/* Lignes tâches */}
                    {tasks.map((t,i)=>{
                      const x=toX(t.start,minDate,zoom)
                      const w=Math.max(daysBetween(t.start,t.end)*zoom,t.type==='milestone'?14:8)
                      const col=t.color||COLORS[i%COLORS.length]
                      const isSel=t.id===selected
                      return(
                        <div key={t.id} style={{height:ROW_H,position:'relative',background:i%2===0?'#F1F5F9':'#FFFFFF',borderBottom:'1px solid #E2E8F0'}}>
                          {/* Grille semaines */}
                          {weeks.filter(w=>!w.month).map((wk,j)=>(
                            <div key={j} style={{position:'absolute',left:wk.x,top:0,bottom:0,width:1,background:'rgba(0,0,0,.05)'}}/>
                          ))}
                          <div style={{position:'absolute',left:todayX,top:0,bottom:0,width:1,background:'rgba(220,38,38,.2)'}}/>

                          {/* Flèches dépendances */}
                          {t.dependencies.map(depId=>{
                            const dep=tasks.find(d=>d.id===depId); if(!dep) return null
                            const depIdx=tasks.findIndex(d=>d.id===depId)
                            const x1=toX(dep.end,minDate,zoom)+daysBetween(dep.start,dep.end)*zoom
                            const y1=(depIdx-i)*ROW_H+ROW_H/2
                            const y2=ROW_H/2
                            return(
                              <svg key={depId} style={{position:'absolute',left:0,top:0,width:'100%',height:ROW_H,overflow:'visible',pointerEvents:'none'}}>
                                <defs><marker id={'a'+depId+t.id} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0,0 5,2.5 0,5" fill="rgba(220,38,38,.6)"/></marker></defs>
                                <path d={`M${x1},${y1} C${x1+16},${y1} ${x-16},${y2} ${x},${y2}`} fill="none" stroke="rgba(220,38,38,.5)" strokeWidth={1.5} strokeDasharray="4,3" markerEnd={`url(#a${depId+t.id})`}/>
                              </svg>
                            )
                          })}

                          {t.type==='milestone'?(
                            <div title={t.name+' — '+fmt(t.start)}
                              onMouseDown={e=>onMD(e,t.id,'move')}
                              style={{position:'absolute',left:x-7,top:ROW_H/2-7,width:14,height:14,background:'var(--amber)',transform:'rotate(45deg)',cursor:'grab',zIndex:3,boxShadow:isSel?'0 0 0 2px white,0 2px 8px rgba(245,184,64,.5)':'0 1px 4px rgba(0,0,0,.3)'}}/>
                          ):(
                            <div title={t.name+' — '+fmt(t.start)+' au '+fmt(t.end)}
                              style={{position:'absolute',left:x,top:5,height:ROW_H-10,width:w,borderRadius:5,background:col+'22',border:`2px solid ${col}`,cursor:'grab',userSelect:'none',zIndex:2,boxShadow:isSel?`0 0 0 2px ${col},0 2px 12px ${col}44`:'none',transition:'box-shadow .1s'}}
                              onMouseDown={e=>onMD(e,t.id,'move')}>
                              {/* Progress bar */}
                              <div style={{position:'absolute',left:0,top:0,height:'100%',width:t.progress+'%',background:col+'55',borderRadius:4}}/>
                              {/* Label */}
                              {w>50&&<span style={{position:'absolute',left:6,top:'50%',transform:'translateY(-50%)',fontSize:9,color:'#1E293B',fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:w-22,pointerEvents:'none'}}>{t.name}</span>}
                              {/* Progress label */}
                              {t.progress>0&&w>70&&<span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:8,color:'#374151',fontWeight:700}}>{t.progress}%</span>}
                              {/* Resize handle */}
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

          {/* Panneau édition */}
          {sel&&(
            <div style={{width:270,flexShrink:0}}>
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
                        <label key={t.id} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,cursor:'pointer',padding:'2px 0'}}>
                          <input type="checkbox" checked={sel.dependencies.includes(t.id)} onChange={()=>toggleDep(sel.id,t.id)} style={{accentColor:'var(--gold2)'}}/>
                          <span style={{color:t.type==='milestone'?'var(--amber)':'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.wbs_id} — {t.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{padding:'8px',background:'var(--ink)',borderRadius:6,fontSize:10,color:'var(--dim)'}}>
                    <div>{fmt(sel.start)} → {fmt(sel.end)}</div>
                    <div style={{color:'var(--muted)',marginTop:2}}>Durée : {daysBetween(sel.start,sel.end)} jour(s)</div>
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
