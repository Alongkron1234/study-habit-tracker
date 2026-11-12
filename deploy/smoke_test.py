"""Public deployment checks. Credentials/cookies are never printed.

WHAT THIS SCRIPT DOES
    Called by .github/workflows/deploy.yml after a deployment:
        python3 deploy/smoke_test.py SERVICE_URL
    It checks the live service and exits non-zero (failing the workflow) if any
    check fails. Each public check is retried up to 5 times, 3 seconds apart, to
    tolerate Cloud Run cold starts.

    Checks (in order)
      1. GET /health              -> {"status": "ok"}
      2. GET /api/ready           -> {"db": "connected"}   (proves the DB works)
      3. GET /                    -> HTML page (the built React app is served)
      4. GET /api/<unknown>       -> JSON 404 (the SPA fallback must not swallow
                                     /api/* routes — NFR-06)
      5. OPTIONAL login test      -> login, /api/auth/me, logout (session cookie).
         Runs only if BOTH env vars SMOKE_USERNAME and SMOKE_PASSWORD are set
         (set both or neither). The session is always logged out, even if a
         check fails.

IMPORTANT
    Uses only the Python standard library (no pip install needed).
    Offline unit tests: deploy/tests/test_smoke.py
"""
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.request


# --- HTTP helper --------------------------------------------------------------
# Returns the response body (bytes). Raises on HTTP errors / timeouts, unless
# allow_error=True (then the body of an HTTP error response is returned).
# `opener` carries the session cookie (the app uses express-session cookies).
def request(base, path, data=None, opener=None, allow_error=False):
    headers = {}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + path, headers=headers,
        data=json.dumps(data).encode() if data is not None else None)
    open_url = opener.open if opener else urllib.request.urlopen
    try:
        with open_url(req, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as err:
        if allow_error:
            return err.read()
        raise


def check(base):
    # --- Public checks: (path, predicate, allow_error) ------------------------
    for path, predicate, allow_error in (
        ('/health', lambda b: json.loads(b).get('status') == 'ok', False),
        ('/api/ready', lambda b: json.loads(b).get('db') == 'connected', False),
        ('/', lambda b: b'<html' in b.lower(), False),
        # Unknown /api route must answer JSON (not the SPA's index.html).
        ('/api/__smoke_not_found__', lambda b: isinstance(json.loads(b), dict), True),
    ):
        # Retry: a cold Cloud Run instance may need a few seconds to start.
        for attempt in range(5):
            try:
                body = (request(base, path, allow_error=True) if allow_error
                        else request(base, path))
                if not predicate(body):
                    raise ValueError('Unexpected response')
                break
            except (urllib.error.URLError, TimeoutError, ValueError):
                if attempt == 4:
                    raise RuntimeError('Smoke check failed: ' + path) from None
                time.sleep(3)
        print('PASS ' + path)

    # --- Optional login check (only when both credentials are provided) -------
    username, password = os.getenv('SMOKE_USERNAME'), os.getenv('SMOKE_PASSWORD')
    if bool(username) != bool(password):
        raise RuntimeError('Set both SMOKE_USERNAME and SMOKE_PASSWORD, or neither.')
    if not username:
        print('SKIP login: optional smoke credentials not configured')
        return
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    logged_in = False
    try:
        login = json.loads(request(base, '/api/auth/login', opener=opener,
                                   data={'username': username, 'password': password}))
        logged_in = True
        if login['user']['username'] != username:
            raise ValueError('Unexpected user')
        request(base, '/api/auth/me', opener=opener)
        print('PASS login and authenticated /api/auth/me')
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        raise RuntimeError('Login smoke check failed') from None
    finally:
        # Always end the session, even when a check above failed.
        if logged_in:
            request(base, '/api/auth/logout', data={}, opener=opener)
            print('PASS logout')


# --- Entry point ----------------------------------------------------------------
if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 deploy/smoke_test.py SERVICE_URL')
    check(sys.argv[1].rstrip('/'))
