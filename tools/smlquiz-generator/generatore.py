import os, json, re, sys, time
from collections import defaultdict
import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
TARGET = min(300, int(os.getenv("TARGET_PER_MATERIA", "300")))
API = SUPABASE_URL + "/rest/v1"
HEADERS = {"apikey": SUPABASE_KEY, "Content-Type": "application/json"}
if not SUPABASE_KEY.startswith("sb_secret_"):
    HEADERS["Authorization"] = "Bearer " + SUPABASE_KEY

def stop(msg):
    print("\nATTENZIONE: " + str(msg))
    input("\nPremi INVIO per chiudere.")
    sys.exit(1)

def db_get(table, params):
    r = requests.get(API + "/" + table, headers=HEADERS, params=params, timeout=60)
    if not r.ok: stop("Lettura database non riuscita (" + table + "): " + r.text[:300])
    return r.json()

def db_get_all(table, params):
    """Legge tutte le righe a pagine, anche quando una tabella supera 1.000 record."""
    rows = []
    offset = 0
    while True:
        page_params = dict(params)
        page_params["limit"] = "1000"
        page_params["offset"] = str(offset)
        page = db_get(table, page_params)
        rows.extend(page)
        if len(page) < 1000:
            break
        offset += 1000
    return rows

def db_post(table, rows):
    h = dict(HEADERS); h["Prefer"] = "return=representation"
    r = requests.post(API + "/" + table, headers=h, json=rows, timeout=60)
    if not r.ok: raise RuntimeError("Salvataggio non riuscito (" + table + "): " + r.text[:300])
    return r.json()

def norm(s):
    return re.sub(r"[^a-z0-9àèéìòù]+", " ", str(s or "").lower()).strip()

def similarity(a, b):
    A, B = set(norm(a).split()), set(norm(b).split())
    if not A or not B: return 0
    return len(A & B) / len(A | B)

def main():
    print("SMLQuiz Generator - anteprima sicura")
    if not SUPABASE_URL.startswith("https://") or not SUPABASE_KEY or not OPENAI_KEY:
        stop("Mancano le chiavi nel file .env. Non inserirle mai qui in chat.")
    try:
        rules = db_get("quiz_generation_rules", {"select":"*", "id":"eq.true"})
        subjects = db_get_all("materie", {"select":"id,nome,facolta_id,anno_corso", "order":"facolta_id,anno_corso,nome"})
        programs = db_get_all("programmi_standard", {"select":"materia_id,programma", "stato":"eq.pronto"})
        micros = db_get_all("materia_microargomenti", {"select":"id,materia_id,numero,titolo,descrizione", "stato":"eq.verificato"})
        chapters = db_get_all("capitoli", {"select":"id,materia_id,nome"})
        quizzes = db_get_all("quiz_sets", {"select":"id,materia_id,quiz_number,status"})
    except Exception as e: stop(e)
    if not rules: stop("Non trovo le regole di generazione nel database.")
    rule = rules[0]
    target = min(TARGET, int(rule.get("questions_per_subject", 300)))
    pmap = {x["materia_id"]:x for x in programs}
    mmap = defaultdict(list)
    for x in micros: mmap[x["materia_id"]].append(x)
    cmap = defaultdict(list)
    for x in chapters: cmap[x["materia_id"]].append(x)
    qmap = defaultdict(list)
    for x in quizzes: qmap[x["materia_id"]].append(x)
    plan = []
    for s in subjects:
        sid = s["id"]
        if sid not in pmap or not pmap[sid].get("programma") or not mmap[sid]:
            continue
        count = 0
        for ch in cmap[sid]:
            # Read pages so counts are not silently cut at 1,000 rows.
            offset = 0
            while True:
                page = db_get("domande", {"select":"id", "capitolo_id":"eq."+ch["id"], "limit":"1000", "offset":str(offset)})
                count += len(page)
                if len(page) < 1000: break
                offset += 1000
        missing = max(0, target-count)
        used = {int(q["quiz_number"]) for q in qmap[sid]}
        if missing:
            plan.append((s,count,missing,used))
    print("\nMaterie trovate:", len(subjects))
    print("Materie con programma pronto e microargomenti verificati da completare:", len(plan))
    print("Obiettivo massimo per materia:", target)
    print("\nPRIMA DI GENERARE, ECCO L'ANTEPRIMA:")
    for s,n,m,used in plan[:40]:
        print("- " + s["nome"] + ": " + str(n) + "/" + str(target) + " domande; ne mancano " + str(m))
    if len(plan)>40: print("... e altre",len(plan)-40,"materie")
    print("\nFin qui non è stata chiamata l'IA e non è stato modificato il database.")
    scelta = input("\nScrivi PROVA per creare SOLO 10 domande di una materia, oppure GENERA per avviare tutte le materie: ").strip()
    if scelta == "PROVA":
        candidato = next((x for x in plan if x[2] >= 10 and len(x[3]) < 30), None)
        if candidato is None:
            print("Non trovo una materia adatta alla prova (servono almeno 10 domande mancanti e un numero quiz libero).")
            input("Premi INVIO."); return
        materia_prova, conteggio_prova, mancanti_prova, quiz_usati_prova = candidato
        print("\nPROVA LIMITATA: verranno create al massimo 10 domande per questa sola materia:")
        print(materia_prova["nome"], "| attuali:", conteggio_prova, "| obiettivo:", target)
        if input("Per confermare SOLO questa prova scrivi CONFERMA PROVA: ").strip() != "CONFERMA PROVA":
            print("Prova annullata: nessuna modifica al database."); input("Premi INVIO."); return
        plan = [(materia_prova, conteggio_prova, 10, quiz_usati_prova)]
    elif scelta != "GENERA":
        print("Annullato: nessuna modifica."); input("Premi INVIO."); return
    client = OpenAI(api_key=OPENAI_KEY)
    for s,count,missing,used in plan:
        sid=s["id"]
        chs=cmap[sid]
        if not chs:
            try: chs=db_post("capitoli", {"materia_id":sid,"nome":"SMLQuiz - domande generate"}) 
            except Exception as e:
                print("Salto",s["nome"],":",e); continue
            cmap[sid]=chs
        old=[]
        for ch in chs:
            offset=0
            while True:
                page=db_get("domande", {"select":"testo_domanda,concetto_chiave", "capitolo_id":"eq."+ch["id"], "limit":"1000","offset":str(offset)})
                old.extend(page)
                if len(page)<1000: break
                offset+=1000
        # Keep quiz numbering unique; do not overwrite an existing quiz.
        print("\nMateria:",s["nome"],"| da creare:",missing)
        remaining=missing
        while remaining>=10 and len(used)<30:
            number=next((i for i in range(1,31) if i not in used),None)
            if number is None: break
            micro_list=[{"id":m["id"],"titolo":m["titolo"],"descrizione":m.get("descrizione","")} for m in mmap[sid]]
            payload={"materia":s["nome"],"anno":s.get("anno_corso"),"programma":pmap[sid]["programma"],
                     "microargomenti_verificati":micro_list,"domande_esistenti":old[-250:],
                     "regolamento":rule.get("rule_text",""),
                     "istruzioni":"Scrivi in italiano 10 domande universitarie difficili, pertinenti e non ripetitive. Quattro opzioni A-D come quattro stringhe, una sola corretta. Risposta corretta identica a una delle quattro opzioni. Spiegazione rigorosa e breve. Usa solo microargomenti forniti. Evita domande uguali o parafrasi. Restituisci JSON con chiave questions e campi microargomento_id, concetto_chiave, testo_domanda, opzioni, risposta_corretta, spiegazione."}
            try:
                res=client.chat.completions.create(model=MODEL,response_format={"type":"json_object"},extra_body={"prompt_cache_key":"smlquiz-university-question-generator-v1","prompt_cache_retention":"24h"},
                    messages=[{"role":"system","content":"Sei un professore universitario severo e intransigente. Crea quesiti d’esame di livello alto che richiedano comprensione e ragionamento, con distrattori plausibili. Attieniti esclusivamente al programma e ai microargomenti verificati. Ogni domanda deve essere precisa, univoca e scientificamente corretta. Evita duplicati e parafrasi. Genera esattamente 10 domande in italiano, ciascuna con 4 opzioni A-D, una sola corretta, risposta identica a una delle opzioni e spiegazione breve rigorosa. Restituisci solo JSON con i campi richiesti."},
                              {"role":"user","content":json.dumps(payload,ensure_ascii=False)}])
                questions=json.loads(res.choices[0].message.content).get("questions",[])
            except Exception as e:
                print("Generazione fermata per",s["nome"],":",e); break
            if len(questions)!=10:
                print("L'IA non ha prodotto esattamente 10 domande. Lotto scartato."); break
            valid=[]; local=[]
            micro_ids={m["id"] for m in mmap[sid]}
            for q in questions:
                opts=q.get("opzioni")
                if (q.get("microargomento_id") not in micro_ids or not isinstance(opts,list) or len(opts)!=4
                    or len(set(norm(x) for x in opts))!=4 or norm(q.get("risposta_corretta")) not in [norm(x) for x in opts]
                    or not q.get("testo_domanda") or not q.get("concetto_chiave") or not q.get("spiegazione")):
                    continue
                if any(similarity(q["testo_domanda"],x.get("testo_domanda"))>=0.78 for x in old+local):
                    continue
                if any(norm(q["concetto_chiave"])==norm(x.get("concetto_chiave")) for x in old+local):
                    continue
                valid.append(q); local.append(q)
            if len(valid)!=10:
                print("Controlli: lotto scartato (domande incomplete o possibili duplicati). Nessuna domanda di questo lotto salvata."); break
            # Insert quiz set, then its ten questions. Never reuse an existing quiz number.
            quiz = None
            try:
                quiz=db_post("quiz_sets",{"materia_id":sid,"quiz_number":number,"status":"generating",
                                          "question_count":0,"prompt_version":"smlquiz-local-v1"})[0]
                rows=[{"capitolo_id":chs[0]["id"],"quiz_id":quiz["id"],"microargomento_id":q["microargomento_id"],
                       "concetto_chiave":q["concetto_chiave"],"testo_domanda":q["testo_domanda"],
                       "opzioni":q["opzioni"],"risposta_corretta":q["risposta_corretta"],"spiegazione":q["spiegazione"]} for q in valid]
                db_post("domande",rows)
                h=dict(HEADERS); h["Prefer"]="return=minimal"
                rr=requests.patch(API+"/quiz_sets",headers=h,params={"id":"eq."+quiz["id"]},
                    json={"status":"ready","question_count":10,"ready_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())},timeout=60)
                if not rr.ok: raise RuntimeError(rr.text[:300])
                old.extend([{"testo_domanda":q["testo_domanda"],"concetto_chiave":q["concetto_chiave"]} for q in valid])
                used.add(number); count+=10; remaining-=10
                print("Quiz",number,"salvato:",count,"/",target)
            except Exception as e:
                # Rollback: rimuove esclusivamente le righe create in questo tentativo.
                # Se l'inserimento delle domande è fallito a metà o l'aggiornamento
                # dello stato non è riuscito, non lascia un quiz incompleto.
                try:
                    if quiz and quiz.get("id"):
                        requests.delete(API+"/domande", headers=HEADERS,
                            params={"quiz_id":"eq."+quiz["id"]}, timeout=60).raise_for_status()
                        requests.delete(API+"/quiz_sets", headers=HEADERS,
                            params={"id":"eq."+quiz["id"]}, timeout=60).raise_for_status()
                    print("Salvataggio annullato: ho provato a rimuovere solo il quiz appena creato.")
                except Exception as rollback_error:
                    print("ATTENZIONE: verifica manualmente il quiz appena creato:", rollback_error)
                print("Errore durante il salvataggio. Mi fermo per non rischiare altri dati:",e)
                break
    print("\nLavoro terminato. Controlla un campione delle domande prima di renderle disponibili.")
    input("Premi INVIO per chiudere.")

if __name__=="__main__": main()
