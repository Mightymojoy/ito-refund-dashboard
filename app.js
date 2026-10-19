'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={year:'年',month:'月',week:'周',day:'日',channel:'渠道',shop:'店铺',category:'品类',series:'系列',size:'尺寸',color:'颜色',sku:'SKU'};
const pos={shop:1,category:2,series:3,sku:4},keys=Object.keys(names);
let data=null,selected=Object.fromEntries(keys.map(k=>[k,new Set()])),tab='overview',page=1,productRows=[],filtered=[],shopRows=[],polling=false;
let seriesRows=[],regionRows=[],compareRows=[],channelRows=[];
let refundFactorRows=[];
let categoryWeekly=null,categoryWeek=null,categoryTrendSelected=null,categoryTrendManual=false;
let dateRange={start:'',end:''};
let seriesWeeklyTrend=null,seriesTrendSelection=new Set(),seriesTrendManual=false,seriesTrendWeek=null;
let seriesTrendCategoryScope=null;
const seriesTrendColors=['#4263eb','#119783','#db8541','#9360c7','#d34f79','#4186a1','#85832f','#80543c'];
let skuMatrix=null,matrixRows=[],matrixCell=null,matrixMode='quantity';
let skuMatrices=[],matrixSeriesSelection=new Set(),matrixSeriesInitialized=false;
const directKeys=new Set(['year','month','week','day','size','color','channel']),weeks=new Map(),regionOpen=new Set();
let regionInitialized=false;
let basketAnalysis=null,basketPair=['行李箱','行李箱'],basketPage=1,basketVisibleRows=[],basketRankingRows=[],basketBasis='shipped';
const basketProductFilters=['category','series','sku','size','color'];
const basketCorePairs=[['行李箱','行李箱'],['行李箱','双肩包'],['行李箱','箱套'],['双肩包','双肩包']];
const money=v=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v),int=v=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(v),pct=v=>(v*100).toFixed(2)+'%';
const amount=v=>v>=100000000?(v/100000000).toFixed(2)+'<small>亿元</small>':v>=10000?(v/10000).toFixed(2)+'<small>万元</small>':money(v)+'<small>元</small>';
function shortShop(s){const parts=s.split('_');return parts.findLast?.(p=>/店|商城|小程序/.test(p))||parts.at(-1)||s;}
function weekInfo(date){
  if(weeks.has(date))return weeks.get(date);
  const d=new Date(date+'T00:00:00Z'),monday=new Date(d);monday.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  const end=new Date(monday);end.setUTCDate(end.getUTCDate()+6);
  const thursday=new Date(monday);thursday.setUTCDate(thursday.getUTCDate()+3);const year=thursday.getUTCFullYear();
  const first=new Date(Date.UTC(year,0,4));first.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7);
  const start=monday.toISOString().slice(0,10),finish=end.toISOString().slice(0,10),iso=`${year}-W${String(Math.round((monday-first)/604800000)+1).padStart(2,'0')}`;
  const result={start,end:finish,iso,label:`${iso} · ${start} 至 ${finish}`};weeks.set(date,result);return result;
}
function attribute(id,k){return String(data.products[id]?.[k]||'').trim()||`未填写${names[k]}`;}
function shopChannel(id){return data.channels?.[data.dimensions.shops[id]]||'未分类';}
function getValue(r,k){return k==='year'?r[0].slice(0,4):k==='month'?r[0].slice(5,7):k==='week'?weekInfo(r[0]).start:k==='day'?r[0]:k==='channel'?shopChannel(r[1]):k==='size'||k==='color'?attribute(r[4],k):String(r[pos[k]]);}
function inCustomRange(date){return (!dateRange.start||date>=dateRange.start)&&(!dateRange.end||date<=dateRange.end);}
function match(r,except){return inCustomRange(r[0])&&keys.every(k=>k===except||!selected[k].size||selected[k].has(getValue(r,k)));}
function clearDateRange(){dateRange={start:'',end:''};$('custom-date-start').value='';$('custom-date-end').value='';$('custom-date-status').textContent='按订单付款日期；与年月周日筛选取交集，可只填写一端。';$('custom-date-status').classList.remove('invalid');page=1;render();}
function label(k,v){if(v.startsWith('missing:'))return v.slice(8)+'（暂无数据）';if(k==='year')return v+' 年';if(k==='month')return v+' 月';if(k==='week')return weekInfo(v).label;if(k==='day')return v.replaceAll('-',' / ');if(k==='size'||k==='color'||k==='channel')return v;if(k==='shop')return shortShop(data.dimensions.shops[+v]);if(k==='category')return data.dimensions.categories[+v];if(k==='series')return data.dimensions.series[+v];const p=data.products[+v];return `${p.code} · ${p.name}`;}
function fullLabel(k,v){if(v.startsWith('missing:'))return v.slice(8);return k==='shop'?data.dimensions.shops[+v]:k==='sku'?`${data.products[+v].code} ${data.products[+v].item_code} ${data.products[+v].name}`:label(k,v);}
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2800);}
function setupFilters(){
  $('filters').innerHTML=keys.map(k=>`<details class="filter" data-key="${k}" ${['year','month','channel'].includes(k)?'open':''}><summary><span>${names[k]}</span><span class="filter-count" id="count-${k}">全部</span></summary>${k==='week'?'<p class="filter-help">周一至周日；与年月日筛选取交集</p>':''}<input class="filter-search" placeholder="搜索${names[k]}" aria-label="搜索${names[k]}" data-search="${k}"><div class="filter-actions"><span class="filter-actions-left"><button data-clear="${k}">全部</button><button class="filter-reset" data-reset-filter="${k}" aria-label="重置${names[k]}筛选" title="清除${names[k]}选择及搜索，保留其他筛选">重置</button></span><button data-select="${k}">选择可见项</button></div><div class="filter-options" id="options-${k}"></div></details>`).join('');
  $('filters').addEventListener('input',e=>{if(e.target.dataset.search)renderOptions(e.target.dataset.search);});
  $('filters').addEventListener('change',e=>{const k=e.target.dataset.filter;if(!k)return;const v=e.target.value;e.target.checked?selected[k].add(v):selected[k].delete(v);if(k==='year'){selected.month.clear();selected.week.clear();selected.day.clear();}if(k==='month'){selected.week.clear();selected.day.clear();}if(k==='week')selected.day.clear();page=1;render();});
  $('filters').addEventListener('click',e=>{const button=e.target.closest('[data-clear],[data-select],[data-reset-filter]');if(!button)return;const k=button.dataset.clear||button.dataset.select||button.dataset.resetFilter;if(button.dataset.resetFilter){selected[k].clear();document.querySelector(`[data-search="${k}"]`).value='';}else if(button.dataset.clear)selected[k].clear();else for(const v of options(k))if(searchMatch(k,v))selected[k].add(v);page=1;render();});
}
function options(k){const values=new Set();for(const r of data.facts)if(match(r,k))values.add(getValue(r,k));return [...new Set([...values,...selected[k]])].sort((a,b)=>['year','month','week','day'].includes(k)?a.localeCompare(b):label(k,a).localeCompare(label(k,b),'zh-CN'));}
function searchMatch(k,v){const q=document.querySelector(`[data-search="${k}"]`)?.value.toLowerCase()||'';return fullLabel(k,v).toLowerCase().includes(q);}
function renderOptions(k){
  const opts=options(k).filter(v=>searchMatch(k,v));const show=opts.slice(0,400);
  $(`options-${k}`).innerHTML=show.length?show.map(v=>`<label class="filter-option" title="${esc(fullLabel(k,v))}"><input type="checkbox" data-filter="${k}" value="${esc(v)}" ${selected[k].has(v)?'checked':''}><span>${esc(label(k,v))}</span></label>`).join('')+(opts.length>400?'<div class="filter-none">选项较多，请搜索缩小范围</div>':''):'<div class="filter-none">没有匹配选项</div>';
  const count=$(`count-${k}`);count.textContent=selected[k].size?selected[k].size===1?label(k,[...selected[k]][0]):`${selected[k].size} 项`:'全部';count.classList.toggle('selected',!!selected[k].size);
}
function sum(rows){const v={sales:0,returns:0,qty:0,returnQty:0,lines:0,bad:0,refundBad:0,refundLines:0,skuCount:new Set(rows.map(r=>r[4])).size};for(const r of rows){v.sales+=r[5];v.returns+=r[6];v.qty+=r[7];v.returnQty+=r[8]||0;v.lines+=r[9];v.bad+=r[10];v.refundBad+=r[11]||0;v.refundLines+=r[12]||0;}v.rate=v.sales>0&&!v.bad&&!v.refundBad&&data.metric_ready?v.returns/v.sales:null;v.quantityRate=v.qty>0?v.returnQty/v.qty:null;return v;}
function withRefundFactor(row,base){row.factorBaseSales=base.bad?null:base.sales;row.salesShare=base.sales>0&&!base.bad&&!row.bad?row.sales/base.sales:null;row.refundFactor=row.salesShare!==null&&row.rate!==null?row.salesShare*row.rate:null;return row;}
function refundFactorText(row,digits=2){return row.refundFactor==null?'—':(row.refundFactor*100).toFixed(digits)+' 个百分点';}
function scopeTotals(rows=filtered){const total=sum(rows);return withRefundFactor(total,total);}
function rateText(r){return r.rate!==null?pct(r.rate):r.bad||r.refundBad?'金额异常':r.sales<=0?'无销售数据':'—';}
function ratePill(r){return r.rate===null?`<span class="bar-value pending">${rateText(r)}</span>`:`<span class="rate-pill ${r.rate>.25?'high':''}">${pct(r.rate)}</span>`;}
function grouped(rows,index){const groups=new Map(),base=sum(rows);for(const r of rows){const key=typeof index==='function'?index(r):r[index];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}return [...groups].map(([key,rs])=>withRefundFactor({key,...sum(rs)},base));}

function render(){
  if(!data)return;filtered=data.facts.filter(r=>match(r));const totals=scopeTotals();keys.forEach(renderOptions);
  $('selection').innerHTML=((dateRange.start||dateRange.end)?`<span class="filter-chip">日期：${dateRange.start||'不限'} 至 ${dateRange.end||'不限'}<button data-remove-date-range aria-label="清除自定义时间">×</button></span>`:'')+keys.filter(k=>selected[k].size).map(k=>`<span class="filter-chip">${names[k]}：${esc(selected[k].size===1?label(k,[...selected[k]][0]):selected[k].size+' 项')}<button data-remove="${k}" aria-label="清除${names[k]}筛选">×</button></span>`).join('');if(!$('selection').innerHTML)$('selection').innerHTML='<span class="selection-placeholder">全部数据 · 可在左侧组合筛选</span>';
  $('rate').innerHTML=totals.rate!==null?(totals.rate*100).toFixed(2)+'<small>%</small>':'—';$('rate-foot').textContent=totals.rate===null?rateText(totals):'退款金额 / 对应销售金额';
  $('sales').innerHTML=totals.bad?'—':amount(totals.sales);$('sales-foot').textContent=data.config.sales_amount_mode==='item_payment_less_postage'?'单品支付金额－分摊邮费 · 已发货':'销售订单明细 · '+(data.config.sales_amount_column?data.config.sales_amount_column+'列':'')+(data.config.exclude_unshipped?'已发货销售金额合计':'订单支付金额合计');$('returns').innerHTML=totals.refundBad?'—':amount(totals.returns);$('returns-foot').textContent=data.config.calculation_mode==='matched_order_cohort'?'售后AI列 · 匹配订单后归回付款日期':data.config.refund_amount_grain==='sku_line'?'售后退货明细 · '+data.config.return_amount_column+'列商品金额合计':'售后退货明细 · 去重分摊后的退款总额';
  $('quantity').textContent=int(totals.qty);$('quantity-foot').textContent=`${int(totals.lines)} 行销售明细 · ${int(totals.skuCount)} 个商品SKU`;
  shopRows=grouped(filtered,1).sort((a,b)=>(b.rate??-1)-(a.rate??-1)||b.sales-a.sales);$('shop-count').textContent=shopRows.length+' 个店铺';$('channel-rows').textContent=shopRows.length+' 条结果';
  channelRows=grouped(filtered,r=>shopChannel(r[1])).sort(compareRate);
  seriesRows=grouped(filtered,3).sort(compareRate);
  renderChannels(totals);renderChannelGroups(totals);renderTrend();renderProducts();renderRefundFactors();renderCategoryWeekly();renderComposition('category',2);renderSeriesBars('series-chart',seriesRows.slice(0,12));$('series-count').textContent=seriesRows.length+' 项 · 展示前12项';renderQuality();renderActiveAnalysis();
}
function compareRate(a,b){return (b.rate??-Infinity)-(a.rate??-Infinity)||b.returns-a.returns||b.sales-a.sales;}
function compactMoney(v){return v>=100000000?(v/100000000).toFixed(2)+'亿元':v>=10000?(v/10000).toFixed(2)+'万元':money(v)+'元';}
function renderRefundFactors(){
  const mode=$('refund-factor-mode').value,index={category:2,series:3,sku:4}[mode],q=$('refund-factor-search').value.trim().toLowerCase(),base=scopeTotals(),all=grouped(filtered,index).sort((a,b)=>(b.refundFactor??-Infinity)-(a.refundFactor??-Infinity)||b.sales-a.sales);
  const name=r=>mode==='sku'?`${data.products[r.key].code} · ${data.products[r.key].name}`:data.dimensions[mode==='category'?'categories':'series'][r.key];
  refundFactorRows=all.filter(r=>name(r).toLowerCase().includes(q));
  const max=Math.max(.001,...refundFactorRows.map(r=>r.refundFactor??0));
  $('refund-factor-scope').textContent=`销售占比分母：当前左侧筛选销售总额 ${base.bad?'金额异常':money(base.sales)+' 元'}。搜索只过滤列表，不改变分母；退款因子反映该品对整体退款率的贡献，例如 20% × 30%＝6 个百分点。`;
  $('refund-factor-count').textContent=`${refundFactorRows.length} / ${all.length} 个${names[mode]}`;
  $('refund-factor-table').innerHTML=refundFactorRows.map(r=>`<tr><td><button class="shop-link" data-group-filter="${mode}" data-group-id="${r.key}">${esc(name(r))}</button>${mode==='sku'?`<span class="sub">${esc(data.dimensions.series[data.products[r.key].series])}</span>`:''}</td><td>${r.bad?'—':money(r.sales)}</td><td>${r.salesShare===null?'—':pct(r.salesShare)}</td><td>${ratePill(r)}</td><td><div class="factor-contribution"><strong>${refundFactorText(r)}</strong><span class="factor-mini-track"><i style="width:${r.refundFactor===null?0:Math.max(0,r.refundFactor/max*100)}%"></i></span></div></td></tr>`).join('')||'<tr class="empty-row"><td colspan="5">没有匹配的商品</td></tr>';
  const visible=new Set(refundFactorRows.map(p=>p.key)),shown=withRefundFactor(sum(filtered.filter(r=>visible.has(r[index]))),base);
  $('refund-factor-total').innerHTML=`<tr><td>${q?'当前显示合计':'筛选合计'}</td><td>${shown.bad?'—':money(shown.sales)}</td><td>${shown.salesShare===null?'—':pct(shown.salesShare)}</td><td>${ratePill(shown)}</td><td>${refundFactorText(shown)}</td></tr>`;
  $('refund-factor-export').disabled=!refundFactorRows.length;
}
function exportRefundFactors(){
  const mode=$('refund-factor-mode').value,header=[names[mode],'商品名称','销售金额（元）','占比基准销售金额（元）','销售占比','退款率','退款因子（百分点）'],rows=refundFactorRows.map(r=>[mode==='sku'?data.products[r.key].code:data.dimensions[mode==='category'?'categories':'series'][r.key],mode==='sku'?data.products[r.key].name:'',r.bad?'金额异常':r.sales.toFixed(4),r.factorBaseSales===null?'金额异常':r.factorBaseSales.toFixed(4),r.salesShare===null?'':(r.salesShare*100).toFixed(6)+'%',r.rate===null?'':(r.rate*100).toFixed(6)+'%',r.refundFactor===null?'':(r.refundFactor*100).toFixed(6)]);
  downloadFactorCSV('退款因子_'+mode,header,rows);
}
function downloadFactorCSV(name,header,rows){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\ufeff'+[header,...rows].map(r=>r.map(quote).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function ppText(value,signed=true,digits=3){if(value===null)return '—';const n=Number((value*100).toFixed(digits));return (signed&&n>0?'+':'')+n.toFixed(digits)+' 个百分点';}
function deltaClass(value){return value===null||Math.abs(value)<1e-10?'flat':value>0?'up':'down';}
function categoryPeriods(){
  if(!filtered.length)return [];let first=filtered[0][0],last=first,coverageFirst=data.facts[0][0],coverageLast=coverageFirst;
  for(const r of filtered){if(r[0]<first)first=r[0];if(r[0]>last)last=r[0];}for(const r of data.facts){if(r[0]<coverageFirst)coverageFirst=r[0];if(r[0]>coverageLast)coverageLast=r[0];}
  const periods=[];for(let key=weekInfo(first).start;key<=weekInfo(last).start;key=shiftDate(key,7)){
    const days=Array.from({length:7},(_,i)=>shiftDate(key,i)).filter(date=>date>=coverageFirst&&date<=coverageLast&&inCustomRange(date)&&['year','month','week','day'].every(k=>!selected[k].size||selected[k].has(getValue([date],k))));
    if(days.length)periods.push({key,...weekInfo(key),effectiveStart:days[0],effectiveEnd:days.at(-1),partial:days.length!==7});
  }return periods;
}
function buildCategoryWeekly(){
  const cats=grouped(filtered,2).sort((a,b)=>b.sales-a.sales).map((r,i)=>({id:r.key,name:data.dimensions.categories[r.key],color:seriesTrendColors[i%seriesTrendColors.length]})),buckets=new Map();
  for(const r of filtered){const key=weekInfo(r[0]).start;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(r);}
  const periods=categoryPeriods().map(week=>{const rows=buckets.get(week.key)||[],total=sum(rows),groups=new Map(grouped(rows,2).map(r=>[r.key,r]));return {...week,total,categories:cats.map(cat=>{const own=groups.get(cat.id)||withRefundFactor(sum([]),total);return {...cat,...own,hasData:groups.has(cat.id),contribution:total.rate===null?null:own.returns/total.sales};})};});
  return {weeks:periods,categories:cats,comparison:null};
}
function categoryComparison(key){
  const current=categoryWeekly.weeks.find(w=>w.key===key),previous=categoryWeekly.weeks.find(w=>w.key===shiftDate(key,-7));if(!current)return null;
  const change=current.total.rate!==null&&previous?.total.rate!=null?current.total.rate-previous.total.rate:null;
  const rows=current.categories.filter(c=>c.hasData||previous?.categories.find(p=>p.name===c.name)?.hasData).map(c=>{const prev=previous?.categories.find(p=>p.name===c.name)||null;return {name:c.name,color:c.color,current:c,previous:prev,rateChange:c.rate!==null&&prev?.rate!=null?c.rate-prev.rate:null,impact:change===null?null:c.contribution-prev.contribution};}).sort((a,b)=>Math.abs(b.impact??0)-Math.abs(a.impact??0)||b.current.sales-a.current.sales);
  return {current,previous:previous||null,change,rows,impactTotal:change===null?null:rows.reduce((n,r)=>n+r.impact,0)};
}
function renderCategoryWeekly(){
  categoryWeekly=buildCategoryWeekly();const {weeks:periods,categories}=categoryWeekly;
  if(!categoryTrendManual||!categoryTrendSelected)categoryTrendSelected=new Set(categories.slice(0,4).map(c=>c.name));else{const kept=new Set([...categoryTrendSelected].filter(name=>categories.some(c=>c.name===name)));categoryTrendSelected=kept.size||!categoryTrendSelected.size?kept:new Set(categories.slice(0,4).map(c=>c.name));}
  if(!categories.length)categoryTrendSelected=null;
  if(!periods.some(w=>w.key===categoryWeek)){
    const complete=periods.filter(w=>!w.partial&&categoryComparison(w.key)?.previous?.partial===false&&categoryComparison(w.key)?.change!==null);categoryWeek=(complete.at(-1)||periods.filter(w=>categoryComparison(w.key)?.change!==null).at(-1)||periods.at(-1))?.key||null;
  }
  $('category-week-select').innerHTML=periods.length?periods.slice().reverse().map(w=>`<option value="${w.key}" ${w.key===categoryWeek?'selected':''}>${w.iso} · ${w.start} 至 ${w.end}${w.partial?'（部分周）':''}</option>`).join(''):'<option>当前筛选无数据</option>';$('category-week-select').disabled=!periods.length;$('category-week-export').disabled=!periods.length;
  $('category-week-scope').textContent=`${dateRange.start||dateRange.end?'自定义付款日期：'+(dateRange.start||'不限')+' 至 '+(dateRange.end||'不限')+'。':''}按当前左侧时间、渠道、店铺和商品范围计算；默认显示销售额前4个品类，点击标签可增减曲线。品类明细始终包含当周和上周的全部有效品类。`;
  $('category-week-legend').innerHTML='<span class="category-overall-legend">┄ 整体退款率</span>'+categories.map(c=>`<button data-category-curve="${esc(c.name)}" aria-pressed="${categoryTrendSelected.has(c.name)}" class="${categoryTrendSelected.has(c.name)?'active':''}"><i style="background:${c.color}"></i>${esc(c.name)}</button>`).join('');
  renderCategoryWeeklyChart();renderCategoryComparison(categoryWeek);
}
function renderCategoryWeeklyChart(){
  const periods=categoryWeekly.weeks,lines=[{name:'整体退款率',color:'#23395e',overall:true},...categoryWeekly.categories.filter(c=>categoryTrendSelected?.has(c.name))],valid=lines.flatMap(line=>periods.map(w=>line.overall?w.total.rate:w.categories.find(c=>c.name===line.name).rate).filter(v=>v!==null));
  if(!periods.length||!valid.length){$('category-week-chart').innerHTML='<div class="chart-empty">当前筛选没有可计算的周退款率</div>';return;}
  const W=960,H=255,L=62,R=35,T=15,B=40,min=Math.min(0,...valid),max=Math.max(.01,...valid)*1.12,x=i=>L+(periods.length===1?(W-L-R)/2:i/(periods.length-1)*(W-L-R)),y=v=>T+(max-v)/(max-min)*(H-T-B);let svg='';
  for(let i=0;i<=4;i++){const v=max-(max-min)*i/4,yy=y(v);svg+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e8edf6" stroke-dasharray="3 4"/><text x="${L-10}" y="${yy+4}" text-anchor="end" font-size="10" fill="#8c9ab0">${pct(v)}</text>`;}
  const step=Math.max(1,Math.ceil(periods.length/8));periods.forEach((w,i)=>{if(i%step===0||i===periods.length-1)svg+=`<text x="${x(i)}" y="${H-16}" text-anchor="middle" font-size="10" fill="#8c9ab0">${w.iso}${w.partial?'*':''}</text>`;});
  for(const line of lines){let points=[];const draw=()=>{if(points.length)svg+=`<path d="${points.map(([v,i],j)=>(j?'L':'M')+x(i).toFixed(2)+','+y(v).toFixed(2)).join(' ')}" fill="none" stroke="${line.color}" stroke-width="${line.overall?3:2}" ${line.overall?'stroke-dasharray="6 4"':''}/>`;points=[];};periods.forEach((w,i)=>{const value=line.overall?w.total.rate:w.categories.find(c=>c.name===line.name).rate;if(value===null){draw();return;}points.push([value,i]);svg+=`<circle cx="${x(i)}" cy="${y(value)}" r="3" fill="#fff" stroke="${line.color}" stroke-width="2"><title>${esc(line.name+' · '+w.label+'\n退款率：'+pct(value))}</title></circle>`;});draw();}
  periods.forEach((w,i)=>{const left=i?(x(i-1)+x(i))/2:L-8,right=i===periods.length-1?W-R+8:(x(i)+x(i+1))/2;svg+=`<rect data-category-week="${w.key}" x="${left}" y="${T}" width="${right-left}" height="${H-T-B}" fill="transparent" tabindex="0" role="button" aria-label="查看${esc(w.label)}品类变化"/>`;});
  $('category-week-chart').innerHTML=`<div class="category-week-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="整体与各品类每周退款率趋势">${svg}</svg></div>`;
}
function renderCategoryComparison(key){
  categoryWeek=key;const comparison=key?categoryComparison(key):null;categoryWeekly.comparison=comparison;
  if(!comparison){$('category-week-summary').innerHTML='';$('category-week-insight').textContent='当前筛选没有可统计的订单。';$('category-week-impacts').innerHTML='';$('category-week-table').innerHTML='';$('category-week-reconciliation').textContent='';return;}
  $('category-week-select').value=key;const {current,previous,change,rows,impactTotal}=comparison;
  const period=w=>w?`${w.iso} · ${w.effectiveStart} 至 ${w.effectiveEnd}${w.partial?' · 部分周':''}`:'当前筛选未包含上周';
  $('category-week-summary').innerHTML=[['上周整体退款率',previous?.total.rate==null?'—':pct(previous.total.rate),period(previous),''],['本周整体退款率',current.total.rate===null?'—':pct(current.total.rate),period(current),''],['较上周变化',ppText(change),change===null?'需包含相邻两周，且两周销售金额有效':(current.partial||previous.partial?'部分周比较 · 仅计算所选日期':'相邻两个完整付款周'),deltaClass(change)]].map(([title,value,sub,cls])=>`<article><span>${title}</span><strong class="${cls}">${value}</strong><small>${sub}</small></article>`).join('');
  const describe=list=>list.slice(0,3).map(r=>`${r.name} ${ppText(r.impact)}`).join('、')+(list.length>3?' 等'+list.length+'个品类':'');
  const up=rows.filter(r=>r.impact!==null&&r.impact>1e-10),down=rows.filter(r=>r.impact!==null&&r.impact< -1e-10);
  $('category-week-insight').textContent=change===null?'当前无法计算周变化：请在左侧包含相邻两周，并确认两周均有有效销售金额。':`整体退款率${change>1e-10?'上升':change< -1e-10?'下降':'持平'} ${ppText(Math.abs(change),false)}。${up.length?'拉升：'+describe(up)+'。':''}${down.length?'拉低：'+describe(down)+'。':''}`;
  const max=Math.max(.00001,...rows.map(r=>Math.abs(r.impact??0)));
  $('category-week-impacts').innerHTML=change===null?'<div class="category-impact-empty">无可比周数据，明细仍展示当前退款率。</div>':rows.map(r=>`<div class="category-impact-row"><span>${esc(r.name)}</span><div class="category-impact-track"><i class="${deltaClass(r.impact)}" style="left:${r.impact>=0?50:50-Math.abs(r.impact)/max*50}%;width:${Math.abs(r.impact)/max*50}%"></i></div><strong class="${deltaClass(r.impact)}">${ppText(r.impact)}</strong></div>`).join('');
  $('category-week-table').innerHTML=rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.previous?.rate==null?'—':pct(r.previous.rate)}</td><td>${r.current.rate===null?'—':pct(r.current.rate)}</td><td class="${deltaClass(r.rateChange)}">${r.rateChange===null?(!r.previous?.hasData&&r.current.hasData?'本周新增':!r.current.hasData?'本周无订单':'—'):ppText(r.rateChange)}</td><td>${r.previous?.salesShare==null?'—':pct(r.previous.salesShare)}</td><td>${r.current.salesShare===null?'—':pct(r.current.salesShare)}</td><td class="${deltaClass(r.impact)}">${ppText(r.impact)}</td></tr>`).join('');
  $('category-week-reconciliation').textContent=change===null?'无可比较的周变化，不填充为 0。':`分品类贡献增减合计 ${ppText(impactTotal)} ＝ 整体退款率变化 ${ppText(change)} · ${Math.abs(impactTotal-change)<1e-10?'已核对一致':'需核对'}；合计使用未四舍五入数据。`;
}
function exportCategoryWeeks(){
  if(!categoryWeekly?.weeks.length)return;const header=['本周ISO周','本周统计开始','本周统计结束','上周ISO周','是否部分周比较','品类','上周品类销售金额','本周品类销售金额','上周品类退款金额','本周品类退款金额','上周品类退款率','本周品类退款率','自身退款率变化（百分点）','上周销售占比','本周销售占比','上周对整体贡献（百分点）','本周对整体贡献（百分点）','对整体周变化贡献（百分点）','整体周变化（百分点）'],rows=[];
  const rate=v=>v==null?'':(v*100).toFixed(6),amt=v=>v==null?'':v.toFixed(4);
  for(const week of categoryWeekly.weeks){const c=categoryComparison(week.key);for(const r of c.rows)rows.push([week.iso,week.effectiveStart,week.effectiveEnd,c.previous?.iso||'',week.partial||c.previous?.partial?'是':'否',r.name,amt(r.previous?.sales),amt(r.current.sales),amt(r.previous?.returns),amt(r.current.returns),rate(r.previous?.rate),rate(r.current.rate),rate(r.rateChange),rate(r.previous?.salesShare),rate(r.current.salesShare),rate(r.previous?.contribution),rate(r.current.contribution),rate(r.impact),rate(c.change)]);}
  downloadFactorCSV('每周退款率品类拆解',header,rows);
}
function renderComposition(kind,index){
  const groups=grouped(filtered,index).sort((a,b)=>b.sales-a.sales),totals=sum(filtered),max=Math.max(1,...groups.map(r=>r.sales));
  $(kind+'-chart').innerHTML=groups.slice(0,8).map(r=>`<div class="bar-row"><button class="bar-label shop-link" data-group-filter="${kind}" data-group-id="${r.key}" title="${esc(label(kind,String(r.key)))}">${esc(label(kind,String(r.key)))}</button><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,r.sales/max*100)}%"></div></div><span class="bar-value" title="${money(r.sales)} 元">${compactMoney(r.sales)}</span></div>`).join('')||'<div class="chart-empty">没有匹配数据</div>';
  $(kind+'-count').textContent=groups.length+' 项 · 展示前8项';
}
function renderChannels(totals){
  const max=Math.max(.05,...shopRows.map(r=>r.rate??0));
  $('channel-chart').innerHTML=shopRows.length?shopRows.map(r=>`<div class="bar-row"><button class="bar-label shop-link" data-shop="${r.key}" title="${esc(data.dimensions.shops[r.key])}">${esc(shortShop(data.dimensions.shops[r.key]))}</button><div class="bar-track"><div class="bar-fill" style="width:${r.rate===null?0:Math.max(0,r.rate/max*100)}%"></div></div><span class="bar-value ${r.rate===null?'pending':''}">${rateText(r)}</span></div>`).join(''):'<div class="chart-empty">没有匹配的店铺</div>';
  $('channel-table').innerHTML=shopRows.map(r=>`<tr><td><button class="shop-link" data-shop="${r.key}">${esc(shortShop(data.dimensions.shops[r.key]))}<span class="sub">${esc(data.dimensions.shops[r.key])}</span></button></td><td>${r.bad?'—':money(r.sales)}</td><td>${r.refundBad?'—':money(r.returns)}</td><td>${ratePill(r)}</td><td>${totals.sales>0&&!totals.bad?pct(r.sales/totals.sales):'—'}</td><td>${int(r.qty)}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="6">没有匹配的数据</td></tr>';
  $('channel-total').innerHTML=`<tr><td>筛选合计</td><td>${totals.bad?'—':money(totals.sales)}</td><td>${totals.refundBad?'—':money(totals.returns)}</td><td>${ratePill(totals)}</td><td>${totals.sales>0&&!totals.bad?'100.00%':'—'}</td><td>${int(totals.qty)}</td></tr>`;
}
function renderChannelGroups(totals){
  const max=Math.max(.01,...channelRows.map(r=>r.rate??0));$('channel-group-count').textContent=channelRows.length+' 类渠道';
  $('channel-groups-chart').innerHTML=channelRows.map(r=>`<div class="bar-row"><button class="bar-label shop-link" data-channel="${esc(r.key)}">${esc(r.key)}</button><div class="bar-track"><div class="bar-fill" style="width:${r.rate===null?0:Math.max(0,r.rate/max*100)}%"></div></div><span class="bar-value ${r.rate===null?'pending':''}" title="销售 ${money(r.sales)} 元 / 退款 ${money(r.returns)} 元">${rateText(r)}</span></div>`).join('')||'<div class="chart-empty">没有匹配的渠道数据</div>';
  $('channel-groups-table').innerHTML=channelRows.map(r=>`<tr><td><button class="shop-link" data-channel="${esc(r.key)}">${esc(r.key)}</button><span class="sub">${shopRows.filter(s=>shopChannel(s.key)===r.key).length} 个店铺</span></td><td>${r.bad?'—':money(r.sales)}</td><td>${r.refundBad?'—':money(r.returns)}</td><td>${ratePill(r)}</td><td>${totals.sales>0&&!totals.bad&&!r.bad?pct(r.sales/totals.sales):'—'}</td><td>${int(r.qty)}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="6">没有匹配的渠道数据</td></tr>';
  $('channel-groups-total').innerHTML=`<tr><td>筛选合计</td><td>${totals.bad?'—':money(totals.sales)}</td><td>${totals.refundBad?'—':money(totals.returns)}</td><td>${ratePill(totals)}</td><td>${totals.sales>0&&!totals.bad?'100.00%':'—'}</td><td>${int(totals.qty)}</td></tr>`;
  renderChannelShopBreakdown();
}
function renderChannelShopBreakdown(){
  const container=$('channel-shop-breakdown');container.hidden=!selected.channel.size;
  if(container.hidden){container.innerHTML='';return;}
  const ids=new Map(data.dimensions.shops.map((shop,id)=>[shop,id])),metrics=new Map(shopRows.map(r=>[r.key,r]));
  const chosenShops=selected.shop.size?new Set([...selected.shop].map(v=>v.startsWith('missing:')?v.slice(8):data.dimensions.shops[+v])):null;
  container.innerHTML=[...selected.channel].map(channel=>{
    const configured=channel==='线上自营'?(data.config.channel_rules?.online_owned_shops||[]):[];
    const shops=[...new Set([...data.dimensions.shops.filter(shop=>data.channels?.[shop]===channel),...configured])].filter(shop=>!chosenShops||chosenShops.has(shop)).map(shop=>({shop,id:ids.get(shop),metrics:metrics.get(ids.get(shop))})).sort((a,b)=>a.metrics&&b.metrics?compareRate(a.metrics,b.metrics):a.metrics?-1:b.metrics?1:a.shop.localeCompare(b.shop,'zh-CN'));
    const active=shops.filter(s=>s.metrics),max=Math.max(.01,...active.map(s=>s.metrics.rate??0));
    const bars=shops.map(({shop,id,metrics:r})=>{
      const text=r?rateText(r):'当前筛选无数据',title=r?`${shop}\n销售金额：${r.bad?'金额异常':money(r.sales)+' 元'}\n退款金额：${r.refundBad?'金额异常':money(r.returns)+' 元'}\n退款率：${text}`:`${shop}\n当前筛选范围没有符合统计口径的订单`;
      const name=r?`<button class="bar-label shop-link" data-shop="${id}" title="${esc(title)}">${esc(shortShop(shop))}</button>`:`<span class="bar-label" title="${esc(title)}">${esc(shortShop(shop))}</span>`;
      return `<div class="bar-row channel-shop-row ${r?'':'no-data'}" data-shop-name="${esc(shop)}" data-has-data="${!!r}">${name}<div class="bar-track" title="${esc(title)}"><div class="bar-fill" style="width:${r?.rate!=null?Math.max(0,r.rate/max*100):0}%"></div></div><span class="bar-value ${r?.rate==null?'pending':''}" title="${esc(title)}">${text}</span></div>`;
    }).join('');
    return `<section class="channel-shop-section" data-channel-name="${esc(channel)}"><div class="channel-shop-heading"><h3>${esc(channel)} · 店铺退款率</h3><span>${active.length} 家有数据${shops.length>active.length?' · '+(shops.length-active.length)+' 家当前筛选无数据':''}</span></div><p class="channel-shop-note">按退款率降序 · 时间及商品筛选同步生效 · 点击店铺查看商品</p><div class="channel-shop-bars">${bars||'<div class="chart-empty">没有匹配的店铺</div>'}</div></section>`;
  }).join('');
}
function renderTrend(){
  const g=$('granularity').value,metric=$('trend-metric').value,points=grouped(filtered,r=>g==='month'?r[0].slice(0,7):g==='week'?weekInfo(r[0]).start:r[0]).sort((a,b)=>a.key.localeCompare(b.key));
  const title={rate:'退款率',returns:'退款金额',sales:'销售金额',refundFactor:'退款因子（百分点）'}[metric],value=r=>metric==='rate'?r.rate:metric==='refundFactor'?r.refundFactor:metric==='sales'?r.bad?null:r.sales:r.refundBad?null:r.returns;
  $('trend-caption').textContent=(data.config.calculation_mode==='matched_order_cohort'?'销售与对应售后均按订单付款日期':'销售按付款日期，售后按登记日期')+(g==='week'?' · 周一至周日':'')+(metric==='refundFactor'?' · 该时段销售占比 × 该时段退款率；占比分母为当前筛选全部时段销售总额':'');$('trend-legend').textContent=title;
  const valid=points.filter(p=>value(p)!==null);if(!valid.length){$('trend-chart').innerHTML='<div class="chart-empty">当前范围没有可计算的'+title+'</div>';return;}
  const W=620,H=225,L=72,R=18,T=16,B=38,max=Math.max(metric==='rate'||metric==='refundFactor'?.01:1,...valid.map(value))*1.16,x=i=>L+(points.length===1?(W-L-R)/2:i/(points.length-1)*(W-L-R)),y=v=>T+(1-v/max)*(H-T-B),fmt=v=>metric==='rate'?pct(v):metric==='refundFactor'?(v*100).toFixed(2)+' pp':compactMoney(v);
  let svg='';for(let i=0;i<=4;i++){const yy=T+i/4*(H-T-B);svg+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#eef1f7" stroke-dasharray="3 4"/><text x="${L-10}" y="${yy+3}" text-anchor="end" fill="#a2aec2" font-size="10">${fmt(max*(1-i/4))}</text>`;}
  const step=Math.max(1,Math.ceil(points.length/6));points.forEach((p,i)=>{if(i%step===0||i===points.length-1)svg+=`<text x="${x(i)}" y="${H-12}" text-anchor="middle" fill="#99a6bd" font-size="10">${g==='month'?p.key:g==='week'?weekInfo(p.key).iso:p.key.slice(5)}</text>`;});
  const segments=[];let seg=[];points.forEach((p,i)=>{if(value(p)===null){if(seg.length)segments.push(seg);seg=[];}else seg.push([p,i]);});if(seg.length)segments.push(seg);
  for(const seg of segments){const path=seg.map(([p,i],j)=>(j?'L':'M')+x(i).toFixed(1)+','+y(value(p)).toFixed(1)).join(' ');svg+=`<path d="${path} L${x(seg.at(-1)[1])},${H-B} L${x(seg[0][1])},${H-B} Z" fill="url(#area)"/><path d="${path}" fill="none" stroke="#4263eb" stroke-width="2.5"/>`;seg.forEach(([p,i])=>{svg+=`<circle cx="${x(i)}" cy="${y(value(p))}" r="${points.length>50?2:4}" fill="white" stroke="#4263eb" stroke-width="2"><title>${g==='week'?weekInfo(p.key).label:p.key}\n退款率：${rateText(p)}\n销售金额：${money(p.sales)} 元\n退款金额：${money(p.returns)} 元\n退款因子：${refundFactorText(p)}（该时段销售占比 × 该时段退款率）</title></circle>`;});}
  $('trend-chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}趋势"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4263eb" stop-opacity=".13"/><stop offset="1" stop-color="#4263eb" stop-opacity="0"/></linearGradient></defs>${svg}</svg>`;
}
function renderProducts(){
  const q=$('product-search').value.toLowerCase(),sort=$('product-sort').value;
  productRows=grouped(filtered,4).filter(r=>{const p=data.products[r.key];return `${p.code} ${p.item_code} ${p.name}`.toLowerCase().includes(q);}).sort((a,b)=>sort==='refundFactor'?(b.refundFactor??-Infinity)-(a.refundFactor??-Infinity)||b.sales-a.sales:sort==='rate'?(b.rate??-1)-(a.rate??-1)||b.sales-a.sales:sort==='returns'?b.returns-a.returns||b.sales-a.sales:sort==='qty'?b.qty-a.qty||b.sales-a.sales:b.sales-a.sales);
  const pages=Math.max(1,Math.ceil(productRows.length/30));page=Math.min(page,pages);
  $('product-table').innerHTML=productRows.slice((page-1)*30,page*30).map(r=>{const p=data.products[r.key];return `<tr><td><span class="meta-code">${esc(p.code)}</span><span class="sub" title="${esc(p.name)}">${esc(p.name)}</span><span class="sub">${esc(p.item_code)}${p.color?' · '+esc(p.color):''}${p.size?' · '+esc(p.size):''}</span></td><td>${esc(data.dimensions.categories[p.category])}<span class="sub">${esc(data.dimensions.series[p.series])}</span></td><td>${r.bad?'—':money(r.sales)}</td><td>${r.refundBad?'—':money(r.returns)}</td><td>${ratePill(r)}</td><td>${r.salesShare===null?'—':pct(r.salesShare)}</td><td>${refundFactorText(r)}</td><td>${int(r.qty)}</td></tr>`;}).join('')||'<tr class="empty-row"><td colspan="8">没有匹配的商品</td></tr>';
  $('product-count').textContent=`共 ${int(productRows.length)} 个 SKU · 每页 30 条`;$('page-number').textContent=page+' / '+pages;$('prev').disabled=page<=1;$('next').disabled=page>=pages;
}
function renderSeriesBars(id,rows){
  const max=Math.max(.01,...rows.map(r=>r.rate??0));
  $(id).innerHTML=rows.map(r=>`<div class="bar-row"><button class="bar-label shop-link" data-group-filter="series" data-group-id="${r.key}" title="${esc(data.dimensions.series[r.key])}">${esc(data.dimensions.series[r.key])}</button><div class="bar-track"><div class="bar-fill" style="width:${r.rate===null?0:Math.max(0,r.rate/max*100)}%"></div></div><span class="bar-value ${r.rate===null?'pending':''}" title="销售 ${money(r.sales)} 元 / 退款 ${money(r.returns)} 元">${rateText(r)}</span></div>`).join('')||'<div class="chart-empty">没有匹配系列</div>';
}
function renderSeries(){
  const q=$('series-search').value.toLowerCase(),sort=$('series-sort').value;
  const shown=seriesRows.filter(r=>data.dimensions.series[r.key].toLowerCase().includes(q)).sort(sort==='refundFactor'?(a,b)=>(b.refundFactor??-Infinity)-(a.refundFactor??-Infinity)||b.sales-a.sales:sort==='rate'?compareRate:sort==='sales'?(a,b)=>b.sales-a.sales:(a,b)=>b.returns-a.returns);
  renderSeriesBars('series-rate-chart',shown);$('series-analysis-count').textContent=shown.length+' 个系列';
  const all=sum(filtered),visible=new Set(shown.map(r=>r.key)),total=withRefundFactor(sum(filtered.filter(r=>visible.has(r[3]))),all);
  const share=r=>all.sales>0&&!all.bad&&!r.bad?pct(r.sales/all.sales):'—';
  $('series-table').innerHTML=shown.map(r=>`<tr><td><button class="shop-link" data-group-filter="series" data-group-id="${r.key}">${esc(data.dimensions.series[r.key])}</button></td><td>${r.bad?'—':money(r.sales)}</td><td>${r.refundBad?'—':money(r.returns)}</td><td>${ratePill(r)}</td><td>${share(r)}</td><td>${refundFactorText(r)}</td><td>${int(r.qty)}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="7">没有匹配系列</td></tr>';
  $('series-total').innerHTML=`<tr><td>当前可见系列合计</td><td>${total.bad?'—':money(total.sales)}</td><td>${total.refundBad?'—':money(total.returns)}</td><td>${ratePill(total)}</td><td>${share(total)}</td><td>${refundFactorText(total)}</td><td>${int(total.qty)}</td></tr>`;
  renderSeriesWeeklyTrend();
}
function shiftDate(date,days){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function seriesTrendChoices(){return seriesRows.slice().sort((a,b)=>b.sales-a.sales||data.dimensions.series[a.key].localeCompare(data.dimensions.series[b.key],'zh-CN')).map(r=>data.dimensions.series[r.key]);}
function renderSeriesTrendPicker(){
  const focused=document.activeElement?.hasAttribute('data-series-trend-option')?document.activeElement.value:null;
  const available=seriesTrendChoices(),q=$('series-trend-search').value.trim().toLowerCase(),choices=[...new Set([...available,...seriesTrendSelection])].filter(name=>name.toLowerCase().includes(q));
  $('series-trend-selection-label').textContent=seriesTrendSelection.size?`已选 ${seriesTrendSelection.size} 个系列`:'选择系列（可多选）';
  $('series-trend-options').innerHTML=choices.map(name=>`<label class="series-trend-option ${available.includes(name)?'':'unavailable'}"><input type="checkbox" data-series-trend-option value="${esc(name)}" ${seriesTrendSelection.has(name)?'checked':''}><span>${esc(name)}${available.includes(name)?'':'<small>当前筛选无数据</small>'}</span></label>`).join('')||'<div class="filter-none">没有匹配系列</div>';
  if(focused!==null)[...$('series-trend-options').querySelectorAll('input')].find(el=>el.value===focused)?.focus({preventScroll:true});
}
function weeklyChangeText(point){if(point.change===null)return '较上周 —';const rounded=Number(point.change.toFixed(2));return rounded===0?'较上周持平':`较上周 ${rounded>0?'+':''}${rounded.toFixed(2)} 个百分点`;}
function weeklyChangeClass(point){const rounded=point.change===null?0:Number(point.change.toFixed(2));return rounded>0?'increased':rounded<0?'decreased':'unchanged';}
function weeklyPointText(point){return !point.hasData?'无订单':rateText(point);}
function weeklyPointTitle(series,point){const w=point.week;return `${series.name}\n${w.label}${w.partial?'（部分周）':''}\n本次统计：${w.effectiveStart} 至 ${w.effectiveEnd}\n退款率：${weeklyPointText(point)}\n${weeklyChangeText(point)}\n发货金额：${point.bad?'金额异常':money(point.sales)+' 元'}\n退款金额：${point.refundBad?'金额异常':money(point.returns)+' 元'}\n退款因子：${refundFactorText(point)}\n本周销售占比：${point.salesShare===null?'不可计算':pct(point.salesShare)}（分母为左侧筛选的该周全部系列销售额）`;}
function buildSeriesWeeklyTrend(){
  const names=[...seriesTrendSelection],chosen=new Set(names),buckets=new Map(),weekRows=new Map();let first=null,last=null,coverageFirst=null,coverageLast=null;
  for(const r of data.facts){if(coverageFirst===null||r[0]<coverageFirst)coverageFirst=r[0];if(coverageLast===null||r[0]>coverageLast)coverageLast=r[0];}
  for(const r of filtered){
    if(first===null||r[0]<first)first=r[0];if(last===null||r[0]>last)last=r[0];
    const weekKey=weekInfo(r[0]).start;if(!weekRows.has(weekKey))weekRows.set(weekKey,[]);weekRows.get(weekKey).push(r);
    const name=data.dimensions.series[r[3]];if(!chosen.has(name))continue;
    if(!buckets.has(name))buckets.set(name,new Map());const key=weekInfo(r[0]).start,byWeek=buckets.get(name);if(!byWeek.has(key))byWeek.set(key,[]);byWeek.get(key).push(r);
  }
  const periods=[];
  if(first!==null)for(let key=weekInfo(first).start;key<=weekInfo(last).start;key=shiftDate(key,7)){
    const info=weekInfo(key),days=Array.from({length:7},(_,i)=>shiftDate(key,i)).filter(date=>date>=coverageFirst&&date<=coverageLast&&inCustomRange(date)&&['year','month','week','day'].every(k=>!selected[k].size||selected[k].has(getValue([date],k))));
    if(days.length)periods.push({key,...info,effectiveStart:days[0],effectiveEnd:days.at(-1),partial:days.length!==7});
  }
  const weekTotals=new Map([...weekRows].map(([key,rows])=>[key,sum(rows)]));
  const series=names.map((name,index)=>{
    const byWeek=buckets.get(name)||new Map(),points=periods.map(week=>{const rows=byWeek.get(week.key)||[];return withRefundFactor({week,...sum(rows),hasData:rows.length>0,change:null},weekTotals.get(week.key)||sum([]));}),lookup=new Map(points.map(p=>[p.week.key,p]));
    for(const p of points){const previous=lookup.get(shiftDate(p.week.key,-7));if(p.rate!==null&&previous?.rate!=null)p.change=(p.rate-previous.rate)*100;}
    return {name,color:seriesTrendColors[index%seriesTrendColors.length],points};
  });
  return {weeks:periods,series};
}
function renderSeriesWeeklyTrend(){
  const categoryScope=JSON.stringify([...selected.category].map(value=>fullLabel('category',value)).sort());
  if(seriesTrendCategoryScope!==null&&seriesTrendCategoryScope!==categoryScope){
    const available=new Set(seriesTrendChoices());
    seriesTrendSelection=new Set([...seriesTrendSelection].filter(name=>available.has(name)));
    if(!seriesTrendSelection.size)seriesTrendManual=false;
    $('series-trend-search').value='';seriesTrendWeek=null;
  }
  seriesTrendCategoryScope=categoryScope;
  if(!seriesTrendManual){const available=seriesTrendChoices();seriesTrendSelection=new Set(selected.series.size?available:available.slice(0,5));}
  renderSeriesTrendPicker();seriesWeeklyTrend=buildSeriesWeeklyTrend();const {weeks:periods,series}=seriesWeeklyTrend;
  const categoryLabel=selected.category.size?[...selected.category].map(value=>fullLabel('category',value)).join('、'):'全部';
  $('series-trend-scope').textContent=`品类：${categoryLabel} · ${seriesTrendManual?'自定义对比':'默认展示'+(selected.series.size?'左侧已选系列':'销售金额前 5 个系列')} · 已选 ${series.length} 个系列 · ${periods.length} 周。左侧时间、渠道、店铺及商品属性同步生效；切换品类后保留适用系列，无匹配时自动展示当前范围系列。本模块选择只影响周趋势。`;
  $('series-trend-chips').innerHTML=series.map(s=>`<span class="series-trend-chip"><i style="background:${s.color}"></i>${esc(s.name)}<button data-series-trend-remove="${esc(s.name)}" aria-label="移除趋势系列${esc(s.name)}">×</button></span>`).join('');
  $('series-trend-export').disabled=!series.length||!periods.length;
  renderSeriesWeeklyChart();
  if(!periods.some(w=>w.key===seriesTrendWeek))seriesTrendWeek=periods.at(-1)?.key||null;
  renderSeriesWeeklyDetail(seriesTrendWeek);
  $('series-weekly-table').closest('table').style.minWidth=(215+170*series.length)+'px';
  $('series-weekly-head').innerHTML=`<tr><th scope="col">订单付款周</th>${series.map(s=>`<th scope="col" title="${esc(s.name)}"><i style="background:${s.color}"></i>${esc(s.name)}</th>`).join('')}</tr>`;
  $('series-weekly-table').innerHTML=!series.length||!periods.length?`<tr class="empty-row"><td colspan="${Math.max(1,series.length+1)}">${!series.length?'请选择需要对比的系列':'当前筛选没有可统计的订单'}</td></tr>`:periods.slice().reverse().map(w=>`<tr><th scope="row"><button class="shop-link" data-trend-week="${w.key}">${w.iso}${w.partial?'<span class="series-partial">部分周</span>':''}<span class="sub">${w.start} 至 ${w.end}</span>${w.partial?`<span class="sub">统计 ${w.effectiveStart} 至 ${w.effectiveEnd}</span>`:''}</button></th>${series.map(s=>{const p=s.points.find(p=>p.week.key===w.key);return `<td title="${esc(weeklyPointTitle(s,p))}"><strong>${p.rate===null?'—':pct(p.rate)}</strong><small class="${weeklyChangeClass(p)}">${p.rate===null?esc(weeklyPointText(p)):weeklyChangeText(p)}</small></td>`;}).join('')}</tr>`).join('');
}
function renderSeriesWeeklyChart(){
  const {weeks:periods,series}=seriesWeeklyTrend,container=$('series-weekly-chart');
  if(!series.length||!periods.length){container.innerHTML=`<div class="chart-empty">${!filtered.length?'当前品类及其他筛选条件下没有可统计的订单，请调整左侧筛选':!series.length?'请选择需要对比的系列':'当前筛选没有可统计的订单'}</div>`;return;}
  const valid=series.flatMap(s=>s.points.filter(p=>p.rate!==null).map(p=>p.rate));if(!valid.length){container.innerHTML='<div class="chart-empty">当前系列没有可计算的退款率，请查看下方每周明细</div>';return;}
  const W=960,H=290,L=62,R=34,T=18,B=46,lo=Math.min(0,...valid),hi=Math.max(.01,...valid),pad=(hi-lo)*.12,min=lo<0?lo-pad:0,max=hi+pad,x=i=>L+(periods.length===1?(W-L-R)/2:i/(periods.length-1)*(W-L-R)),y=v=>T+(max-v)/(max-min)*(H-T-B);
  let svg='';for(let i=0;i<=4;i++){const v=max-(max-min)*i/4,yy=y(v);svg+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e8edf6" stroke-dasharray="3 4"/><text x="${L-10}" y="${yy+4}" text-anchor="end" fill="#8191ab" font-size="11">${pct(v)}</text>`;}
  const step=Math.max(1,Math.ceil(periods.length/8));periods.forEach((w,i)=>{if(i%step===0||i===periods.length-1)svg+=`<text x="${x(i)}" y="${H-23}" text-anchor="middle" fill="#8191ab" font-size="11">${w.iso}<tspan x="${x(i)}" dy="14" font-size="10">${w.start.slice(5)}${w.partial?' · 部分周':''}</tspan></text>`;});
  series.forEach((s,si)=>{
    let segment=[];const draw=()=>{if(!segment.length)return;svg+=`<path class="series-weekly-line" data-trend-series="${esc(s.name)}" d="${segment.map(([p,i],j)=>(j?'L':'M')+x(i).toFixed(2)+','+y(p.rate).toFixed(2)).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" ${si>=seriesTrendColors.length?'stroke-dasharray="6 4"':''}/>`;segment=[];};
    s.points.forEach((p,i)=>{if(p.rate===null){draw();return;}segment.push([p,i]);});draw();
    s.points.forEach((p,i)=>{if(p.rate!==null)svg+=`<circle data-trend-series="${esc(s.name)}" data-trend-week="${p.week.key}" cx="${x(i)}" cy="${y(p.rate)}" r="3.5" fill="#fff" stroke="${s.color}" stroke-width="2"><title>${esc(weeklyPointTitle(s,p))}</title></circle>`;});
  });
  periods.forEach((w,i)=>{const left=i?(x(i-1)+x(i))/2:L-10,right=i===periods.length-1?W-R+10:(x(i)+x(i+1))/2;svg+=`<rect class="series-week-hit" data-trend-week="${w.key}" x="${left}" y="${T}" width="${right-left}" height="${H-T-B}" fill="transparent" tabindex="0" role="button" aria-label="查看${esc(w.label)}各系列退款率"/>`;});
  container.innerHTML=`<div class="series-weekly-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="各系列每周退款率趋势">${svg}</svg></div>`;
}
function renderSeriesWeeklyDetail(key){
  const {weeks:periods,series}=seriesWeeklyTrend||{weeks:[],series:[]},week=periods.find(w=>w.key===key),container=$('series-weekly-detail');seriesTrendWeek=key;
  if(!week||!series.length){container.innerHTML='';return;}
  container.innerHTML=`<div class="series-weekly-detail-heading"><strong>${week.iso} · ${week.start} 至 ${week.end}${week.partial?' · 部分周':''}</strong><span>本次统计 ${week.effectiveStart} 至 ${week.effectiveEnd} · 截至最新源表的累计售后</span></div><div class="series-weekly-detail-cards">${series.map(s=>{const p=s.points.find(p=>p.week.key===key);return `<article><div><i style="background:${s.color}"></i><span title="${esc(s.name)}">${esc(s.name)}</span></div><strong>${p.rate===null?'—':pct(p.rate)}</strong><small class="${weeklyChangeClass(p)}">${p.rate===null?esc(weeklyPointText(p)):weeklyChangeText(p)}</small><p>发货 ${p.bad?'金额异常':money(p.sales)+' 元'}<br>退款 ${p.refundBad?'金额异常':money(p.returns)+' 元'}<br>销售占比 ${p.salesShare===null?'—':pct(p.salesShare)}<br>退款因子 ${refundFactorText(p)}</p></article>`;}).join('')}</div>`;
}
function exportSeriesWeeklyCSV(){
  if(!seriesWeeklyTrend?.weeks.length||!seriesWeeklyTrend.series.length){toast('当前没有可导出的系列周趋势');return;}
  const header=['系列','ISO周','周开始','周结束','本次统计开始','本次统计结束','是否部分周','发货金额（元）','退款金额（元）','退款率','较上周变化（百分点）','退款因子（百分点）','占比基准周销售金额（元）','本周销售占比','状态'],rows=seriesWeeklyTrend.series.flatMap(s=>s.points.map(p=>[s.name,p.week.iso,p.week.start,p.week.end,p.week.effectiveStart,p.week.effectiveEnd,p.week.partial?'是':'否',!p.hasData?'':p.bad?'金额异常':p.sales.toFixed(2),!p.hasData?'':p.refundBad?'金额异常':p.returns.toFixed(2),p.rate===null?'':(p.rate*100).toFixed(6)+'%',p.change===null?'':p.change.toFixed(6),p.refundFactor===null?'':(p.refundFactor*100).toFixed(6),p.factorBaseSales===null?'':p.factorBaseSales.toFixed(4),p.salesShare===null?'':(p.salesShare*100).toFixed(6)+'%',p.rate===null?weeklyPointText(p):'可计算'])),quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\ufeff'+[header,...rows].map(r=>r.map(quote).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='系列每周退款率_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出所选系列每周退款率与变化');
}
function renderRegions(){
  const sort=$('region-sort').value,order=sort==='rate'?compareRate:sort==='sales'?(a,b)=>b.sales-a.sales:(a,b)=>b.returns-a.returns||b.sales-a.sales;
  const split=(rows,index)=>{const m=new Map();for(const r of rows){const k=r[index]??-1;if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return m;};
  const provinceName=k=>data.dimensions.provinces?.[k]||'未填写省市',cityName=k=>data.dimensions.cities?.[k]||'未填写城市';
  regionRows=[...split(filtered,1)].map(([key,rows])=>({key,...sum(rows),provinces:[...split(rows,13)].map(([pk,pr])=>({key:pk,name:provinceName(pk),...sum(pr),cities:[...split(pr,14)].map(([ck,cr])=>({key:ck,name:cityName(ck),...sum(cr)})).sort(order)})).sort(order)})).sort(order);
  if(!regionInitialized&&regionRows.length){regionOpen.add(data.dimensions.shops[regionRows[0].key]);regionInitialized=true;}
  const cells=(r,shop)=>`<span>${r.bad?'—':money(r.sales)}</span><span>${shop.sales>0&&!shop.bad&&!r.bad?pct(r.sales/shop.sales):'—'}</span><span>${r.refundBad?'—':money(r.returns)}</span><span>${shop.returns>0&&!shop.refundBad&&!r.refundBad?pct(r.returns/shop.returns):'—'}</span><span>${ratePill(r)}</span><span>${int(r.qty)}</span>`;
  $('region-tree').innerHTML=regionRows.map(shop=>{const full=data.dimensions.shops[shop.key];return `<details class="region-shop" data-region-key="${esc(full)}" ${regionOpen.has(full)?'open':''}><summary class="region-grid"><span class="region-name" title="${esc(full)}"><i class="fold-arrow">›</i>${esc(shortShop(full))}<small>${shop.provinces.length} 个省市分组</small></span>${cells(shop,shop)}</summary>${shop.provinces.map(province=>{const key=full+'|'+province.name;return `<details class="region-province" data-region-key="${esc(key)}" ${regionOpen.has(key)?'open':''}><summary class="region-grid"><span class="region-name"><i class="fold-arrow">›</i>${esc(province.name)}<small>${province.cities.length} 个城市分组</small></span>${cells(province,shop)}</summary>${province.cities.map(city=>`<div class="region-city region-grid"><span class="region-name">${esc(city.name)}</span>${cells(city,shop)}</div>`).join('')}</details>`;}).join('')}</details>`;}).join('')||'<div class="chart-empty">当前筛选没有省市数据</div>';
}
function renderComparison(){
  const mode=$('compare-mode').value,index=mode==='sku'?4:3,q=$('compare-search').value.toLowerCase();
  const groups=grouped(filtered,index).sort((a,b)=>b.sales-a.sales);
  const choices=groups.map(r=>{const p=data.products[r.key];return mode==='sku'?{key:r.key,value:`${p.code}|${p.item_code}`,label:`${p.code} · ${p.name} · ${attribute(r.key,'size')} · ${attribute(r.key,'color')}`,search:`${p.code} ${p.item_code} ${p.name} ${attribute(r.key,'size')} ${attribute(r.key,'color')}`}:{key:r.key,value:data.dimensions.series[r.key],label:data.dimensions.series[r.key],search:data.dimensions.series[r.key]};}).filter(o=>o.search.toLowerCase().includes(q));
  const select=$('compare-product'),old=select.value;select.innerHTML=choices.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  if(choices.some(o=>o.value===old))select.value=old;select.disabled=!choices.length;
  const choice=choices.find(o=>o.value===select.value),rows=choice?filtered.filter(r=>r[index]===choice.key):[],total=sum(rows);compareRows=grouped(rows,1).sort(compareRate);
  $('compare-description').textContent=choice?`${mode==='sku'?'当前 SKU':'当前系列'}：${choice.label}`:'没有匹配的对比商品，请调整左侧筛选或搜索。';
  $('compare-count').textContent=compareRows.length+' 个店铺';$('compare-caption').textContent=compareRows.length===1?'当前仅一个店铺有该商品数据，可清除店铺筛选或选择多个店铺。':'各店铺使用同一商品与相同时间、尺寸、颜色条件。';
  const max=Math.max(.01,...compareRows.map(r=>r.rate??0));
  $('compare-chart').innerHTML=compareRows.map(r=>`<div class="bar-row"><span class="bar-label" title="${esc(data.dimensions.shops[r.key])}">${esc(shortShop(data.dimensions.shops[r.key]))}</span><div class="bar-track"><div class="bar-fill" style="width:${r.rate===null?0:Math.max(0,r.rate/max*100)}%"></div></div><span class="bar-value ${r.rate===null?'pending':''}">${rateText(r)}</span></div>`).join('')||'<div class="chart-empty">没有同款对比数据</div>';
  $('compare-table').innerHTML=compareRows.map(r=>`<tr><td>${esc(shortShop(data.dimensions.shops[r.key]))}<span class="sub">${esc(data.dimensions.shops[r.key])}</span></td><td>${r.bad?'—':money(r.sales)}</td><td>${r.refundBad?'—':money(r.returns)}</td><td>${ratePill(r)}</td><td>${int(r.qty)}</td><td>${int(r.refundLines)}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="6">没有匹配的店铺数据</td></tr>';
  $('compare-total').innerHTML=`<tr><td>当前同款合计</td><td>${total.bad?'—':money(total.sales)}</td><td>${total.refundBad?'—':money(total.returns)}</td><td>${ratePill(total)}</td><td>${int(total.qty)}</td><td>${int(total.refundLines)}</td></tr>`;
}
const matrixQty=v=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:6}).format(v);
function matrixRate(r){return matrixMode==='quantity'?r.quantityRate:r.rate;}
function matrixRateText(r){const rate=matrixRate(r);return rate!==null?pct(rate):matrixMode==='quantity'?'无实发数量':rateText(r);}
function matrixGroup(rows,kind){return grouped(rows,r=>kind==='cell'?JSON.stringify([attribute(r[4],'color'),attribute(r[4],'size')]):attribute(r[4],kind));}
function matrixPeriod(rows){const dates=rows.map(r=>r[0]).sort();return dates.length?dates[0]+' 至 '+dates.at(-1):'无符合条件的订单';}
function matrixTooltip(r,history,scope,matrix){
  const describe=(title,m)=>`${title}\n数量率：${m.quantityRate===null?'无实发数量':pct(m.quantityRate)}（退货 ${matrixQty(m.returnQty)} / 实发 ${matrixQty(m.qty)}）\n金额率：${rateText(m)}（退款 ${m.refundBad?'金额异常':money(m.returns)+' 元'} / 销售 ${m.bad?'金额异常':money(m.sales)+' 元'}）\n${m.skuCount} 个 SKU`;
  return scope+'\n'+describe('本期（'+matrix.period+'）',r)+(history?'\n\n'+describe('全周期（'+matrix.historyPeriod+'，保留当前渠道、店铺和商品条件）',history):'')+'\n点击查看对应SKU明细';
}
function matrixHeat(rate,max){
  if(rate===null)return 'background:#f6f7fb;color:#97a3b5';
  const t=Math.max(0,Math.min(1,rate/max)),stops=[[250,247,239],[204,172,94],[174,75,70]],a=t<.5?stops[0]:stops[1],b=t<.5?stops[1]:stops[2],f=t<.5?t*2:(t-.5)*2,rgb=a.map((v,i)=>Math.round(v+(b[i]-v)*f));
  const light=rgb.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((v,s,i)=>v+s*[.2126,.7152,.0722][i],0);
  return `background:rgb(${rgb.join(',')});color:${light<=.183?'#fff':'#3c3831'}`;
}
function matrixCellHTML(r,attrs,history,max,summary,matrix){
  if(!r)return '<td class="matrix-no-data"><span>—</span><small>无数据</small></td>';
  const rate=matrixRate(r),baseline=matrixRate(matrix.total),small=!summary&&r.qty>0&&r.qty<20,high=!summary&&r.qty>=20&&rate!==null&&baseline!==null&&rate>baseline*2;
  const pair=matrixMode==='quantity'?`${matrixQty(r.returnQty)} / ${matrixQty(r.qty)}`:`${r.refundBad?'金额异常':money(r.returns)} / ${r.bad?'金额异常':money(r.sales)}`;
  const scope=[matrix.series,attrs.color,attrs.size].filter(v=>v!==undefined).join(' · '),attributes=` data-matrix-series="${esc(matrix.series)}"`+(attrs.color!==undefined?` data-matrix-color="${esc(attrs.color)}"`:'')+(attrs.size!==undefined?` data-matrix-size="${esc(attrs.size)}"`:''),active=matrixCell&&matrixCell.series===matrix.series&&matrixCell.color===(attrs.color??null)&&matrixCell.size===(attrs.size??null);
  return `<td class="${summary?'matrix-subtotal':''}"><button class="matrix-cell ${active?'selected':''}" data-matrix-cell="true"${attributes} title="${esc(matrixTooltip(r,history,scope,matrix))}" aria-pressed="${!!active}" style="${summary?'':matrixHeat(rate,max)}"><strong>${matrixRateText(r)}${small?'<span class="matrix-tag">样本小</span>':high?'<span class="matrix-tag">异常</span>':''}</strong><small>${pair}</small></button></td>`;
}
function matrixSeriesChoices(){return seriesRows.slice().sort((a,b)=>b.sales-a.sales).map(r=>data.dimensions.series[r.key]);}
function renderMatrixSeriesPicker(){
  const q=$('sku-series-search').value.trim().toLowerCase(),available=matrixSeriesChoices(),candidates=[...new Set([...available,...matrixSeriesSelection])].filter(name=>name.toLowerCase().includes(q));
  $('sku-series-selection-label').textContent=matrixSeriesSelection.size===0?'选择系列（可多选）':matrixSeriesSelection.size===1?[...matrixSeriesSelection][0]:`已选 ${matrixSeriesSelection.size} 个系列`;
  $('sku-series-options').innerHTML=candidates.map(name=>`<label class="matrix-series-option ${available.includes(name)?'':'unavailable'}" title="${esc(name)}"><input type="checkbox" data-matrix-series-option="true" value="${esc(name)}" ${matrixSeriesSelection.has(name)?'checked':''}><span>${esc(name)}${available.includes(name)?'':'<small>当前筛选无数据</small>'}</span></label>`).join('')||'<div class="filter-none">没有匹配系列，请修改搜索或重置</div>';
  $('sku-series-chips').innerHTML=[...matrixSeriesSelection].map(name=>`<span class="filter-chip">${esc(name)}<button data-matrix-series-remove="${esc(name)}" aria-label="取消选择${esc(name)}">×</button></span>`).join('');
}
function buildSKUMatrix(series,rows,historyRows){
  const cells=matrixGroup(rows,'cell'),colorTotals=matrixGroup(rows,'color').sort((a,b)=>b.qty-a.qty||a.key.localeCompare(b.key,'zh-CN')),sizeTotals=matrixGroup(rows,'size').sort((a,b)=>/待确认|未填写/.test(a.key)-/待确认|未填写/.test(b.key)||a.key.localeCompare(b.key,'zh-CN',{numeric:true})),total=sum(rows);
  const matrix={series,seriesId:data.dimensions.series.indexOf(series),mode:matrixMode,total,historyTotal:sum(historyRows),period:matrixPeriod(rows),historyPeriod:matrixPeriod(historyRows),cells:cells.map(r=>({color:JSON.parse(r.key)[0],size:JSON.parse(r.key)[1],...r})),colorTotals,sizeTotals,empty:!rows.length};
  if(matrix.empty)return {matrix,title:series+' · SKU退款率矩阵',note:'该系列在当前左侧筛选条件下没有符合统计口径的数据，可取消勾选、调整左侧条件或重置本模块。',html:'<tbody><tr class="empty-row"><td>当前筛选无数据</td></tr></tbody>',minWidth:'',reconciliation:'当前无数据可对账'};
  const max=Math.max(.01,...cells.map(r=>matrixRate(r)??0)),byCell=new Map(cells.map(r=>[r.key,r])),historyCells=new Map(matrixGroup(historyRows,'cell').map(r=>[r.key,r])),historyColors=new Map(matrixGroup(historyRows,'color').map(r=>[r.key,r])),historySizes=new Map(matrixGroup(historyRows,'size').map(r=>[r.key,r]));
  const header=`<thead><tr><th scope="col">颜色 ＼ 尺寸</th>${sizeTotals.map(r=>`<th scope="col"><button data-matrix-cell="true" data-matrix-series="${esc(series)}" data-matrix-size="${esc(r.key)}">${esc(r.key)}</button></th>`).join('')}<th scope="col">小计</th></tr></thead>`,body='<tbody>'+colorTotals.map(color=>`<tr><th scope="row"><button data-matrix-cell="true" data-matrix-series="${esc(series)}" data-matrix-color="${esc(color.key)}">${esc(color.key)}</button></th>${sizeTotals.map(size=>{const key=JSON.stringify([color.key,size.key]);return matrixCellHTML(byCell.get(key),{color:color.key,size:size.key},historyCells.get(key),max,false,matrix);}).join('')}${matrixCellHTML(color,{color:color.key},historyColors.get(color.key),max,true,matrix)}</tr>`).join('')+'</tbody>',footer=`<tfoot><tr><th scope="row">系列总计</th>${sizeTotals.map(size=>matrixCellHTML(size,{size:size.key},historySizes.get(size.key),max,true,matrix)).join('')}${matrixCellHTML(total,{},matrix.historyTotal,max,true,matrix)}</tr></tfoot>`;
  const matrixSum=cells.reduce((a,r)=>({qty:a.qty+r.qty,returnQty:a.returnQty+r.returnQty,sales:a.sales+r.sales,returns:a.returns+r.returns}),{qty:0,returnQty:0,sales:0,returns:0}),difference=Object.fromEntries(Object.keys(matrixSum).map(k=>[k,matrixSum[k]-total[k]])),closed=Math.abs(difference.qty)<1e-6&&Math.abs(difference.returnQty)<1e-6&&Math.abs(difference.sales)<.01&&Math.abs(difference.returns)<.01;matrix.reconciliation={difference,closed};
  const displayDiff=Object.fromEntries(Object.entries(difference).map(([key,value])=>[key,Math.abs(value)<(key==='qty'||key==='returnQty'?1e-6:.005)?0:value]));
  return {matrix,title:series+' · SKU退款率矩阵',note:`底色越深，${matrixMode==='quantity'?'退货数量率':'退款金额率'}越高；本系列整体 ${matrixRateText(total)}。“异常”：高于本系列整体2倍且实发≥20件；“样本小”：实发不足20件。悬停可查看本期与全周期汇总，点击格子查看对应SKU。`,html:header+body+footer,minWidth:Math.max(620,(sizeTotals.length+2)*140)+'px',reconciliation:`对账（订单付款日期 ${matrix.period}）：退货 ${matrixQty(matrixSum.returnQty)} 件 / 实发 ${matrixQty(matrixSum.qty)} 件；与系列合计差额：退货 ${matrixQty(displayDiff.returnQty)} 件，实发 ${matrixQty(displayDiff.qty)} 件，退款 ${money(displayDiff.returns)} 元，销售 ${money(displayDiff.sales)} 元 · ${closed?'已闭合':'请检查'}`};
}
function renderSKUAnalysis(){
  if(!matrixSeriesInitialized){const first=matrixSeriesChoices()[0];if(first){matrixSeriesSelection.add(first);matrixSeriesInitialized=true;}}
  renderMatrixSeriesPicker();document.querySelectorAll('[data-matrix-mode]').forEach(b=>{const active=b.dataset.matrixMode===matrixMode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  matrixRows=filtered.filter(r=>matrixSeriesSelection.has(data.dimensions.series[r[3]]));
  if(matrixCell&&(!matrixSeriesSelection.has(matrixCell.series)||!matrixDetailRows().length))matrixCell=null;
  const chosenIds=new Set([...matrixSeriesSelection].map(name=>data.dimensions.series.indexOf(name))),current=new Map(),history=new Map(),append=(map,r)=>{if(!map.has(r[3]))map.set(r[3],[]);map.get(r[3]).push(r);};
  for(const r of matrixRows)append(current,r);
  for(const r of data.facts)if(chosenIds.has(r[3])&&keys.every(k=>['year','month','week','day'].includes(k)||!selected[k].size||selected[k].has(getValue(r,k))))append(history,r);
  const views=[...matrixSeriesSelection].map(name=>{const id=data.dimensions.series.indexOf(name);return buildSKUMatrix(name,current.get(id)||[],history.get(id)||[]);});skuMatrices=views.map(v=>v.matrix);skuMatrix=skuMatrices[0]||null;
  const caption=(matrixMode==='quantity'?'格内上行：退货入库数量 ÷ 实发数量；下行：退货 / 实发。':'格内上行：退款金额 ÷ 销售净金额；下行：退款 / 销售（元）。')+' 所选系列分别展示，上方指标按左侧筛选汇总。';$('sku-matrix-caption').textContent=caption;
  const first=views[0];$('sku-matrix-title').textContent=first?first.title:'SKU退款分析 · 选择系列';$('sku-matrix-note').textContent=first?first.note:'点击“选择系列”勾选一个或多个系列。支持搜索、单项取消和重置，左侧筛选同步生效。';$('sku-matrix-table').style.minWidth=first?first.minWidth:'';$('sku-matrix-table').innerHTML=first?first.html:'<tbody><tr class="empty-row"><td>请选择要分析的系列</td></tr></tbody>';
  $('sku-matrix-reconciliation').classList.toggle('unbalanced',!!first?.matrix.reconciliation&&!first.matrix.reconciliation.closed);$('sku-matrix-reconciliation').textContent=first?first.reconciliation:'尚未选择系列';
  $('sku-extra-matrices').innerHTML=views.slice(1).map(v=>`<section class="panel sku-matrix-panel extra-matrix-panel" data-matrix-panel-series="${esc(v.matrix.series)}"><div class="panel-head matrix-head"><div><h2>${esc(v.title)}</h2><p>${esc(caption)}</p></div></div><p class="analysis-note matrix-note">${esc(v.note)}</p><p class="matrix-scroll-hint">左右滑动查看全部尺寸与小计</p><div class="matrix-scroll table-scroll"><table class="sku-matrix" style="min-width:${v.minWidth||'0'}" aria-label="${esc(v.title)}">${v.html}</table></div><div class="matrix-reconciliation ${v.matrix.reconciliation&&!v.matrix.reconciliation.closed?'unbalanced':''}">${esc(v.reconciliation)}</div></section>`).join('');
  renderSKUCellDetails();
}
function matrixDetailRows(){return matrixCell?matrixRows.filter(r=>data.dimensions.series[r[3]]===matrixCell.series&&(matrixCell.color===null||attribute(r[4],'color')===matrixCell.color)&&(matrixCell.size===null||attribute(r[4],'size')===matrixCell.size)):matrixRows;}
function resetMatrixSeries(){matrixSeriesSelection.clear();matrixSeriesInitialized=true;matrixCell=null;$('sku-series-search').value='';$('sku-series-picker').open=false;renderSKUAnalysis();}
function renderSKUCellDetails(){
  const rows=matrixDetailRows(),total=sum(rows),products=grouped(rows,4).sort((a,b)=>b.qty-a.qty||b.sales-a.sales);
  $('sku-cell-title').textContent=matrixCell?[matrixCell.series,matrixCell.color,matrixCell.size].filter(v=>v!==null).join(' · ')+' · SKU明细':'所选系列SKU明细';$('sku-cell-caption').textContent=matrixSeriesSelection.size?`${matrixCell?'当前选中格子':'所选 '+matrixSeriesSelection.size+' 个系列全部SKU'} · ${products.length} 个SKU · ${matrixPeriod(rows)} · 数量与金额均沿用当前订单匹配范围`:'请先选择一个或多个系列';
  const quantity=r=>r.quantityRate===null?'无实发数量':pct(r.quantityRate),metrics=r=>`<td>${matrixQty(r.returnQty)}</td><td>${matrixQty(r.qty)}</td><td>${quantity(r)}</td><td>${r.refundBad?'—':money(r.returns)}</td><td>${r.bad?'—':money(r.sales)}</td><td>${ratePill(r)}</td>`;
  $('sku-cell-table').innerHTML=products.map(r=>{const p=data.products[r.key];return `<tr><td><span class="meta-code">${esc(p.code)}</span><span class="sub">${esc(data.dimensions.series[p.series])}</span><span class="sub" title="${esc(p.item_code+' · '+p.name)}">${esc(p.item_code+' · '+p.name)}</span></td><td>${esc(attribute(r.key,'color'))}<span class="sub">${esc(attribute(r.key,'size'))}</span></td>${metrics(r)}</tr>`;}).join('')||'<tr class="empty-row"><td colspan="8">没有匹配的SKU明细</td></tr>';
  $('sku-cell-total').innerHTML=`<tr><td>当前明细合计</td><td>${products.length} 个SKU</td>${metrics(total)}</tr>`;
}
function basketScopeMatch(r){return inCustomRange(r[0])&&['year','month','week','day','channel','shop'].every(k=>!selected[k].size||selected[k].has(getValue(r,k)));}
function basketAnchorMatch(sku,date,shop){const p=data.products[sku],r=[date,shop,p.category,p.series,sku];return basketProductFilters.every(k=>!selected[k].size||selected[k].has(getValue(r,k)));}
function basketType(sku){return data.basket_analysis.types[data.basket_analysis.product_types[sku]];}
function basketBasisLabel(){return basketBasis==='retained'?'实际销售（扣除售后）':'发货';}
function basketOrderVerb(){return basketBasis==='retained'?'留存':'购买';}
function computeBasketAnalysis(basis=basketBasis,summaryOnly=false){
  const model=data.basket_analysis;if(!model||basis==='retained'&&!model.retained?.ready)return null;
  const baskets=basis==='retained'?model.retained.baskets:model.baskets;
  const base=[],anchorTypes=new Set(),pairChoices=new Map(),active=basketProductFilters.some(k=>selected[k].size);
  const core=basketCorePairs;
  core.forEach(pair=>pairChoices.set(JSON.stringify(pair),pair));
  pairChoices.set(JSON.stringify(basketPair),basketPair);
  let orders=0,multiOrders=0,units=0;
  for(const r of baskets){
    if(!basketScopeMatch(r))continue;
    const anchors=r[3].filter(([sku])=>basketAnchorMatch(sku,r[0],r[1]));if(!anchors.length)continue;
    const quantity=r[3].reduce((total,[,qty])=>total+qty,0);orders+=r[2];units+=quantity*r[2];if(quantity>=2)multiOrders+=r[2];
    if(summaryOnly)continue;
    const kindUnits=new Map();for(const [sku,qty] of r[3]){const kind=basketType(sku);kindUnits.set(kind,(kindUnits.get(kind)||0)+qty);}
    anchors.forEach(([sku])=>anchorTypes.add(basketType(sku)));
    base.push({date:r[0],shop:r[1],weight:r[2],items:r[3],anchors,kindUnits});
    const kinds=[...kindUnits.keys()].sort((a,b)=>model.types.indexOf(a)-model.types.indexOf(b));
    kinds.forEach((left,i)=>kinds.slice(i).forEach(right=>{if(left!==right||kindUnits.get(left)>=2)pairChoices.set(JSON.stringify([left,right]),[left,right]);}));
  }
  if(summaryOnly)return {orders,multiOrders,units,rate:orders?multiOrders/orders:null,basis};
  const combos=[...pairChoices].map(([key,[left,right]])=>{
    const primary=active&&!anchorTypes.has(left)&&anchorTypes.has(right)?right:left,target=primary===left?right:left;
    let denominator=0,joint=0;
    for(const order of base){
      if(!order.anchors.some(([sku])=>basketType(sku)===primary))continue;
      denominator+=order.weight;
      if(left===right?order.kindUnits.get(left)>=2:(order.kindUnits.get(left)>0&&order.kindUnits.get(right)>0))joint+=order.weight;
    }
    return {key,left,right,primary,target,denominator,joint,rate:denominator?joint/denominator:null,share:orders?joint/orders:null};
  }).filter(c=>c.joint>0);
  const combo=combos.find(c=>c.left===basketPair[0]&&c.right===basketPair[1])||combos[0],skuCounts=new Map(),pairs=new Map();
  if(combo)for(const order of base){
    const primaries=order.anchors.filter(([sku])=>basketType(sku)===combo.primary),targets=order.items.filter(([sku])=>basketType(sku)===combo.target);
    for(const [sku,qty] of primaries){
      skuCounts.set(sku,(skuCounts.get(sku)||0)+order.weight);
      for(const [target,targetQty] of targets){
        if(sku===target&&qty<2)continue;
        const key=sku+':'+target;if(!pairs.has(key))pairs.set(key,{primary:sku,target,joint:0});pairs.get(key).joint+=order.weight;
      }
    }
  }
  const rows=[...pairs.values()].map(row=>({...row,denominator:skuCounts.get(row.primary),rate:row.joint/skuCounts.get(row.primary)}));
  return {orders,multiOrders,units,rate:orders?multiOrders/orders:null,combos,combo,rows,signatureRows:base.length,basis};
}
function basketProductLabel(sku){const p=data.products[sku];return `${p.code} ${p.item_code} ${p.name} ${data.dimensions.series[p.series]} ${attribute(sku,'color')} ${attribute(sku,'size')}`;}
function rankBasketPairs(rows){
  const combinations=new Map();
  for(const row of rows){
    const key=JSON.stringify([row.primary,row.target].sort((a,b)=>a-b));
    if(!combinations.has(key))combinations.set(key,[]);
    combinations.get(key).push(row);
  }
  return [...combinations.values()].map(directions=>{
    // Keep the eligible anchor direction. If both are eligible, give the pair
    // one stable display direction and retain the other denominator separately.
    directions.sort((a,b)=>data.products[a.primary].code.localeCompare(data.products[b.primary].code));
    const row=directions[0],reverse=directions.find(r=>r.primary===row.target&&r.target===row.primary&&row.primary!==row.target);
    return {...row,reverseDenominator:reverse?.denominator??null,reverseRate:reverse?.rate??null};
  }).sort((a,b)=>b.joint-a.joint||b.rate-a.rate||data.products[a.primary].code.localeCompare(data.products[b.primary].code)||data.products[a.target].code.localeCompare(data.products[b.target].code));
}
function renderBasketRanking(){
  basketRankingRows=rankBasketPairs(basketVisibleRows);
  const verb=basketOrderVerb(),retained=basketBasis==='retained';
  $('basket-ranking-meaning').textContent='每组左侧商品为主SKU，右侧商品为搭配SKU。'+(retained?'当前按扣除售后后的留存商品计算。':'当前按已发货商品计算。');
  $('basket-explain-forward').textContent=(retained?'留存':'购买')+'主SKU的订单中，同时'+(retained?'留存':'购买')+'搭配SKU的比例。';
  $('basket-explain-reverse').textContent=(retained?'留存':'购买')+'搭配SKU的订单中，同时'+(retained?'留存':'购买')+'主SKU的比例。';
  $('basket-formula-forward').textContent=(retained?'共同留存':'同购')+'订单数 ÷ 主SKU'+verb+'订单数';
  $('basket-formula-reverse').textContent=(retained?'共同留存':'同购')+'订单数 ÷ 搭配SKU'+verb+'订单数';
  $('basket-explain-note').textContent='两个方向使用相同的'+(retained?'共同留存':'同购')+'订单数，分母分别为各自商品的'+verb+'订单数，因此连带率可能不同，两个百分比不能相加。每组下方展示实际计算公式。';
  $('basket-ranking-count').textContent=`TOP ${Math.min(10,basketRankingRows.length)} · 共 ${int(basketRankingRows.length)} 组搭配`;
  $('basket-ranking-export').disabled=!basketRankingRows.length;
  const product=sku=>{const p=data.products[sku];return `<div class="basket-ranking-product"><strong>${esc(data.dimensions.series[p.series])}</strong><span>${esc(attribute(sku,'color'))} · ${esc(attribute(sku,'size'))}</span><small>SKU ${esc(p.code)}</small><span class="basket-ranking-name">${esc(p.name)}</span></div>`;};
  const maximum=basketRankingRows[0]?.joint||1;
  $('basket-ranking-list').innerHTML=basketRankingRows.slice(0,10).map((r,i)=>`<article class="basket-ranking-row${i<3?' leading':''}" aria-label="第${i+1}名，${esc(data.products[r.primary].code)}搭配${esc(data.products[r.target].code)}，同购${int(r.joint)}单">
    <span class="basket-ranking-number">${i+1}</span><div class="basket-ranking-products">${product(r.primary)}<span class="basket-ranking-plus" aria-hidden="true">＋</span>${product(r.target)}${r.primary===r.target?`<span class="basket-ranking-same">同SKU${verb}两件及以上</span>`:''}</div>
    <div class="basket-ranking-orders"><strong>${int(r.joint)}<small> 单</small></strong><span>${retained?'共同留存':'同购'}订单</span><div class="basket-ranking-track"><i style="width:${(r.joint/maximum*100).toFixed(2)}%"></i></div></div>
    <div class="basket-ranking-rates"><strong title="${verb}主SKU的${int(r.denominator)}单中，有${int(r.joint)}单同时${verb}搭配SKU">主→搭 ${pct(r.rate)}</strong><span class="basket-ranking-formula">${retained?'共同留存':'同购'} ${int(r.joint)} 单 ÷<br>主SKU${verb} ${int(r.denominator)} 单</span>${r.reverseRate===null?'':`<strong title="${verb}搭配SKU的${int(r.reverseDenominator)}单中，有${int(r.joint)}单同时${verb}主SKU">搭→主 ${pct(r.reverseRate)}</strong><span class="basket-ranking-formula">${retained?'共同留存':'同购'} ${int(r.joint)} 单 ÷<br>搭配SKU${verb} ${int(r.reverseDenominator)} 单</span>`}</div></article>`).join('')||'<div class="basket-empty">当前搜索没有匹配的SKU搭配</div>';
}
function renderBasketDetails(){
  const q=$('basket-sku-search').value.trim().toLowerCase(),sort=$('basket-sku-sort').value;
  basketVisibleRows=(basketAnalysis?.rows||[]).filter(r=>(basketProductLabel(r.primary)+' '+basketProductLabel(r.target)).toLowerCase().includes(q)).sort((a,b)=>sort==='rate'?b.rate-a.rate||b.joint-a.joint:b.joint-a.joint||b.rate-a.rate);
  renderBasketRanking();
  const pages=Math.max(1,Math.ceil(basketVisibleRows.length/40));basketPage=Math.max(1,Math.min(basketPage,pages));
  const productCell=sku=>{const p=data.products[sku];return `<span class="meta-code">${esc(p.code)}</span><span class="sub">${esc(data.dimensions.categories[p.category])} · ${esc(data.dimensions.series[p.series])}</span><span class="sub" title="${esc(p.name)}">${esc(p.name)}</span><span class="sub">${esc(attribute(sku,'color'))} · ${esc(attribute(sku,'size'))}</span>`;};
  $('basket-sku-table').innerHTML=basketVisibleRows.slice((basketPage-1)*40,basketPage*40).map(r=>`<tr><td>${productCell(r.primary)}</td><td>${productCell(r.target)}${r.primary===r.target?`<span class="sub">同SKU${basketOrderVerb()}两件及以上</span>`:''}</td><td>${int(r.joint)}</td><td>${int(r.denominator)}</td><td><span class="rate-pill">${pct(r.rate)}</span></td></tr>`).join('')||'<tr class="empty-row"><td colspan="5">当前组合没有匹配的SKU搭配；可选择其他组合、系列或调整店铺与时间</td></tr>';
  $('basket-sku-count').textContent=`${int(basketVisibleRows.length)} 组SKU搭配 · 每页40组`;$('basket-page').textContent=`${basketPage} / ${pages}`;$('basket-prev').disabled=basketPage<=1;$('basket-next').disabled=basketPage>=pages;
}
function exportBasketRankingCSV(){
  if(!basketRankingRows.length){toast('当前筛选没有可导出的热门SKU搭配');return;}
  const header=['排名','主SKU','主系列','主颜色','主尺寸','主商品名称','搭配SKU','搭配系列','搭配颜色','搭配尺寸','搭配商品名称',basketBasis==='retained'?'共同留存订单数':'同购订单数','主SKU'+basketOrderVerb()+'订单数','主→搭连带率','搭配SKU'+basketOrderVerb()+'订单数','搭→主连带率','品类组合','统计口径'];
  const values=basketRankingRows.map((r,i)=>{const a=data.products[r.primary],b=data.products[r.target];return [i+1,a.code,data.dimensions.series[a.series],attribute(r.primary,'color'),attribute(r.primary,'size'),a.name,b.code,data.dimensions.series[b.series],attribute(r.target,'color'),attribute(r.target,'size'),b.name,r.joint,r.denominator,pct(r.rate),r.reverseDenominator??'',r.reverseRate===null?'':pct(r.reverseRate),basketAnalysis.combo.left+'＋'+basketAnalysis.combo.right,basketBasisLabel()];});
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\ufeff'+[header,...values].map(row=>row.map(quote).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='热门SKU搭配排名_'+basketBasisLabel()+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前筛选的全部SKU搭配排名');
}
function renderBasketBasisComparison(){
  const summaries=Object.fromEntries(['shipped','retained'].map(basis=>[basis,basketAnalysis?.basis===basis?basketAnalysis:computeBasketAnalysis(basis,true)]));
  $('basket-basis-comparison').innerHTML=['shipped','retained'].map(basis=>{const r=summaries[basis];return `<button class="basket-basis-card ${basketBasis===basis?'selected':''}" data-basket-basis="${basis}" aria-pressed="${basketBasis===basis}" ${!r?'disabled':''}><span>${basis==='retained'?'实际销售连带率 · 扣除售后':'发货连带率'}</span><strong>${r?.rate===null||!r?'—':pct(r.rate)}</strong><small>${r?`${int(r.orders)} ${basis==='retained'?'有效留存':'有效购买'}订单 · ${int(r.multiOrders)} 多件订单`:'刷新数据后可查看'}</small></button>`;}).join('');
}
function renderBasketAnalysis(){
  basketAnalysis=computeBasketAnalysis();
  renderBasketBasisComparison();
  if(!basketAnalysis){$('basket-scope').textContent=(basketBasis==='retained'?'实际销售留存数据':'同购数据')+'尚未生成，请运行刷新数据脚本后重新加载。';$('basket-kpis').innerHTML='';$('basket-combos').innerHTML='';$('basket-combo-table').innerHTML='';$('basket-quality').textContent='';$('basket-sku-panel').hidden=true;renderBasketDetails();return;}
  const r=basketAnalysis,model=data.basket_analysis,filters=basketProductFilters.filter(k=>selected[k].size).map(k=>names[k]+'：'+[...selected[k]].map(v=>label(k,v)).join('、'));
  const retained=basketBasis==='retained',verb=basketOrderVerb(),jointLabel=retained?'共同留存订单数':'同购订单数';
  document.querySelector('.scope-tag').innerHTML='同一原始订单 <span>·</span> '+basketBasisLabel();
  $('basket-scope').textContent='当前口径：'+basketBasisLabel()+'。按原订单付款日期、渠道及店铺筛选，同店铺＋原始订单号去重，赠品及虚拟卡券排除。'+(retained?'留存数量＝实发数量－已匹配退货入库数量；扣除退款后的商品实收也须为正。全部退回订单不计入分母；换货和未匹配售后不扣减。截至最新数据累计售后，后续退货会更新历史结果。':'仅分析已发货且支付净额为正的购买商品，尚未扣除后续售后。')+(filters.length?'主商品条件：'+filters.join('；')+'。仅保留仍符合主商品条件的订单，其余有效搭配商品完整保留。':'未指定主商品，展示当前店铺与时间内的全部有效订单。');
  $('basket-kpis').innerHTML=[[retained?'有效留存订单':'有效购买订单',int(r.orders),'当前范围至少有一件有效商品的原订单'],[retained?'多件留存订单':'多件购买订单',int(r.multiOrders),'同单有效'+verb+'商品达到两件'],['多件订单连带率',r.rate===null?'—':pct(r.rate),'多件'+verb+'订单 ÷ 有效'+verb+'订单'],[retained?'每单留存件数':'每单购买件数',r.orders?(r.units/r.orders).toFixed(2):'—','有效'+(retained?'留存':'实发')+'商品数量 ÷ 订单数']].map(([title,value,foot])=>`<article><span>${title}</span><strong>${value}</strong><small>${foot}</small></article>`).join('');
  $('basket-combo-caption').textContent=retained?'连带率＝共同留存订单数÷主品类留存订单数；全部退回的商品不再构成搭配':'连带率＝同购订单数÷主品类购买订单数；订单占比＝同购订单数÷当前有效订单数';
  $('basket-combo-joint-heading').textContent=jointLabel;$('basket-combo-denominator-heading').textContent='主品类'+verb+'订单数';$('basket-sku-joint-heading').textContent=jointLabel;$('basket-sku-denominator-heading').textContent='主SKU'+verb+'订单数';
  const button=(c,card=false)=>`<button class="${card?'basket-combo-card':'shop-link'} ${r.combo?.key===c.key?'selected':''}" data-basket-left="${esc(c.left)}" data-basket-right="${esc(c.right)}" aria-pressed="${r.combo?.key===c.key}"><span>${esc(c.left+'＋'+c.right)}</span>${card?`<strong>${c.rate===null?'—':pct(c.rate)}</strong><small>${int(c.joint)} ${retained?'共同留存':'同购'}订单 / ${int(c.denominator)} ${esc(c.primary)}${verb}订单</small>`:''}</button>`;
  let cards=r.combos.filter(c=>basketCorePairs.some(pair=>pair[0]===c.left&&pair[1]===c.right));
  if(!cards.length)cards=[...r.combos].sort((a,b)=>b.joint-a.joint).slice(0,4);
  $('basket-combos').style.setProperty('--basket-card-count',Math.max(1,cards.length));
  $('basket-combos').innerHTML=cards.map(c=>button(c,true)).join('')||'<div class="basket-empty">当前筛选范围没有有效同购组合</div>';
  $('basket-combo-table').innerHTML=[...r.combos].sort((a,b)=>b.joint-a.joint).map(c=>`<tr><td>${button(c)}</td><td>${esc(c.primary)}</td><td>${int(c.joint)}</td><td>${int(c.denominator)}</td><td>${pct(c.rate)}</td><td>${pct(c.share)}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="6">当前筛选范围没有有效同购组合</td></tr>';$('basket-combo-count').textContent=r.combos.length+' 种搭配';
  const quality=model.quality,netQuality=model.retained?.quality||{};$('basket-quality').textContent=(retained?`全量实际销售口径：${int(netQuality['售后无有效留存商品订单']||0)} 单售后无有效留存商品，${int(netQuality['排除售后归属或数量金额待核对订单']||0)} 单售后归属或数量金额待核对，已从实际销售口径排除。`:`全量来源处理：排除赠品 ${int(quality['排除赠品行']||0)} 行，原始订单号缺失 ${int(quality['原始订单号缺失行']||0)} 行，付款日期不唯一 ${int(quality['排除付款日期不唯一订单']||0)} 单。`)+'BACKPACK/双肩/背包归双肩包，箱套按商品名称或系列识别。同类搭配要求同单至少两件，包括同SKU多件。';
  $('basket-sku-title').textContent=(r.combo?r.combo.left+'＋'+r.combo.right:'当前组合')+' · SKU连带分析';$('basket-sku-caption').textContent=`当前口径：${basketBasisLabel()}。主SKU→搭配SKU连带率＝同时${verb}两者的订单数÷${verb}主SKU的订单数。当前主品类：${r.combo?.primary||'—'}；右上角可导出当前搜索结果。`;
  $('basket-sku-panel').hidden=!r.combo;if(r.combo)basketPair=[r.combo.left,r.combo.right];
  renderBasketDetails();
}
function exportBasketCSV(){
  if(!basketAnalysis){toast('请先刷新并生成同购数据');return;}
  if(!basketAnalysis.combo||!basketVisibleRows.length){toast('当前筛选没有可导出的SKU连带记录');return;}
  const header=['主SKU','主货品编号','主商品名称','主系列','主颜色','主尺寸','搭配SKU','搭配货品编号','搭配商品名称','搭配系列','搭配颜色','搭配尺寸',basketBasis==='retained'?'共同留存订单数':'同购订单数','主SKU'+basketOrderVerb()+'订单数','连带率','品类组合','统计口径'];
  const values=basketVisibleRows.map(r=>{const a=data.products[r.primary],b=data.products[r.target];return [a.code,a.item_code,a.name,data.dimensions.series[a.series],attribute(r.primary,'color'),attribute(r.primary,'size'),b.code,b.item_code,b.name,data.dimensions.series[b.series],attribute(r.target,'color'),attribute(r.target,'size'),r.joint,r.denominator,pct(r.rate),basketAnalysis.combo.left+'＋'+basketAnalysis.combo.right,basketBasisLabel()];});
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\ufeff'+[header,...values].map(row=>row.map(quote).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='SKU连带分析_'+basketBasisLabel()+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前组合的SKU连带分析');
}
function renderActiveAnalysis(){if(tab==='series')renderSeries();else if(tab==='sku')renderSKUAnalysis();else if(tab==='regions')renderRegions();else if(tab==='compare')renderComparison();else if(tab==='basket')renderBasketAnalysis();}
function renderQuality(){
  $('quality-stats').innerHTML=Object.entries(data.quality.counts).filter(([,v])=>v).map(([k,v])=>`<div class="quality-stat"><span>${esc(k)}</span><strong>${int(v)}</strong></div>`).join('');
  if(data.basket_analysis?.retained?.ready){const retained=data.basket_analysis.retained;$('quality-stats').innerHTML+=`<div class="quality-stat"><span>实际销售连带 · 有效留存原订单</span><strong>${int(retained.summary.orders)} 单</strong></div><div class="quality-stat"><span>实际销售连带 · 售后待核对排除</span><strong>${int(retained.quality['排除售后归属或数量金额待核对订单']||0)} 单</strong></div>`;}
  const allocation=data.quality.refund_allocation,agg=data.quality.source_aggregation;
  if(allocation)$('quality-stats').innerHTML+=`<div class="quality-stat"><span>退款单数量（店铺＋退换单号去重）</span><strong>${int(allocation.documents)} 笔</strong></div><div class="quality-stat"><span>单据总额与SKU分配合计差额</span><strong>${money(allocation.document_total-allocation.allocated_total)} 元</strong></div><div class="quality-stat"><span>分摊异常退款单</span><strong>${int(allocation.invalid_documents)} 笔</strong></div>`;
  const lineAmounts=data.quality.refund_line_amounts;
  if(lineAmounts)$('quality-stats').innerHTML+=`<div class="quality-stat"><span>售后金额取值列</span><strong>${esc(lineAmounts.amount_column)} · ${esc(lineAmounts.amount_field)}</strong></div><div class="quality-stat"><span>源表商品行金额异常</span><strong>${int(lineAmounts.invalid_rows)} 条</strong></div>`;
  if(agg)$('quality-stats').innerHTML+=`<div class="quality-stat"><span>销售订单源金额合计</span><strong>${money(agg.sales_source_total)} 元</strong></div><div class="quality-stat"><span>售后退款源金额合计（换货已排除）</span><strong>${money(agg.refund_source_total)} 元</strong></div>`;
  const cohort=data.config.calculation_mode==='matched_order_cohort',matching=data.quality.order_matching;
  if(matching)$('quality-stats').innerHTML+=`<div class="quality-stat"><span>订单匹配后计入退款金额</span><strong>${money(+matching.matched_refund_total)} 元</strong></div><div class="quality-stat"><span>未匹配或归属不唯一金额（已排除）</span><strong>${money(+matching.excluded_refund_total)} 元</strong></div><div class="quality-stat"><span>跨月退款归回订单月</span><strong>${int(matching.cross_month_refund_lines)} 条 · ${money(+matching.cross_month_refund_total)} 元</strong></div>`;
  const salesFormula=data.quality.sales_amount_formula;
  if(salesFormula)$('quality-stats').innerHTML+=`<div class="quality-stat"><span>单品支付金额合计</span><strong>${money(+salesFormula.item_payment_total)} 元</strong></div><div class="quality-stat"><span>扣除分摊邮费合计</span><strong>${money(+salesFormula.allocated_postage_total)} 元</strong></div>`;
  const refundRule=data.config.refund_amount_grain==='sku_line'?`金额取${esc(data.config.return_amount_column)}列“${esc(data.config.return_amount_field)}”，直接按商品行累计，不使用其他退款金额列，不按单据总额重新分摊。`:'退款总额按店铺＋退换单号去重，再按源表分摊退款金额比例分配到SKU。';
  const shippedRule=data.config.exclude_unshipped?`，且${esc(data.config.sales_ship_date_column||'L')}列“发货时间”非空`:'';
  const salesRule=data.config.sales_amount_mode==='item_payment_less_postage'?`逐商品行计算“单品支付金额－分摊邮费”（${esc(data.config.sales_item_amount_column)}列减${esc(data.config.sales_postage_column)}列）后合计。零值和负值均按公式保留；任一金额字段缺失或无效时提示异常，不回退到订单支付金额。`:`金额取${esc(data.config.sales_amount_column||'')}列“订单支付金额”。`;
  const dateRule=(cohort?'年、月、周、日均按销售订单付款日期筛选。售后匹配订单后继承该日期；7月订单在8月退款仍归7月，8月订单在9月退款仍归8月。登记日期仅用于追溯。':'退款按售后登记日期，销售按订单付款日期。日期选择同时作用于两边各自的日期。')+'周一至周日为一周，按 ISO 周编号展示；与年月日同时筛选时只统计交集。';
  const matchRule=cohort?'售后“原始单号＋货品编号”与销售“子单原始单号＋货品编号”逐笔匹配，并校验店铺；仅关联已纳入销售范围的订单。SKU、品类、系列及日期继承销售行。未匹配或存在多个日期/SKU归属的记录排除；重复销售匹配不放大退款，每条符合条件的售后金额各计一次。':'退款不要求存在逐笔匹配销售。';
  $('method').innerHTML=`<dt>退款率</dt><dd>当前筛选订单对应的售后退款金额合计 ÷ 同组店铺、品类、系列、SKU的销售金额合计。${cohort?'先匹配订单并归属日期，再汇总计算。':'先分别汇总，再计算比率。'}</dd><dt>销售范围</dt><dd>仅订单类型为“网店销售”${shippedRule}。${salesRule}其他记录不计入。销售件数为实发数量合计。</dd><dt>日期筛选</dt><dd>${dateRule}</dd><dt>售后范围</dt><dd>累计源表中类型为退款、退货的记录，换货排除。${refundRule}${matchRule}</dd><dt>无销售金额</dt><dd>匹配订单的销售金额为零时，退款金额正常展示，退款率显示“无销售数据”。金额异常仅影响对应分组。</dd><dt>来源核验</dt><dd>三个指定目录是唯一业务数据源；产品匹配表只提供商品归属。参考工作簿不提供指标金额，也不阻断当前汇总。</dd><dt>明细下载</dt><dd>使用右上角“导出当前明细”下载筛选后的商品汇总。逐笔销售、售后订单及未匹配记录在本地看板核查。</dd>`;
  $('method').innerHTML+='<dt>省市与占比</dt><dd>省市取销售订单 O 列“收货地区”，退款继承匹配销售订单省市。缺失和多地区匹配单独列示，金额保留。省、市两级销售占比均除以本店当前筛选销售合计；退款金额占比除以本店当前筛选退款合计。</dd><dt>尺寸与颜色</dt><dd>取产品匹配表，独立筛选且联动所有视图；同一 SKU 多值冲突分别标为尺寸待确认、颜色待确认。缺失值单独显示，金额保留。</dd><dt>同款店铺对比</dt><dd>默认按同一 SKU 比较各店铺；选择按系列时，比较当前筛选范围内该系列的合计。各店铺均使用相同时间、尺寸与颜色条件。</dd>';
  $('method').innerHTML+='<dt>自定义时间</dt><dd>起止日期均按订单付款日期，含首尾，和年、月、周、日取交集；所有本期视图同步筛选。部分周按实际日期计算。每周品类贡献变化为该品类退款金额除以本周销售总额与上周同口径的差，分品类变化合计等于整体周变化；缺失上周不补零。</dd>';
  $('method').innerHTML+='<dt>退款因子</dt><dd>单品销售占比 × 该品自身退款率，单位为百分点，反映对整体退款率的贡献。销售占比＝该品销售金额 ÷ 当前左侧筛选范围销售总额，例如20% × 30%＝6个百分点。系列和SKU均按各自汇总金额计算；使用未四舍五入值，正常可计算各品的因子加总等于整体退款率。搜索、排序和翻页不缩小占比分母。系列周明细以当前左侧筛选的该周所有系列销售额为分母，本模块多选系列不重算分母；总览时段因子以当前筛选全部时段销售总额为分母。无正销售金额、金额异常或指标未就绪时不可计算。</dd><dt>系列每周趋势</dt><dd>按订单付款日期的 ISO 周（周一至周日）汇总各系列退款金额与销售金额后相除，不平均 SKU 退款率。较上周变化为当前周退款率减相邻自然周退款率，单位为百分点；未选择的周、无订单周或不可计算周不补成 0%，也不跨过缺失周计算变化。左侧日期与跨月周取交集；部分周单独标记。历史订单累计退款随售后更新而变化，近期周的售后观察时间较短。</dd>';
  const rules=data.config.channel_rules;
  if(rules)$('method').innerHTML+=`<dt>渠道分类</dt><dd>指定的 ${rules.online_owned_shops.length} 家店铺优先归为线上自营；其余店铺名称包含 ${esc(rules.online_reseller_keywords.join('、'))} 的归为线上经销，其余归为线下。渠道是店铺归类，销售范围继续遵循上方销售规则。渠道退款率按该渠道退款金额合计除以销售金额合计。</dd>`;
  $('source-table').innerHTML=data.sources.map(s=>`<tr><td>${esc(s.name)}</td><td>${int(s.rows)}</td><td>${esc(s.updated.replace('T',' '))}</td></tr>`).join('');
  $('issue-table').innerHTML=data.quality.details.slice(0,200).map(r=>`<tr><td>${esc(r.type)}</td><td>${esc(r.description)}</td><td class="meta-code">${esc(r.sku||r.order||'—')}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="3">逐笔待检查记录请在本地看板核查</td></tr>';
  const count=Object.values(data.quality.counts).reduce((a,b)=>a+b,0);$('quality-badge').textContent=count?int(count):'';
}
function showTab(t){tab=t;document.querySelectorAll('[data-tab]').forEach(e=>e.classList.toggle('active',e.dataset.tab===t));for(const k of ['overview','series','sku','regions','compare','basket','products','quality'])$(`${k}-view`).hidden=k!==t;document.querySelector('.kpis').hidden=t==='basket';$('notices').hidden=t==='basket';document.querySelector('.scope-tag').innerHTML=t==='basket'?'同一原始订单内购买 <span>·</span> 赠品不计入':'退款归回订单付款日期 <span>·</span> 换货不计入';if(data)renderActiveAnalysis();}
async function load(manual=false){
  if(polling)return;polling=true;
  try{
    const next=await window.githubDashboard.load();if(next.version!==1)throw new Error('看板数据格式不受支持');
    if(!data||data.updated_at!==next.updated_at){
      // Stable labels preserve choices even when dimension IDs change after a refresh.
      const selections=data?Object.fromEntries(keys.map(k=>[k,[...selected[k]].map(v=>v.startsWith('missing:')?v.slice(8):directKeys.has(k)?v:k==='sku'?`${data.products[+v].code}|${data.products[+v].item_code}`:fullLabel(k,v))])):null;
      data=next;if(selections)keys.forEach(k=>{if(directKeys.has(k)){selected[k]=new Set(selections[k]);return;}const list=k==='sku'?data.products.map(p=>`${p.code}|${p.item_code}`):k==='shop'?data.dimensions.shops:k==='category'?data.dimensions.categories:data.dimensions.series;selected[k]=new Set(selections[k].map(v=>list.indexOf(v)>=0?String(list.indexOf(v)):'missing:'+v));});
      $('notices').innerHTML=data.notices.map(n=>`<div class="notice ${n.level==='info'?'info':''}"><strong>${esc(n.title)}</strong><span>${esc(n.text)}</span></div>`).join('');$('updated').textContent=new Date(data.updated_at).toLocaleString('zh-CN',{hour12:false});$('loading').hidden=true;$('content').hidden=false;render();if(manual)toast('已加载最新数据');
    }else if(manual)toast('当前已是最新数据');
    $('connection').textContent='线上数据已连接';
  }catch(err){$('connection').textContent='数据连接异常';if(!data){$('loading').innerHTML=`<div class="error-box"><h3>等待线上数据</h3><p>${esc(err.message)}</p><button class="button" onclick="location.reload()">重试</button></div>`;}else if(manual)toast(err.message);}
  finally{polling=false;}
}
function exportCSV(){
  if(tab==='sku'){exportSKUMatrixCSV();return;}
  if(tab==='basket'){exportBasketCSV();return;}
  if(!data)return;const rows=productRows.map(r=>{const p=data.products[r.key];return [p.code,p.item_code,p.name,data.dimensions.categories[p.category],data.dimensions.series[p.series],r.bad?'金额异常':r.sales.toFixed(2),r.refundBad?'金额异常':r.returns.toFixed(2),rateText(r),r.qty,attribute(r.key,'size'),attribute(r.key,'color'),r.salesShare===null?'':(r.salesShare*100).toFixed(6)+'%',r.refundFactor===null?'':(r.refundFactor*100).toFixed(6),r.factorBaseSales===null?'':r.factorBaseSales.toFixed(4)];});
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\ufeff'+[['商家编码','货品编号','商品名称','品类','系列','销售金额','退款金额','退款率','实发件数','尺寸','颜色','销售占比','退款因子（百分点）','占比基准销售金额（元）'],...rows].map(r=>r.map(quote).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='退款率分析_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('已导出当前筛选的商品明细');
}
function exportSKUMatrixCSV(){
  const rows=matrixDetailRows();if(!rows.length){toast('当前矩阵没有可导出的数据');return;}
  const header=['系列','SKU','货品编号','商品名称','颜色','尺寸','退货数量','实发数量','数量率','退款金额（元）','销售金额（元）','金额率'];
  const values=grouped(rows,4).map(r=>{const p=data.products[r.key];return [data.dimensions.series[p.series],p.code,p.item_code,p.name,attribute(r.key,'color'),attribute(r.key,'size'),r.returnQty,r.qty,r.quantityRate===null?'无实发数量':pct(r.quantityRate),r.refundBad?'金额异常':r.returns.toFixed(2),r.bad?'金额异常':r.sales.toFixed(2),rateText(r)];}),quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\ufeff'+[header,...values].map(r=>r.map(quote).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='SKU退款分析_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前矩阵对应的SKU明细');
}
function exportMissingReturns(){
  const records=data.quality.source_completeness?.missing_return_records||[];
  const headers=['参考退换单号','原始订单号','货品编号','SKU','参考表行','参考退货货品金额','参考退款总额'];
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const csv='\uFEFF'+[headers,...records.map(r=>headers.map(k=>r[k]))].map(r=>r.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='缺失退货单核查清单.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('refund-factor-mode').onchange=renderRefundFactors;$('refund-factor-search').oninput=renderRefundFactors;$('refund-factor-export').onclick=exportRefundFactors;
$('custom-date-form').onsubmit=e=>{e.preventDefault();const start=$('custom-date-start').value,end=$('custom-date-end').value;if(start&&end&&start>end){$('custom-date-status').textContent='开始日期不能晚于结束日期，原筛选保持。';$('custom-date-status').classList.add('invalid');return;}dateRange={start,end};$('custom-date-status').classList.remove('invalid');$('custom-date-status').textContent=(start||end?'已应用 '+(start||'不限')+' 至 '+(end||'不限')+'。':'未限定日期。')+'按付款日期，与年月周日筛选取交集。';categoryWeek=null;page=1;render();};$('custom-date-clear').onclick=clearDateRange;
$('category-week-select').onchange=e=>renderCategoryComparison(e.target.value);$('category-week-export').onclick=exportCategoryWeeks;
$('category-week-legend').onclick=e=>{const button=e.target.closest('[data-category-curve]');if(!button)return;categoryTrendManual=true;const name=button.dataset.categoryCurve;categoryTrendSelected.has(name)?categoryTrendSelected.delete(name):categoryTrendSelected.add(name);renderCategoryWeekly();};
const inspectCategoryWeek=e=>{const el=e.target.closest('[data-category-week]');if(el)renderCategoryComparison(el.dataset.categoryWeek);};$('category-week-chart').onclick=inspectCategoryWeek;$('category-week-chart').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspectCategoryWeek(e);}};
setupFilters();$('reset').onclick=()=>{keys.forEach(k=>{selected[k].clear();document.querySelector(`[data-search="${k}"]`).value='';});clearDateRange();};$('reload').onclick=()=>load(true);$('export').onclick=exportCSV;
$('selection').onclick=e=>{if(e.target.closest('[data-remove-date-range]')){clearDateRange();return;}const k=e.target.dataset.remove;if(k){selected[k].clear();page=1;render();}};
document.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>showTab(e.dataset.tab));
document.addEventListener('click',e=>{if(!$('sku-series-picker').contains(e.target)&&e.target!==$('sku-series-search'))$('sku-series-picker').open=false;const resetSeries=e.target.closest('[data-matrix-series-reset]');if(resetSeries){resetMatrixSeries();return;}const removeSeries=e.target.closest('[data-matrix-series-remove]');if(removeSeries){matrixSeriesSelection.delete(removeSeries.dataset.matrixSeriesRemove);matrixSeriesInitialized=true;matrixCell=null;renderSKUAnalysis();return;}const selectVisible=e.target.closest('[data-matrix-series-select-visible]');if(selectVisible){const q=$('sku-series-search').value.trim().toLowerCase();for(const name of matrixSeriesChoices())if(name.toLowerCase().includes(q))matrixSeriesSelection.add(name);matrixSeriesInitialized=true;matrixCell=null;renderSKUAnalysis();return;}const mode=e.target.closest('[data-matrix-mode]');if(mode){matrixMode=mode.dataset.matrixMode;renderSKUAnalysis();return;}const cell=e.target.closest('[data-matrix-cell]');if(cell&&matrixSeriesSelection.has(cell.dataset.matrixSeries)){matrixCell={series:cell.dataset.matrixSeries,color:cell.dataset.matrixColor??null,size:cell.dataset.matrixSize??null};renderSKUAnalysis();return;}const resetCell=e.target.closest('[data-matrix-reset]');if(resetCell){matrixCell=null;renderSKUAnalysis();return;}const open=e.target.closest('[data-open-tab]');if(open){showTab(open.dataset.openTab);return;}const channel=e.target.closest('[data-channel]');if(channel){selected.channel=new Set([channel.dataset.channel]);page=1;render();return;}const group=e.target.closest('[data-group-filter]');if(group){selected[group.dataset.groupFilter]=new Set([group.dataset.groupId]);page=1;showTab('products');render();return;}const b=e.target.closest('[data-shop]');if(b){selected.shop=new Set([String(b.dataset.shop)]);page=1;showTab('products');render();}});
$('granularity').onchange=renderTrend;$('trend-metric').onchange=renderTrend;$('product-search').oninput=()=>{page=1;renderProducts();};$('product-sort').onchange=()=>{page=1;renderProducts();};$('prev').onclick=()=>{page--;renderProducts();};$('next').onclick=()=>{page++;renderProducts();};
$('series-search').oninput=renderSeries;$('series-sort').onchange=renderSeries;$('region-sort').onchange=renderRegions;
$('series-trend-search').oninput=renderSeriesTrendPicker;
$('series-trend-options').onchange=e=>{const input=e.target.closest('[data-series-trend-option]');if(!input)return;seriesTrendManual=true;input.checked?seriesTrendSelection.add(input.value):seriesTrendSelection.delete(input.value);renderSeriesWeeklyTrend();};
$('series-trend-select-visible').onclick=()=>{const q=$('series-trend-search').value.trim().toLowerCase();seriesTrendManual=true;for(const name of seriesTrendChoices())if(name.toLowerCase().includes(q))seriesTrendSelection.add(name);renderSeriesWeeklyTrend();};
$('series-trend-clear').onclick=()=>{seriesTrendManual=true;seriesTrendSelection.clear();renderSeriesWeeklyTrend();};
$('series-trend-reset').onclick=()=>{seriesTrendManual=false;$('series-trend-search').value='';renderSeriesWeeklyTrend();};
$('series-trend-chips').onclick=e=>{const button=e.target.closest('[data-series-trend-remove]');if(!button)return;seriesTrendManual=true;seriesTrendSelection.delete(button.dataset.seriesTrendRemove);renderSeriesWeeklyTrend();};
$('series-trend-export').onclick=exportSeriesWeeklyCSV;
const inspectSeriesWeek=e=>{const el=e.target.closest('[data-trend-week]');if(el&&el.dataset.trendWeek!==seriesTrendWeek)renderSeriesWeeklyDetail(el.dataset.trendWeek);};
$('series-weekly-chart').addEventListener('pointerover',inspectSeriesWeek);$('series-weekly-chart').addEventListener('focusin',inspectSeriesWeek);$('series-weekly-chart').addEventListener('click',inspectSeriesWeek);$('series-weekly-table').addEventListener('click',inspectSeriesWeek);
$('series-weekly-chart').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.hasAttribute('data-trend-week')){e.preventDefault();inspectSeriesWeek(e);}});
document.addEventListener('click',e=>{if(!$('series-trend-picker').contains(e.target))$('series-trend-picker').open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('series-trend-picker').open){$('series-trend-picker').open=false;$('series-trend-picker').querySelector('summary').focus();}});
$('region-tree').addEventListener('toggle',e=>{const k=e.target.dataset.regionKey;if(k)e.target.open?regionOpen.add(k):regionOpen.delete(k);},true);
$('compare-mode').onchange=()=>{$('compare-search').value='';renderComparison();};$('compare-search').oninput=renderComparison;$('compare-product').onchange=renderComparison;
$('sku-series-search').oninput=()=>{renderMatrixSeriesPicker();$('sku-series-picker').open=true;};$('sku-series-options').onchange=e=>{const input=e.target.closest('[data-matrix-series-option]');if(!input)return;input.checked?matrixSeriesSelection.add(input.value):matrixSeriesSelection.delete(input.value);matrixSeriesInitialized=true;matrixCell=null;renderSKUAnalysis();};
$('basket-sku-search').oninput=()=>{basketPage=1;renderBasketDetails();};$('basket-sku-sort').onchange=()=>{basketPage=1;renderBasketDetails();};$('basket-prev').onclick=()=>{basketPage--;renderBasketDetails();};$('basket-next').onclick=()=>{basketPage++;renderBasketDetails();};
$('basket-ranking-export').onclick=exportBasketRankingCSV;
document.addEventListener('click',e=>{const button=e.target.closest('[data-basket-basis]');if(button&&!button.disabled){basketBasis=button.dataset.basketBasis;basketPage=1;renderBasketAnalysis();}});
$('basket-reset').onclick=()=>{basketPair=['行李箱','行李箱'];basketPage=1;$('basket-sku-search').value='';$('basket-sku-sort').value='orders';renderBasketAnalysis();};
document.addEventListener('click',e=>{const button=e.target.closest('[data-basket-left]');if(button){basketPair=[button.dataset.basketLeft,button.dataset.basketRight];basketPage=1;renderBasketAnalysis();if(!$('basket-sku-panel').hidden)$('basket-sku-panel').scrollIntoView({block:'start'});}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('sku-series-picker').open){$('sku-series-picker').open=false;$('sku-series-picker').querySelector('summary').focus();}});
load();setInterval(()=>{if(document.visibilityState==='visible')load();},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();});
window.dashboardState=()=>({data,selected,dateRange:{...dateRange},filtered,totals:filtered.length?scopeTotals():null,tab,productRows,shopRows,seriesRows,refundFactorRows,categoryWeekly,categoryWeek,categoryTrendSelected,seriesWeeklyTrend,seriesTrendSelection,seriesTrendManual,seriesTrendWeek,regionRows,compareRows,channelRows,skuMatrix,skuMatrices,matrixCell,matrixSeriesSelection,basketAnalysis,basketPair,basketVisibleRows,basketRankingRows,basketBasis});
