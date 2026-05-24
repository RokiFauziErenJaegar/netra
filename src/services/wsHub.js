'use strict';

const { WebSocketServer } = require('ws');
const logger = require('../logger');

/**
 * WebSocket hub berbasis topic.
 * Client connect ke /ws?topic=dashboard, /ws?topic=rumah, dll.
 * Server broadcast pesan ke seluruh client yang subscribe topic itu.
 *
 * Desain ini hemat memori: hanya ada satu WS server, satu Set per topic.
 */
class WsHub {
  constructor() {
    this.wss = null;
    this.subscribers = new Map(); // topic -> Set<WebSocket>
  }

  attach(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url, 'http://x');
      const topic = url.searchParams.get('topic') || 'default';
      this._subscribe(topic, ws);
      logger.debug({ topic, total: this._countTopic(topic) }, 'ws client connected');

      ws.on('close', () => {
        this._unsubscribe(topic, ws);
        logger.debug({ topic, total: this._countTopic(topic) }, 'ws client disconnected');
      });

      ws.on('error', () => {
        this._unsubscribe(topic, ws);
      });

      try {
        ws.send(JSON.stringify({ type: 'welcome', topic, time: new Date().toISOString() }));
      } catch (e) {
        /* ignore */
      }
    });

    logger.info('WebSocket hub attached at /ws');
  }

  _subscribe(topic, ws) {
    if (!this.subscribers.has(topic)) this.subscribers.set(topic, new Set());
    this.subscribers.get(topic).add(ws);
  }

  _unsubscribe(topic, ws) {
    const set = this.subscribers.get(topic);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.subscribers.delete(topic);
    }
  }

  _countTopic(topic) {
    const set = this.subscribers.get(topic);
    return set ? set.size : 0;
  }

  broadcast(topic, payload) {
    const set = this.subscribers.get(topic);
    if (!set || set.size === 0) return 0;
    const msg = JSON.stringify({ type: 'update', topic, time: new Date().toISOString(), data: payload });
    let sent = 0;
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(msg);
          sent++;
        } catch (e) {
          /* ignore individual send errors */
        }
      }
    }
    return sent;
  }

  topics() {
    return Array.from(this.subscribers.keys()).map((t) => ({ topic: t, clients: this._countTopic(t) }));
  }
}

module.exports = new WsHub();
