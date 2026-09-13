"""下载开源毛笔字体，并只保留人物名与章节所需字形。"""
from pathlib import Path
import json
from urllib.request import urlopen
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/fonts'
OUTPUT = ROOT / 'public/fonts'
FONT_URL = 'https://fonts.gstatic.com/s/mashanzheng/v18/NaPecZTRCLxvwo41b4gvzkXaRMQ.ttf'
LICENSE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/OFL.txt'


def prepare():
    SOURCE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    original = SOURCE / 'ma-shan-zheng.ttf'
    if not original.exists():
        original.write_bytes(urlopen(FONT_URL, timeout=30).read())
    license_path = OUTPUT / 'ma-shan-zheng-license.txt'
    if not license_path.exists():
        license_path.write_bytes(urlopen(LICENSE_URL, timeout=30).read())
    story = json.loads((ROOT / 'public/dreams/little-demon.json').read_text(encoding='utf8'))
    manifest = json.loads((ROOT / 'public/books/example-manifest.json').read_text(encoding='utf8'))
    text = '入梦书梦中一页梦中人旁白当前章节·' + ''.join(c['name'] for c in story['characters'])
    text += ''.join(manifest['presentation']['chapters'].values()) + story['title']
    font = TTFont(original)
    options = subset.Options()
    options.flavor = 'woff2'
    worker = subset.Subsetter(options=options)
    worker.populate(text=text)
    worker.subset(font)
    font.flavor = 'woff2'
    target = OUTPUT / 'dream-names.woff2'
    font.save(target)
    print(f'艺术字体子集：{len(set(text))} 个字符，{target.stat().st_size} 字节。')


if __name__ == '__main__':
    prepare()
