import { Moon, Sun, X } from 'lucide-react'
import { useSessionStore } from '../store/session'
import { Button } from './ui'

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, setSettings } = useSessionStore()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close settings" className="!px-2">
            <X size={18} />
          </Button>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <span className="flex items-center gap-2 text-sm font-medium">
            {settings.darkMode ? <Moon size={16} /> : <Sun size={16} />}
            Dark mode
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-emerald-600"
            checked={settings.darkMode}
            onChange={(e) => setSettings({ darkMode: e.target.checked })}
          />
        </label>

        <div className="mt-4 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm font-medium">Player headshots</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-emerald-600"
              checked={settings.playerImages}
              onChange={(e) => setSettings({ playerImages: e.target.checked })}
            />
          </label>
          <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
            Shows faces on the draft board. Player names are matched against Sleeper's free
            public player list, which is fetched once a day and cached on this device — the
            only network request the app makes on its own. Turn it off to stay fully offline.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm font-medium">Fun mode (spoken picks)</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-emerald-600"
              checked={settings.funMode}
              onChange={(e) => setSettings({ funMode: e.target.checked })}
            />
          </label>
          <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
            On the room display, each pick is announced out loud and the player's card lands as
            the voice finishes his name. Can also be toggled from the room display itself.
            Without an ElevenLabs key it uses the browser's built-in voice, which still works
            but sounds plainer.
          </p>
          {settings.funMode && (
            <div className="mt-3 space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                  ElevenLabs API key (optional)
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk_…"
                  value={settings.elevenLabsApiKey}
                  onChange={(e) => setSettings({ elevenLabsApiKey: e.target.value })}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                  Voice ID (optional)
                </label>
                <input
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="21m00Tcm4TlvDq8ikWAM (Rachel)"
                  value={settings.elevenLabsVoiceId}
                  onChange={(e) => setSettings({ elevenLabsVoiceId: e.target.value })}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-800"
                />
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-500">
                The key is kept in this browser and sent straight to api.elevenlabs.io. Fine for
                personal use on your own machine.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm font-medium">AI badge extraction</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-emerald-600"
              checked={settings.aiParseEnabled}
              onChange={(e) => setSettings({ aiParseEnabled: e.target.checked })}
            />
          </label>
          <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
            The sheet's badge glyphs (My Guy, Sleeper, …) are images, so plain text extraction loses them.
            With a key set, each page is rendered and sent to the Anthropic API to read the glyphs back.
            Numeric fields always come from the deterministic parse.
          </p>
          {settings.aiParseEnabled && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                Anthropic API key
              </label>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={settings.anthropicApiKey}
                onChange={(e) => setSettings({ anthropicApiKey: e.target.value })}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-800"
              />
              <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-500">
                Stored in this browser's localStorage and sent straight from the page to api.anthropic.com.
                That is fine for personal local use, but do not do it on a shared or deployed machine.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
          Everything is stored locally in this browser. No account, no server.
        </p>
      </div>
    </div>
  )
}
