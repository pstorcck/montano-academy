import 'isomorphic-fetch'
import mammoth from 'mammoth'

const TENANT_ID = process.env.MICROSOFT_TENANT_ID!
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!
const SITE_ID = process.env.SHAREPOINT_SITE_ID!

async function getAccessToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await response.json()
  if (!data.access_token) throw new Error(`Error token: ${JSON.stringify(data)}`)
  return data.access_token
}

async function getFilesInFolder(token: string, folderPath: string): Promise<any[]> {
  const encoded = encodeURIComponent(folderPath)
  const url = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:/${encoded}:/children`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const data = await response.json()
  console.log(`Archivos en ${folderPath}:`, JSON.stringify(data).slice(0, 300))
  return data.value || []
}

async function readDocxFromUrl(downloadUrl: string): Promise<string> {
  const response = await fetch(downloadUrl)
  const buffer = await response.arrayBuffer()
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
  return result.value
}

export async function getCompanyKnowledge(companyFolder: string): Promise<string> {
  try {
    const token = await getAccessToken()
    
    // Ruta correcta sin "Documentos/"
    const folderPath = `Conocimiento Agente/${companyFolder}`
    const files = await getFilesInFolder(token, folderPath)

    if (!files || files.length === 0) {
      console.log(`No se encontraron archivos en: ${folderPath}`)
      return ''
    }

    console.log(`Encontrados ${files.length} archivos en ${companyFolder}`)
    let knowledge = ''

    for (const file of files) {
      if (file.name.endsWith('.docx')) {
        try {
          const downloadUrl = file['@microsoft.graph.downloadUrl']
          if (downloadUrl) {
            const content = await readDocxFromUrl(downloadUrl)
            knowledge += `\n\n=== ${file.name.replace('.docx', '')} ===\n${content}`
            console.log(`Leído: ${file.name} (${content.length} chars)`)
          }
        } catch (e: any) {
          console.log(`Error leyendo ${file.name}: ${e.message}`)
        }
      }
    }

    return knowledge
  } catch (error: any) {
    console.error('Error SharePoint:', error.message)
    return ''
  }
}

export async function testSharePointConnection(): Promise<boolean> {
  try {
    const token = await getAccessToken()
    return !!token
  } catch {
    return false
  }
}
