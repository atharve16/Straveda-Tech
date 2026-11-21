/* Sales Order PDF (Rohan officers, My Orders). Drawn with jsPDF at the exact positions, sizes and widths of the Rohan Energy sales-order voucher
   (Arial family = jsPDF's built-in Helvetica, same metrics; the condensed look of some lines is reproduced with the same horizontal scaling).
   window.OM_SO.make(order) -> { doc, name }.  Orders containing HP DEF - 1X20L are sold straight to the outlet, so Invoice to repeats the Despatch To details (plus PAN) like the voucher does;
   for other orders Invoice to is the HPCL office the outlet is billed through (name, address, GSTIN, PAN, state from the outlet sheet, copied onto the order).
   An item with FOC (free of cost) is listed as TWO lines on the Sales Order: the ordered quantity at the rate and amount (both without GST), and below it the FOC quantity of the same product (rate column FOC, amount 0.00).
   The Tax Invoice shows item + FOC as ONE line: all the NOS delivered, the rate after FOC (amount / all NOS) and the amount, both without GST.
   Voucher no. and buyer's ref. are the order's voucher_no (given at approval). The line amounts are WITHOUT GST: below them come the taxable value and the tax lines, the total at the bottom includes the tax;
   CGST 9% + SGST 9% when the goods go to Chhattisgarh (Rohan Energy's own state), IGST 18% to any other state. Rate, tax and amounts stay blank if any line has no rate yet. */
(function(){
'use strict';
const LOGO='data:image/jpeg;base64,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';
const STATE_CODE={'Bihar':'10','Uttar Pradesh':'09','Madhya Pradesh':'23','Chhattisgarh':'22'};
const ITEM_DESC={'TATA MOTORS HP GENUINE DEF 20L':'FG-TATA MOTORS HP GENUINE DEF 20L','HP DEF - 1X20L':'FG - 20 LTRS Bucket (HPCL)'};   // as printed on the HP DEF vouchers
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const R='normal',B='bold',I='italic';

/* money in whole paise (integers) so the totals never drift */
function paise(x){return Math.round(Number(x)*100);}
function money(p){return num(p/100,2);}
const ONES=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function below1000(n){
  const h=Math.floor(n/100),r=n%100,out=[];
  if(h)out.push(ONES[h]+' Hundred');
  if(r)out.push(r<20?ONES[r]:TENS[Math.floor(r/10)]+(r%10?' '+ONES[r%10]:''));
  return out.join(' ');
}
/* Indian system: crore / lakh / thousand */
function words(p){
  let r=Math.floor(p/100);const ps=p%100,out=[];
  [[10000000,'Crore'],[100000,'Lakh'],[1000,'Thousand']].forEach(u=>{const q=Math.floor(r/u[0]);if(q){out.push(below1000(q)+' '+u[1]);r%=u[0];}});
  if(r)out.push(below1000(r));
  let t=out.join(' ')||'Zero';
  if(ps)t+=' and '+(ps<20?ONES[ps]:TENS[Math.floor(ps/10)]+(ps%10?' '+ONES[ps%10]:''))+' Paise';
  return 'INR '+t+' Only';
}
function dmy(s){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||'');return m?`${m[3]}-${MON[+m[2]-1]}-${m[1].slice(2)}`:'';}
function num(n,d){return Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});}

/* One line of text. o.w = exact width to fit (static text), o.scale = horizontal scale %, o.max = squeeze to fit this width, o.r = right-aligned at x */
function T(doc,s,x,y,f,size,o){
  s=String(s==null?'':s);if(!s)return 0;
  o=o||{};
  doc.setFont('helvetica',f);doc.setFontSize(size);
  const nat=doc.getTextWidth(s);
  let sc=o.scale!=null?o.scale:(o.w?o.w/nat*100:100);
  if(o.max&&nat*sc/100>o.max)sc=o.max/nat*100;
  const w=nat*sc/100,x0=o.r?x-w:x,tz=Math.abs(sc-100)>0.05;
  if(tz)doc.internal.write(sc.toFixed(2)+' Tz');
  doc.text(s,x0,y);
  if(tz)doc.internal.write('100 Tz');
  return w;
}
function wrap(doc,s,f,size,maxW){
  doc.setFont('helvetica',f);doc.setFontSize(size);
  const words=String(s||'').split(/\s+/).filter(Boolean),lines=[];let cur='';
  words.forEach(w=>{const t=cur?cur+' '+w:w;if(cur&&doc.getTextWidth(t)>maxW){lines.push(cur);cur=w;}else cur=t;});
  if(cur)lines.push(cur);
  return lines;
}

function frame(doc){
  doc.setDrawColor(0);doc.setLineWidth(0.375);
  const L=(a,b,c,d)=>doc.line(a,b,c,d);
  // header block
  [[36.12,119.64,273.96,119.64],[36.12,195.12,273.96,195.12],[274.08,44.16,274.08,270.6],
   [274.32,69.48,388.8,69.48],[274.32,94.92,388.8,94.92],[274.32,120.36,388.8,120.36],[274.32,145.8,388.8,145.8],[388.8,44.16,388.8,145.92],
   [388.92,69.48,503.52,69.48],[388.92,94.92,503.52,94.92],[388.92,120.36,503.52,120.36],[388.92,145.8,503.52,145.8],
   [36,44.04,504,44.04],[36,270.6,504,270.6],[503.88,44.04,503.88,270.72],[36,44.04,36,270.72]].forEach(l=>L(...l));
  // column headings band
  [[36.12,270.96,503.88,270.96],[36.12,270.72,503.88,270.72],[36.12,293.88,503.88,293.88]].forEach(l=>L(...l));
  [503.88,36,50.16,367.68,320.52,200.16,153,435.6,414.84,273.36].forEach(x=>L(x,270.72,x,299.64));
  // item body and total row
  [503.88,36,50.16,435.6,414.84,367.68,320.52,273.36,200.16,153].forEach(x=>L(x,299.64,x,483));
  [50.16,435.6,414.84,367.68,320.52,273.36,200.16,153].forEach(x=>L(x,483.12,x,497.28));
  [[36,483,504,483],[36,497.28,504,497.28],[503.88,483,503.88,497.4],[36,483,36,497.4]].forEach(l=>L(...l));
  // lower box with signature
  [[270,643.44,503.88,643.44],[270,643.44,270,685.92],[36,685.92,504,685.92],[503.88,497.4,503.88,686.04],[36,497.4,36,686.04]].forEach(l=>L(...l));
}

function statics(doc,direct){
  T(doc,'SALES ORDER',224.4,29.2,B,12,{w:86.4});
  try{doc.addImage(LOGO,'JPEG',36.1,44.2,71.3,59.4);}catch(e){}
  T(doc,'ROHAN ENERGY SOLUTIONS PVT LTD - CHHATISGARH',110,56.2,B,9.96,{w:159.9});
  [['Plot No. 103, Near MRC JAckson ,Tatibandh, Raipur - 492009',65.5,159.3],['Head Office - 6th Floor, S Cube Business Centre,',74.2,157.4],
   ['Opposite Magnum Hospital Institute, Vasant Manket,',82.8,160.2],['Canada Corner, Nashik, Maharashtra - 422005.',91.4,156.1],
   ['GSTIN/UIN: 22AAHCR5321D1ZW',100.1,151.8],['State Name :  Chhattisgarh, Code : 22',108.7,160.5],['E-Mail : rohanenergy2020@gmail.com',117.4,159.1]
  ].forEach(r=>T(doc,r[0],110,r[1],R,7.49,{w:r[2]}));
  if(direct){   // six-line blocks: the two labels are a little smaller; the Invoice-to rows are drawn with the details (party())
    T(doc,'Despatch To',38.8,127.1,R,8.19,{w:51.1});
    T(doc,'Invoice to',38.8,202.6,R,8.19,{w:38.5});
  }else{
    T(doc,'Despatch To',38.8,127.8,R,9,{w:51.1});
    // Invoice to: label and the GSTIN / PAN / State rows; the details are drawn by invoiceTo()
    T(doc,'Invoice to',38.8,201.7,R,7.2,{w:38.1});
    [['GSTIN/UIN',250.0,50.1],['PAN/IT No',259.1,50.1],['State Name',268.2,55.2]].forEach(r=>{T(doc,r[0],38.8,r[1],R,7.97,{w:r[2]});T(doc,':',116.5,r[1],R,7.97,{scale:125});});
  }
  // voucher / reference boxes
  [['Voucher No.',276.8,52.2,50.3],["Buyer's Ref.",276.8,103.1,48.9],['Despatch Through',276.8,128.5,74.4],['Terms of Delivery',276.8,154.0,70.8],
   ['Dated',391.4,52.2,24.1],['Mode/Terms of Payment',391.4,77.6,98.7],['Other Reference',391.4,103.1,66.9],['Destination',391.4,128.5,45.4]
  ].forEach(r=>T(doc,r[0],r[1],r[2],R,9,{w:r[3]}));
  T(doc,'15 Days',391.4,92.3,B,9.96,{w:37.4});
  // column headings
  T(doc,'Sl',38.8,280.0,R,9.96,{w:8.7});T(doc,'No.',38.8,291.4,R,9.96,{w:9.0});
  [['Description of Goods',56.9,279.1,9,84.5],['HSN/SAC',156.7,279.1,9,40.0],['GST',206.8,279.1,9,18.4],['Rate',206.4,290.5,9,19.0],
   ['Alt. Quantity',276.0,279.1,9,41.8],['Quantity',327.5,279.1,9,33.6],['Rate',381.8,279.1,9,19.1],['per',418.8,279.1,9,13.1],['Amount',454.3,279.1,9,31.2]
  ].forEach(r=>T(doc,r[0],r[1],r[2],R,r[3],{w:r[4]}));
  T(doc,'Total',130.7,491.2,R,9);
  T(doc,'Amount Chargeable (in words)',38.8,505.4,R,9,{w:107.9});
  T(doc,'E. & O.E',501.6,505.4,I,9,{r:true});
  T(doc,'for ROHAN ENERGY SOLUTIONS PVT LTD - CHHATISGARH',275.3,652.0,B,9,{w:224.2});
  T(doc,'Authorised Signatory',427.8,683.8,R,9,{w:73.8});
  T(doc,'This is a Computer Generated Document',185.0,699.7,R,9,{w:165});
}

/* Address and "phone, pincode" run on as one paragraph (the voucher wraps them together: a short address shares its line with the phone number). */
function addrPhone(o){return [o.outlet_address,[o.outlet_phone,o.outlet_pincode].filter(Boolean).join(', ')].filter(Boolean).join(' ');}

/* "Despatch To" box: name in bold with the SAP code in brackets, address + phone + pincode, GSTIN, state name and code.
   Long addresses wrap and the text shrinks a little so everything stays inside the box. */
function despatch(doc,o){
  const name=String(o.outlet||'').toUpperCase()+'('+(o.sap_code||o.ro_code||'')+')';
  const addr=addrPhone(o);
  const gst=o.outlet_gstin||'';
  const code=/^\d{2}/.test(gst)?gst.slice(0,2):(STATE_CODE[o.state]||'');
  const stateTxt=o.state?`${o.state}, Code : ${code}`:'';
  const maxW=232;
  // normal size first; if the text does not fit the box, shrink it and then squeeze it a little narrower
  const tries=[];[100,88,76].forEach(sc=>[9.96,9.2,8.5,7.9,7.3].forEach(sz=>tries.push([sz,sc])));
  for(let k=0;k<tries.length;k++){
    const s=tries[k][0],sc=tries[k][1],w=maxW*100/sc,nl=wrap(doc,name,B,s,w),al=wrap(doc,addr,R,s,w),lh=s*1.1446;
    const n=nl.length+al.length+2;
    if(142.0+(n-1)*lh>192.5&&k<tries.length-1)continue;
    let y=142.0;
    nl.forEach(t=>{T(doc,t,38.8,y,B,s,{scale:sc,max:maxW});y+=lh;});
    al.forEach(t=>{T(doc,t,38.8,y,R,s,{scale:sc,max:maxW});y+=lh;});
    T(doc,'GSTIN/UIN',38.8,y,R,s,{scale:sc});T(doc,':',116.5,y,R,s);T(doc,gst,124.2,y,R,s,{scale:sc});y+=lh;
    T(doc,'State Name',38.8,y,R,s,{scale:sc});T(doc,':',116.5,y,R,s);T(doc,stateTxt,124.2,y,R,s,{scale:sc,max:145});
    return;
  }
}

/* HP DEF SKUs go straight to the outlet (no HPCL office in between): the order's `direct` flag comes from the brand of its SKUs (Inventory page). */
function isDirect(o){return o.direct!=null?!!o.direct:(o.items||[]).some(i=>i.item==='HP DEF - 1X20L');}

/* Six-line party block (name + SAP code, address + phone/pincode, GSTIN, PAN, state) used for Despatch To and Invoice to of direct orders.
   Same widths as the normal block, drawn about 9% lower in height so the extra PAN line fits; shrinks further if the address wraps.
   start / last = first and last baseline allowed inside the box. despatchBox: the PAN label sits a little higher there, as on the voucher. */
function party(doc,o,start,last,despatchBox){
  const name=String(o.outlet||'').toUpperCase()+'('+(o.sap_code||o.ro_code||'')+')';
  const gst=o.outlet_gstin||'',pan=o.outlet_pan||'';
  const code=/^\d{2}/.test(gst)?gst.slice(0,2):(STATE_CODE[o.state]||'');
  const stateTxt=o.state?`${o.state}, Code : ${code}`:'';
  const nl=wrap(doc,name,B,9.96,232),al=wrap(doc,addrPhone(o),R,9.96,232);
  const n=nl.length+al.length+3;                       // + GSTIN, PAN, state
  const k=1.1518;                                      // line pitch / font size on the voucher
  const s=Math.min(9.064,(last-start)/((n-1)*k)),p=s*k,sc=9.96/s*100,f=s/9.064;
  let y=start;
  nl.forEach((t,i)=>{T(doc,t,38.8,y,B,s,{scale:sc,max:232});y+=p+(i===nl.length-1?0.24*f:0);});
  al.forEach(t=>{T(doc,t,38.8,y,R,s,{scale:sc,max:232});y+=p;});
  const row=(label,val,max,small)=>{
    const ls=small?s*0.9036:s,ly=small?y-0.84*f:y;
    T(doc,label,38.8,ly,R,ls,{scale:sc});T(doc,':',small?116.76:116.5,ly,R,ls,{scale:sc});
    T(doc,val,124.2,y,R,s,{scale:sc,max:max});y+=p;
  };
  row('GSTIN/UIN',gst,150);
  row('PAN/IT No',pan,150,despatchBox);
  row('State Name',stateTxt,145);
}

/* "Invoice to" box of the other orders: the HPCL office's name in bold, its address (up to three lines), then GSTIN / PAN / state in the rows printed by statics().
   Same condensed look as the voucher (7.97pt stretched to 125%); if the address needs more than three lines the text shrinks to fit. */
function invoiceTo(doc,o){
  const gst=o.invoice_gstin||'',pan=o.invoice_pan||'',st=o.invoice_state||o.state||'';
  const code=/^\d{2}/.test(gst)?gst.slice(0,2):(STATE_CODE[st]||'');
  const stateTxt=o.invoice_name||gst||o.invoice_address?(st?`${st}, Code : ${code}`:''):'';
  let k=1,lines;
  for(;;){lines=wrap(doc,o.invoice_address,R,7.968*k,232/1.25*1);if(lines.length<=3||k<0.5)break;k-=0.1;}
  T(doc,o.invoice_name,38.8,212.88,B,7.81,{scale:105.9,max:232});
  lines.forEach((t,i)=>T(doc,t,38.8,222.36+i*9.12,R,7.968*k,{scale:125/k,max:232}));
  T(doc,gst,124.2,250.0,R,7.97,{scale:125,max:150});
  T(doc,pan,124.2,259.1,R,7.97,{scale:125,max:150});
  T(doc,stateTxt,124.2,268.2,R,7.97,{scale:125,max:145});
}

const HSN='31021090';   // HSN code of both products (HP DEF and Tata Motors HP Genuine DEF)
/* Amounts of the order in paise, or null when a line has no rate yet. */
/* the EA billed on a line (see money_) */
function billQty(i,net){return i.paid!=null?i.paid:(net?i.ea-(i.foc||0):i.ea);}
/* The rate shown on the documents is the DLP: the price per NOS including GST (rate before GST x (1 + GST %), 2 decimals - e.g. 1,400 + 18% = 1,652.00); the amount of a line is DLP x the billed NOS (100 x 1,652.00 = 1,65,200.00),
   the FOC NOS (listed on their own line) are free (0.00). The tax is not added on top: it is the part of the amounts that is GST (taxable value + tax = the total). */
const dlpOf=i=>Math.round(Number(i.rate)*(1+Number(i.gst==null?18:i.gst)/100)*100)/100;
/* Rohan Energy supplies from Chhattisgarh (GST state code 22). The order is in the same state when the outlet it is delivered to is in Chhattisgarh (its GSTIN starts with 22, else its state is
   Chhattisgarh): CGST + SGST. Any other state: IGST. A buyer GSTIN corrected on the Tax Invoice by a Rohan officer decides by its own state code. */
function sameState(o,buyerGstin,gstin){
  if(buyerGstin!=null&&/^\d{2}/.test(buyerGstin))return buyerGstin.slice(0,2)==='22';
  const og=String(o.outlet_gstin||'').trim();
  if(/^\d{2}/.test(og))return og.slice(0,2)==='22';
  if(o.state)return o.state==='Chhattisgarh';
  return /^22/.test(gstin||'');
}
function money_(o,buyerGstin,net){
  const its=o.items||[];
  if(!its.length||!its.every(i=>i.rate>0))return null;
  const gstin=buyerGstin!=null?buyerGstin:isDirect(o)?(o.outlet_gstin||''):(o.invoice_gstin||o.outlet_gstin||'');
  const intra=sameState(o,buyerGstin,gstin);   // same state as Rohan Energy (Chhattisgarh): CGST + SGST, another state: IGST
  // billed quantity of a line: a line with paid (ordered EA + FOC EA = ea) bills the paid EA on the Sales Order and the Tax Invoice alike; an older line (paid null) has its FOC inside ea:
  // the Sales Order bills ea minus the FOC (net), the Tax Invoice the whole ea
  const lines=its.map(i=>paise(i.rate*billQty(i,net))),groups={};
  its.forEach((i,k)=>{const g=Number(i.gst==null?18:i.gst);groups[g]=(groups[g]||0)+lines[k];});
  const taxes=[];let total=lines.reduce((a,b)=>a+b,0);
  Object.keys(groups).map(Number).sort((a,b)=>a-b).forEach(g=>{
    if(intra){const c=Math.round(groups[g]*g/200);taxes.push(['CGST',g/2,c],['SGST',g/2,c]);total+=2*c;}   // Tally rounds each half on its own
    else{const tax=Math.round(groups[g]*g/100);taxes.push(['IGST',g,tax]);total+=tax;}
  });
  const gross=its.map((i,k)=>paise(dlpOf(i)*billQty(i,net)));   // what a line shows: DLP x billed NOS (incl. GST)
  return {lines,gross,taxes,total,taxable:lines.reduce((a,b)=>a+b,0)};
}
function items(doc,o){
  let top=299.64;
  const m=money_(o,null,true);
  (o.items||[]).forEach((it,i)=>{
    const qty=billQty(it,true),qvol=it.ea?it.vol/it.ea*qty:0;   // the order line = the quantity billed; the FOC (e.g. 100 ordered + 8 FOC) is listed on its own line below
    const lines=wrap(doc,ITEM_DESC[it.item]||('FG-'+it.item),B,9.96,95.5),h=Math.max(1,lines.length)*11.88;
    doc.setFillColor(239,239,239);doc.rect(36.12,top,467.76,h,'F');
    T(doc,String(i+1),42.5,top+8.86,R,9.96);
    lines.forEach((t,j)=>T(doc,t,52.9,top+9.26+j*11.85,B,9.96));
    T(doc,num(qvol,3)+' Litre',318.3,top+9.26,B,9.96,{scale:70,r:true,max:44});
    T(doc,num(qty,0)+' NOS',365.4,top+9.26,B,9.96,{r:true,max:44});
    T(doc,'NOS',417.5,top+8.06,R,9,{scale:81});
    T(doc,HSN,156.7,top+9.26,R,9.96,{max:46});
    if(m){
      T(doc,num(it.gst==null?18:it.gst,0===(it.gst%1)?0:2)+' %',229,top+9.26,R,9.96,{r:true,max:27});
      T(doc,num(Number(it.rate),2),412,top+9.26,R,9.96,{r:true,max:44});   // the rate WITHOUT GST; the tax follows below the lines
      T(doc,money(m.lines[i]),501.4,top+9.26,B,9.96,{r:true,max:62});
    }
    top+=h+5.88;
    /* FOC (free of cost) of this line, listed below the order line: same product, rate column FOC, amount 0.00. Order line + FOC line = the quantity delivered (the total below). */
    const foc=it.paid!=null?(it.foc||0):0;
    if(foc>0){
      const fl=wrap(doc,(ITEM_DESC[it.item]||('FG-'+it.item))+' - FOC',B,9.96,95.5),fh=Math.max(1,fl.length)*11.88;
      doc.setFillColor(239,239,239);doc.rect(36.12,top,467.76,fh,'F');
      fl.forEach((t,j)=>T(doc,t,52.9,top+9.26+j*11.85,B,9.96));
      T(doc,num(it.ea?it.vol/it.ea*foc:0,3)+' Litre',318.3,top+9.26,B,9.96,{scale:70,r:true,max:44});
      T(doc,num(foc,0)+' NOS',365.4,top+9.26,B,9.96,{r:true,max:44});
      T(doc,'NOS',417.5,top+8.06,R,9,{scale:81});
      T(doc,HSN,156.7,top+9.26,R,9.96,{max:46});
      if(m){
        T(doc,num(it.gst==null?18:it.gst,0===(it.gst%1)?0:2)+' %',229,top+9.26,R,9.96,{r:true,max:27});
        T(doc,'FOC',412,top+9.26,R,9.96,{r:true,max:44});
        T(doc,money(0),501.4,top+9.26,B,9.96,{r:true,max:62});
      }
      top+=fh+5.88;
    }
  });
  if(m){   // the amounts above are without the tax: the taxable value (their sum) and the tax lines follow, the total at the bottom includes the tax
    T(doc,'Taxable value',148,top+9.26,'bolditalic',9.96,{r:true});
    T(doc,money(m.taxable),501.4,top+9.26,B,9.96,{r:true,max:62});
    top+=11.88;
  }
  if(m)m.taxes.forEach(t=>{
    T(doc,t[0],148,top+9.26,'bolditalic',9.96,{r:true});
    T(doc,num(t[1],t[1]%1?1:0),412,top+9.26,R,9.96,{r:true,max:30});
    T(doc,'%',419,top+8.06,R,9);
    T(doc,money(t[2]),501.4,top+9.26,B,9.96,{r:true,max:62});
    top+=11.88;
  });
  T(doc,num(o.total_vol,3)+' Litre',318.3,492.4,B,9.96,{scale:70,r:true,max:44});
  T(doc,num(o.total_ea,0)+' NOS',365.4,492.4,B,9.96,{r:true,max:44});
  if(m){
    T(doc,money(m.total),501.4,492.4,B,9.96,{r:true,max:62});
    wrap(doc,words(m.total),B,9.96,460).forEach((t,k)=>T(doc,t,38.8,518.2+k*11.9,B,9.96));
  }
}

function make(o){
  const doc=new window.jspdf.jsPDF({unit:'pt',format:'letter',compress:true});
  const direct=isDirect(o);
  items(doc,o);
  statics(doc,direct);
  T(doc,dmy(o.order_date),391.4,66.8,B,9.96);
  T(doc,o.voucher_no,276.8,66.8,B,9.96,{max:108});     // voucher no. and buyer's ref. are the same number
  T(doc,o.voucher_no,276.8,117.3,B,9.96,{max:108});
  if(direct){party(doc,o,140.04,192.6,true);party(doc,o,215.52,268.1,false);}
  else{despatch(doc,o);invoiceTo(doc,o);}
  frame(doc);
  const safe=s=>String(s||'').replace(/[^A-Za-z0-9 _.-]+/g,' ').replace(/\s+/g,' ').trim();
  const base=safe(o.outlet)||('Sales Order '+safe(o.ref));   // file name is just the outlet name
  doc.setProperties({title:base});   // the PDF viewer's own Save button names the file from this
  return {doc,name:base+'.pdf'};
}
/* ── Tax Invoice (orders placed by HPCL): generated, together with the Sales Order, when the super admin approves the order. Same supplier, parties, rates and GST as the Sales Order,
   laid out like the Rohan Energy Tally "Tax Invoice" (A4: e-Invoice header, supplier / consignee / buyer, reference grid, items, tax lines, round-off,
   total in words, HSN tax summary, declaration). IRN, Ack No, Ack Date, challan, despatch and vehicle fields stay blank: an order does not carry them. ── */
/* The generated (uncorrected) value of every field a Rohan officer may correct on the Tax Invoice; dates as YYYY-MM-DD. */
function invDefaults(o){
  const cons={name:String(o.outlet||'').toUpperCase()+' ('+(o.sap_code||o.ro_code||'')+')',addr:addrPhone(o),gstin:o.outlet_gstin||'',state:o.state||''};
  const buy=isDirect(o)?cons:{name:o.invoice_name||cons.name,addr:o.invoice_address||cons.addr,gstin:o.invoice_gstin||'',state:o.invoice_state||o.state||''};
  return {inv_date:o.order_date||'',order_date:o.order_date||'',despatch_doc_date:'',ack_date:'',irn:'',ack_no:'',challan_no:'',terms_payment:'15 Days',
    other_ref:o.invoice_no?(o.voucher_no||''):'',order_no:o.ref||'',despatch_doc_no:'',despatch_through:'',destination:o.district||'',bl_no:'',vehicle_no:'',terms_delivery:'',
    consignee_name:cons.name,consignee_addr:cons.addr,consignee_gstin:cons.gstin,consignee_state:cons.state,
    buyer_name:buy.name,buyer_addr:buy.addr,buyer_gstin:buy.gstin,buyer_state:buy.state};
}
function makeInvoice(o){
  const D=invDefaults(o),E=o.invoice_edits||{};   // E = corrections made by a Rohan officer (only the fields that differ)
  const V=k=>Object.prototype.hasOwnProperty.call(E,k)?E[k]:D[k];
  if(E.items)o=Object.assign({},o,{items:(o.items||[]).map(i=>E.items[i.item]?Object.assign({},i,E.items[i.item]):i)});   // corrected rate / GST % of a line
  const doc=new window.jspdf.jsPDF({unit:'pt',format:'a4',compress:true});
  const X0=30,X1=568,XM=353,XR=459;
  doc.setDrawColor(0);doc.setLineWidth(0.5);
  const line=(a,b,c,d)=>doc.line(a,b,c,d);
  const box=(x,y,w,h)=>doc.rect(x,y,w,h);
  const txt=(s,x,y,f,sz,al)=>{doc.setFont('helvetica',f||R);doc.setFontSize(sz||8);doc.text(String(s==null?'':s),x,y,al?{align:al}:undefined);};
  const fit=(s,f,sz,w)=>wrap(doc,s,f,sz,w);
  const direct=isDirect(o),m=money_(o,Object.prototype.hasOwnProperty.call(E,'buyer_gstin')?E.buyer_gstin:null);
  // parties: HP DEF is sold straight to the outlet, other orders are billed through the HPCL office (same rule as the Sales Order)
  const outletParty={name:V('consignee_name'),addr:V('consignee_addr'),gstin:V('consignee_gstin'),state:V('consignee_state')};
  const buyer={name:V('buyer_name'),addr:V('buyer_addr'),gstin:V('buyer_gstin'),state:V('buyer_state')};
  const stateOf=p=>{const c=/^\d{2}/.test(p.gstin)?p.gstin.slice(0,2):(STATE_CODE[p.state]||'');return p.state?p.state+', Code : '+c:'';};

  // header: title, e-Invoice block (left empty)
  txt('Tax Invoice',297.5,20,B,10,'center');
  txt('e-Invoice',X1,20,B,8,'right');
  [['IRN',86],['Ack No.',106],['Ack Date',116]].forEach(r=>{txt(r[0],X0+4,r[1],R,8);txt(':',X0+52,r[1],R,8);});   // IRN, Ack No. and Ack Date are filled in by hand after the e-invoice is registered (or by a Rohan officer with Edit Tax Invoice)
  [[V('irn'),86],[V('ack_no'),106],[dmy(V('ack_date')),116]].forEach(r=>{if(r[0])txt(r[0],X0+58,r[1],B,8);});
  // QR code: scanning it opens this invoice (invoice.html?t=<token>, no sign-in)
  if(o.doc_token&&window.qrcode){
    const qr=window.qrcode(0,'M');qr.addData(new URL('invoice.html?t='+o.doc_token,document.baseURI).href);qr.make();
    const n=qr.getModuleCount(),sz=96,q=sz/(n+2),qx=X1-sz,qy=30;   // one module of quiet zone each side
    doc.setFillColor(0,0,0);
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))doc.rect(qx+(c+1)*q,qy+(r+1)*q,q+0.15,q+0.15,'F');
  }

  // main frame: left = supplier / consignee / buyer, right = reference grid + terms of delivery
  const top=132,H=236;
  box(X0,top,X1-X0,H);
  line(XM,top,XM,top+H);
  let y=top+9;
  txt('ROHAN ENERGY SOLUTIONS PVT LTD - CHHATISGARH',X0+3,y,B,7.5);y+=9.6;
  ['Plot No. 103, Near MRC JAckson ,Tatibandh, Raipur - 492009','Head Office - 6th Floor, S Cube Business Centre,','Opposite Magnum Hospital Institute, Vasant Manket,','Canada Corner, Nashik, Maharashtra - 422005.','GSTIN/UIN: 22AAHCR5321D1ZW','State Name :  Chhattisgarh, Code : 22','E-Mail : rohanenergy2020@gmail.com']
    .forEach(t=>{txt(t,X0+3,y,R,7.5);y+=9.4;});
  const party=(label,p,y0)=>{
    let yy=y0+8;
    txt(label,X0+3,yy,R,7.5);yy+=10;
    fit(p.name,B,8,XM-X0-8).slice(0,2).forEach(t=>{txt(t,X0+3,yy,B,8);yy+=9.4;});
    fit(p.addr,R,7.5,XM-X0-8).slice(0,3).forEach(t=>{txt(t,X0+3,yy,R,7.5);yy+=9;});
    txt('GSTIN/UIN',X0+3,yy,R,7.5);txt(': '+p.gstin,X0+70,yy,R,7.5);yy+=9;
    txt('State Name',X0+3,yy,R,7.5);txt(': '+stateOf(p),X0+70,yy,R,7.5);
  };
  party('Consignee',outletParty,top+82);
  party('Buyer',buyer,top+160);
  // reference grid: 7 rows x 2 cells
  const rh=21;
  const invNo=o.invoice_no||o.voucher_no;   // RETI/... (orders placed by HPCL before the Sales Order existed kept it in voucher_no)
  const cells=[['Invoice No.',invNo,'Dated',dmy(V('inv_date'))],['Challan No',V('challan_no'),'Mode/Terms of Payment',V('terms_payment')],["Supplier's Ref.",invNo,'Other Reference',V('other_ref')],
               ['Order No.',V('order_no'),'Dated',dmy(V('order_date'))],['Despatch Doc No',V('despatch_doc_no'),'Dated',dmy(V('despatch_doc_date'))],['Despatch Through',V('despatch_through'),'Destination',V('destination')],['Bill of Lading/LR-RR No.',V('bl_no'),'Motor Vehicle No.',V('vehicle_no')]];
  cells.forEach((c,r)=>{
    const yy=top+r*rh;
    if(r)line(XM,yy,X1,yy);
    txt(c[0],XM+3,yy+8,R,7.5);txt(fit(c[1],B,8,XR-XM-6)[0]||'',XM+3,yy+17,B,8,undefined);
    txt(c[2],XR+3,yy+8,R,7.5);txt(fit(c[3],B,8,X1-XR-6)[0]||'',XR+3,yy+17,B,8);
  });
  line(XR,top,XR,top+7*rh);line(XM,top+7*rh,X1,top+7*rh);
  txt('Terms of Delivery',XM+3,top+7*rh+9,R,7.5);
  fit(V('terms_delivery'),B,8,X1-XM-8).slice(0,6).forEach((t,k)=>txt(t,XM+3,top+7*rh+20+k*9.4,B,8));

  // items: Sl | Description | HSN/SAC | Quantity | Rate | per | Amount
  const hy=top+H,cols=[X0,43,XM,397,440,486,505,X1];
  box(X0,hy,X1-X0,18);
  cols.slice(1,-1).forEach(x=>line(x,hy,x,hy+18));
  txt('SI',X0+3,hy+8,R,7.5);txt('No.',X0+3,hy+15,R,6);
  [['Description of Goods',198,'center'],['HSN/SAC',XM+3],['Quantity',cols[3]+3],['Rate',cols[4]+3],['per',cols[5]+3],['Amount',cols[6]+3]].forEach(c=>txt(c[0],c[1],hy+12,R,7.5,c[2]));
  const bodyTop=hy+18,bodyBot=549;
  box(X0,bodyTop,X1-X0,bodyBot-bodyTop);
  cols.slice(1,-1).forEach(x=>line(x,bodyTop,x,bodyBot));
  let ry=bodyTop+14;
  (o.items||[]).forEach((it,i)=>{
    txt(i+1,X0+4,ry,R,8);
    const dl=fit(ITEM_DESC[it.item]||('FG-'+it.item),B,8,XM-43-8);
    dl.forEach((t,j)=>txt(t,46,ry+j*9.5,B,8));
    txt(HSN,XM+3,ry,R,8);
    // item + FOC are ONE line: all the NOS delivered (ordered + FOC), the rate after FOC (amount / all NOS) and the amount; both WITHOUT GST, the tax lines follow below
    const bq=it.ea;
    txt(num(bq,0)+' NOS',cols[4]-3,ry,B,8,'right');txt('('+num(it.vol,0)+' litre)',cols[4]-3,ry+9,'italic',7,'right');
    txt('NOS',cols[5]+3,ry,R,7);
    if(m){txt(num(bq?Math.round(m.lines[i]/bq)/100:0,2),cols[5]-3,ry,R,8,'right');txt(money(m.lines[i]),X1-3,ry,B,8,'right');}
    ry+=Math.max(dl.length*9.5,20)+8;
  });
  ry+=14;
  let rounded=null;
  if(m){
    m.taxes.forEach(t=>{const r=num(t[1],t[1]%1?1:0);
      txt('OUTPUT '+t[0]+' @'+r+'%',XM-4,ry,'bolditalic',8,'right');txt(r,cols[5]-3,ry,'italic',8,'right');txt('%',cols[5]+3,ry,'italic',8);txt(money(t[2]),X1-3,ry,B,8,'right');ry+=10.5;});
    rounded=Math.round(m.total/100)*100;
    const ro=rounded-m.total;
    if(ro){txt('Less :',X0+22,ry+2,'italic',7.5);txt('Rounded Off',XM-4,ry+2,'bolditalic',8,'right');txt((ro<0?'(-)':'(+)')+num(Math.abs(ro)/100,2),X1-3,ry+2,B,8,'right');}
  }
  // total row
  const tY=bodyBot;box(X0,tY,X1-X0,16);
  cols.slice(1,-1).forEach(x=>line(x,tY,x,tY+16));
  txt('Total',XM-4,tY+11,R,8,'right');
  txt(num(o.total_ea,0)+' NOS',cols[4]-3,tY+11,B,8,'right');
  if(m)txt('Rs. '+money(rounded),X1-3,tY+11,B,9,'right');
  // amount in words
  const wY=tY+16;box(X0,wY,X1-X0,25);
  txt('Amount Chargeable (in words)',X0+3,wY+8,R,7);txt('E. & O.E',X1-3,wY+8,I,7,'right');
  if(m)fit(words(rounded),B,8,X1-X0-8).forEach((t,k)=>txt(t,X0+3,wY+19+k*9.5,B,8));
  // HSN / tax summary (two-level header like Tally)
  let yy=wY+25+3;
  let dY;
  if(m){
    const intra=m.taxes.some(t=>t[0]==='CGST');
    const sc=intra?[X0,310,360,385,445,470,518,X1]:[X0,330,400,445,505,X1];   // right edge of each column (HSN, Taxable Value, tax rate/amount pairs, Total Tax Amount)
    const hh=22;
    box(X0,yy,X1-X0,hh);
    sc.slice(1,-1).forEach((x,i)=>{if(i===2||(intra&&i===4)){line(x,yy+hh/2,x,yy+hh);}else line(x,yy,x,yy+hh);});
    txt('HSN/SAC',(sc[0]+sc[1])/2,yy+13,R,7,'center');
    const hdr=(i,a,b)=>{txt(a,sc[i+1]-3,yy+(b?9:13),R,7,'right');if(b)txt(b,sc[i+1]-3,yy+18,R,7,'right');};
    if(intra){
      txt('Taxable',sc[2]-3,yy+9,R,7,'right');txt('Value',sc[2]-3,yy+18,R,7,'right');
      txt('CGST',(sc[2]+sc[4])/2,yy+8,R,7,'center');line(sc[2],yy+hh/2,sc[4],yy+hh/2);
      txt('Rate',sc[3]-3,yy+18,R,7,'right');txt('Amount',sc[4]-3,yy+18,R,7,'right');
      txt('SGST/UTGST',(sc[4]+sc[6])/2,yy+8,R,7,'center');line(sc[4],yy+hh/2,sc[6],yy+hh/2);
      txt('Rate',sc[5]-3,yy+18,R,7,'right');txt('Amount',sc[6]-3,yy+18,R,7,'right');
      txt('Total',sc[7]-3,yy+9,R,7,'right');txt('Tax Amount',sc[7]-3,yy+18,R,7,'right');
    }else{
      txt('Taxable',sc[2]-3,yy+9,R,7,'right');txt('Value',sc[2]-3,yy+18,R,7,'right');
      txt('IGST',(sc[2]+sc[4])/2,yy+8,R,7,'center');line(sc[2],yy+hh/2,sc[4]-0,yy+hh/2);
      txt('Rate',sc[3]-3,yy+18,R,7,'right');txt('Amount',sc[4]-3,yy+18,R,7,'right');
      txt('Total',sc[5]-3,yy+9,R,7,'right');txt('Tax Amount',sc[5]-3,yy+18,R,7,'right');
    }
    yy+=hh;
    const row=(vals,f)=>{box(X0,yy,X1-X0,12);sc.slice(1,-1).forEach(x=>line(x,yy,x,yy+12));
      vals.forEach((t,i)=>{if(t==='')return;if(i===0&&f===R)txt(t,X0+3,yy+9,f,7.5);else txt(t,(i===0?sc[1]:sc[i+1])-3,yy+9,f,7.5,'right');});yy+=12;};
    // per GST rate: taxable value and each half of the tax, computed the same way as the tax lines above
    const groups={};(o.items||[]).forEach((it,k)=>{const g=Number(it.gst==null?18:it.gst);groups[g]=(groups[g]||0)+m.lines[k];});
    let tVal=0,tHalf=0,tTax=0;
    Object.keys(groups).map(Number).sort((a,b)=>a-b).forEach(g=>{
      tVal+=groups[g];
      if(intra){const h=Math.round(groups[g]*g/200),rt=num(g/2,(g/2)%1?1:0)+'%';tHalf+=h;tTax+=2*h;row([HSN,money(groups[g]),rt,money(h),rt,money(h),money(2*h)],R);}
      else{const t=Math.round(groups[g]*g/100),rt=num(g,g%1?1:0)+'%';tTax+=t;row([HSN,money(groups[g]),rt,money(t),money(t)],R);}
    });
    row(intra?['Total',money(tVal),'',money(tHalf),'',money(tHalf),money(tTax)]:['Total',money(tVal),'',money(tTax),money(tTax)],B);
    txt('Tax Amount (in words) :',X0+3,yy+13,R,8);
    fit(words(tTax),B,8.5,X1-X0-120).slice(0,1).forEach(t=>txt(t,X0+92,yy+13,B,8.5));
    txt("Company's PAN :",X0+3,yy+25,R,8);txt('AAHCR5321D',X0+92,yy+25,B,8);
    dY=yy+32;
  }else{
    txt('Rate and tax are blank: the price of an item has not been set yet.',X0+3,yy+12,I,8);
    dY=yy+24;
  }
  // declaration + signature
  box(X0,dY,X1-X0,34);line(XM-100,dY,XM-100,dY+34);
  txt('Declaration',X0+3,dY+8,R,7);
  fit('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',R,7.5,XM-100-X0-8).forEach((t,k)=>txt(t,X0+3,dY+17+k*8.5,R,7.5));
  txt('for ROHAN ENERGY SOLUTIONS PVT LTD - CHHATISGARH',XM-97,dY+10,B,7.5);
  txt('Authorised Signatory',X1-3,dY+30,R,7,'right');
  txt('SUBJECT TO NASHIK JURISDICTION',297.5,dY+48,R,7.5,'center');
  txt('This is a Computer Generated Invoice',297.5,dY+62,R,7.5,'center');
  const safe=s=>String(s||'').replace(/[^A-Za-z0-9 _.-]+/g,' ').replace(/\s+/g,' ').trim();
  const base=('Tax Invoice '+(safe(invNo)||safe(o.ref))+' '+safe(o.outlet)).trim();
  doc.setProperties({title:base});
  return {doc,name:base+'.pdf'};
}
window.OM_SO={make,makeInvoice,invDefaults};
})();
