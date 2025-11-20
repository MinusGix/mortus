import { type FormEvent, useState } from 'react'
import './App.css'

type PlayerSummary = {
  name: string
  deck: string
  life: number
  status: 'Ready' | 'Waiting' | 'Testing'
  commander: string
  color: string
}

type BoardCard = {
  id: string
  name: string
  owner: string
  zone: 'battlefield' | 'stack' | 'hand'
  tapped?: boolean
  note?: string
}

const players: PlayerSummary[] = [
  {
    name: 'Mira',
    deck: 'Temur Cascade',
    life: 21,
    status: 'Ready',
    commander: 'Maelstrom Wanderer',
    color: '#72e081',
  },
  {
    name: 'Row',
    deck: 'Izzet Spells',
    life: 18,
    status: 'Testing',
    commander: 'Jhoira, Weatherlight Captain',
    color: '#68c5ff',
  },
]

const boardState: BoardCard[] = [
  {
    id: '1',
    name: 'Maelstrom Wanderer',
    owner: 'Mira',
    zone: 'battlefield',
    note: 'Haste, double cascade',
  },
  {
    id: '2',
    name: 'Solemn Simulacrum',
    owner: 'Mira',
    zone: 'battlefield',
    tapped: true,
    note: 'Fetched Island',
  },
  {
    id: '3',
    name: 'Panharmonicon',
    owner: 'Row',
    zone: 'battlefield',
    note: 'Doubles ETB triggers',
  },
  {
    id: '4',
    name: 'Whirlwind Denial',
    owner: 'Row',
    zone: 'stack',
    note: 'Counter unless 4',
  },
  { id: '5', name: 'Mystic Remora', owner: 'Row', zone: 'battlefield', note: 'Upkeep 0' },
  { id: '6', name: 'Island', owner: 'Row', zone: 'battlefield', tapped: true },
  { id: '7', name: 'Command Tower', owner: 'Mira', zone: 'battlefield' },
]

const gameLog = [
  { label: 'Resolved', detail: 'Solemn Simulacrum ETB — searched basic Island' },
  { label: 'Trigger', detail: 'Panharmonicon sees Solemn — double ETB prepared' },
  { label: 'Stack', detail: 'Whirlwind Denial cast targeting cascade spells' },
  { label: 'Action', detail: 'Combat declared — Meanderer swings for 7 commander' },
  { label: 'Seed', detail: 'Game seed locked (A1B2-CASCADE) for determinism' },
]

const pendingTasks = [
  'Authorize websocket endpoint',
  'SANDBOX: local-only rules engine',
  'Deck import from Moxfield link',
  'Cache Scryfall image batch',
]

const flavorFacts = [
  'Authoritative server owns all randomness; clients send intent only.',
  'Deck hashes are stored so opponents can re-verify mid-game.',
  'Replays store both actions and resolved effects to survive code changes.',
]

function App() {
  const [theme, setTheme] = useState<'vintage' | 'modern'>('vintage')
  const [roomCode, setRoomCode] = useState('A1B2-CASCADE')
  const [deckUrl, setDeckUrl] = useState('https://www.moxfield.com/decks/sample')

  const handleJoin = (event: FormEvent) => {
    event.preventDefault()
  }

  const handleDeckImport = (event: FormEvent) => {
    event.preventDefault()
  }

  return (
    <div className={`app theme-${theme}`}>
      <header className="hero">
        <div className="hero__eyebrow">Mortus Table · alpha preview</div>
        <div className="hero__heading">
          <div>
            <h1>Online MTG without table friction.</h1>
            <p className="lede">
              Deterministic RNG, authoritative server, full replays. Join with a code, paste a deck,
              and start the game loop.
            </p>
          </div>
          <div className="theme-toggle">
            <span>Theme</span>
            <div className="toggle-switch" role="group" aria-label="Choose theme">
              {(['vintage', 'modern'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === theme ? 'active' : ''}
                  onClick={() => setTheme(option)}
                >
                  {option === 'vintage' ? 'Vintage parchment' : 'Modern minimal'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <form className="cta-row" onSubmit={handleJoin}>
          <label className="field">
            <span>Room code</span>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="e.g. FIRE-LAPSE"
            />
          </label>
          <div className="cta-actions">
            <button type="submit" className="primary">
              Join room
            </button>
            <button type="button" className="ghost">
              Create new room
            </button>
            <button type="button" className="ghost">
              Spectate only
            </button>
          </div>
        </form>
        <div className="facts">
          {flavorFacts.map((fact) => (
            <div key={fact} className="fact">
              {fact}
            </div>
          ))}
        </div>
      </header>

      <main className="content">
        <section className="panel board">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Game preview</p>
              <h2>Battlefield + stack</h2>
              <p className="muted">Authoritative resolution; clients see state diffs.</p>
            </div>
            <div className="chips">
              <span className="chip">Seed locked</span>
              <span className="chip">Rules engine local</span>
              <span className="chip">No Supabase yet</span>
            </div>
          </div>

          <div className="board__players">
            {players.map((player) => (
              <div key={player.name} className="player">
                <div className="player__meta">
                  <div className="player__life" style={{ borderColor: player.color }}>
                    {player.life}
                    <span>life</span>
                  </div>
                  <div>
                    <p className="eyebrow">{player.status}</p>
                    <p className="player__name">{player.name}</p>
                    <p className="muted">{player.deck}</p>
                    <p className="commander">Commander · {player.commander}</p>
                  </div>
                </div>
                <div className="player__zones">
                  <div className="zone">
                    <p className="zone__label">Battlefield</p>
                    <div className="cards">
                      {boardState
                        .filter((card) => card.owner === player.name && card.zone === 'battlefield')
                        .map((card) => (
                          <div key={card.id} className={`card ${card.tapped ? 'tapped' : ''}`}>
                            <p className="card__title">{card.name}</p>
                            {card.note ? <p className="card__note">{card.note}</p> : null}
                            <p className="card__owner">{player.name}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="zone stack-zone">
                    <p className="zone__label">Stack</p>
                    <div className="cards">
                      {boardState
                        .filter((card) => card.owner === player.name && card.zone === 'stack')
                        .map((card) => (
                          <div key={card.id} className="card stack-card">
                            <p className="card__title">{card.name}</p>
                            {card.note ? <p className="card__note">{card.note}</p> : null}
                            <p className="card__owner">{player.name}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel grid">
          <div className="subpanel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Deck ingest</p>
                <h3>Pull from Moxfield or CSV</h3>
                <p className="muted">Normalize into card IDs; hash to prevent tampering.</p>
              </div>
              <span className="chip">Scryfall cache ready</span>
            </div>
            <form className="deck-form" onSubmit={handleDeckImport}>
              <label className="field">
                <span>Deck URL</span>
                <input
                  value={deckUrl}
                  onChange={(e) => setDeckUrl(e.target.value)}
                  placeholder="https://www.moxfield.com/decks/..."
                />
              </label>
              <div className="deck-actions">
                <button type="submit" className="primary">
                  Import deck
                </button>
                <button type="button" className="ghost">
                  Upload CSV
                </button>
              </div>
              <p className="muted small">
                Decks are parsed client-side for now; server validation comes with the first backend
                pass.
              </p>
            </form>
          </div>
          <div className="subpanel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Lobby state</p>
                <h3>Ready check & seat order</h3>
                <p className="muted">When all players ready, game seed is finalized.</p>
              </div>
            </div>
            <ul className="ready-list">
              {players.map((player) => (
                <li key={player.name}>
                  <span className="ready-dot" style={{ background: player.color }} />
                  <div>
                    <p>{player.name}</p>
                    <p className="muted small">{player.deck}</p>
                  </div>
                  <span className={`pill pill-${player.status.toLowerCase()}`}>{player.status}</span>
                </li>
              ))}
              <li className="sandbox-callout">
                <div>
                  <p>Sandbox mode</p>
                  <p className="muted small">Local rules engine · no Supabase yet</p>
                </div>
                <button type="button" className="ghost">
                  Launch offline sandbox
                </button>
              </li>
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Replay stream</p>
              <h3>Action log</h3>
              <p className="muted">Stored as JSON; deterministic with seed + resolved effects.</p>
            </div>
            <div className="chips">
              {pendingTasks.map((task) => (
                <span key={task} className="chip ghost-chip">
                  {task}
                </span>
              ))}
            </div>
          </div>
          <ol className="log">
            {gameLog.map((entry) => (
              <li key={entry.detail}>
                <span className="log-label">{entry.label}</span>
                <span className="log-detail">{entry.detail}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  )
}

export default App
