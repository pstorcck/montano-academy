'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getBranding } from '@/lib/branding'
import { useRouter } from 'next/navigation'

export default function CertificadosPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [certificates, setCertificates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const certRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*, companies(*)')
        .eq('id', user.id)
        .single()

      if (profileData) setProfile(profileData)

      const { data: certs } = await supabase
        .from('certificates')
        .select('*, companies(name, slug, primary_color, secondary_color)')
        .eq('user_id', user.id)
        .order('issued_at', { ascending: false })

      setCertificates(certs || [])
      if (certs && certs.length > 0) setSelected(certs[0])
      setLoading(false)
    }
    init()
  }, [router])

  const handleDownload = async () => {
    if (!certRef.current || !selected) return

    const { default: jsPDF } = await import('jspdf')
    const { default: html2canvas } = await import('html2canvas')

    const canvas = await html2canvas(certRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff'
    })

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    })

    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`Certificado-${selected.certificate_number}.pdf`)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0E1A' }}>
      <div className="text-white text-sm">Cargando...</div>
    </div>
  )

  const branding = profile?.companies ? getBranding(profile.companies.slug) : getBranding('colegio-montano')
  const certBranding = selected?.companies ? getBranding(selected.companies.slug) : branding

  return (
    <div className="min-h-screen flex" style={{ background: '#F0EEE8' }}>

      {/* Sidebar */}
      <div className="w-60 min-h-screen flex flex-col" style={{ background: branding.bgColor }}>
        <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white" style={{ padding: '3px' }}>
              <img src={branding.logoUrl} alt={branding.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <p className="text-xs font-bold text-white">{branding.name}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>montano.academy</p>
            </div>
          </div>
        </div>
        <nav className="p-3 flex-1">
          <div className="text-xs font-bold uppercase tracking-widest px-2 mt-3 mb-2"
            style={{ color: 'rgba(255,255,255,0.22)' }}>Principal</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onClick={() => router.push('/dashboard')}>
            <span className="text-sm">⊞</span>
            <span className="text-sm">Mi aprendizaje</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onClick={() => router.push('/induccion')}>
            <span className="text-sm">◎</span>
            <span className="text-sm">Mi inducción</span>
          </div>
          <div className="text-xs font-bold uppercase tracking-widest px-2 mt-4 mb-2"
            style={{ color: 'rgba(255,255,255,0.22)' }}>Personal</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1"
            style={{ background: `${branding.secondaryColor}18`, color: branding.secondaryColor }}>
            <span className="text-sm">◈</span>
            <span className="text-sm font-semibold">Certificados</span>
          </div>
        </nav>
        <div className="p-4 border-t flex items-center gap-3"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: branding.primaryColor }}>
            {profile?.full_name?.charAt(0)}
          </div>
          <div>
            <div className="text-xs font-semibold text-white">{profile?.full_name}</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Colaborador</div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">

        {/* Topbar */}
        <div className="bg-white border-b px-8 h-16 flex items-center justify-between"
          style={{ borderColor: '#E8E8E0' }}>
          <h1 className="text-lg font-bold" style={{ color: '#1A1A2E' }}>Mis certificados</h1>
          {selected && (
            <button onClick={handleDownload}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: branding.primaryColor }}>
              Descargar PDF
            </button>
          )}
        </div>

        <div className="flex-1 p-8">
          {certificates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                style={{ background: '#F0EEE8' }}>
                <span style={{ fontSize: 36 }}>🏆</span>
              </div>
              <h2 className="text-lg font-bold mb-2" style={{ color: '#1A1A2E' }}>
                Aún no tienes certificados
              </h2>
              <p className="text-sm mb-6" style={{ color: '#9A9AAA' }}>
                Completa tu inducción para obtener tu certificado
              </p>
              <button onClick={() => router.push('/induccion')}
                className="px-6 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: branding.primaryColor }}>
                Iniciar mi inducción →
              </button>
            </div>
          ) : (
            <div className="flex gap-8 h-full">

              {/* Lista de certificados */}
              {certificates.length > 1 && (
                <div className="w-64 flex-shrink-0">
                  <p className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: '#9A9AAA' }}>Mis certificados</p>
                  {certificates.map(cert => (
                    <div key={cert.id}
                      onClick={() => setSelected(cert)}
                      className="p-4 rounded-xl mb-2 cursor-pointer border transition-all"
                      style={{
                        background: selected?.id === cert.id ? 'white' : 'transparent',
                        borderColor: selected?.id === cert.id ? '#E8E8E0' : 'transparent',
                      }}>
                      <p className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>
                        {cert.companies?.name}
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#9A9AAA' }}>
                        {new Date(cert.issued_at).toLocaleDateString('es-GT', {
                          year: 'numeric', month: 'long', day: 'numeric'
                        })}
                      </p>
                      <p className="text-xs font-bold mt-1" style={{ color: cert.companies?.primary_color }}>
                        {cert.score}/100
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Certificado */}
              {selected && (
                <div className="flex-1 flex flex-col items-center">
                  <div ref={certRef} className="bg-white shadow-2xl overflow-hidden"
                    style={{ width: 720, minHeight: 480 }}>

                    {/* Barra superior */}
                    <div style={{ height: 10, background: certBranding.bgColor }}></div>
                    <div style={{ height: 4, background: `linear-gradient(90deg, ${certBranding.secondaryColor}, ${certBranding.primaryColor})` }}></div>

                    <div className="px-16 py-12 text-center relative">

                      {/* Marca de agua */}
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        opacity: 0.04, fontSize: 160, fontWeight: 900,
                        color: certBranding.primaryColor, pointerEvents: 'none',
                        fontFamily: 'Work Sans, sans-serif', letterSpacing: -8,
                        whiteSpace: 'nowrap'
                      }}>
                        {certBranding.logoInitials}
                      </div>

                      {/* Logo */}
                      <div className="flex justify-center mb-6">
                        <div style={{
                          width: 72, height: 72, borderRadius: '50%',
                          background: certBranding.bgColor,
                          border: `3px solid ${certBranding.secondaryColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 8, overflow: 'hidden'
                        }}>
                          <img src={certBranding.logoUrl} alt={certBranding.name}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                      </div>

                      {/* Títulos */}
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
                        textTransform: 'uppercase', color: '#9A9AAA', marginBottom: 8 }}>
                        Grupo Montano · montano.academy
                      </p>
                      <h1 style={{ fontSize: 34, fontWeight: 800, color: certBranding.bgColor,
                        marginBottom: 4, fontFamily: 'Work Sans, sans-serif' }}>
                        Certificado de Finalización
                      </h1>
                      <p style={{ fontSize: 12, color: '#9A9AAA', letterSpacing: '0.08em',
                        marginBottom: 24 }}>
                        Programa de Inducción Institucional · {new Date(selected.issued_at).getFullYear()}
                      </p>

                      {/* Línea decorativa */}
                      <div style={{
                        width: 60, height: 3, margin: '0 auto 24px',
                        background: `linear-gradient(90deg, ${certBranding.primaryColor}, ${certBranding.secondaryColor})`
                      }}></div>

                      <p style={{ fontSize: 13, color: '#9A9AAA', marginBottom: 8 }}>
                        Este certificado acredita que
                      </p>

                      {/* Nombre */}
                      <div style={{ display: 'inline-block', marginBottom: 4 }}>
                        <p style={{ fontSize: 36, fontWeight: 800, color: certBranding.bgColor,
                          fontFamily: 'Work Sans, sans-serif', paddingBottom: 8,
                          borderBottom: `2px solid #E8E8E0`, minWidth: 320 }}>
                          {profile?.full_name}
                        </p>
                      </div>

                      <p style={{ fontSize: 13, color: '#9A9AAA', marginTop: 16, marginBottom: 4 }}>
                        ha completado satisfactoriamente
                      </p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: certBranding.bgColor,
                        marginBottom: 28 }}>
                        Inducción General — {selected.companies?.name}
                      </p>

                      {/* Footer */}
                      <div style={{
                        display: 'flex', justifyContent: 'center', gap: 48,
                        paddingTop: 20, borderTop: '1px solid #F0F0F0'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: certBranding.bgColor }}>
                            {new Date(selected.issued_at).toLocaleDateString('es-GT', {
                              year: 'numeric', month: 'long', day: 'numeric'
                            })}
                          </p>
                          <p style={{ fontSize: 10, color: '#9A9AAA', textTransform: 'uppercase',
                            letterSpacing: '0.08em', marginTop: 3 }}>
                            Fecha de emisión
                          </p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
                            color: certBranding.bgColor }}>
                            {selected.certificate_number}
                          </p>
                          <p style={{ fontSize: 10, color: '#9A9AAA', textTransform: 'uppercase',
                            letterSpacing: '0.08em', marginTop: 3 }}>
                            Número de certificado
                          </p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: 13, fontWeight: 800, padding: '4px 14px',
                            borderRadius: 100, background: certBranding.bgColor,
                            color: certBranding.secondaryColor
                          }}>
                            {selected.score}/100
                          </span>
                          <p style={{ fontSize: 10, color: '#9A9AAA', textTransform: 'uppercase',
                            letterSpacing: '0.08em', marginTop: 6 }}>
                            Punteo final
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Barra inferior */}
                    <div style={{ height: 6, background: `linear-gradient(90deg, ${certBranding.bgColor}, ${certBranding.primaryColor})` }}></div>
                  </div>

                  <p className="text-xs mt-4" style={{ color: '#9A9AAA' }}>
                    Certificado #{selected.certificate_number} · Emitido el {new Date(selected.issued_at).toLocaleDateString('es-GT')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
