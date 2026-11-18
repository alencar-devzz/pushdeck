/* Pushdeck Logger: registro, envio ao vivo e verificador de erros no código */
(function(){
'use strict';
const D=typeof document!=='undefined'?document:null,$=s=>D&&D.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fb=n=>n<1024?(n|0)+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';
const fd=ms=>ms<1000?(ms|0)+' ms':ms<60000?(ms/1000).toFixed(1)+' s':Math.floor(ms/60000)+'min '+Math.round(ms%60000/1000)+'s';
const ft=t=>{const d=new Date(t);return d.toLocaleTimeString('pt-BR',{hour12:false})+'.'+String(t%1000).padStart(3,'0')};
const LS=(()=>{try{return localStorage}catch(e){return{}}})();
const PL={host:{},ev:[],ops:[],cur:null,view:null,fnd:[],scope:'tudo',sev:'tudo',flt:'tudo',q:'',busy:0,stat:null,badge:()=>{}};
let uid=0,raf=0,tick=0;

/* ---------- mensagens amigáveis do GitHub ---------- */
function hint(m){m=String(m||'');
 if(/^401|bad credentials/i.test(m))return'O token é inválido ou expirou. Gere outro no GitHub e conecte de novo.';
 if(/rate limit|abuse|secondary|^429/i.test(m))return'O GitHub limitou o uso por um momento. Espere 1 minuto e tente de novo.';
 if(/^403/.test(m))return'Sem permissão neste repositório. Confira se o token tem acesso de escrita (Contents).';
 if(/^404/.test(m))return'Repositório ou ramo não encontrado, ou o token não enxerga ele.';
 if(/^409|fast forward/i.test(m))return'O ramo mudou durante o envio. Tente novamente.';
 if(/^422/.test(m))return'O GitHub recusou os dados (caminho inválido, arquivo repetido ou ramo já existe).';
 if(/^5\d\d|bad gateway|unavailable/i.test(m))return'O GitHub está instável agora. Tente de novo em instantes.';
 if(/failed to fetch|network/i.test(m))return'Sem conexão com a internet.';
 return'';}

/* ---------- registro ---------- */
function add(lvl,src,msg,det){const e={t:Date.now(),lvl,src,msg:String(msg),det:det||''};PL.ev.push(e);if(PL.ev.length>700)PL.ev.splice(0,100);
 if(lvl==='err'||lvl==='warn'){clearTimeout(add.s);add.s=setTimeout(()=>{try{LS.pd_lg=JSON.stringify(PL.ev.filter(x=>x.lvl==='err'||x.lvl==='warn').slice(-80))}catch(x){}},400)}
 paint();return e}
try{const o=JSON.parse(LS.pd_lg||'[]');o.forEach(x=>{x.old=1;PL.ev.push(x)})}catch(e){}
PL.add=add;
PL.net=(m,p,st,ms,err)=>{const s=+st||0;add(s>=400||!s?'err':'net','rede',`${m} ${String(p).split('?')[0]} · ${s||'falhou'} · ${Math.round(ms)}ms`,err||'')};

/* ---------- envio ao vivo ---------- */
const STG=[['ref','Conectar ao ramo'],['parent','Ler o commit anterior'],['blobs','Enviar os arquivos'],['tree','Montar a árvore'],['commit','Criar o commit'],['push','Atualizar o ramo']];
PL.begin=m=>{const o={id:++uid,t0:Date.now(),kind:m.kind||'commit',repo:m.repo,branch:m.branch,msg:m.msg||'',dels:m.dels||0,st:'run',stg:'ref',sg:{ref:{t0:Date.now()}},retries:0,sent:0,
  f:new Map((m.files||[]).map(f=>[f.path,{path:f.path,size:f.size||0,st:'wait'}]))};
 o.stage=k=>{const n=Date.now(),a=o.sg[o.stg];if(a&&!a.t1)a.t1=n;o.stg=k;o.sg[k]={t0:n};if(k==='blobs')o.tb=n;if(o.view!==0)add('info','envio',(STG.find(x=>x[0]===k)||[0,k])[1]);paint()};
 o.file=(p,st,by,err)=>{let f=o.f.get(p);if(!f){f={path:p,size:0,st:'wait'};o.f.set(p,f)}f.st=st;if(st==='ok'){o.sent+=f.size||by*.75||0;f.t=Date.now()}
  if(st==='err'){f.err=err;add('err','envio','Falhou: '+p,err)}paint()};
 o.retry=(p,n,ms,why)=>{o.retries++;add('warn','envio',`Tentando de novo (${n}/3) em ${(ms/1000).toFixed(1)}s: ${p}`,why);paint()};
 o.end=sha=>{const n=Date.now();o.sg[o.stg]&&(o.sg[o.stg].t1=n);o.stg='done';o.st='ok';o.t1=n;o.sha=sha;add('ok','envio',`Commit ${String(sha).slice(0,7)} criado em ${fd(n-o.t0)}`);fin(o)};
 o.fail=e=>{const n=Date.now();o.st='err';o.t1=n;o.err=e&&e.message||String(e);o.tip=hint(o.err);add('err','envio','Envio falhou na etapa «'+(STG.find(x=>x[0]===o.stg)||[0,o.stg])[1]+'»: '+o.err,o.tip);fin(o)};
 o.abort=()=>{o.st='abort';o.t1=Date.now();add('warn','envio','Envio interrompido. Nenhum commit foi criado.');fin(o)};
 PL.ops.unshift(o);if(PL.ops.length>15)PL.ops.pop();PL.cur=o;PL.view=o.id;
 add('info','envio',`Início: ${o.f.size} arquivo(s)${o.dels?' + '+o.dels+' exclusão(ões)':''} → ${o.repo}@${o.branch}`,o.msg);
 if(!tick)tick=setInterval(()=>{if(PL.cur&&PL.cur.st==='run'&&vis())paint(1);else{clearInterval(tick);tick=0}},250);
 return o};
function fin(o){if(PL.cur===o)PL.cur=null;badge();paint()}
function pct(o){if(o.st==='ok')return 100;const i=STG.findIndex(x=>x[0]===o.stg),n=o.f.size||1,d=[...o.f.values()].filter(f=>f.st==='ok'||f.st==='skip').length;
 const B=[0,4,8,80,88,94];return o.stg==='blobs'?8+72*(d/n):B[Math.max(i,0)]}
const vis=()=>{const t=D&&D.getElementById('t-logger');return t&&t.classList.contains('on')};

/* ---------- verificador de código ---------- */
const AF=Object.getPrototypeOf(async function(){}).constructor,EOF=/end of input|unterminated|missing \)|expected expression, got end|eof|unexpected end/i;
const BIN=/\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tgz|7z|rar|mp[34]|mov|wav|ogg|woff2?|ttf|otf|eot|apk|aab|jar|exe|bin|so|dll|keystore|jks|class|psd|ai)$/i;
const ext=p=>(String(p).split('.').pop()||'').toLowerCase();
const kind=p=>{const e=ext(p),n=p.split('/').pop().toLowerCase();if(/^(js|mjs|cjs)$/.test(e))return'js';if(/^(ts|mts|cts)$/.test(e))return'ts';if(/^(jsx|tsx|vue|svelte)$/.test(e))return'jsx';
 if(e==='json'&&!/^(tsconfig|jsconfig|\.eslintrc)/.test(n))return'json';if(/^(css|scss|less)$/.test(e))return e==='css'?'css':'c';if(/^(html?|xml|svg)$/.test(e))return e==='xml'?'c':'html';
 if(e==='py')return'py';if(/^(ya?ml)$/.test(e))return'yaml';if(e==='md')return'md';if(/^(java|c|h|cpp|cc|hpp|cs|go|rs|kt|swift|dart|php)$/.test(e))return'c';return''};
const lineOf=(s,p)=>{let n=1;for(let i=0;i<p&&i<s.length;i++)if(s.charCodeAt(i)===10)n++;return n};
const nl=x=>x.replace(/[^\n]/g,'');
const F=(l,m,sev)=>({l,m,sev:sev||'err'});

/* parênteses, chaves, aspas e comentários */
function bal(s,k){const out=[],st=[],n=s.length,py=k==='py',css=k==='css',P={')':'(',']':'[','}':'{'},Q={'(':')','[':']','{':'}'};let i=0,l=1,pv='';
 const tpl=()=>{while(i<n){const x=s[i];if(x==='\\'){i+=2;continue}if(x==='\n')l++;if(x==='`'){i++;return 1}if(x==='$'&&s[i+1]==='{'){st.push({c:'T',l});i+=2;return 2}i++}return 0};
 while(i<n&&out.length<12){const c=s[i],d=s[i+1];
  if(c==='\n'){l++;i++;continue}
  if(py?c==='#':c==='/'&&d==='/'&&!css){while(i<n&&s[i]!=='\n')i++;continue}
  if(!py&&c==='/'&&d==='*'){const j=s.indexOf('*/',i+2);if(j<0){out.push(F(l,'Comentário /* aberto e nunca fechado'));break}for(let q=i;q<j;q++)if(s[q]==='\n')l++;i=j+2;continue}
  if(c==='`'&&!py&&!css){i++;const r=tpl();if(!r){out.push(F(l,'Texto com crase ` aberto e nunca fechado'));break}pv='`';continue}
  if(c==='"'||c==="'"){const q=c,l0=l;
   if(py&&s.substr(i,3)===q+q+q){const j=s.indexOf(q+q+q,i+3);if(j<0){out.push(F(l0,'Texto de três aspas aberto e nunca fechado'));break}for(let z=i;z<j;z++)if(s[z]==='\n')l++;i=j+3;continue}
   i++;let ok=0;while(i<n){const x=s[i];if(x==='\\'){i+=2;continue}if(x===q){ok=1;i++;break}if(x==='\n')break;i++}
   if(!ok)out.push(F(l0,`Texto entre aspas (${q}) aberto e não fechado na mesma linha`));pv=q;continue}
  if(c==='/'&&!py&&!css&&k!=='c'&&/[(,=:[!&|?{};+\-*%<>~^]|^$/.test(pv)&&d!=='/'&&d!=='*'){let j=i+1,cl=0,ok=0;while(j<n&&s[j]!=='\n'){const x=s[j];if(x==='\\'){j+=2;continue}if(x==='[')cl=1;else if(x===']')cl=0;else if(x==='/'&&!cl){ok=1;break}j++}if(ok){i=j+1;pv='/';continue}}
  if(c==='('||c==='['||c==='{'){st.push({c,l});i++;pv=c;continue}
  if(c===')'||c===']'||c==='}'){const t=st[st.length-1];
   if(c==='}'&&t&&t.c==='T'){st.pop();i++;if(!tpl()){out.push(F(l,'Texto com crase ` aberto e nunca fechado'));break}continue}
   if(!t)out.push(F(l,`«${c}» fechando algo que nunca foi aberto`));
   else if(t.c!==P[c]){out.push(F(l,`«${c}» não combina com «${t.c}» aberto na linha ${t.l}`));st.pop()}
   else st.pop();i++;pv=c;continue}
  if(!/\s/.test(c))pv=c;i++}
 if(out.length<12)st.forEach(t=>{if(t.c!=='T')out.push(F(t.l,`«${t.c}» aberto aqui nunca foi fechado (falta «${Q[t.c]}»)`))});return out}

const TR=[[/Unexpected end of input/i,()=>'O código acaba antes da hora: falta fechar algo ( ) { } [ ]'],[/missing \) after argument list/i,()=>'Falta fechar o parêntese ) na chamada de função'],
 [/Unexpected token '?(.+?)'?$/i,m=>`Símbolo inesperado «${m[1]}»`],[/Unexpected identifier(?: '(.+)')?/i,m=>`Palavra inesperada${m[1]?' «'+m[1]+'»':''} (falta vírgula, operador ou ; antes?)`],
 [/Unexpected string/i,()=>'Texto inesperado (falta vírgula ou operador antes?)'],[/Unexpected number/i,()=>'Número inesperado (falta vírgula ou operador antes?)'],
 [/Invalid or unexpected token/i,()=>'Caractere inválido ou aspas abertas'],[/Identifier '(.+)' has already been declared/i,m=>`«${m[1]}» já foi declarado antes (nome repetido)`],
 [/Missing initializer in const/i,()=>'const precisa de valor inicial (const x = ...)'],[/Unterminated template/i,()=>'Texto com crase ` aberto e nunca fechado'],
 [/Unexpected reserved word/i,()=>'Palavra reservada no lugar errado'],[/Unexpected strict mode reserved word/i,()=>'Palavra reservada no lugar errado'],
 [/Invalid regular expression/i,()=>'Expressão regular inválida'],[/Unexpected template string/i,()=>'Texto com crase inesperado (falta operador antes?)'],[/await is only valid/i,()=>'await usado fora de função async']];
const ptErr=m=>{for(const [r,f] of TR){const x=String(m).match(r);if(x)return f(x)}return'Erro de sintaxe: '+m};

function jsEng(src){if(src.length>1.2e6)return[];let s=src;
 if(/^\s*(import|export)\b|import\.meta/m.test(s))s=s.replace(/^[ \t]*import\s*(?:[\w*{][^'"]*?\sfrom\s*)?(['"])[^'"\n]+\1[ \t]*;?/gm,nl).replace(/^[ \t]*export\s*(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s*(?:from\s*['"][^'"\n]+['"])?[ \t]*;?/gm,nl)
  .replace(/^([ \t]*)export\s+default\s+/gm,'$1void ').replace(/^([ \t]*)export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)/gm,'$1').replace(/import\.meta/g,'({})');
 const run=t=>{try{new AF(t);return null}catch(e){return e}},e=run(s);if(!e)return[];if(!(e instanceof SyntaxError))return[];
 const ls=s.split('\n'),bad=L=>{const x=run(ls.slice(0,L).join('\n'));return x instanceof SyntaxError&&x.message===e.message};
 let L=ls.length;if(bad(ls.length)){let lo=1,hi=ls.length;while(lo<hi){const m=(lo+hi)>>1;bad(m)?hi=m:lo=m+1}L=lo}
 return[F(L,ptErr(e.message))]}

function jsonChk(s){try{JSON.parse(s);return[]}catch(e){const m=String(e.message);let p=(m.match(/position (\d+)/)||[])[1],l=(m.match(/line (\d+)/)||[])[1];l=l?+l:p!=null?lineOf(s,+p):1;
 const t=/Unexpected end/i.test(m)?'O JSON acaba antes da hora (falta fechar { ou [)':/double-quoted property name/i.test(m)?'Nome de propriedade precisa de aspas duplas (ou há vírgula sobrando no fim)':/after property value|after array element/i.test(m)?'Falta vírgula (ou fechar } ] ) depois do valor':/non-whitespace/i.test(m)?'Sobrou texto depois do fim do JSON':/Unexpected token '?(.)'?/i.test(m)?'Símbolo inesperado «'+m.match(/Unexpected token '?(.)'?/i)[1]+'» no JSON':'JSON inválido: '+m.replace(/ in JSON.*/,'');
 return[F(l,t)]}}

function htmlChk(s,L0){const out=[],st=[],V=/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i,O=/^(p|li|dt|dd|tr|td|th|thead|tbody|tfoot|option|optgroup|colgroup|caption|html|head|body|rt|rp)$/i;
 const re=/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;let m,ln=1,lp=0;
 const at=i=>{for(;lp<i;lp++)if(s.charCodeAt(lp)===10)ln++;return ln};
 while((m=re.exec(s))&&out.length<30){if(m[0][1]==='!')continue;const cl=!!m[1],t=m[2].toLowerCase(),l=at(m.index);
  if(!cl){if(V.test(t)||/\/\s*$/.test(m[3]))continue;
   if(t==='script'||t==='style'){const j=s.toLowerCase().indexOf('</'+t,re.lastIndex);if(j<0){out.push(F(l,`<${t}> aberta e nunca fechada`));break}
    const body=s.slice(re.lastIndex,j),ty=(m[3].match(/type\s*=\s*["']?([^"'\s>]+)/i)||[])[1]||'';
    if(t==='style'||!ty||/javascript|module/i.test(ty)){const sub=t==='style'?bal(body,'css'):/^\s*$/.test(body)?[]:(bal(body,'js').length?bal(body,'js'):jsEng(body));sub.forEach(x=>out.push(F(x.l+l-1,(t==='style'?'No <style>: ':'No <script>: ')+x.m)))}
    re.lastIndex=s.indexOf('>',j)+1||s.length;continue}
   st.push({t,l});continue}
  let k=st.length-1;while(k>=0&&st[k].t!==t)k--;
  if(k<0){if(!V.test(t))out.push(F(l,`</${t}> fechando uma tag que nunca foi aberta`));continue}
  for(let z=st.length-1;z>k;z--)if(!O.test(st[z].t))out.push(F(st[z].l,`<${st[z].t}> aberta aqui não foi fechada (antes de </${t}> da linha ${l})`));st.length=k}
 st.forEach(x=>{if(!O.test(x.t)&&out.length<30)out.push(F(x.l,`<${x.t}> aberta aqui nunca foi fechada`))});return out}

function lint(path,s,size){const k=kind(path),R=[],ls=s.split('\n');
 if(!s.trim()&&size===0)R.push(F(0,'Arquivo vazio','info'));
 if(/^<{7} /m.test(s)&&/^>{7} /m.test(s))R.push(F(lineOf(s,s.search(/^<{7} /m)),'Marca de conflito de merge (<<<<<<<) esquecida no arquivo'));
 if(k==='js'||k==='ts'||k==='c'||k==='py'||k==='css'){const b=bal(s,k==='ts'?'js':k);R.push(...b);if(k==='js'&&!b.length)R.push(...jsEng(s))}
 else if(k==='json')R.push(...jsonChk(s));else if(k==='html')R.push(...htmlChk(s));
 else if(k==='yaml'){ls.forEach((x,i)=>{if(/^ *\t/.test(x)&&R.length<8)R.push(F(i+1,'YAML não aceita TAB na indentação, use espaços'))})}
 else if(k==='md'){const f=s.match(/^ {0,3}(```|~~~)/gm);if(f&&f.length%2)R.push(F(lineOf(s,s.lastIndexOf(f[f.length-1])),'Bloco de código ``` aberto e nunca fechado','warn'))}
 if(k==='py'){const t=ls.findIndex(x=>/^\t/.test(x)),sp=ls.findIndex(x=>/^ +\S/.test(x));if(t>=0&&sp>=0)R.push(F(t+1,'Indentação mistura TAB e espaços (o Python pode recusar)','warn'))}
 if(k==='js'||k==='ts'||k==='jsx'){let c=0,c1=0;ls.forEach((x,i)=>{if(/^\s*debugger\b/.test(x))R.push(F(i+1,'«debugger» esquecido no código','warn'));if(/\bconsole\.(log|debug)\(/.test(x)&&!/^\s*(\/\/|\*)/.test(x)){if(!c++)c1=i+1}});if(c)R.push(F(c1,c+' chamada(s) de console.log (a primeira está aqui)','info'))}
 if(k&&k!=='md'){const i=ls.findIndex(x=>/\b(TODO|FIXME)\b/.test(x));if(i>=0)R.push(F(i+1,'Há pendência marcada (TODO/FIXME) neste arquivo','info'))}
 if(size>104857600)R.push(F(0,'Maior que 100 MB: o GitHub vai recusar este arquivo'));else if(size>52428800)R.push(F(0,'Maior que 50 MB: o GitHub avisa e pode ficar lento','warn'));
 R.forEach(r=>{r.path=path;if(r.l>0&&ls[r.l-1]!=null)r.code=ls[r.l-1].trim().slice(0,110)});return R}
PL.lint=lint;

async function scan(items,secrets){const t0=Date.now(),R=[];let n=0;
 for(const it of items){if(BIN.test(it.path)){if((it.size||0)>104857600)R.push(F(0,'Maior que 100 MB: o GitHub vai recusar este arquivo','err')),R[R.length-1].path=it.path;continue}
  let s='';try{s=(it.size||0)>2e6?'':await it.text()}catch(e){}n++;
  try{R.push(...lint(it.path,String(s),it.size||0).map(r=>(r.o=it.origin,r)))}catch(e){add('warn','verificador','Não consegui verificar '+it.path,e.message)}}
 if(secrets&&PL.host.secrets){try{(await PL.host.secrets(items.filter(x=>!BIN.test(x.path)))).forEach(h=>R.push({path:h.path,l:0,sev:'warn',m:'Possível segredo: '+h.label+' (não envie senhas ou tokens)'}))}catch(e){}}
 const o={err:0,warn:1,info:2};R.sort((a,b)=>o[a.sev]-o[b.sev]||a.path.localeCompare(b.path)||a.l-b.l);return{R,n,ms:Date.now()-t0}}
PL.guard=async items=>{if(LS.pd_lgguard==='0')return[];const r=await scan(items,false);r.R.filter(x=>x.sev==='err').forEach(x=>add('err','verificador',`${x.path}${x.l?':'+x.l:''} — ${x.m}`));return r.R.filter(x=>x.sev==='err')};
PL.check=async()=>{if(!PL.host.sources)return;PL.busy=1;paint();const items=PL.host.sources().filter(x=>PL.scope==='tudo'||(PL.scope==='editor'?/editor/.test(x.origin):/fila/.test(x.origin)));
 const r=await scan(items,true);PL.fnd=r.R;PL.stat={n:r.n,ms:r.ms,t:Date.now()};PL.busy=0;
 r.R.filter(x=>x.sev==='err').slice(0,20).forEach(x=>add('err','verificador',`${x.path}${x.l?':'+x.l:''} — ${x.m}`));badge();paint()};
function badge(){const e=PL.fnd.filter(x=>x.sev==='err').length+(PL.cur&&PL.cur.st==='err'?1:0);PL.badge(e,PL.cur&&PL.cur.st==='run')}

/* ---------- interface ---------- */
function paint(now){if(!D||!vis())return;if(now)return draw();if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw()})}
const IC={ok:'✓',err:'✕',warn:'!',info:'i',net:'·'},SV={err:'Erro',warn:'Aviso',info:'Info'};
function live(){const v=PL.ops.find(o=>o.id===PL.view)||PL.ops[0],h=[];
 if(!v)return'<div class="lg-card"><div class="lg-empty"><b>Nenhum envio ainda</b><br>Quando você enviar arquivos ao GitHub, tudo aparece aqui em tempo real: etapas, arquivos, velocidade e o commit sendo criado.</div></div>';
 const now=v.t1||Date.now(),el=now-v.t0,p=pct(v),run=v.st==='run',tot=v.f.size,dn=[...v.f.values()].filter(f=>f.st==='ok'||f.st==='skip').length;
 const bt=v.tb?(Math.max((v.sg.blobs&&v.sg.blobs.t1||now)-v.tb,1)):0,sp=bt&&v.sent?v.sent/(bt/1000):0,sz=[...v.f.values()].reduce((a,f)=>a+f.size,0),eta=run&&sp&&sz>v.sent?(sz-v.sent)/sp*1000:0;
 const lab={run:'Enviando…',ok:'Concluído',err:'Falhou',abort:'Interrompido'}[v.st];
 h.push(`<div class="lg-card lg-${v.st}"><div class="lg-top"><span class="lg-badge">${run?'<i class="lg-spin"></i>':{ok:'✓',err:'✕',abort:'■'}[v.st]}</span><div class="lg-tt"><b>${lab}</b><small>${esc(v.repo)} · ${esc(v.branch)}</small></div><span class="lg-pc">${Math.round(p)}%</span></div>
 <div class="lg-bar"><i style="width:${p}%"></i></div>
 <div class="lg-stats"><div><b>${fd(el)}</b><small>tempo</small></div><div><b>${dn}/${tot}</b><small>arquivos</small></div><div><b>${sp?fb(sp)+'/s':'—'}</b><small>velocidade</small></div><div><b>${run?(eta?fd(eta):'…'):v.retries+'×'}</b><small>${run?'restante':'tentativas'}</small></div></div>
 ${v.msg?`<div class="lg-msg">“${esc(v.msg)}”</div>`:''}
 ${v.st==='err'?`<div class="lg-alert"><b>${esc(v.err)}</b>${v.tip?'<br>'+esc(v.tip):''}</div>`:''}
 ${v.st==='ok'?`<div class="lg-alert ok">Commit <code>${esc(String(v.sha).slice(0,7))}</code> criado e o ramo foi atualizado.${PL.host.url?` <a href="${esc(PL.host.url(v))}" target="_blank" rel="noopener">Ver no GitHub</a>`:''}</div>`:''}</div>`);
 const ix=STG.findIndex(x=>x[0]===v.stg);h.push('<div class="lg-sec">Etapas</div><div class="lg-card lg-steps">'+STG.map((s,i)=>{const g=v.sg[s[0]],st=v.st==='ok'||i<ix?'ok':i===ix?(v.st==='run'?'run':v.st==='err'?'err':'stop'):'wait',
  d=g?((g.t1||(i===ix?now:g.t0))-g.t0):0,ex=s[0]==='blobs'?` <small>${dn}/${tot}</small>`:'';
  return`<div class="lg-st ${st}"><span class="lg-dot">${st==='run'?'<i class="lg-spin"></i>':st==='ok'?'✓':st==='err'?'✕':st==='stop'?'■':''}</span><span>${s[1]}${ex}</span><em>${g?fd(d):''}</em></div>`}).join('')+'</div>');
 const fl=[...v.f.values()];if(fl.length){h.push(`<div class="lg-sec">Arquivos (${fl.length})</div><div class="lg-card lg-files">`+fl.slice(0,250).map(f=>`<div class="lg-f ${f.st}"><span class="lg-dot">${f.st==='run'?'<i class="lg-spin"></i>':f.st==='ok'?'✓':f.st==='err'?'✕':f.st==='skip'?'–':''}</span><span class="lg-fp">${esc(f.path)}${f.err?'<br><small class="lg-er">'+esc(f.err)+'</small>':''}</span><em>${f.size?fb(f.size):''}</em></div>`).join('')+(fl.length>250?`<div class="lg-more">…e mais ${fl.length-250}</div>`:'')+'</div>')}
 if(PL.ops.length>1)h.push('<div class="lg-sec">Envios recentes</div><div class="lg-card">'+PL.ops.map(o=>`<button class="lg-r ${o.id===v.id?'on':''}" data-act="view" data-id="${o.id}"><span class="lg-dot ${o.st}">${{run:'<i class="lg-spin"></i>',ok:'✓',err:'✕',abort:'■'}[o.st]}</span><span class="lg-fp">${esc(o.msg||o.kind)}<br><small>${ft(o.t0).slice(0,8)} · ${o.f.size} arq · ${fd((o.t1||Date.now())-o.t0)}</small></span></button>`).join('')+'</div>');
 return h.join('')}

function errs(){const c={err:0,warn:0,info:0};PL.fnd.forEach(x=>c[x.sev]++);const L=PL.fnd.filter(x=>PL.sev==='tudo'||x.sev===PL.sev),g=LS.pd_lgguard!=='0',h=[];
 const ch=(a,k,v,t)=>`<button class="lg-chip ${PL[k]===v?'on':''}" data-act="${a}" data-v="${v}">${t}</button>`;
 h.push(`<div class="lg-card"><div class="lg-row"><span class="lg-lbl">Verificar</span>${ch('scope','scope','tudo','Tudo')}${ch('scope','scope','editor','Editor')}${ch('scope','scope','fila','Fila de envio')}</div>
 <div class="lg-row"><button class="lg-go" data-act="check" ${PL.busy?'disabled':''}>${PL.busy?'<i class="lg-spin"></i> Verificando…':'Verificar agora'}</button><button class="lg-chip ${g?'on':''}" data-act="guard">Avisar antes de enviar: ${g?'sim':'não'}</button></div></div>`);
 if(!PL.stat)h.push('<div class="lg-card"><div class="lg-empty">Toque em <b>Verificar agora</b> para procurar erros nos arquivos abertos no editor e na fila de envio: chaves e aspas sem fechar, JSON quebrado, tags HTML, conflitos de merge, segredos e arquivos grandes demais.</div></div>');
 else{h.push(`<div class="lg-sum"><span>${PL.stat.n} arquivo(s) verificados em ${fd(PL.stat.ms)}</span></div><div class="lg-row lg-flt">${ch('sev','sev','tudo','Todos '+PL.fnd.length)}${ch('sev','sev','err','Erros '+c.err)}${ch('sev','sev','warn','Avisos '+c.warn)}${ch('sev','sev','info','Info '+c.info)}</div>`);
  if(!L.length)h.push(`<div class="lg-card"><div class="lg-empty lg-okc"><b>${PL.fnd.length?'Nada neste filtro':'Nenhum problema encontrado'}</b></div></div>`);
  else{let last='';h.push('<div class="lg-card">'+L.slice(0,300).map(x=>{const hd=x.path!==last?`<div class="lg-fh">${esc(x.path)}<em>${esc(x.o||'')}</em></div>`:'';last=x.path;
   return hd+`<button class="lg-i ${x.sev}" data-act="open" data-p="${esc(x.path)}" data-l="${x.l}"><span class="lg-sv">${SV[x.sev]}</span><span class="lg-ix">${esc(x.m)}${x.code?'<code>'+esc(x.code)+'</code>':''}</span>${x.l?'<em>L'+x.l+'</em>':''}</button>`}).join('')+'</div>')}}
 return h.join('')}

function logv(){const f=PL.flt,q=PL.q.toLowerCase(),L=PL.ev.filter(e=>(f==='tudo'||(f==='err'?e.lvl==='err':f==='warn'?e.lvl==='warn'||e.lvl==='err':f==='envio'?e.src==='envio':e.lvl==='net'||e.src==='rede'))&&(!q||(e.msg+e.det+e.src).toLowerCase().includes(q))).slice(-300).reverse();
 const ch=(v,t)=>`<button class="lg-chip ${f===v?'on':''}" data-act="flt" data-v="${v}">${t}</button>`;
 return`<div class="lg-card"><div class="lg-row lg-flt">${ch('tudo','Tudo')}${ch('err','Erros')}${ch('warn','Avisos')}${ch('envio','Envio')}${ch('rede','Rede')}</div><div class="lg-row"><input class="lg-q" id="lg-q" placeholder="Buscar no registro" value="${esc(PL.q)}"></div>
 <div class="lg-row"><button class="lg-chip" data-act="copy">Copiar</button><button class="lg-chip" data-act="save">Baixar .txt</button><button class="lg-chip lg-red" data-act="clear">Limpar</button></div></div>
 <div class="lg-card lg-log">${L.length?L.map(e=>`<div class="lg-e ${e.lvl}${e.old?' old':''}"><span class="lg-ic">${IC[e.lvl]||'·'}</span><div><span class="lg-t">${ft(e.t)}${e.old?' · sessão anterior':''} · ${esc(e.src)}</span><div class="lg-em">${esc(e.msg)}</div>${e.det?'<div class="lg-d">'+esc(e.det)+'</div>':''}</div></div>`).join(''):'<div class="lg-empty">Nada por aqui</div>'}</div>`}

function draw(){const a=$('#lg-live'),b=$('#lg-err'),c=$('#lg-log');if(!a)return;
 if(a.offsetParent)a.innerHTML=live();if(b.offsetParent&&!(D.activeElement&&b.contains(D.activeElement)))b.innerHTML=errs();
 if(c.offsetParent&&!(D.activeElement&&c.contains(D.activeElement)))c.innerHTML=logv()}
function txt(){return PL.ev.map(e=>`${new Date(e.t).toISOString()} [${e.lvl.toUpperCase()}] ${e.src}: ${e.msg}${e.det?' | '+e.det:''}`).join('\n')}
PL.show=()=>{draw();if(PL.host.sources&&!PL.stat&&!PL.busy)PL.check()};
PL.mount=()=>{const t=$('#t-logger');if(!t)return;
 t.addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act,v=b.dataset.v;
  if(a==='view')PL.view=+b.dataset.id;else if(a==='check')return PL.check();else if(a==='scope'){PL.scope=v;PL.check();return}else if(a==='sev')PL.sev=v;else if(a==='flt')PL.flt=v;
  else if(a==='guard')LS.pd_lgguard=LS.pd_lgguard==='0'?'1':'0';else if(a==='open'){PL.host.open&&PL.host.open(b.dataset.p,+b.dataset.l);return}
  else if(a==='copy'){try{await navigator.clipboard.writeText(txt());b.textContent='Copiado ✓'}catch(x){b.textContent='Não deu'}return}
  else if(a==='save'){const u=URL.createObjectURL(new Blob([txt()],{type:'text/plain'})),l=D.createElement('a');l.href=u;l.download='pushdeck-log.txt';l.click();setTimeout(()=>URL.revokeObjectURL(u),2e3);return}
  else if(a==='clear'){PL.ev.length=0;try{delete LS.pd_lg}catch(x){}}
  draw()});
 t.addEventListener('input',e=>{if(e.target.id==='lg-q'){PL.q=e.target.value;const p=$('#lg-log'),s=e.target.selectionStart;p.innerHTML=logv();const i=$('#lg-q');i.focus();i.setSelectionRange(s,s)}});
 window.addEventListener('error',e=>add('err','janela',e.message,(e.filename||'').split('/').pop()+':'+e.lineno));
 window.addEventListener('unhandledrejection',e=>add('err','promessa',e.reason&&e.reason.message||e.reason));
 draw()};
window.PDLog=PL;
})();
