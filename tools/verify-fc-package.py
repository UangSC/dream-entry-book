"""在 Linux Python 3.12 下，解压并验证实际交付包，不加载项目环境配置。"""
import argparse
import io
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import time
from urllib.parse import parse_qs, urlparse
import zipfile


def main():
    parser = argparse.ArgumentParser(description='在 Linux Python 3.12 中验证 FC ZIP，不加载项目 .env。')
    parser.add_argument('output', type=Path, help='新代码包所在目录')
    parser.add_argument('--layers-dir', type=Path, help='复用已验证的依赖层、素材层 ZIP 所在目录')
    args = parser.parse_args()
    output = args.output.resolve()
    layer_source = args.layers_dir.resolve() if args.layers_dir else output
    assert platform.system() == 'Linux' and sys.version_info[:2] == (3, 12)
    assert platform.machine() == 'x86_64'
    with tempfile.TemporaryDirectory(prefix='rumengshu-fc-check-') as temporary:
        root = Path(temporary)
        code, layers = root / 'code', root / 'opt'
        for filename, target in [('rumengshu-fc-code.zip', code),
                                 ('rumengshu-fc-dependencies-py312-x86_64.zip', layers),
                                 ('rumengshu-fc-demo-assets.zip', layers)]:
            source = output if filename == 'rumengshu-fc-code.zip' else layer_source
            with zipfile.ZipFile(source / filename) as archive:
                assert archive.testzip() is None
                for name in archive.namelist():
                    assert not Path(name).is_absolute() and '..' not in Path(name).parts
                    assert not any(part.startswith('.env') for part in Path(name).parts)
                archive.extractall(target)
        # 只使用新解压的代码和依赖，禁止项目目录成为隐式导入路径。
        sys.path = [str(code), str(layers / 'python')] + [item for item in sys.path if '/mnt/' not in item]
        os.chdir(root)
        os.environ.update(PYTHON_DOTENV_DISABLED='1', OAUTH_MODE='mock',
                          APP_ORIGIN='http://testserver', API_ORIGIN='', FRONTEND_URL='', MOCK_STAGE_SECONDS='0.01',
                          RUMENGSHU_DATA_DIR=str(root / 'data'),
                          RUMENGSHU_DEMO_BOOK=str(layers / 'rumengshu/books/little-demon.dreambook'),
                          ZHIHU_ACCESS_SECRET='', ZHIHU_OAUTH_APP_ID='', ZHIHU_OAUTH_APP_KEY='')
        from fastapi.testclient import TestClient
        from backend.fc import app
        import pydantic_core._pydantic_core as native
        assert str(layers) in native.__file__
        with TestClient(app) as client:
            assert client.get('/api/health').json() == dict(status='ok', oauth_mode='mock', tasks='simulation', zhihu_configured=False)
            assert client.get('/api/me').status_code == 401
            assert client.get('/api/session').json() == {'user': None}
            start = client.get('/api/auth/start', follow_redirects=False)
            state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
            approved = client.post('/api/oauth/approve', data={'state': state, 'name': '部署测试'},
                                   headers={'origin': 'http://testserver'}, follow_redirects=False)
            assert client.get(approved.headers['location'], follow_redirects=False).status_code == 303
            job = client.post('/api/jobs', json={'title': '部署验证', 'text': '仅本地模拟'}, headers={'origin': 'http://testserver'})
            assert job.status_code == 201
            for _ in range(100):
                status = client.get('/api/account').json()['jobs'][0]['status']
                if status in {'succeeded', 'failed'}:
                    break
                time.sleep(.1)
            assert status == 'succeeded', status
            result = client.get('/api/jobs/' + job.json()['id'] + '/result')
            assert result.status_code == 200
            with zipfile.ZipFile(io.BytesIO(result.content)) as archive:
                assert json.loads(archive.read('book.json'))['simulation'] is True
        # 验证控制台启动命令确实启动 HTTP Server，不只测试 ASGI 导入。
        import httpx
        import socket
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        environment = os.environ.copy()
        environment['PYTHONPATH'] = str(layers / 'python') + ':' + str(code)
        environment['PYTHONDONTWRITEBYTECODE'] = '1'
        server = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.fc:app', '--host', '127.0.0.1', '--port', str(port)],
                                  cwd=code, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            for _ in range(100):
                if server.poll() is not None:
                    raise AssertionError(server.stderr.read().decode())
                try:
                    response = httpx.get(f'http://127.0.0.1:{port}/api/health', timeout=1, trust_env=False)
                    assert response.status_code == 200 and response.json()['status'] == 'ok'
                    break
                except httpx.ConnectError:
                    time.sleep(.1)
            else:
                raise AssertionError('HTTP 服务启动超时')
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
        print(json.dumps({'passed': True, 'python': platform.python_version(), 'architecture': platform.machine(),
                          'checks': ['zip_integrity', 'native_extension', 'health', 'auth_required', 'mock_login',
                                     'demo_job_and_asset_layer', 'uvicorn_http_startup']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
