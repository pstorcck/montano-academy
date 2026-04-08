import { getMSToken } from './ms-graph-auth'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const SITE_ID = process.env.SHAREPOINT_SITE_ID!
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COMPANY_CONFIG = [
  {
    companyId: '8f8cf0fc-f956-4f15-b2f3-2c92c121a8c3',
    folder: 'Conocimiento Agente/Colegio Montano',
    vectorStoreId: 'vs_69d6d07ace58819197eba8b1c0d8e09a',
  },
  {
    companyId: 'ce6064aa-8b03-4a3d-b0e8-8ff91335832c',
    folder: 'Conocimiento Agente/MAC Guatemala',
    vectorStoreId: 'vs_69d6d09467f48191bc1a3e2e29aab112',
  },
  {
    companyId: '233536c1-e6e2-4fae-97e6-c43003db651a',
    folder: 'Conocimiento Agente/Vitanova',
    vectorStoreId: 'vs_69d6d0eaf67881918e8a948c07821a65',
  },
]

async function getFilesInFolder(token: string, folderPath: string) {
  const encoded = encodeURIComponent(folderPath)
  const url = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:/${encoded}:/children`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  return data.value || []
}

async function downloadFile(token: string, downloadUrl: string): Promise<Buffer> {
  const res = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } })
  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer)
}

async function uploadToOpenAI(buffer: Buffer, filename: string): Promise<string> {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const file = new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const uploaded = await openai.files.create({ file, purpose: 'assistants' })
  return uploaded.id
}

async function addFileToVectorStore(vectorStoreId: string, fileId: string) {
  await openai.vectorStores.files.create(vectorStoreId, { file_id: fileId })
}

async function deleteFileFromOpenAI(fileId: string, vectorStoreId: string) {
  try {
    await openai.vectorStores.files.del(vectorStoreId, fileId)
    await openai.files.del(fileId)
  } catch (e) {
    console.log(`Error eliminando archivo ${fileId}:`, e)
  }
}

export async function syncCompany(config: typeof COMPANY_CONFIG[0]) {
  const token = await getMSToken()
  const spFiles = await getFilesInFolder(token, config.folder)
  const results: any[] = []

  for (const spFile of spFiles) {
    if (!spFile.name.endsWith('.docx')) continue

    const { data: existing } = await supabaseAdmin
      .from('document_sync')
      .select('*')
      .eq('sharepoint_file_id', spFile.id)
      .single()

    const spLastModified = spFile.lastModifiedDateTime

    // Si ya existe y no cambió, saltar
    if (existing && existing.last_modified === spLastModified && existing.status === 'synced') {
      results.push({ file: spFile.name, status: 'unchanged' })
      continue
    }

    // Si existe y cambió, eliminar el anterior de OpenAI
    if (existing?.openai_file_id) {
      await deleteFileFromOpenAI(existing.openai_file_id, config.vectorStoreId)
    }

    // Descargar y subir a OpenAI
    const downloadUrl = spFile['@microsoft.graph.downloadUrl']
    const buffer = await downloadFile(token, downloadUrl)
    const openaiFileId = await uploadToOpenAI(buffer, spFile.name)
    await addFileToVectorStore(config.vectorStoreId, openaiFileId)

    // Guardar en Supabase
    await supabaseAdmin.from('document_sync').upsert({
      sharepoint_file_id: spFile.id,
      sharepoint_file_name: spFile.name,
      company_id: config.companyId,
      openai_file_id: openaiFileId,
      last_modified: spLastModified,
      status: 'synced',
      synced_at: new Date().toISOString(),
    }, { onConflict: 'sharepoint_file_id' })

    results.push({ file: spFile.name, status: existing ? 'updated' : 'created', openaiFileId })
  }

  // Detectar archivos eliminados de SharePoint
  const { data: syncedFiles } = await supabaseAdmin
    .from('document_sync')
    .select('*')
    .eq('company_id', config.companyId)
    .eq('status', 'synced')

  const spFileIds = spFiles.map((f: any) => f.id)

  for (const synced of syncedFiles || []) {
    if (!spFileIds.includes(synced.sharepoint_file_id)) {
      await deleteFileFromOpenAI(synced.openai_file_id, config.vectorStoreId)
      await supabaseAdmin
        .from('document_sync')
        .update({ status: 'deleted' })
        .eq('sharepoint_file_id', synced.sharepoint_file_id)
      results.push({ file: synced.sharepoint_file_name, status: 'deleted' })
    }
  }

  return results
}

export async function syncAll() {
  const allResults: any[] = []
  for (const config of COMPANY_CONFIG) {
    console.log(`Sincronizando ${config.folder}...`)
    const results = await syncCompany(config)
    allResults.push({ folder: config.folder, results })
  }
  return allResults
}
