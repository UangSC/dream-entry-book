import asyncio
import json
import time

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.app import create_app, Settings
from backend.zhihu_api import ZhihuGateway, CATALOG, zhihu_url
from backend.test_app import login, HEADERS, ORIGIN

def test_catalog_whitelist_search_cache_and_budget(tmp_path, monkeypatch):
    app = create_app(Settings(database=tmp_path/'db', access_secret='test-only'))
    calls = []
    def handle(request):
        calls.append(request)
        if request.url.path.endswith('/list'):
            assert 'authorization' not in request.headers
            return httpx.Response(200, json=[{'work_id':'123','title':'山里的信','labels':['奇幻']}])
        if request.url.path.endswith('/123'):
            assert 'authorization' not in request.headers
            return httpx.Response(200, json={'author_name':'作者','content':'一只小妖怪。'})
        assert request.headers['authorization'] == 'Bearer test-only'
        assert request.headers['x-request-timestamp'].isdigit()
        return httpx.Response(200, json={'Code':0,'Data':{'Items':[{'Title':'<em>故事</em>','ContentText':'摘要','Url':'https://www.zhihu.com/question/1?utm_source=test'}, {'Url':'https://evil.test'}]}})
    gateway = ZhihuGateway('test-only', app.state.database, httpx.MockTransport(handle))
    monkeypatch.setenv('ZHIHU_SEARCH_DAILY_LIMIT', '1')
    async def check():
        with pytest.raises(HTTPException): await gateway.story('../bad')
        with pytest.raises(HTTPException): await gateway.story('missing')
        story = await gateway.story('123')
        assert story['author'] == '作者' and story['url'] == ''
        results = await asyncio.gather(gateway.search('山里的信','reader'), gateway.search('山里的信','reader'))
        assert results[0] == results[1]
        assert results[0]['items'][0]['title'] == '故事'
        assert len(results[0]['items']) == 1
        assert results[0]['items'][0]['url'].endswith('utm_source=test')
        with pytest.raises(HTTPException) as error: await gateway.search('别的故事','second-reader')
        assert error.value.status_code == 429
    asyncio.run(check())
    assert len(calls) == 3
    assert zhihu_url('https://zhihu.com.evil.test') == ''
    assert zhihu_url('javascript:alert(1)') == ''

def test_upstream_error_is_safe_and_not_retried(tmp_path):
    app = create_app(Settings(database=tmp_path/'db', access_secret='test-only'))
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(429, json={'Message':'upstream-secret-value'})
    gateway = ZhihuGateway('test-only', app.state.database, httpx.MockTransport(handle))
    with pytest.raises(HTTPException) as error: asyncio.run(gateway.search('小说故事', 'reader'))
    assert 'upstream-secret-value' not in str(error.value.detail)
    assert error.value.status_code == 429 and len(calls) == 1

def test_real_analysis_job_report_and_no_game_import(tmp_path):
    settings = Settings(database=tmp_path/'db', origin=ORIGIN, access_secret='test-only', stage_seconds=.01)
    app = create_app(settings)
    requests = []
    def handle(request):
        requests.append(request)
        payload = json.loads(request.content)
        assert payload['model'] == 'zhida-fast-1p5'
        assert payload['stream'] is False
        return httpx.Response(200, json={'choices':[{'message':{'content':'人物：小妖怪。冲突：怕信送不到。建议：先敲门，还是留下信？'}}]})
    app.state.zhihu.transport = httpx.MockTransport(handle)
    with TestClient(app) as client:
        login(client)
        assert client.get('/api/health').json()['zhihu_configured'] is True
        response = client.post('/api/jobs', headers=HEADERS, json={'title':'山里的信', 'text':'小妖怪捡到一封信。', 'mode':'analysis','author':'测试作者'})
        job_id = response.json()['id']
        assert response.json()['simulation'] is False
        for _ in range(100):
            job = client.get('/api/account').json()['jobs'][0]
            if job['status'] == 'succeeded': break
            time.sleep(.02)
        assert job['result_kind'] == 'analysis' and job['progress'] == 100
        report = client.get(f'/api/jobs/{job_id}/result').json()
        assert report['provider'] == '知乎直答' and report['author'] == '测试作者'
        assert '人物' in report['report']
        assert client.post('/api/imports', headers=HEADERS, json={'package_id':f'weave-demo-{job_id}','build_id':'x','title':'x','job_id':job_id}).status_code == 409
        assert len(requests) == 1
        with app.state.database() as db: db.execute("UPDATE jobs SET status='running' WHERE id=?", (job_id,))
    with TestClient(create_app(settings)) as client:
        login(client)
        assert client.get('/api/account').json()['jobs'][0]['status'] == 'failed'
        # 进程重启不自动重复消耗一次真实直答调用。
        assert len(requests) == 1
