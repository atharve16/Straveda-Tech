/* orders.js — Order workflow UI (Rohan Energy creates → HPCL approves).
 * Loaded after the main portal script. It adds its own tabs/sections after sign-in and talks only to orders.php
 * (plus auth.php for the admin "Users & Zones" page). The Dashboard / Raw Data pages are not touched.
 * All permissions are enforced by the server; this file only decides what to show.
 */
(function(){
'use strict';
const BASE=(document.currentScript&&document.currentScript.src||'').replace(/[^\/]*$/,'');   // folder this file was loaded from (the Sales Order PDF scripts sit next to it)

const TABS={
  rohan:[['neworder','New Order'],['myorders','My Orders'],['approvals','Pending Approvals'],['returns','Returns'],['sap','SAP Numbers']],
  hpcl :[['approvals','Pending Approvals'],['allorders','All Orders'],['returns','Returns'],['neworder','New Order'],['sap','SAP Numbers']],
  admin:[['approvals','Pending Approvals'],['allorders','All Orders'],['returns','Returns'],['neworder','New Order'],['inventory','Inventory'],['foc','FOC'],['sap','SAP Numbers'],['roreport','RO Report'],['perms','Permissions'],['zones','Users & Zones']]
};
const TABS_BASE=JSON.parse(JSON.stringify(TABS));   // a Zone Officer also gets the "Regional Officers" tab (added in init)
const ALL_TABS=['neworder','myorders','approvals','allorders','returns','inventory','foc','sap','roreport','perms','zones','team','outlets','officers','profile','superiors'];
/* everybody lands on the Dashboard after signing in (or, when the Dashboard is switched off for the user, on the first page they have) */
function hiddenPage(t){return !!(OM.hidden&&OM.hidden.has(t));}
function firstPage(){
  const ids=['dashboard','rawdata','mis'].concat((TABS[OM.kind]||[]).map(t=>t[0]));
  if(OM.kind==='admin'&&!OM.hsuper)ids.splice(3,0,'admin');
  return ids.find(t=>!hiddenPage(t))||'dashboard';
}
const ST_LBL={draft:'Draft',pending:'Pending approval',approved:'Approved',rejected:'Rejected'};
const ORG_LBL={rohan:'Rohan Energy',hpcl:'HPCL'};
const CHIP_LBL={rohan:'Rohan Energy',hpcl:'HPCL',admin:'Super Admin'};

const OM={hsuper:false,kind:null,meta:null,editing:null,keepEdit:false,current:null,detail:null,filters:{},rows:{},sig:{},formItems:[],roState:{},timers:{},users:null,user:'',pollT:null};

const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtN=n=>Number(n||0).toLocaleString('en-IN');
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(d){if(!d)return'—';const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(d);return m?`${+m[3]} ${MON[+m[2]-1]} ${m[1]}`:esc(d);}
function fmtDS(d){if(!d)return'—';const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(d);return m?`${+m[3]} ${MON[+m[2]-1]}`:esc(d);}
function fmtDT(d){if(!d)return'—';const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(d);return m?`${+m[3]} ${MON[+m[2]-1]} ${m[1]}, ${m[4]}:${m[5]}`:esc(d);}
function fmtDTS(d){if(!d)return'—';const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(d);return m?`${+m[3]} ${MON[+m[2]-1]}, ${m[4]}:${m[5]}`:esc(d);}
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function toast(msg,type){if(typeof showToast==='function')showToast(msg,type||'ok');}
function itemsCell(o){
  const it=o.items||[];
  if(!it.length)return'—';
  return it.map(i=>esc(i.item)+(it.length>1?` × ${fmtN(i.ea)}`:'')).join('<br>');
}
function pill(s){return `<span class="om-pill p-${esc(s)}">${esc(ST_LBL[s]||s)}</span>`;}
/* delivery stage of an approved order, shown next to the status pill */
function stagePill(o){return (o.status==='approved'&&STAGE_LBL[o.delivery_stage]?` <span class="om-pill p-${o.delivery_stage}">${STAGE_LBL[o.delivery_stage]}</span>`:'')+retPill(o);}
function waitDays(o){
  if(!o.submitted_at)return null;
  const t=Date.parse(o.submitted_at.replace(' ','T'));
  if(isNaN(t))return null;
  return Math.max(0,Math.floor((Date.now()-t)/86400000));
}
function waiting(o){
  const d=waitDays(o);
  if(d===null)return'—';
  if(d<1)return'<span class="om-wait">Today</span>';
  return `<span class="om-wait ${d>=2?'w2':'w1'}">${d} day${d>1?'s':''}</span>`;
}
function monthOptions(sel){
  const now=new Date();let h='<option value="">All months</option>';
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const v=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    h+=`<option value="${v}"${sel===v?' selected':''}>${MON[d.getMonth()]} ${d.getFullYear()}</option>`;
  }
  return h;
}
/* Super Admin switches (Permissions tab), as sent by the server */
function perms(){return (OM.meta&&OM.meta.perms)||{hpcl_edit_rates:false,auto_invoice:true,hpcl_receipt:true,hpcl_tax_invoice:true,ret_rohan_admin:true,ret_rohan_zone:false,ret_rohan_regional:false,ret_hpcl_admin:false,ret_hpcl_zone:false,ret_hpcl_regional:false};}
function canHpclRates(){return perms().hpcl_edit_rates;}
function approverNames(){return ((OM.meta&&OM.meta.approvers)||[]).map(a=>a.label);}
/* "Anil, Rahul" for a few officers, "the 31 HPCL officers of this zone" when a zone has many */
function approverText(list,zone,bold){
  const n=(list||[]).map(a=>a.label||a);
  if(n.length<=3)return n.map(x=>bold?`<b>${esc(x)}</b>`:esc(x)).join(', ');
  return `the ${n.length} HPCL officers of ${esc(zone||'your zone')}`;
}
/* who decided an order: ' (HPCL)', ' (Rohan)' for a Rohan officer, ' (Super Admin)' for the Rohan super admin */
function decidedTag(o){if(/super admin/i.test(o.decided_by_name||''))return '';return o.decided_org==='hpcl'?' (HPCL)':o.decided_org==='rohan'?' (Rohan)':o.decided_org==='admin'?' (Super Admin)':'';}
function officerCell(o){
  if(o.decided_by_name)return esc(o.decided_by_name)+decidedTag(o);
  const n=(OM.meta&&OM.meta.approvers)||[];
  return (n.length?(n.length<=3?approverText(n):`<span class="om-sub">Any of ${n.length} HPCL officers</span>`):'')+`<div class="om-sub">${n.length?'or ':''}Rohan Energy</div>`;
}

/* ── API ── */
async function parse(r){
  let j=null;
  try{j=await r.json();}catch(e){const er=new Error('Unexpected response from the server ('+r.status+').');er.status=r.status;throw er;}
  if(!r.ok||!j||!j.ok){const er=new Error((j&&j.error)||'Request failed.');er.fields=j&&j.fields;er.status=r.status;throw er;}
  return j;
}
function omGet(params){return fetch('orders.php?'+new URLSearchParams(Object.assign({},params,{_:Date.now()})),{credentials:'same-origin',cache:'no-store'}).then(parse);}
function omPost(action,data){
  return fetch('orders.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({},data,{action,csrf:typeof _csrf==='string'?_csrf:''}))}).then(parse);
}
function authGet(action){return fetch('auth.php?action='+action+'&_='+Date.now(),{credentials:'same-origin',cache:'no-store'}).then(parse);}
function authPost(action,data){
  return fetch('auth.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({},data,{action,csrf:typeof _csrf==='string'?_csrf:''}))}).then(parse);
}

/* ── remember where the user is (tab, open order / edit form, filters) so a browser refresh brings them back to the same page ── */
const VIEW_KEY='omView';
const BOOT_VIEW=(function(){try{return JSON.parse(sessionStorage.getItem(VIEW_KEY)||'null');}catch(e){return null;}})();   // read once, before anything overwrites it
function saveView(){
  if(!OM.kind)return;
  const mine=ALL_TABS.includes(OM.current);
  try{sessionStorage.setItem(VIEW_KEY,JSON.stringify({u:OM.user,kind:OM.kind,tab:mine?OM.current:null,
    detail:mine&&OM.detail?OM.detail.id:null,edit:mine&&OM.current==='neworder'&&OM.editing&&OM.editing.id?OM.editing.id:null,
    back:OM.editBack||null,filters:OM.filters}));}catch(e){}
}
function forgetView(){try{sessionStorage.removeItem(VIEW_KEY);}catch(e){}}
/* put the user back where they were; true when an order screen was restored (or the best fallback was shown), false to use the default landing page */
const HOME_TAB={admin:'approvals',hpcl:'approvals',rohan:'myorders'};
async function restoreView(kind){
  const bv=BOOT_VIEW&&BOOT_VIEW.kind===kind&&BOOT_VIEW.u===OM.user?BOOT_VIEW:null;
  if(!bv||!bv.tab)return false;
  try{
    if(bv.filters&&typeof bv.filters==='object')OM.filters=bv.filters;
    if(bv.tab==='neworder'&&bv.edit){
      const back=TABS[kind].some(t=>t[0]===bv.back)&&bv.back!=='neworder'?bv.back:HOME_TAB[kind];
      OM.editBack=back;
      try{
        const j=await omGet({action:'get',id:bv.edit});
        if(OM.kind!==kind)return true;
        OM.editing=j.order;OM.keepEdit=true;showTab('neworder');return true;
      }catch(e){   // the order was changed / removed meanwhile: land on the list it was opened from, and say why
        if(OM.kind!==kind)return true;
        showTab(back);toast('Could not reopen the order you were editing: '+e.message,'er');return true;
      }
    }
    if(!TABS[kind].some(t=>t[0]===bv.tab))return false;
    showTab(bv.tab);
    if(bv.detail&&!['neworder','zones','team','inventory','foc','sap','roreport','perms','officers','profile','superiors'].includes(bv.tab))openDetail(bv.detail);
    return true;
  }catch(e){return false;}
}

/* ── live updates: while a list or an order page is open the portal re-checks the server every few seconds, so new orders,
 *    status changes and uploaded files appear without a refresh. Forms, popups and half-typed input are never touched. ── */
const POLL_MS=10000;
let polling=false;
function startPoll(){stopPoll();OM.pollT=setInterval(pollTick,POLL_MS);}
function stopPoll(){if(OM.pollT)clearInterval(OM.pollT);OM.pollT=null;}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&OM.kind)pollTick();});
window.addEventListener('focus',()=>{if(OM.kind)pollTick();});
function modalOpen(){const ov=$('om-overlay');return !!ov&&ov.classList.contains('show');}
function userIsTyping(root){
  const a=document.activeElement;
  if(a&&root&&root.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return true;
  return !!root&&[...root.querySelectorAll('input[type=file]')].some(f=>f.files&&f.files.length);
}
async function pollTick(){
  if(!OM.kind||document.hidden||polling)return;
  polling=true;
  try{
    const prev=OM.meta&&OM.meta.awaiting?OM.meta.awaiting.count:null;
    const m=await refreshMeta();
    if(prev!==null&&m.awaiting&&m.awaiting.count>prev&&(OM.kind==='admin'||OM.kind==='hpcl'||OM.kind==='rohan')){
      const n=m.awaiting.count-prev;toast(n===1?'1 new order is waiting for your approval':n+' new orders are waiting for your approval');
    }
    if(modalOpen())return;
    const tab=OM.current;
    if(OM.detail&&OM.detail.tab===tab&&tab)await refreshDetail();
    else if(!OM.detail&&(tab==='myorders'||tab==='approvals'||tab==='allorders'))await refreshList(tab,m);
    else if(!OM.detail&&tab==='returns')await loadReturns(true);
  }catch(e){/* a missed check is fine, the next one retries */}
  finally{polling=false;}
}
async function refreshList(tab,m){
  const key=JSON.stringify(listParams(tab));
  const l=await omGet(listParams(tab));
  if(OM.current!==tab||OM.detail||key!==JSON.stringify(listParams(tab)))return;   // the user moved on or changed a filter meanwhile
  const sig=JSON.stringify(l.orders);
  if(OM.sig[tab]===sig)return;
  OM.sig[tab]=sig;OM.rows[tab]=l.orders;
  renderMetrics(tab,m||OM.meta,l.orders);
  drawTable(tab);
}
async function refreshDetail(){
  const d=OM.detail;if(!d)return;
  const j=await omGet({action:'get',id:d.id});
  if(!OM.detail||OM.detail.id!==d.id||OM.current!==d.tab)return;
  const sig=JSON.stringify(j.order);
  if(sig===d.sig)return;
  const sec=$('tab-'+d.tab);if(!sec||modalOpen()||userIsTyping(sec))return;   // try again at the next check
  const y=window.scrollY;
  sec.innerHTML=detailPage(j.order);
  window.scrollTo(0,y);
  d.sig=sig;
  toast('This order was updated');
}

/* ── setup / teardown ── */
function kindOf(u){
  if(!u)return null;
  if(u.role==='superadmin')return'admin';
  if(u.role==='zone'&&u.org==='rohan')return'rohan';
  if(u.role==='zone'&&u.org==='hpcl')return'hpcl';
  return null;
}
function teardown(){
  document.querySelectorAll('.om-tab,.om-section,.om-chip,#om-overlay').forEach(e=>e.remove());
  const mb=$('mis-tab-btn'),rd=$('rawdata-tab-btn');   // the MIS tab goes back behind Raw Data (officers get it after their order tabs, see init)
  if(mb&&rd&&rd.parentNode&&rd.nextSibling!==mb)rd.parentNode.insertBefore(mb,rd.nextSibling);
  stopPoll();
  OM.hidden=null;['dashboard-tab-btn','rawdata-tab-btn','mis-tab-btn'].forEach(id=>{const b=$(id);if(b)b.style.display='';});
  OM.kind=null;OM.hsuper=false;OM.meta=null;OM.editing=null;OM.current=null;OM.detail=null;OM.filters={};OM.rows={};OM.sig={};OM.users=null;OM.sas=null;OM.level=null;OM.outlet=false;
}
function init(user){
  teardown();
  const kind=kindOf(user);
  if(!kind)return;
  OM.kind=kind;OM.rateMode=false;OM.focMode=false;OM.user=String(user.username||user.label||'');
  OM.hidden=new Set(Array.isArray(user.hidden_pages)?user.hidden_pages:[]);   // pages switched off for this user (Users & Zones -> Edit -> Page access)
  OM.hsuper=kind==='admin'&&user.org==='hpcl';   // HPCL Super Admin: HPCL-only accounts, no Inventory / Permissions / Admin pages, cannot edit orders or invoices
  OM.level=kind==='admin'?'admin':(user.level==='regional'?'regional':'zone');
  OM.outlet=!!user.outlet;   // the SAP No. login: an HPCL Regional Officer limited to ONE SAP number (same pages, same actions)
  // Zone Officers (Rohan Energy or HPCL) manage their Regional Officers; Regional Officers do not
  TABS[kind]=TABS_BASE[kind].filter(t=>!(OM.hsuper&&(t[0]==='inventory'||t[0]==='foc'||t[0]==='perms'))).concat(OM.level==='zone'?[['team','Regional Officers'],['roreport','RO Report']]:[]);
  // Outlet profiles (an HPCL login per SAP number) are made by the Super Admins and the HPCL Zone Officers; an outlet login itself only has its own orders
  if(kind==='admin'||(kind==='hpcl'&&OM.level==='zone'))TABS[kind]=TABS[kind].concat([['outlets','Outlet Profiles']]);
  if(OM.outlet)TABS[kind]=TABS[kind].concat([['officers','My Officers']]);   // an outlet login sees who has access to its SAP number
  const tabs=document.querySelector('#app .tabs');
  const app=$('app');
  TABS[kind].forEach(([id,label])=>{
    if(!hiddenPage(id)){
    const b=document.createElement('button');
    b.className='tab-btn om-tab';b.id='om-tab-'+id;
    b.setAttribute('onclick',`showTab('${id}')`);
    b.innerHTML=esc(label)+`<span class="om-badge" id="om-badge-${id}" style="display:none"></span>`;
    tabs.appendChild(b);
    }
    const s=document.createElement('div');   // (the page itself always exists: an order can still be edited when New Order is switched off)
    s.id='tab-'+id;s.className='content om-section';s.style.display='none';
    s.addEventListener('click',onClick);
    app.appendChild(s);
  });
  {const ps=document.createElement('div');ps.id='tab-profile';ps.className='content om-section';ps.style.display='none';ps.addEventListener('click',onClick);app.appendChild(ps);}   // the Profile page (opened from the top bar, no tab button)
  {const ss=document.createElement('div');ss.id='tab-superiors';ss.className='content om-section';ss.style.display='none';ss.addEventListener('click',onClick);app.appendChild(ss);}   // the My superiors page (opened from the Profile page)
  if(kind==='hpcl'||kind==='rohan'){const mb=$('mis-tab-btn');if(mb)tabs.appendChild(mb);}
  [['dashboard','dashboard-tab-btn'],['rawdata','rawdata-tab-btn'],['mis','mis-tab-btn'],['admin','admin-tab-btn'],['entry','entry-tab-btn']].forEach(([pg,bid])=>{const b=$(bid);if(b&&hiddenPage(pg))b.style.display='none';});   // switched-off pages of the original portal   // officers: order tabs first, the MIS (open to everybody) after them
  if(kind==='admin'&&!TABS[kind].some(t=>t[0]==='neworder')){   // (both super admins have a "New Order" tab, see TABS - this is only a safety net)
    const s=document.createElement('div');
    s.id='tab-neworder';s.className='content om-section';s.style.display='none';
    s.addEventListener('click',onClick);
    app.appendChild(s);
  }
  const who=document.querySelector('.tb-user');
  if(who){const c=document.createElement('span');c.className='om-chip om-chip-'+(OM.hsuper?'hpcl':kind);c.textContent=(OM.hsuper?'HPCL Super Admin':CHIP_LBL[kind])+(OM.level==='zone'?' · Zone Officer':OM.outlet?' · Outlet '+(user.sap_code||''):OM.level==='regional'?' · Regional Officer':'');who.parentNode.insertBefore(c,who);}
  const ov=document.createElement('div');
  ov.id='om-overlay';ov.className='om-overlay';
  ov.addEventListener('mousedown',e=>{if(e.target===ov)closeModal();});
  ov.addEventListener('click',onClick);
  document.body.appendChild(ov);
  document.addEventListener('keydown',escKey);
  refreshMeta().then(()=>{outletHeader();userHeader();}).catch(()=>{});
  // the Dashboard, Raw Data and Export stay available to officers too: they are common to every user (officers still land on their order screens)
  startPoll();
  const appEl=$('app'),mask=!!BOOT_VIEW&&!!BOOT_VIEW.tab&&BOOT_VIEW.kind===kind;
  if(mask&&appEl)appEl.style.visibility='hidden';   // the original sign-in code opened the dashboard first: keep it out of sight until the saved page is back
  const unmask=()=>{if(appEl)appEl.style.visibility='';};
  setTimeout(unmask,5000);   // never leave the page hidden
  restoreView(kind).then(done=>{
    unmask();
    if(done||OM.kind!==kind)return;
    const bt=window.BOOT_TAB;
    if(bt&&(bt==='mis'||bt==='dashboard'||bt==='rawdata'||TABS[kind].some(t=>t[0]===bt)))showTab(bt);   // stay on the tab we were on before the refresh (the MIS is open to everybody)
    else showTab('dashboard');   // (the showTab wrapper moves on to the first page the user has when the Dashboard is switched off)
  },()=>unmask());
}
function escKey(e){if(e.key==='Escape')closeModal();}

/* ── meta + badges ── */
async function refreshMeta(excl){
  const j=await omGet(excl>0?{action:'meta',exclude:excl}:{action:'meta'});   // exclude: the order being edited, so its own quantity is not counted against the stock
  OM.meta=j;
  const c=j.counts;
  setBadge('myorders',c.pending.count);
  setBadge('approvals',(j.awaiting||c.pending).count);   // orders waiting for this user's decision
  setBadge('returns',j.ret?j.ret.awaiting:0);   // return requests waiting for this user's decision
  return j;
}
function setBadge(tab,n){const b=$('om-badge-'+tab);if(!b)return;b.textContent=n;b.style.display=n>0?'':'none';}
async function ensureMeta(){return OM.meta||refreshMeta();}

/* ── tab switching (wraps the portal's showTab) ── */
const _showTab=window.showTab;
window.showTab=function(tab){
  if(OM.kind&&hiddenPage(tab)&&!(tab==='neworder'&&OM.keepEdit))tab=firstPage();   // a switched-off page cannot be opened (an order being edited still opens the order form)
  _showTab(tab);
  const mine=ALL_TABS.includes(tab)&&$('tab-'+tab);
  ALL_TABS.forEach(t=>{const el=$('tab-'+t);if(el)el.style.display=(t===tab&&mine)?'block':'none';});
  if(mine){
    const sf=$('shared-filters');if(sf)sf.style.display='none';
    OM.current=tab;OM.detail=null;
    if(tab==='neworder'){
      if(!OM.keepEdit)OM.editing=null;      // opening "New Order" from the tab bar always starts a blank form
      OM.keepEdit=false;
      renderForm();
    } else if(tab==='zones') renderZones();
    else if(tab==='team') renderTeam();
    else if(tab==='outlets') renderOutlets();
    else if(tab==='roreport') renderRoReport();
    else if(tab==='inventory') renderInventory();
    else if(tab==='foc') renderFoc();
    else if(tab==='sap') renderSap();
    else if(tab==='perms') renderPerms();
    else if(tab==='returns') renderReturns();
    else if(tab==='officers') renderOfficers();
    else if(tab==='profile') renderProfile();
    else if(tab==='superiors') renderSuperiors();
    else renderList(tab);
  } else OM.current=null;
  saveView();
};
const _enterApp=window.enterApp;
window.enterApp=function(user){_enterApp(user);init(user);};
const _doLogout=window.doLogout;
window.doLogout=function(){forgetView();teardown();_doLogout();};

/* ── lists ── */
function filtersFor(tab){return OM.filters[tab]||(OM.filters[tab]={status:'',q:'',month:'',from:'',to:'',zone:'',officer:'',ro:'',page:1});}
const TITLES={myorders:'My orders',approvals:'Orders pending approval',allorders:'All orders'};

function renderList(tab){
  const sec=$('tab-'+tab);if(!sec)return;
  OM.detail=null;saveView();
  const f=filtersFor(tab);
  const kind=OM.kind;
  let bar='',hdr='';
  if(tab==='approvals'){
    hdr=`<div class="om-hf"><label>Placed by</label><select data-f="officer" id="om-f-officer"><option value="">All</option></select><label>RO</label><select data-f="ro" id="om-f-rofilter"><option value="">All</option></select></div>`;
  } else {
    const statusOpts=['draft','pending','approved','rejected'];
    let filt=`<div class="fg"><label>Status</label><select data-f="status"><option value="">All</option>${statusOpts.map(s=>`<option value="${s}"${f.status===s?' selected':''}>${ST_LBL[s]}</option>`).join('')}</select></div>`;
    if(kind==='admin')filt+=`<div class="fg"><label>Zone</label><select data-f="zone"><option value="">All zones</option>${Object.keys(ZONE_STATE).map(z=>`<option${f.zone===z?' selected':''}>${esc(z)}</option>`).join('')}</select></div>`;
    filt+=`<div class="fg"><label>Month</label><select data-f="month">${monthOptions(f.month)}</select></div>`;
    filt+=`<div class="fg"><label>From</label><input type="date" data-f="from" value="${esc(f.from)}" max="${esc(f.to)}"></div><div class="fg"><label>To</label><input type="date" data-f="to" value="${esc(f.to)}" min="${esc(f.from)}"></div>`;
    filt+=`<div class="fg"><label>Search</label><input type="text" class="filter-search" data-f="q" value="${esc(f.q)}" placeholder="Order ref, outlet, SAP code…"></div>`;
    filt+=`<button class="btn-g right" style="margin-left:auto" data-act="reset" data-tab="${tab}">Reset</button>`;
    bar=`<div class="filter-bar">${filt}</div>`;
  }
  sec.innerHTML=`<div class="metrics" id="om-metrics-${tab}"></div>${bar}
    <div class="tc"><div class="th"><h3 id="om-title-${tab}">${TITLES[tab]}</h3>${tab==='myorders'?'<div class="om-hbtns">'+'<button class="btn-g" data-act="prices">₹ Set prices &amp; GST %</button><button class="btn-g" data-act="bulk">⬆ Bulk order (Excel)</button>'+'<button class="btn-p" data-act="new">+ New order</button></div>':hdr+(kind==='hpcl'&&(canHpclRates()||tab==='allorders')?`<div class="om-hbtns">${canHpclRates()?'<button class="btn-g" data-act="prices">₹ Set prices &amp; GST %</button>':''}${tab==='allorders'?'<button class="btn-g" data-act="bulk">⬆ Bulk order (Excel)</button>':''}</div>`:'')}</div>
    <div class="tw" id="om-table-${tab}"><div class="om-empty">Loading…</div></div></div>`;
  sec.querySelectorAll('[data-f]').forEach(el=>{
    const ev=el.tagName==='INPUT'?'input':'change';
    el.addEventListener(ev,()=>{
      f[el.dataset.f]=el.value;f.page=1;saveView();
      if(el.dataset.f==='from'||el.dataset.f==='to'){const o=sec.querySelector(el.dataset.f==='from'?'[data-f=to]':'[data-f=from]');if(o)o.setAttribute(el.dataset.f==='from'?'min':'max',el.value);}
      if(tab==='approvals'){drawTable(tab);return;}          // officer / RO filters work on the loaded list
      clearTimeout(OM.timers[tab]);
      OM.timers[tab]=setTimeout(()=>loadList(tab),ev==='input'?300:0);
    });
  });
  loadList(tab);
}

function listParams(tab){
  const f=filtersFor(tab);
  const params={action:'list'};
  if(tab==='approvals'){params.status='pending';params.awaiting=1;}else if(f.status)params.status=f.status;
  if(tab!=='approvals'){if(f.q)params.q=f.q;if(f.month)params.month=f.month;if(f.from)params.date_from=f.from;if(f.to)params.date_to=f.to;if(f.zone)params.zone=f.zone;}
  return params;
}
async function loadList(tab){
  const box=$('om-table-'+tab);if(!box)return;
  const params=listParams(tab);
  try{
    const [m,l]=await Promise.all([refreshMeta(),omGet(params)]);
    if(OM.current!==tab||OM.detail)return;
    OM.rows[tab]=l.orders;OM.sig[tab]=JSON.stringify(l.orders);
    renderMetrics(tab,m,l.orders);
    drawTable(tab);
  }catch(e){
    box.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load orders: ${esc(e.message)}</div>`;
  }
}

const OM_PAGE=25;
function pagerHtml(tab,page,pages,total,from){
  if(pages<2)return '';
  const b=(p,l,dis,cur)=>`<button class="btn-g${cur?' on':''}" data-act="page" data-tab="${tab}" data-p="${p}"${dis?' disabled':''}${cur?' aria-current="page"':''}>${l}</button>`;
  const set=new Set([1,pages,page-1,page,page+1]);let nums='',last=0;
  [...set].filter(p=>p>=1&&p<=pages).sort((a,c)=>a-c).forEach(p=>{if(p-last>1)nums+='<span class="om-gap">…</span>';nums+=b(p,p,false,p===page);last=p;});
  return `<div class="om-pager"><span class="om-psub">Showing ${from+1}–${Math.min(from+OM_PAGE,total)} of ${total}</span><div class="om-pbtns">${b(page-1,'‹ Prev',page<2)}${nums}${b(page+1,'Next ›',page>=pages)}</div></div>`;
}

function drawTable(tab){
  const box=$('om-table-'+tab);if(!box)return;
  const all=OM.rows[tab]||[];
  const f=filtersFor(tab);
  let rows=all;
  if(tab==='approvals'){
    // build the two header filters from the loaded list, keeping the current selection
    const off=[...new Map(all.map(o=>[o.created_by,o.created_by_name])).entries()];
    const ros=[...new Set(all.map(o=>o.ro))].sort();
    const so=$('om-f-officer'),sr=$('om-f-rofilter');
    if(f.officer&&!off.some(([u])=>u===f.officer))f.officer='';
    if(f.ro&&!ros.includes(f.ro))f.ro='';
    if(so)so.innerHTML='<option value="">All</option>'+off.map(([u,n])=>`<option value="${esc(u)}"${f.officer===u?' selected':''}>${esc(n)}</option>`).join('');
    if(sr)sr.innerHTML='<option value="">All</option>'+ros.map(r=>`<option${f.ro===r?' selected':''}>${esc(r)}</option>`).join('');
    rows=all.filter(o=>(!f.officer||o.created_by===f.officer)&&(!f.ro||o.ro===f.ro));
  }
  const zone=OM.kind==='admin'?(tab==='approvals'?azText():''):meZoneText();
  const t=$('om-title-'+tab);
  if(t){
    if(tab==='myorders')t.textContent=`My orders (${rows.length})`;
    else if(tab==='approvals')t.textContent='Orders pending approval'+(zone?` — ${zone}`:'');
    else t.textContent='All orders'+(zone?` — ${zone}`:'')+` (${rows.length})`;
  }
  const pages=Math.max(1,Math.ceil(rows.length/OM_PAGE));
  f.page=Math.min(Math.max(1,f.page||1),pages);
  const from=(f.page-1)*OM_PAGE;
  box.innerHTML=rows.length?tableHtml(tab,rows.slice(from,from+OM_PAGE))+pagerHtml(tab,f.page,pages,rows.length,from):`<div class="om-empty">${tab==='approvals'?'Nothing is waiting for your approval.':'No orders found.'}</div>`;
  labelCells(box);
}

function renderMetrics(tab,m,rows){
  const c=m.counts,mo=m.month;
  const card=(cls,lbl,val,sub)=>`<div class="mc ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub||'&nbsp;'}</div></div>`;
  let h='';
  if(OM.kind==='hpcl'||tab==='approvals'){
    const aw=m.awaiting||c.pending;
    let sub=OM.kind==='admin'?'Orders placed by Rohan Energy and HPCL':'Orders in '+esc(meZoneText()||'all zones');
    if(tab==='approvals'&&rows&&rows.length){
      const d=Math.max(...rows.map(o=>waitDays(o)||0));
      sub=d<1?'Oldest waiting: today':`Oldest waiting ${d} day${d>1?'s':''}`;
    }
    h=card('am','Awaiting your approval',aw.count,sub)+
      card('bl','Pending volume',fmtN(aw.vol)+' L',fmtN(aw.ea)+' EA')+
      card('gr','Approved this month',mo.approved.count,fmtN(mo.approved.vol)+' L')+
      card('rd','Rejected this month',mo.rejected.count,'');
  } else if(OM.kind==='admin'){
    h=card('gy','Draft',c.draft.count,'Not yet submitted')+card('am','Pending approval',c.pending.count,fmtN(c.pending.vol)+' L')+
      card('gr','Approved',c.approved.count,fmtN(c.approved.vol)+' L')+card('rd','Rejected',c.rejected.count,'');
  } else {
    const n=approverNames();
    h=card('gy','Draft',c.draft.count,'Not yet submitted')+
      card('am','Pending approval',c.pending.count,n.length===1?`With ${esc(n[0])} (HPCL) or Rohan Energy`:'Waiting for approval')+
      card('gr','Approved',mo.approved.count,'This month')+
      card('rd','Rejected',c.rejected.count,c.rejected.count?'Needs your action':'');
  }
  const el=$('om-metrics-'+tab);if(el)el.innerHTML=h;
}

function tableHtml(tab,rows){
  const k=OM.kind;
  let head,body;
  if(tab==='myorders'){
    head=['Order ref','Date','Outlet','RO','Qty (EA)','Litres','Approver','Status','Actions'];
    body=rows.map(o=>`<tr><td class="om-ref">${esc(o.ref)}</td><td>${fmtDS(o.order_date)}</td><td class="om-out"><b>${esc(o.outlet)}</b>${teamBy(o)}</td><td>${esc(o.ro)}</td>
      <td class="om-num">${fmtN(o.total_ea)}</td><td class="om-num">${fmtN(o.total_vol)}</td><td class="om-wrap">${officerCell(o)}</td>
      <td>${pill(o.status)}${stagePill(o)}${statusNote(o)}</td><td>${myActions(o)}</td></tr>`).join('');
  } else if(tab==='approvals'){
    head=['Order ref','Submitted','Placed by',...(k==='admin'?['Zone']:[]),'Outlet','SAP code','Item(s)','Qty (EA)','Litres','Waiting','Action'];
    body=rows.map(o=>`<tr><td class="om-ref">${esc(o.ref)}</td><td>${fmtDTS(o.submitted_at)}</td><td>${esc(o.created_by_name)}<div class="om-sub">${o.doc_type==='invoice'?'HPCL':'Rohan Energy'}</div></td>${k==='admin'?`<td>${esc(o.zone)}</td>`:''}<td class="om-out"><b>${esc(o.outlet)}</b></td><td>${esc(o.ro_code)}</td><td class="om-wrap">${itemsCell(o)}</td>
      <td class="om-num">${fmtN(o.total_ea)}</td><td class="om-num">${fmtN(o.total_vol)}</td><td>${waiting(o)}</td>
      <td><button class="om-btn p" data-act="review" data-id="${o.id}">Review</button></td></tr>`).join('');
  } else {
    head=['Order ref','Date',...(k==='admin'?['Zone']:[]),'Placed by','Outlet','Qty (EA)','Litres','Status','Decided by','Actions'];
    body=rows.map(o=>`<tr><td class="om-ref">${esc(o.ref)}</td><td>${fmtDS(o.order_date)}</td>${k==='admin'?`<td>${esc(o.zone)}</td>`:''}<td>${esc(o.created_by_name)}${o.doc_type==='invoice'?'<div class="om-sub">HPCL · Sales Order + Tax Invoice</div>':''}</td><td class="om-out"><b>${esc(o.outlet)}</b></td>
      <td class="om-num">${fmtN(o.total_ea)}</td><td class="om-num">${fmtN(o.total_vol)}</td><td>${pill(o.status)}${stagePill(o)}</td>
      <td>${o.decided_by_name?esc(o.decided_by_name)+`<div class="om-sub">${fmtDTS(o.decided_at)}</div>`:'—'}</td>
      <td><div class="om-acts">${canReview(o)?`<button class="om-btn p" data-act="review" data-id="${o.id}">Review</button>`:`<button class="om-btn" data-act="view" data-id="${o.id}">View</button>`}${o.status==='pending'&&rohanAdmin()&&(isMine(o)||o.doc_type!=='invoice'||apprCovers(o))?`<button class="om-btn e" data-act="edit" data-id="${o.id}">Edit</button>`:''}${adminOwnDraft(o)?`<button class="om-btn e" data-act="edit" data-id="${o.id}">${o.status==='rejected'?'Edit &amp; resubmit':'Edit'}</button>`+(o.status==='draft'?`<button class="om-btn p" data-act="submit" data-id="${o.id}">Submit</button><button class="om-btn d" data-act="del" data-id="${o.id}">Delete</button>`:''):''}${o.status==='approved'&&o.tax_inv?docBtn(o):''}${receiptBtn(o)}${returnBtn(o)}</div></td></tr>`).join('');
  }
  return `<table class="om-cards"><thead><tr>${head.map(h=>`<th${/Qty|Litres/.test(h)?' class="om-num"':''}>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}
/* phones: orders.css shows each row as a card, with the column heading (data-label) in front of every value */
function labelCells(root){
  root.querySelectorAll('table.om-cards,table.om-ucards').forEach(t=>{
    const hs=[...t.querySelectorAll('thead th')].map(th=>th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>{
      td.setAttribute('data-label',hs[i]||'');
      td.innerHTML='<div class="om-v">'+td.innerHTML+'</div>';   // keeps pills + notes together in the value column
    }));
  });
}
function statusNote(o){
  if(o.status==='rejected'&&o.review_comment)return `<div class="om-sub rej">“${esc(o.review_comment)}”</div>`;
  if(o.status==='approved'&&o.decided_by_name)return `<div class="om-sub">by ${esc(o.decided_by_name)} · ${fmtDS(o.decided_at)}</div>`;
  return'';
}
/* the PDFs of an approved order: the Sales Order (placed by Rohan, approved by HPCL) - or, for an order placed by HPCL and approved by the super admin, the Sales Order and the Tax Invoice */
function docName(doc){return doc==='invoice'?'Tax Invoice':'Sales Order';}
function docBtn(o){
  const b=d=>`<button class="om-btn so" data-act="so" data-doc="${d}" data-id="${o.id}">${docName(d)}</button>`;
  // the Sales Order button: on every order for Rohan officers, and on an order placed by HPCL for everyone who sees it (an HPCL officer never gets one for a Rohan order)
  const so=o.created_by==='historical-import'?'':b('so');   // everyone who can see an approved order (Rohan, HPCL, Zone / Regional Officers, super admins) can open its Sales Order; imported history has none
  if(!o.tax_inv)return so;   // an approved order without a Tax Invoice (placed by Rohan before invoices were added, or imported history)
  if(o.invoice_mode!=='manual')return so+b('invoice')+(canEditInv(o)?`<button class="om-btn e" data-act="inv-edit" data-id="${o.id}">${o.invoice_edits?'Edit invoice ✎':'Edit invoice'}</button>`:'');
  // this order's Tax Invoice is uploaded (by the Super Admin for an order placed by HPCL, by the Rohan officer for one placed by Rohan): open the uploaded file, or (the uploader) go and upload it
  return so+(o.has_invoice_file?`<button class="om-btn so" data-act="inv-view" data-id="${o.id}">Tax Invoice</button>`
    :canUpInv(o)?`<button class="om-btn p" data-act="view" data-id="${o.id}">Upload invoice</button>`:'');
}
/* who uploads the Tax Invoice when it is not generated (orders placed by HPCL and by Rohan Energy alike): the Super Admin or a Rohan Energy officer who can see the order. HPCL officers only view it. */
const rohanAdmin=()=>OM.kind==='admin'&&!OM.hsuper;   // the Rohan Energy Super Admin (the HPCL Super Admin only views and decides)
function canUpInv(o){return rohanAdmin()||OM.kind==='rohan';}
/* a completed order (Proof of Delivery uploaded) keeps its Tax Invoice exactly as it is: no editing, no resetting, no replacing the uploaded file */
const isDone=o=>o.status==='approved'&&o.delivery_stage==='delivered';
/* the Super Admin and the Rohan Energy officers edit the Tax Invoice the portal generated, until the order is completed */
function canEditInv(o){return (rohanAdmin()||OM.kind==='rohan')&&o.status==='approved'&&o.tax_inv&&o.invoice_mode!=='manual'&&!isDone(o);}
/* the Super Admin, Zone Officers and Regional Officers of Rohan Energy upload the payment receipt and the Proof of Delivery */
const canDeliver=()=>rohanAdmin()||OM.kind==='rohan';
const invUploaderName=o=>'Rohan Energy officer or the Super Admin';
/* does approving an order generate the Tax Invoice (true) or does the Super Admin upload it (false)? Same switch for orders placed by HPCL and by Rohan Energy */
function autoInv(){return perms().auto_invoice;}
/* HPCL users do not see the Tax Invoice while the Super Admin has not allowed it (Permissions); the server hides it from them as well */
function hideInv(){return (OM.kind==='hpcl'||OM.hsuper)&&!perms().hpcl_tax_invoice;}
function invDocsText(){return hideInv()?'the Sales Order is generated':autoInv()?'the Sales Order and the Tax Invoice are generated':'the Sales Order is generated and the Super Admin or a Rohan Energy officer then uploads the Tax Invoice';}
function invDocsTextRohan(){return hideInv()?'the Sales Order is generated':autoInv()?'the Sales Order and the Tax Invoice are generated':'the Sales Order is generated and the Rohan Energy officer or the Super Admin then uploads the Tax Invoice';}
/* who decides a pending order: the super admin for orders HPCL placed, otherwise the HPCL officer of the zone */
/* a super admin approves only the states it was created for; no list = every state. It still SEES every order. */
function apprCovers(o){
  const me=OM.meta&&OM.meta.me;
  return !me||!me.ast||!me.ast.length||me.ast.includes(o.state);
}
function azText(){const me=OM.meta&&OM.meta.me;return me&&me.ast?me.ast.join(', '):'';}
/* Rohan Energy approves too: the Rohan super admin decides every pending order (Rohan's own and the ones HPCL placed), a Rohan Zone / Regional Officer the pending Rohan orders of their own area (the list only holds what they may see) */
/* ... but which orders wait for THIS user depends on who placed the order (any one of the people named for it decides, the first to act): the server marks each order with can_decide */
function canReview(o){return o.status==='pending'&&!!o.can_decide;}
/* the people an order of this user goes to for approval, in words (the same rule as the server's ordAwaitCond) */
function myApproversText(){
  if(OM.kind==='admin')return OM.hsuper?'yourself, the HPCL Zone Officer of the SAP number and the Rohan Super Admin':'the Rohan Super Admin, the Rohan Zone Officer, the HPCL Super Admin, the HPCL Zone Officer and the HPCL Regional Officer';
  if(OM.kind==='hpcl')return OM.outlet?'the HPCL Regional Officer, the HPCL Zone Officer, the HPCL Super Admin and the Rohan Super Admin':OM.level==='regional'?'your HPCL Zone Officer, the HPCL Super Admin and the Rohan Super Admin':'yourself, the HPCL Super Admin and the Rohan Super Admin';
  return OM.level==='regional'?'your Rohan Zone Officer, the Rohan Super Admin, the HPCL Super Admin and the HPCL Zone Officer':'yourself, the Rohan Super Admin, the HPCL Super Admin and the HPCL Zone Officer';
}
/* approved order that has no payment receipt yet: Rohan and HPCL officers can upload it from the list */
function receiptBtn(o){
  if(o.status!=='approved'||o.delivery_stage!=='transit')return'';
  if(canDeliver())return `<button class="om-btn p" data-act="view" data-id="${o.id}">${o.has_receipt?'Upload POD':'Upload receipt'}</button>`;
  return !o.has_receipt&&OM.kind==='hpcl'&&perms().hpcl_receipt?`<button class="om-btn p" data-act="view" data-id="${o.id}">Upload receipt</button>`:'';
}
/* a Zone Officer's list also holds the orders of their Regional Officers: say who placed them, and leave editing to the placer */
/* the Rohan super admin's own draft / rejected order: they edit, submit and delete it like a Rohan officer */
function adminOwnDraft(o){
  if(!isMine(o)||!(o.status==='draft'||o.status==='rejected'))return false;
  if(OM.kind==='admin'&&!OM.hsuper)return o.doc_type!=='invoice';
  return OM.kind==='hpcl'||OM.hsuper;   // HPCL users keep drafts too: edit, submit, delete (a rejected one: edit & resubmit)
}
function isMine(o){const me=OM.meta&&OM.meta.me;return !o.created_by||!me||o.created_by===me.username;}
function teamBy(o){return isMine(o)?'':`<div class="om-sub">placed by ${esc(o.created_by_name||o.created_by)}</div>`;}
function myActions(o){
  const rv=canReview(o)?`<button class="om-btn p" data-act="review" data-id="${o.id}">Approve</button>`:'';   // Rohan Energy approves its own pending orders too
  if(!isMine(o))return `<div class="om-acts">${rv}${receiptBtn(o)}${returnBtn(o)}<button class="om-btn" data-act="view" data-id="${o.id}">View</button>${o.status==='approved'?docBtn(o):''}</div>`;   // a Zone Officer can also deliver their Regional Officers' orders
  const v=`<button class="om-btn" data-act="view" data-id="${o.id}">View</button>`;
  const so=o.status==='approved'?docBtn(o):'';   // only exists once the order is approved
  if(o.status==='draft')return `<div class="om-acts"><button class="om-btn e" data-act="edit" data-id="${o.id}">Edit</button><button class="om-btn p" data-act="submit" data-id="${o.id}">Submit</button><button class="om-btn d" data-act="del" data-id="${o.id}">Delete</button>${so}</div>`;
  if(o.status==='rejected')return `<div class="om-acts"><button class="om-btn e" data-act="edit" data-id="${o.id}">Edit &amp; resubmit</button>${v}${so}</div>`;
  if(o.status==='pending')return `<div class="om-acts">${rv}<button class="om-btn e" data-act="edit" data-id="${o.id}">Edit</button>${v}</div>`;   // still editable until it is decided
  return `<div class="om-acts">${receiptBtn(o)}${returnBtn(o)}${v}${so}</div>`;
}

/* ── click delegation ── */
function onClick(e){
  const b=e.target.closest('[data-act]');if(!b||b.disabled)return;
  const act=b.dataset.act,id=+b.dataset.id||0;
  if(act==='view')openDetail(id);
  else if(act==='review')openReview(id);
  else if(act==='so')openSalesOrder(id,b.dataset.doc);
  else if(act==='inv-edit')openInvoiceEdit(id);
  else if(act==='inv-edit-save')saveInvoiceEdit(id);
  else if(act==='inv-edit-reset')resetInvoiceEdit(id);
  else if(act==='inv-view')window.open('orders.php?action=file_download&kind=invoice&inline=1&id='+id,'_blank','noopener');
  else if(act==='so-dl')downloadSalesOrder();
  else if(act==='page'){filtersFor(b.dataset.tab).page=+b.dataset.p;saveView();drawTable(b.dataset.tab);}
  else if(act==='back'){if(OM.current==='returns')renderReturns();else renderList(OM.current);}
  else if(act==='return')openReturn(id);
  else if(act==='chglog')openChangeLog(b.dataset.area);
  else if(act==='chglog-more')loadChangeLog(false);
  else if(act==='return-send')sendReturn(id);
  else if(act==='ret-approve'||act==='ret-reject')openRetDecide(+b.dataset.rid,act==='ret-approve');
  else if(act==='ret-decide')sendRetDecide(+b.dataset.rid,b.dataset.ok==='1');
  else if(act==='ret-reset'){OM.retSt=null;renderReturns();}
  else if(act==='edit')startEdit(id);
  else if(act==='submit')submitOrder(id);
  else if(act==='del')deleteOrder(id);
  else if(act==='new'){OM.editing=null;showTab('neworder');}
  else if(act==='reset'){OM.filters[b.dataset.tab]={status:'',q:'',month:'',from:'',to:'',zone:'',officer:'',ro:'',page:1};renderList(b.dataset.tab);}
  else if(act==='close')closeModal();
  else if(act==='bulk')openBulk();
  else if(act==='prices')openPrices();
  else if(act==='prices-save')savePrices();
  else if(act==='bulk-template')bulkTemplate();
  else if(act==='bulk-again')openBulk();
  else if(act==='bulk-create')bulkCreate(b.dataset.mode);
  else if(act==='bulk-done'){closeModal();const home=OM.kind==='hpcl'?'allorders':'myorders';if(OM.current===home)renderList(home);else showTab(home);}
  else if(act==='approve')decide(id,true);
  else if(act==='reject')decide(id,false);
  else if(act==='min-save')saveMinOrder();
  else if(act==='perms-save')savePerms();
  else if(act==='inv-upload')uploadInvoice(id);
  else if(act==='stock-save')saveStock();
  else if(act==='stock-toggle'){const body=$('om-stock-body');if(body)body.style.display=b.checked?'':'none';}
  else if(act==='prod-add')addProduct();
  else if(act==='prod-del')deleteProduct(+b.dataset.pid);
  else if(act==='foc-row-add')focRowAdd(+b.dataset.pid);
  else if(act==='foc-row-del')focRowDel(+b.dataset.pid,+b.dataset.i);
  else if(act==='foc-save')focSave(+b.dataset.pid);
  else if(act==='foc-reset')focReset(+b.dataset.pid);
  else if(act==='foc-tab')focTab(+b.dataset.pid);
  else if(act==='foc-edit')focEdit(+b.dataset.pid);
  else if(act==='foc-chk')focChk(+b.dataset.pid,+b.dataset.i,b.checked);
  else if(act==='foc-chk-all')focChkAll(+b.dataset.pid,b.checked);
  else if(act==='foc-del-sel')focDelSel(+b.dataset.pid);
  else if(act==='foc-sel-clear'){const d=OM.focDraft[+b.dataset.pid];if(d){d.sel=new Set();focRedraw(+b.dataset.pid);}}
  else if(act==='foc-upload'){const f=$('om-foc-file-'+b.dataset.pid);if(f)f.click();}
  else if(act==='foc-template')focTemplate(+b.dataset.pid);
  else if(act==='pod-upload')uploadPod(id);
  else if(act==='receipt-upload')uploadReceipt(id);
  else if(act==='user-add')addUser();
  else if(act==='sa-add')addSuperAdmin();
  else if(act==='sa-edit')openSaEdit(b.dataset.user);
  else if(act==='sa-edit-save')saveSaEdit(b.dataset.user);
  else if(act==='imp-create')impCreate();
  else if(act==='imp-dl')impDownload();
  else if(act==='imp-reset'){OM.imp=null;drawImport();}
  else if(act==='imp-recheck')impCheck();
  else if(act==='out-add')addOutlet();
  else if(act==='out-find')lookupOutlet(true);
  else if(act==='out-page'){outState().page=+b.dataset.p;loadOutlets();}
  else if(act==='out-reset'){OM.outlets=null;renderOutlets();}
  else if(act==='out-pw')toggleOutPw(b);
  else if(act==='out-edit')openOutletEdit(b.dataset.sap);
  else if(act==='out-edit-save')saveOutletEdit(b.dataset.sap);
  else if(act==='out-del')deleteOutlets([b.dataset.sap]);
  else if(act==='out-del-sel')deleteOutlets([...outState().sel]);
  else if(act==='out-del-all')deleteOutlets(null);
  else if(act==='out-sel-all'){const st=outState();(st.data?st.data.rows:[]).forEach(r=>{if(b.checked)st.sel.add(r.sap_code);else st.sel.delete(r.sap_code);});drawOutlets();}
  else if(act==='out-sel'){const st=outState();if(b.checked)st.sel.add(b.dataset.sap);else st.sel.delete(b.dataset.sap);drawOutlets();}
  else if(act==='out-xlsx')outLoginSheet();
  else if(act==='out-upload')outUpload();
  else if(act==='out-file'){const f=$('om-ou-file');if(f)f.click();}
  else if(act==='regional-add')addRegional();
  else if(act==='ro-add-admin')addRegionalAdmin();
  else if(act==='ro-for'){const sel=$('om-ra-parent');if(sel){sel.value=b.dataset.user;drawRaRegion();const bx=$('om-ra-box');if(bx)bx.scrollIntoView({behavior:'smooth',block:'start'});const n=$('om-ra-name');if(n)setTimeout(()=>n.focus({preventScroll:true}),400);}}
  else if(act==='pw-show')togglePwCell(b);
  else if(act==='regional-edit-save')saveRegionalEdit(b.dataset.user);
  else if(act==='sa-convert')convertSAs();
  else if(act==='sa-all')saSetAll(b.dataset.box,true);
  else if(act==='sa-none')saSetAll(b.dataset.box,false);
  else if(act==='user-edit')openUserEdit(b.dataset.user);
  else if(act==='user-edit-save')saveUserEdit(b.dataset.user);
  else if(act==='user-pw')openUserPw(b.dataset.user);
  else if(act==='user-pw-save')saveUserPw(b.dataset.user);
  else if(act==='user-del')deleteUser(b.dataset.user);
  else if(act==='ug-toggle'){const un=b.dataset.user,o=OM.ugOpen||(OM.ugOpen=new Set());if(o.has(un))o.delete(un);else o.add(un);drawGroups();}
  else if(act==='ug-all'){OM.ugOpen=new Set(orderUsers().filter(u=>u.level==='zone').map(u=>u.username));drawGroups();}
  else if(act==='ug-none'){OM.ugOpen=new Set();drawGroups();}
  else if(act==='sap-add')openSapForm('');
  else if(act==='sap-upload')openSapUpload();
  else if(act==='sapu-tab'){if(OM.sapu){OM.sapu.tab=b.dataset.t;OM.sapu.page=1;OM.sapu.field='';sapuRender();}}
  else if(act==='sapu-page'){if(OM.sapu){OM.sapu.page=+b.dataset.p;sapuBody();}}
  else if(act==='sapu-again')openSapUpload();
  else if(act==='sapu-apply')sapuApply();
  else if(act==='sap-open')openSapForm(b.dataset.code);
  else if(act==='sap-save')saveSap();
  else if(act==='sap-page'){sapFilters().page=+b.dataset.p;saveView();loadSap();}
  else if(act==='sap-reset'){OM.filters.sap=null;renderSap();}
  else if(act==='rr-reset'){OM.filters.roreport=null;renderRoReport();}
  else if(act==='rr-xlsx')rrDownload();
  else if(act==='rr-xlsx-one')rrDownload(b.dataset.u);
  else if(act==='rr-ord'){const n=b.closest('tr').nextElementSibling;if(n){n.hidden=!n.hidden;b.textContent=n.hidden?'▸':'▾';}}
}

async function startEdit(id){
  try{
    const j=await omGet({action:'get',id});
    OM.editing=j.order;OM.keepEdit=true;
    OM.editBack=ALL_TABS.includes(OM.current)&&OM.current!=='neworder'?OM.current:OM.editBack;   // the list "Cancel" / refresh falls back to
    closeModal();
    showTab('neworder');
  }catch(e){toast('Error: '+e.message,'er');}
}

function afterChange(){
  closeModal();
  refreshMeta().catch(()=>{});
  const cur=OM.current;
  if(cur==='returns'){OM.detail=null;renderReturns();return;}
  if(cur&&cur!=='neworder'&&cur!=='zones'&&cur!=='team'&&cur!=='inventory'&&cur!=='foc'&&cur!=='sap'&&cur!=='roreport'&&cur!=='perms'&&cur!=='officers'&&cur!=='profile'&&cur!=='superiors'){
    if(OM.detail){OM.detail=null;renderList(cur);}   // an order opened as a page: go back to the list after the action
    else loadList(cur);
  }
}

async function submitOrder(id){
  const ok=await showModal({title:'Submit for approval',body:'The order will be sent for approval to '+myApproversText()+' — any one of them decides it. '+((OM.kind==='hpcl'||OM.hsuper)?'You cannot edit it once it is submitted (if it is rejected it comes back to you to correct).':'You can still edit it until it is decided.'),confirmText:'Submit order',confirmClass:'btn-p'});
  if(!ok)return;
  try{
    const j=await omPost('submit',{id});
    toast(`Order ${j.order.ref} submitted for approval`);
  }catch(e){toast('Error: '+e.message,'er');}
  afterChange();
}
async function deleteOrder(id){
  const ok=await showModal({title:'Delete draft',body:'This draft order will be permanently deleted.',confirmText:'Delete',confirmClass:'btn-d'});
  if(!ok)return;
  try{await omPost('delete',{id});toast('Draft deleted');}catch(e){toast('Error: '+e.message,'er');}
  afterChange();
}

/* ── Set prices (Rohan officers): selling price per EA (before GST) and GST % of each product, printed on the Sales Order ── */
async function openPrices(){
  const ov=$('om-overlay');if(!ov)return;
  let m;try{m=await refreshMeta();}catch(e){toast(e.message,'err');return;}
  const rows=(m.prices||[]).map(p=>{const i=p.pid;return `<tr data-pi="${i}" data-item="${esc(p.item)}"><td>${esc(p.item)}</td>
      <td class="om-num"><input type="number" min="0.01" step="0.01" class="om-p-rate" value="${p.rate==null?'':dlpOf(p.rate,p.gst_set?p.gst:18)}" placeholder="Required" required><div class="om-field-err" id="om-e-rate_${i}"></div></td>
      <td class="om-num"><input type="number" min="0" max="100" step="0.01" class="om-p-gst" value="${p.gst_set?esc(p.gst):''}" placeholder="Required" required><div class="om-field-err" id="om-e-gst_${i}"></div></td></tr>`;}).join('');
  const last=(m.prices||[]).find(p=>p.by);
  ov.innerHTML=`<div class="om-box"><h3>Set prices</h3>
    <div class="om-msub">The price is the <b>DLP</b>: per EA (20 L pack), <b>including GST</b> (e.g. 1,652 for HP DEF - 1X20L at 18% GST; the GST part is shown separately on the documents). It is printed on the Sales Order when an order is approved, so a later change does not alter orders that are already approved. These prices are shared by all Rohan Energy officers${OM.kind==='hpcl'?' and HPCL officers':canHpclRates()?' (HPCL officers may also change them)':''}. <b>Price and GST % are mandatory for every product</b> — an order cannot be submitted to HPCL until they are set.</div>
    <table class="om-items"><thead><tr><th>Product</th><th class="om-num">DLP per EA (₹, incl. GST) *</th><th class="om-num">GST % *</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="om-field-err" id="om-e-prices"></div>
    ${last?`<div class="om-sub" style="margin-top:8px">Last changed by ${esc(last.by)} · ${fmtDS(last.at)}</div>`:''}
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button><button class="btn-p" data-act="prices-save">Save prices</button></div></div>`;
  ov.classList.add('show');
}
async function savePrices(){
  const rows=[...document.querySelectorAll('#om-overlay tr[data-pi]')];
  rows.forEach(tr=>{const i=tr.dataset.pi;['rate','gst'].forEach(k=>{const e=$('om-e-'+k+'_'+i);if(e)e.textContent='';});});
  const err=$('om-e-prices');err.textContent='';
  const prices=rows.map(tr=>{
    const dlp=tr.querySelector('.om-p-rate').value.trim(),gst=tr.querySelector('.om-p-gst').value.trim(),d=parseFloat(dlp),g=parseFloat(gst);
    // the DLP typed (incl. GST) is stored as the rate before GST: DLP / (1 + GST %)
    return {item:tr.dataset.item,rate:(dlp!==''&&d>0&&gst!==''&&g>=0&&g<=100)?(d/(1+g/100)).toFixed(2):dlp,gst};
  });
  try{
    const j=await omPost('set_prices',{prices});
    OM.meta.prices=j.prices;
    closeModal();
    toast('Prices saved');
  }catch(e){
    Object.keys(e.fields||{}).forEach(k=>{const el=$('om-e-'+k);if(el)el.textContent=e.fields[k];});
    err.textContent=e.message;
  }
}

/* ── Returns: a completed order (delivery confirmed) can be returned by anybody who sees it - reason + credit note - and the people picked on the Permissions page decide it ── */
const RET_LBL={pending:'Return pending',approved:'Returned',rejected:'Return rejected'};
const RET_ORGS=[['rohan','Rohan Energy'],['hpcl','HPCL']],RET_LVLS=[['admin','Super Admin'],['zone','Zone Officer'],['regional','Regional Officer (RO)']];
function retPill(o){return o&&o.ret&&RET_LBL[o.ret.status]?` <span class="om-pill p-ret-${esc(o.ret.status)}">${RET_LBL[o.ret.status]}</span>`:'';}
function canReturn(o){return isDone(o)&&(!o.ret||o.ret.status==='rejected');}
function returnBtn(o){return canReturn(o)?`<button class="om-btn ret" data-act="return" data-id="${o.id}">↩ Return</button>`:'';}
function retApprovers(){const p=perms(),out=[];RET_ORGS.forEach(([og,on])=>RET_LVLS.forEach(([lv,ln])=>{if(p['ret_'+og+'_'+lv])out.push(on+' '+ln);}));return out;}
function retCanDecide(){return !!(OM.meta&&OM.meta.ret&&OM.meta.ret.can_decide);}
function retMine(r){const me=OM.meta&&OM.meta.me;return !!me&&r.requested_by===me.username;}
function retMayAct(r){return retCanDecide()&&r.status==='pending'&&(OM.kind==='admin'||!retMine(r));}
function retInfo(r){
  return `<div class="om-ret-info"><div><span class="k">Reason</span> ${esc(r.reason)}</div><div><span class="k">Credit note</span> ${esc(r.credit_note)}</div></div>`;
}
/* the return part of an order page: what was asked, who decides, and the buttons that fit the user */
function retBlock(o){
  const r=o.ret;if(!r)return '';
  (OM.retMap||(OM.retMap={}))[r.id]=Object.assign({ref:o.ref,outlet:o.outlet},r);
  const approvers=retApprovers();
  let h=`<div class="om-note ${r.status==='approved'?'info':r.status==='rejected'?'err':'warn'} om-retbox"><b>${r.status==='pending'?'Return requested':r.status==='approved'?'Returned':'Return rejected'}</b> by ${esc(r.requested_by_name)} · ${fmtDT(r.requested_at)}${retInfo(r)}`;
  if(r.status==='pending')h+=`<div class="om-sub">Waiting for approval by ${approvers.length?esc(approvers.join(', ')):'the Super Admin'}.</div>`;
  else h+=`<div class="om-sub">${r.status==='approved'?'Approved':'Rejected'} by ${esc(r.decided_by_name||'')} · ${fmtDT(r.decided_at)}${r.decision_comment?` — “${esc(r.decision_comment)}”`:''}</div>`;
  if(retMayAct(r))h+=`<div class="om-foot" style="margin-top:8px"><button class="om-btn-reject" data-act="ret-reject" data-rid="${r.id}">✕ Reject return</button><button class="btn-s" data-act="ret-approve" data-rid="${r.id}">✓ Approve return</button></div>`;
  return h+'</div>';
}
/* ── Change log of the SAP Numbers / MIS / FOC pages: a "Log" button at the top right of each page opens who changed what, from what to what, and when ── */
const CHG_TTL={sap:'SAP Numbers',mis:'MIS',foc:'FOC'};
const CHG_ACT={added:'Added',edited:'Edited',deleted:'Deleted',import:'Excel upload'};
function logBtn(area){return `<button type="button" class="om-logbtn" data-act="chglog" data-area="${area}" title="Who changed what on this page"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> Log</button>`;}
window.omChangeLog=a=>openChangeLog(a);   // the MIS page (mis.js) opens it too
let _chgT=null;
function openChangeLog(area){
  const ov=$('om-overlay');if(!ov||!CHG_TTL[area])return;
  OM.chg={area,q:'',page:0,pages:1,total:0,seq:0};
  ov.innerHTML=`<div class="om-box om-log"><h3>Change log <span class="om-ref">${esc(CHG_TTL[area])}</span></h3>
    <div class="om-msub">Every change made on this page: who changed it, what it was and what it became.</div>
    <div class="om-log-find"><input type="search" id="om-chg-q" placeholder="Search a name, SAP code, outlet, field…" autocomplete="off"></div>
    <div class="om-log-list" id="om-chg-list"><div class="om-empty">Loading…</div></div>
    <div class="om-foot"><span class="om-log-count" id="om-chg-count"></span><button class="btn-g" data-act="close">Close</button></div></div>`;
  ov.classList.add('show');
  $('om-chg-q').addEventListener('input',e=>{OM.chg.q=e.target.value.trim();clearTimeout(_chgT);_chgT=setTimeout(()=>loadChangeLog(true),300);});
  loadChangeLog(true);
}
function chgVal(v){if(v===null||v===undefined||v==='')return'<i>(blank)</i>';const t=String(v);return esc(t.length>140?t.slice(0,140)+'…':t);}
function chgRowHtml(r){
  const ch=(r.changes||[]).map(c=>r.action==='deleted'?`<li><b>${esc(c[0])}</b>: ${chgVal(c[1])}</li>`
    :`<li><b>${esc(c[0])}</b>: ${c[1]!==null&&c[1]!==undefined&&c[1]!==''?`<span class="o">${chgVal(c[1])}</span> → `:''}<span class="n">${chgVal(c[2])}</span></li>`).join('');
  const lines=(r.lines||[]).map(l=>`<li>${esc(l)}</li>`).join('');
  return `<div class="om-log-row"><div class="om-log-top"><span class="om-log-act a-${esc(r.action)}">${esc(CHG_ACT[r.action]||r.action)}</span><b class="om-log-tg">${esc(r.target||r.summary)}</b><span class="om-log-when">${fmtDT(r.at)}</span></div>
    <div class="om-log-sub">${esc(r.summary)} · by <b>${esc(r.by||'—')}</b>${r.role?` (${esc(r.role)})`:''}</div>
    ${ch?`<ul class="om-log-ch">${ch}</ul>`:''}${lines?`<ul class="om-log-ch ln">${lines}</ul>`:''}${r.note?`<div class="om-log-note">${esc(r.note)}</div>`:''}</div>`;
}
async function loadChangeLog(reset){
  const c=OM.chg;if(!c)return;
  const box=$('om-chg-list');if(!box)return;
  const seq=++c.seq;
  if(reset){c.page=0;box.innerHTML='<div class="om-empty">Loading…</div>';}
  else{const m=box.querySelector('.om-log-more');if(m){m.disabled=true;m.textContent='Loading…';}}
  try{
    const params={action:'change_log',area:c.area,page:c.page+1};if(c.q)params.q=c.q;
    const j=await omGet(params);
    if(seq!==c.seq||!$('om-chg-list'))return;
    c.page=j.page;c.pages=j.pages;c.total=j.total;
    const old=box.querySelector('.om-log-more');if(old)old.remove();
    if(reset)box.innerHTML='';
    if(!j.rows.length&&reset)box.innerHTML=`<div class="om-empty">${c.q?'Nothing found for this search.':'No changes have been recorded on this page yet.'}</div>`;
    else box.insertAdjacentHTML('beforeend',j.rows.map(chgRowHtml).join(''));
    if(c.page<c.pages)box.insertAdjacentHTML('beforeend','<button type="button" class="btn-g om-log-more" data-act="chglog-more">Show older changes</button>');
    const n=$('om-chg-count');if(n)n.textContent=fmtN(c.total)+' change'+(c.total===1?'':'s')+(c.q?' found':'');
  }catch(e){
    if(seq===c.seq&&$('om-chg-list'))box.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load the log: ${esc(e.message)}</div>`;
  }
}
/* ── Top bar: the signed-in user's phone number and e-mail ── */
function userHeader(){
  const m=OM.meta&&OM.meta.me,el=document.getElementById('tb-contact');if(!el)return;
  const p=[];
  if(m&&m.mobile)p.push('<a href="tel:'+esc(m.mobile)+'" title="Mobile">&#9742; '+esc(m.mobile)+'</a>');
  if(m&&m.email)p.push('<a href="mailto:'+esc(m.email)+'" title="E-mail">&#9993; '+esc(m.email)+'</a>');
  el.innerHTML=p.join('<span class="tb-dot">&middot;</span>');
  el.style.display=p.length?'':'none';
  const sb=document.getElementById('sup-btn');if(sb)sb.style.display=m&&m.kind!=='admin'?'':'none';   // the Superiors button: everybody except the Super Admins (nobody is above them)
}
/* ── Profile (every login): all the information the portal holds about the signed-in user ── */
function profileHtml(p){
  const kv=(k,v)=>`<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const list=a=>a&&a.length?a.map(esc).join(', '):'—';
  const ini=String(p.name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'?';
  const org=p.org_name==='HPCL'?'hpcl':'rohan';
  let h=`<div class="om-prof-head"><div class="om-prof-av">${esc(ini)}</div><div><div class="om-prof-name">${esc(p.name)}</div><div class="om-prof-role">${esc(p.role_name)} <span class="om-chip om-chip-${org}">${esc(p.org_name)}</span></div></div></div>
    <div class="om-dl om-prof-dl">${kv(p.outlet?'SAP number (user name)':'User name',esc(p.username))}${kv('Organisation',esc(p.org_name))}${kv('Role',esc(p.role_name))}
      ${kv('Mobile',p.mobile?`<a href="tel:${esc(p.mobile)}">${esc(p.mobile)}</a>`:'<span class="om-sub">Not added</span>')}${kv('E-mail',p.email?`<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`:(p.outlet?'<span class="om-sub">—</span>':'<span class="om-sub">Not added</span>'))}
      ${p.created_by?kv('Account created by',esc(p.created_by)):''}${p.password_changed&&p.password_changed.at?kv('Password last changed',esc(fmtDT(p.password_changed.at))+(p.password_changed.by&&p.password_changed.by!==p.username?' by '+esc(p.password_changed.by):'')):''}</div>`;
  if(!p.outlet)h+=`<div class="om-prof-edit"><button class="btn-g" type="button" id="om-pf-editbtn">✎ Edit mobile &amp; e-mail</button>
    <div id="om-pf-form" style="display:none"><div class="om-grid om-grid3" style="margin-top:8px"><div class="field"><label>Mobile</label><input type="text" id="om-pf-mobile" maxlength="20" inputmode="tel" value="${esc(p.mobile)}" autocomplete="off"></div>
      <div class="field om-wide"><label>E-mail</label><input type="text" id="om-pf-email" maxlength="120" value="${esc(p.email)}" autocomplete="off"></div></div>
      <div class="om-field-err" id="om-pf-err"></div><div class="om-prof-actions"><button class="btn-p" type="button" id="om-pf-save">Save</button><button class="btn-g" type="button" id="om-pf-cancel">Cancel</button></div></div></div>`;
  h+='<div class="om-prof-sec">Your area</div><div class="om-dl om-prof-dl">';
  if(p.outlet){
    const o=p.outlet;
    h+=kv('Outlet',esc(o.name))+kv('Address',esc(o.address||'—'))+kv('Zone',esc(o.zone||'—'))+kv('Region',esc(roName(o.ro)||'—'))+kv('Sales area',esc(o.sales_area||'—'))+kv('Phone',esc(o.phone||'—'))+kv('GSTIN',esc(o.gstin||'—'));
  }else{
    if(p.zones&&p.zones.length||p.role_name!=='Super Admin'||p.org_name==='HPCL')h+=kv('Zones',list(p.zones));
    if(!(p.role_name==='Super Admin'&&!(p.regions&&p.regions.length)))h+=kv('Regions',p.regions&&p.regions.length?p.regions.map(r=>esc(roName(r))).join(', '):(p.sales_areas?'Whole zone':'—'));
    if(p.sales_areas)h+=kv('Sales areas',list(p.sales_areas));
    if(p.states)h+=kv('States whose pending orders you approve',p.states.length?list(p.states):'All states');
    if(p.scope_note&&!p.zones.length)h+=kv('Covers',esc(p.scope_note));
  }
  h+=kv('SAP numbers under you',`<b>${fmtN(p.sap_count)}</b>`)+'</div>';
  if(p.outlet){
    h+=`<div class="om-prof-sec">Officers who have access to your SAP number (${(p.officers||[]).length})</div>`+((p.officers||[]).length?`<div class="om-prof-list">${p.officers.map(x=>`<div class="om-prof-row"><b>${esc(x.name)}</b> <span class="om-sub">${esc(x.org_name)} · ${esc(x.level_name)}</span><div class="om-sub">${x.mobile?`<a href="tel:${esc(x.mobile)}">${esc(x.mobile)}</a>`:''}${x.mobile&&x.email?' · ':''}${x.email?`<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>`:''}</div></div>`).join('')}</div>`:'<div class="om-sub">None yet.</div>');
  }
  if(p.regional_officers)h+=`<div class="om-prof-sec">Your Regional Officers (${p.regional_officers.length})</div>`+(p.regional_officers.length?`<div class="om-prof-list">${p.regional_officers.map(x=>`<div class="om-prof-row"><b>${esc(x.name)}</b> <span class="om-sub">${esc(x.area||'')}</span><div class="om-sub">${x.mobile?`<a href="tel:${esc(x.mobile)}">${esc(x.mobile)}</a>`:''}${x.mobile&&x.email?' · ':''}${x.email?`<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>`:''}</div></div>`).join('')}</div>`:'<div class="om-sub">No Regional Officer has been added under you yet.</div>');
  return `<div class="as om-prof om-profpage"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3>My profile</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-g" type="button" id="om-pf-back">← Back</button></div></div>${h}</div>`;
}
function openProfile(){
  if(OM.current!=='profile'){let from=OM.current;if(!from){try{from=sessionStorage.getItem('portalTab')||'';}catch(e){from='';}}OM.profileBack=from||'dashboard';}
  window.showTab('profile');
}
async function renderProfile(){
  const sec=$('tab-profile');if(!sec)return;
  sec.innerHTML='<div class="om-empty">Loading…</div>';
  try{
    await ensureMeta();
    const j=await omGet({action:'profile'}),p=j.profile;
    if(OM.current!=='profile')return;
    sec.innerHTML=profileHtml(p);
    window.scrollTo(0,0);
    $('om-pf-back').addEventListener('click',()=>window.showTab(OM.profileBack&&OM.profileBack!=='profile'?OM.profileBack:'dashboard'));
    const eb=$('om-pf-editbtn');
    if(eb){
      eb.addEventListener('click',()=>{$('om-pf-form').style.display='';eb.style.display='none';$('om-pf-mobile').focus();});
      $('om-pf-cancel').addEventListener('click',()=>{$('om-pf-form').style.display='none';eb.style.display='';$('om-pf-err').textContent='';});
      $('om-pf-save').addEventListener('click',async()=>{
        const er=$('om-pf-err');er.textContent='';
        const btn=$('om-pf-save');btn.disabled=true;
        try{
          const r=await authPost('update_contact',{mobile:$('om-pf-mobile').value.trim(),email:$('om-pf-email').value.trim()});
          if(OM.meta&&OM.meta.me){OM.meta.me.mobile=r.mobile||'';OM.meta.me.email=r.email||'';}
          userHeader();toast('Contact details saved');renderProfile();
        }catch(e){er.textContent=e.message;btn.disabled=false;}
      });
    }
  }catch(e){
    if($('tab-profile'))$('tab-profile').innerHTML=`<div class="om-empty" style="color:#e02424">${esc(e.message)}</div><div style="text-align:center"><button class="btn-g" type="button" onclick="showTab('dashboard')">← Back</button></div>`;
  }
}
window.omOpenProfile=openProfile;
/* ── My superiors page (top-bar "Superiors" button / Profile page): the hierarchy above the signed-in user as a tree, top first, with the profile of everybody in it ──
   HPCL: Super Admin > Level 4 Officer > Zonal Coordinator (Level 3) > Regional Manager (Level 2) > Sales Officer (Level 1, the portal's Regional Officer) > Retail Outlet; Rohan Energy: Super Admin > Zone Officer > Regional Officer.
   Same data as the FY27 mapping workbook (Level 1 Sales Officers, Level 2 Regional Managers, Level 3 Zonal Coordinators). */
function openSuperiors(){
  if(OM.current!=='superiors'){let from=OM.current;if(!from){try{from=sessionStorage.getItem('portalTab')||'';}catch(e){from='';}}OM.supBack=from||'dashboard';}
  window.showTab('superiors');
}
function treePerson(x,cls){
  const ini=String(x.name||'?').replace(/[^A-Za-z ]/g,' ').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'?';
  const c=[];
  if(x.mobile)c.push(`<a href="tel:${esc(x.mobile)}">&#9742; ${esc(x.mobile)}</a>`);
  if(x.email)c.push(`<a href="mailto:${esc(x.email)}">&#9993; ${esc(x.email)}</a>`);
  return `<div class="om-tp ${cls||''}"><div class="om-tav om-tav-${x.org==='hpcl'?'hpcl':'rohan'}">${esc(ini)}</div><div class="om-tpb">
    <div class="om-tpn">${esc(x.name)}${x.creator?' <span class="om-tcr">created your account</span>':''}</div>
    <div class="om-tpd">${esc(x.designation||'')}</div>${x.area?`<div class="om-tpa">${esc(x.area)}</div>`:''}
    <div class="om-tpc">${c.length?c.join('<br>'):'<span class="om-sub">No contact added</span>'}</div></div></div>`;
}
async function renderSuperiors(){
  const sec=$('tab-superiors');if(!sec)return;
  const head=`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3>My superiors</h3><button class="btn-g" type="button" id="om-sp-back">← Back</button></div>`;
  const back=()=>{const b=$('om-sp-back');if(b)b.addEventListener('click',()=>window.showTab(OM.supBack&&OM.supBack!=='superiors'?OM.supBack:'dashboard'));};
  sec.innerHTML='<div class="as om-prof om-profpage om-suppage"><div class="om-empty">Loading…</div></div>';
  try{
    const j=await omGet({action:'superiors'});
    if(OM.current!=='superiors')return;
    let h='<div class="om-psub" style="margin:2px 0 12px">Who is above you, from the top of the hierarchy down to you. Click a phone number or e-mail to call or write.</div>';
    if(!j.chains.length)h+=`<div class="om-empty">${j.top?'You are at the top of the hierarchy - there is nobody above you.':'No superior has been set up for you yet.'}</div>`;
    else h+='<div class="om-tree">'+j.chains.map(c=>{
      const nodes=c.tiers.map((t,i)=>`<div class="om-tnode om-tier-${esc(t.key)}"><div class="om-tlabel"><span>${esc(t.title)}</span><span class="om-tcount">${t.people.length}</span></div><div class="om-tppl">${t.people.map(x=>treePerson(x)).join('')}</div></div><div class="om-tcon" aria-hidden="true"></div>`).join('');
      return `<div class="om-tchain"><div class="om-tchain-h"><span class="om-chip om-chip-${c.org==='hpcl'?'hpcl':'rohan'}">${esc(c.org_name)}</span></div>${nodes}<div class="om-tnode om-tme"><div class="om-tlabel"><span>You</span></div><div class="om-tppl">${treePerson(j.me,'om-tp-me')}</div></div></div>`;
    }).join('')+'</div>';
    sec.innerHTML=`<div class="as om-prof om-profpage om-suppage">${head}${h}</div>`;
    window.scrollTo(0,0);back();
  }catch(e){
    if($('tab-superiors'))sec.innerHTML=`<div class="as om-prof om-profpage">${head}<div class="om-empty" style="color:#e02424">${esc(e.message)}</div></div>`;
    back();
  }
}
window.omOpenSuperiors=openSuperiors;

/* ── New Order: the SAP numbers under the user, with a tick box that fills the outlet details above ── */
const PK={q:'',page:1,seq:0,t:null};
function sapPickerHtml(){
  return `<div class="as om-pick" id="om-pick"><h3>SAP numbers under you</h3>
    <p class="om-psub">Tick one to fill the outlet details above automatically (SAP code, zone, region, state, outlet, district, sales area, address, phone, pincode, GSTIN). Untick it to clear them.</p>
    <div class="fg" style="margin-bottom:8px"><input type="text" class="filter-search" id="om-pk-q" placeholder="Search SAP code, outlet, district, sales area…" autocomplete="off"></div>
    <div id="om-pk-list"><div class="om-empty">Loading…</div></div></div>`;
}
function syncPicker(){
  const rc=$('om-f-sap');if(!rc)return;
  const cur=rc.value.trim();
  document.querySelectorAll('#om-pick .om-pk-cb').forEach(c=>{c.checked=c.dataset.code===cur;});
}
async function loadSapPicker(){
  const box=$('om-pk-list');if(!box)return;
  const seq=++PK.seq;
  try{
    const j=await omGet({action:'sap_list',pick:1,page:PK.page,q:PK.q});
    if(seq!==PK.seq||!$('om-pk-list'))return;
    if(!j.rows.length){box.innerHTML=`<div class="om-empty">${PK.q?'No SAP number matches your search.':'No SAP numbers have been given to you yet.'}</div>`;return;}
    const rows=j.rows.map(r=>`<tr><td class="om-pk-c" data-label=""><input type="checkbox" class="om-pk-cb" data-code="${esc(r.sap_code)}" aria-label="Select ${esc(r.sap_code)}"></td><td class="om-ref" data-label="SAP">${esc(r.sap_code)}</td><td class="om-out" data-label="Outlet"><b>${esc(r.outlet_name)}</b></td><td data-label="Region">${esc(roName(r.ro))}</td><td data-label="District">${esc(r.district)||'—'}</td><td data-label="Sales area">${esc(r.sales_area)||'—'}</td></tr>`).join('');
    const from=(j.page-1)*j.per;
    box.innerHTML=`<div class="tw"><table class="om-cards om-pk"><thead><tr><th></th><th>SAP code</th><th>Outlet</th><th>Region</th><th>District</th><th>Sales area</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="om-pager"><span class="om-psub">Showing ${fmtN(from+1)}–${fmtN(Math.min(from+j.per,j.total))} of ${fmtN(j.total)}</span><div class="om-pbtns"><button type="button" class="btn-g" data-pkpage="${j.page-1}"${j.page<2?' disabled':''}>‹ Prev</button><button type="button" class="btn-g" data-pkpage="${j.page+1}"${j.page>=j.pages?' disabled':''}>Next ›</button></div></div>`;
    syncPicker();
  }catch(e){
    if(seq===PK.seq&&$('om-pk-list'))$('om-pk-list').innerHTML=`<div class="om-empty" style="color:#e02424">Could not load the SAP numbers: ${esc(e.message)}</div>`;
  }
}
function initSapPicker(){
  PK.q='';PK.page=1;
  const box=$('om-pick');if(!box)return;
  $('om-pk-q').addEventListener('input',e=>{PK.q=e.target.value.trim();PK.page=1;clearTimeout(PK.t);PK.t=setTimeout(loadSapPicker,300);});
  box.addEventListener('click',e=>{const b=e.target.closest('[data-pkpage]');if(b&&!b.disabled){PK.page=+b.dataset.pkpage;loadSapPicker();}});
  box.addEventListener('change',e=>{
    const cb=e.target.closest('.om-pk-cb');if(!cb)return;
    const rc=$('om-f-sap');if(!rc)return;
    box.querySelectorAll('.om-pk-cb').forEach(c=>{if(c!==cb)c.checked=false;});
    if(cb.checked){
      rc.value=cb.dataset.code;lookupSap(cb.dataset.code);
      const w=$('om-w-sap_code');if(w)w.scrollIntoView({behavior:'smooth',block:'center'});
    }else{
      rc.value='';rc.dataset.looked='';++_lookSeq;clearOutlet();sapHint('','');
    }
  });
  loadSapPicker();
}
/* ── Outlet login: the complete outlet address on top, and a page listing the Zone Officers and Regional Officers who have access to its SAP number ── */
function outletHeader(){
  const o=OM.meta&&OM.meta.outlet;if(!o)return;
  const el=document.getElementById('tb-scope-sub');if(!el)return;
  el.textContent='Outlet '+o.sap+' — '+o.name+(o.address?', '+o.address:'');
  el.title=el.textContent;el.style.whiteSpace='normal';el.style.maxWidth='min(720px,60vw)';el.style.lineHeight='1.35';
}
async function renderOfficers(){
  const sec=$('tab-officers');if(!sec)return;
  sec.innerHTML='<div class="om-empty">Loading…</div>';
  try{
    await ensureMeta();
    const j=await omGet({action:'outlet_officers'});
    if(OM.current!=='officers')return;
    const o=OM.meta.outlet||{};
    const rows=j.officers.map(x=>`<tr><td data-l="Name"><b>${esc(x.name)}</b></td><td data-l="Company">${esc(x.org_name)}</td><td data-l="Role">${esc(x.level_name)}</td><td data-l="Area">${esc(x.area||'—')}</td><td data-l="Mobile">${x.mobile?`<a href="tel:${esc(x.mobile)}">${esc(x.mobile)}</a>`:'—'}</td><td data-l="E-mail">${x.email?`<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>`:'—'}</td></tr>`).join('');
    sec.innerHTML=`<div class="om-outbox"><div class="om-outbox-h">${esc(o.name||'Outlet')} <span class="om-ref">${esc(j.sap)}</span></div>
      <div class="om-outbox-a">${esc(o.address||'—')}</div>
      <div class="om-outbox-m">${[o.zone&&'Zone: '+o.zone,o.ro&&'Region: '+o.ro,o.sales_area&&'Sales area: '+o.sales_area,o.phone&&'Phone: '+o.phone,o.gstin&&'GSTIN: '+o.gstin].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ')}</div></div>
      <div class="tc"><div class="th"><h3>Officers who have access to this SAP number (${j.officers.length})</h3></div>
      <div class="tw">${j.officers.length?`<table class="om-cards"><thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Area</th><th>Mobile</th><th>E-mail</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="om-empty">No Zone Officer or Regional Officer has been given access to this SAP number yet.</div>'}</div></div>`;
    labelCells&&labelCells(sec);
  }catch(e){
    if($('tab-officers'))sec.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load: ${esc(e.message)}</div>`;
  }
}
async function openReturn(id){
  const ov=$('om-overlay');if(!ov)return;
  ov.innerHTML='<div class="om-box om-narrow"><div class="om-empty">Loading…</div></div>';
  ov.classList.add('show');
  try{
    await ensureMeta();
    const j=await omGet({action:'get',id}),o=j.order;
    if(!canReturn(o)){closeModal();toast(o.ret&&o.ret.status==='pending'?'A return request for this order is already waiting for approval':o.ret&&o.ret.status==='approved'?'This order has already been returned':'A return can be requested only for a completed order','er');return;}
    const ap=retApprovers();
    ov.innerHTML=`<div class="om-box om-narrow om-retform"><h3>Return order <span class="om-ref">${esc(o.ref)}</span></h3>
      <div class="om-msub">${esc(o.outlet)} (${esc(o.ro_code)}) · ${fmtN(o.total_ea)} EA · ${fmtN(o.total_vol)} L</div>
      ${o.ret&&o.ret.status==='rejected'?`<div class="om-note err">An earlier return request was rejected${o.ret.decision_comment?`: “${esc(o.ret.decision_comment)}”`:''}. You can ask again.</div>`:''}
      <div class="om-grid om-grid1">
        <div class="field"><label>Reason for return *</label><textarea id="om-ret-reason" maxlength="500" rows="3" placeholder="Why is this order being returned?"></textarea><div class="om-field-err" id="om-e-ret-reason"></div></div>
        <div class="field"><label>Credit note *</label><input type="text" id="om-ret-cn" maxlength="200" placeholder="Credit note number / details" autocomplete="off"><div class="om-field-err" id="om-e-ret-cn"></div></div>
      </div>
      <div class="om-note info">ⓘ The request is sent for approval to ${ap.length?esc(ap.join(', ')):'the Super Admin'}.</div>
      <div class="om-field-err" id="om-ret-err"></div>
      <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button><button class="btn-p" data-act="return-send" data-id="${o.id}" id="om-ret-send">Send return request</button></div></div>`;
    setTimeout(()=>{const t=$('om-ret-reason');if(t)t.focus({preventScroll:true});},60);
  }catch(e){
    ov.innerHTML=`<div class="om-box om-narrow"><div class="om-empty" style="color:#e02424">${esc(e.message)}</div><div class="om-foot"><button class="btn-g" data-act="close">Close</button></div></div>`;
  }
}
async function sendReturn(id){
  ['reason','cn'].forEach(k=>{const e=$('om-e-ret-'+k);if(e)e.textContent='';});
  const er=$('om-ret-err');if(er)er.textContent='';
  const reason=$('om-ret-reason').value.trim(),cn=$('om-ret-cn').value.trim();
  let bad=false;
  if(reason.length<3){$('om-e-ret-reason').textContent='Enter the reason for the return.';bad=true;}
  if(!cn){$('om-e-ret-cn').textContent='Enter the credit note (number or details).';bad=true;}
  if(bad)return;
  const btn=$('om-ret-send');if(btn){btn.disabled=true;btn.textContent='Sending…';}
  try{
    const j=await omPost('return_request',{id,reason,credit_note:cn});
    toast(`Return requested for ${j.order.ref} — waiting for approval`);
    afterChange();
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent='Send return request';}
    const f=e.fields||{};
    if(f.reason)$('om-e-ret-reason').textContent=f.reason;
    if(f.credit_note)$('om-e-ret-cn').textContent=f.credit_note;
    if(er)er.textContent=Object.keys(f).length?'':e.message;
  }
}
function openRetDecide(rid,approve){
  const r=((OM.retSt&&OM.retSt.data&&OM.retSt.data.returns)||[]).find(x=>x.id===rid)||(OM.retMap&&OM.retMap[rid]);
  const ov=$('om-overlay');if(!r||!ov)return;
  ov.innerHTML=`<div class="om-box om-narrow om-retform"><h3>${approve?'Approve':'Reject'} return — <span class="om-ref">${esc(r.ref)}</span></h3>
    <div class="om-msub">${esc(r.outlet)} · requested by ${esc(r.requested_by_name)} · ${fmtDT(r.requested_at)}</div>${retInfo(r)}
    <div class="om-blk"><div class="k">Your comment ${approve?'<span class="om-opt">(optional)</span>':'<span class="om-opt">(required when rejecting)</span>'}</div><textarea id="om-ret-comment" maxlength="500" placeholder="${approve?'Add a comment…':'Why is the return rejected?'}"></textarea><div class="om-field-err" id="om-ret-cerr"></div></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button>${approve?`<button class="btn-s" data-act="ret-decide" data-rid="${rid}" data-ok="1">✓ Approve return</button>`:`<button class="om-btn-reject" data-act="ret-decide" data-rid="${rid}" data-ok="0">✕ Reject return</button>`}</div></div>`;
  ov.classList.add('show');
}
async function sendRetDecide(rid,approve){
  const ta=$('om-ret-comment'),err=$('om-ret-cerr'),comment=ta?ta.value.trim():'';
  if(!approve&&!comment){if(ta)ta.classList.add('bad');if(err)err.textContent='Please enter a reason for rejecting this return.';return;}
  document.querySelectorAll('#om-overlay [data-act="ret-decide"]').forEach(b=>b.disabled=true);
  try{
    await omPost('return_decide',{rid,approve,comment});
    toast(approve?'Return approved':'Return rejected');
  }catch(e){toast('Error: '+e.message,'er');}
  afterChange();
}
function retState(){return OM.retSt||(OM.retSt={status:null,q:'',data:null});}
function renderReturns(){
  const sec=$('tab-returns');if(!sec)return;
  OM.detail=null;saveView();
  const st=retState();
  if(st.status===null)st.status='';   // the page opens on ALL the returns (the pending ones come first); the Status filter narrows it
  sec.innerHTML=`<div class="filter-bar"><div class="fg"><label>Status</label><select id="om-ret-st"><option value="">All</option>${['pending','approved','rejected'].map(x=>`<option value="${x}"${st.status===x?' selected':''}>${x==='pending'?'Pending approval':x==='approved'?'Approved (returned)':'Rejected'}</option>`).join('')}</select></div>
    <div class="fg"><label>Search</label><input type="text" class="filter-search" id="om-ret-q" value="${esc(st.q)}" placeholder="Order ref, outlet, SAP code, credit note…"></div>
    <button class="btn-g right" style="margin-left:auto" data-act="ret-reset">Reset</button></div>
    <div class="tc"><div class="th"><h3 id="om-ret-title">Returns</h3></div><div class="tw" id="om-ret-table"><div class="om-empty">Loading…</div></div></div>`;
  $('om-ret-st').addEventListener('change',e=>{st.status=e.target.value;loadReturns();});
  $('om-ret-q').addEventListener('input',e=>{st.q=e.target.value;clearTimeout(OM.timers.returns);OM.timers.returns=setTimeout(loadReturns,300);});
  loadReturns();
}
async function loadReturns(silent){
  const st=retState(),box=$('om-ret-table');if(!box)return;
  try{
    const params={action:'return_list'};if(st.status)params.status=st.status;if(st.q)params.q=st.q;
    const [,j]=await Promise.all([refreshMeta(),omGet(params)]);
    if(OM.current!=='returns'||OM.detail)return;
    const sig=JSON.stringify(j.returns);
    if(silent&&st.data&&st.sig===sig)return;
    if(silent&&(modalOpen()||userIsTyping($('tab-returns'))))return;
    st.data=j;st.sig=sig;drawReturns();
  }catch(e){if(!silent)box.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load returns: ${esc(e.message)}</div>`;}
}
function drawReturns(){
  const st=retState(),box=$('om-ret-table');if(!box||!st.data)return;
  const rows=st.data.returns;
  const t=$('om-ret-title');if(t)t.textContent=`Returns (${rows.length})`+(retCanDecide()&&OM.meta.ret.awaiting?` — ${OM.meta.ret.awaiting} waiting for your approval`:'');
  if(!rows.length){box.innerHTML=`<div class="om-empty">${st.status==='pending'?'No return is waiting for approval.':'No returns found.'}</div>`;return;}
  const head=['Order ref','Requested','Outlet','Qty (EA)','Requested by','Reason','Credit note','Status','Actions'];
  const body=rows.map(r=>`<tr><td class="om-ref">${esc(r.ref)}</td><td>${fmtDS(r.requested_at)}</td><td class="om-out"><b>${esc(r.outlet)}</b><div class="om-sub">${esc(r.ro_code)}</div></td>
    <td class="om-num">${fmtN(r.total_ea)}</td><td>${esc(r.requested_by_name)}</td><td class="om-wrap">${esc(r.reason)}</td><td class="om-wrap">${esc(r.credit_note)}</td>
    <td><span class="om-pill p-ret-${esc(r.status)}">${RET_LBL[r.status]||esc(r.status)}</span>${r.status!=='pending'&&r.decided_by_name?`<div class="om-sub">by ${esc(r.decided_by_name)} · ${fmtDS(r.decided_at)}</div>`:''}${r.status==='rejected'&&r.decision_comment?`<div class="om-sub rej">“${esc(r.decision_comment)}”</div>`:''}</td>
    <td><div class="om-acts">${r.can_decide?`<button class="om-btn p" data-act="ret-approve" data-rid="${r.id}">✓ Approve</button><button class="om-btn d" data-act="ret-reject" data-rid="${r.id}">✕ Reject</button>`:''}<button class="om-btn" data-act="view" data-id="${r.order_id}">View order</button></div></td></tr>`).join('');
  box.innerHTML=`<table class="om-cards"><thead><tr>${head.map(h=>`<th${/Qty/.test(h)?' class="om-num"':''}>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  labelCells(box);
}

/* ── review popup (HPCL, pending orders) ── */
function closeModal(){
  const ov=$('om-overlay');if(ov){ov.classList.remove('show');ov.innerHTML='';}
  if(OM.so){URL.revokeObjectURL(OM.so.url);OM.so=null;}
}

/* ── Sales Order PDF (Rohan, My Orders): preview in a popup + download ── */
function loadScript(src){
  return new Promise((res,rej)=>{
    const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Could not load '+src.split('/').pop()));
    document.head.appendChild(s);
  });
}
async function ensurePdfLibs(){
  if(!(window.jspdf&&window.jspdf.jsPDF))await loadScript(BASE+'jspdf.umd.min.js');
  if(!window.qrcode)await loadScript(BASE+'qrcode.js?v=20261104a');   // QR code on the Tax Invoice
  if(!window.OM_SO)await loadScript(BASE+'salesorder.js?v=20261118c');
}
async function openSalesOrder(id,doc){
  const ov=$('om-overlay');if(!ov)return;
  ov.innerHTML='<div class="om-box om-so"><div class="om-empty">Preparing PDF…</div></div>';
  ov.classList.add('show');
  try{
    const [j]=await Promise.all([omGet({action:'get',id}),ensurePdfLibs()]);
    if(doc!=='invoice')doc='so';
    const dn=docName(doc);
    if(j.order.status!=='approved')throw new Error('The Sales Order is generated only after the order is approved.');
    if(doc==='invoice'&&!j.order.tax_inv)throw new Error('This order has no Tax Invoice.');
    const r=doc==='invoice'?window.OM_SO.makeInvoice(j.order):window.OM_SO.make(j.order);
    const url=URL.createObjectURL(r.doc.output('blob'));
    OM.so={url,name:r.name};
    ov.innerHTML=`<div class="om-box om-so"><h3>${dn} <span class="om-ref">${esc(j.order.ref)}</span> ${pill(j.order.status)}</h3>
      <div class="om-msub">${esc(j.order.outlet)} (${esc(j.order.ro_code)})</div>
      <iframe class="om-so-frame" title="${dn} preview" src="${url}#view=FitH&pagemode=none&toolbar=0"></iframe>
      <div class="om-foot"><button class="btn-g" data-act="close">Close</button><button class="btn-p" data-act="so-dl">⬇ Download PDF</button></div></div>`;
  }catch(e){
    ov.innerHTML=`<div class="om-box"><div class="om-empty" style="color:#e02424">${esc(e.message)}</div><div class="om-foot"><button class="btn-g" data-act="close">Close</button></div></div>`;
  }
}
function downloadSalesOrder(){
  if(!OM.so)return;
  const a=document.createElement('a');a.href=OM.so.url;a.download=OM.so.name;
  document.body.appendChild(a);a.click();a.remove();
}

/* ── Bulk order (Rohan, My Orders): read the client's Excel format in the browser, preview, then create ──
   The sheet is only read here (SheetJS, loaded when the popup opens); the rows go to orders.php?action=bulk, which re-checks everything. */
const BULK_COLS=['PO Date','NAME','Pack Size\n in Ltr','ORDER \nQty ','FOC\n Qty','Total Vol. \nin Ltrs','Rate/Unit Include GST','Total Amount','Brand','SAP_CODE','ZONE_NAME','REGIONAL_OFFICE_NAME','SALES_AREA_NAME','STATE_NAME','DISTRICT_NM','RO TELE_NUM','HPCL_SALES OFFICER NAME','CONTACT NUM.','SALES AREA NAME'];
const BULK_MAX=500;
function ensureXlsx(){return window.XLSX?Promise.resolve():loadScript(BASE+'xlsx.mini.min.js');}
const hdrKey=s=>String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
const pad2=n=>String(n).padStart(2,'0');
function bulkDate(v){
  if(v==null||v==='')return'';
  if(typeof v==='number'){const d=new Date(Math.floor(v-25569)*86400000);return isNaN(d)?'':d.toISOString().slice(0,10);}   // Excel serial day
  const s=String(v).trim();let m;
  if((m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)))return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  if((m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})$/.exec(s)))return `${m[3].length===2?'20'+m[3]:m[3]}-${pad2(m[2])}-${pad2(m[1])}`;   // dd-mm-yyyy
  return s;
}
function bulkSap(v){return v==null?'':(typeof v==='number'?String(Math.round(v)):String(v).trim());}

/* sheet -> [{row,date,name,pack,qty,foc,brand,sap_code}] ; throws a readable message when the file is not the bulk order format */
async function bulkRead(file){
  if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw new Error('Please choose the bulk order Excel file (.xlsx).');
  if(file.size>5*1024*1024)throw new Error('This file is larger than 5 MB. Please check that it is the bulk order sheet.');
  await ensureXlsx();
  let wb;
  try{wb=XLSX.read(await file.arrayBuffer(),{type:'array'});}catch(e){throw new Error('This file could not be read as an Excel sheet.');}
  const ws=wb.Sheets[wb.SheetNames.find(n=>/def\s*order/i.test(n))||wb.SheetNames[0]];
  if(!ws||!ws['!ref'])throw new Error('The sheet is empty.');
  const r0=XLSX.utils.decode_range(ws['!ref']).s.r;
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:true});
  let h=-1;
  for(let i=0;i<Math.min(aoa.length,15)&&h<0;i++)if((aoa[i]||[]).some(c=>hdrKey(c)==='sapcode'))h=i;
  if(h<0)throw new Error('The SAP_CODE column was not found. Please use the bulk order format (use “Download the sheet format”).');
  const col={};
  (aoa[h]||[]).forEach((c,i)=>{
    const k=hdrKey(c);if(!k)return;
    if(k==='podate'||k==='orderdate'||k==='date')col.date=col.date??i;
    else if(k==='name'||k==='outletname')col.name=col.name??i;
    else if(k.startsWith('packsize'))col.pack=col.pack??i;
    else if(k==='orderqty'||k==='qty'||k==='quantity')col.qty=col.qty??i;
    else if(k==='focqty'||k==='foc')col.foc=col.foc??i;
    else if(k==='brand')col.brand=col.brand??i;
    else if(k==='sapcode')col.sap=col.sap??i;
  });
  const missing=[['date','PO Date'],['qty','ORDER Qty'],['brand','Brand'],['sap','SAP_CODE']].filter(([k])=>col[k]==null).map(x=>x[1]);
  if(missing.length)throw new Error('Column'+(missing.length>1?'s':'')+' not found: '+missing.join(', ')+'. Please use the bulk order format.');
  const g=(r,k)=>col[k]==null?null:r[col[k]];
  const rows=[];
  for(let i=h+1;i<aoa.length;i++){
    const r=aoa[i]||[];
    const row={row:r0+i+1,date:bulkDate(g(r,'date')),name:String(g(r,'name')==null?'':g(r,'name')).trim(),pack:g(r,'pack'),qty:g(r,'qty'),foc:g(r,'foc'),brand:String(g(r,'brand')==null?'':g(r,'brand')).trim(),sap_code:bulkSap(g(r,'sap'))};
    if(!row.date&&!row.name&&!row.sap_code&&(row.qty==null||row.qty===''))continue;   // empty line, or a note such as a lone "HP DEF" under the table
    rows.push(row);
  }
  if(!rows.length)throw new Error('No order rows were found under the column headings.');
  if(rows.length>BULK_MAX)throw new Error(`The sheet has ${rows.length} rows; a bulk upload can have at most ${BULK_MAX}. Please split it.`);
  return rows;
}

async function bulkTemplate(){
  try{
    await ensureXlsx();
    const ex=['',  'OUTLET NAME',20,54,3,'','','','TATA HP','90000001','Central Zone','','','','','','','',''];
    const ws=XLSX.utils.aoa_to_sheet([BULK_COLS,ex]);
    ws['!cols']=BULK_COLS.map((c,i)=>({wch:i===1?34:i===0?12:14}));
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'DEF Order');
    XLSX.writeFile(wb,'Bulk Order Format.xlsx');
  }catch(e){toast('Error: '+e.message,'er');}
}

function openBulk(){
  const ov=$('om-overlay');if(!ov)return;
  OM.bulk={rows:null,busy:false};
  ov.innerHTML=`<div class="om-box om-bulk"><h3>Bulk order</h3>
    <div class="om-msub">Upload the bulk order Excel sheet. One order is created for each outlet (SAP code) and PO date. You will see a preview before anything is created.</div>
    <label class="om-drop" id="om-bulk-drop"><input type="file" id="om-bulk-file" accept=".xlsx,.xls,.csv"><b>Choose the Excel file</b><span>or drop it here · .xlsx</span></label>
    <div class="om-field-err" id="om-bulk-msg"></div>
    <div class="om-bulk-help"><b>How the sheet is read</b><ul>
      <li>Columns used: <b>PO Date</b>, <b>ORDER Qty</b>, <b>FOC Qty</b>, <b>Brand</b> (TATA HP or HP DEF) and <b>SAP_CODE</b>; NAME and Pack Size (20 L) are checked if present. Rate, amount, zone, RO and the other columns are ignored — the outlet details come from the SAP code.</li>
      <li>ORDER Qty is what is billed; the FOC is added on top, 20 L each (54 + 3 FOC → 57 EA, 1,140 L). A row without FOC Qty gets the FOC of the <b>FOC</b> page's list for its ORDER Qty; the Sales Order and Tax Invoice list the FOC as a free line.</li>
      ${OM.kind==='hpcl'?'<li>Orders placed by Bulk upload are submitted straight away for approval (no drafts). An order below the minimum quantity, or for a product whose price Rohan Energy has not set, is not placed and its rows are listed.</li>':''}
      <li>Only outlets of your zone (${esc(meZoneText())})${OM.meta&&OM.meta.me&&(OM.meta.me.ros||[]).length?' and your regions ('+OM.meta.me.ros.map(roName).join(', ')+')':''} are accepted. Rows with a problem are listed and skipped.</li></ul>
      <button class="btn-g" data-act="bulk-template">⬇ Download the sheet format</button></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button></div></div>`;
  ov.classList.add('show');
  const inp=$('om-bulk-file'),drop=$('om-bulk-drop');
  inp.addEventListener('change',()=>{if(inp.files[0])bulkFile(inp.files[0]);});
  ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
  drop.addEventListener('drop',e=>{const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)bulkFile(f);});
}
async function bulkFile(file){
  const msg=$('om-bulk-msg'),drop=$('om-bulk-drop');
  if(msg)msg.textContent='';
  if(drop)drop.classList.add('busy');
  try{
    const rows=await bulkRead(file);
    OM.bulk={rows,file:file.name,busy:false};
    const j=await omPost('bulk',{mode:'preview',rows});
    if(!$('om-bulk-file')&&!$('om-bulk-drop'))return;   // popup was closed meanwhile
    renderBulkPreview(j);
  }catch(e){
    if(msg)msg.textContent=e.message;
    if(drop)drop.classList.remove('busy');
    const inp=$('om-bulk-file');if(inp)inp.value='';
  }
}

function bulkItems(o){return o.items.map(i=>`${esc(i.item)} × ${fmtN(i.ea)}`).join('<br>');}
function bulkNotes(o,min){
  const n=[];
  if(o.foc)n.push(`Includes ${fmtN(o.foc)} FOC`);
  if(o.below_min)n.push(`<span class="om-warn">Below the minimum of ${fmtN(min)} EA — stays a draft</span>`);
  if(o.name_differs)n.push(`<span class="om-warn">Sheet name “${esc(o.sheet_name)}” differs from the outlet — check the SAP code</span>`);
  if(o.existing_ref)n.push(`<span class="om-warn">You already have ${esc(o.existing_ref)} for this outlet and date</span>`);
  return n.join('<br>');
}
function bulkErrors(errs){
  if(!errs.length)return'';
  return `<h4 class="om-bh bad">${errs.length} row${errs.length>1?'s':''} not created</h4><div class="om-bulk-scroll"><table class="om-mini"><thead><tr><th>Row</th><th>SAP code</th><th>Name in sheet</th><th>Problem</th></tr></thead><tbody>
    ${errs.map(e=>`<tr><td>${e.row}</td><td>${esc(e.sap_code)}</td><td>${esc(e.name)}</td><td class="bad">${esc(e.error)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderBulkPreview(j){
  const ov=$('om-overlay');if(!ov)return;
  const os=j.orders,ea=os.reduce((a,o)=>a+o.total_ea,0),vol=os.reduce((a,o)=>a+o.total_vol,0);
  const small=os.filter(o=>o.below_min).length,hp=OM.kind==='hpcl';
  OM.bulk.min=j.min;
  ov.innerHTML=`<div class="om-box om-bulk wide"><h3>Bulk order — preview</h3>
    <div class="om-msub">${esc(OM.bulk.file||'')} · ${OM.bulk.rows.length} row${OM.bulk.rows.length>1?'s':''} read. Nothing has been created yet.</div>
    <div class="om-bsum"><div><b>${os.length}</b><span>order${os.length===1?'':'s'} ready</span></div><div><b>${fmtN(ea)}</b><span>EA</span></div><div><b>${fmtN(vol)}</b><span>litres</span></div><div class="${j.errors.length?'bad':''}"><b>${j.errors.length}</b><span>row${j.errors.length===1?'':'s'} with problems</span></div></div>
    ${os.length?`<div class="om-bulk-scroll"><table class="om-mini"><thead><tr><th>Row</th><th>Outlet</th><th>PO date</th><th>Item(s)</th><th class="om-num">Qty (EA)</th><th class="om-num">Litres</th><th>Notes</th></tr></thead><tbody>
      ${os.map(o=>`<tr><td>${o.rows.join(', ')}</td><td><b>${esc(o.outlet)}</b><div class="om-sub">${esc(o.sap_code)}</div></td><td>${fmtDS(o.date)}</td><td>${bulkItems(o)}</td><td class="om-num">${fmtN(o.total_ea)}</td><td class="om-num">${fmtN(o.total_vol)}</td><td class="om-bnote">${bulkNotes(o,j.min)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="om-empty">No order can be created from this sheet.</div>'}
    ${bulkErrors(j.errors)}
    ${small&&!hp?`<div class="om-binfo">${small} order${small>1?'s are':' is'} below the minimum order quantity (${fmtN(j.min)} EA): “Create &amp; submit” will keep ${small>1?'them':'it'} as draft${small>1?'s':''}.</div>`:''}
    ${hp&&os.length?'<div class="om-binfo">These orders are placed at once and sent to the Super Admin for confirmation. An order placed by HPCL cannot be edited afterwards.</div>':''}
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button><button class="btn-g" data-act="bulk-again">Choose another file</button>
      ${hp?'':`<button class="btn-g" data-act="bulk-create" data-mode="draft"${os.length?'':' disabled'}>Create ${os.length} as drafts</button>`}
      <button class="btn-p" data-act="bulk-create" data-mode="submit"${os.length?'':' disabled'}>${hp?`Place ${os.length} order${os.length===1?'':'s'} &amp; send to Super Admin`:`Create ${os.length} &amp; submit for approval`}</button></div></div>`;
}
async function bulkCreate(mode){
  if(!OM.bulk||OM.bulk.busy||!OM.bulk.rows)return;
  OM.bulk.busy=true;
  const btns=[...document.querySelectorAll('#om-overlay [data-act="bulk-create"],#om-overlay [data-act="bulk-again"]')];
  const label=new Map(btns.map(b=>[b,b.innerHTML]));
  btns.forEach(b=>{b.disabled=true;if(b.dataset.mode===mode)b.textContent='Creating…';});
  try{
    const j=await omPost('bulk',{mode,rows:OM.bulk.rows});
    OM.bulk.rows=null;
    renderBulkDone(j);
    refreshMeta().catch(()=>{});
  }catch(e){
    OM.bulk.busy=false;
    toast('Error: '+e.message,'er');
    const f=document.querySelector('#om-overlay .om-foot');
    if(f&&!document.querySelector('#om-overlay .om-bfail'))f.insertAdjacentHTML('beforebegin',`<div class="om-field-err om-bfail">${esc(e.message)}</div>`);
    btns.forEach(b=>{b.disabled=false;b.innerHTML=label.get(b);});
  }
}
function renderBulkDone(j){
  const ov=$('om-overlay');if(!ov)return;
  const made=j.orders.filter(o=>o.id),pend=made.filter(o=>o.status==='pending').length;
  ov.innerHTML=`<div class="om-box om-bulk wide"><h3>${made.length} order${made.length===1?'':'s'} created</h3>
    <div class="om-msub">${pend?`${pend} sent for approval`:''}${pend&&made.length>pend?' · ':''}${made.length>pend?`${made.length-pend} saved as draft${made.length-pend>1?'s':''} (open them from My Orders to edit or submit)`:''}</div>
    ${made.length?`<div class="om-bulk-scroll"><table class="om-mini"><thead><tr><th>Order ref</th><th>Outlet</th><th>PO date</th><th>Item(s)</th><th class="om-num">Qty (EA)</th><th class="om-num">Litres</th><th>Status</th></tr></thead><tbody>
      ${made.map(o=>`<tr><td class="om-ref">${esc(o.ref)}</td><td><b>${esc(o.outlet)}</b><div class="om-sub">${esc(o.sap_code)}</div></td><td>${fmtDS(o.date)}</td><td>${bulkItems(o)}</td><td class="om-num">${fmtN(o.total_ea)}</td><td class="om-num">${fmtN(o.total_vol)}</td>
        <td>${pill(o.status)}${o.below_min&&o.status==='draft'&&j.mode==='submit'?`<div class="om-sub rej">Below the minimum of ${fmtN(j.min)} EA</div>`:''}</td></tr>`).join('')}</tbody></table></div>`:''}
    ${bulkErrors(j.errors)}
    ${j.errors.length?`<div class="om-binfo">Fix these rows in the sheet and upload them again — rows that were created are already in ${OM.kind==='hpcl'?'All Orders':'My Orders'}, so do not upload those twice.</div>`:''}
    <div class="om-foot"><button class="btn-g" data-act="bulk">Upload another file</button><button class="btn-p" data-act="bulk-done">${OM.kind==='hpcl'?'Go to All Orders':'Go to My Orders'}</button></div></div>`;
}

const EVT_LBL={foc_edited:'FOC changed at review',created:'Draft created',edited:'Edited',submitted:'Submitted for approval',approved:'Approved',rejected:'Rejected',so_generated:'Sales Order Generated',return_requested:'Return requested',return_approved:'Return approved',return_rejected:'Return rejected',transit:'Transit',receipt_uploaded:'Payment Receipt',pod_uploaded:'Proof of Delivery',invoice_uploaded:'Tax Invoice (uploaded)',delivered:'Delivery Confirmed'};
const INV_EVT_LBL={created:'Order placed by HPCL',submitted:'Sent to Super Admin for confirmation',approved:'Confirmed by Superadmin',rejected:'Rejected by Superadmin',so_generated:'Sales Order & Tax Invoice Generated'};
/* an order HPCL placed before the Superadmin step existed was approved by the placing HPCL officer: keep its old wording */
const evtLabel=(o,a,e)=>(o.doc_type==='invoice'&&a==='so_generated'&&o.invoice_mode==='manual')?'Sales Order Generated':(o.doc_type==='invoice'&&INV_EVT_LBL[a])||(o.doc_type!=='invoice'&&o.tax_inv&&a==='so_generated'&&o.invoice_mode!=='manual'?'Sales Order & Tax Invoice Generated':'')||EVT_LBL[a]||a;
const STAGE_LBL={transit:'In transit',delivered:'Delivered'};

async function openReview(id){
  const ov=$('om-overlay');if(!ov)return;
  ov.innerHTML='<div class="om-box"><div class="om-empty">Loading…</div></div>';
  ov.classList.add('show');
  try{
    const j=await omGet({action:'get',id});
    if(!canReview(j.order)){closeModal();return openDetail(id);}   // nothing to decide: show the order page instead
    ov.innerHTML=`<div class="om-box">${reviewHtml(j.order)}</div>`;
  }catch(e){
    ov.innerHTML=`<div class="om-box"><div class="om-empty" style="color:#e02424">${esc(e.message)}</div><div class="om-foot"><button class="btn-g" data-act="close">Close</button></div></div>`;
  }
}

/* rate (per EA, before GST) and GST % of a line: the ones fixed on the order, else the current list price (pending orders) */
function lineRate(i){
  if(i.rate!=null)return{rate:Number(i.rate),gst:i.gst==null?18:Number(i.gst),list:false};
  const p=((OM.meta&&OM.meta.prices)||[]).find(x=>x.item===i.item);
  return p&&p.rate?{rate:Number(p.rate),gst:p.gst,list:true}:null;
}
const money2=n=>Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
/* under an item of the order page: Qty is everything delivered (ordered + FOC), the amount is only for the ordered EA; the Sales Order and Tax Invoice list the FOC on its own line */
function focNote(i,r){return i.foc>0?`<div class="om-hint om-foc">${i.paid!=null?`${fmtN(i.paid)} ordered + ${fmtN(i.foc)} EA FOC (free of cost)`:`Includes ${fmtN(i.foc)} EA FOC (free of cost)`}${i.paid!=null&&r?focCalcNote(i.paid,i.ea,r.rate,r.gst):''}</div>`:'';}
/* the scheme chart's arithmetic for a line: DLP (rate + GST) x ordered EA = DLP after FOC x all EA (e.g. 1,652 x 100 = 1,558.49 x 106 = 1,65,200) */
function focCalcNote(paid,tot,rate,gst){
  const g=gst==null?18:Number(gst),dlp=Number(rate)*(1+g/100);
  if(!(dlp>0)||!(tot>0))return'';
  return `<div class="om-foc-calc">DLP ${money2(dlp)} × ${fmtN(paid)} = ${money2(dlp*paid/tot)} after FOC × ${fmtN(tot)} = ${money2(dlp*paid)} (incl. GST)</div>`;
}
/* the DLP: price per EA incl. GST (rate before GST x (1 + GST %), 2 decimals) - the rate everybody sees; orders store the rate before GST */
const dlpOf=(rate,gst)=>Math.round(Number(rate)*(1+(gst==null||gst===''?18:Number(gst))/100)*100)/100;
function itemsTable(o){
  const priced=o.doc_type==='invoice'||!!o.tax_inv;   // an order placed by HPCL, or one with a Tax Invoice, shows its rates to everyone who can see it (HPCL, Rohan Energy, super admin)
  if(!priced)return `<table class="om-mini om-lines"><thead><tr><th>Item</th><th class="om-num">Qty (EA)</th><th class="om-num">Volume (L)</th></tr></thead><tbody>
      ${o.items.map(i=>`<tr><td>${esc(i.item)}${focNote(i)}</td><td class="om-num" data-l="Qty (EA)">${fmtN(i.ea)}</td><td class="om-num" data-l="Volume (L)">${fmtN(i.vol)}</td></tr>`).join('')||'<tr><td colspan="3" style="color:#9ca3af">No items</td></tr>'}
      <tr class="tot"><td>Total</td><td class="om-num" data-l="Qty (EA)">${fmtN(o.total_ea)}</td><td class="om-num" data-l="Volume (L)">${fmtN(o.total_vol)}</td></tr></tbody></table>`;
  let tot=0,anyList=false,missing=false;
  const rows=o.items.map(i=>{
    const r=lineRate(i);
    if(!r){missing=true;return `<tr><td>${esc(i.item)}${focNote(i)}</td><td class="om-num" data-l="Qty (EA)">${fmtN(i.ea)}</td><td class="om-num" data-l="Volume (L)">${fmtN(i.vol)}</td><td class="om-num" data-l="Rate (₹/EA)">—</td><td class="om-num" data-l="GST">—</td><td class="om-num" data-l="Amount (₹)">—</td></tr>`;}
    if(r.list)anyList=true;
    const pd=i.paid!=null?i.paid:i.ea,erate=dlpOf(r.rate,r.gst),amt=erate*pd;tot+=amt;   // the rate is the DLP (incl. GST); the amount = DLP x the ordered EA (the FOC EA are free)
    return `<tr><td>${esc(i.item)}${focNote(i,r)}</td><td class="om-num" data-l="Qty (EA)">${fmtN(i.ea)}</td><td class="om-num" data-l="Volume (L)">${fmtN(i.vol)}</td><td class="om-num" data-l="Rate (₹/EA, incl. GST)">${money2(erate)}${r.list?'*':''}</td><td class="om-num" data-l="GST">${fmtN(r.gst)}%</td><td class="om-num" data-l="Amount (₹)">${money2(amt)}</td></tr>`;
  }).join('')||'<tr><td colspan="6" style="color:#9ca3af">No items</td></tr>';
  return `<table class="om-mini om-lines"><thead><tr><th>Item</th><th class="om-num">Qty (EA)</th><th class="om-num">Volume (L)</th><th class="om-num">Rate (₹/EA, incl. GST)</th><th class="om-num">GST</th><th class="om-num">Amount (₹, incl. GST)</th></tr></thead><tbody>
      ${rows}<tr class="tot"><td>Total</td><td class="om-num" data-l="Qty (EA)">${fmtN(o.total_ea)}</td><td class="om-num" data-l="Volume (L)">${fmtN(o.total_vol)}</td><td></td><td></td><td class="om-num" data-l="Amount (₹)">${missing?'—':money2(tot)}</td></tr></tbody></table>`
      +(anyList?'<div class="om-sub" style="margin-top:4px">* Current list price set by Rohan Energy. It is fixed on the order when it is approved'+(OM.kind==='admin'?', unless you change the rate with Edit.':'; the Superadmin may change it before then.')+'</div>':'');
}

/* ── Review: the lines as they stand - ordered EA, FOC, total quantity, litres and the rate after FOC (amount = DLP x ordered EA, rate after FOC = that amount / all EA,
   e.g. DLP 1,652 x 100 = 1,558.49 x 106 = 1,65,200). The FOC itself is changed with "Edit order & rates" (a FOC column), not here. ── */
function rvLine(i){
  const foc0=i.paid!=null?Math.max(0,i.foc||0):(i.foc?Math.min(i.foc,Math.max(0,i.ea-1)):0),paid=i.paid!=null?i.paid:Math.max(1,i.ea-foc0);
  return{foc0,paid};
}
function reviewItemsTable(o){
  const priced=o.doc_type==='invoice'||!!o.tax_inv;
  let tot=0,anyList=false,missing=false;
  const rows=o.items.map(i=>{
    const {foc0,paid}=rvLine(i),r=priced?lineRate(i):null;
    let money='';
    if(priced){
      if(!r){missing=true;money='<td class="om-num" data-l="Rate (₹/EA, incl. GST)">—</td><td class="om-num" data-l="GST">—</td><td class="om-num" data-l="Amount (₹)">—</td>';}
      else{if(r.list)anyList=true;const dlp=dlpOf(r.rate,r.gst);tot+=dlp*paid;
        money=`<td class="om-num" data-l="Rate after FOC (₹/EA, incl. GST)">${money2(dlp*paid/(paid+foc0))}${r.list?'*':''}</td><td class="om-num" data-l="GST">${fmtN(r.gst)}%</td><td class="om-num" data-l="Amount (₹, incl. GST)">${money2(dlp*paid)}</td>`;}
    }
    return `<tr><td>${esc(i.item)}${r?focCalcNote(paid,paid+foc0,r.rate,r.gst):''}</td>
      <td class="om-num" data-l="Ordered (EA)">${fmtN(paid)}</td>
      <td class="om-num" data-l="FOC (EA)">${fmtN(foc0)}</td>
      <td class="om-num" data-l="Total qty (EA)">${fmtN(paid+foc0)}</td><td class="om-num" data-l="Volume (L)">${fmtN(i.vol)}</td>${money}</tr>`;
  }).join('')||`<tr><td colspan="${priced?8:5}" style="color:#9ca3af">No items</td></tr>`;
  const head=`<th>Item</th><th class="om-num">Ordered (EA)</th><th class="om-num">FOC (EA)</th><th class="om-num">Total qty (EA)</th><th class="om-num">Volume (L)</th>`+(priced?'<th class="om-num">Rate after FOC (₹/EA, incl. GST)</th><th class="om-num">GST</th><th class="om-num">Amount (₹, incl. GST)</th>':'');
  return `<table class="om-mini om-lines om-rv"><thead><tr>${head}</tr></thead><tbody>${rows}<tr class="tot"><td>Total</td><td></td><td></td><td class="om-num" data-l="Total qty (EA)">${fmtN(o.total_ea)}</td><td class="om-num" data-l="Volume (L)">${fmtN(o.total_vol)}</td>${priced?`<td></td><td></td><td class="om-num" data-l="Amount (₹)">${missing?'—':money2(tot)}</td>`:''}</tr></tbody></table>`
    +(rohanAdmin()?'<div class="om-sub om-rv-note">To change the <b>FOC</b> of a line, use <b>Edit order &amp; rates</b> — it has a FOC column.</div>':'')
    +(priced&&anyList?'<div class="om-sub" style="margin-top:4px">* Current list price set by Rohan Energy. It is fixed on the order when it is approved.</div>':'');
}

function reviewHtml(o){
  const kv=(k,v)=>`<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const byHpcl=o.doc_type==='invoice',adm=rohanAdmin();
  let h=`<h3>Review order ${esc(o.ref)} ${pill(o.status)}</h3>
    <div class="om-msub">${byHpcl?'Placed':'Submitted'} by ${esc(o.created_by_name)} (${byHpcl?'HPCL':'Rohan Energy'}) on ${fmtDT(o.submitted_at||o.created_at)} — on approval ${byHpcl?invDocsText():invDocsTextRohan()}</div>
    <div class="om-dl">
      ${kv('Outlet',esc(o.outlet))}${kv('SAP code',esc(o.ro_code))}${kv('Regional office',esc(o.ro))}
      ${kv('District / State',esc(o.district)+' / '+esc(o.state))}${kv('Sales area',esc(o.sales_area||'—'))}${kv('Zone',esc(o.zone))}
    </div>${reviewItemsTable(o)}`;
  if(o.remarks)h+=`<div class="om-blk"><div class="k">${byHpcl?'HPCL':'Rohan'} remarks</div><div class="om-quote">${esc(o.remarks)}</div></div>`;
  h+=`<div class="om-blk"><div class="k">Your comment <span class="om-opt">(required when rejecting)</span></div><textarea id="om-comment" maxlength="500" placeholder="Add a comment for the ${byHpcl?'HPCL':'Rohan'} officer…"></textarea><div class="om-field-err" id="om-comment-err"></div></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Close</button>${adm?`<button class="btn-g" data-act="edit" data-id="${o.id}">✎ Edit order &amp; rates</button>`:''}<button class="om-btn-reject" id="om-btn-reject" data-act="reject" data-id="${o.id}" data-seen="${esc(o.updated_at||'')}">✕ Reject</button><button class="btn-s" id="om-btn-approve" data-act="approve" data-id="${o.id}" data-seen="${esc(o.updated_at||'')}">${autoInv()?'✓ Approve &amp; generate documents':(byHpcl?'✓ Approve &amp; generate Sales Order':'✓ Approve order')}</button></div>`;
  return h;
}

async function decide(id,approve){
  const ta=$('om-comment'),err=$('om-comment-err');
  const comment=ta?ta.value.trim():'';
  if(!approve&&!comment){
    if(ta)ta.classList.add('bad');
    if(err)err.textContent='Please enter a reason for rejecting this order.';
    if(ta)ta.focus();
    return;
  }
  const a=$('om-btn-approve'),r=$('om-btn-reject');
  if(!approve){   // rejecting is final for the order: ask once more
    const ref=(document.querySelector('#om-overlay h3 .om-ref')||{}).textContent||'';
    const ok=await showModal({title:'Reject order'+(ref?' '+ref:''),body:'Are you sure you want to reject this order? It goes back with your reason: “'+comment+'”.',confirmText:'Yes, reject',confirmClass:'btn-d'});
    if(!ok)return;
  }
  if(a)a.disabled=true;if(r)r.disabled=true;
  try{
    const body={id,comment,seen_updated_at:(a||r)?(a||r).dataset.seen||'':''};
    const j=await omPost(approve?'approve':'reject',body);
    toast(`Order ${j.order.ref} ${approve?(j.order.tax_inv?(j.order.invoice_mode==='manual'?'approved — Sales Order generated, the '+invUploaderName(j.order)+' then uploads the Tax Invoice':'approved — Sales Order and Tax Invoice generated'):'approved'):'rejected'}`);
  }catch(e){
    toast('Error: '+e.message,'er');
  }
  afterChange();
}

/* ── order page (view any order the user may see, with status history) ── */
async function openDetail(id){
  const sec=$('tab-'+OM.current);if(!sec)return;
  sec.innerHTML='<div class="om-empty">Loading…</div>';
  try{
    await ensureMeta();
    const j=await omGet({action:'get',id});
    if(!$('tab-'+OM.current))return;
    OM.detail={tab:OM.current,id,sig:JSON.stringify(j.order)};saveView();
    sec.innerHTML=detailPage(j.order);
    window.scrollTo(0,0);
  }catch(e){
    sec.innerHTML=`<div class="om-empty" style="color:#e02424">${esc(e.message)}</div><div style="text-align:center"><button class="btn-g" data-act="back">← Back to orders</button></div>`;
  }
}

/* ── status history: oldest at the top, steps still to come greyed out below ── */
function fmtSize(b){return b>=1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';}
const POD_RX=/\.(pdf|xlsx?|docx?|csv)$/i,REC_RX=/\.(pdf|xlsx?|docx?|csv|jpe?g|png)$/i;
const REC_TXT='PDF, Word, Excel, CSV or an image (JPG, JPEG, PNG)';
/* an uploaded file of an order (kind 'pod' | 'payment') with View / Download links */
function fileBox(o,kind,f){
  if(!f)return'';
  const url='orders.php?action=file_download&kind='+kind+'&id='+o.id;
  const view=/\.(pdf|jpe?g|png)$/i.test(f.name);
  return `<div class="om-podfile">📎 <b>${esc(f.name)}</b> <span class="om-sub">${fmtSize(f.size)} · ${esc(f.uploaded_by_name||'')}</span>
    <span class="om-podlinks">${view?`<a href="${url}&inline=1" target="_blank" rel="noopener">View</a>`:''}<a href="${url}">Download</a></span></div>`;
}
const podFile=o=>fileBox(o,'pod',o.pod);
function receiptUpload(o,replace){
  const max=(OM.meta&&OM.meta.receipt&&OM.meta.receipt.max_bytes)||0;
  if(!canDeliver()&&!(OM.kind==='hpcl'&&perms().hpcl_receipt))return replace?'':`<div class="m">Waiting for the Rohan Energy${perms().hpcl_receipt?' or HPCL':''} officer to upload the payment receipt.</div>`;
  return `<div class="m">${replace?'Wrong file? Upload the correct receipt — it replaces this one until delivery is confirmed.':'Upload the payment receipt'} — ${REC_TXT}${max?' (max '+fmtSize(max)+')':''}.${replace?'':' The Proof of Delivery comes after this step.'}</div>
    <div class="om-pod"><input type="file" id="om-rec-file" accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,.jpg,.jpeg,.png"><button class="btn-p" data-act="receipt-upload" data-replace="${replace?1:0}" data-id="${o.id}">${replace?'Replace':'Upload'}</button></div>
    <div class="om-field-err" id="om-rec-err"></div>`;
}
function invoiceUpload(o,replace){
  const max=(OM.meta&&OM.meta.receipt&&OM.meta.receipt.max_bytes)||0;
  if(!canUpInv(o))return replace?'':`<div class="m">Waiting for the ${invUploaderName(o)} to upload the Tax Invoice.</div>`;
  return `<div class="m">${replace?'Wrong file? Upload the correct Tax Invoice — it replaces this one.':'Upload the Tax Invoice'} — ${REC_TXT}${max?' (max '+fmtSize(max)+')':''}. It is visible to the Rohan Energy and HPCL officers of this order.</div>
    <div class="om-pod"><input type="file" id="om-inv-file" accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,.jpg,.jpeg,.png"><button class="btn-p" data-act="inv-upload" data-replace="${replace?1:0}" data-id="${o.id}">${replace?'Replace':'Upload'}</button></div>
    <div class="om-field-err" id="om-inv-err"></div>`;
}
function podUpload(o){
  const max=(OM.meta&&OM.meta.pod&&OM.meta.pod.max_bytes)||0;
  if(!canDeliver())return `<div class="m">Waiting for the Rohan Energy officer or the Super Admin to upload the Proof of Delivery.</div>`;
  if(!o.receipt)return `<div class="m">Upload the payment receipt first — the Proof of Delivery can be uploaded after it.</div>`;
  return `<div class="m">Upload the signed delivery proof — PDF, Excel, Word or CSV${max?' (max '+fmtSize(max)+')':''}. The order is marked <b>Delivery Confirmed</b> as soon as it is uploaded.</div>
    <div class="om-pod"><input type="file" id="om-pod-file" accept=".pdf,.xls,.xlsx,.doc,.docx,.csv"><button class="btn-p" data-act="pod-upload" data-id="${o.id}">Upload</button></div>
    <div class="om-field-err" id="om-pod-err"></div>`;
}
function timelineHtml(o){
  const ev=o.events||[],last=ev.length-1;
  const lastRec=ev.map(e=>e.action).lastIndexOf('receipt_uploaded');
  const lastInv=ev.map(e=>e.action).lastIndexOf('invoice_uploaded');
  const byHpcl=o.doc_type==='invoice';   // placed by HPCL: decided by the Super Admin
  const inv=o.status==='approved'?!!o.tax_inv:true;   // has (or will get) a Tax Invoice: every order that is not yet approved will, an approved one only if it was given one
  let h=ev.map((e,i)=>{
    let cls=e.action==='rejected'||e.action==='return_rejected'?'s-rejected':'s-done';
    if(i===last&&(o.status==='draft'||o.status==='pending'))cls='s-'+o.status;
    const who=e.username==='system'?'Automatic':esc(e.user_label)+(e.org?' · '+esc(ORG_LBL[e.org]||e.org):(byHpcl&&!/super admin/i.test(e.user_label)?' · Super Admin':''));
    let body=`<div class="m">${who} · ${fmtDT(e.created_at)}</div>`;
    if(e.action==='pod_uploaded')body+=podFile(o);
    else if(e.action==='invoice_uploaded'){
      if(i===lastInv){body+=fileBox(o,'invoice',o.invoice_file);if(o.status==='approved'&&!isDone(o))body+=invoiceUpload(o,true);}
      else body+=`<div class="c">${esc(e.comment||'')} <span class="om-sub">(replaced by a newer invoice)</span></div>`;
    }
    else if(e.action==='receipt_uploaded'){
      if(i===lastRec){body+=fileBox(o,'payment',o.receipt);if(o.status==='approved'&&o.delivery_stage!=='delivered')body+=receiptUpload(o,true);}
      else body+=`<div class="c">${esc(e.comment||'')} <span class="om-sub">(replaced by a newer receipt)</span></div>`;
    }
    else if(e.comment)body+=`<div class="c">${esc(e.comment)}</div>`;
    return `<div class="om-tli ${cls}"><div class="t">${esc(evtLabel(o,e.action,e))}</div>${body}</div>`;
  }).join('');
  const dec=byHpcl?'Superadmin: Approved / Rejected':'Approved / Rejected';
  const up=[];
  if(o.status==='draft')up.push('Submitted for approval',dec);
  else if(o.status==='pending')up.push(dec);
  else if(o.status==='rejected')up.push('Edit & resubmit',dec);
  const needInv=inv&&(o.status==='approved'?o.invoice_mode==='manual'&&!o.invoice_file:!autoInv());   // Tax Invoice still to be uploaded by the Super Admin
  if(o.status!=='approved')up.push(inv&&autoInv()?'Sales Order & Tax Invoice Generated':'Sales Order Generated','Transit',...(needInv?['Tax Invoice (uploaded by '+invUploaderName(o)+')']:[]),'Payment Receipt','Proof of Delivery','Delivery Confirmed');
  else if(o.delivery_stage!=='delivered'||needInv)up.push(...(needInv?['Tax Invoice']:[]),...(o.delivery_stage==='delivered'?[]:[...(o.receipt?[]:['Payment Receipt']),'Proof of Delivery','Delivery Confirmed']));
  h+=up.map((t,i)=>{
    const body=o.status==='approved'?(t==='Payment Receipt'?receiptUpload(o,false):t==='Proof of Delivery'?podUpload(o):t==='Tax Invoice'?invoiceUpload(o,false):''):'';
    return `<div class="om-tli up${i===0?' next':''}"><div class="t">${esc(t)}</div>${body}</div>`;
  }).join('');
  return h;
}
/* validate + send one file (payment receipt or Proof of Delivery) */
async function sendFile(id,opt){
  const inp=$(opt.input),err=$(opt.err);if(!inp)return;
  err.textContent='';inp.classList.remove('bad');
  const f=inp.files&&inp.files[0],max=(OM.meta[opt.meta]&&OM.meta[opt.meta].max_bytes)||0;
  let msg='';
  if(!f)msg=`Choose the ${opt.name} file first.`;
  else if(!opt.rx.test(f.name))msg=opt.badType;
  else if(!f.size)msg='The file is empty.';
  else if(max&&f.size>max)msg='The file is too large. The limit is '+fmtSize(max)+'.';
  if(msg){err.textContent=msg;inp.classList.add('bad');return;}
  const ok=await showModal({title:opt.title,body:opt.confirm(f.name),confirmText:'Upload',confirmClass:'btn-p'});
  if(!ok)return;
  const btn=document.querySelector(`[data-act="${opt.act}"]`);if(btn){btn.disabled=true;btn.textContent='Uploading…';}
  try{
    const fd=new FormData();
    fd.append('id',id);fd.append('csrf',typeof _csrf==='string'?_csrf:'');fd.append('file',f);
    await fetch('orders.php?action='+opt.action,{method:'POST',credentials:'same-origin',body:fd}).then(parse);
    toast(opt.done);
    refreshMeta().catch(()=>{});
    openDetail(id);
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent=opt.btn;}
    const er=$(opt.err);if(er)er.textContent=e.message;
    toast('Error: '+e.message,'er');
  }
}
/* ── Edit Tax Invoice (Rohan officers, auto-generated invoices): correct the printed content; quantity and invoice number stay as generated ── */
const IE_GROUPS=[
  ['e-Invoice',[['irn','IRN','text'],['ack_no','Ack No.','text'],['ack_date','Ack Date','date']]],
  ['Invoice details',[['inv_date','Invoice date','date'],['challan_no','Challan No','text'],['terms_payment','Mode/Terms of Payment','text'],['other_ref',"Other Reference",'text'],
    ['order_no','Order No.','text'],['order_date','Order date','date'],['despatch_doc_no','Despatch Doc No','text'],['despatch_doc_date','Despatch doc date','date'],
    ['despatch_through','Despatch Through','text'],['destination','Destination','text'],['bl_no','Bill of Lading/LR-RR No.','text'],['vehicle_no','Motor Vehicle No.','text'],['terms_delivery','Terms of Delivery','area']]],
  ['Consignee (ship to)',[['consignee_name','Name','text'],['consignee_gstin','GSTIN','gstin'],['consignee_state','State','text'],['consignee_addr','Address','area']]],
  ['Buyer (bill to)',[['buyer_name','Name','text'],['buyer_gstin','GSTIN','gstin'],['buyer_state','State','text'],['buyer_addr','Address','area']]]
];
async function openInvoiceEdit(id){
  const ov=$('om-overlay');if(!ov)return;
  ov.innerHTML='<div class="om-box om-bulk"><div class="om-empty">Loading…</div></div>';ov.classList.add('show');
  try{
    const [j]=await Promise.all([omGet({action:'get',id}),ensurePdfLibs()]);
    const o=j.order;
    if(!o.tax_inv||o.status!=='approved'||o.invoice_mode==='manual')throw new Error('This order has no generated Tax Invoice to edit.');
    if(isDone(o))throw new Error('This order is completed (delivery confirmed), so its Tax Invoice can no longer be edited.');
    const D=window.OM_SO.invDefaults(o),E=o.invoice_edits||{};
    const val=k=>Object.prototype.hasOwnProperty.call(E,k)?E[k]:D[k];
    const fld=([k,l,t])=>`<div class="field${t==='area'?' om-wide':''}"><label>${esc(l)}</label>${t==='area'?`<textarea id="om-ie-${k}" data-ie="${k}" maxlength="400" rows="2">${esc(val(k))}</textarea>`
      :`<input id="om-ie-${k}" data-ie="${k}" type="${t==='date'?'date':'text'}" maxlength="${t==='gstin'?15:150}" value="${esc(val(k))}"${t==='gstin'?' style="text-transform:uppercase"':''} autocomplete="off">`}</div>`;
    const rows=(o.items||[]).map((i,n)=>{
      const base=lineRate(i)||{rate:'',gst:18},ed=(E.items||{})[i.item]||{};
      return `<div class="field om-wide"><label>${esc(i.item)} — ${fmtN(i.ea)} EA</label></div>
        <div class="field"><label>Rate (₹ per EA, before GST)</label><input data-ie-item="${n}" data-f="rate" type="text" inputmode="decimal" value="${esc(ed.rate!=null?ed.rate:base.rate)}" autocomplete="off"></div>
        <div class="field"><label>GST %</label><input data-ie-item="${n}" data-f="gst" type="text" inputmode="decimal" value="${esc(ed.gst!=null?ed.gst:base.gst)}" autocomplete="off"></div>`;}).join('');
    OM.ie={id,D,items:o.items||[]};
    ov.innerHTML=`<div class="om-box om-bulk"><h3>Edit Tax Invoice <span class="om-ref">${esc(o.invoice_no||o.ref)}</span></h3>
      <div class="om-msub">Change what is printed on the invoice. The invoice number, the quantities and the order itself do not change, and the Sales Order is not affected. Leave a field as it is to keep the generated value.${o.direct?' For HP DEF orders the Buyer is the same as the Consignee — change both if needed.':''}</div>
      ${IE_GROUPS.map(([t,fs])=>`<h4 style="margin:14px 0 8px;font-size:13px;color:#1a1a2e">${t}</h4><div class="om-grid">${fs.map(fld).join('')}</div>`).join('')}
      <h4 style="margin:14px 0 8px;font-size:13px;color:#1a1a2e">Items — rate and GST %</h4><div class="om-grid">${rows}</div>
      <div class="om-field-err" id="om-ie-err" style="margin-top:10px"></div>
      <div class="om-foot">${o.invoice_edits?`<button class="btn-g" data-act="inv-edit-reset" data-id="${o.id}" style="margin-right:auto">Put back as generated</button>`:''}<button class="btn-g" data-act="close">Cancel</button><button class="btn-p" data-act="inv-edit-save" data-id="${o.id}">Save changes</button></div></div>`;
  }catch(e){
    ov.innerHTML=`<div class="om-box"><div class="om-empty" style="color:#e02424">${esc(e.message)}</div><div class="om-foot"><button class="btn-g" data-act="close">Close</button></div></div>`;
  }
}
async function sendInvoiceEdit(id,edits){
  const err=$('om-ie-err');if(err)err.textContent='';
  document.querySelectorAll('#om-overlay .bad').forEach(e=>e.classList.remove('bad'));
  const btns=[...document.querySelectorAll('#om-overlay [data-act^="inv-edit-"]')];btns.forEach(b=>b.disabled=true);
  try{
    await omPost('edit_invoice',{id,edits});
    toast('Tax Invoice saved');
    closeModal();
    if(OM.detail)openDetail(id);else if(OM.current&&OM.current!=='neworder')loadList(OM.current);
  }catch(e){
    btns.forEach(b=>b.disabled=false);
    const lab={};IE_GROUPS.forEach(([,fs])=>fs.forEach(([k,l])=>lab[k]=l));
    const msgs=Object.entries(e.fields||{}).map(([k,m])=>{
      const el=document.getElementById('om-ie-'+k);if(el)el.classList.add('bad');
      const nm=k.indexOf(':')>0?k.split(':')[1]+' '+(k.startsWith('rate')?'rate':'GST %'):(lab[k]||k);
      return nm+': '+m;});
    if(err)err.textContent=msgs.length?msgs.join(' · '):e.message;
  }
}
async function saveInvoiceEdit(id){
  const S=OM.ie;if(!S||S.id!==id)return;
  const edits={};
  document.querySelectorAll('#om-overlay [data-ie]').forEach(el=>{
    let v=el.value.trim();if(el.dataset.ie.endsWith('gstin'))v=v.toUpperCase();
    if(v!==String(S.D[el.dataset.ie]||'').trim())edits[el.dataset.ie]=v;
  });
  const its={};
  document.querySelectorAll('#om-overlay [data-ie-item]').forEach(el=>{
    const i=S.items[+el.dataset.ieItem],base=lineRate(i)||{},f=el.dataset.f,v=el.value.trim();
    if(v===''||Number(v)!==Number(base[f]))(its[i.item]=its[i.item]||{})[f]=v;   // an empty rate / GST is sent too, so the server can say it is required
  });
  if(Object.keys(its).length)edits.items=its;
  return sendInvoiceEdit(id,edits);
}
async function resetInvoiceEdit(id){
  const ok=await showModal({title:'Put the Tax Invoice back as generated',body:'All corrections made to this Tax Invoice are removed and it prints exactly as it was generated.',confirmText:'Put back',confirmClass:'btn-p'});
  if(!ok)return;
  return sendInvoiceEdit(id,{});
}
function uploadInvoice(id){
  const b=document.querySelector('[data-act="inv-upload"]'),replace=!!b&&b.dataset.replace==='1';
  return sendFile(id,{input:'om-inv-file',err:'om-inv-err',meta:'receipt',name:'Tax Invoice',rx:REC_RX,badType:'Only '+REC_TXT+' files can be uploaded.',
    title:replace?'Replace Tax Invoice':'Upload Tax Invoice',confirm:n=>`“${n}” will be attached to this order as its Tax Invoice${replace?' and replace the earlier one':''}.`,
    act:'inv-upload',action:'upload_invoice',btn:replace?'Replace':'Upload',done:'Tax Invoice uploaded'});
}
function uploadPod(id){
  return sendFile(id,{input:'om-pod-file',err:'om-pod-err',meta:'pod',name:'Proof of Delivery',rx:POD_RX,badType:'Only PDF, Excel (xls, xlsx), Word (doc, docx) or CSV files can be uploaded.',
    title:'Upload Proof of Delivery',confirm:n=>`“${n}” will be attached to this order and the order will be marked Delivery Confirmed. This cannot be undone.`,
    act:'pod-upload',action:'upload_pod',btn:'Upload',done:'Proof of Delivery uploaded — delivery confirmed'});
}
function uploadReceipt(id){
  const b=document.querySelector('[data-act="receipt-upload"]'),replace=!!b&&b.dataset.replace==='1';
  return sendFile(id,{input:'om-rec-file',err:'om-rec-err',meta:'receipt',name:'payment receipt',rx:REC_RX,badType:'Only '+REC_TXT+' files can be uploaded.',
    title:replace?'Replace payment receipt':'Upload payment receipt',confirm:n=>`“${n}” will be attached to this order as the payment receipt${replace?' and replace the earlier one':''}. The order then moves on to the Proof of Delivery step.`,
    act:'receipt-upload',action:'upload_receipt',btn:replace?'Replace':'Upload',done:'Payment receipt uploaded'});
}

function detailPage(o){
  const k=OM.kind;
  const kv=(l,v)=>`<div><div class="k">${l}</div><div class="v">${v}</div></div>`;
  const names=approverText(o.approvers,o.zone);
  const byHpcl=o.doc_type==='invoice';
  const approver=o.decided_by_name?esc(o.decided_by_name)+decidedTag(o):esc((o.approvers_label||'').replace(/^./,c=>c.toUpperCase()));   // who may decide it (by who placed it) - or who did
  const stamp='';
  let left=`<h3>Order details</h3><p class="om-psub">${byHpcl?'Placed by an HPCL user.':'Placed by a Rohan Energy user.'} It is decided by: ${esc(o.approvers_label||'')} — any one of them, the first to act.</p>`;
  if(o.status==='rejected')left+=`<div class="om-note err"><b>Rejected by ${esc(o.decided_by_name||(byHpcl?'the Super Admin':'HPCL'))}${o.decided_by_name?esc(decidedTag(o)):''}</b>${o.review_comment?`: “${esc(o.review_comment)}”`:''}</div>`;
  if(o.tax_inv&&o.status==='approved'&&o.invoice_edits)left+=`<div class="om-note info">ⓘ The Tax Invoice of this order has been edited after it was generated.</div>`;
  if(o.tax_inv&&isDone(o))left+=`<div class="om-note info">🔒 This order is completed (delivery confirmed), so its Tax Invoice is final and can no longer be edited${o.invoice_mode==='manual'?' or replaced':''}.</div>`;
  if(o.status==='pending')left+=`<div class="om-note info">ⓘ This order is waiting for approval by ${esc(o.approvers_label||'')}. When it is approved, ${byHpcl?invDocsText():invDocsTextRohan()}.</div>`;
  left+=`<div class="om-dl">
      ${kv('Order date',fmtDate(o.order_date))}${kv('Zone',esc(o.zone))}${kv('Regional office',esc(o.ro))}
      ${kv('Outlet',esc(o.outlet))}${kv('SAP code',esc(o.ro_code))}${kv('District / State',esc(o.district)+' / '+esc(o.state))}
      ${kv('Sales area',esc(o.sales_area||'—'))}${kv('Created by',esc(o.created_by_name)+(o.doc_type==='invoice'?' (HPCL)':' (Rohan)'))}${kv('Approver',approver)}${o.tax_inv&&o.status==='approved'?kv('Documents','Sales Order '+esc(o.voucher_no||'—')+' · Tax Invoice '+(o.invoice_mode==='manual'?(o.has_invoice_file?'(uploaded)':'(to be uploaded)'):esc(o.invoice_no||'—'))):''}
    </div>${itemsTable(o)}`;
  if(o.status==='approved')left+=`<div class="om-foot">${docBtn(o)}${returnBtn(o)}</div>`;
  left+=retBlock(o);
  if(o.remarks)left+=`<div class="om-blk"><div class="k">Remarks</div><div class="om-quote">${esc(o.remarks)}</div></div>`;
  if(adminOwnDraft(o))left+=`<div class="om-foot"><button class="btn-g" data-act="edit" data-id="${o.id}">${o.status==='rejected'?'Edit &amp; resubmit':'Edit'}</button>`+(o.status==='draft'?`<button class="btn-p" data-act="submit" data-id="${o.id}">Submit for approval</button>`:'')+`</div>`;
  if(rohanAdmin()&&o.status==='pending')left+=`<div class="om-foot">${canReview(o)?`<button class="btn-p" data-act="review" data-id="${o.id}">Review &amp; approve</button>`:''}<button class="btn-g" data-act="edit" data-id="${o.id}">Edit order${byHpcl?' &amp; rates':''}</button></div>`;
  else if(k==='rohan'&&(o.status==='draft'||o.status==='rejected'||o.status==='pending')){
    const mine=isMine(o);   // only the officer who placed an order edits it
    left+=`<div class="om-foot">${canReview(o)?`<button class="btn-p" data-act="review" data-id="${o.id}">Review &amp; approve</button>`:''}${mine?`<button class="btn-g" data-act="edit" data-id="${o.id}">${o.status==='rejected'?'Edit &amp; resubmit':'Edit'}</button>`+(o.status==='draft'?`<button class="btn-p" data-act="submit" data-id="${o.id}">Submit for approval</button>`:''):''}</div>`;
  }
  else if(!rohanAdmin()&&canReview(o))left+=`<div class="om-foot"><button class="btn-p" data-act="review" data-id="${o.id}">Review &amp; approve</button></div>`;   // an HPCL user the order waits for
  const tl=timelineHtml(o);
  const edits=(o.events||[]).filter(e=>e.action==='edited');
  const hist=`<div class="as"><h3>Order history</h3><p class="om-psub">Changes made to this order after it was created, newest first.</p>`+
    (edits.length?edits.slice().reverse().map(e=>`<div class="om-tli s-done"><div class="t">Edited by ${esc(e.user_label)}${e.org?' · '+esc(ORG_LBL[e.org]||e.org):(/super admin/i.test(e.user_label)?'':' · Super Admin')}</div><div class="m">${fmtDT(e.created_at)} · while ${esc(ST_LBL[e.from_status]||e.from_status)}</div>${e.comment?`<div class="c" style="white-space:pre-line">${esc(e.comment)}</div>`:''}</div>`).join(''):'<div class="om-empty">No changes have been made to this order.</div>')+`</div>`;
  return `<div class="om-dh"><button class="btn-g" data-act="back">← Back to orders</button><h2>Order <span class="om-ref">${esc(o.ref)}</span></h2>${pill(o.status)}${stagePill(o)}${stamp}</div>
    <div class="om-dcols"><div class="as">${left}</div>
    <div class="as"><h3>Status history</h3><p class="om-psub">Every step is recorded with user and time, from first to last. Greyed steps are still to come.</p><div class="om-tl">${tl}</div></div></div>
    <div class="om-dcols" style="margin-top:14px">${hist}</div>`;
}

/* ── create / edit form ── */
async function renderForm(){
  const sec=$('tab-neworder');if(!sec)return;
  sec.innerHTML='<div class="om-empty">Loading…</div>';
  let m;
  try{m=await refreshMeta(OM.editing?OM.editing.id:0);}catch(e){sec.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load: ${esc(e.message)}</div>`;return;}   // fresh, so a changed minimum order applies at once
  if(OM.current!=='neworder')return;
  const ed=OM.editing,zone=(ed&&ed.zone)||meZoneText()||'';
  const isPend=!!ed&&ed.status==='pending',isAdm=OM.kind==='admin';
  const own=isAdm&&!OM.hsuper&&!(ed&&ed.doc_type==='invoice')&&(!ed||isMine(ed));   // the Rohan super admin placing / editing an order of their own: works like a Rohan officer's order
  const v=ed||{order_date:today(),state:'',ro:'',ro_code:'',outlet:'',district:'',sales_area:'',remarks:'',items:[]};
  const rm=OM.kind==='admin'&&!!ed&&ed.doc_type==='invoice';
  OM.focMode=isAdm&&!!ed&&!OM.hsuper;   // the Rohan super admin editing an order: a FOC column he can change (the chart is not touched)
  OM.formItems=(v.items||[]).map(i=>{const r=rm?lineRate(i):null,l=rvLine(i);return {item:i.item,ea:String(l.paid),foc:String(l.foc0),manual:l.foc0!==focFor(i.item,l.paid),rate:r?String(r.rate):'',gst:r?String(r.gst):''};});
  const names=approverText(m.approvers,zone,true);
  const isH=OM.kind==='hpcl'||OM.hsuper;   // the HPCL super admin places orders like an HPCL officer: final at once, sent to the Rohan Energy super admin
  const rateMode=isAdm&&!!ed&&ed.doc_type==='invoice';   // the super admin corrects the quantity AND the rate / GST % of an order HPCL placed
  OM.rateMode=rateMode;
  const banner=isH
    ?`<div class="om-note info">ⓘ Save the order as a <b>draft</b> and submit it when it is ready. Once submitted it goes to <b>${myApproversText()}</b> — any one of them decides it. The Rohan Super Admin may correct the quantity and rates first; once approved, ${hideInv()?'a <b>Sales Order</b> is generated':autoInv()?'a <b>Sales Order</b> and a <b>Tax Invoice</b> are generated':'a <b>Sales Order</b> is generated and the Super Admin or a Rohan Energy officer uploads the <b>Tax Invoice</b>'}. A submitted order cannot be edited (a rejected one comes back to you to correct and resubmit).</div>`
    :rateMode
    ?`<div class="om-note info">ⓘ This order was placed by HPCL and is waiting for your confirmation. You can correct the quantity, the <b>rate (₹ per EA, before GST)</b> or the <b>final rate (incl. GST)</b>, and the GST % of each item - the GST amount and the total incl. GST follow — the change is recorded in the order history. Then go back and approve it${autoInv()?' to generate the Sales Order and the Tax Invoice':' to generate the Sales Order (you or a Rohan Energy officer then upload the Tax Invoice)'}.</div>`
    :isPend
    ?`<div class="om-note info">ⓘ This order is waiting for approval. You can change it until it is approved or rejected — the change is recorded in the status history${isAdm?'':' and the order stays pending'}.${OM.focMode?' You can also change the <b>FOC</b> (free of cost EA) of each item; it applies to this order only.':''}</div>`
    :`<div class="om-note info">ⓘ This order will be sent for approval to <b>${myApproversText()}</b> (the zone follows from the SAP code) — any one of them decides it. You can edit it until it is decided.</div>`;
  const rej=ed&&ed.status==='rejected'
    ?`<div class="om-note err"><b>Rejected by ${esc(ed.decided_by_name||'HPCL')}</b>${ed.review_comment?`: “${esc(ed.review_comment)}”`:''} — correct the order below and resubmit.</div>`:'';
  const isRej=ed&&ed.status==='rejected';
  const noPrice=isAdm&&!own&&!OM.hsuper?[]:(m.prices||[]).filter(p=>p.rate==null||!p.gst_set).map(p=>p.item);
  const priceWarn=noPrice.length&&isH?`<div class="om-note warn">⚠ The price and GST % of ${noPrice.map(esc).join(', ')} have not been set yet, so an order containing it cannot be placed.${canHpclRates()&&!OM.hsuper?' Use <b>₹ Set prices &amp; GST %</b> to set them.':' Please contact Rohan Energy.'}</div>`
    :noPrice.length?`<div class="om-note warn">⚠ Price and GST % are mandatory but not set for ${noPrice.map(esc).join(', ')}. Use <b>₹ Set prices &amp; GST %</b> below — orders cannot be submitted to HPCL until they are set (drafts can still be saved).</div>`:'';
  sec.innerHTML=`${banner}${priceWarn}${rej}
  <div class="as">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><h3>${ed?`Edit order ${esc(ed.ref)}`:'Create order'}</h3>
      <div class="om-hbtns">${(isAdm&&!own)||(isH&&!canHpclRates())?'':'<button class="btn-g" type="button" data-act="prices">₹ Set prices &amp; GST %</button>'}${ed||isAdm?'':'<button class="btn-p" type="button" data-act="bulk">⬆ Bulk order (Excel)</button>'}</div></div>
    <p class="om-psub">${ed?'':'Order reference is generated on save. '}Fields marked * are mandatory.</p>
    <div class="om-grid">
      <div class="field" id="om-w-date"><label>Order date</label>${own?`<input type="date" id="om-f-date" data-v="${esc(v.order_date)}" value="${esc(String(v.order_date).slice(0,10))}" max="${today()}"><div class="om-hint">Today by default — only the Super Admin can change the order date.</div>`:`<input type="text" class="ro" id="om-f-date" data-v="${esc(v.order_date)}" value="${esc(fmtDate(v.order_date))}" readonly tabindex="-1" title="${ed?'The order date cannot be changed':'The order is dated today; this cannot be changed'}"><div class="om-hint">${ed?'The order date cannot be changed.':'Today’s date — set automatically.'}</div>`}<div class="om-field-err" id="om-e-date"></div></div>
      <div class="field" id="om-w-sap_code"><label>SAP code *</label><input type="text" id="om-f-sap" maxlength="12" inputmode="numeric" placeholder="e.g. 90000001" value="${esc(v.ro_code)}" autocomplete="off"><div class="om-hint" id="om-hint-sap"></div><div class="om-field-err" id="om-e-sap_code"></div></div>
      <div class="field"><label>Zone</label><input type="text" class="ro" id="om-f-zone" value="${esc(v.ro_code?zone:'')}" placeholder="Filled from SAP code" readonly></div>
      <div class="field"><label>Regional office</label><input type="text" class="ro" id="om-f-ro" value="${esc(v.ro)}" placeholder="Filled from SAP code" readonly></div>
      <div class="field"><label>State</label><input type="text" class="ro" id="om-f-state" value="${esc(v.state)}" placeholder="Filled from SAP code" readonly></div>
      <div class="field"><label>Outlet name</label><input type="text" class="ro" id="om-f-outlet" value="${esc(v.outlet)}" placeholder="Filled from SAP code" readonly></div>
      <div class="field"><label>District</label><input type="text" class="ro" id="om-f-district" value="${esc(v.district)}" placeholder="Filled from SAP code" readonly></div>
      <div class="field"><label>Sales area</label><input type="text" class="ro" id="om-f-area" value="${esc(v.sales_area||'')}" placeholder="Filled from SAP code" readonly></div>
      <div class="field om-wide"><label>Address</label><input type="text" class="ro" id="om-f-address" value="${esc(v.outlet_address||'')}" placeholder="Filled from SAP code" readonly></div>
      <div class="field"><label>Phone</label><input type="text" class="ro" id="om-f-phone" value="${esc(v.outlet_phone||'')}" placeholder="Filled from SAP code" readonly></div>
      <div class="field"><label>Pincode</label><input type="text" class="ro" id="om-f-pincode" value="${esc(v.outlet_pincode||'')}" placeholder="Filled from SAP code" readonly></div>
      <div class="field"><label>GSTIN</label><input type="text" class="ro" id="om-f-gstin" value="${esc(v.outlet_gstin||'')}" placeholder="Filled from SAP code" readonly></div>
    </div>
    <div class="divider"></div>
    <div class="st" style="border:none;margin-bottom:0;padding-bottom:0">Order items</div>
    <div class="om-legend"><span class="om-sw"></span><span><b>Blue boxes with a ✎ can be changed</b> — ${rateMode?(OM.focMode?'quantity, FOC, rate, final rate and GST %':'quantity, rate, final rate and GST %'):(OM.focMode?'quantity and FOC':'quantity')}. Grey fields are filled in automatically and cannot be edited.</span></div>
    <div id="om-w-items"><table class="om-items"><thead><tr><th>Item *</th><th class="om-num">✎ Quantity (EA) *</th><th class="om-num">Volume (litres)</th><th></th></tr></thead><tbody id="om-items-body"></tbody></table>
    <div class="om-field-err" id="om-e-items"></div><div class="om-hint" id="om-minhint"></div></div>
    <div class="field om-remarks"><label>Remarks (optional)</label><textarea id="om-f-remarks" maxlength="500" rows="2" placeholder="${isH?'Delivery instructions, notes for Rohan Energy…':'Delivery instructions, notes for HPCL…'}">${esc(v.remarks||'')}</textarea></div>
    <div class="om-form-actions">
      ${isPend?'<button class="btn-p" id="om-save" type="button">Save changes</button>'
        :`<button class="btn-g" id="om-save" type="button">${isRej?'Save changes':'Save as draft'}</button>
      <button class="btn-p" id="om-save-submit" type="button">${isRej?'Resubmit for approval':'Submit for approval'} →</button>`}
      <span class="sp"></span><button class="btn-g" id="om-cancel" type="button">Cancel</button>
    </div>
  </div>`;
  renderItemRows();
  if(!OM.outlet&&!rateMode){sec.insertAdjacentHTML('beforeend',sapPickerHtml());initSapPicker();}   // the SAP numbers under this user, with a tick box
  $('om-save').addEventListener('click',()=>saveForm(false));
  if($('om-save-submit'))$('om-save-submit').addEventListener('click',()=>saveForm(true));
  $('om-cancel').addEventListener('click',()=>{OM.editing=null;showTab(rateMode?'approvals':isAdm||isH?'allorders':'myorders');});
  const rc=$('om-f-sap');
  if(OM.outlet){   // an outlet login orders for its own outlet only: the SAP number is fixed
    const own=(OM.meta&&OM.meta.me&&OM.meta.me.sap_code)||'';
    rc.value=own;rc.readOnly=true;rc.dataset.looked='';
    if(own)lookupSap(own);
    return;
  }
  rc.dataset.looked=rc.value.trim();   // an untouched saved code is not looked up again
  let tm=null;
  rc.addEventListener('input',()=>{
    rc.value=rc.value.replace(/\D/g,'');
    clearTimeout(tm);
    if(rc.value.trim()!==rc.dataset.looked){clearOutlet();++_lookSeq;sapHint('','');}
    syncPicker();
    if(rc.value.length>=8)tm=setTimeout(()=>lookupSap(rc.value.trim()),250);
  });
  rc.addEventListener('change',()=>{if(rc.value.trim()!==rc.dataset.looked)lookupSap(rc.value.trim());});
  rc.addEventListener('blur',()=>{if(rc.value.trim()!==rc.dataset.looked)lookupSap(rc.value.trim());});
}

function syncItemsFromDom(){
  document.querySelectorAll('#om-items-body tr[data-row]').forEach(tr=>{
    const i=+tr.dataset.row;if(!OM.formItems[i])return;
    OM.formItems[i].ea=tr.querySelector('.om-qty').value;
    const fo=tr.querySelector('.om-foc-in');if(fo){OM.formItems[i].foc=fo.value;OM.formItems[i].manual=tr.dataset.manual==='1';}
    const r=tr.querySelector('.om-rate'),g=tr.querySelector('.om-gst');
    if(r)OM.formItems[i].rate=r.value;
    if(g)OM.formItems[i].gst=g.value;
  });
}
/* list price of a product (set by Rohan Energy), the starting rate the super admin sees */
function listPrice(name){const p=((OM.meta&&OM.meta.prices)||[]).find(x=>x.item===name);return p&&p.rate?{rate:String(p.rate),gst:String(p.gst)}:{rate:'',gst:'18'};}
/* available quantity (EA) of a product, set by the super admin; null = not set */
function stockOf(name){const s=((OM.meta&&OM.meta.stock)||[]).find(x=>x.item===name);return s&&s.ea!=null?s.ea:null;}
function availText(name){const a=stockOf(name);return a==null?'Available: no limit':'Available: '+fmtN(a)+' EA';}
const stockOn=()=>!!(OM.meta&&OM.meta.stock_enabled);   // the Inventory check box
/* FOC (free of cost): the list set on the FOC page. The officer orders (and is billed for) N EA; the list adds the free EA on top, so the order carries N + FOC EA. */
function focFor(item,paid){let f=0,at=0;((OM.meta&&OM.meta.foc)||[]).forEach(r=>{if(r.item===item&&r.min_qty<=paid&&r.min_qty>=at){at=r.min_qty;f=r.foc_qty;}});return Math.max(0,f);}
/* the <option>s of the item drop-down, grouped by brand */
function itemOptions(free){
  const prods=OM.meta.products||[],brands=OM.meta.brands||{};
  const opt=n=>`<option value="${esc(n)}">${esc(n)}${stockOf(n)!=null?' — '+esc(availText(n)):''}</option>`;
  if(!prods.length)return free.map(opt).join('');
  return Object.keys(brands).map(b=>{const ns=free.filter(n=>{const p=prods.find(x=>x.name===n);return p&&p.brand===b;});return ns.length?`<optgroup label="${esc(brands[b].name)}">${ns.map(opt).join('')}</optgroup>`:'';}).join('');
}
function availHint(name){if(!name||!stockOn())return '';const a=stockOf(name);return `<div class="om-avail${a==null?' none':a===0?' zero':''}">${esc(availText(name))}</div>`;}
/* quantity boxes take digits only */
document.addEventListener('input',e=>{const t=e.target;if(t&&t.classList&&(t.classList.contains('om-qty')||t.classList.contains('om-foc-in'))){const c=t.value.replace(/\D+/g,'');if(c!==t.value)t.value=c;}});
/* edit form: the rate (before GST), the final rate (incl. GST) and the GST % belong together - change one and the others follow */
function rateLink(e){
  const t=e.target,tr=t.closest('tr[data-row]');if(!tr||!OM.rateMode)return;
  const r=tr.querySelector('.om-rate'),f=tr.querySelector('.om-final'),g=tr.querySelector('.om-gst');if(!r||!f||!g)return;
  const gv=parseFloat(g.value),gg=isNaN(gv)?18:gv;
  if(t===f){const d=parseFloat(f.value);r.value=d>0?(d/(1+gg/100)).toFixed(2):'';}
  else if(t===r||t===g){const x=parseFloat(r.value);f.value=x>0?String(dlpOf(x,gg)):'';}
}
function renderItemRows(errs){
  const lpe=OM.meta.litres_per_ea||20;
  const used=OM.formItems.map(i=>i.item);
  const free=OM.meta.items.filter(n=>!used.includes(n));
  const rows=OM.formItems.map((it,i)=>{
    const ea=parseInt(it.ea,10),lrate=parseFloat(listPrice(it.item).rate)||0;
    const fin=parseFloat(it.rate)>0?String(dlpOf(it.rate,it.gst)):'';   // the final rate = the rate + GST (the DLP)
    const rc=OM.rateMode?`<td class="om-num" data-l="✎ Rate (₹ per EA, before GST)"><input class="om-plain om-rate" type="text" inputmode="decimal" autocomplete="off" value="${esc(it.rate)}" placeholder="0.00">${errs&&errs['rate_'+i]?`<div class="om-field-err">${esc(errs['rate_'+i])}</div>`:''}</td>
      <td class="om-num" data-l="✎ Final rate (₹ per EA, incl. GST)"><input class="om-plain om-final" type="text" inputmode="decimal" autocomplete="off" value="${esc(fin)}" placeholder="0.00"></td>
      <td class="om-num" data-l="GST (₹)"><div data-gstamt>—</div><div class="om-gstp">at <input class="om-gstin om-gst" type="text" inputmode="decimal" autocomplete="off" value="${esc(it.gst)}" placeholder="18" aria-label="GST %"> %</div>${errs&&errs['gst_'+i]?`<div class="om-field-err">${esc(errs['gst_'+i])}</div>`:''}</td>
      <td class="om-num" data-l="Total (₹, incl. GST)" data-amt>—</td>`
      :`<td class="om-num" data-l="Rate (₹ per EA, incl. GST)" data-rate>${lrate>0?'':'<span title="Rohan Energy has not set the price yet">—</span>'}</td><td class="om-num" data-l="Amount (₹, incl. GST)" data-amt>—</td>`;   // Rohan / HPCL: the price Rohan Energy set, read-only
    const fc=OM.focMode?`<td class="om-num" data-l="✎ FOC (EA, free of cost)"><input class="om-plain om-foc-in" type="text" inputmode="numeric" autocomplete="off" value="${esc(it.foc==null?'':it.foc)}" placeholder="0" aria-label="FOC of ${esc(it.item)}">${errs&&errs['foc_'+i]?`<div class="om-field-err">${esc(errs['foc_'+i])}</div>`:''}</td>`:'';
    return `<tr data-row="${i}" data-lrate="${lrate>0?lrate:''}"${it.manual?' data-manual="1"':''}><td>${esc(it.item)}${availHint(it.item)}</td>
      <td class="om-num" data-l="✎ Quantity (EA)"><input class="om-plain om-qty" type="text" inputmode="numeric" autocomplete="off" value="${esc(it.ea)}" placeholder="0">${errs&&errs['item_'+i]?`<div class="om-field-err">${esc(errs['item_'+i])}</div>`:''}</td>${fc}
      <td class="om-num" data-l="Volume (litres)" data-vol>${ea>0?fmtN(ea*lpe):'—'}</td>${rc}
      <td class="om-num"><button class="om-btn" type="button" data-rm>Remove</button></td></tr>`;
  }).join('');
  const add=free.length&&!OM.formItems.length   // one product per order: the add row goes away once a line exists
    ?`<tr class="om-addrow"><td><select id="om-add-item"><option value="">Select item</option>${itemOptions(free)}</select><div id="om-add-avail"></div></td>
      <td class="om-num"><input class="om-qty" type="text" inputmode="numeric" autocomplete="off" id="om-add-ea" placeholder="0"><div class="om-field-err" id="om-e-add"></div></td>
      ${OM.focMode?'<td></td>':''}<td class="om-num">—</td>${OM.rateMode?'<td></td><td></td><td></td><td></td>':'<td></td><td></td>'}<td class="om-num"><button class="btn-p" type="button" id="om-add-btn">+ Add item</button></td></tr>`
    :'';
  const th=$('om-items-body').closest('table').querySelector('thead tr');
  th.innerHTML='<th>Item *</th><th class="om-num">✎ Quantity (EA) *</th>'+(OM.focMode?'<th class="om-num">✎ FOC (EA)</th>':'')+'<th class="om-num">Volume (litres)</th>'+(OM.rateMode?'<th class="om-num">✎ Rate (₹ per EA, before GST) *</th><th class="om-num">✎ Final rate (₹ per EA, incl. GST)</th><th class="om-num">GST (₹)</th><th class="om-num">Total (₹, incl. GST)</th>':'<th class="om-num">Rate (₹ per EA, incl. GST)</th><th class="om-num">Amount (₹, incl. GST)</th>')+'<th></th>';
  $('om-items-body').innerHTML=rows+add+`<tr class="tot"><td>Total</td><td class="om-num" id="om-tot-ea">0</td>${OM.focMode?'<td class="om-num" id="om-tot-foc">0</td>':''}<td class="om-num" id="om-tot-vol">0</td>${OM.rateMode?'<td></td><td></td><td class="om-num" id="om-tot-gst">0.00</td><td class="om-num" id="om-tot-amt">0.00</td>':'<td></td><td class="om-num" id="om-tot-amt">0.00</td>'}<td></td></tr>`;
  $('om-items-body').querySelectorAll('tr[data-row]').forEach(tr=>{
    tr.querySelectorAll('input').forEach(inp=>{
      inp.addEventListener('input',e=>{
        rateLink(e);
        if(OM.focMode){   // the FOC follows the chart as the quantity changes, until it is typed in by hand
          const fo=tr.querySelector('.om-foc-in');
          if(inp===fo){const c=fo.value.replace(/\D+/g,'');if(c!==fo.value)fo.value=c;tr.dataset.manual='1';}
          else if(inp.classList.contains('om-qty')&&tr.dataset.manual!=='1'){const q=parseInt(inp.value,10),it=OM.formItems[+tr.dataset.row];fo.value=String(q>0&&it?focFor(it.item,q):0);}
        }
        updateTotals();
      });
      if(inp.classList.contains('om-final'))inp.addEventListener('blur',()=>{const r=tr.querySelector('.om-rate'),g=parseFloat(tr.querySelector('.om-gst').value);if(parseFloat(r.value)>0)inp.value=String(dlpOf(r.value,isNaN(g)?18:g));});   // shows the final rate of the rate that will be saved
    });
    tr.querySelector('[data-rm]').addEventListener('click',()=>{syncItemsFromDom();OM.formItems.splice(+tr.dataset.row,1);renderItemRows();});
  });
  const ab=$('om-add-btn');
  if(ab){
    ab.addEventListener('click',()=>tryAdd(true));
    $('om-add-ea').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();tryAdd(true);}});
    $('om-add-ea').addEventListener('input',updateTotals);
    $('om-add-item').addEventListener('change',()=>{const n=$('om-add-item').value||'';$('om-add-avail').innerHTML=availHint(n);updateTotals();});
  }
  updateTotals();
}
/* The blank row at the bottom of the items table. Returns false only when it is half-filled (so the form is not sent with a line the officer meant to add). */
function tryAdd(enforceMin){
  const sel=$('om-add-item'),qty=$('om-add-ea'),err=$('om-e-add');
  if(!sel)return true;
  err.textContent='';sel.classList.remove('bad');qty.classList.remove('bad');
  const item=sel.value,ea=qty.value.trim();
  if(!item&&!ea)return true;
  let msg='';
  if(!item){msg='Select an item';sel.classList.add('bad');}
  else if(!(parseInt(ea,10)>=1)){msg='Enter a quantity greater than 0';qty.classList.add('bad');}
  else if(stockOf(item)!=null&&parseInt(ea,10)>stockOf(item)){msg=`Only ${fmtN(stockOf(item))} EA available.`;qty.classList.add('bad');}
  else if(enforceMin){
    syncItemsFromDom();
    const need=minOrder()-addShortfallBase()-parseInt(ea,10);
    if(need>0){msg=`Add ${fmtN(need)} more EA to reach the minimum.`;qty.classList.add('bad');}
  }
  if(msg){err.textContent=msg;return false;}
  syncItemsFromDom();
  OM.formItems.push(Object.assign({item,ea:String(parseInt(ea,10)),foc:String(focFor(item,parseInt(ea,10))),manual:false},OM.rateMode?listPrice(item):{rate:'',gst:''}));
  renderItemRows();
  return true;
}
function updateTotals(){
  const lpe=OM.meta.litres_per_ea||20;let ea=0,amt=0,gsum=0,foc=0;
  document.querySelectorAll('#om-items-body tr[data-row]').forEach(tr=>{
    const n=parseInt(tr.querySelector('.om-qty').value,10);
    const fi=OM.formItems[+tr.dataset.row],fin=tr.querySelector('.om-foc-in'),fv=fin?parseInt(fin.value,10):NaN;
    const fc=n>0?(fin?(fv>=0?fv:0):(fi?focFor(fi.item,n):0)):0,tot=n>0?n+fc:0;   // n = the quantity ordered (billed); fc = the free EA on top (the FOC list, or the super admin's FOC column)
    tr.querySelector('[data-vol]').textContent=n>0?fmtN(tot*lpe):'—';
    if(n>0){ea+=tot;foc+=fc;}
    const av=fi?stockOf(fi.item):null,qb=tr.querySelector('.om-qty'),qc=qb.closest('td'),over=av!=null&&tot>av;
    let w=qc.querySelector('.om-live-err');
    if(over){if(!w){w=document.createElement('div');w.className='om-field-err om-live-err';qc.appendChild(w);}w.textContent=`Only ${fmtN(av)} EA available${fc>0?` (${fmtN(n)} ordered + ${fmtN(fc)} FOC)`:''}.`;}else if(w)w.remove();
    qb.classList.toggle('bad',over);
    let fh=qc.querySelector('.om-foc');
    const rt0=tr.querySelector('.om-rate'),r0=parseFloat(rt0?rt0.value:tr.dataset.lrate),g0=OM.rateMode&&fi&&fi.gst!==''?parseFloat(fi.gst):(fi?parseFloat(listPrice(fi.item).gst):18);
    if(fc>0){if(!fh){fh=document.createElement('div');fh.className='om-hint om-foc';qc.appendChild(fh);}fh.innerHTML=`+ ${fmtN(fc)} EA FOC (free of cost) = ${fmtN(tot)} EA`+(r0>0?focCalcNote(n,tot,r0,g0):'');}else if(fh)fh.remove();
    const rt=tr.querySelector('.om-rate');
    const gin=tr.querySelector('.om-gst'),gx0=gin?parseFloat(gin.value):NaN;   // edit form: the GST % typed on the line
    const r=parseFloat(rt?rt.value:tr.dataset.lrate),gg=OM.rateMode&&!isNaN(gx0)?gx0:(isNaN(g0)?18:g0),dl=r>0?dlpOf(r,gg):0,a=(n>0&&r>0)?(OM.rateMode?n*r*(1+gg/100):n*dl):0;amt+=a;tr.querySelector('[data-amt]').textContent=a?money2(a):'—';
    const ga=tr.querySelector('[data-gstamt]');if(ga){const gx=(n>0&&r>0)?n*r*gg/100:0;ga.textContent=gx?money2(gx):'—';gsum+=gx;}
    const rc=tr.querySelector('[data-rate]');if(rc&&r>0)rc.textContent=money2(dl);   // the rate is the DLP (incl. GST); the amount = DLP x the ordered EA
  });
  const ta=$('om-tot-amt');if(ta)ta.textContent=money2(amt);
  const tg=$('om-tot-gst');if(tg)tg.textContent=money2(gsum);
  $('om-tot-ea').innerHTML=`${fmtN(ea)} EA`;
  const tf=$('om-tot-foc');if(tf)tf.textContent=fmtN(foc);
  $('om-tot-vol').innerHTML=`${fmtN(ea*lpe)} L`;
  const mh=$('om-minhint'),min=minOrder();
  const ab=$('om-add-btn');
  if(ab){
    const q=parseInt($('om-add-ea').value,10)||0,short=min-ea-q,sel=$('om-add-item').value,av=sel?stockOf(sel):null,over=av!=null&&q>av;
    ab.disabled=!!(sel&&q>0&&((min&&short>0)||over));
    ab.title='';
    const ae=$('om-e-add');
    if(ae)ae.textContent=over?`Only ${fmtN(av)} EA available.`:(min&&q>0&&short>0)?`Add ${fmtN(short)} more EA to reach the minimum.`:'';
  }
  if(mh){
    mh.className='om-hint';mh.style.color=min?'#111':'';
    mh.textContent=min?`Minimum order: ${fmtN(min)} EA (${fmtN(min*lpe)} L)`:'';
  }
}
/* EA already in the order lines (not counting the blank add row). */
function addShortfallBase(){return OM.formItems.reduce((t,i)=>t+(parseInt(i.ea,10)>0?parseInt(i.ea,10):0),0);}
function minOrder(){return OM.rateMode?0:(OM.meta&&OM.meta.min_order&&OM.meta.min_order.ea)||0;}

let _lookSeq=0;
const SAP_FIELDS={zone:'om-f-zone',ro:'om-f-ro',state:'om-f-state',outlet:'om-f-outlet',district:'om-f-district',sales_area:'om-f-area',address:'om-f-address',phone:'om-f-phone',pincode:'om-f-pincode',gstin:'om-f-gstin'};
function clearOutlet(){Object.values(SAP_FIELDS).forEach(id=>{const el=$(id);if(el)el.value='';});OM.sapOk=false;}
function sapHint(cls,txt){const h=$('om-hint-sap');if(h){h.className='om-hint'+(cls?' '+cls:'');h.textContent=txt;}}
async function lookupSap(code){
  const rc=$('om-f-sap');
  if(!rc)return;
  rc.dataset.looked=code;
  clearOutlet();
  if(!code){sapHint('','');return;}
  if(!/^\d{6,12}$/.test(code)){sapHint('bad','SAP code must be digits only.');return;}
  const seq=++_lookSeq;
  sapHint('','Looking up outlet…');
  try{
    const zq=OM.kind==='admin'&&OM.editing&&!isMine(OM.editing)?'&zone='+encodeURIComponent(OM.editing.zone):'';   // the admin edits inside the order's own zone
    const r=await fetch('orders.php?action=outlet&code='+encodeURIComponent(code)+zq,{credentials:'same-origin'});
    const j=await r.json();
    if(seq!==_lookSeq)return;
    if(!j.ok){sapHint('bad',j.error||'Lookup failed.');return;}
    if(j.loaded===false){sapHint('bad','The outlet list has not been loaded yet — contact the administrator.');return;}
    if(!j.found){sapHint('bad','SAP code not found in the outlet list.');return;}
    if(!j.allowed&&j.state_limit){sapHint('bad','This outlet is in '+(j.state||'another state')+', which is not one of the states you handle.');return;}
    if(!j.allowed){sapHint('bad',j.ro?`This outlet belongs to ${j.sheet_zone||j.zone} (${roName(j.ro)} region).`:`This outlet belongs to ${j.sheet_zone||j.zone}, not ${OM.kind==='admin'?'the order\'s zone':'your zone'} (${meZoneText()||(OM.editing&&OM.editing.zone)}).`);return;}
    Object.keys(SAP_FIELDS).forEach(k=>{const el=$(SAP_FIELDS[k]);if(el)el.value=j.outlet[k]||'';});
    OM.sapOk=true;
    sapHint('ok','✓ Outlet found: '+j.outlet.outlet);
  }catch(e){if(seq===_lookSeq)sapHint('bad','Lookup unavailable — please try again.');}
}

function clearFieldErrors(){
  document.querySelectorAll('#tab-neworder .om-field-err').forEach(e=>e.textContent='');
  document.querySelectorAll('#tab-neworder .has-err').forEach(e=>e.classList.remove('has-err'));
}
function showFieldErrors(f){
  Object.keys(f||{}).forEach(k=>{
    const e=$('om-e-'+k),w=$('om-w-'+k);
    if(e)e.textContent=f[k];
    if(w)w.classList.add('has-err');
  });
  const first=document.querySelector('#tab-neworder .om-field-err:not(:empty)');
  if(first)first.scrollIntoView({behavior:'smooth',block:'center'});
}

async function saveForm(submit){
  clearFieldErrors();
  syncItemsFromDom();
  if(!tryAdd())return;           // a half-filled "add item" row is flagged instead of silently dropped
  const ed=OM.editing;
  const pend=!!ed&&ed.status==='pending';   // a pending order stays pending, so it is checked like a submission
  const strict=submit||pend;
  const payload={
    id:ed?ed.id:0,
    date:($('om-f-date').type==='date'?$('om-f-date').value:$('om-f-date').dataset.v),sap_code:$('om-f-sap').value.trim(),remarks:$('om-f-remarks').value.trim(),
    items:OM.formItems.map(i=>Object.assign({item:i.item,ea:i.ea===''?null:Number(i.ea)},OM.focMode?{foc:i.foc===''||i.foc==null?null:Number(i.foc)}:{},OM.rateMode?{rate:i.rate===''?null:Number(i.rate),gst:i.gst===''?null:Number(i.gst)}:{})),
    submit
  };
  // quick local check so obvious mistakes show up before the confirm dialog (the server re-validates everything)
  const quick={};
  if(!payload.date)quick.date='Enter a valid order date';
  if(!payload.sap_code)quick.sap_code='Enter the SAP code';
  else if(!$('om-f-outlet').value)quick.sap_code='Enter a valid SAP code from your zone — the outlet details must fill in first';
  if(!strict)payload.items=payload.items.filter(it=>it.ea!=null);   // a draft may leave unfinished (blank) item rows out
  payload.items.forEach((it,i)=>{
    if(!(it.ea>=1))quick['item_'+i]='Enter a quantity greater than 0';
    else{const av=stockOf(it.item);if(av!=null&&it.ea>av)quick['item_'+i]=`Only ${fmtN(av)} EA of this product is available.`;}
    if(OM.focMode&&!(Number.isInteger(it.foc)&&it.foc>=0))quick['foc_'+i]='Enter the FOC (0 or more)';
    if(OM.rateMode){
      if(!(it.rate>0))quick['rate_'+i]='Enter the rate';
      if(it.gst==null||!(it.gst>=0&&it.gst<=100))quick['gst_'+i]='Enter the GST %';
    }
  });
  if(strict&&!payload.items.length)quick.items='Add at least one item before saving';
  else if(strict&&minOrder()&&payload.items.reduce((a,i)=>a+(i.ea>=1?i.ea:0),0)<minOrder()){
    const have=payload.items.reduce((a,i)=>a+(i.ea>=1?i.ea:0),0);
    quick.items=`The minimum order is ${fmtN(minOrder())} EA. This order has ${fmtN(have)} EA.`;
  }
  if(Object.keys(quick).length){
    showFieldErrors(quick);renderItemRows(quick);
    toast('Please fix the highlighted fields.','er');
    return;
  }
  const isHp=OM.kind==='hpcl'||OM.hsuper;
  if(submit&&isHp){
    const ok=await showModal({title:'Submit for approval',body:'The order will be sent for approval to '+myApproversText()+' — any one of them decides it. You cannot edit it once it is submitted (if it is rejected it comes back to you to correct).',confirmText:'Submit order',confirmClass:'btn-p'});
    if(!ok)return;
  }else if(submit){
    const ok=await showModal({title:'Submit for approval',body:'The order will be sent for approval to '+myApproversText()+' — any one of them decides it. You can still edit it until it is decided.',confirmText:'Submit order',confirmClass:'btn-p'});
    if(!ok)return;
  }
  const b1=$('om-save'),b2=$('om-save-submit');
  const lock=v=>{b1.disabled=v;if(b2)b2.disabled=v;};
  lock(true);
  try{
    const j=await omPost('save',payload);
    toast(pend?`Order ${j.order.ref} updated`:j.submitted?`Order ${j.order.ref} submitted for approval`:`Draft ${j.order.ref} saved`);
    const back=OM.rateMode?'approvals':OM.kind==='admin'||OM.kind==='hpcl'?'allorders':'myorders';
    OM.editing=null;
    refreshMeta().catch(()=>{});
    showTab(back);
  }catch(e){
    if(e.fields){showFieldErrors(e.fields);syncItemsFromDom();renderItemRows(e.fields);}
    toast(e.message,'er');
    lock(false);
  }
}

/* ── Users. The super admin makes Zone Officers (a whole zone, Rohan Energy or HPCL). A Zone Officer makes Regional Officers of their own
   organisation and zone: ONE region, then the sales areas (SA) of it (tick-boxes). The server enforces who may do what; this only decides what to show. ── */
/* roName shortens "BILASPUR RET RO" to "Bilaspur" */
function roName(r){return String(r).replace(/\s+RET(AIL)?(\s+(RO|REG\w*))?$/i,'').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());}
function sheetZoneOf(u){
  if(u.sheetZone&&OM.meta.sheet_zones[u.sheetZone])return u.sheetZone;
  const z=Object.entries(OM.meta.sheet_zones).find(([,v])=>u.ros.length&&u.ros.every(r=>v.ros.includes(r)));
  return z?z[0]:'';
}
/* a Zone Officer / HPCL Super Admin can cover several zones: every Master Sheet zone, every portal zone, and a one-line text of them */
function sheetZonesOf(u){return (u.sheetZones&&u.sheetZones.length)?u.sheetZones:[sheetZoneOf(u)].filter(Boolean);}
function zonesOf(u){return (u.zones&&u.zones.length)?u.zones:(u.zone?[u.zone]:[]);}
function zoneLine(u){const s=sheetZonesOf(u);return s.length?s.join(' + '):zonesOf(u).join(' + ');}
function meZoneText(){const me=OM.meta&&OM.meta.me;if(!me)return '';return ((me.zones&&me.zones.length)?me.zones:(me.zone?[me.zone]:[])).join(' + ');}
function allRosOf(names){const sz=OM.meta.sheet_zones;return [].concat(...names.map(n=>(sz[n]||{}).ros||[]));}
/* zone + region picker: a tick-box per zone with its regions under it. Ticking a zone ticks its regions; unticking a region leaves it out
   (e.g. a Regional Manager who handles one region only). Under an HPCL Super Admin made for some zones only the regions of those zones are offered. */
function zonePicker(p,selRos){
  const sz=OM.meta.sheet_zones,allowed=OM.kind==='admin'?Object.keys(OM.sas||{}):null,sel=new Set(selRos||[]);
  const blocks=Object.keys(sz).map(n=>{
    const ros=sz[n].ros.filter(r=>!allowed||allowed.includes(r));
    if(!ros.length)return '';
    return `<div class="om-zpz"><label class="om-chk om-zph"><input type="checkbox" data-zp-zone="${esc(n)}"> <b>${esc(n)}</b> <span class="om-sub">${esc(sz[n].zone)}</span></label>
      <div class="om-zpr">${ros.map(r=>`<label class="om-chk"><input type="checkbox" data-zp-ro="${esc(n)}" value="${esc(r)}"${sel.has(r)?' checked':''}> ${esc(roName(r))}</label>`).join('')}</div></div>`;
  }).join('');
  return `<div class="om-zpick" id="${p}-zp">${blocks||'<div class="om-hint">No zones are available.</div>'}</div>`;
}
function zpSync(box){
  if(!box)return;
  box.querySelectorAll('.om-zpz').forEach(z=>{
    const h=z.querySelector('[data-zp-zone]'),rs=Array.from(z.querySelectorAll('[data-zp-ro]')),k=rs.filter(i=>i.checked).length;
    h.checked=k===rs.length;h.indeterminate=k>0&&k<rs.length;
  });
}
function zpSyncAll(root){(root||document).querySelectorAll('.om-zpick').forEach(zpSync);}
/* what was ticked: the zones that have a region ticked, and those regions */
function zpBody(p){
  const box=$(p+'-zp');if(!box)return null;
  const zones=[],ros=[];let partial=false;
  box.querySelectorAll('.om-zpz').forEach(z=>{
    const rs=Array.from(z.querySelectorAll('[data-zp-ro]')),on=rs.filter(i=>i.checked);
    if(on.length){zones.push(z.querySelector('[data-zp-zone]').dataset.zpZone);on.forEach(i=>ros.push(i.value));if(on.length<rs.length)partial=true;}
  });
  if(!zones.length)return null;
  return (partial||OM.hsuper)?{sheet_zones:zones,ros}:{sheet_zones:zones};   // no regions sent = every region of the zones
}
/* state picker (super admin approval): a tick-box per state, grouped by zone. Reuses the zone picker's markup and handlers: the "region" boxes hold the states */
function allStates(){return Array.from(new Set([].concat(...Object.values(OM.meta.state_zones))));}
function statePicker(p,sel){
  const pz=OM.meta.state_zones,on=new Set(sel||[]);   // a state listed under several zones is ONE state: its boxes are kept in step (see the change handler)
  return `<div class="om-zpick" id="${p}-zp">${Object.keys(pz).map(z=>`<div class="om-zpz"><label class="om-chk om-zph"><input type="checkbox" data-zp-zone="${esc(z)}"> <b>${esc(z)}</b></label>
    <div class="om-zpr">${pz[z].map(st=>`<label class="om-chk"><input type="checkbox" data-zp-ro="${esc(z)}" data-st="1" value="${esc(st)}"${on.has(st)?' checked':''}> ${esc(st)}</label>`).join('')}</div></div>`).join('')}</div>`;
}
/* every region of every zone ticked? */
function zpAll(p){const b=$(p+'-zp');return !!b&&!b.querySelector('[data-zp-ro]:not(:checked)');}
function zpRos(p){return Array.from(new Set(Array.from(document.querySelectorAll('#'+p+'-zp [data-zp-ro]:checked')).map(i=>i.value)));}
/* zone dropdown options grouped by the portal zone they belong to (Central / East Central / North Central Retail), so the two naming schemes can be matched */
function zoneOptions(sel){
  const sz=OM.meta.sheet_zones,pz=OM.meta.zones;
  return Object.keys(pz).map(g=>{
    const names=Object.keys(sz).filter(n=>sz[n].zone===g);
    return names.length?`<optgroup label="${esc(g)} — ${esc(pz[g].join(' + '))}">${names.map(n=>`<option value="${esc(n)}"${n===sel?' selected':''}>${esc(n)}  (${esc(g)})</option>`).join('')}</optgroup>`:'';
  }).join('');
}
function rosText(u){
  if(!u.ros||!u.ros.length)return '<span class="om-sub">Whole zone</span>';
  return u.ros.map(r=>esc(roName(r))).join(', ');
}
/* region -> sales areas (SA) picker (regions are a dropdown, sales areas are tick-boxes). The lists come from the client's FY27 sheet (regions.php). */
async function ensureSalesAreas(force){
  if(OM.sas&&!force)return OM.sas;
  const j=await authGet('list_sales_areas');
  OM.sas=j.sales_areas||{};
  return OM.sas;
}
function saBox(boxId,ro,picked){
  if(!ro)return '<div class="om-hint">Choose a region to see its sales areas.</div>';
  const list=(OM.sas||{})[ro]||[];
  if(!list.length)return '<div class="om-hint">No sales areas are listed for this region.</div>';
  const set=new Set(picked||[]),n=list.filter(d=>set.has(d)).length;
  return `<div class="om-distbar"><button type="button" class="om-btn" data-act="sa-all" data-box="${esc(boxId)}">Select all</button><button type="button" class="om-btn" data-act="sa-none" data-box="${esc(boxId)}">Clear</button><span class="om-sub om-distcount">${n} of ${list.length} selected</span></div>
    <div class="om-roset om-distset">${list.map(d=>`<label class="om-chk"><input type="checkbox" value="${esc(d)}"${set.has(d)?' checked':''}> ${esc(d)}</label>`).join('')}</div>`;
}
function regionFields(p,regions,ro,picked){
  return `<div class="field"><label>Region *</label><select id="${p}-ro" data-sa-for="${p}-sa"><option value="">Select region…</option>${regions.map(r=>`<option value="${esc(r)}"${r===ro?' selected':''}>${esc(roName(r))}</option>`).join('')}</select></div>
    <div class="field om-roset-wrap"><label>Sales areas (SA) * <span class="om-sub">— tick every sales area this officer handles</span></label><div id="${p}-sa" class="om-distbox">${saBox(p+'-sa',ro,picked)}</div></div>`;
}
function pickedSAs(boxId){return Array.from(document.querySelectorAll('#'+boxId+' .om-distset input:checked')).map(i=>i.value);}
function saCount(box){
  const all=box.querySelectorAll('.om-distset input').length,n=box.querySelectorAll('.om-distset input:checked').length,c=box.querySelector('.om-distcount');
  if(c)c.textContent=`${n} of ${all} selected`;
}
function saSetAll(boxId,on){const box=$(boxId);if(!box)return;box.querySelectorAll('.om-distset input').forEach(i=>{i.checked=on;});saCount(box);}
document.addEventListener('change',e=>{
  const t=e.target;if(!t)return;
  if(t.id==='om-ra-parent'){OM.raParent=t.value;drawRaRegion();return;}
  const stSame=(box,on,vals)=>box.querySelectorAll('[data-st]').forEach(i=>{if(vals.has(i.value))i.checked=on;});
  if(t.dataset&&t.dataset.zpZone!==undefined){const z=t.closest('.om-zpz'),box=t.closest('.om-zpick');z.querySelectorAll('[data-zp-ro]').forEach(i=>{i.checked=t.checked;});
    stSame(box,t.checked,new Set(Array.from(z.querySelectorAll('[data-st]')).map(i=>i.value)));zpSync(box);return;}
  if(t.dataset&&t.dataset.zpRo!==undefined){const box=t.closest('.om-zpick');if(t.dataset.st)stSame(box,t.checked,new Set([t.value]));zpSync(box);return;}
  if(t.id==='om-re-org'){const p=$('om-re-parent');if(p){p.innerHTML=zoOptions(t.value,'');reRegion();}return;}
  if(t.id==='om-re-parent'){reRegion();return;}
  if(t.id==='om-imp-file'){if(t.files&&t.files[0])impFile(t.files[0]);return;}
  if(t.id==='om-ou-file'){if(t.files&&t.files[0])outFile(t.files[0]);t.value='';return;}
  if(t.dataset&&t.dataset.impSheet!==undefined){impState().sheets[+t.dataset.impSheet].level=t.value;impCheck();return;}
  if(t.id==='om-imp-org'){impState().org=t.value;impCheck();return;}
  if(t.id==='om-imp-by'){impState().by=t.value;impCheck();return;}
  const dz=t.dataset&&t.dataset.saFor;
  if(dz){const box=$(dz);if(box)box.innerHTML=saBox(dz,t.value,[]);return;}   // another region: its sales areas, none ticked
  if(t.matches&&t.matches('.om-distset input')){const box=t.closest('.om-distbox');if(box)saCount(box);}
});
function saText(u){
  const d=u.salesAreas||[];
  if(!d.length)return '<span class="om-sub">—</span>';
  return `<span title="${esc(d.join(', '))}">${d.slice(0,3).map(esc).join(', ')}${d.length>3?` <span class="om-sub">+ ${d.length-3} more</span>`:''}</span><div class="om-sub">${d.length} sales area${d.length===1?'':'s'}</div>`;
}
function orderUsers(){
  return Object.entries(OM.users||{}).filter(([,u])=>u.org&&u.role==='zone')
    .map(([username,u])=>({username,label:u.label,org:u.org,level:u.level==='regional'?'regional':'zone',hiddenPages:u.hidden_pages||[],createdBy:u.created_by||'',salesAreas:u.sales_areas||[],zone:(u.filter&&u.filter.zone)||'',sheetZone:u.sheet_zone||'',sheetZones:u.sheet_zones||[],zones:u.zones||[],ros:u.ros||[],email:u.email||'',mobile:u.mobile||'',canSee:!!u.can_see_pw,password:u.password||'',passBy:u.pass_by||'',passAt:u.pass_at||''}));
}
/* ── Page access: the pages (tabs) of the portal that can be switched off for a user (Users & Zones -> Edit -> Page access) ── */
const PAGE_LABEL={dashboard:'Dashboard',rawdata:'Raw Data',mis:'MIS',entry:'Data Entry',admin:'Admin',neworder:'New Order',myorders:'My Orders',approvals:'Pending Approvals',allorders:'All Orders',returns:'Returns',inventory:'Inventory',foc:'FOC',sap:'SAP Numbers',roreport:'RO Report',perms:'Permissions',zones:'Users & Zones',team:'Regional Officers',outlets:'Outlet Profiles'};
/* the pages a user of this kind has: x = {admin:true|false, org:'rohan'|'hpcl', level:'zone'|'regional'} */
function pagesOf(x){
  let p;
  if(x.admin)p=x.org==='hpcl'?['approvals','allorders','returns','neworder','sap','roreport','zones','outlets']:['admin','approvals','allorders','returns','neworder','inventory','foc','sap','roreport','perms','zones','outlets'];
  else if(x.org==='hpcl')p=x.level==='regional'?['approvals','allorders','returns','neworder','sap']:['approvals','allorders','returns','neworder','sap','team','roreport','outlets'];
  else p=x.level==='regional'?['neworder','myorders','approvals','returns','sap']:['neworder','myorders','approvals','returns','sap','team','roreport'];
  return ['dashboard','rawdata','mis'].concat(p);
}
function pagesBlock(pre,x){
  const off=new Set(x.hiddenPages||[]);
  return `<div class="field om-pages" id="om-pg-${pre}" style="margin-top:14px"><label>Page access</label>
    <div class="om-hint">Tick the pages this user can see. A page that is not ticked is hidden from their menu (they can still open the Profile page). Takes effect the next time they open the portal.</div>
    <div class="om-pgrid">${pagesOf(x).map(id=>`<label class="om-pchk"><input type="checkbox" data-pg="${id}"${off.has(id)?'':' checked'}> ${esc(PAGE_LABEL[id]||id)}</label>`).join('')}</div></div>`;
}
/* the unticked pages: {hidden:[...]} - or {error} when nothing is ticked, null when the block is not on the form */
function pagesPicked(pre){
  const box=$('om-pg-'+pre);if(!box)return null;
  const boxes=[...box.querySelectorAll('input[data-pg]')];
  if(!boxes.some(b=>b.checked))return {error:'Tick at least one page the user can see.'};
  return {hidden:boxes.filter(b=>!b.checked).map(b=>b.dataset.pg)};
}
const contactCell=u=>(u.email||u.mobile)?`${u.email?esc(u.email):''}${u.mobile?`<div class="om-sub">${esc(u.mobile)}</div>`:''}`:'<span class="om-sub">—</span>';
/* reload the user tables after a change (remove, edit, add...) without jumping to the top of the page */
function refreshUsers(){
  const y=window.scrollY;
  return Promise.resolve(OM.current==='team'?renderTeam(true):renderZones(true)).then(()=>window.scrollTo(0,y));
}
/* password boxes with the show / hide eye (pwField lives in index.html) */
const pwBox=(id,ph)=>typeof pwField==='function'?pwField(id,ph,'new-password'):`<input type="password" id="${id}" placeholder="${esc(ph||'')}" autocomplete="new-password">`;
/* the readable password of an officer, for the people above them: hidden until the eye is pressed; says who set it last, so a change made by the officer themselves stands out */
function pwWhen(t){const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(t||'');return m?`${+m[3]} ${MON[+m[2]-1]}, ${m[4]}:${m[5]}`:'';}
function pwCell(u){
  if(!u.canSee)return '<span class="om-sub">—</span>';
  if(!u.password)return '<span class="om-sub">Not recorded</span><div class="om-sub">Reset it to set one</div>';
  const own=u.passBy===u.username,me=(OM.meta&&OM.meta.me&&OM.meta.me.username)||'',who=own?'Changed by the user':'Set by '+(u.passBy===me?'you':(((OM.users||{})[u.passBy]||{}).label||(u.passBy==='superadmin'?'Super Admin':u.passBy)));
  return `<span class="om-pwv"><b class="om-pwt" data-pwt="${esc(u.username)}">••••••••</b><button type="button" class="om-pweye" data-act="pw-show" data-user="${esc(u.username)}" aria-label="Show password" aria-pressed="false" title="Show / hide password"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></span><div class="om-sub${own?' om-pwown':''}">${esc(who)}${u.passAt?' · '+esc(pwWhen(u.passAt)):''}</div>`;
}
function togglePwCell(btn){
  const u=orderUsers().find(o=>o.username===btn.dataset.user);if(!u)return;
  const t=btn.parentNode.querySelector('.om-pwt'),show=btn.getAttribute('aria-pressed')!=='true';
  t.textContent=show?u.password:'••••••••';
  btn.setAttribute('aria-pressed',show?'true':'false');btn.classList.toggle('on',show);
}
const userActs=(u,addRo)=>`<div class="om-acts">${addRo?`<button class="om-btn p" data-act="ro-for" data-user="${esc(u.username)}">+ Regional Officer</button>`:''}<button class="om-btn e" data-act="user-edit" data-user="${esc(u.username)}">Edit</button><button class="om-btn" data-act="user-pw" data-user="${esc(u.username)}">Reset password</button><button class="om-btn d" data-act="user-del" data-user="${esc(u.username)}">Remove</button></div>`;

/* ── Outlet Profiles: one login per SAP number (the "SAP No." tab of the sign-in page) ──
   Username = the SAP number. Super Admin: every outlet; Zone Officer: the outlets of their regions. Made one by one, or from the client's outlet Excel
   (NAME + SAP_CODE columns): the sheet is read here, the rows go to auth.php in slices, and the server makes the passwords (outletname_123 ...). */
const OUT_PER=50,OUT_SLICE=150;
const OUT_SUF=['123','321','456','654','789','987','147','741','258','852','369','963'],OUT_BLOCK=1000;
const outRuleName=n=>(String(n||'').toLowerCase().replace(/[^a-z0-9]+/g,''))||'outlet';
const outRulePw=(n,i)=>outRuleName(n)+'_'+OUT_SUF[Math.floor(Math.max(0,i)/OUT_BLOCK)%OUT_SUF.length];
function outState(){return OM.outlets||(OM.outlets={q:'',ro:'',zo:'',page:1,data:null,sel:new Set(),imp:null,busy:false,touched:{}});}
let _outSeq=0,_outT=null,_outLook=0;
const EYE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
function renderOutlets(){
  const sec=$('tab-outlets');if(!sec)return;
  const st=outState();
  sec.innerHTML=`<div class="as"><h3>Add an outlet profile</h3>
      <p class="om-psub">An outlet profile belongs to <b>one SAP number</b>. It is an <b>HPCL</b> login and goes under the HPCL Zone Officer of the outlet's region. The outlet signs in on the <b>SAP No.</b> tab of the sign-in page with the SAP number as username, and can only place and follow the orders of that outlet. Type the SAP number: the outlet name and a password fill in (you can change both).</p>
      <div class="om-grid om-grid3">
        <div class="field"><label>SAP number (username)</label><input type="text" id="om-ou-sap" maxlength="12" inputmode="numeric" placeholder="e.g. 90000002" autocomplete="off"><div class="om-hint" id="om-ou-hint"></div></div>
        <div class="field"><label>Outlet name</label><input type="text" id="om-ou-name" maxlength="150" placeholder="Filled from the SAP number" autocomplete="off"></div>
        <div class="field"><label>Password</label>${pwBox('om-ou-pass','Min 8 characters')}</div>
      </div>
      <div class="om-form-actions"><button class="btn-p" data-act="out-add">+ Create outlet profile</button><span class="om-field-err" id="om-ou-err"></span></div></div>
    <div class="as"><h3>Create profiles from the outlet Excel</h3>
      <p class="om-psub">Upload the outlet sheet (the <b>Retail Outlet Details</b> format with the <b>NAME</b> and <b>SAP_CODE</b> columns). Every row becomes a profile: <b>username = SAP code</b>, <b>name = outlet name</b>, <b>password = outletname_123</b> (outlet name in small letters without spaces or signs, then an underscore and 3 digits). The 3 digits change after every 1,000 rows: <b>_123</b> for rows 1–1000, <b>_321</b> for 1001–2000, <b>_456</b> for 2001–3000, then _654, _789, _987 … Outlets that already have a profile are left as they are. Only outlets that are in the SAP Numbers list${OM.kind==='hpcl'?' of your regions':''} get a profile. The profiles are <b>HPCL</b> logins: each one goes under the <b>HPCL Zone Officer</b> of its region, places orders like an HPCL officer (the Super Admin approves them) and sees its own outlet only.</p>
      <div class="om-form-actions"><button class="btn-g" data-act="out-file">Choose Excel file…</button><input type="file" id="om-ou-file" accept=".xlsx,.xls,.xlsm" style="display:none"><span class="om-psub" id="om-ou-fname"></span></div>
      <div id="om-ou-imp"></div></div>
    <div class="filter-bar" id="om-ou-bar">
      <div class="fg"><label>Search</label><input type="text" class="filter-search" id="om-ou-q" value="${esc(st.q)}" placeholder="SAP number or outlet name…" autocomplete="off"></div>
      <div class="fg" id="om-ou-fzo"><label>HPCL Zone Officer</label><select id="om-ou-zo"><option value="">All Zone Officers</option></select></div>
      <div class="fg"><label>Region</label><select id="om-ou-ro"><option value="">All regions</option></select></div>
      <button class="btn-g right" style="margin-left:auto" data-act="out-reset">Reset</button>
    </div>
    <div class="tc"><div class="th"><h3 id="om-ou-title">Outlet profiles</h3><div class="om-hbtns" id="om-ou-btns"></div></div><div id="om-ou-sel"></div>
      <div class="tw" id="om-ou-table"><div class="om-empty">Loading…</div></div></div>`;
  const sap=$('om-ou-sap');
  sap.addEventListener('input',()=>{sap.value=sap.value.replace(/\D/g,'');clearTimeout(_outT);++_outLook;outHint('','');if(sap.value.length>=6)_outT=setTimeout(()=>lookupOutlet(false),350);});
  sap.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookupOutlet(true);}});
  $('om-ou-name').addEventListener('input',()=>{st.touched.name=true;});
  $('om-ou-pass').addEventListener('input',()=>{st.touched.pass=true;});
  $('om-ou-q').addEventListener('input',e=>{st.q=e.target.value;st.page=1;st.sel=new Set();clearTimeout(_outT);_outT=setTimeout(loadOutlets,300);});
  $('om-ou-zo').addEventListener('change',e=>{st.zo=e.target.value;st.page=1;st.sel=new Set();loadOutlets();});
  $('om-ou-ro').addEventListener('change',e=>{st.ro=e.target.value;st.page=1;st.sel=new Set();loadOutlets();});
  st.touched={};
  drawOutImp();
  loadOutlets();
}
function outHint(cls,txt){const h=$('om-ou-hint');if(h){h.className='om-hint'+(cls?' '+cls:'');h.textContent=txt;}}
async function lookupOutlet(explicit){
  const sap=$('om-ou-sap');if(!sap)return;
  const code=sap.value.trim(),seq=++_outLook,st=outState();
  if(!/^\d{6,12}$/.test(code)){if(explicit)outHint('bad','Enter a valid SAP number (digits only).');return;}
  outHint('','Looking up outlet…');
  try{
    const j=await authPost('outlet_lookup',{sap_code:code});
    if(seq!==_outLook)return;
    const o=j.outlet;
    if(j.exists){outHint('bad','This outlet already has a profile ('+o.outlet_name+').');return;}
    const zo=(j.zone_officers||[]).map(z=>z.label).join(', ');
    outHint('ok','✓ '+o.outlet_name+' · '+roName(o.ro)+(o.sales_area?' · '+o.sales_area:'')+' · goes under '+(zo||'no HPCL Zone Officer yet'));
    if(!st.touched.name)$('om-ou-name').value=o.outlet_name;
    if(!st.touched.pass)$('om-ou-pass').value=j.suggested;
  }catch(e){if(seq===_outLook)outHint('bad',e.message);}
}
async function addOutlet(){
  const err=$('om-ou-err');err.textContent='';
  const sap_code=$('om-ou-sap').value.trim(),label=$('om-ou-name').value.trim(),password=$('om-ou-pass').value.trim();
  if(!/^\d{6,12}$/.test(sap_code)){err.textContent='Enter the SAP number (digits only).';return;}
  if(password&&password.length<8){err.textContent='The password must be at least 8 characters.';return;}
  try{
    await authPost('outlet_add',{sap_code,label,password});
    toast('Outlet profile '+sap_code+' created');
    const st=outState();st.touched={};st.q=sap_code;st.page=1;st.ro='';st.sel=new Set();
    $('om-ou-sap').value='';$('om-ou-name').value='';$('om-ou-pass').value='';outHint('','');
    $('om-ou-q').value=sap_code;
    loadOutlets();
  }catch(e){err.textContent=e.message;}
}
async function loadOutlets(){
  const box=$('om-ou-table');if(!box)return;
  const st=outState(),seq=++_outSeq;
  try{
    const j=await authPost('outlet_list',{q:st.q,ro:st.ro,zo:st.zo,page:st.page,per:OUT_PER});
    if(seq!==_outSeq||OM.current!=='outlets')return;
    st.data=j;st.page=j.page;
    const sel=$('om-ou-ro');
    if(sel&&!sel.dataset.ready||sel&&sel.options.length-1!==j.regions.length){sel.innerHTML='<option value="">All regions</option>'+j.regions.map(r=>`<option value="${esc(r)}"${st.ro===r?' selected':''}>${esc(roName(r))}</option>`).join('');sel.dataset.ready='1';}
    const zs=$('om-ou-zo');
    if(zs){
      zs.closest('.fg').style.display=OM.kind==='admin'?'':'none';   // an HPCL Zone Officer only has their own outlets
      zs.innerHTML='<option value="">All Zone Officers</option>'+(j.unassigned?`<option value="__none"${st.zo==='__none'?' selected':''}>No HPCL Zone Officer (${fmtN(j.unassigned)})</option>`:'')+j.zos.map(z=>`<option value="${esc(z.username)}"${st.zo===z.username?' selected':''}>${esc(z.label)}</option>`).join('');
    }
    drawOutlets();
  }catch(e){if(seq===_outSeq&&$('om-ou-table'))$('om-ou-table').innerHTML=`<div class="om-empty" style="color:#e02424">Could not load the outlet profiles: ${esc(e.message)}</div>`;}
}
function outPager(page,pages,total,per){
  if(pages<2)return '';
  const b=(p,l,dis,cur)=>`<button class="btn-g${cur?' on':''}" data-act="out-page" data-p="${p}"${dis?' disabled':''}${cur?' aria-current="page"':''}>${l}</button>`;
  const set=new Set([1,pages,page-1,page,page+1]);let nums='',last=0;
  [...set].filter(p=>p>=1&&p<=pages).sort((a,c)=>a-c).forEach(p=>{if(p-last>1)nums+='<span class="om-gap">…</span>';nums+=b(p,p,false,p===page);last=p;});
  const from=(page-1)*per;
  return `<div class="om-pager"><span class="om-psub">Showing ${fmtN(from+1)}–${fmtN(Math.min(from+per,total))} of ${fmtN(total)}</span><div class="om-pbtns">${b(page-1,'‹ Prev',page<2)}${nums}${b(page+1,'Next ›',page>=pages)}</div></div>`;
}
function drawOutlets(){
  const st=outState(),j=st.data,box=$('om-ou-table');if(!j||!box)return;
  const pages=Math.max(1,Math.ceil(j.total/j.per));
  $('om-ou-title').textContent=`Outlet profiles (${fmtN(j.profiles)} of ${fmtN(j.outlets)} outlets)${(st.q||st.ro||st.zo)?` · ${fmtN(j.total)} shown`:''}`;
  $('om-ou-btns').innerHTML=j.total?'<button class="btn-g" data-act="out-xlsx">⬇ Login sheet (Excel)</button>':'';
  const pageSel=j.rows.length&&j.rows.every(r=>st.sel.has(r.sap_code));
  const nSel=st.sel.size;
  $('om-ou-sel').innerHTML=nSel?`<div class="om-psub" style="padding:8px 14px">${fmtN(nSel)} selected · <button class="om-btn d" data-act="out-del-sel">Delete selected</button>${pageSel&&j.total>j.rows.length?` <button class="om-btn d" data-act="out-del-all">Delete all ${fmtN(j.total)} ${(st.q||st.ro||st.zo)?'shown':'profiles'}</button>`:''}</div>`:'';
  if(!j.total){box.innerHTML=`<div class="om-empty">${(st.q||st.ro||st.zo)?'No outlet profile matches.':'No outlet profiles yet. Add one above, or upload the outlet Excel.'}</div>`;return;}
  const rows=j.rows.map(r=>`<tr><td data-label=""><input type="checkbox" data-act="out-sel" data-sap="${esc(r.sap_code)}" aria-label="Select ${esc(r.sap_code)}"${st.sel.has(r.sap_code)?' checked':''}></td>
      <td class="om-ref" data-label="Username (SAP no.)">${esc(r.sap_code)}</td><td data-label="Outlet"><b>${esc(r.label)}</b></td>
      <td data-label="Region">${r.ro?esc(roName(r.ro)):'<span class="om-sub rej">Not in the SAP list</span>'}${r.sales_area?`<div class="om-sub">${esc(r.sales_area)}</div>`:''}</td>
      <td data-label="Goes under">${(r.zone_officers||[]).length?(r.zone_officers.length<=2?r.zone_officers.map(z=>`<b>${esc(z.label)}</b>`).join('<div class="om-sub">+ </div>'):`<span title="${esc(r.zone_officers.map(z=>z.label).join(', '))}"><b>${esc(r.zone_officers[0].label)}</b> <span class="om-sub">+ ${r.zone_officers.length-1} more</span></span>`)+'<div class="om-sub">HPCL Zone Officer</div>':'<span class="om-sub rej">No HPCL Zone Officer yet</span>'}</td>
      <td data-label="Password">${r.password?`<span class="om-pwv"><b class="om-pwt">••••••••</b><button type="button" class="om-pweye" data-act="out-pw" data-sap="${esc(r.sap_code)}" aria-label="Show password" aria-pressed="false" title="Show / hide password">${EYE}</button></span><div class="om-sub${r.pass_by===r.sap_code?' om-pwown':''}">${r.pass_by===r.sap_code?'Changed by the outlet':'Set by '+esc(r.pass_by)}${r.pass_at?' · '+esc(pwWhen(r.pass_at)):''}</div>`:'<span class="om-sub">Not recorded</span>'}</td>
      <td data-label="Actions"><div class="om-acts"><button class="om-btn e" data-act="out-edit" data-sap="${esc(r.sap_code)}">Edit</button><button class="om-btn d" data-act="out-del" data-sap="${esc(r.sap_code)}">Delete</button></div></td></tr>`).join('');
  box.innerHTML=`<table class="om-ucards"><thead><tr><th><input type="checkbox" data-act="out-sel-all" aria-label="Select this page"${pageSel?' checked':''}></th><th>Username (SAP no.)</th><th>Outlet</th><th>Region</th><th>Goes under</th><th>Password</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>${outPager(j.page,pages,j.total,j.per)}`;
}
function toggleOutPw(btn){
  const r=((outState().data||{}).rows||[]).find(x=>x.sap_code===btn.dataset.sap);if(!r)return;
  const t=btn.parentNode.querySelector('.om-pwt'),show=btn.getAttribute('aria-pressed')!=='true';
  t.textContent=show?r.password:'••••••••';
  btn.setAttribute('aria-pressed',show?'true':'false');btn.classList.toggle('on',show);
}
function openOutletEdit(sap){
  const r=((outState().data||{}).rows||[]).find(x=>x.sap_code===sap);if(!r)return;
  const ov=$('om-overlay');
  ov.innerHTML=`<div class="om-box om-narrow"><h3>Edit outlet profile — ${esc(sap)}</h3><div class="om-grid om-grid1" style="margin-top:12px">
    <div class="field"><label>Outlet name</label><input type="text" id="om-oe-name" maxlength="150" value="${esc(r.label)}"></div>
    <div class="field"><label>New password <span class="om-sub">(leave empty to keep the current one)</span></label>${pwBox('om-oe-pass','Min 8 characters')}</div></div>
    <p class="om-psub">The username is the SAP number and cannot be changed. The region follows the SAP Numbers list.</p>
    <div class="om-field-err" id="om-oe-err"></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button><button class="btn-p" data-act="out-edit-save" data-sap="${esc(sap)}">Save</button></div></div>`;
  ov.classList.add('show');
}
async function saveOutletEdit(sap){
  const err=$('om-oe-err');err.textContent='';
  const label=$('om-oe-name').value.trim(),password=$('om-oe-pass').value.trim();
  if(!label){err.textContent='The outlet name cannot be empty.';return;}
  if(password&&password.length<8){err.textContent='The password must be at least 8 characters.';return;}
  try{await authPost('outlet_update',{sap_code:sap,label,password});closeModal();toast('Outlet profile saved');loadOutlets();}
  catch(e){err.textContent=e.message;}
}
async function deleteOutlets(list){
  const st=outState(),all=list===null;
  const n=all?st.data.total:list.length;
  if(!n)return;
  const ok=await showModal({title:'Delete outlet profiles',body:`${fmtN(n)} outlet profile${n===1?'':'s'} will lose access immediately and cannot be recovered (the orders they placed stay on record). You can create them again from the Excel.`,confirmText:'Delete',confirmClass:'btn-d'});
  if(!ok)return;
  try{
    const j=await authPost('outlet_delete',all?{all:true,q:st.q,ro:st.ro,zo:st.zo}:{sap_codes:list});
    toast(`${fmtN(j.deleted)} outlet profile${j.deleted===1?'':'s'} deleted`);
    st.sel=new Set();st.page=1;loadOutlets();
  }catch(e){toast('Error: '+e.message,'er');}
}
/* the login sheet: every profile of the current scope (username, name, region, password) as Excel, to hand the logins out */
async function outLoginSheet(){
  try{await ensureXlsx();}catch(e){toast('Could not load the Excel tool: '+e.message,'er');return;}
  const st=outState();
  toast('Preparing the login sheet…');
  try{
    const rows=[['Username (SAP no.)','Outlet name','Password','Region','Sales area','Zone','HPCL Zone Officer']];
    for(let page=1;;page++){
      const j=await authPost('outlet_list',{q:st.q,ro:st.ro,zo:st.zo,page,per:1000});
      j.rows.forEach(r=>rows.push([r.sap_code,r.label,r.password,r.ro,r.sales_area,r.zone,(r.zone_officers||[]).map(z=>z.label).join(', ')]));
      if(page*1000>=j.total)break;
    }
    const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[18,36,36,24,26,22,30].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb,ws,'Outlet logins');XLSX.writeFile(wb,'Outlet logins.xlsx');
  }catch(e){toast('Error: '+e.message,'er');}
}
/* read the outlet sheet in the browser: NAME + SAP_CODE columns (the header row is found, the file may have a banner row above it) */
async function outFile(file){
  const st=outState();
  st.imp={name:file.name,rows:[],err:'',done:null,total:0};
  $('om-ou-fname').textContent=file.name;
  drawOutImp();
  try{
    await ensureXlsx();
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    let found=null;
    for(const name of wb.SheetNames){
      const a=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''});
      for(let i=0;i<Math.min(a.length,15);i++){
        const keys=a[i].map(hdrKey),cs=keys.findIndex(k=>k==='sapcode'||k==='sapno'||k==='sapnumber'||k==='sap'),cn=keys.findIndex(k=>k==='name'||k==='outletname'||k==='outlet');
        if(cs>=0&&cn>=0){found={sheet:name,cs,cn,from:i+1,a};break;}
      }
      if(found)break;
    }
    if(!found)throw new Error('This file has no SAP_CODE and NAME columns. Use the outlet sheet (Retail Outlet Details).');
    const seen=new Set(),rows=[];let dup=0,bad=0;
    for(let i=found.from;i<found.a.length;i++){
      const r=found.a[i],sap=String(r[found.cs]==null?'':r[found.cs]).replace(/\s+/g,'').replace(/\.0+$/,''),name=String(r[found.cn]==null?'':r[found.cn]).replace(/\s+/g,' ').trim();
      if(!sap&&!name)continue;
      if(!/^\d{6,12}$/.test(sap)){bad++;continue;}
      if(seen.has(sap)){dup++;continue;}
      seen.add(sap);rows.push({sap,name,idx:rows.length});
    }
    if(!rows.length)throw new Error('No rows with a SAP code were found in the sheet.');
    st.imp.rows=rows;st.imp.sheet=found.sheet;st.imp.dup=dup;st.imp.bad=bad;
  }catch(e){st.imp.err=e.message;}
  drawOutImp();
}
function drawOutImp(){
  const box=$('om-ou-imp');if(!box)return;
  const st=outState(),m=st.imp;
  if(!m){box.innerHTML='';return;}
  if(m.err){box.innerHTML=`<div class="om-field-err" style="margin-top:8px">${esc(m.err)}</div>`;return;}
  const n=m.rows.length;
  if(!n){box.innerHTML='<div class="om-empty">Reading the sheet…</div>';return;}
  const blocks=[];for(let b=0;b*OUT_BLOCK<n;b++)blocks.push(`rows ${fmtN(b*OUT_BLOCK+1)}–${fmtN(Math.min(n,(b+1)*OUT_BLOCK))}: <b>_${OUT_SUF[b%OUT_SUF.length]}</b>`);
  const ex=m.rows[0];
  const d=m.done;
  box.innerHTML=`<div class="om-psub" style="margin-top:10px"><b>${fmtN(n)}</b> outlets found in <b>${esc(m.sheet)}</b>${m.dup?` · ${fmtN(m.dup)} repeated SAP codes ignored`:''}${m.bad?` · ${fmtN(m.bad)} rows without a valid SAP code ignored`:''}.<br>
      Example: username <b>${esc(ex.sap)}</b>, name <b>${esc(ex.name)}</b>, password <b>${esc(outRulePw(ex.name,0))}</b>.<br>Password endings: ${blocks.join(' · ')}.</div>
    <label class="om-psub" style="display:flex;gap:6px;align-items:center;margin:8px 0"><input type="checkbox" id="om-ou-reset"${m.reset?' checked':''} ${st.busy?'disabled':''}> Also reset the name and password of outlets that already have a profile to this rule</label>
    <div class="om-form-actions"><button class="btn-p" data-act="out-upload"${st.busy||d?' disabled':''}>${st.busy?'Creating…':d?'Done':'Create '+fmtN(n)+' profiles'}</button><span class="om-psub" id="om-ou-prog">${st.busy&&m.prog?esc(m.prog):''}</span></div>
    ${d?`<div class="om-psub" style="margin-top:10px;color:#057a55"><b>${fmtN(d.created)}</b> profiles created${d.updated?` · ${fmtN(d.updated)} reset`:''}${d.kept?` · ${fmtN(d.kept)} already had one (kept)`:''}${d.outside?` · ${fmtN(d.outside)} outside your regions (skipped)`:''}${d.missing_n?` · <span class="om-field-err" style="display:inline">${fmtN(d.missing_n)} SAP codes are not in the SAP Numbers list${d.missing.length?': '+esc(d.missing.slice(0,8).join(', '))+(d.missing_n>8?' …':''):''}</span>`:''}${d.failed?` · <span class="om-field-err" style="display:inline">${fmtN(d.failed)} rows could not be saved: ${esc(d.error)}</span>`:''}.
      <button class="btn-g" style="margin-left:8px" data-act="out-xlsx">⬇ Login sheet (Excel)</button></div>`:''}`;
}
async function outUpload(){
  const st=outState(),m=st.imp;
  if(!m||!m.rows.length||st.busy)return;
  const reset=!!($('om-ou-reset')&&$('om-ou-reset').checked);m.reset=reset;
  st.busy=true;m.done=null;
  const tot={created:0,updated:0,kept:0,outside:0,missing_n:0,missing:[],failed:0,error:''};
  drawOutImp();
  for(let i=0;i<m.rows.length;i+=OUT_SLICE){
    m.prog=`Creating profiles… ${fmtN(Math.min(i,m.rows.length))} of ${fmtN(m.rows.length)}`;
    const pg=$('om-ou-prog');if(pg)pg.textContent=m.prog;
    const slice=m.rows.slice(i,i+OUT_SLICE);
    try{
      const j=await authPost('outlet_import',{rows:slice,reset});
      ['created','updated','kept','outside','missing_n'].forEach(k=>{tot[k]+=j[k]||0;});
      (j.missing||[]).forEach(x=>{if(tot.missing.length<50)tot.missing.push(x);});
    }catch(e){tot.failed+=slice.length;tot.error=e.message;if(/token|sign in|authenticated/i.test(e.message))break;}
  }
  st.busy=false;m.done=tot;m.prog='';
  drawOutImp();
  toast(`${fmtN(tot.created)} outlet profiles created`);
  st.page=1;loadOutlets();
}

/* Zone Officer: the Regional Officers they made */
async function renderTeam(keep){
  const sec=$('tab-team');if(!sec)return;
  if(!keep)sec.innerHTML='<div class="om-empty">Loading…</div>';
  try{
    await ensureMeta();
    const [j]=await Promise.all([authGet('list_users'),ensureSalesAreas(true)]);
    OM.users=j.users;
  }catch(e){sec.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load: ${esc(e.message)}</div>`;return;}
  if(OM.current!=='team')return;
  drawTeam();
}
function drawTeam(){
  const sec=$('tab-team');if(!sec)return;
  const me=OM.meta.me,regions=Object.keys(OM.sas||{});
  const list=orderUsers().filter(u=>u.level==='regional').sort((a,b)=>a.label.localeCompare(b.label));
  const rows=list.map(u=>`<tr><td><b>${esc(u.label)}</b></td><td>${esc(u.username)}</td><td>${esc(roName(u.ros[0]||''))}</td><td>${saText(u)}</td><td>${contactCell(u)}</td><td>${pwCell(u)}</td><td>${userActs(u)}</td></tr>`).join('');
  sec.innerHTML=`<div class="as"><h3>Add Regional Officer</h3><p class="om-psub">A Regional Officer works for ${esc(ORG_LBL[OM.kind])} in <b>${esc(meZoneText()||me.zone)}</b> and handles <b>one region</b> and the <b>sales areas (SA)</b> you tick in it — they see and act on orders of those sales areas only. Share the username and password with them yourself. They can change their own password later; you will see the new one here and can replace it at any time.</p>
      <div class="om-grid om-grid3">
        <div class="field"><label>Full name</label><input type="text" id="om-rn-name" maxlength="60" placeholder="e.g. Rahul Verma" autocomplete="off"></div>
        <div class="field"><label>Username</label><input type="text" id="om-rn-user" maxlength="40" placeholder="letters, numbers, _" autocomplete="off"></div>
        <div class="field"><label>Password</label>${pwBox('om-rn-pass','Min 8 characters')}</div>
      </div>
      <div class="om-regwrap">${regionFields('om-rn',regions,'',[])}</div>
      <div class="om-form-actions"><button class="btn-p" data-act="regional-add">+ Create Regional Officer</button><span class="om-field-err" id="om-rn-err"></span></div></div>
    <div class="tc"><div class="th"><h3>My Regional Officers (${list.length})</h3></div>
      <div class="tw">${rows?`<table class="om-ucards"><thead><tr><th>Name</th><th>Username</th><th>Region</th><th>Sales areas (SA)</th><th>Contact</th><th>Password</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="om-empty">No Regional Officers yet. Add the first one above.</div>'}</div></div>`;
  labelCells(sec);
}
async function addRegional(){
  const err=$('om-rn-err');err.textContent='';
  const label=$('om-rn-name').value.trim(),username=$('om-rn-user').value.trim(),password=$('om-rn-pass').value.trim(),ro=$('om-rn-ro').value;
  if(!label||!username||!password){err.textContent='Fill in name, username and password.';return;}
  if(password.length<8){err.textContent='The password must be at least 8 characters.';return;}
  if(!ro){err.textContent='Choose the region.';return;}
  const sales_areas=pickedSAs('om-rn-sa');
  if(!sales_areas.length){err.textContent='Tick at least one sales area of '+roName(ro)+'.';return;}
  try{
    await authPost('add_regional_officer',{username,password,label,ro,sales_areas});
    toast(`Regional Officer ${username} created`);
    refreshUsers();
  }catch(e){err.textContent=e.message;}
}
/* regions a Regional Officer can be moved between: the Zone Officer's own, or - for the super admin - the regions of the officer's zone */
function regionsFor(x){
  const keys=Object.keys(OM.sas||{});
  if(OM.kind!=='admin')return keys;
  const parent=x.level==='regional'?(orderUsers().find(o=>o.username===x.createdBy)||x):x;   // the regions of the Zone Officer the officer works under
  const rs=(parent.ros&&parent.ros.length)?parent.ros:allRosOf(sheetZonesOf(parent));
  return rs.filter(r=>keys.includes(r));
}
/* a renamed Zone Officer keeps its group open */
function renamedOpen(u,nu){if(nu!==u&&OM.ugOpen&&OM.ugOpen.has(u)){OM.ugOpen.delete(u);OM.ugOpen.add(nu);}}
/* the regions a Zone Officer can hand out (every region of the zones they cover) */
const zoRegions=z=>(z.ros&&z.ros.length)?z.ros:allRosOf(sheetZonesOf(z));
/* the Zone Officers of one organization, as <option>s */
function zoOptions(org,sel){
  const list=orderUsers().filter(z=>z.level==='zone'&&z.org===org).sort((a,b)=>a.label.localeCompare(b.label));
  return '<option value="">Select Zone Officer…</option>'+list.map(z=>`<option value="${esc(z.username)}"${z.username===sel?' selected':''}>${esc(z.label)} — ${esc(regLine(z))}</option>`).join('');
}
/* region + sales area fields for the Zone Officer chosen in the Regional Officer editor (the regions of that Zone Officer) */
function reRegion(){
  const box=$('om-re-reg');if(!box)return;
  const p=$('om-re-parent'),pz=p?orderUsers().find(o=>o.username===p.value):null,keys=Object.keys(OM.sas||{});
  const regs=pz?zoRegions(pz).filter(r=>keys.includes(r)):[],cur=$('om-re-ro')?$('om-re-ro').value:'',keep=cur&&regs.includes(cur);
  box.innerHTML=regionFields('om-re',regs,keep?cur:'',keep?pickedSAs('om-re-sa'):[]);
}
function openRegionalEdit(u){
  const x=orderUsers().find(o=>o.username===u);if(!x)return;
  const sup=OM.kind==='admin',ov=$('om-overlay');
  ov.innerHTML=`<div class="om-box om-bulk"><h3>Edit Regional Officer — ${esc(x.username)}</h3>
    <div class="om-grid om-grid3" style="margin-top:12px">
      <div class="field"><label>Full name</label><input type="text" id="om-re-name" maxlength="60" value="${esc(x.label)}"></div>
      <div class="field"><label>Username</label><input type="text" id="om-re-user" maxlength="40" value="${esc(x.username)}" autocomplete="off"></div>
      <div class="field"><label>Password</label><div class="om-ro-note">Use <b>Reset password</b> in the list</div></div>
      <div class="field"><label>E-mail</label><input type="email" id="om-re-email" maxlength="80" value="${esc(x.email)}" autocomplete="off"></div>
      <div class="field"><label>Mobile</label><input type="text" id="om-re-mobile" maxlength="20" value="${esc(x.mobile)}" autocomplete="off"></div>
    </div><div class="om-hint">Changing the username keeps all their orders; they sign in with the new username and the same password.</div>
    ${sup?`<div class="om-grid om-grid3" style="margin-top:12px">
      <div class="field"><label>Organization</label><select id="om-re-org">${OM.hsuper?'':`<option value="rohan"${x.org==='rohan'?' selected':''}>Rohan Energy</option>`}<option value="hpcl"${x.org==='hpcl'?' selected':''}>HPCL</option></select></div>
      <div class="field" style="grid-column:span 2"><label>Works under (Zone Officer)</label><select id="om-re-parent">${zoOptions(x.org,x.createdBy)}</select></div>
    </div><div class="om-hint">To move this officer to the other organization, change the Organization and choose a Zone Officer of it. The organization always follows the Zone Officer.</div>`:''}
    <div class="om-regwrap" id="om-re-reg" style="margin-top:12px">${regionFields('om-re',regionsFor(x),x.ros[0]||'',x.salesAreas)}</div>
    ${x.username===OM.user?'':pagesBlock('re',{admin:false,org:x.org,level:'regional',hiddenPages:x.hiddenPages})}
    <div class="om-field-err" id="om-re-err"></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button><button class="btn-p" data-act="regional-edit-save" data-user="${esc(x.username)}">Save changes</button></div></div>`;
  ov.classList.add('show');
}
async function saveRegionalEdit(u){
  const err=$('om-re-err');err.textContent='';
  const label=$('om-re-name').value.trim(),ro=$('om-re-ro').value,sales_areas=pickedSAs('om-re-sa'),par=$('om-re-parent');
  if(!label){err.textContent='Enter a name.';return;}
  if(par&&!par.value){err.textContent='Choose the Zone Officer this officer works under.';return;}
  if(!ro){err.textContent='Choose the region.';return;}
  if(!sales_areas.length){err.textContent='Tick at least one sales area of '+roName(ro)+'.';return;}
  const nu=$('om-re-user').value.trim();
  if(!/^[A-Za-z0-9_]{1,40}$/.test(nu)){err.textContent='The username can only contain letters, numbers and underscores.';return;}
  const body={username:u,label,ro,sales_areas,email:$('om-re-email').value.trim(),mobile:$('om-re-mobile').value.trim()};
  const pg=pagesPicked('re');if(pg&&pg.error){err.textContent=pg.error;return;}if(pg)body.hidden_pages=pg.hidden;
  if(nu!==u)body.new_username=nu;
  if(par)body.parent=par.value;
  try{
    await authPost('update_regional_officer',body);
    renamedOpen(u,nu);closeModal();toast('Regional Officer updated');refreshUsers();
  }catch(e){err.textContent=e.message;}
}

/* ── Regional Officer report: every order a Regional Officer handles - placed by them, approved / rejected by them, and (HPCL) every Rohan order in their region + sales areas -
   as pending, on the way, completed, rejected, and where (region, sales areas).
   Zone Officer: the Regional Officers they made. Super Admin: every Zone Officer's team. Only submitted orders count (drafts are private). The server builds it. ── */
function rrFilters(){return OM.filters.roreport||(OM.filters.roreport={from:'',to:'',month:'',org:'',zone:'',q:''});}
async function renderRoReport(){
  const sec=$('tab-roreport');if(!sec)return;
  sec.innerHTML='<div class="om-empty">Loading…</div>';
  try{await ensureMeta();await loadRoReport(true);}
  catch(e){sec.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load the report: ${esc(e.message)}</div>`;}
}
let _rrSeq=0;
async function loadRoReport(first){
  const f=rrFilters(),p={action:'ro_report'},seq=++_rrSeq;
  if(f.from)p.from=f.from;if(f.to)p.to=f.to;
  const j=await omGet(p);
  if(seq!==_rrSeq||OM.current!=='roreport')return;
  OM.roRep=j;drawRoReport();
}
const rrNum=(v,c)=>`<span class="${v?c:'om-rr-z'}">${fmtN(v)}</span>`;
const rrPct=t=>t.total?Math.round(t.completed*100/t.total)+'%':'—';
const rrCells=t=>`<td class="om-num">${fmtN(t.total)}</td><td class="om-num">${rrNum(t.pending,'om-rr-p')}</td><td class="om-num">${rrNum(t.transit,'om-rr-t')}</td><td class="om-num">${rrNum(t.completed,'om-rr-c')}</td><td class="om-num">${rrNum(t.rejected,'om-rr-r')}</td>`;
const RR_HEAD=['Orders','Pending','In transit','Completed','Rejected'];
function rrMonthRange(v){const m=/^(\d{4})-(\d{2})$/.exec(v);if(!m)return['',''];const last=new Date(+m[1],+m[2],0).getDate();return[v+'-01',v+'-'+String(last).padStart(2,'0')];}
function rrMatch(g,o,q){return !q||[g.label,g.username,o.label,o.username,roName(o.region||''),...(o.sales_areas||[]),...o.by_sales_area.map(d=>d.sales_area),...(o.orders||[]).flatMap(x=>[x.ref,x.outlet,x.sap,x.inv_no,x.so_no])].some(x=>String(x||'').toLowerCase().includes(q));}
const RR_ST={pending:['Pending','om-rr-p'],transit:['In transit','om-rr-t'],completed:['Completed','om-rr-c'],rejected:['Rejected','om-rr-r']};
const rrMoney=n=>n==null?'—':money2(n);
/* one order of a Regional Officer: the summary row, and under it (opened with ▸) every detail of the order */
function rrOrderRows(x){
  const st=RR_ST[x.stage]||[x.stage,''];
  const amt=x.unpriced&&!x.items.some(i=>i.amount!=null)?'—':`${money2(x.total)}${x.est?'<span class="om-sub" title="Price not fixed yet: current list price"> est.</span>':''}`;
  const tl=(k,v,sub)=>v?`<div><div class="k">${k}</div><div class="v">${v}${sub?`<div class="om-sub">${sub}</div>`:''}</div></div>`:'';
  const lines=x.items.length?`<div class="om-rrl"><table class="om-mini"><thead><tr><th>Item</th><th class="om-num">Qty (EA)</th><th class="om-num">Litres</th><th class="om-num">Rate (₹/EA)</th><th class="om-num">Amount (₹)</th><th class="om-num">GST</th><th class="om-num">GST (₹)</th><th class="om-num">Line total (₹)</th></tr></thead><tbody>
      ${x.items.map(i=>`<tr><td>${esc(i.item)}</td><td class="om-num">${fmtN(i.ea)}</td><td class="om-num">${fmtN(i.vol)}</td><td class="om-num">${rrMoney(i.rate)}${i.est?'*':''}</td><td class="om-num">${rrMoney(i.amount)}</td><td class="om-num">${i.gst==null?'—':fmtN(i.gst)+'%'}</td><td class="om-num">${rrMoney(i.gst_amount)}</td><td class="om-num">${i.amount==null?'—':money2(i.amount+i.gst_amount)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="om-num">${fmtN(x.ea)}</td><td class="om-num">${fmtN(x.litres)}</td><td></td><td class="om-num">${money2(x.taxable)}</td><td></td><td class="om-num">${money2(x.gst_amount)}</td><td class="om-num">${money2(x.total)}</td></tr></tbody></table></div>${x.est?'<div class="om-sub" style="margin-top:4px">* Price not fixed on the order yet (it is pending): the current list price is shown.</div>':''}`:'<div class="om-sub">No items</div>';
  return `<tr class="om-rro"><td><button class="om-rr-x" data-act="rr-ord" title="Show every detail of this order">▸</button> <b>${esc(x.ref)}</b><div class="om-sub">${esc(x.type)}</div></td>
      <td>${fmtDS(x.date)}</td>
      <td class="om-out"><b>${esc(x.outlet)}</b><div class="om-sub">${esc(x.sap)} · ${esc(x.sales_area||x.district)}</div></td>
      <td class="om-num">${fmtN(x.ea)}</td><td class="om-num">${fmtN(x.litres)}</td><td class="om-num">${amt}</td>
      <td><span class="${st[1]}">${st[0]}</span></td>
      <td>${x.inv_no?`<b>${esc(x.inv_no)}</b><div class="om-sub">${fmtDS(x.inv_date)}</div>`:x.tax_inv&&x.status==='approved'?`<span class="om-sub">${esc(x.inv_mode)} · no number</span>`:'<span class="om-sub">—</span>'}</td>
      <td>${x.dispatch_at?fmtDS(x.dispatch_at):'<span class="om-sub">—</span>'}</td>
      <td>${x.delivered_at?fmtDS(x.delivered_at):'<span class="om-sub">—</span>'}</td>
      <td>${esc(x.decided_by)||'<span class="om-sub">—</span>'}${x.decided_at?`<div class="om-sub">${fmtDS(x.decided_at)}</div>`:''}</td></tr>
    <tr class="om-rro-d" hidden><td colspan="11"><div class="om-rro-box">
      <div class="om-dl">${tl('Outlet',esc(x.outlet),esc(x.address))}${tl('SAP code',esc(x.sap),x.gstin?'GSTIN '+esc(x.gstin):'')}${tl('Region / District',esc(roName(x.ro))+' / '+esc(x.district),esc(x.state)+(x.sales_area?' · '+esc(x.sales_area):''))}
        ${tl('Sales Order no.',esc(x.so_no))}${tl('Tax Invoice no.',esc(x.inv_no)||(x.tax_inv?esc(x.inv_mode)+' (no number)':''),x.inv_date?'dated '+fmtDate(x.inv_date):'')}
        ${tl('Placed by',esc(x.placed_by),fmtDT(x.placed_at))}${tl('Submitted',fmtDT(x.submitted_at))}${tl(x.status==='rejected'?'Rejected by':'Approved by',esc(x.decided_by),fmtDT(x.decided_at))}
        ${tl(x.status==='rejected'?'Reason for rejection':'Approval comment',esc(x.comment))}${tl('Payment receipt uploaded',fmtDT(x.receipt_at))}${tl('Dispatched (in transit)',fmtDT(x.dispatch_at))}
        ${tl('Proof of Delivery uploaded',fmtDT(x.pod_at))}${tl('Delivery confirmed',fmtDT(x.delivered_at))}${tl('Remarks',esc(x.remarks))}</div>${lines}${x.status==='approved'&&x.so_no?`<div class="om-acts" style="margin-top:10px"><button class="om-btn so" data-act="so" data-doc="so" data-id="${x.id}">Sales Order</button>${x.tax_inv&&x.inv_mode!=='manual'?`<button class="om-btn so" data-act="so" data-doc="invoice" data-id="${x.id}">Tax Invoice</button>`:''}</div>`:''}</div></td></tr>`;
}
function rrOrdersTable(o){
  if(!o.orders||!o.orders.length)return '<div class="om-empty">No orders in this period.</div>';
  return `<div class="tw"><table class="om-rrord"><thead><tr><th>Order</th><th>Date</th><th>Outlet</th><th class="om-num">Qty (EA)</th><th class="om-num">Litres</th><th class="om-num">Amount (₹, incl. GST)</th><th>Status</th><th>Tax Invoice</th><th>Dispatched</th><th>Delivered</th><th>Decided by</th></tr></thead><tbody>${o.orders.map(rrOrderRows).join('')}</tbody></table></div>`;
}
function drawRoReport(){
  const sec=$('tab-roreport'),D=OM.roRep;if(!sec||!D)return;
  const f=rrFilters(),isA=OM.kind==='admin',q=(f.q||'').toLowerCase().trim();
  const card=(cls,lbl,val,sub)=>`<div class="mc ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub||'&nbsp;'}</div></div>`;
  const zones=[...new Set([].concat(...D.groups.map(g=>g.zones&&g.zones.length?g.zones:[g.zone])).filter(Boolean))].sort();
  const shown=D.groups.filter(g=>(!f.org||g.org===f.org)&&(!f.zone||(g.zones||[g.zone]).includes(f.zone)))
    .map(g=>Object.assign({},g,{officers:g.officers.filter(o=>rrMatch(g,o,q))})).filter(g=>!q||g.officers.length);
  const groups=isA?shown.filter(g=>g.officers.length):shown;   // the Super Admin only gets the teams that exist; the Zone Officers without a Regional Officer are named at the end
  const noTeam=isA&&!q?shown.filter(g=>!g.officers.length):[];
  const all=groups.reduce((a,g)=>{g.officers.forEach(o=>{['total','pending','transit','completed','rejected','litres','amount'].forEach(k=>a[k]+=o.totals[k]||0);a.n++;});return a;},{n:0,total:0,pending:0,transit:0,completed:0,rejected:0,litres:0,amount:0});
  const bar=`<div class="filter-bar" id="om-rr-bar">
      <div class="fg"><label>Month</label><select id="om-rr-month">${monthOptions(f.month)}</select></div>
      <div class="fg"><label>Orders from</label><input type="date" id="om-rr-from" value="${esc(f.from)}"></div>
      <div class="fg"><label>to</label><input type="date" id="om-rr-to" value="${esc(f.to)}"></div>
      ${isA?`<div class="fg"${OM.hsuper?' style="display:none"':''}><label>Organization</label><select id="om-rr-org"><option value="">All</option><option value="rohan"${f.org==='rohan'?' selected':''}>Rohan Energy</option><option value="hpcl"${f.org==='hpcl'?' selected':''}>HPCL</option></select></div>
      <div class="fg"><label>Zone</label><select id="om-rr-zone"><option value="">All</option>${zones.map(z=>`<option${f.zone===z?' selected':''}>${esc(z)}</option>`).join('')}</select></div>`:''}
      <div class="fg"><label>Search</label><input type="text" class="filter-search" id="om-rr-q" value="${esc(f.q)}" placeholder="Officer, region, sales area…" autocomplete="off"></div>
      <div class="fg om-rr-btns"><button class="btn-g" data-act="rr-reset">Reset</button><button class="btn-p" data-act="rr-xlsx"${all.n?'':' disabled'}>⬇ Download Excel</button></div></div>`;
  const period=D.from||D.to?`Orders dated ${D.from?fmtDate(D.from):'the start'} – ${D.to?fmtDate(D.to):'today'}`:'All orders so far';
  const totals=`<div class="metrics">${card('bl','Regional Officers',fmtN(all.n),period)}${card('gy','Orders handled',fmtN(all.total),fmtN(all.litres)+' L · ₹'+money2(all.amount))}${card('am','Pending',fmtN(all.pending),'Waiting for approval')}${card('bl','In transit',fmtN(all.transit),'Approved, not yet delivered')}${card('gr','Completed',fmtN(all.completed),'Delivery confirmed')}${card('rd','Rejected',fmtN(all.rejected),'')}</div>`;
  const body=groups.map(g=>{
    const T=g.officers.reduce((a,o)=>{['total','pending','transit','completed','rejected','litres','amount'].forEach(k=>a[k]+=o.totals[k]||0);return a;},{total:0,pending:0,transit:0,completed:0,rejected:0,litres:0,amount:0});
    const rows=g.officers.map(o=>`<tr><td class="om-out"><b>${esc(o.label)}</b><div class="om-sub">${esc(o.username)}</div></td><td class="om-rr-i">${esc(roName(o.region||'')||'—')}</td><td class="om-wrap om-rr-i">${rrDistText(o)}</td>${rrCells(o.totals)}<td class="om-num om-rr-d1">${rrPct(o.totals)}</td><td class="om-num om-rr-d2">${fmtN(o.totals.litres)}</td><td class="om-num om-rr-d2">${money2(o.totals.amount||0)}</td><td class="om-rr-d2">${o.totals.last?fmtDS(o.totals.last):'—'}${o.totals.pending&&o.totals.oldest?`<div class="om-sub">oldest pending ${fmtDS(o.totals.oldest)}</div>`:''}</td><td class="om-rr-d2"><button class="btn-g om-rr-dl" data-act="rr-xlsx-one" data-u="${esc(o.username)}" title="Download ${esc(o.label)}'s report with every order">⬇ Excel</button></td></tr>`).join('');
    const foot=g.officers.length>1?`<tfoot><tr><td colspan="3"><b>Total — ${g.officers.length} Regional Officers</b></td><td class="om-num"><b>${fmtN(T.total)}</b></td><td class="om-num"><b>${fmtN(T.pending)}</b></td><td class="om-num"><b>${fmtN(T.transit)}</b></td><td class="om-num"><b>${fmtN(T.completed)}</b></td><td class="om-num"><b>${fmtN(T.rejected)}</b></td><td class="om-num"><b>${rrPct(T)}</b></td><td class="om-num"><b>${fmtN(T.litres)}</b></td><td class="om-num"><b>${money2(T.amount)}</b></td><td></td><td></td></tr></tfoot>`:'';
    const detail=g.officers.map((o,i)=>`<details class="om-rrd"${g.officers.length===1||q?' open':''}><summary><b>${esc(o.label)}</b> <span class="om-sub">· ${esc(roName(o.region||'')||'—')} · ${o.sales_areas.length+' sales area'+(o.sales_areas.length===1?'':'s')} · ${fmtN(o.totals.total)} order${o.totals.total===1?'':'s'}, ${fmtN(o.totals.completed)} completed, ${fmtN(o.totals.pending)} pending</span></summary>
        <div class="om-rrsec"><div class="om-sapsec">Orders — every detail</div><button class="btn-p om-rr-dl" data-act="rr-xlsx-one" data-u="${esc(o.username)}">⬇ Download ${esc(o.label)}'s report (Excel)</button></div>
        ${rrOrdersTable(o)}
        <div class="om-rrsec"><div class="om-sapsec">Orders by sales area (SA)</div></div>
        ${o.by_sales_area.length?`<table class="om-rrtab"><thead><tr><th>Sales area (SA)</th>${RR_HEAD.map(h=>`<th class="om-num">${h}</th>`).join('')}<th class="om-num">Litres</th></tr></thead><tbody>${o.by_sales_area.map(d=>`<tr><td class="om-out"><b>${esc(d.sales_area||'—')}</b>${d.ro&&d.ro!==o.region?`<div class="om-sub">${esc(roName(d.ro))}</div>`:''}</td>${rrCells(d)}<td class="om-num om-rr-i">${fmtN(d.litres)}</td></tr>`).join('')}</tbody></table>`:'<div class="om-empty">No sales areas assigned.</div>'}</details>`).join('');
    return `<div class="tc om-rrg"><div class="th"><h3>${esc(g.label)} <span class="om-chip om-chip-${esc(g.org)}">${esc(ORG_LBL[g.org]||g.org)}</span></h3>
        <span class="om-sub">Zone Officer · ${esc(g.sheet_zone||g.zone)}${g.sheet_zone&&g.zone&&isA?' ('+esc(g.zone)+')':''}${g.own.total?` · placed ${fmtN(g.own.total)} order${g.own.total===1?'':'s'} themselves (not counted below)`:''}</span></div>
      ${g.officers.length?`<div class="tw"><table class="om-rrtab om-rr"><thead><tr><th>Regional Officer</th><th>Region</th><th>Sales areas</th>${RR_HEAD.map(h=>`<th class="om-num">${h}</th>`).join('')}<th class="om-num">Done</th><th class="om-num">Litres</th><th class="om-num">Amount (₹)</th><th>Last order</th><th>Report</th></tr></thead><tbody>${rows}</tbody>${foot}</table></div>
      <div class="om-rrdet"><div class="om-sapsec">Locations — orders by sales area (SA)</div>${detail}</div>`
      :`<div class="om-empty">${q?'No match.':'No Regional Officers yet. '+(isA?'':'Add them from the “Regional Officers” tab.')}</div>`}</div>`;
  }).join('');
  sec.innerHTML=`${totals}${bar}${body||'<div class="om-empty">Nothing to show for this selection.</div>'}${noTeam.length?`<p class="om-sub" style="margin:10px 2px">No Regional Officers yet: ${noTeam.map(g=>esc(g.label)+' ('+esc(ORG_LBL[g.org]||g.org)+')').join(', ')}.</p>`:''}`;
  rrLabels(sec);
  const re=()=>{drawRoReport();};
  const ci=id=>{const el=$(id);if(el)el.addEventListener('change',()=>{f[id.slice(6)]=el.value;re();});};
  ci('om-rr-org');ci('om-rr-zone');
  const dateChange=()=>{f.from=$('om-rr-from').value;f.to=$('om-rr-to').value;f.month='';loadRoReport().catch(e=>toast('Error: '+e.message,'er'));};
  $('om-rr-from').addEventListener('change',dateChange);$('om-rr-to').addEventListener('change',dateChange);
  $('om-rr-month').addEventListener('change',e=>{f.month=e.target.value;[f.from,f.to]=rrMonthRange(f.month);loadRoReport().catch(er=>toast('Error: '+er.message,'er'));});
  const qi=$('om-rr-q');qi.addEventListener('input',()=>{f.q=qi.value;const pos=qi.selectionStart;drawRoReport();const n=$('om-rr-q');if(n){n.focus();n.setSelectionRange(pos,pos);}});
}
/* phones: the column heading goes in front of every value (data-label), see orders.css */
function rrLabels(root){
  root.querySelectorAll('table.om-rrtab').forEach(t=>{
    const hs=[...t.querySelectorAll('thead th')].map(th=>th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>td.setAttribute('data-label',hs[i]||'')));
  });
}
function rrDistText(o){
  const d=o.sales_areas||[];if(!d.length)return '<span class="om-sub">—</span>';
  return `<span title="${esc(d.join(', '))}">${d.slice(0,3).map(esc).join(', ')}${d.length>3?` <span class="om-sub">+ ${d.length-3} more</span>`:''}</span>`;
}
/* Excel of the report. No argument: every Regional Officer on screen. With a username: that officer alone. Sheets: Regional Officers (summary), Orders (one row per order, every detail),
   Order items (one row per product line with rate, GST and amount), By sales area. */
const xDate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||'');return m?`${m[3]}-${m[2]}-${m[1]}`:'';};
const xDT=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s||'');return m?`${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}`:xDate(s);};
async function rrDownload(only){
  const D=OM.roRep;if(!D)return;
  try{await ensureXlsx();}catch(e){toast('Could not load the Excel tool: '+e.message,'er');return;}
  const f=rrFilters(),q=(f.q||'').toLowerCase().trim();
  const sum=[['Zone Officer','Organization','Zone','Regional Officer','Username','Region','Sales areas handled','Orders handled','Pending','In transit','Completed','Rejected','Completed %','Litres','Amount before GST (₹)','Amount incl. GST (₹)','Completed litres','Last order','Oldest pending since']];
  const det=[['Zone Officer','Regional Officer','Region','Sales area (SA)','Orders handled','Pending','In transit','Completed','Rejected','Litres','Completed litres']];
  const ord=[['Regional Officer','Order no.','Order date','Order type','Status','Outlet','SAP code','Region','District','State','Sales area','Outlet address','Outlet GSTIN','Placed by','Placed on','Submitted on','Decided by','Decided on','Approval comment / rejection reason','Products','Qty (EA)','Litres','Amount before GST (₹)','GST (₹)','Total incl. GST (₹)','Price basis','Sales Order no.','Tax Invoice no.','Tax Invoice date','Tax Invoice type','Payment receipt uploaded','Dispatched (in transit)','Proof of Delivery uploaded','Delivery confirmed','Remarks']];
  const itm=[['Regional Officer','Order no.','Order date','Status','Outlet','SAP code','District','Product','Qty (EA)','Litres','Rate (₹/EA)','Amount before GST (₹)','GST %','GST (₹)','Line total (₹)','Price basis']];
  let names=[];
  D.groups.filter(g=>only||((!f.org||g.org===f.org)&&(!f.zone||(g.zones||[g.zone]).includes(f.zone)))).forEach(g=>g.officers.filter(o=>only?o.username===only:rrMatch(g,o,q)).forEach(o=>{
    const t=o.totals;names.push(o.label);
    sum.push([g.label,ORG_LBL[g.org]||g.org,g.sheet_zone||g.zone,o.label,o.username,roName(o.region||''),(o.sales_areas||[]).join(', '),t.total,t.pending,t.transit,t.completed,t.rejected,t.total?Math.round(t.completed*100/t.total):0,t.litres,t.taxable||0,t.amount||0,t.completed_litres,xDate(t.last),xDate(t.oldest)]);
    o.by_sales_area.forEach(d=>det.push([g.label,o.label,roName(d.ro||o.region||''),d.sales_area,d.total,d.pending,d.transit,d.completed,d.rejected,d.litres,d.completed_litres]));
    (o.orders||[]).forEach(x=>{
      const basis=x.unpriced&&!x.items.some(i=>i.amount!=null)?'Not priced':x.est?'List price (estimate)':'Fixed on order';
      const st=(RR_ST[x.stage]||[x.stage])[0];
      ord.push([o.label,x.ref,xDate(x.date),x.type,st,x.outlet,x.sap,roName(x.ro),x.district,x.state,x.sales_area,x.address,x.gstin,x.placed_by,xDT(x.placed_at),xDT(x.submitted_at),x.decided_by,xDT(x.decided_at),x.comment,
        x.items.map(i=>`${i.item} × ${i.ea} EA`).join('; '),x.ea,x.litres,x.taxable,x.gst_amount,x.total,basis,x.so_no,x.inv_no||(x.tax_inv&&x.status==='approved'?'(no number)':''),xDate(x.inv_date),x.inv_mode,xDT(x.receipt_at),xDT(x.dispatch_at),xDT(x.pod_at),xDT(x.delivered_at),x.remarks]);
      x.items.forEach(i=>itm.push([o.label,x.ref,xDate(x.date),st,x.outlet,x.sap,x.district,i.item,i.ea,i.vol,i.rate==null?'':i.rate,i.amount==null?'':i.amount,i.gst==null?'':i.gst,i.gst_amount==null?'':i.gst_amount,i.amount==null?'':Math.round((i.amount+i.gst_amount)*100)/100,i.rate==null?'Not priced':i.est?'List price (estimate)':'Fixed on order']));
    });
  }));
  if(!names.length){toast('Nothing to download for this selection.','er');return;}
  const wb=XLSX.utils.book_new();
  const mk=(rows,w,name)=>{const s=XLSX.utils.aoa_to_sheet(rows);s['!cols']=w.map(x=>({wch:x}));XLSX.utils.book_append_sheet(wb,s,name);};
  mk(sum,[22,13,20,22,18,18,40,10,9,10,10,9,11,10,16,16,14,12,16],'Regional Officers');
  mk(ord,[22,15,12,18,12,28,11,16,14,12,18,40,18,18,17,17,18,17,30,40,9,9,14,12,14,18,16,16,13,12,17,17,17,17,25],'Orders');
  mk(itm,[22,15,12,12,28,11,14,22,9,9,11,14,7,11,13,18],'Order items');
  mk(det,[22,22,18,26,10,9,10,10,9,10,14],'By sales area');
  const period=D.from||D.to?` ${D.from||'start'} to ${D.to||'today'}`:'';
  const who=only&&names.length===1?names[0].replace(/[\/:*?"<>|]/g,'').trim():'';
  XLSX.writeFile(wb,(who?'Regional Officer report - '+who:'Regional Officer report')+period+'.xlsx');
}

/* one-time conversion of Regional Officers made with districts (see auth.php convert_to_sales_areas) */
async function convertSAs(){
  try{
    const j=await authPost('convert_to_sales_areas',{});
    toast(`${j.converted} Regional Officer${j.converted===1?'':'s'} converted`+(j.left?` — ${j.left} could not be placed and need their sales areas ticked by hand (Edit)`:''));
    refreshUsers();
  }catch(e){toast('Could not convert: '+e.message,'er');}
}

/* Super admin: Zone Officers (and an overview of every Regional Officer under them) */
async function renderZones(keep){
  const sec=$('tab-zones');if(!sec)return;
  if(!keep)sec.innerHTML='<div class="om-empty">Loading…</div>';   // keep = a refresh after a change: leave the page as it is so the scroll position stays
  try{
    await ensureMeta();
    const [j]=await Promise.all([authGet('list_users'),ensureSalesAreas(true)]);
    OM.users=j.users;
  }catch(e){sec.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load users: ${esc(e.message)}</div>`;return;}
  if(OM.current!=='zones')return;
  drawZones();
}
/* regions of a Zone Officer in a few words */
const regLine=u=>{const r=u.ros||[];if(!r.length)return 'Whole zone';return r.length<=3?r.map(roName).join(', '):r.length+' regions';};
const orgShort=o=>o==='rohan'?'Rohan':'HPCL';
/* Users & Zones: every Zone Officer with the Regional Officers working under them. A group opens with ▸ (and opens by itself when a search finds a Regional Officer inside it). */
function drawGroups(){
  const box=$('om-ug-list');if(!box)return;
  const f=OM.filters.zones||(OM.filters.zones={org:'',zone:'',q:''}),q=(f.q||'').toLowerCase().trim(),open=OM.ugOpen||(OM.ugOpen=new Set());
  const all=orderUsers(),zos=all.filter(u=>u.level==='zone'),ros=all.filter(u=>u.level==='regional');
  const kidsOf={};ros.forEach(r=>{(kidsOf[r.createdBy]=kidsOf[r.createdBy]||[]).push(r);});
  const has=(u,...x)=>[u.label,u.username,u.email,u.mobile,...x].some(v=>String(v||'').toLowerCase().includes(q));
  const orgOk=u=>!f.org||u.org===f.org,zoneOk=u=>!f.zone||zonesOf(u).includes(f.zone);
  const hasR=r=>has(r,roName(r.ros[0]||''),...(r.salesAreas||[]));
  const groups=zos.filter(z=>orgOk(z)&&zoneOk(z)).map(z=>{
    const kids=(kidsOf[z.username]||[]).slice().sort((a,b)=>roName(a.ros[0]||'').localeCompare(roName(b.ros[0]||''))||a.label.localeCompare(b.label));
    const self=!q||has(z,regLine(z));
    return {z,kids,self,shown:self?kids:kids.filter(hasR)};
  }).filter(g=>g.self||g.shown.length).sort((a,b)=>(a.z.org===b.z.org?0:a.z.org==='hpcl'?-1:1)||a.z.label.localeCompare(b.z.label));
  const zset=new Set(zos.map(z=>z.username));
  const orph=ros.filter(r=>!zset.has(r.createdBy)&&orgOk(r)&&zoneOk(r)&&(!q||hasR(r)));
  const roTable=list=>`<div class="tw"><table class="om-ucards"><thead><tr><th>Name</th><th>Username</th><th>Region</th><th>Sales areas (SA)</th><th>Contact</th><th>Password</th><th>Actions</th></tr></thead><tbody>${list.map(u=>`<tr><td><b>${esc(u.label)}</b></td><td>${esc(u.username)}</td><td>${esc(roName(u.ros[0]||''))}</td><td>${saText(u)}</td><td>${contactCell(u)}</td><td>${pwCell(u)}</td><td>${userActs(u)}</td></tr>`).join('')}</tbody></table></div>`;
  const html=groups.map(g=>{
    const z=g.z,isOpen=open.has(z.username)||(!!q&&!g.self&&g.shown.length>0);
    return `<div class="om-ug${isOpen?' open':''}"><div class="om-ugh">
      <button type="button" class="om-ugt" data-act="ug-toggle" data-user="${esc(z.username)}" aria-expanded="${isOpen}" title="Show / hide the Regional Officers">${isOpen?'▾':'▸'}</button>
      <div class="om-ugi" data-act="ug-toggle" data-user="${esc(z.username)}"><div><b>${esc(z.label)}</b> <span class="om-ugu">@${esc(z.username)}</span> <span class="om-chip om-chip-${z.org}">${esc(orgShort(z.org))}</span></div>
        <div class="om-sub">${esc(zoneLine(z)||z.zone)} · ${esc(regLine(z))}${z.email||z.mobile?' · '+[z.email,z.mobile].filter(Boolean).map(esc).join(' · '):''}</div></div>
      <div class="om-ugn" data-act="ug-toggle" data-user="${esc(z.username)}"><b>${g.kids.length}</b><span> Regional Officer${g.kids.length===1?'':'s'}</span></div>
      <div class="om-ugp">${pwCell(z)}</div>
      ${userActs(z,true)}</div>
      ${isOpen?`<div class="om-ugb">${g.shown.length?roTable(g.shown):`<div class="om-empty">${g.kids.length?'No Regional Officer matches the search.':'No Regional Officers under this Zone Officer yet.'}</div>`}</div>`:''}</div>`;
  }).join('');
  const orphHtml=orph.length?`<div class="om-ug open"><div class="om-ugh"><div class="om-ugi"><div><b>Regional Officers without a Zone Officer</b></div><div class="om-sub">Open each one with Edit and choose the Zone Officer they work under</div></div><div class="om-ugn"><b>${orph.length}</b><span> Regional Officer${orph.length===1?'':'s'}</span></div></div><div class="om-ugb">${roTable(orph)}</div></div>`:'';
  const nKids=groups.reduce((n,g)=>n+g.shown.length,0)+orph.length;
  box.innerHTML=(html||orphHtml)?html+orphHtml:'<div class="om-empty">No Zone Officers match. Add a Rohan Energy or HPCL Zone Officer above, or clear the filters.</div>';
  const t=$('om-ug-title');if(t)t.textContent=`Zone Officers (${groups.length}) and their Regional Officers (${nKids})`;
  const sm=$('om-ug-sum');
  if(sm)sm.innerHTML=['hpcl','rohan'].map(o=>{const nz=zos.filter(u=>u.org===o).length,nr=ros.filter(u=>u.org===o).length;return nz||nr?`<span class="om-ugs"><span class="om-chip om-chip-${o}">${o==='rohan'?'Rohan Energy':'HPCL'}</span> ${nz} Zone Officer${nz===1?'':'s'} · ${nr} Regional Officer${nr===1?'':'s'}</span>`:'';}).join('');
  labelCells(box);
}
function drawZones(){
  const sec=$('tab-zones');if(!sec)return;
  const zones=Object.keys(OM.meta.zones);
  const all=orderUsers();
  const zos=all.filter(u=>u.level==='zone'),ros=all.filter(u=>u.level==='regional');
  const cards=zones.map(z=>{
    const us=zos.filter(u=>zonesOf(u).includes(z)).sort((a,b)=>(a.org===b.org?0:a.org==='hpcl'?-1:1)||a.label.localeCompare(b.label));
    const nR=ros.filter(u=>zonesOf(u).includes(z)).length;
    const hasH=all.some(u=>zonesOf(u).includes(z)&&u.org==='hpcl'),hasR=all.some(u=>zonesOf(u).includes(z)&&u.org==='rohan');
    return `<div class="om-zc"><div class="om-zh"><b>${esc(z)}</b><span class="om-count">${us.length} Zone Officer${us.length===1?'':'s'}${nR?` · ${nR} Regional`:''}</span></div>
      ${us.slice(0,5).map(u=>`<div class="om-zrow"><span class="om-chip om-chip-${u.org}">${ORG_LBL[u.org]==='Rohan Energy'?'Rohan':'HPCL'}</span><b>${esc(u.label)}</b><span class="om-sub">· ${esc(zoneLine(u)||u.zone)}</span></div>`).join('')}
      ${us.length>5?`<div class="om-zrow"><span class="om-sub">+ ${us.length-5} more — see the table below</span></div>`:''}
      ${hasH?'':'<div class="om-zrow warn">⚠ No HPCL officer mapped — orders from this zone cannot be submitted</div>'}
      ${hasR||OM.hsuper?'':'<div class="om-zrow warn">No Rohan Energy officer mapped</div>'}</div>`;
  }).join('');
  const f=OM.filters.zones||(OM.filters.zones={org:'',zone:'',q:''});
  const q=(f.q||'').toLowerCase().trim();
  const noSA=ros.filter(u=>!u.salesAreas.length).length;   // Regional Officers made before sales areas replaced districts
  const convNote=noSA?`<div class="om-note warn"><b>${noSA} Regional Officer${noSA===1?' has':'s have'} no sales areas (SA) yet</b> — made when officers were given districts, and cannot work on orders until they have sales areas. <button type="button" class="btn-p" data-act="sa-convert" style="margin-left:8px">Convert them now</button><div class="om-sub" style="margin-top:4px">Each one gets the sales area named in the Excel they were imported from, or the sales areas of their old districts, or the whole region if they had the whole region. An officer whose old districts match no sales area stays as they are — open them with <b>Edit</b> and tick their sales areas.</div></div>`:'';
  sec.innerHTML=`${convNote}<div class="as"><h3>Zone mapping</h3><p class="om-psub">Each zone needs at least one HPCL approving officer and one or more Rohan Energy officers. Orders are routed by zone.</p><div class="om-zgrid">${cards}</div></div>
    <div class="as"><h3>Add Zone Officer</h3><p class="om-psub">A Zone Officer handles a whole zone for Rohan Energy or HPCL, and can then create the <b>Regional Officers</b> (one region + its sales areas) under them. Set a username and password and choose the organisation and zone. Share the credentials with the user yourself. They can change their own password later; you will see the new one in the table and can replace it at any time.</p>
      <div class="om-grid om-grid5">
        <div class="field"><label>Full name</label><input type="text" id="om-nu-name" maxlength="60" placeholder="e.g. Rahul Verma" autocomplete="off"></div>
        <div class="field"><label>Username</label><input type="text" id="om-nu-user" maxlength="40" placeholder="letters, numbers, _" autocomplete="off"></div>
        <div class="field"><label>Password</label>${pwBox('om-nu-pass','Min 8 characters')}</div>
        <div class="field"><label>Organization</label><select id="om-nu-org">${OM.hsuper?'':'<option value="rohan">Rohan Energy</option>'}<option value="hpcl">HPCL</option></select></div>
        <div class="field"><label>Level</label><select disabled><option>Zone Officer</option></select></div>
      </div>
      <div class="field om-zfield"><label>Zones &amp; regions *</label>${zonePicker('om-nu',[])}<div class="om-hint">Tick every zone this officer covers — you can pick more than one. Untick a region to leave it out (for example, a manager who handles one region only).</div></div>
      <div class="om-form-actions"><button class="btn-p" data-act="user-add">+ Create Zone Officer</button><span class="om-field-err" id="om-nu-err"></span></div></div>
    <div class="as" id="om-ra-box"><h3>Add Regional Officer</h3><p class="om-psub">Create a Regional Officer under any Zone Officer. They get that officer's organisation and zone, <b>one region</b> of it and the <b>sales areas (SA)</b> you tick. They appear in the Zone Officer's own “Regional Officers” list too.</p>
      ${zos.length?`<div class="om-grid om-grid4">
        <div class="field"><label>Zone Officer *</label><select id="om-ra-parent"><option value="">Select Zone Officer…</option>${zos.slice().sort((a,b)=>(a.org===b.org?0:a.org==='hpcl'?-1:1)||a.label.localeCompare(b.label)).map(z=>`<option value="${esc(z.username)}"${z.username===OM.raParent?' selected':''}>${esc(z.label)} — ${esc(ORG_LBL[z.org]==='Rohan Energy'?'Rohan':'HPCL')} · ${esc(sheetZoneOf(z)||z.zone)}</option>`).join('')}</select></div>
        <div class="field"><label>Full name</label><input type="text" id="om-ra-name" maxlength="60" placeholder="e.g. Rahul Verma" autocomplete="off"></div>
        <div class="field"><label>Username</label><input type="text" id="om-ra-user" maxlength="40" placeholder="letters, numbers, _" autocomplete="off"></div>
        <div class="field"><label>Password</label>${pwBox('om-ra-pass','Min 8 characters')}</div>
      </div>
      <div class="om-regwrap" id="om-ra-reg"></div>
      <div class="om-form-actions"><button class="btn-p" data-act="ro-add-admin">+ Create Regional Officer</button><span class="om-field-err" id="om-ra-err"></span></div>`:'<div class="om-empty">Add a Zone Officer first (above) — Regional Officers work under one.</div>'}</div>
    <div class="as" id="om-imp-box"></div>
    ${OM.hsuper?'':superAdminCards()}
    <div class="tc"><div class="th"><h3 id="om-ug-title">Zone Officers</h3><div class="om-hf">${OM.hsuper?'':`<label>Organization</label><select data-uf="org"><option value="">All</option><option value="rohan"${f.org==='rohan'?' selected':''}>Rohan Energy</option><option value="hpcl"${f.org==='hpcl'?' selected':''}>HPCL</option></select>`}<label>Zone</label><select data-uf="zone"><option value="">All</option>${zones.map(z=>`<option${f.zone===z?' selected':''}>${esc(z)}</option>`).join('')}</select><input type="search" id="om-user-q" placeholder="Search name, username, region, sales area…" value="${esc(f.q||'')}"><button type="button" class="om-btn" data-act="ug-all">Open all</button><button type="button" class="om-btn" data-act="ug-none">Close all</button></div></div>
      <div class="om-ugsum" id="om-ug-sum"></div>
      <div id="om-ug-list"></div></div>`;
  sec.querySelectorAll('[data-uf]').forEach(el=>el.addEventListener('change',()=>{f[el.dataset.uf]=el.value;drawGroups();}));
  const uq=$('om-user-q');
  if(uq)uq.addEventListener('input',()=>{f.q=uq.value;drawGroups();});
  drawGroups();
  labelCells(sec);
  drawRaRegion();
  zpSyncAll(sec);
  drawImport();
}
/* ── Import officers from the client's Excel sheet. The file is read in the browser; the server creates the accounts (usernames from the e-mail, generated passwords).
   Sheet "RM" (Regional Managers) = one Zone Officer per region; sheet "SO" (Sales Officers) = Regional Officers under the manager of their region. ── */
const IMP_LEVEL={zone:'Zone Officer',regional:'Regional Officer',skip:'Skip this sheet'};
function impState(){return OM.imp||(OM.imp={sheets:[],org:'hpcl',by:'sales_area',sent:[],prev:null,done:null,busy:false,err:''});}
/* the client's sheets spell some regions differently from the zone sheet (Bhatinda / Bathinda, Hisar / Hissar ...): both spellings find the same region */
const RO_ALIAS={bhatinda:'bathinda',bhubaneswar:'bhubaneshwar',hisar:'hissar',kozhikode:'kozhicode',nashik:'nasik',secunderabad:'secundrabad',visakhapatnam:'visakh',mahbubnagar:'mahaboobnagar',mahabubnagar:'mahaboobnagar'};
const roKey=t=>{const k=String(t||'').toLowerCase().replace(/\s*\b(retail|ret)\b.*$/,'').replace(/[^a-z]/g,'');return RO_ALIAS[k]||k;};
function regionFromText(t){
  const k=roKey(t);
  if(!k)return '';
  const sz=OM.meta.sheet_zones;
  for(const n of Object.keys(sz))for(const r of sz[n].ros)if(roKey(r)===k)return r;
  return '';
}
/* the zone sheets name zones in short form (EZ, NZ, SCZ, NWFZ (Jaipur Zone) ...): the portal zone each one means */
const ZONE_ALIAS={bhopal:'Bhopal Zone',bhubaneswar:'Bhubaneswar Zone',ez:'East Zone',east:'East Zone',cochin:'Cochin Zone',guwahati:'Guwahati Zone',patna:'Patna Zone',ncz:'North Central Retail',northcentralretail:'North Central Retail',northcentral:'North Central Retail',
  chandigarh:'Chandigarh Zone',nwfzjaipur:'Jaipur Zone',nwfz:'Jaipur Zone',jaipur:'Jaipur Zone',nwz:'North West Retail Zone',northwestretail:'North West Retail Zone',northwest:'North West Retail Zone',nz:'North Zone',north:'North Zone',
  scz:'South Central Retail',southcentralretail:'South Central Retail',southcentral:'South Central Retail',bengaluru:'Bengaluru Zone',bangalore:'Bengaluru Zone',sz:'South Zone',south:'South Zone',wz:'West Zone',west:'West Zone',noidaupw:'Noida (UP-West) Zone',noidaupwest:'Noida (UP-West) Zone',noida:'Noida (UP-West) Zone'};
function zoneFromText(t){
  let k=String(t||'').toLowerCase().replace(/[^a-z]/g,'');
  if(!k)return '';
  const z=ZONE_ALIAS[k]||ZONE_ALIAS[k.replace(/zone$/,'')]||'';
  return z&&OM.meta.sheet_zones[z]?z:'';
}
const impCase=s=>/[a-z]/.test(s)?s:s.toLowerCase().replace(/(^|[\s.'-])([a-z])/g,(m,a,b)=>a+b.toUpperCase());   // KUMARI RUCHI -> Kumari Ruchi (mixed-case names stay as typed)
/* the client's Sales Officer sheet has no Sales Area column: it is the end of the designation, before "S/A":
   "Area Sales Manager - Retail, Etah S/A" -> Etah;  "Sales Officer - Retail- Badaun S/A" -> Badaun;  "Sales Officer Retail- Sitapur Retail S/A" -> Sitapur Retail;  "Senior Manager - Retail Sales (COMCOs)" -> (none: the whole region) */
const saFromDesignation=t=>{
  const d=String(t||'').replace(/\s+/g,' ').trim();
  if(!/S\/A\s*$/i.test(d))return '';
  const x=d.replace(/\s*S\/A\s*$/i,'');
  const c=x.lastIndexOf(',');
  if(c>=0)return x.slice(c+1).trim();
  const m=/\bRetail\s*-\s*(.+)$/i.exec(x)||/\bRetail\s+(.+)$/i.exec(x);
  return m?m[1].trim():'';
};
async function impFile(file){
  const st=impState();st.err='';st.prev=null;st.done=null;
  try{
    await ensureXlsx();
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const sheets=[];
    wb.SheetNames.forEach(name=>{
      const aoa=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:false,defval:''});
      let h=-1;
      for(let i=0;i<Math.min(aoa.length,15);i++){const r=aoa[i].map(c=>String(c).toLowerCase());if(r.some(c=>/e-?mail/.test(c))&&r.some(c=>/name/.test(c))){h=i;break;}}
      if(h<0)return;
      const hd=aoa[h].map(c=>String(c).toLowerCase().trim()),col=re=>hd.findIndex(c=>re.test(c));
      const cSt=col(/^states?$|^coverage$|^state coverage$/),cName=col(/employee name|^name$|full name|co-?ordinator.?s? name/),cMail=col(/e-?mail/),cMob=col(/mobile|phone|contact/),cReg=col(/^region$|bu code|regional office|retail office|^ro$/),cSa=col(/sales area/),cDes=col(/designation/),cZone=col(/^zone$|^area \(zone\)|^area$/);
      if(cName<0||(cReg<0&&cZone<0))return;
      const zoneSheet=cReg<0;   // a zone sheet (zonal coordinators, fulfilment managers): whole zones instead of one region
      const rows=[];
      for(let i=h+1;i<aoa.length;i++){
        const r=aoa[i],nm=String(r[cName]||'').trim();
        if(!nm){if(zoneSheet)break;continue;}   // a zone sheet ends at the first empty row (a second table can follow)
        if(zoneSheet){
          const txt=String(r[cZone]||'').trim(),zs=/^all(\s+zones?)?$/i.test(txt)?Object.keys(OM.meta.sheet_zones):Array.from(new Set(txt.split(',').map(zoneFromText).filter(Boolean)));
          rows.push({name:impCase(nm.replace(/\s+/g,' ')),email:String(cMail>=0?r[cMail]:'').trim(),mobile:String(cMob>=0?r[cMob]:'').trim(),regionText:txt,ro:'',zoneNames:zs,sales_area:'',states:cSt>=0?String(r[cSt]||'').split(/[,;\/]/).map(x=>x.trim()).filter(Boolean):[]});
        }else rows.push({name:impCase(nm.replace(/\s+/g,' ')),email:String(cMail>=0?r[cMail]:'').trim(),mobile:String(cMob>=0?r[cMob]:'').trim(),regionText:String(r[cReg]||'').trim(),ro:regionFromText(r[cReg]),zoneNames:[],sales_area:(cSa>=0?String(r[cSa]||''):saFromDesignation(cDes>=0?r[cDes]:'')).replace(/\s+/g,' ').trim()});
      }
      if(rows.length)sheets.push({name,level:zoneSheet||/^(rm|zo)$|\brms?\b|manager|zone|zonal|coordinator/i.test(name)?'zone':'regional',rows});
    });
    if(!sheets.length){st.err='No people were found in this file. It needs a header row with Employee Name, Email ID and a Region (or BU Code Description) column.';st.sheets=[];drawImport();return;}
    st.sheets=sheets;
  }catch(e){st.err='Could not read the file: '+e.message;st.sheets=[];}
  drawImport();
  if(st.sheets.length)impCheck();
}
function impRows(){
  const out=[];
  impState().sheets.forEach(s=>{if(s.level==='skip')return;s.rows.forEach(r=>out.push({name:r.name,email:r.email,mobile:r.mobile,level:s.level,ro:r.ro,zones:r.zoneNames||[],states:r.states||[],sales_area:r.sales_area,regionText:r.regionText,sheet:s.name}));});
  return out;
}
async function impCheck(){
  const st=impState();st.err='';st.prev=null;st.done=null;
  const rows=impRows();st.sent=rows;
  if(!rows.length){drawImport();return;}
  st.busy=true;drawImport();
  try{
    st.prev=await authPost('import_officers',{dry_run:true,org:st.org,areas_by:st.by,rows:rows.map(r=>({name:r.name,email:r.email,mobile:r.mobile,level:r.level,ro:r.ro,zones:r.zones,states:r.states,sales_area:r.sales_area}))});
  }catch(e){st.err=e.message;}
  st.busy=false;drawImport();
}
async function impCreate(){
  const st=impState(),c=st.prev&&st.prev.counts;if(!c||!c.created)return;
  const ok=await showModal({title:'Create the accounts',body:`${c.created} account${c.created===1?'':'s'} will be created${c.exists?` (${c.exists} already exist and stay as they are)`:''}${c.error?` and ${c.error} row${c.error===1?'':'s'} with a problem will be skipped`:''}. Each gets the password Demo@12345, which you can see and replace in the tables below.`,confirmText:'Create accounts',confirmClass:'btn-p'});
  if(!ok)return;
  st.busy=true;st.err='';drawImport();
  try{
    st.done=await authPost('import_officers',{dry_run:false,org:st.org,areas_by:st.by,rows:st.sent.map(r=>({name:r.name,email:r.email,mobile:r.mobile,level:r.level,ro:r.ro,zones:r.zones,states:r.states,sales_area:r.sales_area}))});
    st.prev=null;st.sheets=[];
    toast(`${st.done.counts.created} account${st.done.counts.created===1?'':'s'} created`);
    st.busy=false;
    await refreshUsers();   // refresh the tables; the result stays on screen
    return;
  }catch(e){st.err=e.message;}
  st.busy=false;drawImport();
}
async function impDownload(){
  const st=impState(),d=st.done;if(!d)return;
  try{await ensureXlsx();}catch(e){toast('Could not load the Excel tool: '+e.message,'er');return;}
  const rows=[['Name','Role','Organization','Region','Reports to','Username','Password','Email','Mobile','Sales areas']];
  d.results.filter(x=>x.status==='created').forEach(x=>{const s=st.sent[x.row]||{};rows.push([x.name,IMP_LEVEL[x.level],ORG_LBL[d.org]||d.org,(x.zones&&x.zones.length)?x.zones.join(' + '):roName(x.ro),x.parent,x.username,x.password,x.email,s.mobile||'',(x.sales_areas||[]).join(', ')]);});
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[22,16,13,14,22,22,14,30,14,50].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'Logins');XLSX.writeFile(wb,'Officer logins.xlsx');
}
function impTable(res,st,withPw){
  const stLbl={created:withPw?'Created':'Will be created',exists:'Already has an account',error:'Problem'};
  const body=res.results.map(x=>{
    const s=st.sent[x.row]||{};
    return `<tr><td><b>${esc(x.name)}</b>${x.email?`<div class="om-sub">${esc(x.email)}</div>`:''}</td><td>${esc(IMP_LEVEL[x.level])}</td><td>${(x.zones&&x.zones.length)?esc(x.zones.join(' + ')):x.ro?esc(roName(x.ro)):`<span class="om-field-err">${esc(s.regionText||'—')}</span>`}</td>
      <td>${x.level==='regional'?esc(x.parent||'—'):'—'}</td><td>${x.level==='regional'?(x.sales_areas.length?`<span title="${esc(x.sales_areas.join(', '))}">${x.sales_areas.length===1?esc(x.sales_areas[0]):x.sales_areas.length+' sales areas'}</span>`:'—'):'—'}${x.level==='regional'&&x.sales_area?`<div class="om-sub">${esc(x.sales_area)}</div>`:''}</td>
      <td>${x.username?esc(x.username):'—'}</td>${withPw?`<td>${x.password?`<b>${esc(x.password)}</b>`:'—'}</td>`:''}
      <td><span class="om-imp-st om-imp-${x.status}">${esc(stLbl[x.status])}</span>${x.note&&x.status!=='created'?`<div class="om-sub">${esc(x.note)}</div>`:''}</td></tr>`;
  }).join('');
  return `<div class="tw"><table class="om-ucards"><thead><tr><th>Name</th><th>Role</th><th>Region</th><th>Works under</th><th>Sales areas (SA)</th><th>Username</th>${withPw?'<th>Password</th>':''}<th>Result</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function drawImport(){
  const box=$('om-imp-box');if(!box)return;
  const st=impState(),canOrg=!OM.hsuper;
  const intro=`<h3>Import officers from Excel</h3><p class="om-psub">Upload the sheet the client sent. A sheet of <b>managers</b> (RM) becomes Zone Officers — one per region —, a sheet of <b>zonal coordinators</b> or <b>fulfilment managers</b> becomes Zone Officers for whole zones, and a sheet of <b>sales officers</b> (SO) becomes Regional Officers under the manager of their region. Usernames come from the e-mail address and every person gets the password <b>Demo@12345</b>. Nothing is created until you press the button; people who already have an account (same e-mail) are left alone, so you can import the same sheet again safely.</p>`;
  if(st.done){
    const c=st.done.counts;
    box.innerHTML=`${intro}<div class="om-note ${c.error?'warn':'info'}">✔ ${c.created} account${c.created===1?'':'s'} created${c.exists?`, ${c.exists} already existed`:''}${c.error?`, ${c.error} with a problem`:''}. Download the logins and share them with each person — you can also read every password in the tables below (eye icon).</div>
      <div class="om-form-actions"><button class="btn-p" data-act="imp-dl">⬇ Download logins (Excel)</button><button class="btn-g" data-act="imp-reset">Import another file</button></div>${impTable(st.done,st,true)}`;
    labelCells(box);return;
  }
  const ctl=!st.sheets.length?`<div class="om-grid om-grid3"><div class="field"><label>Excel file (.xlsx)</label><input type="file" id="om-imp-file" accept=".xlsx,.xls,.csv"></div></div>${st.err?`<div class="om-field-err">${esc(st.err)}</div>`:''}`
    :`<div class="om-grid om-grid4">${st.sheets.map((s,i)=>`<div class="field"><label>Sheet “${esc(s.name)}” — ${s.rows.length} people</label><select data-imp-sheet="${i}">${Object.keys(IMP_LEVEL).map(k=>`<option value="${k}"${s.level===k?' selected':''}>${IMP_LEVEL[k]}</option>`).join('')}</select></div>`).join('')}
        ${canOrg?`<div class="field"><label>Organization</label><select id="om-imp-org"><option value="hpcl"${st.org==='hpcl'?' selected':''}>HPCL</option><option value="rohan"${st.org==='rohan'?' selected':''}>Rohan Energy</option></select></div>`:''}
        <div class="field"><label>Regional Officer sales areas</label><select id="om-imp-by"><option value="sales_area"${st.by==='sales_area'?' selected':''}>By the sales area in the sheet</option><option value="region"${st.by==='region'?' selected':''}>Every sales area of the region</option></select></div></div>`;
  let prev='';
  if(st.busy)prev='<div class="om-empty">Working…</div>';
  else if(st.err&&st.sheets.length)prev=`<div class="om-field-err">${esc(st.err)}</div>`;
  else if(st.prev){
    const c=st.prev.counts;
    prev=`<div class="om-note ${c.error?'warn':'info'}"><b>${c.created}</b> to create · <b>${c.exists}</b> already exist · <b>${c.error}</b> with a problem${c.error?' (these are skipped — fix the sheet or the sheet settings above)':''}</div>
      <div class="om-form-actions"><button class="btn-p" data-act="imp-create"${c.created?'':' disabled'}>+ Create ${c.created} account${c.created===1?'':'s'}</button><button class="btn-g" data-act="imp-reset">Choose another file</button></div>${impTable(st.prev,st,false)}`;
  }
  box.innerHTML=intro+ctl+prev;
  if(st.sheets.length&&!st.prev&&!st.busy)box.insertAdjacentHTML('beforeend','<div class="om-form-actions"><button class="btn-g" data-act="imp-reset">Choose another file</button></div>');
  labelCells(box);
}

/* Super Admin: change the name and the states whose orders it approves */
function openSaEdit(u){
  const x=superAdminList().find(o=>o.username===u);if(!x)return;
  const ov=$('om-overlay');
  ov.innerHTML=`<div class="om-box om-bulk"><h3>Edit ${x.org==='hpcl'?'HPCL':'Rohan Energy'} Super Admin — ${esc(x.username)}</h3><div class="om-grid om-grid1" style="margin-top:12px">
    <div class="field"><label>Full name</label><input type="text" id="om-se-name" maxlength="60" value="${esc(x.label)}"></div>
    <div class="field om-zfield"><label>States whose orders this Super Admin approves</label>${statePicker('om-se',x.states.length?x.states:allStates())}<div class="om-hint">Only the <b>Pending Approvals</b> are limited to the states ticked here; every other page shows everything.</div></div></div>
    ${x.username===OM.user?'':pagesBlock('se',{admin:true,org:x.org,hiddenPages:x.hiddenPages})}
    <div class="om-field-err" id="om-se-err"></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button><button class="btn-p" data-act="sa-edit-save" data-user="${esc(x.username)}">Save changes</button></div></div>`;
  ov.classList.add('show');zpSyncAll(ov);
}
async function saveSaEdit(u){
  const err=$('om-se-err');err.textContent='';
  const label=$('om-se-name').value.trim(),sts=zpRos('om-se');
  if(!label){err.textContent='Enter a name.';return;}
  if(!sts.length){err.textContent='Tick at least one state.';return;}
  const body=zpAll('om-se')?{username:u,label,all_states:true}:{username:u,label,states:sts};
  const pg=pagesPicked('se');if(pg&&pg.error){err.textContent=pg.error;return;}if(pg)body.hidden_pages=pg.hidden;
  try{await authPost('update_super_admin',body);closeModal();toast('Super Admin updated');refreshUsers();}
  catch(e){err.textContent=e.message;}
}
/* Rohan Energy Super Admin: create other Super Admins (Rohan Energy: full rights like this one; HPCL: HPCL accounts only, no Admin / Inventory / Permissions pages) and manage them */
function superAdminList(){
  return Object.entries(OM.users||{}).filter(([,u])=>u.role==='superadmin')
    .map(([username,u])=>({username,label:u.label,org:u.org==='hpcl'?'hpcl':'rohan',createdBy:u.created_by||'',states:u.states||[],hiddenPages:u.hidden_pages||[]}))
    .sort((a,b)=>(a.org===b.org?0:a.org==='rohan'?-1:1)||a.label.localeCompare(b.label));
}
function superAdminCards(){
  const list=superAdminList(),me=OM.user;
  const saZones=u=>{if(!u.states.length)return '<span class="om-sub">All states</span>';
    const n=u.states.length,more=n-2;   // two names, the rest as "+N states" (the full list is the tooltip)
    return `<span title="${esc(u.states.join(', '))}">${esc(u.states.slice(0,2).join(', '))}${more>0?` <span class="om-chip om-chip-admin">+${more} state${more===1?'':'s'}</span>`:''}</span>`;};
  const rows=list.map(u=>`<tr><td><b>${esc(u.label)}</b></td><td>${esc(u.username)}</td><td><span class="om-chip om-chip-${u.org==='hpcl'?'hpcl':'admin'}">${u.org==='hpcl'?'HPCL Super Admin':'Rohan Energy Super Admin'}</span></td><td>${saZones(u)}</td><td>${esc(u.createdBy||'—')}</td>
      <td>${u.username===me?`<span class="om-sub">You</span> <button class="om-btn e" data-act="sa-edit" data-user="${esc(u.username)}">Edit</button>`:`<div class="om-acts"><button class="om-btn e" data-act="sa-edit" data-user="${esc(u.username)}">Edit</button><button class="om-btn" data-act="user-pw" data-user="${esc(u.username)}">Reset password</button><button class="om-btn d" data-act="user-del" data-user="${esc(u.username)}">Remove</button></div>`}</td></tr>`).join('');
  return `<div class="as"><h3>Add Super Admin</h3><p class="om-psub">A <b>Rohan Energy Super Admin</b> has exactly the same rights as you. An <b>HPCL Super Admin</b> works for HPCL only: it does not see the Admin, Inventory or Permissions pages, creates and manages <b>HPCL</b> Zone / Regional Officers only, approves the orders Rohan Energy places, and can add and edit SAP numbers. Share the credentials with the person yourself.</p>
      <div class="om-grid om-grid4">
        <div class="field"><label>Full name</label><input type="text" id="om-sa-name" maxlength="60" placeholder="e.g. Rahul" autocomplete="off"></div>
        <div class="field"><label>Username</label><input type="text" id="om-sa-user" maxlength="40" placeholder="letters, numbers, _" autocomplete="off"></div>
        <div class="field"><label>Password</label>${pwBox('om-sa-pass','Min 8 characters')}</div>
        <div class="field"><label>Type</label><select id="om-sa-org"><option value="rohan">Rohan Energy Super Admin</option><option value="hpcl">HPCL Super Admin</option></select></div>
      </div>
      <div class="field om-zfield" id="om-sa-zwrap"><label>States whose orders this Super Admin approves *</label>${statePicker('om-sa',allStates())}<div class="om-hint">Every page shows everything to a Super Admin; only the <b>Pending Approvals</b> are limited to the states ticked here (all are ticked to start with — leave them all ticked to approve every state). A Rohan Energy Super Admin approves the orders HPCL places; an HPCL Super Admin approves the orders Rohan Energy places.</div></div>
      <div class="om-form-actions"><button class="btn-p" data-act="sa-add">+ Create Super Admin</button><span class="om-field-err" id="om-sa-err"></span></div></div>
    <div class="tc"><div class="th"><h3>Super Admins (${list.length})</h3></div>
      <div class="tw"><table class="om-ucards"><thead><tr><th>Name</th><th>Username</th><th>Type</th><th>Approves orders of</th><th>Created by</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
async function addSuperAdmin(){
  const err=$('om-sa-err');err.textContent='';
  const label=$('om-sa-name').value.trim(),username=$('om-sa-user').value.trim(),password=$('om-sa-pass').value.trim(),org=$('om-sa-org').value;
  if(!label||!username||!password){err.textContent='Fill in name, username and password.';return;}
  if(password.length<8){err.textContent='The password must be at least 8 characters.';return;}
  const body={username,password,label,org};
  const sts=zpRos('om-sa');
  if(!sts.length){err.textContent='Tick at least one state whose orders this Super Admin approves.';return;}
  if(!zpAll('om-sa'))body.states=sts;   // everything ticked = every state: nothing is sent
  try{
    await authPost('add_super_admin',body);
    toast(`${org==='hpcl'?'HPCL':'Rohan Energy'} Super Admin ${username} created`);
    refreshUsers();
  }catch(e){err.textContent=e.message;}
}
/* Super admin: the region + sales area pickers of the "Add Regional Officer" form follow the chosen Zone Officer (only the regions of their zone) */
function drawRaRegion(){
  const box=$('om-ra-reg');if(!box)return;
  const sel=$('om-ra-parent'),zo=orderUsers().find(o=>o.username===(sel&&sel.value));
  if(!zo){box.innerHTML='<div class="om-hint">Choose a Zone Officer to pick the region and sales areas.</div>';return;}
  box.innerHTML=regionFields('om-ra',regionsFor(zo),'',[]);
}
async function addRegionalAdmin(){
  const err=$('om-ra-err');err.textContent='';
  const parent=$('om-ra-parent').value,label=$('om-ra-name').value.trim(),username=$('om-ra-user').value.trim(),password=$('om-ra-pass').value.trim(),roSel=$('om-ra-ro'),ro=roSel?roSel.value:'';
  if(!parent){err.textContent='Choose the Zone Officer.';return;}
  if(!label||!username||!password){err.textContent='Fill in name, username and password.';return;}
  if(password.length<8){err.textContent='The password must be at least 8 characters.';return;}
  if(!ro){err.textContent='Choose the region.';return;}
  const sales_areas=pickedSAs('om-ra-sa');
  if(!sales_areas.length){err.textContent='Tick at least one sales area of '+roName(ro)+'.';return;}
  try{
    await authPost('add_regional_officer',{parent,username,password,label,ro,sales_areas});
    toast(`Regional Officer ${username} created`);
    OM.raParent=parent;
    refreshUsers();
  }catch(e){err.textContent=e.message;}
}
/* ── SAP Numbers: the outlet list the New Order form looks up. Super Admin: every zone. Zone Officer: the regions of their zone. Regional Officer: their region.
   Super Admin and Zone Officers can add and change SAP numbers (applies to new orders straight away); Regional Officers only view. The server enforces all of this. ── */
const SAP_LBL={sap_code:'SAP code',outlet_name:'Outlet name',sheet_zone:'Zone',zone:'Portal zone',state:'State',ro:'Region',district:'District',sales_area:'Sales area',address:'Address',phone:'Phone',pincode:'Pincode',gstin:'GSTIN',pan:'PAN',
  inv_name:'Invoice-to name',inv_address:'Invoice-to address',inv_state:'Invoice-to state',inv_pincode:'Invoice-to pincode',inv_pan:'Invoice-to PAN',inv_gstin:'Invoice-to GSTIN'};
const SAP_KEYS=['sap_code','outlet_name','ro','district','sales_area','address','phone','pincode','gstin','pan','inv_name','inv_address','inv_state','inv_pincode','inv_pan','inv_gstin'];
let _sapSeq=0,_sapT=null;
function sapFilters(){return OM.filters.sap||(OM.filters.sap={q:'',sz:'',state:'',ro:'',district:'',page:1});}
/* ── SAP Numbers: update the list from an Excel sheet. The sheet is read here, the server compares it with the SAP list and the differences are shown BEFORE anything is saved ── */
const SAPU_PAGE=50;
async function sapuRead(file){
  if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw new Error('Please choose the outlet Excel sheet (.xlsx).');
  if(file.size>25*1024*1024)throw new Error('This file is larger than 25 MB. Please check that it is the outlet sheet.');
  await ensureXlsx();
  let wb;
  try{wb=XLSX.read(await file.arrayBuffer(),{type:'array'});}catch(e){throw new Error('This file could not be read as an Excel sheet.');}
  const ws=wb.Sheets[wb.SheetNames[0]];
  if(!ws||!ws['!ref'])throw new Error('The sheet is empty.');
  const r0=XLSX.utils.decode_range(ws['!ref']).s.r;
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:true});
  let h=-1;
  for(let i=0;i<Math.min(aoa.length,10)&&h<0;i++)if((aoa[i]||[]).some(c=>hdrKey(c)==='sapcode'))h=i;
  if(h<0)throw new Error('The SAP_CODE column was not found. Please use the outlet sheet (SAP_CODE, NAME, REGIONAL_OFFICE_NAME, SALES_AREA_NAME, STATE_NAME, DISTRICT_NM, ADD_LN_1 … ADD_LN_5, TELE_NUM, PINCODE, GST_NUMBER, PAN_NUM).');
  const want={sapcode:'sap',name:'name',regionalofficename:'ro',salesareaname:'sa',statename:'state',districtnm:'district',telenum:'phone',pincode:'pin',gstnumber:'gstin',pannum:'pan',addln1:'a0',addln2:'a1',addln3:'a2',addln4:'a3',addln5:'a4'};
  const col={};
  (aoa[h]||[]).forEach((c,i)=>{const k=want[hdrKey(c)];if(k&&col[k]==null)col[k]=i;});   // the first column of a name wins
  const miss=[['sap','SAP_CODE'],['name','NAME'],['ro','REGIONAL_OFFICE_NAME']].filter(x=>col[x[0]]==null).map(x=>x[1]);
  if(miss.length)throw new Error('Column'+(miss.length>1?'s':'')+' not found: '+miss.join(', ')+'.');
  const g=(r,k)=>{const v=col[k]==null?null:r[col[k]];return v==null?'':(typeof v==='number'?(Number.isInteger(v)?String(v):String(v)):String(v));};
  const rows=[];
  for(let i=h+1;i<aoa.length;i++){
    const r=aoa[i]||[];
    const sap=g(r,'sap').trim(),name=g(r,'name').trim();
    if(!sap&&!name)continue;
    rows.push({r:r0+i+1,sap,name,ro:g(r,'ro'),sa:g(r,'sa'),state:g(r,'state'),district:g(r,'district'),a:[g(r,'a0'),g(r,'a1'),g(r,'a2'),g(r,'a3'),g(r,'a4')],phone:g(r,'phone'),pin:g(r,'pin'),gstin:g(r,'gstin'),pan:g(r,'pan')});
  }
  if(!rows.length)throw new Error('No outlet rows were found under the column headings.');
  if(rows.length>20000)throw new Error(`The sheet has ${rows.length} rows; at most 20,000 can be uploaded at once. Please split it.`);
  return rows;
}
function openSapUpload(){
  const ov=$('om-overlay');if(!ov)return;
  OM.sapu={busy:false};
  ov.innerHTML=`<div class="om-box om-bulk"><h3>Update SAP numbers from Excel</h3>
    <div class="om-msub">Upload the outlet sheet. The SAP list is <b>overwritten with the sheet</b> straight away — new outlets are added, changed ones updated${OM.kind==='admin'?', and outlets that are not in the sheet are removed':''}.</div>
    <label class="om-drop" id="om-sapu-drop"><input type="file" id="om-sapu-file" accept=".xlsx,.xls,.csv"><b>Choose the Excel file</b><span>or drop it here · .xlsx</span></label>
    <div class="om-field-err" id="om-sapu-msg"></div>
    <div class="om-bulk-help"><b>How the sheet is read</b><ul>
      <li>Columns used: <b>SAP_CODE</b>, <b>NAME</b>, <b>REGIONAL_OFFICE_NAME</b>, <b>SALES_AREA_NAME</b>, <b>STATE_NAME</b>, <b>DISTRICT_NM</b>, <b>ADD_LN_1 … ADD_LN_5</b> (joined into the address), <b>TELE_NUM</b>, <b>PINCODE</b>, <b>GST_NUMBER</b> and <b>PAN_NUM</b>. The other columns are ignored.</li>
      <li>An outlet is matched by its <b>SAP code</b>. A code that is not in the list is <b>new</b>; a code whose details differ is <b>changed</b>; ${OM.kind==='admin'?'an outlet that is in the list but not in the sheet is <b>removed</b> (you are asked first).':'an outlet that is in the list but not in the sheet is left alone.'}</li>
      <li>The Invoice-to details of an outlet are not in this sheet and stay as they are. A GSTIN, PAN, pincode or phone number in a wrong format is not taken over (it is listed). “NA” / “-” counts as blank.</li>
      <li>${OM.kind==='admin'?'':'Only the outlets of your own regions are checked; rows of other regions are counted and left alone. '}Every change is saved in the SAP log (the <b>Log</b> button) with your name.</li></ul></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button></div></div>`;
  ov.classList.add('show');
  const inp=$('om-sapu-file'),drop=$('om-sapu-drop');
  inp.addEventListener('change',()=>{if(inp.files[0])sapuFile(inp.files[0]);});
  ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
  drop.addEventListener('drop',e=>{const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)sapuFile(f);});
}
async function sapuFile(file){
  const msg=$('om-sapu-msg'),drop=$('om-sapu-drop');
  if(msg)msg.textContent='';
  if(drop){drop.classList.add('busy');const b=drop.querySelector('b');if(b)b.textContent='Reading and saving…';}
  try{
    const rows=await sapuRead(file);
    const j=await omPost('sap_import',{mode:'preview',rows});
    if(!$('om-sapu-file')&&!$('om-sapu-drop'))return;   // the window was closed meanwhile
    OM.sapu={rows,file:file.name,j,tab:j.summary.changed?'changed':(j.summary.new?'new':(j.summary.problems?'problems':'missing')),page:1,q:'',field:'',busy:false,add:true,update:true,remove:OM.kind==='admin'};   // the Super Admin's upload overwrites the list: outlets that are not in the sheet are removed too (the tick box can be taken off)
    await sapuApply(true);   // simple overwrite: no review screen, the sheet is applied straight away
  }catch(e){
    if(msg)msg.textContent=e.message;
    if(drop){drop.classList.remove('busy');const b=drop.querySelector('b');if(b)b.textContent='Choose the Excel file';}
    const inp=$('om-sapu-file');if(inp)inp.value='';
  }
}
const sapuVal=v=>v==null||v===''?'<span class="om-sub">—</span>':esc(v);
function sapuRows(){
  const u=OM.sapu,j=u.j,q=u.q.trim().toLowerCase();
  const hit=x=>!q||[x.sap,x.name,x.ro,x.sales_area,x.district].some(s=>String(s||'').toLowerCase().includes(q));
  if(u.tab==='changed')return j.changed.filter(c=>hit(c)&&(!u.field||c.diff.some(d=>d[0]===u.field)));
  if(u.tab==='new')return j.added.filter(hit);
  if(u.tab==='problems')return j.problems.filter(p=>!q||[p.sap,p.name,p.error].some(s=>String(s||'').toLowerCase().includes(q)));
  return j.missing.filter(hit);
}
function sapuBody(){
  const u=OM.sapu,j=u.j,box=$('om-sapu-body');if(!box)return;
  const all=sapuRows(),pages=Math.max(1,Math.ceil(all.length/SAPU_PAGE));
  u.page=Math.min(Math.max(1,u.page),pages);
  const rows=all.slice((u.page-1)*SAPU_PAGE,u.page*SAPU_PAGE),L=j.labels;
  let h='';
  if(!all.length)h='<div class="om-empty">Nothing to show here.</div>';
  else if(u.tab==='changed')h=`<table class="om-mini"><thead><tr><th>SAP code</th><th>Outlet</th><th>What changes (current → sheet)</th></tr></thead><tbody>${rows.map(c=>`<tr><td class="om-ref">${esc(c.sap)}</td><td><b>${esc(c.name)}</b><div class="om-sub">${esc(roName(c.ro)||c.ro)} · row ${c.row}</div></td>
    <td>${c.diff.map(d=>`<div class="om-sapu-d"><span class="om-sapu-f">${esc(L[d[0]]||d[0])}</span> <span class="om-del">${d[1]===''||d[1]==null?'—':esc(d[1])}</span> → <span class="om-ins">${d[2]===''?'—':esc(d[2])}</span></div>`).join('')}${c.warn.map(w=>`<div class="om-sapu-w">⚠ ${esc(w)}</div>`).join('')}</td></tr>`).join('')}</tbody></table>`;
  else if(u.tab==='new')h=`<table class="om-mini"><thead><tr><th>SAP code</th><th>Outlet</th><th>Region</th><th>Sales area</th><th>District</th></tr></thead><tbody>${rows.map(a=>`<tr><td class="om-ref">${esc(a.sap)}</td><td><b>${esc(a.name)}</b>${a.warn.map(w=>`<div class="om-sapu-w">⚠ ${esc(w)}</div>`).join('')}</td><td>${esc(roName(a.ro)||a.ro)}</td><td>${sapuVal(a.sales_area)}</td><td>${sapuVal(a.district)}</td></tr>`).join('')}</tbody></table>`;
  else if(u.tab==='problems')h=`<table class="om-mini"><thead><tr><th>Row</th><th>SAP code</th><th>Name in sheet</th><th>Problem</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${p.row}</td><td>${esc(p.sap)}</td><td>${esc(p.name)}</td><td class="bad">${esc(p.error)}</td></tr>`).join('')}</tbody></table>`;
  else h=`<table class="om-mini"><thead><tr><th>SAP code</th><th>Outlet</th><th>Region</th><th>Sales area</th></tr></thead><tbody>${rows.map(m=>`<tr><td class="om-ref">${esc(m.sap)}</td><td><b>${esc(m.name)}</b></td><td>${esc(roName(m.ro)||m.ro)}</td><td>${sapuVal(m.sales_area)}</td></tr>`).join('')}</tbody></table>`;
  const cap=(u.tab==='problems'&&j.problems_n>j.problems.length)||(u.tab==='missing'&&j.missing_n>j.missing.length);
  box.innerHTML=`<div class="om-bulk-scroll om-sapu-scroll">${h}</div>
    <div class="om-sapu-pg"><span class="om-sub">${fmtN(all.length)} ${u.tab==='changed'?'outlet'+(all.length===1?'':'s')+' with changes':u.tab==='new'?'new outlet'+(all.length===1?'':'s'):u.tab==='problems'?'problem row'+(all.length===1?'':'s'):'outlet'+(all.length===1?'':'s')+' not in the sheet'}${cap?` (the first ${fmtN(all.length)} of ${fmtN(u.tab==='problems'?j.problems_n:j.missing_n)} are listed)`:''}</span>
      ${pages>1?`<span><button class="btn-g" data-act="sapu-page" data-p="${u.page-1}"${u.page<=1?' disabled':''}>‹ Prev</button> <span class="om-sub">page ${u.page} of ${pages}</span> <button class="btn-g" data-act="sapu-page" data-p="${u.page+1}"${u.page>=pages?' disabled':''}>Next ›</button></span>`:''}</div>`;
}
function sapuRender(){
  const ov=$('om-overlay'),u=OM.sapu;if(!ov||!u||!u.j)return;
  const j=u.j,s=j.summary,L=j.labels,none=!s.new&&!s.changed&&!(OM.kind==='admin'&&s.missing);
  const tab=(k,lbl,n,cls)=>`<button type="button" class="om-sapu-tab${u.tab===k?' on':''}${cls||''}" data-act="sapu-tab" data-t="${k}">${lbl} <b>${fmtN(n)}</b></button>`;
  const fOpts=Object.keys(j.fields).map(k=>`<option value="${esc(k)}"${u.field===k?' selected':''}>${esc(L[k]||k)} (${fmtN(j.fields[k])})</option>`).join('');
  ov.innerHTML=`<div class="om-box om-bulk wide"><h3>SAP numbers — Excel upload review</h3>
    <div class="om-msub">${esc(u.file||'')} · ${fmtN(s.read)} outlet${s.read===1?'':'s'} read. <b>Nothing has been changed yet.</b></div>
    <div class="om-bsum"><div class="${s.new?'':'dim'}"><b>${fmtN(s.new)}</b><span>new outlet${s.new===1?'':'s'}</span></div><div class="${s.changed?'':'dim'}"><b>${fmtN(s.changed)}</b><span>with changes</span></div><div><b>${fmtN(s.unchanged)}</b><span>identical</span></div><div><b>${fmtN(s.missing)}</b><span>not in the sheet</span></div><div class="${s.problems?'bad':''}"><b>${fmtN(s.problems)}</b><span>problem${s.problems===1?'':'s'}</span></div></div>
    ${s.outside?`<div class="om-binfo">${fmtN(s.outside)} row${s.outside===1?'':'s'} of other regions than yours ${s.outside===1?'was':'were'} left out.</div>`:''}
    ${none?'<div class="om-binfo ok">No differences: the SAP list already matches this sheet. There is nothing to apply.</div>':''}
    <div class="om-sapu-tabs">${tab('changed','Changed',s.changed)}${tab('new','New',s.new)}${tab('problems','Problems',s.problems,s.problems?' bad':'')}${tab('missing','Not in sheet',s.missing)}
      <span class="om-sapu-find"><input type="text" id="om-sapu-q" placeholder="Search SAP, outlet, region…" value="${esc(u.q)}" autocomplete="off">${u.tab==='changed'&&fOpts?`<select id="om-sapu-f"><option value="">All fields</option>${fOpts}</select>`:''}</span></div>
    <div id="om-sapu-body"></div>
    <div class="om-field-err om-bfail" id="om-sapu-err"></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button><button class="btn-g" data-act="sapu-again">Choose another file</button>
      ${s.new?`<label class="om-sapu-ck"><input type="checkbox" id="om-sapu-add"${u.add?' checked':''}> Add ${fmtN(s.new)} new</label>`:''}${s.changed?`<label class="om-sapu-ck"><input type="checkbox" id="om-sapu-upd"${u.update?' checked':''}> Update ${fmtN(s.changed)} changed</label>`:''}${OM.kind==='admin'&&s.missing?`<label class="om-sapu-ck om-sapu-rem" title="The SAP list becomes exactly this sheet. Orders already placed keep their details. Take the tick off to keep those outlets."><input type="checkbox" id="om-sapu-rem"${u.remove?' checked':''}> Overwrite: remove ${fmtN(s.missing)} not in the sheet</label>`:''}
      <button class="btn-p" data-act="sapu-apply" id="om-sapu-go"${none?' disabled':''}>Apply</button></div></div>`;
  sapuBody();sapuGo();
  const q=$('om-sapu-q');if(q)q.addEventListener('input',e=>{u.q=e.target.value;u.page=1;sapuBody();});
  const f=$('om-sapu-f');if(f)f.addEventListener('change',e=>{u.field=e.target.value;u.page=1;sapuBody();});
  ['om-sapu-add','om-sapu-upd','om-sapu-rem'].forEach(id=>{const c=$(id);if(c)c.addEventListener('change',()=>{u.add=!$('om-sapu-add')||$('om-sapu-add').checked;u.update=!$('om-sapu-upd')||$('om-sapu-upd').checked;u.remove=!!$('om-sapu-rem')&&$('om-sapu-rem').checked;sapuGo();});});
}
function sapuCounts(){const u=OM.sapu,s=u.j.summary;return {add:s.new&&u.add?s.new:0,upd:s.changed&&u.update?s.changed:0,rem:OM.kind==='admin'&&s.missing&&u.remove?s.missing:0};}
function sapuGo(){
  const b=$('om-sapu-go');if(!b)return;
  const c=sapuCounts(),n=c.add+c.upd+c.rem;
  b.disabled=!n;b.textContent=n?`Apply ${fmtN(n)} change${n===1?'':'s'}`:'Apply';
}
async function sapuApply(auto){
  const u=OM.sapu;if(!u||u.busy||!u.j)return;
  const c=sapuCounts();
  if(!c.add&&!c.upd&&!c.rem){
    if(!auto)return;
    OM.sapu=null;
    const ov=$('om-overlay');
    if(ov)ov.innerHTML=`<div class="om-box om-bulk"><h3>SAP numbers</h3><div class="om-binfo ok">${fmtN(u.j.summary.read)} outlets read. The SAP list already matches this sheet, so nothing was changed.</div><div class="om-foot"><button class="btn-p" data-act="close">Close</button></div></div>`;
    return;
  }
  if(auto){   // the only question asked: outlets that are not in the sheet are deleted
    if(c.rem&&!confirm(`The SAP list will be replaced by this sheet.\n\n${fmtN(c.rem)} outlet${c.rem===1?'':'s'} that ${c.rem===1?'is':'are'} not in the sheet will be REMOVED.\n\nContinue?`)){sapuRender();return;}
  }else if(!confirm(`Save these changes to the SAP list?\n\n${c.rem?c.rem+' outlet'+(c.rem===1?'':'s')+' REMOVED (they are not in the sheet)\n':''}${c.add?c.add+' new outlet'+(c.add===1?'':'s')+' added\n':''}${c.upd?c.upd+' outlet'+(c.upd===1?'':'s')+' updated\n':''}\nEvery change is recorded in the SAP log. New orders use the new details straight away.`))return;
  u.busy=true;
  const b=$('om-sapu-go'),err=$('om-sapu-err');if(err)err.textContent='';
  if(b){b.disabled=true;b.textContent='Saving…';}
  const codes=new Set();
  if(c.add)u.j.added.forEach(a=>codes.add(a.sap));
  if(c.upd)u.j.changed.forEach(x=>codes.add(x.sap));
  try{
    const r=await omPost('sap_import',c.rem?{mode:'apply',add:!!c.add,update:!!c.upd,remove:true,remove_n:c.rem,rows:u.rows}:{mode:'apply',add:!!c.add,update:!!c.upd,rows:u.rows.filter(x=>codes.has(String(x.sap).trim()))});
    OM.sapu=null;
    const ov=$('om-overlay');
    if(ov)ov.innerHTML=`<div class="om-box om-bulk"><h3>SAP numbers updated</h3><div class="om-bsum"><div><b>${fmtN(r.added)}</b><span>added</span></div><div><b>${fmtN(r.updated)}</b><span>updated</span></div>${r.removed?`<div><b>${fmtN(r.removed)}</b><span>removed</span></div>`:''}</div>
      <div class="om-binfo ok">Saved. Every change is in the SAP log (the <b>Log</b> button), and new orders use the new details straight away.</div><div class="om-foot"><button class="btn-p" data-act="close">Close</button></div></div>`;
    loadSap();
  }catch(e){
    u.busy=false;
    if(auto){sapuRender();}   // show the review so the error has a place
    if($('om-sapu-err'))$('om-sapu-err').textContent=e.message;
    sapuGo();
  }
}
async function renderSap(){
  const sec=$('tab-sap');if(!sec)return;
  const f=sapFilters();
  OM.sap=null;
  sec.innerHTML=`<div class="om-pghead end">${logBtn('sap')}</div><div class="metrics" id="om-sap-metrics"></div>
    <div class="filter-bar" id="om-sap-bar">
      <div class="fg"><label>Search</label><input type="text" class="filter-search" id="om-sap-q" value="${esc(f.q)}" placeholder="SAP code, outlet, district, GSTIN…" autocomplete="off"></div>
      <div class="fg" id="om-sap-fz" style="display:none"><label>Zone</label><select id="om-sap-sz"></select></div>
      <div class="fg" id="om-sap-fs"><label>State</label><select id="om-sap-st"></select></div>
      <div class="fg"><label>Region</label><select id="om-sap-ro"></select></div>
      <div class="fg"><label>District</label><select id="om-sap-di"></select></div>
      <button class="btn-g right" style="margin-left:auto" data-act="sap-reset">Reset</button>
    </div>
    <div class="tc"><div class="th"><h3 id="om-sap-title">SAP numbers</h3><div class="om-hbtns" id="om-sap-btns"></div></div>
      <div id="om-sap-note"></div><div class="tw" id="om-sap-table"><div class="om-empty">Loading…</div></div></div>`;
  $('om-sap-q').addEventListener('input',e=>{f.q=e.target.value;f.page=1;saveView();clearTimeout(_sapT);_sapT=setTimeout(loadSap,300);});
  $('om-sap-sz').addEventListener('change',e=>{f.sz=e.target.value;f.state='';f.ro='';f.district='';f.page=1;saveView();drawSapFilters();loadSap();});
  $('om-sap-st').addEventListener('change',e=>{f.state=e.target.value;f.ro='';f.district='';f.page=1;saveView();drawSapFilters();loadSap();});
  $('om-sap-ro').addEventListener('change',e=>{f.ro=e.target.value;f.district='';f.page=1;saveView();drawSapFilters();loadSap();});
  $('om-sap-di').addEventListener('change',e=>{f.district=e.target.value;f.page=1;saveView();loadSap();});
  try{await ensureMeta();}catch(e){}
  loadSap();
}
async function loadSap(){
  const box=$('om-sap-table');if(!box)return;
  const f=sapFilters(),seq=++_sapSeq;
  const params={action:'sap_list',page:f.page};
  if(f.q)params.q=f.q;if(f.sz)params.sheet_zone=f.sz;if(f.state)params.state=f.state;if(f.ro)params.ro=f.ro;if(f.district)params.district=f.district;
  try{
    const j=await omGet(params);
    if(seq!==_sapSeq||OM.current!=='sap')return;   // the user typed again or left the tab meanwhile
    OM.sap=j;f.page=j.page;saveView();
    drawSap();
  }catch(e){
    if(seq===_sapSeq&&$('om-sap-table'))$('om-sap-table').innerHTML=`<div class="om-empty" style="color:#e02424">Could not load the SAP numbers: ${esc(e.message)}</div>`;
  }
}
function sapScopeText(j){
  if(OM.kind==='admin')return 'All zones';
  const rg=j.scope.regions;
  if(OM.level==='regional'&&rg.length===1)return roName(rg[0].ro)+' region';
  const sz=[...new Set(rg.map(r=>r.sheet_zone))];
  return sz.length===1?sz[0]:(meZoneText()||'Your zone');
}
/* zone / region / district dropdowns: only the values this user can see; a selection that no longer exists is dropped */
function drawSapFilters(){
  const j=OM.sap;if(!j)return;
  const f=sapFilters(),rg=j.scope.regions,dm=j.scope.districts;
  let dropped=false;   // true when a remembered filter no longer exists for this user: the list must be loaded again without it
  const drop=k=>{if(f[k]){f[k]='';dropped=true;}};
  const zones=[...new Set(rg.map(r=>r.sheet_zone))];
  const admin=OM.kind==='admin'&&zones.length>1;
  $('om-sap-fz').style.display=admin?'':'none';
  if(!admin)drop('sz');
  if(f.sz&&!zones.includes(f.sz))drop('sz');
  $('om-sap-sz').innerHTML='<option value="">All zones</option>'+zones.map(z=>`<option value="${esc(z)}"${f.sz===z?' selected':''}>${esc(z)}</option>`).join('');
  const inZone=rg.filter(r=>!f.sz||r.sheet_zone===f.sz);
  const states=[...new Set(inZone.map(r=>r.state).filter(Boolean))].sort();
  if(f.state&&!states.includes(f.state))drop('state');
  $('om-sap-fs').style.display=states.length>1?'':'none';   // nothing to choose with a single state
  if(states.length<2)drop('state');
  $('om-sap-st').innerHTML='<option value="">All states</option>'+states.map(x=>{const n=inZone.filter(r=>r.state===x).reduce((a,r)=>a+r.count,0);return `<option value="${esc(x)}"${f.state===x?' selected':''}>${esc(x)} (${fmtN(n)})</option>`;}).join('');
  const regs=inZone.filter(r=>!f.state||r.state===f.state);
  if(f.ro&&!regs.some(r=>r.ro===f.ro))drop('ro');
  $('om-sap-ro').closest('.fg').style.display=regs.length===1?'none':'';   // nothing to choose with a single region
  $('om-sap-ro').innerHTML=(regs.length===1?'':'<option value="">All regions</option>')+regs.map(r=>`<option value="${esc(r.ro)}"${f.ro===r.ro||regs.length===1?' selected':''}>${esc(roName(r.ro))} (${fmtN(r.count)})</option>`).join('');
  if(regs.length===1)f.ro=regs[0].ro;
  const list=f.ro?(dm[f.ro]||[]):[...new Set(regs.flatMap(r=>dm[r.ro]||[]))].sort();
  if(f.district&&!list.includes(f.district))drop('district');
  $('om-sap-di').innerHTML='<option value="">All districts</option>'+list.map(d=>`<option value="${esc(d)}"${f.district===d?' selected':''}>${esc(d)}</option>`).join('');
  return dropped;
}
function sapPager(page,pages,total,per){
  if(pages<2)return '';
  const b=(p,l,dis,cur)=>`<button class="btn-g${cur?' on':''}" data-act="sap-page" data-p="${p}"${dis?' disabled':''}${cur?' aria-current="page"':''}>${l}</button>`;
  const set=new Set([1,pages,page-1,page,page+1]);let nums='',last=0;
  [...set].filter(p=>p>=1&&p<=pages).sort((a,c)=>a-c).forEach(p=>{if(p-last>1)nums+='<span class="om-gap">…</span>';nums+=b(p,p,false,p===page);last=p;});
  const from=(page-1)*per;
  return `<div class="om-pager"><span class="om-psub">Showing ${fmtN(from+1)}–${fmtN(Math.min(from+per,total))} of ${fmtN(total)}</span><div class="om-pbtns">${b(page-1,'‹ Prev',page<2)}${nums}${b(page+1,'Next ›',page>=pages)}</div></div>`;
}
function drawSap(){
  const j=OM.sap,box=$('om-sap-table');if(!j||!box)return;
  const f=sapFilters(),sc=j.scope,edit=j.can_edit;
  if(drawSapFilters()){loadSap();return;}
  const card=(cls,lbl,val,sub)=>`<div class="mc ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub||'&nbsp;'}</div></div>`;
  const scopeTxt=sapScopeText(j);
  $('om-sap-metrics').innerHTML=card('bl','SAP numbers',fmtN(sc.total),esc(scopeTxt))+card('bl','States',fmtN(new Set(sc.regions.map(r=>r.state).filter(Boolean)).size),esc(fmtN(new Set(sc.regions.filter(r=>r.count).map(r=>r.state).filter(Boolean)).size)+' with SAP numbers'))+card('gr','Regions',fmtN(sc.regions.length),sc.regions.some(r=>!r.count)?esc(fmtN(sc.regions.filter(r=>r.count).length)+' with SAP numbers'):'')+card('am','Districts',fmtN(sc.districts_n),'');
  const filtered=!!(f.q||f.sz||f.state||(f.ro&&sc.regions.length>1)||f.district);   // a single region is not a filter, it is all this user has
  const where=[f.sz,f.state,f.ro&&sc.regions.length>1?roName(f.ro):'',f.district].filter(Boolean).join(' › ')||scopeTxt;   // what is selected in the filters
  $('om-sap-title').textContent=`SAP numbers — ${where} (${fmtN(j.total)}${filtered?' found':''})`;
  $('om-sap-btns').innerHTML=edit?'<button class="btn-g" data-act="sap-upload" title="Update the list from an Excel sheet - the differences are shown before anything is saved">⬆ Upload Excel</button><button class="btn-p" data-act="sap-add">+ Add SAP number</button>':'';
  $('om-sap-note').innerHTML=edit
    ?'<div class="om-note info">A change saved here applies to <b>new orders straight away</b> — the SAP code lookup on the New Order form reads this list. Orders that are already placed keep the details they were created with. To update many outlets at once use <b>Upload Excel</b>: you see every difference before it is saved.</div>'
    :'<div class="om-note info">These are the SAP numbers of your region. Only the Super Admin and Zone Officers can add or change them — ask your Zone Officer for a correction.</div>';
  if(!j.rows.length){box.innerHTML=`<div class="om-empty">${filtered?(!j.total&&f.sz&&!f.q&&!f.state&&!f.ro&&!f.district&&!sc.regions.some(r=>r.sheet_zone===f.sz&&r.count)?'No SAP numbers have been loaded for '+esc(f.sz)+' yet. Use Upload Excel or + Add SAP number to add them.':'No SAP number matches these filters.'):'No SAP numbers have been loaded for your area yet.'}</div>`;return;}
  const adminCol=OM.kind==='admin';
  const rows=j.rows.map(r=>`<tr><td class="om-ref" data-label="SAP code">${esc(r.sap_code)}</td>
      <td class="om-out" data-label="Outlet"><b>${esc(r.outlet_name)}</b></td>
      <td data-label="Region">${esc(roName(r.ro))}${adminCol?`<div class="om-sub">${esc(r.sheet_zone)}</div>`:''}</td>
      <td data-label="State">${esc(r.state)||'—'}</td>
      <td data-label="District">${esc(r.district)||'—'}</td>
      <td class="om-wrap" data-label="Sales area">${esc(r.sales_area)||'—'}</td>
      <td data-label="Contact">${esc(r.phone)||'—'}<div class="om-sub">${r.gstin?esc(r.gstin):'No GSTIN'}</div></td>
      <td data-label="Last changed">${r.updated_at?`${esc(r.updated_by||'')}<div class="om-sub">${fmtDS(r.updated_at)}</div>`:'<span class="om-sub">Original list</span>'}</td>
      <td data-label="Actions"><div class="om-acts"><button class="om-btn${edit?' e':''}" data-act="sap-open" data-code="${esc(r.sap_code)}">${edit?'Edit':'View'}</button></div></td></tr>`).join('');
  box.innerHTML=`<table class="om-sap"><thead><tr><th>SAP code</th><th>Outlet</th><th>Region</th><th>State</th><th>District</th><th>Sales area</th><th>Contact / GSTIN</th><th>Last changed</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`+sapPager(j.page,j.pages,j.total,j.per);
}

/* add / edit / view popup. Editors pick the region only: zone and state follow from it. */
function sapRegionInfo(j,ro){return (j.edit_regions||[]).concat(j.scope.regions).find(r=>r.ro===ro)||null;}
function openSapForm(code){
  const j=OM.sap,ov=$('om-overlay');if(!j||!ov)return;
  const row=code?j.rows.find(r=>r.sap_code===code):null;
  if(code&&!row)return;
  const edit=j.can_edit,adding=!code;
  const v=k=>row?String(row[k]==null?'':row[k]):'';
  const ro0=v('ro');
  let regs=edit?j.edit_regions.slice():j.scope.regions.slice();
  if(ro0&&!regs.some(r=>r.ro===ro0)){const x=sapRegionInfo(j,ro0);if(x)regs.push(x);}
  const ro=ro0||(regs.length===1?regs[0].ro:'');
  const ph=edit?'':' readonly';
  const inp=(k,label,o={})=>`<div class="field${o.cls?' '+o.cls:''}"><label>${label}${o.req&&edit?' *':''}</label><input type="text" id="om-sp-${k}" maxlength="${o.max}" value="${esc(v(k))}"${ph} autocomplete="off"${o.attr||''}><div class="om-field-err" id="om-spe-${k}"></div>${o.hint&&edit?`<div class="om-hint">${o.hint}</div>`:''}</div>`;
  const dl=(j.scope.districts[ro]||[]);
  ov.innerHTML=`<div class="om-box om-bulk" id="om-sap-form" data-orig="${esc(code||'')}"><h3>${adding?'Add SAP number':edit?'Edit SAP number':'SAP number'}${row?` <span class="om-ref">${esc(code)}</span>`:''}</h3>
    <div class="om-msub">${adding?'The zone and state follow from the region you choose.':edit?'Changes apply to new orders straight away. Orders already placed keep the details they were created with.':'Only the Super Admin and Zone Officers can change these details.'}</div>
    <div class="om-sapsec">Outlet</div>
    <div class="om-grid om-grid3">
      ${inp('sap_code','SAP code',{req:1,max:12,attr:' inputmode="numeric"',hint:row?'Changing the number does not change orders already placed. A draft order that uses the old number needs the new one.':'6 to 12 digits.'})}
      ${inp('outlet_name','Outlet name',{req:1,max:150,cls:'om-wide'})}
      <div class="field"><label>Region${edit?' *':''}</label><select id="om-sp-ro"${edit?'':' disabled'}>${ro?'':'<option value="">Select region…</option>'}${regs.map(r=>`<option value="${esc(r.ro)}"${r.ro===ro?' selected':''}>${esc(roName(r.ro))}</option>`).join('')}</select><div class="om-field-err" id="om-spe-ro"></div></div>
      ${inp('district','District',{req:1,max:100,attr:' list="om-sp-dl"'})}
      ${inp('sales_area','Sales area',{max:100})}
      <div class="field om-full"><div class="om-sapzone" id="om-sp-zone"></div></div>
      ${inp('address','Address',{max:400,cls:'om-full'})}
      ${inp('phone','Phone',{max:20})}
      ${inp('pincode','Pincode',{max:10,attr:' inputmode="numeric"'})}
      ${inp('gstin','GSTIN',{max:20})}
      ${inp('pan','PAN',{max:12})}
    </div>
    <datalist id="om-sp-dl">${dl.map(d=>`<option value="${esc(d)}">`).join('')}</datalist>
    <div class="om-sapsec">Invoice-to <span class="om-opt">— the HPCL office the Sales Order is billed to</span></div>
    <div class="om-grid om-grid3">
      ${inp('inv_name','Name',{max:150,cls:'om-wide'})}
      ${inp('inv_state','State',{max:50})}
      ${inp('inv_address','Address',{max:400,cls:'om-full'})}
      ${inp('inv_pincode','Pincode',{max:10,attr:' inputmode="numeric"'})}
      ${inp('inv_pan','PAN',{max:12})}
      ${inp('inv_gstin','GSTIN',{max:20})}
    </div>
    ${row?`<div class="om-sapsec">Recent changes</div><div id="om-sap-hist"><div class="om-sub">Loading…</div></div>`:''}
    <div class="om-field-err" id="om-spe-form" style="margin-top:8px"></div>
    <div class="om-foot"><button class="btn-g" data-act="close">${edit?'Cancel':'Close'}</button>${edit?'<button class="btn-p" data-act="sap-save">Save</button>':''}</div></div>`;
  ov.classList.add('show');
  const zoneTxt=()=>{const x=sapRegionInfo(j,$('om-sp-ro').value);$('om-sp-zone').innerHTML=x?`<b>${esc(x.sheet_zone)}</b> · ${esc(x.zone)} · ${esc(x.state)}`:'<span class="om-sub">Choose a region to see its zone and state.</span>';};
  zoneTxt();
  $('om-sp-ro').addEventListener('change',()=>{
    zoneTxt();
    const d=$('om-sp-dl');if(d)d.innerHTML=(j.scope.districts[$('om-sp-ro').value]||[]).map(x=>`<option value="${esc(x)}">`).join('');
  });
  if(row)loadSapHistory(code);
}
function sapShort(s){s=String(s==null?'':s);return s.length>60?s.slice(0,57)+'…':s;}
async function loadSapHistory(code){
  const box=$('om-sap-hist');if(!box)return;
  try{
    const j=await omGet({action:'sap_history',code});
    if(!$('om-sap-hist')||$('om-sap-form').dataset.orig!==code)return;
    $('om-sap-hist').innerHTML=j.history.length?j.history.map(e=>{
      const ch=Object.entries(e.changes||{});
      const what=e.action==='added'?'Added this SAP number':ch.length?ch.slice(0,6).map(([k,p])=>`<b>${esc(SAP_LBL[k]||k)}</b>: ${p[0]?esc(sapShort(p[0]))+' → ':''}${esc(sapShort(p[1]))||'(blank)'}`).join('<br>')+(ch.length>6?`<br>+ ${ch.length-6} more`:''):'Saved';
      return `<div class="om-sh"><div class="om-sub">${fmtDT(e.created_at)} · ${esc(e.user_label)}</div><div>${what}</div></div>`;
    }).join(''):'<div class="om-sub">No changes recorded yet — these details are from the original outlet list.</div>';
  }catch(e){if($('om-sap-hist'))$('om-sap-hist').innerHTML=`<div class="om-sub">Could not load the history: ${esc(e.message)}</div>`;}
}
async function saveSap(){
  const j=OM.sap,form=$('om-sap-form');if(!j||!j.can_edit||!form)return;
  const btn=form.querySelector('[data-act=sap-save]'),orig=form.dataset.orig||'';
  form.querySelectorAll('.om-field-err').forEach(e=>e.textContent='');
  const data={orig};
  SAP_KEYS.forEach(k=>{const el=$('om-sp-'+k);data[k]=el?el.value.trim():'';});
  const errs={};
  if(!/^\d{6,12}$/.test(data.sap_code))errs.sap_code='Enter a valid SAP code (6 to 12 digits).';
  if(!data.outlet_name)errs.outlet_name='Outlet name is required.';
  if(!data.ro)errs.ro='Choose the region.';
  if(!data.district)errs.district='District is required.';
  if(Object.keys(errs).length){showSapErrors(errs);return;}
  if(btn)btn.disabled=true;
  try{
    const r=await omPost('sap_save',data);
    closeModal();
    const f=sapFilters();
    if(r.created||r.outlet.sap_code!==orig){f.q=r.outlet.sap_code;f.sz='';f.state='';f.ro='';f.district='';f.page=1;const qi=$('om-sap-q');if(qi)qi.value=f.q;}   // show the saved SAP number
    toast(r.created?`SAP number ${r.outlet.sap_code} added`:r.changed.length?`SAP number ${r.outlet.sap_code} updated`:'Nothing was changed');
    loadSap();
  }catch(e){
    if(btn)btn.disabled=false;
    if(e.fields&&Object.keys(e.fields).length)showSapErrors(e.fields,e.message);
    else{const g=$('om-spe-form');if(g)g.textContent=e.message;}
  }
}
function showSapErrors(f,msg){
  Object.keys(f).forEach(k=>{const el=$('om-spe-'+k);if(el)el.textContent=f[k];});
  const g=$('om-spe-form');if(g)g.textContent=msg||'Please fix the highlighted fields.';
  const first=document.querySelector('#om-sap-form .om-field-err:not(:empty):not(#om-spe-form)');
  if(first)first.scrollIntoView({block:'center',behavior:'smooth'});
}

/* ── admin: Inventory (minimum order quantity, available quantity, add / delete products) ── */
async function renderInventory(){
  const sec=$('tab-inventory');if(!sec)return;
  sec.innerHTML='<div class="om-empty">Loading…</div>';
  try{await refreshMeta();}   // fresh, so the page shows what is saved
  catch(e){sec.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load: ${esc(e.message)}</div>`;return;}
  if(OM.current!=='inventory')return;
  drawInventory();
}
function drawInventory(){
  const sec=$('tab-inventory');if(!sec)return;
  const mo=OM.meta.min_order||{ea:0,max:100000},lpe=OM.meta.litres_per_ea||20;
  const minCard=`<div class="as"><h3>Minimum order quantity</h3><p class="om-psub">Rohan Energy officers cannot submit an order whose total quantity is below this. Applies to all zones. Orders already pending or approved are not affected. Set 0 for no minimum.</p>
      <div class="om-minrow"><div class="field"><label>Minimum quantity per order (EA)</label><input type="number" id="om-min-ea" min="0" max="${mo.max}" step="1" value="${mo.ea}" placeholder="0"><div class="om-hint" id="om-min-lit">${mo.ea>0?fmtN(mo.ea*lpe)+' litres':'No minimum set'}</div></div>
      <button class="btn-p" data-act="min-save">Save</button></div>
      <div class="om-field-err" id="om-e-min_ea"></div>
      <div class="om-hint">${mo.at?`Last changed by ${esc(mo.by||'admin')} on ${esc(fmtDT(mo.at))}`:'Not set yet — orders have no minimum.'}</div></div>`;
  const prodCard=skuCard();
  sec.innerHTML=minCard+stockCard()+prodCard;
  const mi=$('om-min-ea');
  if(mi)mi.addEventListener('input',()=>{const n=parseInt(mi.value,10);$('om-min-lit').textContent=n>0?fmtN(n*lpe)+' litres':'No minimum set';});
  const pn=$('om-prod-name');
  if(pn)pn.addEventListener('keydown',e=>{if(e.key==='Enter')addProduct();});
}
/* SKUs grouped under the two brands (HP DEF, TATA MOTORS). A brand also decides Dispatch to / Invoice to on the Sales Order and Tax Invoice. */
function skuCard(){
  const prods=OM.meta.products||[],brands=OM.meta.brands||{};
  const sections=Object.keys(brands).map(b=>{
    const list=prods.filter(p=>p.brand===b);
    return `<div class="om-brand"><div class="om-brand-h"><b>${esc(brands[b].name)}</b> <span class="om-opt">— ${brands[b].same_party?'Dispatch to and Invoice to are always the same (sold straight to the outlet)':'Dispatch to and Invoice to are different (billed through the HPCL office)'}</span></div>
      <div class="tw"><table class="om-plist"><thead><tr><th>SKU</th><th>Actions</th></tr></thead><tbody>${list.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td><div class="om-acts"><button class="om-btn d" data-act="prod-del" data-pid="${x.pid}">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="2" style="color:#9ca3af">No SKU yet</td></tr>'}</tbody></table></div></div>`;
  }).join('');
  return `<div class="as"><h3>Brands &amp; SKUs</h3><p class="om-psub">Every product Rohan Energy officers can order is a SKU under one of the two brands. After adding a SKU, a Rohan Energy officer must set its price and GST % (Set prices) before an order containing it can be submitted. Deleting a SKU removes its price, GST %, available quantity and FOC rules; orders that already contain it are not changed.</p>
      ${sections}
      <div class="om-minrow" style="margin-top:12px"><div class="field"><label>Brand</label><select id="om-prod-brand">${Object.keys(brands).map(b=>`<option value="${esc(b)}">${esc(brands[b].name)}</option>`).join('')}</select></div>
      <div class="field"><label>New SKU name</label><input type="text" id="om-prod-name" maxlength="80" autocomplete="off" placeholder="e.g. HP DEF - 1X10L"></div>
      <button class="btn-p" data-act="prod-add">+ Add SKU</button></div>
      <div class="om-field-err" id="om-e-name"></div></div>`;
}
/* ── FOC page (super admin): the "buy P EA, get F EA free" list of each SKU, laid out like the HP DEF scheme chart. Editable; saved SKU by SKU. ──
   An officer orders P EA and is billed for P EA; the order then carries P + F EA (the Sales Order and the Tax Invoice list the F EA as FOC, the MIS counts P + F). */
const FOC_COLS=['Brand Name','MRP / Non-MRP','UoM (Ltr/EA)','Pack Size','MRP (Rs/EA)','DLP (Rs/EA)','Purchase Quantity in EA','Free Quantity (in EA)','FOC %','DLP (Rs/EA) After FOC (incl. GST)','DLP (Rs/Ltr) After FOC (incl. GST)','Total Price (Rs)','Units EA'];
const num0=v=>{const n=Number(v);return v!==''&&v!=null&&isFinite(n)?n:null;};
const wholeN=v=>{const n=num0(v);return n!=null&&Number.isInteger(n)?n:null;};
/* The DLP (incl. GST) typed in the card IS the price orders use: rate = DLP / (1 + GST %) - the same price as ₹ Set prices & GST %. The MRP is a reference column of the chart. */
function focDlpOf(d){const v=num0(d.dlp);return v!=null&&v>0?v:null;}
/* the figures of one row of the chart: purchase p, free f, DLP d (per EA incl. GST) */
function focCalc(p,f,d,lpe){
  if(p==null||p<1||f==null||f<0)return null;
  const units=p+f,r={pct:f/p*100,units};
  if(d!=null){const after=d*p/units;r.after=after;r.perL=after/lpe;r.total=p*d;}
  return r;
}
function focCells(c){
  return c?[`${c.pct.toFixed(2)}%`,c.after!=null?fmtN(Math.round(c.after)):'—',c.perL!=null?c.perL.toFixed(2):'—',c.total!=null?fmtN(Math.round(c.total)):'—',fmtN(c.units)]:['—','—','—','—','—'];
}
function focDraftsFromMeta(){
  const d={},info=OM.meta.foc_info||{};
  (OM.meta.products||[]).forEach(p=>{
    const i=info[p.pid]||{};
    const pr=(OM.meta.prices||[]).find(x=>x.pid===p.pid)||{};
    d[p.pid]={dlp:i.dlp!=null?String(i.dlp):'',gst:pr.rate>0&&pr.gst!=null?String(pr.gst):'18',mrp:i.mrp!=null?String(i.mrp):'',mrp_type:i.mrp_type||'MRP',rows:(OM.meta.foc||[]).filter(r=>r.pid===p.pid).map(r=>({p:String(r.min_qty),f:String(r.foc_qty)})),dirty:false,err:{},edit:false,sel:new Set()};
  });
  return d;
}
async function renderFoc(){
  const sec=$('tab-foc');if(!sec)return;
  sec.innerHTML='<div class="om-empty">Loading…</div>';
  try{await refreshMeta();}
  catch(e){sec.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load: ${esc(e.message)}</div>`;return;}
  if(OM.current!=='foc')return;
  OM.focDraft=focDraftsFromMeta();
  drawFoc();
}
function drawFoc(){
  const sec=$('tab-foc');if(!sec)return;
  const prods=OM.meta.products||[];
  if(!prods.some(p=>p.pid===OM.focPid))OM.focPid=prods.length?prods[0].pid:null;
  const cur=prods.find(p=>p.pid===OM.focPid);
  sec.innerHTML=`<div class="as"><div class="om-pghead"><h3>FOC (free of cost)</h3>${logBtn('foc')}</div>
    <div class="om-foc-tabs" id="om-foc-tabs" role="tablist" aria-label="SKU">${prods.map(focTabHtml).join('')}</div>
    <div id="om-foc-wrap">${cur?focSkuCard(cur):'<div class="om-empty">No SKU yet.</div>'}</div></div>`;
  sec.oninput=focInput;sec.onchange=focChange;
}
function focTabHtml(p){const d=OM.focDraft[p.pid]||{};return `<button type="button" role="tab" aria-selected="${p.pid===OM.focPid}" class="om-foc-tab${p.pid===OM.focPid?' on':''}" id="om-foc-tab-${p.pid}" data-act="foc-tab" data-pid="${p.pid}">${esc(p.name)}${d.dirty?'<i class="om-foc-dot" title="Unsaved changes"></i>':''}</button>`;}
function focTabUpdate(pid){const p=(OM.meta.products||[]).find(x=>x.pid===pid),el=$('om-foc-tab-'+pid);if(p&&el)el.outerHTML=focTabHtml(p);}
/* one SKU: view (read only, "Edit" to change) or edit mode (cells, tick boxes to select rows, Save / Discard) */
function focSkuCard(p){
  const d=OM.focDraft[p.pid];if(!d)return'';
  const ed=!!d.edit,lpe=OM.meta.litres_per_ea||20,dlp=focDlpOf(d),brandName=(OM.meta.brands[p.brand]||{}).name||p.brand,pid=p.pid,nsel=d.sel.size;
  const rows=d.rows.map((r,i)=>focRowHtml(p,d,i,dlp,lpe)).join('')||`<tr><td colspan="${FOC_COLS.length+2}" style="color:#9ca3af;text-align:center;padding:18px!important">No rows yet${ed?' - add a row or upload the Excel sheet.':' - press Edit to add rows.'}</td></tr>`;
  const head=ed?`<button type="button" class="om-fb" data-act="foc-reset" data-pid="${pid}">Discard changes</button><button type="button" class="om-fb pri" data-act="foc-save" data-pid="${pid}">✓ Save</button>`
    :`<button type="button" class="om-fb" data-act="foc-template" data-pid="${pid}">⬇ Sheet format</button><button type="button" class="om-fb" data-act="foc-upload" data-pid="${pid}">⬆ Upload Excel</button><button type="button" class="om-fb on" data-act="foc-edit" data-pid="${pid}">✎ Edit</button>`;
  const fields=ed?`<div class="om-minrow om-foc-fields"><div class="field"><label>MRP / Non-MRP</label><select data-foc="type" data-pid="${pid}"><option${d.mrp_type==='MRP'?' selected':''}>MRP</option><option value="Non-MRP"${d.mrp_type==='Non-MRP'?' selected':''}>Non-MRP</option></select></div>
      <div class="field"><label>MRP (Rs/EA)</label><input type="text" inputmode="decimal" autocomplete="off" data-foc="mrp" data-pid="${pid}" value="${esc(d.mrp)}" placeholder="e.g. 1790"><div class="om-field-err" id="om-foc-e-mrp-${pid}"></div><div class="om-hint">Reference only</div></div>
      <div class="field"><label>GST %</label><input type="text" inputmode="decimal" autocomplete="off" data-foc="gst" data-pid="${pid}" value="${esc(d.gst)}" placeholder="18"><div class="om-field-err" id="om-foc-e-gst-${pid}"></div></div>
      <div class="field"><label>DLP (Rs/EA, incl. GST)</label><input type="text" inputmode="decimal" autocomplete="off" data-foc="dlp" data-pid="${pid}" value="${esc(d.dlp)}" placeholder="e.g. 1652"><div class="om-field-err" id="om-foc-e-dlp-${pid}"></div><div class="om-hint">The price orders use</div></div></div>`
    :`<div class="om-foc-sum"><div><span>MRP / Non-MRP</span><b>${esc(d.mrp_type)}</b></div><div><span>MRP (Rs/EA)</span><b>${d.mrp!==''&&num0(d.mrp)!=null?money2(num0(d.mrp)):'—'}</b></div><div><span>GST %</span><b>${d.gst!==''?esc(d.gst)+'%':'—'}</b></div><div><span>DLP (Rs/EA, incl. GST)</span><b>${dlp!=null?money2(dlp):'—'}</b></div></div>`;
  const tools=ed?`<div class="om-foc-tools"><button type="button" class="om-fb" data-act="foc-row-add" data-pid="${pid}">+ Add row</button><button type="button" class="om-fb" data-act="foc-upload" data-pid="${pid}">⬆ Upload Excel</button><button type="button" class="om-fb" data-act="foc-template" data-pid="${pid}">⬇ Sheet format</button><span class="om-foc-tip">Change the figures, tick rows to delete several at once, then press Save.</span></div>`:'';
  const selbar=ed&&nsel?`<div class="om-foc-selbar"><span><b>${fmtN(nsel)}</b> row${nsel===1?'':'s'} selected</span><span class="om-foc-selbtn"><button type="button" class="om-fb del" data-act="foc-del-sel" data-pid="${pid}">Delete selected</button><button type="button" class="om-fb" data-act="foc-sel-clear" data-pid="${pid}">Clear</button></span></div>`:'';
  const all=d.rows.length>0&&nsel===d.rows.length;
  const th=(ed?`<th class="chk"><input type="checkbox" data-act="foc-chk-all" data-pid="${pid}" aria-label="Select all rows"${all?' checked':''}></th>`:'')+FOC_COLS.map((c,i)=>`<th${i>=4?' class="om-num"':''}>${esc(c)}</th>`).join('')+(ed?'<th></th>':'');
  return `<div class="om-foc-card${ed?' editing':''}" id="om-foc-${pid}" data-pid="${pid}"><div class="om-foc-h"><h3>${esc(p.name)}</h3><span class="om-foc-brand">${esc(brandName)}</span><span class="om-foc-mode ${ed?'ed':'vo'}">${ed?'Editing':'View'}</span><span class="om-foc-dirty" id="om-foc-dirty-${pid}"${d.dirty?'':' style="display:none"'}>Unsaved changes</span><span style="flex:1"></span>${head}</div>
    ${fields}${tools}${selbar}
    <div class="tw om-foc-tw"><table class="om-plist om-foc-tbl"><thead><tr>${th}</tr></thead><tbody id="om-foc-body-${pid}">${rows}</tbody></table></div>
    <input type="file" hidden accept=".xlsx,.xls,.csv" id="om-foc-file-${pid}" data-foc="file" data-pid="${pid}">
    <div class="om-field-err" id="om-foc-e-${pid}"></div></div>`;
}
function focRowHtml(p,d,i,dlp,lpe){
  const r=d.rows[i],c=focCalc(wholeN(r.p),wholeN(r.f),dlp,lpe),cells=focCells(c),pid=p.pid,ed=!!d.edit;
  const mrp=d.mrp!==''&&num0(d.mrp)!=null?money2(num0(d.mrp)):'—';
  const pc=ed?`<input type="text" inputmode="numeric" autocomplete="off" class="om-qty${d.err['p'+i]?' bad':''}" data-foc="p" data-pid="${pid}" data-i="${i}" value="${esc(r.p)}" title="${esc(d.err['p'+i]||'')}">`:esc(r.p);
  const fc=ed?`<input type="text" inputmode="numeric" autocomplete="off" class="om-qty${d.err['f'+i]?' bad':''}" data-foc="f" data-pid="${pid}" data-i="${i}" value="${esc(r.f)}" title="${esc(d.err['f'+i]||'')}">`:esc(r.f);
  return `<tr data-i="${i}"${ed&&d.sel.has(i)?' class="sel"':''}>${ed?`<td class="chk"><input type="checkbox" data-act="foc-chk" data-pid="${pid}" data-i="${i}" aria-label="Select this row"${d.sel.has(i)?' checked':''}></td>`:''}<td>${esc((OM.meta.brands[p.brand]||{}).name||p.brand)}</td><td>${esc(d.mrp_type)}</td><td>EA</td><td>${lpe} Ltr</td><td class="om-num" data-c="mrp">${mrp}</td><td class="om-num" data-c="dlp">${dlp!=null?money2(dlp):'—'}</td>
    <td class="om-num">${pc}</td><td class="om-num">${fc}</td>
    ${cells.map((v,k)=>`<td class="om-num" data-c="${['pct','after','perl','total','units'][k]}">${v}</td>`).join('')}
    ${ed?`<td><button class="om-btn d" data-act="foc-row-del" data-pid="${pid}" data-i="${i}" title="Remove this row" type="button">✕</button></td>`:''}</tr>`;
}
function focDirty(pid){const d=OM.focDraft[pid];if(!d)return;const was=d.dirty;d.dirty=true;const e=$('om-foc-dirty-'+pid);if(e)e.style.display='';if(!was)focTabUpdate(pid);}
/* typing in a cell: keep the draft and recalculate that row's figures only (the inputs keep focus) */
function focInput(e){
  const t=e.target,k=t.dataset&&t.dataset.foc;if(!k)return;
  const pid=+t.dataset.pid,d=OM.focDraft[pid],p=(OM.meta.products||[]).find(x=>x.pid===pid);if(!d||!p)return;
  const lpe=OM.meta.litres_per_ea||20,dlp=focDlpOf(d);
  if(k==='gst'){d.gst=t.value.trim();focDirty(pid);return;}
  if(k==='dlp'){d.dlp=t.value.trim();focDirty(pid);focRecalc(pid);return;}
  if(k==='mrp'){d.mrp=t.value.trim();focDirty(pid);
    const m=d.mrp!==''&&num0(d.mrp)!=null?money2(num0(d.mrp)):'—';document.querySelectorAll(`#om-foc-body-${pid} [data-c="mrp"]`).forEach(c=>c.textContent=m);return;}
  if(k!=='p'&&k!=='f')return;
  const i=+t.dataset.i;d.rows[i][k]=t.value.trim();delete d.err[k+i];t.classList.remove('bad');focDirty(pid);
  const tr=t.closest('tr'),cells=focCells(focCalc(wholeN(d.rows[i].p),wholeN(d.rows[i].f),dlp,lpe));
  ['pct','after','perl','total','units'].forEach((c,j)=>{const td=tr.querySelector(`[data-c="${c}"]`);if(td)td.textContent=cells[j];});
}
/* every row's DLP cell and figures, after the rate / GST % changed */
function focRecalc(pid){
  const d=OM.focDraft[pid],lpe=OM.meta.litres_per_ea||20,dlp=focDlpOf(d);
  document.querySelectorAll(`#om-foc-body-${pid} tr[data-i]`).forEach(tr=>{
    const r=d.rows[+tr.dataset.i],cells=focCells(focCalc(wholeN(r.p),wholeN(r.f),dlp,lpe));
    const set=(c,v)=>{const td=tr.querySelector(`[data-c="${c}"]`);if(td)td.textContent=v;};
    set('dlp',dlp!=null?money2(dlp):'—');['pct','after','perl','total','units'].forEach((c,j)=>set(c,cells[j]));
  });
}
function focChange(e){
  const t=e.target,k=t.dataset&&t.dataset.foc;if(!k)return;
  const pid=+t.dataset.pid,d=OM.focDraft[pid];if(!d)return;
  if(k==='type'){d.mrp_type=t.value;focDirty(pid);focRedraw(pid);}
  else if(k==='file'){const f=t.files&&t.files[0];t.value='';if(f)focLoadFile(pid,f);}
}
function focRedraw(pid){const el=$('om-foc-'+pid),p=(OM.meta.products||[]).find(x=>x.pid===pid);if(el&&p){const tmp=document.createElement('div');tmp.innerHTML=focSkuCard(p);el.replaceWith(tmp.firstElementChild);}focTabUpdate(pid);}
function focTab(pid){OM.focPid=pid;drawFoc();}
function focEdit(pid){const d=OM.focDraft[pid];if(!d)return;d.edit=true;d.sel=new Set();focRedraw(pid);}
function focRowAdd(pid){const d=OM.focDraft[pid];if(!d)return;d.rows.push({p:'',f:''});focDirty(pid);focRedraw(pid);const i=d.rows.length-1,el=document.querySelector(`#om-foc-body-${pid} [data-foc="p"][data-i="${i}"]`);if(el)el.focus();}
function focRowDel(pid,i){const d=OM.focDraft[pid];if(!d)return;d.rows.splice(i,1);d.err={};d.sel=new Set();focDirty(pid);focRedraw(pid);}
function focReset(pid){OM.focDraft[pid]=focDraftsFromMeta()[pid];focRedraw(pid);toast('Changes discarded');}
function focChk(pid,i,on){const d=OM.focDraft[pid];if(!d)return;if(on)d.sel.add(i);else d.sel.delete(i);focRedraw(pid);}
function focChkAll(pid,on){const d=OM.focDraft[pid];if(!d)return;d.sel=on?new Set(d.rows.map((r,i)=>i)):new Set();focRedraw(pid);}
async function focDelSel(pid){
  const d=OM.focDraft[pid];if(!d||!d.sel.size)return;
  const n=d.sel.size;
  const ok=await showModal({title:`Delete ${fmtN(n)} row${n===1?'':'s'}`,body:`${fmtN(n)} selected row${n===1?'':'s'} will be removed from this list. The list changes for orders only after you press Save.`,confirmText:`Delete ${fmtN(n)}`,confirmClass:'btn-d'});
  if(!ok)return;
  d.rows=d.rows.filter((r,i)=>!d.sel.has(i));d.sel=new Set();d.err={};focDirty(pid);focRedraw(pid);
}
async function focSave(pid){
  const d=OM.focDraft[pid];if(!d)return;
  const eg=$('om-foc-e-'+pid),em=$('om-foc-e-mrp-'+pid);if(eg)eg.textContent='';if(em)em.textContent='';d.err={};
  const rows=d.rows.filter(r=>r.p!==''||r.f!=='');   // an empty row is dropped
  const bad={};rows.forEach((r,i)=>{if(wholeN(r.p)==null||wholeN(r.p)<1)bad['p'+i]='Whole number, 1 or more.';if(wholeN(r.f)==null||wholeN(r.f)<0)bad['f'+i]='Whole number, 0 or more.';});
  const seen={};rows.forEach((r,i)=>{const n=wholeN(r.p);if(n!=null){if(seen[n]!=null)bad['p'+i]='This Purchase Qty is already in the list.';seen[n]=i;}});
  if(Object.keys(bad).length){d.rows=rows;d.err=bad;focRedraw(pid);const e2=$('om-foc-e-'+pid);if(e2)e2.textContent='Please fix the highlighted cells (hover a cell for the reason).';return;}
  try{
    const j=await omPost('save_foc_list',{pid,gst:d.gst,dlp:d.dlp,mrp:d.mrp,mrp_type:d.mrp_type,rows:rows.map(r=>({purchase:+r.p,free:+r.f}))});
    OM.meta.foc=j.foc;OM.meta.foc_info=j.foc_info;if(j.prices)OM.meta.prices=j.prices;
    OM.focDraft[pid]=focDraftsFromMeta()[pid];focRedraw(pid);toast('FOC list saved');
  }catch(err){
    if(err.fields){Object.keys(err.fields).forEach(k=>{const m=/^(purchase|free)_(\d+)$/.exec(k);if(m)d.err[(m[1]==='purchase'?'p':'f')+m[2]]=err.fields[k];else if(k==='mrp'||k==='dlp'||k==='gst'){const x=$('om-foc-e-'+k+'-'+pid);if(x)x.textContent=err.fields[k];}});
      d.rows=rows;focRedraw(pid);const e2=$('om-foc-e-'+pid);if(e2)e2.textContent=err.message||'Please fix the highlighted cells.';}
    else toast('Error: '+err.message,'er');
  }
}
/* Excel: the formula sheet (Sr. No. | SKU | Quantity | FOC | Total Quantity | Quantity in Litre | Rate | Amount) or the chart's own columns (Purchase Quantity | Free Quantity).
   Only Quantity and FOC are read; everything else is calculated here. The rows fill the SKU's list on screen - nothing is saved until Save is pressed. */
async function focReadSheet(file){
  if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw new Error('Please choose an Excel file (.xlsx).');
  if(file.size>5*1024*1024)throw new Error('This file is larger than 5 MB.');
  await ensureXlsx();
  let wb;try{wb=XLSX.read(await file.arrayBuffer(),{type:'array'});}catch(e){throw new Error('This file could not be read as an Excel sheet.');}
  const ws=wb.Sheets[wb.SheetNames[0]];if(!ws||!ws['!ref'])throw new Error('The sheet is empty.');
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:true});
  const QK=['quantity','purchasequantity','purchasequantityinea','purchaseqty','qty','orderqty'],FK=['foc','freequantity','freequantityinea','freeqty','focqty','free'];
  let h=-1,cq=-1,cf=-1;
  for(let i=0;i<Math.min(aoa.length,20)&&h<0;i++){
    let q=-1,f=-1;
    (aoa[i]||[]).forEach((c,j)=>{const k=hdrKey(c);if(q<0&&QK.includes(k))q=j;else if(f<0&&FK.includes(k))f=j;});
    if(q>=0&&f>=0){h=i;cq=q;cf=f;}
  }
  if(h<0)throw new Error('The Quantity and FOC columns were not found. Please use the sheet format (button “Sheet format”).');
  const cand=[];
  for(let i=h+1;i<aoa.length;i++){
    const r=aoa[i]||[],p=r[cq],f=r[cf];
    if(typeof p!=='number'||typeof f!=='number')continue;   // blank rows and the "As per Price List" / "2+3" description row
    cand.push({p,f,text:r.some(c=>typeof c==='string'&&c.trim()!==''),row:i+1});
  }
  let use=cand.filter(c=>c.text);if(!use.length)use=cand;   // the numbered row under the headings (1 2 3 ...) has no text; a bare two-column sheet has none either
  if(!use.length)throw new Error('No rows with a Quantity and an FOC were found under the headings.');
  const bad=use.find(c=>!Number.isInteger(c.p)||c.p<1||!Number.isInteger(c.f)||c.f<0);
  if(bad)throw new Error(`Row ${bad.row}: Quantity must be a whole number (1 or more) and FOC a whole number (0 or more).`);
  const seen={},dup=use.find(c=>seen[c.p]?true:(seen[c.p]=1,false));
  if(dup)throw new Error(`Row ${dup.row}: the Quantity ${fmtN(dup.p)} appears twice.`);
  if(use.length>100)throw new Error('A FOC list can have at most 100 rows.');
  return use.map(c=>({p:String(c.p),f:String(c.f)}));
}
async function focLoadFile(pid,file){
  const d=OM.focDraft[pid];if(!d)return;
  const x=$('om-foc-e-'+pid);if(x)x.textContent='';
  try{
    const rows=(await focReadSheet(file)).sort((a,b)=>a.p-b.p);
    d.rows=rows;d.err={};d.edit=true;d.sel=new Set();focDirty(pid);focRedraw(pid);
    toast(`${rows.length} rows loaded from ${file.name} - check them, then press Save`);
  }catch(e){if(x)x.textContent=e.message;toast(e.message,'er');}
}
/* the "New order formula sheet" layout, filled with the SKU's current list */
async function focTemplate(pid){
  const p=(OM.meta.products||[]).find(x=>x.pid===pid),d=OM.focDraft[pid];if(!p||!d)return;
  try{
    await ensureXlsx();
    const lpe=OM.meta.litres_per_ea||20,dlp=focDlpOf(d);
    const src=d.rows.filter(r=>wholeN(r.p)!=null&&wholeN(r.f)!=null);
    const aoa=[['Sr. No.','','Quantity','FOC','Total Quantity','Quantity in Litre','Rate (per EA)','Amount'],[1,'',2,3,4,5,6,7],[],['','','','As per Price List','2+3','Column 4*SKU','As per Price List','4*6'],[],[]];
    src.forEach((r,i)=>{const row=7+i,q=+r.p,f=+r.f;aoa.push([i+1,p.name,q,f,{t:'n',f:`C${row}+D${row}`,v:q+f},{t:'n',f:`E${row}*${lpe}`,v:(q+f)*lpe},
      dlp!=null?{t:'n',f:`${dlp}*C${row}/E${row}`,v:dlp*q/(q+f)}:'',dlp!=null?{t:'n',f:`E${row}*G${row}`,v:dlp*q}:'']);});
    const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:8},{wch:26},{wch:10},{wch:18},{wch:14},{wch:16},{wch:16},{wch:12}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'FOC');
    XLSX.writeFile(wb,'FOC list - '+p.name.replace(/[^A-Za-z0-9 _-]+/g,' ').trim()+'.xlsx');
  }catch(e){toast('Could not create the sheet: '+e.message,'er');}
}
async function addProduct(){
  const el=$('om-prod-name'),err=$('om-e-name');err.textContent='';
  const name=el.value.trim(),brand=$('om-prod-brand').value;
  if(!name){err.textContent='Enter the SKU name.';return;}
  try{
    const j=await omPost('add_product',{name,brand});
    OM.meta.items=j.items;OM.meta.products=j.products;OM.meta.stock=j.stock;OM.meta.prices=j.prices;OM.meta.foc=j.foc;if(j.foc_info)OM.meta.foc_info=j.foc_info;
    toast('SKU added');drawInventory();
  }catch(e){err.textContent=e.message;}
}
async function deleteProduct(pid){
  const x=(OM.meta.stock||[]).find(s=>s.pid===pid);if(!x)return;
  const ok=await showModal({title:'Delete SKU',body:`“${x.item}” will be removed along with its price, GST %, available quantity and FOC rules. Orders that already contain it are not changed.`,confirmText:'Delete',confirmClass:'btn-d'});
  if(!ok)return;
  try{
    const j=await omPost('delete_product',{pid});
    OM.meta.items=j.items;OM.meta.products=j.products;OM.meta.stock=j.stock;OM.meta.prices=j.prices;OM.meta.foc=j.foc;if(j.foc_info)OM.meta.foc_info=j.foc_info;
    toast('SKU deleted');drawInventory();
  }catch(e){toast('Error: '+e.message,'er');}
}
function stockCard(){
  const st=OM.meta.stock||[],on=stockOn();
  return `<div class="as"><h3>Available quantity (stock)</h3>
      <label class="om-chk"><input type="checkbox" id="om-stock-on" data-act="stock-toggle"${on?' checked':''}> <b>Use stock quantity</b></label>
      <p class="om-psub">Tick this to keep a stock quantity. When it is <b>not ticked</b> there is no stock concept at all: no available quantity is shown on the New Order page, orders are never limited and nothing is deducted.
      When it is <b>ticked</b>, the quantity (EA) of each product still available is shown on the New Order page (Rohan Energy and HPCL) and an order cannot ask for more than this. <b>It reduces by itself</b> when an order is <b>approved</b> (not when it is submitted, so pending and rejected orders do not use it). An order cannot be approved if the available quantity does not cover it. When new stock arrives, type the new available total and save. Leave a product blank for no limit.</p>
      <div id="om-stock-body"${on?'':' style="display:none"'}>
      <div class="om-minrow">${st.map(x=>`<div class="field"><label>${esc(x.item)} (EA)</label><input type="text" inputmode="numeric" autocomplete="off" class="om-qty om-stock-ea" data-item="${esc(x.item)}" value="${x.ea==null?'':x.ea}" placeholder="No limit">${x.total!=null&&x.used>0?`<div class="om-hint">${fmtN(x.total)} EA set${x.at?' on '+esc(fmtDT(x.at)):''} − ${fmtN(x.used)} EA approved since</div>`:''}<div class="om-field-err" id="om-e-stock_${x.pid}"></div></div>`).join('')}</div>
      <div class="om-hint">${st.some(x=>x.at)?`Last changed by ${esc((st.find(x=>x.at)||{}).by||'admin')} on ${esc(fmtDT((st.find(x=>x.at)||{}).at))}`:'Not set yet - no limit.'}</div></div>
      <div class="om-minrow" style="margin-top:10px"><button class="btn-p" data-act="stock-save">Save</button></div></div>`;
}
async function saveStock(){
  document.querySelectorAll('[id^=om-e-stock_]').forEach(e=>e.textContent='');
  const stock=[...document.querySelectorAll('.om-stock-ea')].map(el=>({item:el.dataset.item,ea:el.value.trim()}));
  const cb=$('om-stock-on'),enabled=!!(cb&&cb.checked);
  try{
    const j=await omPost('set_stock',{stock,enabled});
    OM.meta.stock=j.stock;OM.meta.stock_enabled=!!j.stock_enabled;toast(j.stock_enabled?'Stock saved':'Stock switched off — no stock limits are applied');drawInventory();
  }catch(e){
    if(e.fields)Object.keys(e.fields).forEach(k=>{const el=$('om-e-'+k);if(el)el.textContent=e.fields[k];});
    else toast('Error: '+e.message,'er');
  }
}
async function saveMinOrder(){
  const el=$('om-min-ea'),err=$('om-e-min_ea');err.textContent='';
  const raw=el.value.trim();
  if(raw!==''&&!(/^\d+$/.test(raw)&&+raw<=OM.meta.min_order.max)){err.textContent=`Enter a whole number between 0 and ${fmtN(OM.meta.min_order.max)}.`;return;}
  try{
    const j=await omPost('set_min_order',{min_ea:raw===''?0:+raw});
    OM.meta.min_order=j.min_order;
    toast(j.min_order.ea>0?`Minimum order set to ${fmtN(j.min_order.ea)} EA`:'Minimum order removed');
    drawInventory();
  }catch(e){err.textContent=e.message;}
}
/* ── admin: Permissions (what HPCL officers may do, and how the Tax Invoice is made) ── */
const PERM_DEFS=[
  {key:'hpcl_edit_rates',title:'Allow HPCL officers to edit product rates',
   on:'HPCL officers get the “₹ Set prices & GST %” button and can change the price and GST % of every product.',
   off:'Only Rohan Energy officers set the product prices and GST %. HPCL officers see the rates but cannot change them.'},
  {key:'auto_invoice',title:'Auto-generate the Tax Invoice',
   on:'Approving an order (placed by HPCL or by Rohan Energy) generates the Sales Order and the Tax Invoice (with its number and QR code).',
   off:'Approving generates only the Sales Order. The Tax Invoice is then uploaded from the order page (PDF, Word, Excel, CSV or image) — by you or by a Rohan Energy officer, for orders placed by HPCL and by Rohan Energy alike. HPCL officers can view and download it. The choice is fixed on each order when it is approved.'},
  {key:'hpcl_receipt',title:'Allow HPCL officers to upload the payment receipt',
   on:'Rohan Energy and HPCL officers can both upload the payment receipt.',
   off:'Only Rohan Energy officers can upload the payment receipt. HPCL officers can still view and download it.'},
  {key:'hpcl_tax_invoice',title:'Allow HPCL to see the Tax Invoice',
   on:'Everybody at HPCL who can see an order (officers, outlets, the HPCL Super Admin) sees its Tax Invoice (number, PDF / uploaded file, download) next to the Sales Order.',
   off:'The Tax Invoice is hidden from HPCL (officers, outlets and the HPCL Super Admin): they see the Sales Order only - no Tax Invoice button, number or file, in the order lists, the order page and the RO Report. Rohan Energy officers and the Rohan Energy Super Admin still see it.'}
];
async function renderPerms(){
  const sec=$('tab-perms');if(!sec)return;
  sec.innerHTML='<div class="om-empty">Loading…</div>';
  try{await refreshMeta();}   // fresh, so the page shows what is saved
  catch(e){sec.innerHTML=`<div class="om-empty" style="color:#e02424">Could not load: ${esc(e.message)}</div>`;return;}
  if(OM.current!=='perms')return;
  drawPerms();
}
function drawPerms(){
  const sec=$('tab-perms');if(!sec)return;
  const p=perms();
  sec.innerHTML=`<div class="as"><h3>Permissions</h3><p class="om-psub">Tick what you want to allow, then press Save. A change applies to everyone straight away. Orders that are already approved keep the way their Tax Invoice was made.</p>
    ${PERM_DEFS.map(d=>`<label class="om-perm"><input type="checkbox" data-perm="${d.key}"${p[d.key]?' checked':''}><span><b>${esc(d.title)}</b>
      <span class="om-sub" data-perm-hint="${d.key}">${esc(p[d.key]?d.on:d.off)}</span></span></label>`).join('')}
    <div class="om-perm-ret"><h4>Return approval</h4><p class="om-sub">Anybody who can see a completed order (Super Admin, Zone Officer, Regional Officer) can request its return with a reason and a credit note. Choose who may <b>approve or reject</b> a return — they decide the returns of their own zone / regions. Tick one or more:</p>
      <div class="om-ret-grid">${RET_ORGS.map(([og,on])=>`<div class="om-ret-org"><div class="om-ret-h">${esc(on)}</div>${RET_LVLS.map(([lv,ln])=>`<label class="om-perm om-perm-s"><input type="checkbox" data-perm="ret_${og}_${lv}"${p['ret_'+og+'_'+lv]?' checked':''}><span><b>${esc(ln)}</b></span></label>`).join('')}</div>`).join('')}</div>
      <div class="om-sub" id="om-ret-sum"></div></div>
    <div class="om-perm-foot"><button class="btn-p" data-act="perms-save">Save permissions</button><span class="om-field-err" id="om-perms-err"></span>
      <span class="om-hint">${p.at?`Last changed by ${esc(p.by||'admin')} on ${esc(fmtDT(p.at))}`:'Not changed yet — these are the standard settings.'}</span></div></div>`;
  const retSum=()=>{
    const on=[];RET_ORGS.forEach(([og,n])=>RET_LVLS.forEach(([lv,l])=>{const c=sec.querySelector(`input[data-perm="ret_${og}_${lv}"]`);if(c&&c.checked)on.push(n+' '+l);}));
    const el=$('om-ret-sum');if(el)el.textContent=on.length?'Returns are approved by: '+on.join(', ')+'.':'⚠ Nobody is ticked: returns can be requested but nobody can approve them.';
  };
  retSum();
  sec.querySelectorAll('input[data-perm]').forEach(cb=>cb.addEventListener('change',()=>{
    const d=PERM_DEFS.find(x=>x.key===cb.dataset.perm),h=sec.querySelector(`[data-perm-hint="${cb.dataset.perm}"]`);
    if(d&&h)h.textContent=cb.checked?d.on:d.off;
    if(/^ret_/.test(cb.dataset.perm))retSum();
  }));
}
async function savePerms(){
  const err=$('om-perms-err');if(err)err.textContent='';
  const sec=$('tab-perms'),body={};
  sec.querySelectorAll('input[data-perm]').forEach(cb=>{body[cb.dataset.perm]=cb.checked;});
  const btn=sec.querySelector('[data-act="perms-save"]');if(btn)btn.disabled=true;
  try{
    const j=await omPost('set_perms',{perms:body});
    OM.meta.perms=j.perms;toast('Permissions saved');drawPerms();
  }catch(e){
    if(btn)btn.disabled=false;
    if(err)err.textContent=e.message;
  }
}
async function addUser(){
  const err=$('om-nu-err');err.textContent='';
  const label=$('om-nu-name').value.trim(),username=$('om-nu-user').value.trim(),org=$('om-nu-org').value,password=$('om-nu-pass').value.trim();
  if(!label||!username||!password){err.textContent='Fill in name, username and password.';return;}
  if(password.length<8){err.textContent='The password must be at least 8 characters.';return;}
  const zb=zpBody('om-nu');
  if(!zb){err.textContent='Tick at least one zone (or region).';return;}
  try{
    await authPost('add_user',Object.assign({username,password,label,role:'zone',org},zb));
    toast(`Zone Officer ${username} created`);
    refreshUsers();
  }catch(e){err.textContent=e.message;}
}
function openUserEdit(u){
  const x=orderUsers().find(o=>o.username===u);if(!x)return;
  if(x.level==='regional'){openRegionalEdit(u);return;}
  const kids=orderUsers().filter(r=>r.createdBy===u).length;
  const ov=$('om-overlay');
  ov.innerHTML=`<div class="om-box om-bulk"><h3>Edit Zone Officer — ${esc(x.username)}</h3>
    <div class="om-grid om-grid3" style="margin-top:12px">
      <div class="field"><label>Full name</label><input type="text" id="om-ue-name" maxlength="60" value="${esc(x.label)}"></div>
      <div class="field"><label>Username</label><input type="text" id="om-ue-user" maxlength="40" value="${esc(x.username)}" autocomplete="off"></div>
      <div class="field"><label>Password</label><div class="om-ro-note">Use <b>Reset password</b> in the list</div></div>
      <div class="field"><label>E-mail</label><input type="email" id="om-ue-email" maxlength="80" value="${esc(x.email)}" autocomplete="off"></div>
      <div class="field"><label>Mobile</label><input type="text" id="om-ue-mobile" maxlength="20" value="${esc(x.mobile)}" autocomplete="off"></div>
    </div><div class="om-hint">Changing the username keeps all their orders and Regional Officers; they sign in with the new username and the same password.</div>
    <div class="om-grid om-grid1" style="margin-top:12px">
    <div class="field"><label>Organization</label><select id="om-ue-org">${OM.hsuper?'':`<option value="rohan"${x.org==='rohan'?' selected':''}>Rohan Energy</option>`}<option value="hpcl"${x.org==='hpcl'?' selected':''}>HPCL</option></select>${kids?`<div class="om-hint">Changing the organization also moves this officer's ${kids} Regional Officer${kids===1?'':'s'} to it.</div>`:''}</div>
    <div class="field om-zfield"><label>Zones &amp; regions</label>${zonePicker('om-ue',(x.ros&&x.ros.length)?x.ros:allRosOf(sheetZonesOf(x)))}${kids?`<div class="om-hint">${kids} Regional Officer${kids===1?'':'s'} work under this officer: every region they handle must stay ticked (move them to another Zone Officer first if you want to drop a region).</div>`:`<div class="om-hint">Tick every zone this officer covers; untick a region to leave it out.</div>`}</div></div>
    ${x.username===OM.user?'':pagesBlock('ue',{admin:false,org:x.org,level:'zone',hiddenPages:x.hiddenPages})}
    <div class="om-field-err" id="om-ue-err"></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button><button class="btn-p" data-act="user-edit-save" data-user="${esc(x.username)}">Save changes</button></div></div>`;
  ov.classList.add('show');
  zpSyncAll(ov);
}
async function saveUserEdit(u){
  const err=$('om-ue-err');err.textContent='';
  const label=$('om-ue-name').value.trim(),org=$('om-ue-org').value;
  if(!label){err.textContent='Enter a name.';return;}
  const zb=zpBody('om-ue');
  if(!zb){err.textContent='Tick at least one zone (or region).';return;}
  const nu=$('om-ue-user').value.trim();
  if(!/^[A-Za-z0-9_]{1,40}$/.test(nu)){err.textContent='The username can only contain letters, numbers and underscores.';return;}
  const x=orderUsers().find(o=>o.username===u),kids=orderUsers().filter(r=>r.createdBy===u).length;
  if(x&&x.org!==org&&kids){
    const go=await showModal({title:'Change organization',body:`${x.label} and ${kids} Regional Officer${kids===1?'':'s'} will move from ${ORG_LBL[x.org]} to ${ORG_LBL[org]}.`,confirmText:'Change',confirmClass:'btn-p'});
    if(!go)return;
  }
  try{
    const body=Object.assign({username:u,role:'zone',label,org,email:$('om-ue-email').value.trim(),mobile:$('om-ue-mobile').value.trim()},zb);
    const pg=pagesPicked('ue');if(pg&&pg.error){err.textContent=pg.error;return;}if(pg)body.hidden_pages=pg.hidden;
    if(nu!==u)body.new_username=nu;
    await authPost('update_user_access',body);
    renamedOpen(u,nu);closeModal();toast('Zone Officer updated');refreshUsers();
  }catch(e){err.textContent=e.message;}
}
function openUserPw(u){
  const ov=$('om-overlay');
  ov.innerHTML=`<div class="om-box om-narrow"><h3>Reset password — ${esc(u)}</h3><div class="om-grid om-grid1" style="margin-top:12px">
    <div class="field"><label>New password</label>${pwBox('om-up-pass','Min 8 characters')}</div></div>
    <div class="om-field-err" id="om-up-err"></div>
    <div class="om-foot"><button class="btn-g" data-act="close">Cancel</button><button class="btn-p" data-act="user-pw-save" data-user="${esc(u)}">Reset password</button></div></div>`;
  ov.classList.add('show');
  setTimeout(()=>{const i=$('om-up-pass');if(i)i.focus();},50);
}
async function saveUserPw(u){
  const err=$('om-up-err');err.textContent='';
  const password=$('om-up-pass').value.trim();
  if(password.length<8){err.textContent='The password must be at least 8 characters.';return;}
  try{await authPost('update_user_password',{username:u,password});closeModal();toast('Password reset');}
  catch(e){err.textContent=e.message;}
}
async function deleteUser(u){
  const ok=await showModal({title:'Remove user',body:`${u} will lose access immediately. Orders they created stay on record.`,confirmText:'Remove',confirmClass:'btn-d'});
  if(!ok)return;
  try{await authPost('delete_user',{username:u});toast('User removed');refreshUsers();}
  catch(e){toast('Error: '+e.message,'er');}
}

window.OM=OM;
try{if(typeof currentUser!=='undefined'&&currentUser&&!OM.kind)init(currentUser);}catch(e){}   // enterApp ran before this script loaded
})();
