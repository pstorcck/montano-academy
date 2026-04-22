'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

type Tab = 'resumen' | 'usuarios' | 'certificados'

export default function AdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [certificates, setCertificates] = useState<any[]>([])
  const [conversations, setConversations] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
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
  const [deletingUser, setDeletingUser] = useState<string | null>(null)
  const [syncingPrompts, setSyncingPrompts] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)

  const [newUser, setNewUser] = useState({
    full_name: '', email: '', password: '',
    role: 'collaborator', company_id: '',
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles').select('*, companies(*)')
        .eq('id', user.id).single()

      if (!profileData || !['superadmin', 'admin'].includes(profileData.role)) {
        router.push('/dashboard'); return
      }

      setProfile(profileData)

      const [{ data: comp }, { data: usr }, { data: cert }, { data: conv }, { data: msgs }] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('profiles').select('*, companies(name, slug, primary_color)').order('full_name'),
        supabase.from('certificates').select('*, profiles(full_name, email), companies(name)').order('issued_at', { ascending: false }),
        supabase.from('conversations').select('*').order('started_at', { ascending: false }),
        supabase.from('messages').select('conversation_id'),
      ])

      setCompanies(comp || [])
      setUsers(usr || [])
      setCertificates(cert || [])
      setConversations(conv || [])
      setMessages(msgs || [])
      setLoading(false)
    }
    init()
  }, [router])

  const getProgress = (userId: string, companyId: string) => {
    const cert = certificates.find(c => c.user_id === userId && c.company_id === companyId)
    if (cert) return { status: 'completed', score: cert.score, label: `Completado · ${cert.score}/100` }

    const conv = conversations.find(c => c.user_id === userId && c.company_id === companyId)
    if (!conv) return { status: 'pending', label: 'Sin iniciar' }

    const msgCount = messages.filter(m => m.conversation_id === conv.id).length
    if (msgCount > 0) return { status: 'active', label: `En progreso · ${msgCount} respuestas` }

    return { status: 'pending', label: 'Sin iniciar' }
  }

  const handleCreateUser = async () => {
    if (!newUser.full_name || !newUser.email || !newUser.company_id) {
      setErrorMsg('Nombre, email y empresa son requeridos'); return
    }
    setCreating(true); setErrorMsg(''); setSuccessMsg('')
    const res = await fetch('/api/admin/create-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, send_invite: true })
    })
    const data = await res.json()
    if (data.error) { setErrorMsg(data.error) }
    else {
      setSuccessMsg(`Invitación enviada a ${newUser.email}`)
      setNewUser({ full_name: '', email: '', password: '', role: 'collaborator', company_id: '' })
      setShowCreateUser(false)
      const { data: usr } = await supabase.from('profiles').select('*, companies(name, slug, primary_color)').order('full_name')
      setUsers(usr || [])
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

      if (rows.length < 2) return

      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim())
      const nameIdx = headers.findIndex((h: string) => h.includes('nombre') || h.includes('name'))
      const emailIdx = headers.findIndex((h: string) => h.includes('email') || h.includes('correo'))

      if (nameIdx === -1 || emailIdx === -1) {
        setErrorMsg('El archivo debe tener columnas "nombre" y "email"')
        return
      }

      const parsed = rows.slice(1)
        .map(row => ({ full_name: String(row[nameIdx] || '').trim(), email: String(row[emailIdx] || '').trim() }))
        .filter(r => r.full_name && r.email)

      setXlsData(parsed)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleBulkUpload = async () => {
    if (!bulkCompanyId || xlsData.length === 0) {
      setErrorMsg('Selecciona empresa y sube el archivo'); return
    }
    setBulkLoading(true); setErrorMsg('')
    const results: any[] = []

    for (const row of xlsData) {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: row.full_name, email: row.email,
          role: 'collaborator', company_id: bulkCompanyId,
          send_invite: true,
        })
      })
      const data = await res.json()
      results.push({ name: row.full_name, email: row.email, success: !data.error, error: data.error })
    }

    setBulkResults(results)
    setBulkLoading(false)
    const { data: usr } = await supabase.from('profiles').select('*, companies(name, slug, primary_color)').order('full_name')
    setUsers(usr || [])
    setSuccessMsg(`${results.filter(r => r.success).length} invitaciones enviadas de ${results.length}`)
  }

  const handleDeleteUser = async (user: any) => {
    setDeletingUser(user.id)
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id })
      })
      const data = await res.json()
      if (data.error) {
        setErrorMsg(data.error)
      } else {
        setSuccessMsg(`Usuario ${user.full_name} eliminado`)
        const { data: usr } = await supabase.from('profiles').select('*, companies(name, slug, primary_color)').order('full_name')
        setUsers(usr || [])
      }
    } catch (e) {
      setErrorMsg('Error al eliminar usuario')
    }
    setDeletingUser(null)
    setConfirmDelete(null)
  }

  const handleGenerateCert = async (userId: string, companyId: string) => {
    window.open(`/api/certificate-pdf?user_id=${userId}&company_id=${companyId}`, '_blank')
  }

  const filteredUsers = filterCompany === 'all' ? users : users.filter(u => u.company_id === filterCompany)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8F7F4' }}>
      <p className="text-sm" style={{ color: '#9A9AAA' }}>Cargando panel...</p>
    </div>
  )

  const tabs: { key: Tab, label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'usuarios', label: 'Usuarios' },
    { key: 'certificados', label: 'Certificados' },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#F8F7F4' }}>
      <div className="bg-white border-b px-8 h-16 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: '#E8E8E0' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')}
            className="text-sm cursor-pointer" style={{ color: '#9A9AAA' }}>Volver al dashboard</button>
          <div className="w-px h-4" style={{ background: '#E8E8E0' }}></div>
          <h1 className="text-base font-bold" style={{ color: '#1A1A2E' }}>Administración</h1>
          <span className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: '#F3F4F6', color: '#6B7280', letterSpacing: '0.05em' }}>
            {profile?.role === 'superadmin' ? 'SUPER ADMIN' : 'ADMIN'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setSyncingPrompts(true)
              const res = await fetch('/api/admin/sync-prompts', { method: 'POST' })
              const data = await res.json()
              if (data.success) setSuccessMsg(`Prompts sincronizados: ${data.results.map((r: any) => r.company).join(', ')}`)
              else setErrorMsg(data.error)
              setSyncingPrompts(false)
            }}
            disabled={syncingPrompts}
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-all hover:bg-gray-50"
            style={{ borderColor: '#E8E8E0', color: '#1A1A2E', background: 'white' }}>
            {syncingPrompts ? 'Sincronizando...' : 'Sync prompts'}
          </button>
          <button onClick={() => { setShowBulkUpload(true); setErrorMsg(''); setBulkResults([]) }}
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-all hover:bg-gray-50"
            style={{ borderColor: '#E8E8E0', color: '#1A1A2E', background: 'white' }}>
            Carga masiva
          </button>
          <button onClick={() => { setShowCreateUser(true); setErrorMsg('') }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#1A1A2E' }}>
            Nuevo usuario
          </button>
        </div>
      </div>

      <div className="bg-white border-b px-8 flex" style={{ borderColor: '#E8E8E0' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-6 py-4 text-sm font-semibold border-b-2 transition-all"
            style={{ borderColor: tab === t.key ? '#1A1A2E' : 'transparent', color: tab === t.key ? '#1A1A2E' : '#9A9AAA' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-8">
        {successMsg && (
          <div className="mb-6 px-5 py-4 rounded-lg text-sm font-medium"
            style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>
            {successMsg}
          </div>
        )}

        {/* RESUMEN */}
        {tab === 'resumen' && (
          <div>
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total usuarios', value: users.length },
                { label: 'En progreso', value: conversations.filter(c => c.status === 'active').length },
                { label: 'Completados', value: certificates.length },
                { label: 'Certificados emitidos', value: certificates.length },
              ].map((stat, i) => (
                <div key={i} className="bg-white rounded-xl p-6 border" style={{ borderColor: '#E8E8E0' }}>
                  <div className="text-3xl font-black mb-1" style={{ color: '#1A1A2E' }}>{stat.value}</div>
                  <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#9A9AAA' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#9A9AAA' }}>Por empresa</h2>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {companies.map(company => {
                const compUsers = users.filter(u => u.company_id === company.id)
                const compCerts = certificates.filter(c => c.company_id === company.id)
                const compActive = conversations.filter(c => c.company_id === company.id && c.status === 'active').length
                const pct = compUsers.length > 0 ? Math.round((compCerts.length / compUsers.length) * 100) : 0
                return (
                  <div key={company.id} className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E8E8E0' }}>
                    <div className="h-1" style={{ background: company.primary_color }}></div>
                    <div className="p-6">
                      <h3 className="font-bold mb-4" style={{ color: '#1A1A2E' }}>{company.name}</h3>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span style={{ color: '#9A9AAA' }}>Completado</span>
                        <span className="font-bold" style={{ color: '#1A1A2E' }}>{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full mb-5" style={{ background: '#F3F4F6' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: company.primary_color }}></div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {[
                          { val: compUsers.length, label: 'Usuarios' },
                          { val: compActive, label: 'En progreso' },
                          { val: compCerts.length, label: 'Certificados' },
                        ].map((s, i) => (
                          <div key={i} className="rounded-lg p-3" style={{ background: '#F9FAFB' }}>
                            <div className="text-xl font-black" style={{ color: '#1A1A2E' }}>{s.val}</div>
                            <div className="text-xs mt-0.5" style={{ color: '#9A9AAA' }}>{s.label}</div>
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
            <div className="flex gap-2 mb-6 flex-wrap">
              <button onClick={() => setFilterCompany('all')}
                className="px-4 py-2 rounded-lg text-sm font-semibold border transition-all"
                style={{ background: filterCompany === 'all' ? '#1A1A2E' : 'white', color: filterCompany === 'all' ? 'white' : '#6B7280', borderColor: filterCompany === 'all' ? '#1A1A2E' : '#E8E8E0' }}>
                Todas ({users.length})
              </button>
              {companies.map(c => (
                <button key={c.id} onClick={() => setFilterCompany(c.id)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border transition-all"
                  style={{ background: filterCompany === c.id ? c.primary_color : 'white', color: filterCompany === c.id ? 'white' : '#6B7280', borderColor: filterCompany === c.id ? c.primary_color : '#E8E8E0' }}>
                  {c.name} ({users.filter(u => u.company_id === c.id).length})
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E8E8E0' }}>
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: '#F3F4F6' }}>
                <h2 className="text-sm font-bold" style={{ color: '#1A1A2E' }}>
                  {filterCompany === 'all' ? 'Todos los colaboradores' : companies.find(c => c.id === filterCompany)?.name}
                </h2>
                <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: '#F3F4F6', color: '#6B7280' }}>
                  {filteredUsers.length} registros
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    {['Colaborador', 'Empresa', 'Progreso', 'Rol', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-widest"
                        style={{ color: '#9A9AAA', borderBottom: '1px solid #F3F4F6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, i) => {
                    const progress = getProgress(user.id, user.company_id)
                    return (
                      <tr key={user.id} style={{ borderBottom: i < filteredUsers.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ background: user.companies?.primary_color || '#1A1A2E' }}>
                              {user.full_name?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>{user.full_name}</p>
                              <p className="text-xs" style={{ color: '#9A9AAA' }}>{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-medium px-2.5 py-1 rounded-md" style={{ background: '#F3F4F6', color: '#374151' }}>
                            {user.companies?.name || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                            style={{
                              background: progress.status === 'completed' ? '#DCFCE7' : progress.status === 'active' ? '#FFFBE6' : '#F3F4F6',
                              color: progress.status === 'completed' ? '#166534' : progress.status === 'active' ? '#92400E' : '#6B7280'
                            }}>
                            {progress.status === 'completed' ? '✓' : progress.status === 'active' ? '▶' : '○'} {progress.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                            style={{
                              background: user.role === 'superadmin' ? '#F5F3FF' : user.role === 'admin' ? '#EFF6FF' : '#F9FAFB',
                              color: user.role === 'superadmin' ? '#6D28D9' : user.role === 'admin' ? '#1D4ED8' : '#374151'
                            }}>
                            {user.role === 'superadmin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'Colaborador'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                          <button onClick={() => handleGenerateCert(user.id, user.company_id)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-md border transition-all hover:bg-gray-50"
                            style={{ borderColor: '#E8E8E0', color: '#374151' }}>
                            Certificado
                          </button>
                          <button onClick={() => setConfirmDelete(user)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-md border transition-all hover:bg-red-50"
                            style={{ borderColor: '#FECACA', color: '#DC2626' }}>
                            Eliminar
                          </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className="text-center py-16" style={{ color: '#9A9AAA' }}>
                  <p className="text-sm">Sin usuarios registrados</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CERTIFICADOS */}
        {tab === 'certificados' && (
          <div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E8E8E0' }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: '#F3F4F6' }}>
                <h2 className="text-sm font-bold" style={{ color: '#1A1A2E' }}>Certificados emitidos</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    {['Colaborador', 'Empresa', 'Número de certificado', 'Punteo', 'Fecha de emisión'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-widest"
                        style={{ color: '#9A9AAA', borderBottom: '1px solid #F3F4F6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((cert, i) => (
                    <tr key={cert.id} style={{ borderBottom: i < certificates.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>{cert.profiles?.full_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#9A9AAA' }}>{cert.profiles?.email}</p>
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: '#6B7280' }}>{cert.companies?.name}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md" style={{ background: '#F3F4F6', color: '#374151' }}>
                          {cert.certificate_number}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold" style={{ color: '#1A1A2E' }}>{cert.score}/100</td>
                      <td className="px-6 py-4 text-xs" style={{ color: '#9A9AAA' }}>
                        {new Date(cert.issued_at).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {certificates.length === 0 && (
                <div className="text-center py-16" style={{ color: '#9A9AAA' }}>
                  <p className="text-sm">Sin certificados emitidos</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL CREAR USUARIO */}
      {showCreateUser && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold" style={{ color: '#1A1A2E' }}>Nuevo usuario</h3>
              <button onClick={() => { setShowCreateUser(false); setErrorMsg('') }}
                className="text-lg cursor-pointer" style={{ color: '#9A9AAA' }}>×</button>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Nombre completo', key: 'full_name', type: 'text', placeholder: 'María García' },
                { label: 'Correo electrónico', key: 'email', type: 'email', placeholder: 'maria@empresa.com' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>{field.label}</label>
                  <input type={field.type} placeholder={field.placeholder}
                    value={(newUser as any)[field.key]}
                    onChange={e => setNewUser({ ...newUser, [field.key]: e.target.value })}
                    className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none"
                    style={{ borderColor: '#E8E8E0', color: '#1A1A2E' }} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>Empresa</label>
                <select value={newUser.company_id} onChange={e => setNewUser({ ...newUser, company_id: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none" style={{ borderColor: '#E8E8E0', color: '#1A1A2E' }}>
                  <option value="">Selecciona una empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>Rol</label>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none" style={{ borderColor: '#E8E8E0', color: '#1A1A2E' }}>
                  <option value="collaborator">Colaborador</option>
                  <option value="admin">Administrador</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>
                Se enviará una invitación por email para que el usuario cree su contraseña.
              </div>
              {errorMsg && (
                <div className="px-4 py-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{errorMsg}</div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowCreateUser(false); setErrorMsg('') }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border" style={{ borderColor: '#E8E8E0', color: '#374151' }}>Cancelar</button>
                <button onClick={handleCreateUser} disabled={creating}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: '#1A1A2E' }}>
                  {creating ? 'Enviando...' : 'Enviar invitación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR ELIMINACIÓN */}
      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold mb-2" style={{ color: '#1A1A2E' }}>Eliminar usuario</h3>
            <p className="text-sm mb-1" style={{ color: '#6B7280' }}>
              ¿Estás seguro que deseas eliminar a:
            </p>
            <p className="text-sm font-bold mb-1" style={{ color: '#1A1A2E' }}>{confirmDelete.full_name}</p>
            <p className="text-xs mb-6" style={{ color: '#9A9AAA' }}>{confirmDelete.email}</p>
            <div className="rounded-lg px-4 py-3 text-sm mb-6" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              Esta acción no se puede deshacer. Se eliminará el usuario y todo su historial.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
                style={{ borderColor: '#E8E8E0', color: '#374151' }}>
                Cancelar
              </button>
              <button onClick={() => handleDeleteUser(confirmDelete)}
                disabled={deletingUser === confirmDelete.id}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#DC2626' }}>
                {deletingUser === confirmDelete.id ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CARGA MASIVA */}
      {showBulkUpload && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold" style={{ color: '#1A1A2E' }}>Carga masiva de usuarios</h3>
              <button onClick={() => { setShowBulkUpload(false); setXlsData([]); setBulkResults([]); setErrorMsg('') }}
                className="text-lg cursor-pointer" style={{ color: '#9A9AAA' }}>×</button>
            </div>
            <div className="rounded-lg p-4 mb-5" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>
                Formato requerido — archivo Excel (.xlsx)
              </p>
              <p className="text-xs font-mono leading-relaxed" style={{ color: '#374151' }}>
                nombre | email<br/>
                María García | maria@empresa.com<br/>
                Carlos López | carlos@empresa.com
              </p>
              <p className="text-xs mt-2" style={{ color: '#9A9AAA' }}>
                Se enviará una invitación por email a cada usuario para que creen su contraseña.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>Empresa destino</label>
                <select value={bulkCompanyId} onChange={e => setBulkCompanyId(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none" style={{ borderColor: '#E8E8E0', color: '#1A1A2E' }}>
                  <option value="">Selecciona una empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>Archivo Excel</label>
                <input type="file" accept=".xlsx,.xls" onChange={handleXLS}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm" style={{ borderColor: '#E8E8E0', color: '#374151' }} />
                {xlsData.length > 0 && (
                  <p className="text-xs mt-2 font-medium" style={{ color: '#166534' }}>
                    {xlsData.length} usuarios detectados en el archivo
                  </p>
                )}
              </div>
              {errorMsg && (
                <div className="px-4 py-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{errorMsg}</div>
              )}
              {bulkResults.length > 0 && (
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: '#E8E8E0' }}>
                  <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest"
                    style={{ background: '#F9FAFB', color: '#9A9AAA', borderBottom: '1px solid #F3F4F6' }}>
                    Resultados
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {bulkResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs border-t" style={{ borderColor: '#F9FAFB' }}>
                        <span style={{ color: '#374151' }}>{r.name} — {r.email}</span>
                        <span className="font-semibold ml-4" style={{ color: r.success ? '#166534' : '#DC2626' }}>
                          {r.success ? 'Invitado' : r.error}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowBulkUpload(false); setXlsData([]); setBulkResults([]); setErrorMsg('') }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border" style={{ borderColor: '#E8E8E0', color: '#374151' }}>Cerrar</button>
                <button onClick={handleBulkUpload}
                  disabled={bulkLoading || xlsData.length === 0 || !bulkCompanyId}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
                  style={{ background: bulkLoading || xlsData.length === 0 || !bulkCompanyId ? '#D1D5DB' : '#1A1A2E' }}>
                  {bulkLoading ? `Enviando ${bulkResults.length}/${xlsData.length}...` : xlsData.length > 0 ? `Invitar ${xlsData.length} usuarios` : 'Selecciona un archivo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
