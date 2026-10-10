'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={year:'年',month:'月',day:'日',category:'品类',series:'系列',sku:'SKU',shop:'店铺'};
const pos={shop:1,category:2,series:3,sku:4},keys=Object.keys(names);
let data=null,selected=Object.fromEntries(keys.map(k=>[k,new Set()])),tab='overview',page=1,productRows=[],filtered=[],shopRows=[],polling=false;
const money=v=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v),int=v=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(v),pct=v=>(v*100).toFixed(2)+'%';
const amount=v=>v>=100000000?(v/100000000).toFixed(2)+'<small>亿元</small>':v>=10000?(v/10000).toFixed(2)+'<small>万元</small>':money(v)+'<small>元</small>';
function shortShop(s){const parts=s.split('_');return parts.findLast?.(p=>/店|商城|小程序/.test(p))||parts.at(-1)||s;}
function getValue(r,k){return k==='year'?r[0].slice(0,4):k==='month'?r[0].slice(5,7):k==='day'?r[0]:String(r[pos[k]]);}
function match(r,except){return keys.every(k=>k===except||!selected[k].size||selected[k].has(getValue(r,k)));}
function label(k,v){if(v.startsWith('missing:'))return v.slice(8)+'（暂无数据）';if(k==='year')return v+' 年';if(k==='month')return v+' 月';if(k==='day')return v.replaceAll('-',' / ');if(k==='shop')return shortShop(data.dimensions.shops[+v]);if(k==='category')return data.dimensions.categories[+v];if(k==='series')return data.dimensions.series[+v];const p=data.products[+v];return `${p.code} · ${p.name}`;}
function fullLabel(k,v){if(v.startsWith('missing:'))return v.slice(8);return k==='shop'?data.dimensions.shops[+v]:k==='sku'?`${data.products[+v].code} ${data.products[+v].item_code} ${data.products[+v].name}`:label(k,v);}
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2800);}
function setupFilters(){
  $('filters').innerHTML=keys.map(k=>`<details class="filter" data-key="${k}" ${['year','month'].includes(k)?'open':''}><summary><span>${names[k]}</span><span class="filter-count" id="count-${k}">全部</span></summary><input class="filter-search" placeholder="搜索${names[k]}" aria-label="搜索${names[k]}" data-search="${k}"><div class="filter-actions"><button data-clear="${k}">全部</button><button data-select="${k}">选择可见项</button></div><div class="filter-options" id="options-${k}"></div></details>`).join('');
  $('filters').addEventListener('input',e=>{if(e.target.dataset.search)renderOptions(e.target.dataset.search);});
  $('filters').addEventListener('change',e=>{const k=e.target.dataset.filter;if(!k)return;const v=e.target.value;e.target.checked?selected[k].add(v):selected[k].delete(v);if(k==='year'){selected.month.clear();selected.day.clear();}if(k==='month')selected.day.clear();page=1;render();});
  $('filters').addEventListener('click',e=>{const k=e.target.dataset.clear||e.target.dataset.select;if(!k)return;if(e.target.dataset.clear)selected[k].clear();else for(const v of options(k))if(searchMatch(k,v))selected[k].add(v);page=1;render();});
}
function options(k){const values=new Set();for(const r of data.facts)if(match(r,k))values.add(getValue(r,k));return [...new Set([...values,...selected[k]])].sort((a,b)=>['year','month','day'].includes(k)?a.localeCompare(b):label(k,a).localeCompare(label(k,b),'zh-CN'));}
function searchMatch(k,v){const q=document.querySelector(`[data-search="${k}"]`)?.value.toLowerCase()||'';return fullLabel(k,v).toLowerCase().includes(q);}
function renderOptions(k){
  const opts=options(k).filter(v=>searchMatch(k,v));const show=opts.slice(0,400);
  $(`options-${k}`).innerHTML=show.length?show.map(v=>`<label class="filter-option" title="${esc(fullLabel(k,v))}"><input type="checkbox" data-filter="${k}" value="${esc(v)}" ${selected[k].has(v)?'checked':''}><span>${esc(label(k,v))}</span></label>`).join('')+(opts.length>400?'<div class="filter-none">选项较多，请搜索缩小范围</div>':''):'<div class="filter-none">没有匹配选项</div>';
  const count=$(`count-${k}`);count.textContent=selected[k].size?selected[k].size===1?label(k,[...selected[k]][0]):`${selected[k].size} 项`:'全部';count.classList.toggle('selected',!!selected[k].size);
}
function sum(rows){const v={sales:0,returns:0,qty:0,lines:0,bad:0,refundBad:0,refundLines:0,skuCount:new Set(rows.map(r=>r[4])).size};for(const r of rows){v.sales+=r[5];v.returns+=r[6];v.qty+=r[7];v.lines+=r[9];v.bad+=r[10];v.refundBad+=r[11]||0;v.refundLines+=r[12]||0;}v.rate=v.sales>0&&!v.bad&&!v.refundBad&&data.metric_ready?v.returns/v.sales:null;return v;}
function rateText(r){return r.rate!==null?pct(r.rate):r.bad||r.refundBad?'金额异常':r.sales<=0?'无销售数据':'—';}
function ratePill(r){return r.rate===null?`<span class="bar-value pending">${rateText(r)}</span>`:`<span class="rate-pill ${r.rate>.25?'high':''}">${pct(r.rate)}</span>`;}
function grouped(rows,index){const groups=new Map();for(const r of rows){const key=typeof index==='function'?index(r):r[index];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}return [...groups].map(([key,rs])=>({key,...sum(rs)}));}

function render(){
  if(!data)return;filtered=data.facts.filter(r=>match(r));const totals=sum(filtered);keys.forEach(renderOptions);
  $('selection').innerHTML=keys.filter(k=>selected[k].size).map(k=>`<span class="filter-chip">${names[k]}：${esc(selected[k].size===1?label(k,[...selected[k]][0]):selected[k].size+' 项')}<button data-remove="${k}" aria-label="清除${names[k]}筛选">×</button></span>`).join('')||'<span class="selection-placeholder">全部数据 · 可在左侧组合筛选</span>';
  $('rate').innerHTML=totals.rate!==null?(totals.rate*100).toFixed(2)+'<small>%</small>':'—';$('rate-foot').textContent=totals.rate===null?rateText(totals):'退款金额 / 对应销售金额';
  $('sales').innerHTML=totals.bad?'—':amount(totals.sales);$('sales-foot').textContent=data.config.sales_amount_mode==='item_payment_less_postage'?'单品支付金额－分摊邮费 · 已发货':'销售订单明细 · '+(data.config.sales_amount_column?data.config.sales_amount_column+'列':'')+(data.config.exclude_unshipped?'已发货销售金额合计':'订单支付金额合计');$('returns').innerHTML=totals.refundBad?'—':amount(totals.returns);$('returns-foot').textContent=data.config.calculation_mode==='matched_order_cohort'?'售后AI列 · 匹配订单后归回付款日期':data.config.refund_amount_grain==='sku_line'?'售后退货明细 · '+data.config.return_amount_column+'列商品金额合计':'售后退货明细 · 去重分摊后的退款总额';
  $('quantity').textContent=int(totals.qty);$('quantity-foot').textContent=`${int(totals.lines)} 行销售明细 · ${int(totals.skuCount)} 个商品SKU`;
  shopRows=grouped(filtered,1).sort((a,b)=>(b.rate??-1)-(a.rate??-1)||b.sales-a.sales);$('shop-count').textContent=shopRows.length+' 个店铺';$('channel-rows').textContent=shopRows.length+' 条结果';
  renderChannels(totals);renderTrend();renderProducts();renderComposition('category',2);renderComposition('series',3);renderQuality();
}
function compactMoney(v){return v>=100000000?(v/100000000).toFixed(2)+'亿元':v>=10000?(v/10000).toFixed(2)+'万元':money(v)+'元';}
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
function renderTrend(){
  const g=$('granularity').value,metric=$('trend-metric').value,points=grouped(filtered,r=>g==='month'?r[0].slice(0,7):r[0]).sort((a,b)=>a.key.localeCompare(b.key));
  const title={rate:'退款率',returns:'退款金额',sales:'销售金额'}[metric],value=r=>metric==='rate'?r.rate:metric==='sales'?r.bad?null:r.sales:r.refundBad?null:r.returns;
  $('trend-caption').textContent=data.config.calculation_mode==='matched_order_cohort'?'销售与对应售后均按订单付款日期':'销售按付款日期，售后按登记日期';$('trend-legend').textContent=title;
  const valid=points.filter(p=>value(p)!==null);if(!valid.length){$('trend-chart').innerHTML='<div class="chart-empty">当前范围没有可计算的'+title+'</div>';return;}
  const W=620,H=225,L=72,R=18,T=16,B=38,max=Math.max(metric==='rate'?.01:1,...valid.map(value))*1.16,x=i=>L+(points.length===1?(W-L-R)/2:i/(points.length-1)*(W-L-R)),y=v=>T+(1-v/max)*(H-T-B),fmt=v=>metric==='rate'?pct(v):compactMoney(v);
  let svg='';for(let i=0;i<=4;i++){const yy=T+i/4*(H-T-B);svg+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#eef1f7" stroke-dasharray="3 4"/><text x="${L-10}" y="${yy+3}" text-anchor="end" fill="#a2aec2" font-size="10">${fmt(max*(1-i/4))}</text>`;}
  const step=Math.max(1,Math.ceil(points.length/6));points.forEach((p,i)=>{if(i%step===0||i===points.length-1)svg+=`<text x="${x(i)}" y="${H-12}" text-anchor="middle" fill="#99a6bd" font-size="10">${g==='month'?p.key:p.key.slice(5)}</text>`;});
  const segments=[];let seg=[];points.forEach((p,i)=>{if(value(p)===null){if(seg.length)segments.push(seg);seg=[];}else seg.push([p,i]);});if(seg.length)segments.push(seg);
  for(const seg of segments){const path=seg.map(([p,i],j)=>(j?'L':'M')+x(i).toFixed(1)+','+y(value(p)).toFixed(1)).join(' ');svg+=`<path d="${path} L${x(seg.at(-1)[1])},${H-B} L${x(seg[0][1])},${H-B} Z" fill="url(#area)"/><path d="${path}" fill="none" stroke="#4263eb" stroke-width="2.5"/>`;seg.forEach(([p,i])=>{svg+=`<circle cx="${x(i)}" cy="${y(value(p))}" r="${points.length>50?2:4}" fill="white" stroke="#4263eb" stroke-width="2"><title>${p.key}\n退款率：${rateText(p)}\n销售金额：${money(p.sales)} 元\n退款金额：${money(p.returns)} 元</title></circle>`;});}
  $('trend-chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}趋势"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4263eb" stop-opacity=".13"/><stop offset="1" stop-color="#4263eb" stop-opacity="0"/></linearGradient></defs>${svg}</svg>`;
}
function renderProducts(){
  const q=$('product-search').value.toLowerCase(),sort=$('product-sort').value;
  productRows=grouped(filtered,4).filter(r=>{const p=data.products[r.key];return `${p.code} ${p.item_code} ${p.name}`.toLowerCase().includes(q);}).sort((a,b)=>sort==='rate'?(b.rate??-1)-(a.rate??-1)||b.sales-a.sales:sort==='returns'?b.returns-a.returns||b.sales-a.sales:sort==='qty'?b.qty-a.qty||b.sales-a.sales:b.sales-a.sales);
  const pages=Math.max(1,Math.ceil(productRows.length/30));page=Math.min(page,pages);
  $('product-table').innerHTML=productRows.slice((page-1)*30,page*30).map(r=>{const p=data.products[r.key];return `<tr><td><span class="meta-code">${esc(p.code)}</span><span class="sub" title="${esc(p.name)}">${esc(p.name)}</span><span class="sub">${esc(p.item_code)}${p.color?' · '+esc(p.color):''}${p.size?' · '+esc(p.size):''}</span></td><td>${esc(data.dimensions.categories[p.category])}<span class="sub">${esc(data.dimensions.series[p.series])}</span></td><td>${r.bad?'—':money(r.sales)}</td><td>${r.refundBad?'—':money(r.returns)}</td><td>${ratePill(r)}</td><td>${int(r.qty)}</td></tr>`;}).join('')||'<tr class="empty-row"><td colspan="6">没有匹配的商品</td></tr>';
  $('product-count').textContent=`共 ${int(productRows.length)} 个 SKU · 每页 30 条`;$('page-number').textContent=page+' / '+pages;$('prev').disabled=page<=1;$('next').disabled=page>=pages;
}
function renderQuality(){
  $('quality-stats').innerHTML=Object.entries(data.quality.counts).filter(([,v])=>v).map(([k,v])=>`<div class="quality-stat"><span>${esc(k)}</span><strong>${int(v)}</strong></div>`).join('');
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
  const dateRule=cohort?'年、月、日均按销售订单付款日期筛选。售后匹配订单后继承该日期；7月订单在8月退款仍归7月，8月订单在9月退款仍归8月。登记日期仅用于追溯。':'退款按售后登记日期，销售按订单付款日期。年、月、日选择同时作用于两边各自的日期。';
  const matchRule=cohort?'售后“原始单号＋货品编号”与销售“子单原始单号＋货品编号”逐笔匹配，并校验店铺；仅关联已纳入销售范围的订单。SKU、品类、系列及日期继承销售行。未匹配或存在多个日期/SKU归属的记录排除；重复销售匹配不放大退款，每条符合条件的售后金额各计一次。':'退款不要求存在逐笔匹配销售。';
  $('method').innerHTML=`<dt>退款率</dt><dd>当前筛选订单对应的售后退款金额合计 ÷ 同组店铺、品类、系列、SKU的销售金额合计。${cohort?'先匹配订单并归属日期，再汇总计算。':'先分别汇总，再计算比率。'}</dd><dt>销售范围</dt><dd>仅订单类型为“网店销售”${shippedRule}。${salesRule}其他记录不计入。销售件数为实发数量合计。</dd><dt>日期筛选</dt><dd>${dateRule}</dd><dt>售后范围</dt><dd>累计源表中类型为退款、退货的记录，换货排除。${refundRule}${matchRule}</dd><dt>无销售金额</dt><dd>匹配订单的销售金额为零时，退款金额正常展示，退款率显示“无销售数据”。金额异常仅影响对应分组。</dd><dt>来源核验</dt><dd>三个指定目录是唯一业务数据源；产品匹配表只提供商品归属。参考工作簿不提供指标金额，也不阻断当前汇总。</dd><dt>明细下载</dt><dd>使用右上角“导出当前明细”下载筛选后的商品汇总。逐笔销售、售后订单及未匹配记录在本地看板核查。</dd>`;
  $('source-table').innerHTML=data.sources.map(s=>`<tr><td>${esc(s.name)}</td><td>${int(s.rows)}</td><td>${esc(s.updated.replace('T',' '))}</td></tr>`).join('');
  $('issue-table').innerHTML=data.quality.details.slice(0,200).map(r=>`<tr><td>${esc(r.type)}</td><td>${esc(r.description)}</td><td class="meta-code">${esc(r.sku||r.order||'—')}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="3">逐笔待检查记录请在本地看板核查</td></tr>';
  const count=Object.values(data.quality.counts).reduce((a,b)=>a+b,0);$('quality-badge').textContent=count?int(count):'';
}
function showTab(t){tab=t;document.querySelectorAll('[data-tab]').forEach(e=>e.classList.toggle('active',e.dataset.tab===t));for(const k of ['overview','products','quality'])$(`${k}-view`).hidden=k!==t;}
async function load(manual=false){
  if(polling)return;polling=true;
  try{
    const next=await window.githubDashboard.load();if(next.version!==1)throw new Error('看板数据格式不受支持');
    if(!data||data.updated_at!==next.updated_at){
      // Stable labels preserve choices even when dimension IDs change after a refresh.
      const selections=data?Object.fromEntries(keys.map(k=>[k,[...selected[k]].map(v=>v.startsWith('missing:')?v.slice(8):['year','month','day'].includes(k)?v:k==='sku'?`${data.products[+v].code}|${data.products[+v].item_code}`:fullLabel(k,v))])):null;
      data=next;if(selections)keys.forEach(k=>{if(['year','month','day'].includes(k)){selected[k]=new Set(selections[k]);return;}const list=k==='sku'?data.products.map(p=>`${p.code}|${p.item_code}`):k==='shop'?data.dimensions.shops:k==='category'?data.dimensions.categories:data.dimensions.series;selected[k]=new Set(selections[k].map(v=>list.indexOf(v)>=0?String(list.indexOf(v)):'missing:'+v));});
      $('notices').innerHTML=data.notices.map(n=>`<div class="notice ${n.level==='info'?'info':''}"><strong>${esc(n.title)}</strong><span>${esc(n.text)}</span></div>`).join('');$('updated').textContent=new Date(data.updated_at).toLocaleString('zh-CN',{hour12:false});$('loading').hidden=true;$('content').hidden=false;render();if(manual)toast('已加载最新数据');
    }else if(manual)toast('当前已是最新数据');
    $('connection').textContent='线上数据已连接';
  }catch(err){$('connection').textContent='数据连接异常';if(!data){$('loading').innerHTML=`<div class="error-box"><h3>等待线上数据</h3><p>${esc(err.message)}</p><button class="button" onclick="location.reload()">重试</button></div>`;}else if(manual)toast(err.message);}
  finally{polling=false;}
}
function exportCSV(){
  if(!data)return;const rows=productRows.map(r=>{const p=data.products[r.key];return [p.code,p.item_code,p.name,data.dimensions.categories[p.category],data.dimensions.series[p.series],r.bad?'金额异常':r.sales.toFixed(2),r.refundBad?'金额异常':r.returns.toFixed(2),rateText(r),r.qty];});
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\ufeff'+[['商家编码','货品编号','商品名称','品类','系列','销售金额','退款金额','退款率','实发件数'],...rows].map(r=>r.map(quote).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='退款率分析_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('已导出当前筛选的商品明细');
}
function exportMissingReturns(){
  const records=data.quality.source_completeness?.missing_return_records||[];
  const headers=['参考退换单号','原始订单号','货品编号','SKU','参考表行','参考退货货品金额','参考退款总额'];
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const csv='\uFEFF'+[headers,...records.map(r=>headers.map(k=>r[k]))].map(r=>r.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='缺失退货单核查清单.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
setupFilters();$('reset').onclick=()=>{keys.forEach(k=>{selected[k].clear();document.querySelector(`[data-search="${k}"]`).value='';});page=1;render();};$('reload').onclick=()=>load(true);$('export').onclick=exportCSV;
$('selection').onclick=e=>{const k=e.target.dataset.remove;if(k){selected[k].clear();page=1;render();}};
document.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>showTab(e.dataset.tab));
document.addEventListener('click',e=>{const group=e.target.closest('[data-group-filter]');if(group){selected[group.dataset.groupFilter]=new Set([group.dataset.groupId]);page=1;showTab('products');render();return;}const b=e.target.closest('[data-shop]');if(b){selected.shop=new Set([String(b.dataset.shop)]);page=1;showTab('products');render();}});
$('granularity').onchange=renderTrend;$('trend-metric').onchange=renderTrend;$('product-search').oninput=()=>{page=1;renderProducts();};$('product-sort').onchange=()=>{page=1;renderProducts();};$('prev').onclick=()=>{page--;renderProducts();};$('next').onclick=()=>{page++;renderProducts();};
load();setInterval(()=>{if(document.visibilityState==='visible')load();},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();});
window.dashboardState=()=>({data,selected,filtered,totals:filtered.length?sum(filtered):null,tab,productRows,shopRows});
