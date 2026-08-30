import { useEffect, useRef, useState } from 'react';
import Card from './Card';
import Timer from './Timer';
import RoundEndOverlay from './RoundEndOverlay';
import GameEndOverlay from './GameEndOverlay';
import RpsPanel from './RpsPanel';
import InstructionsOverlay from './InstructionsOverlay';
import ScoreHistoryOverlay from './ScoreHistoryOverlay';
import { handValue } from '../gameRules';
import {
  isMuted,
  setMuted,
  playDraw,
  playDiscard,
  playRoundEnd,
  playGameWin,
  playChoice,
  playWrongCall,
  playMilestone,
  playBust,
  playYourTurn,
} from '../sound';

export default function Table({ room, game, hand, playerId, onDiscard, onDraw, onCall, onNextRound, onRpsChoice, error }) {
  const [selected, setSelected] = useState(() => new Set());
  const [showInstructions, setShowInstructions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [muted, setMutedState] = useState(() => isMuted());
  const [showTurnPopup, setShowTurnPopup] = useState(false);
  const prevPhaseRef = useRef(game.phase);
  const prevCurrentPlayerRef = useRef(game.currentPlayerId);
  const prevRoundRef = useRef(game.roundNumber);

  useEffect(() => {
    setSelected(new Set());
  }, [game.phase, game.roundNumber]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = game.phase;
    if (prev === game.phase) return;
    if (prev === 'draw' && game.phase === 'discard') playDraw();
    else if (prev === 'discard' && game.phase === 'draw') playDiscard();
    if (game.phase === 'round_end' && prev !== 'round_end') {
      if (game.roundResult?.outcome === 'wrong_call') playWrongCall();
      else playRoundEnd();
      if (game.roundResult?.milestoneHitPlayerIds?.length > 0) playMilestone();
    }
    if (game.phase === 'game_end' && prev !== 'game_end') {
      if (game.finalResult?.bustedPlayerId === playerId) playBust();
      else playGameWin();
    }
  }, [game.phase]);

  useEffect(() => {
    // Pops up a big "Your Turn!" banner the moment the turn actually
    // changes to you - not just whenever isMyTurn happens to be true on a
    // render (that would also fire on a page reload/reconnect landing
    // mid-turn, which would be annoying). Also fires on a new round
    // starting with you again, since currentPlayerId can otherwise be
    // unchanged across a round_end -> next-round transition (you called
    // and won, then also opened the next round).
    const prevPlayer = prevCurrentPlayerRef.current;
    const prevRound = prevRoundRef.current;
    prevCurrentPlayerRef.current = game.currentPlayerId;
    prevRoundRef.current = game.roundNumber;

    const isMyTurnNow = game.currentPlayerId === playerId && (game.phase === 'discard' || game.phase === 'draw');
    if (!isMyTurnNow) return;
    if (prevPlayer === game.currentPlayerId && prevRound === game.roundNumber) return;

    playYourTurn();
    setShowTurnPopup(true);
    const t = setTimeout(() => setShowTurnPopup(false), 1600);
    return () => clearTimeout(t);
  }, [game.currentPlayerId, game.phase, game.roundNumber, playerId]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  function handleRpsChoose(move) {
    playChoice();
    onRpsChoice(move);
  }

  const soundButtons = (
    <>
      <button
        type="button"
        className="icon-button mute-fab"
        onClick={toggleMute}
        title={muted ? 'Unmute sound' : 'Mute sound'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <button type="button" className="icon-button how-to-play-fab" onClick={() => setShowInstructions(true)} title="How to Play">
        ?
      </button>
      {showInstructions && <InstructionsOverlay onClose={() => setShowInstructions(false)} />}
    </>
  );

  if (game.phase === 'rps') {
    return (
      <>
        <RpsPanel room={room} game={game} playerId={playerId} onChoose={handleRpsChoose} error={error} />
        {soundButtons}
      </>
    );
  }

  const isMyTurn = game.currentPlayerId === playerId;
  const showMyTurnGlow = isMyTurn && (game.phase === 'discard' || game.phase === 'draw');
  const myValue = handValue(hand);
  const canDiscard = isMyTurn && game.phase === 'discard' && selected.size > 0;
  const canCall = isMyTurn && game.phase === 'discard' && myValue <= 5;
  const canDraw = isMyTurn && game.phase === 'draw';
  const pickableGroup = game.pickableGroup || [];
  const pendingGroup = game.pendingGroup || [];
  // A faded, fanned-out peek at the most recently buried discards - purely
  // decorative (not pickable), just so the pile doesn't look like it resets
  // to empty every turn and it's easy to tell a draw came from here vs. the
  // face-down pile.
  const shownIds = new Set([...pickableGroup, ...pendingGroup].map((c) => c.id));
  const historyCards = (game.discardPile || []).filter((c) => !shownIds.has(c.id)).slice(-3);

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
    <div className={`table ${showMyTurnGlow ? 'table-my-turn' : ''}`}>
      {showTurnPopup && (
        <div className="your-turn-popup" aria-hidden="true">
          <span>Your Turn!</span>
        </div>
      )}
      <div className="table-header">
        <div>
          Room <strong>{room.code}</strong> &middot; Round {game.roundNumber}
        </div>
        <div className="table-header-right">
          {(game.phase === 'discard' || game.phase === 'draw') && (
            <div className="turn-banner">
              {isMyTurn ? 'Your turn' : `${room.seats.find((s) => s.id === game.currentPlayerId)?.name}'s turn`} &middot;{' '}
              <Timer deadline={game.turnDeadline} />
            </div>
          )}
          <button
            type="button"
            className="icon-button history-button"
            onClick={() => setShowHistory(true)}
            title="Score history"
          >
            📜
          </button>
        </div>
      </div>

      {showHistory && <ScoreHistoryOverlay game={game} room={room} onClose={() => setShowHistory(false)} />}

      <div className="scoreboard">
        {game.players.map((p) => (
          <div key={p.id} className={`score-chip ${p.id === game.currentPlayerId ? 'score-chip-active' : ''}`}>
            <span className="score-name">
              {p.isBot && '🤖 '}
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
            {historyCards.length > 0 && (
              <div className="discard-history" aria-hidden="true">
                {historyCards.map((c) => (
                  <Card key={c.id} card={c} large />
                ))}
              </div>
            )}
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

      {soundButtons}
    </div>
  );
}
