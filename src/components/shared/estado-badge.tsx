'use client'

import { cn } from '@/lib/utils'
import { ESTADO_COLOR } from '@/lib/constants'

interface BadgeProps {
  estado: string
  label?: string
  className?: string
}

// Badge genérico con paleta de color basada en el estado
export function EstadoBadge({ estado, label, className }: BadgeProps) {
  const colorClass = ESTADO_COLOR[estado] || 'bg-gray-100 text-gray-600 border-gray-200'
  const text = label || estado
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap',
        colorClass,
        className
      )}
    >
      {text}
    </span>
  )
}
