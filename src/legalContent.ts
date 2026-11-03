export type LegalDocument = { key:string; title:string; summary:string; sections:{heading:string;text:string}[]; draft?:boolean }

export const legalDocuments:LegalDocument[] = [
 {key:'privacy',title:'Informativa Privacy',summary:'Trattamento dei dati personali ai sensi del Regolamento UE 2016/679.',draft:true,sections:[
  {heading:'Titolare del trattamento',text:'Titolare: [RAGIONE SOCIALE / NOME E COGNOME], sede [INDIRIZZO COMPLETO], P. IVA [PARTITA IVA], email [EMAIL PRIVACY], PEC [PEC]. Questi dati devono essere compilati prima della pubblicazione.'},
  {heading:'Dati trattati',text:'Possiamo trattare email e identificativo account, dati tecnici di connessione e sicurezza, preferenze di lingua e accessibilità, sessioni quiz, risposte, punteggi, crediti, transazioni e segnalazioni inviate dall’utente.'},
  {heading:'Finalità e basi giuridiche',text:'I dati sono trattati per creare e gestire l’account, fornire quiz e statistiche, gestire crediti e pagamenti, prevenire frodi e abusi, rispondere alle richieste e adempiere agli obblighi di legge. Le basi giuridiche sono l’esecuzione del contratto, gli obblighi legali, il legittimo interesse alla sicurezza e, quando richiesto, il consenso.'},
  {heading:'Fornitori e trasferimenti',text:'Il servizio utilizza Supabase per autenticazione e database, Cloudflare per hosting e protezione anti-bot, Stripe per i pagamenti e Google AdSense solo dopo il consenso pubblicitario. I rispettivi fornitori possono trattare dati secondo i propri accordi e informative. Prima del lancio occorre verificare DPA, localizzazione, trasferimenti extra SEE e garanzie applicabili.'},
  {heading:'Conservazione',text:'I dati sono conservati per il tempo necessario alle finalità, agli obblighi fiscali e alla tutela dei diritti. I tempi specifici per account, transazioni, log di sicurezza e segnalazioni devono essere definiti dal titolare e riportati qui.'},
  {heading:'Diritti',text:'L’interessato può chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opposizione nei casi previsti dal GDPR, nonché revocare il consenso senza pregiudicare i trattamenti precedenti. È possibile proporre reclamo al Garante per la protezione dei dati personali.'},
  {heading:'Account e sicurezza',text:'La cancellazione dell’account avvia l’eliminazione dei dati associati presenti nel database applicativo. Alcuni dati possono essere conservati quando richiesto dalla legge o necessari per accertare, esercitare o difendere un diritto.'},
  {heading:'Contatti e aggiornamenti',text:'Per richieste privacy: [EMAIL PRIVACY]. Versione informativa: 3 novembre 2026. Il titolare deve completare e verificare questa bozza prima dell’apertura al pubblico.'}
 ]},
 {key:'cookies',title:'Cookie e tecnologie similari',summary:'Cookie tecnici, preferenze e pubblicità di terze parti.',draft:true,sections:[
  {heading:'Tecnologie necessarie',text:'SMLQUIZ Pro utilizza archiviazione tecnica del browser per ricordare preferenze, sessioni e cronologia locale. Queste funzioni sono necessarie al funzionamento richiesto dall’utente.'},
  {heading:'Preferenze',text:'La scelta iniziale consente di accettare tutti i cookie o mantenere soltanto quelli necessari. La scelta viene salvata sul dispositivo e può essere modificata dalle impostazioni del sito.'},
  {heading:'Pubblicità',text:'Google AdSense non viene caricato finché l’utente non accetta i cookie non necessari. Se AdSense viene attivato, Google e i suoi partner possono utilizzare cookie o identificatori per mostrare e misurare annunci secondo le impostazioni e le informative applicabili.'},
  {heading:'Come modificare la scelta',text:'L’utente può modificare o revocare la scelta in qualsiasi momento dal pannello Preferenze cookie. La revoca impedisce il caricamento futuro degli strumenti non necessari; potrebbe essere necessario cancellare i dati del browser per rimuovere identificatori già memorizzati.'},
  {heading:'Configurazione prima del lancio',text:'Prima della pubblicazione occorre verificare tutti gli script effettivamente presenti, configurare una piattaforma di gestione del consenso adeguata alle norme applicabili e compilare l’elenco aggiornato di cookie, durata, finalità e terze parti.'}
 ]},
 {key:'terms',title:'Termini e condizioni',summary:'Regole di utilizzo del servizio e dell’account.',draft:true,sections:[
  {heading:'Servizio',text:'SMLQUIZ Pro offre strumenti digitali di esercitazione, quiz, simulazioni, spiegazioni e statistiche a supporto dello studio. Il servizio non sostituisce libri, docenti, programmi ufficiali o comunicazioni degli atenei.'},
  {heading:'Account',text:'L’utente è responsabile della correttezza dei dati forniti e della riservatezza delle credenziali. È vietato condividere account o utilizzare il servizio per attività illecite, fraudolente o lesive dei diritti altrui.'},
  {heading:'Crediti e pacchetti',text:'I pacchetti previsti sono 5 quiz a 1,00 €, 10 quiz a 2,00 € e 15 quiz a 3,00 €. Il prezzo finale, le imposte eventualmente applicabili, le caratteristiche del contenuto digitale e le condizioni di acquisto devono essere mostrati prima della conferma del pagamento.'},
  {heading:'Contenuti e proprietà intellettuale',text:'Marchi, interfaccia, testi, struttura del servizio e materiali originali sono protetti dalle norme applicabili. Non è consentito copiare, distribuire, rivendere, estrarre in massa, automatizzare la raccolta o tentare di ricostruire il database dei quesiti senza autorizzazione.'},
  {heading:'Uso corretto',text:'Sono vietati scraping, bot, reverse engineering, attacchi, tentativi di accesso non autorizzato, manipolazione dei crediti, condivisione abusiva delle credenziali e interferenze con la disponibilità del servizio.'},
  {heading:'Sospensione',text:'In caso di sospetto abuso, frode, attacco o violazione dei presenti termini, il titolare può limitare o sospendere l’accesso in modo proporzionato, documentando la decisione e consentendo un contatto per chiarimenti quando appropriato.'},
  {heading:'Disponibilità e responsabilità',text:'Il servizio può essere aggiornato, sospeso o modificato per manutenzione, sicurezza o esigenze tecniche. Nei limiti consentiti dalla legge, il titolare non garantisce risultati accademici o l’assenza assoluta di errori; restano fermi i diritti inderogabili del consumatore.'},
  {heading:'Legge e contatti',text:'Legge applicabile, foro competente e procedure di reclamo devono essere completati in base alla sede e alla natura del titolare: [SEDE LEGALE], [EMAIL], [PEC].'}
 ]},
 {key:'digital',title:'Pagamenti, crediti e recesso',summary:'Condizioni dei contenuti digitali e acquisto dei pacchetti.',draft:true,sections:[
  {heading:'Prezzi e pagamento',text:'I pacchetti disponibili sono 5 quiz a 1,00 €, 10 quiz a 2,00 € e 15 quiz a 3,00 €. Il pagamento viene elaborato da Stripe. I crediti vengono accreditati solo dopo la conferma del pagamento da parte del sistema di pagamento.'},
  {heading:'Uso dei crediti',text:'I cinque quiz gratuiti giornalieri vengono consumati prima dei crediti acquistati. Ogni avvio valido oltre la soglia gratuita utilizza un credito. Il saldo e le operazioni sono registrati nell’area personale.'},
  {heading:'Diritto di recesso',text:'Per i contenuti digitali forniti senza supporto materiale, l’eventuale perdita del diritto di recesso può avvenire soltanto se ricorrono i presupposti di legge e il consumatore presta il previo consenso espresso all’inizio dell’esecuzione e riconosce la conseguente perdita del diritto. Il flusso di checkout deve raccogliere e conservare tali dichiarazioni prima dell’acquisto.'},
  {heading:'Rimborsi e problemi',text:'Non si applicano esclusioni generalizzate dei diritti inderogabili del consumatore. In caso di addebito non riuscito, credito non accreditato, duplicazione o difetto del servizio, contattare [EMAIL SUPPORTO] indicando l’identificativo della transazione. Il titolare valuterà la richiesta secondo la legge e le condizioni contrattuali.'},
  {heading:'Dati del venditore',text:'Venditore: [RAGIONE SOCIALE], P. IVA [PARTITA IVA], sede [INDIRIZZO], PEC [PEC], email [EMAIL SUPPORTO]. Questi dati e le condizioni finali devono essere compilati prima di attivare pagamenti live.'}
 ]},
 {key:'disclaimer',title:'Disclaimer didattico e fonti',summary:'Limiti del servizio e uso responsabile dei contenuti.',draft:false,sections:[
  {heading:'Supporto allo studio',text:'SMLQUIZ Pro è uno strumento di esercitazione indipendente. Non è un ente certificatore, non è un’università e non rappresenta il Ministero dell’Università e della Ricerca.'},
  {heading:'Nessuna garanzia di esito',text:'I quiz e le spiegazioni sono strumenti di studio e non garantiscono il superamento di esami, TOLC, concorsi o selezioni. Verificare sempre le informazioni con programmi, testi e fonti ufficiali.'},
  {heading:'Segnalazioni',text:'L’utente può segnalare quesiti imprecisi o errati. Le segnalazioni vengono esaminate e possono portare alla correzione o rimozione del contenuto.'}
 ]},
 {key:'intellectual',title:'Proprietà intellettuale e divieto di estrazione',summary:'Tutela del catalogo, dei contenuti e del software.',draft:true,sections:[
  {heading:'Contenuti originali',text:'Il software, il design, i testi originali, la struttura del catalogo, le spiegazioni e la selezione/organizzazione dei quesiti sono tutelati nei limiti previsti dalla normativa applicabile.'},
  {heading:'Divieto di estrazione',text:'È vietato utilizzare bot, crawler, scraping, API non documentate o altri strumenti per estrarre, copiare, raccogliere o ricostruire in massa i quesiti, le opzioni, le spiegazioni o la struttura del database.'},
  {heading:'Segnalazione di violazioni',text:'Per segnalare una violazione o richiedere autorizzazioni: [EMAIL LEGALE]. Il titolare può adottare misure tecniche e legali proporzionate per tutelare il servizio.'}
 ]},
 {key:'transparency',title:'Trasparenza tecnica',summary:'Servizi cloud, sicurezza e fornitori.',draft:true,sections:[
  {heading:'Infrastruttura',text:'L’applicazione utilizza Cloudflare Pages per la distribuzione del frontend e Supabase per autenticazione, database e funzioni server. Stripe viene utilizzato per i pagamenti solo dopo l’attivazione della configurazione live.'},
  {heading:'Sicurezza',text:'Le funzioni che gestiscono crediti, sessioni e pagamenti operano lato server. Le tabelle esposte utilizzano Row Level Security e i segreti non devono essere inseriti nel codice del browser.'},
  {heading:'Fornitori e localizzazione',text:'Il progetto Supabase è configurato nella regione eu-west-2. Prima della pubblicazione occorre documentare i fornitori effettivamente attivi, le localizzazioni, i trasferimenti e i relativi accordi.'}
 ]},
 {key:'about',title:'Chi siamo',summary:'La missione e i valori di SMLQUIZ Pro.',draft:true,sections:[
  {heading:'La missione',text:'SMLQUIZ Pro nasce per rendere l’esercitazione universitaria più organizzata, accessibile e misurabile. Vogliamo aiutare gli studenti a individuare ciò che conoscono, riconoscere le lacune e allenarsi con costanza.'},
  {heading:'Il metodo',text:'Crediamo in domande chiare, spiegazioni utili, feedback trasparente e strumenti che aiutino a studiare con metodo. La piattaforma è in evoluzione e le segnalazioni degli utenti contribuiscono a migliorarla.'},
  {heading:'Contatti',text:'Per informazioni e assistenza: [EMAIL SUPPORTO]. Titolare del servizio: [RAGIONE SOCIALE / NOME].'}
 ]}
];
