import './App.css'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BrowserRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { type BoardCard } from './types'
import { summarizeDeck, type MoxfieldDeckSummary } from './moxfield'
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

function useClientState() {
  const [clientState, setClientState] = useState<ClientState>(client.getState())

  useEffect(() => {
    const unsubscribe = client.subscribe(setClientState)
    client.connect()
    return unsubscribe
  }, [])

  return clientState
}

function Landing({
  theme,
  setTheme,
}: {
  theme: 'vintage' | 'modern'
  setTheme: (t: 'vintage' | 'modern') => void
}) {
  const navigate = useNavigate()
  const [roomInput, setRoomInput] = useState(defaultRoom)
  const [moxfieldInput, setMoxfieldInput] = useState('')
  const [moxfieldDeck, setMoxfieldDeck] = useState<MoxfieldDeckSummary | null>(null)
  const [moxfieldError, setMoxfieldError] = useState<string | null>(null)
  const [moxfieldLoading, setMoxfieldLoading] = useState(false)

  const onJoin = (event: FormEvent) => {
    event.preventDefault()
    navigate(`/room/${encodeURIComponent(roomInput)}`)
  }

  const onCreate = async () => {
    const code = await client.createRoom()
    navigate(`/room/${encodeURIComponent(code)}`)
  }

  const onFetchMoxfield = async (event: FormEvent) => {
    event.preventDefault()
    setMoxfieldError(null)
    setMoxfieldLoading(true)
    try {
      const result = await client.fetchMoxfield(moxfieldInput)
      // @ts-expect-error dynamic deck shape from server
      setMoxfieldDeck(summarizeDeck(result.deck, result.id, result.fetchedAt))
    } catch (error) {
      setMoxfieldError(error instanceof Error ? error.message : 'Could not load deck')
    } finally {
      setMoxfieldLoading(false)
    }
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
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="e.g. FIRE-LAPSE"
            />
          </label>
          <div className="cta-actions">
            <button type="submit" className="primary">
              Join room
            </button>
            <button type="button" className="ghost" onClick={onCreate}>
              Create new room
            </button>
            <button type="button" className="ghost" onClick={() => navigate('/room/SPECTATE')}>
              Spectate only
            </button>
          </div>
        </form>
        <div className="facts">
          <div className="fact">Authoritative server owns all randomness; clients send intent only.</div>
          <div className="fact">Deck hashes are stored so opponents can re-verify mid-game.</div>
          <div className="fact">Replays store actions + resolved effects to survive code changes.</div>
        </div>

        <div className="moxfield-card">
          <div>
            <p className="eyebrow">Moxfield</p>
            <h3>Load a deck once, keep it cached locally</h3>
            <p className="muted small">
              We use <code>moxfield-api</code> to fetch the list and persist the response in your browser. If cached,
              future loads skip touching moxfield.com.
            </p>
          </div>
          <form className="moxfield-form" onSubmit={onFetchMoxfield}>
            <input
              value={moxfieldInput}
              onChange={(e) => setMoxfieldInput(e.target.value)}
              placeholder="Paste a Moxfield deck URL or id (e.g. oEWXWHM5eEGMmopExLWRCA)"
            />
            <button type="submit" disabled={moxfieldLoading} className="primary">
              {moxfieldLoading ? 'Loading…' : 'Fetch & cache deck'}
            </button>
          </form>
          {moxfieldError ? <p className="muted small error-text">{moxfieldError}</p> : null}
          {moxfieldDeck ? (
            <div className="moxfield-result">
              <div>
                <p className="muted small">Deck id {moxfieldDeck.id}</p>
                <p className="moxfield-name">{moxfieldDeck.name}</p>
                <p className="muted small">
                  {moxfieldDeck.commanders.length ? `Commander: ${moxfieldDeck.commanders.join(', ')}` : 'Commander not set'}
                </p>
              </div>
              <div className="moxfield-meta">
                <span className="badge">{moxfieldDeck.mainboardCount} mainboard cards</span>
                <span className="badge ghost">Cached now · persists in localStorage</span>
              </div>
            </div>
          ) : null}
        </div>
      </header>
    </div>
  )
}

function Board({
  theme,
  setTheme,
}: {
  theme: 'vintage' | 'modern'
  setTheme: (t: 'vintage' | 'modern') => void
}) {
  const { roomCode } = useParams<{ roomCode: string }>()
  const [handOpen, setHandOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeOpponentId, setActiveOpponentId] = useState<string | null>(null)
  const [openZones, setOpenZones] = useState<Record<string, boolean>>({})
  const clientState = useClientState()
  const snapshot = clientState.snapshot
  const opponents = snapshot?.players.slice(1) ?? []
  const hero = snapshot?.players[0]

  useEffect(() => {
    if (roomCode) {
      client.joinRoom(roomCode)
    }
  }, [roomCode])

  useEffect(() => {
    document.body.classList.toggle('theme-modern', theme === 'modern')
  }, [theme])

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

  useEffect(() => {
    if (opponents.length && (!activeOpponentId || !opponents.some((opp) => opp.id === activeOpponentId))) {
      setActiveOpponentId(opponents[0].id)
    }
  }, [opponents, activeOpponentId])

  if (!snapshot) {
    return (
      <div className={`app theme-${theme}`}>
        <header className="hero">
          <h1>Loading room…</h1>
          <p className="muted">
            Connecting to websocket server at {wsUrl}... ({clientState.status})
          </p>
          {clientState.lastError ? <p className="muted">Error: {clientState.lastError}</p> : null}
        </header>
      </div>
    )
  }

  if (!hero) {
    return (
      <div className={`app theme-${theme}`}>
        <header className="hero">
          <h1>Waiting for players…</h1>
          <p className="muted">Room {roomCode}</p>
        </header>
      </div>
    )
  }

  const activeOpponent =
    opponents.find((opponent) => opponent.id === activeOpponentId) ?? opponents[0] ?? null
  const activeOpponentZones = activeOpponent ? groupByZone[activeOpponent.name] || {} : {}
  const activeOpponentBattlefield = activeOpponentZones.battlefield || []
  const activeOpponentStack = activeOpponentZones.stack || []
  const activeOpponentYard = activeOpponentZones.graveyard || []
  const activeOpponentExile = activeOpponentZones.exile || []
  const activeOpponentCom = activeOpponentZones.commander?.[0]
  const heroZones = groupByZone[hero.name] || {}
  const heroBattlefield = heroZones.battlefield || []
  const heroHand = heroZones.hand || []
  const heroCom = heroZones.commander?.[0]
  const heroYard = heroZones.graveyard || []
  const heroExile = heroZones.exile || []

  const toggleZones = (opponentId: string) => {
    setOpenZones((prev) => ({ ...prev, [opponentId]: !prev[opponentId] }))
  }

  return (
    <div className={`app theme-${theme}`}>
      <div className="board-shell">
        <main className="content">
          <section className="panel playmat">
            <div className="tabletop">
              {activeOpponent ? (
                <div className="opponent-view">
                  <div className="opponent-tabs">
                    {opponents.slice(0, 3).map((opponent) => (
                      <button
                        key={opponent.id}
                        className={`opponent-tab ${activeOpponent.id === opponent.id ? 'active' : ''}`}
                        onClick={() => setActiveOpponentId(opponent.id)}
                        type="button"
                      >
                        <span className="opponent-tab__name">{opponent.name}</span>
                        <span className="muted small">{opponent.commander}</span>
                      </button>
                    ))}
                  </div>

                  <div className="seat opponent compact">
                    <div className="seat__life small-life" style={{ borderColor: activeOpponent.color }}>
                      {activeOpponent.life}
                      <span>life</span>
                    </div>
                    <div className="seat__header">
                      <p className="player__meta">
                        <span className="eyebrow inline">{activeOpponent.status}</span>
                        <span className="player__name inline">{activeOpponent.name}</span>
                        <span className="muted small inline">{activeOpponent.deck}</span>
                        <span className="muted small inline">Commander {activeOpponent.commander}</span>
                      </p>
                      <button
                        className="zones-toggle"
                        type="button"
                        onClick={() => toggleZones(activeOpponent.id)}
                        aria-expanded={!!openZones[activeOpponent.id]}
                      >
                        Zones
                        <span className="material-symbols-rounded rail-icon">
                          {openZones[activeOpponent.id] ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    </div>
                    <div className="seat__zones single-column">
                      <div className="battlefield">
                        <CardList cards={activeOpponentBattlefield} />
                        {activeOpponentStack.length ? (
                          <div className="stack-callout">
                            <p className="zone__label">Stack</p>
                            <CardList cards={activeOpponentStack} compact />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className={`zone-dropdown ${openZones[activeOpponent.id] ? 'open' : ''}`}>
                      <div className="pile-row">
                        <ZonePile label="Library" count={60} variant="deck" />
                        <ZonePile label="Commander" topCard={activeOpponentCom?.name} variant="commander" />
                        <ZonePile label="Exile" topCard={activeOpponentExile[0]?.name} variant="exile" />
                        <ZonePile label="Graveyard" topCard={activeOpponentYard[0]?.name} variant="yard" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="seat hero">
                <div className="seat__life" style={{ borderColor: hero.color }}>
                  {hero.life}
                  <span>life</span>
                </div>
                <div className="seat__header">
                  <p className="player__meta">
                    <span className="eyebrow inline">{hero.status}</span>
                    <span className="player__name inline">{hero.name}</span>
                    <span className="muted small inline">{hero.deck}</span>
                    <span className="muted small inline">Commander {hero.commander}</span>
                  </p>
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
        </main>

        <aside className={`side-drawer ${sidebarOpen ? 'open' : ''}`}>
          <div className="side-drawer__body">
            <div className="side-drawer__section">
              <div className="side-drawer__section-header">
                <p className="eyebrow">Room</p>
                <span className={`chip ${clientState.status === 'open' ? '' : 'ghost-chip'}`}>
                  {clientState.status === 'open' ? 'Live websocket' : 'Offline'}
                </span>
              </div>
              <h3 className="room-code">{roomCode}</h3>
              <p className="muted small">Seed {snapshot.seed}</p>
            </div>

            <div className="side-drawer__section">
              <div className="side-drawer__section-header">
                <p className="eyebrow">Settings</p>
              </div>
              <div className="chips">
                <span className="chip">Stub cards</span>
                <span className="chip">Commander ready</span>
              </div>
              <div className="theme-toggle compact">
                <span>Theme</span>
                <div className="toggle-switch" role="group" aria-label="Choose theme">
                  {(['vintage', 'modern'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={option === theme ? 'active' : ''}
                      onClick={() => setTheme(option)}
                    >
                      {option === 'vintage' ? 'Vintage' : 'Modern'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="side-drawer__section chat-panel">
              <div className="side-drawer__section-header">
                <p className="eyebrow">Chat</p>
                <span className="chip ghost-chip">Read only</span>
              </div>
              <div className="chat-window">
                <p className="muted small">Chat UI placeholder. Share quick notes with your table.</p>
              </div>
            </div>

            <div className="side-drawer__section log-panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Replay stream</p>
                  <h3>Action log</h3>
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
            </div>
          </div>
        </aside>

        <div className="mini-rail">
          <button
            className="rail-btn"
            type="button"
            aria-label={sidebarOpen ? 'Hide panel' : 'Show panel'}
            data-tooltip={sidebarOpen ? 'Hide panel' : 'Show panel'}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <span className="material-symbols-rounded rail-icon">
              {sidebarOpen ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
          <button className="rail-btn draw" type="button" aria-label="Draw card" data-tooltip="Draw card">
            <span className="material-symbols-rounded rail-icon">auto_stories</span>
          </button>
          <button className="rail-btn" type="button" aria-label="Shuffle" data-tooltip="Shuffle">
            <span className="material-symbols-rounded rail-icon">shuffle</span>
          </button>
          <button className="rail-btn mulligan" type="button" aria-label="Mulligan" data-tooltip="Mulligan">
            <span className="material-symbols-rounded rail-icon">restart_alt</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState<'vintage' | 'modern'>('vintage')

  useEffect(() => {
    document.body.classList.toggle('theme-modern', theme === 'modern')
  }, [theme])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing theme={theme} setTheme={setTheme} />} />
        <Route path="/room/:roomCode" element={<Board theme={theme} setTheme={setTheme} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
