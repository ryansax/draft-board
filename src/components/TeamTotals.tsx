import { POSITIONS, type Session } from '../types'
import { positionLeaders, teamTotals } from '../lib/totals'
import { POSITION_COLORS } from './ui'

/**
 * What every team has, counted by position.
 *
 * The board answers "who went where"; this answers "how many backs has he got",
 * which otherwise means scrolling sixteen rounds and counting with a finger. It
 * is the reason a watcher wants to scroll at all, so it may as well be a table.
 *
 * Read-only like everything else on a watched board: it is the same picks the
 * grid is already showing, added up.
 */
export default function TeamTotals({ session }: { session: Session }) {
  const rows = teamTotals(session)
  const leaders = positionLeaders(rows)

  return (
    <div className="h-full overflow-auto px-[2vw] py-[2vh]">
      <table className="w-full border-separate border-spacing-y-[0.6vh] text-stone-900">
        <thead>
          <tr className="text-[clamp(0.6rem,1vw,1.2rem)] tracking-widest text-stone-500 uppercase">
            <th className="px-[1vw] pb-[1vh] text-left font-semibold">Team</th>
            {POSITIONS.map((position) => (
              <th key={position} className="px-[0.6vw] pb-[1vh] text-center font-semibold">
                {position}
              </th>
            ))}
            <th className="px-[1vw] pb-[1vh] text-center font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.slot} className="bg-stone-100">
              <td className="rounded-l-xl px-[1vw] py-[1.2vh] text-left">
                <span className="text-[clamp(0.5rem,0.8vw,0.95rem)] font-bold text-stone-400 tabular-nums">
                  {row.slot}
                </span>
                <span className="ml-[0.8vw] text-[clamp(0.85rem,1.5vw,2rem)] font-black">
                  {row.name}
                </span>
              </td>
              {POSITIONS.map((position) => {
                const count = row.counts[position]
                const leads = count > 0 && count === leaders[position]
                return (
                  <td key={position} className="px-[0.6vw] py-[1.2vh] text-center">
                    <span
                      className={`inline-flex min-w-[2.4vw] items-center justify-center rounded-lg px-[0.6vw] py-[0.4vh] text-[clamp(0.85rem,1.6vw,2.1rem)] font-black tabular-nums ${
                        count === 0
                          ? 'text-stone-300'
                          : leads
                            ? `${POSITION_COLORS[position]} text-white`
                            : 'text-stone-800'
                      }`}
                    >
                      {count}
                    </span>
                  </td>
                )
              })}
              <td className="rounded-r-xl px-[1vw] py-[1.2vh] text-center text-[clamp(0.85rem,1.6vw,2.1rem)] font-black text-stone-500 tabular-nums">
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-[1.5vh] px-[1vw] text-[clamp(0.55rem,0.85vw,1rem)] text-stone-400">
        Counted from the picks on the board. A shaded number is the most anyone holds at that
        position.
      </p>
    </div>
  )
}
