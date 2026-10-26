// ==UserScript==
// @name         가상세계 열람실 · RP 기록 뷰어
// @namespace    private-rp-world-viewer
// @version      0.2.28
// @description  RP 대화 기반 가상 기록 열람실 · 콘텐츠별 테마 · 단체 채팅 · 방 공통 프롬프트 프리셋
// @match        https://crack.wrtn.ai/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      crack-api.wrtn.ai
// @connect      contents-api.wrtn.ai
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(() => {
  'use strict';
  if (window.__PRIVATE_RP_WORLD_VIEWER_V02__) return;
  window.__PRIVATE_RP_WORLD_VIEWER_V02__ = true;

  const VERSION = '0.2.28';
  const DB_NAME = 'PrivateRPWorldViewer_v1';
  const API_A = 'https://crack-api.wrtn.ai/crack-gen/v3/chats/';
  const API_B = 'https://contents-api.wrtn.ai/character-chat/v3/chats/';
  const TYPES = [
    { key: 'phone', label: '핸드폰', icon: '📱', person: true },
    { key: 'pc', label: '컴퓨터', icon: '💻', person: true },
    { key: 'diary', label: '일기장', icon: '📔', person: true },
    { key: 'board', label: '커뮤니티', icon: '💬', person: false },
    { key: 'news', label: '뉴스', icon: '📰', person: false },
    { key: 'wiki', label: '위키', icon: '📚', person: false },
    { key: 'live', label: '실시간톡', icon: '📺', person: false },
    { key: 'groupchat', label: '단톡', icon: '💬', person: true },
    { key: 'x', label: '𝕏+', icon: '𝕏', person: false },
    { key: 'free', label: '자유 생성', icon: '✎', person: false },
  ];
  const THEMES = {
    phone:[
      {id:'modern', label:'현대 · 스마트폰'},
      {id:'retro', label:'레트로 · 폴더폰'},
      {id:'classic', label:'사극/고전 · 서신/소지품함'},
      {id:'fantasy', label:'로판/판타지 · 마법 통신구'},
    ],
    pc:[
      {id:'modern', label:'현대 · PC'},
      {id:'classic', label:'사극/고전 · 개인서고/문서함'},
      {id:'fantasy', label:'로판/판타지 · 마법기록실'},
    ],
    diary:[
      {id:'classic-modern', label:'현대 1 · 기존 일기장'},
      {id:'modern-note', label:'현대 2 · 모던 노트'},
      {id:'classic-paper', label:'사극/고전 · 고전 종이'},
      {id:'fantasy-parchment', label:'로판/판타지 · 양피지'},
    ],
    board:[
      {id:'modern', label:'현대 · 디시풍 게시판'},
      {id:'classic', label:'사극/고전 · 저잣거리 소문판'},
      {id:'fantasy', label:'로판/판타지 · 왕도/길드 게시판'},
      {id:'foreign4', label:'외국 1 · 4chan 느낌'},
      {id:'foreign2', label:'외국 2 · 2ch 느낌'},
    ],
    news:[
      {id:'modern', label:'현대 · 기본'},
      {id:'classic', label:'사극/고전 · 관보/소식지'},
      {id:'fantasy', label:'로판/판타지 · 황실 신문'},
    ],
    wiki:[
      {id:'modern', label:'현대 · 기본'},
      {id:'classic', label:'사극/고전 · 백과사전'},
      {id:'fantasy', label:'로판/판타지 · 판타지 백과'},
    ],
    live:[
      {id:'modern', label:'기본 · 실시간톡'}
    ],
    groupchat:[
      {id:'kakao', label:'현대 1 · 카카오톡풍'},
      {id:'neutral', label:'현대 2 · 기본 단체 채팅'},
      {id:'fantasy', label:'로판/판타지 · 수정구 단톡'},
      {id:'classic', label:'사극/고전 · 쪽지 단톡'},
    ],
    x:[
      {id:'modern', label:'현대 · 기본'},
      {id:'classic', label:'사극/고전 · 풍문 벽보'},
      {id:'fantasy', label:'로판/판타지 · 마법 소식판'},
    ],
  };
  const defaultThemes = () => Object.fromEntries(TYPES.map(t=>[t.key,(THEMES[t.key]&&THEMES[t.key][0]?THEMES[t.key][0].id:'modern')]));
  const themeOptions = kind => THEMES[kind] || [{id:'modern',label:'기본'}];
  const validTheme = (kind, value) => themeOptions(kind).some(x=>x.id===value) ? value : (themeOptions(kind)[0]?.id || 'modern');
  const themeLabel = (kind, value) => themeOptions(kind).find(x=>x.id===value)?.label || themeOptions(kind)[0]?.label || '기본';
  const typeOf = key => TYPES.find(x => x.key === key) || TYPES[0];
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const text = (x, limit = 20000) => esc(String(x ?? '').slice(0, limit));
  const arr = x => Array.isArray(x) ? x : [];
  const fmtDate = x => { try { return new Date(x).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
  const integer = (v, fallback = 0) => Number.isFinite(Number(v)) ? Math.floor(Number(v)) : fallback;
  const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now() + Math.random().toString(36).slice(2);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, integer(v, lo)));
  const configKey = room => 'prwv:room:v1:' + room;
  const KEY_API = 'prwv:gemini-key:v1';
  const KEY_BUTTON = 'prwv:floating-position:v2';
  const KEY_PRESETS = 'prwv:perkind-presets:global:v1';
  const KEY_FREE_PRESETS = 'prwv:free-presets:global:v1';
  const DEFAULT_KRW_PER_USD = 1330; // 수동 환산용 초기값. 시세가 아니며 설정에서 수정 가능.
  // 유료 Standard 기준: USD / 100만 토큰. 사용자 모델 선택에 맞춰 자동 계산. 가격은 2026-10-20 확인.
  const PRICES = {
    'gemini-2.5-flash-lite': { input:0.10,output:0.40 },
    'gemini-2.5-flash': { input:0.30,output:2.50 },
    'gemini-2.5-pro': { input:1.25,output:10,above200k:[2.5,15] },
    'gemini-3-flash-preview': { input:0.50,output:3 },
    'gemini-3-flash': { input:0.50,output:3 },
    'gemini-3.1-flash-lite': { input:0.25,output:1.50 },
    'gemini-3.1-pro-preview': { input:2,output:12,above200k:[4,18] },
    'gemini-3.8-flash': { input:0.75,output:3.75,afterDate:'2027-01-01',afterRates:[1.50,7.50] },
    'gemini-3.7-flash': { input:0.75,output:3.75,afterDate:'2027-01-01',afterRates:[1.50,7.50] },
    'gemini-3.6-flash': { input:0.75,output:3.75,afterDate:'2027-01-01',afterRates:[1.50,7.50] },
    'gemini-3.5-flash-lite': { input:0.30,output:2.50 },
    'gemini-4-argon': { input:2,output:10,afterDate:'2026-12-01',afterRates:[4,20] },
  };
  // 생성할 콘텐츠의 개수와 출력 상한을 선택한다.
  // 예상 출력량은 비용 *견적*에만 사용한다. API가 실제로 생성한 토큰 수에 따라 청구액은 달라진다.
  const OUTPUT_SIZES = {
    basic: { label:'1단계 · 적게', estimate:2400, max:8192 },
    light: { label:'2단계 · 약간', estimate:5500, max:12288 },
    standard: { label:'3단계 · 보통', estimate:9000, max:16384 },
    rich: { label:'4단계 · 풍부', estimate:14000, max:32768 },
    large: { label:'5단계 · 대량', estimate:22000, max:49152 },
  };
  const OUTPUT_TARGETS = {"phone":{"basic":{"messages":3,"calls":4,"searches":6,"notes":2,"social":3,"photos":4},"light":{"messages":5,"calls":6,"searches":10,"notes":4,"social":5,"photos":6},"standard":{"messages":7,"calls":9,"searches":15,"notes":6,"social":7,"photos":9},"rich":{"messages":9,"calls":12,"searches":20,"notes":9,"social":10,"photos":12},"large":{"messages":12,"calls":17,"searches":28,"notes":12,"social":14,"photos":17}},"pc":{"basic":{"folders":2,"emails":3,"browser":4,"notes":2},"light":{"folders":4,"emails":6,"browser":8,"notes":4},"standard":{"folders":5,"emails":9,"browser":12,"notes":6},"rich":{"folders":7,"emails":12,"browser":16,"notes":9},"large":{"folders":10,"emails":18,"browser":23,"notes":13}},"board":{"basic":{"sections":1,"posts":4},"light":{"sections":2,"posts":6},"standard":{"sections":2,"posts":8},"rich":{"sections":3,"posts":10},"large":{"sections":4,"posts":13}},"news":{"basic":3,"light":6,"standard":9,"rich":12,"large":18},"wiki":{"basic":2,"light":4,"standard":6,"rich":9,"large":13},"live":{"basic":{"chat":20,"highlights":2},"light":{"chat":45,"highlights":4},"standard":{"chat":75,"highlights":6},"rich":{"chat":110,"highlights":8},"large":{"chat":170,"highlights":12}},"x":{"basic":{"posts":8,"trends":3},"light":{"posts":18,"trends":5},"standard":{"posts":27,"trends":7},"rich":{"posts":38,"trends":9},"large":{"posts":55,"trends":12}},"groupchat":{"basic":{"rooms":1,"messages":16},"light":{"rooms":2,"messages":20},"standard":{"rooms":3,"messages":25},"rich":{"rooms":4,"messages":30},"large":{"rooms":5,"messages":36}}};
  const DIARY_SIZES = {"basic":{"min":250,"length":"300~550"},"light":{"min":470,"length":"550~900"},"standard":{"min":750,"length":"900~1400"},"rich":{"min":1200,"length":"1400~2100"},"large":{"min":2000,"length":"2300~3300"}};
  const OUTPUT_QUANTITY = Object.fromEntries(Object.entries(OUTPUT_TARGETS).map(([kind,levels]) => [kind,Object.fromEntries(Object.entries(levels).map(([level,targets])=>[level,typeof targets==='number'?`${targets}개 이상`:Object.entries(targets).map(([name,count])=>`${name} ${count}개`).join(', ')]))]));
  OUTPUT_QUANTITY.diary = Object.fromEntries(Object.entries(DIARY_SIZES).map(([level,rule])=>[level,`일기 딱 1편, 같은 하루의 본문 ${rule.length}자.`]));
  const outputSize = s => OUTPUT_SIZES[s] ? s : 'rich';
  const MODEL_FALLBACK = [
    ['gemini-2.5-flash','Gemini 2.5 Flash'],
    ['gemini-2.5-flash-lite','Gemini 2.5 Flash-Lite'],
    ['gemini-2.5-pro','Gemini 2.5 Pro'],
    ['gemini-3-flash-preview','Gemini 3 Flash (미리보기)'],
    ['gemini-3.1-flash-lite','Gemini 3.1 Flash-Lite'],
    ['gemini-3.1-pro-preview','Gemini 3.1 Pro (미리보기)'],
    ['gemini-3.8-flash','Gemini 3.8 Flash'],
    ['gemini-3.7-flash','Gemini 3.7 Flash'],
    ['gemini-3.6-flash','Gemini 3.6 Flash'],
    ['gemini-3.5-flash-lite','Gemini 3.5 Flash-Lite'],
    ['gemini-4-argon','Gemini 4 Argon'],
  ];
  // 추론 제어: Gemini 3/4는 thinkingLevel, Gemini 2.5는 thinkingBudget을 사용한다.
  // 제공하지 않는 강도는 UI에서도 선택할 수 없도록 한다.
  const THINKING_LABELS = { auto:'모델 기본값 (자동)', off:'추론 끔', minimal:'최소', low:'낮음', medium:'보통', high:'높음' };
  function thinkingOptions(model) {
    const id=String(model||'').toLowerCase();
    if(/^gemini-2\.5-/.test(id))return id.includes('pro')?['auto','low','medium','high']:['auto','off','low','medium','high'];
    if(id==='gemini-4-argon'||id==='gemini-3.8-flash'||id==='gemini-3.7-flash'||id==='gemini-3.1-pro-preview')return ['auto','low','medium','high'];
    if(id==='gemini-3.6-flash'||id==='gemini-3.5-flash'||id==='gemini-3.5-flash-lite'||id==='gemini-3.1-flash-lite'||id==='gemini-3-flash-preview'||id==='gemini-3-flash')return ['auto','minimal','low','medium','high'];
    return ['auto'];
  }
  function validThinking(model, level) {
    return thinkingOptions(model).includes(level)?level:'auto';
  }
  function thinkingConfig(model, level) {
    const chosen=validThinking(model,level);
    if(chosen==='auto')return null; // 지정하지 않으면 모델 기본 동작 사용
    if(/^gemini-2\.5-/.test(String(model||'').toLowerCase())){
      const budgets={off:0,low:1024,medium:8192,high:24576};
      return {thinkingBudget:budgets[chosen]};
    }
    return {thinkingLevel:chosen};
  }
  // 표시용 추정치. 실제 사고 토큰 사용량과 별개이며 비용을 보장하지 않는다.
  function estimateThinkingTokens(model,level,count) {
    const chosen=validThinking(model,level);
    const perCall={off:0,minimal:250,low:900,medium:2400,high:6000};
    if(chosen==='auto') {
      const id=String(model||'').toLowerCase();
      if(id.includes('flash-lite'))return 200*count;
      if(id.includes('pro')||id.includes('3-flash'))return 5000*count;
      return 2400*count;
    }
    return (perCall[chosen]||0)*count;
  }
  const fmtNumber = n => Math.round(n).toLocaleString('ko-KR');
  function estimateBill(model, input, output) {
    const p=PRICES[model]; if (!p) return null;
    const rates = p.afterDate && new Date() >= new Date(p.afterDate+'T00:00:00+09:00') ? p.afterRates : p.above200k && input>200000 ? p.above200k : [p.input,p.output];
    return (input*rates[0]+output*rates[1])/1000000;
  }
  function usd(n) { return n==null?'요금 정보 없음':('$'+n.toFixed(n<0.01?5:4)); }
  function krw(n, rate = DEFAULT_KRW_PER_USD) {
    if(n == null) return '원화 환산 불가';
    const won=n*clamp(rate, 1, 100000);
    return '₩'+won.toLocaleString('ko-KR', {minimumFractionDigits:0,maximumFractionDigits:won<10?2:0});
  }
  function priced(n, rate = DEFAULT_KRW_PER_USD) {
    return n==null?'요금 정보 없음':`${usd(n)} (약 ${krw(n,rate)})`;
  }
  const approxTokens = t => Math.max(1,Math.ceil(String(t||'').length/2.2));


  const FREE_CAPS=[
    [2048,'짧게 · 최대 2,048토큰'],[4096,'보통 · 최대 4,096토큰'],
    [8192,'길게 · 최대 8,192토큰'],[16384,'아주 길게 · 최대 16,384토큰'],
    [32768,'대량 · 최대 32,768토큰'],
  ];
  const FREE_REF_KEYS=['rp','world','character','user','story'];
  const defaultFreeDraft=()=>({title:'',prompt:'',outputCap:8192,
    refs:{rp:true,world:true,character:true,user:false,story:true},character:'',
    rangeMode:'recent',recentTurns:30,rangeFrom:1,rangeTo:30});
  function normalizeFreeDraft(raw){
    const d=defaultFreeDraft(),v=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    return {title:String(v.title??'').slice(0,120),prompt:String(v.prompt??'').slice(0,120000),
      outputCap:FREE_CAPS.some(x=>x[0]===Number(v.outputCap))?Number(v.outputCap):8192,
      refs:Object.fromEntries(FREE_REF_KEYS.map(k=>[k,typeof v.refs?.[k]==='boolean'?v.refs[k]:d.refs[k]])),
      character:String(v.character??'').slice(0,60),rangeMode:v.rangeMode==='range'?'range':'recent',
      recentTurns:clamp(v.recentTurns??30,1,2000),rangeFrom:clamp(v.rangeFrom??1,1,2000),rangeTo:clamp(v.rangeTo??30,1,2000)};
  }
  function sanitizeFreePresets(raw){
    return arr(raw).filter(p=>p&&typeof p.name==='string'&&typeof p.prompt==='string')
      .slice(0,300).map(p=>({id:String(p.id||uid()).slice(0,100),name:p.name.trim().slice(0,70),
        title:String(p.title||'').slice(0,120),prompt:p.prompt.slice(0,120000)})).filter(p=>p.name);
  }
  function defaultSettings() {
    const common = {};
    for (const k of ['world', 'character', 'relationship']) common[k] = { enabled: false, value: '' };
    const perKind = {};
    for (const k of TYPES) perKind[k.key] = { enabled: false, value: '' };
    return { model: 'gemini-2.5-flash', thinkingLevel:'auto', outputSize:'standard', common, perKind, themes: defaultThemes(), groupchatBasePrompt: GROUPCHAT_BASE_PROMPT, freeDraft:defaultFreeDraft(), characterProfiles: {}, userProfile: '', storyNotes: '', characters: [], selectedPerson: '', rangeMode: 'recent', recentTurns: 30, rangeFrom: 1, rangeTo: 30, userName: '', krwPerUsd: DEFAULT_KRW_PER_USD, lastTab: 'phone' };
  }
  function normalizeSettings(x) {
    const d = defaultSettings(), s = x && typeof x === 'object' ? x : {};
    const blocks = key => Object.fromEntries(Object.entries(d[key]).map(([k, def]) => [k, { enabled: !!(s[key]?.[k]?.enabled ?? def.enabled), value: String(s[key]?.[k]?.value ?? def.value) }]));
    const themes = Object.fromEntries(TYPES.map(t=>[t.key, validTheme(t.key, s.themes?.[t.key] ?? d.themes[t.key])]));
    const characterProfiles = Object.fromEntries(Object.entries(s.characterProfiles && typeof s.characterProfiles==='object' && !Array.isArray(s.characterProfiles) ? s.characterProfiles : {})
      .filter(([name,body])=>name && name.length<=60 && typeof body==='string')
      .slice(0,80).map(([name,body])=>[name,body.slice(0,30000)]));
    const common = blocks('common');
    let storyNotes = String(s.storyNotes||'').slice(0,60000);
    // One-time migration: previously active shared character/relationship notes move into
    // editable story notes. Disabled fields remain stored but are no longer sent to Gemini.
    for(const [key,label] of [['character','기존 공통 캐릭터 정보'],['relationship','기존 유저와 캐릭터의 관계']]){
      if(!common[key].enabled||!common[key].value.trim())continue;
      const migrated=`[${label}]\n${common[key].value.trim()}`;
      if(!storyNotes.includes(migrated))storyNotes=[storyNotes,migrated].filter(Boolean).join('\n\n').slice(0,60000);
      common[key]={enabled:false,value:''};
    }
    return { ...d, ...s, common, perKind: blocks('perKind'), themes, freeDraft:normalizeFreeDraft(s.freeDraft), characterProfiles, userProfile: String(s.userProfile||'').slice(0,30000), storyNotes, groupchatBasePrompt: typeof s.groupchatBasePrompt==='string' && s.groupchatBasePrompt!==LEGACY_GROUPCHAT_BASE_PROMPT ? s.groupchatBasePrompt.slice(0,300000) : d.groupchatBasePrompt, characters: arr(s.characters).filter(x => typeof x === 'string').slice(0, 80), selectedPerson: String(s.selectedPerson || ''), model: String(s.model || d.model), thinkingLevel:validThinking(String(s.model||d.model),String(s.thinkingLevel||'auto')), outputSize:outputSize(s.outputSize), rangeMode: s.rangeMode === 'range' ? 'range' : 'recent', recentTurns: clamp(s.recentTurns ?? 30, 1, 2000), rangeFrom: Math.max(1, integer(s.rangeFrom, 1)), rangeTo: Math.max(1, integer(s.rangeTo, 30)), userName: String(s.userName||'').trim().slice(0,100), krwPerUsd: clamp(s.krwPerUsd??DEFAULT_KRW_PER_USD, 1, 100000) };
  }
  const getGM = async (k, d) => typeof GM_getValue === 'function' ? GM_getValue(k, d) : (localStorage.getItem(k) ?? d);
  const setGM = async (k, v) => typeof GM_setValue === 'function' ? GM_setValue(k, v) : localStorage.setItem(k, v);
  function roomFromURL() {
    const p = location.pathname;
    const m = p.match(/^\/stories\/[^/]+\/episodes\/([^/?#]+)/) || p.match(/^\/characters\/[^/]+\/chats\/([^/?#]+)/) || p.match(/^\/u\/[^/]+\/c\/([^/?#]+)/);
    return m?.[1] || '';
  }

  function dbOpen() {
    return new Promise((resolve, reject) => {
      const q = indexedDB.open(DB_NAME, 1);
      q.onupgradeneeded = () => {
        const db = q.result;
        if (!db.objectStoreNames.contains('records')) {
          const os = db.createObjectStore('records', { keyPath: 'id' });
          os.createIndex('room', 'room', { unique: false });
        }
      };
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error || new Error('저장소를 열 수 없습니다.'));
    });
  }
  let dbPromise = null;
  const database = () => dbPromise ||= dbOpen().catch(e => { dbPromise = null; throw e; });
  async function listRecords(room) {
    if (!room) return [];
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const q = tx.objectStore('records').index('room').getAll(room);
      q.onsuccess = () => resolve((q.result || []).sort((a,b) => b.createdAt - a.createdAt));
      q.onerror = () => reject(q.error);
    });
  }
  async function putRecord(item) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function deleteRecords(ids) {
    if (!ids.length) return;
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      ids.forEach(id => store.delete(id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  // 채팅방에 상관없이 열람실에서 생성한 기록 수만 확인한다.
  async function countAllRecords() {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const q = tx.objectStore('records').count();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error || new Error('전체 기록 개수를 확인할 수 없습니다.'));
      tx.onerror = () => reject(tx.error || new Error('전체 기록 개수를 확인할 수 없습니다.'));
    });
  }

  // 현재 채팅방만이 아니라 모든 채팅방의 생성 기록을 일괄 삭제한다.
  // 실제 채팅, API 키 및 채팅방별 프롬프트/설정은 건드리지 않는다.
  async function deleteAllGeneratedRecords() {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('전체 생성 기록 삭제에 실패했습니다.'));
      tx.onabort = () => reject(tx.error || new Error('전체 생성 기록 삭제가 취소되었습니다.'));
    });
  }

  function xhr(method, url, data = undefined, headers = {}, timeout = 45000) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('Tampermonkey GM_xmlhttpRequest 권한이 필요합니다.'));
      GM_xmlhttpRequest({ method, url, timeout, headers: { Accept: 'application/json', ...headers }, data: data == null ? undefined : JSON.stringify(data),
        onload: r => {
          if (r.status < 200 || r.status >= 300) {
            let detail = '';
            try { detail = JSON.parse(r.responseText)?.error?.message || ''; } catch (_) {}
            const err=new Error(`HTTP ${r.status}${detail ? ' · ' + detail : ''}`); err.httpStatus=r.status; err.fromHttpResponse=true; return reject(err);
          }
          try { resolve(JSON.parse(r.responseText)); } catch (_) { reject(new Error('서버 응답이 올바른 JSON이 아닙니다.')); }
        },
        onerror: () => reject(new Error('네트워크 연결 실패')), ontimeout: () => reject(new Error('API 응답 시간 초과')) });
    });
  }
  function authToken() {
    const hit = document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('access_token='));
    if (!hit) throw new Error('크랙 로그인 토큰을 읽을 수 없습니다. 로그인 후 새로고침해 주세요.');
    return decodeURIComponent(hit.slice('access_token='.length));
  }
  async function fetchPage(room, cursor) {
    const path = `${encodeURIComponent(room)}/messages?limit=50${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
    const headers = { Authorization: 'Bearer ' + authToken(), 'Content-Type': 'application/json', platform: 'web', 'wrtn-locale': 'ko-KR' };
    let res;
    try { res = await xhr('GET', API_A + path, undefined, headers); }
    catch (e) { if (!/HTTP (404|405|5\d\d)|네트워크|시간 초과/i.test(String(e.message))) throw e; res = await xhr('GET', API_B + path, undefined, headers); }
    const d = res?.data || res;
    if (!Array.isArray(d?.messages)) throw new Error('크랙 메시지 API 형식이 예상과 다릅니다.');
    return { messages: d.messages, next: d.hasNext === false || d.nextCursor == null ? '' : String(d.nextCursor) };
  }
  const role = m => String(m?.role || m?.speaker || '');
  const messageId = m => String(m?._id || m?.id || m?.messageId || '');
  const messageText = m => (typeof m?.content === 'string' && m.content.trim() ? m.content : typeof m?.message === 'string' ? m.message : '');
  function stripHidden(s) {
    let t = String(s || '');
    // 대화에 포함된 숨김 메타데이터를 제외해 실제 RP 내용만 사용한다.
    t = t.replace(/\n*\[\/\/\]: # "MEMO_NOTE v3[^\n]*\n[\s\S]*?\n[ \t]*MEMO_NOTE_END"/g, '')
      .replace(/\n*\[\/\/\]: # \(MEMO_NOTE v2[^\n]*\)\n(?:\[\/\/\]: # \([^\n]*\)\n?)*?\[\/\/\]: # \(MEMO_NOTE_END\)/g, '')
      .replace(/\n*<!--MEMO_NOTE[\s\S]*?MEMO_NOTE_END-->/gi, '')
      .replace(/\n*\[\/\/\]: # "MEMO_NOTE v3[\s\S]*$/g, '')
      .replace(/(?:\\|\?)?<!--RP_CONTEXT_MANAGER_START\b[\s\S]*?RP_CONTEXT_MANAGER_END-->/gi, '')
      .replace(/(?:\\|\?)?&lt;!--RP_CONTEXT_MANAGER_START\b[\s\S]*?RP_CONTEXT_MANAGER_END--&gt;/gi, '')
      .replace(/<rp_context_manager\b[\s\S]*?<\/rp_context_manager>/gi, '')
      .replace(/<!--RP_CTX\b[\s\S]*?RP_CTX_END-->/gi, '')
      .replace(/<!--WISH_SESSION_SETUP_START\b[\s\S]*?WISH_SESSION_SETUP_END-->/gi, '')
      .replace(/&lt;!--WISH_SESSION_SETUP_START\b[\s\S]*?WISH_SESSION_SETUP_END--&gt;/gi, '')
      .replace(/^\s*\[\/\/\]: # \(RP_COG_V1\|[^\n]*\)\s*$/gmi, '');
    // 불완전하게 복사된 숨김 블록도 컨텍스트로 보내지 않는다.
    t = t.replace(/<!--(?:RP_CONTEXT_MANAGER_START|WISH_SESSION_SETUP_START)[\s\S]*$/gi, '');
    return t.trim();
  }
  function sortOld(list) {
    const ids = new Set();
    const uniq = list.filter(m => { const id = messageId(m); if (!id) return true; if (ids.has(id)) return false; ids.add(id); return true; });
    return uniq.every(x => x.createdAt) ? uniq.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)) : uniq.reverse();
  }
  // 편집·리롤로 분기된 메시지 중 현재 유효한 대화 흐름만 선택한다.
  function liveBranch(list) {
    const chat = list.filter(x => ['user','assistant'].includes(role(x)));
    const counts = new Map();
    for (const m of chat) if (m.turnId) counts.set(String(m.turnId), (counts.get(String(m.turnId)) || 0) + 1);
    const usable = x => x?.turnId && counts.get(String(x.turnId)) === 1;
    const byTurn = new Map(chat.filter(usable).map(x=>[String(x.turnId),x]));
    let m = chat[chat.length - 1];
    if (!usable(m)) return chat;
    const keep = new Set(); let oldest = m;
    while (m && usable(m) && !keep.has(m)) { keep.add(m); oldest = m; m = m.parentTurnId ? byTurn.get(String(m.parentTurnId)) : null; }
    const cut = chat.indexOf(oldest);
    return chat.filter((x,i)=> i < cut || keep.has(x));
  }
  function segmentTurns(messages) {
    const turns = [];
    for (const m of messages) {
      if (role(m) === 'user') turns.push([]);
      if (!turns.length) turns.push([]); // 최초 인삿말 등
      turns[turns.length - 1].push(m);
    }
    return turns.filter(x => x.length);
  }
  async function readConversation(room, mode, from, to, onStatus, userName = '') {
    const newest = [], seenCursor = new Set(); let cursor = '', completed = false;
    const nWanted = mode === 'recent' ? clamp(to, 1, 2000) : null;
    const maxPages = 220;
    for (let page = 0; page < maxPages; page++) {
      if (onStatus) onStatus(`대화 기록 읽는 중 · ${page + 1}페이지`);
      const p = await fetchPage(room, cursor);
      newest.push(...p.messages);
      if (!p.next) { completed = true; break; }
      if (seenCursor.has(p.next) || p.next === cursor) throw new Error('페이지 커서가 반복되어 읽기를 중단했습니다.');
      if (mode === 'recent' && newest.filter(m=>role(m)==='user').length >= nWanted + 5) break;
      seenCursor.add(p.next); cursor = p.next;
    }
    if (mode === 'range' && !completed) throw new Error('전체 대화가 너무 길어 현재 최대 220페이지까지 읽었습니다. 최근 N턴 모드를 사용해 주세요.');
    let timeline = liveBranch(sortOld(newest)).filter(x => ['user','assistant'].includes(role(x)));
    const groups = segmentTurns(timeline);
    let selected, label;
    if (mode === 'range') {
      if (from > to) throw new Error('시작 턴이 끝 턴보다 큽니다.');
      selected = groups.slice(from - 1, to);
      label = `${from}~${Math.min(to, groups.length)}턴 (전체 ${groups.length}턴)`;
    } else {
      selected = groups.slice(-nWanted);
      label = `최근 ${selected.length}턴`;
    }
    const picked = selected.flat();
    if (!picked.length) throw new Error('선택한 범위에 RP 대화가 없습니다.');
    const userTag = userName.trim() ? `유저 캐릭터: ${userName.trim().replace(/[\r\n\[\]]/g,' ').slice(0,100)}` : 'USER';
    const content = picked.map(m => `[${role(m)==='user'?userTag:'CHARACTER'}]\n${stripHidden(messageText(m))}`).filter(x=>x.trim()).join('\n\n');
    if (!content.trim()) throw new Error('대화 본문이 비어 있습니다.');
    // 너무 긴 범위는 조용히 잘라내지 않고 사용자에게 알림.
    if (content.length > 700000) throw new Error(`대화가 너무 깁니다 (${content.length.toLocaleString()}자). 턴 수를 줄여 주세요.`);
    return { content, label, count: selected.length };
  }
  // 과금 여부가 확실하지 않은 실패는 재요청하지 않는다.
  // Google Gemini 청구 문서에서 토큰 비과금으로 명시한 HTTP 500만 재시도한다.
  // 400 역시 비과금이지만 대부분 영구적인 요청 오류라서 재시도하지 않는다.
  const GEMINI_MAX_ATTEMPTS=5; // 최초 시도 포함 총 5회
  const isSafeRetryError=e=>e?.fromHttpResponse===true && e?.httpStatus===500;
  async function gemini(systemInstruction, userContent, model, apiKey, outputCap = 2048, thinking='auto', onRetry=()=>{}) {
    const generationConfig={temperature:0.85,maxOutputTokens:Math.max(1024,Math.min(65536,outputCap)),responseMimeType:'application/json'};
    const reasoning=thinkingConfig(model,thinking);
    if(reasoning)generationConfig.thinkingConfig=reasoning;
    const body={
      systemInstruction:{parts:[{text:systemInstruction}]},
      contents:[{role:'user',parts:[{text:userContent}]}],
      generationConfig,
    };
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let res,attempt=0;
    while(attempt<GEMINI_MAX_ATTEMPTS){
      attempt++;
      try {
        res=await xhr('POST',url,body,{'x-goog-api-key':apiKey,'Content-Type':'application/json'},240000);
        break;
      } catch(e) {
        if(!isSafeRetryError(e)||attempt>=GEMINI_MAX_ATTEMPTS){
          if(isSafeRetryError(e)&&attempt>=GEMINI_MAX_ATTEMPTS)e.message+=` · 무료 실패 재시도 포함 ${attempt}회 후 중단`;
          e.attempts=attempt;
          throw e;
        }
        const delay=Math.min(8000,1000*2**(attempt-1));
        onRetry(attempt+1,GEMINI_MAX_ATTEMPTS,delay);
        await new Promise(resolve=>setTimeout(resolve,delay));
      }
    }
    const choice=res.candidates?.[0];
    const raw=arr(choice?.content?.parts).filter(x=>!x.thought).map(x=>x.text||'').join('');
    if(!raw){const e=new Error(`Gemini 응답이 비어 있습니다. ${choice?.finishReason||res?.promptFeedback?.blockReason||''}. 이미 처리된 요청일 수 있어 자동 재시도하지 않아.`);e.apiUsage=res.usageMetadata||{};e.requestAttempts=attempt;throw e;}
    const cleaned=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'');
    try{return {payload:JSON.parse(cleaned),usage:res.usageMetadata||{},attempts:attempt};}
    catch(_){
      const a=cleaned.indexOf('{'),z=cleaned.lastIndexOf('}');
      if(a>=0&&z>a){try{return {payload:JSON.parse(cleaned.slice(a,z+1)),usage:res.usageMetadata||{},attempts:attempt};}catch(_){}}
      const e=new Error('Gemini 응답 JSON을 해석할 수 없습니다 ('+(choice?.finishReason||'파싱 실패')+'). 과금됐을 수 있어 자동 재요청하지 않아.');e.apiUsage=res.usageMetadata||{};e.requestAttempts=attempt;throw e;
    }
  }

  // 자유 생성 전용: 기본 콘텐츠 JSON 강제 옵션이나 세계관 지침을 넣지 않는다.
  async function geminiFreeText(userContent,model,apiKey,outputCap,thinking='auto',onRetry=()=>{}){
    const generationConfig={temperature:0.85,maxOutputTokens:Math.max(1024,Math.min(32768,outputCap))};
    const reasoning=thinkingConfig(model,thinking);
    if(reasoning)generationConfig.thinkingConfig=reasoning;
    const body={contents:[{role:'user',parts:[{text:userContent}]}],generationConfig};
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let res,attempt=0;
    while(attempt<GEMINI_MAX_ATTEMPTS){
      attempt++;
      try{res=await xhr('POST',url,body,{'x-goog-api-key':apiKey,'Content-Type':'application/json'},240000);break;}
      catch(e){
        if(!isSafeRetryError(e)||attempt>=GEMINI_MAX_ATTEMPTS){e.attempts=attempt;throw e;}
        const delay=Math.min(8000,1000*2**(attempt-1));
        onRetry(attempt+1,GEMINI_MAX_ATTEMPTS,delay);
        await new Promise(resolve=>setTimeout(resolve,delay));
      }
    }
    const choice=res?.candidates?.[0];
    const result=arr(choice?.content?.parts).filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
    if(!result)throw new Error('Gemini가 빈 텍스트를 반환했어 ('+(choice?.finishReason||'응답 없음')+'). 자동 재요청하지 않아.');
    return {text:result,usage:res.usageMetadata||{},attempts:attempt};
  }

  async function fetchModels(apiKey) {
    if (!apiKey) throw new Error('API 키를 먼저 입력해 줘.');
    const all=[]; let pageToken='';
    for(let i=0;i<5;i++) {
      const url='https://generativelanguage.googleapis.com/v1beta/models?pageSize=200'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):'');
      const r=await xhr('GET',url,undefined,{'x-goog-api-key':apiKey});
      all.push(...arr(r.models)); pageToken=r.nextPageToken||''; if(!pageToken) break;
    }
    return all.filter(m=>arr(m.supportedGenerationMethods).includes('generateContent')
      && /^models\/gemini-/i.test(m.name) && !/(image|tts|audio|live|embedding|vision|robotics|computer-use)/i.test(m.name))
      .map(m=>[m.name.replace(/^models\//,''),m.displayName||m.name.replace(/^models\//,'')]);
  }

  const FORMATS = {
    phone: `{"owner":"캐릭터 이름","wallpaper":"폰 배경의 짧은 설명","messages":[{"person":"대화 상대","time":"시간","unread":true,"thread":[{"from":"me 또는 them","text":"메시지","time":"시간"}]}],"calls":[{"name":"상대","kind":"부재중/수신/발신","time":"시간"}],"searches":["검색어"],"notes":[{"title":"제목","body":"메모 전체"}],"social":[{"handle":"작성자","time":"시간","text":"게시물","likes":123,"comments":[{"by":"계정","text":"댓글"}]}],"photos":[{"caption":"사진 설명","date":"날짜","emoji":"📷"}]}`,
    pc: `{"owner":"캐릭터 이름","os":"OS 분위기","folders":[{"name":"폴더","files":[{"title":"파일명","body":"파일 내용","date":"수정 일시"}]}],"emails":[{"from":"보낸 사람","to":"받는 사람","subject":"제목","body":"메일 내용","date":"날짜","starred":false}],"browser":[{"title":"방문 웹페이지","url":"가상 URL","query":"검색어","summary":"방문 페이지 내용"}],"notes":[{"title":"제목","body":"개인 문서"}]}`,
    diary: `{"owner":"캐릭터 이름","entries":[{"date":"일기 날짜","title":"일기 제목","mood":"그날 기분","weather":"날씨","body":"한 편의 구체적인 1인칭 일기 본문"}]}`,
    board: `{"site":"세계관 커뮤니티 이름","sections":[{"name":"게시판 이름","posts":[{"title":"게시글 제목","author":"닉네임","time":"작성 시간","views":123,"likes":12,"body":"게시글 본문","comments":[{"author":"닉네임","text":"댓글"}]}]}]}`,
    news: `{"site":"가상 뉴스 사이트 이름","articles":[{"category":"카테고리","title":"기사 제목","author":"기자","date":"날짜","lede":"리드문","body":"기사 전체","comments":[{"author":"닉네임","text":"댓글"}]}]}`,
    wiki: `{"site":"가상 위키 이름","docs":[{"title":"문서명","summary":"소개","sections":[{"heading":"항목 제목","body":"설명"}],"discussion":[{"author":"편집자","text":"토론"}]}]}`,
    live: `{"show":"드라마/방송 제목","episode":"이번 화 제목","chat":[{"user":"시청자 닉네임","time":"타임스탬프","text":"채팅","donation":0}],"highlights":[{"title":"장면","text":"클립 설명"}]}`,
    groupchat: `{"owner":"선택한 캐릭터 이름","site":"채팅 서비스 이름","rooms":[{"title":"선택한 캐릭터가 참여한 단체 채팅방 제목","participants":["선택한 캐릭터","다른 참여자1","다른 참여자2"],"messages":[{"sender":"참여자 이름(선택한 캐릭터도 반드시 여러 번 발화)","time":"시간","text":"메시지 내용"}]}]}`,
    x: `{"site":"가상의 SNS 이름","trends":[{"tag":"화제 키워드","count":"1.2만"}],"posts":[{"author":"표시 이름","handle":"계정아이디","time":"게시 시간","text":"짧은 글 본문","likes":120,"reposts":9,"replies":[{"author":"다른 계정명","handle":"다른아이디","text":"답글 내용"}]}]}`,
  };
  const LEGACY_GROUPCHAT_BASE_PROMPT = '세계관의 인물들이 나누는 사적인 단체 대화방과 대화 기록을 만든다. 각 방에는 3명 이상이 참여하고, 인물마다 성격·말투·관계가 드러나는 대화를 시간순으로 구성한다. RP를 보는 외부 시청자 채팅이 아닌 세계관 내부 인물들의 대화다.';
  const GROUPCHAT_BASE_PROMPT = '선택한 캐릭터가 실제로 참여하는 사적인 단체 채팅방을 만든다. 모든 방의 참여자에 선택한 캐릭터를 포함하고, 그 캐릭터가 직접 보낸 메시지도 여러 개 작성한다. 다른 참여자는 RP에서 해당 캐릭터와 관계있는 인물을 우선한다. 방마다 3명 이상이 대화하며, 인물별 성격·말투·관계와 대화의 흐름을 살린다. 외부 시청자 채팅이 아닌 캐릭터 본인의 단톡 기록이다.';
  const DESCRIPTIONS = {
    phone: '선택한 캐릭터의 개인 통신·기록 장치를 엿보는 듯한 문자, 통화, 메모, 검색, 소셜 활동, 사진 등의 기록을 다양하게 구성한다. 해당 기능이 없는 세계관에서는 서신·전언·교신·그림 등 대응 수단으로 표현한다.',
    pc: '선택한 캐릭터의 개인 정보·문서 보관 공간을 엿보는 듯한 파일, 서신, 정보 탐색 기록, 개인 문서를 현실감 있게 구성한다. 기록 매체와 정리 방식은 세계관에 맞춘다.',
    diary: '선택한 캐릭터가 직접 쓰는 하루치 비공개 일기 한 편을 작성한다. 성격·말투·시대적 배경을 반영하고, 사건과 감정, 후회·욕망·질투 등 숨겨진 속마음을 솔직한 1인칭으로 깊이 있게 기록한다. 분량은 일기 수가 아닌 본문 길이에 적용한다.',
    board: '세계관의 일반 사람들이 소식·소문·의견을 나누는 공간이다. 다양한 주제의 게시판과 글, 댓글을 만들고, 참여자의 신분·성격·입장에 따른 말투와 반응을 살린다.',
    news: '세계관에서 발행되거나 전파될 법한 뉴스와 소식 기록을 여러 개 만든다. 다양한 사건을 다루며 매체의 성향, 보도 문체, 독자 반응의 차이를 살린다.',
    wiki: '세계관의 인물·사건·지역·조직·역사 등을 정리한 지식 자료를 만든다. 세부 항목과 기록자들의 해석·논쟁을 구체적으로 작성하고, 사실과 소문을 구분한다.',
    live: 'RP 장면을 드라마로 시청하는 외부 관객들의 실시간 채팅을 만든다. 등장인물의 행동·관계·갈등에 대한 놀람·웃음·추측·논쟁 등 다양한 반응을 생생하게 표현한다.',
    groupchat: GROUPCHAT_BASE_PROMPT,
    x: '세계관 사람들이 짧은 소식·의견·소문을 공유하는 공간이다. 다양한 참여자의 입장과 유행·풍자·논쟁, 소식의 확산을 표현한다. 특정 캐릭터의 개인 일기로 만들지 않는다.',
  };
  function instructionFor(type, person, settings, partInstruction = '') {
    const common = [['world','세계관']]
      .filter(([k])=>settings.common[k].enabled && settings.common[k].value.trim())
      .map(([k,label])=>`[추가 ${label}]\n${settings.common[k].value.trim()}`);
    const spec = settings.perKind[type];
    const extra = spec.enabled && spec.value.trim() ? `[${typeOf(type).label} 전용 추가 지시]\n${spec.value.trim()}` : '';
    const description = type==='groupchat' ? String(settings.groupchatBasePrompt??GROUPCHAT_BASE_PROMPT).trim() || GROUPCHAT_BASE_PROMPT : DESCRIPTIONS[type];
    const charProfiles=Object.entries(settings.characterProfiles||{}).filter(([name,body])=>name.trim() && typeof body==='string' && body.trim());
    const selectedProfile=charProfiles.find(([name])=>name===person);
    const referenceProfiles=typeOf(type).person
      ? (selectedProfile?[selectedProfile]:[])
      : charProfiles;
    return [
      '너는 RP 세계에 존재할 법한 개인·사회적 기록을 창작한다. 기록의 매체·내용·표현은 세계관의 시대·문화·기술·마법 수준에 맞춘다.',
      '반드시 아래 JSON 구조의 객체 하나만 반환한다. Markdown 설명이나 코드펜스는 쓰지 않는다.',
      '제공된 RP 대화에서 인물·사건·말투·시대 배경을 파악한다. 대화에 없는 상세 사항은 세계관에 맞게 자유롭게 창작해도 된다.',
      '모든 출력 텍스트는 한국어로만 쓴다. 영어·일본어 등 외국어 문장·대사는 생성하지 않는다. JSON 필드명과 URL·고유명사 등 기술적으로 필요한 표기만 예외로 한다.',
      `[유저 캐릭터 식별] RP 대화에서 [유저 캐릭터: ${settings.userName||'이름 미입력'}] 표식으로 시작한 발화의 주인공은 "${settings.userName||'이름 미입력'}"이다. 이 인물은 기록을 보는 사용자 본인이 연기하는 캐릭터이며, API 요청의 role:user와는 다르다.`,
      type==='diary'
        ? '일기는 선택한 캐릭터 본인이 직접 쓰는 솔직한 1인칭 기록으로 작성한다.'
        : `유저 캐릭터 "${settings.userName}"가 직접 작성한 게시글·댓글·SNS 게시물·메모·문서·일기·메시지·이메일 등은 생성하지 않는다. 해당 인물이 참여한 문자·메신저·이메일·통화 등의 직접 대화 로그도 생성하지 않는다.`,
      '출력 항목은 과소 생성하지 않는다. 목록의 첫 몇 개 항목만 만든 뒤 끝내지 말고, 요청된 개수만큼 실제 콘텐츠로 채운다. 항목마다 다른 소재와 자연스러운 변주를 사용한다.',
      partInstruction
        ? `[분할 생성 · 이번 호출에서 만들 분량] ${partInstruction} 이번 요청의 지시된 개수만 실제 JSON에 담는다. 다른 분량이나 전체 목표를 한 번에 만들려고 시도하지 않는다.`
        : `[생성 분량: ${OUTPUT_SIZES[outputSize(settings.outputSize)].label}] ${OUTPUT_QUANTITY[type][outputSize(settings.outputSize)]} JSON 배열 요소 수를 실제로 이 지시에 맞춘다. 겉으로만 개수를 약속하는 설명은 쓰지 않는다.`,
      `[이번 콘텐츠] ${typeOf(type).label}\n${description}`,
      typeOf(type).person ? `[열람할 캐릭터] ${person}\n이 기록의 소유자는 이 캐릭터로 한다.` : '',
      settings.userProfile?.trim()?`[유저 캐릭터 프로필 · 참고 정보]\n${settings.userProfile.trim()}`:'',
      settings.storyNotes?.trim()?`[중요 서사·사건 · 참고 정보]\n${settings.storyNotes.trim()}`:'',
      ...referenceProfiles.map(([name,body])=>`[캐릭터 정보 · ${name}]\n${body.trim()}`),
      ...common, extra,
      `[출력 데이터 구조] 다음 속성 이름과 자료형을 지킨다. 예시 데이터/이름/제목을 그대로 복사하지 말고 RP에 맞게 내용을 새로 작성한다.\n${FORMATS[type]}`,
    ].filter(Boolean).join('\n\n');
  }
  // 모든 콘텐츠의 수량 목표와 분할 호출 계산은 OUTPUT_TARGETS 한 곳에서 관리한다.
  const BATCH_UNITS = {
    phone:{messages:2,calls:4,searches:5,notes:2,social:3,photos:4},
    pc:{folders:2,emails:3,browser:4,notes:2},
    board:{posts:3}, news:{articles:3}, wiki:{docs:2},
    live:{chat:15,highlights:3}, x:{posts:6,trends:3}, groupchat:{rooms:1},
  };
  const primaryArray = {pc:'folders',diary:'entries',board:'sections',news:'articles',wiki:'docs',live:'chat',x:'posts',phone:'messages',groupchat:'rooms'};
  function requestEstimateCount(kind,size) {
    if(kind==='diary')return 1;
    if(kind==='groupchat')return OUTPUT_TARGETS.groupchat[outputSize(size)].rooms;
    const t=OUTPUT_TARGETS[kind]?.[size],u=BATCH_UNITS[kind];
    if(!t||!u)return 1;
    if(kind==='board')return t.sections*Math.ceil(t.posts/u.posts);
    // 한 묶음에서 복수 목록을 함께 생성한다. 남은 목록 보완 호출은 별도 발생할 수 있다.
    if(kind==='phone'||kind==='pc')return Math.max(...Object.keys(t).map(k=>Math.ceil(t[k]/u[k])));
    if(kind==='live'||kind==='x')return Math.ceil(t[primaryArray[kind]]/u[primaryArray[kind]])+Math.ceil(t[kind==='live'?'highlights':'trends']/u[kind==='live'?'highlights':'trends']);
    return Math.ceil(t/u[primaryArray[kind]]);
  }
  function sizeDescription(kind,size) {
    if(kind==='diary')return '하루치 일기 한 편 · 본문 '+DIARY_SIZES[size].length+'자 · 분량 부족 시 자동 재요청 없음';
    if(kind==='groupchat')return `단톡방 ${OUTPUT_TARGETS.groupchat[size].rooms}개 · 방마다 메시지 ${OUTPUT_TARGETS.groupchat[size].messages}개 목표`;
    return `분량 ${OUTPUT_SIZES[size].label} · 목표 ${OUTPUT_QUANTITY[kind][size]} · 예상 ${requestEstimateCount(kind,size)}회 내외 분할 호출`;
  }
  // 실제 생성 루틴(OUTPUT_TARGETS, DIARY_SIZES)이 참조하는 수치 그대로 미리보기 표시.
  // 분량 안내를 별도로 관리하지 않아 생성 목표와 화면 안내가 어긋나지 않도록 한다.
  const SIZE_PREVIEW_NAMES = {
    phone:{messages:'문자 대화',calls:'통화',searches:'검색',notes:'메모',social:'소셜 글',photos:'사진'},
    pc:{folders:'폴더',emails:'이메일',browser:'방문 기록',notes:'메모'},
    live:{chat:'채팅',highlights:'명장면'},
    groupchat:{rooms:'단톡방',messages:'방당 메시지'},
    x:{posts:'게시글',trends:'트렌드'},
  };
  function sizePreviewText(kind,level) {
    if (kind==='diary')return `일기 1편 · 본문 ${DIARY_SIZES[level].length}자`;
    const spec=OUTPUT_TARGETS[kind]?.[level];
    if(kind==='board')return `갤러리 ${spec.sections}개 · 게시글 총 ${spec.sections*spec.posts}개 (갤러리당 ${spec.posts}개)`;
    if(kind==='groupchat')return `단톡방 ${spec.rooms}개 · 방당 메시지 ${spec.messages}개`;
    if(typeof spec==='number')return `${kind==='news'?'기사':kind==='wiki'?'문서':'항목'} ${spec}개`;
    const labels=SIZE_PREVIEW_NAMES[kind]||{};
    return Object.entries(spec||{}).map(([key,num])=>`${labels[key]||key} ${num}개`).join(' · ');
  }
    function mergeUnique(dest,source,key) {
    const seen=new Set(dest.map(v=>String(v?.[key]||'').trim()).filter(Boolean));
    for (const item of arr(source)) {
      if(!item || typeof item!=='object')continue;
      const identity=String(item[key]||'').trim();
      if(identity && seen.has(identity))continue;
      if(identity)seen.add(identity);
      dest.push(item);
    }
  }
  function mergeUsage(into,usage) {
    for (const key of ['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'])into[key]=(into[key]||0)+integer(usage?.[key]);
  }
  // 생성 결과는 합치는 데만 사용하고 다음 API 요청에는 넣지 않는다.
  async function generateSplit(kind,person,s,log,key,onProgress) {
    const size=outputSize(s.outputSize),targets=OUTPUT_TARGETS[kind]?.[size]||null,units=BATCH_UNITS[kind];
    const diaryRule=DIARY_SIZES[size];
    const prompt=`[이번 생성에 참고할 RP 대화 · ${log.label}]\n${log.content}`;
    const usage={},calls={value:0},warnings=[];
    let billUsd=0, knownBill=true;
    const result=kind==='phone'?{owner:person,wallpaper:'',messages:[],calls:[],searches:[],notes:[],social:[],photos:[]}:
      kind==='board'?{site:'',sections:[]}:kind==='pc'?{owner:person,folders:[],emails:[],browser:[],notes:[]}:
      kind==='diary'?{owner:person,entries:[]}:kind==='live'?{show:'',episode:'',chat:[],highlights:[]}:
      kind==='groupchat'?{owner:person,site:'',rooms:[]}: 
      kind==='wiki'?{site:'',docs:[]}:kind==='news'?{site:'',articles:[]}:{site:'',trends:[],posts:[]};
    const single=async(part,cap=8192)=>{
      onProgress(`Gemini 생성 중 · ${calls.value+1}번째 요청 · 채팅 가능`);
      let response;
      try {
        response=await gemini(instructionFor(kind,person,s,part),prompt,s.model,key,cap,s.thinkingLevel,(next,total,delay)=>onProgress(`HTTP 500 · 무료 실패 재시도 ${next}/${total} · ${delay/1000}초 후`));
      } catch(e) {
        if(!e?.apiUsage && e?.attempts) calls.value+=e.attempts;
        if(e?.apiUsage){
          mergeUsage(usage,e.apiUsage);
          calls.value+=e.requestAttempts||1;
          const input=integer(e.apiUsage.promptTokenCount);
          const generated=integer(e.apiUsage.candidatesTokenCount)+integer(e.apiUsage.thoughtsTokenCount);
          const price=estimateBill(s.model,input,generated||Math.max(0,integer(e.apiUsage.totalTokenCount)-input));
          if(price==null)knownBill=false;else billUsd+=price;
          e.message+=` · API 보고 사용량 ${integer(e.apiUsage.totalTokenCount).toLocaleString('ko-KR')}토큰`;
        }
        throw e;
      }
      calls.value+=response.attempts||1; mergeUsage(usage,response.usage);
      const input=integer(response.usage?.promptTokenCount), generated=integer(response.usage?.candidatesTokenCount)+integer(response.usage?.thoughtsTokenCount);
      const price=estimateBill(s.model,input,generated||Math.max(0,integer(response.usage?.totalTokenCount)-input));
      if(price===null)knownBill=false; else billUsd+=price;
      if(!response.payload || typeof response.payload!=='object'||Array.isArray(response.payload))throw new Error('생성 응답 객체가 올바르지 않아.');
      return response.payload;
    };
    const absorbBase=out=>{
      for(const k of ['site','owner','os','show','episode','wallpaper'])if(!result[k] && out[k])result[k]=out[k];
    };
    const keys={messages:'person',calls:'name|time|kind',searches:null,notes:'title',social:'handle|time|text',photos:'caption',
      folders:'name',emails:'subject|date|from',browser:'url|query',articles:'title',docs:'title',chat:'user|time|text',highlights:'title',posts:'text',trends:'tag'};
    const fingerprint=(item,key)=>{
      if(typeof item==='string')return item.trim();
      if(!item || typeof item!=='object')return '';
      const value=key?(key.includes('|')?key.split('|').map(k=>String(item[k]||'')).join(' / '):item[key]):null;
      return String(value||item.title||item.text||item.name||item.query||item.caption||item.url||JSON.stringify(item)).trim();
    };
    const merge=(field,incoming,limit)=>{
      if(!Array.isArray(result[field]))result[field]=[];
      const dest=result[field];
      const found=new Set(dest.map(x=>fingerprint(x,keys[field])));
      for(const item of arr(incoming)){
        if(dest.length>=limit)break;
        const id=fingerprint(item,keys[field]);
        if(!id||found.has(id))continue;
        found.add(id);dest.push(item);
      }
    };
    const missingObject=t=>Object.fromEntries(Object.keys(t).map(f=>[f,Math.max(0,t[f]-arr(result[f]).length)]));
    const refillFields=async(fields,label)=>{
      let tries=0,noGrowth=0;
      const maxTries=Math.max(8,requestEstimateCount(kind,size)*8);
      while(tries<maxTries && Object.keys(fields).some(f=>arr(result[f]).length<fields[f])) {
        const request=Object.fromEntries(Object.keys(fields).map(f=>[f,Math.max(0,Math.min(units[f],fields[f]-arr(result[f]).length))]));
        const instruction=`이번 ${label} 묶음은 ${Object.entries(request).map(([f,n])=>`${f} 배열에 ${n}개`).join(', ')}를 만들어라. 반드시 지정 수량을 실제 배열 요소로 반환한다. 0개인 목록은 빈 배열로 둔다. 각 글의 내용도 빈칸 없이 자세히 작성한다. 내용과 제목은 소재가 중복되지 않게 변주한다. 이번은 ${tries+1}번째 묶음이다. 매 묶음에 다른 소재를 선택한다.`;
        const out=await single(instruction,8192);
        absorbBase(out);
        const beforeByField=Object.fromEntries(Object.keys(fields).map(f=>[f,arr(result[f]).length]));
        const before=Object.keys(fields).reduce((n,f)=>n+arr(result[f]).length,0);
        for(const field of Object.keys(fields))merge(field,out[field],fields[field]);
        const after=Object.keys(fields).reduce((n,f)=>n+arr(result[f]).length,0);
        tries++;noGrowth=after===before?noGrowth+1:0;
        const short=Object.keys(request).some(f=>request[f]>0 && arr(result[f]).length-(beforeByField[f]||0)<request[f]);
        if(short){warnings.push(`${label}: 일부 목록이 요청 수량보다 적어 추가 과금 재생성 없이 중단`);break;}
      }
      for(const field of Object.keys(fields))if(arr(result[field]).length<fields[field])warnings.push(`${label} ${field}: ${result[field].length}/${fields[field]}개`);
    };
    try {
    if(kind==='diary'){
      const out=await single(`entries 배열에는 그날 하루의 일기 1편만 넣는다. body는 선택한 캐릭터 자신의 솔직한 1인칭 일기로 한국어 ${diaryRule.length}자 분량을 목표로 쓴다. 하루의 경험과 복잡한 내면을 구체적으로 적는다. 일기 날짜·제목·날씨·기분을 포함한다.`, size==='large'?12000:8192);
      const item=arr(out.entries).find(x=>x&&typeof x==='object'&&String(x.body||'').trim());
      if(!item)throw new Error('일기 본문이 비어 있습니다. 자동 재요청하지 않았습니다.');
      absorbBase(out);
      result.entries=[item];
      const chars=String(item.body).length;
      if(chars<diaryRule.min)warnings.push(`일기 본문 ${chars}자 / 최소 목표 ${diaryRule.min}자 (자동 재요청 없음)`);
      return {payload:result,usage,calls:calls.value,warnings, billUsd:knownBill?billUsd:null};
    }
    if(kind==='groupchat'){
      const seen=new Set();
      for(let i=0;i<targets.rooms;i++){
        const out=await single(`이번 호출에는 ${person}이(가) 참여한 단톡방 1개만 생성한다. participants에 "${person}"을 정확히 포함하고, messages에 sender가 "${person}"인 메시지를 여러 개 넣는다. 최소 3명의 참가자는 ${person}과 관계가 있어야 하며 RP 등장인물을 우선한다. 다른 방과 제목·화제를 달리한다. messages는 시간순으로 ${targets.messages}개를 목표로 작성한다. 유저 캐릭터 "${s.userName}"의 직접 대사는 생성하지 않는다.`,8192);
        absorbBase(out);
        const rooms=arr(out.rooms);
        const room=rooms.find(r=>r&&typeof r==='object'&&arr(r.messages).length)||rooms[0];
        if(!room){warnings.push(`단톡방 ${i+1}: 데이터 없음`);continue;}
        const key=String(room.title||'').trim()||'단톡 '+(i+1);
        if(seen.has(key)){warnings.push(`단톡방 ${i+1}: 중복 제목`);continue;}
        const sameName=(a,b)=>String(a||'').trim().replace(/\s+/g,'').toLocaleLowerCase('ko-KR')===String(b||'').trim().replace(/\s+/g,'').toLocaleLowerCase('ko-KR');
        const messages=arr(room.messages).filter(m=>m&&typeof m==='object'&&String(m.text||'').trim()&&String(m.sender||'').trim()&&!sameName(m.sender,s.userName)).slice(0,targets.messages);
        // 선택 캐릭터가 직접 참여하지 않은 무관한 채팅방은 저장하지 않는다.
        if(!messages.some(m=>sameName(m.sender,person))){warnings.push(`단톡방 ${i+1}: 선택 캐릭터의 발화가 없어 제외`);continue;}
        const names=[...arr(room.participants),...messages.map(m=>m.sender)].map(x=>String(x||'').trim()).filter(x=>x&&!sameName(x,s.userName));
        const participants=names.filter((name,index)=>names.findIndex(other=>sameName(other,name))===index);
        if(!participants.some(name=>sameName(name,person)))participants.unshift(person);
        if(participants.length<3){warnings.push(`단톡방 ${i+1}: 참여자 3명 미만이라 제외`);continue;}
        seen.add(key);
        result.rooms.push({title:key,participants,messages});
        if(messages.length<targets.messages)warnings.push(`단톡방 ${i+1}: 메시지 ${messages.length}/${targets.messages}개`);
      }
    }else if(kind==='board'){
      const themes=['세계관 사건·소문','주민들의 일상·생활','지역·도시 소식','취미·문화·유행','직업·사회 현장','음식·상점 이야기'];
      for(let i=0;i<targets.sections;i++){
        const group={name:'',posts:[]};result.sections.push(group);
        const seen=new Set();let tries=0,noGrowth=0;
        const ceiling=Math.max(5,Math.ceil(targets.posts/units.posts)*4);
        while(group.posts.length<targets.posts&&tries<ceiling){
          const amount=Math.min(units.posts,targets.posts-group.posts.length);
          const out=await single(`sections 배열에는 갤러리 1개만 담는다. 갤러리 주제: ${themes[i%themes.length]}, 이번 ${i+1}번째 갤러리의 posts 배열에 게시글 정확히 ${amount}개, 각 글 본문 120자 이상, 댓글 3개 이상. 다른 갤러리 없이 이 주제의 일반 게시자들이 쓴 내용만. RP의 다양한 소재로 작성한다.`,8192);
          absorbBase(out);
          const item=arr(out.sections)[0]||{};
          if(!group.name)group.name=String(item.name||`갤러리 ${i+1}`);
          const before=group.posts.length;
          for(const post of arr(item.posts)){
            if(group.posts.length>=targets.posts)break;
            const id=fingerprint(post,'title');if(!id||seen.has(id))continue;
            seen.add(id);group.posts.push(post);
          }
          noGrowth=group.posts.length===before?noGrowth+1:0;
          tries++;
          if(group.posts.length-before<amount){warnings.push(`${group.name}: 게시글 부족, 추가 과금 재생성 없이 중단`);break;}
        }
        if(group.posts.length<targets.posts)warnings.push(`게시글 ${i+1}번 갤러리: ${group.posts.length}/${targets.posts}개`);
      }
    }else if(kind==='phone'||kind==='pc'){
      await refillFields(targets,kind==='phone'?'핸드폰':'컴퓨터');
    }else if(kind==='live'||kind==='x'){
      // 보조 배열도 목표치 검사. 채팅 수는 충족했어도 명장면·트렌드가 적다면 추가 생성한다.
      await refillFields(targets,kind==='live'?'실시간톡':'𝕏+');
    }else{
      await refillFields({[primaryArray[kind]]:targets},typeOf(kind).label);
    }
    } catch(e) {
      // 몇 차례 정상 생성 후 다음 분할 요청이 실패해도 유료로 만든 내용을 버리지 않는다.
      // 실패한 요청 자체는 추가로 호출하지 않는다.
      if(kind==='board')result.sections=result.sections.filter(x=>arr(x.posts).length>0);
      const count=kind==='board'?result.sections.reduce((n,x)=>n+arr(x.posts).length,0):Object.values(result).reduce((n,x)=>n+(Array.isArray(x)?x.length:0),0);
      if(!count)throw e;
      warnings.push(`중단 · ${String(e.message||e)}. 이전에 정상 생성한 ${count}개 항목만 저장했어.`);
    }
    if(kind==='groupchat' && !result.rooms.length)throw new Error('선택 캐릭터가 실제로 참여한 단톡방이 생성되지 않았어. 저장하지 않았어.');
    return {payload:result,usage,calls:calls.value,warnings,billUsd:knownBill?billUsd:null};
  }

    const FIND_PERSON_PROMPT = `너는 RP의 등장인물을 구분한다. [CHARACTER]로 발화하거나 그 메시지에 등장한 AI가 연기하는 인물들을 찾는다. [유저 캐릭터: 이름]으로 표시된 인물은 NPC가 아니므로 제외한다. 실제 본문에 나온 이름만 사용한다. 최대 12명. 반드시 {"characters":["이름1","이름2"]} 형식의 JSON 객체만 반환한다. 이름을 만들어내지 않는다.`;

  const CSS = `
/* Five output levels and generated-content navigation styles. */
.size-preview{border:1px solid #52617a;background:#131e2e;border-radius:12px;padding:11px;min-width:0}
.size-preview-head{display:flex;align-items:start;justify-content:space-between;flex-wrap:wrap;gap:4px 8px;padding:0 1px 9px}
.size-preview-head strong{font-size:13px;color:#fff;line-height:1.5}
.size-preview-head small{color:#dbe5f5;font-size:11px}
.size-preview-list{display:grid;gap:6px}
.size-preview-option{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 7px;min-width:0;width:100%;text-align:left;padding:9px 10px;background:#1e2b3f;color:#eaf2ff;border:1px solid #52627c;border-radius:8px;cursor:pointer;font:inherit;line-height:1.5}
.size-preview-option:hover{background:#283954;border-color:#95b1ee}
.size-preview-option.selected{background:#353254;border-color:#c1a7ff;box-shadow:inset 3px 0 0 #d8c6ff}
.size-preview-option:focus-visible{outline:2px solid #ded1ff;outline-offset:2px}
.size-preview-option:disabled{opacity:.65;cursor:not-allowed}
.size-preview-level{font-size:12px;font-weight:800;color:#fff;min-width:84px;flex:none}
.size-preview-count{display:block;min-width:0;flex:1 1 165px;font-size:12px;color:#e1ebfc;overflow-wrap:anywhere}
.size-preview-selected{font-size:11px;font-weight:800;color:#f0dbff;white-space:nowrap}
.size-preview-foot{font-size:11px;line-height:1.6;color:#ccd7e9;margin-top:9px}
:host{all:initial;color-scheme:dark;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif;--bg:#12141d;--surface:#1a1e2a;--surface2:#242b3b;--line:#343b4c;--fg:#edf0fa;--dim:#9aa6bb;--accent:#b6a6ff;--accent2:#8276df;font-size:14px}
*{box-sizing:border-box}button,input,textarea,select{font:inherit}button{cursor:pointer;color:inherit}input,textarea,select{background:#111622;border:1px solid #404960;border-radius:10px;padding:10px;color:#f5f6ff;min-width:0}input:focus,textarea:focus,select:focus{outline:2px solid #9c8cff}textarea{resize:vertical;width:100%;line-height:1.55}input[type=checkbox]{width:16px;height:16px;accent-color:#b6a6ff}input[type=number]{width:110px}button:disabled{opacity:.45;cursor:not-allowed}button:focus-visible{outline:2px solid #e8d7ff;outline-offset:2px}
#badge{position:fixed;right:18px;bottom:22px;z-index:2147483001;background:#211d39;color:#f7f4ff;border:1px solid #8071bc;padding:12px 16px;border-radius:18px;box-shadow:0 8px 30px #0009;font-weight:800;letter-spacing:-.03em}#badge.busy{border-color:#eec77a}#panel{position:fixed;z-index:2147483000;right:14px;bottom:74px;top:20px;width:min(1080px,calc(100vw - 28px));display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--fg);border:1px solid #555476;border-radius:20px;box-shadow:0 22px 90px #000c}#panel[hidden]{display:none}
.header{height:62px;flex:none;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:12px 18px;background:linear-gradient(90deg,#27223f,#181c2a)}.header h2{margin:0;font-size:17px;letter-spacing:-.04em}.header small{color:#a5abc3;font-size:11px;margin-left:7px}.head-actions{display:flex;gap:7px}.icon-btn{background:#303246;border:1px solid #515569;border-radius:9px;padding:8px 11px;font-weight:750}
.shell{display:grid;grid-template-columns:173px minmax(0,1fr);min-height:0;flex:1}.side{padding:14px 10px;background:#181b28;border-right:1px solid var(--line);overflow:auto}.side button{display:flex;gap:9px;align-items:center;width:100%;text-align:left;background:transparent;border:1px solid transparent;border-radius:10px;padding:12px 10px;margin-bottom:4px;font-weight:700}.side button.active{background:#342f54;border-color:#625983;color:#e1d7ff}.side .side-caption{display:block;margin:18px 8px 9px;color:var(--dim);font-size:11px}.main{min-width:0;overflow-y:auto;padding:18px}.pane-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 16px}.pane-title h3{font-size:18px;margin:0}.pane-title small{font-size:12px;color:var(--dim)}.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.stack{display:flex;flex-direction:column;gap:13px}.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px}.card h4{margin:0 0 12px;font-size:14px}.subtle{color:var(--dim);font-size:12px;line-height:1.5}.muted{color:var(--dim)}.button{border:1px solid #575d72;border-radius:10px;background:#303649;padding:10px 14px;font-weight:730}.button.primary{background:#7667c9;border-color:#8979e8;color:#fff}.button.danger{background:#6a2b3c;border-color:#a64659}.button.slim{padding:6px 10px;font-size:12px}.button.ghost{background:#202636}.pill{font-size:11px;border:1px solid #4f5270;padding:4px 8px;border-radius:999px;color:#c9cae1}.field{display:flex;flex-direction:column;gap:6px}.field>span{font-weight:700;font-size:12px;color:#cdd4e7}.field input:not([type=checkbox]),.field select{width:100%}.line{height:1px;background:var(--line);margin:10px 0}.toggle{display:flex;gap:8px;align-items:center;font-size:12px;color:#d2daee}.section-header{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px}.section-header b{font-size:13px}.info{font-size:12px;color:#a9b4d0;line-height:1.55}.warn{color:#f1c77f}.error{color:#ffa3b4}.success{color:#b0dfc0}.archive{display:flex;flex-direction:column;gap:7px;max-height:320px;overflow:auto}.archive-row{display:flex;gap:8px;align-items:center;border:1px solid #3d4559;border-radius:11px;padding:8px;background:#202534}.archive-row.selected{border-color:#ab9cf8}.archive-row button{background:none;border:0;text-align:left;flex:1;min-width:0}.archive-row b{display:block;font-size:12px}.archive-row small{display:block;color:var(--dim);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.preview{background:#101420;border:1px solid #3e4358;border-radius:16px;min-height:390px;padding:16px;overflow:hidden}.preview-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.preview-title b{font-size:15px}.empty{text-align:center;padding:68px 12px;color:#9ea8c2}.empty b{display:block;color:#e7e8f3;font-size:16px;margin:10px}.empty p{font-size:12px;line-height:1.65}.toast{position:absolute;left:50%;transform:translateX(-50%);bottom:12px;max-width:90%;padding:12px 16px;color:#fff;background:#3a3458;border:1px solid #8b80d2;border-radius:12px;box-shadow:0 10px 25px #0009;z-index:8;font-size:12px}.toast[hidden]{display:none}.status{display:flex;gap:9px;align-items:center;padding:11px 14px;border:1px solid #75664f;border-radius:12px;background:#322c26;color:#f0dab8;font-size:12px}.spinning{animation:spin 1.3s linear infinite;display:inline-block}@keyframes spin{to{transform:rotate(360deg)}}.paragraph{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.72;color:#dce3f2}.smalltxt{font-size:12px}.clickable{cursor:pointer}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{border:1px solid #505771;border-radius:999px;background:#222b3c;padding:8px 11px}.chip.active{background:#6355ab;border-color:#afa0ff}.checkrow{display:flex;gap:6px;align-items:center}
/* smartphone */
.iphone{width:min(366px,100%);margin:0 auto;background:#050509;border:6px solid #454952;box-shadow:0 10px 42px #0009, inset 0 0 0 2px #17171a;border-radius:43px;padding:12px 8px 18px;position:relative;min-height:565px}.island{width:92px;height:23px;border-radius:0 0 15px 15px;background:#050507;position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:2}.phone-screen{background:linear-gradient(160deg,#242a56,#4a3a6f 50%,#161b38);min-height:526px;border-radius:31px;overflow:hidden;color:#fff}.phone-status{display:flex;justify-content:space-between;padding:18px 25px 6px;font-size:12px;font-weight:850}.phone-main{padding:13px;min-height:469px}.phone-home-date{text-align:center;margin:32px 0 50px;font-size:22px;font-weight:700;text-shadow:0 2px 6px #0008}.phone-app-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px 8px}.phone-app{display:flex;align-items:center;flex-direction:column;gap:6px;background:none;border:0;font-size:11px}.phone-icon{height:55px;width:55px;border-radius:15px;background:linear-gradient(135deg,#ddd,#7375b4);display:grid;place-items:center;font-size:26px;box-shadow:0 3px 12px #0005}.phone-list{background:#f5f6fa;color:#1b2331;border-radius:22px;min-height:470px;overflow:hidden}.phone-list-head{background:#fff;padding:15px;border-bottom:1px solid #dde2ec;display:flex;align-items:center;gap:8px}.phone-list-head button{background:none;border:0;color:#3f66ce;font-weight:700}.phone-list-body{padding:11px;max-height:395px;overflow-y:auto}.phone-row{width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:11px 7px;border:0;border-bottom:1px solid #e5e9ef;background:transparent;color:#263349}.round-avatar{height:37px;width:37px;border-radius:50%;display:grid;place-items:center;background:#b9cafa;color:#364972;flex:none;font-weight:850}.phone-row b{font-size:13px}.phone-row small{display:block;font-size:11px;color:#758194}.bubble{max-width:88%;border-radius:17px;padding:10px 12px;background:#dfe5ed;color:#1c2b3b;align-self:flex-start;white-space:pre-wrap;line-height:1.4;font-size:12px}.bubble.me{align-self:flex-end;background:#4d81ec;color:white}.bubbles{display:flex;flex-direction:column;gap:8px;padding:14px 9px}.note-box{background:white;border-radius:12px;padding:12px;margin:8px 0;color:#253043;box-shadow:0 1px 3px #aaa3}.note-box small{display:block;color:#8391a5}
/* desktop */
.monitor{background:#020307;padding:12px;border:4px solid #414653;border-radius:14px;box-shadow:0 14px 35px #0009;max-width:800px;margin:auto}.desktop{min-height:360px;background:linear-gradient(135deg,#182e54,#52669b 55%,#2a3e65);padding:14px;position:relative;border-radius:6px}.desktop-icons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:11px}.desktop-icon{border:1px solid transparent;background:#ffffff00;border-radius:8px;padding:8px 2px;color:white;text-shadow:0 2px 3px #000;display:flex;flex-direction:column;align-items:center;font-size:11px;min-height:77px}.desktop-icon i{font-style:normal;font-size:31px}.desktop-window{position:relative;margin:15px auto 0;background:#f4f6fb;color:#192438;width:min(96%,590px);height:275px;border-radius:10px;box-shadow:0 10px 30px #0a1631b9;overflow:hidden}.desktop-window-title{padding:10px;background:#e6eaf4;display:flex;justify-content:space-between;align-items:center;font-size:12px}.desktop-window-title button{background:#e3acb0;color:#583034;border:0;border-radius:6px;padding:4px 8px}.desktop-window-body{padding:13px;overflow:auto;max-height:235px}.desktop-row{display:block;width:100%;text-align:left;background:white;color:#2a3447;border:1px solid #d7deeb;border-radius:7px;padding:9px;margin-bottom:7px}.desktop-row b{display:block}.desktop-row small{display:block;color:#708098}.desktop-taskbar{background:#15233a;color:#d8e5ff;display:flex;align-items:center;justify-content:space-between;padding:9px 15px;border-radius:0 0 6px 6px;font-size:11px}.monitor-stand{width:22%;height:28px;background:linear-gradient(#555964,#30343c);margin:auto;clip-path:polygon(42% 0,58% 0,68% 80%,100% 87%,100% 100%,0 100%,0 87%,32% 80%)}
/* websites */
.web{background:#f3f5f9;color:#232f43;border-radius:12px;overflow:hidden;max-width:840px;margin:auto;min-height:390px}.web-top{background:#fff;padding:16px 18px;border-bottom:1px solid #dfe5ed;display:flex;justify-content:space-between;gap:8px;align-items:center}.web-logo{font-size:21px;font-weight:950;letter-spacing:-.06em;color:#3649a0}.web-body{padding:16px}.web-row{background:white;border:1px solid #dce1ea;border-radius:10px;padding:14px;margin-bottom:9px;width:100%;display:block;text-align:left;color:#283348}.web-row b{font-size:15px}.web-row small{display:block;color:#75829b;margin-top:5px}.web-detail{background:white;border:1px solid #dbe2ea;border-radius:12px;padding:20px}.web-detail h3{font-size:20px;margin:8px 0 10px}.web-comments{border-top:1px solid #e2e6ed;margin-top:18px;padding-top:14px}.web-comment{padding:9px 2px;border-bottom:1px solid #eaeef4;font-size:12px;line-height:1.6}.web-comment b{color:#344aa2}.web-btn{border:1px solid #ccd5e1;color:#3c4a7a;border-radius:8px;padding:6px 10px;background:#fff}.wiki-sect{font-size:17px;border-bottom:1px solid #dce1e8;padding:10px 0 6px;margin:16px 0 8px}.live-tv{background:linear-gradient(135deg,#27223b,#58456c);color:white;padding:26px 16px;text-align:center;border-radius:8px;margin-bottom:13px}.live-tv strong{font-size:23px}.live-lines{height:350px;overflow:auto;background:#141b2d;color:#d9e2f4;border-radius:9px;padding:12px}.live-line{padding:6px;border-bottom:1px solid #28334c;font-size:12px;line-height:1.5}.live-line b{color:#a7d7ef}.live-line small{color:#7689a4;margin-right:6px}.live-line.gift{background:#483e31}
@media(max-width:750px){#panel{top:4px;right:4px;bottom:65px;width:calc(100vw - 8px);border-radius:13px}.shell{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.side{display:flex;gap:5px;overflow-x:auto;padding:8px;border-right:0;border-bottom:1px solid var(--line)}.side button{padding:9px 10px;width:auto;flex:none;font-size:12px;margin:0}.side .side-caption{display:none}.main{padding:11px}.grid2{grid-template-columns:1fr}.header{padding:10px;height:56px}.header h2{font-size:14px}.header small{display:none}.desktop-icons{grid-template-columns:repeat(4,1fr)}.phone-icon{width:49px;height:49px}#badge{right:9px;bottom:9px;padding:11px}}
/* v0.2: maximum viewing area and readable text */
:host{--bg:#0b111b;--surface:#182233;--surface2:#202e43;--line:#42516b;--fg:#ffffff;--dim:#d3deef;--accent:#c4b5fd;font-size:15px}
#badge{right:unset;bottom:unset;left:calc(100vw - 164px);top:calc(100vh - 67px);touch-action:none;user-select:none;cursor:grab;z-index:2147483002;font-size:14px;background:#312354;color:#fff;border:2px solid #b1a1ff}
#badge.dragging{cursor:grabbing}#badge.panel-open{display:none}
#panel{inset:2vh 1.25vw;width:auto;max-width:none;height:96vh;border-radius:17px;border:1px solid #62708e}
.header{height:69px;padding:15px 24px}.header h2{font-size:20px}.header small{font-size:12px;color:#d5ddf3}
.shell{grid-template-columns:188px minmax(0,1fr)}.main{padding:19px 23px}.side button{font-size:15px}
.pane-title h3{font-size:23px}.pane-title small,.info,.subtle,.muted,.archive-row small{color:#d4dfef;font-size:13px}
.field>span,.section-header b,.toggle{font-size:14px;color:#f6f9ff}.paragraph{color:#202b3a;font-size:15px;line-height:1.75}
.viewer-layout{display:grid;grid-template-columns:minmax(270px,315px) minmax(0,1fr);gap:16px;align-items:start}
.viewer-layout.focused{grid-template-columns:minmax(0,1fr)}.viewer-layout.focused>.controls{display:none}
.controls{max-height:calc(100vh - 151px);overflow:auto;scrollbar-width:thin}.controls .card{padding:13px}.controls .stack{gap:11px}
.stage{min-width:0}.stage .preview{min-height:calc(100vh - 155px);padding:18px;overflow:auto;background:#111a29}.stage .preview-title{padding:0 4px}.stage .preview-title b{font-size:19px}.focus-bar{display:flex;justify-content:flex-end;gap:8px;align-items:center;margin-bottom:9px}
.archive{max-height:220px}.archive-row b{font-size:14px}.archive-row small{font-size:12px}.card h4{font-size:16px}
.estimate-box{background:#101b2c;border:1px solid #64748d;padding:12px;border-radius:10px;font-size:13px;line-height:1.8;color:#eaf1fc}
.estimate-box b{color:white}.estimate-box .cost{font-size:18px;font-weight:850;color:#eec888}
/* phone uses most available height; screen is a functional app surface */
.iphone{width:min(490px,100%);border:7px solid #171c25;border-radius:56px;padding:12px 10px 15px;min-height:760px;box-shadow:0 15px 55px #000a,0 0 0 2px #5e697e}
.island{width:113px;height:30px;border-radius:0 0 19px 19px}
.phone-screen{min-height:720px;border-radius:42px;background:linear-gradient(145deg,#294a74,#433e92 48%,#22294f);position:relative;overflow:hidden}
.phone-status{padding:19px 28px 8px;font-size:14px}.phone-main{padding:20px;min-height:660px}.phone-home-date{margin:48px 0 75px;font-size:26px}.phone-app-grid{gap:25px 12px}
.phone-icon{height:69px;width:69px;border-radius:19px;font-size:33px}.phone-app{font-size:13px;font-weight:650;color:#fff}
.phone-list{min-height:656px;border-radius:32px;background:#fff;color:#17202d}.phone-list-head{padding:17px 14px;font-size:17px;min-height:57px}.phone-list-body{max-height:584px;padding:15px;scrollbar-width:thin}
.phone-row{padding:14px 9px;gap:13px;min-height:65px}.round-avatar{height:49px;width:49px;font-size:19px}
.phone-row b{font-size:15px}.phone-row small,.note-box small{font-size:12px;color:#59677d}.bubble{font-size:15px;line-height:1.55;padding:13px 15px}.bubbles{gap:11px;padding:22px 8px}.note-box{padding:16px}.note-box b{font-size:16px}.iphone button:active{opacity:.7}
.phone-nav{width:118px;height:5px;border-radius:20px;background:#f0f4fb;position:relative;margin:-17px auto 6px;cursor:pointer;z-index:6;border:0;display:block}
.phone-list .paragraph{color:#2d3344}.phone-list .web-comment{font-size:14px;color:#202a39}.phone-list .web-comment b{color:#2458a1}
/* full-width simulated PC */
.monitor{max-width:unset;width:100%;border:5px solid #333b49;border-radius:15px;padding:8px 8px 0;box-shadow:0 17px 55px #0009}
.desktop{min-height:min(69vh,800px);border-radius:8px 8px 0 0;padding:16px;background:radial-gradient(ellipse at 75% 20%,#71b3fc 0%,transparent 40%),linear-gradient(135deg,#142a5b,#3868a3 55%,#131c51)}
.desktop-icons{display:grid;grid-template-columns:repeat(6,minmax(75px,110px));gap:12px}.desktop-icon{font-size:14px;min-height:96px;padding:9px}.desktop-icon i{font-size:43px}
.desktop-window{width:min(96%,1030px);height:min(57vh,650px);margin:2vh auto 0;border:1px solid #8ea8c9;box-shadow:0 15px 55px #0b122dcc}
.desktop-window-title{padding:13px 18px;font-size:15px}.desktop-window-body{padding:18px;max-height:calc(min(57vh,650px) - 51px)}
.desktop-row{padding:14px;font-size:15px}.desktop-row b{font-size:15px}.desktop-row small{font-size:13px;color:#4b6178}.desktop-taskbar{font-size:14px;padding:13px 20px}.monitor-stand{height:35px}
/* DC-style board */
.web{width:100%;max-width:unset;min-height:calc(100vh - 238px);background:#f9fafc;border-radius:4px;font-family:Arial,'Malgun Gothic',sans-serif;color:#151f31}
.web-top{border-bottom:3px solid #304eae;padding:22px 24px}.web-logo{font-size:30px;color:#3155b1}.web-body{padding:19px 24px}
.web-detail{border-radius:0;padding:25px;background:#fff;color:#172237}.web-detail h3{font-size:25px}.web-detail .paragraph{font-size:16px;color:#253042}
.web-row{border-radius:3px;padding:17px 19px;background:white}.web-row b{font-size:17px}.web-row small,.web-detail .subtle{font-size:13px;color:#536477}
.web-comments{font-size:15px}.web-comment{font-size:14px}
.dc-bar{background:#344fa5;color:#fff;padding:13px 16px;font-size:18px;font-weight:850;margin:0 0 14px;display:flex;align-items:center;justify-content:space-between}
.dc-galleries{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.dc-gallery{display:flex;justify-content:space-between;align-items:center;text-align:left;padding:19px 17px;background:white;color:#223d87;border:1px solid #c6d0e8;min-height:84px;border-radius:0;font-size:16px;font-weight:800}
.dc-list{width:100%;border-collapse:collapse;background:white;border-top:2px solid #374d91;table-layout:fixed;font-size:14px;color:#182538}
.dc-list th{padding:12px 6px;background:#eef2f9;border-bottom:1px solid #b8c1d2;color:#2b3853}
.dc-list td{padding:13px 6px;border-bottom:1px solid #e4e8ef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-list .num{width:60px;text-align:center;color:#66758a}.dc-list .nick{width:155px;text-align:center}.dc-list .num-small{width:82px;text-align:center;color:#5e6c80}
.dc-title{background:none;border:0;color:#172c55;font-size:14px;text-align:left;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0}
.dc-title:hover{text-decoration:underline}.dc-comm{color:#bd414f;font-size:12px;font-weight:850}
.dc-post-meta{border-top:1px solid #e6ebf4;border-bottom:1px solid #e6ebf4;padding:12px 0;margin:16px 0;color:#5f6b7e;font-size:14px}
.dc-vote{margin:20px auto 10px;text-align:center;border:1px solid #ced6e5;padding:18px;width:min(270px,100%);font-size:18px;color:#3153a7}
.dc-search{display:flex;gap:8px;margin:14px 0}.dc-search input{background:white;border:1px solid #8b9ab5;color:#17243a;flex:1;padding:11px}
.wiki-sect{font-size:19px}.live-lines{height:min(61vh,650px)}.live-line{font-size:15px;padding:9px}.live-line small{color:#bdcdeb}
@media(max-width:1150px){.viewer-layout{grid-template-columns:260px minmax(0,1fr)}.shell{grid-template-columns:155px minmax(0,1fr)}.side{padding:9px 6px}.side button{font-size:13px}.desktop-icons{grid-template-columns:repeat(4,minmax(60px,90px))}}
@media(max-width:840px){#panel{inset:5px;width:auto;height:calc(100dvh - 10px)}.viewer-layout{grid-template-columns:1fr}.controls{max-height:none}.stage .preview{min-height:65vh}.side{border:0;border-bottom:1px solid var(--line)}.shell{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.side{display:flex;overflow-x:auto;gap:4px}.side button{flex:none;width:auto;margin:0}.side .side-caption{display:none}.main{padding:13px}.dc-list .nick{width:95px}.dc-list .num{width:40px}.dc-list .num-small{width:47px}.dc-list td{padding:10px 2px;font-size:12px}.dc-title{font-size:12px}.web-body{padding:12px}.header h2{font-size:15px}.header small{display:none}}


/* v0.2.3 · realistic device skin and standalone websites */
.iphone{width:min(492px,100%);padding:7px;margin:10px auto 30px;border:5px solid #1b2028;border-radius:58px;background:linear-gradient(135deg,#8c929e,#10151d 18%,#121722 80%,#6a7280);box-shadow:0 29px 85px #0009,0 0 0 1px #b0bac9, inset 0 0 0 1px #343e50;min-height:810px}
.phone-screen{height:790px;min-height:0;border-radius:46px;background:#f6f7fa;position:relative;overflow:hidden;display:flex;flex-direction:column;color:#111827;isolation:isolate}
.ios-status{height:54px;flex:none;display:flex;justify-content:space-between;align-items:center;padding:8px 33px 6px;font-size:15px;font-weight:800;position:relative;z-index:6;color:#1b2637;background:#f7f8fb}
.ios-island{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#090b0f;border-radius:28px;width:122px;height:34px;box-shadow:inset 0 0 0 1px #161922}.ios-island:after{content:'';position:absolute;width:9px;height:9px;background:#27384a;border-radius:50%;right:15px;top:12px}
.ios-signal{font-size:12px;letter-spacing:-2px}.ios-homebar{position:absolute;bottom:9px;left:50%;transform:translateX(-50%);background:#303944;border:0;height:5px;width:132px;border-radius:9px;z-index:10;padding:0}
.ios-homescreen{flex:1;min-height:0;position:relative;display:flex;flex-direction:column;padding:16px 23px 42px;background:linear-gradient(148deg,#a6cbdf,#bcbde9 38%,#777da9 75%,#3f567d);color:white;overflow:hidden}
.ios-wallpaper{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}.ios-orb{position:absolute;border-radius:50%;filter:blur(2px);transform:rotate(-22deg)}.ios-orb.one{width:450px;height:430px;top:22%;left:-48%;background:linear-gradient(160deg,#f9ddc6a8,#bda0dc92 55%,transparent);border:60px solid #e9d6ec7a}.ios-orb.two{width:530px;height:530px;bottom:-39%;right:-75%;background:radial-gradient(circle at 30% 45%,#adcfecd9,#7785c4ce 48%,#3d527fd7);border:60px solid #c9d1f0a1}
.ios-widget{position:relative;z-index:1;text-align:center;margin:27px 0 54px;text-shadow:0 2px 18px #1b254566}.ios-widget-date{font-size:16px;font-weight:650}.ios-widget-time{font-size:66px;font-weight:300;letter-spacing:-.06em;line-height:1.25}.ios-widget-caption{font-size:12px;opacity:.9;margin:8px auto;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ios-apps{position:relative;z-index:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:13px;row-gap:29px}.ios-app{background:none;border:none;display:flex;align-items:center;flex-direction:column;gap:8px;min-width:0;font-size:12px;color:#fff;text-shadow:0 1px 7px #1c27589c}
.ios-app-icon{width:69px;height:69px;border-radius:17px;display:grid;place-items:center;font-size:39px;font-weight:500;color:#fff;line-height:1;box-shadow:0 4px 12px #2f344439;letter-spacing:-.09em;border:1px solid #ffffff55}
.ios-app-icon.message{background:linear-gradient(150deg,#6ce886,#16b957)}.ios-app-icon.calls{background:linear-gradient(160deg,#79ed9f,#12b346)}.ios-app-icon.browser{background:linear-gradient(155deg,#eff8ff,#d3e7ff);color:#2b8ced}.ios-app-icon.notes{background:linear-gradient(#ffef94 15%,#fffef2 15%);color:#c7a13c}.ios-app-icon.social{background:linear-gradient(155deg,#fc7a93,#ba4698)}.ios-app-icon.photos{background:linear-gradient(155deg,#fdfdfd,#d7e2ec);color:#eb8793}
.ios-dock{position:relative;z-index:1;display:flex;justify-content:space-evenly;align-items:center;gap:14px;margin-top:auto;padding:14px 13px;border-radius:27px;background:#e8e9f180;backdrop-filter:blur(23px);box-shadow:inset 0 0 0 1px #ffffff59}.ios-dock .ios-app-icon{width:59px;height:59px;font-size:32px;border:0}
.ios-appscreen{flex:1;min-height:0;display:flex;flex-direction:column;background:#f6f7fb;color:#1a2435}.ios-navbar{height:55px;flex:none;background:#ffffffed;border-bottom:1px solid #e1e5ed;display:grid;grid-template-columns:83px 1fr 70px;align-items:center;padding:0 15px;color:#152238;gap:4px}.ios-navbar>b{text-align:center;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ios-back{border:0;background:none;color:#1371db;font-weight:700;font-size:16px;padding:8px 0;text-align:left}.ios-back span{font-size:12px}.ios-navend{text-align:right;color:#1768cd;font-size:21px;letter-spacing:1px}.ios-scroll{overflow:auto;flex:1;padding:12px 18px 35px;scrollbar-width:thin;overscroll-behavior:contain}.ios-pageheading{font-size:28px;font-weight:850;letter-spacing:-.05em;margin:11px 3px 17px;display:flex;justify-content:space-between;align-items:center}.ios-pageheading>span{font-size:12px;font-weight:600;color:#738096;letter-spacing:0}.ios-searchpill{background:#e7eaf0;color:#647287;border-radius:13px;padding:13px 15px;font-size:14px;margin-bottom:15px}
.ios-row{display:flex;align-items:center;gap:12px;width:100%;border:0;border-bottom:1px solid #e5e7ed;background:#fff;color:#1c2535;text-align:left;padding:15px 10px;min-height:80px}.ios-row:first-of-type{border-radius:12px 12px 0 0}.ios-row:hover{background:#f3f7ff}.ios-avatar{flex:none;display:grid;place-items:center;width:51px;height:51px;border-radius:50%;background:linear-gradient(135deg,#bac2ee,#9daed7);color:#fff;font-size:22px;font-weight:850}.ios-row-main{display:flex;flex-direction:column;min-width:0;gap:5px;flex:1}.ios-row-main b{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ios-row-main small{color:#6c7889;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ios-row-date{font-size:12px;color:#7b879a;white-space:nowrap;align-self:flex-start;margin-top:5px}.ios-unread{background:#2778f5;display:inline-block;width:8px;height:8px;border-radius:50%;margin-left:7px}.ios-history-icon,.ios-notes-dot{font-size:29px;color:#3b75d5;padding:0 10px}
.ios-contact{display:flex;flex-direction:column;align-items:center;gap:6px;padding:17px 0}.ios-contact .ios-avatar{height:66px;width:66px;font-size:27px}.ios-contact>b{font-size:17px}.ios-contact small{color:#69778d}.ios-bubbles{display:flex;flex-direction:column;gap:12px;padding:10px 0 40px}.ios-message{max-width:84%;display:flex;flex-direction:column;gap:5px;align-self:flex-start}.ios-message>span{background:#e6e7ec;padding:13px 15px;border-radius:19px 19px 19px 7px;font-size:15px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.ios-message>small{color:#737e92;font-size:11px;padding:0 4px}.ios-message.out{align-self:flex-end;align-items:flex-end}.ios-message.out>span{background:#1687ef;color:#fff;border-radius:19px 19px 7px 19px}
.ios-post{background:white;border:1px solid #e5e9f0;border-radius:16px;padding:14px 15px;margin-bottom:11px;color:#18263a}.ios-post-author{display:flex;align-items:center;gap:9px}.ios-post-author>span:last-child{display:flex;flex-direction:column;gap:4px}.ios-post-author small{font-size:12px;color:#737f90}.ios-post p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;font-size:15px}.ios-engagement{color:#657589;padding:8px 0;border-bottom:1px solid #e6e9ed}.ios-post-reply{padding:10px 2px;border-bottom:1px solid #eef0f3;font-size:13px;line-height:1.5;color:#28354a}.ios-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px}.ios-photo{aspect-ratio:1;background:linear-gradient(145deg,#d1e4f2,#e7d8e9);border:0;font-size:41px;color:#233448}.ios-bigphoto{font-size:140px;text-align:center;padding:65px 0;background:linear-gradient(135deg,#d7e7f0,#d3cbea);border-radius:8px}.ios-document{padding:15px 5px;font-size:15px;color:#263448}.ios-document .paragraph{color:#28374b!important;font-size:15px}.ios-empty{padding:45px 0;text-align:center;color:#606b7d;font-size:15px}
/* green encyclopedia styling without using another website's name or assets */
.wiki-site{width:100%;min-height:calc(100vh - 235px);background:#f2f4f3;color:#252e32;font-family:Arial,'Malgun Gothic',sans-serif;border:1px solid #cfdad4;overflow:hidden}.wiki-topbar{display:flex;align-items:center;gap:20px;min-height:69px;background:#105f56;color:white;padding:10px 22px}.wiki-brand{display:flex;align-items:center;gap:9px;min-width:222px}.wiki-brand>b{font-size:28px;color:#e0fff2}.wiki-brand>span{font-size:24px;font-weight:950;letter-spacing:-.08em}.wiki-brand small{font-size:10px;color:#bde6d7;white-space:nowrap}.wiki-search{margin-left:auto;background:white;border-radius:6px;display:flex;align-items:center;min-width:180px;max-width:400px;flex:1;overflow:hidden}.wiki-search input{color:#152d2b;background:white;flex:1;border:0!important;border-radius:0;font-size:14px}.wiki-search button{background:#e4f0ea;color:#185c4d;border:0;padding:11px 18px;font-size:21px}.wiki-toplink{border:0;background:transparent;color:white;font-size:14px;font-weight:750}.wiki-layout{display:grid;grid-template-columns:204px minmax(0,1fr);gap:16px;padding:17px;align-items:start}.wiki-sidebar{background:white;border:1px solid #dae1df;padding:15px;display:flex;flex-direction:column;gap:4px;max-height:calc(100vh - 270px);overflow:auto}.wiki-sidebar>b{font-size:13px;color:#377a66;padding:8px 5px}.wiki-sidebar>button{background:transparent;border:0;padding:9px 8px;text-align:left;font-size:13px;color:#206e5a;border-radius:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wiki-sidebar>button:hover,.wiki-sidebar>button.active{background:#e8f4ee;color:#075e47}.wiki-sideline{border-top:1px solid #dbe6df;margin:8px 0}.wiki-content{background:white;border:1px solid #d5dedb;min-height:70vh;padding:26px 30px}.wiki-landing>h1,.wiki-title>h1{font-size:30px;letter-spacing:-.05em;margin:5px 0 12px;color:#202d31}.wiki-landing>p{color:#53675f;font-size:15px;line-height:1.65;margin-bottom:30px}.wiki-landing>h2{font-size:20px;border-bottom:2px solid #b0cfc2;padding-bottom:10px}.wiki-landing>h2 small{font-size:13px;color:#71887c}.wiki-document-row{display:flex;width:100%;gap:15px;align-items:center;text-align:left;border:0;border-bottom:1px solid #e5e9e6;background:white;color:#1c3f38;padding:17px 4px}.wiki-document-row:hover{background:#f3faf5}.wiki-document-icon{font-size:28px;color:#2c9072}.wiki-document-row>span:nth-child(2){display:flex;flex:1;flex-direction:column;gap:5px;min-width:0}.wiki-document-row b{font-size:16px;color:#127a62}.wiki-document-row small{color:#61766c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wiki-title small{color:#7a8582;font-size:12px}.wiki-tabs{display:flex;border-bottom:1px solid #c7d9d1;margin-top:18px;gap:5px}.wiki-tabs button{padding:11px 15px;background:#eff5f2;color:#385d51;border:1px solid #d6e1db;border-bottom:0;border-radius:5px 5px 0 0;font-size:14px}.wiki-tabs button.selected{background:white;color:#08765b;border-top:3px solid #168c6e;font-weight:800}.wiki-tabs span{margin-left:auto;font-size:12px;color:#838d8a;align-self:center}.wiki-article-content{padding:15px 4px}.wiki-summary{white-space:pre-wrap;font-size:16px;line-height:1.8;border-left:4px solid #9ac8b3;background:#f5faf7;padding:16px 18px;color:#263f36}.wiki-toc{display:flex;flex-direction:column;align-items:flex-start;gap:7px;max-width:420px;border:1px solid #c8dcd2;background:#f8fbf9;padding:16px 22px;margin:22px 0}.wiki-toc>b{margin-bottom:5px;color:#23463a;font-size:15px}.wiki-toc button{background:none;border:0;padding:3px;color:#137b61;font-size:14px;text-align:left}.wiki-toc button:hover{text-decoration:underline}.wiki-section{scroll-margin-top:24px;margin-top:27px}.wiki-section h2{font-size:22px;border-bottom:1px solid #b7ccbf;padding-bottom:10px;color:#273d33;letter-spacing:-.03em}.wiki-section h2 span{color:#19866b}.wiki-section .paragraph{font-size:16px;line-height:1.9;color:#283b33!important}.wiki-discussion{padding:22px 0}.wiki-discussion h2{color:#31483e;font-size:23px}.wiki-discussion>p{color:#63766c}.wiki-talk{border:1px solid #d5e0d9;background:#f9fcfa;padding:15px 18px;margin:12px 0}.wiki-talk>div{display:flex;justify-content:space-between;color:#16725c}.wiki-talk small{font-size:12px;color:#677b71}.wiki-talk p{font-size:15px;line-height:1.7;color:#283d35;white-space:pre-wrap}.wiki-footer{text-align:center;padding:14px;font-size:12px;color:#506c61;background:#ebf2ed}
/* world social timeline inspired by familiar microblog patterns */
.x-site{background:#fff;color:#15191e;display:grid;grid-template-columns:175px minmax(0,1fr) 285px;min-height:calc(100vh - 245px);border:1px solid #e2e7eb;font-family:Arial,'Malgun Gothic',sans-serif}.x-nav{border-right:1px solid #e4e9ee;padding:18px 16px;display:flex;flex-direction:column;gap:9px}.x-symbol{font-size:44px;font-weight:700;padding:2px 13px 17px;color:#16191c}.x-nav button{background:none;border:0;border-radius:22px;text-align:left;color:#15202b;font-size:18px;padding:12px 9px;white-space:nowrap}.x-nav button:hover{background:#f1f4f6}.x-nav-note{padding:20px 10px;margin-top:auto;font-size:13px;color:#4b596a}.x-nav-note small{color:#758392}.x-timeline{min-width:0;border-right:1px solid #e2e7eb}.x-feed-head{min-height:72px;padding:14px 17px;display:flex;align-items:center;gap:18px;border-bottom:1px solid #e8edf1;background:#fffc}.x-feed-head>div{display:flex;flex-direction:column;gap:4px}.x-feed-head b{font-size:21px}.x-feed-head small{color:#718094;font-size:12px}.x-feed-head>button{border:0;background:transparent;color:#18202a;font-size:33px}.x-feed-tabs{display:flex;border-bottom:1px solid #e8edf2}.x-feed-tabs button{background:white;color:#586575;border:0;flex:1;padding:14px;font-size:14px;font-weight:700;border-bottom:3px solid transparent}.x-feed-tabs button.active{border-color:#151a20;color:#171a1e}.x-post{padding:17px 15px;border-bottom:1px solid #e3e9ef;display:grid;grid-template-columns:48px minmax(0,1fr);column-gap:10px;position:relative}.x-post:hover{background:#fcfdfe}.x-avatar{height:45px;width:45px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#d5ddeb,#8ba7cb);color:#344764;font-size:18px;font-weight:850}.x-post-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.x-post-head>b{font-size:15px}.x-post-head>span{font-size:12px;color:#667586}.x-post-head .x-more{margin-left:auto;font-size:20px}.x-post-body p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.6;color:#1a2630;margin:10px 0 16px}.x-actions{display:flex;justify-content:space-between;color:#677487;font-size:13px;gap:13px;padding:0 20px 0 0}.x-post-open{grid-column:2;border:0;background:none;color:#2577a3;padding:9px 0 0;font-size:12px;text-align:right}.x-replies{margin-top:20px;border-top:1px solid #e3e9ef;padding:14px 0}.x-replies>b{font-size:14px}.x-reply{display:flex;gap:10px;padding:14px 0;border-bottom:1px solid #e9eef2}.x-reply b{font-size:14px}.x-reply small{font-size:12px;color:#7c8795}.x-reply p{margin:7px 0;font-size:14px}.x-right{padding:17px 13px}.x-searchbox{display:flex;align-items:center;gap:6px;background:#eff3f5;border-radius:25px;padding:6px 13px;margin-bottom:25px;color:#546677}.x-searchbox input{border:0;background:transparent;color:#17212c;min-width:0;padding:8px;flex:1;font-size:14px}.x-trending{background:#f4f6f8;border-radius:15px;overflow:hidden}.x-trending>b{display:block;font-size:20px;padding:18px 16px 10px}.x-trending button{border:0;background:none;width:100%;padding:12px 17px;display:flex;flex-direction:column;gap:5px;align-items:flex-start;text-align:left;color:#101920}.x-trending button:hover{background:#eaf0f4}.x-trending button strong{font-size:14px}.x-trending button small{font-size:12px;color:#74808d}.x-about{padding:22px 8px;font-size:12px;color:#89929c;line-height:1.5}.x-noresults{text-align:center;padding:50px;color:#72808f}
/* livestream highlight readability in light cards nested in a dark site */
.live-highlights{padding:20px 10px;color:#fff;background:#10182a}.live-highlights>b{font-size:22px;color:#fff}.live-highlights .card{background:#1e2d46;border-color:#476080;border-radius:12px;margin:12px 0!important;padding:17px 20px;color:#fff}.live-highlights .card>b{display:block;font-size:17px;color:#fff;margin-bottom:10px}.live-highlights .card .paragraph{color:#f4f7fc!important;font-size:15px;line-height:1.8}
@media(max-width:1250px){.x-site{grid-template-columns:100px minmax(0,1fr) 235px}.x-nav button span{display:none}.x-nav{align-items:center}.x-nav button{font-size:25px}.wiki-layout{grid-template-columns:170px minmax(0,1fr)}.wiki-brand small{display:none}}
@media(max-width:920px){.x-site{grid-template-columns:65px minmax(0,1fr)}.x-right{display:none}.x-nav{padding:12px 5px}.x-nav-note{display:none}.wiki-layout{grid-template-columns:1fr;padding:9px}.wiki-sidebar{display:none}.wiki-topbar{flex-wrap:wrap;gap:10px}.wiki-search{flex-basis:100%;max-width:none;order:3}.wiki-content{padding:18px}.iphone{max-width:492px}.ios-app-icon{width:60px;height:60px;font-size:31px}}
@media(max-width:450px){.iphone{width:100%;min-height:690px;border-radius:44px;padding:5px}.phone-screen{height:695px;border-radius:36px}.ios-app-icon{width:48px;height:48px;font-size:25px;border-radius:14px}.ios-dock .ios-app-icon{width:52px;height:52px}.ios-widget{margin-bottom:37px}.ios-widget-time{font-size:52px}.ios-apps{row-gap:18px}.ios-navbar{grid-template-columns:65px 1fr 45px;padding:0 9px}.ios-navend{font-size:17px}.x-site{grid-template-columns:50px minmax(0,1fr)}.x-nav button{font-size:18px}.x-post{grid-template-columns:36px minmax(0,1fr);padding:13px 7px}.x-avatar{width:34px;height:34px}}


/* v0.2.4 simulated mail, browser, notebook surfaces */
.monitor{max-width:1320px;width:100%;background:#10141d;border:7px solid #3d434f;padding:9px;border-radius:18px}
.desktop{min-height:690px;padding:20px 16px 14px;background:radial-gradient(ellipse at 80% 15%,#699bd1 0%,#25496e 45%,#142844 100%);display:flex;flex-direction:column}
.desktop-icons{display:grid;grid-template-columns:repeat(5,94px);align-content:start;gap:17px}
.desktop-icon{font-size:13px;font-weight:650;min-height:94px;padding:7px 2px;text-shadow:0 2px 6px #000c}
.desktop-icon i{font-size:43px;margin-bottom:5px}
.desktop-window.pc-app-window{display:flex;flex-direction:column;margin:8px auto 2px;width:min(98%,1100px);height:min(650px,70vh);min-height:430px;max-width:none;background:#fff;border:1px solid #b5c1d2;border-radius:12px;flex-shrink:0;box-shadow:0 18px 56px #0009}
.desktop-window-title.pc-window-title{height:39px;flex:none;padding:6px 12px;background:#eef1f7;gap:8px;color:#253042}
.pc-win-icon{font-size:20px}.pc-window-title b{flex:1;font-size:13px}.pc-window-buttons{display:flex;align-items:center;gap:16px;color:#465167}.pc-window-buttons button{padding:4px 10px;background:#d6dce8;color:#2d3947;border:0;border-radius:5px}
.pc-window-content{flex:1;min-height:0;overflow:hidden;color:#1c2636;background:#fff}
.desktop-taskbar{margin-top:auto;height:44px;background:#101a31cf;padding:7px 16px;display:flex;gap:17px;justify-content:space-between;align-items:center;font-size:13px;border-radius:10px}
.desktop-taskbar button{border:0;background:transparent;color:white;font-size:23px}.desktop-taskbar>div{display:flex;gap:12px;align-items:center}
.pc-explorer-bar{padding:15px;background:#f6f7fa;border-bottom:1px solid #dce3ed;font-size:13px;color:#33465a}.pc-file-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));padding:25px;gap:22px}.pc-file-grid button{border:0;background:#fff;display:flex;flex-direction:column;align-items:center;gap:8px;color:#1a2a3a}.pc-file-grid span{font-size:53px}.pc-file-grid b{font-size:13px}.pc-file-grid small{font-size:11px;color:#59697f}
.pc-file-list{padding:15px;max-height:100%;overflow:auto}.pc-file-label{font-size:12px;color:#647084;display:flex;justify-content:space-between;padding:8px 25px;border-bottom:1px solid #d9e1eb}.pc-file-list button{width:100%;display:flex;align-items:center;gap:14px;padding:13px;border:0;background:#fff;color:#21354a;text-align:left;border-bottom:1px solid #e7edf3}.pc-file-list button:hover,.pc-history-row:hover,.pc-mail-list button:hover{background:#eaf4ff}.pc-file-list button span{font-size:24px}.pc-file-list button b{font-size:14px;flex:1}.pc-file-list small{font-size:12px;color:#66758a}.pc-navbtn{margin:12px 15px;background:#eef3f7;border:0;color:#243e58;border-radius:7px;padding:8px 13px}.pc-file-doc{padding:20px;max-height:100%;overflow:auto}.pc-file-doc h3{font-size:22px}.pc-file-doc .paragraph{color:#253245;font-size:15px;line-height:1.8}
.pc-mail{height:100%;display:grid;grid-template-columns:190px minmax(0,1fr);background:#fff}.pc-mail-side{background:#f4f7fb;border-right:1px solid #dce5ee;padding:20px 11px}.pc-mail-side>b{display:block;font-size:19px;color:#233a58;margin:4px 10px 20px}.pc-mail-side button{display:flex;width:100%;justify-content:space-between;align-items:center;text-align:left;background:transparent;border:0;padding:12px 10px;color:#334a64;border-radius:20px;font-size:14px}.pc-mail-side button.active{background:#d8e9fa;color:#173d64;font-weight:850}.pc-mail-side button span{color:#58738b;font-size:12px}.pc-mail-main{min-width:0;display:flex;flex-direction:column}.pc-mail-toolbar{padding:16px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4eaf0;color:#263648;min-height:53px}.pc-mail-toolbar>span{color:#718094;font-size:12px}.pc-mail-toolbar button{border:0;background:transparent;color:#2061a7}.pc-mail-list{overflow:auto;flex:1}.pc-mail-list button{width:100%;border:0;border-bottom:1px solid #e9edf2;background:#fff;display:flex;align-items:center;gap:12px;text-align:left;color:#192f43;padding:14px 16px;min-height:60px}.pc-mail-list button b{flex:0 0 150px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pc-mail-star{color:#b9a460;font-size:18px}.pc-mail-subject{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}.pc-mail-subject small{font-size:12px;color:#7d8895}.pc-mail-list time{font-size:12px;color:#596a7e;min-width:85px;text-align:right}.pc-mail-detail{padding:20px 30px;overflow:auto}.pc-mail-detail h2{font-size:24px;margin:12px 0 25px;color:#1d2f45}.pc-mail-meta{display:flex;gap:13px;align-items:center;border-bottom:1px solid #e8eef4;padding-bottom:18px}.pc-mail-avatar{height:44px;width:44px;border-radius:50%;display:grid;place-items:center;background:#dce7f8;color:#2b517f;font-weight:800}.pc-mail-meta>div:nth-child(2){flex:1}.pc-mail-meta b,.pc-mail-meta small{display:block}.pc-mail-meta small{color:#64768a;font-size:12px}.pc-mail-meta time{color:#64748b;font-size:12px}.pc-mail-message{white-space:pre-wrap;line-height:1.85;font-size:15px;color:#213246;padding:28px 10px}
.pc-browser{height:100%;display:flex;flex-direction:column;background:#fff}.pc-browser-tabs{height:38px;background:#e7ebf1;display:flex;align-items:end;gap:7px;padding:6px 14px 0}.pc-browser-tabs .active{background:white;border-radius:9px 9px 0 0;padding:8px 22px;max-width:80%;font-size:13px;color:#34445b;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.pc-plus{font-size:22px;color:#6f8096}.pc-browser-toolbar{height:53px;display:flex;align-items:center;gap:12px;padding:8px 15px;border-bottom:1px solid #dee4eb;font-size:13px;color:#52647b}.pc-browser-toolbar button{background:none;border:0;color:#52647b;font-size:20px}.pc-url{background:#f0f3f7;border-radius:22px;padding:11px 15px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1}.pc-history{flex:1;overflow:auto;padding:30px max(25px,7%)}.pc-history-heading{display:flex;align-items:center;gap:16px;padding-bottom:18px}.pc-history-heading>span{font-size:43px;color:#5782b8}.pc-history-heading h2{margin:0;font-size:22px}.pc-history-heading p{margin:5px 0;color:#63758a;font-size:13px}.pc-history-search{display:flex;align-items:center;background:#f1f6fc;color:#566e8d;padding:0 15px;border-radius:9px;margin-bottom:20px}.pc-history-search input{flex:1;border:0;outline:0;background:transparent;color:#203951;font-size:14px}.pc-history>b{display:block;margin:20px 0;font-size:13px;color:#50637d}.pc-history-row{width:100%;display:flex;align-items:center;gap:14px;text-align:left;border:0;border-bottom:1px solid #e9eef3;background:#fff;padding:15px 8px;color:#1b3249}.pc-history-ico{font-size:21px;color:#5a85a8}.pc-history-row>div{flex:1;min-width:0}.pc-history-row strong,.pc-history-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pc-history-row small{color:#6c7d90;font-size:12px;margin-top:4px}.pc-webpage{padding:30px max(25px,7%);overflow:auto;flex:1}.pc-webpage-address{border-bottom:1px solid #dfe8ee;color:#658099;padding-bottom:12px;font-size:13px}.pc-webpage h2{font-size:26px;color:#1a2f44}.pc-webpage-body{white-space:pre-wrap;line-height:1.8;color:#2b3d52;font-size:15px}.pc-webpage>button{margin-top:25px;border:0;border-radius:10px;background:#e8f1fa;color:#21568a;padding:12px 18px}.pc-placeholder{padding:30px;color:#66768a}
.diary-book{max-width:1180px;margin:0 auto;background:#ecd9b4;border:10px solid #6c4937;border-radius:17px;box-shadow:0 20px 50px #0009,0 0 0 2px #b48a56 inset;overflow:hidden;color:#493627}.diary-cover{padding:23px 30px;background:#76503d;color:#fff9e8;text-align:center;border-bottom:5px solid #c5a67e}.diary-cover h2{font-family:Georgia,'Malgun Gothic',serif;font-size:29px;margin:6px}.diary-cover span{font-size:12px;color:#f5e7d5}.diary-deco{font-size:16px;letter-spacing:10px;color:#e9cfa0}.diary-layout{display:grid;grid-template-columns:290px minmax(0,1fr);min-height:610px}.diary-index{padding:14px;background:#e3cda7;border-right:4px solid #b7966a;max-height:72vh;overflow:auto}.diary-index-head{font-size:16px;color:#604630;font-weight:850;display:flex;justify-content:space-between;padding:10px 8px 20px}.diary-index-head span{font-size:12px}.diary-date{width:100%;background:#f3e3c7;border:1px solid #cfb38c;border-radius:8px;display:flex;flex-direction:column;text-align:left;gap:4px;padding:12px;margin-bottom:8px;color:#523a29}.diary-date.active{background:#fff4df;border-color:#997254}.diary-date small{color:#7e6245}.diary-date b{font-size:15px}.diary-date span{font-size:12px;color:#806348}.diary-sheet{padding:36px 45px;background:repeating-linear-gradient(#fff9e9,#fff9e9 35px,#e2d2b9 36px);max-height:72vh;overflow:auto;min-height:610px}.diary-back{border:0;background:#efe0c6;border-radius:8px;color:#69472f;padding:9px 14px}.diary-sheet-date{display:block;margin-top:28px;font-size:14px;color:#88664e}.diary-sheet h3{font-size:28px;font-family:Georgia,'Malgun Gothic',serif;color:#4d3325;margin:10px 0 18px}.diary-mood{font-size:14px;color:#7d6247;margin-bottom:27px}.diary-handwriting{white-space:pre-wrap;overflow-wrap:anywhere;line-height:2.55;font-size:17px;color:#4e372b;font-family:Georgia,'Nanum Myeongjo','Malgun Gothic',serif}.diary-sign{text-align:right;font-style:italic;margin-top:35px;color:#906c4f}.diary-welcome{text-align:center;padding:90px 15px;color:#634731}.diary-welcome>span{font-family:Georgia,serif;font-style:italic;font-size:32px}.diary-welcome h3{font-size:28px}.diary-welcome p{font-size:15px;color:#8b6c52}.diary-line{max-width:450px;margin:45px auto;display:flex;flex-direction:column;gap:8px}.diary-line button{background:#f3e4ca;border:1px solid #d6bb97;padding:13px 16px;display:flex;align-items:center;gap:12px;color:#68452c;text-align:left;border-radius:8px}.diary-line span{font-size:12px}.diary-line b{flex:1}
@media(max-width:800px){.diary-layout{grid-template-columns:1fr}.diary-index{max-height:250px;border-right:0;border-bottom:3px solid #b7966a}.diary-sheet{padding:24px;min-height:450px;max-height:80vh}.pc-mail{grid-template-columns:110px 1fr}.pc-mail-side{padding:12px 3px}.pc-mail-side>b{font-size:12px}.pc-mail-side button{font-size:11px;padding:11px 4px}.pc-mail-list button b{flex-basis:65px}.pc-mail-list time{display:none}.desktop{min-height:560px}.desktop-icons{grid-template-columns:repeat(4,1fr)}.pc-app-window{min-height:420px!important}}


/* v0.2.7 · familiar gallery and microblog layouts, slightly altered marks */
.fb-logo{display:flex;align-items:baseline;gap:0;position:relative;padding-bottom:13px;font-family:'Malgun Gothic',Arial,sans-serif;font-weight:1000;font-size:clamp(25px,2.7vw,39px);letter-spacing:-.085em;line-height:1;}
.fb-logo .fb-logo-blue{color:#294baf}.fb-logo .fb-logo-dark{color:#1a2a57}.fb-logo small{position:absolute;right:0;bottom:0;color:#7d8698;font-size:10px;letter-spacing:.11em;text-transform:uppercase;font-weight:750}
.fb-identity{border-bottom:1px solid #d7dce7;padding-top:22px;padding-bottom:22px}.fb-fakesearch{border-color:#3054a9;color:#657894;background:#fff}.fb-menubar{background:#324e94;border-bottom-color:#233b7d;gap:26px}
.fb-directory button{padding:13px 12px}.fb-post-row{padding:8px 4px;min-height:37px}.fb-colheads{padding:9px 4px}.fb-post-name button{font-weight:500}.fb-titleline h2{font-size:25px}
.x-symbol{padding:5px 0 17px;justify-content:center;align-items:center}.x-symbol i{position:relative;color:#111418;font-size:51px;font-family:Arial,sans-serif;font-weight:500;letter-spacing:-.10em}.x-symbol i span{position:absolute;right:-13px;top:-3px;font-size:21px;font-weight:950;color:#1587d9;letter-spacing:0}
.x-site{color:#0f1419;border-color:#e2e8f0}.x-nav{border-right-color:#e8edf2}.x-nav button{font-size:19px;font-weight:650}.x-nav button:hover{background:#eef3f6}.x-feed-tabs button.active{border-color:#1d9bf0}.x-avatar{background:linear-gradient(135deg,#f1f5fa,#bfcee1);color:#36485b}.x-expand-replies,.x-replies-head button{color:#1d83c7}.x-trending{background:#f7f9fa}.x-trending>b{font-size:20px;color:#0f1419}
@media(max-width:760px){.fb-logo{font-size:25px}.fb-logo small{font-size:8px}.fb-identity{gap:14px}.fb-menubar{gap:11px}.x-symbol i{font-size:38px}.x-symbol i span{font-size:16px;right:-9px}}

/* v0.2.5: compact explorer document view, no heading overflow */
.pc-notes{height:100%;overflow:auto;min-width:0;padding:22px 24px;background:linear-gradient(180deg,#f6f8fc,#fff 200px);color:#1c2a40}
.pc-notes-head{display:flex;gap:16px;align-items:center;min-width:0;border-bottom:1px solid #dce3ed;padding-bottom:20px;margin-bottom:9px}
.pc-notes-head>span{width:65px;height:65px;display:grid;place-items:center;border-radius:14px;background:#d9e7fc;color:#386bc0;font-size:35px;flex:none}
.pc-notes-head>div{min-width:0;flex:1}.pc-notes-head h2{margin:0 0 4px!important;padding:0;white-space:normal;overflow-wrap:anywhere;line-height:1.25;color:#20365b;font-size:clamp(18px,2vw,26px)!important}.pc-notes-head small{color:#60728c;font-size:12px}
.pc-notes-list{padding:0!important;max-width:100%;overflow-x:hidden!important}.pc-notes-list button{width:100%;min-width:0;gap:15px;display:grid;grid-template-columns:35px minmax(0,1fr) 45px;text-align:left}.pc-notes-list button>span{font-size:25px;color:#5376a8}.pc-notes-list button>b{min-width:0;font-size:14px;white-space:normal;overflow-wrap:anywhere;line-height:1.45}.pc-notes-list button>small{color:#8190a0}
.pc-window-content,.pc-file-doc,.pc-file-list{min-width:0}.pc-file-doc h2,.pc-file-doc h3{overflow-wrap:anywhere;max-width:100%}
/* v0.2.5 fictional Korean gallery */
.fboard{width:100%;background:#f3f6fb;color:#192844;min-height:calc(100vh - 245px);font-family:'Malgun Gothic',Arial,sans-serif;border:1px solid #d3dce8;overflow:hidden}
.fb-identity{background:#fff;min-height:103px;display:flex;align-items:center;gap:25px;padding:15px 25px;border-bottom:1px solid #e3e7ef;min-width:0}
.fb-logo{flex:none;font-weight:950;font-size:35px;letter-spacing:-.09em;color:#253f8b;white-space:nowrap}.fb-logo span{color:#5293e0}.fb-logo small{font-size:11px;font-weight:750;letter-spacing:0;color:#667a93;display:block;text-align:center}
.fb-fakesearch{border:3px solid #4765b2;border-radius:4px;padding:13px 15px;color:#6e7e95;max-width:580px;flex:1;font-size:14px;min-width:0}.fb-fakesearch span{font-size:21px;color:#345cb1;margin-right:13px}.fb-login{font-size:12px;color:#60718b;white-space:nowrap}
.fb-menubar{background:#304f99;color:#fff;display:flex;gap:26px;align-items:center;flex-wrap:wrap;padding:14px 26px;font-size:14px;font-weight:750;border-bottom:3px solid #19346b}
.fb-layout{display:grid;grid-template-columns:minmax(0,1fr) 248px;gap:22px;padding:23px 25px 35px;max-width:1500px;margin:auto}.fb-main{min-width:0}.fb-side{background:white;border:1px solid #dbe3f0;align-self:start;display:flex;flex-direction:column;padding:16px;gap:4px;color:#273d66}.fb-side-title{font-size:17px;font-weight:800;border-bottom:2px solid #4767b3;padding-bottom:12px;margin-bottom:10px}.fb-shortcut{background:none;border:none;padding:10px 6px;display:flex;justify-content:space-between;gap:6px;text-align:left;color:#304c85;font-size:13px;overflow-wrap:anywhere}.fb-shortcut small{color:#7e8da2}.fb-shortcut:hover,.fb-shortcut.active{background:#edf4ff}.fb-side-tip{background:#eef3fa;border-top:1px solid #ccd9ec;padding:15px;margin-top:23px}.fb-side-tip p{font-size:12px;line-height:1.7;color:#667996}
.fb-headline{background:linear-gradient(120deg,#344b83,#627eb9);color:white;padding:30px 29px;margin-bottom:26px}.fb-headline>span{font-size:12px;color:#dee9ff}.fb-headline h1{font-size:clamp(19px,2.3vw,28px);margin:9px 0}.fb-headline p{margin:0;color:#e3eafc;font-size:14px}.fb-section-head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #344f94;margin:21px 0 15px;padding-bottom:10px}.fb-section-head h2{font-size:19px;margin:0}.fb-section-head span{font-size:12px;color:#647b9b}
.fb-directory{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px}.fb-directory button{display:flex;gap:11px;align-items:center;text-align:left;min-width:0;border:1px solid #d3def0;background:white;padding:18px 12px;color:#223d70}.fb-directory button:hover{background:#f5f9ff;border-color:#82a4dc}.fb-directory button>div{flex:1;min-width:0}.fb-directory button b{display:block;font-size:15px;overflow-wrap:anywhere}.fb-directory button small{display:block;color:#71839e;margin-top:8px;font-size:11px}.fb-directory button>span:last-child{font-size:22px;color:#9cadc5}.fb-dir-icon{font-size:27px;color:#5275b2}.fb-hotlist{background:white;border:1px solid #d8e2f2}.fb-hotlist button{border:0;border-bottom:1px solid #e8edf4;background:white;width:100%;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:12px;padding:13px 15px;text-align:left;color:#263b60}.fb-hotlist button:hover{background:#f0f5ff}.fb-hotlist button>span{color:#e25e70;font-weight:900}.fb-hotlist button b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.fb-hotlist button small{color:#7b8ba3;font-size:11px}
.fb-breadcrumb{display:flex;gap:8px;color:#657997;font-size:13px;margin-bottom:14px;flex-wrap:wrap}.fb-breadcrumb button{border:0;background:none;color:#345ca8;padding:0}.fb-titleline{padding:9px 2px 19px;display:flex;align-items:center;justify-content:space-between;gap:12px}.fb-titleline h2{font-size:27px;color:#233b78;margin:0 0 8px;overflow-wrap:anywhere}.fb-titleline small{color:#6b7d94}.fb-titleline>button,.fb-bottom button{border:1px solid #b7c7e5;background:#fff;color:#2e579e;font-weight:750;padding:10px 14px}.fb-board-bar{display:flex;justify-content:space-between;background:#edf2fa;border-top:3px solid #38589b;border-bottom:1px solid #b7c7e2;padding:12px;color:#344d83}.fb-board-bar span{font-size:12px}
.fb-board-table{background:white;width:100%}.fb-colheads,.fb-post-row{display:grid;grid-template-columns:45px minmax(0,1fr) 110px 91px 56px 50px;align-items:center;gap:4px;text-align:center}.fb-colheads{background:#f8fafc;border-bottom:1px solid #aabbd8;padding:12px 4px;font-size:12px;color:#506489}.fb-post-row{border-bottom:1px solid #e6eaf1;padding:12px 4px;font-size:12px;color:#6b7890;min-height:48px}.fb-post-row:nth-child(odd){background:#fcfdff}.fb-post-row:hover{background:#f1f6fe}.fb-idx{font-size:12px}.fb-post-name{text-align:left;display:flex;gap:6px;min-width:0;align-items:center}.fb-post-name button{padding:2px 0;border:0;background:none;color:#172b4c;font-weight:600;font-size:13px;text-align:left;overflow-wrap:anywhere}.fb-post-name button:hover{text-decoration:underline}.fb-post-name b{color:#bd3d4b;flex:none}.fb-user,.fb-date{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fb-search{display:flex;align-items:center;gap:10px;max-width:580px;margin:17px 0;color:#4263a2}.fb-search input{background:#fff;color:#263650;border:1px solid #adbedb;flex:1;min-width:0}.fb-search button{border:1px solid #b6c5d9;background:white;color:#304e85;padding:10px 13px}
.fb-article{background:#fff;border-top:3px solid #3c5b9f;border:1px solid #d6deeb;padding:23px 25px}.fb-article-title{display:flex;align-items:start;gap:10px}.fb-post-label{background:#e3e9f5;color:#40619c;padding:5px 8px;font-size:12px;flex:none}.fb-article h1{font-size:clamp(20px,2.2vw,27px);margin:0;letter-spacing:-.05em;overflow-wrap:anywhere;color:#172744}.fb-article-meta{display:flex;flex-wrap:wrap;gap:15px;border-bottom:1px solid #e6ebf2;padding:17px 0;color:#73849d;font-size:12px}.fb-article-meta b{color:#284b83}.fb-article-body{padding:40px 8px;min-height:260px}.fb-article-body .paragraph{color:#202b3b;font-size:15px;line-height:1.95}.fb-recommend{border:2px solid #a3c0e8;border-radius:9px;color:#2b5bad;display:flex;flex-direction:column;align-items:center;padding:13px 25px;margin:15px auto 35px;max-width:135px}.fb-recommend span{font-size:24px}.fb-recommend strong{font-size:26px}.fb-recommend small{font-size:12px}.fb-discussion{border-top:2px solid #c5d5eb}.fb-discussion h3{font-size:18px;border-bottom:1px solid #e2e8f2;padding:14px 3px;margin:0}.fb-discussion h3 span{color:#d44960}.fb-comment{display:flex;align-items:flex-start;gap:12px;padding:15px 5px;border-bottom:1px solid #e7ebf3}.fb-cavatar{width:31px;height:31px;background:#e4edf7;color:#41628e;border-radius:4px;display:grid;place-items:center;flex:none;font-weight:750}.fb-comment>div{flex:1;min-width:0}.fb-comment strong{color:#395a8e;font-size:13px}.fb-comment p{color:#263349;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;margin:8px 0 0}.fb-comment>small{color:#9aa9bd}.fb-noitems{padding:15px;color:#6b7b90}.fb-bottom{padding:22px 0 0}.fb-footer{background:#e8eef8;border-top:1px solid #ccd9ef;text-align:center;padding:18px;color:#687e9d;font-size:12px}
/* v0.2.5 fictional full news site */
.newsportal{width:100%;background:#fff;color:#1b2534;min-height:calc(100vh - 245px);border:1px solid #d9dee6;font-family:'Malgun Gothic',Arial,sans-serif;overflow:hidden}
.np-mast{max-width:1500px;margin:auto;padding:20px 26px 15px}.np-mast-small{display:flex;justify-content:space-between;font-size:11px;color:#7d8592;border-bottom:1px solid #dfe3e9;padding-bottom:10px}.np-brand{text-align:center;font-family:Georgia,'Malgun Gothic',serif;font-size:clamp(31px,3.2vw,50px);font-weight:950;color:#13263e;letter-spacing:-.06em;padding:10px 0 6px;overflow-wrap:anywhere}.np-mast-line{display:flex;justify-content:space-between;color:#718096;font-size:12px}.np-nav{padding:0 25px;background:#153553;color:#fff;display:flex;gap:4px;flex-wrap:wrap;justify-content:center}.np-nav button{padding:15px 20px;border:0;border-bottom:3px solid transparent;background:none;color:#e6edf7;font-size:14px;font-weight:750}.np-nav button:hover,.np-nav button.on{border-color:#a9cafa;background:#224a70}
.np-grid{display:grid;grid-template-columns:minmax(0,1fr) 255px;gap:27px;padding:24px 27px 50px;max-width:1500px;margin:auto}.np-main{min-width:0}.np-sidebar{border-left:1px solid #e0e5ed;padding:10px 0 0 23px}.np-sidebar h3{font-size:20px;margin:0;padding-bottom:15px;border-bottom:2px solid #183b64}.np-sidebar>button{border:0;border-bottom:1px solid #e8ecf2;background:none;color:#263a53;text-align:left;display:flex;align-items:start;gap:13px;padding:16px 0;width:100%}.np-sidebar>button:hover b{text-decoration:underline}.np-sidebar>button>span{color:#ca5964;font-size:22px;font-weight:900}.np-sidebar>button b{font-size:14px;line-height:1.5;display:block;overflow-wrap:anywhere}.np-sidebar>button small{display:block;margin-top:8px;color:#7f8fa2}.np-sidebox{margin-top:23px;background:#f4f6fa;padding:18px}.np-sidebox b{color:#314d71}.np-sidebox p{color:#6e8198;line-height:1.65;font-size:12px}
.np-topsection{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #152f50;padding:10px 0 15px;margin-bottom:17px}.np-topsection>b{font-size:22px}.np-topsection>span{font-size:12px;color:#708199}.np-hero{border:0;background:#f4f7fc;color:#202e41;display:grid;grid-template-columns:38% minmax(0,1fr);width:100%;padding:0;margin:0 0 28px;text-align:left;min-height:290px}.np-hero-art{background:linear-gradient(140deg,#1c415f 10%,#5488a8 70%,#a1baca);color:white;padding:24px;display:flex;flex-direction:column;justify-content:space-between;min-height:260px;overflow:hidden}.np-hero-art>span{font-size:12px;font-weight:750;background:#183c6277;align-self:start;padding:7px 11px}.np-hero-art strong{font-family:Georgia,serif;font-size:clamp(35px,4vw,65px);line-height:1.0;letter-spacing:-.08em;opacity:.45}.np-hero-art small{font-size:12px}.np-hero-copy{padding:30px 25px;min-width:0}.np-hero-copy h2{margin:12px 0 14px;font-size:clamp(21px,2.3vw,31px);line-height:1.45;color:#142c48;overflow-wrap:anywhere}.np-hero-copy p{font-size:15px;color:#5b6d84;line-height:1.8;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.np-hero-copy small,.np-newsrow small{color:#718299;font-size:12px}.np-category{font-size:12px;color:#2c6ab2;font-weight:850;letter-spacing:.01em}
.np-newslist{display:flex;flex-direction:column}.np-newsrow{width:100%;display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:22px;border:0;border-bottom:1px solid #e2e6ee;text-align:left;background:white;color:#202f42;padding:23px 0}.np-newsrow:hover h3,.np-hero:hover h2{text-decoration:underline}.np-newsrow h3{font-size:19px;line-height:1.48;color:#172c48;margin:8px 0;overflow-wrap:anywhere}.np-newsrow p{margin:0 0 13px;font-size:13px;color:#63758b;line-height:1.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.np-thumb{height:104px;border:1px solid #dde5ee;background:linear-gradient(145deg,#d7e1ee,#f0f3f8);display:flex;align-items:center;justify-content:center;flex-direction:column;color:#7f99b4}.np-thumb b{font-family:Georgia,serif;font-size:33px}.np-thumb span{font-size:12px}
.np-crumb{color:#69809a;font-size:13px;margin:8px 0 24px}.np-crumb button{border:0;background:none;color:#2b689e;padding:0}.np-article{max-width:940px}.np-article h1{font-size:clamp(26px,2.8vw,40px);line-height:1.4;letter-spacing:-.05em;color:#122b45;overflow-wrap:anywhere;margin:12px 0}.np-deck{font-size:17px;line-height:1.8;color:#52657e;margin:14px 0 24px}.np-byline{padding:16px 0;border-top:1px solid #cbd5e2;border-bottom:1px solid #e1e6ec;display:flex;align-items:center;gap:20px;flex-wrap:wrap;color:#76879a;font-size:12px}.np-byline span:first-child{color:#2b415b;font-weight:750}.np-article-body{margin:35px 0 25px;padding:0 12px}.np-article-body .paragraph{font-size:17px;line-height:2.1;color:#28384b;white-space:pre-wrap;overflow-wrap:anywhere}.np-article-end{border:1px solid #dae3ef;padding:14px;background:#f6f8fb;color:#697f99;font-size:12px;margin:34px 0}.np-comments{padding-top:15px;border-top:2px solid #31516c}.np-comments h3{font-size:20px}.np-comments h3 span{color:#2470b1}.np-comment{border-bottom:1px solid #e5eaf0;padding:13px 0}.np-comment b{color:#365b86;font-size:13px}.np-comment p{line-height:1.7;color:#28374b;white-space:pre-wrap;font-size:14px}.np-back{padding:12px 17px;color:#355b87;border:1px solid #bccce1;background:#fff;margin:22px 0}.np-footer{text-align:center;color:#71869f;font-size:12px;padding:23px;background:#f5f7fa;border-top:1px solid #e1e7ef}
/* v0.2.5 fictional SNS: inline replies, brand distinct from real platforms */
.x-symbol{display:flex;flex-direction:column;gap:0;align-items:center;padding:3px 8px 19px}.x-symbol i{font-style:normal;font-size:42px;line-height:1;color:#197e94}.x-symbol small{font-size:15px;color:#23718b;font-weight:950;letter-spacing:.04em}
.x-expand-replies{background:none;border:0;padding:2px 0;color:#28718b;font-size:13px;white-space:nowrap}.x-expand-replies:hover{text-decoration:underline}.x-expand-replies span{color:#238aa9;font-size:15px}.x-replies{margin-top:16px;border-top:1px solid #d9e3ed;padding:7px 0 0}.x-replies-head{display:flex;justify-content:space-between;align-items:center;color:#3d536c;font-size:13px;font-weight:750;padding:11px 0}.x-replies-head button{background:none;border:0;color:#2b8aac;font-size:12px}.x-no-reply{color:#7d8ca0;font-size:13px}.x-actions{align-items:center;gap:9px}.x-reply .x-avatar{height:36px;width:36px;font-size:14px;flex:none}
@media(max-width:1180px){.fb-layout,.np-grid{grid-template-columns:1fr}.fb-side{display:none}.np-sidebar{display:none}.fb-login{display:none}}
@media(max-width:760px){.fb-identity{padding:12px;gap:11px}.fb-logo{font-size:27px}.fb-fakesearch{font-size:11px;padding:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fb-fakesearch span{font-size:15px;margin-right:4px}.fb-menubar{gap:14px;padding:12px;font-size:12px}.fb-layout,.np-grid{padding:12px;gap:5px}.fb-colheads,.fb-post-row{grid-template-columns:32px minmax(0,1fr) 65px 35px}.fb-colheads>span:nth-child(4),.fb-colheads>span:nth-child(6),.fb-post-row>.fb-date,.fb-post-row>.fb-num:last-child{display:none}.fb-post-name button{font-size:12px}.fb-article{padding:16px}.fb-directory{grid-template-columns:1fr}.fb-hotlist button{grid-template-columns:20px 1fr}.fb-hotlist button small{display:none}.np-nav{justify-content:start;padding:0 10px}.np-nav button{padding:10px}.np-hero{grid-template-columns:1fr}.np-hero-art{min-height:125px;padding:15px}.np-hero-art strong{font-size:32px}.np-hero-copy{padding:18px}.np-newsrow{grid-template-columns:minmax(0,1fr) 70px}.np-thumb{height:80px}.np-mast{padding:12px}.np-mast-small span:last-child{display:none}.pc-notes{padding:15px}.pc-notes-head>span{width:45px;height:45px;font-size:25px}}


/* v0.2.13 · responsive tablet readers: fit viewport, scroll content INSIDE each device. */
.tablet-view-switch{display:none}
@media (max-width:1200px), (max-height:900px) and (pointer:coarse){
  #panel{inset:5px;width:auto;max-width:none;height:calc(100dvh - 10px);border-radius:12px}
  .header{height:54px;padding:8px 13px}.header h2{font-size:16px}.header small{font-size:10px}
  .shell{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .side{display:flex;flex-direction:row;align-items:center;gap:4px;padding:6px 7px;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid var(--line);white-space:nowrap;scrollbar-width:thin}
  .side button{width:auto;flex:none;margin:0;padding:9px 11px;font-size:13px;white-space:nowrap}
  .side .side-caption{display:none}
  .main{min-height:0;min-width:0;padding:8px 10px;overflow-y:auto;overscroll-behavior:contain}
  .pane-title{margin:0 0 5px}.pane-title h3{font-size:17px}
  .tablet-view-switch{display:flex;gap:7px;margin:0 0 8px;position:relative;z-index:1}
  .tablet-view-switch button{font-size:13px;min-height:35px;padding:7px 13px}
  .viewer-layout,.viewer-layout.focused{display:block;min-width:0}
  .viewer-layout>.controls,.viewer-layout.focused>.controls{display:none}
  .viewer-layout>.stage{display:none;min-width:0}
  .viewer-layout.tablet-controls>.controls{display:flex;max-height:none;overflow:visible;width:100%;padding-bottom:12px}
  .viewer-layout.tablet-reader>.stage{display:block}
  .viewer-layout.no-record>.stage{display:none}
  .viewer-layout.no-record>.controls{display:flex}
  .focus-bar{display:none}
  .stage .preview{height:calc(100dvh - 215px);min-height:0;max-height:none;padding:10px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;border-radius:11px}
  .stage .preview-title{margin:0 0 6px;padding:0;gap:5px;flex-wrap:wrap}
  .stage .preview-title b{font-size:15px}.stage .preview-title .pill{font-size:10px;max-width:100%;overflow-wrap:anywhere}
  /* Phone housing and screen use real available device height, not 790px. */
  .iphone{width:min(100%,calc((100dvh - 280px)*0.615),435px);height:clamp(340px,calc(100dvh - 280px),730px);min-height:0;margin:0 auto 4px;padding:5px;border:4px solid #1b2028;border-radius:clamp(29px,4vh,49px)}
  .phone-screen{height:100%;min-height:0;max-height:100%;border-radius:clamp(24px,3.4vh,40px)}
  .ios-status{height:40px;padding:6px 24px 3px;font-size:12px}.ios-island{top:5px;height:24px;width:92px}
  .ios-homescreen{padding:6px 12px 27px}.ios-widget{margin:clamp(6px,2vh,22px) 0 clamp(10px,2.8vh,29px)}
  .ios-widget-date{font-size:13px}.ios-widget-time{font-size:clamp(36px,6.5vh,60px)}.ios-widget-caption{margin:4px auto;font-size:11px}
  .ios-apps{column-gap:5px;row-gap:clamp(8px,2vh,17px)}
  .ios-app{font-size:11px;gap:4px}.ios-app-icon{width:clamp(38px,6vh,61px);height:clamp(38px,6vh,61px);font-size:clamp(21px,3.4vh,32px);border-radius:13px}
  .ios-dock{padding:8px 6px;gap:6px;border-radius:17px}.ios-dock .ios-app-icon{width:clamp(35px,5.5vh,53px);height:clamp(35px,5.5vh,53px);font-size:26px}
  .ios-navbar{height:43px;grid-template-columns:62px 1fr 40px;padding:0 8px}.ios-navbar>b{font-size:14px}
  .ios-scroll{min-height:0;padding:7px 11px 29px}.ios-pageheading{font-size:21px;margin:7px 3px 11px}
  .ios-row{min-height:59px;padding:9px 7px}.ios-avatar{width:39px;height:39px;font-size:16px}
  .ios-row b{font-size:14px}.ios-message>span{font-size:14px;padding:10px 12px}
  /* Desktop monitor: internal app windows get the space remaining after taskbar/icons. */
  .monitor{width:100%;padding:5px;border-width:4px;border-radius:10px;margin:0 auto;box-shadow:0 6px 22px #0008}
  .desktop{height:clamp(315px,calc(100dvh - 340px),745px);min-height:0;padding:9px 10px 5px;overflow:hidden;border-radius:5px;display:flex;flex-direction:column}
  .desktop-icons{grid-template-columns:repeat(4,minmax(55px,78px));gap:3px 7px;flex:none}
  .desktop-icon{font-size:11px;min-height:60px;padding:2px;gap:1px}.desktop-icon i{font-size:25px;margin:0}
  .desktop-window.pc-app-window{height:auto;min-height:0!important;max-height:none;flex:1;margin:5px auto;width:100%;overflow:hidden}
  .desktop-window-title.pc-window-title{height:31px;padding:3px 7px}.pc-window-content{min-height:0;flex:1}
  .desktop-taskbar{height:34px;min-height:34px;font-size:11px;margin-top:auto;padding:4px 9px;gap:6px}.desktop-taskbar button{font-size:17px}
  .monitor-stand{display:none}
  .pc-file-grid{padding:11px;gap:8px;grid-template-columns:repeat(auto-fill,minmax(80px,1fr))}.pc-file-grid span{font-size:34px}
  .pc-history{padding:12px 15px}.pc-webpage{padding:12px 15px}.pc-mail-side{padding:9px 5px}.pc-mail-list button{min-height:45px;padding:9px 10px}
  /* Diary: fixed book height, with independent index and page scrolling. */
  .diary-book{width:100%;max-width:100%;height:clamp(320px,calc(100dvh - 285px),760px);min-height:0;display:flex;flex-direction:column;border:6px solid #6c4937;border-radius:11px;margin:0 auto}
  .diary-cover{flex:none;padding:7px 12px;border-bottom-width:3px}.diary-cover h2{font-size:19px;margin:2px}.diary-deco{font-size:11px;letter-spacing:5px}.diary-cover span{font-size:10px}
  .diary-layout{min-height:0;flex:1;overflow:hidden;grid-template-columns:minmax(155px,28%) minmax(0,1fr)}
  .diary-index,.diary-sheet{max-height:none;min-height:0;height:100%;overflow-y:auto;overscroll-behavior:contain}
  .diary-index{padding:9px}.diary-index-head{padding:6px 4px 10px}.diary-date{padding:8px;margin-bottom:5px}
  .diary-sheet{padding:15px 21px}.diary-sheet-date{margin-top:14px}.diary-sheet h3{font-size:22px;margin:7px 0 12px}.diary-mood{margin-bottom:12px}
  .diary-handwriting{font-size:16px;line-height:2.0}.diary-welcome{padding:25px 12px}.diary-line{margin:17px auto}
  /* All website-like readers scroll inside the view instead of extending the main panel. */
  .fboard,.newsportal,.wiki-site,.x-site,.web{min-height:0}
  .wiki-content{min-height:0}.live-lines{height:min(48dvh,480px)}
}
@media (max-width:700px) and (orientation:portrait){
  .main{padding:7px}.stage .preview{padding:6px;height:calc(100dvh - 205px)}
  .diary-layout{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .diary-index{height:auto;max-height:110px;display:flex;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:3px solid #b7966a;align-items:center;gap:7px;padding:6px}
  .diary-index-head{flex:none;display:block;font-size:12px;padding:5px 8px}.diary-index-head span{display:block}
  .diary-date{flex:0 0 145px;margin:0;padding:6px 8px;height:85px;overflow:hidden}.diary-date b{font-size:12px}.diary-date small,.diary-date span{font-size:11px}
  .diary-sheet{height:100%;padding:13px}.diary-handwriting{font-size:15px;line-height:1.85}
  .pc-mail{grid-template-columns:92px minmax(0,1fr)}.pc-mail-side>b{font-size:12px;margin:2px 4px 8px}.pc-mail-side button{padding:8px 5px;font-size:11px}
  .pc-mail-list button b{flex-basis:70px}.pc-mail-list time{display:none}
  .desktop-icons{grid-template-columns:repeat(4,minmax(40px,65px))}
  .np-grid,.fb-layout{padding:10px}
}
@media (max-height:700px) and (pointer:coarse){
  .ios-status{height:34px}
  .ios-homescreen{padding:3px 10px 20px}
  .ios-widget{margin:4px 0 8px}.ios-widget-time{font-size:clamp(27px,5.7vh,40px)}
  .ios-widget-caption{margin:2px auto}.ios-apps{row-gap:5px}
  .ios-app{gap:2px;font-size:10px}.ios-app-icon{width:clamp(31px,5.5vh,42px);height:clamp(31px,5.5vh,42px);font-size:23px;border-radius:10px}
  .ios-dock{padding:5px;gap:3px}.ios-dock .ios-app-icon{width:35px;height:35px;font-size:23px}
  .ios-homebar{bottom:5px}
}
@media (max-height:580px) and (pointer:coarse){
  .iphone{height:calc(100dvh - 174px);width:min(100%,calc((100dvh - 174px)*0.615));min-height:290px}
  .desktop{height:calc(100dvh - 185px);min-height:250px}
  .diary-book{height:calc(100dvh - 180px);min-height:260px}
  .stage .preview{height:calc(100dvh - 156px)}
}

/* v0.2.14 · compact generation controls and accessible help */
.estimate-compact{display:flex;flex-direction:column;gap:7px;line-height:1.45;padding:12px 14px}
.estimate-compact>b{font-size:14px;margin-bottom:2px}
.estimate-summary-row{display:flex;justify-content:space-between;align-items:baseline;gap:9px;flex-wrap:wrap;font-size:12px}
.estimate-summary-row span{color:#cfdaed}.estimate-summary-row strong{color:white;font-size:12px;overflow-wrap:anywhere}
.estimate-summary-price{font-weight:850;font-size:19px;color:#f0cd89;margin:3px 0}
.estimate-compact small{font-size:11px;line-height:1.55;color:#becbdf}
.field select[data-field="outputSize"]{max-width:100%;width:100%;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;min-width:0}
.help-trigger{min-width:48px}
.help-popover{position:absolute;right:15px;top:70px;width:min(460px,calc(100% - 30px));max-height:min(72dvh,680px);overflow-y:auto;overscroll-behavior:contain;z-index:2147483005;border:1px solid #7e8baf;border-radius:14px;background:#17243a;color:#f7f9ff;box-shadow:0 16px 40px #000b;padding:15px 17px;font-size:13px;line-height:1.7}
.help-title{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:16px;margin-bottom:7px}
.help-title button{flex:none}
.help-popover section{border-top:1px solid #425473;padding:10px 0 4px}
.help-popover section>b{font-size:14px;color:#f3e3b2}
.help-popover p{margin:5px 0 10px;color:#e2eafa;overflow-wrap:anywhere}
.global-delete-confirm{padding:12px;background:#35242e;border:1px solid #b65d72;border-radius:9px;display:flex;flex-direction:column;gap:9px}
.global-delete-confirm p{margin:0;font-size:12px;color:#f8dfdf;line-height:1.55}
@media(max-width:1200px){.help-popover{top:56px;max-height:calc(100dvh - 68px)}.header .head-actions{gap:4px}.header .head-actions button{padding:7px 9px;font-size:12px}}


/* v0.2.15 · Tablet landscape: show generation panel and reader side by side.
   Only portrait tablets and phone-sized viewports retain the pane switch. */
@media (min-width:701px) and (max-width:1200px) and (orientation:landscape),
       (min-width:1201px) and (max-height:900px) and (orientation:landscape) and (pointer:coarse) {
  .tablet-view-switch{display:none!important}
  .viewer-layout,
  .viewer-layout.focused,
  .viewer-layout.tablet-controls,
  .viewer-layout.tablet-reader{
    display:grid!important;
    grid-template-columns:minmax(230px,clamp(230px,26vw,295px)) minmax(0,1fr)!important;
    gap:10px;
    align-items:start;
    min-width:0;
  }
  .viewer-layout>.controls,
  .viewer-layout.focused>.controls,
  .viewer-layout.tablet-reader>.controls,
  .viewer-layout.tablet-controls>.controls,
  .viewer-layout.no-record>.controls{
    display:flex!important;
    flex-direction:column;
    width:100%;
    min-width:0;
    max-height:calc(100dvh - 132px);
    padding-bottom:12px;
    overflow-y:auto;
    overflow-x:hidden;
    scrollbar-width:thin;
    overscroll-behavior:contain;
  }
  .viewer-layout>.stage,
  .viewer-layout.tablet-reader>.stage,
  .viewer-layout.tablet-controls>.stage,
  .viewer-layout.no-record>.stage{
    display:block!important;
    min-width:0;
  }
  .focus-bar{display:none!important}
  .stage .preview{
    height:calc(100dvh - 160px);
    min-height:0;
    overflow-y:auto;
    overflow-x:hidden;
    padding:9px;
  }
  /* Device mockups maximize the available reader height, keeping internal scrolling. */
  .iphone{
    height:clamp(300px,calc(100dvh - 204px),730px);
    width:min(100%,calc((100dvh - 204px)*0.615),435px);
    margin:0 auto 3px;
  }
  .desktop{height:clamp(275px,calc(100dvh - 260px),745px)}
  .diary-book{height:clamp(290px,calc(100dvh - 200px),760px)}
}


/* v0.2.16 · No silent clipping: every PC application's content area scrolls.
   The monitor keeps its tablet-sized outer frame; long text and rows stay reachable. */
.pc-window-content{
  display:flex;
  flex-direction:column;
  flex:1 1 auto;
  min-width:0;
  min-height:0;
  overflow-y:auto;
  overflow-x:hidden;
  overscroll-behavior:contain;
}
.pc-window-content > .pc-explorer-bar{flex:none}
.pc-window-content > .pc-file-grid{
  flex:1 1 auto;
  min-height:0;
  align-content:start;
  overflow-y:auto;
  overflow-x:hidden;
  overscroll-behavior:contain;
}
.pc-window-content > .pc-file-list,
.pc-window-content > .pc-file-doc{
  flex:1 1 auto;
  min-width:0;
  min-height:0;
  max-height:none;
  overflow-y:auto;
  overflow-x:hidden;
  overscroll-behavior:contain;
}
.pc-window-content > .pc-navbtn{align-self:flex-start;flex:none}
.pc-window-content > .pc-mail,
.pc-window-content > .pc-browser,
.pc-window-content > .pc-notes{
  flex:1 1 auto;
  min-height:0;
  min-width:0;
  max-height:100%;
}
.pc-mail-main,.pc-mail-list,.pc-mail-detail,.pc-browser .pc-history,
.pc-browser .pc-webpage,.pc-notes,.pc-notes-list{
  min-height:0;
  overscroll-behavior:contain;
}
.pc-mail-list,.pc-mail-detail,.pc-browser .pc-history,.pc-browser .pc-webpage,
.pc-notes{overflow-y:auto}
.pc-file-doc .paragraph,.pc-mail-message,.pc-webpage-body,
.pc-notes .paragraph{overflow-wrap:anywhere;white-space:pre-wrap}
/* Diary: show its one entry immediately, without a redundant list/sidebar. */
.diary-book{display:flex;flex-direction:column}
.diary-cover{flex:none}
.diary-layout{
  display:flex;
  flex:1 1 auto;
  grid-template-columns:none;
  grid-template-rows:none;
  min-height:0;
  min-width:0;
  overflow:hidden;
}
.diary-layout > .diary-sheet{
  flex:1 1 auto;
  min-width:0;
  min-height:0;
  height:auto;
  max-height:min(75dvh,850px);
  overflow-y:auto;
  overflow-x:hidden;
  overscroll-behavior:contain;
}
.diary-handwriting{overflow-wrap:anywhere;white-space:pre-wrap}
@media (max-width:1200px), (max-height:900px) and (pointer:coarse){
  .diary-layout > .diary-sheet{height:100%;max-height:none;min-height:0}
}

/* v0.2.17 · Landscape tablets use the same LEFT vertical navigation as desktop.
   The earlier tablet breakpoint set .shell/.side to a top horizontal tab strip;
   restore BOTH outer columns and the inner viewer columns for wide landscapes.
   Portrait/narrow layouts keep their compact navigation and pane switch. */
@media (min-width:701px) and (orientation:landscape) {
  .shell{
    display:grid;
    grid-template-columns:clamp(124px,15.5vw,176px) minmax(0,1fr);
    grid-template-rows:minmax(0,1fr);
    min-width:0;
    min-height:0;
    overflow:hidden;
  }
  .side{
    display:flex;
    flex-direction:column;
    align-items:stretch;
    justify-content:flex-start;
    gap:3px;
    width:auto;
    min-width:0;
    min-height:0;
    padding:10px 7px;
    overflow-y:auto;
    overflow-x:hidden;
    border-right:1px solid var(--line);
    border-bottom:0;
    white-space:normal;
    scrollbar-width:thin;
    overscroll-behavior:contain;
  }
  .side button{
    display:flex;
    flex:0 0 auto;
    width:100%;
    min-width:0;
    margin:0 0 2px;
    padding:9px 8px;
    text-align:left;
    font-size:clamp(11px,1.12vw,14px);
    line-height:1.35;
    white-space:normal;
    overflow-wrap:anywhere;
    align-items:center;
  }
  .side .side-caption{
    display:block;
    flex:none;
    margin:12px 7px 5px;
    white-space:normal;
  }
  .main{
    min-width:0;
    min-height:0;
    overflow-y:auto;
    overflow-x:hidden;
  }
}


.pane-title-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;min-width:0}
.pane-title-row h3{margin:0}
.theme-picker{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--line);border-radius:10px;background:#121b2b;color:#dfe8f8;min-width:0}
.theme-picker span{font-size:12px;font-weight:700;white-space:nowrap}
.theme-picker select{min-width:min(290px,52vw);max-width:100%;background:#19253a;color:#eef4ff;border:1px solid #596781;border-radius:8px;padding:7px 10px;font:inherit}
.theme-pill{background:#2a2441;border-color:#7556b6;color:#efe5ff}
.alt-device{border:1px solid #3d4d68;border-radius:24px;padding:16px;background:linear-gradient(180deg,#0c1320,#141b2b);box-shadow:0 18px 40px rgba(0,0,0,.32)}
.alt-device.classic{background:linear-gradient(180deg,#271b12,#3b2b1c);border-color:#73573a;color:#f5ead8}
.alt-device.retro{background:linear-gradient(180deg,#29404a,#1e2b30);border-color:#708b96;color:#eef9ff}
.alt-device.fantasy{background:linear-gradient(180deg,#1b1538,#2d1f52 35%,#120f25);border-color:#8d6ff0;color:#efe8ff;box-shadow:0 0 0 1px rgba(168,122,255,.25),0 18px 40px rgba(0,0,0,.35)}
.alt-device-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:0 2px 12px}
.alt-device-head b{display:block;font-size:20px;color:inherit}
.alt-device-head small{display:block;color:inherit;opacity:.78;line-height:1.45}
.alt-device-badge{padding:6px 10px;border-radius:999px;border:1px solid currentColor;opacity:.8;font-size:11px;white-space:nowrap}
.alt-device-body{background:rgba(10,14,25,.38);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:14px;backdrop-filter:blur(6px)}
.alt-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
.alt-grid.photos{grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
.alt-card,.alt-photo-card,.board-alt-section,.board-alt-home button,.board-alt-hot button,.news-alt-card,.wiki-alt-card,.wiki-alt-link,.x-alt-trends button{cursor:pointer;text-align:left;width:100%;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.04);color:inherit;padding:12px}
.alt-card b,.alt-photo-card small,.news-alt-card b,.wiki-alt-card b{display:block}
.alt-card small,.news-alt-card small,.wiki-alt-card small,.alt-photo-card small{opacity:.75;line-height:1.45}
.alt-list,.alt-feed,.alt-thread,.board-alt-list,.news-alt-grid,.wiki-alt-home,.x-alt-layout main{display:grid;gap:10px}
.alt-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;text-align:left;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.04);color:inherit}
.alt-row.static{cursor:default}
.alt-row b,.alt-row small{display:block;grid-column:1}
.alt-row span{grid-column:2;grid-row:1 / span 2;white-space:nowrap;opacity:.72}
.alt-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.alt-empty{opacity:.7;padding:14px 2px}
.alt-thread{display:grid;gap:12px}
.alt-bubble{padding:12px 14px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06)}
.alt-bubble.me{margin-left:38px}
.alt-bubble.them{margin-right:38px}
.alt-bubble b{display:block;margin-bottom:6px}
.alt-bubble p{margin:0 0 6px;line-height:1.7;white-space:pre-wrap}
.alt-bubble small{opacity:.72}
.alt-post{padding:13px 14px;border:1px solid rgba(255,255,255,.10);border-radius:15px;background:rgba(255,255,255,.04)}
.alt-post b{display:block}
.alt-post small,.alt-meta,.alt-comment{opacity:.82}
.alt-post p,.board-alt-post p,.news-alt-article p,.x-alt-post p,.diary-alt-body{line-height:1.75;white-space:pre-wrap}
.alt-comment{margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.12)}
.alt-photo-card{display:grid;gap:9px;place-items:center;text-align:center;min-height:120px}
.alt-photo-card span,.alt-emoji{font-size:40px}
.alt-doc{padding:14px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.03)}
.alt-doc h3,.alt-doc h2{margin:0 0 10px}
.retro-keypad,.device-footer{margin-top:12px;text-align:center;opacity:.75;font-size:12px;letter-spacing:.16em}
.board-alt,.news-alt,.wiki-alt,.x-alt{border:1px solid #435067;border-radius:18px;padding:14px;background:#111827;color:#e9f1ff}
.board-alt.classic,.news-alt.classic,.wiki-alt.classic,.x-alt.classic{background:#2a2018;color:#f4e8d5;border-color:#7d6549}
.board-alt.fantasy,.news-alt.fantasy,.wiki-alt.fantasy,.x-alt.fantasy{background:#181330;color:#f0ebff;border-color:#8b73de}
.board-alt.foreign4{background:#f1f5ff;color:#12203c;border-color:#a2b4ee}
.board-alt.foreign2{background:#faf6f1;color:#392d22;border-color:#c1b0a1}
.board-alt-head,.news-alt-head,.wiki-alt-head,.x-alt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:10px;margin-bottom:14px}
.board-alt-head b,.news-alt-head b,.wiki-alt-head b,.x-alt-head b{font-size:20px}
.board-alt-home{display:grid;gap:16px}
.board-alt-sections{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.board-alt-hot{display:grid;gap:10px}
.board-alt-hot button{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center}
.board-alt-list{display:grid;gap:9px}
.board-alt-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.04);color:inherit;text-align:left}
.board-alt-row small{display:block;opacity:.76;margin-top:3px}
.board-alt-post{padding:14px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.04)}
.board-alt-meta{display:flex;gap:10px;flex-wrap:wrap;opacity:.76;margin-bottom:12px}
.board-alt-comments{margin-top:18px;display:grid;gap:8px}
.board-alt-comment{padding-top:8px;border-top:1px dashed rgba(255,255,255,.12)}
.board-alt-crumb{margin-bottom:12px;opacity:.8;display:flex;gap:8px;flex-wrap:wrap}
.news-alt-grid{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.news-alt-card p{margin:.55em 0 0;line-height:1.6}
.news-alt-card span{display:block;margin-top:10px;opacity:.72}
.news-alt-article{padding:8px 2px}
.news-alt-meta{display:flex;gap:10px;flex-wrap:wrap;opacity:.76;margin-bottom:12px}
.news-alt-lede{font-size:16px;font-weight:600;opacity:.92}
.wiki-alt-layout{display:grid;grid-template-columns:minmax(190px,240px) minmax(0,1fr);gap:14px}
.wiki-alt-side{display:grid;gap:8px;align-content:start}
.wiki-alt-link.active{outline:2px solid currentColor}
.wiki-alt-doc{padding:8px 2px}
.wiki-alt-dochead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.wiki-alt-dochead h1{margin:0}
.wiki-alt-tabs{display:flex;gap:6px;flex-wrap:wrap}
.wiki-alt-tabs button{padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:inherit}
.wiki-alt-tabs .selected{background:rgba(255,255,255,.12)}
.wiki-alt-summary{opacity:.86;line-height:1.7}
.wiki-alt-discussion{display:grid;gap:10px}
.wiki-alt-discussion > div{padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.x-alt-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:14px}
.x-alt-post{padding:14px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.04)}
.x-alt-meta{display:flex;gap:8px;flex-wrap:wrap;opacity:.76;margin-bottom:8px}
.x-alt-stats{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:10px;opacity:.85}
.x-alt-stats button{padding:0;background:none;border:0;color:inherit;cursor:pointer}
.x-alt-replies{display:grid;gap:9px;margin-top:10px;padding-top:10px;border-top:1px dashed rgba(255,255,255,.12)}
.x-alt-reply{padding:10px;border-radius:12px;background:rgba(255,255,255,.04)}
.x-alt-search{padding:10px 12px;border:1px solid rgba(255,255,255,.10);border-radius:12px}
.x-alt-search input{width:100%;margin-top:8px;background:transparent;border:0;color:inherit;font:inherit;outline:none}
.x-alt-trends{display:grid;gap:8px;margin-top:12px}
.diary-alt{border-radius:22px;padding:18px;border:1px solid #59657b;background:#1a2232;color:#eef4ff}
.diary-alt.modern-note{background:linear-gradient(180deg,#161d29,#1f2937)}
.diary-alt.classic-paper{background:linear-gradient(180deg,#322519,#4a3723);border-color:#87674c;color:#f7ead7}
.diary-alt.fantasy-parchment{background:linear-gradient(180deg,#23193f,#35245a);border-color:#9a7cff;color:#f2ecff}
.diary-alt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.diary-alt-head b{font-size:20px}
.diary-alt-head small{opacity:.8}
.diary-alt-paper{padding:18px;border-radius:18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
.diary-alt-meta{display:flex;gap:8px;flex-wrap:wrap;opacity:.78;font-size:12px;margin-bottom:12px}
.diary-alt-paper h2{margin:0 0 12px}
.diary-alt-body{min-height:260px}
@media (max-width:900px){
  .theme-picker{width:100%;justify-content:space-between}
  .theme-picker select{min-width:0;flex:1}
  .wiki-alt-layout,.x-alt-layout{grid-template-columns:1fr}
}


/* v0.2.20: independent physical media designs, scoped under dedicated theme roots. */
.pane-title-row{width:100%;min-width:0}
.theme-picker{max-width:min(380px,100%)}
.theme-picker select{max-width:290px}
.preview .theme-pill{font-size:11px;white-space:normal}
.stage .preview{scrollbar-width:thin}
.stage .preview :is(.theme-longtext,.archive-text,.codex-paragraph,.gazette-article-body,.notice-body,.micro-post-text,.flip-detail-list,.letter-read-content){overflow-wrap:anywhere}

/* Flip phone. A real two-piece hinge, LCD and usable numeric buttons. */
.flip-display-wrap{display:flex;align-items:center;flex-direction:column;gap:13px;padding:14px 8px 24px;min-width:0}
.flip-phone{width:min(376px,100%);min-width:0;margin:auto;display:flex;flex-direction:column;align-items:center;color:#20394a;font-family:Arial,'Malgun Gothic',sans-serif;filter:drop-shadow(0 18px 14px #0008)}
.flip-phone button{cursor:pointer}
.flip-top{height:350px;width:95%;background:linear-gradient(130deg,#90a6b4 0%,#eef6f9 22%,#9daeb9 61%,#556d7e 100%);border:4px solid #778b99;border-radius:42px 42px 11px 11px;padding:14px 15px 10px;box-shadow:inset 3px 3px 3px #fff8,inset -4px -4px 6px #465e7588;position:relative;display:flex;flex-direction:column;align-items:center;gap:9px}
.flip-ear{width:66px;height:7px;border-radius:18px;background:linear-gradient(#30485d,#677f92);border:1px solid #455e70;flex:none}
.flip-lcd{position:relative;width:100%;min-height:0;flex:1;border:7px solid #4f687a;background:#cde6e8;border-radius:13px;box-shadow:inset 0 0 14px #103f5066,0 2px 5px #fff6;display:flex;flex-direction:column;overflow:hidden}
.flip-status{height:23px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 10px;background:#3c7185;color:#fff;font-size:11px;font-weight:800}
.flip-home,.flip-detail{min-height:0;flex:1;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(155deg,#e6faf2,#a9cdd2)}
.flip-home>b{font-size:17px;font-weight:850;margin:12px 12px 7px;padding-bottom:8px;border-bottom:2px solid #799eae;text-align:center;color:#294a5b}
.flip-menu{min-height:0;overflow-y:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:2px 10px 9px;align-content:start}
.flip-item{position:relative;border:1px solid #91b2bc;border-radius:6px;background:linear-gradient(#f8fcff,#e1f0f1);padding:9px 3px;min-height:68px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;color:#31556b;font-size:11px;font-weight:800;box-shadow:0 2px 0 #92b2bc;text-align:center}
.flip-item .theme-glyph{font-size:18px}
.flip-item .theme-menu-text{font-size:11px}
.flip-item small{font-size:9px;opacity:.68}
.flip-item i{position:absolute;top:3px;left:5px;font-size:9px;font-style:normal;color:#496c81}
.flip-detail-head{display:flex;align-items:center;gap:5px;border-bottom:1px solid #8bafb4;padding:5px 7px;flex:none}
.flip-detail-head button{border:0;background:#5b8a95;color:#fff;border-radius:5px;padding:2px 10px;font-size:13px}
.flip-detail-head b{flex:1;text-align:center;font-size:12px}
.flip-detail-list{min-height:0;overflow:auto;padding:8px;flex:1;font-size:12px}
.flip-detail-list .theme-record-line,.flip-detail-list .theme-social-entry,.flip-detail-list .theme-document,.flip-detail-list .theme-message,.flip-detail-list .theme-picture{color:#263e49;background:rgba(255,255,255,.68);border:1px solid #8eacb4}
.flip-softkeys{display:flex;align-items:center;justify-content:space-between;flex:none;height:25px;padding:0 7px;border-top:1px solid #a1b7c6;background:linear-gradient(#e0f1f1,#bfdadf);font-size:9px;color:#59778a}
.flip-softkeys button{border:0;background:none;color:#2d5c75;font:inherit;font-weight:800;padding:2px}
.flip-hinge{width:99%;height:19px;flex:none;background:linear-gradient(#4f697e,#d9e8ed 28%,#89a6b7 56%,#536c7d);border:2px solid #7d92a0;box-shadow:0 3px 4px #152d3d7a;border-radius:5px;z-index:2}
.flip-bottom{height:270px;width:100%;border:4px solid #8496a4;border-radius:14px 14px 58px 58px;background:linear-gradient(122deg,#c3d2dd,#eff7fa 25%,#b9cbd7 65%,#708a9e);box-shadow:inset 4px 3px 7px #fff9,inset -6px -7px 9px #667b8da0;padding:12px 19px 25px}
.flip-controls{display:flex;justify-content:center;align-items:center;gap:15px;margin:0 0 12px}
.flip-controls button{border:2px solid #9fb5c4;background:linear-gradient(#e8f3f6,#7892a5);color:#324b61;font-weight:900;border-radius:22px;min-width:48px;height:34px;box-shadow:0 2px 2px #5f788f88}
.flip-controls .flip-dpad{width:83px;height:45px;color:#fff;font-size:18px;background:radial-gradient(circle,#7698ad 25%,#4e7188 26%,#54778b 53%,#b3cbd6 55%);border-radius:25px}
.flip-keys{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px 9px}
.flip-key{border:1px solid #9baebb;border-radius:18px;background:linear-gradient(#fbfeff,#d2e1e8);box-shadow:0 2px 3px #5c718e7a;color:#324b60;height:34px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px}
.flip-key b{font-size:16px;line-height:18px}
.flip-key small{font-size:7px;line-height:9px;letter-spacing:.05em}
.device-caption{color:#b9cce1;text-align:center;font-size:12px;margin:0}

/* Shared record layouts inside media only; never giant content cards. */
.theme-record-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;width:100%;border:1px solid #d4c4a7;background:#fff9ec;color:#4c3427;padding:10px;text-align:left;margin-bottom:7px;border-radius:4px}
.theme-line-heading{font-weight:850;grid-column:1}
.theme-line-desc{opacity:.8;font-size:12px;grid-column:1;white-space:pre-wrap}
.theme-record-line time{font-size:10px;white-space:nowrap;opacity:.72;grid-column:2;grid-row:1 / span 2}
.theme-picture-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:9px}
.theme-picture{background:rgba(255,255,255,.55);border:1px solid #d9be91;border-radius:4px;color:inherit;padding:10px;text-align:center;display:flex;flex-direction:column;gap:6px}
.theme-picture>span{font-size:36px}
.theme-picture>b{font-size:11px}
.theme-picture>small{font-size:10px;opacity:.7}
.theme-social-entry{padding:13px;margin-bottom:10px;background:#fff9eb;border:1px solid #dbbd8a;color:#3c2d22;border-radius:4px}
.theme-social-entry header{display:flex;justify-content:space-between;gap:8px;font-size:12px}
.theme-social-entry p{font-size:13px;line-height:1.7;white-space:pre-wrap}
.theme-social-entry small,.theme-social-entry time{font-size:10px;opacity:.73}
.theme-social-comment{border-top:1px solid #ddd0af;padding:7px 0;font-size:12px;line-height:1.6}
.theme-message{max-width:94%;margin:8px 0;padding:12px;border:1px solid #d0bd97;border-radius:6px;background:#fffaf0}
.theme-message.out{margin-left:auto;background:#f8e5cb}
.theme-message small,.theme-message time{font-size:11px;opacity:.72}
.theme-message p{font-size:13px;line-height:1.7;white-space:pre-wrap}
.theme-document{padding:12px;line-height:1.7;white-space:pre-wrap}
.theme-longtext{line-height:1.9;white-space:pre-wrap}
.theme-photo-detail{text-align:center;padding:18px 5px}
.theme-photo-detail>div{font-size:64px}
.theme-photo-detail h3{font-size:20px;line-height:1.5}
.theme-empty{text-align:center;opacity:.65;font-size:13px;padding:25px 5px}

/* Classical hand-held correspondence chest: timber, paper, ribbon and wax seal. */
.letter-world{max-width:740px;margin:0 auto;min-width:0;font-family:Georgia,'Malgun Gothic',serif}
.letter-table{position:relative;min-height:650px;border:12px ridge #6f472c;border-radius:22px;padding:22px 35px 28px;background:repeating-linear-gradient(92deg,#5a3725 0,#68432d 35px,#754b30 42px,#60402b 82px);box-shadow:0 22px 45px #0008,inset 0 0 35px #1c0e0966;color:#453124}
.letter-cord{position:absolute;top:-6px;bottom:-6px;left:20px;width:14px;border-radius:9px;background:linear-gradient(90deg,#9d7049,#dcb47a,#9b6741);box-shadow:2px 0 5px #1b09075c}
.letter-hanger{text-align:center;color:#efd9b2;font-size:12px;letter-spacing:.12em;margin:0 auto 12px;text-shadow:0 1px 3px #29170c}
.letter-box{min-height:545px;position:relative;border:7px solid #896143;border-radius:8px 16px 16px 8px;background:#503522;box-shadow:0 7px 12px #2a170e80,inset 0 0 3px #d9b281}
.letter-spine{width:15px;background:linear-gradient(90deg,#b58859,#61442f,#a7784a);position:absolute;top:0;bottom:0;left:0;z-index:1}
.letter-paper{margin-left:13px;position:relative;min-height:535px;background:linear-gradient(96deg,#d2b788,#f2dfb6 9%,#f4e4c5 85%,#dec397);border:1px solid #e2c794;box-shadow:inset 0 0 34px #aa7d4b55;padding:25px 33px 30px}
.letter-cover-page{text-align:center;padding:0 0 28px}
.letter-calligraphy{color:#8b563a;font-size:13px;letter-spacing:.65em;margin-bottom:12px}
.letter-cover-page h2{font-size:30px;margin:0 0 4px;color:#523822;letter-spacing:.12em}
.letter-cover-page>p{font-size:12px;color:#917352;margin:3px 0 25px}
.letter-items{display:grid;gap:1px;border-top:1px solid #a18b63}
.letter-folder{display:grid;grid-template-columns:35px minmax(0,1fr) auto;align-items:center;gap:10px;text-align:left;padding:13px 7px;background:transparent;border:0;border-bottom:1px solid #b79e75;color:#533c26;cursor:pointer}
.letter-folder:hover{background:#dbc29870}
.letter-folder .theme-glyph{display:grid;place-items:center;border:1px solid #ac8757;background:#e1c798;width:32px;height:32px;font-size:17px}
.letter-folder .theme-menu-text{font-size:16px;font-weight:800}
.letter-folder small{font-size:11px;opacity:.75}
.letter-seal{position:absolute;right:13px;bottom:16px;border-radius:50%;width:54px;height:54px;display:grid;place-items:center;color:#ffd9a6;background:radial-gradient(#b44e38,#762b25);border:5px double #c27d58;box-shadow:0 4px 5px #301d1766;font-size:22px;transform:rotate(12deg);pointer-events:none;opacity:.78}
.letter-read-top{display:flex;justify-content:space-between;gap:8px;color:#8b6a42;font-size:12px}
.letter-read-top button{color:#67472c;border:0;background:none;cursor:pointer;font:inherit;font-weight:800}
.letter-inkline{height:2px;margin:11px 0;background:linear-gradient(90deg,transparent,#9b764b,transparent)}
.letter-read-page h2{font-size:23px;color:#503822;text-align:center;margin:12px 0 23px}
.letter-read-content{font-size:14px;line-height:1.8;color:#4b392c;min-height:310px;max-height:490px;overflow-y:auto;padding-right:4px}
.letter-page-end{text-align:center;padding:30px 0 3px;color:#906c49;font-size:12px}
.letter-tools{display:flex;justify-content:space-around;gap:8px;color:#f0d2a3;font-size:11px;padding:15px 0 0}

/* Arcane orb: object and record projection rather than generic cards. */
.arcane-world{width:100%;max-width:1050px;margin:0 auto;min-height:660px;display:grid;grid-template-columns:minmax(250px,330px) minmax(0,1fr);gap:22px;color:#e9e1ff;align-items:stretch}
.arcane-device{position:relative;min-width:0;padding:30px 22px;border-radius:110px 110px 30px 30px;border:3px double #a790e7;background:radial-gradient(circle at 50% 19%,#433a70 0,#211b45 42%,#0e1226 75%);box-shadow:inset 0 0 35px #a78cf455,0 0 0 5px #1b1a32,0 16px 32px #0009;text-align:center;overflow:hidden}
.arcane-device:before{content:'✦';position:absolute;top:24px;left:30px;color:#b6a3fa;font-size:13px}
.arcane-crown{font:16px Georgia,serif;letter-spacing:.3em;color:#c9a973}
.arcane-orbit{width:208px;height:208px;max-width:100%;margin:27px auto 25px;border-radius:50%;border:2px dashed #9381c4;display:grid;place-items:center;box-shadow:0 0 32px #9c87e377;position:relative}
.arcane-orbit:before{content:'✧';position:absolute;top:-17px;font-size:22px;color:#edd0ff}
.arcane-orb{width:174px;height:174px;border-radius:50%;display:grid;place-items:center;color:#f6ecff;font:24px Georgia,'Malgun Gothic',serif;font-weight:700;letter-spacing:.1em;background:radial-gradient(circle at 33% 24%,#efffff,#9bbbd8 12%,#7f7fc8 27%,#514377 49%,#1b1c49 75%,#0d1234);border:2px solid #d8d3f6;box-shadow:inset -12px -16px 25px #12132f,inset 13px 12px 20px #ffffff50,0 0 18px #c2b3f3}
.arcane-orb span{text-shadow:0 2px 6px #1d1b36}
.arcane-runemenu{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 8px}
.magic-rune{border:0;background:transparent;color:#e7dcff;display:grid;place-items:center;gap:4px;cursor:pointer;text-align:center;padding:4px 1px}
.magic-rune .theme-glyph{display:grid;place-items:center;font-size:26px;border:1px solid #a495cf;border-radius:14px;height:48px;width:50px;background:radial-gradient(#66579366,#2e2b5988);box-shadow:0 0 13px #b99ffc44}
.magic-rune .theme-menu-text{font-size:12px}
.magic-rune small{font-size:10px;color:#b7a8d4}
.arcane-base{margin-top:27px;font:12px Georgia,serif;letter-spacing:.25em;color:#d6b57e}
.arcane-records{min-width:0;position:relative;border:3px double #ae91e2;border-radius:90px 90px 24px 24px;padding:50px 27px 26px;background:radial-gradient(ellipse at 40% 0,#55437e88 0,transparent 50%),linear-gradient(160deg,#1c193a,#13172e 55%,#16102c);box-shadow:inset 0 0 35px #9077dc33,0 12px 25px #0006}
.arcane-records:before{content:'✧　◇　✧';position:absolute;top:16px;left:0;right:0;text-align:center;color:#c9acef}
.arcane-intro{text-align:center;padding:80px 8px}
.arcane-intro h2{font:24px Georgia,'Malgun Gothic',serif;color:#f1deff}
.arcane-intro p{line-height:1.8;color:#d8cbef;font-size:14px}
.arcane-pulse{color:#d3b98e;margin-top:55px;letter-spacing:.12em}
.arcane-page-top{display:flex;justify-content:space-between;gap:12px;align-items:center}
.arcane-page-top button{border:1px solid #8e7ab6;border-radius:9px;background:#322a5a;color:#efe4ff;padding:8px 12px;cursor:pointer}
.arcane-page-top small{color:#af9ccf}
.arcane-page h2{font:22px Georgia,'Malgun Gothic',serif;color:#e8d6ff;border-bottom:1px solid #8e75bc;margin:25px 0 20px;padding-bottom:13px}
.arcane-list{max-height:580px;overflow-y:auto;color:#e9e1ff}
.arcane-list .theme-record-line,.arcane-list .theme-social-entry,.arcane-list .theme-document,.arcane-list .theme-message{background:#3d315899;color:#efe5ff;border-color:#7661a1}
.arcane-list .theme-line-desc{color:#d7c8f0}
.arcane-list .theme-picture{background:#38295599;color:#e7d8ff;border-color:#947ac2}
.arcane-list .theme-message.out{background:#5a3d74}

/* Classical computer is a wooden desk and drawers; fantasy computer an open arcane tome. */
.study-world{max-width:1120px;margin:auto;padding:19px 23px 24px;color:#493622;background:repeating-linear-gradient(90deg,#65432b 0,#795333 36px,#795333 42px,#66412c 90px);border:12px ridge #8e633b;border-radius:18px;box-shadow:0 18px 34px #0008}
.study-marquee{text-align:center;color:#f4dcad;font:26px Georgia,'Malgun Gothic',serif;margin:8px 0 23px}
.study-marquee small{display:block;font-size:12px;color:#dec393;margin-top:5px}
.study-cabinet{display:grid;grid-template-columns:minmax(185px,250px) minmax(0,1fr);gap:14px;align-items:stretch}
.study-drawers{background:linear-gradient(#5d3b25,#744b2e);border:7px ridge #b48551;padding:11px 12px 18px;display:flex;flex-direction:column;gap:10px;box-shadow:inset 0 0 18px #321909}
.study-drawers-title{text-align:center;color:#efd4a5;font-weight:800;border-bottom:1px solid #b18a5e;padding-bottom:12px}
.study-drawers .archive-menu{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:7px;min-height:65px;padding:12px 8px;border:3px ridge #936940;background:linear-gradient(#b58b58,#987042);box-shadow:0 4px 4px #2f1b10;color:#35261b;text-align:left;cursor:pointer}
.study-drawers .archive-menu span{font-size:22px}
.study-drawers .archive-menu b{font-size:13px}
.study-drawers .archive-menu small{font-size:11px}
.study-drawers-base{margin-top:auto;text-align:center;font-size:11px;color:#dcc59c;line-height:1.6;padding-top:17px}
.study-writing-desk{position:relative;min-width:0;padding:16px;border-radius:7px;background:#4c2f20;box-shadow:inset 0 0 15px #220f08}
.study-paper{min-height:630px;background:linear-gradient(95deg,#d5bd97,#f4e5c6 12%,#f0ddb6 90%,#c5a67c);padding:27px 32px;color:#4f3926;box-shadow:0 9px 14px #160b0666,inset 0 0 20px #9b76485a;max-height:850px;overflow-y:auto;font-family:Georgia,'Malgun Gothic',serif}
.study-paper :is(h2,h3){font-family:Georgia,'Malgun Gothic',serif}
.study-feather{position:absolute;bottom:10px;right:13px;font-size:22px;color:#9a723b;pointer-events:none;transform:rotate(22deg)}
.study-desk-footer{display:flex;justify-content:space-around;gap:15px;margin-top:17px;color:#e8cda5;font-size:12px}
.archive-back{background:transparent;border:0;border-bottom:1px solid currentColor;font:inherit;font-size:12px;color:inherit;cursor:pointer;padding:4px 0}
.archive-welcome{text-align:center;padding:16px 8px 25px}
.archive-emblem{font-size:42px;color:#926b3d}
.archive-welcome h2{font:27px Georgia,'Malgun Gothic',serif;margin:6px 0}
.archive-welcome p{opacity:.76;font-size:14px;line-height:1.6}
.archive-welcome small{opacity:.65}
.archive-home-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.archive-home-menu .archive-menu{border:1px solid #ba9c70;border-radius:4px;padding:19px 13px;background:linear-gradient(#eee0c5,#d7bf94);color:#65452a;text-align:center;display:grid;gap:4px;justify-items:center;cursor:pointer;box-shadow:1px 3px 4px #4e2c174d}
.archive-home-menu .archive-menu span{font-size:25px}
.archive-home-menu .archive-menu b{font-size:14px}
.archive-home-menu .archive-menu small{font-size:11px;opacity:.7}
.archive-folder-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:12px}
.archive-folder{background:#e7cea8;border:2px solid #af8757;border-radius:4px;color:inherit;padding:18px 12px;display:grid;gap:5px;justify-items:center;cursor:pointer}
.archive-folder span{font-size:28px}
.archive-folder b{text-align:center;font-size:14px}
.archive-folder small{opacity:.67;font-size:11px}
.archive-entry-list{display:grid;gap:2px;margin:20px 0}
.archive-entry{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:10px;text-align:left;background:transparent;border:0;border-bottom:1px solid #c4a882;padding:11px 3px;color:inherit;cursor:pointer}
.archive-entry>span{font-size:20px}
.archive-entry>b{font-size:14px}
.archive-entry>small,.archive-entry>time{opacity:.75;font-size:11px}
.archive-document{padding:8px;line-height:1.8}
.archive-document>small{opacity:.67}
.archive-document h2{font:26px Georgia,'Malgun Gothic',serif;border-bottom:1px solid #b19264;margin:16px 0;padding-bottom:15px}
.archive-text{white-space:pre-wrap;line-height:1.9;font-size:14px}
.archive-empty{opacity:.72;padding:15px;font-size:13px}
.wizard-world{max-width:1200px;margin:auto;color:#e9dafa;border:3px double #b18bd9;border-radius:110px 110px 18px 18px;background:radial-gradient(ellipse at 50% 0,#4b3576,transparent 50%),linear-gradient(#1a1331,#100e25);box-shadow:0 0 0 6px #26203f,0 20px 35px #0009;overflow:hidden}
.wizard-arch{text-align:center;padding:25px 15px 11px;border-bottom:1px solid #8264a9}
.wizard-top-runes{font:18px Georgia,serif;letter-spacing:.4em;color:#dabb82}
.wizard-arch h2{font:30px Georgia,'Malgun Gothic',serif;letter-spacing:.1em;margin:9px 0 4px;color:#f2ddff}
.wizard-arch p{font-size:12px;color:#c5b3da;margin:0 0 8px}
.wizard-desk{display:grid;grid-template-columns:minmax(175px,245px) minmax(0,1fr);gap:15px;padding:18px}
.wizard-shelves{border:3px double #8575ab;border-radius:15px;background:linear-gradient(#241c4e,#161434);padding:20px 12px;display:flex;flex-direction:column;gap:10px;box-shadow:inset 0 0 24px #a784ef33}
.wizard-focus-gem{margin:0 auto 15px;height:75px;width:75px;border-radius:50%;display:grid;place-items:center;font-size:32px;color:#fff;background:radial-gradient(circle at 35% 25%,#f6fbff,#a39af3 28%,#554181 55%,#1c174e 80%);border:2px solid #c6b4ee;box-shadow:0 0 18px #a7a8ea}
.wizard-shelves .archive-menu{background:linear-gradient(90deg,#332658,#44346e);border:1px solid #806cab;color:#f4eaff;border-radius:8px;padding:12px 9px;display:grid;grid-template-columns:25px minmax(0,1fr) auto;gap:5px;text-align:left;align-items:center;cursor:pointer}
.wizard-shelves .archive-menu span{font-size:20px;color:#d7bdfb}
.wizard-shelves .archive-menu b{font-size:13px}
.wizard-shelves .archive-menu small{opacity:.65}
.wizard-shelves>small{margin-top:auto;text-align:center;color:#ad9bc9;font-size:11px}
.wizard-manuscript{position:relative;background:linear-gradient(100deg,#302347,#49345b 15%,#403056 84%,#31233f);border:6px double #9b77c7;border-radius:12px;color:#f0e3ff;padding:19px 27px 26px;min-width:0;max-height:825px;overflow-y:auto;box-shadow:inset 0 0 25px #050012}
.wizard-page-ornament,.wizard-page-bottom{text-align:center;font:16px Georgia,serif;color:#d6b78a;letter-spacing:.3em}
.wizard-page-bottom{font-size:10px;margin-top:30px}
.wizard-manuscript .archive-emblem{color:#e7cbff}
.wizard-manuscript .archive-home-menu .archive-menu{background:#5c467b88;border:1px solid #8f77ad;color:#f5edff;border-radius:10px;box-shadow:none}
.wizard-manuscript .archive-folder{background:#59436e;color:#f4e8ff;border-color:#9b81b6}
.wizard-manuscript .archive-entry{border-color:#765f92}
.wizard-manuscript .archive-document h2{border-color:#9e80bc}

/* Diary 2: ring bound, contemporary lined notebook. */
.diary-alt{max-width:900px;margin:0 auto;min-width:0}
.diary-alt.modern-note{padding:21px 23px 26px 64px;background:linear-gradient(110deg,#dedee0,#f7f7f8 15%,#fff 92%);color:#243148;border:1px solid #bfc7d1;border-radius:11px;box-shadow:6px 9px 25px #0007, inset 12px 0 #e3e3e7;position:relative}
.diary-alt.modern-note:before{content:'';position:absolute;top:0;bottom:0;left:36px;width:10px;background:repeating-linear-gradient(to bottom,transparent 0,transparent 22px,#8393a4 23px,#cdd8dc 32px,transparent 33px,transparent 57px);filter:drop-shadow(1px 2px 2px #8893a8);border-radius:3px}
.diary-alt.modern-note:after{content:'';position:absolute;top:0;bottom:0;left:61px;width:1px;background:#ec929d}
.diary-alt.modern-note .diary-alt-head{border-bottom:2px solid #d5e0eb;margin-bottom:15px;padding-bottom:14px;color:#364861}
.diary-alt.modern-note .diary-alt-head b{font:23px system-ui,'Malgun Gothic',sans-serif}
.diary-alt.modern-note .diary-alt-paper{border:0;padding:10px 19px 45px;min-height:580px;background:repeating-linear-gradient(to bottom,transparent 0,transparent 33px,#c9dbe9 34px,#c9dbe9 35px);border-radius:0}
.diary-alt.modern-note .diary-alt-paper h2{font:27px system-ui,sans-serif;margin:12px 0 18px}
.diary-alt.modern-note .diary-alt-body{font-size:15px;line-height:35px;white-space:pre-wrap;min-height:380px}
.diary-alt.modern-note .diary-alt-meta{color:#78869a;font-size:12px;border-bottom:1px solid #bfcce0;padding-bottom:7px}
.diary-alt.modern-note .diary-sign{font-size:13px;text-align:right;margin-top:35px}
/* Diary 3: Korean traditional folio, brush script visual, red seal. */
.diary-alt.classic-paper{padding:26px 22px 28px;color:#3b3024;border:11px ridge #6e4a30;border-radius:12px;background:repeating-linear-gradient(92deg,#5c3827,#704a2d 52px,#61402a 96px);box-shadow:0 19px 38px #0008}
.diary-alt.classic-paper .diary-alt-head{font-family:Georgia,'Malgun Gothic',serif;align-items:center;padding:8px 20px;color:#f0d6ad}
.diary-alt.classic-paper .diary-alt-head b{letter-spacing:.19em;font-size:23px}
.diary-alt.classic-paper .diary-alt-paper{margin:10px auto;max-width:750px;min-height:620px;border-radius:2px;border:1px solid #c1a071;box-shadow:inset 0 0 35px #c2985b66;background:linear-gradient(95deg,#cab58f,#edddb7 12%,#f2e4c5 87%,#d4ba89);padding:35px 48px;position:relative}
.diary-alt.classic-paper .diary-alt-paper:before{content:'日記';position:absolute;right:15px;top:30px;writing-mode:vertical-rl;font:24px Georgia,serif;color:#7b5239;letter-spacing:.5em;border-left:1px solid #b49973;padding-left:9px}
.diary-alt.classic-paper .diary-alt-meta{color:#896b4b}
.diary-alt.classic-paper .diary-alt-paper h2{font:26px Georgia,'Malgun Gothic',serif;color:#553a27;letter-spacing:.07em;margin-bottom:25px;border-bottom:1px solid #b39169;padding-bottom:15px}
.diary-alt.classic-paper .diary-alt-body{font-family:Georgia,'Malgun Gothic',serif;white-space:pre-wrap;line-height:2.25;font-size:16px;color:#3d3428;min-height:410px}
.diary-alt.classic-paper .diary-sign{font-family:Georgia,'Malgun Gothic',serif;text-align:right;padding:20px 0 25px;color:#79392d}
.diary-alt.classic-paper .diary-sign:after{content:' 印';display:inline-block;color:#ae4033;border:2px double #ae4033;padding:3px 5px;font-size:11px;margin-left:8px;transform:rotate(-9deg)}
/* Diary 4: illuminated book and scroll edges, dark royal leather + parchment. */
.diary-alt.fantasy-parchment{padding:25px;border:12px ridge #8c6c44;border-radius:28px;background:linear-gradient(130deg,#21162e,#3d264c,#21162e);box-shadow:0 0 0 2px #d0b16f,0 21px 43px #000b;color:#5c412a;position:relative}
.diary-alt.fantasy-parchment .diary-alt-head{margin:0 12px 16px;color:#f2d9aa;justify-content:center;text-align:center;flex-direction:column;align-items:center}
.diary-alt.fantasy-parchment .diary-alt-head b{font:25px Georgia,'Malgun Gothic',serif;letter-spacing:.09em}
.diary-alt.fantasy-parchment .diary-alt-paper{border:4px double #a3814f;border-radius:95px 95px 15px 15px;min-height:650px;margin:0 auto;max-width:790px;padding:54px 45px 44px;background:radial-gradient(circle at 50% 20%,#fcf0d4,#e8d5ab 70%,#cbb181);box-shadow:inset 0 0 35px #9a7745a6,0 0 0 8px #50344b;position:relative}
.diary-alt.fantasy-parchment .diary-alt-paper:before{content:'✧　◇　✧　◇　✧';position:absolute;top:17px;left:0;right:0;text-align:center;color:#947346;font-size:18px}
.diary-alt.fantasy-parchment .diary-alt-paper:after{content:'❦';position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:25px;color:#947346}
.diary-alt.fantasy-parchment .diary-alt-meta{justify-content:center;color:#8f7251}
.diary-alt.fantasy-parchment .diary-alt-paper h2{text-align:center;font:29px Georgia,'Malgun Gothic',serif;color:#61432c;border-bottom:1px solid #b5956d;padding-bottom:16px}
.diary-alt.fantasy-parchment .diary-alt-body{font:16px/2 Georgia,'Malgun Gothic',serif;white-space:pre-wrap;color:#4d3827;min-height:390px}
.diary-alt.fantasy-parchment .diary-sign{text-align:right;margin:25px 0;color:#86623f}

/* Noticeboards: the surface is real timber with pinned papers and posters. */
.notice-world{max-width:1200px;margin:auto;border:9px solid #694a2d;background:#65422d;border-radius:17px;color:#453424;box-shadow:0 17px 35px #0009, inset 0 0 15px #c09b6488;overflow:hidden;font-family:Georgia,'Malgun Gothic',serif}
.notice-roof{text-align:center;padding:21px 10px 18px;color:#eddbb2;background:linear-gradient(#4a2b1d,#66452a);border-bottom:9px ridge #a57a4c}
.notice-roof>span{letter-spacing:.5em;color:#dabb88}
.notice-roof h1{margin:5px;font:29px Georgia,'Malgun Gothic',serif;letter-spacing:.08em}
.notice-roof small{opacity:.8}
.notice-frame{position:relative;padding:20px 27px 33px;background:repeating-linear-gradient(0deg,#65452e,#704d34 28px,#62402d 57px)}
.notice-ropes{position:absolute;top:2px;right:14px;color:#d1a776;font-size:10px}
.notice-board-wood{border:12px ridge #987449;border-radius:6px;min-height:590px;padding:18px;background:radial-gradient(circle,#a88059,#825934 75%);box-shadow:inset 0 0 20px #3a2014}
.notice-paper-area{color:#503925}
.notice-section-title{font-size:18px;font-weight:900;color:#fff0d0;text-shadow:0 2px 2px #402112;margin:10px 0 15px;text-align:center;letter-spacing:.08em}
.notice-board-links{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:17px;margin:0 0 26px}
.notice-board-link{position:relative;min-height:100px;padding:23px 13px 13px;border:0;color:#473523;background:linear-gradient(120deg,#f8e8bd,#dbc18f);display:flex;flex-direction:column;justify-content:space-between;align-items:center;gap:8px;cursor:pointer;box-shadow:3px 6px 9px #30180f70;transform:rotate(-1deg);font-family:Georgia,'Malgun Gothic',serif}
.notice-board-link:nth-child(even){transform:rotate(1.5deg)}
.notice-board-link strong{font-size:17px}
.notice-board-link small{font-size:11px;color:#90734f}
.notice-pin{position:absolute;top:5px;left:50%;color:#9c312b;font-size:14px;text-shadow:0 2px 2px #0004}
.notice-teasers{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:15px}
.notice-teaser{min-height:140px;background:linear-gradient(115deg,#fff2d2,#e4cda0);border:1px solid #c9a875;color:#4f3727;box-shadow:2px 5px 9px #2d180e8a;text-align:left;padding:21px 15px;cursor:pointer;display:flex;flex-direction:column;gap:10px;transform:rotate(.5deg);position:relative;font:inherit}
.notice-teaser:before{content:'●';position:absolute;top:2px;left:49%;color:#a54b3a;font-size:13px;text-shadow:0 2px 3px #0006}
.notice-teaser:nth-child(even){transform:rotate(-.8deg)}
.notice-teaser b{font-size:16px;line-height:1.5}
.notice-teaser small,.notice-teaser span{font-size:11px;color:#91734f}
.notice-navigation{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:16px;background:#f1dfb6;color:#543a25;border:1px solid #c0a072}
.notice-navigation button{border:0;background:transparent;color:#614328;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
.notice-post-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:13px}
.notice-post-row{position:relative;border:1px solid #bba078;padding:19px 15px;color:#503825;background:linear-gradient(115deg,#faebc8,#e8d2a7);display:flex;align-items:flex-start;flex-direction:column;gap:7px;text-align:left;min-height:138px;cursor:pointer;font:inherit;box-shadow:2px 4px 8px #3920128a}
.notice-post-row>b{font-size:16px;line-height:1.5}
.notice-post-row small,.notice-post-row span,.notice-post-row em{font-size:11px;color:#927148;font-style:normal}
.notice-sheet{background:linear-gradient(120deg,#f7e7c1,#e5c998);border:1px solid #b79765;min-height:500px;padding:30px 33px;margin:auto;max-width:850px;box-shadow:3px 8px 16px #28190f94;color:#4c3926}
.notice-sheet h2{font:26px Georgia,'Malgun Gothic',serif;border-bottom:2px solid #a98a65;margin:0 0 12px;padding-bottom:15px}
.notice-byline{font-size:12px;color:#896d4d}
.notice-body{font-size:15px;white-space:pre-wrap;line-height:1.95;min-height:160px;margin:27px 0}
.notice-comments{border-top:2px solid #b59c77;padding:16px 0 0}
.notice-comments h3{font-size:16px}
.notice-comment{padding:10px 4px;border-bottom:1px solid #cbb389;display:grid;grid-template-columns:26px minmax(0,1fr);gap:3px 8px;font-size:13px}
.notice-comment>p{grid-column:2;white-space:pre-wrap;margin:0;line-height:1.65}
.notice-comment small{color:#9b7750}
.notice-seal-deco{position:absolute;bottom:5px;right:14px;color:#f5e0b3;font-size:15px}
.notice-world.fantasy{background:#3b2831;border-color:#9b744c;color:#f3daba;box-shadow:0 0 0 2px #b28a58,0 20px 38px #0009}
.notice-world.fantasy .notice-roof{background:linear-gradient(#282137,#493448);color:#f4dbac}
.notice-world.fantasy .notice-board-wood{background:radial-gradient(circle,#76533e,#442e33)}
.notice-world.fantasy .notice-board-link,.notice-world.fantasy .notice-teaser,.notice-world.fantasy .notice-post-row{background:linear-gradient(115deg,#ecd7ab,#d0b080);border:2px solid #b89455;box-shadow:inset 0 0 8px #cba96e,3px 6px 10px #1b0d10}
.notice-world.fantasy .notice-pin{color:#8655a2}

/* American imageboard, classic flat threaded layout. Not a woodboard. */
.imageboard-site{max-width:1170px;margin:auto;border:1px solid #aab6c5;padding:0 0 35px;background:#eef2fd;color:#253352;font:13px Arial,'Malgun Gothic',sans-serif}
.imageboard-header{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;background:#d9e2f3;color:#334b72;border-bottom:1px solid #b6c7e1;padding:7px 11px;font-size:12px}
.imageboard-header span{font-size:11px}
.imageboard-title{text-align:center;font-weight:900;color:#bb414d;font-size:28px;padding:23px 8px 9px}
.imageboard-notice{text-align:center;font-size:11px;margin-bottom:14px;color:#636e87}
.imageboard-content{padding:10px 17px}
.imageboard-site .notice-section-title{color:#2d4b73;background:#cfdced;text-shadow:none;padding:8px 10px;text-align:left;margin:8px 0;font:700 14px Arial,sans-serif}
.imageboard-site .notice-board-links{grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:8px}
.imageboard-site .notice-board-link{transform:none!important;border:1px solid #b7c6da;border-radius:0;background:#e2eafa;min-height:54px;box-shadow:none;color:#35517a;align-items:flex-start;justify-content:center;padding:10px 12px}
.imageboard-site .notice-pin{display:none}
.imageboard-site .notice-teasers{display:grid;grid-template-columns:1fr;gap:9px}
.imageboard-site .notice-teaser{transform:none!important;min-height:0;background:#dde4f3;border:1px solid #b8c4d8;color:#244172;box-shadow:none;padding:11px 12px;gap:5px}
.imageboard-site .notice-teaser:before{display:none}
.imageboard-site .notice-post-list{grid-template-columns:1fr;gap:11px}
.imageboard-site .notice-post-row{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:3px 11px;background:#dce4f3;color:#293e66;min-height:75px;border:1px solid #a6b7cf;border-radius:0;box-shadow:none;padding:11px}
.imageboard-site .notice-post-row:before{content:'▧';grid-row:1 / span 3;font-size:25px;color:#7b9ab4;align-self:center}
.imageboard-site .notice-post-row b{grid-column:2;font-size:15px;color:#2d4975}
.imageboard-site .notice-post-row span{grid-column:2;font-size:11px;color:#446b8a}
.imageboard-site .notice-post-row em{grid-column:3;grid-row:1 / span 3;align-self:center;color:#446b8a}
.imageboard-site .notice-post-row small{display:none}
.imageboard-site .notice-sheet{max-width:none;min-height:450px;border:1px solid #a8b8d2;background:#dfe7f4;color:#273a56;box-shadow:none;padding:17px 22px}
.imageboard-site .notice-body{font-size:15px;line-height:1.7}
.imageboard-site .notice-comment{background:#d5dfed;border-left:3px solid #a3b7d5;padding:9px 11px;margin:8px 0}
.imageboard-site .notice-navigation{background:#cfdced;color:#304f7e;border-color:#a2b4cb}
.imageboard-site .notice-sheet h2{font:22px Arial,'Malgun Gothic',sans-serif;border-color:#a9b8d2;color:#245081}
.imageboard-footer{text-align:center;padding:12px;font-size:11px;color:#61748e}
/* Japanese 2ch style: plain boxed HTML, monospaced numbered threads, no cards. */
.textboard-site{max-width:1170px;margin:auto;background:#f5f5f5;color:#333;border:6px solid #608b8c;box-shadow:0 0 0 1px #8eb9b7;font:13px Arial,'Malgun Gothic',sans-serif;padding:11px 16px 26px}
.textboard-top{background:#d9e9e8;color:#174b4f;border-bottom:3px double #5f9392;font-weight:900;text-align:center;font-size:20px;padding:9px}
.textboard-nav{text-align:center;padding:12px;color:#286263}
.textboard-nav button{background:transparent;border:0;color:#246e87;text-decoration:underline;cursor:pointer}
.textboard-main{padding:14px 10px}
.textboard-intro{background:#fff;border:1px dotted #6b9da0;padding:10px;margin-bottom:20px;font-size:12px}
.textboard-site .notice-section-title{color:#155e62;text-align:left;text-shadow:none;border-bottom:2px solid #78adae;font:bold 16px Arial,sans-serif;padding-bottom:8px}
.textboard-site .notice-board-links{display:block}
.textboard-site .notice-board-link{transform:none!important;display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:10px;padding:8px 3px;min-height:0;background:transparent;border:0;border-bottom:1px dotted #b0c7c4;color:#22688b;box-shadow:none;text-align:left}
.textboard-site .notice-pin{display:none}
.textboard-site .notice-board-link strong{text-decoration:underline;font-size:13px}
.textboard-site .notice-teasers{display:block}
.textboard-site .notice-teaser{transform:none!important;display:block;min-height:0;background:none;box-shadow:none;color:#286285;border:0;border-bottom:1px dotted #93a7a6;padding:9px 3px}
.textboard-site .notice-teaser:before{display:none}
.textboard-site .notice-teaser>b{display:inline;text-decoration:underline;font-size:14px}
.textboard-site .notice-teaser>small{display:inline;color:#6c7d7e;margin-right:9px}
.textboard-site .notice-post-list{display:block}
.textboard-site .notice-post-row{display:flex;align-items:baseline;flex-direction:row;gap:8px;background:none;border:0;border-bottom:1px dotted #8aa6a4;min-height:0;padding:10px 4px;box-shadow:none;color:#2f6587}
.textboard-site .notice-post-row b{font-size:14px;text-decoration:underline}
.textboard-site .notice-post-row span,.textboard-site .notice-post-row em{font-size:11px;color:#667c7c}
.textboard-site .notice-sheet{max-width:none;min-height:420px;border:1px solid #afc5c2;background:#fff;box-shadow:none;color:#252b29;padding:20px 18px}
.textboard-site .notice-sheet h2{font:18px Arial,sans-serif;border-color:#b4cdca}
.textboard-site .notice-comment{display:block;padding:10px 0;border:0}
.textboard-site .notice-comment small{color:#4d8c52;margin-right:8px}
.textboard-site .notice-comment b{color:#397a51}
.textboard-site .notice-comment p{margin:6px 0 0 25px;line-height:1.6;font-size:13px}
.textboard-site .notice-navigation{background:#e2eeee;border:1px solid #9bc1bd}
.textboard-footer{text-align:center;color:#4e797b;border-top:2px solid #a2c4c0;padding-top:11px;font-size:11px}

/* Printed newspaper and imperial broadside, not card lists. */
.gazette-paper{max-width:1140px;margin:auto;background:#e9d8b5;color:#3e3226;padding:20px;border:9px ridge #7a5a35;box-shadow:0 17px 43px #0009;font-family:Georgia,'Malgun Gothic',serif}
.gazette-paper.classic{background:linear-gradient(130deg,#d1b687,#f4e5c1 28%,#ebdbb5 75%,#c9aa79);border-color:#84562f;border-radius:5px}
.gazette-paper.fantasy{background:linear-gradient(130deg,#c9b080,#fff1d5 28%,#e0cb9f 75%,#ae895d);border-color:#a18554;box-shadow:0 0 0 2px #c09c64,0 22px 45px #000a}
.gazette-inner{border:3px double #735737;padding:19px 24px;min-height:640px}
.gazette-paper.fantasy .gazette-inner{border:5px double #8f7248;box-shadow:inset 0 0 18px #8b5f2c4d}
.gazette-head{text-align:center}
.gazette-minor{display:flex;justify-content:space-between;gap:7px;border-bottom:2px solid #4c3929;border-top:1px solid #4c3929;padding:6px 3px;font-size:11px}
.gazette-head h1{font:clamp(30px,4vw,57px) Georgia,'Malgun Gothic',serif;letter-spacing:.09em;color:#392d23;border-bottom:5px double #614930;margin:10px 0 6px;padding:0 0 11px}
.gazette-paper.fantasy .gazette-head h1{font-style:italic;letter-spacing:.03em;color:#64462e}
.gazette-slogan{font-size:12px;letter-spacing:.12em}
.gazette-cats{display:flex;flex-wrap:wrap;justify-content:center;gap:2px;margin:13px 0 22px;border-top:1px solid #8f7957;border-bottom:1px solid #8f7957;padding:7px}
.gazette-cats button{border:0;border-right:1px solid #b69c74;color:#4e3b2c;background:none;padding:4px 11px;font-size:12px;cursor:pointer}
.gazette-front{display:grid;gap:19px}
.gazette-lead{display:block;width:100%;background:transparent;border:0;border-bottom:4px double #826a47;color:inherit;padding:10px 10px 24px;text-align:center;cursor:pointer;font:inherit}
.gazette-category,.gazette-article-meta{font-size:12px;font-weight:700;color:#8d5336}
.gazette-lead h2{font:clamp(23px,3vw,39px) Georgia,'Malgun Gothic',serif;line-height:1.3;letter-spacing:.025em;margin:11px 0}
.gazette-lead p{font-size:15px;line-height:1.7}
.gazette-lead small{opacity:.68}
.gazette-columns{columns:3 210px;column-gap:20px;column-rule:1px solid #ac9472;min-height:260px}
.gazette-brief{break-inside:avoid;display:block;width:100%;background:none;border:0;border-bottom:1px solid #b49e7c;color:inherit;cursor:pointer;font:inherit;padding:9px 0 20px;text-align:left}
.gazette-brief small{font-size:10px;color:#916a48}
.gazette-brief h3{font-size:20px;line-height:1.4;margin:9px 0}
.gazette-brief p{font-size:13px;line-height:1.7}
.gazette-detail{padding:5px 9px 25px}
.gazette-back{border:0;border-bottom:1px solid #73593a;color:#755439;background:none;font:inherit;font-size:13px;cursor:pointer}
.gazette-article-meta{text-align:center;padding:22px 0 6px}
.gazette-detail h2{text-align:center;font:clamp(27px,3vw,42px) Georgia,'Malgun Gothic',serif;line-height:1.35;margin:14px 0;border-bottom:3px double #937550;padding-bottom:18px}
.gazette-lede{font-weight:700;font-size:17px;text-align:center;line-height:1.8}
.gazette-article-body{white-space:pre-wrap;font:15px/2 Georgia,'Malgun Gothic',serif;columns:2 260px;column-gap:32px;column-rule:1px solid #b19a76;margin:29px 0;min-height:200px}
.gazette-readers{border-top:2px solid #a28b67;margin-top:30px;padding:13px 0}
.gazette-readers h3{font-size:16px}
.gazette-readers p{font-size:13px;border-bottom:1px solid #bfaa8b;padding-bottom:8px;line-height:1.7}
.gazette-end{text-align:center;border-top:3px double #705635;padding-top:11px;font-size:12px;letter-spacing:.1em;color:#795f40;margin-top:25px}

/* Bookish encyclopedia and codex share book mechanics but distinct binding and ink. */
.codex-world{max-width:1240px;margin:auto;min-width:0;padding:20px 21px;border-radius:18px;color:#3e3429;font-family:Georgia,'Malgun Gothic',serif}
.codex-world.classic{background:repeating-linear-gradient(90deg,#593c2a,#795439 70px,#67432e 125px);border:10px ridge #755033;box-shadow:0 16px 38px #0008}
.codex-world.fantasy{background:linear-gradient(145deg,#1d1838,#40305c,#201732);border:11px ridge #9f7e54;color:#e3d1ae;box-shadow:0 0 0 2px #9c79c9,0 16px 42px #0009}
.codex-cover{padding:7px;border:4px solid #5a392c;border-radius:15px;background:#42291f}
.codex-world.fantasy .codex-cover{border-color:#b18c65;background:#22162f}
.codex-book{display:grid;grid-template-columns:minmax(170px,32%) 12px minmax(0,1fr);min-height:680px;border:2px solid #c2a477;border-radius:9px;background:linear-gradient(90deg,#dcc69e,#f1e0b9 27%,#cfb386 32%,#ad8f67 33%,#f2dfbc 36%,#efddb8 92%,#ccb087);box-shadow:inset 0 0 23px #896e4888;color:#493728}
.codex-left{border-right:1px solid #a78b68;padding:23px 15px;min-width:0}
.codex-gutter{background:linear-gradient(90deg,#a88d63,#6b513b 45%,#c0a377 100%);box-shadow:inset 0 0 6px #2d1b13}
.codex-right{padding:26px 31px 15px;min-width:0;max-height:1000px;overflow-y:auto}
.codex-brand{text-align:center;border-bottom:3px double #94764f;padding-bottom:25px;margin-bottom:20px}
.codex-brand>span{display:block;font-size:43px;color:#895b39;margin:0 auto 10px}
.codex-brand strong{display:block;font-size:21px;line-height:1.4}
.codex-brand small{display:block;font-size:11px;opacity:.65;margin-top:7px;line-height:1.5}
.codex-nav-title{font-size:14px;font-weight:850;border-bottom:1px solid #a7906f;padding:6px 0 12px}
.codex-index{max-height:550px;overflow-y:auto;margin-top:10px;display:grid;align-content:start;gap:5px}
.codex-index-row{display:grid;grid-template-columns:23px minmax(0,1fr);gap:7px;align-items:center;width:100%;padding:10px 5px;background:none;border:0;border-bottom:1px dotted #aa916b;color:inherit;text-align:left;cursor:pointer;font:inherit;font-size:13px}
.codex-index-row.active{background:#cfb68e75}
.codex-index-row span{color:#8b653f}
.codex-ornament{text-align:center;color:#8f7153;margin-top:22px;font-size:13px}
.codex-landing{text-align:center}
.codex-initial{margin:20px auto 8px;font-size:43px;color:#9c7646}
.codex-landing h2{font-size:29px;margin:8px}
.codex-landing>p{font-size:13px;color:#887253}
.codex-entries{display:grid;gap:3px;margin:24px 0;text-align:left}
.codex-entry{width:100%;border:0;border-bottom:1px solid #c8af87;background:transparent;color:inherit;text-align:left;padding:13px 5px;cursor:pointer;font:inherit}
.codex-entry strong{display:block;font-size:15px}
.codex-entry small{display:block;font-size:11px;margin-top:5px;color:#847052;line-height:1.6}
.codex-return{border:0;border-bottom:1px solid #aa8960;background:none;color:inherit;font:inherit;font-size:12px;cursor:pointer;padding:5px 0}
.codex-article h2{font:29px Georgia,'Malgun Gothic',serif;margin:20px 0 14px;padding-bottom:16px;border-bottom:3px double #967750}
.codex-tabs{display:flex;gap:7px;margin:0 0 20px}
.codex-tabs button{background:none;border:1px solid #b59d76;color:inherit;padding:7px 15px;font:inherit;font-size:12px;cursor:pointer}
.codex-tabs button.active{background:#a7865177;font-weight:800}
.codex-summary{font-weight:700;line-height:1.8;font-size:14px;margin:14px 0 25px}
.codex-section h3{font-size:18px;border-bottom:1px solid #b7a17d;padding-bottom:9px;margin-top:27px}
.codex-paragraph{white-space:pre-wrap;font-size:14px;line-height:2}
.codex-talk{border-bottom:1px solid #baa580;padding:12px 0}
.codex-talk p{line-height:1.7;white-space:pre-wrap;font-size:13px}
.codex-right footer{text-align:center;margin:45px 0 4px;font-size:11px;letter-spacing:.22em;color:#93764c}
.codex-world.fantasy .codex-book{background:linear-gradient(90deg,#2e2344,#584167 31%,#3e2d55 33%,#231a40 34%,#4c385f 48%,#422f52 92%,#261c42);color:#f5e4c5;border-color:#ad8b66;box-shadow:inset 0 0 32px #070410}
.codex-world.fantasy .codex-gutter{background:linear-gradient(90deg,#1a142e,#8e70a7,#2d2443)}
.codex-world.fantasy .codex-brand{border-color:#b4986a}
.codex-world.fantasy .codex-brand>span{color:#ebc785;text-shadow:0 0 12px #d9b6fa;font-size:52px}
.codex-world.fantasy :is(.codex-index-row,.codex-nav-title,.codex-article h2,.codex-section h3,.codex-entry,.codex-talk){border-color:#80668f}
.codex-world.fantasy :is(.codex-landing>p,.codex-entry small,.codex-right footer,.codex-ornament){color:#d7b7d9}
.codex-world.fantasy .codex-index-row.active,.codex-world.fantasy .codex-tabs button.active{background:#7c609d88}
.codex-world.fantasy .codex-tabs button{border-color:#8e7aaf}

/* X classic is a stone wall of short overlapping notices. Unlike the threaded community board. */
.whisper-wall{max-width:1160px;margin:auto;background:repeating-linear-gradient(0deg,transparent 0,transparent 64px,#9a8b7677 65px,#9a8b7677 68px),repeating-linear-gradient(90deg,#b8aa93 0,#c1b49a 110px,#ad9e85 112px,#beb19b 230px);border:11px ridge #79694f;color:#4f3a2b;box-shadow:0 20px 40px #0009;overflow:hidden;font-family:Georgia,'Malgun Gothic',serif}
.whisper-sky{background:#554332;color:#f0dbb4;text-align:center;padding:9px;letter-spacing:.12em;font-size:12px}
.whisper-roof{display:flex;align-items:center;justify-content:center;gap:32px;padding:12px;background:#a28b66b5;border-bottom:2px solid #685237}
.whisper-roof h2{font:27px Georgia,'Malgun Gothic',serif;margin:0}
.whisper-roof>span{color:#713f2c;font-size:22px}
.whisper-caption{text-align:center;font-size:12px;color:#6a5540;line-height:1.7}
.whisper-inner{display:grid;grid-template-columns:minmax(0,1fr) 235px;gap:17px;padding:13px 17px 25px}
.whisper-notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;align-content:start}
.wall-scrap{padding:22px 16px 17px;background:linear-gradient(118deg,#f7ebce,#e3d0a5);color:#503d2b;box-shadow:2px 5px 10px #4c39256b;min-height:145px;transform:rotate(-1deg);position:relative;align-self:start;max-width:100%;overflow-wrap:anywhere}
.wall-scrap:nth-child(even){transform:rotate(1.5deg);background:linear-gradient(120deg,#e8d5af,#f8e8c9)}
.wall-scrap:nth-child(3n){transform:rotate(.8deg);background:#e9d9bb}
.wall-scrap:before{content:'●';position:absolute;top:4px;left:48%;font-size:12px;color:#a44d39;text-shadow:0 1px 3px #0005}
.micro-post-head{display:flex;gap:4px;flex-wrap:wrap;justify-content:space-between;border-bottom:1px solid #c7ad84;padding-bottom:7px}
.micro-post-head b{font-size:13px}
.micro-post-head small{font-size:10px;color:#8b714d}
.micro-post-text{font-size:13px;white-space:pre-wrap;line-height:1.65;padding:9px 0}
.micro-post-actions{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:10px;color:#796242}
.micro-post-actions button{border:0;border-bottom:1px dotted #9e825e;background:none;color:inherit;font:inherit;cursor:pointer}
.micro-post-replies{border-top:1px dashed #bfa37b;margin-top:12px;font-size:12px}
.micro-post-replies>div{border-bottom:1px dashed #d3bb91;padding:7px 0}
.micro-post-replies small{opacity:.7}
.micro-post-replies p{white-space:pre-wrap;line-height:1.6}
.whisper-side{border:3px solid #6e543c;background:linear-gradient(#d7c19b,#cbb088);padding:13px 14px;min-width:0;max-height:630px;overflow:auto}
.whisper-side h3{font:16px Georgia,'Malgun Gothic',serif;border-bottom:2px solid #9e805c;padding-bottom:11px}
.whisper-side button{border:0;border-bottom:1px solid #ac8f69;background:none;text-align:left;display:block;color:#513e2f;width:100%;padding:11px 3px;cursor:pointer}
.whisper-side button b,.whisper-side button small{display:block}
.whisper-side button small{font-size:10px;opacity:.65;margin-top:4px}
.whisper-side-end{font-size:10px;text-align:center;color:#977852;padding:25px 0}
.whisper-stones{padding:8px;text-align:center;color:#685744;background:#ae9d86;font-size:13px;letter-spacing:.3em}
/* Fantasy social timeline is transparent magic-glass, still recognizably microblog. */
.aether-feed{max-width:1160px;margin:auto;min-height:680px;background:radial-gradient(ellipse at 40% 10%,#423568,#1c1833 48%,#101327);border:3px double #9276d4;border-radius:21px;padding:21px;color:#ecddff;box-shadow:0 0 0 4px #221c3e,0 18px 35px #0009;position:relative;overflow:hidden}
.aether-lines{position:absolute;inset:0;pointer-events:none;opacity:.18;background:radial-gradient(circle at 18% 12%,#fff 1px,transparent 2px),radial-gradient(circle at 83% 27%,#fff 1px,transparent 2px),radial-gradient(circle at 41% 70%,#fff 1px,transparent 2px);background-size:130px 140px}
.aether-feed>header{position:relative;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #7f69aa;padding:8px 10px 17px;text-align:center}
.aether-feed>header>span{font-size:35px;color:#ddc1ff}
.aether-feed h2{font:29px Georgia,'Malgun Gothic',serif;color:#f3dbff;margin:0}
.aether-feed>header small{color:#c5b3dc}
.aether-layout{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:16px;margin-top:22px}
.aether-stream-title{text-align:center;margin:5px 0 17px;color:#e2c3ed;letter-spacing:.2em}
.aether-layout>main{display:grid;gap:13px;align-content:start}
.aether-post{padding:18px 19px 17px;background:linear-gradient(110deg,#45345b99,#332a5b88);color:#f0e5ff;border:1px solid #8e76ba;border-radius:17px 5px 17px 5px;box-shadow:inset 3px 0 0 #bd9ae6,0 5px 13px #08071b55;position:relative}
.aether-post:before{content:'✧';position:absolute;left:8px;top:10px;color:#c5a1ee;font-size:11px}
.aether-post .micro-post-head{border-color:#7f699d;padding-left:13px}
.aether-post .micro-post-head small{color:#c6b1de}
.aether-post .micro-post-text{font-size:14px;line-height:1.7;padding:14px 12px}
.aether-post .micro-post-actions{color:#d2b3ef;font-size:12px}
.aether-post .micro-post-replies{border-color:#73608b}
.aether-post .micro-post-replies>div{border-color:#66557f}
.aether-layout>aside{border:1px solid #8a76ac;border-radius:16px;padding:15px;background:#30284b9c;align-self:start}
.aether-crystal{font-size:50px;display:grid;place-items:center;margin:5px auto 18px;width:110px;height:110px;border-radius:50%;background:radial-gradient(#b4a1f2,#6e5baf 38%,#2b295f 65%,#181641);border:2px solid #c9aef0;box-shadow:0 0 23px #a79cf2;color:#f7ecff}
.aether-crystal small{font-size:10px;display:block;letter-spacing:0;color:#f6e3ff}
.aether-layout aside h3{font:17px Georgia,'Malgun Gothic',serif;border-bottom:1px solid #886faa;padding-bottom:10px}
.aether-layout aside button{background:transparent;color:#ebdbfc;width:100%;border:0;border-bottom:1px solid #725f8b;display:block;text-align:left;padding:11px 3px;cursor:pointer}
.aether-layout aside button b,.aether-layout aside button small{display:block}
.aether-layout aside button small{color:#b69acb;font-size:10px;margin-top:4px}

/* Responsive stage and constrained reading surfaces. */
@media (max-width:980px){
  .arcane-world{grid-template-columns:1fr;max-width:730px}
  .arcane-device{border-radius:65px 65px 20px 20px;padding:22px 15px}
  .arcane-orbit{margin:13px auto 12px;width:160px;height:160px}
  .arcane-orb{width:136px;height:136px;font-size:19px}
  .arcane-runemenu{max-width:440px;margin:auto}
  .arcane-records{border-radius:26px;padding:39px 19px 22px}
  .study-cabinet,.wizard-desk{grid-template-columns:1fr}
  .study-drawers,.wizard-shelves{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .study-drawers-title,.study-drawers-base,.wizard-focus-gem,.wizard-shelves>small{grid-column:1/-1}
  .study-paper{min-height:370px}
  .wizard-manuscript{min-height:370px}
  .whisper-inner{grid-template-columns:1fr}
  .whisper-side{max-height:none}
  .aether-layout{grid-template-columns:1fr}
  .aether-layout aside{order:-1}
}
@media (max-width:620px){
  .theme-picker{max-width:100%}
  .flip-top{height:330px;padding:11px}
  .flip-bottom{height:260px;padding:8px 14px 22px}
  .letter-table{padding:15px 14px 22px;border-width:7px}
  .letter-paper{padding:18px 19px 23px}
  .letter-cover-page h2{font-size:24px}
  .letter-folder .theme-menu-text{font-size:13px}
  .arcane-world{gap:16px}
  .study-world{padding:12px;border-width:6px}
  .study-paper{padding:20px 17px}
  .study-drawers .archive-menu{min-height:70px}
  .wizard-desk{padding:8px}
  .wizard-manuscript{padding:16px}
  .diary-alt.modern-note{padding:14px 12px 22px 41px}
  .diary-alt.modern-note:before{left:20px}
  .diary-alt.modern-note:after{left:38px}
  .diary-alt.classic-paper{padding:14px;border-width:7px}
  .diary-alt.classic-paper .diary-alt-paper{padding:28px 34px 35px 25px}
  .diary-alt.fantasy-parchment{padding:10px;border-width:7px}
  .diary-alt.fantasy-parchment .diary-alt-paper{padding:47px 22px 33px;border-radius:65px 65px 12px 12px}
  .notice-roof h1{font-size:22px}
  .notice-frame{padding:8px}
  .notice-board-wood{padding:10px;border-width:6px}
  .notice-sheet{padding:20px 15px}
  .imageboard-content,.textboard-main{padding:8px}
  .gazette-paper{padding:9px;border-width:5px}
  .gazette-inner{padding:9px 12px}
  .gazette-cats{padding:5px 0}
  .gazette-cats button{padding:4px 7px}
  .gazette-columns{columns:1}
  .codex-world{padding:10px;border-width:6px}
  .codex-book{grid-template-columns:1fr;min-height:0}
  .codex-gutter{height:10px}
  .codex-left{border-right:0;border-bottom:1px solid #aa9372;padding:15px}
  .codex-brand{padding-bottom:7px;margin-bottom:10px}
  .codex-brand>span{font-size:30px}
  .codex-nav-title,.codex-ornament{display:none}
  .codex-index{display:flex;max-height:94px;flex-wrap:wrap;overflow:auto;margin:0;gap:3px}
  .codex-index-row{width:auto;padding:6px 8px;border:1px solid #af976f;border-radius:6px}
  .codex-right{padding:18px 19px}
  .whisper-inner{padding:10px}
  .whisper-notes{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
  .aether-feed{padding:11px}
  .aether-feed h2{font-size:23px}
}




/* v0.2.21: left-aligned theme controls, never overlay the reader. */
.pane-title-row{width:auto;max-width:100%;display:flex;align-items:center;justify-content:flex-start;gap:9px;flex-wrap:wrap}
.pane-title-row h3{flex:none;margin:0}
.pane-title .theme-picker{width:196px;max-width:196px;min-width:160px;flex:0 1 196px;padding:3px 6px;justify-content:flex-start;gap:5px}
.pane-title .theme-picker span{font-size:11px}
.pane-title .theme-picker select{min-width:0;width:145px;max-width:100%;padding:6px 7px;font-size:12px}
@media(max-width:900px){.pane-title .theme-picker{width:185px;max-width:185px;flex:0 1 185px}.pane-title .theme-picker select{width:136px}}
@media(max-width:420px){.pane-title-row{align-items:flex-start}.pane-title .theme-picker{max-width:165px;flex:0 1 165px;min-width:135px}.pane-title .theme-picker select{width:116px}}
/* Reuse only the selected theme's actual record content. */
.diary-alt-head small,.gazette-slogan,.imageboard-notice,.textboard-intro,.letter-hanger,.device-caption,.whisper-caption,.wizard-page-bottom,.study-drawers-base,.study-desk-footer,.arcane-pulse{display:none!important}
.preset-box .preset-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
.preset-box .preset-grid select,.preset-box .preset-grid input{width:100%}
@media(max-width:650px){.preset-box .preset-grid{grid-template-columns:1fr}}
/* Standalone group chats: character-centric records, four interfaces. */
.groupchat{display:flex;justify-content:center;min-width:0;padding:14px 5px;color:#18232f}
.groupchat-case{width:min(100%,660px);height:min(720px,calc(100dvh - 230px));min-height:380px;display:flex;flex-direction:column;border:1px solid #bec6cf;box-shadow:0 8px 25px #0002;overflow:hidden;background:#f5f7fa;border-radius:18px}
.groupchat-topline{height:35px;flex:none;display:flex;align-items:center;justify-content:center;color:#7c92a1;font-size:11px;letter-spacing:.6em}
.groupchat-bottomline{height:15px;flex:none;border-top:1px solid #0000000b}
.group-room-list-head{flex:none;padding:15px 22px;border-bottom:1px solid #0001;font-size:19px}
.group-rooms{overflow-y:auto;min-height:0;flex:1}
.group-room{width:100%;display:flex;gap:12px;align-items:center;text-align:left;background:transparent;border:0;border-bottom:1px solid #00000012;padding:14px;color:inherit;min-width:0}
.group-room:hover{background:#00000008}.group-room.active{background:#0000000c}
.group-room-avatar,.group-avatar{width:45px;height:45px;display:grid;place-items:center;background:#dddfe4;color:#526076;border-radius:13px;font-weight:800;flex:none}
.group-room-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:5px}.group-room-copy small{color:#697786;font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.group-count{font-size:12px;color:#7b8792}
.group-chat-head{display:flex;align-items:center;gap:13px;flex:none;padding:11px 14px;border-bottom:1px solid #00000012}
.group-chat-head b{flex:1;min-width:0;overflow-wrap:anywhere;font-size:16px}.group-chat-head small{font-size:12px;color:#637587}
.group-back{border:0;background:none;color:inherit;font-size:27px;line-height:1;padding:0 5px}
.group-chat-members{display:flex;gap:6px;overflow-x:auto;padding:9px 13px;border-bottom:1px solid #00000010;flex:none}
.group-chat-members span{white-space:nowrap;background:#0000000b;font-size:10px;border-radius:99px;padding:5px 8px}
.group-messages{flex:1;min-height:0;overflow:auto;padding:18px 14px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
.group-message{display:flex;gap:9px;align-items:flex-start;min-width:0}.group-avatar{width:33px;height:33px;border-radius:12px;font-size:12px}
.group-message-main{min-width:0;max-width:calc(100% - 42px)}.group-sender{font-size:12px;display:block;margin-bottom:4px}
.group-message-line{display:flex;align-items:flex-end;gap:7px;min-width:0}
.group-message-text{padding:11px 13px;white-space:pre-wrap;overflow-wrap:anywhere;background:white;border-radius:5px 13px 13px 13px;max-width:100%;line-height:1.6;box-shadow:0 1px 2px #0001}
.group-message-line time{white-space:nowrap;font-size:10px;color:#6b7a86;flex:none}
.group-message.compact{margin-top:-6px}.group-message.compact .group-avatar{visibility:hidden}
.group-kakao .groupchat-case{background:#b9c9dc;border-color:#7e98b9;max-width:470px;border-radius:20px}
.group-kakao .groupchat-topline{background:#f9e64a;color:#594700}.group-kakao .group-chat-head,.group-kakao .group-room-list-head{background:#fbe954}
.group-kakao .group-room-avatar,.group-kakao .group-avatar{background:#fce66e;color:#6d5812}
.group-kakao .group-message-text{background:#fff;border-radius:4px 13px 13px}
.group-neutral .groupchat-case{background:#f4f6fa;border-color:#c2ccd8;max-width:530px;border-radius:14px}
.group-neutral .groupchat-topline{height:12px}.group-neutral .group-chat-head,.group-neutral .group-room-list-head{background:#fff}
.group-neutral .group-message-text{background:#e3eefa;border-radius:14px}
.group-fantasy{color:#ebddff}.group-fantasy .groupchat-case{background:radial-gradient(circle at 50% 8%,#32225c,#151229 65%);border:2px solid #9f82d8;border-radius:48px 48px 18px 18px;box-shadow:0 0 25px #7e55c740,inset 0 0 35px #986ce824}
.group-fantasy .groupchat-topline{color:#d0aaff}.group-fantasy .group-room-avatar,.group-fantasy .group-avatar{background:radial-gradient(circle at 30% 24%,#b8aeec,#533b85);border:1px solid #a999dd;color:#fff;border-radius:50%;box-shadow:0 0 9px #9d7afc50}
.group-fantasy .group-chat-head,.group-fantasy .group-room-list-head{border-color:#a18cd547;color:#f0e7ff}
.group-fantasy .group-chat-head small,.group-fantasy .group-count,.group-fantasy .group-room-copy small,.group-fantasy .group-message-line time{color:#c6b1e4}
.group-fantasy .group-chat-members span{background:#a58be327}.group-fantasy .group-message-text{background:#32264e;color:#fff;border:1px solid #8a75b455;border-radius:15px}
.group-classic .groupchat-case{max-width:600px;background:linear-gradient(105deg,#d7c09a,#f4e8cb 22%,#e6d2a8 83%,#bb976a);border:9px solid #775339;border-radius:8px;box-shadow:inset 0 0 15px #6443265e,0 13px 32px #0005;color:#503923;font-family:Georgia,'Malgun Gothic',serif}
.group-classic .groupchat-topline{color:#76553e}.group-classic .group-chat-head,.group-classic .group-room-list-head{border-color:#856b4d55}
.group-classic .group-room-avatar,.group-classic .group-avatar{background:#e9d9b9;border:1px solid #997959;color:#5e4731;border-radius:2px}
.group-classic .group-message-text{background:linear-gradient(#fffae9,#eddbb3);border:1px solid #a88b5b;color:#4a3424;border-radius:2px;box-shadow:3px 4px 0 #80644520;transform:rotate(-.35deg)}
.group-classic .group-chat-members span{background:#9d80502b}.group-classic .group-count,.group-classic .group-room-copy small,.group-classic .group-message-line time,.group-classic .group-chat-head small{color:#886d53}
.group-message.mine{justify-content:flex-end;flex-direction:row-reverse}
.group-message.mine .group-avatar{display:none}
.group-message.mine .group-message-main{display:flex;align-items:flex-end;flex-direction:column}
.group-message.mine .group-message-line{flex-direction:row-reverse}
.group-message.mine .group-sender{display:none}
.group-kakao .group-message.mine .group-message-text{background:#ffe76a;color:#28221c;border-radius:13px 4px 13px 13px}
.group-neutral .group-message.mine .group-message-text{background:#c8dfed}
.group-fantasy .group-message.mine .group-message-text{background:#644b98;border-color:#cbb3ff88}
.group-classic .group-message.mine .group-message-text{background:linear-gradient(#f5e7b4,#e7ca8d);transform:rotate(.35deg)}
@media(max-width:680px){.groupchat{padding:5px 0}.groupchat-case{width:100%;height:calc(100dvh - 240px);min-height:310px}.group-message-line time{font-size:9px}.group-message-text{padding:10px;font-size:13px}.group-chat-members{padding:7px 8px}}


/* v0.2.24: reference notes and image export controls. */
.lore-page textarea{width:100%;min-height:135px;resize:vertical;font-family:inherit;line-height:1.65}
.lore-page .card{min-width:0}
.lore-page .chips{max-height:220px;overflow-y:auto}
.lore-page .field textarea{background:#172133;border:1px solid #53617a;border-radius:10px;color:#eef3ff;padding:12px}
.lore-page .field textarea:focus-visible{outline:2px solid #b3a5f9;outline-offset:1px}
.viewer-export-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:14px;padding:10px 1px 3px;min-width:0}
.viewer-export-footer .button{white-space:nowrap}
.pane-title-row{min-width:0}
@media(max-width:760px){.pane-title{flex-wrap:wrap}.pane-title-row{flex:1 1 100%;min-width:0}}


/* v0.2.26: Reader focus control overlays the preview's top-right corner.
   No extra toolbar row and no impact on the PNG-exported preview subtree. */
.viewer-layout > .stage { position:relative; }
.viewer-layout > .stage > .preview-focus-btn {
  box-sizing:border-box;
  position:absolute;
  top:12px;
  right:12px;
  z-index:8;
  display:grid;
  place-items:center;
  width:31px;
  height:31px;
  min-width:31px;
  min-height:31px;
  padding:0;
  margin:0;
  border:1px solid #64718b;
  border-radius:9px;
  background:#242c40;
  color:#f4f6ff;
  cursor:pointer;
  font-size:19px;
  line-height:1;
  box-shadow:0 2px 7px #070e1b88;
}
.viewer-layout > .stage > .preview-focus-btn:hover { background:#343d5c; border-color:#a2b5d8; }
.viewer-layout > .stage > .preview-focus-btn:focus-visible { outline:2px solid #d2bafd; outline-offset:2px; }
/* Keep the existing record title and cost label clear of the overlay. */
.viewer-layout > .stage > .preview > .preview-title { padding-right:41px !important; }
/* Respect expand/collapse on landscape tablets too. */
@media (min-width:701px) and (max-width:1200px) and (orientation:landscape),
       (min-width:1201px) and (max-height:900px) and (orientation:landscape) and (pointer:coarse) {
  .viewer-layout.focused { grid-template-columns:minmax(0,1fr) !important; }
  .viewer-layout.focused > .controls { display:none !important; }
}

/* v0.2.27: Keep the reader flush with the top of the content grid.
   The content heading / theme chooser occupy only the controls column. */
.viewer-layout > .controls > .reader-controls-heading {
  box-sizing:border-box;
  display:flex;
  align-items:center;
  flex-wrap:nowrap;
  gap:7px;
  width:100%;
  min-width:0;
  min-height:30px;
  padding:1px 0;
  flex:0 0 auto;
}
.reader-controls-heading > h3 {
  flex:0 1 auto;
  min-width:0;
  max-width:48%;
  margin:0;
  font-size:clamp(12px,1.25vw,17px);
  font-weight:800;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.reader-controls-heading > .theme-picker {
  box-sizing:border-box;
  display:flex;
  align-items:center;
  flex:1 1 0;
  width:auto;
  max-width:none;
  min-width:0;
  gap:5px;
  padding:4px 6px;
  white-space:nowrap;
}
.reader-controls-heading > .theme-picker > span { font-size:10px; flex:none; }
.reader-controls-heading > .theme-picker > select {
  box-sizing:border-box;
  flex:1 1 0;
  width:100%;
  max-width:100%;
  min-width:0;
  height:26px;
  padding:3px 18px 3px 4px;
  font-size:11px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
/* Portrait tablets use a single navigation row: no duplicate full-width title row. */
.tablet-reader-theme { display:none; min-width:0; }
@media (max-width:1200px), (max-height:900px) and (pointer:coarse) {
  .tablet-view-switch { align-items:center; flex-wrap:nowrap; min-width:0; overflow-x:auto; overflow-y:hidden; }
  .tablet-view-switch > button { flex:0 0 auto; white-space:nowrap; }
  .tablet-reader-theme { display:flex; flex:1 1 130px; min-width:112px; max-width:240px; margin-left:auto; }
  .tablet-reader-theme .theme-picker {
    box-sizing:border-box;
    display:flex;
    flex:1 1 0;
    width:100%;
    min-width:0;
    max-width:none;
    gap:4px;
    padding:3px 5px;
  }
  .tablet-reader-theme .theme-picker > span { font-size:10px; flex:none; }
  .tablet-reader-theme .theme-picker > select {
    box-sizing:border-box;
    flex:1 1 0;
    min-width:0;
    width:100%;
    height:27px;
    padding:3px 16px 3px 4px;
    font-size:11px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
}
/* Landscape tablets render side-by-side; the controls heading is already visible. */
@media (min-width:701px) and (orientation:landscape) {
  .tablet-reader-theme { display:none !important; }
}


/* v0.2.28: isolated, plain-text free generation. */
.free-page{min-width:0}
.free-page .reader-controls-heading>h3{max-width:none;font-size:15px}
.free-form{min-width:0}
.free-form textarea[data-field="freePrompt"]{width:100%;box-sizing:border-box;resize:vertical;min-height:180px;line-height:1.65;font:inherit;font-size:13px;padding:11px 12px;background:#111827;color:#e8efff;border:1px solid #526079;border-radius:10px}
.free-form textarea[data-field="freePrompt"]:focus{outline:2px solid #8e82e8;outline-offset:1px}
.free-form input,.free-form select{min-width:0;max-width:100%}
.free-ref-head{display:flex;align-items:baseline;justify-content:space-between;gap:6px;flex-wrap:wrap}
.free-ref-head b{font-size:13px}
.free-ref-head small{font-size:11px;color:#9caac2}
.free-ref-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.free-ref-item{display:flex;align-items:center;gap:7px;border:1px solid #384358;border-radius:9px;background:#1c2637;padding:9px 8px;font-size:12px;cursor:pointer;min-width:0}
.free-ref-item input{width:15px;height:15px;flex:none;margin:0;accent-color:#9187e8}
.free-range{border:1px solid #39475c;border-radius:10px;padding:10px;display:grid;gap:10px}
.free-range-pair>*{flex:1 1 95px;min-width:0}
.free-estimate{border:1px solid #3b4e63;border-radius:11px;padding:11px;background:#141e2d;display:grid;gap:4px;font-size:12px}
.free-estimate b{font-size:16px;color:#efc37f}
.free-estimate small{color:#9cb0cd;font-size:10px}
.free-preview .preview-title{align-items:flex-start;flex-wrap:wrap}
.free-output-text{box-sizing:border-box;min-height:280px;padding:clamp(15px,2vw,30px);background:#182233;border:1px solid #334258;border-radius:12px;color:#e7e9f0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;font-size:clamp(13px,1.08vw,16px);user-select:text}
.free-layout .stage .preview{min-height:calc(100vh - 155px)}
.free-export-footer{gap:8px}
@media(max-width:840px){.free-layout .stage .preview{min-height:0}.free-output-text{min-height:190px;padding:15px}}
@media(max-width:420px){.free-ref-list{grid-template-columns:1fr}}

`;

  const state = { expandedX:new Set(),newsCategory:'전체',wikiTab:'article', wikiQuery:'', xQuery:'', xFilter:'all', room:'', settings:defaultSettings(), key:'', entries:[], type:'phone', selectedRecord:'', checked:new Set(), open:false, busy:false, status:'', tab:'viewer', view:'home', subIndex:0, subIndex2:0, msg:'', toastTimer:null, initialized:false, focused:false, tabletPane:'viewer', quote:null, modelOptions:MODEL_FALLBACK, profilePerson:'', exporting:false, presets:[], presetName:'', presetSelection:'',freePresets:[],freePresetName:'',freePresetSelection:'', helpOpen:false, globalDeleteConfirm:null, buttonPosition:null, boardQuery:'',pcBrowserQuery:'',pcMailFolder:'inbox',archiveLimit:40,manageLimit:100,lastUsage:null };
  const host = document.createElement('div');
  host.id = 'prwv-root';
  const root = host.attachShadow({ mode:'closed' });
  const style = document.createElement('style'); style.textContent = CSS; root.append(style);
  const wrap = document.createElement('div'); root.append(wrap);
  const badge = document.createElement('button'); badge.id = 'badge'; badge.type = 'button'; badge.textContent = '✦ 세계 열람실';
  const panel = document.createElement('section'); panel.id = 'panel'; panel.hidden = true;
  const toastBox = document.createElement('div'); toastBox.className = 'toast'; toastBox.hidden = true;
  wrap.append(badge, panel);
  document.documentElement.appendChild(host);

  const currentEntries = () => state.entries.filter(e => e.kind === state.type && (!typeOf(state.type).person || !state.settings.selectedPerson || e.person === state.settings.selectedPerson));
  const currentRecord = () => currentEntries().find(e=>e.id===state.selectedRecord) || currentEntries()[0] || null;
  function flash(message, ms=4500) {
    toastBox.textContent = message;
    toastBox.hidden = false;
    panel.append(toastBox);
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(()=>toastBox.hidden=true, ms);
  }
  function showError(err) { console.error('[가상세계 열람실]', err); flash('오류: ' + String(err?.message || err), 7000); }
  async function saveSettings() { if (state.room) await setGM(configKey(state.room), JSON.stringify(state.settings)); }
  function sanitizePresets(value) {
    return arr(value).filter(p=>p && typeof p==='object' && TYPES.some(t=>t.key===p.kind) && typeof p.name==='string' && typeof p.value==='string')
      .slice(0,300).map(p=>({id:String(p.id||uid()).slice(0,100),kind:p.kind,name:p.name.trim().slice(0,70),value:p.value.slice(0,300000),...((p.kind==='groupchat'&&typeof p.basePrompt==='string')?{basePrompt:(p.basePrompt===LEGACY_GROUPCHAT_BASE_PROMPT?GROUPCHAT_BASE_PROMPT:p.basePrompt).slice(0,300000)}:{})})).filter(p=>p.name);
  }
  async function savePresets() { await setGM(KEY_PRESETS, JSON.stringify(state.presets)); }
  async function saveFreePresets(){await setGM(KEY_FREE_PRESETS,JSON.stringify(state.freePresets));}
  const selectedFreePreset=()=>state.freePresets.find(p=>p.id===state.freePresetSelection)||null;
  function presetsOf(kind) { return state.presets.filter(p=>p.kind===kind).sort((a,b)=>a.name.localeCompare(b.name,'ko-KR')); }
  function selectedPreset(kind) {return presetsOf(kind).find(p=>p.id===state.presetSelection)||null;}

  async function loadRoom(room) {
    state.room = room; state.selectedRecord = ''; state.checked.clear(); state.view = 'home'; state.tabletPane='viewer'; state.presetSelection=''; state.presetName='';state.profilePerson='';state.freePresetSelection='';state.freePresetName='';
    if (!room) { state.entries=[];state.settings=defaultSettings(); render(); return; }
    try {
      const raw = await getGM(configKey(room), '');
      state.settings = normalizeSettings(raw ? JSON.parse(raw) : null);
      state.entries = await listRecords(room);
      state.type = TYPES.some(t=>t.key===state.settings.lastTab) ? state.settings.lastTab : 'phone';
      state.selectedRecord = currentEntries()[0]?.id || ''; state.quote=null;state.profilePerson=state.settings.selectedPerson||state.settings.characters[0]||'';
    } catch (e) { state.entries=[]; showError(e); }
    render();
  }
  async function init() {
    try { state.key = String(await getGM(KEY_API, '')); state.buttonPosition=JSON.parse(await getGM(KEY_BUTTON,'null')); updateBadgePosition(); } catch (_) {}
    try {state.presets=sanitizePresets(JSON.parse(await getGM(KEY_PRESETS,'[]')));}catch(e){state.presets=[];}
    try {state.freePresets=sanitizeFreePresets(JSON.parse(await getGM(KEY_FREE_PRESETS,'[]')));}catch(e){state.freePresets=[];}
    await loadRoom(roomFromURL());
    state.initialized = true;
  }
  const el = (tag, cls='', html='') => `<${tag}${cls?` class="${cls}"`:''}>${html}</${tag}>`;
  function setBusy(v, msg='') { state.busy=v; state.status=msg; render(); }
  function setStatus(v) { state.status=v; const live=panel.querySelector('[data-status]'); if(live)live.textContent=v; badge.textContent = v && state.busy ? '◌ 생성 중 · 열람실' : '✦ 세계 열람실'; }
  function usageSummary(r) {const u=r.usage||{};const input=integer(u.promptTokenCount,0),total=integer(u.totalTokenCount,0);const generated=integer(u.candidatesTokenCount,0)+integer(u.thoughtsTokenCount,0);const output=generated||Math.max(0,total-input);const bill=r.billUsd??(total&&input?estimateBill(r.model,input,output):null);return total?' · API 보고 '+fmtNumber(total)+'토큰'+(bill!=null?' / 유료요금 추정 '+priced(bill,state.settings.krwPerUsd):''):'';}
  function labelOf(r) { return `${r.person ? r.person+' · ' : ''}${r.rangeLabel || ''}`; }

  function sidebar() {
    return `<aside class="side">${TYPES.map(t=>`<button data-act="kind" data-kind="${t.key}" class="${state.type===t.key&&state.tab==='viewer'?'active':''}">${t.icon} ${t.label}</button>`).join('')}<small class="side-caption">관리</small><button data-act="tab" data-tab="lore" class="${state.tab==='lore'?'active':''}">📖 인물·서사 자료</button><button data-act="tab" data-tab="settings" class="${state.tab==='settings'?'active':''}">⚙ 프롬프트·API</button><button data-act="tab" data-tab="manage" class="${state.tab==='manage'?'active':''}">🗃 기록 관리</button></aside>`;
  }
  function characterPicker() {
    if (!typeOf(state.type).person) return '';
    const names = [...new Set(state.settings.characters)];
    return `<div class="card stack"><div class="section-header"><b>열람할 캐릭터</b><button class="button slim ghost" data-act="detect" ${state.busy?'disabled':''}>◌ 대화에서 인물 찾기</button></div>
      <div class="chips">${names.length ? names.map(n=>`<button data-act="person" data-person="${esc(n)}" class="chip ${state.settings.selectedPerson===n?'active':''}">${text(n,60)}</button>`).join('') : '<span class="subtle">아직 감지된 인물이 없어. 먼저 인물 찾기를 실행해 줘.</span>'}</div>
      <div class="row"><input data-field="addPerson" placeholder="인물 이름 직접 추가" style="flex:1;min-width:140px" maxlength="60"><button class="button slim" data-act="add-person">추가</button></div></div>`;
  }
  // 견적에서는 Gemini API를 전혀 호출하지 않는다. RP는 크랙 사이트에서만 읽고,
  // 토큰 길이는 브라우저에서 계산하며, 가격은 선택된 모델별 단가표를 적용한다.
  const estimateLogCache=new Map();
  let estimateTimer=0, estimateRunningKey='';
  const estimatedOutputTokens = () => state.type==='diary'?({basic:650,light:1250,standard:1900,rich:2800,large:4400})[outputSize(state.settings.outputSize)]:OUTPUT_SIZES[outputSize(state.settings.outputSize)].estimate;
  function estimateContextKey() {
    const s=state.settings;
    return JSON.stringify([state.room,state.type,s.model,s.thinkingLevel,s.outputSize,s.selectedPerson,s.rangeMode,
      s.recentTurns,s.rangeFrom,s.rangeTo,s.userName,s.common,s.perKind[state.type],s.userProfile,s.storyNotes,s.characterProfiles]);
  }
  function estimateRangeKey(room,s) {
    return JSON.stringify([room,s.rangeMode,s.rangeFrom,s.rangeMode==='recent'?s.recentTurns:s.rangeTo]);
  }
  function draftEstimateTokens() {
    const s=state.settings;
    const turns=s.rangeMode==='recent'?clamp(s.recentTurns,1,2000):Math.max(1,Math.min(2000,s.rangeTo-s.rangeFrom+1));
    // RP 본문을 불러오기 전에는 1턴 평균 450자를 가정한다. 정확한 RP 길이를 읽으면 즉시 대체.
    return Math.ceil((instructionFor(state.type,s.selectedPerson,s).length+turns*450+100)/2.2);
  }
  function estimatePanel() {
    const q=state.quote?.key===estimateContextKey()?state.quote:null;
    const model=state.settings.model, singleInput=q?.tokens ?? draftEstimateTokens();
    const requestCount=requestEstimateCount(state.type,outputSize(state.settings.outputSize));
    const input=singleInput*requestCount;
    const estimateOutput=estimatedOutputTokens();
    const thinkingAssumption=estimateThinkingTokens(model,state.settings.thinkingLevel,requestCount);
    // 견적은 Gemini 호출 없이 브라우저에서만 계산하며, 전체 입력은 분할 호출 수를 반영한다.
    const unit=estimateBill(model,singleInput,(estimateOutput+thinkingAssumption)/requestCount);
    const cost=unit==null?null:unit*requestCount;
    return `<div data-estimate-panel class="estimate-box estimate-compact">
      <b>예상 비용</b>
      <div class="estimate-summary-row"><span>모델</span><strong>${text(model,70)}</strong></div>
      <div class="estimate-summary-row"><span>추론 강도</span><strong>${text(THINKING_LABELS[validThinking(model,state.settings.thinkingLevel)],35)}</strong></div>
      <div class="estimate-summary-row"><span>예상 총입력</span><strong>약 ${fmtNumber(input)}토큰</strong></div>
      <div class="estimate-summary-price">${priced(cost,state.settings.krwPerUsd)}</div>
      <small>단순 예상치이며 실제 토큰 사용량·요금과 다를 수 있어. 자세한 기준은 상단 ? 도움말에서 확인해.</small>
    </div>`;
  }
  function updateEstimatePanel() {
    const old=panel.querySelector('[data-estimate-panel]');
    if(old)old.outerHTML=estimatePanel();
  }
  function scheduleAutomaticEstimate() {
    clearTimeout(estimateTimer);
    if(!state.open||state.tab!=='viewer'||!state.room||state.busy||state.type==='free')return;
    const key=estimateContextKey();
    if(state.quote?.key===key || estimateRunningKey===key)return;
    estimateTimer=setTimeout(async()=>{
      if(key!==estimateContextKey()||!state.open||state.tab!=='viewer'||state.busy)return;
      estimateRunningKey=key;
      const room=state.room,s=structuredClone(state.settings),kind=state.type,person=s.selectedPerson;
      const rangeKey=estimateRangeKey(room,s);
      try {
        let log=estimateLogCache.get(rangeKey);
        if(!log||Date.now()-log.savedAt>90000){
          const result=await readConversation(room,s.rangeMode,s.rangeFrom,s.rangeMode==='recent'?s.recentTurns:s.rangeTo,undefined,s.userName);
          log={...result,savedAt:Date.now()};
          estimateLogCache.set(rangeKey,log);
          if(estimateLogCache.size>4)estimateLogCache.delete(estimateLogCache.keys().next().value);
        }
        if(key!==estimateContextKey())return;
        const instruction=instructionFor(kind,person,s);
        const payload=`[이번 생성에 참고할 RP 대화 · ${log.label}]\n${log.content}`;
        state.quote={key,tokens:approxTokens(instruction+payload)};
      } catch(e) {
        if(key!==estimateContextKey())return;
        state.quote={key,error:String(e?.message||e)};
        console.warn('[가상세계 열람실] 자동 비용 근사 실패',e);
      } finally {
        if(estimateRunningKey===key)estimateRunningKey='';
        if(key===estimateContextKey())updateEstimatePanel();
      }
    },650);
  }
  function generatorControls() {
    const s = state.settings;
    return `<div class="card stack"><div class="section-header"><b>새 ${typeOf(state.type).label} 기록</b><span class="pill">수동 생성</span></div>
    <div class="row"><label class="toggle"><input type="radio" name="prwv-range" data-field="rangeMode" value="recent" ${s.rangeMode==='recent'?'checked':''}> 최근 N턴</label><label class="toggle"><input type="radio" name="prwv-range" data-field="rangeMode" value="range" ${s.rangeMode==='range'?'checked':''}> 시작~끝 턴</label></div>
    ${s.rangeMode==='recent' ? `<label class="field"><span>읽을 최근 RP 턴 수</span><input type="number" min="1" max="2000" data-field="recentTurns" value="${s.recentTurns}"></label>` : `<div class="row"><label class="field"><span>시작 턴</span><input type="number" min="1" data-field="rangeFrom" value="${s.rangeFrom}"></label><label class="field"><span>끝 턴</span><input type="number" min="1" data-field="rangeTo" value="${s.rangeTo}"></label></div>`}
    <label class="field"><span>새 기록 생성 분량 · 목표 개수</span><select data-field="outputSize" aria-label="생성 분량과 목표 개수">${Object.entries(OUTPUT_SIZES).map(([key,option])=>`<option value="${key}" ${outputSize(s.outputSize)===key?'selected':''}>${text(option.label,45)} · ${text(sizePreviewText(state.type,key),220)}</option>`).join('')}</select></label>
    ${estimatePanel()}
    <button class="button primary" data-act="generate" ${state.busy || !state.room ? 'disabled':''}>✦ ${typeOf(state.type).label} 생성하고 기록에 추가</button>
    ${state.busy ? `<div class="status"><span class="spinning">◌</span><span data-status>${text(state.status)}</span></div>` : ''}
    </div>`;
  }
  function archiveList() {
    const list = currentEntries();
    return `<div class="card"><div class="section-header"><b>보관된 ${typeOf(state.type).label} 기록 · ${list.length}개</b><span class="subtle">클릭해서 열람</span></div>
      <div class="archive">${list.slice(0,state.archiveLimit).map(e => `<div class="archive-row ${currentRecord()?.id===e.id?'selected':''}"><button data-act="record" data-id="${esc(e.id)}"><b>${text(labelOf(e),90)}</b><small>${fmtDate(e.createdAt)}${usageSummary(e)}</small></button><button class="button slim ghost" data-act="single-delete" data-id="${esc(e.id)}" style="flex:none">삭제</button></div>`).join('') || '<div class="subtle">아직 생성된 기록이 없어.</div>'}${list.length>state.archiveLimit?`<button class="button slim" data-act="archive-more">더 보기 (${list.length-state.archiveLimit}개 남음)</button>`:''}</div>
    </div>`;
  }
  function currentTheme(kind=state.type) {
    return validTheme(kind, state.settings?.themes?.[kind]);
  }
  function themePicker(kind=state.type) {
    const options = themeOptions(kind);
    if (!options.length) return '';
    return `<label class="theme-picker"><span>테마</span><select data-field="theme" data-kind="${kind}" aria-label="${text(typeOf(kind).label,30)} 테마 선택">${options.map(opt=>`<option value="${esc(opt.id)}" ${currentTheme(kind)===opt.id?'selected':''}>${text(opt.label,90)}</option>`).join('')}</select></label>`;
  }
  function wrapAltDevice(theme, title, subtitle, inner, extra='') {
    return `<div class="alt-device ${theme}"><div class="alt-device-head"><div><b>${text(title,70)}</b><small>${text(subtitle,140)}</small></div><span class="alt-device-badge">${text(subtitle.split(' · ')[0]||subtitle,26)}</span></div><div class="alt-device-body">${inner}</div>${extra}</div>`;
  }
  // Theme-only rendering. All variants read the exact same stored JSON fields.
  // No extra generation calls and no alteration of the original record.
  function phoneAltView(data, theme) {
    const config={
      retro:{title:'폴더폰',label:{messages:'문자함',calls:'통화기록',searches:'인터넷',notes:'메모장',social:'미니홈피',photos:'사진첩'},icons:{messages:'✉',calls:'☎',searches:'◎',notes:'▤',social:'✿',photos:'▧'}},
      classic:{title:'서신과 소지품',label:{messages:'서찰 묶음',calls:'전언 기록',searches:'탐문 기록',notes:'비망록',social:'풍문 모음',photos:'그림첩'},icons:{messages:'✉',calls:'♧',searches:'⌕',notes:'▤',social:'❀',photos:'▧'}},
      fantasy:{title:'마도 통신구',label:{messages:'전언',calls:'교신',searches:'탐색',notes:'마도록',social:'소문',photos:'환영첩'},icons:{messages:'✉',calls:'◇',searches:'✧',notes:'▤',social:'☷',photos:'❖'}}
    }[theme];
    if(!config) return '';
    const keys=['messages','calls','searches','notes','social','photos'];
    const counts=Object.fromEntries(keys.map(k=>[k,arr(data[k]).length]));
    const menus=keys.map((k,i)=>`<button class="${theme==='retro'?'flip-item':theme==='classic'?'letter-folder':'magic-rune'}" data-act="view" data-view="${k}"><span class="theme-glyph">${config.icons[k]}</span><span class="theme-menu-text">${config.label[k]}</span><small>${counts[k]}${theme==='retro'?'': '건'}</small>${theme==='retro'?`<i>${i+1}</i>`:''}</button>`).join('');
    const view=state.view;
    const goHome=`<button class="theme-go-home" data-act="back" data-to="home">‹ ${theme==='retro'?'취소':theme==='classic'?'서함으로':'통신구로'}</button>`;
    const heading= view==='thread'?arr(data.messages)[state.subIndex]?.person||'서신':view==='phone-detail'?'기록 상세':config.label[view]||'기록';
    let detail='';
    const line=(headline,desc,time,action='')=>`<${action?'button':'div'} class="theme-record-line" ${action||''}><span class="theme-line-heading">${headline}</span><span class="theme-line-desc">${desc}</span>${time?`<time>${time}</time>`:''}</${action?'button':'div'}>`;
    if(view==='messages') detail=arr(data.messages).map((m,i)=>line(text(m.person,60),text(arr(m.thread).at(-1)?.text||'',140),text(m.time,40),`data-act="viewitem" data-index="${i}"`)).join('');
    if(view==='calls') detail=arr(data.calls).map(m=>line(text(m.name,80),text(m.kind,80),text(m.time,40))).join('');
    if(view==='searches') detail=arr(data.searches).map(m=>line(text(m,190),'⌕ '+(theme==='classic'?'탐문':theme==='fantasy'?'마법 탐색':'조회'), '')).join('');
    if(view==='notes') detail=arr(data.notes).map((m,i)=>line(text(m.title,100),text(m.body,140),'',`data-act="phoneitem" data-source="notes" data-index="${i}"`)).join('');
    if(view==='photos') detail=`<div class="theme-picture-grid">${arr(data.photos).map((m,i)=>`<button class="theme-picture" data-act="phoneitem" data-source="photos" data-index="${i}"><span>${text(m.emoji||'▧',7)}</span><b>${text(m.caption,70)}</b><small>${text(m.date,45)}</small></button>`).join('')}</div>`;
    if(view==='social') detail=arr(data.social).map(m=>`<article class="theme-social-entry"><header><b>${text(m.handle,75)}</b><time>${text(m.time,55)}</time></header><p>${textFull(m.text)}</p><small>♡ ${integer(m.likes)} · 댓글 ${arr(m.comments).length}</small>${arr(m.comments).map(c=>`<div class="theme-social-comment"><b>${text(c.by,40)}</b> ${textFull(c.text)}</div>`).join('')}</article>`).join('');
    if(view==='thread') {
      const thread=arr(data.messages)[state.subIndex]||{};
      detail=`<div class="theme-thread">${arr(thread.thread).map(m=>`<div class="theme-message ${m.from==='me'?'out':'in'}"><small>${m.from==='me'?text(data.owner||'나',40):text(thread.person,50)}</small><p>${textFull(m.text)}</p><time>${text(m.time,40)}</time></div>`).join('')}</div>`;
    }
    if(view==='phone-detail'){
      const photo=state.phoneSource==='photos';
      const item=arr(data[photo?'photos':'notes'])[state.subIndex]||{};
      detail=photo?`<div class="theme-photo-detail"><div>${text(item.emoji||'▧',7)}</div><h3>${text(item.caption,250)}</h3><small>${text(item.date,70)}</small></div>`:
        `<div class="theme-document"><h3>${text(item.title||'제목 없는 기록',160)}</h3><div class="theme-longtext">${textFull(item.body)}</div></div>`;
    }
    if(!detail) detail='<p class="theme-empty">보관된 기록이 없습니다.</p>';
    const backTo=view==='thread'?'messages':view==='phone-detail'?(state.phoneSource||'home'):'home';
    if(theme==='retro') {
      const screen=view==='home'?`<div class="flip-home"><b>기능 선택</b><div class="flip-menu">${menus}</div></div>`:
        `<div class="flip-detail"><div class="flip-detail-head"><button data-act="back" data-to="${backTo}">◂</button><b>${text(heading,75)}</b></div><div class="flip-detail-list">${detail}</div></div>`;
      const keypad=[['1','messages'],['2','calls'],['3','searches'],['4','notes'],['5','social'],['6','photos'],['7','home'],['8','home'],['9','home'],['*','home'],['0','home'],['#','home']].map(([n,target])=>`<button class="flip-key" data-act="view" data-view="${target}"><b>${n}</b><small>${({1:'',2:'ABC',3:'DEF',4:'GHI',5:'JKL',6:'MNO',7:'PQRS',8:'TUV',9:'WXYZ'})[n]||' '}</small></button>`).join('');
      return `<div class="flip-display-wrap"><div class="flip-phone"><div class="flip-top"><div class="flip-ear"></div><div class="flip-lcd"><div class="flip-status"><span>▣ 통신</span><span>◕ ▰▰▰</span></div>${screen}<div class="flip-softkeys"><button data-act="back" data-to="home">메뉴</button><span>${text(data.owner||'개인 기록',40)}</span><button data-act="back" data-to="${backTo}">취소</button></div></div></div><div class="flip-hinge"></div><div class="flip-bottom"><div class="flip-controls"><button data-act="back" data-to="${backTo}">↶</button><button class="flip-dpad" data-act="view" data-view="home">◆</button><button data-act="view" data-view="calls">☎</button></div><div class="flip-keys">${keypad}</div></div></div></div>`;
    }
    if(theme==='classic') {
      const page=view==='home'?`<div class="letter-cover-page"><div class="letter-calligraphy">私人書函</div><h2>개인 서신함</h2><div class="letter-items">${menus}</div></div>`:
        `<div class="letter-read-page"><div class="letter-read-top"><button data-act="back" data-to="${backTo}">‹ 뒤로</button><span>서고 기록</span></div><div class="letter-inkline"></div><h2>${text(heading,85)}</h2><div class="letter-read-content">${detail}</div></div>`;
      return `<div class="letter-world"><div class="letter-table"><div class="letter-cord"></div><div class="letter-box"><div class="letter-spine"></div><div class="letter-paper">${page}</div><span class="letter-seal">封</span></div></div></div>`;
    }
    const right=view==='home'?`<div class="arcane-intro">${arr(data.messages).slice(0,5).map(m=>`<div class="theme-record-line"><span class="theme-line-heading">${text(m.person,60)}</span><span class="theme-line-desc">${text(arr(m.thread).at(-1)?.text||'',140)}</span><time>${text(m.time,40)}</time></div>`).join('')}</div>`:
      `<div class="arcane-page"><div class="arcane-page-top"><button data-act="back" data-to="${backTo}">‹ 통신구</button></div><h2>${text(heading,90)}</h2><div class="arcane-list">${detail}</div></div>`;
    return `<div class="arcane-world"><div class="arcane-device"><div class="arcane-crown">✧　✦　✧　✦　✧</div><div class="arcane-orbit"><div class="arcane-orb"></div></div><div class="arcane-runemenu">${menus}</div><div class="arcane-base">✦　${text(data.owner||'개인 기록',55)}　✦</div></div><div class="arcane-records">${right}</div></div>`;
  }

  function pcAltView(data,theme) {
    const classic=theme==='classic';
    const fantasy=theme==='fantasy';
    if(!classic&&!fantasy)return '';
    const cfg=classic?{title:'개인 서고',sub:'',labels:{folders:'문서 서랍',emails:'서신 보관함',browser:'열람 장부',notes:'개인 필사본'},icons:{folders:'▥',emails:'✉',browser:'⌕',notes:'▤'}}:
      {title:'마법 기록실',sub:'',labels:{folders:'마도서가',emails:'마력 서신',browser:'기억 수정',notes:'비전 연구'},icons:{folders:'✧',emails:'◇',browser:'◈',notes:'✦'}};
    const kinds=['folders','emails','browser','notes'];
    const nav=kinds.map(k=>`<button class="archive-menu" data-act="view" data-view="${k}"><span>${cfg.icons[k]}</span><b>${cfg.labels[k]}</b><small>${arr(data[k]).length}</small></button>`).join('');
    const view=state.view;
    const go=(to,label)=>`<button class="archive-back" data-act="back" data-to="${to}">‹ ${label}</button>`;
    const folder=arr(data.folders)[state.subIndex]||{}, file=arr(folder.files)[state.fileIndex||0]||{};
    const mail=arr(data.emails)[state.subIndex]||{},page=arr(data.browser)[state.subIndex]||{},note=arr(data.notes)[state.subIndex]||{};
    const items=(records,render)=>records.map(render).join('')||'<p class="archive-empty">여기에 남은 기록이 없다.</p>';
    let content='';
    if(view==='home') content=`<div class="archive-welcome"><div class="archive-emblem">${classic?'書':'✧'}</div><h2>${cfg.title}</h2><small>${text(data.owner||'기록 보관인',90)}의 기록</small></div><div class="archive-home-menu">${nav}</div>`;
    if(view==='folders') content=`${go('home','돌아가기')}<h2>${cfg.labels.folders}</h2><div class="archive-folder-grid">${items(arr(data.folders),(f,i)=>`<button class="archive-folder" data-act="pcitem" data-index="${i}"><span>${classic?'▤':'✧'}</span><b>${text(f.name,90)}</b><small>${arr(f.files).length}개 문서</small></button>`)}</div>`;
    if(view==='files') content=`${go('folders','서랍 목록')}<h2>${text(folder.name,120)}</h2><div class="archive-entry-list">${items(arr(folder.files),(f,i)=>`<button class="archive-entry" data-act="pcitem" data-index="${i}"><span>▤</span><b>${text(f.title,120)}</b><time>${text(f.date,50)}</time></button>`)}</div>`;
    if(view==='detail'&&state.subIndex2===3)content=`${go('files','문서 목록')}<div class="archive-document"><small>${text(file.date,90)}</small><h2>${text(file.title,160)}</h2><div class="archive-text">${textFull(file.body)}</div></div>`;
    if(view==='emails')content=`${go('home','돌아가기')}<h2>${cfg.labels.emails}</h2><div class="archive-entry-list">${items(arr(data.emails),(m,i)=>`<button class="archive-entry" data-act="pcitem" data-index="${i}"><span>✉</span><b>${text(m.subject,120)}</b><small>${text(m.from,60)}</small></button>`)}</div>`;
    if(view==='mail-detail')content=`${go('emails','서신 목록')}<div class="archive-document"><small>${text(mail.date,80)} · ${text(mail.from,80)} → ${text(mail.to,80)}</small><h2>${text(mail.subject,160)}</h2><div class="archive-text">${textFull(mail.body)}</div></div>`;
    if(view==='browser')content=`${go('home','돌아가기')}<h2>${cfg.labels.browser}</h2><div class="archive-entry-list">${items(arr(data.browser),(b,i)=>`<button class="archive-entry" data-act="pcitem" data-index="${i}"><span>⌕</span><b>${text(b.title,125)}</b><small>${text(b.query||b.url,95)}</small></button>`)}</div>`;
    if(view==='browser-page')content=`${go('browser','열람 장부')}<div class="archive-document"><small>${text(page.query||page.url,125)}</small><h2>${text(page.title,160)}</h2><div class="archive-text">${textFull(page.summary)}</div></div>`;
    if(view==='notes')content=`${go('home','돌아가기')}<h2>${cfg.labels.notes}</h2><div class="archive-entry-list">${items(arr(data.notes),(n,i)=>`<button class="archive-entry" data-act="pcitem" data-index="${i}"><span>▤</span><b>${text(n.title,140)}</b></button>`)}</div>`;
    if(view==='note-detail')content=`${go('notes','필사본 목록')}<div class="archive-document"><h2>${text(note.title,160)}</h2><div class="archive-text">${textFull(note.body)}</div></div>`;
    if(classic)return `<div class="study-world"><div class="study-marquee">✥　${cfg.title}　✥ </div><div class="study-cabinet"><aside class="study-drawers"><div class="study-drawers-title">문서 수납장</div>${nav}</aside><div class="study-writing-desk"><div class="study-paper">${content}</div><div class="study-feather">✒</div></div></div></div>`;
    return `<div class="wizard-world"><div class="wizard-arch"><div class="wizard-top-runes">✧ · ✦ · ✧ · ✦ · ✧</div><h2>${cfg.title}</h2></div><div class="wizard-desk"><aside class="wizard-shelves"><div class="wizard-focus-gem">◈</div>${nav}</aside><main class="wizard-manuscript"><div class="wizard-page-ornament">◇　✧　◇</div>${content}</main></div></div>`;
  }

  function boardAltView(d,theme) {
    const sections=arr(d.sections),section=sections[state.subIndex]||{},posts=arr(section.posts),post=posts[state.subIndex2]||{};
    const isForeign=theme==='foreign4'||theme==='foreign2';
    const cfg={classic:{title:'저잣거리 소문판',hint:'',boards:'게시판',posts:'게시글'},fantasy:{title:'왕도 길드 게시판',hint:'',boards:'게시판',posts:'게시글'},foreign4:{title:'익명 이미지보드',hint:'',boards:'게시판 목록',posts:'스레드 목록'},foreign2:{title:'익명 텍스트 게시판',hint:'',boards:'게시판 목록',posts:'스레드 목록'}}[theme];
    if(!cfg)return '';
    const hot=sections.flatMap((g,gi)=>arr(g.posts).map((p,pi)=>({...p,gi,pi}))).sort((a,b)=>integer(b.views)-integer(a.views)).slice(0,7);
    const home=sections.map((sec,i)=>`<button class="notice-board-link" data-act="section" data-index="${i}"><span class="notice-pin">${theme==='fantasy'?'✥':theme==='classic'?'●': '■'}</span><strong>${text(sec.name,95)}</strong><small>${arr(sec.posts).length}건</small></button>`).join('');
    const homeHot=hot.map((p,i)=>`<button class="notice-teaser" data-act="board-jump" data-index="${p.gi}" data-post="${p.pi}"><small>${text(sections[p.gi].name,65)}</small><b>${text(p.title,165)}</b><span>${integer(p.views)}회 열람</span></button>`).join('');
    const postRows=posts.map((p,i)=>`<button class="notice-post-row" data-act="post" data-index="${i}"><small>${theme==='foreign2'?i+1:theme==='foreign4'?'No.'+(i+1):'✦'}</small><b>${text(p.title,200)}</b><span>${text(p.author||'익명',60)} · ${integer(p.views)}회</span><em>${arr(p.comments).length}개 반응</em></button>`).join('');
    const comments=arr(post.comments).map((c,i)=>`<div class="notice-comment"><small>${theme==='foreign2'?i+1+'.':theme==='foreign4'?'No.'+(i+1):'✎'}</small><b>${text(c.author||'익명',85)}</b><p>${textFull(c.text)}</p></div>`).join('')||'<p class="notice-muted">등록된 반응이 없다.</p>';
    let core='';
    if(state.view==='home')core=`<div class="notice-section-title">${cfg.boards}</div><div class="notice-board-links">${home}</div><div class="notice-section-title">${cfg.posts}</div><div class="notice-teasers">${homeHot||'<p class="notice-muted">아직 기록이 없다.</p>'}</div>`;
    if(state.view==='posts')core=`<div class="notice-navigation"><button data-act="back" data-to="home">‹ 전체 게시판</button><b>${text(section.name,90)}</b></div><div class="notice-post-list">${postRows||'<p class="notice-muted">게시물이 없다.</p>'}</div>`;
    if(state.view==='detail')core=`<div class="notice-navigation"><button data-act="back" data-to="posts">‹ ${text(section.name,90)}</button><button data-act="back" data-to="home">전체로</button></div><article class="notice-sheet"><header><h2>${text(post.title,230)}</h2><div class="notice-byline">${text(post.author||'익명',80)} · ${text(post.time,80)}　조회 ${integer(post.views)}　추천 ${integer(post.likes)}</div></header><div class="notice-body">${textFull(post.body)}</div><section class="notice-comments"><h3>반응 ${arr(post.comments).length}개</h3>${comments}</section></article>`;
    if(theme==='foreign4')return `<div class="imageboard-site"><div class="imageboard-header"><b>${text(d.site||cfg.title,70)}</b><span>[ /all/ · /talk/ · /news/ · /random/ ]</span></div><div class="imageboard-title">${text(d.site||cfg.title,80)}</div><div class="imageboard-content">${core}</div></div>`;
    if(theme==='foreign2')return `<div class="textboard-site"><div class="textboard-top">■ ${text(d.site||cfg.title,75)}　■</div><div class="textboard-nav">[ <button data-act="back" data-to="home">게시판 첫화면</button> ] [ 스레드 목록 ] [ 최근글 ]</div><div class="textboard-main">${core}</div></div>`;
    return `<div class="notice-world ${theme}"><div class="notice-roof"><span>✥</span><h1>${text(d.site||cfg.title,95)}</h1></div><div class="notice-frame"><span class="notice-ropes">╱　╲</span><div class="notice-board-wood"><div class="notice-paper-area">${core}</div></div><span class="notice-seal-deco">${theme==='classic'?'告':'✥'}</span></div></div>`;
  }

  function newsAltView(d,theme) {
    const articles=arr(d.articles),selected=articles[state.subIndex]||{},site=text(d.site|| (theme==='classic'?'도성 관보':'황실 신문'),85);
    const classic=theme==='classic';
    const cfg=classic?{tag:'官報',seal:'告',small:''}:{tag:'✧ IMPERIAL GAZETTE ✧',seal:'✥',small:''};
    const cats=[...new Set(articles.map(a=>String(a.category||'종합')))].slice(0,10);
    const head=`<header class="gazette-head"><div class="gazette-minor"><span>${text(articles[0]?.date||'발행일 미상',70)}</span></div><h1>${site}</h1><nav class="gazette-cats"><button data-act="news-category" data-category="전체">전체</button>${cats.map(c=>`<button data-act="news-category" data-category="${esc(c)}">${text(c,40)}</button>`).join('')}</nav></header>`;
    const active=state.newsCategory||'전체';
    const visible=active==='전체'?articles:articles.filter(a=>String(a.category||'종합')===active);
    const hero=visible[0];
    const front=`<div class="gazette-front">${hero?`<button class="gazette-lead" data-act="webitem" data-index="${articles.indexOf(hero)}"><span class="gazette-category">${text(hero.category||'주요 소식',65)}</span><h2>${text(hero.title,240)}</h2><p>${text(hero.lede,300)}</p><small>${text(hero.author,80)} · ${text(hero.date,60)}</small></button>`:''}<div class="gazette-columns">${visible.slice(1).map(a=>`<button class="gazette-brief" data-act="webitem" data-index="${articles.indexOf(a)}"><small>${text(a.category||'소식',55)} · ${text(a.date,55)}</small><h3>${text(a.title,180)}</h3><p>${text(a.lede,250)}</p></button>`).join('')||'<p>더 읽을 기사가 없습니다.</p>'}</div></div>`;
    const detail=`<div class="gazette-detail"><button class="gazette-back" data-act="back" data-to="home">‹ 제1면으로</button><div class="gazette-article-meta">${text(selected.category||'종합',70)}　·　${text(selected.date,70)}　·　${text(selected.author,75)}</div><h2>${text(selected.title,260)}</h2><p class="gazette-lede">${textFull(selected.lede)}</p><div class="gazette-article-body">${textFull(selected.body)}</div><section class="gazette-readers"><h3>${classic?'독자들의 풍문':'독자들의 의견'}</h3>${arr(selected.comments).map(c=>`<p><b>${text(c.author||'독자',70)}</b>　${textFull(c.text)}</p>`).join('')||'<p>남겨진 반응이 없습니다.</p>'}</section></div>`;
    return `<div class="gazette-paper ${theme}"><div class="gazette-inner">${head}${state.view==='detail'?detail:front}<footer class="gazette-end"><span>${cfg.seal}</span>　발행처 · ${site}　<span>${cfg.seal}</span></footer></div></div>`;
  }

  function wikiAltView(d,theme) {
    const docs=arr(d.docs),selected=docs[state.subIndex]||docs[0]||{},detail=state.view==='detail';
    const classic=theme==='classic';
    const cfg=classic?{title:'고전 백과',small:'',logo:'典',word:'항목'}:{title:'판타지 백과',small:'',logo:'✧',word:'기록'};
    const nav=docs.map((doc,i)=>`<button class="codex-index-row ${detail&&state.subIndex===i?'active':''}" data-act="webitem" data-index="${i}"><span>${classic?'▤':'✦'}</span><b>${text(doc.title,85)}</b></button>`).join('');
    const tabs=`<div class="codex-tabs"><button class="${state.wikiTab==='article'?'active':''}" data-act="wiki-tab" data-tab="article">본문</button><button class="${state.wikiTab==='discussion'?'active':''}" data-act="wiki-tab" data-tab="discussion">기록자 토론</button></div>`;
    const contents=arr(selected.sections).map((s,i)=>`<section class="codex-section"><h3>${i+1}. ${text(s.heading,140)}</h3><div class="codex-paragraph">${textFull(s.body)}</div></section>`).join('');
    const talks=arr(selected.discussion).map(c=>`<div class="codex-talk"><b>${text(c.author||'기록자',75)}</b><p>${textFull(c.text)}</p></div>`).join('')||'<p>토론 기록이 없습니다.</p>';
    const entries=docs.map((doc,i)=>`<button class="codex-entry" data-act="webitem" data-index="${i}"><strong>${text(doc.title,135)}</strong><small>${text(doc.summary,210)}</small></button>`).join('');
    const content=detail?`<div class="codex-article"><button class="codex-return" data-act="back" data-to="home">‹ 목차로</button><h2>${text(selected.title,180)}</h2>${tabs}<p class="codex-summary">${textFull(selected.summary)}</p>${state.wikiTab==='article'?contents:talks}</div>`:`<div class="codex-landing"><div class="codex-initial">${cfg.logo}</div><h2>기록 목록</h2><div class="codex-entries">${entries}</div></div>`;
    return `<div class="codex-world ${theme}"><div class="codex-cover"><div class="codex-book"><div class="codex-left"><header class="codex-brand"><span>${cfg.logo}</span><strong>${text(d.site||cfg.title,90)}</strong></header><div class="codex-nav-title">▤　색인 목차</div><nav class="codex-index"><button class="codex-index-row" data-act="back" data-to="home">⌂　대문</button>${nav}</nav><div class="codex-ornament">${classic?'❀　❀　❀':'✧　◇　✧'}</div></div><div class="codex-gutter"></div><main class="codex-right">${content}</main></div></div></div>`;
  }

  function xAltView(d,theme) {
    const posts=arr(d.posts),trends=arr(d.trends),classic=theme==='classic';
    const filtered=posts.map((p,i)=>({...p,idx:i})).filter(p=>!state.xQuery||[p.author,p.handle,p.text].join(' ').toLocaleLowerCase('ko-KR').includes(state.xQuery.toLocaleLowerCase('ko-KR')));
    const notes=filtered.map((p,n)=>`<article class="${classic?'wall-scrap':'aether-post'}"><div class="micro-post-head"><b>${text(p.author,85)}</b><small>${text(p.handle,70)} · ${text(p.time,45)}</small></div><div class="micro-post-text">${textFull(p.text)}</div><div class="micro-post-actions"><span>${classic?'퍼진 소문':'↺'} ${integer(p.reposts)}</span><span>♡ ${integer(p.likes)}</span><button data-act="x-toggle" data-index="${p.idx}">반응 ${arr(p.replies).length} ${state.expandedX.has(p.idx)?'접기':'보기'}</button></div>${state.expandedX.has(p.idx)?`<div class="micro-post-replies">${arr(p.replies).map(reply=>`<div><b>${text(reply.author,75)}</b><small> ${text(reply.handle,50)}</small><p>${textFull(reply.text)}</p></div>`).join('')||'<p>남겨진 답글 없음</p>'}</div>`:''}</article>`).join('')||'<p>보여줄 기록이 없습니다.</p>';
    const trend=trends.map(t=>`<button data-act="x-trend" data-query="${esc(t.tag)}"><b>${text(t.tag,80)}</b><small>${text(t.count,50)}개 이야기</small></button>`).join('');
    if(classic)return `<div class="whisper-wall"><div class="whisper-roof"><span>●</span><h2>${text(d.site||'풍문',85)}</h2><span>●</span></div><div class="whisper-inner"><section class="whisper-notes">${notes}</section><aside class="whisper-side"><h3>지금 돌고 있는 풍문</h3>${trend}</aside></div><div class="whisper-stones">▧　▦　▧　▦　▧　▦</div></div>`;
    return `<div class="aether-feed"><div class="aether-lines"></div><header><span>✧</span><div><h2>${text(d.site||'마법 소식망',85)}</h2></div><span>✦</span></header><div class="aether-layout"><main>${notes}</main><aside><div class="aether-crystal">✦</div><h3>왕국의 화제</h3>${trend}</aside></div></div>`;
  }

  // Snapshot of the currently rendered record (including the opened detail screen).
  // Serialize a fully styled XHTML clone into an SVG data URI. Unlike a blob: SVG URL,
  // a data: SVG URI can be drawn to a canvas and exported as PNG in Chromium.
  function cloneSnapshotStyles(source, copy) {
    if(source.nodeType===Node.ELEMENT_NODE && copy.nodeType===Node.ELEMENT_NODE){
      const css=getComputedStyle(source);
      let declarations='';
      for(let i=0;i<css.length;i++){
        const prop=css[i],value=css.getPropertyValue(prop);
        if(value)declarations+=prop+':'+value+';';
      }
      copy.setAttribute('style',declarations);
      if(source instanceof HTMLInputElement){copy.setAttribute('value',source.value);}
      if(source instanceof HTMLTextAreaElement){copy.textContent=source.value;}
      if(source instanceof HTMLSelectElement){copy.value=source.value;}
      const scrollable=source.scrollHeight>source.clientHeight+3 && /auto|scroll/.test(css.overflowY);
      if(scrollable){
        copy.style.height='auto';copy.style.maxHeight='none';copy.style.overflowY='visible';
        // Expand any ancestor that would otherwise clip the taller paper or article.
        for(let parent=copy.parentElement;parent;parent=parent.parentElement){
          const originalCss=parent.style;
          if(/hidden|clip/.test(originalCss.overflowY)||/hidden|clip/.test(originalCss.overflow)){
            parent.style.overflow='visible';parent.style.height='auto';parent.style.maxHeight='none';
          }
        }
      }
      if(source.classList.contains('preview')){
        copy.style.height='auto';copy.style.maxHeight='none';copy.style.minHeight='0';
        copy.style.overflow='visible';copy.style.width='100%';
      }
      if(source.classList.contains('ios-scroll')||source.classList.contains('pc-window-content')){
        copy.style.height='auto';copy.style.maxHeight='none';copy.style.overflow='visible';
      }
    }
    const originalChildren=[...source.childNodes], clonedChildren=[...copy.childNodes];
    for(let i=0;i<Math.min(originalChildren.length,clonedChildren.length);i++)cloneSnapshotStyles(originalChildren[i],clonedChildren[i]);
  }
  async function exportPreviewPng(button) {
    const record=currentRecord();
    if(!record||state.exporting)return;
    // Tablet controls can hide the reader; switch to the reader before taking a snapshot.
    if(state.tabletPane==='controls'){
      state.tabletPane='viewer';render();
      button=panel.querySelector('.viewer-export-footer [data-act=export-png]')||button;
    }
    const previewEl=panel.querySelector('.stage .preview');
    if(!previewEl || previewEl.getBoundingClientRect().width<10)return flash('열람 화면으로 전환한 다음 저장해 줘.');
    state.exporting=true;
    const before=button.textContent;button.disabled=true;button.textContent='PNG 만드는 중…';
    let temp=null;
    try{
      const width=Math.max(320,Math.ceil(previewEl.getBoundingClientRect().width));
      const clone=previewEl.cloneNode(true);
      cloneSnapshotStyles(previewEl,clone);
      const holder=document.createElement('div');
      holder.setAttribute('style',`position:fixed;left:-100000px;top:0;width:${width}px;overflow:visible;pointer-events:none;z-index:-9999`);
      holder.appendChild(clone);
      // Use the original shadow stylesheet by placing the measuring clone inside the same shadow root.
      root.appendChild(holder);temp=holder;
      clone.style.width=width+'px';clone.style.height='auto';clone.style.maxHeight='none';clone.style.overflow='visible';
      const height=Math.max(120,Math.ceil(clone.scrollHeight+4));
      const viewWidth=Math.max(width,Math.ceil(clone.scrollWidth));
      if(height>24000||viewWidth>12000)throw new Error('기록이 너무 길어서 한 장으로 저장할 수 없어. 세부 화면으로 나눠 저장해 줘.');
      const scale=Math.min(2,12000/Math.max(viewWidth,height),Math.sqrt(26000000/(viewWidth*height)));
      if(scale<0.35)throw new Error('이미지 크기가 너무 커. 상세 화면에서 나눠 저장해 줘.');
      // SVG rendering needs XHTML namespace and an image data: URI (blob: taints the canvas).
      clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
      const xhtml=new XMLSerializer().serializeToString(clone);
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${viewWidth}" height="${height}" viewBox="0 0 ${viewWidth} ${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
      const dataUrl='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('브라우저가 화면 이미지를 변환하지 못했어.'));image.src=dataUrl;});
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(viewWidth*scale));canvas.height=Math.max(1,Math.round(height*scale));
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('이미지 처리 화면을 만들지 못했어.');
      ctx.fillStyle='#111a29';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('PNG 파일 생성에 실패했어.');
      const safeName=String(record.kind==='free'?(record.payload?.title||'자유 생성'):(record.person||record.payload?.owner||'세계관')).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,35);
      const filename=`열람실_${typeOf(record.kind).label}_${safeName}_${new Date(record.createdAt).toISOString().slice(0,10)}.png`;
      const blobUrl=URL.createObjectURL(blob);
      try{const a=document.createElement('a');a.href=blobUrl;a.download=filename;document.body.append(a);a.click();a.remove();}finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),30000);}
      flash('현재 열람 화면을 PNG 파일로 저장했어.');
    }catch(e){showError(e);}
    finally{temp?.remove();state.exporting=false;button.disabled=false;button.textContent=before;}
  }
  function freeEstimate(){
    const d=state.settings.freeDraft,s=state.settings;
    let length=d.prompt.length;
    if(d.refs.rp)length+=(d.rangeMode==='recent'?d.recentTurns:Math.max(1,d.rangeTo-d.rangeFrom+1))*450;
    if(d.refs.world&&s.common.world.enabled)length+=s.common.world.value.length;
    if(d.refs.character)length+=Object.entries(s.characterProfiles||{}).filter(([n])=>!d.character||n===d.character).reduce((v,[,body])=>v+body.length,0);
    if(d.refs.user)length+=s.userProfile.length;
    if(d.refs.story)length+=s.storyNotes.length;
    const input=Math.ceil(length/2.2)+100,thought=estimateThinkingTokens(s.model,s.thinkingLevel,1);
    const cost=estimateBill(s.model,input,d.outputCap+thought);
    return `<div class="free-estimate"><span>예상 입력 약 ${fmtNumber(input)}토큰 · 출력 상한 ${fmtNumber(d.outputCap)}토큰</span><b>${priced(cost,s.krwPerUsd)}</b><small>실제 사용량과 비용은 달라질 수 있어.</small></div>`;
  }
  function freeArchiveList(){
    const items=currentEntries();
    return `<div class="card"><div class="section-header"><b>보관된 자유 생성 · ${items.length}개</b></div><div class="archive">${items.slice(0,state.archiveLimit).map(r=>`<div class="archive-row ${currentRecord()?.id===r.id?'selected':''}"><button data-act="record" data-id="${esc(r.id)}"><b>${text(r.payload?.title||'자유 생성',85)}</b><small>${fmtDate(r.createdAt)} · ${text(r.rangeLabel,35)}</small></button><button class="button slim ghost" data-act="single-delete" data-id="${esc(r.id)}">삭제</button></div>`).join('')||'<div class="subtle">생성한 글이 없어.</div>'}${items.length>state.archiveLimit?`<button class="button slim" data-act="archive-more">더 보기 (${items.length-state.archiveLimit}개)</button>`:''}</div></div>`;
  }
  function freePreview(){
    const r=currentRecord();
    if(!r)return `<div class="preview"><div class="empty"><b>생성 결과가 없어</b><p>왼쪽에서 프롬프트를 작성하고 생성해 줘.</p></div></div>`;
    return `<div class="preview free-preview">${titleline(r.payload?.title||'자유 생성',`<span class="pill">${fmtDate(r.createdAt)}${usageSummary(r)}</span>`)}<article class="free-output-text">${textFull(r.payload?.body||'')}</article></div>`;
  }
  function freePage(){
    const d=state.settings.freeDraft,noRecord=!currentRecord();
    const tabletControls=state.tabletPane==='controls'||noRecord;
    const refs=[['rp','RP 대화'],['world','세계관'],['character','캐릭터 정보'],['user','유저 프로필'],['story','중요 서사']];
    const people=[...new Set([...state.settings.characters,...Object.keys(state.settings.characterProfiles||{})])];
    return `<div class="free-page"><div class="tablet-view-switch" role="group" aria-label="태블릿 화면 전환"><button class="button slim ${!tabletControls?'primary':''}" data-act="tablet-pane" data-pane="viewer" ${noRecord?'disabled':''}>▣ 결과 열람</button><button class="button slim ${tabletControls?'primary':''}" data-act="tablet-pane" data-pane="controls">⚙ 생성 설정</button></div>
      <div class="viewer-layout free-layout ${state.focused?'focused':''} ${tabletControls?'tablet-controls':'tablet-reader'} ${noRecord?'no-record':''}">
        <div class="controls stack"><div class="reader-controls-heading"><h3>✎ 자유 생성</h3></div>
          <div class="card stack free-form">
            <label class="field"><span>제목 (선택)</span><input data-field="freeTitle" maxlength="120" value="${esc(d.title)}" placeholder="결과 제목"></label>
            <label class="field"><span>내 프롬프트</span><textarea data-field="freePrompt" rows="10" maxlength="120000" placeholder="원하는 주제, 문체, 형식, AU 설정 등을 자유롭게 입력">${text(d.prompt,120000)}</textarea></label>
            <div class="free-ref-head"><b>참고 자료</b><small>선택한 항목만 포함</small></div>
            <div class="free-ref-list">${refs.map(([id,label])=>`<label class="free-ref-item"><input type="checkbox" data-field="freeRef" data-ref="${id}" ${d.refs[id]?'checked':''}> ${label}</label>`).join('')}</div>
            ${d.refs.character?`<label class="field"><span>참고할 캐릭터</span><select data-field="freeCharacter"><option value="">등록된 캐릭터 전체</option>${people.map(n=>`<option value="${esc(n)}" ${d.character===n?'selected':''}>${text(n,60)}</option>`).join('')}</select></label>`:''}
            ${d.refs.rp?`<div class="free-range"><div class="row"><label class="toggle"><input type="radio" name="free-range" data-field="freeRangeMode" value="recent" ${d.rangeMode==='recent'?'checked':''}> 최근 N턴</label><label class="toggle"><input type="radio" name="free-range" data-field="freeRangeMode" value="range" ${d.rangeMode==='range'?'checked':''}> 시작~끝 턴</label></div>${d.rangeMode==='recent'?`<label class="field"><span>읽을 최근 RP 턴 수</span><input type="number" data-field="freeRecentTurns" min="1" max="2000" value="${d.recentTurns}"></label>`:`<div class="row free-range-pair"><label class="field"><span>시작 턴</span><input type="number" data-field="freeRangeFrom" min="1" max="2000" value="${d.rangeFrom}"></label><label class="field"><span>끝 턴</span><input type="number" data-field="freeRangeTo" min="1" max="2000" value="${d.rangeTo}"></label></div>`}</div>`:''}
            <label class="field"><span>출력 길이 (상한)</span><select data-field="freeOutputCap">${FREE_CAPS.map(([n,label])=>`<option value="${n}" ${d.outputCap===n?'selected':''}>${label}</option>`).join('')}</select></label>
            ${freeEstimate()}<button class="button primary" data-act="free-generate" ${state.busy?'disabled':''}>✦ 텍스트 생성하고 기록에 저장</button>
            ${state.busy?`<div class="status"><span class="spinning">◌</span><span data-status>${text(state.status,180)}</span></div>`:''}</div>
          <div class="card stack"><h4>프롬프트 프리셋</h4>
            <label class="field"><span>저장된 프리셋 (모든 방 공용)</span><select data-field="freePresetSelect"><option value="">선택</option>${[...state.freePresets].sort((a,b)=>a.name.localeCompare(b.name,'ko-KR')).map(p=>`<option value="${esc(p.id)}" ${p.id===state.freePresetSelection?'selected':''}>${text(p.name,80)}</option>`).join('')}</select></label>
            <label class="field"><span>프리셋 이름</span><input data-field="freePresetName" maxlength="70" value="${esc(state.freePresetName)}" placeholder="예: 현대 AU"></label>
            <div class="row"><button class="button slim" data-act="free-preset-load" ${!selectedFreePreset()?'disabled':''}>불러오기</button><button class="button slim primary" data-act="free-preset-save">현재 프롬프트 저장</button><button class="button slim ghost" data-act="free-preset-delete" ${!selectedFreePreset()?'disabled':''}>삭제</button></div>
            <p class="subtle">제목과 프롬프트만 저장. 참고 자료·RP 범위는 현재 방의 선택값 유지.</p></div>
          ${freeArchiveList()}
        </div>
        <div class="stage"><button type="button" class="preview-focus-btn" data-act="focus" aria-label="${state.focused?'설정 다시 표시':'결과 크게 보기'}" title="${state.focused?'설정 다시 표시':'결과 크게 보기'}">${state.focused?'↙':'⛶'}</button>${freePreview()}</div></div>
      <div class="viewer-export-footer free-export-footer"><button class="button slim ghost" data-act="free-copy" ${noRecord?'disabled':''}>복사</button><button class="button slim ghost" data-act="free-txt" ${noRecord?'disabled':''}>TXT 저장</button><button class="button slim ghost" data-act="export-png" ${noRecord?'disabled':''}>PNG 저장</button></div></div>`;
  }
  function freePromptWithRefs(prompt,refs){
    const chunks=[];
    if(refs.rp?.content)chunks.push(`[RP 대화 · ${refs.rp.label}]\n${refs.rp.content}`);
    if(String(refs.world||'').trim())chunks.push(`[세계관]\n${refs.world}`);
    for(const [name,body] of refs.characters||[])chunks.push(`[캐릭터 정보 · ${name}]\n${body}`);
    if(String(refs.user||'').trim())chunks.push(`[유저 캐릭터 프로필]\n${refs.user}`);
    if(String(refs.story||'').trim())chunks.push(`[중요 서사]\n${refs.story}`);
    return chunks.length?`[내 프롬프트]\n${prompt}\n\n[선택한 참고 자료]\n${chunks.join('\n\n')}\n\n내 프롬프트가 참고 자료와 충돌하면 내 프롬프트의 AU·변형 설정을 우선한다.`:prompt;
  }
  async function generateFree(){
    if(state.busy)return;
    if(!state.room)return flash('먼저 RP 채팅방을 열어 줘.');
    if(!state.key.trim()){state.tab='settings';render();return flash('Gemini API 키를 먼저 설정해 줘.');}
    const d=normalizeFreeDraft(state.settings.freeDraft);
    if(!d.prompt.trim())return flash('자유 프롬프트를 먼저 입력해 줘.');
    const s=structuredClone(state.settings),room=state.room,apiKey=state.key.trim();
    setBusy(true,'자유 생성 준비 중');
    try{
      let rp=null;
      if(d.refs.rp)rp=await readConversation(room,d.rangeMode,d.rangeFrom,d.rangeMode==='recent'?d.recentTurns:d.rangeTo,setStatus,s.userName);
      const content=freePromptWithRefs(d.prompt,{
        rp:d.refs.rp?rp:null,world:d.refs.world&&s.common.world.enabled?s.common.world.value:'',
        characters:d.refs.character?Object.entries(s.characterProfiles||{}).filter(([name,body])=>(!d.character||name===d.character)&&String(body||'').trim()):[],
        user:d.refs.user?s.userProfile:'',story:d.refs.story?s.storyNotes:''});
      setStatus('자유 텍스트 생성 중');
      const generated=await geminiFreeText(content,s.model,apiKey,d.outputCap,s.thinkingLevel,(next,total,delay)=>setStatus(`HTTP 500 재시도 ${next}/${total} · ${delay/1000}초 후`));
      const usage=generated.usage||{};
      const billUsd=integer(usage.totalTokenCount)>0?estimateBill(s.model,integer(usage.promptTokenCount),integer(usage.candidatesTokenCount)+integer(usage.thoughtsTokenCount)):null;
      const title=d.title.trim()||d.prompt.trim().split('\n')[0].slice(0,55)||'자유 생성';
      const record={id:uid(),room,kind:'free',person:'',createdAt:Date.now(),rangeLabel:rp?.label||'RP 미참고',
        payload:{title,body:generated.text,prompt:d.prompt,refs:d.refs},model:s.model,thinkingLevel:s.thinkingLevel,usage,billUsd,requestCount:1,warnings:[]};
      await putRecord(record);
      if(state.room===room){state.entries.unshift(record);if(state.type==='free'){state.selectedRecord=record.id;state.tabletPane='viewer';}}
      render();flash('자유 생성 결과를 기록에 저장했어.',7000);
    }catch(e){showError(e);}finally{setBusy(false);}
  }
  async function copyFreeText(){
    const body=String(currentRecord()?.payload?.body||'');
    if(!body)return flash('복사할 텍스트가 없어.');
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(body);
      else{const area=document.createElement('textarea');area.value=body;area.style.cssText='position:fixed;left:-99999px;top:0;';document.body.append(area);area.select();try{if(!document.execCommand('copy'))throw Error('복사 실패');}finally{area.remove();}}
      flash('텍스트를 복사했어.');
    }catch(e){showError(new Error('클립보드에 복사하지 못했어. 브라우저 권한을 확인해 줘.'));}
  }
  function saveFreeTxt(){
    const r=currentRecord();if(!r)return;
    const name=String(r.payload?.title||'자유 생성').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,65);
    const blob=new Blob([String(r.payload?.body||'')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob);
    try{const a=document.createElement('a');a.href=url;a.download=`${name||'자유 생성'}_${new Date(r.createdAt).toISOString().slice(0,10)}.txt`;document.body.append(a);a.click();a.remove();flash('TXT 저장을 시작했어.');}
    finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
  }

  function viewerPage() {
    // Tablet: choose between the reader and generation/archive controls without
    // forcing the reader to sit below several screens of settings.
    const empty=!currentRecord();
    const tabletControls=state.tabletPane==='controls'||empty;
    return `<div class="tablet-view-switch" role="group" aria-label="태블릿 화면 전환"><button class="button slim ${!tabletControls?'primary':''}" data-act="tablet-pane" data-pane="viewer" ${empty?'disabled':''} aria-pressed="${!tabletControls}">▣ 열람 화면</button><button class="button slim ${tabletControls?'primary':''}" data-act="tablet-pane" data-pane="controls" aria-pressed="${tabletControls}">⚙ 생성·보관 기록</button>${!tabletControls?`<div class="tablet-reader-theme">${themePicker(state.type)}</div>`:''}</div>
      <div class="viewer-layout ${state.focused?'focused':''} ${tabletControls?'tablet-controls':'tablet-reader'} ${empty?'no-record':''}"><div class="controls stack"><div class="reader-controls-heading"><h3 title="${text(typeOf(state.type).label,70)}">${typeOf(state.type).icon} ${typeOf(state.type).label}</h3>${themePicker(state.type)}</div>${characterPicker()}${generatorControls()}${archiveList()}</div><div class="stage"><button type="button" class="preview-focus-btn" data-act="focus" aria-label="${state.focused?'생성 설정 다시 표시':'열람 화면 크게 보기'}" title="${state.focused?'생성 설정 다시 표시':'열람 화면 크게 보기'}" aria-pressed="${state.focused}">${state.focused?'↙':'⛶'}</button>${preview()}</div></div>
      <div class="viewer-export-footer"><button class="button slim ghost" data-act="export-png" ${empty?'disabled':''} title="현재 열람 화면을 PNG로 저장">▧ PNG 저장</button></div>`;
  }
  // 상세 화면 본문에는 미리보기용 글자 수 제한을 적용하지 않는다.
  const textFull = x => esc(String(x ?? ''));
  const normalText = s => `<div class="paragraph">${textFull(s)}</div>`;
  const titleline = (a,b='') => `<div class="preview-title"><b>${text(a,70)}</b>${b}</div>`;
  const back = (to='home', label='‹ 뒤로') => `<button class="web-btn" data-act="back" data-to="${to}">${label}</button>`;
  function phoneView(data, theme=currentTheme('phone')) {
    const apps = [
      ['messages','✉','메시지','message'], ['calls','☎','전화','calls'],
      ['searches','◎','브라우저','browser'], ['notes','▤','메모','notes'],
      ['social','▣','소셜','social'], ['photos','▦','사진','photos']
    ];
    const app=state.view;
    const time=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
    const avatar=(name)=>`<span class="ios-avatar">${text(String(name||'?').slice(0,1))}</span>`;
    const dock=['messages','calls','searches','photos'];
    const nav=`<button type="button" class="ios-homebar" data-act="view" data-view="home" title="홈 화면"></button>`;
    let inside='';
    if(app==='home') {
      inside=`<div class="ios-homescreen"><div class="ios-wallpaper"><div class="ios-orb one"></div><div class="ios-orb two"></div></div>
        <div class="ios-widget"><div class="ios-widget-date">${new Date().toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'})}</div><div class="ios-widget-time">${time}</div><div class="ios-widget-caption">${text(data.wallpaper||data.owner||'오늘의 기록',110)}</div></div>
        <div class="ios-apps">${apps.map(([key,ico,name,theme])=>`<button class="ios-app" data-act="view" data-view="${key}"><span class="ios-app-icon ${theme}">${ico}</span><span>${name}</span></button>`).join('')}</div>
        <div class="ios-dock">${dock.map(key=>{const a=apps.find(x=>x[0]===key);return `<button class="ios-app-icon ${a[3]}" data-act="view" data-view="${key}" title="${a[2]}">${a[1]}</button>`}).join('')}</div>
      </div>`;
    } else {
      const heading=apps.find(x=>x[0]===app)?.[2]||'상세 보기';
      const goBack=app==='thread'?'messages':app==='phone-detail'?state.phoneSource:'home';
      let content='';
      if(app==='messages') content=`<div class="ios-pageheading">메시지 <span>${arr(data.messages).length}개의 대화</span></div><div class="ios-searchpill">⌕　대화 검색</div>${arr(data.messages).map((x,i)=>`<button class="ios-row" data-act="viewitem" data-index="${i}">${avatar(x.person)}<span class="ios-row-main"><b>${text(x.person,50)}${x.unread?'<span class="ios-unread"></span>':''}</b><small>${text(arr(x.thread).at(-1)?.text||'',90)}</small></span><span class="ios-row-date">${text(x.time,22)}　›</span></button>`).join('')}`;
      if(app==='calls') content=`<div class="ios-pageheading">최근 통화</div>${arr(data.calls).map(x=>`<div class="ios-row">${avatar(x.name)}<span class="ios-row-main"><b>${text(x.name,50)}</b><small>${text(x.kind,45)}</small></span><span class="ios-row-date">${text(x.time,28)}</span></div>`).join('')}`;
      if(app==='searches') content=`<div class="ios-pageheading">방문 및 검색 기록</div><div class="ios-searchpill">⌕　검색 및 방문 기록</div>${arr(data.searches).map(x=>`<div class="ios-row"><span class="ios-history-icon">⌕</span><span class="ios-row-main"><b>${text(x,180)}</b><small>검색한 내용</small></span></div>`).join('')}`;
      if(app==='notes') content=`<div class="ios-pageheading">메모 <span>${arr(data.notes).length}개</span></div>${arr(data.notes).map((x,i)=>`<button class="ios-row" data-act="phoneitem" data-index="${i}" data-source="notes"><span class="ios-notes-dot">▤</span><span class="ios-row-main"><b>${text(x.title,90)}</b><small>${text(x.body,130)}</small></span><span class="ios-row-date">›</span></button>`).join('')}`;
      if(app==='social') content=`<div class="ios-pageheading">소셜 피드</div>${arr(data.social).map(x=>`<article class="ios-post"><div class="ios-post-author">${avatar(x.handle)}<span><b>@${text(x.handle,60)}</b><small>${text(x.time,70)}</small></span></div><p>${textFull(x.text)}</p><div class="ios-engagement">♡ ${integer(x.likes)}　 ·　 ${arr(x.comments).length}개 댓글</div>${arr(x.comments).map(c=>`<div class="ios-post-reply"><b>${text(c.by,60)}</b> ${textFull(c.text)}</div>`).join('')}</article>`).join('')}`;
      if(app==='photos') content=`<div class="ios-pageheading">모든 사진 <span>${arr(data.photos).length}장</span></div><div class="ios-photos">${arr(data.photos).map((x,i)=>`<button class="ios-photo" data-act="phoneitem" data-source="photos" data-index="${i}"><span>${text(x.emoji||'▣',6)}</span></button>`).join('')}</div>`;
      if(app==='phone-detail') {const photo=state.phoneSource==='photos';const item=arr(data[photo?'photos':'notes'])[state.subIndex]||{};content=photo?`<div class="ios-bigphoto">${text(item.emoji||'▣',6)}</div><div class="ios-document"><h3>${text(item.caption,220)}</h3><small>${text(item.date,55)}</small></div>`:`<div class="ios-document"><h2>${text(item.title,120)}</h2>${normalText(item.body,15000)}</div>`;}
      if(app==='thread'){const t=arr(data.messages)[state.subIndex]||{};content=`<div class="ios-contact">${avatar(t.person)}<b>${text(t.person,50)}</b><small>메시지 대화</small></div><div class="ios-bubbles">${arr(t.thread).map(m=>`<div class="ios-message ${m.from==='me'?'out':'in'}"><span>${textFull(m.text)}</span><small>${text(m.time,30)}</small></div>`).join('')}</div>`;}
      if(!content.trim()) content='<div class="ios-empty">저장된 기록이 없어.</div>';
      inside=`<div class="ios-appscreen"><div class="ios-navbar"><button data-act="back" data-to="${goBack}" class="ios-back">‹ <span>뒤로</span></button><b>${text(app==='thread'?arr(data.messages)[state.subIndex]?.person:app==='phone-detail'?'상세 기록':heading,75)}</b><span class="ios-navend">•••</span></div><div class="ios-scroll">${content}</div></div>`;
    }
    const modern = `<div class="iphone"><div class="phone-screen"><div class="ios-status"><span>${time}</span><div class="ios-island"></div><span class="ios-signal">▂▄▆　◉　▰</span></div>${inside}${nav}</div></div>`;
    if(theme!=='modern') return phoneAltView(data, theme);
    return modern;
  }
  function diaryView(data, theme=currentTheme('diary')) {
    // 생성 기록 한 건에는 하루치 일기 한 편만 저장한다.
    // 여러 날의 일기는 왼쪽 '보관된 일기장 기록'에서 기록별로 선택한다.
    const chosen=arr(data.entries)[0]||{};
    if(theme==='modern-note') return `<div class="diary-alt modern-note"><div class="diary-alt-head"><b>${text(data.owner||'누군가',70)}</b></div><div class="diary-alt-paper"><div class="diary-alt-meta"><span>${text(chosen.date||'',65)}</span><span>${text(chosen.weather||'',40)}</span><span>${text(chosen.mood||'평범함',60)}</span></div><h2>${text(chosen.title||'오늘의 기록',180)}</h2><div class="diary-alt-body">${textFull(chosen.body||'')}</div><div class="diary-sign">${text(data.owner||'',60)}</div></div></div>`;
    if(theme==='classic-paper') return `<div class="diary-alt classic-paper"><div class="diary-alt-head"><b>${text(data.owner||'누군가',70)}</b></div><div class="diary-alt-paper"><div class="diary-alt-meta"><span>${text(chosen.date||'',65)}</span><span>${text(chosen.weather||'',40)}</span></div><h2>${text(chosen.title||'그날의 기록',180)}</h2><div class="diary-alt-body">${textFull(chosen.body||'')}</div><div class="diary-sign">${text(data.owner||'',60)}</div></div></div>`;
    if(theme==='fantasy-parchment') return `<div class="diary-alt fantasy-parchment"><div class="diary-alt-head"><b>${text(data.owner||'누군가',70)}</b></div><div class="diary-alt-paper"><div class="diary-alt-meta"><span>${text(chosen.date||'',65)}</span><span>${text(chosen.weather||'',40)}</span><span>${text(chosen.mood||'평범함',60)}</span></div><h2>${text(chosen.title||'그날의 기록',180)}</h2><div class="diary-alt-body">${textFull(chosen.body||'')}</div><div class="diary-sign">${text(data.owner||'',60)}</div></div></div>`;
    return `<div class="diary-book"><div class="diary-cover"><div class="diary-deco">✿　✾　✿</div><h2>${text(data.owner||'누군가',70)}의 일기장</h2></div><div class="diary-layout"><main class="diary-sheet"><span class="diary-sheet-date">${text(chosen.date||'',65)}${chosen.weather?' · '+text(chosen.weather,40):''}</span><h3>${text(chosen.title||'그날의 기록',170)}</h3><div class="diary-mood">그날의 기분　${text(chosen.mood||'평범함',65)}</div><div class="diary-handwriting">${textFull(chosen.body||'')}</div><div class="diary-sign">${text(data.owner||'',60)}</div></main></div></div>`;
  }
  function pcView(data, theme=currentTheme('pc')) {
    const apps=[['folders','📁','파일 탐색기'],['emails','✉','메일'],['browser','◉','인터넷'],['notes','▤','나의 문서']];
    const view=state.view, file=arr(data.folders)[state.subIndex], mail=arr(data.emails)[state.subIndex]||{};
    const browsing=arr(data.browser),page=browsing[state.subIndex]||{}, documentItem=arr(data.notes)[state.subIndex]||{};
    const open=view!=='home';
    const cmd=(label)=>`<button class="pc-navbtn" data-act="back" data-to="${label}">←</button>`;
    let content='', winName='';
    if(view==='folders'||view==='files'||view==='detail'&&state.subIndex2===3) {
      winName='파일 탐색기';
      const folderView=view==='folders',filesView=view==='files', fileItem=arr(file?.files)[state.fileIndex||0]||{};
      content=`<div class="pc-explorer-bar">${folderView?'⌂　내 PC':filesView?'⌂　내 PC　›　'+text(file?.name||'',80):'⌂　내 PC　›　'+text(file?.name||'',80)+'　›　'+text(fileItem.title||'',80)}</div>`+
        (folderView?`<div class="pc-file-grid">${arr(data.folders).map((f,i)=>`<button data-act="pcitem" data-index="${i}"><span>📁</span><b>${text(f.name,85)}</b><small>${arr(f.files).length}개 항목</small></button>`).join('')}</div>`:
        filesView?`${cmd('folders')}<div class="pc-file-list"><div class="pc-file-label">이름 <span>수정한 날짜</span></div>${arr(file?.files).map((f,i)=>`<button data-act="pcitem" data-index="${i}"><span>📄</span><b>${text(f.title,120)}</b><small>${text(f.date,45)}</small></button>`).join('')}</div>`:
        `${cmd('files')}<div class="pc-file-doc"><h3>${text(fileItem.title,200)}</h3><p>${text(fileItem.date,55)}</p>${normalText(fileItem.body,18000)}</div>`);
    } else if(view==='emails'||view==='mail-detail') {
      winName='메일';
      const folder=state.pcMailFolder||'inbox';
      const visible=arr(data.emails).map((m,i)=>({...m,__idx:i})).filter(m=>folder==='all'||folder==='starred'&&m.starred||folder==='sent'&&m.from===data.owner||folder==='inbox'&&m.from!==data.owner);
      content=`<div class="pc-mail"><aside class="pc-mail-side"><b>✉ 우편함</b>${[['inbox','받은편지함'],['sent','보낸편지함'],['starred','중요편지함'],['all','전체메일']].map(([id,label])=>`<button class="${folder===id?'active':''}" data-act="mail-folder" data-folder="${id}">${label} <span>${id==='all'?arr(data.emails).length:id==='inbox'?arr(data.emails).filter(m=>m.from!==data.owner).length:id==='sent'?arr(data.emails).filter(m=>m.from===data.owner).length:arr(data.emails).filter(m=>m.starred).length}</span></button>`).join('')}</aside><section class="pc-mail-main"><div class="pc-mail-toolbar">${view==='mail-detail'?`<button data-act="back" data-to="emails">← 메일 목록</button>`:'<b>메일 목록</b>'}</div>${view==='mail-detail'?`<div class="pc-mail-detail"><h2>${text(mail.subject,220)}</h2><div class="pc-mail-meta"><div class="pc-mail-avatar">${text(String(mail.from||'?')[0])}</div><div><b>${text(mail.from||'보낸 사람',110)}</b><small>받는 사람: ${text(mail.to||data.owner||'',90)}</small></div><time>${text(mail.date,75)}</time></div><div class="pc-mail-message">${textFull(mail.body)}</div></div>`:`<div class="pc-mail-list">${visible.map(m=>`<button data-act="pcitem" data-index="${m.__idx}"><span class="pc-mail-star">${m.starred?'★':'☆'}</span><b>${text(m.from||'',90)}</b><span class="pc-mail-subject">${text(m.subject,120)}<small>　${text(m.body,80)}</small></span><time>${text(m.date,55)}</time></button>`).join('')||'<p class="pc-placeholder">이 폴더에는 메일이 없어.</p>'}</div>`}</section></div>`;
    } else if(view==='browser'||view==='browser-page') {
      winName='인터넷 브라우저';
      const query=state.pcBrowserQuery.toLocaleLowerCase('ko-KR').trim();
      const history=browsing.map((x,i)=>({...x,__idx:i})).filter(x=>!query||[x.title,x.url,x.summary,x.query].join(' ').toLocaleLowerCase('ko-KR').includes(query));
      content=`<div class="pc-browser"><div class="pc-browser-tabs"><span class="active">◉ ${view==='browser-page'?text(page.title,60):'방문 기록'}</span><span class="pc-plus">＋</span></div><div class="pc-browser-toolbar"><button data-act="back" data-to="browser">←</button><button data-act="back" data-to="browser">↻</button><div class="pc-url">⌕　${view==='browser-page'?text(page.url||'방문한 페이지',190):'chrome://history'}</div><span>☆　⋮</span></div>${view==='browser-page'?`<div class="pc-webpage"><div class="pc-webpage-address">${text(page.url||'',220)}</div><h2>${text(page.title,220)}</h2><div class="pc-webpage-body">${textFull(page.summary||'내용이 없습니다.')}</div><button data-act="back" data-to="browser">◂ 검색·방문 기록으로</button></div>`:`<div class="pc-history"><div class="pc-history-heading"><span>◷</span><div><h2>방문 기록</h2><p>이 기기에 남아 있는 검색 및 방문 기록</p></div></div><div class="pc-history-search">⌕　<input data-field="pcBrowserSearch" value="${esc(state.pcBrowserQuery)}" placeholder="방문 사이트 또는 검색어 검색"></div><b>방문한 사이트</b>${history.map(h=>`<button class="pc-history-row" data-act="pcitem" data-index="${h.__idx}"><span class="pc-history-ico">◉</span><div><strong>${text(h.title||'제목 없음',140)}</strong><small>${text(h.query?'검색어: '+h.query:(h.url||''),160)}</small></div><span>›</span></button>`).join('')||'<p class="pc-placeholder">검색 결과가 없어.</p>'}</div>`}</div>`;
    } else if(view==='notes'||view==='note-detail') {
      winName='문서';
      content=view==='notes'?`<div class="pc-notes"><div class="pc-notes-head"><span>▤</span><div><h2>나의 문서</h2><small>이 컴퓨터에 저장된 개인 문서</small></div></div><div class="pc-file-list pc-notes-list">${arr(data.notes).map((n,i)=>`<button data-act="pcitem" data-index="${i}"><span>▤</span><b>${text(n.title,140)}</b><small>문서</small></button>`).join('')}</div></div>`:
      `<div class="pc-file-doc">${cmd('notes')}<h2>${text(documentItem.title,200)}</h2>${normalText(documentItem.body,20000)}</div>`;
    }
    const modern = `<div class="monitor"><div class="desktop"><div class="desktop-icons">${apps.map(([id,icon,name])=>`<button class="desktop-icon" data-act="view" data-view="${id}"><i>${icon}</i>${name}</button>`).join('')}</div>${open?`<div class="desktop-window pc-app-window"><div class="desktop-window-title pc-window-title"><span class="pc-win-icon">${winName==='메일'?'✉':winName==='인터넷 브라우저'?'◉':'▤'}</span><b>${winName}</b><div class="pc-window-buttons"><span>─</span><span>□</span><button data-act="back" data-to="home" aria-label="창 닫기">✕</button></div></div><div class="pc-window-content">${content}</div></div>`:''}</div><div class="desktop-taskbar"><button data-act="back" data-to="home">▦</button><div>${apps.map(([id,icon,name])=>`<button data-act="view" data-view="${id}" title="${name}">${icon}</button>`).join('')}</div><span>${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</span></div></div><div class="monitor-stand"></div>`;
    if(theme!=='modern') return pcAltView(data, theme);
    return modern;
  }
  // Fictional community with gallery, dense post list and reader, without any real site's identity.
  function boardView(d, theme=currentTheme('board')) {
    const sections=arr(d.sections), section=sections[state.subIndex]||{}, posts=arr(section.posts), post=posts[state.subIndex2]||{};
    if(theme!=='modern') return boardAltView(d, theme);
    const links=sections.slice(0,9).map((g,i)=>`<button data-act="section" data-index="${i}" class="fb-shortcut ${state.view!=='home'&&state.subIndex===i?'active':''}">${text(g.name,70)} <small>${arr(g.posts).length}</small></button>`).join('');
    const nav=`<div class="fb-identity"><div class="fb-logo"><span class="fb-logo-blue">디씨</span><span class="fb-logo-dark">인사이더</span><small>dc insider</small></div><div class="fb-fakesearch"><span>⌕</span> 통합검색 · 갤러리 / 게시글</div></div><div class="fb-menubar"><span>갤러리</span><span>마이너갤러리</span><span>미니갤러리</span><span>실시간 베스트</span><span>힛갤</span></div>`;
    const side=`<aside class="fb-side"><div class="fb-side-title">▤ 갤러리 바로가기</div>${links||'<p>게시판이 없어.</p>'}</aside>`;
    let content='';
    if(state.view==='detail') {
      content=`<div class="fb-breadcrumb"><button data-act="back" data-to="home">전체 갤러리</button> › <button data-act="back" data-to="posts">${text(section.name,70)}</button> › 게시글</div><div class="fb-titleline"><div><h2>${text(section.name||'이름 없는 갤러리',100)}</h2><small>갤러리</small></div><button data-act="back" data-to="posts">목록</button></div><div class="fb-article"><div class="fb-article-title"><span class="fb-post-label">일반</span><h1>${text(post.title,350)}</h1></div><div class="fb-article-meta"><b>${text(post.author||'ㅇㅇ',70)}</b><span>${text(post.time||'',70)}</span><span>조회 ${integer(post.views)}</span><span>추천 ${integer(post.likes)}</span></div><div class="fb-article-body">${normalText(post.body,30000)}</div><div class="fb-recommend"><span>▲</span><strong>${integer(post.likes)}</strong><small>추천</small></div><section class="fb-discussion"><h3>댓글 <span>${arr(post.comments).length}</span></h3>${arr(post.comments).map((c,i)=>`<div class="fb-comment"><span class="fb-cavatar">${i%3===0?'ㅇㅇ':'◉'}</span><div><strong>${text(c.author||'ㅇㅇ',85)}</strong><p>${textFull(c.text)}</p></div><small>#${i+1}</small></div>`).join('')||'<p class="fb-noitems">아직 댓글이 없어.</p>'}</section><div class="fb-bottom"><button data-act="back" data-to="posts">‹ 글 목록으로 돌아가기</button></div></div>`;
    }else if(state.view==='posts'){
      content=`<div class="fb-breadcrumb"><button data-act="back" data-to="home">전체 갤러리</button> › ${text(section.name,110)}</div><div class="fb-titleline"><div><h2>${text(section.name,110)}</h2><small>전체글 ${posts.length}</small></div><button data-act="back" data-to="home">갤러리 목록</button></div><div class="fb-board-bar"><b>전체글</b><span>${posts.length}건</span></div><div class="fb-board-table"><div class="fb-colheads"><span>번호</span><span>제목</span><span>글쓴이</span><span>작성일</span><span>조회</span><span>추천</span></div>${posts.map((p,i)=>`<div class="fb-post-row" data-post-row data-search="${esc((p.title||'')+' '+(p.author||'')+' '+(p.body||''))}"><span class="fb-idx">${posts.length-i}</span><div class="fb-post-name"><button data-act="post" data-index="${i}">${text(p.title,180)}</button><b>[${arr(p.comments).length}]</b></div><span class="fb-user">${text(p.author||'ㅇㅇ',40)}</span><span class="fb-date">${text(p.time,35)}</span><span class="fb-num">${integer(p.views)}</span><span class="fb-num">${integer(p.likes)}</span></div>`).join('')}</div><div class="fb-search"><span>⌕</span><input data-field="boardSearch" value="${esc(state.boardQuery)}" placeholder="제목·작성자·내용 검색"><button data-act="board-clear">초기화</button></div>`;
    }else{
      const hot=sections.flatMap((g,gi)=>arr(g.posts).map((p,pi)=>({...p,gi,pi}))).sort((a,b)=>integer(b.views)-integer(a.views)).slice(0,6);
      content=`<div class="fb-landing"><div class="fb-section-head"><h2>갤러리 둘러보기</h2><span>${sections.length}개 갤러리</span></div><div class="fb-directory">${sections.map((g,i)=>`<button data-act="section" data-index="${i}"><span class="fb-dir-icon">▥</span><div><b>${text(g.name,85)}</b><small>게시글 ${arr(g.posts).length}개</small></div><span>›</span></button>`).join('')}</div><div class="fb-section-head"><h2>지금 많이 읽힌 글</h2></div><div class="fb-hotlist">${hot.map((p,i)=>`<button data-act="board-jump" data-index="${p.gi}" data-post="${p.pi}"><span>${i+1}</span><b>${text(p.title,140)}</b><small>${text(sections[p.gi].name,55)} · 조회 ${integer(p.views)}</small></button>`).join('')}</div></div>`;
    }
    return `<div class="fboard">${nav}<div class="fb-layout"><div class="fb-main">${content}</div>${side}</div></div>`;
  }
  // Fictional news portal: front page, categories, article reading and reader comments.
  function newsView(d, theme=currentTheme('news')) {
    const articles=arr(d.articles), p=articles[state.subIndex]||{}, site=String(d.site||'새벽일보');
    if(theme!=='modern') return newsAltView(d, theme);
    const cats=[...new Set(articles.map(x=>String(x.category||'종합')))].slice(0,12);
    const active=state.newsCategory||'전체';
    const visible=active==='전체'?articles:articles.filter(x=>String(x.category||'종합')===active);
    const mast=`<div class="np-mast"><div class="np-mast-small"></div><div class="np-brand">${text(site,85)}</div><div class="np-mast-line"><span>${text(articles[0]?.date||'오늘',65)}</span></div></div><nav class="np-nav"><button data-act="news-category" data-category="전체" class="${active==='전체'?'on':''}">전체</button>${cats.map(c=>`<button data-act="news-category" data-category="${esc(c)}" class="${active===c?'on':''}">${text(c,30)}</button>`).join('')}</nav>`;
    const sidebar=`<aside class="np-sidebar"><h3>많이 읽힌 기사</h3>${[...articles].slice(0,7).map((v,i)=>`<button data-act="webitem" data-index="${articles.indexOf(v)}"><span>${i+1}</span><div><b>${text(v.title,135)}</b><small>${text(v.category||'종합',40)}</small></div></button>`).join('')}</aside>`;
    let main='';
    if(state.view==='detail') {
      main=`<div class="np-crumb"><button data-act="back" data-to="home">홈</button>　›　${text(p.category||'종합',60)}</div><article class="np-article"><span class="np-category">${text(p.category||'종합',50)}</span><h1>${text(p.title,320)}</h1><p class="np-deck">${text(p.lede,1700)}</p><div class="np-byline"><span>${text(p.author||'취재부',80)} 기자</span><time>${text(p.date||'',90)}</time></div><div class="np-article-body">${normalText(p.body,30000)}</div><div class="np-comments"><h3>독자 의견 <span>${arr(p.comments).length}</span></h3>${arr(p.comments).map(c=>`<div class="np-comment"><b>${text(c.author||'독자',65)}</b><p>${textFull(c.text)}</p></div>`).join('')||'<p>등록된 의견이 없습니다.</p>'}</div><button class="np-back" data-act="back" data-to="home">‹ 뉴스 목록으로</button></article>`;
    } else {
      const [lead,...rest]=visible;
      main=`<div class="np-topsection"><b>${active==='전체'?'주요 뉴스':text(active,70)}</b></div>${lead?`<button class="np-hero" data-act="webitem" data-index="${articles.indexOf(lead)}"><div class="np-hero-art"><span>${text(lead.category||'종합',40)}</span><strong>현장<br>보도</strong></div><div class="np-hero-copy"><span class="np-category">오늘의 주요 보도</span><h2>${text(lead.title,260)}</h2><p>${text(lead.lede||lead.body,600)}</p><small>${text(lead.author,65)}　·　${text(lead.date,65)}</small></div></button>`:''}<div class="np-topsection"><b>전체 기사</b><span>${visible.length}건</span></div><div class="np-newslist">${rest.map((v,i)=>`<button class="np-newsrow" data-act="webitem" data-index="${articles.indexOf(v)}"><div><span class="np-category">${text(v.category||'종합',55)}</span><h3>${text(v.title,210)}</h3><p>${text(v.lede||v.body,290)}</p><small>${text(v.author||'취재부',55)}　·　${text(v.date,55)}</small></div><div class="np-thumb"><b>${String(i+1).padStart(2,'0')}</b><span>기사</span></div></button>`).join('')}</div>`;
    }
    return `<div class="newsportal">${mast}<div class="np-grid"><main class="np-main">${main}</main>${sidebar}</div></div>`;
  }
  function webPreview(kind, d, theme=currentTheme(kind)) {
    if(kind==='board')return boardView(d, theme);
    if(kind==='news')return newsView(d, theme);
    if(kind==='wiki')return wikiView(d, theme);
    return '';
  }
  function wikiView(d, theme=currentTheme('wiki')) {
    const docs=arr(d.docs), site=d.site||'모아위키';
    const selected=docs[state.subIndex]||docs[0]||{};
    const detail=state.view==='detail';
    const tab=state.wikiTab;
    const results=docs.filter(x=>(x.title||'').toLocaleLowerCase('ko-KR').includes(state.wikiQuery.toLocaleLowerCase('ko-KR').trim()));
    const sidebar=docs.slice(0,26).map((doc,i)=>`<button class="wiki-side-link ${detail&&state.subIndex===i?'active':''}" data-act="webitem" data-index="${i}">${text(doc.title,65)}</button>`).join('');
    const docText=detail?`<div class="wiki-article"><div class="wiki-title"><h1>${text(selected.title,160)}</h1></div>
      <div class="wiki-tabs"><button data-act="wiki-tab" data-tab="article" class="${tab==='article'?'selected':''}">문서</button><button data-act="wiki-tab" data-tab="discussion" class="${tab==='discussion'?'selected':''}">토론 <small>${arr(selected.discussion).length}</small></button></div>
      ${tab==='article'?`<div class="wiki-article-content"><p class="wiki-summary">${textFull(selected.summary||'')}</p><div class="wiki-toc"><b>목차</b>${arr(selected.sections).map((section,i)=>`<button data-act="wiki-jump" data-index="${i}">${i+1}. ${text(section.heading,90)}</button>`).join('')}</div>${arr(selected.sections).map((section,i)=>`<section class="wiki-section" data-wiki-section="${i}"><h2><span>${i+1}.</span> ${text(section.heading,180)}</h2>${normalText(section.body,16000)}</section>`).join('')}</div>`:`<div class="wiki-discussion"><h2>문서 토론</h2><p>이 문서에 관해 기록된 편집자들의 토론이야.</p>${arr(selected.discussion).map((c,i)=>`<div class="wiki-talk"><div><b>#${i+1} ${text(c.author||'익명',80)}</b><small>편집자</small></div><p>${text(c.text,2500)}</p></div>`).join('')||'<p>토론 기록이 없어.</p>'}</div>`}</div>`
      :`<div class="wiki-landing"><h2>최근 문서 <small>${results.length}개</small></h2>${results.map((doc)=>{const i=docs.indexOf(doc);return `<button data-act="webitem" data-index="${i}" class="wiki-document-row"><span class="wiki-document-icon">▤</span><span><b>${text(doc.title,130)}</b><small>${text(doc.summary,185)}</small></span><span>›</span></button>`}).join('')||'<p>검색 결과가 없어.</p>'}</div>`;
    if(theme!=='modern') return wikiAltView(d, theme);
    return `<div class="wiki-site"><div class="wiki-topbar"><div class="wiki-brand"><b>▥</b><span>${text(site,65)}</span></div><div class="wiki-search"><input data-field="wikiSearch" value="${esc(state.wikiQuery)}" placeholder="문서 제목 검색"><button data-act="wiki-search">⌕</button></div><button class="wiki-toplink" data-act="back" data-to="home">대문</button></div><div class="wiki-layout"><aside class="wiki-sidebar"><b>탐색</b><button data-act="back" data-to="home">⌂　대문</button><div class="wiki-sideline"></div><b>최근 문서</b>${sidebar}</aside><main class="wiki-content">${docText}</main></div></div>`;
  }
  function xView(d, theme=currentTheme('x')) {
    const posts=arr(d.posts),trends=arr(d.trends),filter=state.xFilter;
    const term=state.xQuery.toLocaleLowerCase('ko-KR').trim();
    const match=p=>[p.author,p.handle,p.text].join(' ').toLocaleLowerCase('ko-KR').includes(term);
    const filtered=posts.filter(p=>(!term||match(p))&&(filter==='all'||filter==='popular'&&integer(p.likes)>=20||filter==='latest'));
    if(filter==='popular')filtered.sort((a,b)=>integer(b.likes)-integer(a.likes));
    const avatar=s=>`<div class="x-avatar">${text(String(s||'?').slice(0,1))}</div>`;
    const post=(p,i)=>{
      const open=state.expandedX.has(i),replies=arr(p.replies);
      return `<article class="x-post" data-x-index="${i}"><div class="x-avatar-wrap">${avatar(p.author)}</div><div class="x-post-body"><div class="x-post-head"><b>${text(p.author,90)}</b><span>@${text(p.handle,55)} · ${text(p.time,50)}</span><span class="x-more">···</span></div><p>${textFull(p.text)}</p><div class="x-actions"><button class="x-expand-replies" data-act="x-toggle" data-index="${i}" aria-expanded="${open}" title="답글 ${open?'접기':'펼치기'}"><span>◌</span> ${replies.length}개 답글　${open?'▴':'▾'}</button><span>⇄ ${integer(p.reposts)}</span><span>♡ ${integer(p.likes)}</span><span>⇧</span></div>${open?`<div class="x-replies"><div class="x-replies-head">답글 ${replies.length}개 <button data-act="x-toggle" data-index="${i}">접기　⌃</button></div>${replies.map(r=>`<div class="x-reply">${avatar(r.author)}<div><b>${text(r.author,75)}</b> <small>@${text(r.handle,60)}</small><p>${text(r.text,2000)}</p></div></div>`).join('')||'<p class="x-no-reply">아직 답글이 없어.</p>'}</div>`:''}</div></article>`;
    };
    const center=`<div class="x-feed-head"><div><b>${filter==='popular'?'인기 글':'홈'}</b></div></div><div class="x-feed-tabs"><button data-act="x-filter" data-filter="all" class="${filter==='all'?'active':''}">추천</button><button data-act="x-filter" data-filter="latest" class="${filter==='latest'?'active':''}">최신</button><button data-act="x-filter" data-filter="popular" class="${filter==='popular'?'active':''}">인기</button></div>${filtered.map(p=>post(p,posts.indexOf(p))).join('')||'<div class="x-noresults">일치하는 글이 없어.</div>'}`;
    if(theme!=='modern') return xAltView(d, theme);
    return `<div class="x-site"><aside class="x-nav"><div class="x-symbol" aria-label="𝕏+"><i>𝕏<span>+</span></i></div><button data-act="back" data-to="home">⌂ <span>홈</span></button><button data-act="x-filter" data-filter="popular">⌕ <span>탐색</span></button><button data-act="x-filter" data-filter="latest">◷ <span>최신</span></button></aside><main class="x-timeline">${center}</main><aside class="x-right"><div class="x-searchbox">⌕ <input data-field="xSearch" value="${esc(state.xQuery)}" placeholder="글·계정 검색" /></div><div class="x-trending"><b>지금 화제</b>${trends.map((x,i)=>`<button data-act="x-trend" data-query="${esc(x.tag)}"><small>${i+1} · 화제</small><strong>${text(x.tag,90)}</strong><small>${text(x.count,30)} 게시물</small></button>`).join('')}</div></aside></div>`;
  }
  function comments(x) { return `<div class="web-comments"><b>댓글 · ${arr(x).length}</b>${arr(x).map(c=>`<div class="web-comment"><b>${text(c.author||c.by||'',60)}</b> ${text(c.text,1300)}</div>`).join('')}</div>`; }

  function groupchatView(d, theme=currentTheme('groupchat'), person=state.settings.selectedPerson) {
    const rooms=arr(d.rooms), index=Math.max(0,Math.min(state.subIndex,rooms.length-1)), room=rooms[index]||{};
    const isKakao=theme==='kakao', isClassic=theme==='classic', isFantasy=theme==='fantasy';
    const className=theme==='kakao'?'group-kakao':theme==='neutral'?'group-neutral':theme==='classic'?'group-classic':'group-fantasy';
    const list=rooms.map((r,i)=>`<button class="group-room ${i===index&&state.view==='chat'?'active':''}" data-act="group-room" data-index="${i}"><span class="group-room-avatar">${isFantasy?'✧':isClassic?'✉':'◉'}</span><span class="group-room-copy"><b>${text(r.title||'단체 채팅',100)}</b><small>${arr(r.participants).map(x=>String(x||'')).slice(0,5).map(x=>text(x,25)).join(', ')}</small></span><span class="group-count">${arr(r.messages).length}</span></button>`).join('');
    const messages=arr(room.messages).map((m,i)=>{
      const sender=String(m.sender||'');
      const previousSender=i>0?String(room.messages[i-1]?.sender||''):'';
      const same=sender===previousSender;
      const isMine=sender.trim().replace(/\s+/g,'').toLocaleLowerCase('ko-KR')===String(person||'').trim().replace(/\s+/g,'').toLocaleLowerCase('ko-KR');
      return `<div class="group-message ${same?'compact':''} ${isMine?'mine':''}"><div class="group-avatar">${text(sender.slice(0,1)||'?',4)}</div><div class="group-message-main">${!same?`<b class="group-sender">${text(sender,70)}</b>`:''}<div class="group-message-line"><div class="group-message-text">${textFull(m.text)}</div><time>${text(m.time,35)}</time></div></div></div>`;
    }).join('');
    const roomHeader=`<header class="group-chat-head"><button class="group-back" data-act="back" data-to="home">‹</button><b>${text(room.title||'단체 채팅',110)}</b><small>${arr(room.participants).length}명</small></header>`;
    const inner=state.view==='chat' ? `${roomHeader}<div class="group-chat-members">${arr(room.participants).map(p=>`<span>${text(p,65)}</span>`).join('')}</div><div class="group-messages">${messages||'<p class="group-empty">메시지가 없어.</p>'}</div>`:
      `<div class="group-room-list-head"><b>${text(d.site||'단체 채팅',80)}</b></div><div class="group-rooms">${list||'<p class="group-empty">생성된 대화방이 없어.</p>'}</div>`;
    return `<div class="groupchat ${className}"><div class="groupchat-case"><div class="groupchat-topline">${isKakao?'● ● ●':isFantasy?'✧ ◈ ✧':isClassic?'❀':'●'}</div>${inner}<div class="groupchat-bottomline"></div></div></div>`;
  }

  function liveView(d) {
    return `<div class="web" style="background:#10182a"><div class="web-body"><div class="live-tv"><small>● LIVE</small><p><strong>${text(d.show||'실시간톡',130)}</strong></p><small>${text(d.episode,170)}</small></div><div class="live-lines">${arr(d.chat).map(x=>`<div class="live-line ${integer(x.donation)>0?'gift':''}"><small>${text(x.time,18)}</small><b>${text(x.user,65)}</b> ${textFull(x.text)}${integer(x.donation)>0?` <span style="color:#f2cb80">₩${integer(x.donation).toLocaleString()}</span>`:''}</div>`).join('')}</div>${arr(d.highlights).length?`<div class="live-highlights"><b>명장면</b>${arr(d.highlights).map(x=>`<div class="card" style="margin:9px 0"><b>${text(x.title,160)}</b>${normalText(x.text,1700)}</div>`).join('')}</div>`:''}</div></div>`;
  }
  function preview() {
    const r=currentRecord();
    if (!r) return `<div class="preview"><div class="empty"><div style="font-size:34px">${typeOf(state.type).icon}</div><b>아직 열람할 기록이 없어</b><p>RP 범위와 캐릭터를 고른 다음 생성하면<br>여기에서 실제 기기처럼 눌러서 구경할 수 있어.</p></div></div>`;
    const data=r.payload || {};
    const theme=currentTheme(state.type);
    const view=state.type==='phone'?phoneView(data,theme):state.type==='pc'?pcView(data,theme):state.type==='diary'?diaryView(data,theme):state.type==='live'?liveView(data):state.type==='groupchat'?groupchatView(data,theme,r.person):state.type==='x'?xView(data,theme):webPreview(state.type,data,theme);
    return `<div class="preview">${titleline(`${r.person?r.person+' · ':''}${typeOf(r.kind).label}`,`<span class="pill">${text(r.rangeLabel,70)}${usageSummary(r)}</span>`)}${view}</div>`;
  }
  function lorePage() {
    const s=state.settings;
    const names=[...new Set([...s.characters, ...Object.keys(s.characterProfiles||{})])].filter(Boolean);
    const person=names.includes(state.profilePerson)?state.profilePerson:(s.selectedPerson&&names.includes(s.selectedPerson)?s.selectedPerson:(names[0]||''));
    state.profilePerson=person;
    return `<div class="pane-title"><div><h3>📖 인물·서사 자료</h3><small>이 RP방의 생성 지침에 참고되는 정보</small></div></div><div class="stack lore-page">
      ${promptBlock('common','world','세계관','이 세계의 시대, 사회, 기술 수준, 법칙, 조직, 지리 등')}
      <div class="card stack"><h4>캐릭터별 정보</h4><div class="chips">${names.map(n=>`<button class="chip ${person===n?'active':''}" data-act="profile-person" data-person="${esc(n)}">${text(n,60)}</button>`).join('')||'<span class="subtle">등록된 캐릭터가 없어. 이름을 추가해 줘.</span>'}</div>
        <div class="row"><input type="text" data-field="profileAddName" maxlength="60" placeholder="새 캐릭터 이름" style="flex:1;min-width:140px"><button class="button slim" data-act="profile-add">캐릭터 추가</button></div>
        ${person?`<label class="field"><span>${text(person,60)} · 프로필</span><textarea data-field="characterProfile" data-person="${esc(person)}" rows="8" maxlength="30000" placeholder="성격, 말투, 특징, 직업, 관계 등 자유롭게 적기">${text(s.characterProfiles[person]||'',30000)}</textarea></label>`:''}
        <p class="subtle">여기 적은 정보는 해당 캐릭터의 개인 기록을 만들 때 참고해. 커뮤니티처럼 특정 인물을 지정하지 않는 콘텐츠에는 등록된 캐릭터 정보를 함께 참고해.</p>
      </div>
      <div class="card stack"><h4>유저 캐릭터 프로필</h4><p class="subtle">유저 캐릭터의 설정. 실제 대사나 기록을 AI가 대신 작성하도록 허용하는 항목은 아니야.</p><label class="field"><span>${text(s.userName||'유저 캐릭터',75)}</span><textarea data-field="userProfile" rows="8" maxlength="30000" placeholder="외모, 성격, 신분, 말투, 능력, 과거, 다른 캐릭터와의 관계 등">${text(s.userProfile,30000)}</textarea></label></div>
      <div class="card stack"><h4>중요 서사·사건</h4><label class="field"><span>진행된 사건, 비밀, 관계 변화, 기억할 이야기</span><textarea data-field="storyNotes" rows="12" maxlength="60000" placeholder="예: 1일차 - ...\n중요 사건 - ...\n현재 관계 - ...">${text(s.storyNotes,60000)}</textarea></label><p class="subtle">모든 콘텐츠의 생성 참고자료에 포함돼. 방별로 자동 저장되며, 기존 생성 기록은 바뀌지 않아.</p></div>
      <div class="row"><button class="button primary" data-act="save">현재 방 자료 저장</button><span class="subtle">자동 저장도 적용돼.</span></div>
    </div>`;
  }
  function promptBlock(group, key, title, placeholder) {
    const item=state.settings[group][key];
    return `<div class="card"><div class="section-header"><b>${title}</b><label class="toggle"><input data-field="toggle" data-group="${group}" data-key="${key}" type="checkbox" ${item.enabled?'checked':''}> 활성화</label></div><textarea data-field="prompt" data-group="${group}" data-key="${key}" rows="5" placeholder="${esc(placeholder)}" ${!item.enabled?'disabled':''}>${text(item.value,300000)}</textarea><p class="subtle">비활성화하거나 비워 두면 API 호출에 포함하지 않음. 내용은 방별로 저장.</p></div>`;
  }
  function settingsPage() {
    const s=state.settings;
    return `<div class="pane-title"><div><h3>⚙ 생성 설정과 프롬프트</h3></div></div><div class="stack">
     <div class="card stack"><h4>Gemini API</h4><label class="field"><span>Gemini API 키 (별도 저장, 다른 RP방에서도 사용)</span><input data-field="apiKey" type="password" autocomplete="off" placeholder="AIza..." value="${esc(state.key)}"></label><label class="field"><span>사용할 Gemini 모델</span><select data-field="model">${state.modelOptions.concat(state.modelOptions.some(o=>o[0]===s.model)?[]:[[s.model,s.model+' (기존 설정)']]).map(([id,name])=>`<option value="${esc(id)}" ${id===s.model?'selected':''}>${text(name,100)} · ${text(id,100)}</option>`).join('')}</select></label><div class="row"><button class="button slim" data-act="models">⟳ 내 API에서 모델 목록 불러오기</button><span class="subtle">API 조회 목록 우선 표시. 목록에 없는 모델은 「미확인」으로 유지되며 호출 가능 여부는 API 키에 따라 달라져.</span></div><p class="subtle">API 키는 Tampermonkey 저장소에 저장돼. 제3자와 스크립트를 공유할 때 API 키를 포함하지 마.</p></div>
     <div class="card stack"><h4>추론 강도</h4><label class="field"><span>선택한 모델의 사고 수준</span><select data-field="thinkingLevel">${thinkingOptions(s.model).map(v=>`<option value="${v}" ${v===validThinking(s.model,s.thinkingLevel)?'selected':''}>${text(THINKING_LABELS[v])}</option>`).join('')}</select></label><p class="subtle">모델에 따라 선택 가능한 강도가 달라. Gemini 3/4는 사고 수준, 2.5는 사고 예산을 적용해. 강도가 높으면 추론 토큰 비용이 늘 수 있어. 기본값은 모델 자동 설정.</p><p class="subtle">자동 재시도: Google이 비과금이라고 명시한 HTTP 500 오류만, 최초 요청 포함 최대 5회. 정상 응답 이후 결과 부족·파싱 실패·429·503·시간 초과는 자동 재시도하지 않아.</p></div>
     <div class="card stack"><h4>유저 캐릭터</h4><label class="field"><span>유저 캐릭터 이름 (필수)</span><input data-field="userName" type="text" maxlength="100" placeholder="RP에서 사용하는 유저 캐릭터의 이름" value="${esc(s.userName)}"></label><p class="subtle">이름으로 작성자를 식별해. 유저 캐릭터가 직접 작성한 기록은 생성하지 않아.</p></div>
     <div class="card stack"><label class="field"><span>원화 환산 환율 (1 USD = 몇 원)</span><input data-field="krwPerUsd" type="number" min="1" max="100000" step="1" value="${s.krwPerUsd}"></label><p class="subtle">현재 설정 환율로만 환산. 실시간 환율 조회나 추가 Gemini 호출은 하지 않아.</p></div>
     <div class="card"><h4>콘텐츠별 개별 프롬프트</h4><div class="chips">${TYPES.filter(t=>t.key!=='free').map(t=>`<button data-act="settings-kind" data-kind="${t.key}" class="chip ${state.type===t.key?'active':''}">${t.icon} ${t.label}</button>`).join('')}</div></div>
     ${state.type==='groupchat'?`<div class="card stack"><h4>단톡 기본 생성 프롬프트</h4><textarea data-field="groupchatBasePrompt" rows="5" aria-label="단톡 기본 생성 프롬프트">${text(s.groupchatBasePrompt,300000)}</textarea><p class="subtle">이 내용은 단톡 생성 요청에 기본 지침으로 포함돼. 비워 두면 기본 문구로 복구돼. 이 아래의 개별 추가 지시와 중복 전송하지 않아.</p></div>`:''}
     ${state.type==='free'?'<div class="card"><p class="subtle">자유 생성 프롬프트와 프리셋은 왼쪽 「자유 생성」 메뉴에서 관리해.</p></div>':`
     ${promptBlock('perKind',state.type,`${typeOf(state.type).icon} ${typeOf(state.type).label} 전용 추가 지시`,'이 콘텐츠에서 보고 싶은 내용의 분위기, 특징, 분량, 특정 기록 등에 관한 추가 지시')}
     <div class="card stack preset-box"><h4>📌 ${typeOf(state.type).label} 프롬프트 프리셋</h4>
       <div class="preset-grid"><label class="field"><span>저장된 프리셋</span><select data-field="presetSelect"><option value="">선택</option>${presetsOf(state.type).map(p=>`<option value="${esc(p.id)}" ${state.presetSelection===p.id?'selected':''}>${text(p.name,90)}</option>`).join('')}</select></label>
       <label class="field"><span>프리셋 이름</span><input type="text" data-field="presetName" maxlength="70" value="${esc(state.presetName)}" placeholder="이름 입력 후 저장"></label></div>
       <div class="row"><button class="button slim" data-act="preset-load" ${!selectedPreset(state.type)?'disabled':''}>불러오기</button><button class="button slim primary" data-act="preset-save">현재 지시 저장</button><button class="button slim ghost" data-act="preset-delete" ${!selectedPreset(state.type)?'disabled':''}>프리셋 삭제</button></div>
       <p class="subtle">프리셋은 모든 RP방에서 공통 사용. 단톡 프리셋에는 기본 생성 프롬프트도 함께 저장돼. 다른 방의 설정은 변경하지 않아.</p>
     </div>
     `}
     <div class="row"><button data-act="save" class="button primary">설정 저장</button><span class="subtle">텍스트 입력은 자동 저장되며, 저장 버튼으로 즉시 확정 가능.</span></div>
    </div>`;
  }
  function managePage() {
    return `<div class="pane-title"><div><h3>🗃 기록 관리</h3></div></div><div class="stack"><div class="card stack"><div class="row"><button class="button slim" data-act="select-all">모두 선택</button><button class="button slim ghost" data-act="select-none">선택 해제</button><span class="subtle">${state.checked.size}개 선택됨 / 총 ${state.entries.length}개</span></div><button class="button danger" data-act="delete-selected" ${!state.checked.size?'disabled':''}>선택한 ${state.checked.size}개 삭제</button></div>
    <div class="card"><div class="archive" style="max-height:550px">${state.entries.slice(0,state.manageLimit).map(e=>`<label class="archive-row"><input type="checkbox" data-field="record-check" data-id="${esc(e.id)}" ${state.checked.has(e.id)?'checked':''}><span style="flex:1"><b>${typeOf(e.kind).icon} ${typeOf(e.kind).label} · ${text(e.person||'세계관',60)}</b><small>${text(e.rangeLabel,100)} · ${fmtDate(e.createdAt)}${usageSummary(e)}</small></span></label>`).join('')||'<p class="subtle">보관 기록이 없어.</p>'}${state.entries.length>state.manageLimit?`<button class="button slim" data-act="manage-more">더 보기 (${state.entries.length-state.manageLimit}개 남음)</button>`:''}</div></div>
    <div class="card"><b class="error">이 채팅방 전체 기록 삭제</b><p class="info">이 방에서 열람실이 생성한 가상 기록만 삭제해. 실제 채팅 기록과 프롬프트 설정은 그대로 유지돼.</p><button class="button danger" data-act="delete-all" ${state.entries.length && !state.busy?'':'disabled'}>이 방 기록 전부 지우기</button></div>
    <div class="card stack" style="border-color:#a64659"><b class="error">모든 채팅방의 생성 기록 초기화</b><p class="info">모든 방에서 월드뷰어가 생성한 기록만 삭제해. 삭제한 기록은 복구할 수 없어. 실제 채팅 기록, 다른 확프 데이터, 프롬프트·API 설정에는 영향을 주지 않아.</p>
    ${state.globalDeleteConfirm===null?`<button class="button danger" data-act="delete-global" ${state.busy?'disabled':''}>모든 방의 생성 기록 전부 지우기</button>`:
      `<div class="global-delete-confirm" role="group" aria-label="모든 방의 기록 삭제 확인"><b class="error">${fmtNumber(state.globalDeleteConfirm)}개 기록을 정말 영구 삭제할까?</b><p>복구 불가능 · 다른 확프 및 실제 채팅에는 영향 없음</p><div class="row"><button class="button ghost" data-act="cancel-global">취소</button><button class="button danger" data-act="confirm-global" ${state.busy?'disabled':''}>확인하고 전체 삭제</button></div></div>`}</div></div>`;
  }
  function helpPanel() {
    if(state.type==='free')return `<aside class="help-popover" aria-label="자유 생성 도움말"><div class="help-title"><b>ⓘ 자유 생성 도움말</b><button class="button slim ghost" data-act="toggle-help">✕</button></div>
      <section><b>프롬프트</b><p>입력한 프롬프트를 그대로 전달하고 일반 텍스트로 생성해. 기존 콘텐츠의 JSON 규칙과 공통 생성 지침은 적용하지 않아.</p></section>
      <section><b>참고 자료</b><p>체크한 자료만 포함하며, RP 대화를 해제하면 대화 기록을 조회하지 않아. 기존 세계관을 바꿔 쓰는 AU는 입력 프롬프트를 우선해.</p></section>
      <section><b>요금·보관</b><p>Gemini API 한 번 호출을 기본으로 하고 HTTP 500 오류에는 재시도할 수 있어. 결과는 해당 RP방의 기록으로 저장돼.</p></section></aside>`;
    const s=state.settings, model=s.model;
    const count=requestEstimateCount(state.type,outputSize(s.outputSize));
    const p=PRICES[model];
    const single=draftEstimateTokens();
    const rates=p?(p.afterDate&&new Date()>=new Date(p.afterDate+'T00:00:00+09:00')?p.afterRates:p.above200k&&single>200000?p.above200k:[p.input,p.output]):null;
    return `<aside class="help-popover" aria-label="열람실 이용 도움말"><div class="help-title"><b>ⓘ 가상세계 열람실 도움말</b><button class="button slim ghost" data-act="toggle-help" aria-label="도움말 닫기">✕</button></div>
      <section><b>분량 선택</b><p>선택 목록의 개수는 생성 목표야. Gemini 출력 결과에 따라 실제 개수는 다를 수 있어. 일기는 단계별로 하루치 한 편의 본문 길이가 달라져.</p></section>
      <section><b>예상 비용과 토큰</b><p>예상 총입력은 선택한 RP 대화, 활성화된 프롬프트, 분할 호출 횟수를 기준으로 계산해. RP를 읽기 전에는 턴당 450자로 가정하고, 읽은 뒤 실제 글자 수로 근사치를 갱신해. 비용 조회만으로 Gemini API를 호출하지는 않아.</p>
      <p>현재 모델: ${text(model,75)} · 추론: ${text(THINKING_LABELS[validThinking(model,s.thinkingLevel)],35)}<br>선택 분량의 계획된 Gemini 요청 약 ${count}회 · 예상 출력 ${fmtNumber(estimatedOutputTokens())}토큰 · 별도 추론 ${fmtNumber(estimateThinkingTokens(model,s.thinkingLevel,count))}토큰 가정.</p>
      <p>${rates?`선택 모델 유료 Standard 단가: 입력 $${rates[0]}, 출력 $${rates[1]} (100만 토큰당).`:'이 모델은 요금표가 등록되지 않아 비용을 계산하지 않아.'} 원화 금액은 프롬프트·API 설정의 수동 환율로 환산해. 실제 사용량·청구 금액과 차이가 날 수 있어.</p></section>
      <section><b>호출·재시도</b><p>분할 생성 시 요청마다 비용이 발생할 수 있어. HTTP 500 실패만 최초 요청 포함 최대 5회 재시도하고, 정상 응답의 수량 부족, 파싱 실패, HTTP 429·503, 시간 초과 등은 자동 재시도하지 않아. 일부 성공한 내용은 보관해.</p></section>
      <section><b>유저 캐릭터와 기록</b><p>유저 캐릭터가 직접 쓴 글·메시지·댓글을 AI가 대신 만들지 않고, 유저 캐릭터와 다른 인물의 직접 대화 로그도 생성 대상에서 제외해. 다른 인물이 유저 캐릭터를 검색하거나 언급·평가·기록하는 콘텐츠는 생성할 수 있어. 캐릭터 개인 일기에도 그 인물에 대한 생각이 자연스럽게 나올 수 있어.</p>
      <p>생성 기록은 이 기기의 월드뷰어 전용 저장소에 RP방별로 보관돼. 실제 크랙 채팅 기록이나 다른 확프의 데이터는 변경하지 않아.</p></section>
    </aside>`;
  }
  function render() {
    badge.className=[state.busy?'busy':'',state.open?'panel-open':''].filter(Boolean).join(' ');
    badge.textContent=state.busy?'◌ 생성 중 · 열람실':'✦ 세계 열람실';
    if (!state.open) { panel.hidden=true; return; }
    const scroller=panel.querySelector('.main'); const scrollPos=scroller?.scrollTop || 0;
    const controlScroll=panel.querySelector('.viewer-layout > .controls')?.scrollTop || 0;
    panel.hidden=false;
    panel.innerHTML=`<div class="header"><div><h2>✦ 가상세계 열람실 <small>v${VERSION}</small></h2></div><div class="head-actions"><button class="icon-btn help-trigger" data-act="toggle-help" aria-expanded="${state.helpOpen}" title="생성량·요금·기록 정책 설명">? 도움말</button><button class="icon-btn" data-act="close" title="접고 캐챗 계속하기">─ 접기</button></div></div>
      <div class="shell">${sidebar()}<main class="main">${!state.room?`<div class="empty"><b>현재 RP 채팅방을 열어 줘.</b><p>크랙의 개별 채팅방에서 사용할 수 있어.</p></div>`:state.tab==='settings'?settingsPage():state.tab==='manage'?managePage():state.tab==='lore'?lorePage():state.type==='free'?freePage():viewerPage()}</main></div>`;
    if(state.helpOpen)panel.insertAdjacentHTML('beforeend',helpPanel());
    panel.append(toastBox);
    panel.querySelector('.main').scrollTop=scrollPos;
    const nextControls=panel.querySelector('.viewer-layout > .controls');
    if(nextControls && state.type==='free') nextControls.scrollTop=controlScroll;
    scheduleAutomaticEstimate();
  }
  async function refreshModels() {
    const key=state.key.trim();if(!key)return flash('API 키부터 입력해 줘.');
    if(state.busy)return;setBusy(true,'Gemini에서 사용 가능한 모델을 확인하는 중');
    try {
      const list=await fetchModels(key);
      if(!list.length)throw new Error('사용 가능한 텍스트 생성 모델이 없어.');
      const ids=new Set(list.map(x=>x[0]));
      state.modelOptions=[...list,...MODEL_FALLBACK.filter(x=>!ids.has(x[0])).map(x=>[x[0],x[1]+' (API 제공 여부 미확인)'])];
      await saveSettings();flash(`API에서 사용 가능한 모델 ${list.length}개 확인. 미확인 모델도 별도 표시해.`);
    } catch(e){showError(e);} finally {setBusy(false);}
  }

  async function detectPeople() {
    if (state.busy) return;
    if (!state.room) return flash('RP 채팅방에서 실행해 줘.');
    const key=state.key.trim(); if (!key) { state.tab='settings'; render(); return flash('먼저 Gemini API 키를 입력해 줘.'); }
    const room=state.room; const s=structuredClone(state.settings);
    setBusy(true, '캐릭터 감지 준비 중');
    try {
      const log = await readConversation(room, s.rangeMode, s.rangeFrom, s.rangeMode==='recent'?s.recentTurns:s.rangeTo, setStatus, s.userName);
      setStatus('Gemini가 등장인물을 찾는 중');
      const instruction = FIND_PERSON_PROMPT + (s.userName?`\n[제외할 유저 캐릭터 이름] ${s.userName}\n이 이름은 감지 인물 목록에 넣지 않는다.`:'') + (s.common.world.enabled&&s.common.world.value.trim()?`\n[참고 세계관]\n${s.common.world.value}`:'');
      const out=(await gemini(instruction,`[RP]\n${log.content}`,s.model,key,2048,s.thinkingLevel,(next,total,delay)=>setStatus(`인물 감지 · HTTP 500 재시도 ${next}/${total} · ${delay/1000}초 후`))).payload;
      const found=arr(out.characters).map(x=>String(x||'').trim().slice(0,60)).filter(x=>x&&x!==s.userName);
      if (!found.length) throw new Error('감지된 인물이 없어요. 직접 이름을 추가할 수 있어.');
      const names=[...new Set([...s.characters,...found])].slice(0,80);
      if (state.room===room) {
        state.settings.characters=names;
        if (!names.includes(state.settings.selectedPerson)) state.settings.selectedPerson=found[0];
        await saveSettings();
      }
      flash(`인물 ${found.length}명 감지: ${found.join(', ')}`);
    } catch(e) { showError(e); } finally { setBusy(false); }
  }
  function removeUserAuthored(kind, payload, userName) {
    const target=String(userName||'').trim().toLocaleLowerCase('ko-KR');
    if(!target) return 0;
    const matches=v=>String(v??'').trim().replace(/^[@＠]+/,'').toLocaleLowerCase('ko-KR')===target;
    const authored=v=>matches(v?.author)||matches(v?.by)||matches(v?.writer)||matches(v?.user)||matches(v?.handle);
    let removed=0;
    const filter=(obj,key,predicate)=>{
      if(!Array.isArray(obj?.[key]))return;
      const n=obj[key].length;
      obj[key]=obj[key].filter(x=>!predicate(x));removed+=n-obj[key].length;
    };
    if(kind==='phone'){
      filter(payload,'messages',x=>matches(x?.person)||matches(x?.name));
      filter(payload,'calls',x=>matches(x?.name));
      filter(payload,'social',authored);
      for(const item of arr(payload.social))filter(item,'comments',authored);
    } else if(kind==='pc'){
      filter(payload,'emails',x=>matches(x?.from)||matches(x?.to));
      filter(payload,'notes',authored);
      for(const folder of arr(payload.folders))filter(folder,'files',authored);
    } else if(kind==='board'){
      for(const section of arr(payload.sections)){
        filter(section,'posts',authored);
        for(const post of arr(section.posts))filter(post,'comments',authored);
      }
    } else if(kind==='news'){
      filter(payload,'articles',authored);
      for(const article of arr(payload.articles))filter(article,'comments',authored);
    } else if(kind==='wiki'){
      filter(payload,'docs',authored);
      for(const doc of arr(payload.docs))filter(doc,'discussion',authored);
    } else if(kind==='groupchat'){
      for(const room of arr(payload.rooms)){
        filter(room,'messages',m=>matches(m?.sender)||matches(m?.author)||matches(m?.user));
        if(Array.isArray(room.participants))room.participants=room.participants.filter(p=>!matches(p));
      }
    } else if(kind==='live'){
      filter(payload,'chat',authored);
    } else if(kind==='x'){
      filter(payload,'posts',authored);
      for(const post of arr(payload.posts))filter(post,'replies',authored);
    }
    return removed;
  }
  async function generate() {
    if(state.type==='free')return generateFree();
    if (state.busy) return;
    if (!state.room) return flash('RP 채팅방을 열어 줘.');
    if (!state.key.trim()) { state.tab='settings'; render(); return flash('먼저 Gemini API 키를 설정해 줘.'); }
    if (!state.settings.userName?.trim()) { state.tab='settings'; render(); return flash('유저 캐릭터 이름을 설정한 뒤 생성해 줘.'); }
    const kind=state.type, room=state.room, s=structuredClone(state.settings), person=s.selectedPerson;
    if (typeOf(kind).person && person && person.trim()===s.userName.trim()) return flash('유저 캐릭터 본인의 기록은 생성하지 않아. 다른 캐릭터를 선택해 줘.');
    if (typeOf(kind).person && !person) {
      flash('먼저 캐릭터를 선택해야 해. 「대화에서 인물 찾기」를 실행할게.');
      return detectPeople();
    }
    setBusy(true, '대화 기록 준비 중');
    try {
      const log=await readConversation(room,s.rangeMode,s.rangeFrom,s.rangeMode==='recent'?s.recentTurns:s.rangeTo,setStatus,s.userName);
      setStatus(`${typeOf(kind).label} 콘텐츠를 Gemini로 생성 중 · 채팅은 계속 가능`);
      const generated=await generateSplit(kind,person,s,log,state.key.trim(),setStatus);
      const result=generated.payload;
      const removed=removeUserAuthored(kind,result,s.userName);
      if(removed)generated.warnings.push(`유저 캐릭터가 직접 작성한 것으로 표시된 기록 ${removed}개 제외. 별도 API 재요청 없음.`);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Gemini 결과가 올바른 객체가 아닙니다.');
      const required = primaryArray[kind];
      if (!Array.isArray(result[required])) throw new Error(`Gemini 응답에 필수 목록(${required})이 없습니다. 다시 생성해 주세요.`);
      if(kind==='diary' && result.entries.length!==1) throw new Error('일기는 한 번에 하루치 한 편만 생성해야 해. 다시 시도해 줘.');
      const record={id:uid(),room,kind,person:typeOf(kind).person?person:'',createdAt:Date.now(),rangeLabel:log.label,payload:result,model:s.model,thinkingLevel:s.thinkingLevel,usage:generated.usage,billUsd:generated.billUsd,requestCount:generated.calls||1,warnings:generated.warnings||[]};
      await putRecord(record);
      if (state.room===room) {
        state.entries.unshift(record);
        if (state.type===kind && (!typeOf(kind).person || state.settings.selectedPerson===person)) {
          state.selectedRecord=record.id; state.view='home'; state.tabletPane='viewer';
        }
      }
      const usage=generated.usage||{};const total=integer(usage.totalTokenCount,0);
      flash(`${typeOf(kind).label} 기록 저장 완료 · ${record.requestCount}회 호출${total?' · 실제 '+fmtNumber(total)+'토큰':''}${record.warnings.length?' · 일부 항목 부족('+record.warnings.length+'건)':''}`,9000);
    } catch(e) { if(/HTTP (400|403|404|429)/.test(String(e?.message)) && /gemini-3\.8/.test(s.model)) showError(new Error('Gemini 3.8 요청 실패. Google API의 모델 사용 권한·할당량·모델 ID를 확인해 줘. 원래 오류: '+e.message)); else showError(e); } finally { setBusy(false); }
  }

  function updateBadgePosition() {
    const p=state.buttonPosition;
    const w=Math.max(110,badge.offsetWidth||151),h=Math.max(42,badge.offsetHeight||44);
    const x=p ? Math.min(Math.max(6,p.x),Math.max(6,innerWidth-w-6)) : Math.max(6,innerWidth-w-20);
    const y=p ? Math.min(Math.max(6,p.y),Math.max(6,innerHeight-h-6)) : Math.max(6,innerHeight-h-24);
    badge.style.left=x+'px';badge.style.top=y+'px';badge.style.right='auto';badge.style.bottom='auto';
  }
  let dragging=null, suppressClick=false;
  badge.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;
    dragging={id:e.pointerId,x:e.clientX,y:e.clientY,left:badge.offsetLeft,top:badge.offsetTop,moved:false};
    try{badge.setPointerCapture(e.pointerId);}catch(_){}
  });
  badge.addEventListener('pointermove',e=>{
    if(!dragging||dragging.id!==e.pointerId)return;
    const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;
    if(!dragging.moved&&Math.hypot(dx,dy)<6)return;
    dragging.moved=true;badge.classList.add('dragging');
    const x=Math.max(6,Math.min(innerWidth-badge.offsetWidth-6,dragging.left+dx));
    const y=Math.max(6,Math.min(innerHeight-badge.offsetHeight-6,dragging.top+dy));
    badge.style.left=x+'px';badge.style.top=y+'px';
  });
  const endDrag=e=>{
    if(!dragging||dragging.id!==e.pointerId)return;
    if(dragging.moved){suppressClick=true;state.buttonPosition={x:badge.offsetLeft,y:badge.offsetTop};setGM(KEY_BUTTON,JSON.stringify(state.buttonPosition)).catch(showError);}
    dragging=null;badge.classList.remove('dragging');
  };
  badge.addEventListener('pointerup',endDrag);badge.addEventListener('pointercancel',endDrag);
  badge.addEventListener('click',()=>{if(suppressClick){suppressClick=false;return;}state.open=!state.open;render();});
  window.addEventListener('resize',updateBadgePosition);

  root.addEventListener('click', async e => {
    const btn=e.target.closest('[data-act]');
    if (!btn || !root.contains(btn)) return;
    const act=btn.dataset.act;
    try {
      if (act==='close') {state.open=false;state.helpOpen=false;render();return;}
      if (act==='toggle-help') {state.helpOpen=!state.helpOpen;render();return;}
      if(act==='free-generate'){await generateFree();return;}
      if(act==='free-copy'){await copyFreeText();return;}
      if(act==='free-txt'){saveFreeTxt();return;}
      if(act==='free-preset-save'){
        const name=String(state.freePresetName||'').trim().slice(0,70),d=state.settings.freeDraft;
        if(!name)return flash('프리셋 이름을 입력해 줘.');
        if(!d.prompt.trim())return flash('저장할 프롬프트가 없어.');
        const prev=state.freePresets.find(p=>p.name===name);
        if(prev&&!confirm(`프리셋 "${name}"을 덮어쓸까?`))return;
        const item=prev||{id:uid(),name,prompt:'',title:''};item.prompt=d.prompt;item.title=d.title;
        if(!prev)state.freePresets.push(item);
        state.freePresetSelection=item.id;await saveFreePresets();render();flash(`프리셋 저장: ${name}`);return;
      }
      if(act==='free-preset-load'){
        const p=selectedFreePreset();if(!p)return flash('불러올 프리셋을 선택해 줘.');
        state.settings.freeDraft.prompt=p.prompt;state.settings.freeDraft.title=p.title;
        state.freePresetName=p.name;await saveSettings();render();flash(`프리셋 적용: ${p.name}`);return;
      }
      if(act==='free-preset-delete'){
        const p=selectedFreePreset();if(!p)return;
        if(!confirm(`공용 프리셋 "${p.name}"을 삭제할까?`))return;
        state.freePresets=state.freePresets.filter(x=>x.id!==p.id);
        state.freePresetSelection='';state.freePresetName='';await saveFreePresets();render();flash('프리셋 삭제 완료');return;
      }
      if (act==='kind'||act==='settings-kind') {state.focused=false;state.tabletPane='viewer';state.quote=null;state.boardQuery=''; state.wikiQuery=''; state.wikiTab='article';state.xQuery='';state.xFilter='all';state.expandedX.clear();state.newsCategory='전체';state.type=btn.dataset.kind;state.view='home';state.selectedRecord='';state.subIndex=0;state.settings.lastTab=state.type;state.presetSelection='';state.presetName='';state.freePresetSelection='';state.freePresetName='';if(act==='kind')state.tab='viewer';await saveSettings();render();return; }
      if (act==='tab') {state.tab=btn.dataset.tab;state.globalDeleteConfirm=null;render();return;}
      if (act==='profile-person') {state.profilePerson=btn.dataset.person||'';render();return;}
      if (act==='profile-add') {
        const input=panel.querySelector('[data-field=profileAddName]');
        const name=String(input?.value||'').trim().slice(0,60);
        if(!name)return flash('캐릭터 이름을 입력해 줘.');
        if(!state.settings.characters.includes(name) && state.settings.characters.length>=80)return flash('캐릭터는 최대 80명까지 등록할 수 있어.');
        state.settings.characters=[...new Set([...state.settings.characters,name])];
        state.profilePerson=name;await saveSettings();render();return;
      }
      if (act==='export-png') {await exportPreviewPng(btn);return;}
      if (act==='person') {state.quote=null;state.settings.selectedPerson=btn.dataset.person;state.view='home';state.selectedRecord='';await saveSettings();render();return;}
      if (act==='add-person') {const el=panel.querySelector('[data-field=addPerson]');const n=String(el?.value||'').trim().slice(0,60);if(!n)return flash('이름을 입력해 줘.');state.settings.characters=[...new Set([...state.settings.characters,n])];state.settings.selectedPerson=n;await saveSettings();render();return;}
      if (act==='detect') {await detectPeople();return;}
      if (act==='models') {await refreshModels();return;}
      if (act==='focus') {state.focused=!state.focused;render();return;}
      if (act==='tablet-pane') {state.tabletPane=btn.dataset.pane==='controls'?'controls':'viewer';state.focused=false;render();panel.querySelector('.main')?.scrollTo(0,0);return;}
      if (act==='generate') {await generate();return;}
      if (act==='record') {state.boardQuery='';state.expandedX.clear();state.newsCategory='전체';state.selectedRecord=btn.dataset.id;state.view='home';state.subIndex=0;render();return;}
      if (act==='view') {state.view=btn.dataset.view;state.subIndex=0;render();return;}
      if (act==='back') {state.view=btn.dataset.to||'home';render();return;}
      if (act==='phoneitem') {state.subIndex=integer(btn.dataset.index);state.phoneSource=btn.dataset.source;state.view='phone-detail';render();return;}
      if (act==='viewitem') {state.subIndex=integer(btn.dataset.index);state.view='thread';render();return;}
      if (act==='pcitem') {
        const idx=integer(btn.dataset.index),kind=state.view;
        if(kind==='folders'){state.subIndex=idx;state.view='files';}
        else if(kind==='files'){state.fileIndex=idx;state.subIndex2=3;state.view='detail';}
        else if(kind==='emails'){state.subIndex=idx;state.view='mail-detail';}
        else if(kind==='browser'){state.subIndex=idx;state.view='browser-page';}
        else if(kind==='notes'){state.subIndex=idx;state.view='note-detail';}
        render();return;
      }
      if(act==='group-room'){state.subIndex=integer(btn.dataset.index);state.view='chat';render();return;}
      if(act==='mail-folder'){state.pcMailFolder=btn.dataset.folder||'inbox';state.view='emails';render();return;}
      if(act==='diary-entry'){state.subIndex=integer(btn.dataset.index);state.view='entry';render();return;}
      if (act==='section') {state.boardQuery='';state.subIndex=integer(btn.dataset.index);state.view='posts';render();return;}
      if (act==='board-clear') {state.boardQuery='';render();return;}
      if (act==='post') {state.subIndex2=integer(btn.dataset.index);state.view='detail';render();return;}
      if (act==='webitem') {state.subIndex=integer(btn.dataset.index);state.view='detail';state.wikiTab='article';render();return;}
      if (act==='wiki-tab') {state.wikiTab=btn.dataset.tab;render();return;}
      if (act==='wiki-search') {state.view='home';render();return;}
      if (act==='wiki-jump') {const section=panel.querySelector('[data-wiki-section="'+integer(btn.dataset.index)+'"]');section?.scrollIntoView({block:'start',behavior:'smooth'});return;}
      if (act==='x-toggle') {const i=integer(btn.dataset.index);state.expandedX.has(i)?state.expandedX.delete(i):state.expandedX.add(i);render();return;}
      if (act==='xpost') {const i=integer(btn.dataset.index);state.expandedX.has(i)?state.expandedX.delete(i):state.expandedX.add(i);render();return;}
      if (act==='news-category') {state.newsCategory=btn.dataset.category||'전체';state.view='home';render();return;}
      if (act==='board-jump') {state.subIndex=integer(btn.dataset.index);state.subIndex2=integer(btn.dataset.post);state.view='detail';render();return;}
      if (act==='x-filter') {state.xFilter=btn.dataset.filter||'all';state.view='home';render();return;}
      if (act==='x-trend') {state.xQuery=btn.dataset.query||'';state.view='home';render();return;}
      if(act==='preset-save') {
        const kind=state.type;
        const name=String(state.presetName||'').trim().slice(0,70);
        const value=String(state.settings.perKind[kind]?.value||'').trim();
        const basePrompt=kind==='groupchat' ? String(state.settings.groupchatBasePrompt||GROUPCHAT_BASE_PROMPT).trim() : '';
        if(!name)return flash('프리셋 이름을 입력해 줘.');
        if(!value && !basePrompt)return flash('먼저 프롬프트에 내용을 입력해 줘.');
        const exists=presetsOf(kind).find(p=>p.name===name);
        if(exists && !confirm(`프리셋 "${name}"을 덮어쓸까?`))return;
        const item=exists||{id:uid(),kind,name,value};
        item.value=value;
        if(kind==='groupchat')item.basePrompt=basePrompt;
        if(!exists)state.presets.push(item);
        state.presetSelection=item.id;
        await savePresets(); render(); flash(`프리셋 저장: ${name}`);return;
      }
      if(act==='preset-load') {
        const p=selectedPreset(state.type);
        if(!p)return flash('불러올 프리셋을 선택해 줘.');
        state.settings.perKind[state.type]={enabled:!!p.value.trim(),value:p.value};
        if(state.type==='groupchat' && typeof p.basePrompt==='string')state.settings.groupchatBasePrompt=p.basePrompt;
        state.presetName=p.name;state.quote=null;
        await saveSettings();render();flash(`프리셋 적용: ${p.name}`);return;
      }
      if(act==='preset-delete') {
        const p=selectedPreset(state.type);
        if(!p)return;
        if(!confirm(`공용 프리셋 "${p.name}"을 삭제할까? 다른 방에도 프리셋 목록에서 사라져.`))return;
        state.presets=state.presets.filter(x=>x.id!==p.id);
        state.presetSelection='';state.presetName='';
        await savePresets();render();flash('프리셋 삭제 완료');return;
      }
      if (act==='save') {await saveSettings();await setGM(KEY_API,state.key);flash('설정 저장 완료');return;}
      if(act==='archive-more'){state.archiveLimit+=40;render();return;}
      if(act==='manage-more'){state.manageLimit+=100;render();return;}
      if (act==='select-all') {state.checked=new Set(state.entries.map(r=>r.id));render();return;}
      if (act==='select-none') {state.checked.clear();render();return;}
      if (act==='single-delete') {const id=btn.dataset.id;if(!confirm('이 생성 기록 1개를 삭제할까?'))return;await deleteRecords([id]);state.entries=state.entries.filter(r=>r.id!==id);if(state.selectedRecord===id)state.selectedRecord='';render();return;}
      if (act==='delete-selected') {const ids=[...state.checked];if(!ids.length)return;if(!confirm(`선택한 기록 ${ids.length}개를 영구 삭제할까?`))return;await deleteRecords(ids);state.entries=state.entries.filter(r=>!state.checked.has(r.id));state.checked.clear();render();return;}
      if (act==='delete-all') {const ids=state.entries.map(x=>x.id);if(!ids.length)return;if(!confirm(`이 채팅방 가상 기록 ${ids.length}개를 전부 삭제할까? 이 작업은 되돌릴 수 없어.`))return;await deleteRecords(ids);state.entries=[];state.checked.clear();state.selectedRecord='';render();return;}
      if (act==='delete-global') {
        if (state.busy) return flash('생성이 끝난 후 기록을 삭제할 수 있어.');
        const count=await countAllRecords();
        if(!count){flash('모든 채팅방에 저장된 생성 기록이 없어.');return;}
        state.globalDeleteConfirm=count;
        render();
        return;
      }
      if (act==='cancel-global') {state.globalDeleteConfirm=null;render();return;}
      if (act==='confirm-global') {
        if(state.busy||state.globalDeleteConfirm===null)return;
        const count=await countAllRecords();
        await deleteAllGeneratedRecords();
        state.globalDeleteConfirm=null;
        state.entries=[];state.checked.clear();state.selectedRecord='';state.view='home';
        render();flash(`월드뷰어 생성 기록 ${fmtNumber(count)}개 삭제 완료. 실제 채팅과 다른 확프의 데이터는 유지돼.`,8500);
        return;
      }
    } catch(err) {showError(err);}
  });
  let saveTimer=0;
  const queueSave=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveSettings().catch(showError),350);};
  root.addEventListener('input', e => {
    const target=e.target;if (!target.dataset?.field) return;
    const field=target.dataset.field;
    if(field==='wikiSearch'){state.wikiQuery=target.value;return;}
    if(field==='xSearch'){state.xQuery=target.value;const q=state.xQuery.toLocaleLowerCase('ko-KR').trim();panel.querySelectorAll('.x-post').forEach(el=>{el.style.display=(!q || el.textContent.toLocaleLowerCase('ko-KR').includes(q))?'':'none';});return;}
    if(field==='pcBrowserSearch'){state.pcBrowserQuery=target.value;const q=target.value.toLocaleLowerCase('ko-KR').trim();panel.querySelectorAll('.pc-history-row').forEach(el=>{el.style.display=!q||el.textContent.toLocaleLowerCase('ko-KR').includes(q)?'':'none';});return;}
    if(field==='boardSearch'){state.boardQuery=target.value;const key=target.value.toLocaleLowerCase('ko-KR').trim();panel.querySelectorAll('[data-post-row]').forEach(row=>row.hidden=!!key&&!row.dataset.search.toLocaleLowerCase('ko-KR').includes(key));return;}
    if(field==='freeTitle'){state.settings.freeDraft.title=target.value.slice(0,120);queueSave();return;}
    if(field==='freePrompt'){state.settings.freeDraft.prompt=target.value.slice(0,120000);queueSave();return;}
    if(field==='freePresetName'){state.freePresetName=target.value.slice(0,70);return;}
    if(['freeRecentTurns','freeRangeFrom','freeRangeTo'].includes(field)){
      const key={freeRecentTurns:'recentTurns',freeRangeFrom:'rangeFrom',freeRangeTo:'rangeTo'}[field];
      state.settings.freeDraft[key]=clamp(target.value,1,2000);queueSave();return;
    }
    if(field==='presetName'){state.presetName=target.value.slice(0,70);return;}
    if(field==='characterProfile'){
      const name=String(target.dataset.person||'').slice(0,60);
      if(!name)return;
      state.settings.characterProfiles[name]=target.value.slice(0,30000);
      state.quote=null;queueSave();scheduleAutomaticEstimate();return;
    }
    if(field==='userProfile'||field==='storyNotes'){
      state.settings[field]=target.value.slice(0,field==='storyNotes'?60000:30000);
      state.quote=null;queueSave();scheduleAutomaticEstimate();return;
    }
    if(field==='groupchatBasePrompt'){state.settings.groupchatBasePrompt=target.value.slice(0,300000);state.quote=null;queueSave();scheduleAutomaticEstimate();return;}
    if(field==='apiKey') {state.key=target.value;clearTimeout(saveTimer);saveTimer=setTimeout(()=>setGM(KEY_API,state.key).catch(showError),400);return;}
    if(field==='model'){state.settings.model=target.value;state.settings.thinkingLevel=validThinking(target.value,state.settings.thinkingLevel);state.quote=null;queueSave();render();return;}
    if(field==='thinkingLevel'){state.settings.thinkingLevel=validThinking(state.settings.model,target.value);state.quote=null;queueSave();updateEstimatePanel();scheduleAutomaticEstimate();return;}
    if(field==='outputSize'){state.settings.outputSize=outputSize(target.value);state.quote=null;queueSave();updateEstimatePanel();scheduleAutomaticEstimate();return;}
    if(field==='userName'){state.settings.userName=target.value.slice(0,100);state.quote=null;queueSave();updateEstimatePanel();scheduleAutomaticEstimate();return;}
    if(field==='krwPerUsd'){const v=clamp(target.value,1,100000);if(target.value!==''){state.settings.krwPerUsd=v;queueSave();updateEstimatePanel();}return;}
    if(field==='prompt'){state.quote=null;const o=state.settings[target.dataset.group]?.[target.dataset.key];if(o){o.value=target.value;queueSave();scheduleAutomaticEstimate();}return;}
    if(['recentTurns','rangeFrom','rangeTo'].includes(field)){state.quote=null;state.settings[field]=Math.max(1,integer(target.value,1));queueSave();updateEstimatePanel();scheduleAutomaticEstimate();return;}
  });
  root.addEventListener('change', e => {
    const target=e.target;if (!target.dataset?.field) return;
    const field=target.dataset.field;
    if(field==='wikiSearch'||field==='xSearch'){render();return;}
    if(field==='freePresetSelect'){state.freePresetSelection=target.value;state.freePresetName=selectedFreePreset()?.name||'';render();return;}
    if(field==='freeRef'){
      if(!FREE_REF_KEYS.includes(target.dataset.ref))return;
      state.settings.freeDraft.refs[target.dataset.ref]=!!target.checked;queueSave();render();return;
    }
    if(field==='freeCharacter'){state.settings.freeDraft.character=target.value.slice(0,60);queueSave();return;}
    if(field==='freeRangeMode'){state.settings.freeDraft.rangeMode=target.value==='range'?'range':'recent';queueSave();render();return;}
    if(field==='freeOutputCap'){
      state.settings.freeDraft.outputCap=FREE_CAPS.some(x=>x[0]===Number(target.value))?Number(target.value):8192;
      queueSave();render();return;
    }
    if(field==='presetSelect'){state.presetSelection=target.value;state.presetName=selectedPreset(state.type)?.name||'';render();return;}
    if(field==='theme'){state.settings.themes[target.dataset.kind]=validTheme(target.dataset.kind,target.value);state.view='home';state.subIndex=0;state.subIndex2=0;state.expandedX.clear();queueSave();render();return;}
    if(field==='krwPerUsd'){state.settings.krwPerUsd=clamp(target.value,1,100000);queueSave();updateEstimatePanel();return;}
    if(field==='rangeMode'){state.quote=null;state.settings.rangeMode=target.value;queueSave();render();return;}
    if(field==='outputSize'){state.settings.outputSize=outputSize(target.value);state.quote=null;queueSave();updateEstimatePanel();scheduleAutomaticEstimate();return;}
    if(field==='toggle'){state.quote=null;const o=state.settings[target.dataset.group]?.[target.dataset.key];if(o){o.enabled=target.checked;queueSave();render();}return;}
    if(field==='record-check'){if(target.checked)state.checked.add(target.dataset.id);else state.checked.delete(target.dataset.id);render();return;}
  });
  // 채팅방 이동 여부만 확인하고, 채팅 입력과 전송은 변경하지 않는다.
  let lastRoom=roomFromURL();
  setInterval(()=>{
    const now=roomFromURL();
    if(now!==lastRoom){lastRoom=now;loadRoom(now).catch(showError);}
  },1500);
  init().catch(showError);
})();
