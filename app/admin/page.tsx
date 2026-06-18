'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

type Tab = 'resumen' | 'usuarios' | 'certificados'

type UserRow = {
  id: string
  full_name: string
  email: string
  role: string
  company_id: string
  company_name: string
  company_slug: string
  company_color: string
  mensajes: number
  modulos_completados: number
  total_modulos: number
  ultima_sesion: string | null
  certificate_number: string | null
  fecha_certificado: string | null
}

export default function AdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [certificates, setCertificates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('resumen')
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [creating, setCreating] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [filterCompany, setFilterCompany] = useState('all')
  const [bulkCompanyId, setBulkCompanyId] = useState('')
  const [bulkResults, setBulkResults] = useState<any[]>([])
  const [xlsData, setXlsData] = useState<any[]>([])
  const [createdUsers, setCreatedUsers] = useState<any[]>([])
  const [deletingUser, setDeletingUser] = useState<string | null>(null)
  const [syncingPrompts, setSyncingPrompts] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [showUserDetail, setShowUserDetail] = useState<any>(null)
  const [userDetailModules, setUserDetailModules] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [newUser, setNewUser] = useState({
    full_name: '', email: '', password: '',
    role: 'collaborator', company_id: '',
  })

  const TOTAL_MODULOS: Record<string, number> = {
    'vitanova': 9,
    'escolaris': 6,
    'colegio-montano': 5,
    'mac': 2,
  }

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profileData } = await supabase
      .from('profiles').select('*, companies(*)')
      .eq('id', user.id).single()

    if (!profileData || !['superadmin', 'admin'].includes(profileData.role)) {
      router.push('/dashboard'); return
    }

    setProfile(profileData)

    const { data: comp } = await supabase.from('companies').select('*').order('name')
    setCompanies(comp || [])

    const { data: cert } = await supabase
      .from('certificates')
      .select('*, profiles(full_name, email), companies(name)')
      .order('issued_at', { ascending: false })
    setCertificates(cert || [])

    // Query real con datos completos
    const { data: rawUsers } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, company_id, companies(name, slug, primary_color)')
      .eq('role', 'collaborator')
      .order('full_name')

    if (!rawUsers) { setLoading(false); return }

    // Para cada usuario obtener datos reales
    const userRows: UserRow[] = await Promise.all(rawUsers.map(async (u: any) => {
      const slug = u.companies?.slug || ''
      const totalMods = TOTAL_MODULOS[slug] || 0

      // Módulos completados
      const { count: modCount } = await supabase
        .from('module_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', u.id)
        .eq('company_id', u.company_id)

      // Última sesión y mensajes
      const { data: convData } = await supabase
        .from('conversations')
        .select('id, started_at')
        .eq('user_id', u.id)
        .eq('company_id', u.company_id)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      let msgCount = 0
      if (convData) {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', convData.id)
          .eq('role', 'user')
        msgCount = count || 0
      }

      // Certificado
      const { data: certData } = await supabase
        .from('certificates')
        .select('certificate_number, issued_at')
        .eq('user_id', u.id)
        .eq('company_id', u.company_id)
        .maybeSingle()

      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        role: u.role,
        company_id: u.company_id,
        company_name: u.companies?.name || '',
        company_slug: slug,
        company_color: u.companies?.primary_color || '#3B5BDB',
        mensajes: msgCount,
        modulos_completados: modCount || 0,
        total_modulos: totalMods,
        ultima_sesion: convData?.started_at || null,
        certificate_number: certData?.certificate_number || null,
        fecha_certificado: certData?.issued_at || null,
      }
    }))

    setUsers(userRows)
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  const handleCreateUser = async () => {
    if (!newUser.full_name || !newUser.email || !newUser.company_id) {
      setErrorMsg('Nombre, email y empresa son requeridos'); return
    }
    setCreating(true); setErrorMsg(''); setSuccessMsg('')
    const company = companies.find(c => c.id === newUser.company_id)
    const res = await fetch('/api/admin/create-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, company_name: company?.name, send_invite: false })
    })
    const data = await res.json()
    if (data.error) { setErrorMsg(data.error) }
    else {
      setCreatedUsers(prev => [...prev, { full_name: newUser.full_name, email: newUser.email, password: data.tempPassword, company: company?.name }])
      setSuccessMsg(`✓ Usuario creado: ${newUser.email}`)
      setNewUser({ full_name: '', email: '', password: '', role: 'collaborator', company_id: '' })
      setShowCreateUser(false)
      await loadData()
    }
    setCreating(false)
  }

  const handleXLS = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
      if (rows.length < 2) { setErrorMsg('El archivo está vacío'); return }
      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim())
      const nameIdx = headers.findIndex((h: string) => h.includes('nombre') || h.includes('name'))
      const emailIdx = headers.findIndex((h: string) => h.includes('email') || h.includes('correo'))
      if (nameIdx === -1 || emailIdx === -1) { setErrorMsg('El archivo debe tener columnas "nombre" y "email"'); return }
      const parsed = rows.slice(1)
        .map(row => ({ full_name: String(row[nameIdx] || '').trim(), email: String(row[emailIdx] || '').trim() }))
        .filter(r => r.full_name && r.email && r.email.includes('@'))
      setXlsData(parsed)
      setErrorMsg('')
    }
    reader.readAsArrayBuffer(file)
  }

  const handleBulkUpload = async () => {
    if (!bulkCompanyId || xlsData.length === 0) { setErrorMsg('Selecciona empresa y sube el archivo'); return }
    setBulkLoading(true); setErrorMsg(''); setBulkResults([])
    const results: any[] = []
    for (const row of xlsData) {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: row.full_name, email: row.email, role: 'collaborator', company_id: bulkCompanyId, send_invite: true })
      })
      const data = await res.json()
      results.push({ name: row.full_name, email: row.email, success: !data.error, error: data.error })
      setBulkResults([...results])
    }
    setBulkLoading(false)
    await loadData()
    setSuccessMsg(`✓ ${results.filter(r => r.success).length} de ${results.length} usuarios creados`)
  }

  const handleDeleteUser = async (user: any) => {
    setDeletingUser(user.id)
    try {
      const res = await fetch('/api/admin/delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id }) })
      const data = await res.json()
      if (data.error) { setErrorMsg(data.error) }
      else { setSuccessMsg(`✓ ${user.full_name} eliminado`); await loadData() }
    } catch { setErrorMsg('Error al eliminar usuario') }
    setDeletingUser(null)
    setConfirmDelete(null)
  }

  const exportUsersXLS = () => {
    if (createdUsers.length === 0) { setErrorMsg('No hay usuarios nuevos para exportar'); return }
    const ws = XLSX.utils.json_to_sheet(createdUsers.map(u => ({ 'Nombre': u.full_name, 'Email': u.email, 'Contraseña temporal': u.password, 'Empresa': u.company })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios')
    XLSX.writeFile(wb, `usuarios-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const exportTableXLS = () => {
    const data = filteredUsers.map(u => ({
      'Nombre': u.full_name,
      'Email': u.email,
      'Empresa': u.company_name,
      'Módulos': `${u.modulos_completados}/${u.total_modulos}`,
      'Mensajes': u.mensajes,
      'Última sesión': u.ultima_sesion ? new Date(u.ultima_sesion).toLocaleDateString('es-GT') : '—',
      'Certificado': u.certificate_number || '—',
      'Fecha certificado': u.fecha_certificado ? new Date(u.fecha_certificado).toLocaleDateString('es-GT') : '—',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios')
    XLSX.writeFile(wb, `progreso-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const handleViewDetail = async (user: UserRow) => {
    setShowUserDetail(user)
    const { data } = await supabase
      .from('module_progress').select('*')
      .eq('user_id', user.id).eq('company_id', user.company_id)
      .order('completed_at', { ascending: true })
    setUserDetailModules(data || [])
  }

  const handleGenerateCert = (userId: string, companyId: string, agentSlug: string = 'cultura') => {
    window.open(`/api/certificate-pdf?user_id=${userId}&company_id=${companyId}&agent_slug=${agentSlug}`, '_blank')
  }

  const filteredUsers = users.filter(u => {
    const matchCompany = filterCompany === 'all' || u.company_id === filterCompany
    const matchSearch = !searchQuery || u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCompany && matchSearch
  })

  const getStatusStyle = (u: UserRow) => {
    if (u.certificate_number) return { bg: '#DCFCE7', color: '#166534', label: `✓ Certificado · ${u.modulos_completados > 0 ? `${u.modulos_completados}/${u.total_modulos}` : ''}` }
    if (u.modulos_completados > 0) return { bg: '#EEF2FF', color: '#3B5BDB', label: `${u.modulos_completados}/${u.total_modulos} módulos` }
    if (u.mensajes > 0) return { bg: '#FEF9C3', color: '#854D0E', label: `En progreso · ${u.mensajes} msg` }
    if (u.ultima_sesion) return { bg: '#FEF9C3', color: '#854D0E', label: 'En progreso' }
    return { bg: '#F1F5F9', color: '#64748B', label: 'Sin iniciar' }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FA' }}>
      <div className="text-center">
        <div className="flex items-center gap-2 justify-center mb-3">
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3B5BDB', animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3B5BDB', animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3B5BDB', animationDelay: '300ms' }}></div>
        </div>
        <p className="text-sm" style={{ color: '#64748B' }}>Cargando datos reales...</p>
      </div>
    </div>
  )

  const navItems = [
    { key: 'resumen', label: 'Resumen', icon: '⊞' },
    { key: 'usuarios', label: 'Usuarios', icon: '◎' },
    { key: 'certificados', label: 'Certificados', icon: '◈' },
  ]

  return (
    <div className="min-h-screen flex" style={{ background: '#F5F7FA' }}>
      {/* SIDEBAR */}
      <div className="w-56 min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-20"
        style={{ background: '#1C2B4A', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black" style={{ background: '#3B5BDB', color: 'white' }}>M</div>
            <span className="text-sm font-bold text-white">montano.academy</span>
          </div>
          <p className="text-xs ml-9.5" style={{ color: 'rgba(255,255,255,0.35)', marginLeft: '38px' }}>
            {profile?.role === 'superadmin' ? 'Super Admin' : 'Admin'}
          </p>
        </div>
        <nav className="flex-1 px-3 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest px-3 mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Panel</p>
          {navItems.map(item => (
            <button key={item.key} onClick={() => setTab(item.key as Tab)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-left transition-all"
              style={{ background: tab === item.key ? 'rgba(59,91,219,0.2)' : 'transparent', color: tab === item.key ? '#7B9EFF' : 'rgba(255,255,255,0.5)' }}>
              <span className="text-sm">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
              {item.key === 'usuarios' && (
                <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>{users.length}</span>
              )}
            </button>
          ))}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-widest px-3 mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Acciones</p>
            <button onClick={async () => { setSyncingPrompts(true); const res = await fetch('/api/admin/sync-prompts', { method: 'POST' }); const data = await res.json(); if (data.success) setSuccessMsg('✓ Prompts sincronizados'); else setErrorMsg(data.error); setSyncingPrompts(false) }}
              disabled={syncingPrompts}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-left"
              style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span className="text-sm">⟳</span>
              <span className="text-sm font-medium">{syncingPrompts ? 'Sincronizando...' : 'Sync prompts'}</span>
            </button>
            <button onClick={() => loadData()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-left" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span className="text-sm">↺</span>
              <span className="text-sm font-medium">Actualizar datos</span>
            </button>
            <button onClick={() => router.push('/dashboard')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-left" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span className="text-sm">←</span>
              <span className="text-sm font-medium">Ir al dashboard</span>
            </button>
          </div>
        </nav>
        <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: '#3B5BDB' }}>{profile?.full_name?.charAt(0)}</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{profile?.full_name}</p>
              <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{profile?.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 ml-56">
        {/* Header */}
        <div className="bg-white border-b px-8 h-16 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: '#E8ECF0' }}>
          <div>
            <h1 className="text-base font-bold" style={{ color: '#0F172A' }}>
              {tab === 'resumen' ? 'Resumen general' : tab === 'usuarios' ? 'Gestión de usuarios' : 'Certificados emitidos'}
            </h1>
            <p className="text-xs" style={{ color: '#94A3B8' }}>Datos en tiempo real</p>
          </div>
          <div className="flex items-center gap-2">
            {createdUsers.length > 0 && (
              <button onClick={exportUsersXLS} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: '#BBF7D0', color: '#166534', background: '#F0FDF4' }}>↓ Exportar {createdUsers.length}</button>
            )}
            <button onClick={() => { setShowBulkUpload(true); setErrorMsg(''); setBulkResults([]) }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border hover:bg-gray-50" style={{ borderColor: '#E2E8F0', color: '#475569', background: 'white' }}>
              ↑ Carga masiva
            </button>
            <button onClick={() => { setShowCreateUser(true); setErrorMsg('') }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#3B5BDB' }}>
              + Nuevo usuario
            </button>
          </div>
        </div>

        <div className="p-8">
          {successMsg && (
            <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium" style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>
              {successMsg} <button onClick={() => setSuccessMsg('')} className="ml-auto text-green-400">×</button>
            </div>
          )}
          {errorMsg && (
            <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              {errorMsg} <button onClick={() => setErrorMsg('')} className="ml-auto text-red-400">×</button>
            </div>
          )}

          {/* RESUMEN */}
          {tab === 'resumen' && (
            <div>
              <div className="grid grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Total colaboradores', value: users.length, icon: '◎', color: '#3B5BDB', bg: '#EEF2FF' },
                  { label: 'Con certificado', value: users.filter(u => u.certificate_number).length, icon: '◈', color: '#059669', bg: '#ECFDF5' },
                  { label: 'En progreso', value: users.filter(u => !u.certificate_number && (u.mensajes > 0 || u.modulos_completados > 0)).length, icon: '▶', color: '#D97706', bg: '#FFFBEB' },
                  { label: 'Sin iniciar', value: users.filter(u => !u.certificate_number && u.mensajes === 0).length, icon: '○', color: '#94A3B8', bg: '#F8FAFC' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white rounded-2xl p-6 border" style={{ borderColor: '#E8ECF0' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base mb-4" style={{ background: stat.bg, color: stat.color }}>{stat.icon}</div>
                    <div className="text-3xl font-black mb-1" style={{ color: '#0F172A' }}>{stat.value}</div>
                    <div className="text-xs font-medium" style={{ color: '#94A3B8' }}>{stat.label}</div>
                  </div>
                ))}
              </div>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#94A3B8' }}>Por empresa</h2>
              <div className="grid grid-cols-2 gap-4">
                {companies.map(company => {
                  const compUsers = users.filter(u => u.company_id === company.id)
                  const compCerts = compUsers.filter(u => u.certificate_number).length
                  const compActive = compUsers.filter(u => !u.certificate_number && (u.mensajes > 0 || u.modulos_completados > 0)).length
                  const pct = compUsers.length > 0 ? Math.round((compCerts / compUsers.length) * 100) : 0
                  return (
                    <div key={company.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8ECF0' }}>
                      <div className="h-1.5" style={{ background: company.primary_color || '#3B5BDB' }}></div>
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-5">
                          <h3 className="font-bold text-sm" style={{ color: '#0F172A' }}>{company.name}</h3>
                          <span className="text-2xl font-black" style={{ color: company.primary_color || '#3B5BDB' }}>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full mb-5" style={{ background: '#F1F5F9' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: company.primary_color || '#3B5BDB' }}></div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {[{ val: compUsers.length, label: 'Usuarios' }, { val: compActive, label: 'En progreso' }, { val: compCerts, label: 'Certificados' }].map((s, i) => (
                            <div key={i} className="text-center rounded-xl py-3" style={{ background: '#F8FAFC' }}>
                              <div className="text-xl font-black" style={{ color: '#0F172A' }}>{s.val}</div>
                              <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* USUARIOS */}
          {tab === 'usuarios' && (
            <div>
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#94A3B8' }}>⌕</span>
                  <input type="text" placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#E2E8F0', background: 'white', color: '#0F172A' }} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setFilterCompany('all')}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                    style={{ background: filterCompany === 'all' ? '#1C2B4A' : 'white', color: filterCompany === 'all' ? 'white' : '#475569', borderColor: filterCompany === 'all' ? '#1C2B4A' : '#E2E8F0' }}>
                    Todas ({users.length})
                  </button>
                  {companies.map(c => (
                    <button key={c.id} onClick={() => setFilterCompany(c.id)}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                      style={{ background: filterCompany === c.id ? c.primary_color : 'white', color: filterCompany === c.id ? 'white' : '#475569', borderColor: filterCompany === c.id ? c.primary_color : '#E2E8F0' }}>
                      {c.name} ({users.filter(u => u.company_id === c.id).length})
                    </button>
                  ))}
                </div>
                <button onClick={exportTableXLS}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border hover:bg-slate-50"
                  style={{ borderColor: '#E2E8F0', color: '#475569' }}>
                  ↓ Excel
                </button>
              </div>

              <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8ECF0' }}>
                <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
                  <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>
                    {filterCompany === 'all' ? 'Todos los colaboradores' : companies.find(c => c.id === filterCompany)?.name}
                  </h2>
                  <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: '#F1F5F9', color: '#64748B' }}>{filteredUsers.length} registros</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {['Colaborador', 'Empresa', 'Progreso', 'Mensajes', 'Última sesión', 'Acciones'].map(h => (
                          <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user, i) => {
                        const status = getStatusStyle(user)
                        return (
                          <tr key={user.id} className="hover:bg-slate-50 transition-colors" style={{ borderBottom: i < filteredUsers.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: user.company_color }}>{user.full_name?.charAt(0)}</div>
                                <div>
                                  <p className="text-sm font-semibold cursor-pointer hover:underline" style={{ color: '#3B5BDB' }} onClick={() => handleViewDetail(user)}>{user.full_name}</p>
                                  <p className="text-xs" style={{ color: '#94A3B8' }}>{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-xs font-medium px-2.5 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>{user.company_name}</span>
                            </td>
                            <td className="px-5 py-4">
                              <div>
                                <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: status.bg, color: status.color }}>{status.label}</span>
                                {user.total_modulos > 0 && !user.certificate_number && user.modulos_completados > 0 && (
                                  <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ width: 80, background: '#F1F5F9' }}>
                                    <div className="h-full rounded-full" style={{ width: `${Math.round((user.modulos_completados / user.total_modulos) * 100)}%`, background: '#3B5BDB' }}></div>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-sm font-semibold" style={{ color: user.mensajes > 0 ? '#0F172A' : '#CBD5E1' }}>{user.mensajes > 0 ? user.mensajes : '—'}</span>
                            </td>
                            <td className="px-5 py-4">
                              {user.ultima_sesion ? (
                                <p className="text-xs" style={{ color: '#64748B' }}>
                                  {new Date(user.ultima_sesion).toLocaleDateString('es-GT', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              ) : <p className="text-xs" style={{ color: '#CBD5E1' }}>—</p>}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex gap-2 flex-wrap">
                                {user.company_slug === 'vitanova' ? (
                                  <>
                                    <button onClick={() => handleGenerateCert(user.id, user.company_id, 'cultura')}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-slate-50" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Cert. Cultura</button>
                                    <button onClick={() => handleViewDetail(user)}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: '#BFDBFE', color: '#1D4ED8', background: '#EFF6FF' }}>Módulos</button>
                                  </>
                                ) : (
                                  <button onClick={() => handleGenerateCert(user.id, user.company_id)}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-slate-50" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Certificado</button>
                                )}
                                <button onClick={() => setConfirmDelete(user)}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: '#FCA5A5', color: '#DC2626', background: '#FFF5F5' }}>Eliminar</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-20">
                      <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>Sin resultados</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CERTIFICADOS */}
          {tab === 'certificados' && (
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8ECF0' }}>
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
                <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>Certificados emitidos</h2>
                <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: '#DCFCE7', color: '#166534' }}>{certificates.length} total</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['Colaborador', 'Empresa', 'Certificado', 'Punteo', 'Fecha'].map(h => (
                      <th key={h} className="text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((cert, i) => (
                    <tr key={cert.id} className="hover:bg-slate-50" style={{ borderBottom: i < certificates.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{cert.profiles?.full_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{cert.profiles?.email}</p>
                      </td>
                      <td className="px-6 py-4"><span className="text-xs font-medium px-2.5 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>{cert.companies?.name}</span></td>
                      <td className="px-6 py-4"><span className="text-xs font-mono font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0' }}>{cert.certificate_number}</span></td>
                      <td className="px-6 py-4"><span className="text-sm font-bold" style={{ color: '#166534' }}>{cert.score}/100</span></td>
                      <td className="px-6 py-4 text-xs" style={{ color: '#94A3B8' }}>{new Date(cert.issued_at).toLocaleDateString('es-GT', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DETALLE USUARIO */}
      {showUserDetail && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(15,23,42,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white" style={{ background: showUserDetail.company_color }}>{showUserDetail.full_name?.charAt(0)}</div>
                <div>
                  <h3 className="text-base font-bold" style={{ color: '#0F172A' }}>{showUserDetail.full_name}</h3>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{showUserDetail.email} · {showUserDetail.company_name}</p>
                </div>
              </div>
              <button onClick={() => setShowUserDetail(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-slate-100" style={{ color: '#94A3B8' }}>×</button>
            </div>
            <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { val: showUserDetail.modulos_completados, label: 'Módulos', sub: `de ${showUserDetail.total_modulos}` },
                  { val: showUserDetail.mensajes, label: 'Mensajes', sub: 'enviados' },
                  { val: showUserDetail.certificate_number ? '✓' : '—', label: 'Certificado', sub: showUserDetail.certificate_number ? 'emitido' : 'pendiente' },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl p-4 text-center" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <p className="text-2xl font-black" style={{ color: '#0F172A' }}>{s.val}</p>
                    <p className="text-xs font-semibold mt-1" style={{ color: '#475569' }}>{s.label}</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{s.sub}</p>
                  </div>
                ))}
              </div>
              {userDetailModules.length > 0 ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#94A3B8' }}>Módulos completados</p>
                  <div className="space-y-2">
                    {userDetailModules.map((mod, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">✓</span>
                          <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{mod.module_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold" style={{ color: '#166534' }}>{mod.score}/100</p>
                          <p className="text-xs" style={{ color: '#94A3B8' }}>{new Date(mod.completed_at).toLocaleDateString('es-GT', { month: 'short', day: 'numeric' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>No hay módulos registrados — completó con sistema anterior</p>
              )}
              {showUserDetail.ultima_sesion && (
                <p className="text-xs mt-4" style={{ color: '#94A3B8' }}>
                  Última sesión: {new Date(showUserDetail.ultima_sesion).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
            <div className="px-8 py-5 border-t flex gap-3" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <button onClick={() => handleGenerateCert(showUserDetail.id, showUserDetail.company_id)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white" style={{ background: '#3B5BDB' }}>Generar certificado</button>
              <button onClick={() => setShowUserDetail(null)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold border hover:bg-white" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR USUARIO */}
      {showCreateUser && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(15,23,42,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
              <div><h3 className="text-base font-bold" style={{ color: '#0F172A' }}>Nuevo usuario</h3><p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Se enviará invitación por email</p></div>
              <button onClick={() => { setShowCreateUser(false); setErrorMsg('') }} className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-slate-100" style={{ color: '#94A3B8' }}>×</button>
            </div>
            <div className="px-8 py-6 space-y-5">
              {[{ label: 'Nombre completo', key: 'full_name', type: 'text', placeholder: 'María García' }, { label: 'Correo electrónico', key: 'email', type: 'email', placeholder: 'maria@empresa.com' }].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold mb-2" style={{ color: '#475569' }}>{field.label}</label>
                  <input type={field.type} placeholder={field.placeholder} value={(newUser as any)[field.key]} onChange={e => setNewUser({ ...newUser, [field.key]: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#475569' }}>Empresa</label>
                <select value={newUser.company_id} onChange={e => setNewUser({ ...newUser, company_id: e.target.value })} className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: '#E2E8F0', color: '#0F172A' }}>
                  <option value="">Selecciona empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#475569' }}>Rol</label>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: '#E2E8F0', color: '#0F172A' }}>
                  <option value="collaborator">Colaborador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              {errorMsg && <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{errorMsg}</div>}
            </div>
            <div className="px-8 py-5 border-t flex gap-3" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <button onClick={() => { setShowCreateUser(false); setErrorMsg('') }} className="flex-1 py-3 rounded-xl text-sm font-semibold border hover:bg-white" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Cancelar</button>
              <button onClick={handleCreateUser} disabled={creating} className="flex-1 py-3 rounded-xl text-sm font-semibold text-white" style={{ background: creating ? '#94A3B8' : '#3B5BDB' }}>{creating ? 'Creando...' : 'Crear usuario'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CARGA MASIVA */}
      {showBulkUpload && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(15,23,42,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
              <div><h3 className="text-base font-bold" style={{ color: '#0F172A' }}>Carga masiva</h3><p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Excel con columnas: nombre, email</p></div>
              <button onClick={() => { setShowBulkUpload(false); setXlsData([]); setBulkResults([]); setErrorMsg('') }} className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-slate-100" style={{ color: '#94A3B8' }}>×</button>
            </div>
            <div className="px-8 py-6 space-y-5">
              <div className="rounded-xl p-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="rounded-lg overflow-hidden border text-xs font-mono" style={{ borderColor: '#E2E8F0' }}>
                  <div className="grid grid-cols-2 px-3 py-2 font-bold" style={{ background: '#1C2B4A', color: 'white' }}><span>nombre</span><span>email</span></div>
                  <div className="grid grid-cols-2 px-3 py-2" style={{ color: '#475569' }}><span>María García</span><span>maria@empresa.com</span></div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#475569' }}>Empresa destino</label>
                <select value={bulkCompanyId} onChange={e => setBulkCompanyId(e.target.value)} className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: '#E2E8F0', color: '#0F172A' }}>
                  <option value="">Selecciona empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#475569' }}>Archivo Excel (.xlsx)</label>
                <label className="flex items-center justify-center gap-3 w-full border-2 border-dashed rounded-xl py-8 cursor-pointer hover:bg-slate-50" style={{ borderColor: xlsData.length > 0 ? '#3B5BDB' : '#E2E8F0' }}>
                  <input type="file" accept=".xlsx,.xls" onChange={handleXLS} className="hidden" />
                  {xlsData.length > 0 ? (
                    <div className="text-center"><p className="text-sm font-bold" style={{ color: '#3B5BDB' }}>✓ {xlsData.length} usuarios detectados</p><p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Click para cambiar</p></div>
                  ) : (
                    <div className="text-center"><p className="text-2xl mb-2">↑</p><p className="text-sm font-medium" style={{ color: '#475569' }}>Seleccionar archivo</p></div>
                  )}
                </label>
              </div>
              {errorMsg && <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{errorMsg}</div>}
              {bulkResults.length > 0 && (
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#E2E8F0' }}>
                  <div className="px-4 py-2.5 flex justify-between" style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                    <p className="text-xs font-bold" style={{ color: '#475569' }}>Resultados</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{bulkResults.filter(r => r.success).length}/{bulkResults.length}</p>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {bulkResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs border-t" style={{ borderColor: '#F8FAFC' }}>
                        <span style={{ color: '#0F172A' }}>{r.name}</span>
                        <span className="font-semibold" style={{ color: r.success ? '#166534' : '#DC2626' }}>{r.success ? '✓' : '✗ ' + (r.error?.includes('already') ? 'Ya existe' : 'Error')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-8 py-5 border-t flex gap-3" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <button onClick={() => { setShowBulkUpload(false); setXlsData([]); setBulkResults([]); setErrorMsg('') }} className="flex-1 py-3 rounded-xl text-sm font-semibold border hover:bg-white" style={{ borderColor: '#E2E8F0', color: '#475569' }}>{bulkResults.length > 0 ? 'Cerrar' : 'Cancelar'}</button>
              <button onClick={handleBulkUpload} disabled={bulkLoading || xlsData.length === 0 || !bulkCompanyId}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: bulkLoading || xlsData.length === 0 || !bulkCompanyId ? '#94A3B8' : '#3B5BDB' }}>
                {bulkLoading ? `Creando ${bulkResults.length}/${xlsData.length}...` : xlsData.length > 0 ? `Crear ${xlsData.length} usuarios` : 'Selecciona archivo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(15,23,42,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b" style={{ borderColor: '#F1F5F9' }}>
              <h3 className="text-base font-bold mb-1" style={{ color: '#0F172A' }}>Eliminar usuario</h3>
              <p className="text-sm" style={{ color: '#64748B' }}>Esta acción no se puede deshacer.</p>
            </div>
            <div className="px-8 py-6">
              <div className="flex items-center gap-3 p-4 rounded-xl mb-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white" style={{ background: confirmDelete.company_color }}>{confirmDelete.full_name?.charAt(0)}</div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{confirmDelete.full_name}</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{confirmDelete.email}</p>
                </div>
              </div>
              <p className="text-xs px-4 py-3 rounded-xl" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>Se eliminará el usuario y todo su historial.</p>
            </div>
            <div className="px-8 py-5 border-t flex gap-3" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-xl text-sm font-semibold border hover:bg-white" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Cancelar</button>
              <button onClick={() => handleDeleteUser(confirmDelete)} disabled={deletingUser === confirmDelete.id} className="flex-1 py-3 rounded-xl text-sm font-semibold text-white" style={{ background: '#DC2626' }}>{deletingUser === confirmDelete.id ? 'Eliminando...' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
