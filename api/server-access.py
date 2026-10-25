import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import ssl
import time
from email.message import EmailMessage
from functools import lru_cache
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

# Server-only email authorization and Range relay. No credentials or OTPs enter logs.
PREFIX = 'tingyu:access:'
SESSION_TTL = 7 * 86400
RATE_SCRIPT = '''
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
for i=2,4 do
 if tonumber(redis.call('GET',KEYS[i]) or '0') >= tonumber(ARGV[i-1]) then return 0 end
end
redis.call('SET',KEYS[1],'1','EX',60)
for i=2,4 do
 local n=redis.call('INCR',KEYS[i])
 if n==1 then redis.call('EXPIRE',KEYS[i],tonumber(ARGV[i+2])) end
end
return 1
'''
VERIFY_SCRIPT = '''
local raw=redis.call('GET',KEYS[1])
if not raw then return 0 end
local v=cjson.decode(raw)
if v.digest==ARGV[1] then
 redis.call('DEL',KEYS[1])
 return v.email
end
v.attempts=v.attempts+1
local ttl=redis.call('TTL',KEYS[1])
if v.attempts>=5 or ttl<=0 then redis.call('DEL',KEYS[1])
else redis.call('SET',KEYS[1],cjson.encode(v),'EX',ttl) end
return 0
'''


class AccessError(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def digest(value):
    secret = os.environ.get('SERVER_ACCESS_SECRET', '')
    if len(secret) < 32:
        raise AccessError(503, 'not_configured')
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def email_address(value):
    if not isinstance(value, str) or len(value) > 254:
        raise AccessError(400, 'invalid_email')
    value = value.strip().lower()
    if not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}", value):
        raise AccessError(400, 'invalid_email')
    return value


def opaque(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', value):
        raise AccessError(401, 'unauthorized')
    return value


def redis(*command):
    url = os.environ.get('KV_REST_API_URL', '')
    token = os.environ.get('KV_REST_API_TOKEN', '')
    if not url.startswith('https://') or not token:
        raise AccessError(503, 'not_configured')
    request = Request(url, data=json.dumps(command).encode(), headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'
    })
    try:
        with urlopen(request, timeout=10) as response:
            result = json.loads(response.read(65536))
        if 'error' in result:
            raise AccessError(503, 'storage_unavailable')
        return result.get('result')
    except AccessError:
        raise
    except Exception:
        raise AccessError(503, 'storage_unavailable') from None


def send_email(recipient, code):
    alias = os.environ.get('SMTP_PASSWORD_ENV_NAME', 'SMTP_PASSWORD')
    password = os.environ.get(alias, '').replace(' ', '').strip()
    user = os.environ.get('SMTP_USER', '')
    if not user or not password:
        raise AccessError(503, 'not_configured')
    message = EmailMessage()
    message['From'] = os.environ.get('SMTP_FROM', user)
    message['To'] = recipient
    message['Subject'] = '听屿 FM · 服务器音乐授权码'
    message.set_content('你的授权码是：' + code + '\n\n10 分钟内有效，仅可使用一次。请勿转发。\n如非本人申请，请忽略此邮件。\n\n天天开心，听歌愉快。')
    try:
        with smtplib.SMTP_SSL(os.environ.get('SMTP_HOST', 'smtp.gmail.com'),
                              int(os.environ.get('SMTP_PORT', '465')),
                              timeout=15, context=ssl.create_default_context()) as smtp:
            smtp.login(user, password)
            smtp.send_message(message)
    except Exception as error:
        print('[ServerAccess] SMTP failure: ' + type(error).__name__)
        raise AccessError(503, 'mail_unavailable') from None


def request_code(body, ip):
    email = email_address(body.get('email'))
    email_key, ip_key = digest('email:' + email), digest('ip:' + ip)
    permitted = redis('EVAL', RATE_SCRIPT, 4, PREFIX + 'cooldown:' + email_key,
                      PREFIX + 'email-hour:' + email_key, PREFIX + 'ip-hour:' + ip_key,
                      PREFIX + 'global-day', 5, 20, 200, 3600, 3600, 86400)
    if permitted != 1:
        raise AccessError(429, 'rate_limited')
    challenge, code = secrets.token_urlsafe(32), str(secrets.randbelow(1000000)).zfill(6)
    key = PREFIX + 'challenge:' + digest(challenge)
    redis('SET', key, json.dumps({'email': email_key, 'digest': digest(challenge + ':' + code), 'attempts': 0}), 'EX', 600)
    try:
        send_email(email, code)
    except AccessError:
        redis('DEL', key)
        raise
    return {'challenge': challenge, 'expiresIn': 600, 'retryAfter': 60}


def verify_code(body):
    challenge = opaque(body.get('challenge'))
    code = body.get('code')
    if not isinstance(code, str) or not re.fullmatch(r'\d{6}', code, re.ASCII):
        raise AccessError(400, 'invalid_code')
    owner = redis('EVAL', VERIFY_SCRIPT, 1, PREFIX + 'challenge:' + digest(challenge), digest(challenge + ':' + code))
    if not owner:
        raise AccessError(401, 'invalid_code')
    token = secrets.token_urlsafe(32)
    redis('SET', PREFIX + 'session:' + digest(token), owner, 'EX', SESSION_TTL)
    return {'token': token, 'expiresAt': int(time.time() * 1000) + SESSION_TTL * 1000}


def authenticated(headers):
    value = headers.get('Authorization', '')
    token = opaque(value[7:] if value.startswith('Bearer ') else '')
    key = digest(token)
    if not redis('GET', PREFIX + 'session:' + key):
        raise AccessError(401, 'unauthorized')
    return key


@lru_cache(maxsize=1)
def recordings():
    # Read the bundled provider catalog; one source of truth, no build-order race.
    path = Path(__file__).parent.parent / 'src/services/onlineMusic/hearttrace/catalogSnapshot.ts'
    rows = json.loads(path.read_text().split('=', 1)[1].strip().removesuffix(';'))
    return frozenset(row['directory'] + '/' + row['file'] for row in rows)


def source(body, headers):
    session = authenticated(headers)
    recording = body.get('id')
    if not isinstance(recording, str) or recording not in recordings():
        raise AccessError(404, 'not_found')
    ticket = secrets.token_urlsafe(32)
    redis('SET', PREFIX + 'ticket:' + digest(ticket), json.dumps({'id': recording, 'session': session}), 'EX', 3600)
    return {'path': '/api/server-access?action=audio&ticket=' + ticket}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never log query tickets or user input.

    def origins(self):
        return set(os.environ.get('SERVER_ACCESS_ORIGINS', 'https://folia-major-ai-radio-preview.vercel.app,https://xiaotong123520.github.io').split(','))

    def headers_out(self):
        self.send_header('Cache-Control', 'private, no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        origin = self.headers.get('Origin')
        if origin in self.origins():
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges')
            self.send_header('Vary', 'Origin')

    def reply(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.headers_out()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def do_OPTIONS(self):
        if self.headers.get('Origin') not in self.origins():
            return self.reply(403, {'error': 'forbidden'})
        self.send_response(204)
        self.headers_out()
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tingyu-Access, Range')
        self.end_headers()

    def do_POST(self):
        try:
            if self.headers.get('Origin') and self.headers['Origin'] not in self.origins():
                raise AccessError(403, 'forbidden')
            if self.headers.get('X-Tingyu-Access') != '1' or not self.headers.get('Content-Type', '').startswith('application/json'):
                raise AccessError(403, 'forbidden')
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 2048:
                raise AccessError(400, 'invalid_request')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise AccessError(400, 'invalid_request')
            action = body.get('action')
            if action == 'request':
                result = request_code(body, self.headers.get('X-Vercel-Forwarded-For', self.client_address[0]).split(',')[0])
            elif action == 'verify':
                result = verify_code(body)
            elif action == 'source':
                result = source(body, self.headers)
            elif action == 'status':
                authenticated(self.headers)
                result = {'authorized': True}
            elif action == 'logout':
                redis('DEL', PREFIX + 'session:' + authenticated(self.headers))
                result = {'authorized': False}
            else:
                raise AccessError(400, 'invalid_request')
            self.reply(200, {'data': result})
        except AccessError as error:
            self.reply(error.status, {'error': error.code})
        except Exception:
            self.reply(500, {'error': 'unavailable'})

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        started = False
        try:
            query = parse_qs(urlsplit(self.path).query)
            if query.get('action') != ['audio']:
                raise AccessError(405, 'invalid_request')
            ticket = opaque(query.get('ticket', [''])[0])
            raw = redis('GET', PREFIX + 'ticket:' + digest(ticket))
            if not raw:
                raise AccessError(401, 'unauthorized')
            value = json.loads(raw)
            if not redis('GET', PREFIX + 'session:' + value['session']):
                raise AccessError(401, 'unauthorized')
            if value['id'] not in recordings():
                raise AccessError(404, 'not_found')
            origin = 'https://' + '我爱南京.com'.encode('idna').decode()
            target = origin + '/api/audio.php?' + urlencode({'path': value['id']})
            headers = {'Accept-Encoding': 'identity'}
            range_value = self.headers.get('Range')
            if range_value:
                if not re.fullmatch(r'bytes=(?:\d+-\d*|-\d+)', range_value):
                    raise AccessError(416, 'invalid_range')
                headers['Range'] = range_value
            with build_opener(NoRedirect).open(Request(target, headers=headers, method=self.command), timeout=30) as upstream:
                if upstream.status not in (200, 206) or not re.match(r'^(audio/|application/octet-stream)', upstream.headers.get('Content-Type', ''), re.I):
                    raise AccessError(502, 'upstream_unavailable')
                self.send_response(upstream.status)
                self.headers_out()
                for key in ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']:
                    if upstream.headers.get(key):
                        self.send_header(key, upstream.headers[key])
                self.end_headers()
                started = True
                if self.command != 'HEAD':
                    # Forward available bytes immediately; read(n) can wait to fill a whole block.
                    while chunk := upstream.read1(65536):
                        self.wfile.write(chunk)
                        self.wfile.flush()
        except AccessError as error:
            if not started:
                self.reply(error.status, {'error': error.code})
        except HTTPError as error:
            if not started:
                self.reply(416 if error.code == 416 else 502, {'error': 'upstream_unavailable'})
        except Exception:
            if not started:
                self.reply(502, {'error': 'unavailable'})
