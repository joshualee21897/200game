import { useEffect, useRef, useState } from 'react';

// Rendered once at the App level (not inside Table/WaitingRoom) so it's
// available in both the lobby and the active game without duplicating the
// toggle button and panel in two places.
export default function ChatPanel({ messages, playerId, onSend }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const seenCountRef = useRef(messages.length);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      seenCountRef.current = messages.length;
      setUnread(0);
    } else if (messages.length > seenCountRef.current) {
      setUnread(messages.length - seenCountRef.current);
    }
  }, [messages.length, open]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <>
      <button type="button" className="icon-button chat-fab" onClick={() => setOpen(true)} title="Chat">
        💬
        {unread > 0 && (
          <span className="chat-unread-badge" aria-label={`${unread} unread messages`}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="overlay-panel chat-panel" onClick={(e) => e.stopPropagation()}>
            <div className="instructions-header">
              <h2>Chat</h2>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close chat">
                &times;
              </button>
            </div>

            <div className="chat-message-list" ref={listRef}>
              {messages.length === 0 ? (
                <p className="subtitle">No messages yet - say hi!</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`chat-message ${m.playerId === playerId ? 'chat-message-you' : ''}`}>
                    <span className="chat-message-name">{m.name}</span>
                    <span className="chat-message-text">{m.text}</span>
                  </div>
                ))
              )}
            </div>

            <form className="chat-input-row" onSubmit={handleSubmit}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Say something…"
                maxLength={300}
              />
              <button type="submit" className="primary" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
