#!/usr/bin/env python3
"""Generatore locale SMLQuiz: Ollama -> Supabase. Solo Python standard library."""
import json, os, re, sys, time, threading, urllib.request, urllib.error
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
MODEL = os.getenv("OLLAMA_MODEL", "smlquiz")
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "15"))
MAX_JOBS = int(os.getenv("MAX_JOBS", "1"))
if not SUPABASE_URL or not SERVICE_KEY:
    sys.exit("ERRORE: configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel file .env")

def request(url, method="GET", data=None, prefer=None, timeout=90):
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode()
    headers = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY,
               "Content-Type": "application/json"}
    if prefer: headers["Prefer"] = prefer
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return json.loads(raw.decode()) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"Supabase HTTP {e.code}: {detail[:1200]}")

def rest(table, query="", method="GET", data=None, prefer=None):
    return request(f"{SUPABASE_URL}/rest/v1/{table}{query}", method, data, prefer)

def rpc(name, payload):
    return request(f"{SUPABASE_URL}/rest/v1/rpc/{name}", "POST", payload, timeout=90)

def ollama(prompt, timeout=600):
    payload = {"model": MODEL, "stream": False, "format": "json",
               "options": {"temperature": 0.35, "num_ctx": 8192},
               "messages": [{"role": "system", "content": "Sei un docente universitario italiano. Rispondi esclusivamente con JSON valido, senza markdown."},
                            {"role": "user", "content": prompt}]}
    req = urllib.request.Request(OLLAMA_URL + "/api/chat",
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        obj = json.loads(res.read().decode())
    return json.loads(obj["message"]["content"])

def heartbeat(job_id, token, stop, lost):
    while not stop.wait(75):
        try:
            ok = rpc("heartbeat_quiz_generation_job",
                     {"p_job_id": job_id, "p_lease_token": token, "p_lease_seconds": 840})
            if ok is not True:
                lost.set(); print("ATTENZIONE: lease persa, interrompo il job."); return
        except Exception as e:
            print("Heartbeat non riuscito:", e)
            lost.set(); return

def parse_json_shape(data):
    if not isinstance(data, dict): raise ValueError("Risposta IA non è un oggetto JSON")
    qs = data.get("domande")
    if not isinstance(qs, list) or len(qs) != 10: raise ValueError("Servono esattamente 10 domande")
    concepts = set()
    for i, q in enumerate(qs, 1):
        if not isinstance(q, dict): raise ValueError(f"Domanda {i} non valida")
        for key in ("concetto_chiave", "testo_domanda", "risposta_corretta", "spiegazione"):
            if not isinstance(q.get(key), str) or len(q[key].strip()) < 8:
                raise ValueError(f"Campo {key} mancante nella domanda {i}")
        opts = q.get("opzioni")
        if not isinstance(opts, list) or len(opts) != 4 or len(set(opts)) != 4:
            raise ValueError(f"Domanda {i}: servono 4 opzioni diverse")
        if q["risposta_corretta"] not in opts: raise ValueError(f"Domanda {i}: risposta corretta fuori dalle opzioni")
        concept = q["concetto_chiave"].strip().casefold()
        if concept in concepts: raise ValueError("Concetti ripetuti nello stesso quiz")
        concepts.add(concept)
    return qs

def generate_program(subject):
    prompt = f"""Crea un programma universitario orientativo in italiano per la materia {subject}.
Restituisci JSON con questa forma: {{"titolo":"...","descrizione":"...","moduli":[{{"titolo":"...","argomenti":["...","..."]}}]}}.
Prevedi 8-12 moduli, argomenti concreti, progressione dal fondamentale all'avanzato.
Non inventare riferimenti a uno specifico ateneo. È un programma standard orientativo."""
    return ollama(prompt, 420)

def generate_quiz(subject, program, number):
    prompt = f"""Prepara il quiz numero {number} di 60 per la materia universitaria "{subject}".
Programma di riferimento: {json.dumps(program, ensure_ascii=False)[:12000]}
Genera 10 domande originali, universitarie, impegnative e non ripetitive, distribuite su moduli diversi.
Non usare domande vaghe, nozioni inventate o trabocchetti linguistici. Ogni domanda deve avere esattamente 4 risposte brevi e plausibili, una sola corretta, e spiegazione didattica chiara.
Distribuisci le risposte corrette senza schema fisso (idealmente 2-3 per posizione A/B/C/D).
Formato OBBLIGATORIO:
{{"domande":[{{"concetto_chiave":"concetto specifico e unico","testo_domanda":"...","opzioni":["...","...","...","..."],"risposta_corretta":"testo identico a una delle quattro opzioni","spiegazione":"..."}}]}}
Non aggiungere altri campi. Non numerare le opzioni. Tutto in italiano."""
    return parse_json_shape(ollama(prompt, 600))

def process(job):
    job_id, materia_id, number, token = job["job_id"], job["materia_id"], int(job["quiz_number"]), job["lease_token"]
    lock = None
    quiz_id = None
    stop, lost = threading.Event(), threading.Event()
    thread = threading.Thread(target=heartbeat, args=(job_id, token, stop, lost), daemon=True)
    try:
        lock = rpc("acquire_quiz_materia_generation_lock",
                   {"p_materia_id": materia_id, "p_quiz_number": number, "p_lease_seconds": 840})
        if not lock: raise RuntimeError("Materia già in elaborazione: riprovo più tardi")
        claimed = rpc("claim_quiz_generation", {"p_materia_id": materia_id, "p_quiz_number": number})
        if claimed is not True:
            raise RuntimeError("Quiz non reclamabile (forse già pronto o in generazione)")
        rows = rest("materie", f"?id=eq.{materia_id}&select=id,nome,facolta_id,corso_di_laurea,anno_corso")
        if not rows: raise RuntimeError("Materia non trovata")
        subject = rows[0]["nome"]
        existing_program = rest("programmi_standard", f"?materia_id=eq.{materia_id}&select=programma,stato")
        program = existing_program[0].get("programma") if existing_program else None
        if not program or not program.get("moduli"):
            program = generate_program(subject)
            rest("programmi_standard", "?on_conflict=materia_id", "POST",
                 {"materia_id": materia_id, "versione":"standard-it-1.0", "stato":"pronto",
                  "programma":program, "fonte_metodo":"Programma standard orientativo generato localmente con Ollama; da verificare dal docente",
                  "preparato_il":datetime.now(timezone.utc).isoformat(), "aggiornato_il":datetime.now(timezone.utc).isoformat()}, "resolution=merge-duplicates,return=minimal")
        thread.start()
        questions = generate_quiz(subject, program, number)
        if lost.is_set(): raise RuntimeError("Lease persa durante la generazione")
        # Controllo anti-duplicato: confronto con le domande già presenti nella stessa materia.
        old_questions = rest("domande", f"?select=testo_domanda,capitoli!inner(materia_id)&capitoli.materia_id=eq.{materia_id}&limit=2000")
        # Il confronto è limitato alle domande della stessa materia.
        normalized_old = [re.sub(r"\W+", " ", x.get("testo_domanda","").lower()).strip() for x in old_questions]
        for q in questions:
            candidate = re.sub(r"\W+", " ", q["testo_domanda"].lower()).strip()
            if any(SequenceMatcher(None, candidate, old).ratio() >= 0.88 for old in normalized_old if old):
                raise RuntimeError("Domanda troppo simile a una già presente: rigenerare il quiz")
        set_rows = rest("quiz_sets", f"?materia_id=eq.{materia_id}&quiz_number=eq.{number}&select=id,status")
        if not set_rows or set_rows[0]["status"] != "generating": raise RuntimeError("Quiz set non in stato generating")
        quiz_id = set_rows[0]["id"]
        chapter_name = f"Quiz {number} - Ollama"
        chapters = rest("capitoli", "?on_conflict=materia_id,nome", "POST",
                        {"materia_id":materia_id,"nome":chapter_name}, "resolution=merge-duplicates,return=representation")
        if not chapters: raise RuntimeError("Impossibile creare/recuperare il capitolo")
        chapter_id = chapters[0]["id"]
        records = [{"quiz_id":quiz_id,"capitolo_id":chapter_id,"concetto_chiave":q["concetto_chiave"].strip(),
                    "testo_domanda":q["testo_domanda"].strip(),"opzioni":q["opzioni"],
                    "risposta_corretta":q["risposta_corretta"].strip(),"spiegazione":q["spiegazione"].strip()}
                   for q in questions]
        rest("domande", "", "POST", records, "return=minimal")
        rpc("publish_quiz_set", {"p_quiz_set_id":quiz_id})
        result = rpc("finish_quiz_generation_job",
                     {"p_job_id":job_id,"p_lease_token":token,"p_success":True,
                      "p_error":None,"p_retry_delay_seconds":5,"p_permanent":False})
        print(f"OK: {subject} — quiz {number} pubblicato ({result})")
    except Exception as e:
        print(f"ERRORE job {job_id}: {e}")
        if quiz_id:
            try:
                current = rest("quiz_sets", f"?id=eq.{quiz_id}&select=status")
                if current and current[0]["status"] == "generating":
                    rest("domande", f"?quiz_id=eq.{quiz_id}", "DELETE", prefer="return=minimal")
            except Exception as cleanup_error: print("Pulizia domande temporanee non riuscita:", cleanup_error)
        try:
            rpc("finish_quiz_generation_job",
                {"p_job_id":job_id,"p_lease_token":token,"p_success":False,
                 "p_error":str(e)[:1800],"p_retry_delay_seconds":60,"p_permanent":False})
        except Exception as finish_error: print("Impossibile chiudere il job:", finish_error)
    finally:
        stop.set()
        if thread.is_alive(): thread.join(timeout=2)
        if lock:
            try: rpc("release_quiz_materia_generation_lock", {"p_materia_id":materia_id,"p_lock_token":lock})
            except Exception as e: print("Rilascio lock:",e)

def main():
    print(f"SMLQuiz Ollama Worker | modello {MODEL} | Supabase {SUPABASE_URL}")
    # Verifica Ollama prima di reclamare qualsiasi lavoro.
    req=urllib.request.Request(OLLAMA_URL+"/api/tags")
    with urllib.request.urlopen(req,timeout=10) as res: tags=json.loads(res.read().decode())
    names=[m.get("name","") for m in tags.get("models",[])]
    if MODEL not in names and not any(x.startswith(MODEL+":") for x in names):
        sys.exit(f"Modello {MODEL} non trovato in Ollama. Disponibili: {', '.join(names)}")
    done=0
    while True:
        try:
            claimed=rpc("claim_quiz_generation_job", {})
            if not claimed:
                if done and done >= MAX_JOBS: break
                time.sleep(POLL_SECONDS); continue
            row=claimed[0] if isinstance(claimed,list) else claimed
            process(row); done += 1
            if done >= MAX_JOBS: break
        except KeyboardInterrupt: print("Interrotto dall'utente."); break
        except Exception as e:
            print("Errore worker:",e); time.sleep(POLL_SECONDS)
    print(f"Sessione terminata. Lavori presi in carico: {done}")

if __name__ == "__main__": main()
