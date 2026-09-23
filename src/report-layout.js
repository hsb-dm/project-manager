<script>
/* Workbook presentation layer. All report values still come from the selected export scope. */
function reportPeriod(){ return EXPORT?iso(EXPORT.from)+" → "+iso(EXPORT.to):tr("Last")+" "+S.range+" "+tr("weeks"); }
function xlCell(ref,value,style,formula){
  var attrs=' r="'+ref+'" s="'+(REPORT_TEMPLATE.ids[style]||0)+'"';
  if (typeof value==="number"&&isFinite(value)) return '<c'+attrs+'>'+(formula?'<f>'+xml(formula)+'</f>':'')+'<v>'+value+'</v></c>';
  return '<c'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+xml(value==null?'':value)+'</t></is></c>';
}
function xlStart(widths,freeze){ return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0">'+(freeze?'<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>':'')+'</sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>'+widths.map(function(w,i){return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>';}).join('')+'</cols>'; }
function xlPage(){return '<pageMargins left="0.3" right="0.3" top="0.35" bottom="0.35" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';}
function xlDate(value){ if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return value;var stamp=Date.parse(value+'T00:00:00Z');return isFinite(stamp)?stamp/86400000+25569:value; }
function reportDetailXml(key,name,rows,widths,summaryName){
  var dates={tasks:[8,9],projects:[4,5]},ratios={projects:[3],workload:[5],weekly:[5],teams:[7]},decimals={weekly:[4,6]};
  var n=rows[0].length,last=colName(n-1);widths=rows[0].map(function(h,i){var word=Math.max.apply(null,String(h).split(/\s+/).map(function(w){return w.length;}));return Math.max(widths[i]||22,Math.min(32,word+6),(dates[key]||[]).indexOf(i)>=0?16:0);});
  var h=xlStart(widths,true)+'<sheetData><row r="1" ht="36" customHeight="1">'+xlCell('A1',name,'title')+'</row><row r="2" ht="32" customHeight="1">'+xlCell('A2',WS.name+' · '+reportPeriod()+(key==='assets'?' · '+tr('Entire asset library'):'') ,'context')+'</row><row r="3" ht="24" customHeight="1">'+xlCell('A3',summaryName?tr('Back to summary'):'','context')+'</row>';
  rows.forEach(function(row,ri){var r=ri+4,lines=Math.max.apply(null,row.map(function(v,i){return String(v==null?'':v).split('\n').reduce(function(n,line){return n+Math.max(1,Math.ceil(line.length/Math.max(8,widths[i]-3)));},0);}));h+='<row r="'+r+'" ht="'+(ri?Math.min(409,Math.max(36,lines*15+9)):Math.max(42,lines*15+12))+'" customHeight="1">';row.forEach(function(v,ci){var style=ri?(ri%2?'body':'stripe'):'header';if(ri&&v!==''&&v!=null){var suffix=ri%2?'':'Stripe';if((dates[key]||[]).indexOf(ci)>=0||(key==='tasks'&&ci>=21&&WS.customFields[ci-21]&&WS.customFields[ci-21].type==='date')){v=xlDate(v);style='date'+suffix;}else if((ratios[key]||[]).indexOf(ci)>=0&&typeof v==='number'){v/=100;style='ratio'+suffix;}else if(typeof v==='number'){style=((decimals[key]||[]).indexOf(ci)>=0||v%1!==0?'decimal':'integer')+suffix;}}h+=xlCell(colName(ci)+r,v,style);});h+='</row>';});
  h+='</sheetData><autoFilter ref="A4:'+last+(rows.length+3)+'"/><mergeCells count="3"><mergeCell ref="A3:'+colName(Math.min(n-1,2))+'3"/><mergeCell ref="A1:'+colName(Math.min(n-1,5))+'1"/><mergeCell ref="A2:'+colName(Math.min(n-1,5))+'2"/></mergeCells>';
  var ratioCol=(ratios[key]||[])[0];if(ratioCol!==undefined&&rows.length>1)h+='<conditionalFormatting sqref="'+colName(ratioCol)+'5:'+colName(ratioCol)+(rows.length+3)+'"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="num" val="0"/><cfvo type="num" val="1"/><color rgb="FF1F4FD8"/></dataBar></cfRule></conditionalFormatting>';
  if(summaryName)h+='<hyperlinks><hyperlink ref="A3" location="'+xml("'"+summaryName.replace(/'/g,"''")+"'!A1")+'" display="'+xml(tr('Back to summary'))+'"/></hyperlinks>';
  return h+xlPage()+'</worksheet>';
}
function reportDashboardXml(d,sheets){
  var m=d.m,tasks=reportTasks(),done=tasks.filter(isClosed),metrics=[
    ['Tasks completed',m.totalCompleted],['Tasks created',m.totalCreated],['Overdue now',m.overdueNow],['Team utilization',m.utilization/100],
    ['Assets delivered',assetsProduced(done)],['Assets in production',assetsProduced(tasks.filter(function(t){return !isClosed(t);} ))],['In review',m.inReview],['Approval rate',m.approvalRate/100],
    ['Avg completion (days)',+m.avgCompletion],['Revision rate',m.liveRevRate/100],['Avg approval time (h)',+m.avgApproval],['Asset links',assetLinks(tasks).length],['Assets / completed task',done.length?Math.round(assetsProduced(done)/done.length*10)/10:0],['Open tasks now',m.openNow]
  ];
  var rows={},merges=[],links=[];function put(r,c,v,style,f){if(!rows[r])rows[r]={cells:{},height:22};rows[r].cells[c]=xlCell(colName(c)+r,v,style,f);}function height(r,h){if(!rows[r])rows[r]={cells:{}};rows[r].height=h;}
  function merge(r,c,endR,endC,v,style,f){for(var y=r;y<=endR;y++)for(var x=c;x<=endC;x++)put(y,x,'',style);put(r,c,v,style,f);merges.push(colName(c)+r+':'+colName(endC)+endR);}
  merge(1,0,2,14,WS.name+' · '+tr('Creative report'),'title');height(1,24);height(2,20);
  merge(3,0,4,14,reportPeriod()+' · '+tr('Scope')+': '+(exScopeLine()||tr('All teams'))+' · '+tr('Report date')+': '+iso(0),'context');height(3,19);height(4,19);height(5,10);
  metrics.slice(0,8).forEach(function(k,i){var c=i%4*4,r=i<4?6:11;merge(r,c,r,c+2,tr(k[0]),'label');height(r,28);merge(r+1,c,r+2,c+2,k[1],i===3||i===7?'percent':i===2&&k[1]>0?'danger':'value','F'+(47+i));height(r+1,27);height(r+2,27);merge(r+3,c,r+3,c+2,i===3?m.asg+'h / '+m.cap+'h':'','note');height(r+3,14);});height(10,10);height(15,10);height(16,8);
  for(var r=17;r<=30;r++)height(r,20);height(31,12);
  merge(32,0,32,6,tr('Performance details'),'section');merge(32,8,32,14,tr('Report sheets'),'section');height(32,28);
  metrics.slice(8).forEach(function(k,i){var r=33+i;merge(r,0,r,4,tr(k[0]),i%2?'stripe':'body');merge(r,5,r,6,k[1],i===1?'ratio':i===0||i===2||i===4?'decimal':'integer','F'+(55+i));height(r,25);});
  sheets.filter(function(s){return s[3]!=='summary';}).forEach(function(s,i){var r=33+i;merge(r,8,r,14,s[0]+'  →','context');links.push('<hyperlink ref="I'+r+'" location="'+xml("'"+s[0].replace(/'/g,"''")+"'!A1")+'" display="'+xml(s[0]+'  →')+'"/>');height(r,25);});
  merge(42,0,42,14,tr('Values reflect the selected period and scope.'),'context');height(42,25);
  // Source tables use the dashboard grid as wide merged columns, not narrow single cells.
  merge(46,0,46,4,tr('Metric'),'header');merge(46,5,46,6,tr('Value'),'header');height(46,42);
  metrics.forEach(function(k,i){var r=47+i,stripe=i%2?'Stripe':'',style=[3,7,9].indexOf(i)>=0?'ratio':[8,10,12].indexOf(i)>=0?'decimal':'integer';merge(r,0,r,4,tr(k[0]),i%2?'stripe':'body');merge(r,5,r,6,k[1],style+stripe);height(r,Math.max(36,Math.ceil(tr(k[0]).length/38)*15+12));});
  [tr('Week'),tr('Created'),tr('Completed')].forEach(function(v,i){merge(65,i===0?0:i===1?3:5,65,i===0?2:i===1?4:6,v,'header');});height(65,36);
  m.weeks.forEach(function(w,i){var r=66+i,suffix=i%2?'Stripe':'';merge(r,0,r,2,w,i%2?'stripe':'body');merge(r,3,r,4,m.created[i]||0,'integer'+suffix);merge(r,5,r,6,m.completed[i]||0,'integer'+suffix);height(r,Math.max(rows[r]&&rows[r].height||0,36));});
  var teams=m.byTeam.slice().sort(function(a,b){return b.utilization-a.utilization;});merge(46,8,46,11,tr('Team'),'header');merge(46,12,46,14,tr('Team utilization'),'header');teams.forEach(function(t,i){var r=47+i;merge(r,8,r,11,t.name,i%2?'stripe':'body');merge(r,12,r,14,t.utilization/100,i%2?'ratioStripe':'ratio');height(r,Math.max(rows[r]&&rows[r].height||0,Math.ceil(t.name.length/28)*15+12,36));});
  // A compact chart shows the eight busiest teams; every team remains in the source table.
  if(teams.length>8)merge(43,8,43,14,tr('Chart shows the 8 busiest teams.'),'context');
  var widths=Array.from({length:15},function(_,i){return i===3||i===7||i===11?2.5:11;});
  var h=xlStart(widths,false)+'<sheetData>'+Object.keys(rows).sort(function(a,b){return +a-+b;}).map(function(r){return '<row r="'+r+'" ht="'+(rows[r].height||22)+'" customHeight="1">'+Object.keys(rows[r].cells).sort(function(a,b){return +a-+b;}).map(function(c){return rows[r].cells[c];}).join('')+'</row>';}).join('')+'</sheetData><mergeCells count="'+merges.length+'">'+merges.map(function(ref){return '<mergeCell ref="'+ref+'"/>';}).join('')+'</mergeCells>'+(links.length?'<hyperlinks>'+links.join('')+'</hyperlinks>':'')+xlPage().replace('fitToHeight="0"','fitToHeight="1"')+'<drawing r:id="rId1"/></worksheet>';
  return {xml:h,teams:teams.slice(0,8)};
}
function reportChartXml(index,name,m,teams){
  var categories=index?teams.map(function(t){return t.name;}):m.weeks;
  var datasets=index?[teams.map(function(t){return t.utilization/100;})]:[m.created,m.completed];
  var col=index?'I':'A',firstRow=index?47:66,seriesIndex=0,quoted="'"+name.replace(/'/g,"''")+"'!";
  function ref(c){return xml(quoted+'$'+c+'$'+firstRow+':$'+c+'$'+(firstRow-1+Math.max(1,categories.length)));}
  function cache(values,numeric){return '<c:ptCount val="'+values.length+'"/>'+values.map(function(v,i){return '<c:pt idx="'+i+'"><c:v>'+xml(numeric?(Number(v)||0):v)+'</c:v></c:pt>';}).join('');}
  var chart=REPORT_TEMPLATE.charts[index].replace(/<c:ser>[\s\S]*?<\/c:ser>/g,function(ser){var i=seriesIndex++,label=index?tr('Team utilization'):tr(i?'Completed':'Created');return ser.replace(/<c:tx>[\s\S]*?<\/c:tx>/,'<c:tx><c:v>'+xml(label)+'</c:v></c:tx>').replace(/<c:cat>[\s\S]*?<\/c:cat>/,'<c:cat><c:strRef><c:f>'+ref(col)+'</c:f><c:strCache>'+cache(categories,false)+'</c:strCache></c:strRef></c:cat>').replace(/<c:val>[\s\S]*?<\/c:val>/,'<c:val><c:numRef><c:f>'+ref(index?'M':i?'F':'D')+'</c:f><c:numCache><c:formatCode>'+(index?'0%':'0')+'</c:formatCode>'+cache(datasets[i],true)+'</c:numCache></c:numRef></c:val>');});
  chart=chart.replace('Created and completed',xml(tr('Created and completed'))).replace('<a:t>Team utilization</a:t>','<a:t>'+xml(tr('Team utilization'))+'</a:t>');
  if(!index)chart=chart.replace(/<c:spPr><a:solidFill xmlns:a="([^"]+)"><a:srgbClr val="([A-Fa-f0-9]+)"\s*\/><\/a:solidFill><\/c:spPr>/g,'<c:spPr><a:ln xmlns:a="$1" w="25400"><a:solidFill><a:srgbClr val="$2"/></a:solidFill></a:ln></c:spPr>');
  return chart.replace(/1F4FD8/g,WS.theme.accent.slice(1).toUpperCase());
}
function reportDrawingXml(){var ns='http://schemas.openxmlformats.org/';return '<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="'+ns+'drawingml/2006/spreadsheetDrawing" xmlns:a="'+ns+'drawingml/2006/main">'+[0,1].map(function(i){return '<xdr:twoCellAnchor><xdr:from><xdr:col>'+(i?8:0)+'</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>16</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>'+(i?15:7)+'</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>30</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="'+(i+2)+'" name="Report chart '+(i+1)+'"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="'+ns+'drawingml/2006/chart"><c:chart xmlns:c="'+ns+'drawingml/2006/chart" xmlns:r="'+ns+'officeDocument/2006/relationships" r:id="rId'+(i+1)+'"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';}).join('')+'</xdr:wsDr>';}
</script>
