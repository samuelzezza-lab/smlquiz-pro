import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, BarChart3, BookOpen, Brain, Calculator, Check, ChevronDown, Clock3, GraduationCap, Layers3, LogIn, LogOut, Menu, Search, Target, Trophy, UserRound, X, CreditCard, Bookmark, CalendarDays, FolderPlus, Trash2 } from 'lucide-react'
import { supabase } from './lib/supabase'
import Flashcards from './components/Flashcards'
import SemestreFiltro from './components/SemestreFiltro'
import ExamExperiences from './components/ExamExperiences'

type Faculty = { id: string; nome: string; traduzioni?: Record<string,{nome?:string}> }
type Subject = { id: string; nome: string; facolta_id: string; anno_corso: number|null; corso_di_laurea: string|null; traduzioni?: Record<string,{nome?:string}> }
type Question = { id: string; testo_domanda: string; opzioni: string[]; spiegazione?: string|null; risposta_corretta?: string; correct_index?: number }
type ReviewResponse = { selectedAnswer?:string; selectedLetter?:string; correctAnswer?:string; correctLetter?:string; correctIndex?:number; isCorrect?:boolean; explanation?:string|null }
type ReviewItem = { question:Question; response:ReviewResponse|null }
type HistoryItem = { id:string; subject:string; score:number; total:number; correct:number; wrong:number; date:string; durationSeconds?:number }
type StudyCollection = { id:string; name:string; questionIds:string[]; createdAt:string }
type StudyExam = { id:string; name:string; date:string; note:string }
type View = 'home'|'quiz'|'result'|'progress'|'flashcards'|'semester'|'experiences'|'account'|'calculator'|'leaderboard'|'library'|'buy'
const pricing={single:'price_1UdBxFBCybXKHSfRwLeImDFx',jolly:'price_1Uc9yMBCybXKHSfRP4SJ4wuL',session:'price_1UcA1EBCybXKHSfRwyemWunq',site:'price_1UcC6ZBCybXKHSfRotiMdjz9',semestreSingle:'price_1UcVlkBCybXKHSfRs9hj7caG',semestreComplete:'price_1UcVo8BCybXKHSfRDXpOyB0q'}
const navigation:{id:View;label:string;icon:typeof BookOpen}[]=[
 {id:'home',label:'Panoramica',icon:BookOpen},{id:'quiz',label:'Quiz',icon:Brain},
 {id:'flashcards',label:'Flashcard',icon:Layers3},{id:'semester',label:'Semestre filtro',icon:Target},
 {id:'progress',label:'Progressi',icon:BarChart3},{id:'library',label:'Raccolte e calendario',icon:FolderPlus},{id:'buy',label:'Crediti e acquisti',icon:CreditCard},{id:'experiences',label:'Esperienze d’esame',icon:GraduationCap},
 {id:'leaderboard',label:'Classifica',icon:Trophy},{id:'calculator',label:'Calcolatrice media',icon:Calculator},
 {id:'account',label:'Account',icon:UserRound}
]

export default function StudyApp(){
 const [view,setView]=useState<View>('home')
 const [mobileMenu,setMobileMenu]=useState(false)
 const [faculties,setFaculties]=useState<Faculty[]>([])
 const [subjects,setSubjects]=useState<Subject[]>([])
 const [catalogLoading,setCatalogLoading]=useState(true)
 const [facultyId,setFacultyId]=useState('')
 const [year,setYear]=useState('1')
 const [subjectId,setSubjectId]=useState('')
 const [subjectSearch,setSubjectSearch]=useState('')
 const [confirmed,setConfirmed]=useState(false)
 const [user,setUser]=useState<any>(null)
 const [authOpen,setAuthOpen]=useState(false)
 const [authMode,setAuthMode]=useState<'login'|'reset'>('login')
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [authBusy,setAuthBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
 const [wallet,setWallet]=useState<any>(null)
 const [displayName,setDisplayName]=useState('')
 const [leaderboardOptIn,setLeaderboardOptIn]=useState(false)
 const [universityId,setUniversityId]=useState('')
 const [universityCourse,setUniversityCourse]=useState('')
 const [universities,setUniversities]=useState<{id:string;name:string;city:string}[]>([])
 const [profileBusy,setProfileBusy]=useState(false)
 const [digitalConsent,setDigitalConsent]=useState(false)
 const [purchaseSubjectSearch,setPurchaseSubjectSearch]=useState('')
 const [purchaseSubjectId,setPurchaseSubjectId]=useState('')
 const [sessionSearch,setSessionSearch]=useState('')
 const [sessionIds,setSessionIds]=useState<string[]>([])
 const [semesterPurchaseSubject,setSemesterPurchaseSubject]=useState('biologia')
 const [history,setHistory]=useState<HistoryItem[]>([])
 const [weakTopics,setWeakTopics]=useState<any[]>([])
 const [savedQuestions,setSavedQuestions]=useState<Question[]>([])
 const [studyCollections,setStudyCollections]=useState<StudyCollection[]>([])
 const [studyExams,setStudyExams]=useState<StudyExam[]>([])
 const [dailyGoal,setDailyGoal]=useState(20)
 const [studyDataReady,setStudyDataReady]=useState(false)
 const [collectionName,setCollectionName]=useState('')
 const [examName,setExamName]=useState('')
 const [examDate,setExamDate]=useState('')
 const [examNote,setExamNote]=useState('')
 const [streak,setStreak]=useState<any>({current_streak:0,longest_streak:0})
 const [attemptId,setAttemptId]=useState('')
 const [questions,setQuestions]=useState<Question[]>([])
 const [questionIndex,setQuestionIndex]=useState(0)
 const [selectedOption,setSelectedOption]=useState<number|null>(null)
 const [answered,setAnswered]=useState<Record<string,number>>({})
 const [seconds,setSeconds]=useState(450)
 const [review,setReview]=useState<ReviewItem[]>([])
 const [result,setResult]=useState<any>(null)
 const [leaderboard,setLeaderboard]=useState<any[]>([])
 const [grade,setGrade]=useState('')
 const [cfu,setCfu]=useState('')
 const [grades,setGrades]=useState<{grade:number;cfu:number}[]>([])

 const faculty=faculties.find(f=>f.id===facultyId)
 const selectedSubject=subjects.find(s=>s.id===subjectId)
 const filteredSubjects=useMemo(()=>subjects.filter(s=>s.facolta_id===facultyId&&(year==='all'||String(s.anno_corso||'')===year)),[subjects,facultyId,year])
 const visibleSubjects=useMemo(()=>filteredSubjects.filter(s=>(s.nome+' '+(s.corso_di_laurea||'')).toLocaleLowerCase('it').includes(subjectSearch.toLocaleLowerCase('it'))),[filteredSubjects,subjectSearch])
 const currentQuestion=questions[questionIndex]
 const completedCount=Object.keys(answered).length
 const percent=questions.length?Math.round(completedCount/questions.length*100):0

 useEffect(()=>{
  if(!supabase){setCatalogLoading(false);setNotice('Collegamento al database non disponibile.');return}
  let active=true
  const cached=(()=>{try{return JSON.parse(localStorage.getItem('smlquiz.catalog.v1')||'null')}catch{return null}})()
  if(Array.isArray(cached?.faculties)&&Array.isArray(cached?.subjects)){
   setFaculties(cached.faculties);setSubjects(cached.subjects);setCatalogLoading(false)
   const med=cached.faculties.find((f:Faculty)=>f.nome==='Medicina e Chirurgia')
   if(med)setFacultyId(med.id)
  }
  Promise.all([
   supabase.from('facolta').select('id,nome,traduzioni').order('nome'),
   supabase.from('materie').select('id,nome,traduzioni,facolta_id,anno_corso,corso_di_laurea').order('nome')
  ]).then(([f,s])=>{
   if(!active)return
   if(f.error||s.error){setNotice('Non è stato possibile caricare il catalogo. Riprova tra poco.');setCatalogLoading(false);return}
   const fs=(f.data||[]) as Faculty[],ss=(s.data||[]) as Subject[]
   setFaculties(fs);setSubjects(ss);setCatalogLoading(false)
   try{localStorage.setItem('smlquiz.catalog.v1',JSON.stringify({faculties:fs,subjects:ss,savedAt:Date.now()}))}catch{}
   const med=fs.find(x=>x.nome==='Medicina e Chirurgia')||fs[0]
   if(med){setFacultyId(med.id);const first=ss.find(x=>x.facolta_id===med.id&&x.anno_corso===1);if(first){setSubjectId(first.id);setSubjectSearch(first.nome)}}
  }).catch(()=>{if(active){setCatalogLoading(false);setNotice('Errore di connessione durante il caricamento del catalogo.')}})
  return()=>{active=false}
 },[])

 useEffect(()=>{
  if(!supabase)return
  let active=true
  supabase.auth.getSession().then(({data})=>{if(active){setUser(data.session?.user??null)}}).catch(()=>{})
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user??null)})
  return()=>{active=false;data.subscription.unsubscribe()}
 },[])

 useEffect(()=>{
  if(!supabase||!user)return
  let active=true
  Promise.all([
   supabase.functions.invoke('quiz-api',{body:{action:'wallet'}}),
   supabase.functions.invoke('quiz-api',{body:{action:'history'}}),
   supabase.functions.invoke('quiz-api',{body:{action:'streaks'}})
  ]).then(([w,h,s])=>{
   if(!active)return
   if(!w.error&&w.data)setWallet(w.data)
   if(!h.error&&Array.isArray(h.data?.attempts))setHistory(h.data.attempts)
   if(!s.error&&s.data?.streak)setStreak(s.data.streak)
  }).catch(()=>{})
  return()=>{active=false}
 },[user?.id])

 useEffect(()=>{
  const client=supabase
  if(!client||!user){setStudyDataReady(false);setSavedQuestions([]);setStudyCollections([]);setStudyExams([]);setDailyGoal(20);return}
  let active=true
  setStudyDataReady(false)
  client.from('user_study_data').select('data').eq('user_id',user.id).maybeSingle().then(({data,error})=>{
   if(!active)return
   if(error){notify('Sincronizzazione dei materiali personali non disponibile.');setStudyDataReady(true);return}
   const cloud=data?.data||{}
   setSavedQuestions(Array.isArray(cloud.savedQuestions)?cloud.savedQuestions:[])
   setStudyCollections(Array.isArray(cloud.studyCollections)?cloud.studyCollections:[])
   setStudyExams(Array.isArray(cloud.studyExams)?cloud.studyExams:[])
   if(Number.isFinite(Number(cloud.dailyGoal)))setDailyGoal(Math.max(1,Math.min(100,Number(cloud.dailyGoal))))
   setStudyDataReady(true)
  },()=>{if(active){notify('Errore durante il caricamento dei materiali personali.');setStudyDataReady(true)}})
  return()=>{active=false}
 },[user?.id])

 useEffect(()=>{
  const client=supabase
  if(!client||!user||!studyDataReady)return
  const payload={savedQuestions,studyCollections,studyExams,dailyGoal}
  const timer=window.setTimeout(()=>{
   client.from('user_study_data').upsert({user_id:user.id,data:payload},{onConflict:'user_id'}).then(({error})=>{
    if(error)notify('Non è riuscita la sincronizzazione dei materiali sul cloud.')
   })
  },700)
  return()=>window.clearTimeout(timer)
 },[savedQuestions,studyCollections,studyExams,dailyGoal,user?.id,studyDataReady])

 useEffect(()=>{
  if(!supabase||!user)return
  let active=true
  supabase.functions.invoke('quiz-api',{body:{action:'weak-topics'}}).then(({data,error})=>{
   if(active&&!error&&Array.isArray(data?.topics))setWeakTopics(data.topics)
  }).catch(()=>{})
  return()=>{active=false}
 },[user?.id])

 useEffect(()=>{
  if(!supabase||!user)return
  let active=true
  Promise.all([
   supabase.functions.invoke('quiz-api',{body:{action:'profile',mode:'read'}}),
   supabase.from('universities').select('id,name,city').order('name')
  ]).then(([profileResult,universityResult])=>{
   if(!active)return
   if(!profileResult.error&&profileResult.data?.profile){
    const p=profileResult.data.profile
    setDisplayName(p.display_name||'')
    setLeaderboardOptIn(Boolean(p.leaderboard_opt_in))
    setUniversityId(p.university_id||'')
    setUniversityCourse(p.university_course||'')
   }
   if(!universityResult.error)setUniversities((universityResult.data||[]) as {id:string;name:string;city:string}[])
  }).catch(()=>{})
  return()=>{active=false}
 },[user?.id])

 useEffect(()=>{
  if(view!=='quiz'||!attemptId)return
  if(seconds<=0){if(!busy)void finishQuiz();return}
  const timer=window.setInterval(()=>setSeconds(v=>Math.max(0,v-1)),1000)
  return()=>window.clearInterval(timer)
 },[view,attemptId,seconds,busy])

 function chooseFaculty(id:string){
  setFacultyId(id);setSubjectId('');setSubjectSearch('');setConfirmed(false)
  const first=subjects.find(s=>s.facolta_id===id&&(year==='all'||String(s.anno_corso||'')===year))
  if(first){setSubjectId(first.id);setSubjectSearch(first.nome)}
 }
 function chooseYear(value:string){
  setYear(value);setSubjectId('');setSubjectSearch('');setConfirmed(false)
  const first=subjects.find(s=>s.facolta_id===facultyId&&(value==='all'||String(s.anno_corso||'')===value))
  if(first){setSubjectId(first.id);setSubjectSearch(first.nome)}
 }
 function changeSubject(value:string){
  setSubjectSearch(value);setConfirmed(false)
  const exact=filteredSubjects.find(s=>s.nome.toLocaleLowerCase('it')===value.trim().toLocaleLowerCase('it'))
  setSubjectId(exact?.id||'')
 }
 function notify(message:string){setNotice(message);window.setTimeout(()=>setNotice(v=>v===message?'':v),4500)}
 function go(next:View){setView(next);setMobileMenu(false);setNotice('');if(next==='home')setAuthOpen(false)}
 async function authenticate(e:FormEvent){
  e.preventDefault();if(!supabase||authBusy)return
  setAuthBusy(true)
  try{
   if(authMode==='reset'){
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/app/'})
    if(error)throw error
    notify('Ti abbiamo inviato un link per reimpostare la password.');setAuthOpen(false);return
   }
   const {error}=await supabase.auth.signInWithPassword({email,password})
   if(error)throw error
   setAuthOpen(false);setPassword('');notify('Accesso effettuato.')
  }catch(err){notify(err instanceof Error?err.message:'Accesso non riuscito.')}
  finally{setAuthBusy(false)}
 }
 async function googleLogin(){
  if(!supabase)return
  const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/app/'}})
  if(error)notify(error.message)
 }
 async function logout(){if(!supabase)return;const {error}=await supabase.auth.signOut();if(error){notify(error.message);return}setWallet(null);setHistory([]);go('home');notify('Hai effettuato la disconnessione.')}
 async function refreshAccount(){
  if(!supabase||!user)return
  const [w,h,s]=await Promise.all([
   supabase.functions.invoke('quiz-api',{body:{action:'wallet'}}),
   supabase.functions.invoke('quiz-api',{body:{action:'history'}}),
   supabase.functions.invoke('quiz-api',{body:{action:'streaks'}})
  ])
  if(!w.error&&w.data)setWallet(w.data)
  if(!h.error&&Array.isArray(h.data?.attempts))setHistory(h.data.attempts)
  if(!s.error&&s.data?.streak)setStreak(s.data.streak)
  const {data:weak}=await supabase.functions.invoke('quiz-api',{body:{action:'weak-topics'}})
  if(Array.isArray(weak?.topics))setWeakTopics(weak.topics)
 }
 async function startQuiz(){
  if(!user){setAuthOpen(true);return}
  if(!supabase||!selectedSubject){notify('Seleziona e conferma una materia prima di iniziare.');return}
  setBusy(true)
  try{
   const [{data:sets,error:setsError},{data:done,error:doneError}]=await Promise.all([
    supabase.from('quiz_sets').select('id,materia_id,quiz_number,status,question_count').eq('materia_id',selectedSubject.id).eq('status','ready').eq('question_count',10).order('quiz_number'),
    supabase.from('quiz_attempts').select('quiz_set_id').eq('user_id',user.id).eq('materia_id',selectedSubject.id).eq('status','completed').not('quiz_set_id','is',null)
   ])
   if(setsError)throw setsError;if(doneError)throw doneError
   const used=new Set((done||[]).map((x:any)=>x.quiz_set_id))
   const next=(sets||[]).find((x:any)=>!used.has(x.id))
   if(!next){notify(sets?.length?'Hai completato tutti i quiz attualmente disponibili per questa materia.':'Non ci sono ancora quiz pronti per questa materia.');return}
   const {data,error}=await supabase.functions.invoke('quiz-api',{body:{action:'start',materiaId:selectedSubject.id,quizSetId:next.id,idempotencyKey:crypto.randomUUID(),language:'it'}})
   if(error)throw error;if(data?.error)throw new Error(data.error)
   if(!Array.isArray(data?.questions)||data.questions.length!==10)throw new Error('La simulazione non contiene esattamente 10 domande valide.')
   setAttemptId(data.attemptId);setQuestions(data.questions);setQuestionIndex(0);setSelectedOption(null);setAnswered({});setSeconds(450);setReview([]);setResult(null);go('quiz')
  }catch(err){notify(err instanceof Error?err.message:'Non è stato possibile avviare il quiz.')}
  finally{setBusy(false)}
 }
 async function saveAnswer(){
  if(!supabase||!attemptId||!currentQuestion||selectedOption===null||answered[currentQuestion.id]!==undefined)return
  setBusy(true)
  try{
   const {data,error}=await supabase.functions.invoke('quiz-api',{body:{action:'answer',attemptId,questionId:currentQuestion.id,selectedAnswer:currentQuestion.opzioni[selectedOption],language:'it'}})
   if(error)throw error;if(data?.error)throw new Error(data.error)
   if(data?.saved!==true)throw new Error('La risposta non è stata registrata. Riprova.')
   setAnswered(v=>({...v,[currentQuestion.id]:selectedOption}));setSelectedOption(null)
  }catch(err){notify(err instanceof Error?err.message:'Errore nel salvataggio della risposta.')}
  finally{setBusy(false)}
 }
 async function finishQuiz(){
  if(!supabase||!attemptId||busy)return
  setBusy(true)
  try{
   const {data,error}=await supabase.functions.invoke('quiz-api',{body:{action:'finish',attemptId,language:'it'}})
   if(error)throw error;if(data?.error)throw new Error(data.error)
   setReview(Array.isArray(data.review)?data.review:[])
   setResult(data);setAttemptId('');setView('result')
   await refreshAccount()
  }catch(err){notify(err instanceof Error?err.message:'Non è stato possibile completare la simulazione.')}
  finally{setBusy(false)}
 }
 async function buyPackage(priceId:string,subjectIds:string[]=[],consentConfirmed=false){
  const recurring=priceId===pricing.site
  if(!recurring&&!consentConfirmed){notify('Per continuare, conferma il consenso richiesto per il contenuto digitale.');return}
  if(!supabase||!user){setAuthOpen(true);return}
  try{
   const body={priceId,subjectIds,...(!recurring?{digitalContentConsent:true,digitalContentConsentAt:new Date().toISOString()}:{})}
   const {data,error}=await supabase.functions.invoke('stripe-checkout',{body,headers:{'Idempotency-Key':crypto.randomUUID()}})
   if(error)throw error
   if(data?.error)throw new Error(data.error)
   if(typeof data?.url!=='string'||!data.url.startsWith('https://checkout.stripe.com/'))throw new Error('Checkout non disponibile al momento.')
   window.location.assign(data.url)
  }catch(err){notify(err instanceof Error?err.message:'Non è stato possibile avviare il pagamento.')}
 }
 async function saveProfile(e:FormEvent){
  e.preventDefault();if(!supabase||!user)return
  setProfileBusy(true)
  try{
   const {data,error}=await supabase.functions.invoke('quiz-api',{body:{action:'profile',mode:'update',displayName,language:'it',leaderboardOptIn,universityId:universityId||null,universityCourse}})
   if(error)throw error;if(data?.error)throw new Error(data.error)
   notify('Profilo aggiornato.')
  }catch(err){notify(err instanceof Error?err.message:'Impossibile salvare il profilo.')}
  finally{setProfileBusy(false)}
 }
 function toggleSessionSubject(id:string){
  setSessionIds(v=>v.includes(id)?v.filter(x=>x!==id):v.length<5?[...v,id]:v)
 }
 async function loadLeaderboard(){
  if(!supabase||!subjectId)return
  setBusy(true)
  try{const {data,error}=await supabase.functions.invoke('quiz-api',{body:{action:'subject-leaderboard',materiaId:subjectId}});if(error)throw error;if(data?.error)throw new Error(data.error);setLeaderboard(data?.leaderboard||[])}
  catch(err){notify(err instanceof Error?err.message:'Classifica non disponibile.')}finally{setBusy(false)}
 }
 function saveQuestion(question:Question){
  if(savedQuestions.some(q=>q.id===question.id)){notify('Questa domanda è già salvata.');return}
  setSavedQuestions(v=>[question,...v]);notify('Domanda aggiunta ai materiali salvati.')
 }
 function removeSavedQuestion(id:string){setSavedQuestions(v=>v.filter(q=>q.id!==id))}
 function createCollection(e:FormEvent){
  e.preventDefault();const name=collectionName.trim();if(!name)return
  setStudyCollections(v=>[{id:crypto.randomUUID(),name,questionIds:[],createdAt:new Date().toISOString()},...v]);setCollectionName('')
 }
 function addQuestionToCollection(collectionId:string,questionId:string){
  setStudyCollections(v=>v.map(c=>c.id===collectionId?{...c,questionIds:Array.from(new Set([...c.questionIds,questionId]))}:c))
  notify('Domanda aggiunta alla raccolta.')
 }
 function createStudyExam(e:FormEvent){
  e.preventDefault();if(!examName.trim()||!examDate)return
  setStudyExams(v=>[...v,{id:crypto.randomUUID(),name:examName.trim(),date:examDate,note:examNote.trim()}].sort((a,b)=>a.date.localeCompare(b.date)))
  setExamName('');setExamDate('');setExamNote('')
 }
 function addGrade(e:React.FormEvent){
  e.preventDefault();const g=Number(grade),c=Number(cfu)
  if(!Number.isFinite(g)||g<18||g>30||!Number.isFinite(c)||c<=0){notify('Inserisci un voto tra 18 e 30 e CFU maggiori di zero.');return}
  setGrades(v=>[...v,{grade:g,cfu:c}]);setGrade('');setCfu('')
 }
 const average=grades.length?grades.reduce((n,x)=>n+x.grade*x.cfu,0)/grades.reduce((n,x)=>n+x.cfu,0):0
 const clock=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')

 return <div className="app-shell">
  <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
   <a className="brand" href="/" onClick={e=>{e.preventDefault();location.href='/'}}><span className="brand-symbol">S<span>.</span></span><span className="brand-name">SMLQUIZ <b>PRO</b></span></a>
   <div className="side-caption">IL TUO SPAZIO UNIVERSITARIO</div>
   <nav className="side-nav">{navigation.map(item=>{const Icon=item.icon;return <button key={item.id} className={`nav-link ${view===item.id?'active':''}`} onClick={()=>go(item.id)}><Icon size={18}/><span>{item.label}</span>{view===item.id&&<span className="active-mark"/>}</button>})}</nav>
   <div className="sidebar-bottom"><div className="sidebar-tip"><BookOpen size={17}/><strong>Studia con metodo.</strong><p>Quiz, ripasso e strumenti per organizzare il tuo percorso.</p></div><div className="sidebar-foot">© 2026 SMLQUIZ Pro</div></div>
  </aside>
  {mobileMenu&&<button className="mobile-scrim" aria-label="Chiudi menu" onClick={()=>setMobileMenu(false)}/>}
  <main className="main-area">
   <header className="topbar"><button className="mobile-menu-button" onClick={()=>setMobileMenu(v=>!v)} aria-label="Apri menu"><Menu size={20}/></button><div className="breadcrumb"><a href="/" onClick={e=>{e.preventDefault();location.href='/'}}>SMLQUIZ Pro</a><b>/</b><strong>{navigation.find(x=>x.id===view)?.label||'Risultato'}</strong></div><div className="topbar-right">{user?<><span className="status-dot"/><span>{user.email}</span><button className="account-logout" onClick={()=>void logout()} aria-label="Esci"><LogOut size={16}/></button></>:<button className="account-login" onClick={()=>setAuthOpen(true)}><LogIn size={15}/> Accedi</button>}</div></header>
   <div className="content">
    {view==='home'&&<><section className="welcome-row"><div><div className="eyebrow">IL TUO PERCORSO UNIVERSITARIO</div><h1>Studiare meglio,<br/><em>partendo da qui.</em></h1><p className="welcome-copy">Scegli il tuo corso e la materia. Poi decidi come prepararti: esercitazione, ripasso o simulazione.</p></div><div className="welcome-art"><div className="art-core"><BookOpen size={42}/></div></div></section>
     <section className="path-panel"><div className="panel-heading"><div><span className="section-kicker">01 / IL TUO PERCORSO</span><h2>Da dove vuoi iniziare?</h2><p>Catalogo universitario: {catalogLoading?'caricamento…':faculties.length+' facoltà · '+subjects.length+' materie'}.</p></div><div className="panel-icon"><GraduationCap size={21}/></div></div>
      <div className="selection-grid"><label className="field"><span>Facoltà</span><div className="select-wrap"><select value={facultyId} onChange={e=>chooseFaculty(e.target.value)} disabled={catalogLoading}><option value="">Seleziona facoltà</option>{faculties.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select><ChevronDown size={16}/></div></label>
       <label className="field"><span>Anno</span><div className="select-wrap"><select value={year} onChange={e=>chooseYear(e.target.value)}><option value="all">Tutti gli anni</option>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}° anno</option>)}</select><ChevronDown size={16}/></div></label>
       <label className="field subject-field"><span>Materia</span><div className="select-wrap subject-wrap"><input list="subject-options" value={subjectSearch} onChange={e=>changeSubject(e.target.value)} placeholder="Scrivi o cerca una materia" disabled={!facultyId}/><datalist id="subject-options">{visibleSubjects.map(s=><option key={s.id} value={s.nome}/>)}</datalist><Search size={16}/></div></label>
       <button className={`confirm-button ${confirmed?'confirmed':''}`} onClick={()=>{if(!selectedSubject){notify('Seleziona una materia valida dal catalogo.');return}setConfirmed(true);notify('Percorso confermato. Scegli lo strumento con cui vuoi studiare.')}}>{confirmed?<><Check size={17}/> Percorso confermato</>:<>Conferma scelta <ArrowRight size={17}/></>}</button>
      </div>
      {confirmed&&selectedSubject&&<div className="confirmed-summary"><Check size={15}/><span>{faculty?.nome}</span><b>·</b><span>{selectedSubject.anno_corso?selectedSubject.anno_corso+'° anno':'Anno non specificato'}</span><b>·</b><strong>{selectedSubject.nome}</strong></div>}
     </section>
     <section className="tools-section"><div className="tools-heading"><div><span className="section-kicker">02 / SCEGLI IL TUO STRUMENTO</span><h2>Come vuoi studiare?</h2></div><span className="tools-hint">Tre modi per prepararti</span></div><div className="tool-grid">
      <button className="tool-card" onClick={()=>{if(!confirmed){notify('Conferma prima il percorso di studio.');return}void startQuiz()}}><div className="tool-top"><span className="tool-icon quiz-icon"><Brain size={21}/></span><span className="tool-number">01</span></div><h3>Quiz universitari</h3><p>10 domande a risposta multipla. Le soluzioni si vedono soltanto alla fine.</p><span className="tool-action">Avvia un quiz <ArrowRight size={16}/></span></button>
      <button className="tool-card" onClick={()=>go('flashcards')}><div className="tool-top"><span className="tool-icon cards-icon"><Layers3 size={21}/></span><span className="tool-number">02</span></div><h3>Flashcard</h3><p>Ripasso attivo per consolidare definizioni e concetti.</p><span className="tool-action">Apri flashcard <ArrowRight size={16}/></span></button>
      <button className="tool-card" onClick={()=>go('semester')}><div className="tool-top"><span className="tool-icon target-icon"><Target size={21}/></span><span className="tool-number">03</span></div><h3>Semestre filtro</h3><p>Allenamento dedicato a Biologia, Chimica e Fisica.</p><span className="tool-action">Entra nell'area <ArrowRight size={16}/></span></button>
     </div></section>
     <div className="bottom-note"><Clock3 size={15}/><span>Catalogo collegato al database: {faculties.length} facoltà e {subjects.length} materie.</span></div>
    </>}
    {view==='quiz'&&currentQuestion&&<section className="quiz-workspace"><div className="quiz-head"><div><span className="section-kicker">SIMULAZIONE UNIVERSITARIA</span><h1>{selectedSubject?.nome||'Quiz'}</h1><p>Domanda {questionIndex+1} di {questions.length} · {completedCount} risposte registrate</p></div><div className="quiz-clock"><Clock3 size={16}/>{clock}</div></div><div className="quiz-progress"><span style={{width:percent+'%'}}/></div><article className="question-card"><div className="question-meta">QUESITO {String(questionIndex+1).padStart(2,'0')}</div><h2>{currentQuestion.testo_domanda}</h2><div className="answer-options">{currentQuestion.opzioni.map((option,i)=><button key={i} disabled={answered[currentQuestion.id]!==undefined} className={`answer-option ${selectedOption===i?'selected':''} ${answered[currentQuestion.id]===i?'locked':''}`} onClick={()=>setSelectedOption(i)}><span>{String.fromCharCode(65+i)}</span>{option}{answered[currentQuestion.id]===i&&<Check size={16}/>}</button>)}</div><div className="question-actions">{answered[currentQuestion.id]!==undefined?<button className="confirm-button" onClick={()=>{if(questionIndex===questions.length-1)void finishQuiz();else{setQuestionIndex(v=>v+1);setSelectedOption(null)}}}>{questionIndex===questions.length-1?'Concludi simulazione':'Prossima domanda'} <ArrowRight size={16}/></button>:<button className="confirm-button" disabled={selectedOption===null||busy} onClick={()=>void saveAnswer()}>{busy?'Salvataggio…':'Conferma risposta'} <ArrowRight size={16}/></button>}</div></article></section>}
    {view==='result'&&<section className="result-workspace"><div className="eyebrow">SIMULAZIONE COMPLETATA</div><h1>Risultato finale</h1><div className="result-score"><strong>{(Number(result?.score??0)*3).toFixed(1)}</strong><span>/ 30</span><p>{result?.correct??0} risposte corrette su {result?.total??10}</p></div><h2>Revisione delle risposte</h2>{review.map((item,i)=>{const q=item.question;const r=item.response;return <article className="review-card" key={q.id}><small>DOMANDA {i+1}</small><h3>{q.testo_domanda}</h3><p className={r?.isCorrect?'review-correct':'review-wrong'}>La tua risposta: {r?.selectedAnswer||'Non risposta'} · Corretta: {r?.correctAnswer||q.risposta_corretta||'—'}</p><p>{r?.explanation||q.spiegazione||'Spiegazione non disponibile.'}</p><button className="back-button" onClick={()=>saveQuestion(q)}><Bookmark size={14}/> Salva domanda</button></article>})}<button className="confirm-button" onClick={()=>go('home')}>Torna alla panoramica <ArrowRight size={16}/></button></section>}
    {view==='progress'&&<section className="inner-content"><div className="inner-heading"><div className="inner-icon"><BarChart3/></div><div><span className="section-kicker">IL TUO ANDAMENTO</span><h1>I miei progressi</h1><p>Risultati delle simulazioni completate.</p></div></div><div className="progress-stats"><div><small>Sessioni completate</small><strong>{history.length}</strong></div><div><small>Giorni consecutivi</small><strong>{streak.current_streak||0}</strong></div><div><small>Media punteggi</small><strong>{history.length?(history.reduce((n,x)=>n+x.score,0)/history.length*3).toFixed(1):'—'}</strong></div></div><div className="workspace-card"><label className="goal-setting">Obiettivo quotidiano di studio <input type="number" min="1" max="100" value={dailyGoal} onChange={e=>setDailyGoal(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/> <span>minuti</span></label>{weakTopics.length>0&&<><h2>Argomenti da rinforzare</h2>{weakTopics.slice(0,6).map((topic,i)=><div className="history-row" key={i}><span>{topic.topic}</span><strong>{Math.round(topic.errorRate*100)}% errori</strong></div>)}</>}</div><div className="history-list"><h2>Attività recente</h2>{history.length?history.slice(0,20).map(h=><div className="history-row" key={h.id}><div><b>{h.subject}</b><small>{new Date(h.date).toLocaleDateString('it-IT')}</small></div><strong>{(h.score*3).toFixed(1)}/30</strong></div>):<p>Completa il tuo primo quiz per vedere qui i risultati.</p>}</div></section>}
    {view==='library'&&<section className="inner-content"><div className="inner-heading"><div className="inner-icon"><FolderPlus/></div><div><span className="section-kicker">I TUOI MATERIALI</span><h1>Raccolte e calendario</h1><p>Domande salvate, raccolte personali e prossimi appelli.</p></div></div><div className="library-grid"><section className="workspace-card"><h2>Domande salvate ({savedQuestions.length})</h2>{savedQuestions.length?savedQuestions.map(q=><article className="review-card" key={q.id}><h3>{q.testo_domanda}</h3><p>{q.spiegazione||'Nessuna spiegazione disponibile.'}</p><div className="library-actions"><select defaultValue="" onChange={e=>{if(e.target.value)addQuestionToCollection(e.target.value,q.id)}}><option value="">Aggiungi a una raccolta…</option>{studyCollections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="back-button" onClick={()=>removeSavedQuestion(q.id)}><Trash2 size={14}/> Rimuovi</button></div></article>):<p>Alla fine di un quiz puoi salvare le domande che vuoi ripassare.</p>}</section><section className="workspace-card"><h2>Le tue raccolte</h2><form className="grade-form" onSubmit={createCollection}><input value={collectionName} onChange={e=>setCollectionName(e.target.value)} placeholder="Nome della raccolta" required/><button className="confirm-button"><FolderPlus size={15}/> Crea raccolta</button></form>{studyCollections.length?studyCollections.map(c=><div className="history-row" key={c.id}><span>{c.name}<small>{c.questionIds.length} domande</small></span><button className="icon-remove" onClick={()=>setStudyCollections(v=>v.filter(x=>x.id!==c.id))}><Trash2 size={15}/></button></div>):<p>Crea raccolte per organizzare le domande da ripassare.</p>}</section><section className="workspace-card"><h2>Calendario esami</h2><form className="exam-form" onSubmit={createStudyExam}><input value={examName} onChange={e=>setExamName(e.target.value)} placeholder="Nome dell'esame" required/><input type="date" value={examDate} onChange={e=>setExamDate(e.target.value)} required/><input value={examNote} onChange={e=>setExamNote(e.target.value)} placeholder="Nota (facoltativa)"/><button className="confirm-button"><CalendarDays size={15}/> Aggiungi appello</button></form>{studyExams.length?studyExams.map(ex=><div className="history-row" key={ex.id}><div><b>{ex.name}</b><small>{new Date(ex.date+'T12:00:00').toLocaleDateString('it-IT')} {ex.note?'· '+ex.note:''}</small></div><button className="icon-remove" onClick={()=>setStudyExams(v=>v.filter(x=>x.id!==ex.id))}><Trash2 size={15}/></button></div>):<p>Registra le date degli esami per tenere sott'occhio i prossimi appelli.</p>}</section></div></section>}
    {view==='flashcards'&&<Flashcards subjects={subjects} user={user?{id:user.id}:null} onBuy={(priceId,subjectIds,consent)=>void buyPackage(priceId,subjectIds,consent)} notify={notify} showAds={false} onStartQuiz={(id)=>{const item=subjects.find(x=>x.id===id);if(item){setFacultyId(item.facolta_id);setYear(item.anno_corso?String(item.anno_corso):'all');setSubjectId(item.id);setSubjectSearch(item.nome);setConfirmed(true);go('home');notify('Materia selezionata. Puoi avviare il quiz dal tuo percorso.')}}}/>}
    {view==='semester'&&<SemestreFiltro onBuyPackage={(priceId,subjectIds,consent)=>void buyPackage(priceId,subjectIds,consent)} onRequireLogin={()=>setAuthOpen(true)} onFreeComplete={()=>void refreshAccount()}/>}
    {view==='experiences'&&<ExamExperiences subjects={subjects} faculties={faculties} user={user?{id:user.id,email:user.email}:null} displayName={user?.user_metadata?.display_name||user?.email?.split('@')[0]||'Studente'} universityName={''} notify={notify} onRequireLogin={()=>setAuthOpen(true)}/>}
    {view==='leaderboard'&&<section className="workspace-card"><span className="section-kicker">CLASSIFICA PER MATERIA</span><h1>Classifica</h1><p>Seleziona una materia nel tuo percorso per caricare la graduatoria.</p><button className="confirm-button" disabled={!subjectId||busy} onClick={()=>void loadLeaderboard()}>Carica classifica <ArrowRight size={16}/></button>{leaderboard.map((row,i)=><div className="history-row" key={i}><span>{row.rank_position||i+1}. {row.display_name}</span><strong>{row.score}/30</strong></div>)}</section>}
    {view==='calculator'&&<section className="workspace-card"><span className="section-kicker">STRUMENTO DI STUDIO</span><h1>Calcolatrice della media ponderata</h1><p>Inserisci voto e CFU per ogni esame. La media viene calcolata in base ai crediti.</p><form className="grade-form" onSubmit={addGrade}><input type="number" min="18" max="30" placeholder="Voto (18–30)" value={grade} onChange={e=>setGrade(e.target.value)} required/><input type="number" min="1" placeholder="CFU" value={cfu} onChange={e=>setCfu(e.target.value)} required/><button className="confirm-button">Aggiungi esame</button></form>{grades.map((g,i)=><div className="history-row" key={i}><span>Esame {i+1} · {g.cfu} CFU</span><strong>{g.grade}/30</strong></div>)}<div className="average-result"><small>Media ponderata</small><strong>{average?average.toFixed(2):'—'}/30</strong><small>{grades.reduce((n,g)=>n+g.cfu,0)} CFU registrati</small></div></section>}
    {view==='buy'&&<section className="inner-content"><div className="inner-heading"><div className="inner-icon"><CreditCard/></div><div><span className="section-kicker">CREDITI E ACCESSI</span><h1>Pacchetti di studio</h1><p>Scegli l'accesso più adatto al tuo percorso universitario.</p></div></div>{!user?<div className="workspace-card"><p>Accedi per acquistare crediti e pacchetti.</p><button className="confirm-button" onClick={()=>setAuthOpen(true)}>Accedi <LogIn size={15}/></button></div>:<><label className="digital-consent"><input type="checkbox" checked={digitalConsent} onChange={e=>setDigitalConsent(e.target.checked)}/> Acconsento all'attivazione immediata dei contenuti digitali acquistati e riconosco che, nei casi previsti dalla legge, l'avvio della fornitura può comportare la perdita del diritto di recesso.</label><div className="pricing-grid"><article className="pricing-plan"><div><small>UNA MATERIA</small><h3>Pass Singola Materia</h3><p>Sblocca i quiz e le flashcard della materia scelta, incluse le spiegazioni e i contenuti aggiunti successivamente.</p><strong>1,99 €</strong></div><input type="search" value={purchaseSubjectSearch} onChange={e=>{setPurchaseSubjectSearch(e.target.value);setPurchaseSubjectId('')}} placeholder="Cerca una materia…"/><div className="purchase-results">{subjects.filter(x=>(x.nome+' '+(faculties.find(f=>f.id===x.facolta_id)?.nome||'')).toLocaleLowerCase('it').includes(purchaseSubjectSearch.toLocaleLowerCase('it'))).slice(0,7).map(x=><button type="button" className={purchaseSubjectId===x.id?'selected':''} key={x.id} onClick={()=>{setPurchaseSubjectId(x.id);setPurchaseSubjectSearch(x.nome)}}>{x.nome} <small>{x.anno_corso?x.anno_corso+'° anno':''}</small></button>)}</div><button className="confirm-button" disabled={!digitalConsent||!purchaseSubjectId} onClick={()=>void buyPackage(pricing.single,[purchaseSubjectId],digitalConsent)}>Acquista pass <ArrowRight size={15}/></button></article><article className="pricing-plan"><div><small>CREDITI JOLLY</small><h3>100 Quiz Jolly</h3><p>100 crediti per avviare quiz bloccati in qualsiasi materia. Ogni quiz avviato consuma un credito; i crediti non scadono.</p><strong>3,49 €</strong></div><button className="confirm-button" disabled={!digitalConsent} onClick={()=>void buyPackage(pricing.jolly,[],digitalConsent)}>Acquista crediti <ArrowRight size={15}/></button></article><article className="pricing-plan"><div><small>5 MATERIE · 180 GIORNI</small><h3>Pass Sessione</h3><p>Sblocca i quiz e le spiegazioni di cinque materie diverse per 180 giorni dall'attivazione.</p><strong>4,99 €</strong><p className="selection-counter">{sessionIds.length}/5 materie selezionate</p></div><input type="search" value={sessionSearch} onChange={e=>setSessionSearch(e.target.value)} placeholder="Cerca le materie…"/><div className="purchase-results">{subjects.filter(x=>(x.nome+' '+(faculties.find(f=>f.id===x.facolta_id)?.nome||'')).toLocaleLowerCase('it').includes(sessionSearch.toLocaleLowerCase('it'))).slice(0,10).map(x=><label className="purchase-option" key={x.id}><input type="checkbox" checked={sessionIds.includes(x.id)} disabled={!sessionIds.includes(x.id)&&sessionIds.length>=5} onChange={()=>toggleSessionSubject(x.id)}/>{x.nome}</label>)}</div><button className="confirm-button" disabled={!digitalConsent||sessionIds.length!==5} onClick={()=>void buyPackage(pricing.session,sessionIds,digitalConsent)}>Acquista pass 5 materie <ArrowRight size={15}/></button></article><article className="pricing-plan"><div><small>SEMESTRE FILTRO</small><h3>Pass per una materia</h3><p>Accesso alle simulazioni didattiche della materia selezionata.</p><strong>1,99 €</strong></div><select value={semesterPurchaseSubject} onChange={e=>setSemesterPurchaseSubject(e.target.value)}><option value="biologia">Biologia</option><option value="chimica">Chimica</option><option value="fisica">Fisica</option></select><button className="confirm-button" disabled={!digitalConsent} onClick={()=>void buyPackage(pricing.semestreSingle,[semesterPurchaseSubject],digitalConsent)}>Acquista pass <ArrowRight size={15}/></button></article><article className="pricing-plan featured"><div><small>SEMESTRE FILTRO</small><h3>Pacchetto completo</h3><p>Accesso alle simulazioni di Biologia, Chimica e Fisica.</p><strong>3,99 €</strong></div><button className="confirm-button" disabled={!digitalConsent} onClick={()=>void buyPackage(pricing.semestreComplete,[],digitalConsent)}>Acquista pacchetto <ArrowRight size={15}/></button></article><article className="pricing-plan featured"><div><small>ACCESSO COMPLETO</small><h3>Tutto il Sito</h3><p>Accesso illimitato alle facoltà, alle materie e ai quiz, senza pubblicità durante il periodo attivo.</p><strong>9,99 € <small>/ mese</small></strong></div><button className="confirm-button" onClick={()=>void buyPackage(pricing.site,[],true)}>Attiva abbonamento <ArrowRight size={15}/></button></article></div></>}</section>}
    {view==='account'&&<section className="inner-content"><div className="inner-heading"><div className="inner-icon"><UserRound/></div><div><span className="section-kicker">PROFILO PERSONALE</span><h1>Account</h1><p>Gestisci i tuoi dati, il profilo universitario e i crediti.</p></div></div>{user?<><div className="workspace-card"><p>Accesso effettuato come <strong>{user.email}</strong></p><div className="account-metrics"><div><small>Crediti Jolly</small><strong>{wallet?.paidCredits??'—'}</strong></div><div><small>Quiz gratuiti per la materia selezionata</small><strong>{selectedSubject?(wallet?.freeRemainingBySubject?.[selectedSubject.id]??5):'—'}</strong></div></div><button className="confirm-button" onClick={()=>go('buy')}>Crediti e pacchetti <CreditCard size={16}/></button></div><form className="workspace-card profile-form" onSubmit={saveProfile}><h2>Profilo e università</h2><label>Nome visualizzato<input value={displayName} maxLength={60} onChange={e=>setDisplayName(e.target.value)} placeholder="Come vuoi apparire"/></label><label>Università<select value={universityId} onChange={e=>setUniversityId(e.target.value)}><option value="">Non indicare un'università</option>{universities.map(u=><option key={u.id} value={u.id}>{u.name}{u.city?' · '+u.city:''}</option>)}</select></label><label>Corso di laurea<input value={universityCourse} maxLength={120} onChange={e=>setUniversityCourse(e.target.value)} placeholder="Es. Medicina e Chirurgia"/></label><label className="inline-check"><input type="checkbox" checked={leaderboardOptIn} onChange={e=>setLeaderboardOptIn(e.target.checked)}/> Partecipa alle classifiche pubbliche</label><button className="confirm-button" disabled={profileBusy}>{profileBusy?'Salvataggio…':'Salva profilo'} <Check size={15}/></button></form><div className="workspace-card"><h2>Gestione account</h2><button className="back-button" onClick={()=>void logout()}>Esci dall'account <LogOut size={16}/></button></div></>:<div className="workspace-card"><p>Accedi per salvare le sessioni, sincronizzare i progressi e utilizzare gli strumenti personali.</p><button className="confirm-button" onClick={()=>setAuthOpen(true)}>Accedi <LogIn size={16}/></button></div>}</section>}
   </div>
  </main>
  {notice&&<div className="toast-notice" role="status">{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  {authOpen&&<div className="auth-overlay" onClick={()=>setAuthOpen(false)}><div className="auth-card" onClick={e=>e.stopPropagation()}><button className="auth-close" onClick={()=>setAuthOpen(false)}><X size={18}/></button><span className="section-kicker">AREA PERSONALE</span><h2>{authMode==='login'?'Accedi a SMLQUIZ Pro':'Recupera password'}</h2><p>Accedi per salvare le simulazioni e i tuoi progressi.</p><form onSubmit={authenticate}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>{authMode==='login'&&<label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>}<button className="confirm-button" disabled={authBusy}>{authBusy?'Attendi…':authMode==='login'?'Accedi':'Invia link di recupero'}</button></form>{authMode==='login'&&<><button className="google-login" onClick={()=>void googleLogin()}>Continua con Google</button><button className="text-action" onClick={()=>setAuthMode('reset')}>Password dimenticata?</button></>}<p className="auth-foot">Non hai ancora un account? La registrazione sarà attivata dopo il completamento delle informazioni legali e privacy.</p></div></div>}
 </div>
}
