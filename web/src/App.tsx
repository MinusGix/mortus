import './App.css'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { type BoardCard } from './types'
import { createWsClient, type ClientState } from './wsClient'

const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:4000'
const defaultRoom = import.meta.env.VITE_DEFAULT_ROOM || 'A1B2-CASCADE'
const client = createWsClient(wsUrl)

function CardList({ cards }: { cards: BoardCard[] }) {
  return (
    <div className="cards">
      {cards.map((card) => (
        <div key={card.id} className={`card ${card.tapped ? 'tapped' : ''}`}>
          <p className="card__title">{card.name}</p>
          {card.note ? <p className="card__note">{card.note}</p> : null}
          <p className="card__owner">{card.owner}</p>
        </div>
      ))}
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState<'vintage' | 'modern'>('vintage')
  const [roomCode, setRoomCode] = useState(defaultRoom)
  const [deckUrl, setDeckUrl] = useState('https://www.moxfield.com/decks/sample')
  const [clientState, setClientState] = useState<ClientState>(client.getState())

  useEffect(() => {
    const unsubscribe = client.subscribe(setClientState)
    client.connect()
    client.joinRoom(defaultRoom).catch(() => {
      setClientState((prev) => ({ ...prev, lastError: 'Unable to join default room' }))
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (clientState.room) setRoomCode(clientState.room)
  }, [clientState.room])

  useEffect(() => {
    document.body.classList.toggle('theme-modern', theme === 'modern')
  }, [theme])

  const snapshot = clientState.snapshot

  const boardByPlayer = useMemo(() => {
    if (!snapshot) return {}
    return snapshot.players.reduce<Record<string, BoardCard[]>>((acc, player) => {
      acc[player.name] = snapshot.board.filter((card) => card.owner === player.name)
      return acc
    }, {})
  }, [snapshot])

  const onJoin = (event: FormEvent) => {
    event.preventDefault()
    client.joinRoom(roomCode)
  }

  const onCreateRoom = async () => {
    const newCode = await client.createRoom()
    setRoomCode(newCode)
  }

  const onDeckImport = (event: FormEvent) => {
    event.preventDefault()
    client.importDeck(deckUrl)
  }

  if (!snapshot) {
    return (
      <div className={`app theme-${theme}`}>
        <header className="hero">
          <h1>Mortus Table</h1>
          <p className="muted">
            Connecting to websocket server at {wsUrl}... ({clientState.status})
          </p>
          {clientState.lastError ? <p className="muted">Error: {clientState.lastError}</p> : null}
        </header>
      </div>
    )
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
        <form className="cta-row" onSubmit={onJoin}>
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
            <button type="button" className="ghost" onClick={onCreateRoom}>
              Create new room
            </button>
            <button type="button" className="ghost" onClick={() => client.spectate()}>
              Spectate only
            </button>
          </div>
        </form>
        <div className="facts">
          <div className="fact">Authoritative server owns all randomness; clients send intent only.</div>
          <div className="fact">Deck hashes are stored so opponents can re-verify mid-game.</div>
          <div className="fact">Replays store actions + resolved effects to survive code changes.</div>
        </div>
      </header>

      <main className="content">
        <section className="panel board">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Game preview</p>
              <h2>Battlefield + stack</h2>
              <p className="muted">Authoritative resolution; clients see state diffs. Seed: {snapshot.seed}</p>
            </div>
            <div className="chips">
              <span className="chip">Seed locked</span>
              <span className="chip">Rules engine local</span>
              <span className="chip">No Supabase yet</span>
              <span className="chip">{clientState.status === 'open' ? 'Live' : 'Offline'}</span>
            </div>
          </div>

          <div className="board__players">
            {snapshot.players.map((player) => {
              const cards = boardByPlayer[player.name] ?? []
              return (
                <div key={player.id} className="player">
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
                      <CardList cards={cards.filter((card) => card.zone === 'battlefield')} />
                    </div>
                    <div className="zone stack-zone">
                      <p className="zone__label">Stack</p>
                      <CardList cards={cards.filter((card) => card.zone === 'stack')} />
                    </div>
                  </div>
                </div>
              )
            })}
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
            <form className="deck-form" onSubmit={onDeckImport}>
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
                <button type="button" className="ghost" onClick={() => client.simulateAction('Upload', 'Uploaded CSV (mock)')}>
                  Upload CSV
                </button>
              </div>
              <p className="muted small">
                Decks are parsed client-side for now; server validation comes with the first backend pass.
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
              {snapshot.players.map((player) => (
                <li key={player.id}>
                  <span className="ready-dot" style={{ background: player.color }} />
                  <div>
                    <p>{player.name}</p>
                    <p className="muted small">{player.deck}</p>
                  </div>
                  <span className={`pill pill-${player.status.toLowerCase()}`}>{player.status}</span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      client.updateStatus(
                        player.id,
                        player.status === 'Ready' ? 'Waiting' : player.status === 'Waiting' ? 'Testing' : 'Ready',
                      )
                    }
                  >
                    Cycle status
                  </button>
                </li>
              ))}
              <li className="sandbox-callout">
                <div>
                  <p>Sandbox mode</p>
                  <p className="muted small">Local rules engine · no Supabase yet</p>
                </div>
                <button type="button" className="ghost" onClick={() => client.simulateAction('Sandbox', 'Launched offline sandbox')}>
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
              {snapshot.pending.map((task) => (
                <button
                  key={task.id}
                  className={`chip ${task.done ? '' : 'ghost-chip'}`}
                  onClick={() => client.toggleTask(task.id)}
                >
                  {task.done ? '✔ ' : ''}
                  {task.text}
                </button>
              ))}
            </div>
          </div>
          <ol className="log">
            {snapshot.log.map((entry) => (
              <li key={entry.timestamp + entry.detail}>
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
