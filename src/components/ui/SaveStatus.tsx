'use client'
import { useState, useEffect } from 'react'

interface SaveStatusProps {
  lastSaved: string | null        // ISO timestamp
  version: number                  // version number
  onNewVersion?: () => void        // callback to generate new version
  generating?: boolean
  historyCount?: number
  onShowHistory?: () => void
}

export default function SaveStatus({ lastSaved, version, onNewVersion, generating, historyCount=0, onShowHistory }: SaveStatusProps) {
  const [timeAgo, setTimeAgo] = useState('')

  useEffect(() => {
    if (!lastSaved) return
    function update() {
      const diff = Math.floor((Date.now() - new Date(lastSaved!).getTime()) / 1000)
      if (diff < 60) setTimeAgo('à l\'instant')
      else if (diff < 3600) setTimeAgo(`il y a ${Math.floor(diff/60)} min`)
      else if (diff < 86400) setTimeAgo(`il y a ${Math.floor(diff/3600)}h`)
      else setTimeAgo(`il y a ${Math.floor(diff/86400)}j`)
    }
    update()
    const t = setInterval(update, 30000)
    return () => clearInterval(t)
  }, [lastSaved])

  if (!lastSaved) return null

  return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',background:'rgba(53,200,144,.06)',border:'1px solid rgba(53,200,144,.2)',borderRadius:8,fontSize:11}}>
      <span style={{color:'var(--green)'}}>✓</span>
      <span style={{color:'var(--muted)'}}>Sauvegardé {timeAgo}</span>
      {version > 1 && <span style={{color:'var(--dim)',fontSize:10}}>v{version}</span>}
      {historyCount > 0 && (
        <button onClick={onShowHistory} style={{background:'none',border:'none',cursor:'pointer',color:'var(--cyan)',fontSize:10,padding:'0 4px',textDecoration:'underline'}}>
          {historyCount} version{historyCount>1?'s':''}
        </button>
      )}
      {onNewVersion && (
        <button onClick={onNewVersion} disabled={generating}
          style={{padding:'3px 10px',background:'rgba(212,168,75,.1)',border:'1px solid rgba(212,168,75,.3)',borderRadius:5,cursor:'pointer',color:'var(--gold2)',fontSize:10,fontWeight:600,marginLeft:4}}>
          {generating ? '⏳' : '🔄 Nouvelle version'}
        </button>
      )}
    </div>
  )
}
