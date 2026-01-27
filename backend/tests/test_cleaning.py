import unittest
import re

class TestResponseCleaning(unittest.TestCase):
    def clean_content(self, content):
        return re.sub(r'\|\|\|SUGGESTIONS?=.*?\|\|\|', '', content, flags=re.DOTALL).strip()

    def test_clean_standard_suggestions(self):
        text = 'Hello world.\n|||SUGGESTIONS=["Option 1", "Option 2"]|||'
        cleaned = self.clean_content(text)
        self.assertEqual(cleaned, 'Hello world.')

    def test_clean_singular_suggestion(self):
        text = 'Hello world.\n|||SUGGESTION=["Option 1"]|||'
        cleaned = self.clean_content(text)
        self.assertEqual(cleaned, 'Hello world.')

    def test_clean_multiline_suggestions(self):
        text = 'Hello world.\n|||SUGGESTIONS=[\n"Option 1",\n"Option 2"\n]|||'
        cleaned = self.clean_content(text)
        self.assertEqual(cleaned, 'Hello world.')

    def test_no_marker(self):
        text = 'Just text.'
        cleaned = self.clean_content(text)
        self.assertEqual(cleaned, 'Just text.')

if __name__ == '__main__':
    unittest.main()
