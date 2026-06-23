const { createClient } = require('@supabase/supabase-js')

const MONDAY_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU0NTU1MDY2MSwiYWFpIjoxMSwidWlkIjoyMDk0NzQxMiwiaWFkIjoiMjAyNS0wNy0zMVQyMToyNDowOS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6ODQ0NDg3MSwicmduIjoidXNlMSJ9.I88fq3ZLBNqku34XLXqG31Uny8W3wBFISZ_AZ4_gdUw'
const BOARD_ID = '18418904832'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const mondayQuery = async (query, variables = {}) => {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify({ query, variables })
  })
  const data = await res.json()
  if (data.errors) console.error('Monday error:', data.errors)
  return data
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  console.log('Cargando datos de Supabase...')

  const [{ data: users }, { data: certs }, { data: modProg }, { data: convs }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, company_id, companies(name, slug)').eq('role', 'collaborator').order('full_name'),
    supabase.from('certificates').select('user_id, company_id, issued_at'),
    supabase.from('module_progress').select('user_id, company_id, module_name'),
    supabase.from('conversations').select('user_id, company_id, started_at').order('started_at', { ascending: false }),
  ])

  console.log(`${users.length} colaboradores encontrados`)

  // Obtener items existentes en Monday
  const existingRes = await mondayQuery(`{ boards(ids: ${BOARD_ID}) { items_page(limit: 500) { items { id name column_values { id text value } } } } }`)
  const existingItems = existingRes.data?.boards?.[0]?.items_page?.items || []
  const existingByEmail = {}
  existingItems.forEach(item => {
    const emailCol = item.column_values?.find(c => c.id === 'text_mm4kczg1')
    if (emailCol?.text) existingByEmail[emailCol.text] = item.id
  })
  console.log(`${existingItems.length} items existentes en Monday`)

  let created = 0, updated = 0

  for (const user of users) {
    const hasCert = certs?.some(c => c.user_id === user.id)
    const hasMod = modProg?.some(m => m.user_id === user.id)
    const lastConv = convs?.find(c => c.user_id === user.id)
    const modCount = modProg?.filter(m => m.user_id === user.id).length || 0

    const estado = hasCert ? 'Certificado' : hasMod || lastConv ? 'En progreso' : 'Sin iniciar'
    const ultimaSesion = lastConv?.started_at ? lastConv.started_at.slice(0, 10) : null

    const columnValues = JSON.stringify({
      text_mm4kczg1: user.email,
      text_mm4kc0gx: user.companies?.name || '',
      color_mm4kehvb: { label: estado },
      numeric_mm4ktzc: modCount,
      ...(ultimaSesion ? { date_mm4kyyt7: { date: ultimaSesion } } : {})
    })

    if (existingByEmail[user.email]) {
      // Actualizar
      await mondayQuery(
        `mutation { change_multiple_column_values(board_id: ${BOARD_ID}, item_id: ${existingByEmail[user.email]}, column_values: ${JSON.stringify(columnValues)}) { id } }`
      )
      updated++
    } else {
      // Crear nuevo
      await mondayQuery(
        `mutation { create_item(board_id: ${BOARD_ID}, item_name: ${JSON.stringify(user.full_name)}, column_values: ${JSON.stringify(columnValues)}) { id } }`
      )
      created++
    }

    await sleep(300) // Respetar rate limit de Monday
  }

  console.log(`✅ Sincronización completa: ${created} creados, ${updated} actualizados`)
})()
