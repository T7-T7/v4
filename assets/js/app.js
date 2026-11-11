/* Pix AI frontend connected to the original Gemini scraper engine. */
(function () {
  'use strict';

  var MODELS = ['Gemini Fast', 'Gemini Deep'];
  var STORE = 'pix-ai-v1';

  var T = {
    en: {
      newChat: 'New chat', side: 'Side by side', battle: 'Battle', direct: 'Direct',
      h1: 'Pix AI Assistant', sub: 'Send a prompt to Gemini in two response styles: fast and detailed.',
      ph: 'Ask anything…', phFollow: 'Ask a follow-up…', send: 'Send', stop: 'Stop',
      modelA: 'Model A', modelB: 'Model B', model: 'Model', recent: 'Recent', none: 'No chats yet', del: 'Delete chat',
      vote: 'Which answer is better?', a: 'A is better', b: 'B is better', tie: 'Tie', bad: 'Both are bad',
      saved: 'Vote saved on this device.', revealed: 'Models: ', sources: 'Sources', searching: 'Searching…',
      offline: 'Connected to the original Gemini engine.', theme: 'Theme', lang: 'العربية', menu: 'Menu',
      hidA: 'Assistant A', hidB: 'Assistant B', stopped: '(stopped)',
      ex: ['What changed in the latest web standards?', 'Compare two ways to cache API responses', 'Summarize this week in open-source news']
    },
    ar: {
      newChat: 'محادثة جديدة', side: 'جنب إلى جنب', battle: 'مواجهة', direct: 'مباشر',
      h1: 'مساعد Pix الذكي', sub: 'اسأل Gemini بأسلوبين للرد: سريع ومفصّل.',
      ph: 'اسأل أي حاجة…', phFollow: 'اسأل سؤال تاني…', send: 'إرسال', stop: 'إيقاف',
      modelA: 'النموذج A', modelB: 'النموذج B', model: 'النموذج', recent: 'الأخيرة', none: 'مفيش محادثات لسه', del: 'احذف المحادثة',
      vote: 'أنهي إجابة أحسن؟', a: 'A أحسن', b: 'B أحسن', tie: 'تعادل', bad: 'الاتنين وحشين',
      saved: 'تم حفظ تصويتك على الجهاز.', revealed: 'النماذج: ', sources: 'المصادر', searching: 'جاري البحث…',
      offline: 'متصل بمحرك Gemini الحقيقي عبر خادم Pix.', theme: 'المظهر', lang: 'English', menu: 'القائمة',
      hidA: 'المساعد A', hidB: 'المساعد B', stopped: '(اتوقف)',
      ex: ['إيه الجديد في معايير الويب؟', 'قارن بين طريقتين لتخزين ردود الـ API مؤقتاً', 'لخّص أخبار المصادر المفتوحة الأسبوع ده']
    }
  };

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var state = { lang: 'en', mode: 'side', a: MODELS[0], b: MODELS[1], single: MODELS[0], chats: [], cur: null, busy: false, timers: [], controller: null, requestId: 0 };

  /* ---------- storage (guarded) ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) { var d = JSON.parse(raw); if (d && typeof d === 'object') { state.chats = d.chats || []; state.chats.forEach(function (c) { if (!c.sessions) c.sessions = {}; }); state.lang = d.lang || state.lang; if (d.mode) state.mode = d.mode; if (MODELS.indexOf(d.a) !== -1) state.a = d.a; if (MODELS.indexOf(d.b) !== -1) state.b = d.b; if (MODELS.indexOf(d.single) !== -1) state.single = d.single; } }
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ chats: state.chats.slice(0, 50), lang: state.lang, mode: state.mode, a: state.a, b: state.b, single: state.single })); } catch (e) {}
  }
  function themeInit() {
    var t = null; try { t = localStorage.getItem('pix-ai-theme'); } catch (e) {}
    if (!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    setTheme(t);
  }
  function setTheme(t) {
    root.classList.toggle('dark', t === 'dark'); root.classList.toggle('light', t !== 'dark');
    try { localStorage.setItem('pix-ai-theme', t); } catch (e) {}
  }

  /* ---------- helpers ---------- */
  function tr(k) { return T[state.lang][k]; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function isAr(s) { return /[\u0600-\u06FF]/.test(s); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200); }
  function curChat() { for (var i = 0; i < state.chats.length; i++) if (state.chats[i].id === state.cur) return state.chats[i]; return null; }

  /* ---------- Gemini engine ---------- */
  function instructionFor(model) {
    if (model === 'Gemini Deep') {
      return 'أنت مساعد Pix الذكي. حلّل السؤال بعمق، تحقّق من التفاصيل، اشرح الأسباب والخطوات، ولا تختلق معلومات أو مصادر. أجب بلغة المستخدم.';
    }
    return 'أنت مساعد Pix الذكي. أجب مباشرة وبدقة، وابحث في الويب عند الحاجة عبر قدرات Gemini المتاحة. لا تختلق معلومات أو مصادر. أجب بلغة المستخدم.';
  }
  function renderMarkdown(target, source) {
    target.replaceChildren();
    var lines=String(source||'').replace(/\r/g,'').split('\n'), i=0, list=null;
    function inline(parent,s){
      var re=/(\x60[^\x60]+\x60|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g, last=0,m;
      while((m=re.exec(s))){if(m.index>last)parent.appendChild(document.createTextNode(s.slice(last,m.index)));
        var t=m[0],n;if(t.charAt(0)==='\x60')n=el('code','md-inline-code',t.slice(1,-1));else if(t.slice(0,2)==='**')n=el('strong',null,t.slice(2,-2));else n=el('em',null,t.slice(1,-1));parent.appendChild(n);last=re.lastIndex;}
      if(last<s.length)parent.appendChild(document.createTextNode(s.slice(last)));
    }
    while(i<lines.length){var s=lines[i].trim();if(!s){list=null;i++;continue;}
      var h=s.match(/^(#{1,4})\s+(.+)$/);if(h){var hn=el('h'+h[1].length,'md-heading');inline(hn,h[2]);target.appendChild(hn);list=null;i++;continue;}
      if(/^\x60\x60\x60/.test(s)){var code=[];i++;while(i<lines.length&&!/^\x60\x60\x60/.test(lines[i].trim()))code.push(lines[i++]);i++;var pre=el('pre','md-code'),co=el('code');co.textContent=code.join('\n');pre.appendChild(co);target.appendChild(pre);list=null;continue;}
      var ordered=/^\d+\. /.test(s),bullet=/^[-*+] /.test(s);if(ordered||bullet){var tag=ordered?'ol':'ul';if(!list||list.tagName.toLowerCase()!==tag){list=el(tag,'md-list');target.appendChild(list);}var li=el('li');inline(li,s.replace(ordered?/^\d+\. /:/^[-*+] /,''));list.appendChild(li);i++;continue;}
      var q=s.match(/^>\s?(.*)$/);if(q){var bq=el('blockquote','md-quote');inline(bq,q[1]);target.appendChild(bq);list=null;i++;continue;}
      var p=el('p','md-paragraph');inline(p,s);target.appendChild(p);list=null;i++;
    }
  }
  function apiError(data, status) {
    return (data && (data.error || data.message)) || ('Gemini API HTTP ' + status);
  }

  /* ---------- icons ---------- */
  var ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    cols: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>',
    one: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="4" width="14" height="16" rx="2"/></svg>'
  };
  function icon(n) { var s = el('span'); s.innerHTML = ICON[n]; return s.firstChild; }

  /* ---------- static text / controls ---------- */
  function fillSelect(sel, value) {
    sel.innerHTML = '';
    MODELS.forEach(function (m) { var o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); });
    sel.value = value;
  }
  function applyLang() {
    root.lang = state.lang; root.dir = state.lang === 'ar' ? 'rtl' : 'ltr'; root.setAttribute('data-ui-dir', root.dir);
    $('newChatTxt').textContent = tr('newChat');
    $('mSide').textContent = tr('side'); $('mBattle').textContent = tr('battle'); $('mDirect').textContent = tr('direct');
    $('h1').textContent = tr('h1'); $('sub').textContent = tr('sub');
    $('recentLbl').textContent = tr('recent'); $('offlineNote').textContent = tr('offline');
    $('badge').textContent = state.lang === 'ar' ? 'Gemini متصل' : 'Gemini connected';
    $('langTxt').textContent = tr('lang'); $('themeTxt').textContent = tr('theme');
    $('menuBtn').setAttribute('aria-label', tr('menu'));
    $('selA').setAttribute('aria-label', tr('modelA')); $('selB').setAttribute('aria-label', tr('modelB')); $('selS').setAttribute('aria-label', tr('model'));
    $('send').setAttribute('aria-label', tr('send'));
    var chips = $('chips'); chips.innerHTML = '';
    tr('ex').forEach(function (q) { var b = el('button', 'ao-chip', q); b.type = 'button'; b.onclick = function () { $('prompt').value = q; autosize(); sync(); $('prompt').focus(); }; chips.appendChild(b); });
    $('prompt').placeholder = curChat() ? tr('phFollow') : tr('ph');
    renderHistory();
  }
  function applyMode() {
    ['side', 'battle', 'direct'].forEach(function (m) { $('m' + m.charAt(0).toUpperCase() + m.slice(1)).setAttribute('aria-pressed', String(state.mode === m)); });
    $('selA').classList.toggle('ao-hidden', state.mode !== 'side');
    $('selB').classList.toggle('ao-hidden', state.mode !== 'side');
    $('selS').classList.toggle('ao-hidden', state.mode !== 'direct');
  }
  function sync() { var has = $('prompt').value.trim().length > 0; var b = $('send'); if (state.busy) { b.disabled = false; b.innerHTML = ICON.stop; b.setAttribute('aria-label', tr('stop')); } else { b.disabled = !has; b.innerHTML = ICON.send; b.setAttribute('aria-label', tr('send')); } }
  function autosize() { var t = $('prompt'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }

  /* ---------- history ---------- */
  function renderHistory() {
    var box = $('hist'); box.innerHTML = '';
    if (!state.chats.length) { box.appendChild(el('div', 'ao-empty', tr('none'))); return; }
    state.chats.forEach(function (c) {
      var row = el('div', 'ao-hitem' + (c.id === state.cur ? ' on' : ''));
      var t = el('button', 't', c.title); t.type = 'button'; t.onclick = function () { openChat(c.id); closeSide(); };
      var x = el('button', 'x'); x.type = 'button'; x.setAttribute('aria-label', tr('del')); x.innerHTML = ICON.x;
      x.onclick = function (e) { e.stopPropagation(); state.chats = state.chats.filter(function (k) { return k.id !== c.id; }); if (state.cur === c.id) newChat(); save(); renderHistory(); };
      row.appendChild(t); row.appendChild(x); box.appendChild(row);
    });
  }

  /* ---------- conversation rendering ---------- */
  function clearTimers() { state.timers.forEach(clearTimeout); state.timers = []; }
  function showLanding(on) { $('landing').classList.toggle('ao-hidden', !on); $('conv').classList.toggle('ao-hidden', on); $('dock').classList.toggle('ao-hidden', on); }
  function composerHome(on) { var c = $('composer'); (on ? $('landingSlot') : $('dockSlot')).appendChild(c); }

  function paneNames(r) {
    if (r.mode === 'direct') return [r.models[0]];
    if (r.mode === 'battle' && !r.vote) return [tr('hidA'), tr('hidB')];
    return r.models.slice();
  }
  function renderRound(r, live) {
    var wrap = el('section', 'ao-round');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px';
    var q = el('div', 'ao-q', r.prompt); q.setAttribute('dir', 'auto'); wrap.appendChild(q);
    var panes = el('div', 'ao-panes'); panes.style.setProperty('--cols', r.mode === 'direct' ? 1 : 2);
    var names = paneNames(r); var bodies = []; var metas = [];
    r.answers.forEach(function (a, i) {
      var p = el('article', 'ao-pane');
      var h = el('div', 'ao-ph'); var n = el('div', 'ao-pn', names[i]); n.dataset.i = i; var m = el('div', 'ao-pm', live ? tr('searching') : (a.ms ? (a.ms / 1000).toFixed(1) + 's' : ''));
      h.appendChild(n); h.appendChild(m); p.appendChild(h);
      var b = el('div', 'ao-pb' + (live ? ' live ao-thinking' : '')); if (live) { var indicator=el('span','ao-thinking-indicator'); indicator.appendChild(el('span','ao-thinking-shape')); indicator.appendChild(el('span','ao-thinking-text',state.lang==='ar'?'يفكر':'Thinking')); b.appendChild(indicator); } else renderMarkdown(b, a.text); b.setAttribute('dir', 'auto'); b.setAttribute('data-i', i); p.appendChild(b);
      var s = el('div', 'ao-src ao-hidden'); a.sources.forEach(function (x) { s.appendChild(el('span', null, x)); }); p.appendChild(s);
      if (!live) s.classList.remove('ao-hidden');
      panes.appendChild(p); bodies.push(b); metas.push({ m: m, s: s, n: n });
    });
    wrap.appendChild(panes);
    var vote = el('div', 'ao-vote'); wrap.appendChild(vote);
    if (!live) renderVote(r, vote, panes);
    return { wrap: wrap, bodies: bodies, metas: metas, vote: vote, panes: panes };
  }
  function renderVote(r, box, panes) {
    box.innerHTML = '';
    if (r.mode === 'direct') return;
    box.appendChild(el('div', 'lbl', r.vote ? tr('saved') : tr('vote')));
    var row = el('div', 'ao-vbtns'); var opts = [['a', 'a'], ['b', 'b'], ['tie', 'tie'], ['bad', 'bad']];
    opts.forEach(function (o) {
      var btn = el('button', 'ao-vbtn' + (r.vote === o[0] ? ' on' : ''), tr(o[1])); btn.type = 'button'; if (r.vote) btn.disabled = true;
      btn.onclick = function () { r.vote = o[0]; save(); renderVote(r, box, panes); if (r.mode === 'battle') { var ns = panes.querySelectorAll('.ao-pn'); for (var i = 0; i < ns.length; i++) ns[i].textContent = r.models[i]; box.appendChild(el('div', 'ao-pm', tr('revealed') + r.models.join(' · '))); } };
      row.appendChild(btn);
    });
    box.appendChild(row);
    if (r.vote && r.mode === 'battle') box.appendChild(el('div', 'ao-pm', tr('revealed') + r.models.join(' · ')));
  }
  function scrollDown() { var s = $('scroll'); s.scrollTop = s.scrollHeight; }

  function renderChat(c) {
    var conv = $('conv'); conv.innerHTML = '';
    c.rounds.forEach(function (r) { conv.appendChild(renderRound(r, false).wrap); });
  }
  function openChat(id) {
    if (state.busy) stopAll();
    state.cur = id; var c = curChat(); if (!c) return newChat();
    showLanding(false); composerHome(false); renderChat(c); $('prompt').placeholder = tr('phFollow'); renderHistory(); scrollDown();
  }
  function newChat() {
    if (state.busy) stopAll();
    state.cur = null; $('conv').innerHTML = ''; showLanding(true); composerHome(true); $('prompt').placeholder = tr('ph'); $('prompt').value = ''; autosize(); sync(); renderHistory();
  }

  /* ---------- real Gemini requests ---------- */
  function pickModels() {
    if (state.mode === 'direct') return [state.single];
    if (state.mode === 'battle') return MODELS.slice().sort(function () { return Math.random() - 0.5; });
    return [state.a, state.b];
  }
  function stopAll() {
    state.requestId++;
    if (state.controller) { state.controller.abort(); state.controller = null; }
    clearTimers(); state.busy = false;
    var c = curChat(); var r = c && c.rounds[c.rounds.length - 1];
    var live = document.querySelectorAll('.ao-pb.live');
    for (var i = 0; i < live.length; i++) {
      var node = live[i]; node.classList.remove('live');
      var idx = parseInt(node.getAttribute('data-i'), 10);
      var txt = node.textContent || '';
      if (!txt.trim()) txt = state.lang === 'ar' ? 'تم إيقاف الطلب.' : 'Request stopped.';
      if (r && r.answers[idx]) { r.answers[idx].text = txt; r.answers[idx].ms = 0; }
    }
    var rounds = document.querySelectorAll('.ao-round');
    var last = rounds[rounds.length - 1];
    if (r && last && live.length) { renderVote(r, last.querySelector('.ao-vote'), last.querySelector('.ao-panes')); }
    sync(); save();
  }
  async function send() {
    var input = $('prompt'); var prompt = input.value.trim(); if (!prompt || state.busy) return;
    var models = pickModels(); var mode = state.mode;
    var chat = curChat();
    if (!chat) {
      chat = { id: uid(), title: prompt.length > 48 ? prompt.slice(0, 45) + '…' : prompt, rounds: [], sessions: {} };
      state.chats.unshift(chat); state.cur = chat.id; showLanding(false); composerHome(false); $('conv').innerHTML = '';
    }
    if (!chat.sessions) chat.sessions = {};
    var round = { prompt: prompt, mode: mode, models: models, vote: null, answers: models.map(function () { return { text: '', sources: [], ms: 0 }; }) };
    chat.rounds.push(round);
    input.value = ''; autosize(); $('prompt').placeholder = tr('phFollow');
    var view = renderRound(round, true); $('conv').appendChild(view.wrap); renderHistory(); scrollDown();
    state.busy = true; state.controller = new AbortController();
    var requestId = ++state.requestId; var start = Date.now(); sync(); save();

    await Promise.all(round.answers.map(async function (answer, index) {
      var model = models[index];
      try {
        var response = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json','Accept':'text/event-stream'},
          body:JSON.stringify({prompt:prompt,instruction:instructionFor(model),sessionId:chat.sessions[model]||null}),signal:state.controller.signal });
        if(!response.ok){var errorData=await response.json().catch(function(){return {};});throw new Error(apiError(errorData,response.status));}
        if(!response.body||!response.body.getReader)throw new Error('Streaming is not supported by this browser.');
        var reader=response.body.getReader(),decoder=new TextDecoder(),pending='',doneEvent=null;answer.text='';
        var shownLength=0,streamFinished=false,revealTimer=null;
        function revealTick(){
          if(requestId!==state.requestId){clearInterval(revealTimer);return;}
          if(shownLength<answer.text.length){var remaining=answer.text.length-shownLength;shownLength+=Math.min(remaining,Math.max(1,Math.ceil(remaining/18)));view.bodies[index].classList.remove('ao-thinking');renderMarkdown(view.bodies[index],answer.text.slice(0,shownLength));view.bodies[index].classList.add('ao-streaming');scrollDown();}
          else if(streamFinished){clearInterval(revealTimer);revealTimer=null;}
        }
        revealTimer=setInterval(revealTick,24);
        while(true){var part=await reader.read();if(part.done)break;pending+=decoder.decode(part.value,{stream:true});var chunks=pending.split('\n\n');pending=chunks.pop()||'';
          chunks.forEach(function(chunk){var raw=chunk.split('\n').filter(function(x){return x.indexOf('data:')===0;}).map(function(x){return x.slice(5).trim();}).join('\n');if(!raw)return;var event=JSON.parse(raw);
            if(event.type==='chunk'){answer.text+=event.text||'';}
            else if(event.type==='done')doneEvent=event;else if(event.type==='error')throw new Error(event.error||'Streaming failed');
          });
        }
        if(!answer.text.trim()&&doneEvent&&doneEvent.response)answer.text=doneEvent.response;
        streamFinished=true;
        while(shownLength<answer.text.length){await new Promise(function(resolve){setTimeout(resolve,24);});revealTick();}
        if(revealTimer){clearInterval(revealTimer);revealTimer=null;}
        if(!answer.text.trim())throw new Error('Gemini returned an empty response.');
        answer.text=answer.text.trim();answer.ms=Date.now()-start;if(doneEvent&&doneEvent.sessionId)chat.sessions[model]=doneEvent.sessionId;
        renderMarkdown(view.bodies[index],answer.text);view.bodies[index].classList.remove('live','ao-thinking','ao-streaming');
        view.metas[index].m.textContent=(answer.ms/1000).toFixed(1)+'s';view.metas[index].s.classList.remove('ao-hidden');
      } catch (error) {
        if (requestId !== state.requestId) return;
        if (error && error.name === 'AbortError') return;
        answer.text = (state.lang === 'ar' ? 'تعذر الحصول على رد من Gemini. حاول مرة أخرى بعد قليل.' : 'Gemini could not complete this request. Please try again.');
        answer.ms = Date.now() - start;
        renderMarkdown(view.bodies[index], answer.text);
        view.bodies[index].classList.remove('live','ao-thinking','ao-streaming');
        view.metas[index].m.textContent = (answer.ms / 1000).toFixed(1) + 's';
        view.metas[index].s.classList.add('ao-hidden');
      }
    }));

    if (requestId !== state.requestId) return;
    state.busy = false; state.controller = null; sync(); save();
    renderVote(round, view.vote, view.panes); scrollDown();
  }

  /* ---------- sidebar ---------- */
  function openSide() { $('app').classList.add('open'); }
  function closeSide() { $('app').classList.remove('open'); }

  /* ---------- init ---------- */
  function init() {
    load();
    if (!localStorage_has(STORE) && /^ar/i.test(navigator.language || '')) state.lang = 'ar';
    themeInit();
    fillSelect($('selA'), state.a); fillSelect($('selB'), state.b); fillSelect($('selS'), state.single);
    $('selA').onchange = function () { state.a = this.value; save(); };
    $('selB').onchange = function () { state.b = this.value; save(); };
    $('selS').onchange = function () { state.single = this.value; save(); };
    $('mSide').onclick = function () { state.mode = 'side'; applyMode(); save(); };
    $('mBattle').onclick = function () { state.mode = 'battle'; applyMode(); save(); };
    $('mDirect').onclick = function () { state.mode = 'direct'; applyMode(); save(); };
    $('newChat').onclick = function () { newChat(); closeSide(); $('prompt').focus(); };
    $('menuBtn').onclick = openSide; $('scrim').onclick = closeSide;
    $('collapseBtn').onclick = function () { if (window.innerWidth < 768) closeSide(); else $('app').classList.toggle('collapsed'); };
    $('themeBtn').onclick = function () { setTheme(root.classList.contains('dark') ? 'light' : 'dark'); };
    $('langBtn').onclick = function () { state.lang = state.lang === 'ar' ? 'en' : 'ar'; applyLang(); sync(); save(); var c = curChat(); if (c) renderChat(c); };
    $('prompt').addEventListener('input', function () { autosize(); sync(); });
    $('prompt').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!state.busy) send(); } });
    $('send').onclick = function () { if (state.busy) stopAll(); else send(); };
    $('sendWrap').addEventListener('submit', function (e) { e.preventDefault(); });
    applyLang(); applyMode(); sync(); newChat();
  }
  function localStorage_has(k) { try { return localStorage.getItem(k) !== null; } catch (e) { return false; } }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
