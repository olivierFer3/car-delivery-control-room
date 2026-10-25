import json,sys,time,urllib.request,os
import hashlib,hmac
# Usage: INCIDENT_OPERATOR_TOKEN=... BASE=http://127.0.0.1:3120 python3 scripts/driver-phone-e2e.py [order-id]
# Drives the real HTTP API in TEST MODE (no phone network) against a running server with a real Groq key. Costs about 15 short model calls.
B=os.environ.get('BASE','http://127.0.0.1:3120'); TOK=os.environ['INCIDENT_OPERATOR_TOKEN']
K=hmac.new(TOK.encode(),b'driver-support-demo',hashlib.sha256).hexdigest()[:16]
def call(method,path,body=None,op=False):
    h={'Content-Type':'application/json','x-driver-code':K}
    if op: h['Authorization']='Bearer '+TOK
    r=urllib.request.Request(B+path,data=json.dumps(body).encode() if body is not None else None,headers=h,method=method)
    try:
        with urllib.request.urlopen(r,timeout=120) as x: return x.status,json.loads(x.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}')
def view(i): return call('GET',f'/api/driver/incidents/{i}')[1]
def wait(i,cond,label,t=420):
    t0=time.time(); seen=0
    while time.time()-t0<t:
        v=view(i)
        for s in v['steps'][seen:]:
            print(f"   step [{s['origin']:9}] {s['status']:7} {s['label']}: {s['summary'][:110]}")
            for f in (s.get('findings') or [])[:2]: print('       finding:',f['text'][:120])
        seen=len(v['steps'])
        if cond(v): return v
        time.sleep(2)
    print('TIMEOUT waiting for',label,'phase',v['phase']); return v
order=sys.argv[1] if len(sys.argv)>1 else 'ord-00324'
s,d=call('POST','/api/driver/incidents',{'orderId':order,'text':'My truck broke down on the motorway north of Malmo. A tow truck is on the way but it will take hours. I am afraid I will miss the ferry to Finland.'})
print('create',s,d); i=d['id']
print('== waiting for the agent question'); v=wait(i,lambda v:v['question'] or v['phase'] in('problem','resolved'),'question')
print('phase',v['phase'],'|',v['headline'],'|',(v['question'] or '')[:160])
if not v['question']: sys.exit(1)
print('== request test call'); s,d=call('POST',f'/api/driver/incidents/{i}/call',{}); print(s,d); cid=d.get('callId')
s,d=call('POST',f'/api/driver/incidents/{i}/call/{cid}',{'action':'say','text':'It will take me about 5 hours to reach the ferry terminal because the tow truck is slow. I am safe, I am standing behind the guard rail. The engine is dead.'}); print('say',s)
s,d=call('POST',f'/api/driver/incidents/{i}/call/{cid}',{'action':'end'}); print('end',s,d)
v=view(i); print('call extracted:',json.dumps(v['calls'][-1].get('extracted'))[:300])
print('== waiting for the proposal'); v=wait(i,lambda v:v['phase'] in('with_operator','resolved','problem','needs_driver'),'proposal')
print('phase',v['phase'],'|',v['headline'],'|',v['detail'][:200])
if v['phase']!='with_operator': print(json.dumps(v['thread'][-3:],indent=1)[:600]); sys.exit(2)
print('== operator approves')
s,inc=call('POST',f'/api/incidents/{i}',{'command':'decide','version':1,'choice':'approve','operator':'demo-operator','comment':'Approved for the simulation.'},op=True); print('decide',s,inc.get('state'))
v=view(i); print('driver sees:',v['phase'],'|',v['headline'])
s,inc=call('POST',f'/api/incidents/{i}',{'command':'execute','version':1},op=True); print('execute',s,inc.get('state'))
v=view(i); print('driver sees:',v['phase'],'|',v['headline'])
print('thread:'); [print('  ',m['role'],m['via'],m['text'][:130]) for m in v['thread']]
print('case',i)
