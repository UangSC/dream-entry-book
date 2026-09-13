import time
from urllib.parse import urlparse, parse_qs
import io
import zipfile
import json
from fastapi.testclient import TestClient
from backend.app import create_app, Settings, WEEK

ORIGIN = 'http://testserver'
HEADERS = {'origin': ORIGIN}

def login(client, name='山间读者'):
    start = client.get('/api/auth/start', follow_redirects=False)
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
    consent = client.get(start.headers['location'])
    assert consent.status_code == 200
    approve = client.post('/api/oauth/approve', data={'state': state, 'name': name}, headers=HEADERS, follow_redirects=False)
    callback = approve.headers['location']
    response = client.get(callback, follow_redirects=False)
    assert response.status_code == 303
    assert 'HttpOnly' in response.headers['set-cookie']
    return callback

def test_oauth_binding_single_use_logout(tmp_path):
    app = create_app(Settings(database=tmp_path/'db', origin=ORIGIN, stage_seconds=.01))
    with TestClient(app) as client:
        assert client.get('/api/me').status_code == 401
        assert client.get('/api/auth/callback?authorization_code=x').status_code == 400
        callback = login(client)
        assert client.get('/api/me').json()['name'] == '山间读者'
        assert client.get(callback).status_code == 400
        assert client.post('/api/auth/logout').status_code == 403
        assert client.post('/api/auth/logout', headers=HEADERS).status_code == 204
        assert client.get('/api/me').status_code == 401

def test_account_isolation_week_and_job_result(tmp_path):
    app = create_app(Settings(database=tmp_path/'db', origin=ORIGIN, stage_seconds=.01))
    with TestClient(app) as client:
        login(client, '甲')
        user_id = client.get('/api/me').json()['id']
        play = dict(run_id='one', package_id='little-demon', build_id='final', title='小妖怪', node_id='threshold', chapter='引子')
        assert client.post('/api/plays', json=play, headers=HEADERS).status_code == 204
        assert client.post('/api/plays', json=play | {'chapter': '火堆'}, headers=HEADERS).status_code == 204
        assert len(client.get('/api/account').json()['plays']) == 1
        response = client.post('/api/jobs', json={'title': '雨夜', 'text': '一段待织成梦的故事'}, headers=HEADERS)
        assert response.status_code == 201
        job_id = response.json()['id']
        for _ in range(150):
            job = client.get('/api/account').json()['jobs'][0]
            if job['status'] == 'succeeded': break
            time.sleep(.05)
        assert job['status'] == 'succeeded', job
        result = client.get(f'/api/jobs/{job_id}/result')
        assert result.status_code == 200
        with zipfile.ZipFile(io.BytesIO(result.content)) as archive:
            manifest = json.loads(archive.read('book.json'))
            story = json.loads(archive.read('story.json'))
        assert manifest['simulation'] is True
        assert len([node for node in story['nodes'] if node['kind'] == 'ending']) == 7
        assert client.post('/api/imports', json=dict(package_id=story['packageId'], build_id=story['buildId'], title=story['title'], job_id=job_id), headers=HEADERS).status_code == 204
        assert len(client.get('/api/account').json()['imports']) == 1
        client.post('/api/auth/logout', headers=HEADERS)
        login(client, '乙')
        assert client.get('/api/account').json() == {'plays': [], 'jobs': [], 'imports': []}
        assert client.get(f'/api/jobs/{job_id}/result').status_code == 404
        assert client.post(f'/api/jobs/{job_id}/cancel', headers=HEADERS).status_code == 404
        login(client, '甲')
        with app.state.database() as db:
            for table in ['plays', 'jobs', 'imports']: db.execute(f'UPDATE {table} SET updated_at=? WHERE user_id=?', (time.time()-WEEK-1,user_id))
        assert client.get('/api/account').json() == {'plays': [], 'jobs': [], 'imports': []}
        assert client.get(f'/api/jobs/{job_id}/result').status_code == 404

def test_missing_state_does_not_exchange_and_restart_keeps_history(tmp_path):
    settings = Settings(database=tmp_path/'db', origin=ORIGIN, stage_seconds=.01)
    with TestClient(create_app(settings)) as client:
        start = client.get('/api/auth/start', follow_redirects=False)
        state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
        assert client.post('/api/oauth/approve', data={'state':'wrong','name':'甲'}, headers=HEADERS).status_code == 400
        approve = client.post('/api/oauth/approve', data={'state':state,'name':'甲'}, headers=HEADERS, follow_redirects=False)
        code = parse_qs(urlparse(approve.headers['location']).query)['authorization_code'][0]
        assert client.get('/api/auth/callback?authorization_code='+code).status_code == 400
        assert client.get(approve.headers['location'], follow_redirects=False).status_code == 303
        client.post('/api/imports', json=dict(package_id='demo',build_id='one',title='旧梦'), headers=HEADERS)
    with TestClient(create_app(settings)) as client:
        assert client.get('/api/me').status_code == 401
        login(client, '甲')
        assert client.get('/api/account').json()['imports'][0]['title'] == '旧梦'


def test_cancel_retry_capacity_and_restart_queue(tmp_path):
    settings = Settings(database=tmp_path/'db', origin=ORIGIN, stage_seconds=.2)
    app = create_app(settings)
    with TestClient(app) as client:
        login(client, '队列读者')
        def start():
            response = client.post('/api/jobs', json={'title': '山中来信', 'text': '一封信'}, headers=HEADERS)
            assert response.status_code == 201
            return response.json()['id']
        first = start()
        assert client.post(f'/api/jobs/{first}/cancel', headers=HEADERS).status_code == 204
        assert client.get(f'/api/jobs/{first}/result').status_code == 409
        others = [start() for _ in range(3)]
        assert client.post(f'/api/jobs/{first}/retry', headers=HEADERS).status_code == 429
        assert client.post(f'/api/jobs/{others[0]}/cancel', headers=HEADERS).status_code == 204
        assert client.post(f'/api/jobs/{first}/retry', headers=HEADERS).status_code == 204
        assert client.post(f'/api/jobs/{first}/retry', headers=HEADERS).status_code == 409
    with app.state.database() as db:
        db.execute("UPDATE jobs SET status='running' WHERE id=?", (first,))
    settings.stage_seconds = .01
    with TestClient(create_app(settings)) as client:
        login(client, '队列读者')
        for _ in range(200):
            jobs = client.get('/api/account').json()['jobs']
            resumed = next(job for job in jobs if job['id'] == first)
            if resumed['status'] == 'succeeded': break
            time.sleep(.05)
        assert resumed['status'] == 'succeeded'
        assert next(job for job in jobs if job['id'] == others[0])['status'] == 'cancelled'
