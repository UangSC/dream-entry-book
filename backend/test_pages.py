"""不连接知乎，用模拟上游验证浏览器回调及实例切换。"""
from urllib.parse import parse_qs, urlparse
import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.app import Settings, create_app
from backend.browser_auth import BrowserAuth, challenge

FRONTEND = 'https://reader.example.test'
API = 'https://api.example.test'
RETURN_URL = FRONTEND + '/dream-entry-book/'
CALLBACK = RETURN_URL + 'oauth-callback.html'
HEADERS = {'Origin': FRONTEND}
STATE = 's' * 43
VERIFIER = 'v' * 43

def settings(tmp_path):
    return Settings(database=tmp_path/'db', origin=FRONTEND, api_origin=API,
                    frontend_url=RETURN_URL, mode='zhihu', app_id='test-app-id',
                    app_key='test-app-key', session_secret='', access_secret='',
                    profile_url='https://openapi.zhihu.com/user')

def test_cors_and_write_origin(tmp_path):
    with TestClient(create_app(settings(tmp_path)), base_url=API) as client:
        headers = HEADERS | {'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization'}
        response = client.options('/api/auth/exchange', headers=headers)
        assert response.status_code == 200
        assert response.headers['Access-Control-Allow-Origin'] == FRONTEND
        assert client.options('/api/auth/exchange', headers=headers | {'Origin':'https://evil.test'}).status_code == 400
        assert client.post('/api/auth/logout').status_code == 403
        assert client.post('/api/auth/start', headers={'Origin':'https://evil.test'}, json={'state':STATE,'challenge':challenge(VERIFIER)}).status_code == 403
        assert client.get('/api/me', headers=HEADERS).status_code == 401

def test_frontend_callback_proof_and_session_across_instances(tmp_path, monkeypatch):
    calls, used = [], set()
    def provider(request):
        calls.append(request.url.path)
        if request.url.path == '/access_token':
            form = parse_qs(request.content.decode())
            assert form['redirect_uri'] == [CALLBACK]
            assert form['app_key'] == ['test-app-key']
            code = form['code'][0]
            if code in used: return httpx.Response(400, json={'error':'code already used'})
            used.add(code)
            return httpx.Response(200, json={'data':{'access_token':'test-user-token','expires_in':3600}})
        assert request.url == 'https://openapi.zhihu.com/user'
        assert request.headers['Authorization'] == 'Bearer test-user-token'
        assert 'X-OAuth-Token' not in request.headers
        return httpx.Response(200, json={'uid':969570047710216200,'fullname':'测试读者','avatar_path':'https://pic.example.test/a.png'})
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(provider), **kwargs))
    with TestClient(create_app(settings(tmp_path/'first')), base_url=API) as first:
        response = first.post('/api/auth/start', headers=HEADERS, json={'state':STATE,'challenge':challenge(VERIFIER)})
        assert response.status_code == 200
        assert 'location' not in response.headers and 'set-cookie' not in response.headers
        start = response.json()
        params = parse_qs(urlparse(start['url']).query)
        assert params['redirect_uri'] == [CALLBACK] and params['state'] == [STATE]
        assert 'test-app-key' not in str(start)
        assert first.get('/api/auth/start', follow_redirects=False).status_code == 409
        assert first.get('/api/auth/callback', follow_redirects=False).status_code == 409
    with TestClient(create_app(settings(tmp_path/'second')), base_url=API) as second:
        body = {'state':STATE,'verifier':VERIFIER,'transaction':start['transaction'],'code':'one-time-code'}
        assert second.post('/api/auth/exchange', headers=HEADERS, json=body | {'state':'x'*43}).status_code == 400
        assert second.post('/api/auth/exchange', headers=HEADERS, json=body | {'verifier':'x'*43}).status_code == 400
        assert second.post('/api/auth/exchange', headers=HEADERS, json=body | {'transaction':start['transaction']+'x'}).status_code == 401
        assert calls == []
        response = second.post('/api/auth/exchange', headers=HEADERS, json=body)
        assert response.status_code == 200
        assert 'set-cookie' not in response.headers and 'location' not in response.headers
        assert 'test-user-token' not in response.text
        token = response.json()['session_token']
        assert response.json()['user']['id'] == 'zhihu-969570047710216200'
        assert second.post('/api/auth/exchange', headers=HEADERS, json=body).status_code == 502
    with TestClient(create_app(settings(tmp_path/'third')), base_url=API) as third:
        headers = HEADERS | {'Authorization':'Bearer '+token}
        assert third.get('/api/me', headers=headers).json()['name'] == '测试读者'
        assert third.post('/api/imports', headers=headers, json={'package_id':'test','build_id':'1','title':'测试'}).status_code == 204
        assert third.get('/api/account', headers=headers).json()['imports'][0]['title'] == '测试'
        assert third.get('/api/me', headers=HEADERS | {'Authorization':'Bearer '+start['transaction']}).status_code == 401
        assert third.get('/api/me', headers=HEADERS | {'Authorization':'Bearer '+token+'x'}).status_code == 401
        assert third.post('/api/auth/logout', headers=headers).status_code == 204
        assert third.get('/api/session', headers=HEADERS).json() == {'user':None}

def test_signed_expiry_audience_and_key(monkeypatch):
    import backend.browser_auth as module
    signer = BrowserAuth('test-secret', CALLBACK)
    monkeypatch.setattr(module.time, 'time', lambda:1000)
    token = signer.issue('transaction', {'state':STATE}, 600)
    assert signer.read(token, 'transaction')['data']['state'] == STATE
    for other in (BrowserAuth('wrong-key', CALLBACK), BrowserAuth('test-secret','https://other.test/')):
        with pytest.raises(HTTPException): other.read(token, 'transaction')
    monkeypatch.setattr(module.time, 'time', lambda:1600)
    with pytest.raises(HTTPException): signer.read(token, 'transaction')

def test_reject_invalid_deployment_urls(tmp_path):
    for field,value in [('origin',FRONTEND+'/project'),('frontend_url','https://evil.test/'),('api_origin','http://api.example.test')]:
        config = settings(tmp_path)
        setattr(config,field,value)
        with pytest.raises(ValueError): create_app(config)

def test_missing_oauth_credentials_fail_closed(tmp_path):
    config = settings(tmp_path)
    config.app_key = ''
    with TestClient(create_app(config),base_url=API) as client:
        assert client.post('/api/auth/start',headers=HEADERS,json={'state':STATE,'challenge':challenge(VERIFIER)}).status_code == 503
