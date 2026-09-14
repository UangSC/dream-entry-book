"""FC Web 运行入口：配置只从云端环境变量读取，临时数据写入 /tmp。"""
import os

os.environ['PYTHON_DOTENV_DISABLED'] = '1'
os.environ.setdefault('RUMENGSHU_DATA_DIR', '/tmp/rumengshu')
os.environ.setdefault('RUMENGSHU_DEMO_BOOK', '/opt/rumengshu/books/little-demon.dreambook')

from backend.app import app  # noqa: E402,F401
