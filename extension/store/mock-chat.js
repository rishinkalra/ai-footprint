// A neutral chat page (no third-party branding) used for badge screenshots.
// It uses the same markup hooks as the real sites so the extension behaves normally.
function mockChat({ dark, roleAttr, history, prompt, reply, model, streamDelay = 1500 }) {
  const bg = dark ? '#1f1f1e' : '#ffffff';
  const ink = dark ? '#ecebe6' : '#1d1d1b';
  const muted = dark ? '#a3a29b' : '#6b6a66';
  const bubble = dark ? '#2f2f2d' : '#f1f1ef';
  const line = dark ? '#33332f' : '#e7e6e2';
  const userAttr = roleAttr === 'claude' ? 'data-testid="user-message"' : 'data-message-author-role="user"';
  const asstAttr = roleAttr === 'claude' ? 'data-is-streaming="false"' : 'data-message-author-role="assistant"';
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const hist = history.map(([role, text]) => role === 'user'
    ? `<div class="u"><div ${userAttr}>${esc(text)}</div></div>`
    : `<div class="a" ${asstAttr}>${esc(text)}</div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;background:${bg};color:${ink};font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;height:100vh;display:flex;flex-direction:column}
  header{height:56px;display:flex;align-items:center;padding:0 20px;gap:10px;border-bottom:1px solid ${line};color:${muted};font-size:14px}
  header b{color:${ink};font-weight:600}
  main{flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}
  .col{width:min(720px,92%);margin:0 auto;padding:24px 0 12px;display:flex;flex-direction:column;gap:22px}
  .u{display:flex;justify-content:flex-end}.u>div{background:${bubble};padding:10px 16px;border-radius:18px;max-width:70%}
  .a{max-width:100%;white-space:pre-wrap}
  .hist{max-height:0;overflow:hidden}
  footer{padding:12px 0 28px}.box{width:min(720px,92%);margin:0 auto;border:1px solid ${line};border-radius:24px;padding:14px 18px;color:${muted};display:flex;justify-content:space-between;align-items:center}
  .send{width:34px;height:34px;border-radius:999px;background:${ink};opacity:.85}
  </style></head><body>
  <header><b>Chat</b> · Assistant</header>
  <main><div class="col" id="chat"><div class="hist">${hist}</div></div></main>
  <footer><div class="box"><span>Ask anything</span><span class="send"></span></div></footer>
  <script>
  const chat=document.getElementById('chat');
  setTimeout(()=>{
    const u=document.createElement('div');u.className='u';const ud=document.createElement('div');
    ${roleAttr === 'claude' ? "ud.setAttribute('data-testid','user-message')" : "ud.setAttribute('data-message-author-role','user')"};
    ud.textContent=${JSON.stringify(prompt)};u.appendChild(ud);chat.appendChild(u);
    const a=document.createElement('div');a.className='a';
    ${roleAttr === 'claude' ? "a.setAttribute('data-is-streaming','true')" : "a.setAttribute('data-message-author-role','assistant')"};
    ${model ? `a.setAttribute('data-message-model-slug', ${JSON.stringify(model)});` : ''}
    chat.appendChild(a);
    const words=${JSON.stringify(reply)}.split(' ');let i=0;
    const t=setInterval(()=>{a.textContent+=(i?' ':'')+words[i++]; if(i>=words.length){clearInterval(t);a.setAttribute('data-is-streaming','false');}},25);
  }, ${streamDelay});
  </script></body></html>`;
}
module.exports = { mockChat };
