"""Access Secret 仅从环境变量或当前 Windows 用户凭据库读取。"""
import ctypes
import getpass
import os
from ctypes import wintypes

TARGET = 'rumengshu/zhihu-access-secret'

class Credential(ctypes.Structure):
    _fields_ = [('Flags', wintypes.DWORD), ('Type', wintypes.DWORD), ('TargetName', wintypes.LPWSTR),
                ('Comment', wintypes.LPWSTR), ('LastWritten', wintypes.FILETIME), ('CredentialBlobSize', wintypes.DWORD),
                ('CredentialBlob', ctypes.POINTER(ctypes.c_ubyte)), ('Persist', wintypes.DWORD), ('AttributeCount', wintypes.DWORD),
                ('Attributes', ctypes.c_void_p), ('TargetAlias', wintypes.LPWSTR), ('UserName', wintypes.LPWSTR)]

def access_secret():
    value = os.getenv('ZHIHU_ACCESS_SECRET', '')
    if value or os.name != 'nt': return value
    library = ctypes.WinDLL('advapi32', use_last_error=True)
    result = ctypes.POINTER(Credential)()
    if not library.CredReadW(TARGET, 1, 0, ctypes.byref(result)): return ''
    try: return ctypes.string_at(result.contents.CredentialBlob, result.contents.CredentialBlobSize).decode('utf-8')
    finally: library.CredFree(result)

def save_secret(value):
    if os.name != 'nt': raise RuntimeError('此平台请使用 ZHIHU_ACCESS_SECRET 环境变量')
    blob = value.encode('utf-8')
    buffer = (ctypes.c_ubyte * len(blob)).from_buffer_copy(blob)
    credential = Credential(Type=1, TargetName=TARGET, CredentialBlobSize=len(blob), CredentialBlob=buffer, Persist=2, UserName='rumengshu')
    if not ctypes.WinDLL('advapi32', use_last_error=True).CredWriteW(ctypes.byref(credential), 0): raise ctypes.WinError(ctypes.get_last_error())

if __name__ == '__main__':
    value = getpass.getpass('请输入知乎 Access Secret（不回显）：').strip()
    if not value: raise SystemExit('凭据不能为空')
    save_secret(value)
    print('已保存到当前 Windows 用户凭据库。')
