import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

# Exercise authorization boundaries without sending mail or touching production storage.
spec = importlib.util.spec_from_file_location('server_access', Path(__file__).parents[1] / 'api/server-access.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class ServerAccessTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'SERVER_ACCESS_SECRET': 'test-only-' * 6})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_email_header_injection_rejected(self):
        for value in ['a@example.com\r\nBcc: other@example.com', '', None, 'a@localhost']:
            with self.assertRaises(api.AccessError):
                api.email_address(value)
        self.assertEqual(api.email_address(' User@Example.com '), 'user@example.com')

    def test_no_mail_when_rate_limit_exhausted(self):
        with patch.object(api, 'redis', return_value=0), patch.object(api, 'send_email') as send:
            with self.assertRaises(api.AccessError) as result:
                api.request_code({'email': 'test@example.com'}, '127.0.0.1')
            self.assertEqual(result.exception.status, 429)
            send.assert_not_called()

    def test_challenge_is_removed_after_mail_failure(self):
        with patch.object(api, 'redis', side_effect=[1, 'OK', 1]) as store, patch.object(api, 'send_email', side_effect=api.AccessError(503, 'mail_unavailable')):
            with self.assertRaises(api.AccessError):
                api.request_code({'email': 'test@example.com'}, '127.0.0.1')
            self.assertEqual(store.call_args.args[0], 'DEL')
            record = json.loads(store.call_args_list[1].args[2])
            self.assertNotIn('test@example.com', json.dumps(record))

    def test_source_requires_session_before_catalog_lookup(self):
        with patch.object(api, 'redis') as store, patch.object(api, 'recordings') as catalog:
            with self.assertRaises(api.AccessError) as result:
                api.source({'id': 'anything'}, {})
            self.assertEqual(result.exception.status, 401)
            store.assert_not_called()
            catalog.assert_not_called()

    def test_source_rejects_arbitrary_urls(self):
        with patch.object(api, 'redis', return_value='hashed-owner'), patch.object(api, 'recordings', return_value={'album/song.mp3'}):
            with self.assertRaises(api.AccessError) as result:
                api.source({'id': 'https://attacker.example/file'}, {'Authorization': 'Bearer ' + 'a' * 43})
            self.assertEqual(result.exception.status, 404)

    def test_wrong_code_does_not_create_session(self):
        with patch.object(api, 'redis', return_value=0) as store:
            with self.assertRaises(api.AccessError) as result:
                api.verify_code({'challenge': 'a' * 43, 'code': '123456'})
            self.assertEqual(result.exception.code, 'invalid_code')
            self.assertEqual(store.call_count, 1)

    def test_verified_code_issues_expiring_session(self):
        with patch.object(api, 'redis', side_effect=['hashed-owner', 'OK']) as store:
            result = api.verify_code({'challenge': 'a' * 43, 'code': '123456'})
            self.assertEqual(len(result['token']), 43)
            self.assertGreater(result['expiresAt'], api.time.time() * 1000)
            self.assertEqual(store.call_args.args[-2:], ('EX', 7 * 86400))


if __name__ == '__main__':
    unittest.main()
