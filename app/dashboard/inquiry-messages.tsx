
'use client';

import { useCallback, useEffect, useState } from 'react';

type Message = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  sender: {
    name: string;
  };
};

export default function InquiryMessages({
  inquiryId,
}: {
  inquiryId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  const loadMessages = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/messages?inquiryId=${encodeURIComponent(inquiryId)}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Unable to load messages');
      }

      const data: Message[] = await response.json();
      setMessages(data);
      setError('');
    } catch {
      setError('Unable to load messages. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [inquiryId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages, refreshCount]);

  async function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!body.trim() || sending) return;

    setSending(true);
    setError('');

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inquiryId,
          body: body.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to send message');
      }

      setBody('');
      await loadMessages();
    } catch {
      setError('Message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      style={{
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: '1px solid #ddd',
      }}
    >
      <h3>Private messages</h3>

      {loading ? (
        <p>Loading messages...</p>
      ) : messages.length === 0 ? (
        <p>No messages yet. Start the conversation below.</p>
      ) : (
        <div
          style={{
            maxHeight: '300px',
            overflowY: 'auto',
            marginBottom: '16px',
          }}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                padding: '12px',
                marginBottom: '8px',
                background: '#f3f6f8',
                borderRadius: '8px',
              }}
            >
              <strong>{message.sender.name}</strong>

              <p style={{ margin: '6px 0' }}>
                {message.body}
              </p>

              <small>
                {new Date(message.createdAt).toLocaleString()}
              </small>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={sendMessage}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a private message..."
          maxLength={2000}
          rows={3}
          required
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '8px',
          }}
        />

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            disabled={sending || !body.trim()}
          >
            {sending ? 'Sending...' : 'Send message'}
          </button>

          <button
            type="button"
            onClick={() => setRefreshCount((count) => count + 1)}
            disabled={loading || sending}
          >
            Refresh messages
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}
    </section>
  );
}
