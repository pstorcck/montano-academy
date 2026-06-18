'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Suspense } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const SECRET_TOKEN = 'montano2026rep'

function ReportesContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const loadData = async () => {
    const [{ data: users }, { data: certs }, { data: companies }, { data: modProg }, { data: convs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, company_id, companies(name, slug, primary_color)').eq('role', 'collaborator'),
      supabase.from('certificates').select('user_id, company_id, score, issued_at'),
      supabase.from('companies').select('*').order('name'),
      supabase.from('module_progress').select('user_id, company_id, module_name'),
      supabase.from('conversations').select('user_id, company_id, started_at').order('started_at', { ascending: false }),
    ])
    setData({ users: users || [], certs: certs || [], companies: companies || [], modProg: modProg || [], convs: convs || [] })
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    if (token !== SECRET_TOKEN) { setLoading(false); return }
    loadData()
    const interval = setInterval(loadData, 60000) // Actualiza cada minuto
    return () => clearInterval(interval)
  }, [token])

  if (token !== SECRET_TOKEN) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FA' }}>
      <div className="text-center">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-lg font-bold" style={{ color: '#0F172A' }}>Acceso restringido</p>
        <p className="text-sm mt-2" style={{ color: '#94A3B8' }}>Token inválido o no proporcionado</p>
      </div>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FA' }}>
      <div className="text-center">
        <div className="flex gap-2 justify-center mb-3">
          {[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3B5BDB', animationDelay: `${d}ms` }}></div>)}
        </div>
        <p className="text-sm font-medium" style={{ color: '#64748B' }}>Cargando reporte...</p>
      </div>
    </div>
  )

  const { users, certs, companies, modProg, convs } = data

  const totalUsers = users.length
  const totalCerts = certs.length
  const usersWithProgress = users.filter((u: any) => {
    const hasMod = modProg.some((m: any) => m.user_id === u.id)
    const hasCert = certs.some((c: any) => c.user_id === u.id)
    const hasConv = convs.some((c: any) => c.user_id === u.id)
    return (hasMod || hasConv) && !hasCert
  }).length
  const sinIniciar = totalUsers - totalCerts - usersWithProgress
  const pctGeneral = totalUsers > 0 ? Math.round((totalCerts / totalUsers) * 100) : 0

  const pieData = companies.map((c: any) => {
    const cu = users.filter((u: any) => u.company_id === c.id)
    return { name: c.name.replace('Colegio ', 'C. ').replace('Guatemala', 'GT'), value: cu.length, color: c.primary_color || '#3B5BDB' }
  }).filter((d: any) => d.value > 0)

  const barData = companies.map((c: any) => {
    const cu = users.filter((u: any) => u.company_id === c.id)
    const cc = certs.filter((cert: any) => cert.company_id === c.id).length
    const cp = cu.filter((u: any) => {
      const hasMod = modProg.some((m: any) => m.user_id === u.id)
      const hasConv = convs.some((conv: any) => conv.user_id === u.id)
      const hasCert = certs.some((cert: any) => cert.user_id === u.id)
      return (hasMod || hasConv) && !hasCert
    }).length
    const cs = cu.length - cc - cp
    return {
      name: c.name.replace('Colegio ', 'C. ').replace('Guatemala', 'GT'),
      Certificados: cc, 'En progreso': cp, 'Sin iniciar': cs,
      color: c.primary_color
    }
  })

  const companyStats = companies.map((c: any) => {
    const cu = users.filter((u: any) => u.company_id === c.id)
    const cc = certs.filter((cert: any) => cert.company_id === c.id).length
    const cp = cu.filter((u: any) => {
      const hasMod = modProg.some((m: any) => m.user_id === u.id)
      const hasConv = convs.some((conv: any) => conv.user_id === u.id)
      const hasCert = certs.some((cert: any) => cert.user_id === u.id)
      return (hasMod || hasConv) && !hasCert
    }).length
    const pct = cu.length > 0 ? Math.round((cc / cu.length) * 100) : 0
    return { ...c, total: cu.length, certs: cc, progress: cp, sinIniciar: cu.length - cc - cp, pct }
  })

  return (
    <div className="min-h-screen" style={{ background: '#F5F7FA' }}>
      {/* Header */}
      <div className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: '#E8ECF0' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black" style={{ background: '#3B5BDB', color: 'white' }}>M</div>
          <div>
            <p className="text-sm font-bold" style={{ color: '#0F172A' }}>montano.academy — Reporte en vivo</p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>Actualiza automáticamente cada minuto · Última actualización: {lastUpdated.toLocaleTimeString('es-GT')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#10B981' }}></div>
          <span className="text-xs font-medium" style={{ color: '#10B981' }}>En vivo</span>
        </div>
      </div>

      <div className="p-8">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total colaboradores', value: totalUsers, sub: 'registrados', color: '#3B5BDB', bg: '#EEF2FF', icon: '◎' },
            { label: 'Certificados', value: totalCerts, sub: `${pctGeneral}% del total`, color: '#059669', bg: '#ECFDF5', icon: '◈' },
            { label: 'En progreso', value: usersWithProgress, sub: 'activos', color: '#D97706', bg: '#FFFBEB', icon: '▶' },
            { label: 'Sin iniciar', value: sinIniciar > 0 ? sinIniciar : 0, sub: 'pendientes', color: '#94A3B8', bg: '#F8FAFC', icon: '○' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border" style={{ borderColor: '#E8ECF0' }}>
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
          <div className="bg-white rounded-2xl p-6 border" style={{ borderColor: '#E8ECF0' }}>
            <h3 className="text-sm font-bold mb-1" style={{ color: '#0F172A' }}>Distribución de usuarios</h3>
            <p className="text-xs mb-6" style={{ color: '#94A3B8' }}>Por empresa</p>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={pieData} cx={75} cy={75} innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                    {pieData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {pieData.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: d.color }}></div>
                      <span className="text-xs font-medium" style={{ color: '#475569' }}>{d.name}</span>
                    </div>
                    <span className="text-sm font-bold" style={{ color: '#0F172A' }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

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
          {companyStats.map((c: any) => (
            <div key={c.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8ECF0' }}>
              <div className="h-1.5" style={{ background: c.primary_color }}></div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold" style={{ color: '#0F172A' }}>{c.name}</h3>
                  <span className="text-2xl font-black" style={{ color: c.primary_color }}>{c.pct}%</span>
                </div>
                <div className="h-2 rounded-full mb-5 overflow-hidden" style={{ background: '#F1F5F9' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${c.pct}%`, background: c.primary_color }}></div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { val: c.total, label: 'Total' },
                    { val: c.certs, label: 'Certificados', color: '#059669' },
                    { val: c.progress, label: 'En progreso', color: '#D97706' },
                    { val: c.sinIniciar, label: 'Sin iniciar', color: '#94A3B8' },
                  ].map((s, i) => (
                    <div key={i} className="text-center rounded-xl py-3" style={{ background: '#F8FAFC' }}>
                      <p className="text-xl font-black" style={{ color: s.color || '#0F172A' }}>{s.val}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Listado de personal */}
        <div className="mt-8 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E8ECF0' }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
            <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>Listado de personal</h2>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{users.length} colaboradores registrados</p>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Nombre', 'Empresa', 'Estado'].map(h => (
                  <th key={h} className="text-left px-6 py-3.5 text-xs font-bold uppercase tracking-wider" style={{ color: '#94A3B8', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users
                .sort((a: any, b: any) => (a.companies?.name || '').localeCompare(b.companies?.name || ''))
                .map((u: any, i: number) => {
                  const hasCert = certs.some((c: any) => c.user_id === u.id)
                  const hasMod = modProg.some((m: any) => m.user_id === u.id)
                  const hasConv = convs.some((c: any) => c.user_id === u.id)
                  const status = hasCert
                    ? { label: '✓ Certificado', bg: '#DCFCE7', color: '#166534' }
                    : hasMod || hasConv
                    ? { label: '▶ En progreso', bg: '#FEF9C3', color: '#854D0E' }
                    : { label: '○ Sin iniciar', bg: '#F1F5F9', color: '#64748B' }
                  return (
                    <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: u.companies?.primary_color || '#3B5BDB' }}>
                            {u.full_name?.charAt(0)}
                          </div>
                          <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{u.full_name}</p>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-xs font-medium px-2.5 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>
                          {u.companies?.name}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#CBD5E1' }}>
          montano.academy · Reporte generado el {new Date().toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
    </div>
  )
}

export default function ReportesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FA' }}>
        <p className="text-sm" style={{ color: '#64748B' }}>Cargando...</p>
      </div>
    }>
      <ReportesContent />
    </Suspense>
  )
}
