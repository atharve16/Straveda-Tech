import type { ImportLine, MisRow } from './domain';

function rows(text: string): { data: string[][]; rowNumbers: number[]; skipped: number } {
  const output: string[][]=[];const rowNumbers:number[]=[];let row:string[]=[],cell='',quoted=false,skipped=0,line=1,rowStart=1;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"') { if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; }
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim())){output.push(row);rowNumbers.push(rowStart);}else skipped++;row=[];cell='';line++;rowStart=line;}
    else if(c==='\n'||c==='\r'){cell+=c;if(c==='\r'&&text[i+1]==='\n'){cell+='\n';i++;}line++;}
    else cell+=c;
  }
  if(quoted)throw new Error('CSV has an unclosed quoted field.');
  row.push(cell);if(row.some(x=>x.trim())){output.push(row);rowNumbers.push(rowStart);}
  return { data: output, rowNumbers, skipped };
}
export function parseMisCsvDetailed(text:string): { lines: ImportLine[]; rowNumbers: number[]; skipped: number; issues: { row: number; reason: string }[] } {
  const parsed=rows(text.replace(/^\uFEFF/,''));const data=parsed.data;if(!data.length)throw new Error('CSV is empty.');
  const headings=data.shift()!.map(x=>x.trim().toLowerCase());
  const index=['d','sap','item','ea'].map(key=>headings.indexOf(key));
  if(index.some(i=>i<0))throw new Error('CSV needs d,sap,item,ea headings.');
  const rowNumbers=parsed.rowNumbers.slice(1);
  const issues=data.flatMap((row,i)=>row.length===headings.length?[]:[{row:rowNumbers[i],reason:`Expected ${headings.length} columns, found ${row.length}.`}]);
  return { lines:data.map(row=>({d:row[index[0]]?.trim()||'',sap:row[index[1]]?.trim()||'',item:row[index[2]]?.trim()||'',ea:row[index[3]]?.trim()||''})), rowNumbers, skipped:parsed.skipped, issues };
}
export function parseMisCsv(text:string):ImportLine[]{return parseMisCsvDetailed(text).lines;}
const quote=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
export function misCsv(rows:MisRow[]):string{
  const keys:(keyof MisRow)[]=['id','d','sap','outlet','state','zone','ro','sales_area','item','ea','litres','src','notes'];
  return [keys.join(','),...rows.map(row=>keys.map(key=>quote(row[key])).join(','))].join('\r\n')+'\r\n';
}
