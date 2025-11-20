import './App.css'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { type BoardCard } from './types'
import { createWsClient, type ClientState } from './wsClient'

const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:4000'
const defaultRoom = import.meta.env.VITE_DEFAULT_ROOM || 'A1B2-CASCADE'
const client = createWsClient(wsUrl)

function CardList({ cards, compact = false }: { cards: BoardCard[]; compact?: boolean }) {
  return (
    <div className="cards">
      {cards.map((card) => (
        <div key={card.id} className={`card ${compact ? 'card-compact' : ''} ${card.tapped ? 'tapped' : ''}`}>
          <p className="card__title">{card.name}</p>
          {card.note ? <p className="card__note">{card.note}</p> : null}
          <p className="card__owner">{card.owner}</p>
        </div>
      ))}
    </div>
  )
}

function ZonePile({
  label,
  count,
  topCard,
  variant = 'deck',
}: {
  label: string
  count?: number
  topCard?: string
  variant?: 'deck' | 'yard' | 'exile' | 'commander'
}) {
  return (
    <div className={`zone-pile ${variant}`}>
      <div className="pile-visual">
        <div className="layer layer-1" />
        <div className="layer layer-2" />
        <div className="layer layer-3" />
        <div className="pile-face">
          <span className="pile-label">{label}</span>
          {topCard ? <span className="pile-card">{topCard}</span> : null}
          {typeof count === 'number' ? <span className="pile-count">{count}</span> : null}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState<'vintage' | 'modern'>('vintage')
  const [roomCode, setRoomCode] = useState(defaultRoom)
  const [clientState, setClientState] = useState<ClientState>(client.getState())
  const [handOpen, setHandOpen] = useState(false)

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

  const groupByZone = useMemo(() => {
    if (!snapshot) return {}
    return snapshot.players.reduce<Record<string, Record<string, BoardCard[]>>>((acc, player) => {
      const playerCards = snapshot.board.filter((card) => card.owner === player.name)
      acc[player.name] = playerCards.reduce<Record<string, BoardCard[]>>((zones, card) => {
        zones[card.zone] = zones[card.zone] ? [...zones[card.zone], card] : [card]
        return zones
      }, {})
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

  const hero = snapshot.players[0]
  const opponents = snapshot.players.slice(1)
  const heroZones = groupByZone[hero.name] || {}
  const heroBattlefield = heroZones.battlefield || []
  const heroHand = heroZones.hand || []
  const heroCom = heroZones.commander?.[0]
  const heroYard = heroZones.graveyard || []
  const heroExile = heroZones.exile || []

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
        <section className="panel playmat">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Table view</p>
              <h2>Live board · hand · zones</h2>
              <p className="muted">Seed: {snapshot.seed}</p>
            </div>
            <div className="chips">
              <span className="chip">{clientState.status === 'open' ? 'Live websocket' : 'Offline'}</span>
              <span className="chip">Stub cards</span>
              <span className="chip">Commander ready</span>
            </div>
          </div>

          <div className="tabletop">
            <div className="opponent-row">
              {opponents.map((opponent) => {
                const zones = groupByZone[opponent.name] || {}
                const opponentBattlefield = zones.battlefield || []
                const opponentStack = zones.stack || []
                const opponentYard = zones.graveyard || []
                const opponentExile = zones.exile || []
                const commander = zones.commander?.[0]
                return (
                  <div key={opponent.id} className="seat opponent">
                    <div className="seat__header">
                      <div>
                        <p className="eyebrow">{opponent.status}</p>
                        <p className="player__name">{opponent.name}</p>
                        <p className="muted small">{opponent.deck}</p>
                      </div>
                      <div className="player__life small-life" style={{ borderColor: opponent.color }}>
                        {opponent.life}
                      </div>
                    </div>
                    <div className="seat__zones">
                      <div className="pile-column">
                        <ZonePile label="Library" count={60} variant="deck" />
                        <ZonePile label="Commander" topCard={commander?.name} variant="commander" />
                        <ZonePile label="Exile" topCard={opponentExile[0]?.name} variant="exile" />
                        <ZonePile label="Graveyard" topCard={opponentYard[0]?.name} variant="yard" />
                      </div>
                      <div className="battlefield">
                        <CardList cards={opponentBattlefield} />
                        {opponentStack.length ? (
                          <div className="stack-callout">
                            <p className="zone__label">Stack</p>
                            <CardList cards={opponentStack} compact />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="seat hero">
              <div className="seat__header">
                <div>
                  <p className="eyebrow">{hero.status}</p>
                  <p className="player__name">{hero.name}</p>
                  <p className="muted small">{hero.deck}</p>
                  <p className="commander">Commander · {hero.commander}</p>
                </div>
                <div className="player__life" style={{ borderColor: hero.color }}>
                  {hero.life}
                  <span>life</span>
                </div>
              </div>
              <div className="seat__zones">
                <div className="pile-column">
                  <ZonePile label="Library" count={60} variant="deck" />
                  <ZonePile label="Commander" topCard={heroCom?.name} variant="commander" />
                  <ZonePile label="Exile" topCard={heroExile[0]?.name} variant="exile" />
                  <ZonePile label="Graveyard" topCard={heroYard[0]?.name} variant="yard" />
                </div>
                <div className="battlefield">
                  <CardList cards={heroBattlefield} />
                </div>
              </div>
            </div>
          </div>

          <div
            className={`hand-drawer ${handOpen ? 'open' : ''}`}
            onMouseEnter={() => setHandOpen(true)}
            onMouseLeave={() => setHandOpen(false)}
          >
            <div className="hand-header">
              <span>Hand</span>
              <span className="muted small">{heroHand.length} cards</span>
            </div>
            <div className="hand-cards">
              {heroHand.map((card, idx) => (
                <div key={card.id} className="card hand-card" style={{ transform: `translateX(-${idx * 16}px)` }}>
                  <p className="card__title">{card.name}</p>
                  <p className="card__note">Hand</p>
                </div>
              ))}
              {!heroHand.length ? <p className="muted">No cards in hand</p> : null}
            </div>
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
