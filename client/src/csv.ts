import type { ImportLine, MisRow } from './domain';

function rows(text: string): string[][] {
  const output: string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"') { if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; }
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))output.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('CSV has an unclosed quoted field.');
  row.push(cell);if(row.some(x=>x.trim()))output.push(row);
  return output;
}
export function parseMisCsv(text:string):ImportLine[]{
  const data=rows(text.replace(/^\uFEFF/,''));if(!data.length)throw new Error('CSV is empty.');
  const headings=data.shift()!.map(x=>x.trim().toLowerCase());
  const index=['d','sap','item','ea'].map(key=>headings.indexOf(key));
  if(index.some(i=>i<0))throw new Error('CSV needs d,sap,item,ea headings.');
  return data.map(row=>({d:row[index[0]]?.trim()||'',sap:row[index[1]]?.trim()||'',item:row[index[2]]?.trim()||'',ea:row[index[3]]?.trim()||''}));
}
const quote=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
export function misCsv(rows:MisRow[]):string{
  const keys:(keyof MisRow)[]=['id','d','sap','outlet','state','zone','ro','sales_area','item','ea','litres','src','notes'];
  return [keys.join(','),...rows.map(row=>keys.map(key=>quote(row[key])).join(','))].join('\r\n')+'\r\n';
}
