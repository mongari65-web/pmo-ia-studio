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
  if (!data.access_token) throw new Error('Impossible d\'obtenir le token Google : ' + JSON.stringify(data))
  return data.access_token
}

async function getOrCreateFolder(accessToken: string, folderName: string): Promise<string> {
  // Chercher si le dossier existe déjà
  const search = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const searchData = await search.json()

  if (searchData.files?.length > 0) {
    return searchData.files[0].id
  }

  // Créer le dossier
  const create = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  const createData = await create.json()
  return createData.id
}

export async function POST(request: NextRequest) {
  try {
    const { title, content, project_name, doc_type } = await request.json()

    const clientId     = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json({ error: 'Configuration Google Drive manquante' }, { status: 500 })
    }

    // 1. Obtenir un access token frais
    const accessToken = await getAccessToken()

    // 2. Créer/trouver le dossier PMO-IA Studio dans Drive
    const rootFolderId = await getOrCreateFolder(accessToken, 'PMO-IA Studio')

    // 3. Créer/trouver le sous-dossier du projet
    const projectFolderName = project_name || 'Projets'
    const projectSearch = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(projectFolderName)}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const projectSearchData = await projectSearch.json()

    let projectFolderId: string
    if (projectSearchData.files?.length > 0) {
      projectFolderId = projectSearchData.files[0].id
    } else {
      const createProject = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId],
        }),
      })
      const createProjectData = await createProject.json()
      projectFolderId = createProjectData.id
    }

    // 4. Créer le fichier texte dans le dossier projet
    const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')
    const filename = `${title} — ${date}.txt`

    const fileContent = `${title}
${'='.repeat(title.length)}

Généré par PMO-IA Studio
Date : ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
Projet : ${project_name || ''}
Type : ${doc_type || ''}
Modèle IA : Claude Sonnet · Anthropic
Standard : PMBOK 7

${'─'.repeat(60)}

${content}`

    const boundary = '-------314159265358979323846'
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const metadata = JSON.stringify({
      name: filename,
      mimeType: 'text/plain',
      parents: [projectFolderId],
    })

    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      metadata +
      delimiter +
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
      fileContent +
      closeDelimiter

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`,
        },
        body: multipartBody,
      }
    )

    const uploadData = await uploadResponse.json()

    if (!uploadResponse.ok) {
      return NextResponse.json({ error: uploadData.error?.message || 'Erreur upload Drive' }, { status: uploadResponse.status })
    }

    return NextResponse.json({
      success: true,
      file_id: uploadData.id,
      file_name: uploadData.name,
      file_url: uploadData.webViewLink,
    })

  } catch (error: any) {
    console.error('Erreur route Drive:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
