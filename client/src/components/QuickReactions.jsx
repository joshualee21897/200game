// Kept in sync with REACTION_EMOJIS in server/src/index.js - the server
// rejects anything outside this set, so the two lists must match.
const REACTIONS = ['👍', '😂', '😮', '😡', '🔥', '🎉', '🤔', '👏'];

export default function QuickReactions({ onReact }) {
  return (
    <div className="quick-reactions">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="quick-reaction-button"
          onClick={() => onReact(emoji)}
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
