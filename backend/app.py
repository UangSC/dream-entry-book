"""入梦书后端：授权码登录、SQLite 记录与可恢复的模拟织梦队列。"""
import asyncio
import hashlib
import html
import json
import os
import secrets
import sqlite3
import time
import uuid
import zipfile
from dotenv import load_dotenv
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlencode, parse_qs, urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, Response, FileResponse
from pydantic import BaseModel, Field, ConfigDict
from backend.credentials import access_secret
from backend.zhihu_api import ZhihuGateway

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')
WEEK = 7 * 86400
STAGES = ['读一读故事', '理清人物与牵挂', '找到风向改变的地方', '安排画面与声音', '装订入梦书']

@dataclass
class Settings:
    database: Path = field(default_factory=lambda: Path(os.getenv('RUMENGSHU_DATA_DIR', str(ROOT / 'backend/data'))) / 'dreams.sqlite3')
    origin: str = field(default_factory=lambda: os.getenv('APP_ORIGIN', 'http://127.0.0.1:62560').rstrip('/'))
    mode: str = field(default_factory=lambda: os.getenv('OAUTH_MODE', 'mock'))
    app_id: str = field(default_factory=lambda: os.getenv('ZHIHU_OAUTH_APP_ID', ''))
    app_key: str = field(default_factory=lambda: os.getenv('ZHIHU_OAUTH_APP_KEY', ''))
    access_secret: str = field(default_factory=access_secret, repr=False)
    # 项目文档未给出稳定用户资料协议；配置已获平台确认的 HTTPS 接口后才启用真实登录。
    profile_url: str = field(default_factory=lambda: os.getenv('ZHIHU_PROFILE_URL', ''))
    stage_seconds: float = field(default_factory=lambda: float(os.getenv('MOCK_STAGE_SECONDS', '2')))

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class JobInput(StrictModel):
    title: str = Field(min_length=1, max_length=60)
    text: str = Field(default='', max_length=20000)
    url: str = Field(default='', max_length=2000)
    mode: str = Field(default='simulation', pattern='^(simulation|analysis)$')
    author: str = Field(default='', max_length=80)

class PlayInput(StrictModel):
    run_id: str = Field(min_length=1, max_length=80)
    package_id: str = Field(min_length=1, max_length=80)
    build_id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=100)
    node_id: str = Field(min_length=1, max_length=80)
    chapter: str = Field(max_length=120)
    ending: str | None = Field(default=None, max_length=80)

class ImportInput(StrictModel):
    package_id: str = Field(min_length=1, max_length=80)
    build_id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=100)
    job_id: str | None = None

def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()

def create_app(settings: Settings | None = None):
    config = settings or Settings()
    if config.mode not in {'mock', 'zhihu'}: raise ValueError('OAUTH_MODE 只能是 mock 或 zhihu')
    config.database.parent.mkdir(parents=True, exist_ok=True)
    sessions, transactions, codes = {}, {}, {}

    @contextmanager
    def database():
        connection = sqlite3.connect(config.database, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys=ON')
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    with database() as db:
        db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, updated_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS plays (user_id TEXT NOT NULL REFERENCES users(id), run_id TEXT NOT NULL,
                package_id TEXT NOT NULL, build_id TEXT NOT NULL, title TEXT NOT NULL, node_id TEXT NOT NULL,
                chapter TEXT NOT NULL, ending TEXT, updated_at REAL NOT NULL, PRIMARY KEY(user_id, run_id));
            CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
                input TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL, stage TEXT NOT NULL,
                error TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS imports (user_id TEXT NOT NULL REFERENCES users(id), package_id TEXT NOT NULL,
                build_id TEXT NOT NULL, title TEXT NOT NULL, job_id TEXT, updated_at REAL NOT NULL, PRIMARY KEY(user_id, package_id, build_id));
            CREATE INDEX IF NOT EXISTS recent_plays ON plays(user_id,updated_at);
            CREATE INDEX IF NOT EXISTS recent_jobs ON jobs(user_id,updated_at);
            CREATE INDEX IF NOT EXISTS recent_imports ON imports(user_id,updated_at);
        ''')
        if 'attempt' not in {row[1] for row in db.execute('PRAGMA table_info(jobs)')}:
            db.execute('ALTER TABLE jobs ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0')
        if 'result_kind' not in {row[1] for row in db.execute('PRAGMA table_info(jobs)')}:
            db.execute("ALTER TABLE jobs ADD COLUMN result_kind TEXT NOT NULL DEFAULT 'book'")

    zhihu = ZhihuGateway(config.access_secret, database)

    def patch_job(job_id, attempt=None, **values):
        with database() as db:
            db.execute('UPDATE jobs SET ' + ','.join(f'{key}=?' for key in values) + ',updated_at=? WHERE id=? AND status IN (\'queued\',\'running\')' + (' AND attempt=?' if attempt is not None else ''), [*values.values(), time.time(), job_id, *([attempt] if attempt is not None else [])])

    async def worker():
        while True:
            with database() as db:
                row = db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
                if row: db.execute("UPDATE jobs SET status='running' WHERE id=?", (row['id'],))
            if row:
                try:
                    if row['result_kind'] == 'analysis':
                        body = json.loads(row['input'])
                        patch_job(row['id'], attempt=row['attempt'], progress=20, stage='知乎直答正在梳理人物与分歧')
                        report = await zhihu.analyze(row['title'], body['text'])
                        report.update(author=body.get('author', ''), source_url=body.get('url', ''))
                        result_path = config.database.parent / 'results' / f"{row['id']}.json"
                        result_path.parent.mkdir(exist_ok=True)
                        result_path.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
                        patch_job(row['id'], attempt=row['attempt'], status='succeeded', progress=100, stage='入梦线索已备好')
                        continue
                    for index, stage in enumerate(STAGES):
                        with database() as db:
                            current = db.execute('SELECT status,attempt FROM jobs WHERE id=?', (row['id'],)).fetchone()
                        if not current or current[0] != 'running' or current[1] != row['attempt']: break
                        patch_job(row['id'], attempt=row['attempt'], progress=index * 20, stage=stage)
                        await asyncio.sleep(config.stage_seconds)
                    else:
                        # 模拟产物沿用内置定稿；身份与来源均明确标记为演示。
                        await asyncio.to_thread(make_result, dict(row))
                        patch_job(row['id'], attempt=row['attempt'], status='succeeded', progress=100, stage='演示入梦书已备好')
                except asyncio.CancelledError:
                    raise
                except HTTPException as error:
                    patch_job(row['id'], attempt=row['attempt'], status='failed', error=str(error.detail), stage='分析暂未完成')
                except Exception:
                    patch_job(row['id'], attempt=row['attempt'], status='failed', error='书页暂时没有装订好，可以重试。', stage='未完成')
            else:
                await asyncio.sleep(.25)

    def make_result(job):
        result_path = config.database.parent / 'results' / f"{job['id']}.dreambook"
        result_path.parent.mkdir(exist_ok=True)
        with zipfile.ZipFile(Path(os.getenv('RUMENGSHU_DEMO_BOOK', str(ROOT / 'public/books/little-demon.dreambook')))) as archive:
            story = json.loads(archive.read('story.json'))
            manifest = json.loads(archive.read('book.json'))
            story['packageId'] = f"weave-demo-{job['id']}"
            story['title'] = job['title'] + ' · 演示'
            story['review'] = dict(status='draft', reviewedBuildId=None, reviewedAt=None, reviewer=None)
            story_bytes = json.dumps(story, ensure_ascii=False, separators=(',', ':')).encode()
            manifest['storySha256'] = hashlib.sha256(story_bytes).hexdigest()
            manifest['simulation'] = True
            manifest['description'] = '流程演示：沿用《吃人心的小妖怪》定稿及素材，未生成用户提交的小说。'
            with zipfile.ZipFile(result_path.with_suffix('.tmp'), 'w', compression=zipfile.ZIP_STORED) as result:
                for name in archive.namelist():
                    result.writestr(name, story_bytes if name == 'story.json' else json.dumps(manifest, ensure_ascii=False).encode() if name == 'book.json' else archive.read(name))
        result_path.with_suffix('.tmp').replace(result_path)

    @asynccontextmanager
    async def lifespan(app):
        # 任务持久化，进程意外结束后的运行任务从头重试；Token 不落盘。
        with database() as db:
            db.execute("UPDATE jobs SET status='failed',error='服务中断，分析结果未确认；可手动重试。',stage='分析暂未完成' WHERE status='running' AND result_kind='analysis'")
            db.execute("UPDATE jobs SET status='queued',progress=0,stage='接着装订书页' WHERE status='running' AND result_kind='book'")
            cutoff = time.time() - WEEK
            expired = [row[0] for row in db.execute('SELECT id FROM jobs WHERE updated_at<?', (cutoff,))]
            for table in ['plays', 'imports', 'jobs']: db.execute(f'DELETE FROM {table} WHERE updated_at<?', (cutoff,))
        for job_id in expired:
            for extension in ['dreambook', 'json']:
                (config.database.parent / 'results' / f'{job_id}.{extension}').unlink(missing_ok=True)
        task = asyncio.create_task(worker())
        yield
        task.cancel()
        try: await task
        except asyncio.CancelledError: pass
        sessions.clear(); transactions.clear(); codes.clear()

    app = FastAPI(title='入梦书', lifespan=lifespan)
    app.state.database = database
    app.state.config = config
    app.state.zhihu = zhihu

    @app.middleware('http')
    async def headers(request, call_next):
        # 限定同源写操作；授权回调为 GET，并另外检查 state 和浏览器绑定。
        if request.method not in {'GET', 'HEAD', 'OPTIONS'} and request.headers.get('origin') != config.origin:
            return Response('请求来源不匹配', status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    def session(request: Request):
        value = sessions.get(digest(request.cookies.get('dream_session', '')))
        if not value or value['expires'] <= time.time(): raise HTTPException(401, '请先登录，再收好这场梦。')
        return value

    def transaction(request, state):
        value = transactions.get(digest(request.cookies.get('dream_oauth', '')))
        if not value or value['expires'] < time.time() or not state or not secrets.compare_digest(state, value['state']):
            raise HTTPException(400, '授权已失效，请重新从入梦书登录。')
        return value

    def cookie(response, name, value, age, path='/'):
        response.set_cookie(name, value, max_age=age, httponly=True, secure=config.origin.startswith('https:'), samesite='lax', path=path)

    @app.get('/api/health')
    def health(): return {'status': 'ok', 'oauth_mode': config.mode, 'tasks': 'simulation', 'zhihu_configured': bool(config.access_secret)}

    @app.get('/api/zhihu/stories')
    async def story_catalog(): return {'items': await zhihu.stories()}

    @app.get('/api/zhihu/stories/{work_id}')
    async def story_detail(work_id: str): return await zhihu.story(work_id)

    @app.get('/api/zhihu/search')
    async def story_search(q: str, user=Depends(session)): return await zhihu.search(q, user['id'])

    @app.get('/api/auth/start')
    def auth_start():
        if config.mode == 'zhihu' and not all([config.app_id, config.app_key, config.access_secret, config.profile_url.startswith('https://')]):
            raise HTTPException(503, '真实知乎登录尚未配置完整，当前请使用模拟模式。')
        stamp = time.time()
        for bucket in [transactions, codes, sessions]:
            for key in list(bucket):
                if bucket[key]['expires'] < stamp: bucket.pop(key)
        browser, state = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        transactions[digest(browser)] = {'state': state, 'expires': stamp + 600}
        destination = '/api/oauth/authorize' if config.mode == 'mock' else 'https://openapi.zhihu.com/authorize'
        params = {'app_id': 'rumengshu-local' if config.mode == 'mock' else config.app_id, 'response_type': 'code', 'redirect_uri': config.origin + '/api/auth/callback', 'state': state}
        response = RedirectResponse(destination + '?' + urlencode(params), 303)
        cookie(response, 'dream_oauth', browser, 600, '/api')
        return response

    @app.get('/api/oauth/authorize', response_class=HTMLResponse)
    def authorize(request: Request, state: str, app_id: str, response_type: str, redirect_uri: str):
        if config.mode != 'mock': raise HTTPException(404)
        transaction(request, state)
        if app_id != 'rumengshu-local' or response_type != 'code' or redirect_uri != config.origin + '/api/auth/callback': raise HTTPException(400, '授权参数不匹配')
        return f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>知乎模拟授权 · 入梦书</title>
        <style>body{{background:#f5eee1;color:#40372f;font:18px/1.8 serif;display:grid;place-items:center;min-height:95vh}}main{{width:420px;padding:44px;background:#fffcf5;border:1px solid #ccb995;border-radius:24px;box-shadow:0 20px 90px #57442918}}input,button{{font:inherit;padding:12px;border-radius:10px;border:1px solid #ba9963}}button{{background:#355a4d;color:white;cursor:pointer}}small{{display:block;color:#796f62}}a{{color:#355a4d}}</style>
        <main><small>知乎账号 · 本地模拟</small><h1>把这场梦，收进名字里。</h1><p>这是模拟授权页。无需知乎密码，进度会记在当前模拟昵称下。</p>
        <form method="post" action="/api/oauth/approve"><input type="hidden" name="state" value="{html.escape(state)}"><label>梦中称呼<br><input name="name" maxlength="40" value="山间读者" required></label><p><button type="submit">同意并回到入梦书</button></p></form><p role="alert" id="error"></p><a href="/">暂时不登录</a></main>
        <script>document.querySelector('form').addEventListener('submit',async event=>{{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{{const response=await fetch(form.action,{{method:'POST',body:new URLSearchParams(new FormData(form)),credentials:'same-origin'}});if(!response.ok){{const error=await response.json();throw new Error(error.detail||'授权暂未完成');}}location.assign('/');}}catch(error){{document.querySelector('#error').textContent=error.message;button.disabled=false;}}}});</script></html>'''

    @app.post('/api/oauth/approve')
    async def approve(request: Request):
        if config.mode != 'mock': raise HTTPException(404)
        body = await request.body()
        if len(body) > 2048: raise HTTPException(413)
        form = parse_qs(body.decode())
        state = form.get('state', [''])[0]
        tx = transaction(request, state)
        name = form.get('name', ['山间读者'])[0].strip()
        if not name or len(name) > 40: raise HTTPException(400, '称呼请保持在 40 字以内')
        code = secrets.token_urlsafe(32)
        codes[digest(code)] = {'expires': time.time() + 60, 'state': tx['state'], 'subject': 'mock-' + digest(name)[:24], 'name': name}
        return RedirectResponse('/api/auth/callback?' + urlencode({'authorization_code': code, 'state': state}), 303)

    async def exchange(code, state):
        if config.mode == 'mock':
            value = codes.pop(digest(code), None)
            if not value or value['expires'] < time.time() or value['state'] != state: raise HTTPException(400, '授权码已使用或已过期')
            return {'id': value['subject'], 'name': value['name'], 'avatar': '/api/avatar.svg', 'expires': time.time() + 86400, 'token': None}
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
                response = await client.post('https://openapi.zhihu.com/access_token', data={'app_id': config.app_id, 'app_key': config.app_key, 'grant_type': 'authorization_code', 'redirect_uri': config.origin + '/api/auth/callback', 'code': code})
                response.raise_for_status()
                payload = response.json(); token_data = payload.get('data', payload)
                token = token_data.get('access_token')
                if not token: raise ValueError('missing token')
                profile = await client.get(config.profile_url, headers={'Authorization': 'Bearer ' + config.access_secret, 'X-OAuth-Token': token, 'X-Request-Timestamp': str(int(time.time()))})
                profile.raise_for_status()
                body = profile.json(); user = body.get('data', body)
                if not isinstance(user.get('id'), (str, int)) or not user.get('name'): raise ValueError('missing identity')
                avatar = user.get('avatar_url', '')
                if not isinstance(avatar, str) or urlparse(avatar).scheme != 'https': avatar = '/api/avatar.svg'
                return {'id': 'zhihu-' + str(user['id']), 'name': str(user['name'])[:80], 'avatar': avatar, 'expires': time.time() + min(int(token_data.get('expires_in', 3600)), 86400), 'token': token}
        except (httpx.HTTPError, ValueError, TypeError, KeyError):
            raise HTTPException(502, '知乎授权暂未完成，请稍后重试。') from None

    @app.get('/api/auth/callback')
    async def callback(request: Request, state: str = '', authorization_code: str = '', code: str = ''):
        transaction(request, state)
        transactions.pop(digest(request.cookies.get('dream_oauth', '')), None)
        auth_code = authorization_code or code
        if not auth_code or len(auth_code) > 4096: raise HTTPException(400, '没有收到授权码')
        identity = await exchange(auth_code, state)
        with database() as db:
            db.execute('INSERT INTO users VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,updated_at=excluded.updated_at', (identity['id'], identity['name'], identity['avatar'], time.time()))
        previous = digest(request.cookies.get('dream_session', '')); sessions.pop(previous, None)
        secret = secrets.token_urlsafe(32)
        sessions[digest(secret)] = identity
        response = RedirectResponse('/?login=success', 303)
        cookie(response, 'dream_session', secret, max(1, int(identity['expires'] - time.time())))
        response.delete_cookie('dream_oauth', path='/api')
        return response

    @app.get('/api/me')
    def me(user=Depends(session)):
        return {key: user[key] for key in ['id', 'name', 'avatar']} | {'simulation': config.mode == 'mock'}

    @app.get('/api/session')
    def optional_session(request: Request):
        try: return {'user': me(session(request))}
        except HTTPException: return {'user': None}

    @app.post('/api/auth/logout')
    def logout(request: Request):
        sessions.pop(digest(request.cookies.get('dream_session', '')), None)
        response = Response(status_code=204); response.delete_cookie('dream_session'); return response

    @app.get('/api/avatar.svg')
    def avatar():
        return Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#486958"/><circle cx="40" cy="30" r="14" fill="#efe4ca"/><path d="M15 76c0-31 50-31 50 0" fill="#efe4ca"/><path d="M51 13l3-8 3 8 8 3-8 3-3 8-3-8-8-3" fill="#d7b469"/></svg>', media_type='image/svg+xml')

    @app.get('/api/account')
    def account(user=Depends(session)):
        result = {}
        with database() as db:
            for table in ['plays', 'jobs', 'imports']:
                columns = '*' if table != 'jobs' else 'id,title,status,progress,stage,error,created_at,updated_at,result_kind'
                result[table] = [dict(row) for row in db.execute(f'SELECT {columns} FROM {table} WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 100', (user['id'], time.time() - WEEK))]
        return result

    @app.post('/api/plays', status_code=204)
    def record_play(body: PlayInput, user=Depends(session)):
        with database() as db:
            db.execute('INSERT INTO plays VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,run_id) DO UPDATE SET node_id=excluded.node_id,chapter=excluded.chapter,ending=excluded.ending,updated_at=excluded.updated_at', (user['id'], body.run_id, body.package_id, body.build_id, body.title, body.node_id, body.chapter, body.ending, time.time()))

    @app.post('/api/jobs', status_code=201)
    def start_job(body: JobInput, user=Depends(session)):
        if not body.text.strip() and not body.url.strip(): raise HTTPException(422, '请留下一段故事或一个链接')
        if not body.title.strip(): raise HTTPException(422, '请给这场梦起个名字')
        if body.mode == 'analysis':
            if not config.access_secret: raise HTTPException(503, '知乎直答暂未配置')
            if not body.text.strip() or len(body.text) > 12000: raise HTTPException(422, '线索分析需要 1–12000 字的故事片段')
        job_id, stamp = uuid.uuid4().hex, time.time()
        with database() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT COUNT(*) FROM jobs WHERE user_id=? AND status IN ('queued','running')", (user['id'],)).fetchone()[0] >= 3: raise HTTPException(429, '先等手上的三本书装订好吧')
            db.execute('INSERT INTO jobs (id,user_id,title,input,status,progress,stage,error,created_at,updated_at,result_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?)', (job_id, user['id'], body.title.strip(), body.model_dump_json(), 'queued', 0, '等候线索分析' if body.mode == 'analysis' else '等候织梦', None, stamp, stamp, 'analysis' if body.mode == 'analysis' else 'book'))
        return {'id': job_id, 'simulation': body.mode != 'analysis'}

    def owned_job(job_id, user):
        with database() as db: row = db.execute('SELECT * FROM jobs WHERE id=? AND user_id=? AND updated_at>=?', (job_id, user['id'], time.time() - WEEK)).fetchone()
        if not row: raise HTTPException(404, '这项任务已经不在最近七天的书页里')
        return dict(row)

    @app.post('/api/jobs/{job_id}/cancel', status_code=204)
    def cancel_job(job_id: str, user=Depends(session)):
        owned_job(job_id, user); patch_job(job_id, status='cancelled', stage='这次先放一放')

    @app.post('/api/jobs/{job_id}/retry', status_code=204)
    def retry_job(job_id: str, user=Depends(session)):
        job = owned_job(job_id, user)
        if job['status'] not in ['failed', 'cancelled']: raise HTTPException(409, '任务仍在进行或已经完成')
        with database() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT COUNT(*) FROM jobs WHERE user_id=? AND status IN ('queued','running')", (user['id'],)).fetchone()[0] >= 3: raise HTTPException(429, '先等手上的三本书装订好吧')
            db.execute("UPDATE jobs SET status='queued',attempt=attempt+1,progress=0,error=NULL,stage='重新装订',updated_at=? WHERE id=? AND status IN ('failed','cancelled')", (time.time(), job_id))

    @app.get('/api/jobs/{job_id}/result')
    def result(job_id: str, user=Depends(session)):
        job = owned_job(job_id, user)
        if job['status'] != 'succeeded': raise HTTPException(409, '入梦书还没有装订好')
        if job['result_kind'] == 'analysis':
            return json.loads((config.database.parent / 'results' / f'{job_id}.json').read_text(encoding='utf-8'))
        return FileResponse(config.database.parent / 'results' / f'{job_id}.dreambook', filename=f'weave-demo-{job_id}.dreambook', media_type='application/zip')

    @app.post('/api/imports', status_code=204)
    def record_import(body: ImportInput, user=Depends(session)):
        if body.job_id:
            job = owned_job(body.job_id, user)
            if job['status'] != 'succeeded' or job['result_kind'] != 'book' or body.package_id != f'weave-demo-{body.job_id}': raise HTTPException(409, '请等待这本入梦书完成')
        with database() as db:
            db.execute('INSERT INTO imports VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,package_id,build_id) DO UPDATE SET updated_at=excluded.updated_at,job_id=COALESCE(excluded.job_id,imports.job_id)', (user['id'], body.package_id, body.build_id, body.title, body.job_id, time.time()))

    return app

app = create_app()
