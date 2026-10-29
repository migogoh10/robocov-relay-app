// Robocov relay: one Durable Object per room code. Everyone who connects to the same room
// receives each other's messages. No game logic lives here, it just forwards.
export class Room {
  constructor(state, env) { this.socks = new Map(); }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Robocov relay room', { status: 200 });
    const url = new URL(req.url);
    const id = (url.searchParams.get('id') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || crypto.randomUUID();
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    const old = this.socks.get(id);
    if (old) { try { old.close(1000, 'replaced'); } catch (e) {} }
    try { server.send(JSON.stringify({ t: 'peers', ids: [...this.socks.keys()].filter(k => k !== id) })); } catch (e) {}
    for (const [k, s] of this.socks) if (k !== id) { try { s.send(JSON.stringify({ t: 'join', id })); } catch (e) {} }
    this.socks.set(id, server);
    server.addEventListener('message', ev => {
      if (typeof ev.data !== 'string' || ev.data.length > 60000) return;
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || m.t === 'ping') return;
      const out = JSON.stringify({ t: 'msg', from: id, d: m.d });
      if (m.to) { const s = this.socks.get(m.to); if (s) { try { s.send(out); } catch (e) {} } }
      else for (const [k, s] of this.socks) if (k !== id) { try { s.send(out); } catch (e) {} }
    });
    const bye = () => {
      if (this.socks.get(id) === server) {
        this.socks.delete(id);
        for (const s of this.socks.values()) { try { s.send(JSON.stringify({ t: 'leave', id })); } catch (e) {} }
      }
    };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client });
  }
}

const TEST = `<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px monospace;background:#071426;color:#d6ecff;padding:16px"><h3>Robocov relay test</h3><pre id=o>Testing...
</pre><script>
const o=document.getElementById('o'),log=t=>o.textContent+=t+'\\n';
fetch('/?room=t&check=1').then(r=>r.text()).then(t=>log('Room object: '+t)).catch(e=>log('Room object FAILED: '+e));
try{const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/?room=test&id=tester'+Math.floor(Math.random()*1e6));
ws.onopen=()=>log('WebSocket: OPEN (works!)');ws.onmessage=e=>log('Server said: '+String(e.data).slice(0,80));
ws.onclose=e=>log('WebSocket closed, code '+e.code);ws.onerror=()=>log('WebSocket error');
setTimeout(()=>log('After 6 seconds, state='+ws.readyState+' (1 = open)'),6000)}catch(e){log('WebSocket exception: '+e)}
</script>`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/test') return new Response(TEST, { headers: { 'content-type': 'text/html;charset=utf-8' } });
    if (url.searchParams.get('check')) return env.ROOMS.get(env.ROOMS.idFromName('check')).fetch(req);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Robocov relay is running', { headers: { 'access-control-allow-origin': '*' } });
    const room = (url.searchParams.get('room') || 'lobby').slice(0, 100);
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
  }
};
