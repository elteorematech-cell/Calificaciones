'use strict';
// Sistema de Calificaciones · servidor (Node >= 22, sin dependencias externas)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),{promisify}=require('util');
const {DatabaseSync}=require('node:sqlite'),scrypt=promisify(crypto.scrypt);
const PORT=+process.env.PORT||3000,DATA=process.env.DATA_DIR||path.join(__dirname,'data'),SECURE=process.env.COOKIE_SECURE==='1';
fs.mkdirSync(DATA,{recursive:true});
const db=new DatabaseSync(path.join(DATA,'calificaciones.db'));
db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
const q=s=>db.prepare(s),dg=s=>String(s??'').replace(/\D/g,''),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const err=(status,message)=>Object.assign(new Error(message),{status});

// ---- Plan de evaluación (1er Momento) ----
const P4={n:['Algoritmos y Diagramas de Flujo','Programación Básica en Software Libre','Producto de Software Educativo Funcional','Exposición y Feria de Identidad','Formación Integral y Convivencia'],w:[.25,.25,.2,.2,.1]};
const PLAN={'1er':P4,'2do':{n:['Aplicaciones Informáticas e Innovación Educativa','Áreas Tecnológicas Avanzadas','Diagramación e Innovación Visual','Proyección y Muestra Socioproductiva','Actitudes y Convivencia Escolar'],w:[.25,.25,.2,.2,.1]},
'3er':{n:['Práctica Socioproductiva – Biotecnología Local','Sistematización de Resultados','Telemática y Redes de Comunicación','Proyección Institucional y Muestra','Seguimiento Volitivo y Convivencia'],w:[.25,.2,.25,.2,.1]},'4to':P4,'5to':P4};
q('INSERT OR IGNORE INTO periodo_escolar(id,nombre) VALUES(1,?)').run('2026 – 2027');
q('INSERT OR IGNORE INTO momento(id,periodo_id,numero) VALUES(1,1,1)').run();
for(const a of Object.keys(PLAN)){PLAN[a].n.forEach((n,i)=>q('INSERT OR IGNORE INTO actividad(momento_id,anio,nro,nombre,ponderacion) VALUES(1,?,?,?,?)').run(a,i+2,n,PLAN[a].w[i]));
  for(const l of 'ABCD')q('INSERT OR IGNORE INTO seccion(periodo_id,anio,letra) VALUES(1,?,?)').run(a,l)}
const AID={};for(const r of q('SELECT id,anio,nro FROM actividad WHERE momento_id=1').all())(AID[r.anio]??=[])[r.nro-2]=r.id;

// ---- Claves: scrypt con sal aleatoria ----
const KP={N:16384,r:8,p:1,maxmem:64*1024*1024};
async function hash(p){const s=crypto.randomBytes(16),k=await scrypt(p,s,64,KP);return `scrypt$${s.toString('hex')}$${k.toString('hex')}`}
async function verify(p,h){const [,s,k]=h.split('$'),d=await scrypt(p,Buffer.from(s,'hex'),64,KP);return crypto.timingSafeEqual(d,Buffer.from(k,'hex'))}
let DUMMY;

// ---- Utilidades HTTP ----
const SEC={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',...(SECURE?{'Strict-Transport-Security':'max-age=31536000'}:{})};
const send=(res,c,o,h={})=>{res.writeHead(c,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...SEC,...h});res.end(JSON.stringify(o))};
const body=req=>new Promise((ok,no)=>{let b='',n=0;req.on('data',c=>{n+=c.length;if(n>1e6){no(err(413,'Solicitud demasiado grande'));req.destroy()}else b+=c});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch(e){no(err(400,'JSON inválido'))}})});
function sesion(req){const m=/(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie||'');if(!m)return null;const th=sha(m[1]),r=q('SELECT u.* FROM sesion s JOIN usuario u ON u.cedula=s.cedula WHERE s.token_hash=? AND s.expira>?').get(th,Date.now());return r?{...r,th}:null}
const audit=(ced,acc,det)=>q('INSERT INTO auditoria(fecha,cedula,accion,detalle) VALUES(?,?,?,?)').run(new Date().toISOString(),ced,acc,det||null);
function perfil(u){const d=!!u.debe_cambiar;if(u.rol==='DOCENTE')return{rol:'DOCENTE',nombre:u.nombre,cedula:'V-'+u.cedula,debeCambiar:d};const e=q('SELECT cedula_mostrar ci,nombres,apellidos FROM estudiante WHERE cedula=?').get(u.cedula);return{rol:'ESTUDIANTE',nombre:e?e.nombres+' '+e.apellidos:'',cedula:e?e.ci:u.cedula,debeCambiar:d}}
const cerrada=id=>!!q('SELECT 1 x FROM cierre_calificacion WHERE seccion_id=? AND momento_id=1').get(id);

// ---- Lectura: formato que consume la interfaz ----
function datos(ced){const w=ced?' AND e.cedula=?':'',a=ced?[ced]:[],D={est:[],mat:[],notas:{},cierres:{}};
  const rows=q(`SELECT e.cedula_mostrar ci,e.nombres nom,e.apellidos ape,e.telefono tel,e.correo mail,m.id mid,s.anio,s.letra sec FROM matricula m JOIN estudiante e ON e.cedula=m.cedula JOIN seccion s ON s.id=m.seccion_id WHERE m.periodo_id=1${w}`).all(...a);
  for(const r of rows){D.est.push({ci:r.ci,nom:r.nom,ape:r.ape,tel:r.tel||'',mail:r.mail||''});D.mat.push({ci:r.ci,anio:r.anio,sec:r.sec});
    const n={diag:'',a:[0,1,2,3,4].map(()=>[null,null,null]),sup:null},rm=q('SELECT diagnostico,superacion FROM resultado_momento WHERE matricula_id=? AND momento_id=1').get(r.mid);
    if(rm){n.diag=rm.diagnostico||'';n.sup=rm.superacion}
    for(const c of q('SELECT a.nro,c.practica_1 p1,c.practica_2 p2,c.eval_act ea FROM calificacion c JOIN actividad a ON a.id=c.actividad_id WHERE c.matricula_id=?').all(r.mid))n.a[c.nro-2]=[c.p1,c.p2,c.ea];
    D.notas[r.ci+'|'+r.anio+r.sec]=n}
  for(const c of q('SELECT s.anio||s.letra k FROM cierre_calificacion c JOIN seccion s ON s.id=c.seccion_id WHERE c.momento_id=1').all())D.cierres[c.k]=true;
  return D}

// ---- Escritura: una sección completa, validada y en una transacción ----
async function guardar(id,b,S){const anio=id.slice(0,3),sec=q('SELECT id FROM seccion WHERE periodo_id=1 AND anio=? AND letra=?').get(anio,id[3]);
  if(!sec)throw err(404,'La sección no existe.');if(!Array.isArray(b.est)||b.est.length>80)throw err(400,'Datos inválidos.');
  if(cerrada(sec.id)&&b.cerrada!==false)throw err(409,'La sección está cerrada. Reábrela para modificarla.');
  const str=(v,n)=>String(v??'').trim().slice(0,n),E=b.est.map(e=>({d:dg(e.ci),ci:str(e.ci,20),nom:str(e.nom,100),ape:str(e.ape,100),tel:str(e.tel,30),mail:str(e.mail,100)}));
  for(const e of E)if(e.d.length<5||e.d.length>12||!e.nom||!e.ape)throw err(400,`Cédula, nombres y apellidos son obligatorios (${e.ci||'sin cédula'}).`);
  const num=v=>{if(v==null||v==='')return null;const x=Number(v);if(!(x>=0&&x<=20))throw err(400,'Las notas deben estar entre 0 y 20.');return x};
  const H={};for(const e of E)if(!q('SELECT 1 x FROM usuario WHERE cedula=?').get(e.d))H[e.d]=await hash(e.d); // clave inicial = cédula (debe cambiarla)
  db.exec('BEGIN');
  try{for(const e of E){
      q('INSERT INTO estudiante(cedula,cedula_mostrar,nombres,apellidos,telefono,correo) VALUES(?,?,?,?,?,?) ON CONFLICT(cedula) DO UPDATE SET cedula_mostrar=excluded.cedula_mostrar,nombres=excluded.nombres,apellidos=excluded.apellidos,telefono=excluded.telefono,correo=excluded.correo').run(e.d,e.ci,e.nom,e.ape,e.tel,e.mail);
      if(H[e.d])q("INSERT INTO usuario(cedula,rol,nombre,clave_hash,debe_cambiar) VALUES(?,'ESTUDIANTE','',?,1)").run(e.d,H[e.d]);
      let mt=q('SELECT id,seccion_id FROM matricula WHERE cedula=? AND periodo_id=1').get(e.d);
      if(!mt)mt={id:Number(q('INSERT INTO matricula(cedula,seccion_id,periodo_id) VALUES(?,?,1)').run(e.d,sec.id).lastInsertRowid)};
      else if(mt.seccion_id!==sec.id){q('DELETE FROM calificacion WHERE matricula_id=?').run(mt.id);q('DELETE FROM resultado_momento WHERE matricula_id=?').run(mt.id);q('UPDATE matricula SET seccion_id=? WHERE id=?').run(sec.id,mt.id)}
      const n=(b.notas||{})[e.d];if(!n)continue;
      q('INSERT INTO resultado_momento(matricula_id,momento_id,diagnostico,superacion) VALUES(?,1,?,?) ON CONFLICT(matricula_id,momento_id) DO UPDATE SET diagnostico=excluded.diagnostico,superacion=excluded.superacion').run(mt.id,['Logrado','En proceso','Iniciado'].includes(n.diag)?n.diag:null,num(n.sup));
      for(let i=0;i<5;i++){const t=(n.a||[])[i]||[];q('INSERT INTO calificacion(matricula_id,actividad_id,practica_1,practica_2,eval_act) VALUES(?,?,?,?,?) ON CONFLICT(matricula_id,actividad_id) DO UPDATE SET practica_1=excluded.practica_1,practica_2=excluded.practica_2,eval_act=excluded.eval_act').run(mt.id,AID[anio][i],num(t[0]),num(t[1]),num(t[2]))}}
    if(b.cerrada===true)q('INSERT OR REPLACE INTO cierre_calificacion(seccion_id,momento_id,cerrado_por,fecha) VALUES(?,1,?,?)').run(sec.id,S.cedula,new Date().toISOString());
    else q('DELETE FROM cierre_calificacion WHERE seccion_id=? AND momento_id=1').run(sec.id);
    audit(S.cedula,'GUARDAR_SECCION',`${id}: ${E.length} estudiantes${b.cerrada?' (cerrada)':''}`);db.exec('COMMIT')}
  catch(x){db.exec('ROLLBACK');throw x}
  return{ok:true}}

// ---- Rutas ----
const fails=new Map(),HTML=()=>fs.readFileSync(path.join(__dirname,'public','index.html'));
const server=http.createServer(async(req,res)=>{try{
  const p=new URL(req.url,'http://x').pathname,m=req.method;
  if(!p.startsWith('/api/')){if(m==='GET'&&(p==='/'||p==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache',...SEC});return res.end(HTML())}return send(res,404,{error:'No encontrado'})}
  if(m!=='GET'&&!/^application\/json/.test(req.headers['content-type']||''))throw err(415,'Content-Type debe ser application/json');
  if(p==='/api/login'&&m==='POST'){const b=await body(req),ci=dg(b.cedula),ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim(),k=ip+'|'+ci,t=Date.now(),a=(fails.get(k)||[]).filter(x=>t-x<9e5);
    if(a.length>=8)throw err(429,'Demasiados intentos. Espera 15 minutos.');
    const u=ci&&q('SELECT * FROM usuario WHERE cedula=?').get(ci),ok=u?await verify(String(b.clave||''),u.clave_hash):(await verify('x',DUMMY),false);
    if(!ok){a.push(t);fails.set(k,a);audit(ci||null,'LOGIN_FALLIDO',ip);throw err(401,'Cédula o clave incorrecta.')}
    fails.delete(k);const tok=crypto.randomBytes(32).toString('hex');q('INSERT INTO sesion(token_hash,cedula,expira) VALUES(?,?,?)').run(sha(tok),ci,t+8*36e5);audit(ci,'LOGIN',ip);
    return send(res,200,perfil(u),{'Set-Cookie':`sid=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${SECURE?'; Secure':''}`})}
  const S=sesion(req);if(!S)throw err(401,'Sesión no iniciada o vencida.');
  if(p==='/api/logout'&&m==='POST'){q('DELETE FROM sesion WHERE token_hash=?').run(S.th);return send(res,200,{ok:true},{'Set-Cookie':'sid=; HttpOnly; Path=/; Max-Age=0'})}
  if(p==='/api/me'&&m==='GET')return send(res,200,perfil(S));
  if(p==='/api/clave'&&m==='POST'){const b=await body(req),nv=String(b.nueva||'');
    if(!await verify(String(b.actual||''),S.clave_hash))throw err(403,'La clave actual no es correcta.');
    if(nv.length<8||nv===S.cedula||nv===b.actual)throw err(400,'La nueva clave debe tener al menos 8 caracteres y ser distinta de la anterior y de tu cédula.');
    q('UPDATE usuario SET clave_hash=?,debe_cambiar=0 WHERE cedula=?').run(await hash(nv),S.cedula);q('DELETE FROM sesion WHERE cedula=? AND token_hash<>?').run(S.cedula,S.th);audit(S.cedula,'CAMBIO_CLAVE');return send(res,200,{ok:true})}
  if(S.debe_cambiar)throw err(403,'Debes cambiar tu clave inicial.');
  if(p==='/api/datos'&&m==='GET')return send(res,200,datos(S.rol==='DOCENTE'?null:S.cedula));
  if(S.rol!=='DOCENTE')throw err(403,'No tienes permiso para esta operación.');   // todo lo siguiente: solo docente
  let r;if(m==='PUT'&&(r=/^\/api\/secciones\/([1-5](?:er|do|to)[A-D])$/.exec(p)))return send(res,200,await guardar(r[1],await body(req),S));
  if(m==='DELETE'&&(r=/^\/api\/estudiantes\/([^/]+)$/.exec(p))){const ci=dg(decodeURIComponent(r[1])),mt=q('SELECT seccion_id FROM matricula WHERE cedula=? AND periodo_id=1').get(ci);
    if(mt&&cerrada(mt.seccion_id))throw err(409,'La sección está cerrada.');
    q('DELETE FROM sesion WHERE cedula=?').run(ci);q('DELETE FROM usuario WHERE cedula=? AND rol=?').run(ci,'ESTUDIANTE');q('DELETE FROM estudiante WHERE cedula=?').run(ci);audit(S.cedula,'ELIMINAR_ESTUDIANTE',ci);return send(res,200,{ok:true})}
  throw err(404,'Ruta no encontrada.');
}catch(e){if(!e.status)console.error(e);send(res,e.status||500,{error:e.status?e.message:'Error interno del servidor.'})}});

(async()=>{DUMMY=await hash('x');const ci=dg(process.env.DOCENTE_CI||'V-17.178.850');
  if(!q('SELECT 1 x FROM usuario WHERE cedula=?').get(ci))q("INSERT INTO usuario(cedula,rol,nombre,clave_hash,debe_cambiar) VALUES(?,'DOCENTE','Daniel Gómez',?,0)").run(ci,await hash(process.env.DOCENTE_CLAVE||'itp2026'));
  setInterval(()=>q('DELETE FROM sesion WHERE expira<?').run(Date.now()),36e5).unref();
  server.listen(PORT,()=>console.log(`Sistema de Calificaciones en http://localhost:${PORT}`))})();
