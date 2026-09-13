"""将现有透明立绘加工成适合对白区的 WebP，原图保留在 source。"""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/source/art/characters'
OUTPUT = ROOT / 'public/art/portraits'


def remove_baked_background(image):
    """仅修复无透明通道的灰白底图；保护肤色、衣服和眼睛的非背景区域。"""
    pixels = np.asarray(image)
    rgb = pixels[:, :, :3].astype(np.int16)
    neutral = (rgb.min(axis=2) > 210) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 18)
    width, height = image.size
    remaining = bytearray(neutral.astype('uint8').tobytes())
    removed_pixels = bytearray(width * height)
    # 一次遍历连通块，保留人物内部的小片高光，清除边缘与发丝间的棋盘格。
    for seed in range(len(remaining)):
        if not remaining[seed]:
            continue
        remaining[seed] = 0
        stack = [seed]
        component = []
        border = False
        while stack:
            index = stack.pop()
            component.append(index)
            y, x = divmod(index, width)
            border |= x == 0 or x == width - 1 or y == 0 or y == height - 1
            for neighbor in (index - width if y else -1, index + width if y < height - 1 else -1,
                             index - 1 if x else -1, index + 1 if x < width - 1 else -1):
                if neighbor >= 0 and remaining[neighbor]:
                    remaining[neighbor] = 0
                    stack.append(neighbor)
        if border or len(component) > 8:
            for index in component:
                removed_pixels[index] = 255
    removed = Image.frombytes('L', (width, height), bytes(removed_pixels))
    removed = removed.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.55))
    image.putalpha(Image.fromarray(255 - np.asarray(removed)))
    return image


def prepare():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    assets = []
    sources = [('bare', '小怪物_无袄_表情立绘'), ('coat', '小怪物_红袄_表情立绘')]
    for costume, folder in sources:
        for image_path in sorted((ROOT / 'new_TMP_SPR' / folder).glob('*.png')):
            target = SOURCE / f'demon-{costume}-{image_path.stem}.png'
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copy2(image_path, target)
    for name, original in [('yu-niang', 'TMP_SPR_毓娘.png'), ('nian-nian', 'TMP_SPR_念念_7岁时.png')]:
        target = SOURCE / f'{name}.png'
        if not target.exists():
            shutil.copy2(ROOT / 'new_TMP_SPR/部分人物完整身体立绘' / original, target)
    for image_path in sorted(SOURCE.glob('*.png')):
        image = Image.open(image_path).convert('RGBA')
        if image.getchannel('A').getextrema() == (255, 255):
            image = remove_baked_background(image)
        bounds = image.getchannel('A').getbbox()
        if bounds:
            image = image.crop(bounds)
        if image_path.stem in ('yu-niang', 'nian-nian'):
            image = image.crop((0, 0, image.width, int(image.height * .53)))
        image.thumbnail((600, 680), Image.Resampling.LANCZOS)
        output = OUTPUT / f'{image_path.stem}.webp'
        image.save(output, 'WEBP', quality=88, method=4)
        raw = output.read_bytes()
        assets.append(dict(id='BG_PORTRAIT_' + image_path.stem.upper().replace('-', '_'),
                           kind='portrait', file='portraits/' + output.name, bytes=len(raw),
                           sha256=hashlib.sha256(raw).hexdigest(), width=image.width, height=image.height,
                           source={'name': '用户提供角色立绘'}, rights={'status': 'pending', 'reference': '沿用项目素材使用记录'}))
    manifest_path = ROOT / 'public/art/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['assets'] = [a for a in manifest['assets'] if not a['id'].startswith('BG_PORTRAIT_')] + assets
    temporary = manifest_path.with_suffix('.tmp')
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(manifest_path)
    print(f'已加工 {len(assets)} 张对白立绘，透明背景与原图均已保留。')


if __name__ == '__main__':
    prepare()
