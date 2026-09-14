"""无 Cookie 的浏览器授权请求证明与短期应用会话；不承载知乎令牌。"""
import base64
import hashlib
import hmac
import json
import time

from fastapi import HTTPException


def encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip('=')


def challenge(verifier: str) -> str:
    return encode(hashlib.sha256(verifier.encode()).digest())


class BrowserAuth:
    def __init__(self, secret: str, audience: str):
        # 与知乎的 Token 交换用途隔离；不将平台 App Key 直接用作消息签名键。
        self.key = hmac.digest(secret.encode(), b'rumengshu/browser-auth/v1', 'sha256')
        self.audience = audience

    def issue(self, purpose: str, data: dict, lifetime: int) -> str:
        now = int(time.time())
        payload = encode(json.dumps(dict(purpose=purpose, aud=self.audience, iat=now,
                                         exp=now + lifetime, data=data), separators=(',', ':'), ensure_ascii=False).encode())
        return payload + '.' + encode(hmac.digest(self.key, payload.encode(), 'sha256'))

    def read(self, value: str, purpose: str) -> dict:
        try:
            if len(value) > 8192:
                raise ValueError()
            payload, signature = value.split('.')
            expected = encode(hmac.digest(self.key, payload.encode(), 'sha256'))
            if not hmac.compare_digest(signature, expected):
                raise ValueError()
            body = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            now = time.time()
            if (body['purpose'] != purpose or body['aud'] != self.audience
                    or type(body['iat']) is not int or type(body['exp']) is not int
                    or body['iat'] > now + 30 or body['exp'] <= now
                    or not 0 < body['exp'] - body['iat'] <= 3600 or not isinstance(body['data'], dict)):
                raise ValueError()
            return body
        except (ValueError, TypeError, KeyError, UnicodeError):
            raise HTTPException(401, '授权凭据无效或已过期，请重新登录。') from None
