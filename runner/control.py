#!/usr/bin/env python3
"""Bounded local validation controller. SQLite + stdlib; no reset/stash/merge/deploy."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import signal
import socket
import sqlite3
import subprocess
import sys
import time
import threading
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = Path.home() / '.local/state/car-delivery-overnight-validation'
BRANCH = 'agent/overnight-validation'
DB = {'container':'bahn-overnight-validation-db','host':'127.0.0.1','port':15438,'name':'controlroom_overnight_validation','user':'overnight'}
class Blocked(RuntimeError): pass
class Stopped(RuntimeError): pass

def read_json(path): return json.loads(Path(path).read_text())
def write_json(path, value):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,indent=2)+'\n');os.replace(temp,path)
def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT,text=True,stderr=subprocess.PIPE).strip()
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest() if Path(path).is_file() else None

def config():
    c=read_json(ROOT/'runner/config.json')
    if c['branch']!=BRANCH or c['database']!=DB or c['app_port']!=3107: raise Blocked('Isolation coordinates changed; review configuration before proceeding')
    for k,v in c['limits'].items():
        if type(v) is not int or v<0: raise Blocked('Limits must be nonnegative integers')
    if not 1<=c['limits']['cycles']<=100 or not 1<=c['limits']['elapsed_seconds']<=86400: raise Blocked('Invalid cycle/time limit')
    if c['limits']['coding_sessions']>20 or c['limits']['business_api_calls']>100: raise Blocked('Requested budget exceeds controller ceiling')
    return c

def assert_worktree(c):
    if not (ROOT/'.git').is_file() or git('branch','--show-current')!=BRANCH: raise Blocked('Run only in the dedicated agent worktree/branch')
    if ROOT.resolve()==Path(c['source_worktree']).resolve(): raise Blocked('Source checkout cannot be the runner worktree')
    if git('rev-parse','--show-toplevel')!=str(ROOT): raise Blocked('Unexpected Git root')

def runtime_env():
    file=RUNTIME/'runtime.env'
    if not file.exists(): raise Blocked('Run prepare first; isolated runtime.env is missing')
    values=dict(line.split('=',1) for line in file.read_text().splitlines() if line and not line.startswith('#'))
    assert_database(values.get('DATABASE_URL',''))
    return values

def assert_database(url):
    u=urlparse(url)
    if u.scheme not in ('postgres','postgresql') or u.hostname!=DB['host'] or u.port!=DB['port'] or u.path!='/'+DB['name'] or u.username!=DB['user']:
        raise Blocked('Refusing a non-isolated DATABASE_URL')

def clean_env(provider=False):
    env={k:v for k,v in os.environ.items() if k in {'HOME','USER','LOGNAME','PATH','SHELL','LANG','LC_ALL','TZ','XDG_CACHE_HOME','XDG_CONFIG_HOME'}}
    env.update(runtime_env());env['NEXT_TELEMETRY_DISABLED']='1';env['APP_URL']='http://127.0.0.1:3107'
    if provider:
        f=RUNTIME/'provider.env'
        if not f.exists(): raise Blocked('Fresh live verification needs the external runtime provider.env; import only provider settings explicitly')
        allowed={'GROQ_API_KEY','GROQ_MODEL','GROQ_ALLOWED_MODELS','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_ALLOWED_MODELS'}
        env.update({k:v for k,v in (line.split('=',1) for line in f.read_text().splitlines() if '=' in line and not line.startswith('#')) if k in allowed})
    return env

def scrub(text):
    text=str(text)
    for filename in ('runtime.env','provider.env'):
        f=RUNTIME/filename
        if f.exists():
            for line in f.read_text().splitlines():
                if '=' in line:
                    key,value=line.split('=',1)
                    if any(s in key for s in ('KEY','TOKEN','PASSWORD')) and len(value)>6: text=text.replace(value,'[REDACTED]')
                    if key=='DATABASE_URL': text=text.replace(value,'[ISOLATED_DATABASE_URL]')
    text=re.sub(r'(?:gsk_|gh[opusr]_|sk-[A-Za-z0-9-]*|AIza)[A-Za-z0-9_\-]{12,}','[REDACTED]',text)
    text=re.sub(r'(postgres(?:ql)?://[^:\s]+:)[^@\s]+@',r'\1[REDACTED]@',text)
    return text

class State:
    def __init__(self, name='state'):
        if name not in ('state','smoke','probe'): raise Blocked('Invalid state namespace')
        self.dir=RUNTIME/name;self.dir.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.db=sqlite3.connect(self.dir/'state.sqlite',timeout=5)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, priority INTEGER, spec TEXT, status TEXT, attempts INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, at TEXT, kind TEXT, data TEXT);')
        self.db.commit()
    def get(self,key,default=None):
        row=self.db.execute('SELECT v FROM meta WHERE k=?',(key,)).fetchone();return json.loads(row[0]) if row else default
    def put(self,key,value):
        self.db.execute('INSERT INTO meta VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v',(key,json.dumps(value)));self.db.commit()
    def event(self,kind,**data):
        safe=scrub(json.dumps(data));self.db.execute('INSERT INTO events(at,kind,data) VALUES(?,?,?)',(time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),kind,safe));self.db.commit()
    def task_status(self,id,status): self.db.execute('UPDATE tasks SET status=? WHERE id=?',(status,id));self.db.commit()
    def tasks(self): return [dict(zip(('id','status','attempts','spec'),(r[0],r[1],r[2],json.loads(r[3])))) for r in self.db.execute('SELECT id,status,attempts,spec FROM tasks ORDER BY priority')]

def fingerprint():
    names=git('status','--porcelain','--untracked-files=all').splitlines()
    return {line[3:]:sha(ROOT/line[3:]) for line in names if line and not line[3:].startswith('.overnight/')}

def protected():
    files=[n for n in git('ls-files').splitlines() if n.startswith(('runner/','starter/scripts/tests/','dataset/','agent/problems/')) or n in ('starter/package.json','starter/package-lock.json','.gitignore','NEXT-DAY-IDEAS.md') or n.endswith('AGENTS.md')]
    files=[n for n in files if not n.startswith(('runner/evidence/','runner/rules/'))]
    return {n:sha(ROOT/n) for n in files}|{'starter/.env':sha(ROOT/'starter/.env')}

def guard_changes(before_head, frozen, smoke=False):
    if git('rev-parse','HEAD')!=before_head: raise Blocked('Coding worker changed Git history; preserve it for review, do not reset')
    for name,digest in frozen.items():
        if sha(ROOT/name)!=digest: raise Blocked(f'Protected file changed: {name}; no automatic restore')
    changed=fingerprint()
    for name in changed:
        allowed=name.startswith('runner/evidence/') if smoke else name.startswith(('starter/lib/incidents/','starter/app/api/incidents/','starter/scripts/tests/overnight-','docs/overnight/','runner/evidence/'))
        if not allowed: raise Blocked(f'Out-of-scope edit preserved for review: {name}')
        if (ROOT/name).exists():
            content=(ROOT/name).read_text(errors='replace')
            if scrub(content)!=content: raise Blocked(f'Potential secret in changed file: {name}')
    return changed

def pid_identity(pid):
    try: return Path(f'/proc/{pid}/stat').read_text().split(') ',1)[1].split()[19]
    except (FileNotFoundError,ProcessLookupError): return None

def terminate_owned(record):
    if not record:return
    current=pid_identity(record['pid'])
    if current is not None and current!=record.get('identity'):return
    if current is None:
        owned_group=False
        for entry in Path('/proc').iterdir():
            if not entry.name.isdigit():continue
            try:
                fields=(entry/'stat').read_text().split(') ',1)[1].split()
                if int(fields[2])==record['pid'] and int(fields[3])==record['pid'] and int(fields[19])>=int(record['identity']):owned_group=True;break
            except (FileNotFoundError,PermissionError,ValueError,IndexError):pass
        if not owned_group:return
    try: os.killpg(record['pid'],signal.SIGTERM)
    except ProcessLookupError:return
    for _ in range(20):
        try:os.killpg(record['pid'],0)
        except ProcessLookupError:return
        time.sleep(.05)
    current=pid_identity(record['pid'])
    if current is not None and current!=record.get('identity'):return
    try: os.killpg(record['pid'],signal.SIGKILL)
    except ProcessLookupError:pass

class Controller:
    def __init__(self,state,c,smoke=False): self.s=state;self.c=c;self.smoke=smoke;self.started=time.monotonic();self.initial_elapsed=state.get('elapsed',0);self.app=None;self.lock=None
    def acquire(self):
        self.lock=open(RUNTIME/'controller.lock','a+')
        try: fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close();self.lock=None;raise Blocked('Another controller/coding session is active')
        self.s.put('controller',{'pid':os.getpid(),'identity':pid_identity(os.getpid())})
        for k in ('active_process','app_process'):
            record=self.s.get(k);terminate_owned(record);self.s.put(k,None)
    def check_limits(self):
        elapsed=self.initial_elapsed+time.monotonic()-self.started
        self.s.put('elapsed',round(elapsed,2))
        if self.s.get('stop',False): raise Stopped('Stop requested')
        if elapsed>=self.c['limits']['elapsed_seconds']:raise Blocked('Elapsed-time limit reached')
    def command(self,label,argv,cwd=None,seconds=None,env=None,coding=False):
        self.check_limits();
        if coding:self.s.put('coding_usage_unknown',True)
        self.s.put('phase',label);self.s.event('command_started',label=label,argv=argv)
        proc=subprocess.Popen(argv,cwd=cwd or ROOT,env=env or clean_env(),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
        record={'pid':proc.pid,'identity':pid_identity(proc.pid)};self.s.put('active_process',record)
        os.set_blocking(proc.stdout.fileno(),False)
        select=selectors.DefaultSelector();select.register(proc.stdout,selectors.EVENT_READ);pending=b'';output=[];count=0;tokens=0;usage_seen=False
        deadline=time.monotonic()+min(seconds or self.c['limits']['command_seconds'],max(1,self.c['limits']['elapsed_seconds']-self.initial_elapsed-(time.monotonic()-self.started)))
        log=self.s.dir/(label.replace('/','_')+'.jsonl')
        def line(raw):
            nonlocal tokens,usage_seen,count
            text=raw.decode('utf8',errors='replace');count+=len(raw)
            if coding:
                try:
                    event=json.loads(text)
                    if event.get('item',{}).get('type')=='reasoning':return
                    if event.get('type')=='turn.completed':
                        u=event.get('usage',{});tokens+=sum(u.get(k,0) for k in ('input_tokens','output_tokens','reasoning_output_tokens'));usage_seen=True
                except json.JSONDecodeError:pass
            safe=scrub(text);output.append(safe)
            with log.open('a') as f:f.write(json.dumps({'at':time.time(),'output':safe})+'\n')
        try:
            while proc.poll() is None:
                self.check_limits()
                if time.monotonic()>deadline:raise Blocked(f'Command duration limit: {label}')
                if count>2_000_000:raise Blocked(f'Output limit: {label}')
                for key,_ in select.select(.1):
                    chunk=os.read(key.fd,65536)
                    if chunk:
                        pending+=chunk
                        while b'\n' in pending:
                            one,pending=pending.split(b'\n',1);line(one)
            tail=proc.stdout.read() or b'';pending+=tail
            for one in pending.splitlines():line(one)
            if coding:
                self.s.put('coding_tokens',self.s.get('coding_tokens',0)+tokens)
                if usage_seen:self.s.put('coding_usage_unknown',False)
                if not usage_seen:raise Blocked('Coding usage unknown; do not launch another coding session')
            code=proc.wait();self.s.event('command_finished',label=label,exit_code=code,reported_coding_tokens=tokens if coding else None)
            return code,'\n'.join(output)[-20000:]
        finally:
            terminate_owned(record);proc.wait();self.s.put('active_process',None);select.close();proc.stdout.close()
    def app_start(self):
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',3107))==0:raise Blocked('Port 3107 already occupied; never kill an unknown application')
        self.app_log=(self.s.dir/'application.jsonl').open('a')
        self.app=subprocess.Popen(['node','node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3107'],cwd=ROOT/'starter',env=clean_env(),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
        def drain_app():
            for raw in iter(self.app.stdout.readline,b''):
                if self.app_log.tell()<2_000_000:self.app_log.write(json.dumps({'at':time.time(),'output':scrub(raw.decode('utf8',errors='replace'))})+'\n');self.app_log.flush()
        self.app_thread=threading.Thread(target=drain_app,daemon=True);self.app_thread.start()
        self.s.put('app_process',{'pid':self.app.pid,'identity':pid_identity(self.app.pid)})
        import urllib.request
        for _ in range(80):
            self.check_limits()
            if self.app.poll() is not None:raise Blocked('Isolated application failed to start')
            try:
                with urllib.request.urlopen('http://127.0.0.1:3107/api/incidents',timeout=1) as r:
                    if r.status==200:return
            except Exception:time.sleep(.25)
        raise Blocked('Isolated app startup timeout')
    def suite(self,gate):
        checks=[('incidents',['node','--import','tsx','scripts/tests/incidents.test.ts']),('dataset',['node','--import','tsx','scripts/tests/dataset.test.ts']),('iteration2',['node','--import','tsx','scripts/tests/iteration2.test.ts']),('typecheck',['node','node_modules/typescript/bin/tsc','--noEmit'])]
        failures=[]
        for label,argv in checks:
            code,out=self.command(label,argv,cwd=ROOT/'starter')
            if code:failures.append((label,out))
        if not failures:
            code,out=self.command('development_gate',['node','--import','tsx','../runner/gates.ts',gate],cwd=ROOT/'starter')
            if code:failures.append(('development_gate',out))
        return failures
    def heldout(self):
        code,_=self.command('heldout',['node','--import','tsx','../runner/holdout/boundaries.ts'],cwd=ROOT/'starter')
        if code:raise Blocked('Held-out evaluation failed; keep scenarios separate and request owner review rather than design a fix from the holdout')
    def coding(self,task,failures):
        limits=self.c['limits'];used=self.s.get('coding_sessions',0)
        if self.s.get('coding_usage_unknown',False):raise Blocked('Previous coding session usage is unknown; owner review required before another session')
        if not self.c['coding_enabled'] or used>=limits['coding_sessions']:raise Blocked('Coding-session budget exhausted or disabled')
        if self.s.get('coding_tokens',0)>=limits['reported_coding_tokens']:raise Blocked('Reported coding-token ceiling reached')
        self.s.put('coding_sessions',used+1)
        report=ROOT/'runner/evidence/smoke-review.md'
        prompt=f'''Work only in {ROOT} on branch {BRANCH}. This is one bounded sequential coding session.
Task: {task['scope']}
Acceptance: {json.dumps(task['acceptance'])}
Development failures: {scrub(json.dumps(failures))[:16000]}
Preserve all prior work. Never reset/stash, merge, push, deploy, access the source checkout or shared DB, read .env/provider credentials or the external controller state directory, contact business parties, or implement NEXT-DAY-IDEAS.md. Do not modify runner/controller/config/queue/holdout or any existing test, package manifest, lockfile or policy file. Never weaken approval/version/idempotency/evidence requirements. Do not inspect held-out evaluation scenarios. Use normal workspace sandbox/approval review; if permission or account limits block you, report blocked rather than bypassing them. Do not change Git history; controller commits only after regression gates pass.
Allowed edits: {'only runner/evidence/smoke-review.md' if self.smoke else 'starter/lib/incidents, starter/app/api/incidents, new starter/scripts/tests/overnight-*.test.ts, docs/overnight; no Person A UI edits'}.
{'All development checks passed. Make no speculative product change. Write a concise review to '+str(report)+' stating inspected files, tests actually run by you, remaining risks and no claim of bug-freedom.' if self.smoke else 'Diagnose the observed development gap and make the smallest justified fix. If the feature already works, record evidence instead of rewriting it. New tests must expose a meaningful failure.'}
Return the requested final JSON schema. Do not include secrets or private chain-of-thought.'''
        prompt_file=self.s.dir/'coding-prompt.txt';prompt_file.write_text(prompt)
        argv=['codex','--no-daemon','exec','--approve-for-me','--json','--ephemeral','--output-schema',str(ROOT/'runner/session-output.schema.json'),'-C',str(ROOT),prompt]
        code,out=self.command('coding_session',argv,seconds=min(limits['coding_session_seconds'],300) if self.smoke else limits['coding_session_seconds'],coding=True)
        if code:raise Blocked('Coding session failed or permission/account limit prevented completion; inspect sanitized log')
        # Final JSON is transported inside an agent_message event.
        final=None
        for line in out.splitlines():
            try:
                event=json.loads(line)
                if event.get('item',{}).get('type')=='agent_message':
                    try:final=json.loads(event['item']['text'])
                    except json.JSONDecodeError:pass
            except json.JSONDecodeError:pass
        if not final or final.get('blocked'):raise Blocked('Coding worker blocked or returned no valid final report')
        self.s.event('coding_report',report=final)
    def live_gate(self):
        product=git('diff','ab2e042','--name-only','--','starter/lib/incidents','starter/app/api/incidents','starter/app/incidents')
        if not product:
            d=read_json(ROOT/'docs/verification/iteration2-live-groq.json')
            if {i['scenario'] for i in d['cases'] if i['state']=='resolved'}!={'delay','disproved','no_response'}:raise Blocked('Baseline live evidence incomplete')
            self.s.event('live_verification',kind_label='historical_baseline_ab2e042',fresh_provider_calls=0)
            return
        limits=self.c['limits']
        if limits['business_api_calls']==0:raise Blocked('Product changed: fresh real-provider verification required; business API budget is zero')
        env=clean_env(provider=True);budget=self.s.dir/'api-budget.json'
        if not budget.exists():write_json(budget,{'calls':0,'max_calls':limits['business_api_calls'],'max_output_tokens':limits['max_provider_output_tokens']})
        b=read_json(budget);b['max_calls']=limits['business_api_calls'];write_json(budget,b)
        env['OVERNIGHT_API_BUDGET']=str(budget)
        code,_=self.command('fresh_live_verification',['node','--import',str(ROOT/'runner/api-budget.mjs'),'--import','tsx','../runner/live-check.ts'],cwd=ROOT/'starter',seconds=180,env=env)
        self.s.put('business_api_calls',read_json(budget)['calls'])
        if code:raise Blocked('Fresh live verification failed or exhausted its request budget; no mock substitution')
        self.s.event('live_verification',kind_label='fresh_provider',attempts=read_json(budget)['calls'])
    def run(self):
        assert_worktree(self.c);self.acquire()
        try:
            self.s.put('stop',False)
            known=self.s.get('owned_changes',{})
            if fingerprint()!=known:raise Blocked('Unrecognized uncommitted changes preserved; review before resume')
            frozen=self.s.get('protected')
            for name,digest in frozen.items():
                if sha(ROOT/name)!=digest:raise Blocked('Protected baseline changed: '+name)
            self.s.put('status','running');self.app_start()
            while True:
                self.check_limits();tasks=self.s.tasks()
                pending=[t for t in tasks if t['status']!='completed' and not(t['spec'].get('optional') and not self.c['optional_iteration4'])]
                if not pending:self.s.put('status','completed');return
                task=pending[0];spec=task['spec']
                if any(next(t['status'] for t in tasks if t['id']==dep)!='completed' for dep in spec.get('requires',[])):raise Blocked('Task dependency incomplete')
                if task['attempts']>=self.c['limits']['task_retries']+1:raise Blocked('Task retry limit reached')
                cycles=self.s.get('cycles',0)
                if cycles>=self.c['limits']['cycles']:raise Blocked('Cycle limit reached')
                self.s.put('cycles',cycles+1);self.s.put('current_task',task['id']);self.s.task_status(task['id'],'running')
                self.s.db.execute('UPDATE tasks SET attempts=attempts+1 WHERE id=?',(task['id'],));self.s.db.commit()
                head=git('rev-parse','HEAD')
                failures=self.suite(spec['gate'])
                if failures or self.smoke:
                    self.s.event('diagnosis',development_failures=failures)
                    self.coding(spec,failures)
                    self.s.put('owned_changes',fingerprint())
                    guard_changes(head,frozen,self.smoke)
                    failures=self.suite(spec['gate'])
                if failures:
                    self.s.event('regression_failed',failures=failures);self.s.task_status(task['id'],'pending');self.s.put('owned_changes',fingerprint())
                    if self.smoke:raise Blocked('Smoke regressions failed')
                    continue
                self.heldout()
                if not self.smoke:self.live_gate()
                code,_=self.command('build',['node','node_modules/next/dist/bin/next','build'],cwd=ROOT/'starter')
                if code:raise Blocked('Build failed; changes preserved')
                changes=guard_changes(head,frozen,self.smoke)
                receipt={'task':task['id'],'base_head':head,'automated_gates':'passed','heldout':'passed','fresh_business_calls':self.s.get('business_api_calls',0),'limitations':'Bounded tests are not proof of bug-freedom','commit_after_checks':True}
                receipt_path=ROOT/f"runner/evidence/{task['id']}-cycle-{cycles+1}.json";write_json(receipt_path,receipt)
                changes[str(receipt_path.relative_to(ROOT))]=sha(receipt_path)
                if not self.smoke:
                    registry_path=ROOT/'runner/rules/registry.json';registry=read_json(registry_path)
                    relevant={'iteration2':{'approval-current-version','one-execution-receipt'},'iteration3':{'technical-not-business'},'iteration5':{'history-is-reference'}}.get(task['id'],set())
                    for rule in registry:
                        if rule['id'] in relevant:rule['status']='validated';rule['evidence'].append(str(receipt_path.relative_to(ROOT)))
                    write_json(registry_path,registry);changes['runner/rules/registry.json']=sha(registry_path)
                if changes:
                    # No shell interpolation; do not stage ignored runtime, secrets, or unrelated paths.
                    self.command('stage',['git','add','--',*sorted(changes)])
                    code,_=self.command('commit',['git','-c','user.name=Sarahdhbr','-c','user.email=156202682+Sarahdhbr@users.noreply.github.com','commit','-m',f"Validate {task['id']} with regression evidence"])
                    if code:raise Blocked('Commit failed; staged work preserved')
                    self.s.put('owned_changes',{})
                self.s.event('cycle_validated',task=task['id'],head=git('rev-parse','HEAD'),limitations='Bounded scenarios passed; not proof of no bugs',model_verification='no fresh calls in smoke' if self.smoke else 'see live_verification event')
                self.s.task_status(task['id'],'completed')
                if self.smoke:self.s.put('status','completed');return
        except Stopped as e:
            self.s.put('owned_changes',fingerprint());self.s.put('status','stopped');self.s.put('reason',str(e));self.s.event('stopped',reason=str(e))
        except (Blocked,Exception) as e:
            self.s.put('owned_changes',fingerprint());self.s.put('status','blocked');self.s.put('reason',scrub(str(e)));self.s.event('blocked',reason=str(e))
        finally:
            terminate_owned(self.s.get('active_process'));terminate_owned(self.s.get('app_process'))
            if self.app:
                self.app.wait();self.app_thread.join(timeout=2);self.app.stdout.close();self.app_log.close()
            self.s.put('active_process',None);self.s.put('app_process',None);self.s.put('controller',None)
            self.s.put('elapsed',round(self.initial_elapsed+time.monotonic()-self.started,2))
            for t in self.s.tasks():
                if t['status']=='running':self.s.task_status(t['id'],'pending')
            if self.lock:fcntl.flock(self.lock,fcntl.LOCK_UN);self.lock.close()
            print(json.dumps(status(self.s),indent=2))

def initialize(s,c,smoke=False):
    assert_worktree(c)
    if s.get('initialized'):return
    if fingerprint():raise Blocked('Commit runner setup first; baseline must be clean')
    for spec in ([{'id':'smoke-iteration2','priority':0,'requires':[],'scope':'Audit the existing iteration-2 implementation without speculative changes','acceptance':['Development regressions and isolated PostgreSQL/HTTP gates pass','One real coding CLI session records a review; no business-provider calls'],'gate':'iteration2'}] if smoke else read_json(ROOT/'runner/queue.json')):
        s.db.execute('INSERT OR IGNORE INTO tasks(id,priority,spec,status) VALUES(?,?,?,?)',(spec['id'],spec['priority'],json.dumps(spec),'deferred' if spec.get('optional') and not c['optional_iteration4'] else 'pending'))
    s.db.commit()
    for k,v in {'initialized':True,'status':'idle','cycles':0,'coding_sessions':0,'coding_tokens':0,'business_api_calls':0,'elapsed':0,'protected':protected(),'owned_changes':{},'baseline_head':git('rev-parse','HEAD'),'stop':False}.items():s.put(k,v)
    s.event('initialized',baseline=git('rev-parse','HEAD'),namespace=s.dir.name)

def status(s):
    return {k:s.get(k) for k in ('status','reason','phase','cycles','coding_sessions','coding_tokens','business_api_calls','elapsed','controller','active_process','app_process')}|{'state_dir':str(s.dir),'tasks':[{k:t[k] for k in ('id','status','attempts')} for t in s.tasks()]}

def prepare(c):
    assert_worktree(c);RUNTIME.mkdir(parents=True,exist_ok=True,mode=0o700)
    envfile=RUNTIME/'runtime.env'
    if not envfile.exists():
        password=secrets.token_hex(20)
        values={'DATABASE_URL':f"postgres://{DB['user']}:{password}@{DB['host']}:{DB['port']}/{DB['name']}",'INCIDENT_OPERATOR_TOKEN':secrets.token_hex(24),'PORT':'3107'}
        envfile.write_text(''.join(f'{k}={v}\n' for k,v in values.items()));envfile.chmod(0o600)
    env=runtime_env();private=ROOT/'starter/.env'
    if private.exists() and private.read_text()!=envfile.read_text():raise Blocked('Existing worktree .env differs; preserve and review it')
    private.write_text(envfile.read_text());private.chmod(0o600)
    inspect=subprocess.run(['docker','inspect',DB['container']],capture_output=True,text=True)
    if inspect.returncode:
        password=urlparse(env['DATABASE_URL']).password
        cmd=['docker','run','-d','--name',DB['container'],'--label','bahn.validation=overnight','--publish','127.0.0.1:15438:5432','--env','POSTGRES_USER=overnight','--env','POSTGRES_DB='+DB['name'],'--env','POSTGRES_PASSWORD','postgres:17-alpine']
        childenv=os.environ.copy();childenv['POSTGRES_PASSWORD']=password
        subprocess.run(cmd,check=True,env=childenv,stdout=subprocess.DEVNULL)
    else:
        info=json.loads(inspect.stdout)[0]
        if info['Config'].get('Labels',{}).get('bahn.validation')!='overnight' or info['HostConfig']['PortBindings'].get('5432/tcp')!=[{'HostIp':'127.0.0.1','HostPort':'15438'}]:raise Blocked('Container identity/binding mismatch; do not touch it')
        if not info['State']['Running']:subprocess.run(['docker','start',DB['container']],check=True,stdout=subprocess.DEVNULL)
    for _ in range(60):
        r=subprocess.run(['pg_isready','-h','127.0.0.1','-p','15438','-U','overnight','-d',DB['name']],capture_output=True)
        if r.returncode==0:break
        time.sleep(.25)
    else:raise Blocked('Isolated DB startup failed')
    # Fixed commands, only fresh isolated database. Never truncate a populated test DB on resume.
    if not (ROOT/'starter/node_modules/.bin/tsx').exists():subprocess.run(['npm','ci'],cwd=ROOT/'starter',env=clean_env(),check=True)
    probe=subprocess.check_output(['node','--input-type=module','-e',"import postgres from 'postgres';const q=postgres(process.env.DATABASE_URL);const r=await q`select to_regclass('public.orders') as name`;console.log(r[0].name??'missing');await q.end()"],cwd=ROOT/'starter',env=clean_env(),text=True).strip()
    if probe=='missing':
        for argv in (['node','node_modules/drizzle-kit/bin.cjs','push'],['node','--import','tsx','scripts/seed.ts']):subprocess.run(argv,cwd=ROOT/'starter',env=clean_env(),check=True)
    subprocess.run(['node','--import','tsx','scripts/init-incidents.ts'],cwd=ROOT/'starter',env=clean_env(),check=True)
    print('Prepared only the labelled isolated database on 15438. App port: 3107. No provider keys imported.')

def main():
    p=argparse.ArgumentParser();p.add_argument('command',choices=['prepare','init','status','run','start','stop','resume','smoke','self-test','configure','import-providers']);p.add_argument('--state',default='state',choices=['state','smoke','probe']);p.add_argument('--foreground',action='store_true');p.add_argument('--source');p.add_argument('--api-calls',type=int);p.add_argument('--max-cycles',type=int)
    a=p.parse_args();c=config();assert_worktree(c);RUNTIME.mkdir(parents=True,exist_ok=True,mode=0o700)
    if a.command=='prepare':prepare(c);return
    if a.command=='self-test':subprocess.run([sys.executable,'-m','unittest','discover','-s','runner/tests','-v'],cwd=ROOT,check=True);return
    s=State('smoke' if a.command=='smoke' else a.state)
    if a.command=='status':print(json.dumps(status(s),indent=2));return
    if a.command=='stop':s.put('stop',True);s.event('stop_requested');print('Stop requested; controller kills only its recorded process groups and preserves edits.');return
    if a.command in ('configure','import-providers'):
        record=s.get('controller')
        if record and pid_identity(record['pid'])==record['identity']:raise Blocked('Stop the controller before configuration changes')
        if a.command=='configure':
            if a.api_calls is not None:c['limits']['business_api_calls']=a.api_calls
            if a.max_cycles is not None:c['limits']['cycles']=a.max_cycles
            write_json(ROOT/'runner/config.json',c);config();
            for namespace in ('state','smoke'):
                other=State(namespace)
                if other.get('initialized'):
                    frozen=other.get('protected');frozen['runner/config.json']=sha(ROOT/'runner/config.json');other.put('protected',frozen)
            s.event('owner_configuration',limits=c['limits']);print('Configuration changed explicitly; usage counters were not reset. Commit the reviewed configuration before running.');return
        allowed={'GROQ_API_KEY','GROQ_MODEL','GROQ_ALLOWED_MODELS','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_ALLOWED_MODELS'}
        if not a.source:raise Blocked('Specify --source private env file; only provider settings will be imported')
        rows=[line for line in Path(a.source).read_text().splitlines() if '=' in line and line.split('=',1)[0] in allowed]
        target=RUNTIME/'provider.env';target.write_text('\n'.join(rows)+'\n');target.chmod(0o600);print('Imported provider settings only into ignored mode-0600 provider.env; no database settings copied.');return
    if a.command=='smoke':
        c=json.loads(json.dumps(c));c['limits'].update(cycles=1,coding_sessions=1,elapsed_seconds=600,business_api_calls=0)
        initialize(s,c,True);Controller(s,c,True).run();
        if s.get('status')=='blocked':raise Blocked(s.get('reason'))
        return
    initialize(s,c)
    if a.command=='init':print(json.dumps(status(s),indent=2));return
    if a.command in ('start','resume') and not a.foreground:
        if s.get('status')=='completed':raise Blocked('Queue already completed')
        file=(s.dir/'controller.log').open('a');proc=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'run','--state',a.state],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=file,stderr=subprocess.STDOUT,start_new_session=True)
        print(json.dumps({'pid':proc.pid,'state_dir':str(s.dir),'log':str(s.dir/'controller.log')}));return
    Controller(s,c).run()
    if s.get('status')=='blocked':raise Blocked(s.get('reason'))

if __name__=='__main__':
    try:main()
    except Exception as e:print('BLOCKED: '+scrub(str(e)),file=sys.stderr);sys.exit(2)
