// ==UserScript==
// @name         크랙 요약메모리 관리
// @namespace    https://crack.wrtn.ai/
// @version      4.0.0
// @description  단기기억/관계도 자동삭제·일괄삭제, 목표 자동대체, 업데이트 알림.
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      crack-api.wrtn.ai
// ==/UserScript==

(() => {
  'use strict';
  if (window.__CRACK_MEMORY_MANAGER_V4__) return;
  window.__CRACK_MEMORY_MANAGER_V4__ = true;

  const BASE = 'https://crack-api.wrtn.ai/crack-gen/v3/chats';
  const STORE = 'cmh_v2_'; // 기존 설정 호환
  const ORDER = ['short', 'relations', 'goal'];
  const TYPES = Object.freeze({short:'shortTerm',relations:'relationship',goal:'goal'});
  const NAMES = Object.freeze({short:'단기기억',relations:'관계도',goal:'목표'});
  const MIN_TURN_RE = /^\d[\d,]*\s*턴$/;
  const UPDATE_RE = /요약\s*메모리.{0,35}(업데이트|생성|추가|갱신).{0,20}(되었|됐|완료|됨)|(?:업데이트|생성|추가)된\s*요약\s*메모리/;
  const narrow = value => String(value ?? '').replace(/\s+/g,' ').trim();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const shown = el => !!(el && el.isConnected && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const own = el => !!el?.closest?.('#cmm4-side,#cmm4-root');
  const read = (key, fallback) => { try { const v = GM_getValue(STORE + key,null); return v==null?fallback:JSON.parse(v); } catch {return fallback;} };
  const store = (key, value) => { GM_setValue(STORE + key,JSON.stringify(value)); };
  const oldSettings = read('settings', {});
  const config = {
    short: {mode: oldSettings.short?.mode === 'auto'?'auto':'manual'},
    relations: {mode: oldSettings.relations?.mode === 'auto'?'auto':'manual'},
    goal: {mode: oldSettings.goal?.mode === 'auto'?'auto':'manual',content:String(oldSettings.goal?.content ?? '')},
    sticky: oldSettings.sticky !== false
  };
  let pending = read('pending', null);
  const seen = read('known', {});
  const tries = read('attempts', {});
  const logs = [];
  let processing = false, polling = false, scanTimer = 0, lastURL = location.href;
  let sidebar, rootHost, shadow, settingsOpen = false;
  let initialSignature = null, initialScanned = false, freshEvent = false, openingForAuto = false;

  const log = message => { const line = `[${new Date().toLocaleTimeString('ko-KR')}] ${message}`; logs.unshift(line);logs.length= Math.min(logs.length,45);console.info('[크랙 요약메모리 관리]',message);renderLog(); };
  const fail = message => {log('중단: '+message); notify(message, true);};
  const chatKey = () => location.pathname + location.search;
  const chatId = () => { const m = location.pathname.match(/\/(?:episodes|chats|c)\/([a-f0-9-]+)/i);if(!m)throw Error('채팅 ID를 확인할 수 없습니다.');return m[1];};
  const token = () => {const m=document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);if(!m)throw Error('로그인 인증 정보를 찾지 못했습니다.');return decodeURIComponent(m[1]);};
  const itemId = x => x?.id || x?._id || x?.summaryId || x?.summary_id;
  function assertType(item, key) {
    if (!itemId(item) || !TYPES[key] || (item.type != null && item.type !== TYPES[key])) throw Error(`${NAMES[key]} 항목 유형이나 ID가 불명확합니다.`);
  }

  // 타입을 고정한 목록 조회와 ID 지정 PATCH/DELETE 외에는 API 요청 불가.
  // longTerm 조회/저장 경로는 존재하지 않는다.
  function request(method, key, id, body, fixedChat) {
    if (!ORDER.includes(key)) throw Error('지원하지 않는 메모리 종류입니다.');
    if (!['GET','PATCH','DELETE'].includes(method)) throw Error('지원하지 않는 요청입니다.');
    if (method !== 'GET' && (!id || !/^[a-z\d_-]+$/i.test(id))) throw Error('메모리 ID가 올바르지 않습니다.');
    const chat = fixedChat || chatId();
    const path = method === 'GET'
      ? `/summaries?limit=20&type=${encodeURIComponent(TYPES[key])}&orderBy=newest${id?'&cursor='+encodeURIComponent(id):''}`
      : '/summaries/' + encodeURIComponent(id);
    return new Promise((resolve,reject) => {
      GM_xmlhttpRequest({
        method, url:`${BASE}/${encodeURIComponent(chat)}${path}`,
        headers:{'Authorization':'Bearer '+token(),'Content-Type':'application/json'},
        data:body == null?undefined:JSON.stringify(body),timeout:15000,
        onload(response) {
          if(response.status<200 || response.status>=300) return reject(Error(`API ${response.status}: ${String(response.responseText||'요청 실패').slice(0,120)}`));
          if(!response.responseText) return resolve({result:'SUCCESS'});
          try { const obj=JSON.parse(response.responseText);if(obj?.success===false || /^(?:FAIL|FAILED|FAILURE|ERROR)$/i.test(String(obj.result||'')))throw Error('서버에서 작업을 거부했습니다.');resolve(obj); }
          catch(e){reject(Error('API 응답 처리 실패: '+e.message));}
        }, onerror(){reject(Error('서버 연결 실패'));}, ontimeout(){reject(Error('서버 응답 시간 초과'));}
      });
    });
  }
  async function list(key, fixedChat) {
    const rows=[], ids=new Set(), cursors=new Set();let cursor='';
    for(let n=0;n<50;n++) {
      const response=await request('GET',key,cursor,null,fixedChat);
      const data=response?.data;
      if(!Array.isArray(data?.summaries))throw Error(`${NAMES[key]} 목록 응답이 올바르지 않습니다.`);
      for(const item of data.summaries) {
        assertType(item,key);
        const id=String(itemId(item));if(ids.has(id))throw Error('중복 메모리 ID가 발견됐습니다.');
        ids.add(id);rows.push(item);
      }
      if(!data.nextCursor) {if(data.hasNext===true)throw Error('누락된 목록 페이지가 있습니다.');return rows;}
      cursor=String(data.nextCursor);if(cursors.has(cursor))throw Error('목록 페이지가 반복됐습니다.');cursors.add(cursor);
    }
    throw Error('목록 페이지 한도를 초과했습니다.');
  }
  function leaf(text, scope=document) {
    return [...scope.querySelectorAll('button,[role="tab"],span,div,p,h1,h2,h3,h4')]
      .filter(el => shown(el) && !own(el) && narrow(el.textContent)===text && ![...el.children].some(child=>narrow(child.textContent)===text));
  }
  const hit = (label, scope) => leaf(label,scope).map(el=>el.closest('button,[role="tab"],[role="button"]')||el)[0]||null;
  function modal() {
    for(const title of leaf('요약 메모리')) {
      for(let el=title, i=0;el && i<10 && el!==document.body;i++,el=el.parentElement) {
        if(!shown(el) || !['장기 기억','단기 기억','관계도','목표'].every(t=>hit(t,el))) continue;
        const rect=el.getBoundingClientRect();
        if(rect.width>=290 && rect.width<=innerWidth*.99 && rect.height>210 && rect.height<innerHeight*.99)return el;
      }
    }
    return null;
  }
  const tabs = root => ({short:hit('단기 기억',root), relations:hit('관계도',root),goal:hit('목표',root)});
  function active(el, others) {
    if(!el)return false;
    if(el.getAttribute('aria-selected')==='true'||el.getAttribute('data-state')==='active')return true;
    if(el.getAttribute('aria-selected')==='false'||el.getAttribute('data-state')==='inactive')return false;
    const rgb=getComputedStyle(el).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if(!rgb)return false;
    const brightness=+rgb[1]+ +rgb[2]+ +rgb[3];
    return brightness>540 && others.every(other=>{
      if(!other || other===el)return true;
      const c=getComputedStyle(other).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return !c || brightness-(+c[1]+ +c[2]+ +c[3])>65;
    });
  }
  function tabKey(root){const options=tabs(root),group=Object.values(options);return ORDER.find(key=>active(options[key],group))||null;}
  function canEdit(root) {
    if(!root)return false;
    return [...root.querySelectorAll('div,span,p')].some(el =>shown(el) && el.children.length<4 && narrow(el.textContent).length<115 && /단기\s*기억.*관계도.*목표.*이번\s*턴.*수정\s*가능/.test(narrow(el.textContent)));
  }
  const badges = root=>[...root.querySelectorAll('span,div,b,strong')].filter(el=>shown(el)&&!own(el)&&el.children.length===0&&narrow(el.textContent)==='N');
  function currentTurn() {
    for(const el of document.querySelectorAll('span,small,div')) {
      if(shown(el)&&!own(el)&&el.children.length<3 && MIN_TURN_RE.test(narrow(el.textContent))) return narrow(el.textContent).replace(/\s/g,'');
    }
    return null;
  }
  function generation(root) {
    if(!canEdit(root))return null;
    const turn=currentTurn();
    return turn ? `${chatKey()}::${turn}` : null;
  }
  async function selectTab(key) {
    let view=modal();if(!canEdit(view))throw Error('이번 턴의 수정 가능 화면이 아닙니다.');
    if(tabKey(view)!==key) {
      const button=tabs(view)[key];if(!button)throw Error('메모리 탭을 찾지 못했습니다.');button.click();
      for(let n=0;n<30;n++) {await delay(80);view=modal();if(view && tabKey(view)===key)break;}
    }
    if(!view || tabKey(view)!==key)throw Error(`${NAMES[key]} 탭 전환 실패`);
    return view;
  }
  function titleFromBadge(badge) {
    const direct=narrow(badge.parentElement?.textContent).replace(/\s*N\s*$/,'').replace(/^N\s*/,'').trim();
    if(direct && direct.length<=55)return direct;
    // 카드 제목은 N 뱃지와 같은 헤더 영역에서 표시된다.
    for(let el=badge.parentElement,n=0;el && n<3;n++,el=el.parentElement) {
      const near=[...el.querySelectorAll('strong,b,span,p,h3,h4,div')]
        .filter(x=>shown(x)&&x.children.length===0&&x!==badge&&Math.abs(x.getBoundingClientRect().top-badge.getBoundingClientRect().top)<25)
        .map(x=>narrow(x.textContent)).filter(x=>x && x!=='N' && x.length<=55);
      if(near.length===1)return near[0];
    }
    return '';
  }
  function targetsOnScreen(root,key) {
    if(!canEdit(root)||tabKey(root)!==key)throw Error('현재 수정 가능한 탭을 확인하지 못했습니다.');
    const marks=badges(root);
    if(key==='goal') {
      if(marks.length>1)throw Error('목표 N 표시가 여러 개입니다.');
      if(!marks.length)return [];
      const label=leaf('주어진 목표',root).find(el=>Math.abs(el.getBoundingClientRect().top-marks[0].getBoundingClientRect().top)<65);
      if(!label)throw Error('목표의 N 표시를 확인하지 못했습니다.');
      return [{title:'주어진 목표'}];
    }
    const titles=marks.map(titleFromBadge);
    if(titles.some(title=>!title))throw Error(`${NAMES[key]} 신규 항목 제목을 확인하지 못했습니다.`);
    if(new Set(titles).size!==titles.length)throw Error(`${NAMES[key]}에 제목이 같은 신규 항목이 있어 중단했습니다.`);
    return titles.map(title=>({title}));
  }
  function matchItems(screen, server, key) {
    return screen.map(row => {
      const found=server.filter(item => narrow(item.title)===narrow(row.title));
      if(found.length!==1)throw Error(`${NAMES[key]} '${row.title}'의 서버 항목 ${found.length}개가 일치합니다.`);
      assertType(found[0],key);return found[0];
    });
  }
  async function mutate(key, item, method, payload, chat) {
    assertType(item,key);
    const id=String(itemId(item));
    const before=(await list(key,chat)).find(x=>String(itemId(x))===id);
    if(!before || narrow(before.title)!==narrow(item.title) || String(before.summary??'')!==String(item.summary??''))throw Error(`${NAMES[key]} 항목이 작업 중 변경됐습니다.`);
    await request(method,key,id,payload,chat);
    const after=(await list(key,chat)).find(x=>String(itemId(x))===id);
    if(method==='DELETE' && after)throw Error(`${NAMES[key]} 서버 삭제 확인 실패`);
    if(method==='PATCH' && (!after || String(after.summary??'')!==String(payload.summary)))throw Error('목표 서버 저장 확인 실패');
  }
  async function execute(keys, auto=false, expectedTurn=null) {
    if(processing)return;
    processing=true;draw();
    try {
      const view=modal();if(!canEdit(view))throw Error('수정 가능한 요약메모리 창을 열어주세요.');
      const signature=generation(view);
      if(auto && (!signature || signature!==expectedTurn))throw Error('자동 처리 대상 턴이 바뀌었습니다.');
      const fixedChat=chatId();
      const requests=keys.filter(k=>ORDER.includes(k));
      if(!requests.length)return;
      if(requests.includes('goal')&&!narrow(config.goal.content))throw Error('설정에서 목표 대체 문구를 입력해주세요.');
      // 수정 가능 UI 및 N 대상은 API 요청 전에만 읽는다. 서버 요청 중
      // 요약메모리 창이나 선택 탭의 변화는 중단 조건이 아니다.
      const plan=[];
      for(const key of ['goal','short','relations'].filter(x=>requests.includes(x))) {
        const panel=await selectTab(key);
        const marks=targetsOnScreen(panel,key);
        if(!marks.length)continue;
        const items=await list(key,fixedChat);
        const targets=key==='goal' ? (items.length===1?[items[0]]:null) : matchItems(marks,items,key);
        if(!targets)throw Error('목표 서버 항목을 하나로 특정하지 못했습니다.');
        for(const item of targets) {assertType(item,key);plan.push({key,item});}
      }
      // 조회 도중 채팅 이동 시 잘못된 채팅의 항목을 변경하지 않는다.
      if(chatId()!==fixedChat)throw Error('작업 중 채팅이 변경됐습니다.');
      let changes=0;
      for(const {key,item} of plan) {
        if(chatId()!==fixedChat)throw Error('작업 중 채팅이 변경됐습니다.');
        if(key==='goal') {
          if(String(item.summary??'')===config.goal.content)continue;
          await mutate('goal',item,'PATCH',{summary:config.goal.content},fixedChat);
        } else await mutate(key,item,'DELETE',null,fixedChat);
        changes++;
      }
      if(signature){tries[signature]={...(tries[signature]||{}),...Object.fromEntries(requests.map(k=>[k,true]))};trim(tries,120);store('attempts',tries);}
      log(`${auto?'자동':'직접'} 적용 완료 (${changes}개)`);
      notify(changes ? `${changes}개 적용 완료`:'처리할 신규 항목 없음');
      return true;
    } catch(e) {fail(e.message||String(e));return false;}
    finally {processing=false;queueScan();draw();}
  }

  // 업데이트 알림은 페이지 표시만 감지한다. 시스템 알림은 사용하지 않는다.
  function notices() {
    return [...document.querySelectorAll('div,p,span,[role="status"],[role="alert"]')]
      .filter(el=>shown(el)&&!own(el) && narrow(el.textContent).length<130 && UPDATE_RE.test(narrow(el.textContent)))
      .filter(el=>![...el.children].some(child=>UPDATE_RE.test(narrow(child.textContent))));
  }
  function updateNotice() {
    const detected=notices();
    for(const el of detected)el.classList.add('cmm4-highlight');
    if(!detected.length)return;
    const signature=`notice:${chatKey()}:${currentTurn()||narrow(detected[0].textContent)}`;
    if(seen["notice:"+chatKey()]!==signature) {freshEvent=true;markEvent(signature);if(enabled().length)openForAuto();}
  }
  function openForAuto() {
    if(openingForAuto || modal())return;
    const trigger=leaf('요약 메모리').map(el=>el.closest('button,[role="button"]')||el).find(el=>shown(el)&&!el.closest('[role="dialog"]'));
    if(!trigger)return; // 자동 처리 중에도 편집 UI가 없다면 저장 요청을 보내지 않는다.
    openingForAuto=true;
    trigger.click();
    setTimeout(()=>{openingForAuto=false;queueScan();},800);
  }
  function markEvent(signature) {
    const chat=chatKey(), eventKey=(signature.startsWith('notice:')?'notice:':'turn:')+chat;
    if(seen[eventKey]===signature)return;
    seen[eventKey]=signature;trim(seen,100);store('known',seen);
    pending={key:chat,signature};store('pending',pending);draw();
  }
  function acknowledge() {pending=null;store('pending',null);draw();}
  function trim(obj,max) {while(Object.keys(obj).length>max)delete obj[Object.keys(obj)[0]];}
  function enabled(){return ORDER.filter(key=>config[key].mode==='auto'&&(key!=='goal'||narrow(config.goal.content)));}
  function checkAuto(view) {
    const signature=generation(view);
    if(!signature)return;
    const marked=badges(view).length>0;
    if(marked || freshEvent)markEvent('turn:'+signature);
    // 새 버전 설치 직후 이전 턴의 항목을 자동으로 처리하지 않는다.
    // 단, 그 순간 새 업데이트 알림도 새로 감지했다면 진행한다.
    if(!initialScanned) {initialScanned=true;initialSignature=freshEvent?null:signature;if(!freshEvent)return;}
    if(initialSignature===signature && !freshEvent)return;
    if(!marked && !freshEvent && seen['turn:'+chatKey()]!=='turn:'+signature)return;
    if(processing||polling)return;
    const todo=enabled().filter(key=>!tries[signature]?.[key]);
    if(!todo.length)return;
    polling=true;freshEvent=false;
    for(const key of todo)tries[signature]={...(tries[signature]||{}),[key]:true};
    trim(tries,120);store('attempts',tries);
    // 예약된 자동 처리는 한 번만 시도한다. 실패 시 수동 버튼으로 재시도.
    setTimeout(async()=>{try {await execute(todo,true,signature);}finally{polling=false;}},180);
  }
  // 새 요약메모리가 나타난 경우 현재 탭이 장기기억일 수 있으므로,
  // 현재 턴 안내 표시와 N 표시가 있으면 첫 검사 후 다른 탭에서도 확인한다.
  // 실제 자동 작업은 execute()에서 N 항목을 분류별로 검증한다.

  const styles=`
    :host{all:initial;color:#f3eff7;font:13px system-ui,'Malgun Gothic',sans-serif}
    *{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer;color:#f5f0fa;background:#282330;border:1px solid #574c62;border-radius:8px;padding:7px}button:hover{background:#3d304f}button:disabled{opacity:.45;cursor:default}
    .rail{display:flex;flex-direction:column;gap:5px;padding:6px;background:#18151deF;border:1px solid #584966;border-radius:11px;box-shadow:0 8px 25px #0008;width:96px}
    .rail button{height:33px;width:100%;font-size:12px;font-weight:600;padding:4px}.rail .main{background:#6f51a1;border-color:#8766b8}.rail .gear{font-size:18px;height:30px}
    .shade{position:fixed;inset:0;background:#000a;display:grid;place-items:center;z-index:2147483647;padding:12px}
    .dialog{background:#1b1721;border:1px solid #584966;border-radius:13px;padding:18px;width:min(430px,94vw);max-height:90vh;overflow:auto;box-shadow:0 18px 58px #0009}
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.header strong{font-size:17px}
    .opt{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #393141}.opt span{font-weight:600}.opt small{font-size:11px;color:#bfb2ce;margin-right:7px}
    input[type=checkbox]{accent-color:#9e75d2;width:18px;height:18px;vertical-align:middle}
    textarea{width:100%;margin-top:8px;min-height:90px;padding:9px;color:white;background:#100e13;border:1px solid #574865;border-radius:9px;resize:vertical}
    .actions{display:flex;justify-content:flex-end;margin-top:14px}.actions button{background:#6f51a1}
    details{margin-top:15px;padding-top:8px;border-top:1px solid #403449;color:#bdb1c7;font-size:12px}pre{font:11px/1.5 monospace;white-space:pre-wrap;max-height:150px;overflow:auto}
    .sticky{position:fixed;right:18px;bottom:17px;background:#382942;border:1px solid #9979c0;color:#fff;padding:9px 13px;border-radius:10px;z-index:2147483645;box-shadow:0 8px 25px #0007;font-weight:600}
    .toast{position:fixed;left:14px;bottom:14px;max-width:420px;background:#30263a;border:1px solid #9177b1;border-radius:10px;padding:9px 12px;color:#fff;z-index:2147483645;box-shadow:0 8px 25px #0008}
    .toast.error{background:#4a2727;border-color:#bd8888}
  `;
  function ensureUI() {
    if(!document.body)return;
    if(!document.querySelector('#cmm4-native-style')){
      const style=document.createElement('style');style.id='cmm4-native-style';style.textContent='.cmm4-highlight{outline:2px solid #e6b65a!important;outline-offset:2px!important;background:rgba(230,182,90,.17)!important;border-radius:5px!important}';document.head.append(style);
    }
    if(!rootHost?.isConnected){
      rootHost=document.createElement('div');rootHost.id='cmm4-root';rootHost.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483646';
      shadow=rootHost.attachShadow({mode:'open'});
      shadow.innerHTML=`<style>${styles}</style><div id="sticky-slot"></div><div id="toast-slot"></div><div id="settings-slot"></div>`;
      document.body.append(rootHost);
    }
    if(!sidebar?.isConnected){
      sidebar=document.createElement('div');sidebar.id='cmm4-side';sidebar.style.cssText='position:fixed;z-index:2147483645;width:96px;';
      const side=sidebar.attachShadow({mode:'open'});
      side.innerHTML=`<style>${styles}</style><div class="rail"><button class="main" id="all">일괄적용</button><button id="one">일괄삭제</button><button class="gear" id="settings" aria-label="설정" title="설정">⚙</button></div>`;
      side.getElementById('all').onclick=()=>execute(ORDER);
      side.getElementById('one').onclick=()=>{const view=modal(),key=view&&tabKey(view);if(key)execute([key]);};
      side.getElementById('settings').onclick=openSettings;
      document.body.append(sidebar);
    }
  }
  function renderLog(){const el=shadow?.getElementById('logs');if(el)el.textContent=logs.join('\n')||'기록 없음';}
  function notify(message,error=false) {
    ensureUI();const slot=shadow.getElementById('toast-slot');slot.replaceChildren();
    const el=document.createElement('div');el.className='toast'+(error?' error':'');el.style.pointerEvents='auto';el.textContent=message;slot.append(el);
    setTimeout(()=>el.remove(),error?9000:3500);
  }
  function draw() {
    ensureUI();if(!shadow)return;
    const view=modal(),editable=canEdit(view),key=view&&tabKey(view);
    sidebar.style.display=view?'':'none';
    if(view) {
      const r=view.getBoundingClientRect();let left=r.right+10;
      if(left+100>innerWidth-8)left=Math.max(8,r.left-106);
      sidebar.style.left=`${Math.round(left)}px`;sidebar.style.top=`${Math.max(8,Math.min(innerHeight-140,r.top+70))}px`;
      const side=sidebar.shadowRoot;
      side.getElementById('all').disabled=processing||!editable;
      side.getElementById('one').disabled=processing||!editable||!key;
      side.getElementById('one').textContent=key==='goal'?'대체 적용':'일괄삭제';
    }
    const slot=shadow.getElementById('sticky-slot');
    if(config.sticky && pending?.key===chatKey()) {
      if(!slot.firstChild){const button=document.createElement('button');button.className='sticky';button.textContent='요약메모리 업데이트 · 확인';button.style.pointerEvents='auto';button.onclick=acknowledge;slot.append(button);}
    } else slot.replaceChildren();
  }
  function openSettings(){
    ensureUI();settingsOpen=true;
    const slot=shadow.getElementById('settings-slot');slot.replaceChildren();
    const shade=document.createElement('div');shade.className='shade';shade.style.pointerEvents='auto';
    const box=document.createElement('section');box.className='dialog';
    box.innerHTML=`<div class="header"><strong>요약메모리 설정</strong><button id="close" aria-label="닫기">✕</button></div><div id="options"></div><div style="margin-top:13px"><b>목표 대체 문구</b><textarea id="goal" aria-label="목표 대체 문구"></textarea></div><div id="extra"></div><div class="actions"><button id="save">저장</button></div><details><summary>실행 기록</summary><pre id="logs"></pre></details>`;
    shade.onclick=e=>{if(e.target===shade)closeSettings();};
    box.querySelector('#close').onclick=closeSettings;box.querySelector('#save').onclick=()=>{save();closeSettings();};
    shade.append(box);slot.append(shade);
    const controls=box.querySelector('#options');
    for(const [key,onLabel] of [['short','자동삭제'],['relations','자동삭제'],['goal','자동대체']]){
      const label=document.createElement('label');label.className='opt';
      label.innerHTML=`<span>${NAMES[key]}</span><div><small>${config[key].mode==='auto'?onLabel:'직접관리'}</small><input type="checkbox" ${config[key].mode==='auto'?'checked':''}></div>`;
      const input=label.querySelector('input'),small=label.querySelector('small');
      input.onchange=()=>{if(input.checked)skipCurrentAuto(key);config[key].mode=input.checked?'auto':'manual';small.textContent=input.checked?onLabel:'직접관리';save();};
      controls.append(label);
    }
    const field=box.querySelector('#goal');field.value=config.goal.content;field.oninput=()=>{config.goal.content=field.value;save();};
    const label=document.createElement('label');label.className='opt';label.innerHTML=`<span>알림 표지 유지</span><input type="checkbox" ${config.sticky?'checked':''}>`;
    label.querySelector('input').onchange=e=>{config.sticky=e.target.checked;save();};box.querySelector('#extra').append(label);
    renderLog();
  }
  function closeSettings(){settingsOpen=false;shadow?.getElementById('settings-slot')?.replaceChildren();}
  function save(){store('settings',config);draw();}
  function skipCurrentAuto(key){const current=generation(modal());if(!current)return;tries[current]={...(tries[current]||{}),[key]:true};store('attempts',tries);}
  function queueScan(){if(scanTimer)return;scanTimer=setTimeout(()=>{scanTimer=0;scan();},240);}
  function scan(){
    if(!document.body)return;
    if(lastURL!==location.href){lastURL=location.href;initialScanned=false;initialSignature=null;freshEvent=false;}
    try {ensureUI();updateNotice();const view=modal();if(view)checkAuto(view);draw();}
    catch(e){console.warn('[크랙 요약메모리 관리] 화면 감지 오류',e);}
  }
  function init() {
    ensureUI();
    if(typeof GM_registerMenuCommand==='function')GM_registerMenuCommand('요약메모리 설정',openSettings);
    new MutationObserver(queueScan).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','aria-selected','data-state']});
    setInterval(queueScan,1800);
    window.addEventListener('resize',queueScan,{passive:true});
    window.addEventListener('scroll',queueScan,{passive:true,capture:true});
    scan();log('v4 실행');
  }
  if(document.body)init();else document.addEventListener('DOMContentLoaded',init,{once:true});
})();
