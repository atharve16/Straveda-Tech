/* mis.js — the MIS page (tab "MIS", visible to every signed-in user).
 * It shows the four sheets of the "MIS MTD <month>" Excel workbook, live from mis.php:
 *   1. SECONDARY RO_BZR Wise  the data rows. Super Admin and Rohan Energy officers press "Edit", click any cell, type, and it saves by itself.
 *   2. Region Wise, 3. SA Wise, 4. MOM Secondary Sales State wise   reports calculated from those rows (nobody types in them)
 * HPCL officers can only read and download. "Download Excel" gives the workbook in the original layout, with the current figures.
 * Open pages notice a change made by anybody within ~20 seconds.
 * Editors can also tick several rows (or "select all") and delete them at once, and upload a new Excel to replace / extend the data.
 * The Dashboard and Raw Data read the very same rows (api.php), so every change here shows there too.
 */
(function(){
'use strict';
const POLL_MS=20000,PER=100;
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SHEETS=[
  {id:1,name:'SECONDARY RO_BZR Wise',short:'Data'},
  {id:2,name:'Region Wise',short:'Region Wise'},
  {id:3,name:'SA Wise',short:'SA Wise'},
  {id:4,name:'MOM Secondary Sales State wise',short:'State wise'}
];
// the columns of the data sheet, as in Excel: [key, heading, kind, list]
const COLS=[['d','Date','date'],['t','Sale Type ( HPCL Retail Outlet /Bazaar','text','t'],['o','Retail Outlet Name / Bazaar Direct Customer','text'],['s','SAP Code','text'],
  ['l','Location /Address','text'],['di','District','text'],['st','State','text','st'],['sa','Sales Area','text','sa'],['ro','Regional Office','text','ro'],['z','Zone','text','z'],
  ['i','Item Name','text','i'],['e','Volume in EA','num'],['v','Volume in Litres','num']];
const COL=Object.fromEntries(COLS.map(c=>[c[0],c]));
const ST={sel:new Set(),selAll:false,up:null,sheet:1,data:null,rev:null,timer:null,busy:false,again:false,lists:null,built:false,edit:false,cell:null,stale:false,saving:0,
  q:{month:'',zone:'',state:'',q:'',sort:'desc',page:1},dl:false,searchT:null,refT:null};
let toolsBuilt=false;
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v==null||v===''?'':Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
const toast=(m,t)=>{if(typeof showToast==='function')showToast(m,t||'ok');};
const dShow=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
const mShow=m=>MON[+m.slice(5,7)-1]+'-'+m.slice(2,4);
const canEdit=()=>!!(ST.data&&ST.data.can_edit);
const editing=()=>ST.edit&&canEdit();
const nbsp=s=>String(s==null?'':s).replace(/ /g,' ');

/* ── server ── */
async function parse(r){
  let j=null;try{j=await r.json();}catch(e){throw new Error('Unexpected response from the server ('+r.status+').');}
  if(!r.ok||!j||!j.ok){const e=new Error((j&&j.error)||'Request failed.');e.status=r.status;throw e;}
  return j;
}
/* the sheet, month / zone / state / search / sort / page stay after a refresh: kept in this browser tab's session storage (cleared on sign-out) */
const KEEP='portalMis';
const me=()=>{try{return (typeof currentUser!=='undefined'&&currentUser&&currentUser.username)||'';}catch(e){return '';}};
function keepSave(){try{sessionStorage.setItem(KEEP,JSON.stringify({u:me(),sheet:ST.sheet,q:ST.q}));}catch(e){}}
function keepRestore(){
  try{
    const k=JSON.parse(sessionStorage.getItem(KEEP)||'null');
    if(!k||!k.u||k.u!==me()||!k.q)return;
    ST.sheet=[1,2,3,4].includes(k.sheet)?k.sheet:1;
    const q=k.q;ST.q={month:String(q.month||''),zone:String(q.zone||''),state:String(q.state||''),q:String(q.q||''),sort:q.sort==='asc'?'asc':'desc',page:Math.max(1,parseInt(q.page,10)||1)};
  }catch(e){}
}
function query(){
  keepSave();
  const p=new URLSearchParams({action:'get',per:PER,sort:ST.q.sort,page:ST.q.page,lists:'1'});
  for(const k of ['month','zone','state','q'])if(ST.q[k])p.set(k,ST.q[k]);
  if(ST.sheet!==1)p.set('pivots','1');
  return p;
}
async function load(silent){
  if(ST.busy){ST.again=true;return;}   // a request is in flight: run once more with the newest filters when it ends
  ST.busy=true;
  try{
    const j=await fetch('mis.php?'+query(),{credentials:'same-origin'}).then(parse);
    ST.data=j;ST.rev=j.rev;if(j.lists)ST.lists=j.lists;
    live(true);paint();
  }catch(e){
    if(e.status===401){live(false,'Signed out');return;}
    if(!silent)toast('Could not load the MIS: '+e.message,'er');
    live(false);
  }finally{ST.busy=false;if(ST.again){ST.again=false;load(true);}}
}
async function post(action,data){
  const body=Object.assign({},data,{action,csrf:typeof _csrf==='string'?_csrf:''});
  return fetch('mis.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(parse);
}
async function poll(){
  if(document.hidden||ST.busy||ST.cell||ST.saving)return;
  try{
    const j=await fetch('mis.php?action=ver',{credentials:'same-origin'}).then(parse);
    live(true);
    if(ST.rev!==null&&j.rev!==ST.rev)load(true);
  }catch(e){live(false);}
}
function live(on,txt){
  const el=$('mis-live');if(!el)return;
  el.className='mis-live '+(on?'on':'off');
  const t=$('mis-live-t');if(t)t.textContent=on?'Live':(txt||'Reconnecting…');
}

/* ── page ── */
function build(){
  const root=$('mis-root');if(!root)return;
  root.innerHTML=
   '<div class="mis-top"><div><div class="mis-co" id="mis-title">MIS</div><div class="mis-sub" id="mis-sub"></div></div>'+
   '<div class="mis-ctl"><span class="mis-live" id="mis-live"><i></i><span id="mis-live-t">Live</span></span><span class="mis-role" id="mis-role"></span>'+
   '<button class="mis-btn" id="mis-up" data-act="up" style="display:none"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Excel</button><input type="file" id="mis-file" accept=".xlsx,.xls,.csv" style="display:none">'+
   '<button class="mis-btn" id="mis-log" data-act="log" title="Who changed what on this page"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg> Log</button>'+
   '<button class="mis-btn pri" id="mis-dl" data-act="dl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Excel</button></div></div>'+
   '<div id="mis-warn"></div>'+
   '<div class="mis-tabs" id="mis-tabs">'+SHEETS.map(s=>'<button type="button" data-sheet="'+s.id+'"><b>'+esc(s.short)+'</b><small>'+esc(s.name)+'</small></button>').join('')+'</div>'+
   '<div id="mis-tools"></div><div id="mis-view"></div><div id="mis-lists"></div>';
  ST.built=true;toolsBuilt=false;
  root.addEventListener('click',onClick);root.addEventListener('change',onChange);root.addEventListener('input',onInput);root.addEventListener('focusin',onFocusIn);
}
function paint(){
  const d=ST.data;if(!d)return;
  if(ST.sheet!==1&&!d.pivots){ST.again=true;return;}   // an answer meant for another sheet: ask again for this one
  $('mis-title').textContent=d.title;
  $('mis-sub').textContent='Secondary sales · '+(d.last&&d.last.at?'last change '+when(d.last.at)+(d.last.by?' by '+d.last.by:''):'workbook figures');
  $('mis-role').textContent=d.can_edit?(ST.edit?'Editing':'You can edit'):'View & download only';
  $('mis-role').className='mis-role '+(d.can_edit?'ed':'vo');
  $('mis-up').style.display=d.can_edit?'':'none';
  $('mis-warn').innerHTML=d.warn?'<div class="mis-note warn">'+esc(d.warn)+'</div>':'';
  document.querySelectorAll('#mis-tabs button').forEach(b=>b.classList.toggle('on',+b.dataset.sheet===ST.sheet));
  if(ST.sheet===1){paintTools();if(ST.cell||ST.saving)ST.stale=true;else paintData();}
  else{$('mis-tools').innerHTML='';toolsBuilt=false;paintPivots();}
}
function when(s){   // 2026-11-06 12:41:05 -> 6 Nov, 12:41
  const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(s||'');return m?(+m[3])+' '+MON[+m[2]-1]+', '+m[4]+':'+m[5]:'';
}

/* sheet 1 */
function opt(v,l,sel){return '<option value="'+esc(v)+'"'+(sel?' selected':'')+'>'+esc(l)+'</option>';}
function paintTools(){
  const d=ST.data,q=ST.q;
  // a saved month / zone / state that no longer exists goes back to "All" (and the list is asked for again)
  if(q.month&&!d.months.some(m=>m.m===q.month)){q.month='';ST.again=true;}
  if(q.zone&&!d.zones.includes(q.zone)){q.zone='';ST.again=true;}
  if(q.state&&!d.states.includes(q.state)){q.state='';ST.again=true;}
  if(!toolsBuilt){
    $('mis-tools').innerHTML='<div class="mis-tools"><select id="mis-f-month" aria-label="Month"></select><select id="mis-f-zone" aria-label="Zone"></select><select id="mis-f-state" aria-label="State"></select>'+
      '<input type="search" id="mis-f-q" placeholder="Search outlet, SAP code, sales area…" autocomplete="off">'+
      '<button type="button" class="mis-btn" data-act="sort" id="mis-sort"></button>'+
      '<button type="button" class="mis-btn" data-act="edit" id="mis-edit" style="display:none"></button>'+
      '<button type="button" class="mis-btn pri" data-act="add" id="mis-add" style="display:none">+ Add row</button></div><div class="mis-sum" id="mis-sum"></div>';
    $('mis-f-q').value=q.q;toolsBuilt=true;
  }
  $('mis-f-month').innerHTML=opt('','All months',!q.month)+d.months.map(m=>opt(m.m,mShow(m.m)+'  ('+m.n+' rows)',q.month===m.m)).join('');
  $('mis-f-zone').innerHTML=opt('','All zones',!q.zone)+d.zones.map(z=>opt(z,z,q.zone===z)).join('');
  $('mis-f-state').innerHTML=opt('','All states',!q.state)+d.states.map(z=>opt(z,z,q.state===z)).join('');
  $('mis-sort').textContent=q.sort==='desc'?'Newest first ↓':'Oldest first ↑';
  const eb=$('mis-edit');
  if(d.can_edit){eb.style.display='';eb.textContent=ST.edit?'✓ Done editing':'✎ Edit';eb.className='mis-btn'+(ST.edit?' on':'');}
  else eb.style.display='none';
  $('mis-add').style.display=editing()?'':'none';
  $('mis-sum').innerHTML='<b>'+fmt(d.total)+'</b> rows · <b>'+fmt(d.sum.ea)+'</b> EA · <b>'+fmt(d.sum.litres)+'</b> litres'+(editing()?'<span class="mis-tip"> · click a cell, type, press Enter — it saves by itself</span>':'');
}
function cellHtml(r,c){
  const k=c[0],v=r[k];
  if(k==='d')return esc(dShow(v))+(r.src==='order'?'<i class="mis-ord" title="From an approved order"></i>':'');
  if(c[2]==='num')return esc(fmt(v));
  return esc(nbsp(v));
}
function rowHtml(r){
  const ed=editing();
  return (ed?'<td class="chk"><input type="checkbox" data-chk="'+r.id+'" aria-label="Select this row"'+(ST.selAll||ST.sel.has(r.id)?' checked':'')+'></td>':'')+COLS.map(c=>'<td data-k="'+c[0]+'"'+(c[2]==='num'?' class="r"':c[0]==='d'?' class="dt"':'')+(ed?' tabindex="0"':'')+'>'+cellHtml(r,c)+'</td>').join('')+
    (ed?'<td class="act"><button type="button" class="mis-del" data-act="del" title="Delete this row" aria-label="Delete this row">×</button></td>':'');
}
function paintData(){
  const d=ST.data,ed=editing();ST.stale=false;
  let h=ed?selBarHtml():'';
  h+='<div class="mis-scroll tall"><table class="mis-tbl data'+(ed?' editing':'')+'"><thead><tr>'+(ed?'<th class="chk"><input type="checkbox" id="mis-chk-all" data-chk="all" aria-label="Select all rows on this page"></th>':'')+COLS.map(c=>'<th class="'+(c[2]==='num'?'r':'')+'">'+esc(c[1])+'</th>').join('')+(ed?'<th class="act"></th>':'')+'</tr></thead><tbody>';
  if(!d.rows.length)h+='<tr><td colspan="'+(ed?15:13)+'" class="mis-empty">No rows match.</td></tr>';
  for(const r of d.rows)h+='<tr data-row="'+r.id+'">'+rowHtml(r)+'</tr>';
  h+='</tbody></table></div>';
  h+='<div class="mis-pager"><button type="button" class="mis-btn" data-act="prev"'+(d.page<=1?' disabled':'')+'>‹ Previous</button><span>Page '+d.page+' of '+d.pages+'</span><button type="button" class="mis-btn" data-act="next"'+(d.page>=d.pages?' disabled':'')+'>Next ›</button></div>';
  h+='<div class="mis-foot"><i class="mis-ord"></i> marks a row that came from an approved order in the portal. '+(ed?'Every change is saved at once and shows for everybody (including HPCL) within seconds, and is in the next Excel download.':canEdit()?'Press <b>Edit</b> to change the figures.':'The figures are kept by Rohan Energy; you can download them any time.')+'</div>';
  $('mis-view').innerHTML=h;
  if(!ed&&window.stackLabels)window.stackLabels($('mis-view').querySelector('table.data'));   // phones: cards instead of a 13-column table
  $('mis-lists').innerHTML=ed?lists():'';
  if(ed)syncChkAll();
}
/* ── tick rows / select all / delete selected ── */
const selCount=()=>ST.selAll?(ST.data?ST.data.total:0):ST.sel.size;
function selBarHtml(){
  const n=selCount();if(!n)return '';
  const d=ST.data,pageAll=d.rows.length&&d.rows.every(r=>ST.sel.has(r.id));
  let t=ST.selAll?'<b>All '+fmt(n)+'</b> rows that match the current filter are selected':'<b>'+fmt(n)+'</b> row'+(n===1?'':'s')+' selected';
  if(!ST.selAll&&pageAll&&d.total>d.rows.length)t+=' · <a href="#" data-act="selall">Select all '+fmt(d.total)+' rows that match the filter</a>';
  return '<div class="mis-selbar" id="mis-selbar"><span>'+t+'</span><span class="mis-selbtn"><button type="button" class="mis-btn del" data-act="delsel">Delete '+(ST.selAll?'all '+fmt(n):'selected')+'</button><button type="button" class="mis-btn" data-act="selclear">Clear</button></span></div>';
}
function syncChkAll(){
  const a=$('mis-chk-all');if(!a||!ST.data)return;
  const rows=ST.data.rows,k=ST.selAll?rows.length:rows.filter(r=>ST.sel.has(r.id)).length;
  a.checked=rows.length>0&&k===rows.length;a.indeterminate=k>0&&k<rows.length;
}
function repaintSel(){   // only the bar and the ticks change: keep the table (and its scroll position) as it is
  const old=$('mis-selbar'),h=selBarHtml();
  if(old)old.remove();
  if(h){const v=$('mis-view'),w=document.createElement('div');w.innerHTML=h;v.insertBefore(w.firstChild,v.firstChild);}
  document.querySelectorAll('#mis-view input[data-chk]').forEach(c=>{if(c.dataset.chk!=='all')c.checked=ST.selAll||ST.sel.has(+c.dataset.chk);});
  syncChkAll();
}
function clearSel(){ST.sel.clear();ST.selAll=false;}
function onTick(e){
  const c=e.target.closest&&e.target.closest('input[data-chk]');if(!c)return false;
  if(c.dataset.chk==='all'){
    if(ST.selAll&&!c.checked)ST.selAll=false;   // un-ticking the page leaves the "everything" mode
    for(const r of ST.data.rows){if(c.checked)ST.sel.add(r.id);else ST.sel.delete(r.id);}
  }else{
    const id=+c.dataset.chk;
    if(ST.selAll){ST.selAll=false;for(const r of ST.data.rows)ST.sel.add(r.id);}   // one row un-ticked: back to the rows of this page
    if(c.checked)ST.sel.add(id);else ST.sel.delete(id);
  }
  repaintSel();return true;
}
async function deleteSelected(){
  const n=selCount();if(!n||!canEdit())return;
  commitNow();
  const msg='Delete '+(ST.selAll?'ALL '+fmt(n)+' rows that match the current filter':fmt(n)+' selected row'+(n===1?'':'s'))+'? They disappear from every sheet, from the Dashboard and Raw Data, and from the next Excel download. This cannot be undone.';
  let ok=true;
  if(typeof showModal==='function')ok=await showModal({title:'Delete '+fmt(n)+' row'+(n===1?'':'s'),body:msg,confirmText:'Delete '+fmt(n),confirmClass:'btn-d'});
  else ok=window.confirm(msg);
  if(!ok)return;
  const b=document.querySelector('[data-act="delsel"]');if(b)b.disabled=true;
  try{
    const body=ST.selAll?{all:true,filter:{month:ST.q.month,zone:ST.q.zone,state:ST.q.state,q:ST.q.q}}:{ids:[...ST.sel]};
    const j=await post('delete_rows',body);ST.rev=j.rev;
    toast(fmt(j.deleted)+' row'+(j.deleted===1?'':'s')+' deleted');
    clearSel();ST.q.page=1;load(true);
  }catch(e){toast(e.message,'er');if(b)b.disabled=false;}
}
function lists(){
  const L=ST.lists||{};let h='';
  for(const c of COLS)if(c[3])h+='<datalist id="mis-dl-'+c[0]+'">'+((L[c[0]]||[]).map(x=>'<option value="'+esc(x)+'">').join(''))+'</datalist>';
  return h;
}

/* sheets 2-4 */
function head(months,left){
  return '<tr>'+left.map(l=>'<th class="lh">'+esc(l)+'</th>').join('')+months.map(m=>'<th>'+MON[m-1]+'</th>').join('')+'<th class="gt">Grand Total</th></tr>';
}
function pivotRows(p,nl){
  let h='';
  for(const o of p.rows){
    const cls=o.k==='grand'?'grand':o.k==='sub'?'subt':'';
    let lab='';
    if(o.k==='grand')lab='<td class="lbl" colspan="'+nl+'">Grand Total</td>';
    else if(o.k==='sub')lab='<td class="lbl" colspan="'+nl+'">'+esc(nbsp(o.l[0]))+'</td>';
    else lab=o.l.slice(0,nl).map(x=>'<td class="lbl">'+esc(nbsp(x))+'</td>').join('');
    h+='<tr class="'+cls+'">'+lab+p.months.map(m=>{const v=o.c[m];return '<td class="r">'+(v==null?'':esc(fmt(v)))+'</td>';}).join('')+'<td class="r gt">'+esc(fmt(o.t))+'</td></tr>';
  }
  return h;
}
function pivotTable(p,left,nl,title,cls){
  if(!p||!p.rows.length||p.rows.length===1&&!p.months.length)return '<div class="mis-empty">No data yet.</div>';
  return (title?'<h3 class="mis-ph">'+esc(title)+'</h3>':'')+'<div class="mis-scroll"><table class="mis-tbl pv '+(cls||'')+'"><thead>'+head(p.months,left)+'</thead><tbody>'+pivotRows(p,nl)+'</tbody></table></div>';
}
function paintPivots(){
  const d=ST.data,pv=d.pivots||{};let h='';
  if(ST.sheet===2)h=pivotTable(pv[3],['Zone','Regional Office'],2,'Volume in Litres Total','a');
  else if(ST.sheet===3)h=pivotTable(pv[4],['Sales Area Name'],1,'Sales Area wise','b');
  else h=pivotTable(pv[6],['Zone','State'],2,'Volume in Litres Zone wise','c')+pivotTable(pv[5],['Item','State'],2,'Sum of Volume in Litres','d');
  h+='<div class="mis-foot">These figures are calculated from the data sheet in litres, so they follow every change made there'+(canEdit()?' — press <b>Edit</b> on the <a href="#" data-act="to-data">Data</a> tab, change a cell and this sheet updates for everybody':'')+'.</div>';
  $('mis-view').innerHTML=h;$('mis-lists').innerHTML='';
}

/* ── events ── */
function setSheet(id){
  if(ST.sheet===id)return;
  commitNow();
  if(id!==1){ST.edit=false;clearSel();}   // editing exists on the Data sheet only
  ST.sheet=id;toolsBuilt=false;$('mis-view').innerHTML='<div class="mis-note">Loading…</div>';
  load(false);
}
function onClick(e){
  const sb=e.target.closest('[data-sheet]');if(sb){setSheet(+sb.dataset.sheet);return;}
  const b=e.target.closest('[data-act]');
  if(b){
    const a=b.dataset.act;
    if(a==='to-data'){e.preventDefault();setSheet(1);}
    else if(a==='dl')download();
    else if(a==='log'){if(window.omChangeLog)window.omChangeLog('mis');}
    else if(a==='edit')toggleEdit();
    else if(a==='sort'){ST.q.sort=ST.q.sort==='desc'?'asc':'desc';ST.q.page=1;load(false);}
    else if(a==='prev'){ST.q.page=Math.max(1,ST.q.page-1);load(false);scrollTop();}
    else if(a==='next'){ST.q.page+=1;load(false);scrollTop();}
    else if(a==='add')addRow();
    else if(a==='del')deleteRow(b.closest('tr'));
    else if(a==='delsel')deleteSelected();
    else if(a==='selclear'){clearSel();repaintSel();}
    else if(a==='selall'){e.preventDefault();ST.selAll=true;repaintSel();}
    else if(a==='up'){const f=$('mis-file');if(f)f.click();}
    else if(a==='upx')closeUpload();
    else if(a==='upgo')runUpload();
    return;
  }
  const td=e.target.closest('td[data-k]');
  if(td&&editing()&&!td.querySelector('input'))startCell(td);
}
function onFocusIn(e){   // Tab / keyboard focus on a cell starts editing it
  const td=e.target;
  if(editing()&&td.matches&&td.matches('td[data-k]')&&!td.querySelector('input'))startCell(td);
}
function scrollTop(){const t=$('mis-tools');if(t&&t.scrollIntoView)t.scrollIntoView({block:'nearest'});}
function onChange(e){
  const id=e.target.id;
  if(onTick(e))return;
  if(id==='mis-file'){const f=e.target.files&&e.target.files[0];e.target.value='';if(f)startUpload(f);return;}
  if(id==='mis-f-month'){ST.q.month=e.target.value;ST.q.page=1;clearSel();load(false);}
  else if(id==='mis-f-zone'){ST.q.zone=e.target.value;ST.q.page=1;clearSel();load(false);}
  else if(id==='mis-f-state'){ST.q.state=e.target.value;ST.q.page=1;clearSel();load(false);}
}
function onInput(e){
  if(e.target.id!=='mis-f-q')return;
  clearTimeout(ST.searchT);
  ST.searchT=setTimeout(()=>{ST.q.q=e.target.value.trim();ST.q.page=1;clearSel();load(false);},350);
}
async function download(){
  if(ST.dl)return;
  commitNow();
  const b=$('mis-dl');ST.dl=true;if(b)b.disabled=true;
  try{
    // wait for a save that is still on its way, so the file has the newest figures
    for(let i=0;i<40&&ST.saving;i++)await new Promise(r=>setTimeout(r,100));
    const r=await fetch('mis.php?action=download',{credentials:'same-origin'});
    const type=r.headers.get('content-type')||'';
    if(!r.ok||type.indexOf('json')>=0){let m='The Excel file could not be prepared.';try{m=(await r.json()).error||m;}catch(e){}throw new Error(m);}
    const blob=await r.blob();
    let name=(ST.data&&ST.data.title?ST.data.title:'MIS')+'.xlsx';
    const cd=r.headers.get('content-disposition')||'';const m=/filename="([^"]+)"/.exec(cd);if(m)name=m[1];
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);
    toast('Excel downloaded');
  }catch(e){toast(e.message,'er');}
  finally{ST.dl=false;if(b)b.disabled=false;}
}

/* ── editing: press Edit, click a cell, type, it saves by itself ── */
function toggleEdit(){
  if(!canEdit())return;
  commitNow();
  ST.edit=!ST.edit;clearSel();
  toolsBuilt=false;
  if(ST.sheet===1){paintTools();paintData();}
  paint();
}
function rowOf(tr){const id=+tr.dataset.row;return ST.data.rows.find(r=>r.id===id);}
function startCell(td){
  commitNow();
  const tr=td.closest('tr'),r=rowOf(tr);if(!r)return;
  const k=td.dataset.k,c=COL[k];
  const inp=document.createElement('input');
  inp.className='mis-in';
  if(c[2]==='date'){inp.type='date';inp.value=r.d||'';}
  else if(c[2]==='num'){inp.type='number';inp.step='any';inp.min='0';inp.inputMode='decimal';inp.value=r[k]==null?'':r[k];}
  else{inp.type='text';inp.value=r[k]==null?'':r[k];inp.maxLength=200;if(c[3])inp.setAttribute('list','mis-dl-'+k);}
  inp.autocomplete='off';
  td.classList.add('on');td.innerHTML='';td.appendChild(inp);
  ST.cell={td,tr,r,k,inp,cancel:false};
  inp.focus();if(inp.select&&c[2]!=='date')inp.select();
  inp.addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){ev.preventDefault();inp.blur();}
    else if(ev.key==='Escape'){ev.preventDefault();ST.cell.cancel=true;inp.blur();}
  });
  inp.addEventListener('blur',()=>finishCell(inp));
}
function commitNow(){const C=ST.cell;if(C&&C.inp&&C.inp.isConnected)C.inp.blur();}
async function finishCell(inp){
  const C=ST.cell;if(!C||C.inp!==inp)return;
  ST.cell=null;
  const {td,tr,r,k}=C,c=COL[k];
  let v=inp.value;
  td.classList.remove('on');
  const back=()=>{td.innerHTML=cellHtml(r,c);};
  if(C.cancel){back();after();return;}
  let val;
  if(c[2]==='num'){if(v.trim()===''){val=null;}else{val=Number(v);if(!isFinite(val)||val<0){toast('Enter a number, 0 or more.','er');back();after();return;}}}
  else if(c[2]==='date'){if(!v){toast('The date cannot be empty.','er');back();after();return;}val=v;}
  else{val=v.trim();if(val==='')val=null;}
  const old=r[k];
  const same=c[2]==='num'?(val===null?old==null:old!=null&&Number(old)===val):(val===null?!old||String(old).trim()==='':String(old==null?'':old).trim()===val);
  if(same){back();after();return;}
  td.classList.add('sv');td.innerHTML=c[2]==='num'?esc(fmt(val)):c[2]==='date'?esc(dShow(val)):esc(val==null?'':val);
  ST.saving++;
  // saves of one row go one after the other, so every save carries the row's newest version
  const run=async()=>{
    const j=await post('save_row',{id:r.id,f:{[k]:val},ver:r.ver});
    Object.assign(r,j.row);ST.rev=j.rev;
    if(k==='s'&&val)await fillFromSap(r);
    updateRow(tr,r);
  };
  r._q=(r._q||Promise.resolve()).catch(()=>{}).then(run);
  try{
    await r._q;
    td.classList.remove('sv');flash(tr);
  }catch(e){
    td.classList.remove('sv');if(!td.querySelector('input'))back();toast(e.message,'er');
    if(e.status===409||e.status===404)load(true);
  }finally{ST.saving--;after();}
}
function after(){   // once nothing is being typed or saved: refresh the totals (and redraw if something changed meanwhile)
  if(ST.cell||ST.saving)return;
  clearTimeout(ST.refT);ST.refT=setTimeout(()=>{if(!ST.cell&&!ST.saving)load(true);},500);
}
function updateRow(tr,r){   // redraw the cells of a saved row, except the one being typed in
  if(!tr||!tr.isConnected)return;
  for(const c of COLS){const td=tr.querySelector('td[data-k="'+c[0]+'"]');if(td&&!td.querySelector('input'))td.innerHTML=cellHtml(r,c);}
}
function flash(tr){if(!tr||!tr.isConnected)return;tr.classList.add('ok');setTimeout(()=>tr.classList.remove('ok'),1200);}
// a typed SAP code fills the empty outlet fields of that row from the portal's outlet list
async function fillFromSap(r){
  try{
    const j=await fetch('mis.php?action=outlet&sap='+encodeURIComponent(r.s),{credentials:'same-origin'}).then(parse);
    if(!j.found)return;
    const f={};
    for(const [k,v] of Object.entries(j.f))if(v!=null&&v!==''&&(r[k]==null||String(r[k]).trim()===''))f[k]=v;
    if(!Object.keys(f).length)return;
    const u=await post('save_row',{id:r.id,f,ver:r.ver});
    Object.assign(r,u.row);ST.rev=u.rev;toast('Filled from the outlet list');
  }catch(e){}
}
async function addRow(){
  if(!editing())return;
  commitNow();
  const b=$('mis-add');if(b)b.disabled=true;
  try{
    const j=await post('save_row',{f:{d:ST.data.today,t:'HPCL Retail Outlet'}});
    ST.rev=j.rev;
    ST.q.month='';ST.q.zone='';ST.q.state='';ST.q.q='';ST.q.sort='desc';ST.q.page=1;toolsBuilt=false;
    await load(false);
    const tr=document.querySelector('tr[data-row="'+j.row.id+'"]');
    if(tr){flash(tr);tr.scrollIntoView({block:'nearest'});const td=tr.querySelector('td[data-k="o"]');if(td)startCell(td);}
    toast('Row added — click its cells to fill them in');
  }catch(e){toast(e.message,'er');}
  finally{if(b)b.disabled=false;}
}
async function deleteRow(tr){
  const r=tr&&rowOf(tr);if(!r)return;
  commitNow();
  const msg='Delete the '+dShow(r.d)+' row of '+(r.o||'this outlet')+' ('+fmt(r.e)+' EA)? It disappears from every sheet and from the next Excel download.';
  let ok=true;
  if(typeof showModal==='function')ok=await showModal({title:'Delete row',body:msg,confirmText:'Delete',confirmClass:'btn-d'});
  else ok=window.confirm(msg);
  if(!ok)return;
  try{const j=await post('delete_row',{id:r.id});ST.rev=j.rev;toast('Row deleted');load(true);}
  catch(e){toast(e.message,'er');if(e.status===404)load(true);}
}

/* ── Excel upload: the file is read here in the browser, shown as a preview, and only then sent ── */
const UP_MAX_ROWS=30000,UP_MAX_BYTES=15*1024*1024;
// how the headings of the workbook are recognised (checked in this order; one heading serves one column)
const UP_HEAD=[['t',/sale\s*type/],['d',/^date/],['s',/sap|ro\s*code|customer\s*code/],['o',/outlet|bazaar|customer\s*name|^name/],['l',/location|address/],['di',/district/],['st',/^state/],['sa',/sales\s*area/],
  ['ro',/regional\s*office|^ro$|^region/],['z',/^zone/],['i',/item/],['e',/volume\s*in\s*ea|^ea$|\bea\b|quantity|^qty/],['v',/litre|liter|volume\s*in\s*l\b/]];
const UP_NAME={d:'Date',t:'Sale Type',o:'Retail Outlet Name',s:'SAP Code',l:'Location',di:'District',st:'State',sa:'Sales Area',ro:'Regional Office',z:'Zone',i:'Item Name',e:'Volume in EA',v:'Volume in Litres'};
const UP_STD=['d','t','o','s','l','di','st','sa','ro','z','i','e','v'];   // the workbook's own column order (used when a sheet has no headings)
const hk=v=>String(v==null?'':v).toLowerCase().replace(/[\u00a0\s]+/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
function loadXlsx(){
  if(window.XLSX)return Promise.resolve();
  return new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='xlsx.mini.min.js?v=1';sc.onload=res;sc.onerror=()=>rej(new Error('The Excel reader could not be loaded. Check the internet connection and try again.'));document.head.appendChild(sc);});
}
const p2=n=>String(n).padStart(2,'0');
const UP_MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function upDate(v){   // -> 'YYYY-MM-DD' or ''
  if(v==null||v==='')return '';
  if(v instanceof Date){return isNaN(v)?'':v.getFullYear()+'-'+p2(v.getMonth()+1)+'-'+p2(v.getDate());}
  if(typeof v==='number'){if(v<30000||v>80000)return '';const d=new Date(Math.round((v-25569)*86400000));return d.getUTCFullYear()+'-'+p2(d.getUTCMonth()+1)+'-'+p2(d.getUTCDate());}   // Excel's day number
  const s=String(v).trim();let m;
  if((m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)))return m[1]+'-'+p2(m[2])+'-'+p2(m[3]);
  if((m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})$/.exec(s)))return (m[3].length===2?'20'+m[3]:m[3])+'-'+p2(m[2])+'-'+p2(m[1]);   // day / month / year
  if((m=/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ ,-]+(\d{4}|\d{2})$/.exec(s))&&UP_MON[m[2].toLowerCase()])return (m[3].length===2?'20'+m[3]:m[3])+'-'+p2(UP_MON[m[2].toLowerCase()])+'-'+p2(m[1]);
  return '';
}
function upNum(v){if(v==null||v==='')return null;if(typeof v==='number')return isFinite(v)?v:null;const n=Number(String(v).replace(/,/g,'').trim());return isFinite(n)&&String(v).trim()!==''?n:null;}
function upTxt(v){if(v==null)return null;if(typeof v==='number')return Number.isInteger(v)?String(v):String(v);const s=String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');return s.trim()===''?null:s;}
/** Finds the heading row and the column of every field; returns {h, col:{key:index}, n:matched} (n = how many fields were recognised). */
function upHeader(aoa){
  let best={h:-1,col:{},n:0};
  for(let i=0;i<Math.min(aoa.length,15);i++){
    const col={},used=new Set();
    (aoa[i]||[]).forEach((c,ci)=>{const k=hk(c);if(!k)return;for(const [key,re] of UP_HEAD){if(col[key]===undefined&&!used.has(ci)&&re.test(k)){col[key]=ci;used.add(ci);break;}}});
    const n=Object.keys(col).length;
    if(n>best.n)best={h:i,col,n};
  }
  return best;
}
async function readWorkbook(file){
  if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw new Error('Please choose an Excel file (.xlsx).');
  if(file.size>UP_MAX_BYTES)throw new Error('This file is larger than 15 MB. Please check that it is the MIS workbook.');
  await loadXlsx();
  let wb;try{wb=XLSX.read(await file.arrayBuffer(),{type:'array'});}catch(e){throw new Error('This file could not be read as an Excel workbook.');}
  // the data sheet: the sheet named like the MIS data sheet, otherwise the sheet whose headings fit best
  let pick=null;
  for(const name of wb.SheetNames){
    const ws=wb.Sheets[name];if(!ws||!ws['!ref'])continue;
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:false});
    const hd=upHeader(aoa);const named=/secondary|ro[_ ]?bzr/i.test(name);
    const score=hd.n+(named?5:0);
    if(hd.n>=5&&(!pick||score>pick.score))pick={name,aoa,hd,score};
  }
  if(!pick)throw new Error('No sheet with the MIS columns (Date, Retail Outlet Name, SAP Code, Sales Area, Regional Office, Zone, Item Name, Volume in EA …) was found in this file.');
  const {aoa,hd}=pick,col=hd.col,rows=[],skipped=[];
  let ea=0,lt=0,dmin='',dmax='';const months={};
  for(let i=hd.h+1;i<aoa.length;i++){
    const a=aoa[i]||[];
    if(!a.some(c=>c!=null&&String(c).trim()!==''))continue;
    const get=k=>col[k]===undefined?null:a[col[k]];
    const d=upDate(get('d'));
    if(!d){skipped.push(i+1);continue;}
    const r={d};
    for(const k of ['t','o','l','di','st','sa','ro','z','i'])r[k]=upTxt(get(k));
    const sap=get('s');r.s=typeof sap==='number'&&Number.isInteger(sap)?String(sap):upTxt(sap);
    r.e=upNum(get('e'));r.v=upNum(get('v'));
    if(r.v==null&&r.e!=null)r.v=Math.round(r.e*20*100)/100;
    if(r.o==null&&r.s==null&&r.e==null&&r.v==null){skipped.push(i+1);continue;}   // a dated but otherwise empty line
    rows.push(r);ea+=r.e||0;lt+=r.v||0;
    if(!dmin||d<dmin)dmin=d;if(!dmax||d>dmax)dmax=d;months[d.slice(0,7)]=(months[d.slice(0,7)]||0)+1;
  }
  if(!rows.length)throw new Error('The sheet "'+pick.name+'" has no rows with a valid date. Dates must be real Excel dates or look like 31/10/2026.');
  if(rows.length>UP_MAX_ROWS)throw new Error('The file has more than '+fmt(UP_MAX_ROWS)+' rows.');
  const missing=UP_STD.filter(k=>col[k]===undefined);
  return {file:file.name,sheet:pick.name,sheets:wb.SheetNames.length,rows,skipped,ea,lt,dmin,dmax,months,missing};
}
function closeUpload(){const m=$('mis-upm');if(m)m.remove();ST.up=null;}
async function startUpload(file){
  if(!canEdit())return;
  commitNow();
  toast('Reading '+file.name+'…');
  let u;
  try{u=await readWorkbook(file);}catch(e){toast(e.message,'er');return;}
  ST.up=u;
  const d=ST.data,cur=d?d.months.reduce((a,m)=>a+m.n,0):0,adm=!!(d&&d.is_admin);   // only the Super Admin may replace the whole MIS
  const mths=Object.keys(u.months).sort().map(m=>mShow(m)+' ('+fmt(u.months[m])+')').join(' · ');
  const prev=u.rows.slice(0,6).map(r=>'<tr><td>'+esc(dShow(r.d))+'</td><td>'+esc(r.o||'')+'</td><td>'+esc(r.s||'')+'</td><td>'+esc(nbsp(r.i||''))+'</td><td class="r">'+esc(fmt(r.e))+'</td><td class="r">'+esc(fmt(r.v))+'</td></tr>').join('');
  const m=document.createElement('div');m.className='mis-modal';m.id='mis-upm';
  m.innerHTML='<div class="mis-mbox"><div class="mis-mh"><b>Upload Excel</b><span class="mis-tag">'+esc(u.file)+'</span><button type="button" class="mis-x" data-act="upx" aria-label="Close">×</button></div>'+
   '<div class="mis-upb">'+
   '<div class="mis-upsum"><div><b>'+fmt(u.rows.length)+'</b><small>rows found</small></div><div><b>'+esc(fmt(u.ea))+'</b><small>EA</small></div><div><b>'+esc(fmt(u.lt))+'</b><small>litres</small></div><div><b>'+esc(dShow(u.dmin))+' – '+esc(dShow(u.dmax))+'</b><small>dates</small></div></div>'+
   '<div class="mis-upinfo">Sheet <b>'+esc(u.sheet)+'</b>'+(u.sheets>1?' (of '+u.sheets+' sheets)':'')+' · rows per month: '+esc(mths)+'</div>'+
   (u.skipped.length?'<div class="mis-note warn">'+fmt(u.skipped.length)+' line'+(u.skipped.length===1?' was':'s were')+' left out because they have no valid date (e.g. totals or empty lines): row'+(u.skipped.length===1?'':'s')+' '+esc(u.skipped.slice(0,8).join(', '))+(u.skipped.length>8?' …':'')+'.</div>':'')+
   (u.missing.length?'<div class="mis-note warn">Column not found in the file (left empty): '+esc(u.missing.map(k=>UP_NAME[k]).join(', '))+'.</div>':'')+
   '<div class="mis-scroll"><table class="mis-tbl data"><thead><tr><th>Date</th><th>Outlet</th><th>SAP Code</th><th>Item</th><th class="r">EA</th><th class="r">Litres</th></tr></thead><tbody>'+prev+'</tbody></table></div>'+
   '<div class="mis-upmode">'+(adm?'<label><input type="radio" name="mis-upmode" value="replace" checked> <b>Replace all data</b> — the MIS becomes exactly this file (the '+fmt(cur)+' rows it has now are removed).</label>':'')+
   '<label><input type="radio" name="mis-upmode" value="append"'+(adm?'':' checked')+'> <b>Add to the current data</b> — keep the current rows and add these '+fmt(u.rows.length)+' rows.'+(adm?'':' Only the rows of your own zone / regions are added; the others are left out.')+'</label></div>'+
   '<div class="mis-upinfo">The Region Wise, SA Wise and State wise sheets, the Dashboard and Raw Data all follow at once. Orders approved from now on are added by themselves, as before.</div></div>'+
   '<div class="mis-mf"><button type="button" class="mis-btn" data-act="upx">Cancel</button><button type="button" class="mis-btn pri" data-act="upgo" id="mis-upgo">Import '+fmt(u.rows.length)+' rows</button></div></div>';
  m.addEventListener('click',onClick);   // the dialog lives in <body>, outside the page root that listens for clicks
  document.body.appendChild(m);
}
async function runUpload(){
  const u=ST.up;if(!u)return;
  const mode=(document.querySelector('input[name="mis-upmode"]:checked')||{}).value||'replace';
  if(mode==='replace'&&typeof showModal==='function'){
    const ok=await showModal({title:'Replace all MIS data',body:'All current MIS rows will be replaced by the '+fmt(u.rows.length)+' rows of "'+u.file+'". The Dashboard and Raw Data change with it. This cannot be undone.',confirmText:'Replace data',confirmClass:'btn-d'});
    if(!ok)return;
  }
  const b=$('mis-upgo');if(b){b.disabled=true;b.textContent='Importing…';}
  try{
    const j=await post('import',{rows:u.rows,mode,name:u.file});
    ST.rev=j.rev;
    toast(fmt(j.imported)+' rows imported'+(j.skipped?' ('+fmt(j.skipped)+' left out)':''));
    closeUpload();clearSel();
    ST.q={month:'',zone:'',state:'',q:'',sort:'desc',page:1};toolsBuilt=false;
    await load(false);
  }catch(e){toast(e.message,'er');if(b){b.disabled=false;b.textContent='Import '+fmt(u.rows.length)+' rows';}}
}

/* ── tab wiring ── */
function onShow(){
  const root=$('mis-root');if(!root)return;
  if(!ST.built){keepRestore();build();}
  if(!ST.data)$('mis-view').innerHTML='<div class="mis-note">Preparing the MIS…</div>';
  load(!!ST.data);
  stop();ST.timer=setInterval(poll,POLL_MS);
}
function stop(){if(ST.timer)clearInterval(ST.timer);ST.timer=null;}
function onHide(){commitNow();stop();}
document.addEventListener('visibilitychange',()=>{const t=$('tab-mis');if(!document.hidden&&t&&t.style.display!=='none')poll();});
const _showTab=window.showTab;
window.showTab=function(tab){
  _showTab(tab);
  if(tab==='mis'){const sf=$('shared-filters');if(sf)sf.style.display='none';onShow();}
  else onHide();
};
const _doLogout=window.doLogout;
window.doLogout=function(){try{sessionStorage.removeItem(KEEP);}catch(e){}onHide();ST.data=null;ST.rev=null;ST.lists=null;ST.built=false;ST.sheet=1;ST.edit=false;ST.cell=null;clearSel();closeUpload();ST.q={month:'',zone:'',state:'',q:'',sort:'desc',page:1};const r=$('mis-root');if(r)r.innerHTML='';_doLogout();};
})();
