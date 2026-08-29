import { useEffect, useState } from 'react';
import Card from './Card';
import Timer from './Timer';
import RoundEndOverlay from './RoundEndOverlay';
import GameEndOverlay from './GameEndOverlay';
import RpsPanel from './RpsPanel';
import InstructionsOverlay from './InstructionsOverlay';
import { handValue } from '../gameRules';

export default function Table({ room, game, hand, playerId, onDiscard, onDraw, onCall, onNextRound, onRpsChoice, error }) {
  const [selected, setSelected] = useState(() => new Set());
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    setSelected(new Set());
  }, [game.phase, game.roundNumber]);

  if (game.phase === 'rps') {
    return (
      <>
        <RpsPanel room={room} game={game} playerId={playerId} onChoose={onRpsChoice} />
        <button type="button" className="icon-button how-to-play-fab" onClick={() => setShowInstructions(true)} title="How to Play">
          ?
        </button>
        {showInstructions && <InstructionsOverlay onClose={() => setShowInstructions(false)} />}
      </>
    );
  }

  const isMyTurn = game.currentPlayerId === playerId;
  const myValue = handValue(hand);
  const canDiscard = isMyTurn && game.phase === 'discard' && selected.size > 0;
  const canCall = isMyTurn && game.phase === 'discard' && myValue <= 5;
  const canDraw = isMyTurn && game.phase === 'draw';
  const pickableGroup = game.pickableGroup || [];
  const pendingGroup = game.pendingGroup || [];

  function toggleCard(id) {
    if (!isMyTurn || game.phase !== 'discard') return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitDiscard() {
    onDiscard(Array.from(selected));
  }

  return (
    <div className="table">
      <div className="table-header">
        <div>
          Room <strong>{room.code}</strong> &middot; Round {game.roundNumber}
        </div>
        {(game.phase === 'discard' || game.phase === 'draw') && (
          <div className="turn-banner">
            {isMyTurn ? 'Your turn' : `${room.seats.find((s) => s.id === game.currentPlayerId)?.name}'s turn`} &middot;{' '}
            <Timer deadline={game.turnDeadline} />
          </div>
        )}
      </div>

      <div className="scoreboard">
        {game.players.map((p) => (
          <div key={p.id} className={`score-chip ${p.id === game.currentPlayerId ? 'score-chip-active' : ''}`}>
            <span className="score-name">
              {p.name}
              {!p.connected && ' (offline)'}
            </span>
            <span className="score-cards">{p.handCount} cards</span>
            <span className="score-total">{p.score} pts</span>
          </div>
        ))}
      </div>

      <div className="piles">
        <div className="pile">
          <div className="pile-label">Draw pile ({game.drawPileCount})</div>
          <Card faceDown large disabled={!canDraw} onClick={() => onDraw('pile')} />
        </div>

        <div className="pile">
          <div className="pile-label">
            Discard pile{pickableGroup.length > 1 ? ` — pick any of ${pickableGroup.length}` : ''}
          </div>
          <div className="discard-stack">
            {pickableGroup.length > 0 ? (
              <div className={`discard-group ${pickableGroup.length > 1 ? 'discard-group-meld' : ''}`}>
                {pickableGroup.map((c) => (
                  <Card key={c.id} card={c} large disabled={!canDraw} onClick={() => onDraw('discard', c.id)} />
                ))}
              </div>
            ) : (
              <Card faceDown large disabled />
            )}
            {pendingGroup.length > 0 && (
              <div className="discard-pending" title="Just discarded — not yours to draw back">
                {pendingGroup.map((c) => (
                  <Card key={c.id} card={c} large disabled />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="hand-area">
        <div className="hand-label">
          Your hand (value {myValue}
          {myValue <= 5 ? ' — call eligible' : ''})
        </div>
        <div className="hand">
          {hand.map((c) => (
            <Card
              key={c.id}
              card={c}
              large
              selected={selected.has(c.id)}
              disabled={!isMyTurn || game.phase !== 'discard'}
              onClick={() => toggleCard(c.id)}
            />
          ))}
        </div>
      </div>

      <div className="action-bar">
        <button type="button" className="primary" disabled={!canDiscard} onClick={submitDiscard}>
          Discard Selected
        </button>
        <button type="button" className="call-button" disabled={!canCall} onClick={onCall}>
          Call!
        </button>
      </div>

      {game.phase === 'round_end' && (
        <RoundEndOverlay game={game} room={room} playerId={playerId} onNextRound={onNextRound} />
      )}
      {game.phase === 'game_end' && <GameEndOverlay game={game} room={room} playerId={playerId} />}

      <button type="button" className="icon-button how-to-play-fab" onClick={() => setShowInstructions(true)} title="How to Play">
        ?
      </button>
      {showInstructions && <InstructionsOverlay onClose={() => setShowInstructions(false)} />}
    </div>
  );
}
