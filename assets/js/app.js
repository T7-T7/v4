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
    var persona=''; try { var p=JSON.parse(localStorage.getItem('pix-ai-local-tools-v1')||'{}').persona; persona=({coder:'تصرف كمبرمج خبير وراجع الحلول بعناية.',analyst:'تصرف كمحلل دقيق وافصل الحقائق عن الافتراضات.',teacher:'تصرف كمدرس واشرح بالتدرج مع أمثلة واضحة.',writer:'تصرف ككاتب محترف واهتم بالصياغة والتنظيم.'})[p]||''; } catch(e) {}\n    if (model === 'Gemini Deep') {
      return 'أنت مساعد Pix الذكي. حلّل السؤال بعمق، تحقّق من التفاصيل، اشرح الأسباب والخطوات، ولا تختلق معلومات أو مصادر. أجب بلغة المستخدم. '+persona;
    }
    return 'أنت مساعد Pix الذكي. أجب مباشرة وبدقة، وابحث في الويب عند الحاجة عبر قدرات Gemini المتاحة. لا تختلق معلومات أو مصادر. أجب بلغة المستخدم. '+persona;
  }
  function renderMarkdown(target, source) {
    target.replaceChildren();
    var lines=String(source||'').replace(/\r/g,'').split('\n'),i=0;

    function inline(parent,value){
      var re=/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"]*)")?\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"]*)")?\)|(\x60+)(.+?)\7|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)|(?<!_)_(?!\s)(.+?)(?<!\s)_(?!_)|(https?:\/\/[^\s<]+)/g;
      var last=0,m;
      while((m=re.exec(value))){
        if(m.index>last)parent.appendChild(document.createTextNode(value.slice(last,m.index)));
        var n;
        if(m[1]!==undefined){n=el('img','md-image');n.src=m[2];n.alt=m[1];n.loading='lazy';if(m[3])n.title=m[3];}
        else if(m[4]!==undefined){n=el('a','md-link',m[4]);n.href=m[5];n.target='_blank';n.rel='noopener noreferrer';if(m[6])n.title=m[6];}
        else if(m[7]){n=el('code','md-inline-code',m[8]);}
        else if(m[9]||m[10]){n=el('strong',null,m[9]||m[10]);}
        else if(m[11]){n=el('del',null,m[11]);}
        else if(m[12]||m[13]){n=el('em',null,m[12]||m[13]);}
        else {n=el('a','md-link',m[14]);n.href=m[14];n.target='_blank';n.rel='noopener noreferrer';}
        parent.appendChild(n);last=re.lastIndex;
      }
      if(last<value.length)parent.appendChild(document.createTextNode(value.slice(last)));
    }
    function addBlock(tag,cls,value){var n=el(tag,cls);inline(n,value);target.appendChild(n);return n;}
    function isBlock(line){
      var s=line.trim();
      return !s || /^(`{3,}|~{3,})/.test(s) || /^#{1,6}\s/.test(s) ||
        /^>/.test(s) || /^([-+*]|\d+[.)])\s+/.test(s) ||
        /^---+$|^___+$|^\*\*\*+$/.test(s);
    }
    function parseBlocks(endAtQuote){
      while(i<lines.length){
        var line=lines[i],s=line.trim();
        if(!s){i++;continue;}
        if(endAtQuote && !/^\s*>/.test(line))break;
        if(/^\s*>/.test(line)){
          var quoted=[];
          while(i<lines.length&&/^\s*>/.test(lines[i]))quoted.push(lines[i++].replace(/^\s*>\s?/,''));
          var q=el('blockquote','md-quote');var holder=el('div');var old=target;target=holder;
          var saved=lines,resume=i;lines=quoted;i=0;parseBlocks(false);lines=saved;i=resume;
          while(holder.firstChild)q.appendChild(holder.firstChild);target=old;target.appendChild(q);continue;
        }
        var fence=s.match(/^(`{3,}|~{3,})(.*)$/);
        if(fence){
          var marker=fence[1][0],size=fence[1].length,lang=fence[2].trim(),code=[];i++;
          var close=new RegExp('^\\s*'+(marker==='`'?'\\`':'~')+'{'+size+',}\\s*$');
          while(i<lines.length&&!close.test(lines[i]))code.push(lines[i++]);
          if(i<lines.length)i++;
          var pre=el('pre','md-code'),co=el('code',lang?'language-'+lang:'');co.textContent=code.join('\n');pre.appendChild(co);target.appendChild(pre);continue;
        }
        if(/^---+$|^___+$|^\*\*\*+$/.test(s)){target.appendChild(el('hr','md-hr'));i++;continue;}
        var h=s.match(/^(#{1,6})\s+(.+?)\s*#*$/);
        if(h){addBlock('h'+h[1].length,'md-heading',h[2]);i++;continue;}
        if(i+1<lines.length&&s.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
          function cells(row){return row.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(function(x){return x.trim();});}
          var heads=cells(line),aligns=cells(lines[i+1]).map(function(x){return x[0]===':'&&x[x.length-1]===':'?'center':x[0]===':'?'left':x[x.length-1]===':'?'right':'';});
          var box=el('div','md-table-wrap'),table=el('table','md-table'),thead=el('thead'),tr=el('tr');
          heads.forEach(function(x,k){var th=el('th');th.style.textAlign=aligns[k]||'';inline(th,x);tr.appendChild(th);});
          thead.appendChild(tr);table.appendChild(thead);var tbody=el('tbody');i+=2;
          while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){
            var row=el('tr');cells(lines[i]).forEach(function(x,k){var td=el('td');td.style.textAlign=aligns[k]||'';inline(td,x);row.appendChild(td);});tbody.appendChild(row);i++;
          }
          table.appendChild(tbody);box.appendChild(table);target.appendChild(box);continue;
        }
        var lm=line.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
        if(lm){
          var base=lm[1].replace(/\t/g,'  ').length,ordered=/^\d/.test(lm[2]),list=el(ordered?'ol':'ul','md-list');
          if(ordered)list.start=parseInt(lm[2],10)||1;
          while(i<lines.length){
            var item=lines[i].match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
            if(!item)break;
            var indent=item[1].replace(/\t/g,'  ').length,itemOrdered=/^\d/.test(item[2]);
            if(indent<base||indent===base&&itemOrdered!==ordered)break;
            if(indent>base){
              var nestedStart=i, nestedLines=[];
              while(i<lines.length){var ni=lines[i].match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);if(!ni||ni[1].replace(/\t/g,'  ').length<=base)break;nestedLines.push(lines[i++]);}
              if(list.lastElementChild){var nested=el('div');var oldTarget=target,oldLines=lines;target=nested;lines=nestedLines;i=0;parseBlocks(false);lines=oldLines;i=nestedStart+nestedLines.length;target=oldTarget;while(nested.firstChild)list.lastElementChild.appendChild(nested.firstChild);}
              continue;
            }
            var li=el('li'),task=item[3].match(/^\[([ xX])\]\s+(.*)$/);
            if(task){var check=el('input','md-task');check.type='checkbox';check.disabled=true;check.checked=task[1].toLowerCase()==='x';li.appendChild(check);inline(li,task[2]);}
            else inline(li,item[3]);
            list.appendChild(li);i++;
          }
          target.appendChild(list);continue;
        }
        var para=[s];i++;
        while(i<lines.length&&lines[i].trim()&&!isBlock(lines[i]))para.push(lines[i++].trim());
        addBlock('p','md-paragraph',para.join('\n'));
      }
    }
    parseBlocks(false);
  }
  function apiError(data, status) {
    return (data && (data.error || data.message)) || ('Gemini API HTTP ' + status);
  }

  /* ---------- icons ---------- */
  var ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    cols: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>',
    one: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="4" width="14" height="16" rx="2"/></svg>',
    gemini: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.8 27.7a12 12 0 0 1 0-7.4v-5.2H5.9a20 20 0 0 0 0 17.8l6.9-5.2Z"/><path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6 29.5 4 24 4A20 20 0 0 0 5.9 15.1l6.9 5.2c1.6-4.7 6-8.2 11.2-8.2Z"/></svg>'
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
      var row = el('div', 'ao-hitem' + (c.id === state.cur ? ' on' : '')); row.dataset.chatId = c.id;
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
    var wrap = el('section', 'ao-round' + (r.mode === 'direct' ? ' ao-round-direct' : ''));
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px';
    var q = el('div', 'ao-q', r.prompt); q.setAttribute('dir', 'auto'); wrap.appendChild(q);
    var panes = el('div', 'ao-panes' + (r.mode === 'direct' ? '' : ' ao-panes-compare')); panes.style.setProperty('--cols', r.mode === 'direct' ? 1 : 2);
    var names = paneNames(r); var bodies = []; var metas = [];
    r.answers.forEach(function (a, i) {
      var p = el('article', 'ao-pane' + (r.mode === 'direct' ? '' : ' ao-pane-card'));
      var h = el('div', 'ao-ph'); var brand=el('div','ao-provider'); var logo=el('span','ao-provider-logo'); logo.innerHTML=ICON.gemini; var n = el('div', 'ao-pn', names[i]); n.dataset.i = i; brand.appendChild(logo); brand.appendChild(n); var m = el('div', 'ao-pm', live ? tr('searching') : (a.ms ? (a.ms / 1000).toFixed(1) + 's' : ''));
      h.appendChild(brand); h.appendChild(m); p.appendChild(h);
      var b = el('div', 'ao-pb' + (live ? ' live ao-thinking' : '')); if (live) { var indicator=el('span','ao-thinking-indicator'); indicator.appendChild(el('span','ao-thinking-shape')); indicator.appendChild(el('span','ao-thinking-text','Thinking')); b.appendChild(indicator); } else renderMarkdown(b, a.text); b.setAttribute('dir', 'auto'); b.setAttribute('data-i', i); p.appendChild(b);
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
        var revealTimer=null;
        while(true){var part=await reader.read();if(part.done)break;pending+=decoder.decode(part.value,{stream:true});var chunks=pending.split('\n\n');pending=chunks.pop()||'';
          chunks.forEach(function(chunk){var raw=chunk.split('\n').filter(function(x){return x.indexOf('data:')===0;}).map(function(x){return x.slice(5).trim();}).join('\n');if(!raw)return;var event=JSON.parse(raw);
            if(event.type==='chunk'){answer.text+=event.text||'';}
            else if(event.type==='done')doneEvent=event;else if(event.type==='error')throw new Error(event.error||'Streaming failed');
          });
        }
        if(!answer.text.trim()&&doneEvent&&doneEvent.response)answer.text=doneEvent.response;
        if(!answer.text.trim())throw new Error('Gemini returned an empty response.');
        answer.text=answer.text.trim();answer.ms=Date.now()-start;if(doneEvent&&doneEvent.sessionId)chat.sessions[model]=doneEvent.sessionId;
        var formatted=el('div','ao-md-staging');renderMarkdown(formatted,answer.text);
        var body=view.bodies[index];body.replaceChildren();body.classList.remove('live','ao-thinking','ao-streaming');
        var blocks=Array.prototype.slice.call(formatted.childNodes);
        blocks.forEach(function(node,blockIndex){
          node.classList && node.classList.add('ao-md-enter');
          if(node.style)node.style.setProperty('--md-enter-delay',Math.min(blockIndex*45,360)+'ms');
          body.appendChild(node);
        });
        scrollDown();
        view.metas[index].m.textContent=(answer.ms/1000).toFixed(1)+'s';view.metas[index].s.classList.remove('ao-hidden');
      } catch (error) {
        if (typeof revealTimer !== 'undefined' && revealTimer) clearInterval(revealTimer);
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
    localToolsInit();
  }

  /* ---------- local Pix tools ---------- */
  function localToolsInit() {
    var key='pix-ai-local-tools-v1', prefs={folders:[],pinned:[],folderByChat:{},persona:'none',density:'comfortable',font:15,templates:[]};
    try { prefs=Object.assign(prefs,JSON.parse(localStorage.getItem(key)||'{}')); } catch(e) {}
    function persist(){try{localStorage.setItem(key,JSON.stringify(prefs));}catch(e){toast(state.lang==='ar'?'مساحة التخزين ممتلئة':'Local storage is full');}}
    function label(ar,en){return state.lang==='ar'?ar:en;}
    function btn(text,fn,cls){var b=el('button',cls||'ao-tool-btn',text);b.type='button';b.addEventListener('click',fn);return b;}
    function getChat(id){return state.chats.find(function(c){return c.id===id;});}
    function toolsForRound(round,roundIndex,chat){
      var actions=el('div','ao-answer-tools');
      round.answers.forEach(function(answer,answerIndex){
        if(!answer.text)return;
        var group=el('div','ao-answer-tool-group');
        group.appendChild(btn(label('نسخ','Copy'),function(){
          var done=function(){toast(label('تم نسخ الإجابة','Answer copied'));};
          if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(answer.text).then(done).catch(function(){fallbackCopy(answer.text);done();});
          else {fallbackCopy(answer.text);done();}
        }));
        group.appendChild(btn(label('إعادة','Retry'),function(){
          if(state.busy)return;
          var target=getChat(chat.id);if(!target)return;
          target.rounds=target.rounds.slice(0,roundIndex);
          state.cur=chat.id;save();sessionStorage.setItem('pix-ai-resume-chat',chat.id);
          sessionStorage.setItem('pix-ai-draft',round.prompt);sessionStorage.setItem('pix-ai-auto-send','1');location.reload();
        }));
        group.appendChild(btn(label('تعديل السؤال','Edit question'),function(){
          if(state.busy)return;
          var target=getChat(chat.id);if(!target)return;
          target.rounds=target.rounds.slice(0,roundIndex);
          state.cur=chat.id;save();sessionStorage.setItem('pix-ai-resume-chat',chat.id);
          sessionStorage.setItem('pix-ai-draft',round.prompt);location.reload();
        }));
        group.appendChild(btn(label('مشاركة محلية','Export answer'),function(){
          var blob=new Blob([answer.text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='pix-answer.txt';a.click();URL.revokeObjectURL(url);
          toast(label('تم تجهيز ملف الإجابة','Answer file exported'));
        }));
        actions.appendChild(group);
      });
      return actions;
    }
    function fallbackCopy(value){var t=el('textarea');t.value=value;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();try{document.execCommand('copy');}catch(e){}t.remove();}
    function addRoundTools(){
      var chat=getChat(state.cur);if(!chat)return;
      var rounds=$('conv').querySelectorAll('.ao-round');
      rounds.forEach(function(node,index){
        var round=chat.rounds[index];if(!round||node.querySelector('.ao-answer-tools'))return;
        node.appendChild(toolsForRound(round,index,chat));
      });
    }
    function addSidebarTools(){
      if($('pixLocalTools'))return;
      var panel=el('div','ao-local-tools');panel.id='pixLocalTools';
      var search=el('input','ao-local-search');search.type='search';search.placeholder=label('ابحث في المحادثات…','Search chats…');search.setAttribute('aria-label',search.placeholder);
      search.addEventListener('input',function(){var q=search.value.trim().toLowerCase();$('hist').querySelectorAll('.ao-hitem').forEach(function(row){row.classList.toggle('ao-search-hidden',!!q&&!row.textContent.toLowerCase().includes(q));});});
      var folder=el('select','ao-local-select');folder.innerHTML='<option value="">'+label('كل المجلدات','All folders')+'</option>';
      prefs.folders.forEach(function(f){var o=el('option');o.value=f;o.textContent=f;folder.appendChild(o);});
      folder.addEventListener('change',function(){var f=folder.value;$('hist').querySelectorAll('.ao-hitem').forEach(function(row){var id=row.dataset.chatId;row.classList.toggle('ao-search-hidden',!!f&&prefs.folderByChat[id]!==f);});});
      panel.appendChild(search);panel.appendChild(folder);
      panel.appendChild(btn(label('＋ مجلد جديد','＋ New folder'),function(){var name=prompt(label('اسم المجلد','Folder name'));if(!name||!name.trim())return;name=name.trim().slice(0,40);if(!prefs.folders.includes(name))prefs.folders.push(name);persist();folder.innerHTML='<option value="">'+label('كل المجلدات','All folders')+'</option>';prefs.folders.forEach(function(f){var o=el('option');o.value=f;o.textContent=f;folder.appendChild(o);});toast(label('تم إنشاء المجلد','Folder created'));}));
      panel.appendChild(btn(label('قوالب جاهزة','Prompt library'),function(){openTemplates();}));
      panel.appendChild(btn(label('تصدير نسخة احتياطية','Export backup'),function(){var data=JSON.stringify({pixChats:state.chats,pixPreferences:prefs},null,2);downloadText(data,'pix-ai-backup.json','application/json');}));
      var foot=$('side').querySelector('.ao-side-foot');foot.parentNode.insertBefore(panel,foot);
    }
    function downloadText(data,name,type){var u=URL.createObjectURL(new Blob([data],{type:type})),a=el('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
    function openTemplates(){
      var choices=[
        ['مساعد برمجي','تصرف كمبرمج خبير. افحص الكود بدقة، اشرح سبب المشكلة، وقدّم الحل كاملًا مع الحفاظ على البنية الحالية.'],
        ['تحليل تقني','حلّل الموضوع تقنيًا، وميّز بين الحقائق والافتراضات، واذكر القيود والمخاطر.'],
        ['تلخيص','لخّص النص التالي مع الحفاظ على المعلومات الأساسية والنقاط المهمة:'],
        ['كتابة احترافية','اكتب النص بأسلوب احترافي واضح ومباشر مع تنظيم جيد:']
      ];
      var overlay=el('div','ao-local-modal'),box=el('div','ao-local-modal-box'),title=el('strong',null,label('مكتبة الأوامر الجاهزة','Prompt library'));
      box.appendChild(title);
      choices.forEach(function(item){box.appendChild(btn(item[0],function(){$('prompt').value=item[1]+'\n\n';autosize();sync();$('prompt').focus();overlay.remove();},'ao-template-choice'));});
      box.appendChild(btn(label('إغلاق','Close'),function(){overlay.remove();}));
      overlay.appendChild(box);overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});document.body.appendChild(overlay);
    }
    function applyLocalPrefs(){
      document.documentElement.dataset.pixDensity=prefs.density;
      document.documentElement.style.setProperty('--pix-answer-font',Math.max(13,Math.min(20,Number(prefs.font)||15))+'px');
      var persona=$('pixPersona');if(persona)persona.value=prefs.persona;
      var density=$('pixDensity');if(density)density.value=prefs.density;
      var font=$('pixFont');if(font)font.value=String(prefs.font);
    }
    function addSettings(){
      if($('pixPersona'))return;
      var wrap=el('div','ao-local-settings');
      var persona=el('select','ao-local-select');persona.id='pixPersona';
      [['none','الشخصية الافتراضية'],['coder','مبرمج'],['analyst','محلل'],['teacher','مدرس'],['writer','كاتب']].forEach(function(x){var o=el('option');o.value=x[0];o.textContent=label(x[1],({none:'Default',coder:'Programmer',analyst:'Analyst',teacher:'Teacher',writer:'Writer'})[x[0]]);persona.appendChild(o);});
      persona.addEventListener('change',function(){prefs.persona=persona.value;persist();toast(label('تم حفظ الشخصية محليًا','Persona saved locally'));});
      var density=el('select','ao-local-select');density.id='pixDensity';
      [['comfortable','مريح'],['compact','مضغوط']].forEach(function(x){var o=el('option');o.value=x[0];o.textContent=label(x[1],x[0]);density.appendChild(o);});
      density.addEventListener('change',function(){prefs.density=density.value;persist();applyLocalPrefs();});
      var font=el('input','ao-local-font');font.id='pixFont';font.type='range';font.min='13';font.max='20';font.step='1';
      font.addEventListener('input',function(){prefs.font=Number(font.value);persist();applyLocalPrefs();});
      wrap.appendChild(el('div','ao-local-caption',label('الشخصية','Assistant style')));wrap.appendChild(persona);
      wrap.appendChild(el('div','ao-local-caption',label('كثافة الواجهة','Interface density')));wrap.appendChild(density);
      wrap.appendChild(el('div','ao-local-caption',label('حجم الخط','Font size')));wrap.appendChild(font);
      $('side').querySelector('.ao-side-foot').appendChild(wrap);applyLocalPrefs();
    }
    function pinControls(){
      $('hist').querySelectorAll('.ao-hitem').forEach(function(row){var title=row.querySelector('.t');if(!title)return;var chat=state.chats.find(function(c){return c.id===row.dataset.chatId;});if(!chat)return;
        if(row.querySelector('.ao-pin'))return;
        var p=btn(prefs.pinned.includes(chat.id)?'★':'☆',function(){var at=prefs.pinned.indexOf(chat.id);if(at<0)prefs.pinned.push(chat.id);else prefs.pinned.splice(at,1);persist();renderHistory();},'ao-pin');row.insertBefore(p,title);
        var f=btn('▾',function(){var name=prompt(label('اكتب اسم مجلد موجود أو اتركه فارغًا لإزالة التصنيف','Enter an existing folder name, or leave blank to clear'));if(name===null)return;name=name.trim();if(name&&!prefs.folders.includes(name)){toast(label('أنشئ المجلد أولًا','Create the folder first'));return;}if(name)prefs.folderByChat[chat.id]=name;else delete prefs.folderByChat[chat.id];persist();toast(label('تم تحديث المجلد','Folder updated'));},'ao-pin');row.insertBefore(f,title);
      });
      var rows=Array.prototype.slice.call($('hist').children),sorted=rows.slice().sort(function(a,b){return Number(prefs.pinned.includes(b.dataset.chatId))-Number(prefs.pinned.includes(a.dataset.chatId));});if(rows.some(function(x,i){return x!==sorted[i];}))sorted.forEach(function(x){$('hist').appendChild(x);});
    }
    var observer=new MutationObserver(function(){addRoundTools();pinControls();});
    observer.observe($('conv'),{childList:true,subtree:true});observer.observe($('hist'),{childList:true});
    addSidebarTools();addSettings();addRoundTools();pinControls();
    var resume=sessionStorage.getItem('pix-ai-resume-chat'),draft=sessionStorage.getItem('pix-ai-draft'),autoSend=sessionStorage.getItem('pix-ai-auto-send')==='1';
    if(resume){sessionStorage.removeItem('pix-ai-resume-chat');sessionStorage.removeItem('pix-ai-draft');sessionStorage.removeItem('pix-ai-auto-send');setTimeout(function(){var c=getChat(resume);if(c){var row=Array.prototype.find.call($('hist').querySelectorAll('.ao-hitem'),function(x){return x.dataset.chatId===resume;});if(row&&row.querySelector('.t'))row.querySelector('.t').click();$('prompt').value=draft||'';autosize();sync();if(autoSend)send();else $('prompt').focus();}},150);}
    window.addEventListener('storage',function(e){if(e.key===STORE)location.reload();});
  }

  function localStorage_has(k) { try { return localStorage.getItem(k) !== null; } catch (e) { return false; } }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
