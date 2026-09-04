import { Bed, Bomb, GraduationCap, Heart, Rocket, ShieldPlus, Tag, type LucideIcon } from 'lucide-react'
import { BADGE_LABELS, type Badge, type Position } from '../types'

/**
 * Matched to the glyphs actually printed on the sheet, which are not what the
 * legend names suggest: Sleeper is a bed, Breakout a rocket, Rookie a graduation
 * cap, Bust a bomb, and Injury Concerns a medical shield.
 */
export const BADGE_ICONS: Record<Badge, LucideIcon> = {
  myGuy: Heart,
  sleeper: Bed,
  breakout: Rocket,
  value: Tag,
  rookie: GraduationCap,
  bust: Bomb,
  injury: ShieldPlus,
}

/** The sheet draws the positive badges blue and the cautionary ones red. */
export const BADGE_COLORS: Record<Badge, string> = {
  myGuy: 'text-blue-600 dark:text-blue-400',
  sleeper: 'text-blue-600 dark:text-blue-400',
  breakout: 'text-blue-600 dark:text-blue-400',
  value: 'text-blue-600 dark:text-blue-400',
  rookie: 'text-blue-600 dark:text-blue-400',
  bust: 'text-red-600 dark:text-red-400',
  injury: 'text-red-600 dark:text-red-400',
}

export function BadgeIcons({ badges, size = 13 }: { badges: Badge[]; size?: number }) {
  if (badges.length === 0) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 align-middle">
      {badges.map((badge) => {
        const Icon = BADGE_ICONS[badge]
        return (
          <Icon
            key={badge}
            size={size}
            aria-label={BADGE_LABELS[badge]}
            className={BADGE_COLORS[badge]}
            strokeWidth={2.25}
          />
        )
      })}
    </span>
  )
}

export const POSITION_COLORS: Record<Position, string> = {
  QB: 'bg-rose-600',
  RB: 'bg-emerald-600',
  WR: 'bg-blue-600',
  TE: 'bg-amber-600',
  DST: 'bg-violet-600',
  K: 'bg-stone-500',
}

export function PositionPill({ position, className = '' }: { position: Position; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white ${POSITION_COLORS[position]} ${className}`}
    >
      {position}
    </span>
  )
}

export function Chip({
  tone,
  children,
  className = '',
}: {
  tone: 'safe' | 'coinflip' | 'gone' | 'falling' | 'neutral' | 'warn'
  children: React.ReactNode
  className?: string
}) {
  const tones: Record<string, string> = {
    safe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    coinflip: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    gone: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    falling: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    warn: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300',
    neutral: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] leading-4 font-semibold whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Button({
  variant = 'default',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  const variants = {
    default:
      'bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-700 dark:hover:bg-stone-700',
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 border border-transparent',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 border border-transparent',
    ghost:
      'bg-transparent text-stone-600 hover:bg-stone-200 border border-transparent dark:text-stone-300 dark:hover:bg-stone-800',
  }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 tap-target ${variants[variant]} ${className}`}
    />
  )
}
