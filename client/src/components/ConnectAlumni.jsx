import { useState, useEffect, useRef, useCallback, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    UserPlus, Users, MessageSquare, ThumbsUp, Briefcase, MapPin, GraduationCap,
    Search, Send, X, Image, Bell, CheckCircle, Clock, Bookmark, Building,
    Repeat2, BookOpen, Home, ChevronDown, Globe, ArrowLeft, Sun, Moon, Filter, LogOut
} from 'lucide-react'
import axios from 'axios'
import { useAuth, ThemeContext } from '../App'

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'
const authH = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } })

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES  
   ═══════════════════════════════════════════════════════════════════════════ */
const LI_STYLES = `
.alumni-page {
  --c-blue: #0a66c2; --c-blue-h: #004182; --c-blue-l: #dce6f1;
  --c-green: #057642; --c-green-l: #e2f4e8;
  --c-bg: #f4f2ee; --c-card: #ffffff; --c-card-h: #f5f5f5;
  --c-bdr: #e0dfdc; --c-txt: #191919; --c-txt2: #666666; --c-txt3: #00000066;
  --c-overlay: rgba(0,0,0,0.7);
  --c-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 2px 3px rgba(0,0,0,0.05);
  --c-shadow-l: 0 4px 12px rgba(0,0,0,0.15);
  --radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--c-txt); background: var(--c-bg); min-height: 100vh;
}
[data-theme="dark"] .alumni-page {
  --c-blue: #70b5f9; --c-blue-h: #9cccfc; --c-blue-l: rgba(112,181,249,0.15);
  --c-green: #7fc15e; --c-green-l: rgba(127,193,94,0.15);
  --c-bg: #1b1f23; --c-card: #1d2226; --c-card-h: #272b30;
  --c-bdr: #38434f; --c-txt: #e8e6e3; --c-txt2: #b0b0b0; --c-txt3: rgba(255,255,255,0.45);
  --c-overlay: rgba(0,0,0,0.85);
  --c-shadow: 0 0 0 1px rgba(255,255,255,0.06);
  --c-shadow-l: 0 4px 12px rgba(0,0,0,0.4);
}
.alumni-page *{box-sizing:border-box}
.a-card{background:var(--c-card);border-radius:var(--radius);box-shadow:var(--c-shadow);overflow:hidden;transition:box-shadow 0.15s}
.a-card:hover{box-shadow:var(--c-shadow),0 1px 6px rgba(0,0,0,0.06)}
.a-btn{display:inline-flex;align-items:center;gap:6px;border-radius:20px;padding:6px 16px;font-weight:600;font-size:14px;cursor:pointer;transition:all 0.15s;border:none}
.a-btn-p{background:var(--c-blue);color:#fff}.a-btn-p:hover{background:var(--c-blue-h)}
[data-theme="dark"] .a-btn-p{color:#000}
.a-btn-p:disabled{opacity:0.5;cursor:not-allowed}
.a-btn-o{background:transparent;color:var(--c-blue);border:1.5px solid var(--c-blue)}.a-btn-o:hover{background:var(--c-blue-l);border-width:2px;padding:5.5px 15.5px}
.a-btn-g{background:transparent;color:var(--c-txt2);border:1.5px solid var(--c-bdr)}.a-btn-g:hover{background:var(--c-card-h);border-color:var(--c-txt2)}
.a-act{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 8px;border:none;background:none;cursor:pointer;border-radius:4px;font-size:13px;font-weight:600;color:var(--c-txt2);transition:all 0.12s}
.a-act:hover{background:var(--c-card-h);color:var(--c-txt)}.a-act.on{color:var(--c-blue)}
.a-tab{display:flex;align-items:center;gap:6px;padding:14px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--c-txt2);border-bottom:2px solid transparent;transition:all 0.15s;white-space:nowrap}
.a-tab:hover{color:var(--c-txt)}.a-tab.on{color:var(--c-green);border-bottom-color:var(--c-green)}
.a-skill{font-size:11px;padding:2px 8px;background:var(--c-blue-l);color:var(--c-blue);border-radius:20px;font-weight:500}
@keyframes aFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes aSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.a-spinner{width:24px;height:24px;border:3px solid var(--c-bdr);border-top-color:var(--c-blue);border-radius:50%;animation:aSpin 0.6s linear infinite}
@keyframes aSpin{to{transform:rotate(360deg)}}
.a-chat-msgs::-webkit-scrollbar{width:4px}.a-chat-msgs::-webkit-scrollbar-thumb{background:var(--c-bdr);border-radius:4px}

/* Responsive */
@media(max-width:1024px){
  .alumni-page .main-grid{flex-direction:column!important}
  .alumni-page .sidebar-l,.alumni-page .sidebar-r{width:100%!important;max-width:100%!important}
}
@media(max-width:640px){
  .alumni-page .nav-tabs{display:none!important}
  .alumni-page .mobile-tabs{display:flex!important}
}
`

const COVERS = [
    'linear-gradient(135deg, #1a6b4a 0%, #0a3d62 100%)',
    'linear-gradient(135deg, #0a3d62 0%, #003087 100%)',
    'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
    'linear-gradient(135deg, #1b5e20 0%, #33691e 100%)',
    'linear-gradient(135deg, #880e4f 0%, #4a148c 100%)',
    'linear-gradient(135deg, #4a148c 0%, #1a237e 100%)',
]
const REACTIONS = ['👍','❤️','👏','😂','😮','🎉']

/* ─── Helpers ─────────────────────────────────────────────── */
function ini(n=''){return n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
function clr(n=''){const c=['#0a66c2','#057642','#b24020','#5f4b8b','#c37d16','#0073b1','#e16b5c','#7fc15e'];let h=0;for(const x of n)h=(h*31+x.charCodeAt(0))%c.length;return c[Math.abs(h)]}
function cov(n=''){let h=0;for(const x of n)h=h*17+x.charCodeAt(0);return Math.abs(h)%COVERS.length}
function ago(d){const m=Math.floor((Date.now()-new Date(d).getTime())/60000);if(m<1)return'just now';if(m<60)return`${m}m`;const h=Math.floor(m/60);if(h<24)return`${h}h`;const dy=Math.floor(h/24);return dy<7?`${dy}d`:new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
function fmt(n){return n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'K':n?.toString()||'0'}

/* ─── Avatar ──────────────────────────────────────────────── */
function Av({name='',size=48,src,ring=false,style={}}){
    const bg=clr(name), i=ini(name), bs=ring?{border:'3px solid var(--c-card)',boxShadow:`0 0 0 2px ${bg}`}:{}
    if(src)return<img src={src} alt={name} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',...bs,...style}}/>
    return<div style={{width:size,height:size,borderRadius:'50%',background:bg,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:Math.max(size*.36,12),flexShrink:0,letterSpacing:.5,...bs,...style}}>{i}</div>
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROFILE CARD
   ═══════════════════════════════════════════════════════════════════════════ */
function ProfileCard({alumni:a, onConnect, onMessage, onWithdraw, loading}){
    return(
    <div className="a-card" style={{display:'flex',flexDirection:'column',animation:'aFadeIn 0.3s ease'}}>
        <div style={{height:56,background:COVERS[cov(a.name)],position:'relative'}}>
            <div style={{position:'absolute',bottom:-24,left:14}}><Av name={a.name} size={48} src={a.avatar} ring/></div>
        </div>
        <div style={{padding:'30px 14px 14px'}}>
            <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)',lineHeight:1.3}}>{a.name}</div>
            <div style={{fontSize:12,color:'var(--c-txt2)',marginTop:2,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.job_title}</div>
            <div style={{fontSize:11,color:'var(--c-txt3)',marginTop:3,display:'flex',alignItems:'center',gap:3,flexWrap:'wrap'}}>
                <Building size={10}/>{a.company}
                {a.location&&<><span>·</span><MapPin size={10}/>{a.location}</>}
            </div>
            {a.skills?.length>0&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:8}}>
                    {a.skills.slice(0,3).map(s=><span key={s} className="a-skill">{s}</span>)}
                    {a.skills.length>3&&<span style={{fontSize:11,color:'var(--c-txt3)'}}>+{a.skills.length-3}</span>}
                </div>
            )}
            <div style={{display:'flex',gap:6,marginTop:12}}>
                {a.connection_status==='connected'?(
                    <button className="a-btn a-btn-o" style={{flex:1,justifyContent:'center'}} onClick={()=>onMessage(a)}><MessageSquare size={14}/>Message</button>
                ):a.connection_status==='pending'?(
                    <button className="a-btn a-btn-g" style={{flex:1,justifyContent:'center'}} onClick={()=>onWithdraw(a.id)} disabled={loading}><Clock size={14}/>Pending</button>
                ):(
                    <button className="a-btn a-btn-p" style={{flex:1,justifyContent:'center'}} onClick={()=>onConnect(a.id)} disabled={loading}><UserPlus size={14}/>Connect</button>
                )}
            </div>
        </div>
    </div>
)}

/* ═══════════════════════════════════════════════════════════════════════════
   POST CARD
   ═══════════════════════════════════════════════════════════════════════════ */
function PostCard({post:p, onLike, currentUser}){
    const [showCmt,setShowCmt]=useState(false)
    const [cmtText,setCmtText]=useState('')
    const [cmts,setCmts]=useState([])
    const [ldCmt,setLdCmt]=useState(false)
    const [full,setFull]=useState(false)
    const [saved,setSaved]=useState(false)
    const [showRx,setShowRx]=useState(false)
    const rxT=useRef(null)
    const long=(p.content||'').length>250

    useEffect(()=>{
        if(showCmt&&cmts.length===0){
            setLdCmt(true)
            axios.get(`${API}/alumni/posts/${p.id}/comments`,authH()).then(r=>setCmts(r.data.comments||[])).catch(()=>{}).finally(()=>setLdCmt(false))
        }
    },[showCmt])

    const addCmt=async()=>{
        if(!cmtText.trim())return
        try{
            await axios.post(`${API}/alumni/posts/${p.id}/comment`,{text:cmtText.trim()},authH())
            setCmts(prev=>[...prev,{id:Date.now(),author_name:currentUser?.name||'You',text:cmtText.trim(),created_at:new Date().toISOString()}])
            setCmtText('')
        }catch{}
    }

    const rxOn=()=>{clearTimeout(rxT.current);setShowRx(true)}
    const rxOff=()=>{rxT.current=setTimeout(()=>setShowRx(false),400)}

    const typeMap={job:{lbl:'💼 Job Opportunity',bg:'var(--c-green-l)',c:'var(--c-green)'},insight:{lbl:'💡 Career Insight',bg:'var(--c-blue-l)',c:'var(--c-blue)'}}

    return(
    <div className="a-card" style={{marginBottom:8,animation:'aFadeIn 0.3s ease'}}>
        {p.type!=='update'&&typeMap[p.type]&&<div style={{padding:'6px 16px',fontSize:12,fontWeight:700,background:typeMap[p.type].bg,color:typeMap[p.type].c}}>{typeMap[p.type].lbl}</div>}
        <div style={{padding:'12px 16px'}}>
            <div style={{display:'flex',gap:10,marginBottom:10}}>
                <Av name={p.author_name} size={44}/>
                <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)'}}>{p.author_name}</div>
                    <div style={{fontSize:12,color:'var(--c-txt2)',lineHeight:1.3}}>{p.author_title} at {p.author_company}</div>
                    <div style={{fontSize:11,color:'var(--c-txt3)',display:'flex',alignItems:'center',gap:4,marginTop:1}}>{ago(p.created_at)} · <Globe size={10}/></div>
                </div>
                <button onClick={()=>setSaved(v=>!v)} style={{background:'none',border:'none',cursor:'pointer',padding:4,color:saved?'var(--c-blue)':'var(--c-txt3)'}}><Bookmark size={16} fill={saved?'currentColor':'none'}/></button>
            </div>
            <div style={{fontSize:14,color:'var(--c-txt)',lineHeight:1.6,whiteSpace:'pre-line',wordBreak:'break-word'}}>
                {long&&!full?p.content.slice(0,250)+'…':p.content}
                {long&&<button onClick={()=>setFull(v=>!v)} style={{background:'none',border:'none',color:'var(--c-txt2)',cursor:'pointer',fontSize:14,fontWeight:600,marginLeft:4}}>{full?'show less':'...see more'}</button>}
            </div>
            {p.tags?.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>{p.tags.map(t=><span key={t} style={{fontSize:13,color:'var(--c-blue)',fontWeight:600}}>#{t}</span>)}</div>}
            {/* Counts */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',marginTop:6,borderBottom:'1px solid var(--c-bdr)'}}>
                <div style={{display:'flex',alignItems:'center',gap:4,fontSize:13,color:'var(--c-txt2)'}}>
                    <span style={{fontSize:14}}>👍</span>{p.likes>10&&<span style={{fontSize:14}}>❤️</span>}
                    <span>{fmt(p.likes)}</span>
                </div>
                <span style={{fontSize:13,color:'var(--c-txt2)',cursor:'pointer'}} onClick={()=>setShowCmt(v=>!v)}>{p.comments} comments</span>
            </div>
            {/* Actions */}
            <div style={{display:'flex',margin:'2px 0',position:'relative'}}>
                {showRx&&(
                    <div onMouseEnter={rxOn} onMouseLeave={rxOff} style={{display:'flex',gap:2,position:'absolute',bottom:'100%',left:0,background:'var(--c-card)',borderRadius:28,padding:'5px 8px',boxShadow:'var(--c-shadow-l)',zIndex:100,animation:'aFadeIn 0.15s ease'}}>
                        {REACTIONS.map(r=><span key={r} onClick={()=>{onLike(p.id);setShowRx(false)}} style={{fontSize:22,cursor:'pointer',transition:'transform 0.12s',padding:'2px 3px'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.3) translateY(-4px)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>{r}</span>)}
                    </div>
                )}
                <button className={`a-act${p.liked_by_me?' on':''}`} onClick={()=>onLike(p.id)} onMouseEnter={rxOn} onMouseLeave={rxOff}>
                    <ThumbsUp size={16} fill={p.liked_by_me?'currentColor':'none'}/>{p.liked_by_me?'Liked':'Like'}
                </button>
                <button className={`a-act${showCmt?' on':''}`} onClick={()=>setShowCmt(v=>!v)}><MessageSquare size={16}/>Comment</button>
                <button className="a-act"><Repeat2 size={16}/>Repost</button>
                <button className="a-act"><Send size={16}/>Send</button>
            </div>
            {/* Comments section */}
            {showCmt&&(
                <div style={{paddingTop:8,borderTop:'1px solid var(--c-bdr)',animation:'aFadeIn 0.2s ease'}}>
                    <div style={{display:'flex',gap:8,marginBottom:10}}>
                        <Av name={currentUser?.name||'You'} size={32}/>
                        <div style={{flex:1,display:'flex',borderRadius:30,border:'1px solid var(--c-bdr)',overflow:'hidden',background:'var(--c-card-h)'}}>
                            <input value={cmtText} onChange={e=>setCmtText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCmt()}
                                placeholder="Add a comment…" style={{flex:1,padding:'8px 14px',border:'none',background:'transparent',color:'var(--c-txt)',fontSize:13,outline:'none'}}/>
                            {cmtText.trim()&&<button onClick={addCmt} style={{padding:'0 12px',border:'none',background:'none',cursor:'pointer',color:'var(--c-blue)'}}><Send size={14}/></button>}
                        </div>
                    </div>
                    {ldCmt&&<div style={{textAlign:'center',padding:8}}><div className="a-spinner" style={{margin:'0 auto'}}/></div>}
                    {cmts.map(c=>(
                        <div key={c.id} style={{display:'flex',gap:8,marginBottom:8,animation:'aFadeIn 0.2s ease'}}>
                            <Av name={c.author_name} size={28}/>
                            <div style={{background:'var(--c-card-h)',borderRadius:'0 8px 8px 8px',padding:'8px 12px',flex:1}}>
                                <div style={{fontWeight:700,fontSize:13,color:'var(--c-txt)'}}>{c.author_name}</div>
                                <div style={{fontSize:13,color:'var(--c-txt2)',marginTop:2}}>{c.text}</div>
                                <div style={{fontSize:10,color:'var(--c-txt3)',marginTop:3}}>{ago(c.created_at)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
)}

/* ═══════════════════════════════════════════════════════════════════════════
   CREATE POST MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
function CreatePostModal({user,onClose,onPost}){
    const [content,setContent]=useState('')
    const [postType,setPostType]=useState('update')
    const [posting,setPosting]=useState(false)
    const ref=useRef(null)
    useEffect(()=>{ref.current?.focus()},[])
    const submit=async()=>{
        if(!content.trim()||posting)return
        setPosting(true); await onPost({content,postType}); setPosting(false); onClose()
    }
    return(
    <div style={{position:'fixed',inset:0,background:'var(--c-overlay)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:10000,paddingTop:'10vh'}} onClick={onClose}>
        <div className="a-card" style={{width:'100%',maxWidth:540,maxHeight:'80vh',display:'flex',flexDirection:'column',animation:'aSlideUp 0.25s ease'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid var(--c-bdr)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <Av name={user?.name||'You'} size={44}/>
                    <div>
                        <div style={{fontWeight:700,fontSize:15,color:'var(--c-txt)'}}>{user?.name||'You'}</div>
                        <select value={postType} onChange={e=>setPostType(e.target.value)}
                            style={{fontSize:12,border:'1px solid var(--c-bdr)',borderRadius:4,padding:'2px 8px',background:'var(--c-card-h)',color:'var(--c-txt2)',cursor:'pointer',marginTop:2}}>
                            <option value="update">Post to anyone</option>
                            <option value="job">Job Opportunity</option>
                            <option value="insight">Career Insight</option>
                        </select>
                    </div>
                </div>
                <button onClick={onClose} style={{width:32,height:32,borderRadius:16,border:'none',background:'none',cursor:'pointer',color:'var(--c-txt2)',display:'flex',alignItems:'center',justifyContent:'center'}}><X size={20}/></button>
            </div>
            <div style={{flex:1,overflow:'auto',padding:'14px 20px'}}>
                <textarea ref={ref} value={content} onChange={e=>setContent(e.target.value)}
                    placeholder="What do you want to talk about?"
                    style={{width:'100%',minHeight:160,border:'none',background:'transparent',resize:'none',color:'var(--c-txt)',fontSize:15,outline:'none',lineHeight:1.6,fontFamily:'inherit'}}/>
            </div>
            <div style={{padding:'8px 16px 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',gap:2}}>
                    {[{icon:<Image size={18}/>,color:'#378fe9'},{icon:<Briefcase size={18}/>,color:'#c37d16'},{icon:<BookOpen size={18}/>,color:'#e16b5c'}].map((b,i)=>(
                        <button key={i} style={{width:36,height:36,borderRadius:18,border:'none',background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:b.color}}>{b.icon}</button>
                    ))}
                </div>
                <button className="a-btn a-btn-p" onClick={submit} disabled={!content.trim()||posting} style={{opacity:content.trim()?1:0.5,padding:'8px 20px'}}>
                    {posting?'Posting...':'Post'}
                </button>
            </div>
        </div>
    </div>
)}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAT WINDOW
   ═══════════════════════════════════════════════════════════════════════════ */
function ChatWindow({alumni:a,currentUser,onClose}){
    const [msgs,setMsgs]=useState([])
    const [input,setInput]=useState('')
    const [sending,setSending]=useState(false)
    const [ld,setLd]=useState(true)
    const btm=useRef(null)

    useEffect(()=>{
        setLd(true)
        axios.get(`${API}/alumni/messages/${a.id}`,authH()).then(r=>setMsgs(r.data.messages||[])).catch(()=>{}).finally(()=>setLd(false))
    },[a.id])

    useEffect(()=>{btm.current?.scrollIntoView({behavior:'smooth'})},[msgs])

    const send=async()=>{
        if(!input.trim()||sending)return
        const t=input.trim(); setInput(''); setSending(true)
        try{
            await axios.post(`${API}/alumni/messages`,{receiverId:a.id,text:t},authH())
            setMsgs(prev=>[...prev,{id:Date.now(),sender_id:currentUser?.id||'me',text:t,created_at:new Date().toISOString()}])
        }catch{}
        setSending(false)
    }

    const myId=currentUser?.id||'me'
    return(
    <div className="a-card" style={{position:'fixed',bottom:0,right:24,width:340,zIndex:9999,borderRadius:'8px 8px 0 0',boxShadow:'var(--c-shadow-l)',display:'flex',flexDirection:'column',maxHeight:460}}>
        <div style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid var(--c-bdr)',background:'var(--c-card)'}}>
            <div style={{position:'relative'}}>
                <Av name={a.name} size={34}/>
                <div style={{position:'absolute',bottom:0,right:0,width:10,height:10,borderRadius:5,background:'#057642',border:'2px solid var(--c-card)'}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                <div style={{fontSize:11,color:'var(--c-txt3)'}}>{a.job_title}</div>
            </div>
            <button onClick={onClose} style={{width:28,height:28,borderRadius:14,border:'none',background:'none',cursor:'pointer',color:'var(--c-txt2)',display:'flex',alignItems:'center',justifyContent:'center'}}><X size={16}/></button>
        </div>
        <div className="a-chat-msgs" style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:6,minHeight:220,maxHeight:340}}>
            {ld&&<div style={{textAlign:'center',padding:20}}><div className="a-spinner" style={{margin:'0 auto'}}/></div>}
            {!ld&&msgs.length===0&&<div style={{textAlign:'center',padding:20,fontSize:13,color:'var(--c-txt3)'}}>Start a conversation with {a.name}!</div>}
            {msgs.map(m=>(
                <div key={m.id} style={{display:'flex',flexDirection:m.sender_id===myId?'row-reverse':'row',alignItems:'flex-end',gap:6}}>
                    {m.sender_id!==myId&&<Av name={a.name} size={24}/>}
                    <div style={{
                        maxWidth:'72%',padding:'8px 12px',
                        borderRadius:m.sender_id===myId?'14px 14px 2px 14px':'14px 14px 14px 2px',
                        background:m.sender_id===myId?'var(--c-blue)':'var(--c-card-h)',
                        color:m.sender_id===myId?'#fff':'var(--c-txt)',fontSize:13,lineHeight:1.45
                    }}>
                        {m.text}
                        <div style={{fontSize:10,marginTop:2,textAlign:'right',opacity:0.6}}>{ago(m.created_at)}</div>
                    </div>
                </div>
            ))}
            <div ref={btm}/>
        </div>
        <div style={{padding:10,borderTop:'1px solid var(--c-bdr)',display:'flex',gap:6,alignItems:'center'}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}
                placeholder="Write a message…"
                style={{flex:1,padding:'8px 14px',border:'1px solid var(--c-bdr)',borderRadius:20,background:'var(--c-card-h)',color:'var(--c-txt)',fontSize:13,outline:'none'}}/>
            <button onClick={send} disabled={!input.trim()||sending}
                style={{width:32,height:32,borderRadius:16,border:'none',background:input.trim()?'var(--c-blue)':'transparent',color:input.trim()?'#fff':'var(--c-txt3)',cursor:input.trim()?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}>
                <Send size={14}/>
            </button>
        </div>
    </div>
)}

/* ═══════════════════════════════════════════════════════════════════════════
   TRENDING SECTION (right sidebar filler)
   ═══════════════════════════════════════════════════════════════════════════ */
function TrendingSidebar(){
    const trends=[
        {tag:'TechCareers',posts:'2,450'},
        {tag:'AlumniNetwork',posts:'1,890'},
        {tag:'CampusToCorperate',posts:'980'},
        {tag:'InterviewPrep',posts:'3,200'},
        {tag:'RemoteWork',posts:'1,560'},
    ]
    return(
    <div className="a-card" style={{padding:16}}>
        <div style={{fontWeight:700,fontSize:15,color:'var(--c-txt)',marginBottom:12}}>Trending in Alumni</div>
        {trends.map((t,i)=>(
            <div key={t.tag} style={{padding:'10px 0',borderTop:i?'1px solid var(--c-bdr)':'none',cursor:'pointer'}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--c-blue)'}}>#{t.tag}</div>
                <div style={{fontSize:11,color:'var(--c-txt3)',marginTop:2}}>{t.posts} posts</div>
            </div>
        ))}
    </div>
)}

/* Quick Stats for sidebar */
function QuickStats({alumni,connectedCount}){
    const companies=[...new Set(alumni.map(a=>a.company).filter(Boolean))]
    return(
    <div className="a-card" style={{padding:16,marginTop:8}}>
        <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)',marginBottom:12}}>Network Stats</div>
        {[
            {lbl:'Total Alumni',val:alumni.length,icon:<Users size={14}/>},
            {lbl:'Companies',val:companies.length,icon:<Building size={14}/>},
            {lbl:'Your Connections',val:connectedCount,icon:<UserPlus size={14}/>},
        ].map(s=>(
            <div key={s.lbl} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid var(--c-bdr)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--c-txt2)'}}>{s.icon}{s.lbl}</div>
                <div style={{fontWeight:700,fontSize:14,color:'var(--c-blue)'}}>{s.val}</div>
            </div>
        ))}
    </div>
)}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function ConnectAlumni(){
    const {user,logout}=useAuth()
    const {theme,toggleTheme}=useContext(ThemeContext)
    const navigate=useNavigate()
    const [tab,setTab]=useState('feed')

    const [alumni,setAlumni]=useState([])
    const [posts,setPosts]=useState([])
    const [requests,setReqs]=useState([])
    const [ldA,setLdA]=useState(true)
    const [ldP,setLdP]=useState(true)
    const [ldR,setLdR]=useState(true)

    const [search,setSearch]=useState('')
    const [fSkill,setFSkill]=useState('')
    const [fBatch,setFBatch]=useState('')
    const [fComp,setFComp]=useState('')
    const [showPost,setShowPost]=useState(false)
    const [chatWith,setChatWith]=useState(null)
    const [notif,setNotif]=useState(null)
    const [actLd,setActLd]=useState(false)

    const toast=useCallback((msg,type='success')=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3000)},[])

    // Fetch
    const fetchAlumni=useCallback(async()=>{
        setLdA(true)
        try{const r=await axios.get(`${API}/alumni`,authH());setAlumni(r.data.alumni||[])}catch{setAlumni([])}
        setLdA(false)
    },[])
    const fetchPosts=useCallback(async()=>{
        setLdP(true)
        try{const r=await axios.get(`${API}/alumni/posts`,authH());setPosts((r.data.posts||[]).map(p=>({...p,reaction:null})))}catch{setPosts([])}
        setLdP(false)
    },[])
    const fetchReqs=useCallback(async()=>{
        setLdR(true)
        try{const r=await axios.get(`${API}/alumni/requests`,authH());setReqs(r.data.requests||[])}catch{setReqs([])}
        setLdR(false)
    },[])
    useEffect(()=>{fetchAlumni();fetchPosts();fetchReqs()},[])

    // Actions
    const doConnect=async(tid)=>{
        setActLd(true)
        try{await axios.post(`${API}/alumni/connect`,{targetId:tid},authH());setAlumni(p=>p.map(a=>a.id===tid?{...a,connection_status:'pending'}:a));toast('Connection request sent!')}
        catch(e){toast(e.response?.data?.error||'Failed','error')}
        setActLd(false)
    }
    const doWithdraw=async(tid)=>{
        setActLd(true)
        try{await axios.delete(`${API}/alumni/connect/withdraw/${tid}`,authH());setAlumni(p=>p.map(a=>a.id===tid?{...a,connection_status:'none'}:a));toast('Request withdrawn','info')}
        catch{toast('Failed','error')}
        setActLd(false)
    }
    const doAccept=async(req)=>{
        setActLd(true)
        try{await axios.put(`${API}/alumni/connect/${req.id}/accept`,{},authH());setReqs(p=>p.filter(r=>r.id!==req.id));setAlumni(p=>p.map(a=>a.id===req.from_id?{...a,connection_status:'connected'}:a));toast(`Connected with ${req.from_name}!`)}
        catch{toast('Failed','error')}
        setActLd(false)
    }
    const doDecline=async(id)=>{try{await axios.delete(`${API}/alumni/connect/${id}`,authH());setReqs(p=>p.filter(r=>r.id!==id))}catch{}}
    const doLike=async(pid)=>{
        setPosts(p=>p.map(x=>x.id===pid?{...x,liked_by_me:!x.liked_by_me,likes:x.liked_by_me?x.likes-1:x.likes+1}:x))
        try{await axios.post(`${API}/alumni/posts/${pid}/like`,{},authH())}catch{
            setPosts(p=>p.map(x=>x.id===pid?{...x,liked_by_me:!x.liked_by_me,likes:x.liked_by_me?x.likes-1:x.likes+1}:x))
        }
    }
    const doPost=async({content,postType})=>{
        try{await axios.post(`${API}/alumni/posts`,{content,type:postType,tags:[]},authH());fetchPosts();toast('Post published!')}
        catch{toast('Failed to create post','error')}
    }
    const doMessage=(a)=>{if(a.connection_status!=='connected'){toast('Connect first to message','warning');return};setChatWith(a)}
    const goBack=()=>navigate('/student')
    const doLogout=()=>{logout()}

    // Derived
    const connected=alumni.filter(a=>a.connection_status==='connected')
    const allSkills=[...new Set(alumni.flatMap(a=>a.skills||[]))]
    const allBatches=[...new Set(alumni.map(a=>a.batch_year).filter(Boolean))].sort((a,b)=>b-a)
    const allComps=[...new Set(alumni.map(a=>a.company).filter(Boolean))]
    const filtered=alumni.filter(a=>{
        const q=search.toLowerCase()
        return(!q||a.name.toLowerCase().includes(q)||a.company.toLowerCase().includes(q)||(a.skills||[]).some(s=>s.toLowerCase().includes(q)))
            &&(!fSkill||(a.skills||[]).includes(fSkill))&&(!fBatch||a.batch_year===parseInt(fBatch))&&(!fComp||a.company===fComp)
    })

    const TABS=[
        {id:'feed',label:'Home',icon:<Home size={16}/>},
        {id:'directory',label:'People',icon:<Users size={16}/>,count:alumni.length},
        {id:'network',label:'My Network',icon:<UserPlus size={16}/>,count:connected.length},
        {id:'requests',label:'Invitations',icon:<Bell size={16}/>,count:requests.length},
    ]

    return(
    <div className="alumni-page">
        <style>{LI_STYLES}</style>

        {/* Toast notification */}
        {notif&&<div style={{position:'fixed',top:76,right:20,zIndex:11000,padding:'10px 20px',borderRadius:6,
            background:notif.type==='success'?'var(--c-green)':notif.type==='warning'?'#c37d16':notif.type==='error'?'#cc1016':'#666',
            color:'#fff',fontWeight:600,fontSize:14,boxShadow:'var(--c-shadow-l)',animation:'aFadeIn 0.25s ease'}}>{notif.msg}</div>}

        {/* ═══ TOP NAV ═══ */}
        <div className="a-card" style={{borderRadius:0,position:'sticky',top:0,zIndex:1000}}>
            <div style={{maxWidth:1128,margin:'0 auto',display:'flex',alignItems:'center',padding:'0 16px',gap:8}}>
                <button onClick={goBack} title="Back to Mentor Hub"
                    style={{width:34,height:34,borderRadius:17,border:'none',background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--c-txt2)',transition:'all 0.15s',flexShrink:0}}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--c-card-h)';e.currentTarget.style.color='var(--c-txt)'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='var(--c-txt2)'}}>
                    <ArrowLeft size={18}/>
                </button>
                <div style={{display:'flex',alignItems:'center',gap:8,paddingRight:12}}>
                    <div style={{width:30,height:30,borderRadius:4,background:'var(--c-blue)',display:'flex',alignItems:'center',justifyContent:'center'}}><GraduationCap size={16} color="#fff"/></div>
                    <span style={{fontWeight:800,fontSize:15,color:'var(--c-txt)',letterSpacing:-0.3}}>Alumni</span>
                </div>
                <div style={{position:'relative',flex:'0 1 260px',marginRight:'auto'}}>
                    <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--c-txt3)'}}/>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search alumni, skills, companies..."
                        style={{width:'100%',padding:'7px 12px 7px 30px',border:'none',borderRadius:4,background:'var(--c-blue-l)',color:'var(--c-txt)',fontSize:13,outline:'none'}}/>
                </div>
                <div className="nav-tabs" style={{display:'flex'}}>
                    {TABS.map(t=>(
                        <button key={t.id} className={`a-tab${tab===t.id?' on':''}`} onClick={()=>setTab(t.id)}>
                            <div style={{position:'relative'}}>
                                {t.icon}
                                {t.count>0&&t.id==='requests'&&<span style={{position:'absolute',top:-6,right:-8,width:15,height:15,borderRadius:8,background:'#cc1016',color:'#fff',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{t.count}</span>}
                            </div>
                            <span>{t.label}</span>
                        </button>
                    ))}
                </div>
                {/* Theme toggle */}
                <button onClick={toggleTheme} title={theme==='light'?'Switch to dark mode':'Switch to light mode'}
                    style={{width:34,height:34,borderRadius:17,border:'1px solid var(--c-bdr)',background:'var(--c-card-h)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--c-txt2)',transition:'all 0.2s',marginLeft:4}}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--c-blue-l)';e.currentTarget.style.color='var(--c-blue)'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='var(--c-card-h)';e.currentTarget.style.color='var(--c-txt2)'}}>
                    {theme==='light'?<Moon size={16}/>:<Sun size={16}/>}
                </button>
                {/* Logout */}
                <button onClick={doLogout} title="Logout"
                    style={{width:34,height:34,borderRadius:17,border:'1px solid var(--c-bdr)',background:'var(--c-card-h)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--c-txt2)',transition:'all 0.2s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='rgba(204,16,22,0.12)';e.currentTarget.style.color='#cc1016'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='var(--c-card-h)';e.currentTarget.style.color='var(--c-txt2)'}}>
                    <LogOut size={16}/>
                </button>
                <Av name={user?.name||'You'} size={30}/>
            </div>
        </div>

        {/* Mobile tabs */}
        <div className="mobile-tabs" style={{display:'none',overflowX:'auto',background:'var(--c-card)',borderBottom:'1px solid var(--c-bdr)'}}>
            {TABS.map(t=>(<button key={t.id} className={`a-tab${tab===t.id?' on':''}`} onClick={()=>setTab(t.id)} style={{flex:1,justifyContent:'center'}}>{t.icon}<span>{t.label}</span></button>))}
        </div>

        {/* ═══ CONTENT ═══ */}
        <div className="main-grid" style={{maxWidth:1128,margin:'0 auto',padding:'20px 16px',display:'flex',gap:20}}>

            {/* ─── FEED ─── */}
            {tab==='feed'&&<>
                <div className="sidebar-l" style={{width:220,flexShrink:0}}>
                    <div className="a-card" style={{textAlign:'center'}}>
                        <div style={{height:52,background:COVERS[0]}}/>
                        <div style={{marginTop:-24,padding:'0 14px 14px'}}>
                            <Av name={user?.name||'You'} size={48} ring style={{margin:'0 auto'}}/>
                            <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)',marginTop:6}}>{user?.name||'Student'}</div>
                            <div style={{fontSize:12,color:'var(--c-txt2)',marginTop:2}}>{user?.role==='alumni'?'Alumni':'Student'} at AI Mentor Hub</div>
                            <div style={{borderTop:'1px solid var(--c-bdr)',marginTop:10,paddingTop:10}}>
                                {[['Connections',connected.length],['Alumni',alumni.length]].map(([l,v])=>(
                                    <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--c-txt2)',marginBottom:4}}>
                                        <span>{l}</span><span style={{fontWeight:700,color:'var(--c-blue)'}}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <QuickStats alumni={alumni} connectedCount={connected.length}/>
                </div>

                <div style={{flex:1,minWidth:0}}>
                    <div className="a-card" style={{padding:14,marginBottom:8}}>
                        <div style={{display:'flex',gap:10,alignItems:'center'}}>
                            <Av name={user?.name||'You'} size={44}/>
                            <button onClick={()=>setShowPost(true)} style={{flex:1,textAlign:'left',padding:'10px 16px',border:'1px solid var(--c-bdr)',borderRadius:35,background:'none',color:'var(--c-txt2)',cursor:'pointer',fontSize:14,transition:'background 0.12s'}}
                                onMouseEnter={e=>e.currentTarget.style.background='var(--c-card-h)'}
                                onMouseLeave={e=>e.currentTarget.style.background='none'}>Start a post</button>
                        </div>
                        <div style={{display:'flex',gap:2,marginTop:8}}>
                            {[{icon:<Image size={18} color="#378fe9"/>,l:'Media'},{icon:<Briefcase size={18} color="#c37d16"/>,l:'Job'},{icon:<BookOpen size={18} color="#e16b5c"/>,l:'Article'}].map(b=>(
                                <button key={b.l} onClick={()=>setShowPost(true)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 6px',border:'none',background:'none',cursor:'pointer',borderRadius:4,fontSize:13,fontWeight:600,color:'var(--c-txt2)'}}
                                    onMouseEnter={e=>e.currentTarget.style.background='var(--c-card-h)'}
                                    onMouseLeave={e=>e.currentTarget.style.background='none'}>{b.icon}{b.l}</button>
                            ))}
                        </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',fontSize:12,color:'var(--c-txt3)'}}>
                        <div style={{flex:1,height:1,background:'var(--c-bdr)'}}/> Sort by: <span style={{fontWeight:700,color:'var(--c-txt2)',cursor:'pointer'}}>Top <ChevronDown size={12} style={{verticalAlign:'middle'}}/></span>
                    </div>
                    {ldP?<div style={{textAlign:'center',padding:40}}><div className="a-spinner" style={{margin:'0 auto',width:28,height:28}}/></div>
                    :posts.length===0?<div className="a-card" style={{textAlign:'center',padding:'40px 24px'}}>
                        <BookOpen size={40} style={{color:'var(--c-txt3)',opacity:.3,marginBottom:10}}/> 
                        <div style={{fontSize:16,fontWeight:600,color:'var(--c-txt)'}}>No posts yet</div>
                        <div style={{fontSize:14,color:'var(--c-txt2)',marginTop:4}}>Be the first to share something!</div>
                        <button className="a-btn a-btn-p" style={{marginTop:14}} onClick={()=>setShowPost(true)}>Create Post</button>
                    </div>
                    :posts.map(p=><PostCard key={p.id} post={p} onLike={doLike} currentUser={user}/>)}
                </div>

                <div className="sidebar-r" style={{width:300,flexShrink:0}}>
                    <div className="a-card" style={{padding:16}}>
                        <div style={{fontWeight:700,fontSize:15,color:'var(--c-txt)',marginBottom:12}}>Add to your network</div>
                        {ldA?<div style={{textAlign:'center',padding:16}}><div className="a-spinner" style={{margin:'0 auto'}}/></div>
                        :alumni.filter(a=>a.connection_status==='none').length===0?
                            <div style={{textAlign:'center',padding:'16px 8px',color:'var(--c-txt2)',fontSize:13}}>
                                <Users size={28} style={{color:'var(--c-txt3)',opacity:.4,marginBottom:6,display:'block',margin:'0 auto 6px'}}/>
                                You've connected with everyone!
                            </div>
                        :alumni.filter(a=>a.connection_status==='none').slice(0,5).map((a,i)=>(
                            <div key={a.id} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'10px 0',borderTop:i?'1px solid var(--c-bdr)':'none'}}>
                                <Av name={a.name} size={44}/>
                                <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontWeight:700,fontSize:13,color:'var(--c-txt)'}}>{a.name}</div>
                                    <div style={{fontSize:12,color:'var(--c-txt2)',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.job_title} at {a.company}</div>
                                    {a.mutual_connections>0&&<div style={{fontSize:11,color:'var(--c-txt3)',marginTop:1}}>{a.mutual_connections} mutual</div>}
                                    <button className="a-btn a-btn-o" style={{marginTop:6,padding:'3px 12px',fontSize:12}} onClick={()=>doConnect(a.id)} disabled={actLd}><UserPlus size={12}/>Connect</button>
                                </div>
                            </div>
                        ))}
                        {alumni.filter(a=>a.connection_status==='none').length>5&&
                            <button onClick={()=>setTab('directory')} style={{width:'100%',padding:8,border:'none',background:'none',color:'var(--c-blue)',cursor:'pointer',fontWeight:600,fontSize:13,marginTop:6}}>View all →</button>}
                    </div>
                    <div style={{marginTop:8}}><TrendingSidebar/></div>
                </div>
            </>}

            {/* ─── DIRECTORY ─── */}
            {tab==='directory'&&<div style={{flex:1}}>
                <div className="a-card" style={{padding:'14px 18px',marginBottom:14,display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
                    <Filter size={15} style={{color:'var(--c-txt2)'}}/>
                    {[
                        {v:fSkill,set:setFSkill,opts:allSkills,lbl:'All Skills'},
                        {v:fBatch,set:setFBatch,opts:allBatches.map(String),lbl:'All Batches',fmt:v=>`Batch ${v}`},
                        {v:fComp,set:setFComp,opts:allComps,lbl:'All Companies'},
                    ].map(f=>(
                        <select key={f.lbl} value={f.v} onChange={e=>f.set(e.target.value)}
                            style={{padding:'5px 10px',border:'1px solid var(--c-bdr)',borderRadius:20,background:'var(--c-card)',color:'var(--c-txt)',fontSize:12,fontWeight:600}}>
                            <option value="">{f.lbl}</option>
                            {f.opts.map(o=><option key={o} value={o}>{f.fmt?f.fmt(o):o}</option>)}
                        </select>
                    ))}
                    {(fSkill||fBatch||fComp||search)&&<button className="a-btn a-btn-g" style={{fontSize:11,padding:'3px 10px'}} onClick={()=>{setFSkill('');setFBatch('');setFComp('');setSearch('')}}><X size={12}/>Clear</button>}
                    <span style={{marginLeft:'auto',fontSize:12,color:'var(--c-txt3)'}}>{filtered.length} results</span>
                </div>
                {ldA?<div style={{textAlign:'center',padding:40}}><div className="a-spinner" style={{margin:'0 auto',width:28,height:28}}/></div>
                :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))',gap:10}}>
                    {filtered.map(a=><ProfileCard key={a.id} alumni={a} onConnect={doConnect} onMessage={doMessage} onWithdraw={doWithdraw} loading={actLd}/>)}
                </div>}
                {!ldA&&filtered.length===0&&<div className="a-card" style={{textAlign:'center',padding:'40px 24px'}}>
                    <Search size={40} style={{color:'var(--c-txt3)',opacity:.4,marginBottom:10}}/>
                    <div style={{fontSize:16,fontWeight:600,color:'var(--c-txt)'}}>No results found</div>
                    <div style={{fontSize:14,color:'var(--c-txt2)',marginTop:4}}>Try adjusting your search or filters</div>
                </div>}
            </div>}

            {/* ─── MY NETWORK ─── */}
            {tab==='network'&&<div style={{flex:1}}>
                {ldA?<div style={{textAlign:'center',padding:40}}><div className="a-spinner" style={{margin:'0 auto',width:28,height:28}}/></div>
                :connected.length===0&&alumni.filter(a=>a.connection_status==='pending').length===0?
                    <div className="a-card" style={{textAlign:'center',padding:'48px 24px'}}>
                        <Users size={48} style={{color:'var(--c-txt3)',opacity:.3,marginBottom:14}}/>
                        <div style={{fontSize:18,fontWeight:700,color:'var(--c-txt)'}}>No connections yet</div>
                        <div style={{fontSize:14,color:'var(--c-txt2)',marginTop:6,maxWidth:380,margin:'6px auto 18px'}}>Build your alumni network for career opportunities, referrals, and mentorship.</div>
                        <button className="a-btn a-btn-p" style={{padding:'10px 24px'}} onClick={()=>setTab('directory')}>Find Alumni</button>
                    </div>
                :<>
                    {connected.length>0&&<>
                        <div className="a-card" style={{padding:'16px 20px',marginBottom:8}}>
                            <div style={{fontSize:16,fontWeight:700,color:'var(--c-txt)'}}>{connected.length} Connection{connected.length!==1?'s':''}</div>
                        </div>
                        {connected.map(a=>(
                            <div key={a.id} className="a-card" style={{display:'flex',gap:12,alignItems:'center',padding:'12px 20px',marginBottom:4,animation:'aFadeIn 0.3s ease'}}>
                                <Av name={a.name} size={50}/>
                                <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)'}}>{a.name}</div>
                                    <div style={{fontSize:13,color:'var(--c-txt2)'}}>{a.job_title} at {a.company}</div>
                                    <div style={{fontSize:11,color:'var(--c-txt3)',display:'flex',alignItems:'center',gap:4,marginTop:2}}>
                                        {a.location&&<><MapPin size={10}/>{a.location} · </>}<GraduationCap size={10}/>Batch {a.batch_year}
                                    </div>
                                </div>
                                <button className="a-btn a-btn-o" onClick={()=>doMessage(a)}><MessageSquare size={14}/>Message</button>
                            </div>
                        ))}
                    </>}
                    {alumni.filter(a=>a.connection_status==='pending').length>0&&<div style={{marginTop:16}}>
                        <div className="a-card" style={{padding:'14px 20px',marginBottom:4}}>
                            <div style={{fontSize:14,fontWeight:700,color:'var(--c-txt)',display:'flex',alignItems:'center',gap:8}}><Clock size={15}/>Sent Invitations</div>
                        </div>
                        {alumni.filter(a=>a.connection_status==='pending').map(a=>(
                            <div key={a.id} className="a-card" style={{display:'flex',gap:10,alignItems:'center',padding:'12px 20px',marginBottom:4}}>
                                <Av name={a.name} size={42}/>
                                <div style={{flex:1}}>
                                    <div style={{fontWeight:600,fontSize:13,color:'var(--c-txt)'}}>{a.name}</div>
                                    <div style={{fontSize:12,color:'var(--c-txt2)'}}>{a.job_title} at {a.company}</div>
                                </div>
                                <button className="a-btn a-btn-g" style={{fontSize:12}} onClick={()=>doWithdraw(a.id)} disabled={actLd}>Withdraw</button>
                            </div>
                        ))}
                    </div>}
                </>}
            </div>}

            {/* ─── REQUESTS ─── */}
            {tab==='requests'&&<div style={{flex:1}}>
                <div className="a-card" style={{padding:'16px 20px',marginBottom:8}}>
                    <div style={{fontSize:16,fontWeight:700,color:'var(--c-txt)'}}>Invitations ({requests.length})</div>
                </div>
                {ldR?<div style={{textAlign:'center',padding:40}}><div className="a-spinner" style={{margin:'0 auto',width:28,height:28}}/></div>
                :requests.length===0?<div className="a-card" style={{textAlign:'center',padding:'48px 24px'}}>
                    <Bell size={48} style={{color:'var(--c-txt3)',opacity:.3,marginBottom:14}}/>
                    <div style={{fontSize:16,fontWeight:600,color:'var(--c-txt)'}}>No pending invitations</div>
                    <div style={{fontSize:14,color:'var(--c-txt2)',marginTop:4}}>Invitations from alumni will appear here</div>
                </div>
                :requests.map(req=>(
                    <div key={req.id} className="a-card" style={{display:'flex',gap:12,padding:'14px 20px',marginBottom:4,animation:'aFadeIn 0.3s ease'}}>
                        <Av name={req.from_name} size={50}/>
                        <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)'}}>{req.from_name}</div>
                            <div style={{fontSize:13,color:'var(--c-txt2)'}}>{req.from_title} at {req.from_company}</div>
                            {req.from_bio&&<div style={{fontSize:13,color:'var(--c-txt2)',marginTop:6,padding:'6px 10px',background:'var(--c-card-h)',borderRadius:6,fontStyle:'italic',borderLeft:'3px solid var(--c-blue)'}}>"{req.from_bio}"</div>}
                            <div style={{fontSize:11,color:'var(--c-txt3)',marginTop:4}}>{ago(req.created_at)}</div>
                            <div style={{display:'flex',gap:8,marginTop:10}}>
                                <button className="a-btn a-btn-g" onClick={()=>doDecline(req.id)}>Ignore</button>
                                <button className="a-btn a-btn-p" onClick={()=>doAccept(req)} disabled={actLd}><CheckCircle size={14}/>Accept</button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>}
        </div>

        {showPost&&<CreatePostModal user={user} onClose={()=>setShowPost(false)} onPost={doPost}/>}
        {chatWith&&<ChatWindow alumni={chatWith} currentUser={user} onClose={()=>setChatWith(null)}/>}
    </div>
    )
}
