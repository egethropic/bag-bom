from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from bag_bom.server import BomSession, augment_html

SOURCE = '<html><body>pcbdata bombody createRowHighlightHandler</body></html>'


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.html = self.root / 'ibom.html'
        self.html.write_text(SOURCE, encoding='utf-8')
        self.assets = self.root / 'web'
        self.assets.mkdir()
        (self.assets / 'test.js').write_text('const ok = true;')
        (self.root / 'private.txt').write_text('private')
        self.session = BomSession(self.html, web_root=self.assets).start()

    def tearDown(self):
        self.session.close()
        self.temp.cleanup()

    def test_html_is_augmented_only_in_memory(self):
        with urlopen(self.session.url) as response:
            self.assertIn(b'bag-bom-root', response.read())
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(self.html.read_text(), SOURCE)

    def test_serves_only_assets(self):
        with urlopen(self.session.url + 'assets/test.js') as response:
            self.assertEqual(response.headers['Content-Type'], 'text/javascript')
        for route in ('private.txt', 'assets/../private.txt', 'assets/%2e%2e/private.txt', 'assets/C:/Windows/win.ini'):
            with self.assertRaises(HTTPError) as error:
                urlopen(self.session.url + route)
            self.assertEqual(error.exception.code, 404)

    def test_host_header_and_origin(self):
        for headers in ({'Host': 'attacker.example'}, {'Origin': 'https://attacker.example'}):
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(self.session.url, headers=headers))
            self.assertEqual(error.exception.code, 403)

    def test_root_and_wrong_token_are_not_served(self):
        for route in ('/', '/wrong/index.html'):
            with self.assertRaises(HTTPError) as error:
                urlopen('http://' + self.session.host + route)
            self.assertEqual(error.exception.code, 404)

    def test_cannot_post_frames_or_files(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(Request(self.session.url, data=b'camera frame'))
        self.assertEqual(error.exception.code, 501)

    def test_invalid_html_rejected(self):
        with self.assertRaisesRegex(ValueError, 'InteractiveHtmlBom'):
            augment_html('<html>unrelated</html>', '/test/')
        with self.assertRaisesRegex(ValueError, 'closing body'):
            augment_html('pcbdata bombody createRowHighlightHandler', '/test/')

    def test_body_case_and_session_isolation(self):
        self.assertIn(b'bag-bom-root', augment_html(SOURCE.replace('</body>', '</BODY>'), '/test/'))
        other = BomSession(self.html, web_root=self.assets)
        try:
            self.assertNotEqual(self.session.prefix, other.prefix)
        finally:
            other.close()


if __name__ == '__main__':
    unittest.main()
