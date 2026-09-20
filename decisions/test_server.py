"""Relay boundaries: run python3 -m unittest discover -s decisions -p test_server.py."""
import io
import json
import unittest
import threading
from unittest.mock import patch
from types import SimpleNamespace
import serve

class Request(serve.Handler):
    def __init__(self, payload, origin='https://preview.test'):
        body=json.dumps(payload).encode()
        self.path='/decisions/api/decision'
        self.headers={'Origin':origin,'Host':'preview.test','Content-Length':str(len(body)),'X-Nouls-Key':'test-only-key'}
        self.rfile=io.BytesIO(body)
        self.response=None
    def json_response(self, value, status=200):
        self.response=(status,value)

class RelayTests(unittest.TestCase):
    def setUp(self):
        serve.SESSION_BUDGET=0.10
        serve.SESSIONS.clear()
        serve.SESSIONS['session']={'spent':0.0,'requests':0}
        self.payload={'session':'session','world':'{}','id':'c1','completed':25}
    def test_budget_blocks_before_subprocess(self):
        serve.SESSIONS['session']['spent']=0.10
        request=Request(self.payload)
        with patch.object(serve.subprocess,'run') as run:
            request.do_POST()
            run.assert_not_called()
        self.assertEqual(request.response[0],402)
    def test_wrong_origin_cannot_use_relay(self):
        request=Request(self.payload,'https://other.test')
        with patch.object(serve.subprocess,'run') as run:
            request.do_POST();run.assert_not_called()
        self.assertEqual(request.response[0],403)
    def test_request_ceiling_including_zero_cost(self):
        serve.SESSIONS['session']['requests']=serve.MAX_SESSION_REQUESTS
        request=Request(self.payload)
        request.do_POST()
        self.assertEqual(request.response[0],402)
    def test_call_25_is_allowed_and_billed_cost_accumulates(self):
        request=Request(self.payload)
        def execute(command,**kwargs):
            self.assertNotIn('test-only-key',' '.join(command))
            self.assertEqual(kwargs['env']['OPENROUTER_API_KEY'],'test-only-key')
            self.assertNotIn('test-only-key',kwargs['input'])
            self.assertEqual(json.loads(kwargs['input'])['completed'],25)
            return SimpleNamespace(returncode=0,stdout=json.dumps({'ok':True,'row':{'decision':json.dumps({'cost_usd':0.00002})}}))
        with patch.object(serve,'AILANG','ailang'),patch.object(serve.subprocess,'run',side_effect=execute):
            request.do_POST()
        self.assertEqual(request.response[0],200)
        self.assertEqual(serve.SESSIONS['session']['spent'],0.00002)
        self.assertEqual(serve.SESSIONS['session']['requests'],1)
    def test_unknown_cost_stops_further_calls(self):
        request=Request(self.payload)
        result=SimpleNamespace(returncode=0,stdout=json.dumps({'ok':True,'row':{'decision':'{}'}}))
        with patch.object(serve,'AILANG','ailang'),patch.object(serve.subprocess,'run',return_value=result):request.do_POST()
        self.assertEqual(serve.SESSIONS['session']['spent'],0.10)

    def test_separate_devices_can_judge_concurrently(self):
        serve.SESSIONS['mobile']={'spent':0.0,'requests':0}
        requests=[Request(self.payload),Request({**self.payload,'session':'mobile','id':'c5'})]
        barrier=threading.Barrier(2)
        def execute(*args,**kwargs):
            barrier.wait(timeout=3)
            return SimpleNamespace(returncode=0,stdout=json.dumps({'ok':True,'row':{'decision':json.dumps({'cost_usd':0.001})}}))
        with patch.object(serve,'AILANG','ailang'),patch.object(serve.subprocess,'run',side_effect=execute):
            threads=[threading.Thread(target=r.do_POST) for r in requests]
            for t in threads:t.start()
            for t in threads:t.join(timeout=5)
        self.assertEqual([r.response[0] for r in requests],[200,200])
        self.assertEqual(serve.SESSIONS['session']['spent'],0.001)
        self.assertEqual(serve.SESSIONS['mobile']['spent'],0.001)
    def test_same_session_collision_does_not_spend(self):
        lock=threading.Lock();lock.acquire();serve.SESSIONS['session']['lock']=lock
        try:
            request=Request(self.payload)
            with patch.object(serve.subprocess,'run') as run:
                request.do_POST();run.assert_not_called()
            self.assertEqual(request.response[0],429)
            self.assertTrue(request.response[1]['retryable'])
            self.assertEqual(serve.SESSIONS['session']['requests'],0)
        finally:lock.release()
    def test_character_call_uses_same_budget(self):
        request=Request({'session':'session','name':'Pip','description':'Fast but easily tired'})
        request.path='/decisions/api/character'
        result=SimpleNamespace(returncode=0,stdout=json.dumps({'ok':True,'profile':{},'decision':{'cost_usd':0.002}}))
        with patch.object(serve,'AILANG','ailang'),patch.object(serve.subprocess,'run',return_value=result) as run:
            request.do_POST()
            self.assertEqual(json.loads(run.call_args.kwargs['input'])['operation'],'character')
        self.assertEqual(request.response[0],200)
        self.assertEqual(serve.SESSIONS['session']['spent'],0.002)

if __name__=='__main__':unittest.main()
