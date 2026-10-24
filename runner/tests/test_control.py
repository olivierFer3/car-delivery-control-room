import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('controller',Path(__file__).resolve().parents[1]/'control.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.oldroot,self.oldruntime=c.ROOT,c.RUNTIME;c.ROOT=self.root;c.RUNTIME=self.root/'.overnight';c.RUNTIME.mkdir()
        self.env={'DATABASE_URL':'postgres://overnight:private-test-password@127.0.0.1:15438/controlroom_overnight_validation','INCIDENT_OPERATOR_TOKEN':'private-test-operator-token'}
        (c.RUNTIME/'runtime.env').write_text(''.join(k+'='+v+'\n' for k,v in self.env.items()))
        self.cfg={'limits':{'elapsed_seconds':20,'command_seconds':5,'coding_sessions':1,'coding_session_seconds':5,'reported_coding_tokens':100,'cycles':1},'coding_enabled':True}
        self.s=c.State('probe')
    def tearDown(self):c.ROOT,c.RUNTIME=self.oldroot,self.oldruntime;self.tmp.cleanup()
    def test_shared_database_is_refused(self):
        c.assert_database(self.env['DATABASE_URL'])
        for url in ('postgres://controlroom:password@127.0.0.1:5438/controlroom','postgres://overnight:pw@127.0.0.1:15438/controlroom','postgres://overnight:pw@remote:15438/controlroom_overnight_validation'):
            with self.assertRaises(c.Blocked):c.assert_database(url)
    def test_state_and_budgets_survive_restart(self):
        self.s.put('cycles',1);self.s.put('coding_sessions',1);self.s.put('stop',True)
        other=c.State('probe');self.assertEqual(other.get('cycles'),1);self.assertEqual(other.get('coding_sessions'),1);self.assertTrue(other.get('stop'))
    def test_only_one_controller_can_acquire_edit_lock(self):
        first=c.Controller(self.s,self.cfg);first.acquire()
        try:
            with self.assertRaises(c.Blocked):c.Controller(c.State('smoke'),self.cfg).acquire()
        finally:first.lock.close()
    def test_command_duration_is_bounded_and_owned_child_reaped(self):
        ctl=c.Controller(self.s,self.cfg)
        with self.assertRaises(c.Blocked):ctl.command('timeout-probe',['python3','-c','import time; time.sleep(5)'],seconds=.15)
        self.assertIsNone(self.s.get('active_process'))
    def test_stop_interrupts_child_and_resume_keeps_usage(self):
        self.s.put('coding_sessions',1);ctl=c.Controller(self.s,self.cfg)
        def stop():
            time.sleep(.15);c.State('probe').put('stop',True)
        t=threading.Thread(target=stop);t.start()
        with self.assertRaises(c.Stopped):ctl.command('stop-probe',['python3','-c','import time; time.sleep(5)'])
        t.join();self.assertIsNone(self.s.get('active_process'))
        resumed=c.State('probe');resumed.put('stop',False)
        code,_=c.Controller(resumed,self.cfg).command('resume-probe',['python3','-c','print("resumed")'])
        self.assertEqual(code,0);self.assertEqual(resumed.get('coding_sessions'),1)
    def test_elapsed_limit_survives_resume(self):
        self.s.put('elapsed',21)
        with self.assertRaises(c.Blocked):c.Controller(self.s,self.cfg).check_limits()
    def test_session_and_token_limits_block_before_launch(self):
        task={'scope':'test','acceptance':[]};ctl=c.Controller(self.s,self.cfg)
        self.s.put('coding_sessions',1)
        with self.assertRaises(c.Blocked):ctl.coding(task,[])
        self.s.put('coding_sessions',0);self.s.put('coding_tokens',100)
        with self.assertRaises(c.Blocked):ctl.coding(task,[])
    def test_new_regressions_are_executed(self):
        tests=self.root/'starter/scripts/tests';tests.mkdir(parents=True)
        (tests/'overnight-new.test.ts').write_text('assertion')
        ctl=c.Controller(self.s,self.cfg);seen=[]
        def command(label,argv,**kwargs):seen.append((label,argv));return 0,''
        with patch.object(ctl,'command',side_effect=command):self.assertEqual(ctl.suite('iteration2'),[])
        self.assertTrue(any('scripts/tests/overnight-new.test.ts' in argv for _,argv in seen))
    def test_redacts_runtime_credentials_and_api_patterns(self):
        text=self.env['DATABASE_URL']+' '+self.env['INCIDENT_OPERATOR_TOKEN']+' gsk_'+('A'*30)
        result=c.scrub(text);self.assertNotIn('private-test',result);self.assertNotIn('gsk_',result)
    def test_preserves_forbidden_test_edit_for_review(self):
        f=self.root/'original-test.ts';f.write_text('legitimate assertion')
        frozen={'original-test.ts':c.sha(f)};f.write_text('assertion removed')
        with patch.object(c,'git',return_value='head'):
            with self.assertRaises(c.Blocked):c.guard_changes('head',frozen)
        self.assertEqual(f.read_text(),'assertion removed')
    def test_never_kills_reused_or_unowned_pid(self):
        with patch.object(c,'pid_identity',return_value='different'),patch.object(c.os,'killpg') as kill:
            c.terminate_owned({'pid':123,'identity':'old'});kill.assert_not_called()
    def test_coding_event_usage_and_logs_do_not_store_reasoning(self):
        code="import json;print(json.dumps({'type':'item.completed','item':{'type':'reasoning','text':'PRIVATE_REASONING_SENTINEL'}}));print(json.dumps({'type':'turn.completed','usage':{'input_tokens':5,'output_tokens':2}}))"
        exitcode,_=c.Controller(self.s,self.cfg).command('fake-coding-events',['python3','-c',code],coding=True)
        self.assertEqual(exitcode,0);self.assertEqual(self.s.get('coding_tokens'),7)
        self.assertNotIn('PRIVATE_REASONING_SENTINEL',(self.s.dir/'fake-coding-events.jsonl').read_text())
    def test_business_api_budget_before_network_and_no_second_call(self):
        budget=self.root/'budget.json';budget.write_text(json.dumps({'calls':0,'max_calls':1,'max_output_tokens':64}))
        script="""globalThis.fetch=async()=>Response.json({ok:true});await import(process.argv[1]);await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',body:JSON.stringify({max_completion_tokens:200})});let denied=false;try{await fetch('https://api.groq.com/openai/v1/chat/completions')}catch{denied=true}if(!denied)process.exit(2);console.log('hard cap verified with mocked transport, no real provider calls');"""
        env=c.clean_env();env['OVERNIGHT_API_BUDGET']=str(budget)
        file=self.oldroot/'runner/api-budget.mjs'
        exitcode,_=c.Controller(self.s,self.cfg).command('api-cap',['node','--input-type=module','-e',script,str(file)],env=env)
        self.assertEqual(exitcode,0);self.assertEqual(json.loads(budget.read_text())['calls'],1)

if __name__=='__main__':unittest.main()
