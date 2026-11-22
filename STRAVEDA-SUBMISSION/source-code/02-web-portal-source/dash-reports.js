/* Dashboard Excel reports.
   Every card on the dashboard has a download button that produces an .xlsx of what the card shows (in more detail), for the filters that
   are selected at that moment. File name:  RohanEnergy-HPCL_<Report>_<Period>[_Filtered]_<YYYY-MM-DD>.xlsx
   Uses the globals of index.html (filteredData, salesData, msGetSelected, ...) and the SheetJS library (XLSX) loaded there. */
(function(){
'use strict';

var BRAND='RohanEnergy-HPCL';
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var DAY=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var N='#,##0', K='#,##0.0', P='0.0%', DT='dd-mmm-yyyy';
var ICON='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

/* ── small helpers ── */
function pad(n){return String(n).padStart(2,'0');}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function stamp(){var d=new Date();return pad(d.getDate())+'-'+MON[d.getMonth()]+'-'+d.getFullYear()+' '+pad(d.getHours())+':'+pad(d.getMinutes());}
function mLab(m){var p=String(m||'').split('-');return p.length===2?MON[+p[1]-1]+'-'+p[0]:String(m||'');}
function slug(s){return String(s).replace(/&/g,'and').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
function itemLab(i){return (typeof ILBL!=='undefined'&&ILBL[i])||i;}
function monthOf(d){return d.month||(d.date?d.date.slice(0,7):'');}
function sum(a,f){var s=0;for(var i=0;i<a.length;i++)s+=f(a[i])||0;return s;}
function by(arr,kf){var m=new Map();arr.forEach(function(x){var k=kf(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x);});return m;}
function uniq(a){return Array.from(new Set(a));}
/* a date as a real Excel date (shown 06-Nov-2026), not text, so it sorts and groups in Excel */
function xd(s){var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));if(!m)return s||'';return {v:Math.floor(Date.UTC(+m[1],+m[2]-1,+m[3])/86400000)+25569,z:DT};}
function num(v){return (typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v.trim()))?Number(v):v;}
function sel(id){return (typeof msGetSelected==='function')?msGetSelected(id):[];}

/* ── what is selected: used in the file name and printed at the top of every sheet ── */
function monthsSel(){return sel('ms-month').slice().sort();}
function periodTag(){var s=monthsSel();if(!s.length)return 'All-Months';if(s.length===1)return mLab(s[0]);return s.length+'-Months';}
function periodText(){var s=monthsSel();return s.length?s.map(function(m){return fmtMonth(m);}).join(', '):'All months';}
function otherFilters(){
  var o=[];
  [['ms-zone','Zone'],['ms-state','State'],['ms-ro','Regional Office'],['ms-item','Product'],['ms-orderstatus','Order status'],['ms-paymentstatus','Payment status']].forEach(function(p){
    var v=sel(p[0]);if(v.length)o.push(p[1]+': '+v.map(function(x){return p[0]==='ms-item'?itemLab(x):x;}).join(', '));
  });
  var q=(document.getElementById('f-search')||{}).value;if(q)o.push('Search: "'+q+'"');
  return o;
}
function fileName(label,tag,noFilter){
  return BRAND+'_'+slug(label)+'_'+(tag||periodTag())+((!noFilter&&otherFilters().length)?'_Filtered':'')+'_'+iso(new Date())+'.xlsx';
}
function scopeLine(){return 'Period: '+periodText()+'  |  '+(otherFilters().join('  |  ')||'No other filters');}
function who(){return (typeof currentUser!=='undefined'&&currentUser&&(currentUser.label||currentUser.username))||'';}

/* ── sheet -> worksheet ──
   spec: {name,title,head,body,totals,fmt:{colIndex:format},scope,note}; a body cell may be {v,z} to carry its own number format */
function toWS(s){
  var aoa=[[s.title||s.name],[s.scope!==undefined?s.scope:scopeLine()],['Generated '+stamp()+(who()?' by '+who():'')+'  |  Rohan Energy \u2013 HPCL Cluster 2 Reporting Portal'],[]];
  var patches=[];
  function conv(row){var r=aoa.length;return row.map(function(c,ci){if(c&&typeof c==='object'&&'v' in c){patches.push([r,ci,c.z]);return c.v;}return c;});}
  var hr=aoa.length;aoa.push(s.head);
  s.body.forEach(function(row){aoa.push(conv(row));});
  if(s.totals)aoa.push(conv(s.totals));
  var last=aoa.length-1;
  if(s.note){aoa.push([]);aoa.push([s.note]);}
  var ws=XLSX.utils.aoa_to_sheet(aoa);
  var f=s.fmt||{};
  for(var r=hr+1;r<=last;r++){for(var c in f){var cell=ws[XLSX.utils.encode_cell({r:r,c:+c})];if(cell&&cell.t==='n')cell.z=f[c];}}
  patches.forEach(function(p){var cell=ws[XLSX.utils.encode_cell({r:p[0],c:p[1]})];if(cell&&p[2])cell.z=p[2];});
  var w=s.head.map(function(h){return String(h).length;});
  var rows=s.totals?s.body.concat([s.totals]):s.body;
  rows.forEach(function(row){row.forEach(function(c,i){var v=(c&&typeof c==='object'&&'v' in c)?(c.z===DT?'00-Mmm-0000':c.v):c;var l=typeof v==='number'?(String(Math.round(v)).length+4):String(v==null?'':v).length;if(l>(w[i]||0))w[i]=l;});});
  ws['!cols']=w.map(function(x){return {wch:Math.max(9,Math.min(60,x+2))};});
  if(s.body.length>1)ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:hr,c:0},e:{r:hr+s.body.length,c:s.head.length-1}})};
  return ws;
}

/* ── the sheets (each takes the filtered rows) ── */
function fmtAll(from,to,z){var o={};for(var i=from;i<=to;i++)o[i]=z;return o;}

function shSummary(data){
  var tv=sum(data,function(d){return d.vol;}),te=sum(data,function(d){return d.ea;});
  var outlets=uniq(data.map(function(d){return d.outlet;})).length,days=uniq(data.map(function(d){return d.date;})).length;
  var rows=[
    ['Period',periodText()],
    ['Other filters',otherFilters().join('  |  ')||'None'],
    ['Total volume (L)',{v:tv,z:N}],
    ['Total volume (KL)',{v:tv/1000,z:K}],
    ['Total quantity (EA)',{v:te,z:N}]
  ];
  uniq(data.map(function(d){return d.item;})).sort().forEach(function(it){
    var v=sum(data.filter(function(d){return d.item===it;}),function(d){return d.vol;});
    rows.push([itemLab(it)+' (L)',{v:v,z:N}]);rows.push([itemLab(it)+' share of total',{v:tv?v/tv:0,z:P}]);
  });
  rows.push(['Active outlets',{v:outlets,z:N}]);rows.push(['Billing days',{v:days,z:N}]);
  rows.push(['Average volume per billing day (L)',{v:days?tv/days:0,z:N}]);
  var ms=sel('ms-month');
  if(ms.length===1){
    var pm=prevMonth(ms[0]),pd=filteredData({months:[pm]});
    if(pd.length){var pv=sum(pd,function(d){return d.vol;});
      rows.push(['Previous month ('+fmtMonth(pm)+') volume (L)',{v:pv,z:N}]);
      rows.push(['Change vs previous month',pv?{v:(tv-pv)/pv,z:P}:'n/a']);}
    var p=ms[0].split('-').map(Number),dim=new Date(p[0],p[1],0).getDate(),rem=dim-days;
    if(days>0&&rem>0){rows.push(['Projected month-end volume (L)',{v:Math.round(tv/days*dim),z:N}]);rows.push(['Days remaining in month',{v:rem,z:N}]);}
  }
  var os=(typeof orderSummary!=='undefined')?orderSummary:null;
  if(os){
    [['Orders pending approval','pending'],['Orders in transit','transit'],['Orders delivered','delivered']].forEach(function(p){
      rows.push([p[0]+' (count)',{v:os[p[1]].c,z:N}]);rows.push([p[0]+' (L)',{v:os[p[1]].vol,z:N}]);});
  }
  return {name:'Summary',title:'Dashboard summary',head:['Metric','Value'],body:rows,scope:scopeLine()};
}

function shState(data,title){
  var tv=sum(data,function(d){return d.vol;});
  var rows=Array.from(by(data,function(d){return d.zone+'|'+d.state;}).entries()).map(function(e){
    var p=e[0].split('|'),v=sum(e[1],function(d){return d.vol;});
    return [p[0],p[1],sum(e[1],function(d){return d.ea;}),v,v/1000,tv?v/tv:0];}).sort(function(a,b){return b[3]-a[3];});
  return {name:'Volume by State',title:title||'Volume by state',head:['Zone','State','EA','Volume (L)','Volume (KL)','Share of total'],body:rows,
    totals:['Total','',sum(rows,function(r){return r[2];}),tv,tv/1000,tv?1:0],fmt:{2:N,3:N,4:K,5:P}};
}
function shProduct(data,title){
  var tv=sum(data,function(d){return d.vol;});
  var rows=Array.from(by(data,function(d){return d.item;}).entries()).map(function(e){var v=sum(e[1],function(d){return d.vol;});
    return [itemLab(e[0]),e[0],sum(e[1],function(d){return d.ea;}),v,v/1000,tv?v/tv:0];}).sort(function(a,b){return b[3]-a[3];});
  return {name:'Volume by Product',title:title||'Volume by product',head:['Product','Product (full name)','EA','Volume (L)','Volume (KL)','Share of total'],body:rows,
    totals:['Total','',sum(rows,function(r){return r[2];}),tv,tv/1000,tv?1:0],fmt:{2:N,3:N,4:K,5:P}};
}
function shRO(data,title,name){
  var tv=sum(data,function(d){return d.vol;});
  var rows=Array.from(by(data,function(d){return d.zone+'|'+d.state+'|'+d.ro;}).entries()).map(function(e){
    var p=e[0].split('|'),v=sum(e[1],function(d){return d.vol;});
    return [p[0],p[1],p[2],uniq(e[1].map(function(d){return d.outlet;})).length,sum(e[1],function(d){return d.ea;}),v,v/1000,tv?v/tv:0];}).sort(function(a,b){return b[5]-a[5];});
  return {name:name||'Volume by Regional Office',title:title||'Volume by Regional Office',head:['Zone','State','Regional Office','Active outlets','EA','Volume (L)','Volume (KL)','Share of total'],body:rows,
    totals:['Total','','',uniq(data.map(function(d){return d.outlet;})).length,sum(rows,function(r){return r[4];}),tv,tv/1000,tv?1:0],fmt:{3:N,4:N,5:N,6:K,7:P}};
}
function shDaily(data,cum,title){
  var states=uniq(data.map(function(d){return d.state;})).sort(),dates=uniq(data.map(function(d){return d.date;})).sort(),m={},run={};
  data.forEach(function(d){var k=d.date+'|'+d.state;m[k]=(m[k]||0)+d.vol;});
  states.forEach(function(s){run[s]=0;});
  var rows=dates.map(function(dt){var vals=states.map(function(s){var v=m[dt+'|'+s]||0;if(cum){run[s]+=v;return run[s];}return v;});return [xd(dt)].concat(vals,[sum(vals,function(x){return x;})]);});
  var n=states.length;
  return {name:cum?'Cumulative by State':'Daily by State',title:title||(cum?'Cumulative daily sales (running total by state, litres)':'Daily sales by state (litres)'),
    head:['Date'].concat(states.map(function(s){return s+' (L)';}),['Total (L)']),body:rows,fmt:fmtAll(1,n+1,N)};
}
function shDailyProduct(data,title){
  var items=uniq(data.map(function(d){return d.item;})).sort(),dates=uniq(data.map(function(d){return d.date;})).sort(),m={};
  data.forEach(function(d){var k=d.date+'|'+d.item;m[k]=(m[k]||0)+d.vol;});
  var rows=dates.map(function(dt){var vals=items.map(function(it){return m[dt+'|'+it]||0;});return [xd(dt)].concat(vals,[sum(vals,function(x){return x;})]);});
  var tot=['Total'];items.forEach(function(it,i){tot.push(sum(rows,function(r){return r[i+1];}));});tot.push(sum(rows,function(r){return r[items.length+1];}));
  return {name:'Daily by Product',title:title||'Daily sales by product (litres per billing day)',head:['Date'].concat(items.map(function(i){return itemLab(i)+' (L)';}),['Total (L)']),body:rows,totals:tot,fmt:fmtAll(1,items.length+1,N)};
}
function shTrend(data,title){
  var rows=Array.from(by(data,function(d){return d.date;}).entries()).sort(function(a,b){return a[0]<b[0]?-1:1;}).map(function(e){
    var v=sum(e[1],function(d){return d.vol;}),dd=new Date(e[0]+'T00:00:00');
    return [xd(e[0]),isNaN(dd)?'':DAY[dd.getDay()],uniq(e[1].map(function(d){return d.outlet;})).length,sum(e[1],function(d){return d.ea;}),v,v/1000];});
  var tv=sum(rows,function(r){return r[4];});
  return {name:'Daily Sales',title:title||'Daily sales per billing day',head:['Date','Day','Outlets billed','EA','Volume (L)','Volume (KL)'],body:rows,
    totals:['Total','',uniq(data.map(function(d){return d.outlet;})).length,sum(rows,function(r){return r[3];}),tv,tv/1000],fmt:{2:N,3:N,4:N,5:K}};
}
function shHeat(data){
  var states=uniq(data.map(function(d){return d.state;})).sort(),months=uniq(data.map(monthOf)).filter(Boolean).sort(),m={};
  data.forEach(function(d){var k=d.state+'|'+monthOf(d);m[k]=(m[k]||0)+d.vol;});
  var rows=states.map(function(s){var vals=months.map(function(mo){return m[s+'|'+mo]||0;});return [s].concat(vals,[sum(vals,function(x){return x;})]);});
  var tot=['Total'];months.forEach(function(mo,i){tot.push(sum(rows,function(r){return r[i+1];}));});tot.push(sum(rows,function(r){return r[months.length+1];}));
  return {name:'State x Month',title:'State \u00d7 month volume (litres)',scope:'All months side by side  |  '+(otherFilters().join('  |  ')||'No other filters'),
    head:['State'].concat(months.map(mLab),['Total (L)']),body:rows,totals:tot,fmt:fmtAll(1,months.length+1,N)};
}
function shOutlets(data,title,name,note){
  var g=by(data,function(d){return d.outlet;}),tv=sum(data,function(d){return d.vol;});
  var rows=Array.from(g.entries()).map(function(e){
    var a=e[1],m=a[a.length-1],dates=a.map(function(d){return d.date;}).sort(),v=sum(a,function(d){return d.vol;});
    return [e[0],m.roCode||'',m.district||'',m.state||'',m.ro||'',m.salesArea||'',m.zone||'',uniq(dates).length,sum(a,function(d){return d.ea;}),v,v/1000,tv?v/tv:0,xd(dates[0]),xd(dates[dates.length-1])];
  }).sort(function(a,b){return b[9]-a[9];}).map(function(r,i){return [i+1].concat(r);});
  return {name:name||'Outlets',title:title||'Outlets ranked by volume',note:note,
    head:['Rank','Outlet','RO / SAP code','District','State','Regional Office','Sales Area','Zone','Active days','EA','Volume (L)','Volume (KL)','Share of total','First billed','Last billed'],body:rows,
    totals:['','Total ('+rows.length+' outlets)','','','','','','','',sum(rows,function(r){return r[9];}),tv,tv/1000,tv?1:0,'',''],fmt:{8:N,9:N,10:N,11:K,12:P}};
}
function shData(data,title){
  var cols=COL_DEFS.filter(function(c){return colVis(c.key);});
  var rows=data.slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date));}).map(function(d){
    return cols.map(function(c){var v=d[c.key];if(c.key==='date')return xd(v);if(v==null||v==='---')return '';return (c.key==='ea'||c.key==='vol'||c.key==='invoiceAmount')?num(v):v;});});
  var f={};cols.forEach(function(c,i){if(c.key==='ea'||c.key==='vol'||c.key==='invoiceAmount')f[i]=N;});
  var vi=cols.findIndex(function(c){return c.key==='vol';}),ei=cols.findIndex(function(c){return c.key==='ea';});
  var tot=null;if(vi>=0||ei>=0){tot=cols.map(function(c,i){return i===0?'Total':(i===vi?sum(rows,function(r){return +r[vi]||0;}):(i===ei?sum(rows,function(r){return +r[ei]||0;}):''));});}
  return {name:'Data',title:title||'Transaction data (as filtered)',head:cols.map(function(c){return c.label;}),body:rows,totals:tot,fmt:f};
}
function shTargets(){
  var sm=sel('ms-month'),list=(typeof targetsData!=='undefined'?targetsData:[]).filter(function(t){return !sm.length||sm.indexOf(t.month)>=0;});
  var rows=list.map(function(t){
    var a=sum(salesData.filter(function(d){
      if(monthOf(d)!==t.month)return false;
      if(t.scope_type==='zone')return d.zone===t.scope_value;
      if(t.scope_type==='state')return d.state===t.scope_value;
      if(t.scope_type==='ro')return d.ro===t.scope_value;
      return false;}),function(d){return d.vol;});
    var tg=+t.target_vol||0,pc=tg?a/tg:0;
    return [fmtMonth(t.month),({zone:'Zone',state:'State',ro:'Regional Office'})[t.scope_type]||t.scope_type,t.scope_value,tg,a,pc,tg-a,pc>=1?'Target achieved':pc>=.9?'On track':pc>=.6?'Needs attention':'Behind'];});
  return {name:'Target Progress',title:'Target progress (actual vs target, litres)',scope:'Period: '+periodText()+'  |  Actuals count every product, whatever the product / search filter',
    head:['Month','Scope type','Scope','Target (L)','Actual (L)','Achievement','Balance to target (L)','Status'],body:rows,fmt:{3:N,4:N,5:P,6:N}};
}
function shMoM(){
  var src=filteredData({months:[]}),months=uniq(src.map(monthOf)).filter(Boolean).sort();
  if(months.length<2)return {name:'Month-over-Month',title:'Month-over-month change by state',head:['State'],body:[]};
  var cur=months[months.length-1],prev=months[months.length-2],cv={},pv={};
  src.forEach(function(d){var m=monthOf(d);if(m===cur)cv[d.state]=(cv[d.state]||0)+d.vol;else if(m===prev)pv[d.state]=(pv[d.state]||0)+d.vol;});
  var rows=uniq(Object.keys(cv).concat(Object.keys(pv))).map(function(s){var c=cv[s]||0,p=pv[s]||0;return [s,fmtMonth(prev),fmtMonth(cur),p,c,c-p,p?(c-p)/p:'n/a'];}).sort(function(a,b){return (typeof a[6]==='number'?a[6]:9)-(typeof b[6]==='number'?b[6]:9);});
  return {name:'Month-over-Month',title:'Month-over-month change by state (latest two months, litres)',scope:'Compares '+fmtMonth(prev)+' with '+fmtMonth(cur)+'  |  '+(otherFilters().join('  |  ')||'No other filters'),
    head:['State','Previous month','Latest month','Previous (L)','Latest (L)','Change (L)','Change %'],body:rows,fmt:{3:N,4:N,5:N,6:P}};
}
function shProjection(data){
  var ms=sel('ms-month'),tv=sum(data,function(d){return d.vol;}),days=uniq(data.map(function(d){return d.date;})).length;
  if(ms.length!==1||!days)return {name:'Projection',title:'Projected month-end volume',head:['Metric','Value'],body:[['Note','Select exactly one month in the Month filter to see a projection.']],scope:scopeLine()};
  var p=ms[0].split('-').map(Number),dim=new Date(p[0],p[1],0).getDate(),rem=Math.max(0,dim-days),rate=tv/days;
  return {name:'Projection',title:'Projected month-end volume',scope:scopeLine(),head:['Metric','Value'],body:[
    ['Month',fmtMonth(ms[0])],['Billing days so far',{v:days,z:N}],['Volume so far (L)',{v:tv,z:N}],['Average per billing day (L)',{v:Math.round(rate),z:N}],
    ['Days in month',{v:dim,z:N}],['Days remaining',{v:rem,z:N}],['Projected month-end volume (L)',{v:Math.round(rate*dim),z:N}],['Projected month-end volume (KL)',{v:rate*dim/1000,z:K}]],
    note:'Projection = average volume per billing day so far \u00d7 days in the month (the same formula as the dashboard card).'};
}
function orderRows(stage){
  return salesData.filter(function(d){return d.src==='orders'&&d.orderStatus===stage;}).sort(function(a,b){return String(a.date).localeCompare(String(b.date));});
}
function shOrders(stage,title){
  var rows=orderRows(stage).map(function(d){return [xd(d.date),d.outlet,d.roCode||'',d.district||'',d.state||'',d.ro||'',d.zone||'',itemLab(d.item),d.ea,d.vol,d.invoiceNo||'',d.invoiceAmount?num(d.invoiceAmount):'',d.orderStatus||'',d.paymentStatus||''];});
  return {name:stage,title:title,scope:'All portal orders in this stage, whatever the filters (same as the dashboard card)  |  one row per product line',
    head:['Order date','Outlet','SAP code','District','State','Regional Office','Zone','Product','EA','Volume (L)','Invoice / voucher no.','Invoice amount (\u20b9, incl. GST)','Order status','Payment status'],body:rows,
    totals:['Total','','','','','','','',sum(rows,function(r){return r[8];}),sum(rows,function(r){return r[9];}),'','','',''],fmt:{8:N,9:N,11:N}};
}
function shPending(list){
  var rows=list.map(function(o){
    return [o.ref||'',xd(o.order_date),String(o.submitted_at||'').slice(0,16),o.zone||'',o.state||'',o.ro||'',o.district||'',o.outlet||'',o.sap_code||'',
      (o.items||[]).map(function(i){return itemLab(i.item)+' \u00d7 '+i.ea;}).join('; '),o.total_ea||0,o.total_vol||0,o.created_by_name||o.created_by||'',o.doc_type==='invoice'?'Super admin':'HPCL sales officer'];});
  return {name:'Pending approval',title:'Orders pending approval',scope:'Orders waiting for approval that your account can see  |  one row per order',
    head:['Order ref','Order date','Submitted at','Zone','State','Regional Office','District','Outlet','SAP code','Products (EA)','EA','Volume (L)','Raised by','Waiting for approval of'],body:rows,
    totals:['Total','','','','','','','','','',sum(rows,function(r){return r[10];}),sum(rows,function(r){return r[11];}),'',''],fmt:{10:N,11:N}};
}

/* ── the reports: each returns {label, tag?, noFilter?, sheets:[...]} ── */
var REPORTS={
  mtd:function(){var d=filteredData();return {label:'MTD-Volume',sheets:[shSummary(d),shState(d),shTrend(d,'Volume by billing day'),shProduct(d)]};},
  item:function(it){var d=filteredData().filter(function(x){return x.item===it;});var l=itemLab(it);
    return {label:l+' Volume',sheets:[shRO(d,l+' \u2013 volume by Regional Office','By Regional Office'),shOutlets(d,l+' \u2013 volume by outlet','By Outlet')]};},
  outlets:function(){var d=filteredData();return {label:'Active-Outlets',sheets:[shOutlets(d,'Active outlets (every outlet with sales in the selection)','Active Outlets')]};},
  proj:function(){var d=filteredData();return {label:'Projected-EOM',sheets:[shProjection(d),shTrend(d,'Volume so far, by billing day')]};},
  transit:function(){return {label:'Orders-In-Transit',tag:'All-Orders',noFilter:true,sheets:[shOrders('In transit','Orders in transit')]};},
  delivered:function(){return {label:'Orders-Delivered',tag:'All-Orders',noFilter:true,sheets:[shOrders('Delivered','Orders delivered (Proof of Delivery uploaded)')]};},
  pending:function(){return fetch('orders.php?action=list&status=pending',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(j){
    if(!j||!j.ok)throw new Error((j&&j.error)||'Could not load the pending orders');
    return {label:'Orders-Pending-Approval',tag:'All-Orders',noFilter:true,sheets:[shPending(j.orders||[])]};});},
  targets:function(){return {label:'Target-Progress',sheets:[shTargets()]};},
  mom:function(){return {label:'Month-over-Month-Changes',tag:'Latest-2-Months',sheets:[shMoM()]};},
  daily:function(){var d=filteredData();return {label:'Cumulative-Daily-Sales',sheets:[shDaily(d,true),shDaily(d,false)]};},
  state:function(){var d=filteredData();return {label:'Volume-by-State',sheets:[shState(d)]};},
  product:function(){var d=filteredData();return {label:'Volume-by-Product',sheets:[shProduct(d)]};},
  productDaily:function(){var d=filteredData();return {label:'Daily-Sales-by-Product',sheets:[shDailyProduct(d)]};},
  ro:function(){var d=filteredData();return {label:'Volume-by-Regional-Office',sheets:[shRO(d)]};},
  trend:function(){var d=filteredData();return {label:'Daily-Sales-per-Day',sheets:[shTrend(d)]};},
  heatmap:function(){return {label:'State-Month-Heatmap',tag:'All-Months',sheets:[shHeat(filteredData({months:[]}))]};},
  top:function(){var d=filteredData();return {label:'Top-Outlets',sheets:[shOutlets(d,'Outlets ranked by volume','Outlet Ranking','The dashboard table shows the top 25; this file lists every outlet.')]};},
  data:function(){return {label:'Filtered-Data',sheets:[shData(filteredData())]};},
  full:function(){
    var d=filteredData(),t=shTargets(),mm=shMoM();
    return {label:'Dashboard-Report',sheets:[shSummary(d),t.body.length?t:null,mm.body.length?mm:null,shState(d),shProduct(d),shRO(d),shTrend(d),shDaily(d,false),shDailyProduct(d),shHeat(filteredData({months:[]})),shOutlets(d,'Outlets ranked by volume','Outlet Ranking'),shData(d)]};}
};

/* ── download ── */
function uniqueName(n,used){
  var base=String(n).replace(/[\\\/\?\*\[\]:]/g,'').slice(0,31)||'Sheet',nm=base,i=2;
  while(used[nm.toLowerCase()]){var sfx=' ('+i+')';nm=base.slice(0,31-sfx.length)+sfx;i++;}
  used[nm.toLowerCase()]=1;return nm;
}
window.dlReport=function(key,arg,btn){
  if(typeof XLSX==='undefined'){showToast('The Excel library could not be loaded. Check the internet connection and reload the page.','er');return;}
  var R=REPORTS[key];if(!R)return;
  if(btn){if(btn.classList.contains('busy'))return;btn.classList.add('busy');}
  var done=function(){if(btn)btn.classList.remove('busy');};
  Promise.resolve().then(function(){return R(arg||undefined);}).then(function(out){
    var sheets=out.sheets.filter(Boolean);
    if(!sheets.some(function(s){return s.body.length;})){showToast('Nothing to download for the current filters','er');return;}
    var wb=XLSX.utils.book_new(),used={};
    sheets.forEach(function(s){XLSX.utils.book_append_sheet(wb,toWS(s),uniqueName(s.name,used));});
    var file=fileName(out.label,out.tag,out.noFilter);
    XLSX.writeFile(wb,file);
    showToast('Downloaded '+file,'ok');
  }).catch(function(e){console.error(e);showToast('Could not create the Excel file: '+(e&&e.message||e),'er');}).then(done,done);
};

/* ── the button ── */
window.dlBtn=function(key,arg,cls){
  var txt=cls&&cls.indexOf('txt')>=0;
  return '<button type="button" class="dl-btn '+(cls||'')+'" title="Download as Excel" aria-label="Download as Excel" onclick="event.stopPropagation();dlReport(\''+key+'\','+(arg?'\''+String(arg).replace(/'/g,"\\'")+'\'':'null')+',this)">'+ICON+(txt?'<span>Excel</span>':'')+'</button>';
};
function init(){
  document.querySelectorAll('[data-dl]').forEach(function(el){
    if(el.querySelector('.dl-btn'))return;
    el.insertAdjacentHTML('beforeend',dlBtn(el.getAttribute('data-dl'),el.getAttribute('data-dl-arg'),el.getAttribute('data-dl-style')||''));
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
