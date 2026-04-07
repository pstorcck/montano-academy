'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Tab = 'resumen' | 'usuarios' | 'certificados'

export default function AdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [certificates, setCertificates] = useState<any[]>([])
  const [conversations, setConversations] = useState<any[]>([])
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
  const [csvData, setCsvData] = useState<any[]>([])

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

      const [{ data: comp }, { data: usr }, { data: cert }, { data: conv }] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('profiles').select('*, companies(name, slug, primary_color)').order('full_name'),
        supabase.from('certificates').select('*, profiles(full_name, email), companies(name)').order('issued_at', { ascending: false }),
        supabase.from('conversations').select('*, profiles(full_name), companies(name)').order('started_at', { ascending: false }),
      ])

      setCompanies(comp || [])
      setUsers(usr || [])
      setCertificates(cert || [])
      setConversations(conv || [])
      setLoading(false)
    }
    init()
  }, [router])

  const handleCreateUser = async () => {
    if (!newUser.full_name || !newUser.email || !newUser.password || !newUser.company_id) {
      setErrorMsg('Todos los campos son requeridos'); return
    }
    setCreating(true); setErrorMsg(''); setSuccessMsg('')
    const res = await fetch('/api/admin/create-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    })
    const data = await res.json()
    if (data.error) { setErrorMsg(data.error) }
    else {
      setSuccessMsg(`Usuario ${newUser.full_name} creado exitosamente`)
      setNewUser({ full_name: '', email: '', password: '', role: 'collaborator', company_id: '' })
      setShowCreateUser(false)
      const { data: usr } = await supabase.from('profiles').select('*, companies(name, slug, primary_color)').order('full_name')
      setUsers(usr || [])
    }
    setCreating(false)
  }

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split('\n')
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim())
        const obj: any = {}
        headers.forEach((h, i) => obj[h] = vals[i] || '')
        return obj
      }).filter(r => r.nombre || r.name || r.full_name)
      setCsvData(rows)
    }
    reader.readAsText(file)
  }

  const handleBulkUpload = async () => {
    if (!bulkCompanyId || csvData.length === 0) {
      setErrorMsg('Selecciona empresa y sube el archivo CSV'); return
    }
    setBulkLoading(true)
    setErrorMsg('')
    const results: any[] = []
    for (const row of csvData) {
      const full_name = row.nombre || row.name || row.full_name || ''
      const email = row.email || row.correo || ''
      if (!full_name || !email) continue
      const res = await fetch('/api/admin/create-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name, email,
          password: Math.random().toString(36).slice(-8) + 'A1!',
          role: 'collaborator',
          company_id: bulkCompanyId,
          send_invite: true,
        })
      })
      const data = await res.json()
      results.push({ name: full_name, email, success: !data.error, error: data.error })
    }
    setBulkResults(results)
    setBulkLoading(false)
    const { data: usr } = await supabase.from('profiles').select('*, companies(name, slug, primary_color)').order('full_name')
    setUsers(usr || [])
    setSuccessMsg(`${results.filter(r => r.success).length} usuarios creados de ${results.length}`)
  }

  const handleGenerateCert = async (userId: string, companyId: string) => {
    const user = users.find(u => u.id === userId)
    const company = companies.find(c => c.id === companyId)
    if (!user || !company) return
    const year = new Date().getFullYear()
    const certNumber = `MA-${company.slug.toUpperCase().slice(0,2)}-${year}-${Math.floor(Math.random() * 900) + 100}`
    const { error } = await supabase.from('certificates').insert({
      user_id: userId, company_id: companyId,
      certificate_number: certNumber, score: 100,
    })
    if (!error) {
      setSuccessMsg(`Certificado generado para ${user.full_name}`)
      const { data: cert } = await supabase.from('certificates')
        .select('*, profiles(full_name, email), companies(name)')
        .order('issued_at', { ascending: false })
      setCertificates(cert || [])
    }
  }

  const filteredUsers = filterCompany === 'all'
    ? users
    : users.filter(u => u.company_id === filterCompany)

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

  const inputStyle = {
    borderColor: '#E8E8E0',
    color: '#1A1A2E',
  }

  const labelStyle = {
    color: '#9A9AAA',
  }

  return (
    <div className="min-h-screen" style={{ background: '#F8F7F4' }}>

      {/* Topbar */}
      <div className="bg-white border-b px-8 h-16 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: '#E8E8E0' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')}
            className="text-sm cursor-pointer" style={{ color: '#9A9AAA' }}>
            Volver al dashboard
          </button>
          <div className="w-px h-4" style={{ background: '#E8E8E0' }}></div>
          <h1 className="text-base font-bold" style={{ color: '#1A1A2E' }}>
            Administración
          </h1>
          <span className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: '#F3F4F6', color: '#6B7280', letterSpacing: '0.05em' }}>
            {profile?.role === 'superadmin' ? 'SUPER ADMIN' : 'ADMIN'}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowBulkUpload(true); setErrorMsg(''); setBulkResults([]) }}
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-all hover:bg-gray-50"
            style={{ borderColor: '#E8E8E0', color: '#1A1A2E', background: 'white' }}>
            Carga masiva
          </button>
          <button onClick={() => { setShowCreateUser(true); setErrorMsg('') }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: '#1A1A2E' }}>
            Nuevo usuario
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-8 flex gap-0" style={{ borderColor: '#E8E8E0' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-6 py-4 text-sm font-semibold border-b-2 transition-all"
            style={{
              borderColor: tab === t.key ? '#1A1A2E' : 'transparent',
              color: tab === t.key ? '#1A1A2E' : '#9A9AAA',
            }}>
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

        {/* TAB: RESUMEN */}
        {tab === 'resumen' && (
          <div>
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total usuarios', value: users.length },
                { label: 'En progreso', value: conversations.filter(c => c.status === 'active').length },
                { label: 'Completados', value: conversations.filter(c => c.status === 'completed').length },
                { label: 'Certificados emitidos', value: certificates.length },
              ].map((stat, i) => (
                <div key={i} className="bg-white rounded-xl p-6 border" style={{ borderColor: '#E8E8E0' }}>
                  <div className="text-3xl font-black mb-1" style={{ color: '#1A1A2E' }}>{stat.value}</div>
                  <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#9A9AAA' }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#9A9AAA' }}>
              Por empresa
            </h2>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {companies.map(company => {
                const compUsers = users.filter(u => u.company_id === company.id)
                const compCerts = certificates.filter(c => c.company_id === company.id)
                const pct = compUsers.length > 0 ? Math.round((compCerts.length / compUsers.length) * 100) : 0
                return (
                  <div key={company.id} className="bg-white rounded-xl border overflow-hidden"
                    style={{ borderColor: '#E8E8E0' }}>
                    <div className="h-1" style={{ background: company.primary_color }}></div>
                    <div className="p-6">
                      <h3 className="font-bold mb-4" style={{ color: '#1A1A2E' }}>{company.name}</h3>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span style={{ color: '#9A9AAA' }}>Completado</span>
                        <span className="font-bold" style={{ color: '#1A1A2E' }}>{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full mb-5" style={{ background: '#F3F4F6' }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: company.primary_color }}></div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {[
                          { val: compUsers.length, label: 'Usuarios' },
                          { val: conversations.filter(c => c.company_id === company.id && c.status === 'completed').length, label: 'Terminaron' },
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

            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#9A9AAA' }}>
              Actividad reciente
            </h2>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E8E8E0' }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    {['Colaborador', 'Empresa', 'Estado', 'Punteo', 'Fecha'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-widest"
                        style={{ color: '#9A9AAA', borderBottom: '1px solid #F3F4F6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conversations.slice(0, 10).map((conv, i) => (
                    <tr key={conv.id}
                      style={{ borderBottom: i < 9 ? '1px solid #F9FAFB' : 'none' }}>
                      <td className="px-6 py-3.5 text-sm font-medium" style={{ color: '#1A1A2E' }}>
                        {conv.profiles?.full_name || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-sm" style={{ color: '#6B7280' }}>
                        {conv.companies?.name || '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{
                            background: conv.status === 'completed' ? '#F0FDF4' : '#FFFBEB',
                            color: conv.status === 'completed' ? '#166534' : '#92400E'
                          }}>
                          {conv.status === 'completed' ? 'Completado' : 'En progreso'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-sm font-semibold" style={{ color: '#1A1A2E' }}>
                        {conv.score ? `${conv.score}/100` : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-xs" style={{ color: '#9A9AAA' }}>
                        {new Date(conv.started_at).toLocaleDateString('es-GT')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {conversations.length === 0 && (
                <div className="text-center py-12" style={{ color: '#9A9AAA' }}>
                  <p className="text-sm">Sin actividad registrada</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: USUARIOS */}
        {tab === 'usuarios' && (
          <div>
            <div className="flex gap-2 mb-6 flex-wrap">
              <button onClick={() => setFilterCompany('all')}
                className="px-4 py-2 rounded-lg text-sm font-semibold border transition-all"
                style={{
                  background: filterCompany === 'all' ? '#1A1A2E' : 'white',
                  color: filterCompany === 'all' ? 'white' : '#6B7280',
                  borderColor: filterCompany === 'all' ? '#1A1A2E' : '#E8E8E0'
                }}>
                Todas las empresas ({users.length})
              </button>
              {companies.map(c => (
                <button key={c.id} onClick={() => setFilterCompany(c.id)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border transition-all"
                  style={{
                    background: filterCompany === c.id ? c.primary_color : 'white',
                    color: filterCompany === c.id ? 'white' : '#6B7280',
                    borderColor: filterCompany === c.id ? c.primary_color : '#E8E8E0'
                  }}>
                  {c.name} ({users.filter(u => u.company_id === c.id).length})
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E8E8E0' }}>
              <div className="px-6 py-4 border-b flex items-center justify-between"
                style={{ borderColor: '#F3F4F6' }}>
                <h2 className="text-sm font-bold" style={{ color: '#1A1A2E' }}>
                  {filterCompany === 'all' ? 'Todos los colaboradores' : companies.find(c => c.id === filterCompany)?.name}
                </h2>
                <span className="text-xs px-3 py-1 rounded-full font-medium"
                  style={{ background: '#F3F4F6', color: '#6B7280' }}>
                  {filteredUsers.length} registros
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    {['Colaborador', 'Empresa', 'Rol', 'Estado', 'Acciones'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-widest"
                        style={{ color: '#9A9AAA', borderBottom: '1px solid #F3F4F6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, i) => (
                    <tr key={user.id}
                      style={{ borderBottom: i < filteredUsers.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
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
                        <span className="text-xs font-medium px-2.5 py-1 rounded-md"
                          style={{ background: '#F3F4F6', color: '#374151' }}>
                          {user.companies?.name || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{
                            background: user.role === 'superadmin' ? '#F5F3FF' :
                                        user.role === 'admin' ? '#EFF6FF' : '#F9FAFB',
                            color: user.role === 'superadmin' ? '#6D28D9' :
                                   user.role === 'admin' ? '#1D4ED8' : '#374151'
                          }}>
                          {user.role === 'superadmin' ? 'Super Admin' :
                           user.role === 'admin' ? 'Admin' : 'Colaborador'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{
                            background: user.is_active ? '#F0FDF4' : '#FEF2F2',
                            color: user.is_active ? '#166534' : '#DC2626'
                          }}>
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleGenerateCert(user.id, user.company_id)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer border transition-all hover:bg-gray-50"
                          style={{ borderColor: '#E8E8E0', color: '#374151' }}>
                          Generar certificado
                        </button>
                      </td>
                    </tr>
                  ))}
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

        {/* TAB: CERTIFICADOS */}
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
                    <tr key={cert.id}
                      style={{ borderBottom: i < certificates.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>{cert.profiles?.full_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#9A9AAA' }}>{cert.profiles?.email}</p>
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: '#6B7280' }}>{cert.companies?.name}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md"
                          style={{ background: '#F3F4F6', color: '#374151' }}>
                          {cert.certificate_number}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold" style={{ color: '#1A1A2E' }}>
                        {cert.score}/100
                      </td>
                      <td className="px-6 py-4 text-xs" style={{ color: '#9A9AAA' }}>
                        {new Date(cert.issued_at).toLocaleDateString('es-GT', {
                          year: 'numeric', month: 'long', day: 'numeric'
                        })}
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

      {/* MODAL: CREAR USUARIO */}
      {showCreateUser && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold" style={{ color: '#1A1A2E' }}>Nuevo usuario</h3>
              <button onClick={() => { setShowCreateUser(false); setErrorMsg('') }}
                className="text-lg cursor-pointer leading-none" style={{ color: '#9A9AAA' }}>×</button>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Nombre completo', key: 'full_name', type: 'text', placeholder: 'María García' },
                { label: 'Correo electrónico', key: 'email', type: 'email', placeholder: 'maria@empresa.com' },
                { label: 'Contraseña temporal', key: 'password', type: 'password', placeholder: '••••••••' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
                    style={labelStyle}>{field.label}</label>
                  <input type={field.type} placeholder={field.placeholder}
                    value={(newUser as any)[field.key]}
                    onChange={e => setNewUser({ ...newUser, [field.key]: e.target.value })}
                    className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none"
                    style={inputStyle} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
                  style={labelStyle}>Empresa</label>
                <select value={newUser.company_id}
                  onChange={e => setNewUser({ ...newUser, company_id: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={inputStyle}>
                  <option value="">Selecciona una empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
                  style={labelStyle}>Rol</label>
                <select value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={inputStyle}>
                  <option value="collaborator">Colaborador</option>
                  <option value="admin">Administrador</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
              {errorMsg && (
                <div className="px-4 py-3 rounded-lg text-sm"
                  style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                  {errorMsg}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowCreateUser(false); setErrorMsg('') }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
                  style={{ borderColor: '#E8E8E0', color: '#374151' }}>Cancelar</button>
                <button onClick={handleCreateUser} disabled={creating}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                  style={{ background: '#1A1A2E' }}>
                  {creating ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CARGA MASIVA */}
      {showBulkUpload && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold" style={{ color: '#1A1A2E' }}>Carga masiva de usuarios</h3>
              <button onClick={() => { setShowBulkUpload(false); setCsvData([]); setBulkResults([]); setErrorMsg('') }}
                className="text-lg cursor-pointer leading-none" style={{ color: '#9A9AAA' }}>×</button>
            </div>
            <div className="rounded-lg p-4 mb-5" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>
                Formato requerido — archivo CSV
              </p>
              <p className="text-xs font-mono leading-relaxed" style={{ color: '#374151' }}>
                nombre,email<br/>
                María García,maria@empresa.com<br/>
                Carlos López,carlos@empresa.com
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
                  style={labelStyle}>Empresa destino</label>
                <select value={bulkCompanyId} onChange={e => setBulkCompanyId(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={inputStyle}>
                  <option value="">Selecciona una empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
                  style={labelStyle}>Archivo CSV</label>
                <input type="file" accept=".csv" onChange={handleCSV}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm"
                  style={{ borderColor: '#E8E8E0', color: '#374151' }} />
                {csvData.length > 0 && (
                  <p className="text-xs mt-2 font-medium" style={{ color: '#166534' }}>
                    {csvData.length} usuarios detectados en el archivo
                  </p>
                )}
              </div>
              {errorMsg && (
                <div className="px-4 py-3 rounded-lg text-sm"
                  style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                  {errorMsg}
                </div>
              )}
              {bulkResults.length > 0 && (
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: '#E8E8E0' }}>
                  <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest"
                    style={{ background: '#F9FAFB', color: '#9A9AAA', borderBottom: '1px solid #F3F4F6' }}>
                    Resultados del proceso
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {bulkResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs border-t"
                        style={{ borderColor: '#F9FAFB' }}>
                        <span style={{ color: '#374151' }}>{r.name} — {r.email}</span>
                        <span className="font-semibold ml-4" style={{ color: r.success ? '#166534' : '#DC2626' }}>
                          {r.success ? 'Creado' : r.error}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowBulkUpload(false); setCsvData([]); setBulkResults([]); setErrorMsg('') }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
                  style={{ borderColor: '#E8E8E0', color: '#374151' }}>Cerrar</button>
                <button onClick={handleBulkUpload}
                  disabled={bulkLoading || csvData.length === 0 || !bulkCompanyId}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
                  style={{ background: bulkLoading || csvData.length === 0 || !bulkCompanyId ? '#D1D5DB' : '#1A1A2E' }}>
                  {bulkLoading
                    ? `Procesando ${bulkResults.length} de ${csvData.length}...`
                    : csvData.length > 0
                    ? `Crear ${csvData.length} usuarios`
                    : 'Selecciona un archivo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
