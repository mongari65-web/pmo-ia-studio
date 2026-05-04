import { NextRequest, NextResponse } from 'next/server'

async function getAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  })
  const data = await response.json()
  if (!data.access_token) throw new Error('Token Google invalide : ' + JSON.stringify(data))
  return data.access_token
}

function encodeBase64(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(request: NextRequest) {
  try {
    const { to, subject, project_name, doc_type, doc_label, content, sender_name } = await request.json()

    if (!to || !content) {
      return NextResponse.json({ error: 'Destinataire et contenu requis' }, { status: 400 })
    }

    const clientId     = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json({ error: 'Configuration Gmail manquante' }, { status: 500 })
    }

    const accessToken = await getAccessToken()

    // Construire le corps HTML de l'email
    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    const htmlBody = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; color: #1A1A28; background: #f8f8f8; margin: 0; padding: 0; }
  .container { max-width: 680px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #13131A, #1C1C26); padding: 28px 32px; display: flex; align-items: center; gap: 14px; }
  .logo { width: 36px; height: 36px; background: linear-gradient(135deg, #D4A84B, #F0C060); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: #0A0A0C; }
  .brand { color: #fff; font-size: 16px; font-weight: 700; }
  .tagline { color: #A8A8C8; font-size: 11px; margin-top: 2px; }
  .badge { display: inline-block; padding: 4px 12px; background: rgba(212,168,75,.15); border: 1px solid rgba(212,168,75,.3); border-radius: 20px; font-size: 10px; color: #D4A84B; margin-top: 8px; }
  .body { padding: 32px; }
  .greeting { font-size: 16px; font-weight: 600; color: #1A1A28; margin-bottom: 12px; }
  .intro { font-size: 13px; color: #5A5A72; line-height: 1.7; margin-bottom: 24px; }
  .doc-card { background: #F8F7F0; border: 1.5px solid #E8E4D8; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
  .doc-type { font-size: 10px; color: #A8A8C8; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
  .doc-title { font-size: 15px; font-weight: 700; color: #1A1A28; margin-bottom: 4px; }
  .doc-project { font-size: 12px; color: #7A7A9A; }
  .doc-content { margin-top: 16px; padding-top: 16px; border-top: 1px solid #E0D8C0; font-size: 12px; color: #333; line-height: 1.8; white-space: pre-wrap; max-height: 400px; overflow: hidden; }
  .footer { background: #F8F7F0; padding: 20px 32px; border-top: 1px solid #E8E4D8; }
  .footer-text { font-size: 11px; color: #A8A8C8; line-height: 1.6; }
  .footer-brand { font-size: 12px; font-weight: 600; color: #D4A84B; margin-bottom: 4px; }
  .divider { height: 1px; background: #E8E4D8; margin: 16px 0; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">P</div>
    <div>
      <div class="brand">PMO-IA Studio</div>
      <div class="tagline">Le copilote IA des Chefs de Projet</div>
      <div class="badge">PMBOK 7 · Claude AI</div>
    </div>
  </div>

  <div class="body">
    <div class="greeting">Bonjour,</div>
    <div class="intro">
      Veuillez trouver ci-dessous le document <strong>${doc_label || doc_type}</strong> 
      généré pour le projet <strong>${project_name}</strong>.
      Ce document a été produit par <strong>${sender_name || 'PMO-IA Studio'}</strong> 
      via l'assistant IA Claude, conformément aux standards PMI/PMBOK 7.
    </div>

    <div class="doc-card">
      <div class="doc-type">Document PMI · ${doc_label || doc_type}</div>
      <div class="doc-title">${subject}</div>
      <div class="doc-project">Projet : ${project_name} · Généré le ${date}</div>
      <div class="doc-content">${content.slice(0, 2000)}${content.length > 2000 ? '\n\n[... Document complet disponible sur demande ...]' : ''}</div>
    </div>

    <div style="font-size:12px;color:#7A7A9A;line-height:1.7">
      Ce document a été généré automatiquement par l'assistant IA PMO-IA Studio.
      Pour toute question ou modification, n'hésitez pas à me contacter.
    </div>
  </div>

  <div class="footer">
    <div class="footer-brand">PMO-IA Studio</div>
    <div class="footer-text">
      Document généré le ${date} · Claude AI · Anthropic<br>
      ${sender_name ? `Envoyé par : ${sender_name}` : ''}
    </div>
  </div>
</div>
</body></html>`

    // Construire l'email MIME
    const emailLines = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject || `Document PMI - ${project_name}`).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(htmlBody).toString('base64'),
    ]

    const rawEmail = encodeBase64(emailLines.join('\r\n'))

    // Envoyer via Gmail API
    const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawEmail }),
    })

    const sendData = await sendResponse.json()

    if (!sendResponse.ok) {
      return NextResponse.json({
        error: sendData.error?.message || 'Erreur Gmail',
        detail: sendData,
      }, { status: sendResponse.status })
    }

    return NextResponse.json({
      success: true,
      message_id: sendData.id,
      to,
    })

  } catch (error: any) {
    console.error('Erreur route Gmail:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
