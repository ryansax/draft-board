import { Moon, Sun, X } from 'lucide-react'
import { useSessionStore } from '../store/session'
import { Button } from './ui'

/**
 * Every option stays visible whether or not its parent is switched on — dependent
 * controls dim and disable rather than disappearing. Hiding them meant you could
 * open this dialog looking for a key field and find no trace it existed.
 */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, setSettings } = useSessionStore()
  const needsAnthropicKey = settings.pickAnalysis || settings.aiParseEnabled

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close settings" className="!px-2">
            <X size={18} />
          </Button>
        </div>

        <Row
          label={
            <span className="flex items-center gap-2">
              {settings.darkMode ? <Moon size={16} /> : <Sun size={16} />}
              Dark mode
            </span>
          }
          checked={settings.darkMode}
          onChange={(v) => setSettings({ darkMode: v })}
        />

        <Section>
          <Row
            label="Player headshots"
            checked={settings.playerImages}
            onChange={(v) => setSettings({ playerImages: v })}
            hint="Faces and club badges on the draft board and in search. Names are matched against Sleeper's free public player list, fetched once a day and cached on this device. Turn it off to stay fully offline."
          />
        </Section>

        <Section>
          <Row
            label="Fun mode (spoken picks)"
            checked={settings.funMode}
            onChange={(v) => setSettings({ funMode: v })}
            hint="On the room display, each pick is announced out loud and the player's card lands as the voice finishes his name. Can also be toggled from the room display itself."
          />

          <Dependent on={settings.funMode} note="Turn on fun mode to use these.">
            <Row
              nested
              label="Analyst take on each pick"
              checked={settings.pickAnalysis}
              onChange={(v) => setSettings({ pickAnalysis: v })}
              disabled={!settings.funMode}
              hint="After the pick is announced, Claude gives a verdict and a sentence, read out and shown on the card: the value, the fit, and a little context on the player and his club. Your rankings, tiers and badges are never sent, because the take goes on a screen the whole room can see. Needs the Anthropic key below, and costs about a call per pick."
            />
            <Field
              label="ElevenLabs API key (optional)"
              type="password"
              placeholder="sk_…"
              value={settings.elevenLabsApiKey}
              onChange={(v) => setSettings({ elevenLabsApiKey: v })}
              disabled={!settings.funMode}
              hint="Without it, fun mode uses the browser's built-in voice — still works, just plainer."
            />
            <Field
              label="Announcer voice ID (optional)"
              placeholder="21m00Tcm4TlvDq8ikWAM (Rachel)"
              value={settings.elevenLabsVoiceId}
              onChange={(v) => setSettings({ elevenLabsVoiceId: v })}
              disabled={!settings.funMode}
              hint="Reads the pick and who is on the clock. Blank uses a stock voice."
            />
            <Field
              label="Analyst voice ID (optional)"
              placeholder="a different ElevenLabs voice"
              value={settings.elevenLabsAnalystVoiceId}
              onChange={(v) => setSettings({ elevenLabsAnalystVoiceId: v })}
              disabled={!settings.funMode || !settings.pickAnalysis}
              hint="Reads the analyst take, so it sounds like a second person. Blank uses the announcer voice."
            />
          </Dependent>
        </Section>

        <Section>
          <Row
            label="AI badge extraction"
            checked={settings.aiParseEnabled}
            onChange={(v) => setSettings({ aiParseEnabled: v })}
            hint="The sheet's badge glyphs are read from the PDF directly, so this is only a fallback if a future layout defeats that. Numeric fields always come from the deterministic parse."
          />
        </Section>

        <Section>
          <Field
            label="Anthropic API key"
            type="password"
            placeholder="sk-ant-…"
            value={settings.anthropicApiKey}
            onChange={(v) => setSettings({ anthropicApiKey: v })}
            hint={
              needsAnthropicKey
                ? 'Used by the analyst take and the AI badge fallback.'
                : 'Only needed if you switch on the analyst take or the AI badge fallback above.'
            }
          />
          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-500">
            Keys are kept in this browser and sent straight to the provider. Fine for personal
            use on your own machine; do not put them in a browser other people use.
          </p>
        </Section>

        <Section>
          <Field
            label="Project URL"
            placeholder="https://xxxx.supabase.co"
            value={settings.supabaseUrl}
            onChange={(v) => setSettings({ supabaseUrl: v })}
            hint="Where a shared board is published so friends can watch it from their own machines."
          />
          <Field
            label="Anon public key"
            type="password"
            placeholder="eyJ…"
            value={settings.supabaseAnonKey}
            onChange={(v) => setSettings({ supabaseAnonKey: v })}
            hint="Safe to share: it can read boards and nothing else. Publishing needs a separate key that stays on this machine."
          />
          <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
            Only made picks, managers and trades are published. Your rankings, tiers, risk and
            upside never leave this browser.
          </p>
        </Section>

        <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
          Drafts are stored locally in this browser. No account, no server.
        </p>
      </div>
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700">{children}</div>
  )
}

function Row({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
  nested = false,
}: {
  label: React.ReactNode
  checked: boolean
  onChange: (value: boolean) => void
  hint?: string
  disabled?: boolean
  nested?: boolean
}) {
  return (
    <div className={nested ? 'mb-3' : ''}>
      <label
        className={`flex items-center justify-between gap-4 ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <span className="text-sm font-medium">{label}</span>
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-emerald-600"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
      {hint && <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">{hint}</p>}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  hint,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className="mb-3 last:mb-0">
      <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
        {label}
      </label>
      <input
        type={type}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:disabled:bg-stone-800/50"
      />
      {hint && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{hint}</p>}
    </div>
  )
}

/** Dims dependent controls instead of removing them, so they stay discoverable. */
function Dependent({
  on,
  note,
  children,
}: {
  on: boolean
  note: string
  children: React.ReactNode
}) {
  return (
    <div className={`mt-3 border-l-2 border-stone-200 pl-3 dark:border-stone-700 ${on ? '' : 'opacity-50'}`}>
      {!on && <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">{note}</p>}
      {children}
    </div>
  )
}
