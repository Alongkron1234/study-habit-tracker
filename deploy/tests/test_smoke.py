"""Offline unit tests for deploy/smoke_test.py (the network is mocked).

Run (repo root):  python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'
CI runs it too (.github/workflows/ci-docker.yml).

Covers: public checks pass + login skipped without credentials; a DB that is not
ready fails even if HTTP answers; an /api/* route answered with HTML fails; the
session is logged out even if a check fails.
If you change the endpoints in smoke_test.py, update `response()` below.
"""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).parents[1] / 'smoke_test.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeTests(unittest.TestCase):
    def response(self, base, path, data=None, opener=None, allow_error=False):
        return {
            '/health': b'{"status":"ok"}',
            '/api/ready': b'{"db":"connected"}',
            '/': b'<html></html>',
            '/api/__smoke_not_found__': b'{"error":"Not Found"}',
            '/api/auth/login': b'{"user":{"id":1,"username":"smoke-user","role":"pm"}}',
            '/api/auth/me': b'{"user":{"id":1}}',
            '/api/auth/logout': b'',
        }[path]

    @patch.dict('os.environ', {}, clear=True)
    def test_public_checks_pass_and_skip_optional_login(self):
        with patch.object(smoke, 'request', side_effect=self.response) as req:
            smoke.check('https://demo.test')
            self.assertEqual(req.call_count, 4)

    @patch.dict('os.environ', {}, clear=True)
    def test_db_not_ready_fails_even_when_http_responds(self):
        def disconnected(base, path, **kwargs):
            return b'{"db":"disconnected"}' if path == '/api/ready' else self.response(base, path)
        with patch.object(smoke, 'request', side_effect=disconnected), patch.object(smoke.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, '/api/ready'):
                smoke.check('https://demo.test')

    @patch.dict('os.environ', {}, clear=True)
    def test_unknown_api_route_answered_with_html_fails(self):
        def spa_swallows_api(base, path, **kwargs):
            return b'<html></html>' if path.startswith('/api/__smoke') else self.response(base, path)
        with patch.object(smoke, 'request', side_effect=spa_swallows_api), patch.object(smoke.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, '__smoke_not_found__'):
                smoke.check('https://demo.test')

    @patch.dict('os.environ', {'SMOKE_USERNAME': 'smoke-user'}, clear=True)
    def test_only_one_credential_is_rejected(self):
        with patch.object(smoke, 'request', side_effect=self.response):
            with self.assertRaisesRegex(RuntimeError, 'Set both'):
                smoke.check('https://demo.test')

    @patch.dict('os.environ', {'SMOKE_USERNAME': 'smoke-user', 'SMOKE_PASSWORD': 'test-only'}, clear=True)
    def test_session_is_logged_out_even_if_me_fails(self):
        def broken_me(base, path, **kwargs):
            if path == '/api/auth/me':
                raise ValueError('Broken response')
            return self.response(base, path)
        with patch.object(smoke, 'request', side_effect=broken_me) as req:
            with self.assertRaisesRegex(RuntimeError, 'Login smoke'):
                smoke.check('https://demo.test')
            self.assertEqual(req.call_args.args[1], '/api/auth/logout')


if __name__ == '__main__':
    unittest.main()
