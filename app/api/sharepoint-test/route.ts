import { NextResponse } from 'next/server'

const TENANT_ID = process.env.MICROSOFT_TENANT_ID!
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!
const SITE_ID = process.env.SHAREPOINT_SITE_ID!

async function getToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await res.json()
  return data.access_token
}

export async function GET() {
  try {
    const token = await getToken()

    // Ver root
    const rootRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root/children`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const rootData = await rootRes.json()
    const rootItems = rootData.value?.map((f: any) => ({ name: f.name, type: f.folder ? 'folder' : 'file' }))

    // Ver dentro de Conocimiento Agente
    const folderRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:/Conocimiento%20Agente:/children`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const folderData = await folderRes.json()
    const folderItems = folderData.value?.map((f: any) => ({ name: f.name, type: f.folder ? 'folder' : 'file' }))

    // Ver dentro de Colegio Montano
    const cmRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:/Conocimiento%20Agente/Colegio%20Montano:/children`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const cmData = await cmRes.json()
    const cmItems = cmData.value?.map((f: any) => ({ name: f.name, type: f.folder ? 'folder' : 'file' }))

    return NextResponse.json({ rootItems, folderItems, cmItems })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
