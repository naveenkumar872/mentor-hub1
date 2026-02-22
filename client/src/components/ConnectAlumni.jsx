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
.a-act{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:10px 6px;border:none;background:none;cursor:pointer;border-radius:4px;font-size:13px;font-weight:600;color:var(--c-txt2);transition:all 0.12s}
.a-act:hover{background:var(--c-card-h);color:var(--c-txt)}.a-act.on{color:var(--c-blue)}
.a-tab{display:flex;align-items:center;gap:6px;padding:14px 14px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--c-txt2);border-bottom:2px solid transparent;transition:all 0.15s;white-space:nowrap}
.a-tab:hover{color:var(--c-txt)}.a-tab.on{color:var(--c-green);border-bottom-color:var(--c-green)}
.a-skill{font-size:11px;padding:2px 8px;background:var(--c-blue-l);color:var(--c-blue);border-radius:20px;font-weight:500}
@keyframes aFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes aSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.a-spinner{width:24px;height:24px;border:3px solid var(--c-bdr);border-top-color:var(--c-blue);border-radius:50%;animation:aSpin 0.6s linear infinite}
@keyframes aSpin{to{transform:rotate(360deg)}}
.a-chat-msgs::-webkit-scrollbar{width:4px}.a-chat-msgs::-webkit-scrollbar-thumb{background:var(--c-bdr);border-radius:4px}
.conv-item{display:flex;gap:10px;padding:10px 14px;cursor:pointer;transition:background 0.12s;border-left:3px solid transparent}
.conv-item:hover{background:var(--c-card-h)}
.conv-item.active{background:var(--c-blue-l);border-left-color:var(--c-blue)}
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
function Av({name='',size=48,src,ring=false,online=false,style={}}){
    const bg=clr(name),i=ini(name),bs=ring?{border:'3px solid var(--c-card)',boxShadow:`0 0 0 2px ${bg}`}:{}
    const el=src
        ?<img src={src} alt={name} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',...bs,...style}}/>
        :<div style={{width:size,height:size,borderRadius:'50%',background:bg,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:Math.max(size*.36,12),flexShrink:0,letterSpacing:.5,...bs,...style}}>{i}</div>
    if(!online)return el
    return<div style={{position:'relative',flexShrink:0}}>{el}<div style={{position:'absolute',bottom:0,right:0,width:Math.max(size*.22,8),height:Math.max(size*.22,8),borderRadius:'50%',background:'#057642',border:'2px solid var(--c-card)'}}/></div>
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROFILE CARD
   ═══════════════════════════════════════════════════════════════════════════ */
function ProfileCard({alumni:a, onConnect, onMessage, onWithdraw, loading}){
    const roleBadge=a.role==='mentor'?{label:'Mentor',bg:'#7c3aed',c:'#fff'}:a.role==='admin'?{label:'Admin',bg:'#dc2626',c:'#fff'}:null
    return(
    <div className="a-card" style={{display:'flex',flexDirection:'column',animation:'aFadeIn 0.3s ease'}}>
        <div style={{height:56,background:COVERS[cov(a.name)],position:'relative'}}>
            <div style={{position:'absolute',bottom:-24,left:14}}><Av name={a.name} size={48} src={a.avatar} ring/></div>
            {roleBadge&&<span style={{position:'absolute',top:6,right:6,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:roleBadge.bg,color:roleBadge.c}}>{roleBadge.label}</span>}
        </div>
        <div style={{padding:'30px 14px 14px'}}>
            <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)',lineHeight:1.3}}>{a.name}</div>
            <div style={{fontSize:12,color:'var(--c-txt2)',marginTop:2,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.job_title||a.role}</div>
            <div style={{fontSize:11,color:'var(--c-txt3)',marginTop:3,display:'flex',alignItems:'center',gap:3,flexWrap:'wrap'}}>
                {a.company&&<><Building size={10}/>{a.company}</>}
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
   POST CARD (with working Like, Comment, Repost, Send)
   ═══════════════════════════════════════════════════════════════════════════ */
function PostCard({post:p, onLike, onRepost, onSend, currentUser}){
    const [showCmt,setShowCmt]=useState(false)
    const [cmtText,setCmtText]=useState('')
    const [cmts,setCmts]=useState([])
    const [ldCmt,setLdCmt]=useState(false)
    const [full,setFull]=useState(false)
    const [saved,setSaved]=useState(false)
    const [showRx,setShowRx]=useState(false)
    const [reposted,setReposted]=useState(false)
    const rxT=useRef(null)
    const long=(p.content||'').length>250
    // Fix literal \n in DB content
    const content=(p.content||'').replace(/\\n/g,'\n')

    useEffect(()=>{
        if(showCmt&&cmts.length===0){
            setLdCmt(true)
            axios.get(`${API}/alumni/posts/${p.id}/comments`,authH()).then(r=>setCmts(r.data.comments||[])).catch(()=>{}).finally(()=>setLdCmt(false))
        }
    },[showCmt])

    const addCmt=async()=>{
        if(!cmtText.trim())return
        try{
            const res=await axios.post(`${API}/alumni/posts/${p.id}/comment`,{text:cmtText.trim()},authH())
            setCmts(prev=>[...prev,{id:res.data?.id||Date.now(),author_name:currentUser?.name||'You',text:cmtText.trim(),created_at:new Date().toISOString()}])
            setCmtText('')
        }catch{}
    }

    const rxOn=()=>{clearTimeout(rxT.current);setShowRx(true)}
    const rxOff=()=>{rxT.current=setTimeout(()=>setShowRx(false),400)}
    const handleRepost=()=>{if(!reposted){setReposted(true);onRepost?.(p)}}

    const typeMap={job:{lbl:'💼 Job Opportunity',bg:'var(--c-green-l)',c:'var(--c-green)'},insight:{lbl:'💡 Career Insight',bg:'var(--c-blue-l)',c:'var(--c-blue)'}}

    return(
    <div className="a-card" style={{marginBottom:6,animation:'aFadeIn 0.3s ease'}}>
        {p.type!=='update'&&typeMap[p.type]&&<div style={{padding:'5px 16px',fontSize:12,fontWeight:700,background:typeMap[p.type].bg,color:typeMap[p.type].c}}>{typeMap[p.type].lbl}</div>}
        <div style={{padding:'10px 16px'}}>
            <div style={{display:'flex',gap:10,marginBottom:8}}>
                <Av name={p.author_name} size={40}/>
                <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)'}}>{p.author_name}</div>
                    <div style={{fontSize:11,color:'var(--c-txt2)',lineHeight:1.3}}>{p.author_title} at {p.author_company}</div>
                    <div style={{fontSize:10,color:'var(--c-txt3)',display:'flex',alignItems:'center',gap:4,marginTop:1}}>{ago(p.created_at)} · <Globe size={10}/></div>
                </div>
                <button onClick={()=>setSaved(v=>!v)} style={{background:'none',border:'none',cursor:'pointer',padding:4,color:saved?'var(--c-blue)':'var(--c-txt3)'}}><Bookmark size={16} fill={saved?'currentColor':'none'}/></button>
            </div>
            <div style={{fontSize:14,color:'var(--c-txt)',lineHeight:1.6,whiteSpace:'pre-line',wordBreak:'break-word'}}>
                {long&&!full?content.slice(0,250)+'…':content}
                {long&&<button onClick={()=>setFull(v=>!v)} style={{background:'none',border:'none',color:'var(--c-txt2)',cursor:'pointer',fontSize:14,fontWeight:600,marginLeft:4}}>{full?'show less':'...see more'}</button>}
            </div>
            {p.tags?.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>{p.tags.map(t=><span key={t} style={{fontSize:13,color:'var(--c-blue)',fontWeight:600}}>#{t}</span>)}</div>}
            {/* Counts */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',marginTop:6,borderBottom:'1px solid var(--c-bdr)'}}>
                <div style={{display:'flex',alignItems:'center',gap:4,fontSize:13,color:'var(--c-txt2)'}}>
                    <span style={{fontSize:14}}>👍</span>{p.likes>10&&<span style={{fontSize:14}}>❤️</span>}
                    <span>{fmt(p.likes)}</span>
                </div>
                <div style={{display:'flex',gap:12}}>
                    <span style={{fontSize:13,color:'var(--c-txt2)',cursor:'pointer'}} onClick={()=>setShowCmt(v=>!v)}>{p.comments} comments</span>
                    {reposted&&<span style={{fontSize:13,color:'var(--c-txt2)'}}>1 repost</span>}
                </div>
            </div>
            {/* Action bar */}
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
                <button className={`a-act${reposted?' on':''}`} onClick={handleRepost}><Repeat2 size={16}/>{reposted?'Reposted':'Repost'}</button>
                <button className="a-act" onClick={()=>onSend?.(p)}><Send size={16}/>Send</button>
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
                    {!ldCmt&&cmts.length===0&&<div style={{textAlign:'center',padding:'12px 0',fontSize:12,color:'var(--c-txt3)'}}>No comments yet. Be the first!</div>}
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
   CHAT PANEL (works as popup or embedded)
   ═══════════════════════════════════════════════════════════════════════════ */
function ChatPanel({alumni:a,currentUser,onClose,embedded=false,onMessageSent,onGoToPost}){
    const [msgs,setMsgs]=useState([])
    const [input,setInput]=useState('')
    const [sending,setSending]=useState(false)
    const [ld,setLd]=useState(true)
    const btm=useRef(null)
    const pollRef=useRef(null)

    const fetchMsgs=useCallback(()=>{
        return axios.get(`${API}/alumni/messages/${a.id}`,authH()).then(r=>{setMsgs(r.data.messages||[]);setLd(false)}).catch(()=>setLd(false))
    },[a.id])

    useEffect(()=>{
        setLd(true);setMsgs([])
        fetchMsgs()
        pollRef.current=setInterval(fetchMsgs,5000)
        return()=>clearInterval(pollRef.current)
    },[a.id])

    useEffect(()=>{btm.current?.scrollIntoView({behavior:'smooth'})},[msgs])

    const send=async()=>{
        if(!input.trim()||sending)return
        const t=input.trim();setInput('');setSending(true)
        try{
            await axios.post(`${API}/alumni/messages`,{receiverId:a.id,text:t},authH())
            // Immediately refresh messages so the sent message appears without waiting for the 5-second poll
            await fetchMsgs()
            // Delay conversations refresh slightly to avoid the race condition where the DB
            // write hasn't committed by the time fetchConversations runs
            setTimeout(()=>onMessageSent?.(), 300)
        }catch(err){
            // Restore the typed text so the user can retry
            setInput(t)
            const msg = err?.response?.data?.error || err?.message || 'Failed to send message'
            alert('Could not send message: ' + msg)
        }
        setSending(false)
    }

    const myId=currentUser?.id||'me'
    const wrapStyle=embedded
        ?{display:'flex',flexDirection:'column',height:'100%',minHeight:400}
        :{position:'fixed',bottom:0,right:24,width:340,zIndex:9999,borderRadius:'8px 8px 0 0',boxShadow:'var(--c-shadow-l)',display:'flex',flexDirection:'column',maxHeight:460,background:'var(--c-card)'}

    return(
    <div style={wrapStyle}>
        <div style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid var(--c-bdr)',background:'var(--c-card)',borderRadius:embedded?'8px 8px 0 0':'8px 8px 0 0'}}>
            <Av name={a.name} size={34} online/>
            <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                <div style={{fontSize:11,color:'var(--c-txt3)'}}>{a.job_title||a.role||''}</div>
            </div>
            {onClose&&<button onClick={onClose} style={{width:28,height:28,borderRadius:14,border:'none',background:'none',cursor:'pointer',color:'var(--c-txt2)',display:'flex',alignItems:'center',justifyContent:'center'}}><X size={16}/></button>}
        </div>
        <div className="a-chat-msgs" style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:6,background:'var(--c-bg)',minHeight:embedded?300:220,maxHeight:embedded?'none':340}}>
            {ld&&<div style={{textAlign:'center',padding:30}}><div className="a-spinner" style={{margin:'0 auto'}}/></div>}
            {!ld&&msgs.length===0&&(
                <div style={{textAlign:'center',padding:'40px 20px',color:'var(--c-txt3)'}}>
                    <MessageSquare size={32} style={{opacity:.3,marginBottom:8}}/>
                    <div style={{fontSize:13}}>Start a conversation with {a.name}!</div>
                </div>
            )}
            {msgs.map(m=>{
                const shared=isSharedPost(m.text)
                const sharedData=shared?parseSharedPost(m.text):null
                const isMine=m.sender_id===myId
                return(
                <div key={m.id} style={{display:'flex',flexDirection:isMine?'row-reverse':'row',alignItems:'flex-end',gap:6}}>
                    {!isMine&&<Av name={a.name} size={24}/>}
                    {shared&&sharedData?(
                        <div style={{maxWidth:'80%'}}>
                            <SharedPostCard data={sharedData} onClick={()=>onGoToPost?.(sharedData.id)}/>
                            <div style={{fontSize:10,marginTop:2,textAlign:isMine?'right':'left',color:'var(--c-txt3)'}}>{ago(m.created_at)}</div>
                        </div>
                    ):(
                        <div style={{
                            maxWidth:'75%',padding:'8px 12px',
                            borderRadius:isMine?'14px 14px 2px 14px':'14px 14px 14px 2px',
                            background:isMine?'var(--c-blue)':'var(--c-card)',
                            color:isMine?'#fff':'var(--c-txt)',fontSize:13,lineHeight:1.5,
                            boxShadow:'var(--c-shadow)',whiteSpace:'pre-wrap',wordBreak:'break-word'
                        }}>
                            {(m.text||'').replace(/\\n/g,'\n')}
                            <div style={{fontSize:10,marginTop:2,textAlign:'right',opacity:0.6}}>{ago(m.created_at)}</div>
                        </div>
                    )}
                </div>
            )})}
            <div ref={btm}/>
        </div>
        <div style={{padding:10,borderTop:'1px solid var(--c-bdr)',display:'flex',gap:6,alignItems:'center',background:'var(--c-card)',borderRadius:embedded?'0 0 8px 8px':'0'}}>
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
   SHARE POST MODAL (for Send button)
   ═══════════════════════════════════════════════════════════════════════════ */
/* ── Shared post detection helpers ── */
const SHARE_PREFIX='@@SHARED_POST@@'
const OLD_SHARE_RE=/^📄 Shared a post by (.+?):[\n\\n]/
function isSharedPost(text){return text?.startsWith(SHARE_PREFIX)||OLD_SHARE_RE.test(text||'')}
function parseSharedPost(text){
    if(text?.startsWith(SHARE_PREFIX)){
        try{return JSON.parse(text.slice(SHARE_PREFIX.length))}catch{return null}
    }
    // backward compat: parse old "📄 Shared a post by X:\n..." format
    const m=OLD_SHARE_RE.exec(text||'')
    if(m){
        const author=m[1]
        const rest=(text||'').slice(m[0].length).replace(/^[\n\\n]+/g,'').replace(/^"/,'').replace(/"$/,'')
        return{id:null,author,title:'',company:'',content:rest.replace(/\\n/g,'\n'),type:'update'}
    }
    return null
}
function makeSharePayload(post){
    return SHARE_PREFIX+JSON.stringify({id:post.id,author:post.author_name,title:post.author_title,company:post.author_company,content:post.content?.slice(0,300),type:post.type})
}

/* ── Shared Post Card (rendered inside chat bubbles) ── */
function SharedPostCard({data,onClick}){
    if(!data)return null
    const preview=(data.content||'').replace(/\\n/g,' ').slice(0,120)
    return(
    <div onClick={onClick} style={{cursor:'pointer',border:'1px solid var(--c-bdr)',borderRadius:8,overflow:'hidden',background:'var(--c-card)',maxWidth:280,transition:'box-shadow 0.15s'}}
        onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--c-shadow-l)'}
        onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
        <div style={{height:6,background:COVERS[cov(data.author||'')]}}></div>
        <div style={{padding:'10px 12px'}}>
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                <Av name={data.author||'?'} size={28}/>
                <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:12,color:'var(--c-txt)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{data.author}</div>
                    {data.title&&<div style={{fontSize:10,color:'var(--c-txt2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{data.title}{data.company?` at ${data.company}`:''}</div>}
                </div>
            </div>
            <div style={{fontSize:12,color:'var(--c-txt)',lineHeight:1.45,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{preview}{data.content?.length>120?'…':''}</div>
            <div style={{marginTop:8,paddingTop:6,borderTop:'1px solid var(--c-bdr)',display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--c-blue)',fontWeight:600}}>
                <BookOpen size={12}/>View full post
            </div>
        </div>
    </div>
)}

function SharePostModal({post,connections,onSend,onClose}){
    const [selected,setSelected]=useState(null)
    const [sending,setSending]=useState(false)
    const handleSend=async()=>{
        if(!selected||sending)return
        setSending(true)
        await onSend(selected,makeSharePayload(post))
        setSending(false);onClose()
    }
    const preview=(post.content||'').slice(0,100)
    return(
    <div style={{position:'fixed',inset:0,background:'var(--c-overlay)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10000}} onClick={onClose}>
        <div className="a-card" style={{width:'100%',maxWidth:420,animation:'aSlideUp 0.25s ease'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid var(--c-bdr)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{fontWeight:700,fontSize:16,color:'var(--c-txt)'}}>Send to a connection</div>
                <button onClick={onClose} style={{width:28,height:28,borderRadius:14,border:'none',background:'none',cursor:'pointer',color:'var(--c-txt2)'}}><X size={18}/></button>
            </div>
            {/* Post preview */}
            <div style={{padding:'12px 20px',borderBottom:'1px solid var(--c-bdr)',background:'var(--c-card-h)'}}>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                    <Av name={post.author_name} size={28}/>
                    <div><div style={{fontWeight:700,fontSize:12,color:'var(--c-txt)'}}>{post.author_name}</div><div style={{fontSize:10,color:'var(--c-txt2)'}}>{post.author_title}</div></div>
                </div>
                <div style={{fontSize:12,color:'var(--c-txt2)',lineHeight:1.4}}>{preview}{post.content?.length>100?'…':''}</div>
            </div>
            <div style={{padding:'12px 16px',maxHeight:260,overflowY:'auto'}}>
                <div style={{fontSize:12,fontWeight:600,color:'var(--c-txt2)',marginBottom:8}}>Select a connection</div>
                {connections.length===0
                    ?<div style={{textAlign:'center',padding:20,color:'var(--c-txt2)',fontSize:13}}>No connections to send to. Connect with alumni first!</div>
                    :connections.map(c=>(
                        <div key={c.id} onClick={()=>setSelected(c)}
                            style={{display:'flex',gap:10,alignItems:'center',padding:'8px 12px',borderRadius:8,cursor:'pointer',
                                background:selected?.id===c.id?'var(--c-blue-l)':'transparent',
                                border:selected?.id===c.id?'1px solid var(--c-blue)':'1px solid transparent',
                                marginBottom:4,transition:'all 0.15s'}}>
                            <Av name={c.name} size={34}/>
                            <div style={{flex:1}}>
                                <div style={{fontWeight:600,fontSize:13,color:'var(--c-txt)'}}>{c.name}</div>
                                <div style={{fontSize:11,color:'var(--c-txt2)'}}>{c.job_title||c.role}</div>
                            </div>
                            {selected?.id===c.id&&<CheckCircle size={18} style={{color:'var(--c-blue)'}}/>}
                        </div>
                    ))
                }
            </div>
            <div style={{padding:'10px 16px',borderTop:'1px solid var(--c-bdr)',display:'flex',justifyContent:'flex-end',gap:8}}>
                <button className="a-btn a-btn-g" onClick={onClose}>Cancel</button>
                <button className="a-btn a-btn-p" onClick={handleSend} disabled={!selected||sending}>{sending?'Sending...':'Send'}</button>
            </div>
        </div>
    </div>
)}

/* ═══════════════════════════════════════════════════════════════════════════
   TRENDING SIDEBAR
   ═══════════════════════════════════════════════════════════════════════════ */
function TrendingSidebar(){
    const trends=[
        {tag:'TechCareers',posts:'2,450'},{tag:'AlumniNetwork',posts:'1,890'},
        {tag:'CampusToCorporate',posts:'980'},{tag:'InterviewPrep',posts:'3,200'},
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

/* ═══════════════════════════════════════════════════════════════════════════
   QUICK STATS
   ═══════════════════════════════════════════════════════════════════════════ */
function QuickStats({alumni,networkCount,msgCount}){
    const companies=[...new Set(alumni.map(a=>a.company).filter(Boolean))]
    return(
    <div className="a-card" style={{padding:16,marginTop:8}}>
        <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)',marginBottom:12}}>Network Stats</div>
        {[
            {lbl:'Total Alumni',val:alumni.length,icon:<Users size={14}/>},
            {lbl:'Companies',val:companies.length,icon:<Building size={14}/>},
            {lbl:'Connections',val:networkCount,icon:<UserPlus size={14}/>},
            {lbl:'Active Chats',val:msgCount,icon:<MessageSquare size={14}/>},
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

    /* ── Data states ── */
    const [alumni,setAlumni]=useState([])
    const [posts,setPosts]=useState([])
    const [requests,setReqs]=useState([])
    const [network,setNetwork]=useState([])
    const [conversations,setConversations]=useState([])
    const [ldA,setLdA]=useState(true)
    const [ldP,setLdP]=useState(true)
    const [ldR,setLdR]=useState(true)
    const [ldN,setLdN]=useState(true)
    const [ldC,setLdC]=useState(true)

    /* ── UI states ── */
    const [search,setSearch]=useState('')
    const [fSkill,setFSkill]=useState('')
    const [fBatch,setFBatch]=useState('')
    const [fComp,setFComp]=useState('')
    const [showPost,setShowPost]=useState(false)
    const [chatWith,setChatWith]=useState(null)    // popup chat (from profile cards)
    const [msgChat,setMsgChat]=useState(null)      // messages tab active chat
    const [sharePost,setSharePost]=useState(null)   // share/send modal
    const [highlightPost,setHighlightPost]=useState(null) // scroll-to-post after shared card click
    const [notif,setNotif]=useState(null)
    const [actLd,setActLd]=useState(false)
    const [readConvIds,setReadConvIds]=useState(()=>new Set()) // track opened conversations

    const toast=useCallback((msg,type='success')=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3000)},[])

    /* ── Fetch functions ── */
    const fetchAlumni=useCallback(async()=>{
        setLdA(true)
        try{const r=await axios.get(`${API}/alumni`,authH());setAlumni(r.data.alumni||[])}catch{setAlumni([])}
        setLdA(false)
    },[])
    const fetchPosts=useCallback(async()=>{
        setLdP(true)
        try{const r=await axios.get(`${API}/alumni/posts`,authH());setPosts(r.data.posts||[])}catch{setPosts([])}
        setLdP(false)
    },[])
    const fetchReqs=useCallback(async()=>{
        setLdR(true)
        try{const r=await axios.get(`${API}/alumni/requests`,authH());setReqs(r.data.requests||[])}catch{setReqs([])}
        setLdR(false)
    },[])
    const fetchNetwork=useCallback(async()=>{
        setLdN(true)
        try{const r=await axios.get(`${API}/alumni/network`,authH());setNetwork(r.data.network||[])}catch{setNetwork([])}
        setLdN(false)
    },[])
    const fetchConversations=useCallback(async()=>{
        setLdC(true)
        try{const r=await axios.get(`${API}/alumni/conversations`,authH());setConversations(r.data.conversations||[])}catch{setConversations([])}
        setLdC(false)
    },[])

    useEffect(()=>{fetchAlumni();fetchPosts();fetchReqs();fetchNetwork();fetchConversations()},[])

    // Poll conversations for notification badges
    useEffect(()=>{
        const iv=setInterval(()=>{fetchConversations()},15000)
        return()=>clearInterval(iv)
    },[])

    /* ── Actions ── */
    const doConnect=async(tid)=>{
        setActLd(true)
        try{
            await axios.post(`${API}/alumni/connect`,{targetId:tid},authH())
            setAlumni(p=>p.map(a=>a.id===tid?{...a,connection_status:'pending'}:a))
            toast('Connection request sent!')
        }catch(e){toast(e.response?.data?.error||'Failed','error')}
        setActLd(false)
    }
    const doWithdraw=async(tid)=>{
        setActLd(true)
        try{
            await axios.delete(`${API}/alumni/connect/withdraw/${tid}`,authH())
            setAlumni(p=>p.map(a=>a.id===tid?{...a,connection_status:'none'}:a))
            toast('Request withdrawn','info')
        }catch{toast('Failed','error')}
        setActLd(false)
    }
    const doAccept=async(req)=>{
        setActLd(true)
        try{
            await axios.put(`${API}/alumni/connect/${req.id}/accept`,{},authH())
            setReqs(p=>p.filter(r=>r.id!==req.id))
            setAlumni(p=>p.map(a=>a.id===req.from_id?{...a,connection_status:'connected'}:a))
            fetchNetwork()
            toast(`Connected with ${req.from_name}!`)
        }catch{toast('Failed','error')}
        setActLd(false)
    }
    const doDecline=async(id)=>{try{await axios.delete(`${API}/alumni/connect/${id}`,authH());setReqs(p=>p.filter(r=>r.id!==id))}catch{}}

    const doLike=async(pid)=>{
        setPosts(p=>p.map(x=>x.id===pid?{...x,liked_by_me:!x.liked_by_me,likes:x.liked_by_me?x.likes-1:x.likes+1}:x))
        try{await axios.post(`${API}/alumni/posts/${pid}/like`,{},authH())}
        catch{setPosts(p=>p.map(x=>x.id===pid?{...x,liked_by_me:!x.liked_by_me,likes:x.liked_by_me?x.likes-1:x.likes+1}:x))}
    }
    const doRepost=async(post)=>{
        try{
            await axios.post(`${API}/alumni/posts`,{content:`🔄 Reposted from ${post.author_name}:\n\n${post.content}`,type:'update',tags:[]},authH())
            fetchPosts()
            toast('Post shared to your feed!')
        }catch{toast('Failed to repost','error')}
    }
    const doSendPost=async(connection,text)=>{
        try{
            await axios.post(`${API}/alumni/messages`,{receiverId:connection.id,text},authH())
            toast(`Sent to ${connection.name}!`)
            fetchConversations()
        }catch{toast('Failed to send','error')}
    }
    const goToPost=(postId)=>{
        setTab('feed')
        setHighlightPost(postId)
        setTimeout(()=>{
            const el=document.getElementById(`alumni-post-${postId}`)
            if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.transition='box-shadow 0.3s';el.style.boxShadow='0 0 0 3px var(--c-blue)';setTimeout(()=>{el.style.boxShadow='none';setHighlightPost(null)},2500)}
        },300)
    }
    const doPost=async({content,postType})=>{
        try{
            await axios.post(`${API}/alumni/posts`,{content,type:postType,tags:[]},authH())
            fetchPosts()
            toast('Post published!')
        }catch{toast('Failed to create post','error')}
    }
    const doMessage=(a)=>{
        const inNet=network.find(n=>n.id===a.id)
        if(a.connection_status==='connected'||inNet){setChatWith(a);return}
        toast('Connect first to message','warning')
    }
    const goBack=()=>{
        const role=user?.role||'student'
        if(role==='alumni')navigate('/connect-alumni')
        else navigate(`/${role}`)
    }
    const doLogout=()=>{logout()}

    /* ── Derived data ── */
    const allSkills=[...new Set(alumni.flatMap(a=>a.skills||[]))]
    const allBatches=[...new Set(alumni.map(a=>a.batch_year).filter(Boolean))].sort((a,b)=>b-a)
    const allComps=[...new Set(alumni.map(a=>a.company).filter(Boolean))]
    const filtered=alumni.filter(a=>{
        const q=search.toLowerCase()
        return(!q||a.name.toLowerCase().includes(q)||a.company.toLowerCase().includes(q)||(a.skills||[]).some(s=>s.toLowerCase().includes(q)))
            &&(!fSkill||(a.skills||[]).includes(fSkill))&&(!fBatch||a.batch_year===parseInt(fBatch))&&(!fComp||a.company===fComp)
    })
    // Count truly unread conversations: last msg from other AND not yet opened
    const unreadConvs=conversations.filter(c=>!c.is_mine && !readConvIds.has(c.id)).length
    const openChat=(c)=>{
        setMsgChat(c)
        setReadConvIds(prev=>{const s=new Set(prev);s.add(c.id);return s})
    }

    const TABS=[
        {id:'feed',label:'Home',icon:<Home size={16}/>},
        {id:'directory',label:'People',icon:<Users size={16}/>,count:alumni.length},
        {id:'network',label:'My Network',icon:<UserPlus size={16}/>,count:network.length},
        {id:'messages',label:'Messages',icon:<MessageSquare size={16}/>,count:unreadConvs,badge:true},
        {id:'requests',label:'Invitations',icon:<Bell size={16}/>,count:requests.length,badge:true},
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
                <div style={{maxWidth:1280,margin:'0 auto',display:'flex',alignItems:'center',padding:'0 16px',gap:6}}>
                <button onClick={goBack} title="Back to Mentor Hub"
                    style={{width:34,height:34,borderRadius:17,border:'none',background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--c-txt2)',transition:'all 0.15s',flexShrink:0}}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--c-card-h)';e.currentTarget.style.color='var(--c-txt)'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='var(--c-txt2)'}}>
                    <ArrowLeft size={18}/>
                </button>
                <div style={{display:'flex',alignItems:'center',gap:6,paddingRight:8}}>
                    <div style={{width:28,height:28,borderRadius:4,background:'var(--c-blue)',display:'flex',alignItems:'center',justifyContent:'center'}}><GraduationCap size={14} color="#fff"/></div>
                    <span style={{fontWeight:800,fontSize:14,color:'var(--c-txt)',letterSpacing:-0.3}}>Alumni</span>
                </div>
                <div style={{position:'relative',flex:'0 1 240px',marginRight:'auto'}}>
                    <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--c-txt3)'}}/>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search alumni, skills, companies..."
                        style={{width:'100%',padding:'7px 12px 7px 30px',border:'none',borderRadius:4,background:'var(--c-blue-l)',color:'var(--c-txt)',fontSize:13,outline:'none'}}/>
                </div>
                <div className="nav-tabs" style={{display:'flex'}}>
                    {TABS.map(t=>(
                        <button key={t.id} className={`a-tab${tab===t.id?' on':''}`} onClick={()=>setTab(t.id)}>
                            <div style={{position:'relative'}}>
                                {t.icon}
                                {t.badge&&t.count>0&&<span style={{position:'absolute',top:-6,right:-8,minWidth:15,height:15,borderRadius:8,background:'#cc1016',color:'#fff',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px'}}>{t.count}</span>}
                            </div>
                            <span>{t.label}</span>
                        </button>
                    ))}
                </div>
                <button onClick={toggleTheme} title={theme==='light'?'Switch to dark mode':'Switch to light mode'}
                    style={{width:32,height:32,borderRadius:16,border:'1px solid var(--c-bdr)',background:'var(--c-card-h)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--c-txt2)',transition:'all 0.2s',flexShrink:0}}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--c-blue-l)';e.currentTarget.style.color='var(--c-blue)'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='var(--c-card-h)';e.currentTarget.style.color='var(--c-txt2)'}}>
                    {theme==='light'?<Moon size={15}/>:<Sun size={15}/>}
                </button>
                <button onClick={doLogout} title="Logout"
                    style={{width:32,height:32,borderRadius:16,border:'1px solid var(--c-bdr)',background:'var(--c-card-h)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--c-txt2)',transition:'all 0.2s',flexShrink:0}}
                    onMouseEnter={e=>{e.currentTarget.style.background='rgba(204,16,22,0.12)';e.currentTarget.style.color='#cc1016'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='var(--c-card-h)';e.currentTarget.style.color='var(--c-txt2)'}}>
                    <LogOut size={15}/>
                </button>
                <Av name={user?.name||'You'} size={28}/>
            </div>
        </div>

        {/* Mobile tabs */}
        <div className="mobile-tabs" style={{display:'none',overflowX:'auto',background:'var(--c-card)',borderBottom:'1px solid var(--c-bdr)'}}>
            {TABS.map(t=>(
                <button key={t.id} className={`a-tab${tab===t.id?' on':''}`} onClick={()=>setTab(t.id)} style={{flex:1,justifyContent:'center'}}>
                    <div style={{position:'relative'}}>
                        {t.icon}
                        {t.badge&&t.count>0&&<span style={{position:'absolute',top:-6,right:-8,minWidth:15,height:15,borderRadius:8,background:'#cc1016',color:'#fff',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px'}}>{t.count}</span>}
                    </div>
                    <span>{t.label}</span>
                </button>
            ))}
        </div>

        {/* ═══ CONTENT ═══ */}
        <div className="main-grid" style={{maxWidth:1280,margin:'0 auto',padding:'12px 16px',display:'flex',gap:20,minHeight:'calc(100vh - 56px)'}}>

            {/* ─── FEED TAB ─── */}
            {tab==='feed'&&<>
                <div className="sidebar-l" style={{width:225,flexShrink:0}}>
                    <div className="a-card" style={{textAlign:'center'}}>
                        <div style={{height:52,background:COVERS[0]}}/>
                        <div style={{marginTop:-24,padding:'0 14px 14px'}}>
                            <Av name={user?.name||'You'} size={48} ring style={{margin:'0 auto'}}/>
                            <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)',marginTop:6}}>{user?.name||'Student'}</div>
                            <div style={{fontSize:12,color:'var(--c-txt2)',marginTop:2}}>{({alumni:'Alumni',mentor:'Mentor',admin:'Admin',student:'Student'})[user?.role]||'Member'} at Mentor Hub</div>
                            <div style={{borderTop:'1px solid var(--c-bdr)',marginTop:10,paddingTop:10}}>
                                {[['Connections',network.length],['Alumni',alumni.length],['Messages',conversations.length]].map(([l,v])=>(
                                    <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--c-txt2)',marginBottom:4}}>
                                        <span>{l}</span><span style={{fontWeight:700,color:'var(--c-blue)'}}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <QuickStats alumni={alumni} networkCount={network.length} msgCount={conversations.length}/>
                </div>

                <div style={{flex:1,minWidth:0}}>
                    {/* Create post */}
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
                    {/* Sort bar */}
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',fontSize:12,color:'var(--c-txt3)'}}>
                        <div style={{flex:1,height:1,background:'var(--c-bdr)'}}/> Sort by: <span style={{fontWeight:700,color:'var(--c-txt2)',cursor:'pointer'}}>Top <ChevronDown size={12} style={{verticalAlign:'middle'}}/></span>
                    </div>
                    {/* Posts */}
                    {ldP?<div style={{textAlign:'center',padding:40}}><div className="a-spinner" style={{margin:'0 auto',width:28,height:28}}/></div>
                    :posts.length===0?<div className="a-card" style={{textAlign:'center',padding:'40px 24px'}}>
                        <BookOpen size={40} style={{color:'var(--c-txt3)',opacity:.3,marginBottom:10}}/>
                        <div style={{fontSize:16,fontWeight:600,color:'var(--c-txt)'}}>No posts yet</div>
                        <div style={{fontSize:14,color:'var(--c-txt2)',marginTop:4}}>Be the first to share something!</div>
                        <button className="a-btn a-btn-p" style={{marginTop:14}} onClick={()=>setShowPost(true)}>Create Post</button>
                    </div>
                    :posts.map(p=><div key={p.id} id={`alumni-post-${p.id}`}><PostCard post={p} onLike={doLike} onRepost={doRepost} onSend={post=>setSharePost(post)} currentUser={user}/></div>)}
                </div>

                <div className="sidebar-r" style={{width:300,flexShrink:0}}>
                    {/* People suggestions */}
                    <div className="a-card" style={{padding:16}}>
                        <div style={{fontWeight:700,fontSize:15,color:'var(--c-txt)',marginBottom:12}}>Add to your network</div>
                        {ldA?<div style={{textAlign:'center',padding:16}}><div className="a-spinner" style={{margin:'0 auto'}}/></div>
                        :alumni.filter(a=>a.connection_status==='none').length===0?
                            <div style={{textAlign:'center',padding:'16px 8px',color:'var(--c-txt2)',fontSize:13}}>
                                <Users size={28} style={{color:'var(--c-txt3)',opacity:.4,marginBottom:6,display:'block',margin:'0 auto 6px'}}/>
                                You've connected with everyone!
                            </div>
                        :alumni.filter(a=>a.connection_status==='none').slice(0,4).map((a,i)=>(
                            <div key={a.id} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'10px 0',borderTop:i?'1px solid var(--c-bdr)':'none'}}>
                                <Av name={a.name} size={40}/>
                                <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontWeight:700,fontSize:13,color:'var(--c-txt)'}}>{a.name}</div>
                                    <div style={{fontSize:12,color:'var(--c-txt2)',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.job_title} at {a.company}</div>
                                    <button className="a-btn a-btn-o" style={{marginTop:6,padding:'3px 12px',fontSize:12}} onClick={()=>doConnect(a.id)} disabled={actLd}><UserPlus size={12}/>Connect</button>
                                </div>
                            </div>
                        ))}
                        {alumni.filter(a=>a.connection_status==='none').length>4&&
                            <button onClick={()=>setTab('directory')} style={{width:'100%',padding:8,border:'none',background:'none',color:'var(--c-blue)',cursor:'pointer',fontWeight:600,fontSize:13,marginTop:6}}>View all →</button>}
                    </div>
                    {/* Recent messages */}
                    {conversations.length>0&&(
                        <div className="a-card" style={{padding:16,marginTop:8}}>
                            <div style={{fontWeight:700,fontSize:15,color:'var(--c-txt)',marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                Recent Messages
                                {unreadConvs>0&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:'#cc1016',color:'#fff',fontWeight:700}}>{unreadConvs} new</span>}
                            </div>
                            {conversations.slice(0,3).map((c,i)=>(
                                <div key={c.id} onClick={()=>{setTab('messages');openChat(c)}}
                                    style={{display:'flex',gap:8,alignItems:'center',padding:'8px 0',borderTop:i?'1px solid var(--c-bdr)':'none',cursor:'pointer'}}>
                                    <Av name={c.name} size={32}/>
                                    <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontWeight:600,fontSize:12,color:'var(--c-txt)'}}>{c.name}</div>
                                        <div style={{fontSize:11,color:'var(--c-txt3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                            {c.is_mine?'You: ':''}{isSharedPost(c.last_message)?'📎 Shared a post':c.last_message}
                                        </div>
                                    </div>
                                    <div style={{fontSize:10,color:'var(--c-txt3)',flexShrink:0}}>{ago(c.last_time)}</div>
                                </div>
                            ))}
                            <button onClick={()=>setTab('messages')} style={{width:'100%',padding:8,border:'none',background:'none',color:'var(--c-blue)',cursor:'pointer',fontWeight:600,fontSize:13,marginTop:4}}>All messages →</button>
                        </div>
                    )}
                    <div style={{marginTop:8}}><TrendingSidebar/></div>
                </div>
            </>}

            {/* ─── DIRECTORY (PEOPLE) TAB ─── */}
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
                :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',gap:12}}>
                    {filtered.map(a=><ProfileCard key={a.id} alumni={a} onConnect={doConnect} onMessage={doMessage} onWithdraw={doWithdraw} loading={actLd}/>)}
                </div>}
                {!ldA&&filtered.length===0&&<div className="a-card" style={{textAlign:'center',padding:'40px 24px'}}>
                    <Search size={40} style={{color:'var(--c-txt3)',opacity:.4,marginBottom:10}}/>
                    <div style={{fontSize:16,fontWeight:600,color:'var(--c-txt)'}}>No results found</div>
                    <div style={{fontSize:14,color:'var(--c-txt2)',marginTop:4}}>Try adjusting your search or filters</div>
                </div>}
            </div>}

            {/* ─── MY NETWORK TAB ─── */}
            {tab==='network'&&<div style={{flex:1}}>
                {ldN?<div style={{textAlign:'center',padding:40}}><div className="a-spinner" style={{margin:'0 auto',width:28,height:28}}/></div>
                :network.length===0&&alumni.filter(a=>a.connection_status==='pending').length===0?
                    <div className="a-card" style={{textAlign:'center',padding:'48px 24px'}}>
                        <Users size={48} style={{color:'var(--c-txt3)',opacity:.3,marginBottom:14}}/>
                        <div style={{fontSize:18,fontWeight:700,color:'var(--c-txt)'}}>No connections yet</div>
                        <div style={{fontSize:14,color:'var(--c-txt2)',marginTop:6,maxWidth:380,margin:'6px auto 18px'}}>Build your alumni network for career opportunities, referrals, and mentorship.</div>
                        <button className="a-btn a-btn-p" style={{padding:'10px 24px'}} onClick={()=>setTab('directory')}>Find Alumni</button>
                    </div>
                :<>
                    {network.length>0&&<>
                        <div className="a-card" style={{padding:'16px 20px',marginBottom:8}}>
                            <div style={{fontSize:16,fontWeight:700,color:'var(--c-txt)'}}>{network.length} Connection{network.length!==1?'s':''}</div>
                        </div>
                        {network.map(a=>(
                            <div key={a.id} className="a-card" style={{display:'flex',gap:12,alignItems:'center',padding:'12px 20px',marginBottom:6,animation:'aFadeIn 0.3s ease'}}>
                                <Av name={a.name} size={50}/>
                                <div style={{flex:1,minWidth:0}}>
                                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                                        <span style={{fontWeight:700,fontSize:14,color:'var(--c-txt)'}}>{a.name}</span>
                                        <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:a.role==='alumni'?'var(--c-blue-l)':'var(--c-green-l)',color:a.role==='alumni'?'var(--c-blue)':'var(--c-green)',fontWeight:600}}>{a.role}</span>
                                    </div>
                                    <div style={{fontSize:13,color:'var(--c-txt2)'}}>{a.job_title?`${a.job_title} at ${a.company}`:a.role}</div>
                                    <div style={{fontSize:11,color:'var(--c-txt3)',display:'flex',alignItems:'center',gap:4,marginTop:2}}>
                                        {a.location&&<><MapPin size={10}/>{a.location} · </>}{a.batch_year>0&&<><GraduationCap size={10}/>Batch {a.batch_year}</>}
                                    </div>
                                </div>
                                <button className="a-btn a-btn-o" onClick={()=>{setChatWith(a)}}><MessageSquare size={14}/>Message</button>
                            </div>
                        ))}
                    </>}
                    {/* Pending sent connections */}
                    {alumni.filter(a=>a.connection_status==='pending').length>0&&<div style={{marginTop:16}}>
                        <div className="a-card" style={{padding:'14px 20px',marginBottom:6}}>
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

            {/* ─── MESSAGES TAB — 3-column layout like Home ─── */}
            {tab==='messages'&&<>
                {/* LEFT COLUMN — conversations list */}
                <div className="sidebar-l" style={{width:280,flexShrink:0,display:'flex',flexDirection:'column',gap:0}}>
                    <div className="a-card" style={{display:'flex',flexDirection:'column',height:'calc(100vh - 80px)',overflow:'hidden'}}>
                        <div style={{padding:'14px 16px',borderBottom:'1px solid var(--c-bdr)',flexShrink:0}}>
                            <div style={{fontWeight:700,fontSize:15,color:'var(--c-txt)',marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
                                <MessageSquare size={16}/> Messages
                                {unreadConvs>0&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:10,background:'#cc1016',color:'#fff',fontWeight:700}}>{unreadConvs}</span>}
                            </div>
                            <div style={{position:'relative'}}>
                                <Search size={13} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--c-txt3)'}}/>
                                <input placeholder="Search..."
                                    style={{width:'100%',padding:'6px 10px 6px 30px',border:'1px solid var(--c-bdr)',borderRadius:20,background:'var(--c-card-h)',color:'var(--c-txt)',fontSize:12,outline:'none'}}/>
                            </div>
                        </div>
                        <div style={{flex:1,overflowY:'auto'}}>
                            {ldC?<div style={{textAlign:'center',padding:24}}><div className="a-spinner" style={{margin:'0 auto'}}/></div>
                            :conversations.length===0?
                                <div style={{textAlign:'center',padding:'30px 16px',color:'var(--c-txt3)'}}>
                                    <MessageSquare size={28} style={{opacity:.25,marginBottom:8,display:'block',margin:'0 auto 8px'}}/>
                                    <div style={{fontSize:12,fontWeight:600}}>No messages yet</div>
                                    <div style={{fontSize:11,marginTop:4}}>Connect with alumni and start chatting!</div>
                                </div>
                            :conversations.map(c=>{
                                const isUnread=!c.is_mine&&!readConvIds.has(c.id)
                                return(
                                <div key={c.id} className={`conv-item${msgChat?.id===c.id?' active':''}`} onClick={()=>openChat(c)}
                                    style={{borderLeft:isUnread?'3px solid var(--c-blue)':'3px solid transparent'}}>
                                    <div style={{position:'relative'}}>
                                        <Av name={c.name} size={38} online/>
                                        {isUnread&&<span style={{position:'absolute',top:0,right:0,width:9,height:9,borderRadius:5,background:'var(--c-blue)',border:'2px solid var(--c-card)'}}/>}
                                    </div>
                                    <div style={{flex:1,minWidth:0}}>
                                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                            <span style={{fontWeight:isUnread?700:600,fontSize:13,color:'var(--c-txt)'}}>{c.name}</span>
                                            <span style={{fontSize:10,color:'var(--c-txt3)',flexShrink:0}}>{ago(c.last_time)}</span>
                                        </div>
                                        <div style={{fontSize:11,color:'var(--c-txt2)',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.job_title||c.role}</div>
                                        <div style={{fontSize:11,color:isUnread?'var(--c-txt)':'var(--c-txt3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1,fontWeight:isUnread?600:400}}>
                                            {c.is_mine?'You: ':''}{isSharedPost(c.last_message)?'📎 Shared a post':c.last_message}
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </div>
                </div>

                {/* CENTER COLUMN — chat */}
                <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>
                    <div className="a-card" style={{flex:1,display:'flex',flexDirection:'column',height:'calc(100vh - 80px)',overflow:'hidden'}}>
                        {msgChat
                            ?<ChatPanel alumni={msgChat} currentUser={user} embedded onMessageSent={()=>{fetchConversations();setReadConvIds(prev=>{const s=new Set(prev);s.add(msgChat.id);return s})}} onGoToPost={goToPost}/>
                            :<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',color:'var(--c-txt3)',gap:10}}>
                                <div style={{width:72,height:72,borderRadius:36,background:'var(--c-card-h)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                                    <MessageSquare size={28} style={{opacity:.35}}/>
                                </div>
                                <div style={{fontSize:16,fontWeight:700,color:'var(--c-txt)'}}>Your Messages</div>
                                <div style={{fontSize:13,textAlign:'center',maxWidth:260,lineHeight:1.5}}>Select a conversation from the left to start chatting. Or connect with alumni first!</div>
                                <button className="a-btn a-btn-p" style={{marginTop:4}} onClick={()=>setTab('directory')}>Browse People</button>
                            </div>
                        }
                    </div>
                </div>

                {/* RIGHT COLUMN — contact info / quick actions */}
                <div className="sidebar-r" style={{width:280,flexShrink:0}}>
                    {msgChat?(
                        <div className="a-card" style={{overflow:'visible'}}>
                            {/* Contact header */}
                            <div style={{height:64,background:COVERS[cov(msgChat.name)]}} />
                            <div style={{padding:'0 16px 16px',marginTop:-24}}>
                                <Av name={msgChat.name} size={48} ring style={{margin:'0 auto',display:'block'}}/>
                                <div style={{textAlign:'center',marginTop:8}}>
                                    <div style={{fontWeight:700,fontSize:15,color:'var(--c-txt)'}}>{msgChat.name}</div>
                                    <div style={{fontSize:12,color:'var(--c-txt2)',marginTop:2}}>{msgChat.job_title||msgChat.role}</div>
                                    {msgChat.company&&<div style={{fontSize:11,color:'var(--c-txt3)',marginTop:2,display:'flex',alignItems:'center',gap:4,justifyContent:'center'}}><Building size={10}/>{msgChat.company}</div>}
                                </div>
                                <div style={{borderTop:'1px solid var(--c-bdr)',marginTop:14,paddingTop:12,display:'flex',flexDirection:'column',gap:8}}>
                                    <div style={{fontSize:11,fontWeight:600,color:'var(--c-txt2)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:2}}>Quick Actions</div>
                                    <button className="a-btn a-btn-o" style={{width:'100%',justifyContent:'center',fontSize:12}} onClick={()=>setTab('directory')}><Users size={13}/>View Profile</button>
                                    <button className="a-btn a-btn-g" style={{width:'100%',justifyContent:'center',fontSize:12}} onClick={()=>setMsgChat(null)}><X size={13}/>Close Chat</button>
                                </div>
                                {/* Mutual connections */}
                                {network.filter(n=>n.id!==msgChat.id).length>0&&(
                                    <div style={{borderTop:'1px solid var(--c-bdr)',marginTop:12,paddingTop:12}}>
                                        <div style={{fontSize:11,fontWeight:600,color:'var(--c-txt2)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Also in your network</div>
                                        {network.filter(n=>n.id!==msgChat.id).slice(0,3).map((n,i)=>(
                                            <div key={n.id} style={{display:'flex',gap:8,alignItems:'center',padding:'6px 0',borderTop:i?'1px solid var(--c-bdr)':'none'}}>
                                                <Av name={n.name} size={28}/>
                                                <div style={{flex:1,minWidth:0}}>
                                                    <div style={{fontSize:12,fontWeight:600,color:'var(--c-txt)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n.name}</div>
                                                    <div style={{fontSize:10,color:'var(--c-txt3)'}}>{n.job_title||n.role}</div>
                                                </div>
                                                <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--c-blue)',padding:2}} onClick={()=>openChat(n)} title="Message"><MessageSquare size={13}/></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ):(
                        <div className="a-card" style={{padding:16}}>
                            <div style={{fontWeight:700,fontSize:14,color:'var(--c-txt)',marginBottom:12}}>Start a conversation</div>
                            {network.length===0?
                                <div style={{textAlign:'center',padding:'16px 0',color:'var(--c-txt3)',fontSize:12}}>
                                    <Users size={24} style={{opacity:.3,marginBottom:6,display:'block',margin:'0 auto 6px'}}/>
                                    Connect with alumni to message them
                                </div>
                            :network.slice(0,5).map((n,i)=>(
                                <div key={n.id} style={{display:'flex',gap:8,alignItems:'center',padding:'8px 0',borderTop:i?'1px solid var(--c-bdr)':'none'}}>
                                    <Av name={n.name} size={34}/>
                                    <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontSize:12,fontWeight:700,color:'var(--c-txt)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n.name}</div>
                                        <div style={{fontSize:11,color:'var(--c-txt3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n.job_title||n.role}</div>
                                    </div>
                                    <button className="a-btn a-btn-o" style={{padding:'3px 10px',fontSize:11,flexShrink:0}} onClick={()=>openChat(n)}><MessageSquare size={11}/>Chat</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </>}

            {/* ─── INVITATIONS (REQUESTS) TAB ─── */}
            {tab==='requests'&&<div style={{flex:1}}>
                <div className="a-card" style={{padding:'16px 20px',marginBottom:8}}>
                    <div style={{fontSize:16,fontWeight:700,color:'var(--c-txt)'}}>Invitations ({requests.length})</div>
                </div>
                {ldR?<div style={{textAlign:'center',padding:40}}><div className="a-spinner" style={{margin:'0 auto',width:28,height:28}}/></div>
                :requests.length===0?<div className="a-card" style={{textAlign:'center',padding:'48px 24px'}}>
                    <Bell size={48} style={{color:'var(--c-txt3)',opacity:.3,marginBottom:14}}/>
                    <div style={{fontSize:16,fontWeight:600,color:'var(--c-txt)'}}>No pending invitations</div>
                    <div style={{fontSize:14,color:'var(--c-txt2)',marginTop:4}}>Invitations from alumni and students will appear here</div>
                </div>
                :requests.map(req=>(
                    <div key={req.id} className="a-card" style={{display:'flex',gap:12,padding:'14px 20px',marginBottom:6,animation:'aFadeIn 0.3s ease'}}>
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

        {/* ═══ MODALS & OVERLAYS ═══ */}
        {showPost&&<CreatePostModal user={user} onClose={()=>setShowPost(false)} onPost={doPost}/>}
        {chatWith&&<ChatPanel alumni={chatWith} currentUser={user} onClose={()=>setChatWith(null)} onMessageSent={fetchConversations} onGoToPost={goToPost}/>}
        {sharePost&&<SharePostModal post={sharePost} connections={network} onSend={doSendPost} onClose={()=>setSharePost(null)}/>}
    </div>
    )
}
