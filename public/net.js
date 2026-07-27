// Couche réseau : WebSocket + reconnexion automatique avec backoff.
export function createNet({ onMessage, onStatus }) {
  let ws = null;
  let ferme = false;
  let tentative = 0;
  let fileAttente = [];

  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

  function connecter() {
    onStatus && onStatus('connecting');
    ws = new WebSocket(url);

    ws.onopen = () => {
      tentative = 0;
      onStatus && onStatus('open');
      // On vide la file des messages en attente.
      const f = fileAttente; fileAttente = [];
      for (const m of f) envoyer(m);
    };

    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      onMessage && onMessage(msg);
    };

    ws.onclose = () => {
      onStatus && onStatus('closed');
      if (ferme) return;
      // Reconnexion avec délai croissant plafonné.
      tentative++;
      const delai = Math.min(500 * tentative, 5000);
      setTimeout(() => { if (!ferme) connecter(); }, delai);
    };

    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  function envoyer(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    } else {
      fileAttente.push(obj);
    }
  }

  connecter();
  return {
    send: envoyer,
    close() { ferme = true; try { ws && ws.close(); } catch {} },
    estOuvert() { return ws && ws.readyState === WebSocket.OPEN; },
  };
}
