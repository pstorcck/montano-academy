'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

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

const COLORS_PIE = ['#3B5BDB', '#10B981', '#F59E0B', '#EF4444']

export default function AdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [certificates, setCertificates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'collaborator', company_id: '' })

  const TOTAL_MODULOS: Record<string, number> = {
    'vitanova': 9, 'escolaris': 6, 'colegio-montano': 5, 'mac': 2,
  }

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profileData } = await supabase.from('profiles').select('*, companies(*)').eq('id', user.id).single()
    if (!profileData || !['superadmin', 'admin'].includes(profileData.role)) { router.push('/dashboard'); return }
    setProfile(profileData)

    const { data: comp } = await supabase.from('companies').select('*').order('name')
    setCompanies(comp || [])

    const { data: cert } = await supabase.from('certificates').select('*, profiles(full_name, email), companies(name)').order('issued_at', { ascending: false })
    setCertificates(cert || [])

    const { data: rawUsers } = await supabase.from('profiles').select('id, full_name, email, role, company_id, companies(name, slug, primary_color)').eq('role', 'collaborator').order('full_name')
    if (!rawUsers) { setLoading(false); setRefreshing(false); return }

    const userRows: UserRow[] = await Promise.all(rawUsers.map(async (u: any) => {
      const slug = u.companies?.slug || ''
      const totalMods = TOTAL_MODULOS[slug] || 0

      const [{ count: modCount }, convResult, certData] = await Promise.all([
        supabase.from('module_progress').select('*', { count: 'exact', head: true }).eq('user_id', u.id).eq('company_id', u.company_id),
        supabase.from('conversations').select('id, started_at').eq('user_id', u.id).eq('company_id', u.company_id).order('started_at', { ascending: false }).limit(1).single(),
        supabase.from('certificates').select('certificate_number, issued_at').eq('user_id', u.id).eq('company_id', u.company_id).maybeSingle()
      ])

      let msgCount = 0
      if (convResult.data) {
        const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('conversation_id', convResult.data.id).eq('role', 'user')
        msgCount = count || 0
      }

      return {
        id: u.id, full_name: u.full_name, email: u.email, role: u.role,
        company_id: u.company_id, company_name: u.companies?.name || '',
        company_slug: slug, company_color: u.companies?.primary_color || '#3B5BDB',
        mensajes: msgCount, modulos_completados: modCount || 0, total_modulos: totalMods,
        ultima_sesion: convResult.data?.started_at || null,
        certificate_number: certData.data?.certificate_number || null,
        fecha_certificado: certData.data?.issued_at || null,
      }
    }))

    setUsers(userRows)
    setLoading(false)
    setRefreshing(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  const handleCreateUser = async () => {
    if (!newUser.full_name || !newUser.email || !newUser.company_id) { setErrorMsg('Nombre, email y empresa son requeridos'); return }
    setCreating(true); setErrorMsg(''); setSuccessMsg('')
    const company = companies.find(c => c.id === newUser.company_id)
    const res = await fetch('/api/admin/create-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newUser, company_name: company?.name, send_invite: false }) })
    const data = await res.json()
    if (data.error) { setErrorMsg(data.error) }
    else {
      setCreatedUsers(prev => [...prev, { full_name: newUser.full_name, email: newUser.email, password: data.tempPassword, company: company?.name }])
      setSuccessMsg(`✓ Usuario creado: ${newUser.email}`)
      setNewUser({ full_name: '', email: '', password: '', role: 'collaborator', company_id: '' })
      setShowCreateUser(false)
      await loadData(true)
    }
    setCreating(false)
  }

  const handleXLS = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
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
      if (nameIdx === -1 || emailIdx === -1) { setErrorMsg('Columnas requeridas: nombre, email'); return }
      const parsed = rows.slice(1).map(row => ({ full_name: String(row[nameIdx] || '').trim(), email: String(row[emailIdx] || '').trim() })).filter(r => r.full_name && r.email && r.email.includes('@'))
      setXlsData(parsed); setErrorMsg('')
    }
    reader.readAsArrayBuffer(file)
  }

  const handleBulkUpload = async () => {
    if (!bulkCompanyId || xlsData.length === 0) { setErrorMsg('Selecciona empresa y archivo'); return }
    setBulkLoading(true); setErrorMsg(''); setBulkResults([])
    const results: any[] = []
    for (const row of xlsData) {
      const res = await fetch('/api/admin/create-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: row.full_name, email: row.email, role: 'collaborator', company_id: bulkCompanyId, send_invite: true }) })
      const data = await res.json()
      results.push({ name: row.full_name, email: row.email, success: !data.error, error: data.error })
      setBulkResults([...results])
    }
    setBulkLoading(false); await loadData(true)
    setSuccessMsg(`✓ ${results.filter(r => r.success).length} de ${results.length} usuarios creados`)
  }

  const handleDeleteUser = async (user: any) => {
    setDeletingUser(user.id)
    try {
      const res = await fetch('/api/admin/delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id }) })
      const data = await res.json()
      if (data.error) setErrorMsg(data.error)
      else { setSuccessMsg(`✓ ${user.full_name} eliminado`); await loadData(true) }
    } catch { setErrorMsg('Error al eliminar') }
    setDeletingUser(null); setConfirmDelete(null)
  }

  const exportTableXLS = () => {
    const data = filteredUsers.map(u => ({
      'Nombre': u.full_name, 'Email': u.email, 'Empresa': u.company_name,
      'Módulos': `${u.modulos_completados}/${u.total_modulos}`,
      'Mensajes': u.mensajes,
      'Última sesión': u.ultima_sesion ? new Date(u.ultima_sesion).toLocaleDateString('es-GT') : '—',
      'Certificado': u.certificate_number || '—',
      'Fecha cert.': u.fecha_certificado ? new Date(u.fecha_certificado).toLocaleDateString('es-GT') : '—',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Progreso')
    XLSX.writeFile(wb, `progreso-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const handleViewDetail = async (user: UserRow) => {
    setShowUserDetail(user)
    const { data } = await supabase.from('module_progress').select('*').eq('user_id', user.id).eq('company_id', user.company_id).order('completed_at', { ascending: true })
    setUserDetailModules(data || [])
  }

  const handleGenerateCert = (userId: string, companyId: string, agentSlug = 'cultura') => {
    window.open(`/api/certificate-pdf?user_id=${userId}&company_id=${companyId}&agent_slug=${agentSlug}`, '_blank')
  }

  const getStatus = (u: UserRow) => {
    if (u.certificate_number) return { label: 'Certificado', bg: '#DCFCE7', color: '#166534', dot: '#10B981' }
    if (u.modulos_completados > 0) return { label: `${u.modulos_completados}/${u.total_modulos} módulos`, bg: '#EEF2FF', color: '#3B5BDB', dot: '#3B5BDB' }
    if (u.mensajes > 5) return { label: 'En progreso', bg: '#FEF9C3', color: '#854D0E', dot: '#F59E0B' }
    if (u.ultima_sesion) return { label: 'Iniciado', bg: '#FFF7ED', color: '#C2410C', dot: '#FB923C' }
    return { label: 'Sin iniciar', bg: '#F1F5F9', color: '#64748B', dot: '#CBD5E1' }
  }

  const filteredUsers = users.filter(u => {
    const matchC = filterCompany === 'all' || u.company_id === filterCompany
    const matchS = !searchQuery || u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchC && matchS
  })

  // Data para gráficas
  const pieData = companies.map(c => {
    const compUsers = users.filter(u => u.company_id === c.id)
    const certs = compUsers.filter(u => u.certificate_number).length
    return { name: c.name, value: compUsers.length, certificados: certs, color: c.primary_color || '#3B5BDB' }
  }).filter(d => d.value > 0)

  const barData = companies.map(c => {
    const compUsers = users.filter(u => u.company_id === c.id)
    const certs = compUsers.filter(u => u.certificate_number).length
    const prog = compUsers.filter(u => !u.certificate_number && (u.mensajes > 0 || u.modulos_completados > 0)).length
    const sinIniciar = compUsers.filter(u => !u.certificate_number && u.mensajes === 0).length
    return { name: c.name.replace('Colegio ', 'C. ').replace('Guatemala', 'GT'), Certificados: certs, 'En progreso': prog, 'Sin iniciar': sinIniciar }
  })

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FA' }}>
      <div className="text-center">
        <div className="flex gap-2 justify-center mb-3">
          {[0, 150, 300].map(d => <div key={d} className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3B5BDB', animationDelay: `${d}ms` }}></div>)}
        </div>
        <p className="text-sm font-medium" style={{ color: '#64748B' }}>Cargando datos reales...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex" style={{ background: '#F5F7FA' }}>

      {/* SIDEBAR */}
      <div className="w-56 min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-20" style={{ background: '#1C2B4A' }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black" style={{ background: '#3B5BDB', color: 'white' }}>M</div>
            <span className="text-sm font-bold text-white">montano.academy</span>
          </div>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)', marginLeft: '38px' }}>{profile?.role === 'superadmin' ? 'Super Admin' : 'Admin'}</p>
        </div>

        <nav className="flex-1 px-3 py-4">
          <p className="text-xs font-bold uppercase tracking-widest px-3 mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>Panel</p>
          {[
            { key: 'resumen', label: 'Resumen', icon: '⊞' },
            { key: 'usuarios', label: 'Usuarios', icon: '◎', badge: users.length },
            { key: 'certificados', label: 'Certificados', icon: '◈', badge: certificates.length },
          ].map(item => (
            <button key={item.key} onClick={() => setTab(item.key as Tab)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-all"
              style={{ background: tab === item.key ? 'rgba(59,91,219,0.25)' : 'transparent', color: tab === item.key ? '#93ABFF' : 'rgba(255,255,255,0.45)' }}>
              <span>{item.icon}</span>
              <span className="text-sm font-medium flex-1">{item.label}</span>
              {item.badge !== undefined && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }}>{item.badge}</span>}
            </button>
          ))}

          <p className="text-xs font-bold uppercase tracking-widest px-3 mb-3 mt-5" style={{ color: 'rgba(255,255,255,0.2)' }}>Acciones</p>
          {[
            { icon: '↺', label: refreshing ? 'Actualizando...' : 'Actualizar', action: () => loadData(true) },
            { icon: '⟳', label: syncingPrompts ? 'Sincronizando...' : 'Sync prompts', action: async () => { setSyncingPrompts(true); const res = await fetch('/api/admin/sync-prompts', { method: 'POST' }); const data = await res.json(); if (data.success) setSuccessMsg('✓ Prompts sincronizados'); else setErrorMsg(data.error); setSyncingPrompts(false) } },
            { icon: '←', label: 'Dashboard', action: () => router.push('/dashboard') },
          ].map((item, i) => (
            <button key={i} onClick={item.action} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-all hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span className="text-sm">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: '#3B5BDB' }}>{profile?.full_name?.charAt(0)}</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{profile?.full_name}</p>
              <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{profile?.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 ml-56">
        {/* Topbar */}
        <div className="bg-white border-b px-8 h-16 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: '#E8ECF0' }}>
          <div>
            <h1 className="text-base font-bold" style={{ color: '#0F172A' }}>
              {tab === 'resumen' ? 'Panel de control' : tab === 'usuarios' ? 'Colaboradores' : 'Certificados'}
            </h1>
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              {refreshing ? 'Actualizando...' : 'Datos en tiempo real'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'usuarios' && (
              <button onClick={exportTableXLS} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-slate-50 transition-all" style={{ borderColor: '#E2E8F0', color: '#475569' }}>
                ↓ Exportar Excel
              </button>
            )}
            <button onClick={() => { setShowBulkUpload(true); setErrorMsg(''); setBulkResults([]) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-slate-50 transition-all" style={{ borderColor: '#E2E8F0', color: '#475569', background: 'white' }}>
              ↑ Carga masiva
            </button>
            <button onClick={() => { setShowCreateUser(true); setErrorMsg('') }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all" style={{ background: '#3B5BDB' }}>
              + Nuevo usuario
            </button>
          </div>
        </div>

        <div className="p-8">
          {successMsg && <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium" style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>{successMsg}<button onClick={() => setSuccessMsg('')} className="ml-auto opacity-50">×</button></div>}
          {errorMsg && <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{errorMsg}<button onClick={() => setErrorMsg('')} className="ml-auto opacity-50">×</button></div>}

          {/* ═══ RESUMEN ═══ */}
          {tab === 'resumen' && (
            <div>
              {/* KPIs */}
              <div className="grid grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Colaboradores', value: users.length, sub: 'registrados', color: '#3B5BDB', bg: '#EEF2FF', icon: '◎' },
                  { label: 'Certificados', value: users.filter(u => u.certificate_number).length, sub: `${users.length > 0 ? Math.round(users.filter(u => u.certificate_number).length / users.length * 100) : 0}% del total`, color: '#059669', bg: '#ECFDF5', icon: '◈' },
                  { label: 'En progreso', value: users.filter(u => !u.certificate_number && (u.mensajes > 0 || u.modulos_completados > 0)).length, sub: 'activos', color: '#D97706', bg: '#FFFBEB', icon: '▶' },
                  { label: 'Sin iniciar', value: users.filter(u => !u.certificate_number && u.mensajes === 0).length, sub: 'pendientes', color: '#94A3B8', bg: '#F8FAFC', icon: '○' },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-2xl p-6 border transition-all hover:shadow-md" style={{ borderColor: '#E8ECF0' }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
                      <span className="text-xs font-medium px-2 py-1 rounded-lg" style={{ background: s.bg, color: s.color }}>{s.sub}</span>
                    </div>
                    <p className="text-4xl font-black mb-1" style={{ color: '#0F172A' }}>{s.value}</p>
                    <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Gráficas */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                {/* Dona */}
                <div className="bg-white rounded-2xl p-6 border" style={{ borderColor: '#E8ECF0' }}>
                  <h3 className="text-sm font-bold mb-1" style={{ color: '#0F172A' }}>Distribución de usuarios</h3>
                  <p className="text-xs mb-6" style={{ color: '#94A3B8' }}>Por empresa</p>
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie data={pieData} cx={75} cy={75} innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-3">
                      {pieData.map((d, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }}></div>
                            <span className="text-xs font-medium" style={{ color: '#475569' }}>{d.name.replace('Colegio ', 'C. ')}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold" style={{ color: '#0F172A' }}>{d.value}</span>
                            <span className="text-xs ml-1" style={{ color: '#94A3B8' }}>({d.certificados} cert.)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Barras */}
                <div className="bg-white rounded-2xl p-6 border" style={{ borderColor: '#E8ECF0' }}>
                  <h3 className="text-sm font-bold mb-1" style={{ color: '#0F172A' }}>Progreso por empresa</h3>
                  <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>Certificados · En progreso · Sin iniciar</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={barData} barSize={14} barGap={2}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                      <Bar dataKey="Certificados" fill="#10B981" radius={[4,4,0,0]} />
                      <Bar dataKey="En progreso" fill="#F59E0B" radius={[4,4,0,0]} />
                      <Bar dataKey="Sin iniciar" fill="#E2E8F0" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Cards por empresa */}
              <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#94A3B8' }}>Detalle por empresa</h2>
              <div className="grid grid-cols-2 gap-4">
                {companies.map(company => {
                  const cu = users.filter(u => u.company_id === company.id)
                  const certs = cu.filter(u => u.certificate_number).length
                  const prog = cu.filter(u => !u.certificate_number && (u.mensajes > 0 || u.modulos_completados > 0)).length
                  const pct = cu.length > 0 ? Math.round((certs / cu.length) * 100) : 0
                  return (
                    <div key={company.id} className="bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-all cursor-pointer" style={{ borderColor: '#E8ECF0' }} onClick={() => { setTab('usuarios'); setFilterCompany(company.id) }}>
                      <div className="h-1.5" style={{ background: company.primary_color }}></div>
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold" style={{ color: '#0F172A' }}>{company.name}</h3>
                          <span className="text-2xl font-black" style={{ color: company.primary_color }}>{pct}%</span>
                        </div>
                        <div className="h-2 rounded-full mb-5 overflow-hidden" style={{ background: '#F1F5F9' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${company.primary_color}, ${company.primary_color}CC)` }}></div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {[{ val: cu.length, label: 'Total' }, { val: prog, label: 'En progreso' }, { val: certs, label: 'Certificados' }].map((s, i) => (
                            <div key={i} className="text-center rounded-xl py-3" style={{ background: '#F8FAFC' }}>
                              <p className="text-xl font-black" style={{ color: '#0F172A' }}>{s.val}</p>
                              <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{s.label}</p>
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

          {/* ═══ USUARIOS ═══ */}
          {tab === 'usuarios' && (
            <div>
              {/* Filtros */}
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="relative" style={{ minWidth: 260 }}>
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#94A3B8' }}>⌕</span>
                  <input type="text" placeholder="Buscar por nombre o email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all" style={{ borderColor: '#E2E8F0', background: 'white', color: '#0F172A' }} />
                </div>
                <div className="flex gap-2 flex-wrap flex-1">
                  <button onClick={() => setFilterCompany('all')} className="px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                    style={{ background: filterCompany === 'all' ? '#1C2B4A' : 'white', color: filterCompany === 'all' ? 'white' : '#475569', borderColor: filterCompany === 'all' ? '#1C2B4A' : '#E2E8F0' }}>
                    Todas ({users.length})
                  </button>
                  {companies.map(c => (
                    <button key={c.id} onClick={() => setFilterCompany(c.id)} className="px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                      style={{ background: filterCompany === c.id ? c.primary_color : 'white', color: filterCompany === c.id ? 'white' : '#475569', borderColor: filterCompany === c.id ? c.primary_color : '#E2E8F0' }}>
                      {c.name.replace('Colegio ', 'C. ')} ({users.filter(u => u.company_id === c.id).length})
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabla */}
              <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8ECF0' }}>
                <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
                  <div>
                    <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>{filterCompany === 'all' ? 'Todos los colaboradores' : companies.find(c => c.id === filterCompany)?.name}</h2>
                    <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{filteredUsers.length} registros · Click en el nombre para ver detalle</p>
                  </div>
                  <button onClick={exportTableXLS} className="text-xs font-semibold px-3 py-2 rounded-lg border hover:bg-slate-50" style={{ borderColor: '#E2E8F0', color: '#475569' }}>↓ Excel</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {['Colaborador', 'Estado', 'Progreso', 'Mensajes', 'Última sesión', 'Acciones'].map(h => (
                          <th key={h} className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: '#94A3B8', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: '#F8FAFC' }}>
                      {filteredUsers.map((user) => {
                        const status = getStatus(user)
                        const pct = user.total_modulos > 0 ? Math.round((user.modulos_completados / user.total_modulos) * 100) : 0
                        return (
                          <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ background: user.company_color }}>{user.full_name?.charAt(0)}</div>
                                <div>
                                  <p className="text-sm font-bold cursor-pointer hover:underline decoration-dotted" style={{ color: '#3B5BDB' }} onClick={() => handleViewDetail(user)}>{user.full_name}</p>
                                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: status.dot }}></div>
                                <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: status.bg, color: status.color }}>{status.label}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {user.total_modulos > 0 ? (
                                <div>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-medium" style={{ color: '#475569' }}>{user.modulos_completados}/{user.total_modulos}</span>
                                    <span className="text-xs font-bold" style={{ color: pct === 100 ? '#059669' : '#3B5BDB' }}>{pct}%</span>
                                  </div>
                                  <div className="h-2 rounded-full overflow-hidden" style={{ width: 100, background: '#F1F5F9' }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#10B981' : '#3B5BDB' }}></div>
                                  </div>
                                </div>
                              ) : (
                                user.certificate_number ? <span className="text-xs" style={{ color: '#10B981' }}>✓ Completado</span> :
                                <span className="text-xs" style={{ color: '#CBD5E1' }}>—</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: user.mensajes > 10 ? '#10B981' : user.mensajes > 0 ? '#F59E0B' : '#E2E8F0' }}></div>
                                <span className="text-sm font-semibold" style={{ color: user.mensajes > 0 ? '#0F172A' : '#CBD5E1' }}>{user.mensajes > 0 ? user.mensajes : '—'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {user.ultima_sesion ? (
                                <div>
                                  <p className="text-xs font-medium" style={{ color: '#475569' }}>{new Date(user.ultima_sesion).toLocaleDateString('es-GT', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                </div>
                              ) : <p className="text-xs" style={{ color: '#CBD5E1' }}>—</p>}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                {user.company_slug === 'vitanova' ? (
                                  <>
                                    <button onClick={() => handleGenerateCert(user.id, user.company_id, 'cultura')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-slate-50 transition-all" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Cert.</button>
                                    <button onClick={() => handleViewDetail(user)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all" style={{ borderColor: '#BFDBFE', color: '#1D4ED8', background: '#EFF6FF' }}>Módulos</button>
                                  </>
                                ) : (
                                  <button onClick={() => handleGenerateCert(user.id, user.company_id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-slate-50 transition-all" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Certificado</button>
                                )}
                                <button onClick={() => setConfirmDelete(user)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all" style={{ borderColor: '#FCA5A5', color: '#DC2626', background: '#FFF5F5' }}>×</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-20">
                      <p className="text-3xl mb-3">◎</p>
                      <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>Sin resultados</p>
                      <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>{searchQuery ? 'Prueba otra búsqueda' : 'No hay usuarios en esta empresa'}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ CERTIFICADOS ═══ */}
          {tab === 'certificados' && (
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8ECF0' }}>
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>Certificados emitidos</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{certificates.length} certificados en total</p>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: '#DCFCE7', color: '#166534' }}>✓ {certificates.length} emitidos</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['Colaborador', 'Empresa', 'Número', 'Punteo', 'Fecha de emisión'].map(h => (
                      <th key={h} className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: '#94A3B8', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: '#F8FAFC' }}>
                  {certificates.map((cert) => (
                    <tr key={cert.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{cert.profiles?.full_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{cert.profiles?.email}</p>
                      </td>
                      <td className="px-6 py-4"><span className="text-xs font-medium px-2.5 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>{cert.companies?.name}</span></td>
                      <td className="px-6 py-4"><span className="text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg" style={{ background: '#F8FAFC', color: '#3B5BDB', border: '1px solid #E2E8F0' }}>{cert.certificate_number}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black" style={{ background: cert.score >= 90 ? '#DCFCE7' : '#FEF9C3', color: cert.score >= 90 ? '#166534' : '#854D0E' }}>{cert.score}</div>
                          <span className="text-xs" style={{ color: '#94A3B8' }}>/100</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium" style={{ color: '#475569' }}>{new Date(cert.issued_at).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODAL DETALLE ═══ */}
      {showUserDetail && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white" style={{ background: showUserDetail.company_color }}>{showUserDetail.full_name?.charAt(0)}</div>
                <div>
                  <h3 className="text-base font-bold" style={{ color: '#0F172A' }}>{showUserDetail.full_name}</h3>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{showUserDetail.email} · {showUserDetail.company_name}</p>
                </div>
              </div>
              <button onClick={() => setShowUserDetail(null)} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 text-xl" style={{ color: '#94A3B8' }}>×</button>
            </div>
            <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { val: showUserDetail.modulos_completados, label: 'Módulos', sub: `de ${showUserDetail.total_modulos}`, color: '#3B5BDB', bg: '#EEF2FF' },
                  { val: showUserDetail.mensajes, label: 'Mensajes', sub: 'enviados', color: '#D97706', bg: '#FFFBEB' },
                  { val: showUserDetail.certificate_number ? '✓' : '—', label: 'Certificado', sub: showUserDetail.certificate_number ? 'emitido' : 'pendiente', color: showUserDetail.certificate_number ? '#059669' : '#94A3B8', bg: showUserDetail.certificate_number ? '#ECFDF5' : '#F8FAFC' },
                ].map((s, i) => (
                  <div key={i} className="rounded-2xl p-4 text-center border" style={{ background: s.bg, borderColor: 'transparent' }}>
                    <p className="text-3xl font-black" style={{ color: s.color }}>{s.val}</p>
                    <p className="text-xs font-bold mt-1" style={{ color: '#475569' }}>{s.label}</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{s.sub}</p>
                  </div>
                ))}
              </div>

              {userDetailModules.length > 0 ? (
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#94A3B8' }}>Módulos completados</p>
                  <div className="space-y-2">
                    {userDetailModules.map((mod, i) => (
                      <div key={i} className="flex items-center justify-between p-3.5 rounded-xl" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#DCFCE7' }}>
                            <span className="text-xs text-green-600 font-bold">✓</span>
                          </div>
                          <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{mod.module_name}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black" style={{ color: '#166534' }}>{mod.score}</span>
                          <span className="text-xs" style={{ color: '#94A3B8' }}>/100</span>
                          <p className="text-xs" style={{ color: '#94A3B8' }}>{new Date(mod.completed_at).toLocaleDateString('es-GT', { month: 'short', day: 'numeric' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl p-4 text-center mb-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <p className="text-sm" style={{ color: '#94A3B8' }}>No hay módulos registrados</p>
                  <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>Completó con sistema anterior o aún no ha iniciado</p>
                </div>
              )}

              {showUserDetail.ultima_sesion && (
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  Última sesión: <span className="font-semibold" style={{ color: '#475569' }}>{new Date(showUserDetail.ultima_sesion).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </p>
              )}
            </div>
            <div className="px-8 py-5 border-t flex gap-3" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <button onClick={() => handleGenerateCert(showUserDetail.id, showUserDetail.company_id)} className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all" style={{ background: '#3B5BDB' }}>Generar certificado</button>
              <button onClick={() => setShowUserDetail(null)} className="flex-1 py-3 rounded-xl text-sm font-semibold border hover:bg-white transition-all" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL CREAR USUARIO ═══ */}
      {showCreateUser && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b" style={{ borderColor: '#F1F5F9' }}>
              <h3 className="text-base font-bold" style={{ color: '#0F172A' }}>Nuevo colaborador</h3>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Se enviará acceso por email automáticamente</p>
            </div>
            <div className="px-8 py-6 space-y-5">
              {[{ label: 'Nombre completo', key: 'full_name', type: 'text', ph: 'María García' }, { label: 'Correo electrónico', key: 'email', type: 'email', ph: 'maria@empresa.com' }].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold mb-2" style={{ color: '#475569' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.ph} value={(newUser as any)[f.key]} onChange={e => setNewUser({ ...newUser, [f.key]: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all focus:border-blue-400" style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#475569' }}>Empresa</label>
                <select value={newUser.company_id} onChange={e => setNewUser({ ...newUser, company_id: e.target.value })} className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: '#E2E8F0', color: '#0F172A' }}>
                  <option value="">Selecciona empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#475569' }}>Rol</label>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: '#E2E8F0', color: '#0F172A' }}>
                  <option value="collaborator">Colaborador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              {errorMsg && <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{errorMsg}</div>}
            </div>
            <div className="px-8 py-5 border-t flex gap-3" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <button onClick={() => { setShowCreateUser(false); setErrorMsg('') }} className="flex-1 py-3 rounded-xl text-sm font-semibold border" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Cancelar</button>
              <button onClick={handleCreateUser} disabled={creating} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: creating ? '#94A3B8' : '#3B5BDB' }}>{creating ? 'Creando...' : 'Crear usuario'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL CARGA MASIVA ═══ */}
      {showBulkUpload && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b" style={{ borderColor: '#F1F5F9' }}>
              <h3 className="text-base font-bold" style={{ color: '#0F172A' }}>Carga masiva de usuarios</h3>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Sube un Excel con columnas: nombre, email</p>
            </div>
            <div className="px-8 py-6 space-y-5">
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#E2E8F0' }}>
                <div className="grid grid-cols-2 px-4 py-2.5 text-xs font-bold" style={{ background: '#1C2B4A', color: 'white' }}><span>nombre</span><span>email</span></div>
                <div className="grid grid-cols-2 px-4 py-2 text-xs" style={{ color: '#475569' }}><span>María García</span><span>maria@empresa.com</span></div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#475569' }}>Empresa destino</label>
                <select value={bulkCompanyId} onChange={e => setBulkCompanyId(e.target.value)} className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: '#E2E8F0', color: '#0F172A' }}>
                  <option value="">Selecciona empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label className="flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed rounded-2xl py-10 cursor-pointer transition-all hover:bg-slate-50" style={{ borderColor: xlsData.length > 0 ? '#3B5BDB' : '#E2E8F0' }}>
                <input type="file" accept=".xlsx,.xls" onChange={handleXLS} className="hidden" />
                {xlsData.length > 0 ? (
                  <><p className="text-2xl">📋</p><p className="text-sm font-bold" style={{ color: '#3B5BDB' }}>✓ {xlsData.length} usuarios detectados</p><p className="text-xs" style={{ color: '#94A3B8' }}>Click para cambiar archivo</p></>
                ) : (
                  <><p className="text-3xl">↑</p><p className="text-sm font-semibold" style={{ color: '#475569' }}>Seleccionar archivo Excel</p><p className="text-xs" style={{ color: '#94A3B8' }}>.xlsx o .xls</p></>
                )}
              </label>
              {errorMsg && <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{errorMsg}</div>}
              {bulkResults.length > 0 && (
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#E2E8F0' }}>
                  <div className="px-4 py-2.5 flex justify-between text-xs" style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                    <span className="font-bold" style={{ color: '#475569' }}>Resultados</span>
                    <span style={{ color: '#94A3B8' }}>{bulkResults.filter(r => r.success).length}/{bulkResults.length} exitosos</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {bulkResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs border-t" style={{ borderColor: '#F8FAFC' }}>
                        <span style={{ color: '#0F172A' }}>{r.name}</span>
                        <span className="font-bold" style={{ color: r.success ? '#166534' : '#DC2626' }}>{r.success ? '✓ Creado' : '✗ ' + (r.error?.includes('already') ? 'Ya existe' : 'Error')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-8 py-5 border-t flex gap-3" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <button onClick={() => { setShowBulkUpload(false); setXlsData([]); setBulkResults([]); setErrorMsg('') }} className="flex-1 py-3 rounded-xl text-sm font-semibold border" style={{ borderColor: '#E2E8F0', color: '#475569' }}>{bulkResults.length > 0 ? 'Cerrar' : 'Cancelar'}</button>
              <button onClick={handleBulkUpload} disabled={bulkLoading || xlsData.length === 0 || !bulkCompanyId} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: bulkLoading || xlsData.length === 0 || !bulkCompanyId ? '#94A3B8' : '#3B5BDB' }}>
                {bulkLoading ? `Creando ${bulkResults.length}/${xlsData.length}...` : xlsData.length > 0 ? `Crear ${xlsData.length} usuarios` : 'Selecciona archivo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL ELIMINAR ═══ */}
      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b" style={{ borderColor: '#F1F5F9' }}>
              <h3 className="text-base font-bold" style={{ color: '#0F172A' }}>Eliminar usuario</h3>
              <p className="text-sm mt-1" style={{ color: '#64748B' }}>Esta acción no se puede deshacer.</p>
            </div>
            <div className="px-8 py-6">
              <div className="flex items-center gap-3 p-4 rounded-xl mb-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold text-white" style={{ background: confirmDelete.company_color }}>{confirmDelete.full_name?.charAt(0)}</div>
                <div><p className="text-sm font-bold" style={{ color: '#0F172A' }}>{confirmDelete.full_name}</p><p className="text-xs" style={{ color: '#94A3B8' }}>{confirmDelete.email}</p></div>
              </div>
              <p className="text-xs px-4 py-3 rounded-xl" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>Se eliminará el usuario, sus conversaciones y su progreso permanentemente.</p>
            </div>
            <div className="px-8 py-5 border-t flex gap-3" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-xl text-sm font-semibold border" style={{ borderColor: '#E2E8F0', color: '#475569' }}>Cancelar</button>
              <button onClick={() => handleDeleteUser(confirmDelete)} disabled={!!deletingUser} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: '#DC2626' }}>{deletingUser ? 'Eliminando...' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
