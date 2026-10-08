'use strict';

(function () {
  const KEY = 'smartpospro.etiquetas.v1';
  const api = window.api || null;
  const state = {
    productos: [], seleccionados: new Set(), plantilla: null, elementoActivo: 'nombre',
    editando: false, impresoras: []
  };

  const presets = [
    { id:'retail-60x40', nombre:'Retail 60 × 40', ancho:60, alto:40, fondo:'#fff', elementos:[
      {id:'negocio',tipo:'texto',texto:'MI NEGOCIO',x:50,y:8,w:80,h:12,fs:9,fw:700,align:'center',visible:true},
      {id:'nombre',tipo:'campo',campo:'nombre',x:6,y:20,w:88,h:20,fs:12,fw:750,align:'left',visible:true},
      {id:'precio',tipo:'campo',campo:'precio',x:6,y:44,w:88,h:22,fs:17,fw:800,align:'left',visible:true},
      {id:'barcode',tipo:'barcode',x:8,y:69,w:84,h:23,fs:7,fw:500,align:'center',visible:true},
      {id:'codigo',tipo:'campo',campo:'codigo',x:50,y:95,w:80,h:5,fs:6,fw:500,align:'center',visible:true}
    ]},
    { id:'minimal-50x30', nombre:'Minimal 50 × 30', ancho:50, alto:30, fondo:'#fff', elementos:[
      {id:'nombre',tipo:'campo',campo:'nombre',x:5,y:8,w:90,h:18,fs:11,fw:750,align:'center',visible:true},
      {id:'precio',tipo:'campo',campo:'precio',x:5,y:28,w:90,h:22,fs:16,fw:800,align:'center',visible:true},
      {id:'barcode',tipo:'barcode',x:12,y:54,w:76,h:32,fs:6,fw:500,align:'center',visible:true},
      {id:'codigo',tipo:'campo',campo:'codigo',x:10,y:88,w:80,h:6,fs:6,fw:500,align:'center',visible:true}
    ]},
    { id:'precio-80x50', nombre:'Precio destacado 80 × 50', ancho:80, alto:50, fondo:'#fff', elementos:[
      {id:'categoria',tipo:'campo',campo:'categoria',x:5,y:5,w:60,h:9,fs:7,fw:650,align:'left',visible:true},
      {id:'nombre',tipo:'campo',campo:'nombre',x:5,y:17,w:90,h:17,fs:13,fw:800,align:'left',visible:true},
      {id:'precio',tipo:'campo',campo:'precio',x:5,y:36,w:90,h:26,fs:22,fw:900,align:'left',visible:true},
      {id:'barcode',tipo:'barcode',x:40,y:67,w:55,h:27,fs:6,fw:500,align:'center',visible:true},
      {id:'codigo',tipo:'campo',campo:'codigo',x:5,y:95,w:30,h:5,fs:6,fw:500,align:'left',visible:true}
    ]}
  ];

  const CODE128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const money = n => 'C$' + (Number(n)||0).toFixed(2);
  const code128Svg = value => {
    let text = String(value || '').trim(); if (!text) return '';
    let codes = [104]; for (const ch of text) { const c=ch.charCodeAt(0); if(c<32||c>126) continue; codes.push(c-32); }
    if(codes.length===1) return '';
    let sum=104; for(let i=1;i<codes.length;i++) sum += codes[i]*i;
    codes.push(sum%103,106);
    let x=0, rects='';
    for(const code of codes){ const p=CODE128[code]; for(let i=0;i<p.length;i++){ const w=Number(p[i]); if(i%2===0) rects += `<rect x="${x}" y="0" width="${w}" height="46"/>`; x+=w; } }
    return `<svg class="et-barcode-svg" viewBox="0 0 ${x} 46" preserveAspectRatio="none" aria-label="Código de barras"><g fill="#111">${rects}</g></svg>`;
  };
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function cargarPlantillas(){
    try { const saved=JSON.parse(localStorage.getItem(KEY)||'[]'); if(Array.isArray(saved)&&saved.length) return saved; } catch(e){}
    return clone(presets);
  }
  let plantillas=cargarPlantillas();
  function guardarPlantillas(){ localStorage.setItem(KEY,JSON.stringify(plantillas)); }
  function plantillaActual(){ return state.plantilla || plantillas[0]; }
  function productoDemo(){ return state.productos.find(p=>state.seleccionados.has(Number(p.id))) || state.productos[0] || {id:1,codigo:'PRD-00001',codigo_barras:'750123456789',nombre:'Producto de ejemplo',precio:350,categoria:'General',stock:12}; }
  function productoValor(p,campo){
    if(campo==='precio') return money(p.precio);
    if(campo==='codigo') return p.codigo || ('PRD-'+String(p.id).padStart(5,'0'));
    if(campo==='codigo_barras') return p.codigo_barras || p.codigoBarras || p.codigo || '';
    return p[campo] ?? '';
  }
  function stageElement(el,p,modo='editor'){
    if(el.visible===false) return '';
    let contenido='';
    if(el.tipo==='barcode') contenido=code128Svg(productoValor(p,'codigo_barras') || productoValor(p,'codigo')) + `<span class="et-barcode-text">${esc(productoValor(p,'codigo_barras') || productoValor(p,'codigo'))}</span>`;
    else if(el.tipo==='imagen') contenido=el.src ? `<img src="${el.src}" alt=""/>` : '<span class="et-placeholder">LOGO</span>';
    else contenido=esc(el.tipo==='texto' ? el.texto : productoValor(p,el.campo));
    const active=modo==='editor' && state.elementoActivo===el.id ? ' activo':'';
    return `<div class="et-element et-${el.tipo}${active}" data-el="${esc(el.id)}" style="left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;font-size:${el.fs}px;font-weight:${el.fw};text-align:${el.align};">${contenido}</div>`;
  }
  function renderStage(){
    const t=plantillaActual(), p=productoDemo();
    const stage=document.getElementById('etiquetaStage'); if(!stage) return;
    stage.style.aspectRatio=`${t.ancho}/${t.alto}`; stage.style.background=t.fondo||'#fff';
    stage.innerHTML=t.elementos.map(e=>stageElement(e,p)).join('');
    stage.querySelectorAll('.et-element').forEach(el=>el.addEventListener('mousedown',startDrag));
    actualizarInspector();
  }
  let drag=null;
  function startDrag(ev){
    const id=ev.currentTarget.dataset.el; state.elementoActivo=id; renderStage();
    const stage=document.getElementById('etiquetaStage'); const el=stage.querySelector(`[data-el="${CSS.escape(id)}"]`); if(!el) return;
    const t=plantillaActual(); const target=t.elementos.find(x=>x.id===id); if(!target) return;
    const r=stage.getBoundingClientRect(); drag={target,r,startX:ev.clientX,startY:ev.clientY,x:target.x,y:target.y};
    document.addEventListener('mousemove',moveDrag); document.addEventListener('mouseup',endDrag,{once:true}); ev.preventDefault();
  }
  function moveDrag(ev){ if(!drag) return; const dx=(ev.clientX-drag.startX)/drag.r.width*100, dy=(ev.clientY-drag.startY)/drag.r.height*100; drag.target.x=Math.max(0,Math.min(100-drag.target.w,drag.x+dx)); drag.target.y=Math.max(0,Math.min(100-drag.target.h,drag.y+dy)); renderStage(); }
  function endDrag(){ drag=null; document.removeEventListener('mousemove',moveDrag); }
  function actualizarInspector(){
    const t=plantillaActual(), e=t.elementos.find(x=>x.id===state.elementoActivo); const panel=document.getElementById('etiquetaInspector'); if(!panel) return;
    if(!e){ panel.innerHTML='<div class="et-empty">Selecciona un elemento en la etiqueta para editarlo.</div>'; return; }
    panel.innerHTML=`<div class="et-inspector-title">Elemento seleccionado</div>
      <label>Tipo<select disabled><option>${esc(e.tipo)}</option></select></label>
      ${e.tipo==='texto'?`<label>Texto<input id="etInTexto" value="${esc(e.texto||'')}"></label>`:''}
      ${e.tipo==='campo'?`<label>Campo<select id="etInCampo">${['nombre','precio','codigo','codigo_barras','categoria','stock'].map(c=>`<option value="${c}" ${e.campo===c?'selected':''}>${c}</option>`).join('')}</select></label>`:''}
      ${e.tipo==='imagen'?`<label>Imagen<input id="etInImagen" type="file" accept="image/*"></label>`:''}
      <div class="et-two"><label>X %<input id="etX" type="number" step="0.5" value="${e.x}"></label><label>Y %<input id="etY" type="number" step="0.5" value="${e.y}"></label></div>
      <div class="et-two"><label>Ancho %<input id="etW" type="number" step="0.5" value="${e.w}"></label><label>Alto %<input id="etH" type="number" step="0.5" value="${e.h}"></label></div>
      <div class="et-two"><label>Fuente<input id="etFs" type="number" min="5" max="80" value="${e.fs||10}"></label><label>Peso<select id="etFw"><option value="500" ${e.fw==500?'selected':''}>Normal</option><option value="650" ${e.fw==650?'selected':''}>Medio</option><option value="750" ${e.fw==750?'selected':''}>Seminegrita</option><option value="900" ${e.fw==900?'selected':''}>Negrita</option></select></label></div>
      <label>Alineación<select id="etAlign"><option ${e.align==='left'?'selected':''}>left</option><option ${e.align==='center'?'selected':''}>center</option><option ${e.align==='right'?'selected':''}>right</option></select></label>
      <button class="et-danger" id="etEliminar">Eliminar elemento</button>`;
    ['etInTexto','etInCampo','etX','etY','etW','etH','etFs','etFw','etAlign'].forEach(id=>{const x=document.getElementById(id); if(x)x.addEventListener('input',()=>{ if(id==='etInTexto')e.texto=x.value; else if(id==='etInCampo')e.campo=x.value; else e[id.replace('et','').toLowerCase()]=Number.isFinite(Number(x.value))&&['etX','etY','etW','etH','etFs'].includes(id)?Number(x.value):x.value; if(id==='etFw')e.fw=Number(x.value); if(id==='etAlign')e.align=x.value; renderStage(); });});
    const img=document.getElementById('etInImagen'); if(img)img.addEventListener('change',()=>{const f=img.files&&img.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{e.src=rd.result;renderStage()};rd.readAsDataURL(f);});
    document.getElementById('etEliminar').addEventListener('click',()=>{t.elementos=t.elementos.filter(x=>x.id!==e.id);state.elementoActivo=null;renderStage();});
  }
  function renderProductos(){
    const q=(document.getElementById('etBuscarProducto')?.value||'').toLowerCase().trim(); const body=document.getElementById('etProductosBody'); if(!body)return;
    const lista=state.productos.filter(p=>!q || `${p.nombre} ${p.codigo||''} ${p.codigo_barras||''}`.toLowerCase().includes(q));
    body.innerHTML=lista.map(p=>`<tr><td><input type="checkbox" class="et-check" data-id="${p.id}" ${state.seleccionados.has(Number(p.id))?'checked':''}></td><td><strong>${esc(p.nombre)}</strong><small>${esc(p.codigo||'')}</small></td><td>${esc(p.codigo_barras||'—')}</td><td>${money(p.precio)}</td><td>${Number(p.stock)||0}</td><td><input class="et-qty" data-id="${p.id}" type="number" min="1" max="999" value="1"></td></tr>`).join('') || '<tr><td colspan="6" class="et-empty-row">No hay productos que coincidan.</td></tr>';
    body.querySelectorAll('.et-check').forEach(c=>c.addEventListener('change',()=>{const id=Number(c.dataset.id);c.checked?state.seleccionados.add(id):state.seleccionados.delete(id);renderStage();actualizarContador();}));
    actualizarContador();
  }
  function actualizarContador(){const n=state.seleccionados.size; const x=document.getElementById('etContadorSeleccion'); if(x)x.textContent=`${n} seleccionado${n===1?'':'s'}`;}
  function sincronizarConfig(){ const t=plantillaActual(); const n=document.getElementById('etNombreDiseno'),a=document.getElementById('etAncho'),h=document.getElementById('etAlto'),f=document.getElementById('etFondo'); if(n)n.value=t.nombre||'';if(a)a.value=t.ancho||60;if(h)h.value=t.alto||40;if(f)f.value=t.fondo||'#ffffff'; }
  async function generarCodigosFaltantes(){ const seleccionados=state.productos.filter(p=>state.seleccionados.has(Number(p.id)) && !(p.codigo_barras||p.codigoBarras)); if(!seleccionados.length){return window.posAviso&&window.posAviso({tipo:'info',titulo:'Códigos completos',mensaje:'Los productos seleccionados ya tienen código de barras.'});} if(!(await window.posConfirmar({titulo:'Generar códigos',mensaje:`Se asignará un código Code 128 único a ${seleccionados.length} producto${seleccionados.length===1?'':'s'}.`,aceptar:'Generar'})))return; let ok=0; for(const p of seleccionados){ const codigo='SP'+String(p.id).padStart(10,'0'); try{ await api.editarProducto(Number(p.id),{nombre:p.nombre,precio:Number(p.precio),stock:Number(p.stock),categoria:p.categoria||'General',codigoBarras:codigo}); p.codigo_barras=codigo;p.codigoBarras=codigo;ok++; }catch(e){} } renderProductos();renderStage(); return window.posAviso&&window.posAviso({tipo:ok?'exito':'peligro',titulo:'Códigos generados',mensaje:`Se asignaron ${ok} de ${seleccionados.length} códigos.`}); }
  function renderPlantillas(){
    const box=document.getElementById('etPlantillas'); if(!box)return;
    box.innerHTML=plantillas.map(t=>`<button class="et-template ${plantillaActual().id===t.id?'activo':''}" data-t="${t.id}"><span class="et-mini" style="aspect-ratio:${t.ancho}/${t.alto};">${t.elementos.filter(e=>e.visible!==false).slice(0,4).map(e=>`<i style="left:${e.x}%;top:${e.y}%;width:${e.w}%;height:${e.h}%;"></i>`).join('')}</span><strong>${esc(t.nombre)}</strong><small>${t.ancho} × ${t.alto} mm</small></button>`).join('');
    box.querySelectorAll('.et-template').forEach(b=>b.addEventListener('click',()=>{state.plantilla=plantillas.find(t=>t.id===b.dataset.t)||plantillas[0];renderPlantillas();sincronizarConfig();renderStage();}));
  }
  function agregarElemento(tipo){
    const t=plantillaActual(); const id=tipo+'-'+Date.now(); const e={id,tipo,x:10,y:10,w:80,h:12,fs:10,fw:650,align:'center',visible:true};
    if(tipo==='texto')e.texto='Nuevo texto'; if(tipo==='campo')e.campo='nombre'; if(tipo==='barcode'){e.w=80;e.h=25;} if(tipo==='imagen'){e.w=35;e.h=20;e.src='';}
    t.elementos.push(e); state.elementoActivo=id; renderStage();
  }
  function nuevoDiseno(){
    const base=clone(presets[0]); base.id='custom-'+Date.now(); base.nombre='Nuevo diseño'; state.plantilla=base; plantillas.push(base); guardarPlantillas(); renderPlantillas(); sincronizarConfig(); renderStage();
  }
  function guardarActual(){ const t=plantillaActual(); const idx=plantillas.findIndex(x=>x.id===t.id); if(idx>=0)plantillas[idx]=clone(t); else plantillas.push(clone(t)); guardarPlantillas(); renderPlantillas(); window.posAviso&&window.posAviso({tipo:'exito',titulo:'Diseño guardado',mensaje:`“${t.nombre}” quedó guardado en SmartPosPro.`}); }
  function eliminarActual(){if(plantillas.length<=1)return window.posAviso&&window.posAviso('Debe conservar al menos un diseño.'); const t=plantillaActual(); if(!confirm(`¿Eliminar el diseño “${t.nombre}”?`))return; plantillas=plantillas.filter(x=>x.id!==t.id);state.plantilla=plantillas[0];guardarPlantillas();renderPlantillas();renderStage();}
  function htmlEtiqueta(p,t){
    const elements=t.elementos.filter(e=>e.visible!==false).map(e=>stageElement(e,p,'print')).join('');
    return `<div class="et-print-label" style="width:${t.ancho}mm;height:${t.alto}mm;background:${t.fondo||'#fff'}">${elements}</div>`;
  }
  function documentoImpresion(items,t){
    const labels=items.map(x=>htmlEtiqueta(x.p,t).repeat(x.cantidad)).join('');
    const isA4=t.ancho>100; const cols=isA4?Math.max(1,Math.floor(190/t.ancho)):1;
    return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${isA4?'A4 portrait':`${t.ancho}mm auto`};margin:${isA4?'8mm':'0'};}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.et-print-label{position:relative;display:inline-block;vertical-align:top;overflow:hidden;border:0;page-break-inside:avoid;margin:${isA4?'0.8mm':'0'};${isA4?`width:${t.ancho}mm!important;height:${t.alto}mm!important;`:''}}.et-element{position:absolute;overflow:hidden;display:flex;align-items:center;justify-content:flex-start;line-height:1.05;padding:1px;color:#111;box-sizing:border-box}.et-element[style*="text-align:center"]{justify-content:center}.et-element[style*="text-align:right"]{justify-content:flex-end}.et-barcode{display:flex;flex-direction:column;align-items:center;justify-content:center}.et-barcode-svg{display:block;width:100%;height:calc(100% - 8px);min-height:1px}.et-barcode-text{font:6px Arial,sans-serif;line-height:7px;white-space:nowrap}.et-imagen img{max-width:100%;max-height:100%;object-fit:contain}.et-placeholder{font-weight:700;color:#888}</style></head><body>${labels}</body></html>`;
  }
  async function imprimir(){
    const t=plantillaActual(); const items=state.productos.filter(p=>state.seleccionados.has(Number(p.id))).map(p=>({p,cantidad:Number(document.querySelector(`.et-qty[data-id="${p.id}"]`)?.value)||1}));
    if(!items.length){return window.posAviso&&window.posAviso({tipo:'aviso',titulo:'Sin productos',mensaje:'Selecciona al menos un producto para imprimir etiquetas.'});}
    const html=documentoImpresion(items,t); const impresora=document.getElementById('etImpresora')?.value||'';
    const res=await api.imprimirTicket({html,impresora,copias:1,anchoMm:t.ancho,altoMm:t.alto,silencioso:true,nombreArchivo:'Etiquetas SmartPosPro'});
    if(res?.ok) window.posAviso&&await window.posAviso({tipo:'exito',titulo:'Etiquetas enviadas',mensaje:res.mensaje||'Las etiquetas fueron enviadas a impresión.'}); else window.posAviso&&await window.posAviso({tipo:'peligro',titulo:'No se pudo imprimir',mensaje:res?.mensaje||'Verifica la impresora.'});
  }
  function agregarCantidadColumna(){
    const head=document.getElementById('etProductosHead'); if(!head)return;
    if(!head.querySelector('.et-th-qty')) head.insertAdjacentHTML('beforeend','<th class="et-th-qty">Etiquetas</th>');
    document.querySelectorAll('#etProductosBody tr').forEach(tr=>{if(!tr.querySelector('.et-qty')){const c=tr.querySelector('.et-check');const id=c?.dataset.id;tr.insertAdjacentHTML('beforeend',`<td><input class="et-qty" data-id="${id||''}" type="number" min="1" max="999" value="1"></td>`);}});
  }
  async function init(){
    if(!api)return;
    try { state.productos=await api.listarProductos(); } catch(e){state.productos=[];}
    state.plantilla=plantillas[0];
    const root=document.getElementById('vista-etiquetas'); if(!root)return;
    document.getElementById('etBuscarProducto').addEventListener('input',renderProductos);
    document.getElementById('etSelectTodos').addEventListener('change',e=>{state.productos.forEach(p=>e.target.checked?state.seleccionados.add(Number(p.id)):state.seleccionados.delete(Number(p.id)));renderProductos();renderStage();});
    document.getElementById('etNuevo').addEventListener('click',nuevoDiseno); document.getElementById('etGuardar').addEventListener('click',guardarActual); document.getElementById('etGenerarCodigos').addEventListener('click',generarCodigosFaltantes); document.getElementById('etEliminarDiseno').addEventListener('click',eliminarActual); document.getElementById('etImprimir').addEventListener('click',imprimir);
    document.getElementById('etNombreDiseno').addEventListener('input',e=>{plantillaActual().nombre=e.target.value;});
    document.getElementById('etAncho').addEventListener('input',e=>{plantillaActual().ancho=Math.max(20,Math.min(210,Number(e.target.value)||60));renderStage();});
    document.getElementById('etAlto').addEventListener('input',e=>{plantillaActual().alto=Math.max(15,Math.min(297,Number(e.target.value)||40));renderStage();});
    document.getElementById('etFondo').addEventListener('input',e=>{plantillaActual().fondo=e.target.value;renderStage();});
    document.querySelectorAll('[data-add-element]').forEach(b=>b.addEventListener('click',()=>agregarElemento(b.dataset.addElement)));
    document.getElementById('etPlantillaDuplicar').addEventListener('click',()=>{const t=clone(plantillaActual());t.id='custom-'+Date.now();t.nombre=t.nombre+' · copia';plantillas.push(t);state.plantilla=t;guardarPlantillas();renderPlantillas();sincronizarConfig();renderStage();});
    document.getElementById('etBuscarProducto').dispatchEvent(new Event('input')); renderProductos(); renderPlantillas(); sincronizarConfig(); renderStage();
    try{state.impresoras=await api.listarImpresoras();const sel=document.getElementById('etImpresora');sel.innerHTML='<option value="">Impresora predeterminada de Windows</option>'+state.impresoras.map(x=>`<option value="${esc(x.nombre)}">${esc(x.mostrado||x.nombre)}${x.predeterminada?' · predeterminada':''}</option>`).join('');}catch(e){}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
