"""Relay boundaries: run python3 -m unittest discover -s decisions -p test_server.py."""
import io
import base64
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

class ImageRelayTests(unittest.TestCase):
    setUp = RelayTests.setUp
    def image_request(self, **overrides):
        request=Request({'session':'session','id':'introduced-0-9','description':'A glowing stone',**overrides})
        request.path='/decisions/api/image'
        return request
    def result(self, cost=0.014):
        return {'data':[{'b64_json':base64.b64encode(b'\x89PNG\r\n\x1a\nfixture').decode(),'media_type':'image/png'}], 'usage':{'cost':cost}}
    def test_image_uses_fixed_model_transport_and_shared_budget(self):
        request=self.image_request()
        with patch.object(serve.item_art,'generate',return_value=self.result()) as generate:
            request.do_POST()
        generate.assert_called_once_with('A glowing stone','test-only-key')
        self.assertEqual(request.response[0],200)
        self.assertTrue(request.response[1]['ok'])
        self.assertEqual(request.response[1]['model'],'black-forest-labs/flux.2-klein-4b')
        self.assertEqual(request.response[1]['sessionCost'],0.014)
        self.assertNotIn('test-only-key',json.dumps(request.response))
    def test_repeat_item_is_not_billed_twice(self):
        with patch.object(serve.item_art,'generate',return_value=self.result()) as generate:
            self.image_request().do_POST();self.image_request().do_POST()
            self.assertEqual(generate.call_count,1)
        self.assertEqual(serve.SESSIONS['session']['spent'],0.014)
    def test_picture_needs_enough_remaining_budget(self):
        serve.SESSIONS['session']['spent']=0.09
        request=self.image_request()
        with patch.object(serve.item_art,'generate') as generate:
            request.do_POST();generate.assert_not_called()
        self.assertEqual(request.response[0],402)
    def test_collision_retry_has_not_called_provider(self):
        lock=threading.Lock();lock.acquire();serve.SESSIONS['session']['lock']=lock
        try:
            request=self.image_request()
            with patch.object(serve.item_art,'generate') as generate:
                request.do_POST();generate.assert_not_called()
            self.assertEqual(request.response[0],429)
            self.assertTrue(request.response[1]['retryable'])
        finally:lock.release()
    def test_bad_image_still_accounts_for_billed_call(self):
        result=self.result();result['data'][0]['media_type']='image/svg+xml'
        request=self.image_request()
        with patch.object(serve.item_art,'generate',return_value=result):request.do_POST()
        self.assertFalse(request.response[1]['ok'])
        self.assertEqual(serve.SESSIONS['session']['spent'],0.014)
    def test_uncertain_timeout_stops_further_spend(self):
        request=self.image_request()
        with patch.object(serve.item_art,'generate',side_effect=TimeoutError('secret diagnostics')):request.do_POST()
        self.assertFalse(request.response[1]['ok'])
        self.assertEqual(serve.SESSIONS['session']['spent'],serve.SESSION_BUDGET)
        self.assertNotIn('secret diagnostics',json.dumps(request.response))
    def test_unknown_image_cost_stops_spend_but_returns_picture(self):
        request=self.image_request()
        with patch.object(serve.item_art,'generate',return_value=self.result(None)):request.do_POST()
        self.assertTrue(request.response[1]['ok'])
        self.assertEqual(serve.SESSIONS['session']['spent'],serve.SESSION_BUDGET)
    def test_provider_rejection_is_not_charged_or_retried(self):
        with patch.object(serve.item_art,'generate',side_effect=serve.HTTPError('url',400,'bad request',{},None)) as generate:
            request=self.image_request();request.do_POST();self.image_request().do_POST()
            self.assertEqual(generate.call_count,1)
        self.assertFalse(request.response[1]['ok'])
        self.assertEqual(serve.SESSIONS['session']['spent'],0)
    def test_invalid_description_never_calls_provider(self):
        request=self.image_request(description=' ')
        with patch.object(serve.item_art,'generate') as generate:
            request.do_POST();generate.assert_not_called()
        self.assertEqual(request.response[0],400)

class AssetRequest(serve.Handler):
    def __init__(self, path, headers=None):
        self.path=path;self.headers=headers or {};self.wfile=io.BytesIO();self.response_headers={}
    def send_response(self, status):self.status=status
    def send_header(self, name, value):self.response_headers[name]=value
    def end_headers(self):pass

class RuntimeCacheTests(unittest.TestCase):
    def test_runtime_revalidation_and_rebuild(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as directory, patch.object(serve,'REPO',Path(directory)):
            runtime=Path(directory)/'wasm';runtime.mkdir()
            for name in ['ailang.wasm','wasm_exec.js']:
                target=runtime/name;target.write_bytes(b'first runtime')
                first=AssetRequest('/wasm/'+name);first.do_GET()
                self.assertEqual(first.status,200)
                self.assertEqual(first.response_headers['Cache-Control'],'public, no-cache')
                tag=first.response_headers['ETag']
                cached=AssetRequest('/wasm/'+name,{'If-None-Match':tag});cached.do_GET()
                self.assertEqual(cached.status,304);self.assertEqual(cached.wfile.getvalue(),b'')
                target.write_bytes(b'new rebuilt runtime')
                changed=AssetRequest('/wasm/'+name,{'If-None-Match':tag});changed.do_GET()
                self.assertEqual(changed.status,200)
                self.assertNotEqual(changed.response_headers['ETag'],tag)
                self.assertEqual(changed.wfile.getvalue(),b'new rebuilt runtime')

if __name__=='__main__':unittest.main()
