/** The 32 clubs, plus the sheet's free-agent marker. */
export interface NflTeam {
  code: string
  city: string
  nickname: string
}

export const NFL_TEAMS: NflTeam[] = [
  { code: 'ARI', city: 'Arizona', nickname: 'Cardinals' },
  { code: 'ATL', city: 'Atlanta', nickname: 'Falcons' },
  { code: 'BAL', city: 'Baltimore', nickname: 'Ravens' },
  { code: 'BUF', city: 'Buffalo', nickname: 'Bills' },
  { code: 'CAR', city: 'Carolina', nickname: 'Panthers' },
  { code: 'CHI', city: 'Chicago', nickname: 'Bears' },
  { code: 'CIN', city: 'Cincinnati', nickname: 'Bengals' },
  { code: 'CLE', city: 'Cleveland', nickname: 'Browns' },
  { code: 'DAL', city: 'Dallas', nickname: 'Cowboys' },
  { code: 'DEN', city: 'Denver', nickname: 'Broncos' },
  { code: 'DET', city: 'Detroit', nickname: 'Lions' },
  { code: 'GB', city: 'Green Bay', nickname: 'Packers' },
  { code: 'HOU', city: 'Houston', nickname: 'Texans' },
  { code: 'IND', city: 'Indianapolis', nickname: 'Colts' },
  { code: 'JAX', city: 'Jacksonville', nickname: 'Jaguars' },
  { code: 'KC', city: 'Kansas City', nickname: 'Chiefs' },
  { code: 'LAC', city: 'Los Angeles', nickname: 'Chargers' },
  { code: 'LAR', city: 'Los Angeles', nickname: 'Rams' },
  { code: 'LV', city: 'Las Vegas', nickname: 'Raiders' },
  { code: 'MIA', city: 'Miami', nickname: 'Dolphins' },
  { code: 'MIN', city: 'Minnesota', nickname: 'Vikings' },
  { code: 'NE', city: 'New England', nickname: 'Patriots' },
  { code: 'NO', city: 'New Orleans', nickname: 'Saints' },
  { code: 'NYG', city: 'New York', nickname: 'Giants' },
  { code: 'NYJ', city: 'New York', nickname: 'Jets' },
  { code: 'PHI', city: 'Philadelphia', nickname: 'Eagles' },
  { code: 'PIT', city: 'Pittsburgh', nickname: 'Steelers' },
  { code: 'SEA', city: 'Seattle', nickname: 'Seahawks' },
  { code: 'SF', city: 'San Francisco', nickname: '49ers' },
  { code: 'TB', city: 'Tampa Bay', nickname: 'Buccaneers' },
  { code: 'TEN', city: 'Tennessee', nickname: 'Titans' },
  { code: 'WAS', city: 'Washington', nickname: 'Commanders' },
]

export const FREE_AGENT_CODE = 'FA'

const BY_CODE = new Map(NFL_TEAMS.map((t) => [t.code, t]))

/** "DET" -> "Detroit Lions". Unknown codes come back as-is. */
export function teamFullName(code: string): string {
  if (!code) return ''
  if (code === FREE_AGENT_CODE) return 'free agency'
  const team = BY_CODE.get(code.toUpperCase())
  return team ? `${team.city} ${team.nickname}` : code
}

/** Codes for a dropdown, free agency last. */
export const TEAM_OPTIONS: string[] = [...NFL_TEAMS.map((t) => t.code), FREE_AGENT_CODE]
