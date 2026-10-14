'use client'

import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Users,
  Forklift,
  FileText,
  ClipboardList,
  CalendarDays,
  HardHat,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DashboardView } from '@/components/views/dashboard-view'
import { ClientesView } from '@/components/views/clientes-view'
import { EquiposView } from '@/components/views/equipos-view'
import { ContratosView } from '@/components/views/contratos-view'
import { OrdenesView } from '@/components/views/ordenes-view'
import { CalendarioView } from '@/components/views/calendario-view'

type ViewKey =
  | 'dashboard'
  | 'clientes'
  | 'equipos'
  | 'contratos'
  | 'ordenes'
  | 'calendario'

interface NavItem {
  key: ViewKey
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Visión general de KPIs',
  },
  {
    key: 'clientes',
    label: 'Clientes',
    icon: Users,
    description: 'Empresas y contactos',
  },
  {
    key: 'equipos',
    label: 'Equipos',
    icon: Forklift,
    description: 'Grúas y montacargas',
  },
  {
    key: 'contratos',
    label: 'Contratos',
    icon: FileText,
    description: 'Acuerdos de mantenimiento',
  },
  {
    key: 'ordenes',
    label: 'Órdenes de Trabajo',
    icon: ClipboardList,
    description: 'Mantenimientos programados y en curso',
  },
  {
    key: 'calendario',
    label: 'Calendario',
    icon: CalendarDays,
    description: 'Vista mensual de intervenciones',
  },
]

export default function Home() {
  // Inicialización perezosa: lee la URL hash al arrancar para compartir enlaces
  const [activeView, setActiveView] = useState<ViewKey>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as ViewKey
      if (hash && NAV_ITEMS.some((n) => n.key === hash)) {
        return hash
      }
    }
    return 'dashboard'
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Cuando cambia la vista, actualiza la URL hash (sin leer de vuelta)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = activeView
    }
  }, [activeView])

  const currentNav = NAV_ITEMS.find((n) => n.key === activeView)!

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView onNavigate={setActiveView} />
      case 'clientes':
        return <ClientesView />
      case 'equipos':
        return <EquiposView />
      case 'contratos':
        return <ContratosView />
      case 'ordenes':
        return <OrdenesView />
      case 'calendario':
        return <CalendarioView onNavigate={setActiveView} />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 h-screen w-64 shrink-0 z-40 lg:z-auto',
          'flex flex-col border-r border-border bg-sidebar text-sidebar-foreground',
          'transition-transform duration-200 ease-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Marca */}
        <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
            <HardHat className="w-4 h-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Mantenim</span>
            <span className="text-[11px] text-muted-foreground">
              Gestión de mantenimiento
            </span>
          </div>
          <button
            className="ml-auto lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-3 space-y-0.5">
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Módulos
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = activeView === item.key
            return (
              <button
                key={item.key}
                onClick={() => {
                  setActiveView(item.key)
                  setSidebarOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4 shrink-0',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-4">
          <div className="text-[11px] text-muted-foreground">
            <p>v1.0 · MVP</p>
            <p className="mt-1">© 2026 Mantenim</p>
          </div>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center gap-3 px-4 lg:px-8 h-full">
            <button
              className="lg:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold tracking-tight leading-tight">
                {currentNav.label}
              </h1>
              <p className="text-[12px] text-muted-foreground leading-tight hidden sm:block">
                {currentNav.description}
              </p>
            </div>
          </div>
        </header>

        {/* Render de la vista activa */}
        <main className="flex-1 min-w-0 overflow-x-hidden">{renderView()}</main>
      </div>
    </div>
  )
}
