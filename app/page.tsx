"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

type View = "biblioteca" | "comunidad" | "foro" | "subir" | "lector";
type Book = { id:number; title:string; author:string; year:number; pages:number; type:string; color:string; cover:string; synopsis:string; rating:number; available:number; copies:number; readers:string[]; progress?:number };
type SessionUser = { id:string; name:string; email:string; role:"reader"|"admin" };

const initialPosts: ForumPost[] = [];\n\ntype ReactionTargetType = "post" | "profile";
const reactionKey=(targetType:ReactionTargetType,targetId:string|number,emoji:string)=>`${targetType}:${String(targetId)}:${emoji}`;

function Avatar({name,color,small=false}:{name:string;color:string;small?:boolean}){return <div className={`avatar ${small?"small":""}`} style={{background:color}} aria-label={name}>{name[0]}</div>}
function Stars({rating,onSelect}:{rating:number;onSelect?:(rating:number)=>void}){return <span className={`stars ${onSelect?"interactive":""}`} aria-label={`${rating} de 5`}>{[1,2,3,4,5].map(n=>onSelect?<button type="button" key={n} className={n<=rating?"on":""} onClick={()=>onSelect(n)} aria-label={`${n} estrellas`}>★</button>:<span key={n} className={n<=Math.round(rating)?"on":""}>★</span>)}</span>}

export default function Home(){
  const [view,setView]=useState<View>("biblioteca"),[books,setBooks]=useState<Book[]>([]),[people,setPeople]=useState<Reader[]>([]),[selected,setSelected]=useState<Book|null>(null),[search,setSearch]=useState(""),[year,setYear]=useState(""),[type,setType]=useState("");
  const readBooks=books;
  const [owned,setOwned]=useState<Book|null>(null),[toast,setToast]=useState(""),[modal,setModal]=useState<"detail"|"return"|"profile"|null>(null),[posts,setPosts]=useState<ForumPost[]>(initialPosts),[draft,setDraft]=useState(""),[publishing,setPublishing]=useState(false),[postBook,setPostBook]=useState(""),[liked,setLiked]=useState<number[]>([]),[reactionCounts,setReactionCounts]=useState<Record<string,number>>({}),[reactionBusy,setReactionBusy]=useState<string[]>([]);
  const [repliesOpen,setRepliesOpen]=useState<number|null>(null),[replyDrafts,setReplyDrafts]=useState<Record<number,string>>({}),[profileReactions,setProfileReactions]=useState<string[]>([]),[returnRating,setReturnRating]=useState(0),[fileInfo,setFileInfo]=useState(""),[bookText,setBookText]=useState("");
  const [currentUser,setCurrentUser]=useState<SessionUser|null>(null),[authLoading,setAuthLoading]=useState(true),[authView,setAuthView]=useState<"login"|"signup"|"recover"|null>(null),[authSubmitting,setAuthSubmitting]=useState(false);
  const [shelfPage,setShelfPage]=useState(0);
  const sortedBooks=useMemo(()=>[...books].sort((a,b)=>a.title.localeCompare(b.title,"es",{sensitivity:"base"})),[books]);
  const filtered=useMemo(()=>sortedBooks.filter(b=>(!search||`${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()))&&(!year||String(b.year)===year)&&(!type||b.type===type)),[search,year,type,sortedBooks]);
  const shelfSize=12,shelfCount=Math.max(1,Math.ceil(sortedBooks.length/shelfSize)),visibleBooks=sortedBooks.slice(shelfPage*shelfSize,(shelfPage+1)*shelfSize);
  const flash=(message:string)=>{setToast(message);setTimeout(()=>setToast(""),2600)};
  const loggedIn=Boolean(currentUser),currentName=currentUser?.name||"Lector";
  useEffect(()=>{
    let cancelled=false;
    fetch("/api/auth/me")
      .then(async response=>{
        const payload=await response.json();
        if(!response.ok)throw new Error(payload.error||"No se pudo leer la sesión");
        return payload;
      })
      .then(payload=>{if(!cancelled)setCurrentUser(payload.user||null)})
      .catch(error=>console.error("No se pudo cargar la sesión",error))
      .finally(()=>{if(!cancelled)setAuthLoading(false)});
    return ()=>{cancelled=true};
  },[]);
  useEffect(()=>{
    let cancelled=false;
    const palette=["#b63d2f","#e4ad3b","#2d7c73","#745a9c","#315f86","#7e9445"];
    const covers=["linear-gradient(145deg,#274b3d,#6f9b6b)","linear-gradient(145deg,#12354b,#2d7794)","linear-gradient(145deg,#7c2636,#d35b4d)","linear-gradient(145deg,#493362,#b45e75)","linear-gradient(145deg,#3b214e,#b37838)","linear-gradient(145deg,#213e55,#699c79)"];
    fetch("/api/catalog")
      .then(async response=>{
        const payload=await response.json();
        if(!response.ok)throw new Error(payload.error||"No se pudo cargar la biblioteca");
        return payload;
      })
      .then(payload=>{
        if(cancelled)return;
        const loadedBooks:Book[]=Array.isArray(payload.books)?payload.books.map((book:any,index:number)=>({...book,color:palette[index%palette.length],cover:covers[index%covers.length],readers:Array.isArray(book.readers)?book.readers:[]})):[];
        const loadedPeople:Reader[]=Array.isArray(payload.people)?payload.people.map((person:any,index:number)=>({...person,color:palette[index%palette.length]})):[];
        setBooks(loadedBooks);
        setPeople(loadedPeople);
        setSelected(current=>current&&loadedBooks.some(book=>book.id===current.id)?current:(loadedBooks[0]||null));
        setPostBook(current=>current&&loadedBooks.some(book=>book.title===current)?current:(loadedBooks[0]?.title||""));
      })
      .catch(error=>console.error("No se pudo cargar el catálogo real",error));
    return ()=>{cancelled=true};
  },[]);
  useEffect(()=>{
    let cancelled=false;
    fetch("/api/posts")
      .then(async response=>{
        const payload=await response.json();
        if(!response.ok)throw new Error(payload.error||"No se pudo cargar el foro");
        return payload;
      })
      .then(payload=>{
        if(!cancelled&&Array.isArray(payload.posts)){
          setPosts(payload.posts);
        }
      })
      .catch(error=>{
        console.error("No se pudieron cargar las publicaciones persistidas",error);
      });
    return ()=>{cancelled=true};
  },[]);
  useEffect(()=>{
    let cancelled=false;
    fetch("/api/reactions")
      .then(async response=>{
        const payload=await response.json();
        if(!response.ok)throw new Error(payload.error||"No se pudieron cargar las reacciones");
        return payload;
      })
      .then(payload=>{
        if(cancelled)return;
        setReactionCounts(payload.counts&&typeof payload.counts==="object"?payload.counts:{});
        const mine=Array.isArray(payload.mine)?payload.mine:[];
        setLiked(mine.filter((item:{targetType:string;targetId:string;emoji:string})=>item.targetType==="post"&&item.emoji==="❤️").map((item:{targetId:string})=>Number(item.targetId)).filter((id:number)=>Number.isFinite(id)));
        setProfileReactions(mine.filter((item:{targetType:string})=>item.targetType==="profile").map((item:{targetId:string;emoji:string})=>`${item.targetId}-${item.emoji}`));
      })
      .catch(error=>{
        console.error("No se pudieron cargar las reacciones persistidas",error);
      });
    return ()=>{cancelled=true};
  },[currentUser?.id]);
  const toggleReaction=async(targetType:ReactionTargetType,targetId:string|number,emoji:string)=>{
    if(!currentUser){setAuthView("login");flash("Inicia sesión para reaccionar.");return null}
    const busyKey=reactionKey(targetType,targetId,emoji);
    if(reactionBusy.includes(busyKey))return null;
    setReactionBusy(current=>[...current,busyKey]);
    try{
      const response=await fetch("/api/reactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({targetType,targetId:String(targetId),emoji})});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error||"No se pudo guardar la reacción");
      setReactionCounts(current=>({...current,[busyKey]:Number(payload.count)||0}));
      if(targetType==="post"){
        const postId=Number(targetId);
        setLiked(current=>payload.active?(current.includes(postId)?current:[...current,postId]):current.filter(id=>id!==postId));
      }else{
        const profileKey=`${String(targetId)}-${emoji}`;
        setProfileReactions(current=>payload.active?(current.includes(profileKey)?current:[...current,profileKey]):current.filter(item=>item!==profileKey));
      }
      return Boolean(payload.active);
    }catch(error){
      flash(error instanceof Error?`No se pudo guardar la reacción: ${error.message}`:"No se pudo guardar la reacción.");
      return null;
    }finally{
      setReactionBusy(current=>current.filter(item=>item!==busyKey));
    }
  };
  const takeBook=()=>{if(!selected){flash("Selecciona un libro primero.");return}if(selected.available<1){flash("Ese ejemplar está en préstamo. Te avisaremos cuando vuelva.");return}if(owned){flash("Devuelve tu lectura actual antes de tomar otra.");return}setOwned({...selected,progress:0});setModal(null);flash(`“${selected.title}” ya está en tu poder.`)};
  const publish=async()=>{if(!currentUser){setAuthView("login");flash("Inicia sesión para publicar.");return}const text=draft.trim();if(!text||publishing)return;setPublishing(true);try{const response=await fetch("/api/posts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,book:postBook})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"No se pudo guardar la publicación");setPosts(current=>[payload.post,...current]);setDraft("");flash("Tu reflexión ya está en la conversación.")}catch(error){flash(error instanceof Error?`No se pudo publicar: ${error.message}`:"No se pudo publicar la reflexión.")}finally{setPublishing(false)}};
  const submitReply=(postId:number)=>{if(!currentUser){setAuthView("login");flash("Inicia sesión para responder.");return}if(!replyDrafts[postId]?.trim())return;setPosts(current=>current.map(post=>post.id===postId?{...post,replies:post.replies+1}:post));setReplyDrafts(current=>({...current,[postId]:""}));flash("Respuesta publicada")};
  const toggleProfileReaction=async(name:string,emoji:string)=>{const active=await toggleReaction("profile",name,emoji);if(active!==null)flash(active?`Reaccionaste al perfil de ${name}`:`Quitaste tu reacción a ${name}`)};
  const handleBookFile=async(file?:File)=>{if(!file)return;setFileInfo("Convirtiendo el archivo a texto…");try{let text="";if(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")){const [pdfjs,workerModule]=await Promise.all([import("pdfjs-dist"),import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);pdfjs.GlobalWorkerOptions.workerSrc=workerModule.default;const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;const pages:string[]=[];for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){const page=await pdf.getPage(pageNumber);const content=await page.getTextContent();pages.push(content.items.map(item=>("str" in item?item.str:"")).join(" "))}text=pages.join("\n\n")}else{text=await file.text()}setBookText(text);setFileInfo(`${file.name}: ${text.length.toLocaleString("es-MX")} caracteres listos para el visor. El archivo original no se conservará.`)}catch{setBookText("");setFileInfo("No pudimos extraer el texto. Prueba con un PDF con texto seleccionable o un archivo TXT.")}};
  const submitAuth=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(authView==="recover"||!authView||authSubmitting)return;
    const form=new FormData(event.currentTarget);
    const email=String(form.get("email")||"");
    const password=String(form.get("password")||"");
    const endpoint=authView==="signup"?"/api/auth/register":"/api/auth/login";
    const body:Record<string,string>={email,password};
    if(authView==="signup"){
      const name=String(form.get("name")||"");
      const confirm=String(form.get("confirmPassword")||"");
      if(password!==confirm){flash("Las contraseñas no coinciden.");return}
      body.name=name;
      const adminCode=String(form.get("adminCode")||"").trim();
      if(adminCode)body.adminCode=adminCode;
    }
    setAuthSubmitting(true);
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error||"No se pudo autenticar");
      setCurrentUser(payload.user);
      setAuthView(null);
      flash(authView==="signup"?(payload.user?.role==="admin"?"Cuenta de administrador configurada.":"Cuenta creada correctamente."):"Bienvenido de nuevo.");
    }catch(error){
      flash(error instanceof Error?error.message:"No se pudo autenticar.");
    }finally{
      setAuthSubmitting(false);
    }
  };
  const logout=async()=>{
    try{await fetch("/api/auth/logout",{method:"POST"})}catch(error){console.error("No se pudo cerrar la sesión en el servidor",error)}
    setCurrentUser(null);
    setLiked([]);
    setProfileReactions([]);
    setView("biblioteca");
    setModal(null);
    flash("Sesión cerrada");
  };
  return <main>
    <header className="topbar"><button className="brand" onClick={()=>setView("biblioteca")}><span className="brandmark">B</span><span><b>Biblioteca virtual MJVC Mérida</b><small>Colección, préstamo y lectura en un solo lugar</small></span></button><nav>{[["biblioteca","Estantería"],["comunidad","Lectores"],["foro","Foro"]].map(([id,label])=><button key={id} className={view===id?"active":""} onClick={()=>setView(id as View)}>{label}</button>)}</nav><div className="profile-menu">{authLoading?<span className="login-link">Cargando…</span>:loggedIn?<>{currentUser?.role==="admin"&&<button className="upload-link" onClick={()=>setView("subir")}>＋ Subir libro</button>}<button className="me" onClick={()=>setModal("profile")}><Avatar name={currentName} color="#cf915f" small/><span>{currentName}{currentUser?.role==="admin"?" · Admin":""}</span></button><button className="logout" onClick={logout}>Cerrar sesión</button></>:<><button className="login-link" onClick={()=>setAuthView("login")}>Iniciar sesión</button><button className="upload-link" onClick={()=>setAuthView("signup")}>Registrarse</button></>}</div></header>

    {view==="biblioteca"&&<div className="library-layout">
      <aside className="left-panel"><p className="eyebrow">EN TU MESITA</p><h2>{owned?"Una historia te espera":"Tu mesita está libre"}</h2>{owned?<><button className="owned-cover" style={{background:owned.cover}} onClick={()=>setView("lector")}><span>{owned.title}</span><small>{owned.author}</small><i>{owned.progress||36}%</i></button><div className="progress"><span style={{width:`${owned.progress||36}%`}}/></div><p className="muted">Página {Math.round(owned.pages*(owned.progress||36)/100)} de {owned.pages}</p><div className="pair"><button className="primary" onClick={()=>setView("lector")}>Continuar</button><button className="secondary" onClick={()=>setModal("return")}>Devolver</button></div></>:<p className="empty-note">Explora el estante y elige tu próxima lectura.</p>}<div className="leader-mini"><div className="section-title"><div><p className="eyebrow">ZONA DE LECTORES</p><h3>Quienes más han leído</h3></div><button onClick={()=>setView("comunidad")}>Ver todos →</button></div><div className="avatar-row">{people.map((p,i)=><button key={p.name} onClick={()=>setView("comunidad")}><span className="rank">{i+1}</span><Avatar name={p.name} color={p.color} small/></button>)}</div></div><button className="forum-card" onClick={()=>setView("foro")}><span>Conversaciones del club</span><b>Entrar al foro <i>↗</i></b></button></aside>
      <section className="shelf-area"><div className="welcome"><div><p className="eyebrow">{loggedIn?`HOLA, ${currentName.toUpperCase()}`:"CATÁLOGO MJVC MÉRIDA"}</p><h1>¿Qué historia te llama hoy?</h1></div><p>{filtered.length} títulos en el estante</p></div><div className="filters"><label className="search"><span>⌕</span><input value={search} onChange={e=>{setSearch(e.target.value);setShelfPage(0)}} placeholder="Busca por título o autor"/></label><label><span>Año</span><select value={year} onChange={e=>{setYear(e.target.value);setShelfPage(0)}}><option value="">Todos</option>{[...new Set(books.map(b=>b.year))].sort((a,b)=>b-a).map(y=><option key={y}>{y}</option>)}</select></label><label><span>Tipo</span><select value={type} onChange={e=>{setType(e.target.value);setShelfPage(0)}}><option value="">Todos</option>{[...new Set(books.map(b=>b.type))].map(t=><option key={t}>{t}</option>)}</select></label>{(search||year||type)&&<button className="clear" onClick={()=>{setSearch("");setYear("");setType("");setShelfPage(0)}}>Limpiar</button>}</div><div className="shelf-card"><div className="shelf-head"><span>COLECCIÓN GENERAL · A–Z</span><span>Estante {shelfPage+1} de {shelfCount}</span></div><div className="books">{visibleBooks.length===0?<p className="empty-note">La biblioteca está vacía. Los libros que agregues a D1 aparecerán aquí.</p>:visibleBooks.map(book=>{const match=filtered.includes(book),width=Math.max(36,Math.min(72,30+book.pages/12)),titleSize=Math.round(Math.max(8,Math.min(15,width/(Math.sqrt(book.title.length)*1.45)))*10)/10;return <button key={book.id} className={`book ${match?"match":"dim"} ${book.available<1?"borrowed":""}`} style={{width,background:book.color}} onMouseEnter={()=>setSelected(book)} onClick={()=>{setSelected(book);setModal("detail")}}><span style={{fontSize:titleSize}}>{book.title}</span><small>{book.author.split(" ").slice(-1)}</small>{book.available<1&&<i>•</i>}<div className="hover-cover" style={{background:book.cover}}><b>{book.title}</b><small>{book.author}</small></div></button>})}</div><div className="wood"/></div><div className="shelf-pagination" aria-label="Cambiar de estante"><button disabled={shelfPage===0} onClick={()=>setShelfPage(page=>Math.max(0,page-1))} aria-label="Estante anterior">←</button><span>{shelfPage+1} / {shelfCount}</span><button disabled={shelfPage>=shelfCount-1} onClick={()=>setShelfPage(page=>Math.min(shelfCount-1,page+1))} aria-label="Estante siguiente">→</button></div></section>
      <aside className="right-panel">{selected?<><p className="eyebrow">LIBRO SELECCIONADO</p><div className="mini-cover" style={{background:selected.cover}}><span>{selected.title}</span></div><p className={`status ${selected.available?"yes":"no"}`}>{selected.available?`${selected.available} ${selected.available===1?"ejemplar disponible":"ejemplares disponibles"}`:"En préstamo"}</p><h2>{selected.title}</h2><p>{selected.author} · {selected.year}</p><div className="rating"><Stars rating={selected.rating}/><b>{selected.rating}</b></div><p className="synopsis">{selected.synopsis}</p><div className="facts"><span><b>{selected.pages}</b> páginas</span><span><b>{selected.type}</b> tipo</span></div><button className="primary wide" onClick={takeBook} disabled={!selected.available}>{selected.available?"Tomar este libro":"No disponible"}</button></>:<><p className="eyebrow">BIBLIOTECA VACÍA</p><h2>Aún no hay libros</h2><p className="synopsis">Cuando el administrador agregue el primer libro, aparecerá aquí.</p></>}</aside>
    </div>}

    {view==="comunidad"&&<section className="page community"><div className="page-heading"><p className="eyebrow">ZONA DE LECTORES</p><h1>Una comunidad entre páginas</h1><p>Descubre qué se está leyendo ahora, celebra el avance de otros lectores y encuentra tu próxima conversación.</p></div><div className="pulse"><span className="live-dot"/><b>{people.length} {people.length===1?"lector registrado":"lectores registrados"}</b><span>·</span><span>{people.reduce((total,p)=>total+p.pages,0).toLocaleString("es-MX")} páginas acumuladas</span></div><div className="people-grid">{people.length===0?<p className="empty-note">Todavía no hay lectores registrados.</p>:people.map((p,i)=><article key={p.id} className="person"><div className="person-top"><span className="place">#{i+1}</span><span>{p.role==="admin"?"Admin":"Lector"}</span></div><Avatar name={p.name} color={p.color}/><h3>{p.name}</h3><p><b>{p.pages.toLocaleString("es-MX")}</b> páginas leídas</p><div className="reading-now"><span style={{background:p.now?books.find(b=>b.title===p.now)?.cover:"#ddd"}}/><div><small>LEYENDO AHORA</small><b>{p.now||"Sin lectura activa"}</b></div></div><div className="reactions">{[["❤️",12],["✨",8],["📚",5]].map(([emoji,count])=>{const emojiValue=String(emoji),key=`${p.name}-${emojiValue}`,active=profileReactions.includes(key),persisted=reactionCounts[reactionKey("profile",p.name,emojiValue)]||0,busy=reactionBusy.includes(reactionKey("profile",p.name,emojiValue));return <button key={key} className={active?"active":""} aria-pressed={active} disabled={busy} onClick={()=>toggleProfileReaction(p.name,emojiValue)}>{emojiValue} {Number(count)+persisted}</button>})}</div></article>)}</div></section>}

    {view==="foro"&&<section className="page forum"><div className="forum-hero"><div><p className="eyebrow">EL FORO</p><h1>Ideas que siguen creciendo</h1><p>Publica reflexiones sobre los libros de tu historial y participa en cualquier conversación.</p></div><button className="primary" onClick={()=>document.getElementById("composer")?.focus()}>Escribir una reflexión</button></div><div className="forum-layout"><div className="feed"><div className="composer"><Avatar name={currentName} color="#cf915f"/><div className="composer-body"><textarea id="composer" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="¿Qué idea se quedó contigo después de leer?"/><div><select value={postBook} onChange={e=>setPostBook(e.target.value)} aria-label="Libro leído relacionado" disabled={readBooks.length===0}>{readBooks.length===0?<option value="">Sin libros disponibles</option>:readBooks.map(b=><option key={b.id}>{b.title}</option>)}</select><small className="history-note">Solo libros de tu historial</small><button className="primary" onClick={publish} disabled={publishing||!currentUser}>{publishing?"Publicando…":currentUser?"Publicar":"Inicia sesión para publicar"}</button></div></div></div>{posts.map(post=><article className="post" key={post.id}><div className="post-author"><Avatar name={post.user} color={post.color}/><div><b>{post.user}</b><span>sobre <strong>{post.book}</strong></span></div><time>{post.time}</time></div><p>{post.text}</p><div className="post-actions"><button aria-pressed={liked.includes(post.id)} className={liked.includes(post.id)?"liked":""} disabled={reactionBusy.includes(reactionKey("post",post.id,"❤️"))} onClick={()=>toggleReaction("post",post.id,"❤️")}>{liked.includes(post.id)?"♥":"♡"} {post.likes+(reactionCounts[reactionKey("post",post.id,"❤️")]||0)}</button><button onClick={()=>setRepliesOpen(repliesOpen===post.id?null:post.id)}>↩ {post.replies} respuestas</button><button onClick={()=>flash("Enlace copiado")}>↗ Compartir</button></div>{repliesOpen===post.id&&<div className="reply-box"><Avatar name={currentName} color="#cf915f" small/><input value={replyDrafts[post.id]||""} onChange={e=>setReplyDrafts(current=>({...current,[post.id]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")submitReply(post.id)}} placeholder={`Responder a ${post.user}…`}/><button onClick={()=>submitReply(post.id)}>Responder</button></div>}</article>)}</div><aside className="forum-side"><h3>Lecturas que conversamos</h3>{books.slice(0,4).map((b,i)=><button key={b.id} onClick={()=>{setSelected(b);setView("biblioteca")}}><span style={{background:b.cover}}/><div><b>{b.title}</b><small>{18-i*3} reflexiones</small></div></button>)}<div className="prompt-card"><span>Pregunta de la semana</span><p>¿Qué personaje te enseñó algo sobre ti?</p><button onClick={()=>document.getElementById("composer")?.focus()}>Responder en el foro →</button></div></aside></div></section>}

    {view==="subir"&&currentUser?.role==="admin"&&<section className="page upload-page"><button className="back" onClick={()=>setView("biblioteca")}>← Volver al estante</button><div className="upload-wrap"><div className="upload-copy"><p className="eyebrow">SUMAR A LA COLECCIÓN</p><h1>Todo libro nuevo abre una puerta</h1><p>Sube el archivo completo. Extraeremos su texto para el visor y descartaremos el archivo original al terminar.</p><blockquote>“Una biblioteca no se hace; crece.”<span>— Augustine Birrell</span></blockquote></div><form className="book-form" onSubmit={e=>{e.preventDefault();if(!bookText){flash("Primero sube un archivo que podamos convertir a texto");return}flash("Libro convertido y enviado para revisión");setTimeout(()=>setView("biblioteca"),900)}}><div className="drop"><span>＋</span><b>Archivo completo del libro</b><small>PDF con texto seleccionable o TXT · máximo 25 MB</small><input required type="file" accept=".pdf,.txt,text/plain,application/pdf" aria-label="Archivo del libro" onChange={e=>handleBookFile(e.target.files?.[0])}/>{fileInfo&&<em className={bookText?"file-ready":"file-error"}>{fileInfo}</em>}</div><div className="field full"><label>Título</label><input required placeholder="Ej. El jardín secreto"/></div><div className="field"><label>Autor</label><input required placeholder="Nombre del autor"/></div><div className="field"><label>Año</label><input required type="number" placeholder="2024"/></div><div className="field"><label>Número de páginas</label><input required type="number" placeholder="120"/></div><div className="field"><label>Tipo</label><select required><option>Libro</option><option>Revista</option><option>Álbum ilustrado</option><option>Biografía</option><option>Otro</option></select></div><div className="field"><label>Ejemplares disponibles</label><input required type="number" defaultValue="1" min="1"/></div><div className="field full"><label>Sinopsis</label><textarea required placeholder="Cuéntanos de qué trata, sin revelar demasiado…"/></div><button className="primary submit">Convertir y enviar a la biblioteca</button></form></div></section>}

    {view==="lector"&&owned&&<section className="reader"><div className="reader-bar"><button onClick={()=>setView("biblioteca")}>← Cerrar lector</button><div><b>{owned.title}</b><span>{owned.author}</span></div><button onClick={()=>flash("Marcador guardado")}>🔖</button></div><div className="reader-page"><span className="chapter">CAPÍTULO 3</span><h1>La puerta escondida</h1><p className="dropcap">A</p><p>quella mañana el aire olía a tierra húmeda. Había llovido durante la noche y cada hoja sostenía una gota brillante, como si el jardín hubiera decidido guardar pequeños espejos.</p><p>Avanzó despacio por el sendero. Sabía que los lugares secretos no se encuentran con prisa: aparecen cuando uno aprende a mirar lo que los demás pasan por alto.</p><p>Al fondo, detrás de la hiedra, algo metálico reflejó la luz. Extendió la mano y apartó las ramas con cuidado.</p><blockquote>Entonces comprendió que algunas puertas no protegen lo que esconden; esperan a la persona correcta.</blockquote></div><div className="reader-controls"><button>‹</button><div><input type="range" min="1" max={owned.pages} defaultValue={Math.round(owned.pages*.36)}/><span>Página {Math.round(owned.pages*.36)} de {owned.pages}</span></div><button>›</button></div></section>}

    {modal==="detail"&&selected&&<div className="modal-back" onClick={()=>setModal(null)}><div className="book-modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setModal(null)}>×</button><div className="modal-cover" style={{background:selected.cover}}><span>{selected.title}</span><small>{selected.author}</small></div><div className="modal-copy"><p className="eyebrow">{selected.type.toUpperCase()}</p><h2>{selected.title}</h2><p className="by">{selected.author} · {selected.year}</p><div className="rating"><Stars rating={selected.rating}/><b>{selected.rating}</b><span>({selected.readers.length*8+7} lecturas)</span></div><p>{selected.synopsis}</p><div className="meta-row"><span><b>{selected.pages}</b> páginas</span><span><b>{selected.available}/{selected.copies}</b> disponibles</span></div><button className="primary wide" disabled={!selected.available} onClick={takeBook}>{selected.available?"Tomar este libro":"En préstamo"}</button></div></div></div>}
    {modal==="return"&&owned&&<div className="modal-back"><form className="return-modal" onSubmit={e=>{e.preventDefault();if(!returnRating){flash("Selecciona una calificación antes de devolver el libro");return}setOwned(null);setModal(null);setReturnRating(0);flash("Libro devuelto. ¡Gracias por dejar una huella!")}}><button type="button" className="close" onClick={()=>setModal(null)}>×</button><p className="eyebrow">ANTES DE DEVOLVERLO</p><h2>Deja una huella para quien sigue</h2><p>Tu respuesta ayudará a los próximos lectores de <b>{owned.title}</b>.</p><label>¿Qué cambió en el personaje principal?<textarea required placeholder="Escribe tu respuesta…"/></label><label>Propón una pregunta para futuros lectores<textarea required placeholder="¿Qué te gustaría preguntarles?"/></label><label>¿Cómo calificas esta lectura?<Stars rating={returnRating} onSelect={setReturnRating}/><small className="rating-help">{returnRating?`${returnRating} de 5 estrellas`:"Selecciona de 1 a 5 estrellas"}</small></label><button className="primary wide">Completar devolución</button></form></div>}
    {modal==="profile"&&currentUser&&<div className="modal-back" onClick={()=>setModal(null)}><form className="profile-modal" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();setModal(null)}}><button type="button" className="close" onClick={()=>setModal(null)}>×</button><Avatar name={currentName} color="#cf915f"/><label>Nombre<input value={currentUser.name} readOnly/></label><label>Correo electrónico<input value={currentUser.email} readOnly/></label><div className="stats"><span><b>{currentUser.role==="admin"?"Administrador":"Lector"}</b> rol</span><span><b>Sesión activa</b> cuenta</span></div><button className="secondary wide">Cerrar</button></form></div>}
    {authView&&<div className="modal-back" onClick={()=>setAuthView(null)}><form className="auth-modal" onClick={e=>e.stopPropagation()} onSubmit={submitAuth}><button type="button" className="close" onClick={()=>setAuthView(null)}>×</button><div className="auth-mark">B</div>{authView==="login"&&<><p className="eyebrow">ACCESO DE LECTORES</p><h2>Iniciar sesión</h2><p>Continúa con tus préstamos, lecturas y conversaciones.</p><label>Correo electrónico<input name="email" required type="email" placeholder="nombre@correo.com" autoComplete="email"/></label><label>Contraseña<input name="password" required type="password" placeholder="Tu contraseña" autoComplete="current-password"/></label><button className="forgot" type="button" onClick={()=>setAuthView("recover")}>Olvidé mi contraseña</button><button className="primary wide" disabled={authSubmitting}>{authSubmitting?"Entrando…":"Iniciar sesión"}</button><p className="auth-switch">¿Aún no tienes cuenta? <button type="button" onClick={()=>setAuthView("signup")}>Regístrate</button></p></>}{authView==="signup"&&<><p className="eyebrow">NUEVA CUENTA</p><h2>Crear una cuenta</h2><p>Regístrate para tomar libros y participar en la comunidad.</p><label>Nombre<input name="name" required minLength={2} maxLength={80} placeholder="Tu nombre" autoComplete="name"/></label><label>Correo electrónico<input name="email" required type="email" placeholder="nombre@correo.com" autoComplete="email"/></label><label>Contraseña<input name="password" required type="password" minLength={8} maxLength={128} placeholder="Mínimo 8 caracteres" autoComplete="new-password"/></label><label>Confirmar contraseña<input name="confirmPassword" required type="password" minLength={8} maxLength={128} placeholder="Repite tu contraseña" autoComplete="new-password"/></label><label>Código de administrador <small>opcional, solo para la configuración inicial</small><input name="adminCode" type="password" placeholder="Déjalo vacío si eres lector" autoComplete="off"/></label><button className="primary wide" disabled={authSubmitting}>{authSubmitting?"Creando…":"Crear cuenta"}</button><p className="auth-switch">¿Ya tienes cuenta? <button type="button" onClick={()=>setAuthView("login")}>Inicia sesión</button></p></>}{authView==="recover"&&<><p className="eyebrow">RECUPERAR ACCESO</p><h2>Recuperación de contraseña</h2><div className="recovery-success"><b>Recuperación por correo aún no configurada</b><p>Por ahora solicita al administrador que restablezca tu acceso. No enviaremos un correo ficticio.</p><button type="button" className="secondary wide" onClick={()=>setAuthView("login")}>Volver a iniciar sesión</button></div></>}</form></div>}
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>
}
