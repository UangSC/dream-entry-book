"""使用明确白名单构建 FC 代码包及 Linux CPython 3.12 x86_64 层。"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CODE_FILES = (
    'backend/app.py', 'backend/fc.py', 'backend/zhihu_api.py', 'backend/browser_auth.py',
    'backend/credentials.py', 'backend/requirements-runtime.txt',
)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def archive_tree(directory, destination):
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for source in sorted(directory.rglob('*')):
            if not source.is_file():
                continue
            relative = source.relative_to(directory)
            # pip 在 Windows 主机生成的 CLI 启动器不适用于 Linux；使用 python -m 启动。
            if relative.parts[:2] in {('python', 'bin'), ('python', 'Scripts')}:
                continue
            if source.is_symlink() or any(part.startswith('.env') or part in {'__pycache__', '.git', 'data', '.venv', 'node_modules'} for part in relative.parts):
                raise RuntimeError(f'拒绝收录路径：{relative}')
            if source.suffix.lower() in {'.pyd', '.dll', '.exe', '.pyc', '.sqlite3', '.db'}:
                raise RuntimeError(f'拒绝收录非部署文件：{relative}')
            archive.write(source, relative.as_posix())
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip():
            raise RuntimeError('ZIP 完整性检查失败')
        return {'file': destination.name, 'bytes': destination.stat().st_size,
                'sha256': digest(destination), 'entries': archive.namelist()}


def main():
    parser = argparse.ArgumentParser(description='按白名单打包 FC 代码与运行层，不读取 .env。')
    parser.add_argument('--code-only', action='store_true', help='只更新业务代码 ZIP，复用已经部署的依赖层与素材层')
    args = parser.parse_args()
    work = ROOT / '.work'
    work.mkdir(exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix='fc-py312-', dir=work))
    code = output / 'code'
    libraries = output / 'dependencies' / 'python'
    assets = output / 'assets' / 'rumengshu' / 'books'
    libraries.mkdir(parents=True)
    assets.mkdir(parents=True)
    # 只复制明确列出的源码，绝不枚举或读取项目 .env、数据目录或旧打包目录。
    for name in CODE_FILES:
        destination = code / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, destination)
    if args.code_only:
        report = archive_tree(code, output / 'rumengshu-fc-code.zip')
        (output / 'manifest.json').write_text(json.dumps({'code_only': True, 'archives': [report]}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'output': str(output), 'archive': report}, ensure_ascii=False))
        return
    subprocess.run([
        sys.executable, '-m', 'pip', '--isolated', 'install',
        '--index-url', 'https://pypi.org/simple',
        '--requirement', str(ROOT / 'backend/requirements-runtime.txt'),
        '--target', str(libraries), '--platform', 'manylinux2014_x86_64',
        '--implementation', 'cp', '--python-version', '3.12', '--abi', 'cp312',
        '--only-binary=:all:', '--no-compile', '--disable-pip-version-check',
    ], check=True)
    native = list((libraries / 'pydantic_core').glob('_pydantic_core*.so'))
    if len(native) != 1 or 'cpython-312-x86_64-linux-gnu' not in native[0].name:
        raise RuntimeError('未找到匹配 Python 3.12 / Linux x86_64 的 pydantic_core')
    versions = []
    for metadata in sorted(libraries.glob('*.dist-info/METADATA')):
        fields = metadata.read_text(encoding='utf-8').splitlines()
        name = next(line[6:] for line in fields if line.startswith('Name: '))
        version = next(line[9:] for line in fields if line.startswith('Version: '))
        versions.append(f'{name}=={version}')
    (output / 'requirements-linux-py312.lock').write_text('\n'.join(sorted(versions)) + '\n', encoding='utf-8')
    shutil.copyfile(ROOT / 'public/books/little-demon.dreambook', assets / 'little-demon.dreambook')
    reports = [
        archive_tree(code, output / 'rumengshu-fc-code.zip'),
        archive_tree(output / 'dependencies', output / 'rumengshu-fc-dependencies-py312-x86_64.zip'),
        archive_tree(output / 'assets', output / 'rumengshu-fc-demo-assets.zip'),
    ]
    report = {'python': '3.12', 'platform': 'manylinux2014_x86_64', 'native_extension': native[0].name,
              'dependencies': sorted(versions), 'archives': reports}
    (output / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'output': str(output), 'archives': [{key: row[key] for key in ('file', 'bytes', 'sha256')} for row in reports]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
