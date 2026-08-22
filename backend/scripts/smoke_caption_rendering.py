"""Deterministic checks for the existing ASS caption export contract."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.caption_generator import generate_ass


WORDS = [
    {"word": "one", "start": 0.0, "end": 0.4},
    {"word": "two", "start": 0.4, "end": 0.8},
    {"word": "three", "start": 0.8, "end": 1.2},
    {"word": "four", "start": 1.2, "end": 1.6},
]


class CaptionRenderingSmokeTests(unittest.TestCase):
    def test_words_per_line_chunks_events(self) -> None:
        rendered = generate_ass(WORDS, words_per_line=2)
        self.assertEqual(rendered.count("Dialogue:"), 2)
        self.assertIn("one two", rendered)
        self.assertIn("three four", rendered)

    def test_deleted_words_are_omitted(self) -> None:
        rendered = generate_ass(WORDS, deleted_indices={1}, words_per_line=8)
        self.assertIn("one three four", rendered)
        self.assertNotIn("one two", rendered)

    def test_bottom_uses_alignment_two_and_margin_eighty(self) -> None:
        rendered = generate_ass(WORDS, style={"position": "bottom"})
        self.assertIn(",2,40,40,80,1", rendered)

    def test_top_uses_alignment_eight_and_margin_sixty(self) -> None:
        rendered = generate_ass(WORDS, style={"position": "top"})
        self.assertIn(",8,40,40,60,1", rendered)

    def test_center_uses_alignment_five_and_margin_eighty(self) -> None:
        rendered = generate_ass(WORDS, style={"position": "center"})
        self.assertIn(",5,40,40,80,1", rendered)

    def test_style_fields_are_represented(self) -> None:
        rendered = generate_ass(
            WORDS,
            style={
                "fontName": "Georgia",
                "fontSize": 63,
                "fontColor": "#123456",
                "backgroundColor": "#654321",
                "bold": False,
            },
        )
        self.assertIn("Style: Default,Georgia,63", rendered)
        self.assertIn("&H00563412", rendered)
        self.assertIn("&H80214365", rendered)
        self.assertIn(",0,0,0,0,100,100", rendered)

    def test_karaoke_emits_word_timing_and_highlight_color(self) -> None:
        rendered = generate_ass(
            WORDS,
            style={"animation": "karaoke", "highlightColor": "#22aa44"},
        )
        self.assertIn("&H0044aa22", rendered)
        self.assertIn("{\\k", rendered)

    def test_pop_emits_lightweight_animation_contract(self) -> None:
        rendered = generate_ass(WORDS, style={"animation": "pop"})
        self.assertIn("{\\fad(70,70)\\fscx112\\fscy112\\t(0,120", rendered)

    def test_static_captions_do_not_emit_animation_timing(self) -> None:
        rendered = generate_ass(WORDS, style={"animation": "none"})
        event_text = rendered.split("[Events]", 1)[-1]
        self.assertNotIn("\\k", event_text)
        self.assertNotIn("\\fad", event_text)


if __name__ == "__main__":
    unittest.main()
